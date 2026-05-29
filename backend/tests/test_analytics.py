"""Tests for all-time record tracking and the analytics expected-time helper."""
import os
import sys
import tempfile
from pathlib import Path

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)

sys.path.insert(0, str(Path(__file__).parent.parent))

from core import _load_records, _update_records  # noqa: E402
from routers.analytics import expected_seconds  # noqa: E402
from routers.probability import _TWO32  # noqa: E402


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
