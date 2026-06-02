"""Tests for the miners/ driver registry and probe dispatch."""
import asyncio
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)

sys.path.insert(0, str(Path(__file__).parent.parent))

import miners  # noqa: E402
from miners.axeos import AxeosDriver  # noqa: E402


def test_registry_maps_families():
    assert miners.get_driver("axeos") is AxeosDriver
    assert miners.get_driver("bitaxe") is AxeosDriver


def test_get_driver_unknown_raises():
    try:
        miners.get_driver("nope")
    except ValueError:
        return
    raise AssertionError("expected ValueError for unknown family")


def test_driver_for_record_instantiates_by_type():
    d = miners.driver_for_record({"type": "axeos", "ip": "192.168.1.10"})
    assert isinstance(d, AxeosDriver)
    assert d.host == "192.168.1.10"


def test_capability_flags():
    assert AxeosDriver.can_set_fan is True
    assert AxeosDriver.can_restart is True


def test_probe_all_returns_first_match():
    # AxeOS responds with an identifying field → axeos wins before others run.
    axe_resp = type("R", (), {"status_code": 200, "json": lambda self: {"hashRate": 1, "ASICModel": "BM1366", "hostname": "axe"}})()
    client = AsyncMock()
    client.get = AsyncMock(return_value=axe_resp)
    rec = asyncio.run(miners.probe_all("192.168.1.10", client))
    assert rec and rec["type"] in ("bitaxe", "nerdaxe")
    assert rec["ip"] == "192.168.1.10"


def test_ensure_stratum_scheme():
    from miners.lottominer import ensure_stratum_scheme
    # bare host:port gets the default scheme (NMMiner needs it to resolve DNS)
    assert ensure_stratum_scheme("eu.digi.hmpool.io:3337") == "stratum+tcp://eu.digi.hmpool.io:3337"
    # already-schemed URLs are left untouched
    assert ensure_stratum_scheme("stratum+tcp://eu.digi.hmpool.io:3337") == "stratum+tcp://eu.digi.hmpool.io:3337"
    assert ensure_stratum_scheme("stratum+ssl://pool.example:443") == "stratum+ssl://pool.example:443"
    # blank / whitespace stays blank
    assert ensure_stratum_scheme("") == ""
    assert ensure_stratum_scheme("  ") == ""
    assert ensure_stratum_scheme(None) == ""
