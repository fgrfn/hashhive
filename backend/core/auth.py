"""Password hashing, session management and brute-force rate limiting."""

import hashlib
import os
import secrets
import time

from .config import DEFAULT_CONFIG
from .jsonio import load_json, save_json
from .paths import CONFIG_FILE, _SESSIONS_FILE

_sessions: dict[str, float] = {}        # token → expiry unix timestamp
_SESSION_TTL = 86400 * 30               # 30 days

# Brute-force protection: track failed login timestamps per IP
_login_attempts: dict[str, list[float]] = {}
_MAX_ATTEMPTS = 5
_ATTEMPT_WINDOW = 300  # 5-minute sliding window


def _hash_pw(pw: str) -> str:
    """Hash a password with PBKDF2-HMAC-SHA256 and a random 16-byte salt."""
    salt = secrets.token_bytes(16)
    key = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt, 260_000)
    return f"pbkdf2:{salt.hex()}:{key.hex()}"


def _verify_pw(pw: str, stored: str) -> bool:
    """Verify password against stored hash. Supports legacy plain-SHA-256 hashes."""
    if not stored:
        return False
    if stored.startswith("pbkdf2:"):
        try:
            _, salt_hex, key_hex = stored.split(":", 2)
            key = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), bytes.fromhex(salt_hex), 260_000)
            return secrets.compare_digest(key.hex(), key_hex)
        except Exception:
            return False
    # Legacy: plain SHA-256 without salt — verify and let login upgrade it
    return secrets.compare_digest(hashlib.sha256(pw.encode("utf-8")).hexdigest(), stored)


def _session_valid(request) -> bool:  # accepts Request or WebSocket (both have .cookies)
    token = request.cookies.get("hh_session", "")
    return bool(token and token in _sessions and _sessions[token] > time.time())


def _rate_limited(ip: str) -> bool:
    now = time.time()
    recent = [t for t in _login_attempts.get(ip, []) if t > now - _ATTEMPT_WINDOW]
    _login_attempts[ip] = recent
    return len(recent) >= _MAX_ATTEMPTS


def _record_attempt(ip: str) -> None:
    attempts = _login_attempts.setdefault(ip, [])
    attempts.append(time.time())
    # Keep only the most recent entries to bound memory
    _login_attempts[ip] = attempts[-20:]


def _load_sessions() -> None:
    """Load persisted sessions from disk, pruning expired ones (mutates in place)."""
    now = time.time()
    try:
        data = load_json(_SESSIONS_FILE, {})
        valid = {k: v for k, v in data.items() if isinstance(v, (int, float)) and v > now}
    except Exception:
        valid = {}
    _sessions.clear()
    _sessions.update(valid)


def _persist_sessions() -> None:
    """Write the current session map to disk."""
    try:
        save_json(_SESSIONS_FILE, _sessions)
    except Exception:
        pass


def _bootstrap_auth() -> None:
    """If HASHHIVE_PASSWORD is set, enforce it as the current password (allows env-based recovery)."""
    pw = os.environ.get("HASHHIVE_PASSWORD", "").strip()
    if not pw:
        return
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    config.setdefault("auth", {})["enabled"] = True
    config["auth"]["password_hash"] = _hash_pw(pw)
    save_json(CONFIG_FILE, config)
