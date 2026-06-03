"""Tests for the firmware-update check."""
import asyncio
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)
(Path(_tmpdir) / "logs").mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(Path(__file__).parent.parent))

from routers import firmware  # noqa: E402


def test_is_outdated():
    assert firmware.is_outdated("2.0.02", "2.6.0") is True
    assert firmware.is_outdated("v2.0.2", "v2.6.0") is True   # 'v' prefix ignored
    assert firmware.is_outdated("0.4.1", "0.4.2") is True
    assert firmware.is_outdated("2.6.0", "2.6.0") is False    # equal
    assert firmware.is_outdated("2.7.0", "2.6.0") is False    # newer
    assert firmware.is_outdated("", "2.0") is False           # unparseable → no false alarm
    assert firmware.is_outdated("dev", "2.0") is False


class _Resp:
    def __init__(self, status, payload):
        self.status_code = status
        self._payload = payload

    def json(self):
        return self._payload


class _Client:
    def __init__(self, by_repo):
        self._by_repo = by_repo

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, url, headers=None):
        for repo, resp in self._by_repo.items():
            if repo in url:
                return resp
        return _Resp(404, {})


def test_firmware_latest_maps_families():
    firmware._cache["data"] = None
    firmware._cache["fetched_at"] = 0.0
    by_repo = {
        "bitaxeorg/ESP-Miner": _Resp(200, {"tag_name": "v2.6.0", "html_url": "x"}),
        "NMminer1024/NMMiner": _Resp(200, {"tag_name": "v0.4.2", "html_url": "y"}),
        "dwespl/nerdminer-axehub": _Resp(404, {}),
    }
    with patch.object(firmware.httpx, "AsyncClient", lambda *a, **k: _Client(by_repo)):
        out = asyncio.run(firmware.firmware_latest(force=True))
    assert out["axeos"]["version"] == "2.6.0"
    assert out["lottominer"]["version"] == "0.4.2"
    assert "axehub" not in out  # 404 → omitted, not an error
