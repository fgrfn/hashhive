"""Tests for the live Discord dashboard embed + self-updating webhook logic."""
import asyncio
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, patch

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)
(Path(_tmpdir) / "logs").mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(Path(__file__).parent.parent))

from core import DISCORD_DASHBOARD_STATE_FILE, load_json  # noqa: E402
from routers import discord_dashboard as dd  # noqa: E402


def _resp(status, payload=None):
    return type("R", (), {"status_code": status, "json": lambda self: payload or {}})()


def test_fmt_hashrate_thresholds():
    assert dd._fmt_hashrate(1770) == "1.77 TH/s"
    assert dd._fmt_hashrate(0.5) == "500.0 MH/s"
    assert dd._fmt_hashrate(1_500_000) == "1.50 PH/s"
    assert dd._fmt_hashrate(42) == "42.0 GH/s"


def test_build_embed_fields():
    fleet = {"total_gh": 1770.0, "total_pwr": 34.2, "shares_acc": 1971,
             "shares_rej": 36, "online": 3, "total": 3, "max_temp": 50}
    embed = dd._build_embed(fleet)
    values = {f["name"]: f["value"] for f in embed["fields"]}
    assert values["⚡ Hashrate"] == "1.77 TH/s"
    assert values["🖥️ Devices online"] == "3 / 3"
    assert values["📈 Acceptance"] == "98.2%"
    assert embed["color"] == dd._EMBED_COLOR


def test_resolve_webhook_prefers_dedicated_then_falls_back():
    assert dd._resolve_webhook({"discord_dashboard": {"webhook": "https://dedicated"},
                                "notifications": {"discord_webhook": "https://alert"}}) == "https://dedicated"
    assert dd._resolve_webhook({"discord_dashboard": {"webhook": ""},
                                "notifications": {"discord_webhook": "https://alert"}}) == "https://alert"
    assert dd._resolve_webhook({}) == ""


def test_post_then_edit_reuses_message_id():
    client = AsyncMock()
    client.post = AsyncMock(return_value=_resp(200, {"id": "msg123"}))
    client.patch = AsyncMock(return_value=_resp(200))
    with patch("routers.discord_dashboard.httpx.AsyncClient") as M:
        M.return_value.__aenter__.return_value = client
        ok1 = asyncio.run(dd._post_or_edit("https://wh-test", {"x": 1}))
        ok2 = asyncio.run(dd._post_or_edit("https://wh-test", {"x": 2}))
    assert ok1 and ok2
    assert client.post.await_count == 1   # posted once
    assert client.patch.await_count == 1  # then edited in place
    assert load_json(DISCORD_DASHBOARD_STATE_FILE, {}).get("https://wh-test") == "msg123"
