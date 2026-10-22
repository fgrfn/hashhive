"""SSRF guard tests for the AxeOS batch endpoints."""
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

import pytest  # noqa: E402
from fastapi import HTTPException  # noqa: E402

from core import AxeActionBatchRequest, AxeConfigBatchRequest  # noqa: E402
from routers.axeos import (  # noqa: E402
    axeos_action_batch,
    patch_axeos_config_batch,
    patch_axeos_config_one,
)


class _FailingResponse:
    status_code = 500

    def raise_for_status(self):
        raise RuntimeError("device rejected config")


class _FailingClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def patch(self, *_args, **_kwargs):
        return _FailingResponse()


def test_action_batch_rejects_public_ip():
    with pytest.raises(HTTPException) as exc:
        asyncio.run(axeos_action_batch(AxeActionBatchRequest(action="restart", ips=["8.8.8.8"])))
    assert exc.value.status_code == 403


def test_action_batch_rejects_hostname():
    with pytest.raises(HTTPException) as exc:
        asyncio.run(axeos_action_batch(AxeActionBatchRequest(action="restart", ips=["evil.example.com"])))
    assert exc.value.status_code == 400


def test_config_batch_rejects_public_ip():
    with pytest.raises(HTTPException) as exc:
        asyncio.run(patch_axeos_config_batch(AxeConfigBatchRequest(ips=["1.1.1.1"], frequency=400)))
    assert exc.value.status_code == 403


def test_single_config_maps_device_http_error_to_bad_gateway():
    with patch("routers.axeos.httpx.AsyncClient", return_value=_FailingClient()):
        with pytest.raises(HTTPException) as exc:
            asyncio.run(patch_axeos_config_one("192.168.1.42", {"frequency": 500}))
    assert exc.value.status_code == 502
    assert "device rejected config" in exc.value.detail
