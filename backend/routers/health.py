"""Health router: overall app health + per-device historical series."""

from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Query

from core import (
    APP_VERSION,
    CONFIG_FILE,
    DEFAULT_CONFIG,
    _dev_stats_file,
    _startup_time,
    _validate_device_ip,
    load_json,
    sane_ghs,
)

router = APIRouter()


@router.get("/api/health")
async def health():
    uptime = (datetime.now(timezone.utc) - _startup_time).total_seconds()
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    nm_count = (len(config.get("lottominer_devices", []))
                + len(config.get("wroomminer_devices", []))
                + len(config.get("axehub_devices", [])))
    ax_count = len(config.get("axeos_devices", []))
    return {
        "status": "ok",
        "version": APP_VERSION,
        "uptime_seconds": round(uptime),
        "devices": {"lottominer": nm_count, "axeos": ax_count},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/api/health/{ip}")
async def device_health(ip: str, hours: int = Query(default=24, ge=1, le=720)):
    """Per-device historical series (hashrate/temp/power) for the charts tab."""
    _validate_device_ip(ip)
    now_utc = datetime.now(timezone.utc)
    cutoff = now_utc - timedelta(hours=hours)
    days_needed = min(hours // 24 + 2, 31)
    samples: list = []
    for i in range(days_needed - 1, -1, -1):
        date_str = (now_utc - timedelta(days=i)).strftime("%Y-%m-%d")
        data: dict = load_json(_dev_stats_file(date_str), {})
        for s in data.get(ip, []):
            try:
                if datetime.fromisoformat(s["ts"]) >= cutoff:
                    samples.append(s)
            except Exception:
                pass
    samples.sort(key=lambda s: s.get("ts", ""))
    # Drop implausible hashrate spikes (bad firmware readings) so the chart axis
    # isn't dominated by a single absurd value.
    samples = [s for s in samples if sane_ghs(s.get("gh", 0)) is not None]
    return {
        "ip": ip,
        "hashrate_series": [s.get("gh", 0) for s in samples],
        "temp_series": [s["temp"] for s in samples if s.get("temp") is not None],
        "power_series": [s["pwr"] for s in samples if s.get("pwr") is not None],
        "timestamps": [s.get("ts") for s in samples],
    }
