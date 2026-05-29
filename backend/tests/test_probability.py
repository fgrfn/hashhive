"""Tests for the Poisson block / best-share probability helpers."""
import math
import os
import sys
import tempfile
from pathlib import Path

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)

sys.path.insert(0, str(Path(__file__).parent.parent))

from routers.probability import (  # noqa: E402
    beat_best_share_probability,
    block_probability,
)

_TWO32 = 2 ** 32


def test_block_probability_matches_formula():
    hr = 1e12  # 1 TH/s in H/s
    diff = 1e9
    secs = 3600
    expected = 1.0 - math.exp(-secs * hr / (_TWO32 * diff))
    assert abs(block_probability(hr, diff, secs) - expected) < 1e-12


def test_block_probability_zero_inputs():
    assert block_probability(0, 1e9, 3600) == 0.0
    assert block_probability(1e12, 0, 3600) == 0.0
    assert block_probability(1e12, 1e9, 0) == 0.0


def test_block_probability_monotonic_in_time_and_hashrate():
    p1h = block_probability(1e12, 1e9, 3600)
    p24h = block_probability(1e12, 1e9, 86400)
    assert p24h > p1h
    assert block_probability(2e12, 1e9, 3600) > p1h
    # Always a valid probability.
    assert 0.0 <= p24h <= 1.0


def test_beat_best_share_easier_than_block():
    # Beating your own (smaller) best share is far more likely than a block.
    hr, secs = 1e12, 3600
    p_beat = beat_best_share_probability(hr, best_diff=1e6, seconds=secs)
    p_block = block_probability(hr, difficulty=1e12, seconds=secs)
    assert p_beat > p_block


def test_beat_best_share_zero_best_diff():
    assert beat_best_share_probability(1e12, 0, 3600) == 0.0
