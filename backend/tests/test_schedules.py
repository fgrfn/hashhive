"""Tests for the schedules execution engine (pure helpers + dispatch)."""
import asyncio
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)

sys.path.insert(0, str(Path(__file__).parent.parent))

import routers.schedules as sched  # noqa: E402


def _config():
    return {
        "axeos_devices": [{"ip": "192.168.1.10"}],
        "lottominer_devices": [{"ip": "192.168.1.20"}],
        "lottominer_master": "192.168.1.1",
        "nerdminer_devices": [{"ip": "192.168.1.30"}],
        "sparkminer_devices": [],
        "groups": [{"id": "g1", "devices": ["192.168.1.10", "192.168.1.20"]}],
        "pool_presets": [{"id": "p1", "url": "stratum+tcp://pool:3333"}],
    }


def test_resolve_targets_all():
    ips = sched._resolve_target_ips({"scope": "all"}, _config())
    assert set(ips) == {"192.168.1.10", "192.168.1.20", "192.168.1.1", "192.168.1.30"}


def test_resolve_targets_group_and_device():
    cfg = _config()
    assert set(sched._resolve_target_ips({"scope": "group", "groupId": "g1"}, cfg)) == {"192.168.1.10", "192.168.1.20"}
    assert sched._resolve_target_ips({"scope": "device", "deviceIps": ["192.168.1.10"]}, cfg) == ["192.168.1.10"]


def test_should_fire_day_time_and_once():
    # 2026-05-25 is a Monday; 08:00 UTC.
    now = datetime(2026, 5, 25, 8, 0, tzinfo=timezone.utc)
    s = {"id": "s1", "enabled": True, "days": ["mo"], "time_start": "08:00"}
    last: dict = {}
    assert sched._schedule_should_fire(s, now, last) is True
    last["s1"] = now.strftime("%Y-%m-%d %H:%M")          # mark fired
    assert sched._schedule_should_fire(s, now, last) is False  # fire-once
    assert sched._schedule_should_fire({**s, "days": ["tu"]}, now, {}) is False  # wrong day
    assert sched._schedule_should_fire({**s, "enabled": False}, now, {}) is False
    assert sched._schedule_should_fire({**s, "time_start": "09:00"}, now, {}) is False


def test_run_action_restart_dispatches_by_type():
    cfg = _config()
    s = {"action": "restart", "scope": "all"}
    with patch.object(sched, "axeos_fanout", new=AsyncMock(return_value=[])) as axe, \
         patch.object(sched, "lottominer_fanout", new=AsyncMock(return_value=[])) as nm:
        count = asyncio.run(sched._run_schedule_action(s, cfg))
    axe.assert_awaited_once()
    nm.assert_awaited_once()  # restart hits lottominer too
    assert count >= 1


def test_run_action_pool_switch_pushes_preset():
    cfg = _config()
    s = {"action": "pool_switch", "scope": "group", "groupId": "g1", "pool_id": "p1"}
    with patch.object(sched, "push_pool_to_device", new=AsyncMock(return_value={})) as push:
        count = asyncio.run(sched._run_schedule_action(s, cfg))
    assert push.await_count == 2
    assert count == 2


def test_run_action_pool_switch_missing_preset_noop():
    cfg = _config()
    s = {"action": "pool_switch", "scope": "all", "pool_id": "nope"}
    with patch.object(sched, "push_pool_to_device", new=AsyncMock()) as push:
        count = asyncio.run(sched._run_schedule_action(s, cfg))
    push.assert_not_awaited()
    assert count == 0
