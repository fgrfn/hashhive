"""Tests for the market price endpoint (top-bar ticker)."""
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

from core import CONFIG_FILE, DEFAULT_CONFIG, load_json, save_json  # noqa: E402
from routers import dashboard as d  # noqa: E402


def _set_market(market):
    cfg = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    cfg["market"] = market
    save_json(CONFIG_FILE, cfg)


class _Resp:
    def __init__(self, payload):
        self._p = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._p


class _Client:
    def __init__(self, payload):
        self._p = payload
        self.params = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, url, params=None):
        self.params = params
        return _Resp(self._p)


def test_disabled_returns_empty_without_fetching():
    _set_market({"enabled": False, "coins": ["bitcoin"], "currency": "usd"})
    d._price_cache["ts"] = 0.0
    d._price_cache["data"] = None
    out = asyncio.run(d.get_market_prices())
    assert out["enabled"] is False
    assert out["prices"] == {}


def test_enabled_fetches_multiple_coins():
    _set_market({"enabled": True, "coins": ["bitcoin", "bitcoin-cash"], "currency": "eur"})
    d._price_cache["ts"] = 0.0
    d._price_cache["data"] = None
    payload = {
        "bitcoin": {"eur": 90000, "eur_24h_change": 1.5},
        "bitcoin-cash": {"eur": 400, "eur_24h_change": -2.0},
    }
    client = _Client(payload)
    with patch.object(d.httpx, "AsyncClient", lambda *a, **k: client):
        out = asyncio.run(d.get_market_prices())
    assert out["coins"] == ["bitcoin", "bitcoin-cash"]
    assert out["currency"] == "eur"
    assert out["prices"]["bitcoin"]["eur"] == 90000
    # both coins requested, with 24h change
    assert client.params["ids"] == "bitcoin,bitcoin-cash"
    assert client.params["include_24hr_change"] == "true"


def test_legacy_coin_id_still_works():
    _set_market({"enabled": True, "coin_id": "litecoin", "currency": "usd"})
    d._price_cache["ts"] = 0.0
    d._price_cache["data"] = None
    client = _Client({"litecoin": {"usd": 70}})
    with patch.object(d.httpx, "AsyncClient", lambda *a, **k: client):
        out = asyncio.run(d.get_market_prices())
    assert out["coins"] == ["litecoin"]
