"""Shared state, constants, helpers, and models used across all routers."""

import hashlib
import ipaddress
import json
import os
import secrets
import subprocess
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

import httpx
from fastapi import HTTPException, WebSocket
from pydantic import BaseModel, field_validator

# ── Path constants ─────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).parent
DATA_DIR = Path(os.environ.get("HASHHIVE_DATA_DIR", BASE_DIR))
CONFIG_FILE = DATA_DIR / "dashboard_config.json"
ALERT_HISTORY_FILE = DATA_DIR / "alert_history.json"  # legacy – migrated on first start
DEVICE_STATE_FILE = DATA_DIR / "device_state.json"
LOGS_DIR = DATA_DIR / "logs"
STATS_DIR = DATA_DIR / "stats"
FRONTEND_DIR = BASE_DIR.parent / "frontend"
_SESSIONS_FILE = DATA_DIR / "sessions.json"

# ── App constants ──────────────────────────────────────────────────────────────

def _resolve_version() -> str:
    # 1. git describe (works for native installs with git history)
    try:
        result = subprocess.run(
            ["git", "describe", "--tags", "--abbrev=0"],
            capture_output=True, text=True, cwd=BASE_DIR.parent, timeout=3,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip().lstrip("v")
    except Exception:
        pass
    # 2. version.txt (written by CI before Docker build)
    try:
        return (BASE_DIR.parent / "version.txt").read_text().strip()
    except Exception:
        pass
    return "dev"


APP_VERSION = _resolve_version()

MAX_ENTRIES_PER_DAY = 1000
KEEP_DAYS = 30

_startup_time = datetime.now(timezone.utc)

# ── Mutable shared state ───────────────────────────────────────────────────────

_sessions: dict[str, float] = {}        # token → expiry unix timestamp
_SESSION_TTL = 86400 * 30               # 30 days

# Brute-force protection: track failed login timestamps per IP
_login_attempts: dict[str, list[float]] = {}
_MAX_ATTEMPTS = 5
_ATTEMPT_WINDOW = 300  # 5-minute sliding window

_price_cache: dict = {"ts": 0.0, "data": {}}

_low_hr_since: dict[str, float] = {}        # AxeOS: ip → ts when low hashrate first seen
_solo_zero_hr_since: dict[str, float] = {}  # NerdMiner/SparkMiner: ip → ts when hr=0 first seen

# ── Hashrate stats cache state ─────────────────────────────────────────────────

_STATS_SAMPLE_INTERVAL = 60  # seconds between hashrate samples
_last_stats_sample_ts: float = 0.0
_last_dev_sample_ts: float = 0.0
_last_bestdiff_sample_ts: float = 0.0

# ── Default config ─────────────────────────────────────────────────────────────

DEFAULT_CONFIG: dict = {
    "nmminer_master": "",
    "nmminer_devices": [],
    "nerdminer_devices": [],
    "sparkminer_devices": [],
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
        "rssi_min": -75,
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
        "ntfy_enabled": False,
        "ntfy_url": "https://ntfy.sh",
        "ntfy_topic": "",
        "ntfy_token": "",
        "pushover_enabled": False,
        "pushover_user_key": "",
        "pushover_app_token": "",
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
        "rssi-low": True,
    },
    "weekly_summary": {
        "enabled": False,
        "day": "monday",
        "time": "08:00",
    },
    "pool_presets": [],
    "groups": [],
    "schedules": [],
    "wallets": [],
    "electricity_kwh_price": 0.0,
    "auto_restart": {
        "enabled": False,
        "threshold_pct": 50,
        "duration_minutes": 10,
    },
    "auto_restart_solo": {
        "enabled": False,
        "zero_hr_minutes": 10,
    },
    "market": {
        "enabled": True,
        "coin_id": "bitcoin",
        "currency": "eur",
    },
    "auth": {
        "enabled": False,
        "password_hash": "",
    },
}

# ── Request models ─────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    password: str

    @field_validator("password")
    @classmethod
    def password_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("password required")
        return v


class PatchDeviceRequest(BaseModel):
    ip: str
    name: str | None = None
    temp_max: float | None = None


class AxeConfigBatchRequest(BaseModel):
    ips: list[str]
    frequency: int | None = None
    coreVoltage: int | None = None


class AxeActionBatchRequest(BaseModel):
    ips: list[str]
    action: str


# ── JSON helpers ───────────────────────────────────────────────────────────────

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


# ── Validation helpers ─────────────────────────────────────────────────────────

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


# ── Date/time helpers ──────────────────────────────────────────────────────────

def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


# ── Log file helpers ───────────────────────────────────────────────────────────

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


# ── Stats file helpers ─────────────────────────────────────────────────────────

def _stats_file(date_str: str) -> Path:
    return STATS_DIR / f"{date_str}.json"


def _dev_stats_file(date_str: str) -> Path:
    return STATS_DIR / f"dev_{date_str}.json"


def _bestdiff_file(date_str: str) -> Path:
    return STATS_DIR / f"bestdiff_{date_str}.json"


def _append_bestdiff_samples(all_devices: list) -> None:
    """Store per-device best-diff samples (max 1 per minute).
    all_devices: list of dicts with keys _ip/_name and bestDiff/best_diff/bestShare.
    """
    global _last_bestdiff_sample_ts
    now_ts = datetime.now(timezone.utc).timestamp()
    if now_ts - _last_bestdiff_sample_ts < _STATS_SAMPLE_INTERVAL:
        return
    _last_bestdiff_sample_ts = now_ts
    STATS_DIR.mkdir(parents=True, exist_ok=True)
    date_str = _today()
    path = _bestdiff_file(date_str)
    data: dict = load_json(path, {})
    now_iso = datetime.now(timezone.utc).isoformat()
    for d in all_devices:
        ip = d.get("_ip") or d.get("ip", "")
        if not ip:
            continue
        raw = d.get("bestDiff") or d.get("best_diff") or d.get("bestShare") or d.get("best_share")
        if raw is None:
            continue
        try:
            val = float(raw)
        except (TypeError, ValueError):
            continue
        name = d.get("_name") or d.get("hostname") or d.get("name") or ip
        if ip not in data:
            data[ip] = {"name": name, "samples": []}
        data[ip]["name"] = name  # refresh name
        data[ip]["samples"].append({"ts": now_iso, "diff": val})
        if len(data[ip]["samples"]) > 1440:
            data[ip]["samples"] = data[ip]["samples"][-1440:]
    save_json(path, data)


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


def _cleanup_old_stats_dir() -> None:
    """Alias kept for backward compatibility."""
    _cleanup_old_stats()


# ── Legacy migration ───────────────────────────────────────────────────────────

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


# ── Auth helpers ───────────────────────────────────────────────────────────────

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
    """Load persisted sessions from disk, pruning expired ones."""
    global _sessions
    now = time.time()
    try:
        data = load_json(_SESSIONS_FILE, {})
        _sessions = {k: v for k, v in data.items() if isinstance(v, (int, float)) and v > now}
    except Exception:
        _sessions = {}


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


# ── WebSocket connection manager ───────────────────────────────────────────────

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


# ── Auto-restart helpers ───────────────────────────────────────────────────────

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


async def _check_auto_restart_solo(
    config: dict,
    nerdminer: list,
    sparkminer: list,
    client: httpx.AsyncClient,
) -> None:
    """Restart NerdMiner/SparkMiner devices whose hashrate has been 0 for too long."""
    ar = config.get("auto_restart_solo", {})
    if not ar.get("enabled"):
        _solo_zero_hr_since.clear()
        return
    duration_secs = float(ar.get("zero_hr_minutes") or 10) * 60.0
    now = time.time()
    for dev in nerdminer + sparkminer:
        ip = dev.get("_ip") or dev.get("ip") or ""
        if not ip or not dev.get("_online"):
            _solo_zero_hr_since.pop(ip, None)
            continue
        # Parse hashrate string like "1.03 MH/s" or numeric 0
        hr_raw = dev.get("hashRate") or dev.get("hashrate") or 0
        try:
            hr = float(str(hr_raw).split()[0])
        except Exception:
            hr = 0.0
        if hr > 0:
            _solo_zero_hr_since.pop(ip, None)
            continue
        if ip not in _solo_zero_hr_since:
            _solo_zero_hr_since[ip] = now
            continue
        if now - _solo_zero_hr_since[ip] >= duration_secs:
            name = dev.get("hostname") or dev.get("minerName") or dev.get("_name") or ip
            restarted = False
            for path in ("/restart", "/api/restart", "/reboot"):
                try:
                    resp = await client.post(f"http://{ip}{path}", timeout=5)
                    if resp.status_code < 400:
                        restarted = True
                        break
                except Exception:
                    continue
            if restarted:
                _append_entry({
                    "id": f"solo:{ip}:auto-restart:{datetime.now(timezone.utc).isoformat()}",
                    "device": f"solo:{ip}",
                    "kind": "auto-restart",
                    "severity": "warning",
                    "message": f"Auto-restarted {name} ({ip}): hashrate=0 for >{ar.get('zero_hr_minutes',10)} min",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "read": False,
                    "source": "nmminer",
                })
                _solo_zero_hr_since.pop(ip, None)
