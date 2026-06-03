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
from routers.health import device_health  # noqa: E402
from routers.stats import get_hashrate_stats  # noqa: E402

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


def test_append_device_samples_records_nmminer():
    """NMMiner devices (keyed by _ip, hashrate in GH/s) must get per-device
    samples too, so their detail page shows the 24h hashrate chart."""
    import core.stats as cs
    cs._last_dev_sample_ts = 0.0  # bypass the 1-per-minute rate limit
    nm = {"_ip": "10.0.0.50", "hashrate": 0.0042, "temp": 48}
    axe = {"_ip": "10.0.0.60", "hashRate": 1300.0, "temp": 55, "power": 15.0}
    cs._append_device_samples([axe, nm])
    from core import _dev_stats_file, _today, load_json
    data = load_json(_dev_stats_file(_today()), {})
    assert "10.0.0.50" in data and data["10.0.0.50"][-1]["gh"] == 0.0042
    assert "10.0.0.60" in data and data["10.0.0.60"][-1]["gh"] == 1300.0


def test_sane_ghs_filters_implausible():
    from core import sane_ghs
    assert sane_ghs(0.00104) == 0.00104   # tiny NMMiner value kept
    assert sane_ghs(1300) == 1300.0       # a BitAxe kept
    assert sane_ghs(0) == 0.0             # zero kept (not None)
    assert sane_ghs(3_000_000) is None    # 3 PH/s spike dropped
    assert sane_ghs(-1) is None
    assert sane_ghs(None) is None
    assert sane_ghs("x") is None


def test_device_samples_skip_implausible_hashrate():
    import core.stats as cs
    cs._last_dev_sample_ts = 0.0
    bad = {"_ip": "10.0.0.99", "hashrate": 3_000_000}   # bogus spike
    good = {"_ip": "10.0.0.98", "hashrate": 0.0042}
    cs._append_device_samples([bad, good])
    from core import _dev_stats_file, _today, load_json
    data = load_json(_dev_stats_file(_today()), {})
    assert "10.0.0.99" not in data        # spike skipped
    assert "10.0.0.98" in data
