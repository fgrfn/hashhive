"""Default configuration, public projections, and request/response models."""

import copy
from typing import Any

from pydantic import BaseModel, field_validator

DEFAULT_CONFIG: dict = {
    "lottominer_devices": [],
    "wroomminer_devices": [],
    "axehub_devices": [],
    "axeos_devices": [],
    "refresh_interval": 30,
    "offline_grace_minutes": 2,
    "alert_cooldown_minutes": 30,
    "alert_transition_checks": 2,
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
        "pool-unreachable": True,
        "pool-reachable": False,
    },
    # Temporary per-alert-type mute: { "<kind>": "<iso-until>" }. Past entries
    # are treated as expired (ignored). Set via the Alerts → Rules snooze control.
    "alert_snooze": {},
    "weekly_summary": {
        "enabled": False,
        "day": "monday",
        "time": "08:00",
    },
    "discord_dashboard": {
        "enabled": False,
        "webhook": "",            # optional; falls back to notifications.discord_webhook
        "interval_seconds": 60,
    },
    "discord_bot": {
        "enabled": False,
        "token": "",              # Discord bot token (Gateway connection)
        "prefix": "!",            # command prefix
        "channel_id": "",         # optional: only respond in this channel (blank = any)
    },
    "pool_presets": [],
    "pool_health": {
        "failure_checks": 2,
        "recovery_checks": 2,
    },
    "groups": [],
    "schedules": [],
    "wallets": [],
    "electricity_kwh_price": 0.0,
    "auto_restart": {
        "enabled": False,
        "threshold_pct": 50,
        "duration_minutes": 10,
    },
    "discovery": {
        "auto_scan": False,
        "interval_minutes": 30,
        "auto_add": False,
        "notify": True,
    },
    "auto_fan": {
        "enabled": False,
        "target_temp": 60,
        "min_pct": 30,
        "max_pct": 100,
        "kp": 4.0,
        "ki": 0.1,
        "kd": 1.0,
        "interval_seconds": 15,
    },
    "market": {
        "enabled": True,
        "coins": ["bitcoin"],   # CoinGecko ids shown in the top-bar price ticker
        "currency": "usd",
    },
    "auth": {
        "enabled": False,
        "password_hash": "",
    },
}


# Values returned to the browser use a stable sentinel instead of exposing
# notification credentials. Saving that sentinel means "keep the stored value",
# so an unrelated autosave never destroys a configured secret.
SECRET_MASK = "••••••••"
_SECRET_PATHS: tuple[tuple[str, ...], ...] = (
    ("notifications", "telegram_token"),
    ("notifications", "discord_webhook"),
    ("notifications", "gotify_token"),
    ("notifications", "ntfy_token"),
    ("notifications", "pushover_user_key"),
    ("notifications", "pushover_app_token"),
    ("discord_dashboard", "webhook"),
    ("discord_bot", "token"),
)


def _deep_merge(base: dict, patch: dict) -> dict:
    """Recursively merge mappings; lists and scalars replace prior values."""
    out = copy.deepcopy(base)
    for key, value in patch.items():
        if value == SECRET_MASK:
            continue
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = copy.deepcopy(value)
    return out


def merge_config(current: dict, patch: dict) -> dict:
    """Apply a partial settings patch without dropping existing/new defaults."""
    with_defaults = _deep_merge(DEFAULT_CONFIG, current if isinstance(current, dict) else {})
    return _deep_merge(with_defaults, patch if isinstance(patch, dict) else {})


def public_config(config: dict) -> dict:
    """Return a browser-safe copy of the persisted configuration."""
    # Project onto current defaults so older installations receive newly added
    # settings immediately, even before they save anything after an upgrade.
    result: dict[str, Any] = merge_config({}, config)
    auth = result.get("auth", {})
    if isinstance(auth, dict):
        auth.pop("password_hash", None)
    # Pool presets are fetched through their dedicated endpoint when needed.
    # Omitting them here prevents credentials from being repeated in every
    # dashboard response and WebSocket broadcast.
    result.pop("pool_presets", None)
    for path in _SECRET_PATHS:
        node: Any = result
        for part in path[:-1]:
            if not isinstance(node, dict):
                node = None
                break
            node = node.get(part)
        if isinstance(node, dict) and node.get(path[-1]):
            node[path[-1]] = SECRET_MASK
    return result


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
    fanspeed: int | None = None
    autofanspeed: int | None = None
    temptarget: int | None = None


class AxeActionBatchRequest(BaseModel):
    ips: list[str]
    action: str


class NmActionBatchRequest(BaseModel):
    ips: list[str]
    action: str
