"""Tests for auth helpers and API endpoints."""
import json
import os
import sys
import time
import tempfile
from pathlib import Path

import pytest

# Point DATA_DIR at a temp directory so tests never touch real data.
_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)

sys.path.insert(0, str(Path(__file__).parent.parent))

from main import (
    _hash_pw,
    _verify_pw,
    _rate_limited,
    _record_attempt,
    _login_attempts,
    _MAX_ATTEMPTS,
    _bootstrap_auth,
    CONFIG_FILE,
    load_json,
    DEFAULT_CONFIG,
)


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
    import hashlib
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
    monkeypatch.setattr("main.CONFIG_FILE", tmp_path / "config.json")
    monkeypatch.setattr("main.DATA_DIR", tmp_path)
    import main as m
    m.CONFIG_FILE = tmp_path / "config.json"
    _bootstrap_auth()
    cfg = load_json(m.CONFIG_FILE, DEFAULT_CONFIG)
    assert cfg["auth"]["enabled"] is True
    assert _verify_pw("bootstrapme", cfg["auth"]["password_hash"])


def test_bootstrap_auth_overrides_existing(tmp_path, monkeypatch):
    """HASHHIVE_PASSWORD must always override — enables recovery."""
    cfg_file = tmp_path / "config.json"
    existing = {"auth": {"enabled": True, "password_hash": _hash_pw("oldpassword")}}
    cfg_file.write_text(json.dumps(existing))
    monkeypatch.setenv("HASHHIVE_PASSWORD", "newpassword")
    import main as m
    m.CONFIG_FILE = cfg_file
    _bootstrap_auth()
    cfg = load_json(cfg_file, DEFAULT_CONFIG)
    assert _verify_pw("newpassword", cfg["auth"]["password_hash"])
    assert not _verify_pw("oldpassword", cfg["auth"]["password_hash"])


def test_bootstrap_auth_noop_when_no_env(tmp_path, monkeypatch):
    monkeypatch.delenv("HASHHIVE_PASSWORD", raising=False)
    import main as m
    m.CONFIG_FILE = tmp_path / "config.json"
    _bootstrap_auth()
    assert not (tmp_path / "config.json").exists()
