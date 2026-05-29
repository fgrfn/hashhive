"""Tests for stats endpoints: per-device health series and hashrate hours filter."""
import asyncio
import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)

sys.path.insert(0, str(Path(__file__).parent.parent))

from core import STATS_DIR, _dev_stats_file, _stats_file, save_json  # noqa: E402
from routers.stats import device_health, get_hashrate_stats  # noqa: E402

STATS_DIR.mkdir(parents=True, exist_ok=True)


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def test_device_health_returns_series():
    now = datetime.now(timezone.utc)
    ip = "192.168.1.10"
    samples = [
        {"ts": (now - timedelta(minutes=2)).isoformat(), "gh": 1.0, "temp": 55, "pwr": 12.0},
        {"ts": (now - timedelta(minutes=1)).isoformat(), "gh": 1.2, "temp": 57, "pwr": 13.0},
    ]
    save_json(_dev_stats_file(_today()), {ip: samples})
    res = asyncio.run(device_health(ip, hours=24))
    assert res["hashrate_series"] == [1.0, 1.2]
    assert res["temp_series"] == [55, 57]
    assert res["power_series"] == [12.0, 13.0]


def test_hashrate_hours_filters_old_samples():
    now = datetime.now(timezone.utc)
    samples = [
        {"ts": (now - timedelta(hours=5)).isoformat(), "gh": 1.0},   # outside 1h
        {"ts": (now - timedelta(minutes=30)).isoformat(), "gh": 2.0},  # inside 1h
    ]
    save_json(_stats_file(_today()), samples)
    res = asyncio.run(get_hashrate_stats(days=1, hours=1))
    assert [s["gh"] for s in res] == [2.0]
