"""One-time legacy migrations run on startup."""

from datetime import datetime

from .config import DEFAULT_CONFIG
from .jsonio import load_json, save_json
from .logs import _read_day, _today, _write_day
from .paths import ALERT_HISTORY_FILE, CONFIG_FILE, LOGS_DIR, MAX_ENTRIES_PER_DAY


def _migrate_config() -> None:
    """Migrate legacy NMMiner/Lottominer config keys.

    NMMiner support was generalized into a 'Lottominer' category; older configs
    used nmminer_master / nmminer_devices, later lottominer_master. The dedicated
    "master" device was dropped — any configured master IP is folded into
    ``lottominer_devices`` as a standalone device so existing deployments keep it.
    Migrations run in place once on start.
    """
    if not CONFIG_FILE.exists():
        return
    try:
        config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
        changed = False
        # Legacy device-list rename: nmminer_devices -> lottominer_devices.
        if "nmminer_devices" in config and "lottominer_devices" not in config:
            config["lottominer_devices"] = config.pop("nmminer_devices")
            changed = True
        elif "nmminer_devices" in config:
            config.pop("nmminer_devices")
            changed = True
        # Fold any legacy master (nmminer_master / lottominer_master) into the
        # device list, then drop the obsolete key.
        for master_key in ("nmminer_master", "lottominer_master"):
            if master_key not in config:
                continue
            master_ip = str(config.pop(master_key) or "").strip()
            changed = True
            if not master_ip:
                continue
            devices = config.setdefault("lottominer_devices", [])
            already = any(
                (d.get("ip") if isinstance(d, dict) else d) == master_ip for d in devices
            )
            if not already:
                devices.append({"ip": master_ip, "name": master_ip})
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
