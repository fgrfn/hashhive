"""Tests for the alert-rule catalog endpoints (live view over alert_types/thresholds)."""
import asyncio
import os
import sys
import tempfile
from pathlib import Path

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)
(Path(_tmpdir) / "logs").mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import HTTPException  # noqa: E402

from core import CONFIG_FILE, DEFAULT_CONFIG, load_json  # noqa: E402
from routers.alerts import _RULE_CATALOG, get_alert_rules, update_alert_rule  # noqa: E402


def test_rules_cover_full_catalog():
    rules = asyncio.run(get_alert_rules())
    assert len(rules) == len(_RULE_CATALOG)
    kinds = {r["kind"] for r in rules}
    assert {"offline", "temp_high", "hashrate_low", "block_found"} <= kinds


def test_toggle_persists_to_alert_types():
    asyncio.run(update_alert_rule("temp_high", {"enabled": False}))
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    assert config["alert_types"]["temp-high"] is False
    rule = next(r for r in asyncio.run(get_alert_rules()) if r["kind"] == "temp_high")
    assert rule["enabled"] is False


def test_threshold_update_reflects_in_condition():
    asyncio.run(update_alert_rule("temp_high", {"threshold": 75}))
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    assert config["thresholds"]["temp_max"] == 75
    rule = next(r for r in asyncio.run(get_alert_rules()) if r["kind"] == "temp_high")
    assert "75" in rule["condition"]


def test_offline_uses_grace_minutes_not_thresholds():
    asyncio.run(update_alert_rule("offline", {"threshold": 5}))
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    assert config["offline_grace_minutes"] == 5
    assert "offline_grace_minutes" not in config.get("thresholds", {})


def test_unknown_rule_rejected():
    try:
        asyncio.run(update_alert_rule("does_not_exist", {"enabled": True}))
        assert False, "expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 404


def test_threshold_on_thresholdless_rule_rejected():
    try:
        asyncio.run(update_alert_rule("block_found", {"threshold": 5}))
        assert False, "expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 400


def test_snooze_set_and_clear():
    from datetime import datetime, timezone
    # Snooze temp_high for 60 min → rule shows a future snoozed_until.
    asyncio.run(update_alert_rule("temp_high", {"snooze_minutes": 60}))
    rules = asyncio.run(get_alert_rules())
    r = next(x for x in rules if x["kind"] == "temp_high")
    assert r["snoozed_until"] is not None
    assert datetime.fromisoformat(r["snoozed_until"]) > datetime.now(timezone.utc)
    # Clear it.
    asyncio.run(update_alert_rule("temp_high", {"snooze_minutes": 0}))
    rules = asyncio.run(get_alert_rules())
    r = next(x for x in rules if x["kind"] == "temp_high")
    assert r["snoozed_until"] is None


def test_expired_snooze_is_not_reported():
    from datetime import datetime, timezone, timedelta
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    config.setdefault("alert_snooze", {})["temp_high"] = (
        datetime.now(timezone.utc) - timedelta(minutes=1)
    ).isoformat()
    from core import save_json
    save_json(CONFIG_FILE, config)
    rules = asyncio.run(get_alert_rules())
    r = next(x for x in rules if x["kind"] == "temp_high")
    assert r["snoozed_until"] is None  # past timestamp → treated as not snoozed
