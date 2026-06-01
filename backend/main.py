"""HashHive backend — thin entry point.

Creates the FastAPI app, registers middleware, includes all routers,
defines the lifespan (startup/shutdown), WebSocket endpoint, and SPA catch-all.
"""

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from core import (
    APP_VERSION,
    CONFIG_FILE,
    DATA_DIR,
    DEFAULT_CONFIG,
    DEVICE_STATE_FILE,
    FRONTEND_DIR,
    LOGS_DIR,
    STATS_DIR,
    TEMPLATES_DIR,
    _append_entry,
    _bootstrap_auth,
    _cleanup_old_logs,
    _cleanup_old_stats,
    _load_sessions,
    _migrate_config,
    _migrate_legacy,
    _read_day,
    _session_valid,
    _today,
    _ws_manager,
    load_json,
)

# Re-export core symbols so that existing test imports from main still work
from core import (  # noqa: F401
    _hash_pw,
    _verify_pw,
    _rate_limited,
    _record_attempt,
    _login_attempts,
    _MAX_ATTEMPTS,
    _ATTEMPT_WINDOW,
    _sessions,
    _SESSION_TTL,
    _persist_sessions,
    save_json,
    _validate_device_ip,
    _log_file,
    _write_day,
    _append_entry as _append_entry_re,
    _load_recent,
    _cleanup_old_stats_dir,
    _migrate_legacy as _migrate_legacy_re,
    BASE_DIR,
    ALERT_HISTORY_FILE,
    _SESSIONS_FILE,
    MAX_ENTRIES_PER_DAY,
    KEEP_DAYS,
    _startup_time,
    _price_cache,
    _low_hr_since,
    DEFAULT_CONFIG as DEFAULT_CONFIG_re,
    LoginRequest,
    PatchDeviceRequest,
    AxeConfigBatchRequest,
    AxeActionBatchRequest,
    _WSManager,
    _check_auto_restart,
    _append_hashrate_sample,
    _append_device_samples,
    _append_bestdiff_samples,
    _stats_file,
    _dev_stats_file,
    _bestdiff_file,
    _hash_pw as _hash_pw_re,
    _verify_pw as _verify_pw_re,
    _session_valid as _session_valid_re,
    _load_sessions as _load_sessions_re,
    _bootstrap_auth as _bootstrap_auth_re,
)

from routers.axeos import _fetch_axeos_device
from routers.lottominer import _fetch_lottominer_safe
from routers.dashboard import _dashboard_broadcast_loop
from routers.notifications import _weekly_summary_loop
from routers.discovery import _discovery_background_loop
from routers.autofan import _autofan_loop
from routers.schedules import _schedules_execution_loop
from routers.discord_dashboard import _discord_dashboard_loop
from routers.discord_bot import _discord_bot_loop

import routers.auth as _auth_router
import routers.settings as _settings_router
import routers.lottominer as _lottominer_router
import routers.axeos as _axeos_router
import routers.dashboard as _dashboard_router
import routers.alerts as _alerts_router
import routers.notifications as _notifications_router
import routers.groups as _groups_router
import routers.schedules as _schedules_router
import routers.wallets as _wallets_router
import routers.stats as _stats_router
import routers.health as _health_router
import routers.updates as _updates_router
import routers.discovery as _discovery_router
import routers.pools as _pools_router
import routers.templates as _templates_router
import routers.probability as _probability_router
import routers.analytics as _analytics_router
import routers.discord_dashboard as _discord_dashboard_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    STATS_DIR.mkdir(parents=True, exist_ok=True)
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    load_json(CONFIG_FILE, DEFAULT_CONFIG)
    load_json(DEVICE_STATE_FILE, {})
    _migrate_config()
    _migrate_legacy()
    _cleanup_old_logs()
    _cleanup_old_stats()
    _bootstrap_auth()
    _load_sessions()
    task = asyncio.create_task(_dashboard_broadcast_loop())
    ws_task = asyncio.create_task(_weekly_summary_loop())
    disc_task = asyncio.create_task(_discovery_background_loop())
    fan_task = asyncio.create_task(_autofan_loop())
    sched_task = asyncio.create_task(_schedules_execution_loop())
    dd_task = asyncio.create_task(_discord_dashboard_loop())
    db_task = asyncio.create_task(_discord_bot_loop())
    _append_entry({
        "id": f"system:startup:{datetime.now(timezone.utc).isoformat()}",
        "device": "system",
        "kind": "startup",
        "severity": "info",
        "message": "HashHive backend started",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "read": True,
        "source": "system",
    })
    yield
    task.cancel()
    ws_task.cancel()
    disc_task.cancel()
    fan_task.cancel()
    sched_task.cancel()
    dd_task.cancel()
    db_task.cancel()
    for t in (task, ws_task, disc_task, fan_task, sched_task, dd_task, db_task):
        try:
            await t
        except asyncio.CancelledError:
            pass


app = FastAPI(title="HashHive", version=APP_VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────────

app.include_router(_auth_router.router)
app.include_router(_settings_router.router)
app.include_router(_lottominer_router.router)
app.include_router(_axeos_router.router)
app.include_router(_dashboard_router.router)
app.include_router(_alerts_router.router)
app.include_router(_notifications_router.router)
app.include_router(_groups_router.router)
app.include_router(_schedules_router.router)
app.include_router(_wallets_router.router)
app.include_router(_stats_router.router)
app.include_router(_health_router.router)
app.include_router(_updates_router.router)
app.include_router(_discovery_router.router)
app.include_router(_pools_router.router)
app.include_router(_templates_router.router)
app.include_router(_probability_router.router)
app.include_router(_analytics_router.router)
app.include_router(_discord_dashboard_router.router)

# ── Static assets ──────────────────────────────────────────────────────────────

_vite_assets = FRONTEND_DIR / "dist" / "assets"
if _vite_assets.exists():
    app.mount("/assets", StaticFiles(directory=str(_vite_assets)), name="vite-assets")

# ── Middleware ─────────────────────────────────────────────────────────────────


@app.middleware("http")
async def _security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "connect-src 'self' wss: ws:; "
        "font-src 'self' data:; "
        "object-src 'none'; "
        "base-uri 'self';",
    )
    return response


@app.middleware("http")
async def _auth_middleware(request: Request, call_next):
    """Block API access for unauthenticated requests when auth is enabled.
    The frontend itself is always served (it renders its own login modal)."""
    path = request.url.path
    # Always allow: auth endpoints, static assets, frontend
    open_paths = {"/api/auth/login", "/api/auth/check", "/api/auth/logout"}
    if path in open_paths or not path.startswith("/api/"):
        return await call_next(request)
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    if not config.get("auth", {}).get("enabled"):
        return await call_next(request)
    if _session_valid(request):
        return await call_next(request)
    return JSONResponse({"detail": "Not authenticated"}, status_code=401)


# ── Special routes ─────────────────────────────────────────────────────────────

@app.get("/manifest.json", include_in_schema=False)
async def pwa_manifest():
    return {
        "name": "HashHive",
        "short_name": "HashHive",
        "description": "Unified Bitcoin mining dashboard",
        "display": "standalone",
        "start_url": "/",
        "theme_color": "#0f0f13",
        "background_color": "#0f0f13",
        "icons": [
            {"src": "/android-chrome-192x192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/android-chrome-512x512.png", "sizes": "512x512", "type": "image/png"},
        ],
    }


_FAVICON_FILES = {
    "favicon.ico": "image/x-icon",
    "favicon.svg": "image/svg+xml",
    "favicon-16x16.png": "image/png",
    "favicon-32x32.png": "image/png",
    "apple-touch-icon.png": "image/png",
    "android-chrome-192x192.png": "image/png",
    "android-chrome-512x512.png": "image/png",
}


@app.get("/favicon.ico", include_in_schema=False)
@app.get("/favicon.svg", include_in_schema=False)
@app.get("/favicon-16x16.png", include_in_schema=False)
@app.get("/favicon-32x32.png", include_in_schema=False)
@app.get("/apple-touch-icon.png", include_in_schema=False)
@app.get("/android-chrome-192x192.png", include_in_schema=False)
@app.get("/android-chrome-512x512.png", include_in_schema=False)
async def serve_favicon(request: Request):
    filename = request.url.path.lstrip("/")
    f = FRONTEND_DIR / "dist" / filename
    if f.exists():
        return FileResponse(str(f), media_type=_FAVICON_FILES.get(filename, "image/png"))
    raise HTTPException(status_code=404)


def _get_index() -> "object | None":
    vite = FRONTEND_DIR / "dist" / "index.html"
    return vite if vite.exists() else None


@app.get("/", include_in_schema=False)
async def root():
    index = _get_index()
    if index:
        return FileResponse(str(index))
    return JSONResponse({"status": "HashHive API running. Frontend not found."})


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    if config.get("auth", {}).get("enabled") and not _session_valid(ws):
        await ws.close(1008)  # Policy Violation — reject before accepting
        return
    await _ws_manager.connect(ws)
    try:
        # Send current data immediately on connect so the client doesn't wait
        config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
        master = config.get("lottominer_master", "")
        nm_devices = config.get("lottominer_devices", [])
        axeos_devices = config.get("axeos_devices", [])
        has_nmminer = bool(master or nm_devices)
        async with httpx.AsyncClient(timeout=10) as client:
            coros = []
            if has_nmminer:
                coros.append(_fetch_lottominer_safe(client, master, nm_devices))
            coros += [_fetch_axeos_device(client, d) for d in axeos_devices]
            results = await asyncio.gather(*coros) if coros else []
        nmminer_data = results[0] if (has_nmminer and results) else {"devices": []}
        axeos_results = list(results[1:]) if has_nmminer else list(results)
        axeos_data = {"devices": axeos_results}
        today_entries = _read_day(_today())
        unread = sum(1 for a in today_entries if not a.get("read", False))
        await ws.send_text(json.dumps({
            "type": "dashboard",
            "lottominer": nmminer_data,
            "axeos": axeos_data,
            "unread_alerts": unread,
            "config": config,
        }))
        # Keep alive — wait for client to close
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        _ws_manager.disconnect(ws)


# ── SPA catch-all (must be registered LAST so it never shadows API routes) ────

@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    """Serve the React SPA for all non-API client-side routes."""
    if full_path.startswith(("api/", "ws", "assets/")):
        raise HTTPException(status_code=404)
    index = _get_index()
    if index:
        return FileResponse(str(index))
    raise HTTPException(status_code=404)
