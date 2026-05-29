"""Tests for the PID auto-fan pure step function."""
import os
import sys
import tempfile
from pathlib import Path

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)

sys.path.insert(0, str(Path(__file__).parent.parent))

from routers.autofan import pid_step  # noqa: E402

_GAINS = {"kp": 4.0, "ki": 0.1, "kd": 1.0}
_CLAMP = (30.0, 100.0)


def test_hot_drives_fan_up():
    pct, _ = pid_step({}, temp=75, target=60, gains=_GAINS, clamp=_CLAMP)
    assert pct > 30  # above min when over target


def test_clamped_to_max():
    pct, _ = pid_step({"integral": 1000, "last_err": 0}, temp=120, target=60, gains=_GAINS, clamp=_CLAMP)
    assert pct == 100


def test_clamped_to_min_when_cool():
    pct, _ = pid_step({}, temp=40, target=60, gains=_GAINS, clamp=_CLAMP)
    assert pct == 30  # never below min


def test_integral_antiwindup_bounded():
    state = {}
    # Feed many hot iterations; integral must stay bounded (<= max/ki).
    for _ in range(1000):
        _, state = pid_step(state, temp=90, target=60, gains=_GAINS, clamp=_CLAMP)
    assert abs(state["integral"]) <= _CLAMP[1] / _GAINS["ki"] + 1e-6


def test_hotter_gives_higher_or_equal_output():
    p_warm, _ = pid_step({}, temp=65, target=60, gains=_GAINS, clamp=_CLAMP)
    p_hot, _ = pid_step({}, temp=85, target=60, gains=_GAINS, clamp=_CLAMP)
    assert p_hot >= p_warm
