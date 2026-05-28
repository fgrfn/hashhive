"""Tests for group actions (fan-out dispatch by device type)."""
import asyncio
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, patch

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)

sys.path.insert(0, str(Path(__file__).parent.parent))

import routers.groups as groups  # noqa: E402
from core import CONFIG_FILE, DEFAULT_CONFIG, save_json  # noqa: E402


class _FakeReq:
    def __init__(self, body):
        self._body = body

    async def json(self):
        return self._body


def _seed():
    config = {
        **DEFAULT_CONFIG,
        "axeos_devices": [{"ip": "192.168.1.10", "name": "a", "type": "bitaxe"}],
        "nmminer_devices": [{"ip": "192.168.1.20", "name": "n"}],
        "groups": [{"id": "g1", "name": "Rack", "devices": ["192.168.1.10", "192.168.1.20"], "poolId": "p1"}],
        "pool_presets": [{"id": "p1", "url": "stratum+tcp://pool:3333", "wallet": "bc1xyz"}],
    }
    save_json(CONFIG_FILE, config)


def test_split_by_type():
    config = {
        "axeos_devices": [{"ip": "192.168.1.10"}],
        "nmminer_devices": [{"ip": "192.168.1.20"}],
        "nmminer_master": "192.168.1.1",
    }
    axe, nm = groups._split_by_type(["192.168.1.10", "192.168.1.20", "192.168.1.1"], config)
    assert axe == ["192.168.1.10"]
    assert set(nm) == {"192.168.1.20", "192.168.1.1"}


def test_group_restart_dispatches_per_type():
    _seed()
    with patch.object(groups, "axeos_fanout", new=AsyncMock(return_value=[{"ip": "192.168.1.10", "status": 200}])) as axe, \
         patch.object(groups, "nmminer_fanout", new=AsyncMock(return_value=[{"ip": "192.168.1.20", "status": 200}])) as nm:
        res = asyncio.run(groups.group_action("g1", _FakeReq({"action": "restart"})))
    axe.assert_awaited_once_with("restart", ["192.168.1.10"])
    nm.assert_awaited_once_with("restart", ["192.168.1.20"])
    assert len(res["results"]) == 2


def test_group_pool_switch_pushes_preset():
    _seed()
    with patch.object(groups, "push_pool_to_device", new=AsyncMock(return_value={"ip": "x", "status": 200})) as push:
        res = asyncio.run(groups.group_action("g1", _FakeReq({"action": "pool_switch"})))
    assert push.await_count == 2  # both devices in group
    assert res["action"] == "pool_switch"
