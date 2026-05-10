"""Tests for alert helpers."""
import os
import sys
import tempfile
from pathlib import Path

import pytest

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)

sys.path.insert(0, str(Path(__file__).parent.parent))

from main import _append_entry, _load_recent, _today, LOGS_DIR  # noqa: E402


@pytest.fixture(autouse=True)
def ensure_logs_dir():
    LOGS_DIR.mkdir(parents=True, exist_ok=True)


def _clear_today_log():
    date_str = _today()
    log_file = LOGS_DIR / f"{date_str}.json"
    if log_file.exists():
        log_file.unlink()


def test_append_entry_adds_to_todays_log():
    _clear_today_log()
    _append_entry({"id": "test:1", "severity": "info", "message": "hello", "read": False})
    entries = _load_recent(days=1)
    assert any(e["id"] == "test:1" for e in entries)


def test_append_entry_most_recent_first():
    _clear_today_log()
    _append_entry({"id": "old:1", "severity": "info", "message": "first", "read": False})
    _append_entry({"id": "new:1", "severity": "warning", "message": "second", "read": False})
    entries = _load_recent(days=1)
    ids = [e["id"] for e in entries]
    assert ids.index("new:1") < ids.index("old:1")


def test_append_entry_caps_at_max(monkeypatch):
    import core
    monkeypatch.setattr(core, "MAX_ENTRIES_PER_DAY", 3)
    _clear_today_log()
    for i in range(5):
        _append_entry({"id": f"e{i}", "severity": "info", "message": f"msg{i}", "read": False})
    entries = _load_recent(days=1)
    assert len(entries) <= 3


def test_load_recent_returns_list():
    result = _load_recent(days=1)
    assert isinstance(result, list)
