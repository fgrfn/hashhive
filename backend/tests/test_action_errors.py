"""HTTP error handling shared by miner action fanouts."""

import asyncio
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

import httpx
import pytest

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)

sys.path.insert(0, str(Path(__file__).parent.parent))

from miners import axehub, axeos, lottominer, wroomminer  # noqa: E402


class _FailingResponse:
    status_code = 500

    def raise_for_status(self):
        request = httpx.Request("POST", "http://192.168.1.50/action")
        response = httpx.Response(500, request=request)
        raise httpx.HTTPStatusError("device rejected action", request=request, response=response)


class _FailingClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def post(self, *_args, **_kwargs):
        return _FailingResponse()


@pytest.mark.parametrize(
    ("module", "fanout"),
    [
        (axeos, axeos.axeos_fanout),
        (lottominer, lottominer.lottominer_fanout),
        (wroomminer, wroomminer.wroomminer_fanout),
        (axehub, axehub.axehub_fanout),
    ],
)
def test_fanout_marks_http_error_as_failed(module, fanout):
    with patch.object(module.httpx, "AsyncClient", return_value=_FailingClient()):
        results = asyncio.run(fanout("restart", ["192.168.1.50"]))

    assert len(results) == 1
    assert results[0]["ip"] == "192.168.1.50"
    assert results[0].get("status", 0) == 0
    assert "device rejected action" in results[0]["error"]
