"""Tests for the native WroomMiner driver against the documented API shapes."""
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

from miners.wroomminer import (  # noqa: E402
    WROOM_ACTION_MAP,
    _normalize_wroom,
    fetch_wroomminer_safe,
    probe_wroomminer,
    set_wroomminer_pool,
)


def _resp(status, payload):
    return type("R", (), {"status_code": status, "json": lambda self: payload,
                          "raise_for_status": lambda self: None})()


# Documented sample payloads (from the WroomMiner native API spec).
_STATUS = {
    "uptime_seconds": 3712,
    "hashrate_hs": 412000.5,
    "shares_accepted": 8,
    "shares_rejected": 0,
    "best_difficulty": 0.12345,
    "wifi_connected": True,
    "wifi_rssi": -54,
    "free_heap": 142336,
    "firmware_version": "0.1.0",
}
_POOL = {
    "primary": {"url": "public-pool.io", "port": 21496},
    "active": "fallback",
    "active_url": "solo.ckpool.org",
    "active_port": 3333,
    "connected": True,
    "worker": "bc1q.wroom01",
    "active_wallet": "bc1q...",
}
_PROBE = {
    "firmware": "WroomMiner",
    "version": "0.1.0",
    "hostname": "wroomminer",
    "mac": "AA:BB:CC:DD:EE:FF",
    "ip": "192.168.1.123",
    "uptime_seconds": 3712,
    "hashrate_hs": 412000.5,
    "shares_accepted": 8,
    "best_difficulty": 0.12345,
}


def test_action_map_only_exposes_restart():
    # Factory reset (/api/system/reset) is intentionally NOT a routine action.
    assert WROOM_ACTION_MAP == {"restart": "/api/system/restart"}


def test_normalize_converts_hs_to_ghs_and_maps_fields():
    d = _normalize_wroom("192.168.1.123", "wroom-1", 75, _STATUS, _POOL)
    assert d["_type"] == "wroomminer" and d["_online"] is True
    assert d["online"] is True and d["status"] == "online"
    assert d["model"] == "WroomMiner"
    # 412000.5 H/s -> 0.0004120005 GH/s
    assert d["GHs"] == 412000.5 / 1_000_000_000
    assert d["GHs5s"] == d["GHs"] and d["hashrate"] == d["GHs"]
    # ESP32-WROOM has no temp sensor.
    assert d["temp"] is None
    assert d["pool"] == "solo.ckpool.org:3333"
    assert d["worker"] == "bc1q.wroom01"
    assert d["uptime"] == 3712
    assert d["bestDiff"] == 0.12345 and d["bestShare"] == 0.12345
    assert d["shares_ok"] == 8 and d["shares_err"] == 0
    assert d["rssi"] == -54 and d["wifi_rssi"] == -54
    assert d["version"] == "0.1.0"


def test_normalize_handles_missing_objects():
    d = _normalize_wroom("192.168.1.124", "x", None, {}, {})
    assert d["_online"] is True
    assert d["GHs"] is None and d["temp"] is None
    assert d["pool"] == "" and d["worker"] == ""
    # Non-dict input must not raise.
    d2 = _normalize_wroom("192.168.1.124", "x", None, None, None)
    assert d2["GHs"] is None


def test_fetch_safe_polls_status_and_pool():
    async def _get(url, **kwargs):
        if url.endswith("/api/status"):
            return _resp(200, _STATUS)
        if url.endswith("/api/pool"):
            return _resp(200, _POOL)
        return _resp(404, {})

    client = AsyncMock()
    client.get = AsyncMock(side_effect=_get)
    out = asyncio.run(fetch_wroomminer_safe(client, [{"ip": "192.168.1.123", "name": "wroom-1"}]))
    assert len(out["devices"]) == 1
    dev = out["devices"][0]
    assert dev["_online"] is True
    assert dev["GHs"] == 412000.5 / 1_000_000_000
    assert dev["pool"] == "solo.ckpool.org:3333"


def test_fetch_safe_offline_path_on_error():
    client = AsyncMock()
    client.get = AsyncMock(side_effect=RuntimeError("boom"))
    out = asyncio.run(fetch_wroomminer_safe(client, [{"ip": "192.168.1.125", "name": "down"}]))
    dev = out["devices"][0]
    assert dev["_type"] == "wroomminer" and dev["_online"] is False
    assert dev["online"] is False and dev["status"] == "offline"
    assert dev["model"] == "WroomMiner"


def test_fetch_safe_empty_when_no_devices():
    client = AsyncMock()
    assert asyncio.run(fetch_wroomminer_safe(client, []))["devices"] == []


def test_probe_detects_wroomminer():
    client = AsyncMock()
    client.get = AsyncMock(return_value=_resp(200, _PROBE))
    rec = asyncio.run(probe_wroomminer("192.168.1.123", client))
    assert rec and rec["type"] == "wroomminer_device"
    assert rec["model"] == "WroomMiner"
    assert rec["name"] == "wroomminer"
    assert rec["version"] == "0.1.0"
    assert rec["mac"] == "AA:BB:CC:DD:EE:FF"


def test_probe_rejects_non_wroomminer():
    client = AsyncMock()
    client.get = AsyncMock(return_value=_resp(200, {"firmware": "NMMiner", "version": "1.0"}))
    assert asyncio.run(probe_wroomminer("192.168.1.126", client)) is None


def test_probe_rejects_non_200():
    client = AsyncMock()
    client.get = AsyncMock(return_value=_resp(404, {}))
    assert asyncio.run(probe_wroomminer("192.168.1.127", client)) is None


def test_set_pool_posts_native_config():
    captured = {}

    async def _post(url, json=None, **kwargs):
        captured["url"] = url
        captured["body"] = json
        return _resp(200, {"status": "saved", "restart_required": True})

    client = AsyncMock()
    client.post = AsyncMock(side_effect=_post)
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)

    import miners.wroomminer as wm
    orig = wm.httpx.AsyncClient
    wm.httpx.AsyncClient = lambda *a, **k: client
    try:
        res = asyncio.run(set_wroomminer_pool("192.168.1.123", {
            "url": "solo.ckpool.org:3333", "wallet": "bc1qWALLET", "worker": "wroom01",
        }))
    finally:
        wm.httpx.AsyncClient = orig

    assert res["status"] == 200 and res["type"] == "wroomminer"
    assert captured["url"].endswith("/api/config")
    assert captured["body"]["pool_primary_url"] == "solo.ckpool.org"
    assert captured["body"]["pool_primary_port"] == 3333
    assert captured["body"]["wallet_address"] == "bc1qWALLET"
    assert captured["body"]["worker_name"] == "wroom01"
