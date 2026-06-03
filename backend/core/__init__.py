"""Shared state, constants, helpers and models used across all routers.

This package was split out of a single ``core.py`` for readability. Everything is
re-exported here so existing imports (``from core import X``) keep working
unchanged. New code may import from the focused submodules directly.
"""

from .paths import (
    BASE_DIR,
    DATA_DIR,
    CONFIG_FILE,
    ALERT_HISTORY_FILE,
    DEVICE_STATE_FILE,
    LOGS_DIR,
    STATS_DIR,
    TEMPLATES_DIR,
    DISCOVERY_STATE_FILE,
    RECORDS_FILE,
    DISCORD_DASHBOARD_STATE_FILE,
    FRONTEND_DIR,
    _SESSIONS_FILE,
    MAX_ENTRIES_PER_DAY,
    KEEP_DAYS,
)
from .version import _resolve_version, APP_VERSION
from .state import _startup_time, _price_cache, _low_hr_since, _pool_health, _pool_last_check
from .jsonio import load_json, save_json
from .config import (
    DEFAULT_CONFIG,
    LoginRequest,
    PatchDeviceRequest,
    AxeConfigBatchRequest,
    AxeActionBatchRequest,
    NmActionBatchRequest,
)
from .validation import _validate_device_ip
from .logs import (
    _today,
    _log_file,
    _read_day,
    _write_day,
    _append_entry,
    _cleanup_old_logs,
    _load_recent,
)
from .stats import (
    _stats_file,
    _dev_stats_file,
    _bestdiff_file,
    _append_bestdiff_samples,
    _append_device_samples,
    _append_hashrate_sample,
    sane_ghs,
    _cleanup_old_stats,
    _cleanup_old_stats_dir,
    _load_records,
    _update_records,
)
from .auth import (
    _sessions,
    _SESSION_TTL,
    _login_attempts,
    _MAX_ATTEMPTS,
    _ATTEMPT_WINDOW,
    _hash_pw,
    _verify_pw,
    _session_valid,
    _rate_limited,
    _record_attempt,
    _load_sessions,
    _persist_sessions,
    _bootstrap_auth,
)
from .ws import _WSManager, _ws_manager
from .migrations import _migrate_config, _migrate_legacy
from .autorestart import _check_auto_restart

__all__ = [
    "BASE_DIR", "DATA_DIR", "CONFIG_FILE", "ALERT_HISTORY_FILE", "DEVICE_STATE_FILE",
    "LOGS_DIR", "STATS_DIR", "TEMPLATES_DIR", "DISCOVERY_STATE_FILE", "RECORDS_FILE",
    "DISCORD_DASHBOARD_STATE_FILE", "FRONTEND_DIR",
    "_SESSIONS_FILE", "MAX_ENTRIES_PER_DAY", "KEEP_DAYS",
    "_resolve_version", "APP_VERSION",
    "_startup_time", "_price_cache", "_low_hr_since", "_pool_health", "_pool_last_check",
    "load_json", "save_json",
    "DEFAULT_CONFIG", "LoginRequest", "PatchDeviceRequest", "AxeConfigBatchRequest",
    "AxeActionBatchRequest", "NmActionBatchRequest",
    "_validate_device_ip",
    "_today", "_log_file", "_read_day", "_write_day", "_append_entry",
    "_cleanup_old_logs", "_load_recent",
    "_stats_file", "_dev_stats_file", "_bestdiff_file", "_append_bestdiff_samples",
    "_append_device_samples", "_append_hashrate_sample", "sane_ghs", "_cleanup_old_stats",
    "_cleanup_old_stats_dir", "_load_records", "_update_records",
    "_sessions", "_SESSION_TTL", "_login_attempts", "_MAX_ATTEMPTS", "_ATTEMPT_WINDOW",
    "_hash_pw", "_verify_pw", "_session_valid", "_rate_limited", "_record_attempt",
    "_load_sessions", "_persist_sessions", "_bootstrap_auth",
    "_WSManager", "_ws_manager",
    "_migrate_config", "_migrate_legacy",
    "_check_auto_restart",
]
