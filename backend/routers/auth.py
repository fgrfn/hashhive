"""Auth router: login, logout, auth check."""

import secrets
import time

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from core import (
    CONFIG_FILE,
    DEFAULT_CONFIG,
    LoginRequest,
    _SESSION_TTL,
    _hash_pw,
    _login_attempts,
    _persist_sessions,
    _rate_limited,
    _record_attempt,
    _session_valid,
    _sessions,
    _verify_pw,
    load_json,
    save_json,
)

router = APIRouter()


@router.get("/api/auth/check")
async def auth_check(request: Request) -> dict:
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    enabled = config.get("auth", {}).get("enabled", False)
    if not enabled:
        return {"authenticated": True, "auth_enabled": False}
    return {"authenticated": _session_valid(request), "auth_enabled": True}


@router.post("/api/auth/login")
async def auth_login(request: Request, data: LoginRequest) -> JSONResponse:
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    auth_cfg = config.get("auth", {})
    if not auth_cfg.get("enabled"):
        return JSONResponse({"ok": True, "message": "auth disabled"})

    client_ip = request.client.host if request.client else "unknown"
    if _rate_limited(client_ip):
        raise HTTPException(status_code=429, detail="Too many login attempts. Please wait.")

    pw = data.password
    stored = auth_cfg.get("password_hash", "")
    if not _verify_pw(pw, stored):
        _record_attempt(client_ip)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Transparently upgrade legacy plain-SHA-256 hash to PBKDF2
    if not stored.startswith("pbkdf2:"):
        config["auth"]["password_hash"] = _hash_pw(pw)
        save_json(CONFIG_FILE, config)

    _login_attempts.pop(client_ip, None)  # clear on success
    token = secrets.token_hex(32)
    _sessions[token] = time.time() + _SESSION_TTL
    _persist_sessions()
    resp = JSONResponse({"ok": True})
    is_https = (
        request.headers.get("x-forwarded-proto") == "https"
        or request.url.scheme == "https"
    )
    resp.set_cookie(
        "hh_session", token,
        max_age=_SESSION_TTL,
        httponly=True,
        samesite="lax",
        secure=is_https,
    )
    return resp


@router.post("/api/auth/logout")
async def auth_logout(request: Request) -> JSONResponse:
    token = request.cookies.get("hh_session", "")
    _sessions.pop(token, None)
    _persist_sessions()
    resp = JSONResponse({"ok": True})
    resp.delete_cookie("hh_session")
    return resp
