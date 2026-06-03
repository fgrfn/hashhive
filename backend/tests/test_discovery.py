"""Tests for discovery add-logic and new-device detection (pure helpers)."""
import os
import sys
import tempfile
from pathlib import Path

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)

sys.path.insert(0, str(Path(__file__).parent.parent))

from routers.discovery import (  # noqa: E402
    _add_devices_to_config,
    _new_devices,
    _parse_extra_ips,
    reconcile_macs,
)


def _empty_config() -> dict:
    return {
        "axeos_devices": [],
        "lottominer_devices": [],
        "lottominer_master": "",
    }


def test_add_sorts_devices_by_type():
    config = _empty_config()
    added = _add_devices_to_config(config, [
        {"ip": "192.168.1.10", "type": "bitaxe", "name": "axe1"},
        {"ip": "192.168.1.11", "type": "nerdaxe", "name": "axe2"},
        {"ip": "192.168.1.12", "type": "lottominer_master", "name": "master"},
        {"ip": "192.168.1.13", "type": "lottominer_device", "name": "nmdev"},
    ])
    assert len(added) == 4
    assert {d["ip"] for d in config["axeos_devices"]} == {"192.168.1.10", "192.168.1.11"}
    assert config["lottominer_master"] == "192.168.1.12"
    assert config["lottominer_devices"][0]["ip"] == "192.168.1.13"


def test_add_dedupes_by_ip():
    config = _empty_config()
    config["axeos_devices"].append({"ip": "192.168.1.10", "name": "x", "type": "bitaxe"})
    added = _add_devices_to_config(config, [{"ip": "192.168.1.10", "type": "bitaxe", "name": "dup"}])
    assert added == []
    assert len(config["axeos_devices"]) == 1


def test_add_rejects_public_ip():
    config = _empty_config()
    added = _add_devices_to_config(config, [{"ip": "8.8.8.8", "type": "bitaxe"}])
    assert added == []
    assert config["axeos_devices"] == []


def test_new_devices_filters_known():
    found = [{"ip": "192.168.1.1"}, {"ip": "192.168.1.2"}, {"ip": "192.168.1.3"}]
    known = {"192.168.1.1": {}, "192.168.1.3": {}}
    new = _new_devices(found, known)
    assert [d["ip"] for d in new] == ["192.168.1.2"]


def test_parse_extra_ips_validates_private_only():
    parsed = _parse_extra_ips("192.168.1.5, 10.0.0.2 , 8.8.8.8, notanip")
    assert parsed == {"192.168.1.5", "10.0.0.2"}


def test_reconcile_macs_updates_changed_ip():
    config = {"axeos_devices": [{"ip": "192.168.1.10", "name": "a", "type": "bitaxe", "mac": "aa:bb:cc:dd:ee:ff"}]}
    changes = reconcile_macs(config, {"aa:bb:cc:dd:ee:ff": "192.168.1.50"})
    assert len(changes) == 1
    assert changes[0]["old_ip"] == "192.168.1.10"
    assert changes[0]["new_ip"] == "192.168.1.50"
    assert config["axeos_devices"][0]["ip"] == "192.168.1.50"


def test_reconcile_macs_no_change_same_ip():
    config = {"lottominer_devices": [{"ip": "192.168.1.20", "mac": "11:22:33:44:55:66"}]}
    changes = reconcile_macs(config, {"11:22:33:44:55:66": "192.168.1.20"})
    assert changes == []
    assert config["lottominer_devices"][0]["ip"] == "192.168.1.20"


def test_reconcile_macs_ignores_unknown_mac_and_macless():
    config = {"axeos_devices": [{"ip": "192.168.1.10", "type": "bitaxe"}]}  # no mac
    changes = reconcile_macs(config, {"99:99:99:99:99:99": "192.168.1.99"})
    assert changes == []
    assert config["axeos_devices"][0]["ip"] == "192.168.1.10"


def test_run_scan_always_probes_full_24_even_with_populated_arp():
    """Regression: some NMMiner were missed by autoscan because the full /24 was
    only probed when ARP was sparse. The scan must always cover .1–.254 so
    devices not in ARP and not advertising mDNS are still found."""
    import asyncio
    from unittest.mock import patch
    import routers.discovery as disc

    probed: list[str] = []

    async def _fake_probe_all(ip, client):
        probed.append(ip)
        return None

    async def _fake_mdns(*_a, **_k):
        return set()

    class _DummyClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_a):
            return False

    # A populated ARP table (>= 4 entries) — previously this skipped the full scan.
    arp = {f"192.168.1.{i}": f"aa:bb:cc:00:00:0{i}" for i in (10, 11, 12, 13)}

    with patch.object(disc, "_local_ip_and_subnet", return_value=("192.168.1.5", "192.168.1")), \
         patch.object(disc, "_arp_map", return_value=arp), \
         patch.object(disc, "_mdns_hosts", _fake_mdns), \
         patch.object(disc.httpx, "AsyncClient", lambda *a, **k: _DummyClient()), \
         patch.object(disc, "probe_all", _fake_probe_all):
        result = asyncio.run(disc._run_scan())

    # Full /24 (minus our own IP) was probed
    assert result["method"] == "full_scan"
    assert len([ip for ip in probed if ip.startswith("192.168.1.")]) == 253  # .1–.254 minus .5
    assert "192.168.1.200" in probed  # an IP that was NOT in ARP
    assert "192.168.1.5" not in probed  # local IP excluded
