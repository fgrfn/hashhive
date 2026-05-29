"""Stats, updates, health router."""

import time
from datetime import datetime, timezone, timedelta

import httpx
from fastapi import APIRouter, HTTPException, Query

from core import (
    APP_VERSION,
    CONFIG_FILE,
    DEFAULT_CONFIG,
    _bestdiff_file,
    _dev_stats_file,
    _startup_time,
    _stats_file,
    _validate_device_ip,
    load_json,
)

router = APIRouter()

_releases_cache: dict = {"data": None, "fetched_at": 0.0}
_RELEASES_TTL = 300  # 5 min cache


@router.get("/api/health")
async def health():
    uptime = (datetime.now(timezone.utc) - _startup_time).total_seconds()
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    nm_count = len(config.get("lottominer_devices", []))
    ax_count = len(config.get("axeos_devices", []))
    return {
        "status": "ok",
        "version": APP_VERSION,
        "uptime_seconds": round(uptime),
        "devices": {"lottominer": nm_count, "axeos": ax_count},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/api/updates/releases")
async def get_releases(force: bool = False):
    """Fetch available releases from GitHub. Cached for 5 minutes."""
    now = time.time()
    if not force and _releases_cache["data"] and (now - _releases_cache["fetched_at"]) < _RELEASES_TTL:
        return _releases_cache["data"]

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.github.com/repos/fgrfn/hashhive/releases",
                headers={"Accept": "application/vnd.github+json"},
            )
            resp.raise_for_status()
            releases_raw = resp.json()
    except Exception as e:
        if _releases_cache["data"]:
            return _releases_cache["data"]
        raise HTTPException(status_code=502, detail=f"GitHub API error: {e}")

    releases = [
        {
            "tag": r["tag_name"],
            "version": r["tag_name"].lstrip("v"),
            "name": r["name"] or r["tag_name"],
            "published_at": r["published_at"],
            "prerelease": r["prerelease"],
            "draft": r["draft"],
            "body": (r.get("body") or "")[:800],
            "html_url": r["html_url"],
            "docker_image": f"ghcr.io/fgrfn/hashhive:{r['tag_name'].lstrip('v')}",
        }
        for r in releases_raw
        if not r["draft"]
    ]

    _releases_cache["data"] = {"current": APP_VERSION, "releases": releases}
    _releases_cache["fetched_at"] = now
    return _releases_cache["data"]


@router.get("/api/updates/latest")
async def get_latest_release():
    """Return only the latest release (fastest check for update badge)."""
    data = await get_releases()
    stable = [r for r in data["releases"] if not r["prerelease"]]
    latest = stable[0] if stable else (data["releases"][0] if data["releases"] else None)
    return {
        "current": APP_VERSION,
        "latest": latest,
        "update_available": latest is not None and latest["version"] != APP_VERSION,
    }


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
        return result
    for i in range(days - 1, -1, -1):
        date_str = (now_utc - timedelta(days=i)).strftime("%Y-%m-%d")
        result.extend(load_json(_stats_file(date_str), []))
    return result


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
    return {
        "ip": ip,
        "hashrate_series": [s.get("gh", 0) for s in samples],
        "temp_series": [s["temp"] for s in samples if s.get("temp") is not None],
        "power_series": [s["pwr"] for s in samples if s.get("pwr") is not None],
        "timestamps": [s.get("ts") for s in samples],
    }


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
