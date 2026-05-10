"""Alerts and logs router."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from core import (
    LOGS_DIR,
    _append_entry,
    _load_recent,
    _log_file,
    _read_day,
    _today,
    _write_day,
)

router = APIRouter()


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
