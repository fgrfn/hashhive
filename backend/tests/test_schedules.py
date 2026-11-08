"""Tests for the schedules execution engine (pure helpers + dispatch)."""
import asyncio
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)

sys.path.insert(0, str(Path(__file__).parent.parent))

import routers.schedules as sched  # noqa: E402


def _config():
    return {
        "axeos_devices": [{"ip": "192.168.1.10"}],
        "lottominer_devices": [{"ip": "192.168.1.20"}],
        "wroomminer_devices": [{"ip": "192.168.1.30"}],
        "groups": [{"id": "g1", "devices": ["192.168.1.10", "192.168.1.20"]}],
        "pool_presets": [{"id": "p1", "url": "stratum+tcp://pool:3333"}],
    }


def test_resolve_targets_all():
    ips = sched._resolve_target_ips({"scope": "all"}, _config())
    assert set(ips) == {"192.168.1.10", "192.168.1.20", "192.168.1.30"}


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


@pytest.mark.parametrize("time_start", ["8:00", "24:00", "12:60", "later", ""])
def test_normalize_schedule_rejects_invalid_start_time(time_start):
    with pytest.raises(HTTPException, match="time_start") as exc:
        sched._normalize_schedule({"name": "Night", "time_start": time_start})
    assert exc.value.status_code == 400


def test_normalize_schedule_rejects_unsupported_action_and_scope():
    with pytest.raises(HTTPException, match="Unsupported schedule action"):
        sched._normalize_schedule({"name": "Night", "action": "shutdown"})
    with pytest.raises(HTTPException, match="scope must be"):
        sched._normalize_schedule({"name": "Night", "scope": "internet"})


def test_normalize_schedule_rejects_invalid_power_limit():
    with pytest.raises(HTTPException, match="at least 100"):
        sched._normalize_schedule({"name": "Night", "action": "power_limit", "power": 50})


def test_run_action_restart_dispatches_by_type():
    cfg = _config()
    s = {"action": "restart", "scope": "all"}
    with patch.object(sched, "axeos_fanout", new=AsyncMock(return_value=[{"ip": "192.168.1.10", "status": 200}])) as axe, \
         patch.object(sched, "lottominer_fanout", new=AsyncMock(return_value=[{"ip": "192.168.1.20", "status": 200}])) as nm:
        count = asyncio.run(sched._run_schedule_action(s, cfg))
    axe.assert_awaited_once()
    nm.assert_awaited_once()  # restart hits lottominer too
    assert count == 2


def test_run_action_restart_counts_only_successful_responses():
    cfg = _config()
    s = {"action": "restart", "scope": "all"}
    with patch.object(sched, "axeos_fanout", new=AsyncMock(return_value=[{"ip": "192.168.1.10", "status": 500}])), \
         patch.object(sched, "lottominer_fanout", new=AsyncMock(return_value=[{"ip": "192.168.1.20", "status": 0, "error": "offline"}])), \
         patch.object(sched, "wroomminer_fanout", new=AsyncMock(return_value=[{"ip": "192.168.1.30", "status": 204}])):
        count = asyncio.run(sched._run_schedule_action(s, cfg))
    assert count == 1


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


def test_run_action_power_limit_sets_axeos_frequency():
    cfg = _config()
    s = {"action": "power_limit", "scope": "device", "deviceIps": ["192.168.1.10"], "power": 400}
    sent = []

    async def _run():
        client = AsyncMock()

        async def _patch(url, json=None):
            sent.append((url, json))
            return type("R", (), {"status_code": 200, "raise_for_status": lambda self: None})()
        client.patch = _patch
        with patch("routers.schedules.httpx.AsyncClient") as M:
            M.return_value.__aenter__.return_value = client
            return await sched._run_schedule_action(s, cfg)

    count = asyncio.run(_run())
    assert count == 1
    assert sent == [("http://192.168.1.10/api/system", {"frequency": 400})]


def test_run_action_power_limit_does_not_count_http_failure():
    cfg = _config()
    s = {"action": "power_limit", "scope": "device", "deviceIps": ["192.168.1.10"], "power": 400}

    async def _run():
        client = AsyncMock()

        async def _patch(url, json=None):
            response = type("R", (), {})()
            response.raise_for_status = lambda: (_ for _ in ()).throw(RuntimeError("500"))
            return response

        client.patch = _patch
        with patch("routers.schedules.httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__.return_value = client
            return await sched._run_schedule_action(s, cfg)

    assert asyncio.run(_run()) == 0


def test_run_action_throttle_floor_guards_bad_freq():
    cfg = _config()
    s = {"action": "throttle", "scope": "device", "deviceIps": ["192.168.1.10"], "power": 50}
    # below the 100 MHz floor → no-op, no device touched
    count = asyncio.run(sched._run_schedule_action(s, cfg))
    assert count == 0


def test_run_action_power_limit_skips_when_no_axeos():
    cfg = {**_config(), "axeos_devices": []}
    s = {"action": "power_limit", "scope": "all", "power": 400}
    count = asyncio.run(sched._run_schedule_action(s, cfg))
    assert count == 0
