"""Hashrate / per-device / best-diff stats sampling and retention."""

from datetime import datetime, timezone, timedelta
from pathlib import Path

from .jsonio import load_json, save_json
from .logs import _today
from .paths import KEEP_DAYS, RECORDS_FILE, STATS_DIR

_STATS_SAMPLE_INTERVAL = 60  # seconds between hashrate samples
_last_stats_sample_ts: float = 0.0
_last_dev_sample_ts: float = 0.0
_last_bestdiff_sample_ts: float = 0.0


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
        sample = {"ts": now_iso, "gh": gh}
        temp = d.get("temp")
        if temp is not None:
            try:
                sample["temp"] = round(float(temp), 1)
            except (TypeError, ValueError):
                pass
        pwr = d.get("power")
        if pwr is not None:
            try:
                sample["pwr"] = round(float(pwr), 1)
            except (TypeError, ValueError):
                pass
        if ip not in data:
            data[ip] = []
        data[ip].append(sample)
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


def _load_records() -> dict:
    """All-time best-share records: {ip: {name, type, best_diff, ts}}."""
    return load_json(RECORDS_FILE, {})


def _update_records(all_devices: list) -> None:
    """Persist a new all-time best share whenever a device beats its record.

    all_devices: list of dicts with _ip/_name/_type and bestDiff/best_diff/bestShare.
    """
    records = _load_records()
    changed = False
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
        if val <= 0:
            continue
        name = d.get("_name") or d.get("hostname") or d.get("name") or ip
        dtype = d.get("_type") or d.get("type") or ""
        prev = records.get(ip)
        if prev is None or val > float(prev.get("best_diff", 0)):
            records[ip] = {"name": name, "type": dtype, "best_diff": val, "ts": now_iso}
            changed = True
        elif name and prev.get("name") != name:
            prev["name"] = name  # keep display name fresh
            changed = True
    if changed:
        save_json(RECORDS_FILE, records)
