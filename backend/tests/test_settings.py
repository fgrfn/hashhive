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
from core import (  # noqa: E402
    CONFIG_FILE,
    SECRET_MASK,
    _hash_pw,
    _migrate_config,
    _verify_pw,
    public_config,
)


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


def test_public_config_masks_credentials_and_password_hash():
    cfg = {
        **DEFAULT_CONFIG,
        "auth": {"enabled": True, "password_hash": "pbkdf2:secret"},
        "notifications": {
            **DEFAULT_CONFIG["notifications"],
            "telegram_token": "bot-secret",
            "discord_webhook": "https://discord.example/secret",
        },
        "discord_bot": {"enabled": True, "token": "discord-secret"},
    }
    shown = public_config(cfg)
    assert "password_hash" not in shown["auth"]
    assert shown["notifications"]["telegram_token"] == SECRET_MASK
    assert shown["notifications"]["discord_webhook"] == SECRET_MASK
    assert shown["discord_bot"]["token"] == SECRET_MASK
    assert "pool_presets" not in shown
    assert cfg["notifications"]["telegram_token"] == "bot-secret"


def test_settings_autosave_preserves_password_and_secrets():
    import asyncio
    from routers.settings import get_settings, post_settings

    password_hash = _hash_pw("correct-horse")
    save_json(CONFIG_FILE, {
        **DEFAULT_CONFIG,
        "auth": {"enabled": True, "password_hash": password_hash},
        "notifications": {
            **DEFAULT_CONFIG["notifications"],
            "telegram_token": "bot-secret",
        },
        "refresh_interval": 30,
    })
    browser_copy = asyncio.run(get_settings())
    browser_copy["refresh_interval"] = 45
    returned = asyncio.run(post_settings(browser_copy))

    saved = load_json(CONFIG_FILE, {})
    assert saved["refresh_interval"] == 45
    assert saved["auth"]["password_hash"] == password_hash
    assert _verify_pw("correct-horse", saved["auth"]["password_hash"])
    assert saved["notifications"]["telegram_token"] == "bot-secret"
    assert returned["refresh_interval"] == 45
    assert returned["notifications"]["telegram_token"] == SECRET_MASK
    assert "password_hash" not in returned["auth"]


def test_partial_settings_patch_does_not_reset_unrelated_values():
    import asyncio
    from routers.settings import post_settings

    save_json(CONFIG_FILE, {
        **DEFAULT_CONFIG,
        "refresh_interval": 17,
        "wallets": [{"id": "wallet-1"}],
    })
    returned = asyncio.run(post_settings({"offline_grace_minutes": 9}))
    saved = load_json(CONFIG_FILE, {})
    assert saved["refresh_interval"] == 17
    assert saved["wallets"] == [{"id": "wallet-1"}]
    assert saved["offline_grace_minutes"] == 9
    assert returned["offline_grace_minutes"] == 9


def test_auth_cannot_be_enabled_without_password():
    import asyncio
    from fastapi import HTTPException
    from routers.settings import post_settings

    save_json(CONFIG_FILE, DEFAULT_CONFIG)
    try:
        asyncio.run(post_settings({"auth": {"enabled": True}}))
        assert False, "expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 400
