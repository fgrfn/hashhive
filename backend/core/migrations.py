"""One-time legacy migrations run on startup."""

from datetime import datetime

from .config import DEFAULT_CONFIG
from .jsonio import load_json, save_json
from .logs import _read_day, _today, _write_day
from .paths import ALERT_HISTORY_FILE, CONFIG_FILE, LOGS_DIR, MAX_ENTRIES_PER_DAY


def _migrate_config() -> None:
    """Rename legacy NMMiner config keys to the generalized 'lottominer' keys.

    NMMiner support was generalized into a 'Lottominer' category; older configs
    used nmminer_master / nmminer_devices. Migrate them in place once on start so
    existing deployments keep their devices.
    """
    if not CONFIG_FILE.exists():
        return
    try:
        config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
        changed = False
        if "nmminer_master" in config and "lottominer_master" not in config:
            config["lottominer_master"] = config.pop("nmminer_master")
            changed = True
        elif "nmminer_master" in config:
            config.pop("nmminer_master")
            changed = True
        if "nmminer_devices" in config and "lottominer_devices" not in config:
            config["lottominer_devices"] = config.pop("nmminer_devices")
            changed = True
        elif "nmminer_devices" in config:
            config.pop("nmminer_devices")
            changed = True
        if changed:
            save_json(CONFIG_FILE, config)
    except Exception:
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
