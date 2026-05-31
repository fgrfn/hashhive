"""Alerts and logs router."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from core import (
    CONFIG_FILE,
    DEFAULT_CONFIG,
    LOGS_DIR,
    _append_entry,
    _load_recent,
    _log_file,
    _read_day,
    _today,
    _write_day,
    load_json,
    save_json,
)

router = APIRouter()


# ── Alert rule catalog ────────────────────────────────────────────────────────
# Each "rule" is a real detector implemented in alerts.check_alerts(). The Rules
# tab is a live view over config["alert_types"] (enable/disable, dash-keyed) and
# config["thresholds"] (numeric, underscore-keyed). "offline" uses the top-level
# offline_grace_minutes instead of a thresholds entry.
#   (kind, type_key, label, severity, threshold_key, unit, condition_template)
_RULE_CATALOG: list[tuple] = [
    ("offline",            "offline",            "Device offline",        "critical", "offline_grace_minutes", "min",  "no response > {v} min"),
    ("temp_high",          "temp-high",          "Chip temperature high", "warning",  "temp_max",              "°C",   "chip temp > {v} °C"),
    ("vr_temp_high",       "vr-temp-high",       "VR temperature high",   "critical", "vr_temp_max",           "°C",   "VR temp > {v} °C"),
    ("hashrate_low",       "hashrate-low",       "Hashrate low",          "warning",  "hashrate_min",          "GH/s", "hashrate < {v} GH/s"),
    ("error_rate_high",    "error-rate-high",    "Share error rate high", "warning",  "error_rate_max",        "%",    "reject rate > {v}%"),
    ("rssi_low",           "rssi-low",           "Weak WiFi signal",      "warning",  "rssi_min",              "dBm",  "RSSI < {v} dBm"),
    ("fan_failure",        "fan-failure",        "Fan failure",           "critical", None,                    "",     "fan stopped (0 RPM)"),
    ("pool_lost",          "pool-lost",          "Pool disconnected",     "critical", None,                    "",     "stratum connection lost"),
    ("fallback_active",    "fallback-active",    "Fallback pool active",  "warning",  None,                    "",     "switched to fallback pool"),
    ("mining_paused",      "mining-paused",      "Mining paused",         "warning",  None,                    "",     "device mining paused"),
    ("device_rebooted",    "device-rebooted",    "Device rebooted",       "info",     None,                    "",     "device rebooted"),
    ("block_found",        "block-found",        "Block found",           "critical", None,                    "",     "block found!"),
    ("new_best_diff",      "new-best-diff",      "New best difficulty",   "info",     None,                    "",     "new best share difficulty"),
    ("online",             "online",             "Device back online",    "info",     None,                    "",     "device recovered"),
    ("pool_connected",     "pool-connected",     "Pool reconnected",      "info",     None,                    "",     "pool connection restored"),
    ("fallback_recovered", "fallback-recovered", "Primary pool recovered", "info",    None,                    "",     "back on primary pool"),
]
_RULE_BY_KIND = {r[0]: r for r in _RULE_CATALOG}


def _threshold_value(config: dict, threshold_key: str | None):
    if not threshold_key:
        return None
    if threshold_key == "offline_grace_minutes":
        return config.get("offline_grace_minutes", DEFAULT_CONFIG["offline_grace_minutes"])
    return config.get("thresholds", {}).get(threshold_key)


@router.get("/api/alerts/rules")
async def get_alert_rules():
    """Return the live alert-rule catalog: enabled state, threshold and 24h fire count."""
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    at = config.get("alert_types", {})
    # Count how often each kind fired in the last 24h from the real log.
    fired: dict[str, int] = {}
    for entry in _load_recent(1):
        k = entry.get("kind")
        if k:
            fired[k] = fired.get(k, 0) + 1
    rules = []
    for kind, type_key, label, severity, threshold_key, unit, template in _RULE_CATALOG:
        enabled = bool(at.get(type_key, True))
        value = _threshold_value(config, threshold_key)
        condition = template.format(v=value) if threshold_key and value is not None else template
        rules.append({
            "kind": kind,
            "label": label,
            "severity": severity,
            "enabled": enabled,
            "condition": condition,
            "threshold_key": threshold_key,
            "threshold": value,
            "unit": unit,
            "fired24h": fired.get(kind, 0),
        })
    return rules


@router.patch("/api/alerts/rules/{kind}")
async def update_alert_rule(kind: str, data: dict):
    """Toggle a rule on/off and/or update its numeric threshold."""
    entry = _RULE_BY_KIND.get(kind)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Unknown rule '{kind}'")
    _, type_key, _, _, threshold_key, _, _ = entry
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)

    if "enabled" in data:
        config.setdefault("alert_types", {})[type_key] = bool(data["enabled"])

    if "threshold" in data and data["threshold"] is not None:
        if not threshold_key:
            raise HTTPException(status_code=400, detail=f"Rule '{kind}' has no threshold")
        try:
            value = float(data["threshold"])
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="threshold must be numeric")
        # rssi_min / grace minutes are ints; keep the others as given.
        if threshold_key in ("rssi_min", "offline_grace_minutes"):
            value = int(value)
        if threshold_key == "offline_grace_minutes":
            config["offline_grace_minutes"] = value
        else:
            config.setdefault("thresholds", {})[threshold_key] = value

    save_json(CONFIG_FILE, config)
    return {"status": "ok"}


@router.get("/api/alerts")
async def get_alerts(days: int = Query(default=1, ge=1, le=30)):
    """Return log entries. days=1 → today only; days=7 → last 7 days."""
    return _load_recent(days)


@router.get("/api/logs/dates")
async def get_log_dates():
    """List available log file dates (newest first)."""
    if not LOGS_DIR.exists():
        return []
    dates = sorted(
        [f.stem for f in LOGS_DIR.glob("*.json") if len(f.stem) == 10],
        reverse=True,
    )
    return dates


@router.post("/api/alerts/read-all")
async def mark_alerts_read():
    date_str = _today()
    entries = _read_day(date_str)
    for entry in entries:
        entry["read"] = True
    _write_day(date_str, entries)
    return {"status": "ok"}


@router.delete("/api/alerts")
async def delete_alerts():
    """Delete today's log file."""
    lf = _log_file(_today())
    if lf.exists():
        lf.unlink()
    return {"status": "ok"}


@router.post("/api/log")
async def post_log_entry(entry: dict):
    """Persist a manual action log entry (pool push, config save, etc.) to today's log file."""
    severity = entry.get("severity", "info")
    message = entry.get("message", "")
    source = entry.get("source", "system")
    if not message:
        raise HTTPException(status_code=400, detail="message required")
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "id": f"log:{source}:{now}",
        "device": f"log:{source}",
        "kind": "user_action",
        "severity": severity,
        "message": message,
        "timestamp": now,
        "read": True,   # action logs are pre-read; don't bump unread counter
        "source": source,
    }
    _append_entry(record)
    return {"status": "ok"}
