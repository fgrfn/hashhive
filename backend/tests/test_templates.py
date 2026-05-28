"""Tests for the file-based templates router (CRUD + apply dispatch)."""
import asyncio
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, patch

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)

sys.path.insert(0, str(Path(__file__).parent.parent))

import routers.templates as tmpl  # noqa: E402
from core import CONFIG_FILE, DEFAULT_CONFIG, save_json  # noqa: E402


class _FakeReq:
    def __init__(self, body):
        self._body = body

    async def json(self):
        return self._body


def test_template_file_crud_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(tmpl, "TEMPLATES_DIR", tmp_path)
    created = asyncio.run(tmpl.create_template(_FakeReq({"name": "Hot", "type": "axeos", "config": {"frequency": 525}})))
    tid = created["id"]
    assert (tmp_path / f"{tid}.json").exists()
    assert created["config"]["frequency"] == 525

    listed = asyncio.run(tmpl.list_templates())
    assert any(t["id"] == tid for t in listed)

    updated = asyncio.run(tmpl.update_template(tid, _FakeReq({"name": "Cooler"})))
    assert updated["name"] == "Cooler"
    assert updated["config"]["frequency"] == 525  # preserved

    asyncio.run(tmpl.delete_template(tid))
    assert not (tmp_path / f"{tid}.json").exists()


def test_apply_template_dispatch_axeos(tmp_path, monkeypatch):
    monkeypatch.setattr(tmpl, "TEMPLATES_DIR", tmp_path)
    config = {**DEFAULT_CONFIG, "axeos_devices": [{"ip": "192.168.1.50", "name": "a", "type": "bitaxe"}]}
    save_json(CONFIG_FILE, config)

    mock_resp = type("R", (), {"status_code": 200})()
    mock_client = AsyncMock()
    mock_client.patch = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch.object(tmpl.httpx, "AsyncClient", return_value=mock_client):
        res = asyncio.run(tmpl.apply_template("192.168.1.50", _FakeReq({"config": {"frequency": 500}})))

    assert res["type"] == "axeos"
    assert res["status"] == 200
    mock_client.patch.assert_awaited_once()
