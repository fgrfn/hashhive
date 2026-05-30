"""Tests for the NMMiner (lottominer) driver against the real API shapes."""
import asyncio
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)

sys.path.insert(0, str(Path(__file__).parent.parent))

from miners.lottominer import LOTTO_ACTION_MAP, _normalize_info, probe_lottominer  # noqa: E402


def _resp(status, payload):
    return type("R", (), {"status_code": status, "json": lambda self: payload})()


def test_restart_uses_real_endpoint():
    assert LOTTO_ACTION_MAP["restart"] == "/api/system/restart"


def test_probe_detects_nmminer_by_model():
    client = AsyncMock()
    client.get = AsyncMock(return_value=_resp(200, {"model": "NMMiner", "hostname": "nm1", "hr": 5000, "ver": "0.4"}))
    rec = asyncio.run(probe_lottominer("192.168.1.50", client))
    assert rec and rec["type"] == "lottominer_device"
    assert rec["name"] == "nm1"


def test_probe_rejects_non_nmminer():
    client = AsyncMock()
    client.get = AsyncMock(return_value=_resp(200, {"foo": "bar"}))
    assert asyncio.run(probe_lottominer("192.168.1.51", client)) is None


def test_normalize_info_maps_fields():
    info = {
        "identity": {"hwModel": "NMMiner", "hostName": "garage-nm", "fwVersion": "0.4.2", "rssi": -55},
        "miner": {"hashRate": 0.0042, "sAccepted": 12, "sRejected": 1, "uptimeSeconds": 3600,
                  "bestDiffEver": 1.23e10, "lastDiff": 5000},
        "stratum": {"url": "stratum+tcp://pool:3333", "user": "bc1q.worker"},
        "temps": {"asic": 48, "vcore": 40},
    }
    d = _normalize_info("192.168.1.50", "garage-nm", None, info)
    assert d["_online"] is True
    assert d["GHs"] == 0.0042 and d["hashrate"] == 0.0042
    assert d["temp"] == 48
    assert d["pool"] == "stratum+tcp://pool:3333"
    assert d["worker"] == "bc1q.worker"
    assert d["bestDiff"] == 1.23e10
    assert d["shares_ok"] == 12 and d["shares_err"] == 1
    assert d["version"] == "0.4.2"
