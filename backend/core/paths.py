"""Filesystem path constants and size/retention limits."""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent  # the backend/ directory
DATA_DIR = Path(os.environ.get("HASHHIVE_DATA_DIR", BASE_DIR))
CONFIG_FILE = DATA_DIR / "dashboard_config.json"
ALERT_HISTORY_FILE = DATA_DIR / "alert_history.json"  # legacy – migrated on first start
DEVICE_STATE_FILE = DATA_DIR / "device_state.json"
LOGS_DIR = DATA_DIR / "logs"
STATS_DIR = DATA_DIR / "stats"
TEMPLATES_DIR = DATA_DIR / "templates"  # one JSON file per device template
DISCOVERY_STATE_FILE = DATA_DIR / "discovery_state.json"  # known IPs for continuous scan
RECORDS_FILE = DATA_DIR / "records.json"  # all-time best-share records per device
FRONTEND_DIR = BASE_DIR.parent / "frontend"
_SESSIONS_FILE = DATA_DIR / "sessions.json"

MAX_ENTRIES_PER_DAY = 1000
KEEP_DAYS = 30
