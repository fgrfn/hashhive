"""Tests for the interactive Discord bot command logic (pure, no gateway)."""
import os
import sys
import tempfile
from pathlib import Path

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)
(Path(_tmpdir) / "logs").mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(Path(__file__).parent.parent))

from routers.discord_bot import _chunk, handle_command  # noqa: E402

_DEVS = [
    {"name": "bitaxe-gamma", "ip": "10.0.0.1", "family": "bitaxe", "online": True,
     "hashrate": 1410, "temp": 48.8, "power": 20.1, "uptime": 702000,
     "best_diff": 12.95e9, "accepted": 11568, "rejected": 5,
     "pool": "bch.hmpool.io", "worker": "w.gamma", "frequency": 670, "fan": 30,
     "rssi": -55, "version": "v2.13.1"},
    {"name": "NMMiner4", "ip": "10.0.0.2", "family": "lottominer", "online": False,
     "hashrate": 0, "temp": None, "power": None, "uptime": None,
     "best_diff": 3321.5, "accepted": 43, "rejected": 1,
     "pool": "eu.digi", "worker": "w", "frequency": None, "fan": None,
     "rssi": -61, "version": "v2.0.02"},
]


def test_status_summarises_fleet():
    out = handle_command("status", "", _DEVS)
    assert "1/2 online" in out
    assert "1.41 TH/s" in out
    assert "bitaxe-gamma" in out and "NMMiner4" in out


def test_unknown_command_is_silent():
    assert handle_command("bogus", "", _DEVS) is None


def test_help_lists_commands():
    out = handle_command("help", "", _DEVS)
    assert "hashrate" in out and "stratum" in out


def test_name_filter_selects_one_device():
    out = handle_command("hashrate", "gamma", _DEVS)
    assert "bitaxe-gamma" in out
    assert "NMMiner4" not in out


def test_power_and_fans_only_have_values_for_axeos():
    power = handle_command("power", "", _DEVS)
    assert "20.1 W" in power      # axeos
    fans = handle_command("fans", "gamma", _DEVS)
    assert "30%" in fans


def test_best_diff_formatting():
    out = handle_command("best", "", _DEVS)
    assert "12.95G" in out and "3.32K" in out


def test_prefix_chars_are_stripped():
    # leading !/ should be tolerated by the dispatcher
    assert handle_command("!status", "", _DEVS) == handle_command("status", "", _DEVS)


def test_chunk_splits_on_line_boundaries():
    text = "\n".join(f"line {i}" for i in range(500))
    chunks = _chunk(text, 1900)
    assert len(chunks) > 1
    assert all(len(c) <= 1900 for c in chunks)
