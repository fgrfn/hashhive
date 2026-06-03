"""Tests for server-side pool health monitoring."""
import asyncio
import os
import sys
import tempfile
from pathlib import Path

_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("HASHHIVE_DATA_DIR", _tmpdir)
(Path(_tmpdir) / "logs").mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(Path(__file__).parent.parent))

from core import poolhealth  # noqa: E402
from core.state import _pool_health, _pool_last_check  # noqa: E402


def test_pool_target_parsing():
    assert poolhealth._pool_target("stratum+tcp://eu.pool.io:3333") == ("eu.pool.io", 3333)
    assert poolhealth._pool_target("eu.pool.io:3333") == ("eu.pool.io", 3333)
    assert poolhealth._pool_target("eu.pool.io") is None        # no port
    assert poolhealth._pool_target("eu.pool.io:abc") is None     # bad port
    assert poolhealth._pool_target("") is None
    assert poolhealth._pool_target(None) is None


def _reset():
    _pool_health.clear()
    _pool_last_check["ts"] = 0.0


def _run(nm, axe, latency):
    """Run a check with _tcp_latency stubbed to a fixed value and the rate-limit reset."""
    _pool_last_check["ts"] = 0.0  # force a real check each call

    async def _fake_latency(host, port, timeout=4.0):
        return latency

    orig = poolhealth._tcp_latency
    poolhealth._tcp_latency = _fake_latency
    try:
        return asyncio.run(poolhealth.check_pool_health({}, nm, axe))
    finally:
        poolhealth._tcp_latency = orig


def test_transition_alerts_and_state():
    _reset()
    nm = [{"_online": True, "pool": "stratum+tcp://eu.pool.io:3333"}]

    # First observation, pool up → no alert, but state recorded.
    alerts = _run(nm, [], latency=12.0)
    assert alerts == []
    assert _pool_health["stratum+tcp://eu.pool.io:3333"]["up"] is True
    assert _pool_health["stratum+tcp://eu.pool.io:3333"]["latency_ms"] == 12.0

    # Pool goes down → one critical pool_unreachable alert.
    alerts = _run(nm, [], latency=None)
    assert [a["kind"] for a in alerts] == ["pool_unreachable"]
    assert alerts[0]["severity"] == "critical"
    assert _pool_health["stratum+tcp://eu.pool.io:3333"]["up"] is False

    # Still down → no repeat alert (transition-based de-dup).
    alerts = _run(nm, [], latency=None)
    assert alerts == []

    # Recovers → one info pool_reachable alert.
    alerts = _run(nm, [], latency=8.0)
    assert [a["kind"] for a in alerts] == ["pool_reachable"]
    assert alerts[0]["severity"] == "info"


def test_first_observation_down_alerts():
    _reset()
    nm = [{"_online": True, "pool": "down.pool.io:3333"}]
    alerts = _run(nm, [], latency=None)
    assert [a["kind"] for a in alerts] == ["pool_unreachable"]


def test_rate_limit_skips_repeated_checks():
    _reset()
    nm = [{"_online": True, "pool": "eu.pool.io:3333"}]

    async def _fake_latency(host, port, timeout=4.0):
        return 5.0

    orig = poolhealth._tcp_latency
    poolhealth._tcp_latency = _fake_latency
    try:
        asyncio.run(poolhealth.check_pool_health({}, nm, []))   # sets ts ~ now
        # Immediately again — should be rate-limited and return [] without re-pinging.
        out = asyncio.run(poolhealth.check_pool_health({}, nm, []))
        assert out == []
    finally:
        poolhealth._tcp_latency = orig


def test_offline_devices_and_stale_pruning():
    _reset()
    # Online device on pool A, offline device on pool B → only A is monitored.
    nm = [
        {"_online": True, "pool": "a.pool.io:3333"},
        {"_online": False, "pool": "b.pool.io:3333"},
    ]
    _run(nm, [], latency=10.0)
    assert "a.pool.io:3333" in _pool_health
    assert "b.pool.io:3333" not in _pool_health

    # Now no devices use pool A → it gets pruned.
    _run([], [], latency=10.0)
    assert "a.pool.io:3333" not in _pool_health


def test_axe_pool_url_combines_host_and_port():
    from core.poolhealth import _axe_pool_url, _collect_pools
    # bare host + separate port → combined
    assert _axe_pool_url({"stratumURL": "bch.hmpool.io", "stratumPort": 3333}) == "bch.hmpool.io:3333"
    # already has a port → unchanged
    assert _axe_pool_url({"stratumURL": "eu.pool.io:3337"}) == "eu.pool.io:3337"
    # fallback active → uses fallback host/port
    assert _axe_pool_url({"isUsingFallbackStratum": 1, "fallbackStratumURL": "fb.io",
                          "fallbackStratumPort": 4444, "stratumURL": "p.io", "stratumPort": 3333}) == "fb.io:4444"
    # an AxeOS device with a port-less stratumURL is now monitored (was dropped before)
    counts = _collect_pools([], [{"_online": True, "stratumURL": "bch.hmpool.io", "stratumPort": 3333}])
    assert counts == {"bch.hmpool.io:3333": 1}
