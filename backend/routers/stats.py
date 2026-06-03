"""Stats router: hashrate / per-device / best-diff time series for charts."""

from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Query

from core import (
    _bestdiff_file,
    _dev_stats_file,
    _stats_file,
    _validate_device_ip,
    load_json,
    sane_ghs,
)

router = APIRouter()


@router.get("/api/stats/hashrate")
async def get_hashrate_stats(
    days: int = Query(default=1, ge=1, le=30),
    hours: int | None = Query(default=None, ge=1, le=24),
):
    """Return hashrate samples (oldest first for charting).

    Pass `hours` for sub-day ranges (1h/6h), otherwise the last `days` days.
    """
    result: list = []
    now_utc = datetime.now(timezone.utc)
    if hours is not None:
        cutoff = now_utc - timedelta(hours=hours)
        # Today's file is enough for <=24h, but cross a day boundary just in case.
        for i in (1, 0):
            date_str = (now_utc - timedelta(days=i)).strftime("%Y-%m-%d")
            for s in load_json(_stats_file(date_str), []):
                try:
                    if datetime.fromisoformat(s["ts"]) >= cutoff:
                        result.append(s)
                except Exception:
                    pass
        result.sort(key=lambda s: s.get("ts", ""))
        return _drop_bad(result)
    for i in range(days - 1, -1, -1):
        date_str = (now_utc - timedelta(days=i)).strftime("%Y-%m-%d")
        result.extend(load_json(_stats_file(date_str), []))
    return _drop_bad(result)


def _drop_bad(samples: list) -> list:
    """Filter out samples with an implausible hashrate (bad firmware readings
    recorded before sanitization) so they don't wreck the chart axis."""
    return [s for s in samples if sane_ghs(s.get("gh", 0)) is not None]


@router.get("/api/stats/device")
async def get_device_stats(ip: str = Query(...), hours: int = Query(default=1, ge=1, le=24)):
    """Return per-device hashrate samples for the last N hours."""
    _validate_device_ip(ip)
    result: list = []
    now_utc = datetime.now(timezone.utc)
    cutoff = now_utc - timedelta(hours=hours)
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


@router.get("/api/stats/bestdiff")
async def get_bestdiff_stats(days: int = Query(default=7, ge=1, le=30)):
    """Return per-device best-difficulty samples for the last N days (oldest first)."""
    result: dict = {}  # ip → {name, samples[]}
    now_utc = datetime.now(timezone.utc)
    for i in range(days - 1, -1, -1):
        date_str = (now_utc - timedelta(days=i)).strftime("%Y-%m-%d")
        data: dict = load_json(_bestdiff_file(date_str), {})
        for ip, entry in data.items():
            if ip not in result:
                result[ip] = {"name": entry.get("name", ip), "samples": []}
            result[ip]["samples"].extend(entry.get("samples", []))
    # Sort each device's samples by timestamp
    for entry in result.values():
        entry["samples"].sort(key=lambda s: s.get("ts", ""))
    return result
