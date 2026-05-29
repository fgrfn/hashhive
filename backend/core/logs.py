"""Daily event-log file helpers."""

from datetime import datetime, timezone, timedelta
from pathlib import Path

from .jsonio import load_json, save_json
from .paths import KEEP_DAYS, LOGS_DIR, MAX_ENTRIES_PER_DAY


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _log_file(date_str: str) -> Path:
    return LOGS_DIR / f"{date_str}.json"


def _read_day(date_str: str) -> list:
    return load_json(_log_file(date_str), [])


def _write_day(date_str: str, entries: list) -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    save_json(_log_file(date_str), entries)


def _append_entry(record: dict) -> None:
    """Append one record to today's log file and enforce MAX_ENTRIES_PER_DAY."""
    date_str = _today()
    entries = _read_day(date_str)
    entries.insert(0, record)
    if len(entries) > MAX_ENTRIES_PER_DAY:
        entries = entries[:MAX_ENTRIES_PER_DAY]
    _write_day(date_str, entries)


def _cleanup_old_logs() -> None:
    """Delete log files older than KEEP_DAYS."""
    if not LOGS_DIR.exists():
        return
    cutoff = datetime.now(timezone.utc) - timedelta(days=KEEP_DAYS)
    for f in LOGS_DIR.glob("*.json"):
        try:
            file_date = datetime.strptime(f.stem, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            if file_date < cutoff:
                f.unlink()
        except ValueError:
            pass


def _load_recent(days: int = 1) -> list:
    """Return entries from the last N days, newest first."""
    result = []
    for i in range(days):
        date_str = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        result.extend(_read_day(date_str))
    return result
