"""Tests for settings load/save helpers."""
import json
import os
import sys
import tempfile
from pathlib import Path

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)

sys.path.insert(0, str(Path(__file__).parent.parent))

from main import load_json, save_json, DEFAULT_CONFIG  # noqa: E402
from core import CONFIG_FILE, _migrate_config  # noqa: E402


def test_load_json_returns_default_when_missing(tmp_path):
    p = tmp_path / "nonexistent.json"
    result = load_json(p, {"key": "value"})
    assert result == {"key": "value"}


def test_load_json_reads_existing_file(tmp_path):
    p = tmp_path / "data.json"
    p.write_text(json.dumps({"foo": 42}))
    result = load_json(p, {})
    assert result == {"foo": 42}


def test_save_json_writes_valid_json(tmp_path):
    p = tmp_path / "out.json"
    save_json(p, {"a": 1, "b": [1, 2, 3]})
    assert json.loads(p.read_text()) == {"a": 1, "b": [1, 2, 3]}


def test_load_json_creates_file_with_default_when_missing(tmp_path):
    p = tmp_path / "new.json"
    load_json(p, {"default": True})
    assert p.exists()
    assert json.loads(p.read_text()) == {"default": True}


def test_roundtrip(tmp_path):
    p = tmp_path / "roundtrip.json"
    data = {"nmminer_devices": ["192.168.1.1"], "refresh_interval": 15}
    save_json(p, data)
    assert load_json(p, {}) == data


def test_default_config_has_required_keys():
    assert "lottominer_devices" in DEFAULT_CONFIG
    assert "lottominer_master" in DEFAULT_CONFIG
    assert "axeos_devices" in DEFAULT_CONFIG
    assert "refresh_interval" in DEFAULT_CONFIG


def test_migrate_config_renames_legacy_nmminer_keys():
    save_json(CONFIG_FILE, {
        "nmminer_master": "192.168.1.5",
        "nmminer_devices": [{"ip": "192.168.1.6", "name": "old"}],
        "axeos_devices": [],
    })
    _migrate_config()
    cfg = load_json(CONFIG_FILE, {})
    assert "nmminer_master" not in cfg
    assert "nmminer_devices" not in cfg
    assert cfg["lottominer_master"] == "192.168.1.5"
    assert cfg["lottominer_devices"][0]["ip"] == "192.168.1.6"
