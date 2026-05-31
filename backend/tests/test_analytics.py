"""Tests for all-time record tracking and the analytics expected-time helper."""
import os
import sys
import tempfile
from pathlib import Path

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)
(Path(_tmpdir) / "stats").mkdir(parents=True, exist_ok=True)
(Path(_tmpdir) / "logs").mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(Path(__file__).parent.parent))

from datetime import datetime, timezone  # noqa: E402

from core import (  # noqa: E402
    _bestdiff_file,
    _dev_stats_file,
    _load_records,
    _stats_file,
    _update_records,
    save_json,
)
from routers.analytics import (  # noqa: E402
    _activity_summary,
    _best_share_series,
    _efficiency_ranking,
    expected_seconds,
)
from routers.probability import _TWO32  # noqa: E402

_TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")


def test_update_records_tracks_all_time_best():
    _update_records([{"_ip": "192.168.1.10", "_name": "axe", "_type": "bitaxe", "bestDiff": 1000}])
    _update_records([{"_ip": "192.168.1.10", "_name": "axe", "_type": "bitaxe", "bestDiff": 500}])  # lower, ignored
    _update_records([{"_ip": "192.168.1.10", "_name": "axe", "_type": "bitaxe", "bestDiff": 2500}])  # new record
    rec = _load_records()["192.168.1.10"]
    assert rec["best_diff"] == 2500
    assert rec["name"] == "axe"


def test_update_records_ignores_missing_or_zero():
    _update_records([{"_ip": "192.168.1.99"}])  # no bestDiff
    _update_records([{"_ip": "192.168.1.98", "bestDiff": 0}])
    recs = _load_records()
    assert "192.168.1.99" not in recs
    assert "192.168.1.98" not in recs


def test_expected_seconds_formula():
    # 1 TH/s (1000 GH/s), difficulty 1 → 2^32 seconds.
    assert abs(expected_seconds(1000.0, 1.0) - _TWO32 / 1e12) < 1e-6
    assert expected_seconds(0, 1.0) is None
    assert expected_seconds(1000.0, None) is None


def test_activity_summary_share_delta_and_best():
    save_json(_stats_file(_TODAY), [
        {"ts": "t", "gh": 1000, "pwr": 30, "shares": 100},
        {"ts": "t", "gh": 1100, "pwr": 32, "shares": 250},
    ])
    save_json(_bestdiff_file(_TODAY), {
        "10.0.0.1": {"name": "axe1", "samples": [{"ts": "t", "diff": 5000}, {"ts": "t", "diff": 12000}]},
    })
    s = _activity_summary()
    assert s["shares_today"] == 150        # cumulative 250 - 100
    assert s["best_today"] == 12000.0
    assert s["shares_7d"] >= 150
    assert s["best_7d"] == 12000.0


def test_best_share_series_has_seven_days_with_today_peak():
    save_json(_bestdiff_file(_TODAY), {
        "10.0.0.1": {"name": "axe1", "samples": [{"ts": "t", "diff": 9000}]},
    })
    series = _best_share_series(7)
    assert len(series) == 7
    assert series[-1]["date"] == _TODAY
    assert series[-1]["best"] == 9000.0


def test_efficiency_ranking_sorted_by_w_per_th():
    save_json(_dev_stats_file(_TODAY), {
        "10.0.0.1": [{"ts": "t", "gh": 500, "pwr": 15}, {"ts": "t", "gh": 520, "pwr": 15}],
        "10.0.0.2": [{"ts": "t", "gh": 1000, "pwr": 18}, {"ts": "t", "gh": 1000, "pwr": 18}],
        "10.0.0.3": [{"ts": "t", "gh": 800}],  # no power → skipped
    })
    eff = _efficiency_ranking()
    assert [r["ip"] for r in eff] == ["10.0.0.2", "10.0.0.1"]  # 18 W/TH before 29.4
    assert eff[0]["w_per_th"] == 18.0
    assert all(r["ip"] != "10.0.0.3" for r in eff)
