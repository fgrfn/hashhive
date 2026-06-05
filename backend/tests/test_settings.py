"""Tests for settings load/save helpers."""
import json
import os
import sys
import tempfile
from pathlib import Path

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)
(Path(_tmpdir) / "logs").mkdir(parents=True, exist_ok=True)

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
    assert "wroomminer_devices" in DEFAULT_CONFIG
    assert "lottominer_master" not in DEFAULT_CONFIG  # dropped: no more master concept
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
    assert "lottominer_master" not in cfg
    # The legacy master IP is folded into lottominer_devices as a standalone device.
    ips = {d.get("ip") for d in cfg["lottominer_devices"]}
    assert ips == {"192.168.1.6", "192.168.1.5"}


def test_migrate_config_folds_lottominer_master_into_devices():
    save_json(CONFIG_FILE, {
        "lottominer_master": "10.0.0.9",
        "lottominer_devices": [{"ip": "10.0.0.10", "name": "dev"}],
    })
    _migrate_config()
    cfg = load_json(CONFIG_FILE, {})
    assert "lottominer_master" not in cfg
    ips = {d.get("ip") for d in cfg["lottominer_devices"]}
    assert ips == {"10.0.0.10", "10.0.0.9"}


def test_load_json_returns_copy_not_default_reference(tmp_path):
    """Mutating the result of load_json (file missing) must not corrupt the
    shared default object."""
    p = tmp_path / "missing.json"
    default = {"items": [1, 2, 3]}
    result = load_json(p, default)
    result["items"].append(99)
    assert default["items"] == [1, 2, 3]  # original untouched


def test_purge_resets_selected_categories_only(tmp_path):
    import asyncio
    from routers.settings import purge_data
    save_json(CONFIG_FILE, {
        **DEFAULT_CONFIG,
        "axeos_devices": [{"ip": "10.0.0.1"}],
        "pool_presets": [{"id": "p1"}],
        "wallets": [{"id": "w1"}],
    })
    asyncio.run(purge_data({"categories": ["devices", "pools"]}))
    cfg = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    assert cfg["axeos_devices"] == []
    assert cfg["pool_presets"] == []
    assert cfg["wallets"] == [{"id": "w1"}]   # not selected → kept
    assert DEFAULT_CONFIG["axeos_devices"] == []  # shared default never mutated


def test_purge_rejects_unknown_and_empty():
    import asyncio
    from fastapi import HTTPException
    from routers.settings import purge_data
    for bad in ([], ["nonsense"]):
        try:
            asyncio.run(purge_data({"categories": bad}))
            assert False, "expected HTTPException"
        except HTTPException as exc:
            assert exc.status_code == 400
