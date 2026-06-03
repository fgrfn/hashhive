"""Tests for the AxeOS device logs endpoint."""
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

from routers import axeos  # noqa: E402


class _Resp:
    def __init__(self, status, text):
        self.status_code = status
        self.text = text


class _Client:
    def __init__(self, resp):
        self._resp = resp

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, url):
        return self._resp


def test_logs_returns_http_history_when_available():
    resp = _Resp(200, "line one\n\n[ERROR] boom\nline three\n")
    with patch.object(axeos.httpx, "AsyncClient", lambda *a, **k: _Client(resp)):
        out = asyncio.run(axeos.get_axeos_logs("192.168.1.50", lines=200))
    assert out["source"] == "history"
    # blank lines stripped, order preserved
    assert out["logs"] == ["line one", "[ERROR] boom", "line three"]


def test_logs_respects_line_cap():
    resp = _Resp(200, "\n".join(f"l{i}" for i in range(500)))
    with patch.object(axeos.httpx, "AsyncClient", lambda *a, **k: _Client(resp)):
        out = asyncio.run(axeos.get_axeos_logs("192.168.1.50", lines=10))
    assert out["source"] == "history"
    assert out["logs"] == [f"l{i}" for i in range(490, 500)]


def test_logs_rejects_public_ip():
    with pytest.raises(HTTPException) as exc:
        asyncio.run(axeos.get_axeos_logs("8.8.8.8"))
    assert exc.value.status_code == 403
