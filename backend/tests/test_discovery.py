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
        "nmminer_devices": [],
        "nerdminer_devices": [],
        "sparkminer_devices": [],
        "nmminer_master": "",
    }


def test_add_sorts_devices_by_type():
    config = _empty_config()
    added = _add_devices_to_config(config, [
        {"ip": "192.168.1.10", "type": "bitaxe", "name": "axe1"},
        {"ip": "192.168.1.11", "type": "nerdaxe", "name": "axe2"},
        {"ip": "192.168.1.12", "type": "nmminer_master", "name": "master"},
        {"ip": "192.168.1.13", "type": "nmminer_device", "name": "nmdev"},
        {"ip": "192.168.1.14", "type": "nerdminer", "name": "nerd"},
        {"ip": "192.168.1.15", "type": "sparkminer", "name": "spark"},
    ])
    assert len(added) == 6
    assert {d["ip"] for d in config["axeos_devices"]} == {"192.168.1.10", "192.168.1.11"}
    assert config["nmminer_master"] == "192.168.1.12"
    assert config["nmminer_devices"][0]["ip"] == "192.168.1.13"
    assert config["nerdminer_devices"][0]["type"] == "nerdminer"
    assert config["sparkminer_devices"][0]["type"] == "sparkminer"


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
    config = {"nmminer_devices": [{"ip": "192.168.1.20", "mac": "11:22:33:44:55:66"}]}
    changes = reconcile_macs(config, {"11:22:33:44:55:66": "192.168.1.20"})
    assert changes == []
    assert config["nmminer_devices"][0]["ip"] == "192.168.1.20"


def test_reconcile_macs_ignores_unknown_mac_and_macless():
    config = {"axeos_devices": [{"ip": "192.168.1.10", "type": "bitaxe"}]}  # no mac
    changes = reconcile_macs(config, {"99:99:99:99:99:99": "192.168.1.99"})
    assert changes == []
    assert config["axeos_devices"][0]["ip"] == "192.168.1.10"
