import json
import asyncio
import ipaddress
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from alerts import check_alerts

BASE_DIR = Path(__file__).parent
# Daten-Verzeichnis: per Env-Variable überschreibbar (z.B. Docker-Volume)
DATA_DIR = Path(os.environ.get("HASHHIVE_DATA_DIR", BASE_DIR))
CONFIG_FILE = DATA_DIR / "dashboard_config.json"
ALERT_HISTORY_FILE = DATA_DIR / "alert_history.json"  # legacy – migrated on first start
DEVICE_STATE_FILE = DATA_DIR / "device_state.json"
LOGS_DIR = DATA_DIR / "logs"
STATS_DIR = DATA_DIR / "stats"
FRONTEND_DIR = BASE_DIR.parent / "frontend"

# App-Version aus version.txt (Single Source of Truth; liegt im Projekt-Root)
try:
    APP_VERSION = (BASE_DIR.parent / "version.txt").read_text().strip()
except Exception:
    APP_VERSION = "dev"

MAX_ENTRIES_PER_DAY = 1000
KEEP_DAYS = 30

_startup_time = datetime.now(timezone.utc)


def _validate_device_ip(ip: str) -> str:
    """Validate that ip is a valid IP address (no hostname/URL injection).
    Raises HTTPException 400 for invalid values, 403 for non-private addresses."""
    ip = ip.strip()
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid IP address: {ip!r}")
    if not (addr.is_private or addr.is_loopback or addr.is_link_local):
        raise HTTPException(status_code=403, detail=f"Only private/local IP addresses are allowed: {ip}")
    return ip


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _log_file(date_str: str) -> Path:
    return LOGS_DIR / f"{date_str}.json"


def _read_day(date_str: str) -> list:
    return load_json(_log_file(date_str), [])


def _write_day(date_str: str, entries: list) -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    save_json(_log_file(date_str), entries)


def _append_entry(record: dict) -> None:
    """Append one record to today's log file and enforce MAX_ENTRIES_PER_DAY."""
    date_str = _today()
    entries = _read_day(date_str)
    entries.insert(0, record)
    if len(entries) > MAX_ENTRIES_PER_DAY:
        entries = entries[:MAX_ENTRIES_PER_DAY]
    _write_day(date_str, entries)


def _cleanup_old_logs() -> None:
    """Delete log files older than KEEP_DAYS."""
    if not LOGS_DIR.exists():
        return
    cutoff = datetime.now(timezone.utc) - timedelta(days=KEEP_DAYS)
    for f in LOGS_DIR.glob("*.json"):
        try:
            file_date = datetime.strptime(f.stem, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            if file_date < cutoff:
                f.unlink()
        except ValueError:
            pass


def _load_recent(days: int = 1) -> list:
    """Return entries from the last N days, newest first."""
    result = []
    for i in range(days):
        date_str = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        result.extend(_read_day(date_str))
    return result


# ── Hashrate stats ─────────────────────────────────────────────────────────────

_STATS_SAMPLE_INTERVAL = 60  # seconds between hashrate samples
_last_stats_sample_ts: float = 0.0
_last_dev_sample_ts: float = 0.0


def _stats_file(date_str: str) -> Path:
    return STATS_DIR / f"{date_str}.json"


def _dev_stats_file(date_str: str) -> Path:
    return STATS_DIR / f"dev_{date_str}.json"


def _append_device_samples(devices: list) -> None:
    """Store per-device hashrate samples (max 1 per minute)."""
    global _last_dev_sample_ts
    now_ts = datetime.now(timezone.utc).timestamp()
    if now_ts - _last_dev_sample_ts < _STATS_SAMPLE_INTERVAL:
        return
    _last_dev_sample_ts = now_ts
    STATS_DIR.mkdir(parents=True, exist_ok=True)
    date_str = _today()
    path = _dev_stats_file(date_str)
    data: dict = load_json(path, {})
    now_iso = datetime.now(timezone.utc).isoformat()
    for d in devices:
        ip = d.get("_ip", "")
        if not ip:
            continue
        gh = round(float(d.get("hashRate") or d.get("hashrate") or 0), 4)
        if ip not in data:
            data[ip] = []
        data[ip].append({"ts": now_iso, "gh": gh})
        # Keep last 1440 samples per device
        if len(data[ip]) > 1440:
            data[ip] = data[ip][-1440:]
    save_json(path, data)


def _append_hashrate_sample(gh: float, power_w: float = 0.0, shares_accepted: int = 0) -> None:
    """Write a compact sample to today's stats file (max 1 per minute)."""
    global _last_stats_sample_ts
    now_ts = datetime.now(timezone.utc).timestamp()
    if now_ts - _last_stats_sample_ts < _STATS_SAMPLE_INTERVAL:
        return
    _last_stats_sample_ts = now_ts
    STATS_DIR.mkdir(parents=True, exist_ok=True)
    date_str = _today()
    sf = _stats_file(date_str)
    samples: list = load_json(sf, [])
    samples.append({
        "ts": datetime.now(timezone.utc).isoformat(),
        "gh": round(gh, 4),
        "pwr": round(power_w, 1),
        "shares": shares_accepted,
    })
    # Keep at most 1440 samples/day (one per minute for 24 h)
    if len(samples) > 1440:
        samples = samples[-1440:]
    save_json(sf, samples)


def _cleanup_old_stats() -> None:
    """Delete stats files older than KEEP_DAYS."""
    if not STATS_DIR.exists():
        return
    cutoff = datetime.now(timezone.utc) - timedelta(days=KEEP_DAYS)
    for f in STATS_DIR.glob("*.json"):
        try:
            file_date = datetime.strptime(f.stem, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            if file_date < cutoff:
                f.unlink()
        except ValueError:
            pass


def _migrate_legacy() -> None:
    """Move old alert_history.json into daily log files on first start."""
    if not ALERT_HISTORY_FILE.exists():
        return
    try:
        old = load_json(ALERT_HISTORY_FILE, [])
        if not old:
            return
        # Group by date
        by_day: dict = {}
        for entry in old:
            ts = entry.get("timestamp", "")
            try:
                day = datetime.fromisoformat(ts).strftime("%Y-%m-%d")
            except (ValueError, TypeError):
                day = _today()
            by_day.setdefault(day, []).append(entry)
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        for day, entries in by_day.items():
            existing = _read_day(day)
            merged = entries + existing
            if len(merged) > MAX_ENTRIES_PER_DAY:
                merged = merged[:MAX_ENTRIES_PER_DAY]
            _write_day(day, merged)
        ALERT_HISTORY_FILE.rename(ALERT_HISTORY_FILE.with_suffix(".json.migrated"))
    except Exception:
        pass

DEFAULT_CONFIG: dict = {
    "nmminer_master": "",
    "nmminer_devices": [],
    "axeos_devices": [],
    "refresh_interval": 30,
    "offline_grace_minutes": 2,
    "alert_cooldown_minutes": 30,
    "thresholds": {
        "temp_max": 70,
        "vr_temp_max": 85,
        "hashrate_min": 0,
        "error_rate_max": 2.0,
        "share_rate_min": 80,
    },
    "notifications": {
        "telegram_enabled": False,
        "telegram_token": "",
        "telegram_chat_id": "",
        "discord_enabled": False,
        "discord_webhook": "",
        "gotify_enabled": False,
        "gotify_url": "",
        "gotify_token": "",
    },
    "alert_types": {
        "offline": True,
        "online": True,
        "temp-high": True,
        "vr-temp-high": True,
        "hashrate-low": True,
        "error-rate-high": True,
        "fan-failure": True,
        "pool-lost": True,
        "pool-connected": False,
        "fallback-active": True,
        "fallback-recovered": False,
        "mining-paused": True,
        "device-rebooted": True,
        "new-best-diff": False,
        "block-found": True,
    },
    "weekly_summary": {
        "enabled": False,
        "day": "monday",
        "time": "08:00",
    },
    "pool_presets": [],
    "electricity_kwh_price": 0.0,
    "auto_restart": {
        "enabled": False,
        "threshold_pct": 50,
        "duration_minutes": 10,
    },
}


def load_json(path: Path, default: Any) -> Any:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    save_json(path, default)
    return default


def save_json(path: Path, data: Any) -> None:
    """Atomically write JSON: write to a temp file then rename to avoid corruption on crash."""
    tmp = path.with_suffix(".tmp")
    try:
        tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        tmp.replace(path)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


# ── WebSocket connection manager ──────────────────────────────────────────────

class _WSManager:
    def __init__(self):
        self._clients: set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._clients.add(ws)

    def disconnect(self, ws: WebSocket):
        self._clients.discard(ws)

    async def broadcast(self, payload: str):
        dead: list[WebSocket] = []
        for ws in list(self._clients):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._clients.discard(ws)

    @property
    def count(self) -> int:
        return len(self._clients)


_ws_manager = _WSManager()

# ── Auto-restart state ────────────────────────────────────────────────────────
_low_hr_since: dict[str, float] = {}  # ip → unix timestamp when low hashrate first detected


async def _check_auto_restart(config: dict, axeos_results: list, client: httpx.AsyncClient) -> None:
    """Restart AxeOS devices whose hashrate has been below threshold for too long."""
    ar = config.get("auto_restart", {})
    if not ar.get("enabled"):
        _low_hr_since.clear()
        return
    threshold_pct = float(ar.get("threshold_pct") or 50) / 100.0
    duration_secs = float(ar.get("duration_minutes") or 10) * 60.0
    now = datetime.now(timezone.utc).timestamp()
    for d in axeos_results:
        ip = d.get("_ip", "")
        if not ip or not d.get("_online"):
            _low_hr_since.pop(ip, None)
            continue
        expected = float(d.get("expectedHashrate") or 0)
        actual = float(d.get("hashRate") or 0)
        if expected <= 0:
            _low_hr_since.pop(ip, None)
            continue
        if actual < expected * threshold_pct:
            if ip not in _low_hr_since:
                _low_hr_since[ip] = now
            elif now - _low_hr_since[ip] >= duration_secs:
                # Trigger restart
                try:
                    await client.post(f"http://{ip}/api/system/restart")
                    _append_entry({
                        "id": f"axeos:{ip}:auto-restart:{datetime.now(timezone.utc).isoformat()}",
                        "device": f"axeos:{ip}",
                        "kind": "auto-restart",
                        "severity": "warning",
                        "message": f"Auto-restarted {d.get('_name') or ip}: hashrate {actual:.2f} GH/s < {expected * threshold_pct:.2f} GH/s ({int(threshold_pct*100)}% of {expected:.2f})",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "read": False,
                        "source": "axeos",
                    })
                except Exception:
                    pass
                _low_hr_since.pop(ip, None)
        else:
            _low_hr_since.pop(ip, None)


async def _dashboard_broadcast_loop():
    """Background task: fetch dashboard data and push to all WS clients."""
    while True:
        try:
            config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
            interval = max(5, int(config.get("refresh_interval", 30)))
            if _ws_manager.count > 0:
                # Re-use the same logic as GET /api/dashboard
                master = config.get("nmminer_master", "")
                nm_devices = config.get("nmminer_devices", [])
                axeos_devices = config.get("axeos_devices", [])
                has_nmminer = bool(master or nm_devices)
                async with httpx.AsyncClient(timeout=10) as client:
                    coros = []
                    if has_nmminer:
                        coros.append(_fetch_nmminer_safe(client, master, nm_devices))
                    coros += [_fetch_axeos_device(client, d) for d in axeos_devices]
                    results = await asyncio.gather(*coros) if coros else []
                nmminer_data = results[0] if (has_nmminer and results) else {"devices": []}
                axeos_results = list(results[1:]) if has_nmminer else list(results)
                axeos_data = {"devices": axeos_results}
                try:
                    await check_alerts(config, nmminer_data, axeos_data)
                except Exception:
                    pass
                today_entries = _read_day(_today())
                unread = sum(1 for a in today_entries if not a.get("read", False))
                # ── Compute totals and record a hashrate sample ────────────
                try:
                    total_gh = 0.0
                    total_pwr = 0.0
                    total_shares = 0
                    for d in nmminer_data.get("devices", []):
                        total_gh += float(d.get("GHs5s") or d.get("GHs5") or d.get("GHs1m") or
                                          d.get("GHsav") or d.get("hashrate") or d.get("currentHashrate") or 0)
                        total_shares += int(d.get("Accepted") or d.get("accepted") or d.get("sharesAccepted") or 0)
                    for d in axeos_results:
                        if d.get("_online"):
                            total_gh += float(d.get("hashRate") or d.get("hashrate") or 0)
                            total_pwr += float(d.get("power") or 0)
                            total_shares += int(d.get("sharesAccepted") or 0)
                    _append_hashrate_sample(total_gh, total_pwr, total_shares)
                    _append_device_samples(axeos_results)
                except Exception:
                    pass
                # ── Auto-restart check ─────────────────────────────────────
                try:
                    async with httpx.AsyncClient(timeout=10) as ar_client:
                        await _check_auto_restart(config, axeos_results, ar_client)
                except Exception:
                    pass
                payload = json.dumps({
                    "type": "dashboard",
                    "nmminer": nmminer_data,
                    "axeos": axeos_data,
                    "unread_alerts": unread,
                    "config": config,
                })
                await _ws_manager.broadcast(payload)
        except Exception:
            pass
        await asyncio.sleep(interval)


_WEEKDAY_MAP = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}


async def _send_weekly_summary() -> None:
    """Build and ship the weekly summary via all configured notification channels."""
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    notifications = config.get("notifications", {})
    # Collect last 7 days of alerts
    entries = _load_recent(7)
    total = len(entries)
    by_kind: dict[str, int] = {}
    best_diffs: list[str] = []
    blocks: int = 0
    offline_events: int = 0
    for e in entries:
        kind = e.get("kind", "unknown")
        by_kind[kind] = by_kind.get(kind, 0) + 1
        if kind == "new_best_diff":
            best_diffs.append(e.get("message", ""))
        if kind == "block_found":
            blocks += 1
        if kind == "offline":
            offline_events += 1

    # Fetch live device data to collect current share totals
    shares_accepted: int = 0
    shares_rejected: int = 0
    try:
        master = config.get("nmminer_master", "")
        nm_devices = config.get("nmminer_devices", [])
        axeos_devices = config.get("axeos_devices", [])
        has_nmminer = bool(master or nm_devices)
        async with httpx.AsyncClient(timeout=10) as client:
            coros = []
            if has_nmminer:
                coros.append(_fetch_nmminer_safe(client, master, nm_devices))
            coros += [_fetch_axeos_device(client, d) for d in axeos_devices]
            results = await asyncio.gather(*coros, return_exceptions=True) if coros else []
        nmminer_devices = []
        axeos_results = []
        if has_nmminer and results:
            nm_result = results[0]
            if isinstance(nm_result, dict):
                nmminer_devices = nm_result.get("devices", [])
            axeos_results = list(results[1:])
        else:
            axeos_results = list(results)
        for d in nmminer_devices:
            if isinstance(d, dict):
                acc = d.get("Accepted") or d.get("accepted") or d.get("sharesAccepted") or 0
                rej = d.get("Rejected") or d.get("rejected") or d.get("sharesRejected") or 0
                try:
                    shares_accepted += int(acc)
                    shares_rejected += int(rej)
                except (TypeError, ValueError):
                    pass
        for d in axeos_results:
            if isinstance(d, dict) and d.get("_online"):
                try:
                    shares_accepted += int(d.get("sharesAccepted") or 0)
                    shares_rejected += int(d.get("sharesRejected") or 0)
                except (TypeError, ValueError):
                    pass
    except Exception:
        pass

    shares_total = shares_accepted + shares_rejected
    share_acc_pct = f"{shares_accepted / shares_total * 100:.1f}%" if shares_total > 0 else "–"

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    nm_count = len(config.get("nmminer_devices", []))
    ax_count = len(config.get("axeos_devices", []))

    # ── Telegram ─────────────────────────────────────────────────────────────
    if notifications.get("telegram_enabled") and notifications.get("telegram_token") and notifications.get("telegram_chat_id"):
        lines = [
            "📊 <b>HashHive Weekly Summary</b>",
            f"<i>{now}</i>",
            "",
            f"📦 Devices: {nm_count} NMMiner · {ax_count} AxeOS",
            f"📋 Total events (7 days): {total}",
            f"✅ Shares accepted: {shares_accepted:,}",
            f"❌ Shares rejected: {shares_rejected:,}",
            f"📈 Share acceptance rate: {share_acc_pct}",
        ]
        if offline_events:
            lines.append(f"⚠️ Offline events: {offline_events}")
        if blocks:
            lines.append(f"🏆 Block(s) found: {blocks}")
        if by_kind:
            lines.append("")
            lines.append("Events by type:")
            for k, c in sorted(by_kind.items(), key=lambda x: -x[1]):
                lines.append(f"  • {k.replace('_', ' ').title()}: {c}")
        text = "\n".join(lines)
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                await client.post(
                    f"https://api.telegram.org/bot{notifications['telegram_token']}/sendMessage",
                    json={"chat_id": notifications["telegram_chat_id"], "text": text, "parse_mode": "HTML"},
                )
        except Exception:
            pass

    # ── Discord ───────────────────────────────────────────────────────────────
    if notifications.get("discord_enabled") and notifications.get("discord_webhook"):
        breakdown = "\n".join(f"{k.replace('_', ' ').title()}: **{c}**" for k, c in sorted(by_kind.items(), key=lambda x: -x[1])) or "No events"
        embed = {
            "title": "📊 HashHive Weekly Summary",
            "color": 0x7C3AED,
            "fields": [
                {"name": "Devices", "value": f"{nm_count} NMMiner · {ax_count} AxeOS", "inline": True},
                {"name": "Total Events (7 days)", "value": str(total), "inline": True},
                {"name": "Shares Accepted", "value": f"{shares_accepted:,}", "inline": True},
                {"name": "Shares Rejected", "value": f"{shares_rejected:,}", "inline": True},
                {"name": "Share Acceptance Rate", "value": share_acc_pct, "inline": True},
                {"name": "Offline Events", "value": str(offline_events), "inline": True},
                {"name": "Blocks Found", "value": str(blocks), "inline": True},
                {"name": "Event Breakdown", "value": breakdown[:1000], "inline": False},
            ],
            "footer": {"text": "HashHive"},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                await client.post(notifications["discord_webhook"], json={"embeds": [embed]})
        except Exception:
            pass

    # ── Gotify ────────────────────────────────────────────────────────────────
    if notifications.get("gotify_enabled") and notifications.get("gotify_url") and notifications.get("gotify_token"):
        body = f"Period: last 7 days | Events: {total} | Shares: {shares_accepted:,} accepted / {shares_rejected:,} rejected ({share_acc_pct}) | Offline: {offline_events} | Blocks found: {blocks}"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                await client.post(
                    f"{notifications['gotify_url'].rstrip('/')}/message",
                    headers={"X-Gotify-Key": notifications["gotify_token"]},
                    json={"title": "HashHive Weekly Summary", "message": body, "priority": 3},
                )
        except Exception:
            pass


async def _weekly_summary_loop() -> None:
    """Background task: send weekly summary at the configured day+time (UTC)."""
    last_sent_week: int = -1  # ISO calendar week number of last send
    while True:
        try:
            config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
            ws = config.get("weekly_summary", {})
            if ws.get("enabled"):
                now = datetime.now(timezone.utc)
                target_weekday = _WEEKDAY_MAP.get(ws.get("day", "monday").lower(), 0)
                try:
                    th, tm = (int(x) for x in ws.get("time", "08:00").split(":"))
                except ValueError:
                    th, tm = 8, 0
                iso_week = now.isocalendar()[1]
                if (
                    now.weekday() == target_weekday
                    and now.hour == th
                    and now.minute == tm
                    and iso_week != last_sent_week
                ):
                    last_sent_week = iso_week
                    asyncio.create_task(_send_weekly_summary())
        except Exception:
            pass
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    STATS_DIR.mkdir(parents=True, exist_ok=True)
    load_json(CONFIG_FILE, DEFAULT_CONFIG)
    load_json(DEVICE_STATE_FILE, {})
    _migrate_legacy()
    _cleanup_old_logs()
    _cleanup_old_stats()
    task = asyncio.create_task(_dashboard_broadcast_loop())
    ws_task = asyncio.create_task(_weekly_summary_loop())
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
    for t in (task, ws_task):
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
    "favicon-16x16.png": "image/png",
    "favicon-32x32.png": "image/png",
    "apple-touch-icon.png": "image/png",
    "android-chrome-192x192.png": "image/png",
    "android-chrome-512x512.png": "image/png",
}


@app.get("/favicon.ico", include_in_schema=False)
@app.get("/favicon-16x16.png", include_in_schema=False)
@app.get("/favicon-32x32.png", include_in_schema=False)
@app.get("/apple-touch-icon.png", include_in_schema=False)
@app.get("/android-chrome-192x192.png", include_in_schema=False)
@app.get("/android-chrome-512x512.png", include_in_schema=False)
async def serve_favicon(request: Request):
    filename = request.url.path.lstrip("/")
    f = FRONTEND_DIR / filename
    if f.exists():
        return FileResponse(str(f), media_type=_FAVICON_FILES.get(filename, "image/png"))
    raise HTTPException(status_code=404)


@app.get("/", include_in_schema=False)
async def root():
    index = FRONTEND_DIR / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return JSONResponse({"status": "HashHive API running. Frontend not found."})


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await _ws_manager.connect(ws)
    try:
        # Send current data immediately on connect so the client doesn't wait
        config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
        master = config.get("nmminer_master", "")
        nm_devices = config.get("nmminer_devices", [])
        axeos_devices = config.get("axeos_devices", [])
        has_nmminer = bool(master or nm_devices)
        async with httpx.AsyncClient(timeout=10) as client:
            coros = []
            if has_nmminer:
                coros.append(_fetch_nmminer_safe(client, master, nm_devices))
            coros += [_fetch_axeos_device(client, d) for d in axeos_devices]
            results = await asyncio.gather(*coros) if coros else []
        nmminer_data = results[0] if (has_nmminer and results) else {"devices": []}
        axeos_results = list(results[1:]) if has_nmminer else list(results)
        axeos_data = {"devices": axeos_results}
        today_entries = _read_day(_today())
        unread = sum(1 for a in today_entries if not a.get("read", False))
        await ws.send_text(json.dumps({
            "type": "dashboard",
            "nmminer": nmminer_data,
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


# ── Settings ──────────────────────────────────────────────────────────────────

@app.get("/api/settings")
async def get_settings() -> dict:
    return load_json(CONFIG_FILE, DEFAULT_CONFIG)


@app.post("/api/settings")
async def post_settings(data: dict) -> dict:
    # Merge with DEFAULT_CONFIG so new keys added in updates are preserved
    merged = {**DEFAULT_CONFIG, **data}
    merged.setdefault("thresholds", {}).update({k: v for k, v in DEFAULT_CONFIG["thresholds"].items() if k not in data.get("thresholds", {})})
    save_json(CONFIG_FILE, merged)
    now = datetime.now(timezone.utc).isoformat()
    _append_entry({
        "id": f"system:config_saved:{now}",
        "device": "system",
        "kind": "config_saved",
        "severity": "info",
        "message": "Configuration saved",
        "timestamp": now,
        "read": True,
        "source": "system",
    })
    return {"status": "ok"}


@app.get("/api/settings/backup")
async def download_config():
    """Download dashboard_config.json as a file attachment."""
    if not CONFIG_FILE.exists():
        raise HTTPException(status_code=404, detail="No config file found")
    return FileResponse(
        CONFIG_FILE,
        media_type="application/json",
        filename="dashboard_config.json",
        headers={"Content-Disposition": 'attachment; filename="dashboard_config.json"'},
    )


@app.post("/api/settings/restore")
async def restore_config(data: dict) -> dict:
    """Restore dashboard_config.json from uploaded JSON body."""
    # Merge with DEFAULT_CONFIG to ensure all required keys exist
    merged = {**DEFAULT_CONFIG, **data}
    save_json(CONFIG_FILE, merged)
    return {"status": "ok"}


# ── NMMiner ───────────────────────────────────────────────────────────────────

@app.get("/api/nmminer/swarm")
async def get_nmminer_swarm():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    master = config.get("nmminer_master", "")
    # Prefer master (returns aggregated swarm stats in one request)
    if master:
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.get(f"http://{master}/swarm")
                resp.raise_for_status()
                return resp.json()
            except Exception:
                pass  # fall through to per-device queries
    # Fallback: query each known device individually
    devices = config.get("nmminer_devices", [])
    if not devices:
        return {"devices": []}
    results = []
    async with httpx.AsyncClient(timeout=5) as client:
        async def _fetch(ip: str):
            try:
                r = await client.get(f"http://{ip}/swarm")
                r.raise_for_status()
                data = r.json()
                devs = data if isinstance(data, list) else data.get("devices", [data])
                results.extend(devs)
            except Exception:
                results.append({"ip": ip, "online": False})
        await asyncio.gather(*[_fetch(d["ip"]) for d in devices if d.get("ip")])
    return {"devices": results}


@app.get("/api/nmminer/config")
async def get_nmminer_config():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    master = config.get("nmminer_master", "")
    # Prefer master (returns all device configs at once)
    if master:
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.get(f"http://{master}/config")
                resp.raise_for_status()
                return resp.json()
            except Exception:
                pass  # fall through to per-device queries
    # Fallback: query each known device individually
    devices = config.get("nmminer_devices", [])
    if not devices:
        return {"configs": []}
    configs = []
    async with httpx.AsyncClient(timeout=5) as client:
        async def _fetch_cfg(ip: str):
            try:
                r = await client.get(f"http://{ip}/config")
                r.raise_for_status()
                data = r.json()
                entries = data.get("configs", []) if isinstance(data, dict) else []
                for e in entries:
                    if e.get("ip") == ip:
                        configs.append(e)
                        return
                configs.append({"ip": ip, "config": data})
            except Exception:
                pass
        await asyncio.gather(*[_fetch_cfg(d["ip"]) for d in devices if d.get("ip")])
    return {"configs": configs}


@app.get("/api/nmminer/scan")
async def scan_nmminer_devices():
    """Scan the local /24 subnet for NMMiner devices (no master IP required)."""
    import socket as _socket
    try:
        s = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Could not determine local network interface")

    parts = local_ip.split(".")
    subnet = ".".join(parts[:3])

    NM_FIELDS = {"PrimaryPool", "WiFiSSID", "Hostname", "PrimaryAddress"}
    found: list[dict] = []
    sem = asyncio.Semaphore(60)  # max 60 concurrent connections

    limits = httpx.Limits(max_connections=60, max_keepalive_connections=0)
    async with httpx.AsyncClient(timeout=1.5, limits=limits) as client:
        async def _probe(ip: str):
            async with sem:
                # Try /swarm first (master exposes this)
                for path in ("/swarm", "/config"):
                    try:
                        resp = await client.get(f"http://{ip}{path}")
                        if resp.status_code != 200:
                            continue
                        data = resp.json()
                        if path == "/swarm":
                            devs = data if isinstance(data, list) else \
                                   data.get("devices", data.get("miners", data.get("workers", None)))
                            if isinstance(devs, list):
                                found.append({
                                    "ip": ip,
                                    "role": "master",
                                    "device_count": len(devs),
                                    "devices": [
                                        {"ip": d.get("ip", ip), "name": d.get("hostname") or d.get("name") or d.get("ip", ip)}
                                        for d in devs if isinstance(d, dict)
                                    ],
                                })
                                return
                        elif path == "/config":
                            configs = data.get("configs") if isinstance(data, dict) else None
                            if isinstance(configs, list):
                                found.append({
                                    "ip": ip,
                                    "role": "master",
                                    "device_count": len(configs),
                                    "devices": [
                                        {"ip": e.get("ip", ip), "name": (e.get("config") or {}).get("Hostname") or e.get("ip", ip)}
                                        for e in configs if isinstance(e, dict)
                                    ],
                                })
                                return
                            if isinstance(data, dict) and NM_FIELDS & set(data.keys()):
                                found.append({
                                    "ip": ip,
                                    "role": "device",
                                    "device_count": 1,
                                    "devices": [{"ip": ip, "name": data.get("Hostname", ip)}],
                                })
                                return
                    except Exception:
                        pass

        await asyncio.gather(*[_probe(f"{subnet}.{i}") for i in range(1, 255)])

    return {"subnet": f"{subnet}.0/24", "local_ip": local_ip, "found": found}


@app.post("/api/nmminer/broadcast-config")
async def broadcast_nmminer_config(data: dict):
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    master = config.get("nmminer_master", "")
    if not master:
        raise HTTPException(status_code=400, detail="No NMMiner master configured")
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.post(f"http://{master}/broadcast-config", json=data)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))


@app.get("/api/nmminer/device-config")
async def get_nmminer_device_config(ip: str):
    _validate_device_ip(ip)
    # Query device directly — no master needed for individual config reads
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(f"http://{ip}/config")
            resp.raise_for_status()
            data = resp.json()
            # Unwrap {"configs": [{"ip": "...", "config": {...}}, ...]} format
            if isinstance(data, dict) and "configs" in data:
                for entry in data["configs"]:
                    if entry.get("ip") == ip:
                        return entry.get("config", entry)
                # fallback: first entry
                if data["configs"]:
                    first = data["configs"][0]
                    return first.get("config", first)
            return data
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))


@app.post("/api/nmminer/device-config")
async def post_nmminer_device_config(data: dict):
    device_ip = data.get("ip")
    if not device_ip:
        raise HTTPException(status_code=400, detail="ip field required in body")
    _validate_device_ip(device_ip)
    # Push directly to the device — master is only needed for discovery, not for writes
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.post(f"http://{device_ip}/broadcast-config", json=data)
            hostname = data.get("Hostname") or device_ip
            now = datetime.now(timezone.utc).isoformat()
            _append_entry({
                "id": f"nmminer:{device_ip}:config_saved:{now}",
                "device": f"nmminer:{device_ip}",
                "kind": "config_saved",
                "severity": "info",
                "message": f"NMMiner {hostname} config saved",
                "timestamp": now,
                "read": True,
                "source": "nmminer",
            })
            return {"status": resp.status_code, "detail": resp.text[:200]}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))


# ── AxeOS ─────────────────────────────────────────────────────────────────────

async def _fetch_axeos_device(client: httpx.AsyncClient, device: dict) -> dict:
    ip = device.get("ip", "")
    name = device.get("name", ip)
    device_type = device.get("type", "bitaxe")
    temp_max = device.get("temp_max")  # per-device override, may be None
    try:
        resp = await client.get(f"http://{ip}/api/system/info")
        resp.raise_for_status()
        data = resp.json()
        data.update({"_ip": ip, "_name": name, "_type": device_type, "_online": True, "_temp_max": temp_max})
        return data
    except Exception:
        return {"_ip": ip, "_name": name, "_type": device_type, "_online": False, "_temp_max": temp_max}


@app.get("/api/axeos/devices")
async def get_axeos_devices():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    devices = config.get("axeos_devices", [])
    async with httpx.AsyncClient(timeout=10) as client:
        results = await asyncio.gather(*[_fetch_axeos_device(client, d) for d in devices])
    return {"devices": list(results)}


@app.patch("/api/axeos/config/all")
async def patch_axeos_config_all(data: dict):
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    devices = config.get("axeos_devices", [])
    results = []
    async with httpx.AsyncClient(timeout=15) as client:
        for device in devices:
            ip = device.get("ip", "")
            try:
                resp = await client.patch(f"http://{ip}/api/system", json=data)
                results.append({"ip": ip, "status": resp.status_code})
            except Exception as exc:
                results.append({"ip": ip, "error": str(exc)})
    return {"results": results}


@app.get("/api/axeos/info/{ip}")
async def get_axeos_info(ip: str):
    _validate_device_ip(ip)
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    device_cfg = next((d for d in config.get("axeos_devices", []) if d.get("ip") == ip), {})
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"http://{ip}/api/system/info")
        resp.raise_for_status()
        data = resp.json()
        data["_temp_max"] = device_cfg.get("temp_max")
        return data


@app.patch("/api/settings/device")
async def patch_device_settings(data: dict):
    """Update per-device HashHive config overrides (e.g. temp_max)."""
    ip = data.get("ip")
    if not ip:
        raise HTTPException(status_code=400, detail="ip required")
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    updated = False
    for d in config.get("axeos_devices", []):
        if d.get("ip") == ip:
            if "temp_max" in data and data["temp_max"] is not None:
                d["temp_max"] = float(data["temp_max"])
            elif d.get("temp_max") is not None and data.get("temp_max") is None:
                d.pop("temp_max", None)
            if "name" in data and data["name"] is not None:
                d["name"] = str(data["name"]).strip()
            updated = True
            break
    if not updated:
        for d in config.get("nmminer_devices", []):
            if d.get("ip") == ip:
                if "temp_max" in data and data["temp_max"] is not None:
                    d["temp_max"] = float(data["temp_max"])
                elif d.get("temp_max") is not None and data.get("temp_max") is None:
                    d.pop("temp_max", None)
                if "name" in data and data["name"] is not None:
                    d["name"] = str(data["name"]).strip()
                break
    save_json(CONFIG_FILE, config)
    return {"status": "ok"}


@app.get("/api/axeos/config/{ip}")
async def get_axeos_config_one(ip: str):
    """Return only the writeable config fields for a single AxeOS device."""
    _validate_device_ip(ip)
    _CONFIG_FIELDS = {
        "stratumURL", "stratumUser", "stratumPassword", "stratumPort",
        "fallbackStratumURL", "fallbackStratumUser", "fallbackStratumPassword", "fallbackStratumPort",
        "frequency", "coreVoltage", "fanspeed", "autofanspeed", "temptarget",
        "hostname", "ssid",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"http://{ip}/api/system/info")
            resp.raise_for_status()
            data = resp.json()
        return {k: v for k, v in data.items() if k in _CONFIG_FIELDS}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.patch("/api/axeos/config/{ip}")
async def patch_axeos_config_one(ip: str, data: dict):
    _validate_device_ip(ip)
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.patch(f"http://{ip}/api/system", json=data)
    return {"ip": ip, "status": resp.status_code}


@app.post("/api/axeos/action/{ip}")
async def axeos_action(ip: str, action: str = Query(...)):
    """Single-device action: pause | resume | restart | identify"""
    _validate_device_ip(ip)
    valid = {"pause", "resume", "restart", "identify"}
    if action not in valid:
        raise HTTPException(status_code=400, detail=f"action must be one of {valid}")
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.post(f"http://{ip}/api/system/{action}")
            now = datetime.now(timezone.utc).isoformat()
            _append_entry({
                "id": f"axeos:{ip}:{action}:{now}",
                "device": f"axeos:{ip}",
                "kind": f"device_{action}",
                "severity": "warning" if action == "restart" else "info",
                "message": f"{ip}: {action} triggered",
                "timestamp": now,
                "read": True,
                "source": "axeos",
            })
            return {"ip": ip, "action": action, "status": resp.status_code}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))


@app.patch("/api/axeos/config/batch")
async def patch_axeos_config_batch(data: dict):
    """Batch PATCH config (frequency, voltage …) to multiple AxeOS devices.
    Body: {"ips": ["10.0.0.1", ...], "frequency": 490, "coreVoltage": 1200, ...}
    Omit "ips" to target all configured devices."""
    ips: list[str] = data.pop("ips", [])
    if not ips:
        config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
        ips = [d["ip"] for d in config.get("axeos_devices", []) if d.get("ip")]
    if not data:
        raise HTTPException(status_code=400, detail="No config fields to update")
    results: list[dict] = []
    limits = httpx.Limits(max_connections=30, max_keepalive_connections=0)
    async with httpx.AsyncClient(timeout=15, limits=limits) as client:
        async def _patch(ip: str):
            try:
                resp = await client.patch(f"http://{ip}/api/system", json=data)
                results.append({"ip": ip, "status": resp.status_code})
            except Exception as exc:
                results.append({"ip": ip, "error": str(exc)})
        await asyncio.gather(*[_patch(ip) for ip in ips])
    return {"results": results}


@app.post("/api/axeos/action/batch")
async def axeos_action_batch(data: dict):
    """Batch action across multiple AxeOS devices. Body: {action, ips: [...]}"""
    action = data.get("action", "")
    ips: list[str] = data.get("ips", [])
    valid = {"pause", "resume", "restart", "identify"}
    if action not in valid:
        raise HTTPException(status_code=400, detail=f"action must be one of {valid}")
    if not ips:
        # Fall back to all configured devices
        config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
        ips = [d["ip"] for d in config.get("axeos_devices", []) if d.get("ip")]
    results = []
    limits = httpx.Limits(max_connections=30, max_keepalive_connections=0)
    async with httpx.AsyncClient(timeout=15, limits=limits) as client:
        async def _act(ip: str):
            try:
                resp = await client.post(f"http://{ip}/api/system/{action}")
                results.append({"ip": ip, "status": resp.status_code})
            except Exception as exc:
                results.append({"ip": ip, "error": str(exc)})
        await asyncio.gather(*[_act(ip) for ip in ips])
    return {"action": action, "results": results}


@app.get("/api/axeos/scan")
async def scan_axeos_devices():
    """Scan local /24 subnet for AxeOS devices (BitAxe/NerdAxe). No IP required."""
    import socket as _socket
    # Determine local /24 subnet to scan
    subnets: list[str] = []
    try:
        s = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        subnets.append(".".join(local_ip.split(".")[:3]))
    except Exception:
        pass

    if not subnets:
        raise HTTPException(status_code=500, detail="Could not determine any subnet to scan")

    ax_fields = {"hashRate", "ASICModel", "stratumURL", "uptimeSeconds", "boardVersion"}
    found: list[dict] = []
    sem = asyncio.Semaphore(80)
    limits = httpx.Limits(max_connections=80, max_keepalive_connections=0)

    async with httpx.AsyncClient(timeout=1.5, limits=limits) as client:
        async def _probe(ip: str):
            async with sem:
                try:
                    resp = await client.get(f"http://{ip}/api/system/info")
                    if resp.status_code != 200:
                        return
                    data = resp.json()
                    if not (ax_fields & set(data.keys())):
                        return
                    asic = data.get("ASICModel", "")
                    device_type = "nerdaxe" if "nerd" in data.get("hostname", "").lower() or \
                                              "1397" in asic else "bitaxe"
                    found.append({
                        "ip": ip,
                        "name": data.get("hostname", ip),
                        "type": device_type,
                        "asic": asic,
                        "hashrate": data.get("hashRate", 0),
                        "temp": data.get("temp", 0),
                    })
                except Exception:
                    pass

        tasks = []
        for subnet in subnets:
            tasks += [_probe(f"{subnet}.{i}") for i in range(1, 255)]
        await asyncio.gather(*tasks)

    return {
        "subnets": subnets,
        "local_ip": local_ip,
        "found": sorted(found, key=lambda x: [int(p) for p in x["ip"].split(".")] if x["ip"].replace(".","").isdigit() else [999]),
    }


# ── Dashboard ─────────────────────────────────────────────────────────────────

async def _fetch_nmminer_safe(
    client: httpx.AsyncClient,
    master: str,
    nm_devices: list | None = None,
) -> dict:
    def _normalize(data) -> dict | None:
        if isinstance(data, list):
            return {"devices": data}
        if isinstance(data, dict):
            if "devices" in data and isinstance(data["devices"], list):
                return data
            for key in ("miners", "workers", "peers", "swarm", "data"):
                if key in data and isinstance(data[key], list):
                    return {"devices": data[key]}
            values = list(data.values())
            if values and isinstance(values[0], dict) and any(
                k in values[0] for k in ("ip", "hashrate", "GHs", "temp", "pool")
            ):
                return {"devices": [{"ip": k, **v} for k, v in data.items() if isinstance(v, dict)]}
        return None

    # Try master first (one request for all devices)
    if master:
        try:
            resp = await client.get(f"http://{master}/swarm")
            resp.raise_for_status()
            result = _normalize(resp.json())
            if result is not None:
                # Enrich with per-device config overrides by IP
                if nm_devices:
                    cfg_by_ip = {d["ip"]: d for d in nm_devices if d.get("ip")}
                    for dev in result.get("devices", []):
                        ip = dev.get("ip", "")
                        if ip in cfg_by_ip:
                            dev["_temp_max"] = cfg_by_ip[ip].get("temp_max")
                return result
        except Exception:
            pass  # fall through to per-device queries

    # Fallback: query each known device individually
    if nm_devices:
        all_devs: list = []
        cfg_by_ip = {d["ip"]: d for d in nm_devices if d.get("ip")}

        async def _fetch_one(ip: str):
            try:
                r = await client.get(f"http://{ip}/swarm")
                r.raise_for_status()
                data = r.json()
                devs = data if isinstance(data, list) else data.get("devices", [data])
                devs = devs if isinstance(devs, list) else [devs]
                for dev in devs:
                    dev["_temp_max"] = cfg_by_ip.get(ip, {}).get("temp_max")
                all_devs.extend(devs)
            except Exception:
                all_devs.append({"ip": ip, "online": False, "_temp_max": cfg_by_ip.get(ip, {}).get("temp_max")})

        await asyncio.gather(*[_fetch_one(d["ip"]) for d in nm_devices if d.get("ip")])
        return {"devices": all_devs}

    return {"devices": [], "_error": "no NMMiner configured"}


@app.get("/api/dashboard")
async def get_dashboard():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    master = config.get("nmminer_master", "")
    nm_devices = config.get("nmminer_devices", [])
    axeos_devices = config.get("axeos_devices", [])
    has_nmminer = bool(master or nm_devices)

    async with httpx.AsyncClient(timeout=10) as client:
        coros: list = []
        if has_nmminer:
            coros.append(_fetch_nmminer_safe(client, master, nm_devices))
        coros += [_fetch_axeos_device(client, d) for d in axeos_devices]

        results = await asyncio.gather(*coros) if coros else []

    if has_nmminer:
        nmminer_data = results[0] if results else {"devices": []}
        axeos_results = list(results[1:])
    else:
        nmminer_data = {"devices": []}
        axeos_results = list(results)

    axeos_data = {"devices": axeos_results}

    try:
        await check_alerts(config, nmminer_data, axeos_data)
    except Exception:
        pass  # Never let alert checks break the dashboard

    # Annotate offline devices with their offline_since timestamp from device_state
    device_state = load_json(DEVICE_STATE_FILE, {})
    for d in nmminer_data.get("devices", []):
        if not d.get("online", True):
            key = f"nmminer:{d.get('ip', '')}"
            d["_offline_since"] = device_state.get(key, {}).get("offline_since")
    for d in axeos_data.get("devices", []):
        if not d.get("_online", True):
            key = f"axeos:{d.get('_ip', '')}"
            d["_offline_since"] = device_state.get(key, {}).get("offline_since")

    today_entries = _read_day(_today())
    unread = sum(1 for a in today_entries if not a.get("read", False))

    return {
        "nmminer": nmminer_data,
        "axeos": axeos_data,
        "unread_alerts": unread,
        "config": config,
    }


@app.get("/api/health")
async def health():
    uptime = (datetime.now(timezone.utc) - _startup_time).total_seconds()
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    nm_count = len(config.get("nmminer_devices", []))
    ax_count = len(config.get("axeos_devices", []))
    return {
        "status": "ok",
        "version": APP_VERSION,
        "uptime_seconds": round(uptime),
        "devices": {"nmminer": nm_count, "axeos": ax_count},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/stats/hashrate")
async def get_hashrate_stats(days: int = Query(default=1, ge=1, le=30)):
    """Return hashrate samples for the last N days (oldest first for charting)."""
    result: list = []
    for i in range(days - 1, -1, -1):
        date_str = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        result.extend(load_json(_stats_file(date_str), []))
    return result


@app.get("/api/stats/device")
async def get_device_stats(ip: str = Query(...), hours: int = Query(default=1, ge=1, le=24)):
    """Return per-device hashrate samples for the last N hours."""
    _validate_device_ip(ip)
    result: list = []
    now_utc = datetime.now(timezone.utc)
    cutoff = now_utc - timedelta(hours=hours)
    # Scan enough days to cover the requested hours window
    days_needed = min(hours // 24 + 2, 3)
    for i in range(days_needed - 1, -1, -1):
        date_str = (now_utc - timedelta(days=i)).strftime("%Y-%m-%d")
        data: dict = load_json(_dev_stats_file(date_str), {})
        for sample in data.get(ip, []):
            try:
                if datetime.fromisoformat(sample["ts"]) >= cutoff:
                    result.append(sample)
            except Exception:
                pass
    result.sort(key=lambda x: x.get("ts", ""))
    return result


# ── Alerts & Logs ─────────────────────────────────────────────────────────────

@app.get("/api/alerts")
async def get_alerts(days: int = Query(default=1, ge=1, le=30)):
    """Return log entries. days=1 → today only; days=7 → last 7 days."""
    return _load_recent(days)


@app.get("/api/logs/dates")
async def get_log_dates():
    """List available log file dates (newest first)."""
    if not LOGS_DIR.exists():
        return []
    dates = sorted(
        [f.stem for f in LOGS_DIR.glob("*.json") if len(f.stem) == 10],
        reverse=True,
    )
    return dates


@app.post("/api/alerts/read-all")
async def mark_alerts_read():
    date_str = _today()
    entries = _read_day(date_str)
    for entry in entries:
        entry["read"] = True
    _write_day(date_str, entries)
    return {"status": "ok"}


@app.delete("/api/alerts")
async def delete_alerts():
    """Delete today's log file."""
    lf = _log_file(_today())
    if lf.exists():
        lf.unlink()
    return {"status": "ok"}


@app.post("/api/log")
async def post_log_entry(entry: dict):
    """Persist a manual action log entry (pool push, config save, etc.) to today's log file."""
    severity = entry.get("severity", "info")
    message  = entry.get("message", "")
    source   = entry.get("source", "system")
    if not message:
        raise HTTPException(status_code=400, detail="message required")
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "id":        f"log:{source}:{now}",
        "device":    f"log:{source}",
        "kind":      "user_action",
        "severity":  severity,
        "message":   message,
        "timestamp": now,
        "read":      True,   # action logs are pre-read; don't bump unread counter
        "source":    source,
    }
    _append_entry(record)
    return {"status": "ok"}


# ── Notifications ─────────────────────────────────────────────────────────────

@app.post("/api/notifications/test")
async def test_notification():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    notifications = config.get("notifications", {})
    results: dict = {}

    async with httpx.AsyncClient(timeout=10) as client:
        if notifications.get("telegram_enabled") and notifications.get("telegram_token"):
            token = notifications["telegram_token"]
            chat_id = notifications["telegram_chat_id"]
            try:
                resp = await client.post(
                    f"https://api.telegram.org/bot{token}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": "🐝 <b>HashHive</b>\n🟢 <b>[TEST]</b> Test notification — everything is working!",
                        "parse_mode": "HTML",
                    },
                )
                results["telegram"] = resp.status_code == 200
            except Exception:
                results["telegram"] = False

        if notifications.get("discord_enabled") and notifications.get("discord_webhook"):
            webhook = notifications["discord_webhook"]
            try:
                from datetime import datetime, timezone as tz
                resp = await client.post(webhook, json={
                    "username": "HashHive",
                    "embeds": [{
                        "title": "🐝  HashHive Alert",
                        "color": 0x22C55E,
                        "fields": [{
                            "name": "🟢  Connection Test",
                            "value": "`Test notification — everything is working!`",
                            "inline": False,
                        }],
                        "footer": {"text": "HashHive Mining Dashboard"},
                        "timestamp": datetime.now(tz.utc).isoformat(),
                    }],
                })
                results["discord"] = resp.status_code in (200, 204)
            except Exception:
                results["discord"] = False

        if notifications.get("gotify_enabled") and notifications.get("gotify_url"):
            url = notifications["gotify_url"].rstrip("/")
            gotify_token = notifications["gotify_token"]
            try:
                resp = await client.post(
                    f"{url}/message",
                    json={"title": "🐝 HashHive", "message": "🟢 [TEST] Test notification — everything is working!", "priority": 3},
                    headers={"X-Gotify-Key": gotify_token},
                )
                results["gotify"] = resp.status_code == 200
            except Exception:
                results["gotify"] = False

    return {"results": results}


@app.post("/api/weekly-summary/test")
async def test_weekly_summary():
    """Immediately send a weekly summary via all configured notification channels."""
    asyncio.create_task(_send_weekly_summary())
    return {"status": "queued"}
