"""Tests for the AxeHub (nerdminer-axehub) driver against the documented API shapes."""
import asyncio
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)
(Path(_tmpdir) / "logs").mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(Path(__file__).parent.parent))

from miners.axehub import (  # noqa: E402
    AXEHUB_ACTION_MAP,
    _normalize_axehub,
    fetch_axehub_safe,
    probe_axehub,
)


def _resp(status, payload):
    return type("R", (), {"status_code": status, "json": lambda self: payload,
                          "raise_for_status": lambda self: None})()


def test_action_map_uses_documented_endpoints():
    assert AXEHUB_ACTION_MAP["restart"] == "/system/restart"
    assert AXEHUB_ACTION_MAP["reset_stats"] == "/system/reset_stats"


def test_normalize_maps_fields_and_converts_khs_to_ghs():
    info = {
        "device": {"mac": "AA:BB:CC", "hostname": "nerd-1", "board": "ESP32", "chip": "S3"},
        "hashing": {"current": 55000, "shares_accepted": 12, "shares_rejected": 1,
                    "best_diff": 1.23e6, "best_session_diff": 9999},
        "hardware": {"temp_board_c": 41, "uptime_s": 3600, "wifi_rssi_dbm": -55},
        "firmware": {"name": "nerdminer-axehub", "version": "1.2.3"},
        "pool": {"primary": {"url": "pool.example.com", "port": 3333, "user": "bc1q.nerd"}},
    }
    d = _normalize_axehub("192.168.1.70", "nerd-1", 75, info)
    assert d["_type"] == "axehub" and d["_online"] is True
    assert d["online"] is True and d["status"] == "online"
    # 55000 kH/s -> 0.055 GH/s
    assert d["GHs"] == 55000 / 1_000_000
    assert d["GHs5s"] == d["GHs"] and d["hashrate"] == d["GHs"]
    assert d["temp"] == 41
    assert d["pool"] == "pool.example.com:3333"
    assert d["stratumURL"] == "pool.example.com:3333"
    assert d["worker"] == "bc1q.nerd"
    assert d["uptime"] == 3600
    assert d["bestDiff"] == 1.23e6 and d["bestShare"] == 1.23e6
    assert d["lastDiff"] == 9999
    assert d["shares_ok"] == 12 and d["shares_err"] == 1
    assert d["rssi"] == -55 and d["wifi_rssi"] == -55
    assert d["version"] == "1.2.3"
    assert d["mac"] == "AA:BB:CC"
    assert d["hostname"] == "nerd-1"


def test_normalize_handles_missing_objects():
    d = _normalize_axehub("192.168.1.71", "x", None, {})
    assert d["_online"] is True
    assert d["GHs"] is None and d["temp"] is None
    assert d["pool"] == "" and d["worker"] == ""
    assert d["hostname"] == "x"
    # Non-dict input must not raise.
    d2 = _normalize_axehub("192.168.1.71", "x", None, None)
    assert d2["GHs"] is None


def test_fetch_safe_offline_path_on_error():
    client = AsyncMock()
    client.get = AsyncMock(side_effect=RuntimeError("boom"))
    out = asyncio.run(fetch_axehub_safe(client, [{"ip": "192.168.1.72", "name": "down"}]))
    assert len(out["devices"]) == 1
    dev = out["devices"][0]
    assert dev["_type"] == "axehub" and dev["_online"] is False
    assert dev["online"] is False and dev["status"] == "offline"
    assert dev["ip"] == "192.168.1.72"


def test_fetch_safe_empty_when_no_devices():
    client = AsyncMock()
    assert asyncio.run(fetch_axehub_safe(client, []))["devices"] == []


def test_probe_detects_axehub_via_ping():
    client = AsyncMock()
    client.get = AsyncMock(return_value=_resp(200, {"firmware": {"version": "1.2.3"}, "uptime_s": 10}))
    rec = asyncio.run(probe_axehub("192.168.1.73", client))
    assert rec and rec["type"] == "axehub_device"
    assert rec["name"] == "AxeHub (192.168.1.73)"
    assert rec["version"] == "1.2.3"
    assert rec["device_count"] == 1


def test_probe_rejects_non_axehub():
    client = AsyncMock()
    client.get = AsyncMock(return_value=_resp(200, {"foo": "bar"}))
    assert asyncio.run(probe_axehub("192.168.1.74", client)) is None


def test_probe_rejects_non_200():
    client = AsyncMock()
    client.get = AsyncMock(return_value=_resp(404, {}))
    assert asyncio.run(probe_axehub("192.168.1.75", client)) is None
