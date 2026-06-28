"""Tests for per-family pool-push normalization and primary/backup slot routing.

Covers the shared URL parser plus the push payloads each miner family receives,
which previously shipped malformed endpoints (e.g. AxeOS got ``host:port`` in a
field that wants the bare host with the port in a separate ``stratumPort``).
"""
import asyncio
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)
(Path(_tmpdir) / "logs").mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(Path(__file__).parent.parent))

from core import CONFIG_FILE, save_json  # noqa: E402
from miners.pool_url import parse_pool_endpoint  # noqa: E402
import routers.pools as pools  # noqa: E402


def _resp(status, payload):
    return type("R", (), {"status_code": status, "json": lambda self: payload,
                          "raise_for_status": lambda self: None})()


# ── Parser ────────────────────────────────────────────────────────────────────

def test_parse_bare_host_uses_default_port():
    ep = parse_pool_endpoint("public-pool.io", default_port=3333)
    assert ep.host == "public-pool.io" and ep.port == 3333 and not ep.tls


def test_parse_host_port():
    ep = parse_pool_endpoint("public-pool.io:13333")
    assert ep.host == "public-pool.io" and ep.port == 13333


def test_parse_strips_scheme_and_path():
    ep = parse_pool_endpoint("stratum+tcp://public-pool.io:13333/")
    assert ep.host == "public-pool.io" and ep.port == 13333
    assert ep.scheme == "stratum+tcp" and not ep.tls


def test_parse_detects_tls_scheme():
    ep = parse_pool_endpoint("stratum+ssl://pool.example:443")
    assert ep.host == "pool.example" and ep.port == 443 and ep.tls


def test_stratum_url_always_has_port_and_preserves_tls():
    # bare host -> default port filled in
    assert parse_pool_endpoint("pool.io").stratum_url() == "stratum+tcp://pool.io:3333"
    # tls scheme survives the round-trip
    assert parse_pool_endpoint("stratum+ssl://p:443").stratum_url() == "stratum+ssl://p:443"
    # default port can be overridden
    assert parse_pool_endpoint("pool.io").stratum_url(default_port=21496) == "stratum+tcp://pool.io:21496"


def test_host_port_property():
    assert parse_pool_endpoint("pool.io:3333").host_port == "pool.io:3333"
    assert parse_pool_endpoint("").host_port == ""


# ── Push routing helpers ──────────────────────────────────────────────────────

def _mock_client(captured: dict, hostname_payload: dict):
    """An AsyncClient stub: GET returns a hostname, PATCH/POST capture the body."""
    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)

    async def _get(url, **kw):
        return _resp(200, hostname_payload)

    async def _patch(url, json=None, **kw):
        captured["url"] = url
        captured["body"] = json
        return _resp(200, {})

    async def _post(url, json=None, **kw):
        captured["url"] = url
        captured["body"] = json
        return _resp(200, {})

    client.get = AsyncMock(side_effect=_get)
    client.patch = AsyncMock(side_effect=_patch)
    client.post = AsyncMock(side_effect=_post)
    return client


def _push(ip, pool, hostname_payload):
    captured = {}
    client = _mock_client(captured, hostname_payload)
    orig = pools.httpx.AsyncClient
    pools.httpx.AsyncClient = lambda *a, **k: client
    try:
        res = asyncio.run(pools.push_pool_to_device(ip, pool))
    finally:
        pools.httpx.AsyncClient = orig
    return res, captured


def test_axeos_primary_splits_host_and_port():
    save_json(CONFIG_FILE, {"axeos_devices": [{"ip": "10.0.0.5", "name": "axe", "type": "bitaxe"}]})
    res, cap = _push("10.0.0.5", {
        "url": "stratum+tcp://public-pool.io:13333", "wallet": "bc1qWALLET", "password": "x",
        "url2": "public-pool.io:3333",
    }, {"hostname": "axe01"})
    assert res["type"] == "axeos" and res["slot"] == "primary"
    b = cap["body"]
    # host carries no scheme and no port; the port lives in its own field
    assert b["stratumURL"] == "public-pool.io"
    assert b["stratumPort"] == 13333
    assert b["stratumUser"] == "bc1qWALLET.axe01"
    # fallback from url2
    assert b["fallbackStratumURL"] == "public-pool.io" and b["fallbackStratumPort"] == 3333


def test_axeos_backup_only_sets_fallback_fields():
    save_json(CONFIG_FILE, {"axeos_devices": [{"ip": "10.0.0.5", "name": "axe", "type": "bitaxe"}]})
    res, cap = _push("10.0.0.5", {
        "url": "public-pool.io:13333", "wallet": "bc1qW", "slot": "backup",
    }, {"hostname": "axe01"})
    assert res["slot"] == "backup"
    b = cap["body"]
    assert b["fallbackStratumURL"] == "public-pool.io" and b["fallbackStratumPort"] == 13333
    assert "stratumURL" not in b  # primary pool left untouched


def test_nmminer_primary_full_stratum_url():
    save_json(CONFIG_FILE, {"lottominer_devices": [{"ip": "10.0.0.9", "name": "nm"}]})
    res, cap = _push("10.0.0.9", {
        "url": "public-pool.io:13333", "wallet": "bc1qW", "password": "x",
    }, {"Hostname": "nm01"})
    assert res["type"] == "lottominer" and res["slot"] == "primary"
    b = cap["body"]
    assert b["PrimaryPool"] == "stratum+tcp://public-pool.io:13333"
    assert b["PrimaryAddress"] == "bc1qW.nm01"


def test_nmminer_backup_sets_secondary():
    save_json(CONFIG_FILE, {"lottominer_devices": [{"ip": "10.0.0.9", "name": "nm"}]})
    res, cap = _push("10.0.0.9", {
        "url": "public-pool.io:3333", "wallet": "bc1qW", "slot": "backup",
    }, {"Hostname": "nm01"})
    assert res["slot"] == "backup"
    b = cap["body"]
    assert b["SecondaryPool"] == "stratum+tcp://public-pool.io:3333"
    assert "PrimaryPool" not in b


def test_wroomminer_backup_writes_fallback():
    from miners.wroomminer import set_wroomminer_pool
    import miners.wroomminer as wm

    captured = {}
    client = _mock_client(captured, {})
    orig = wm.httpx.AsyncClient
    wm.httpx.AsyncClient = lambda *a, **k: client
    try:
        res = asyncio.run(set_wroomminer_pool("10.0.0.7", {
            "url": "solo.ckpool.org:3333", "wallet": "bc1qW",
        }, slot="backup"))
    finally:
        wm.httpx.AsyncClient = orig
    assert res["slot"] == "backup"
    assert captured["body"]["pool_fallback_url"] == "solo.ckpool.org"
    assert captured["body"]["pool_fallback_port"] == 3333
    assert "pool_primary_url" not in captured["body"]


def test_axehub_backup_is_skipped():
    from miners.axehub import set_axehub_pool
    res = asyncio.run(set_axehub_pool("10.0.0.8", {"url": "pool.io:3333"}, slot="backup"))
    assert res["status"] == "skipped" and res["slot"] == "backup"
