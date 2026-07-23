"""Tests for auth helpers and API endpoints."""
import hashlib
import json
import os
import sys
import time
import tempfile
from pathlib import Path

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)
_data_dir = Path(os.environ["HASHHIVE_DATA_DIR"])
(_data_dir / "logs").mkdir(parents=True, exist_ok=True)
(_data_dir / "stats").mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(Path(__file__).parent.parent))

from main import (  # noqa: E402
    _hash_pw,
    _verify_pw,
    _rate_limited,
    _record_attempt,
    _login_attempts,
    _MAX_ATTEMPTS,
    _bootstrap_auth,
    load_json,
    DEFAULT_CONFIG,
)
from core import CONFIG_FILE, _sessions, save_json  # noqa: E402


# ── _hash_pw / _verify_pw ─────────────────────────────────────────────────────

def test_hash_and_verify_roundtrip():
    h = _hash_pw("correct-horse")
    assert _verify_pw("correct-horse", h)


def test_wrong_password_rejected():
    h = _hash_pw("secretpassword")
    assert not _verify_pw("wrongpassword", h)


def test_empty_stored_hash_rejected():
    assert not _verify_pw("any", "")


def test_hash_format():
    h = _hash_pw("test")
    assert h.startswith("pbkdf2:")
    parts = h.split(":")
    assert len(parts) == 3


def test_unique_salts():
    h1 = _hash_pw("same")
    h2 = _hash_pw("same")
    assert h1 != h2  # different salts → different hashes
    assert _verify_pw("same", h1)
    assert _verify_pw("same", h2)


def test_legacy_sha256_verify():
    legacy = hashlib.sha256("legacypassword".encode()).hexdigest()
    assert _verify_pw("legacypassword", legacy)
    assert not _verify_pw("wrong", legacy)


# ── Rate limiting ─────────────────────────────────────────────────────────────

def test_not_rate_limited_initially():
    _login_attempts.pop("1.2.3.4", None)
    assert not _rate_limited("1.2.3.4")


def test_rate_limited_after_max_attempts():
    ip = "5.6.7.8"
    _login_attempts.pop(ip, None)
    for _ in range(_MAX_ATTEMPTS):
        _record_attempt(ip)
    assert _rate_limited(ip)


def test_rate_limit_resets_after_window():
    ip = "9.10.11.12"
    _login_attempts[ip] = [time.time() - 400]  # older than 5-min window
    assert not _rate_limited(ip)


# ── _bootstrap_auth ───────────────────────────────────────────────────────────

def test_bootstrap_auth_sets_password(tmp_path, monkeypatch):
    monkeypatch.setenv("HASHHIVE_PASSWORD", "bootstrapme")
    import core.auth
    monkeypatch.setattr(core.auth, "CONFIG_FILE", tmp_path / "config.json")
    _bootstrap_auth()
    cfg = load_json(core.auth.CONFIG_FILE, DEFAULT_CONFIG)
    assert cfg["auth"]["enabled"] is True
    assert _verify_pw("bootstrapme", cfg["auth"]["password_hash"])


def test_bootstrap_auth_overrides_existing(tmp_path, monkeypatch):
    """HASHHIVE_PASSWORD must always override — enables recovery."""
    cfg_file = tmp_path / "config.json"
    existing = {"auth": {"enabled": True, "password_hash": _hash_pw("oldpassword")}}
    cfg_file.write_text(json.dumps(existing))
    monkeypatch.setenv("HASHHIVE_PASSWORD", "newpassword")
    import core.auth
    monkeypatch.setattr(core.auth, "CONFIG_FILE", cfg_file)
    _bootstrap_auth()
    cfg = load_json(cfg_file, DEFAULT_CONFIG)
    assert _verify_pw("newpassword", cfg["auth"]["password_hash"])
    assert not _verify_pw("oldpassword", cfg["auth"]["password_hash"])


def test_bootstrap_auth_noop_when_no_env(tmp_path, monkeypatch):
    monkeypatch.delenv("HASHHIVE_PASSWORD", raising=False)
    import core.auth
    monkeypatch.setattr(core.auth, "CONFIG_FILE", tmp_path / "config.json")
    _bootstrap_auth()
    assert not (tmp_path / "config.json").exists()


def test_bootstrap_auth_revokes_persisted_sessions(tmp_path, monkeypatch):
    monkeypatch.setenv("HASHHIVE_PASSWORD", "replacement-password")
    import core.auth
    config_file = tmp_path / "config.json"
    sessions_file = tmp_path / "sessions.json"
    monkeypatch.setattr(core.auth, "CONFIG_FILE", config_file)
    monkeypatch.setattr(core.auth, "_SESSIONS_FILE", sessions_file)
    core.auth._sessions["stolen"] = time.time() + 3600
    sessions_file.write_text(json.dumps(core.auth._sessions))
    _bootstrap_auth()
    assert core.auth._sessions == {}
    assert json.loads(sessions_file.read_text()) == {}


def test_auth_update_preserves_caller_and_revokes_other_sessions():
    import asyncio
    from routers.settings import update_auth_settings

    class Request:
        cookies = {"hh_session": "current"}

    save_json(CONFIG_FILE, {
        **DEFAULT_CONFIG,
        "auth": {"enabled": True, "password_hash": _hash_pw("old-password")},
    })
    _sessions.clear()
    _sessions.update({"current": time.time() + 3600, "other": time.time() + 3600})
    result = asyncio.run(update_auth_settings(
        Request(),
        {"enabled": True, "password": "new-password"},
    ))
    assert result["auth"] == {"enabled": True}
    assert set(_sessions) == {"current"}
    saved = load_json(CONFIG_FILE, {})
    assert _verify_pw("new-password", saved["auth"]["password_hash"])


def test_http_security_headers_without_wildcard_cors():
    import asyncio
    import httpx
    from main import app

    async def _request():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.get(
                "/api/auth/check",
                headers={"Origin": "https://untrusted.example"},
            )

    response = asyncio.run(_request())
    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "content-security-policy" in response.headers
    assert "access-control-allow-origin" not in response.headers
