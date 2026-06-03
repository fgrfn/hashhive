"""Default configuration and request/response models."""

from pydantic import BaseModel, field_validator

DEFAULT_CONFIG: dict = {
    "lottominer_master": "",
    "lottominer_devices": [],
    "axehub_devices": [],
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
        "coin_id": "bitcoin",
        "currency": "eur",
    },
    "auth": {
        "enabled": False,
        "password_hash": "",
    },
}


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
