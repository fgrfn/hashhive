"""Server-side pool health monitoring.

Continuously checks whether the stratum pools that the fleet actually uses are
reachable (TCP connect), records their state in shared in-process state, and
produces transition alerts (unreachable / reachable-again) that flow through the
normal ``alerts.check_alerts`` persistence + notification path.
"""

import asyncio
import time
from datetime import datetime, timezone

from .state import _pool_health, _pool_last_check

# How often (seconds) we actually re-ping pools. The broadcast loop calls
# check_alerts every cycle; we don't want to hammer pools each time.
_CHECK_INTERVAL = 45.0
_TCP_TIMEOUT = 4.0


def _pool_target(url: str) -> tuple[str, int] | None:
    """Strip the scheme (e.g. ``stratum+tcp://``) and parse ``host:port``.

    Returns ``(host, port)`` or ``None`` if the URL is blank/malformed.
    """
    if not url or not isinstance(url, str):
        return None
    host_port = url.split("://")[-1].strip().strip("/").split("/")[0]
    if ":" not in host_port:
        return None
    host, _, port_s = host_port.rpartition(":")
    try:
        port = int(port_s)
    except ValueError:
        return None
    if not host or not (1 <= port <= 65535):
        return None
    return host, port


async def _tcp_latency(host: str, port: int, timeout: float = _TCP_TIMEOUT) -> float | None:
    """Measure TCP connect latency in ms, or ``None`` on failure."""
    start = time.perf_counter()
    writer = None
    try:
        _, writer = await asyncio.wait_for(asyncio.open_connection(host, port), timeout=timeout)
        return round((time.perf_counter() - start) * 1000, 1)
    except Exception:
        return None
    finally:
        if writer is not None:
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_pool_alert(url: str, kind: str, severity: str, message: str) -> dict:
    """Build an alert dict matching the shape produced by ``alerts._make_alert``."""
    device_key = f"pool:{url}"
    now = _now_iso()
    return {
        "id": f"{device_key}:{kind}:{now}",
        "device": device_key,
        "kind": kind,
        "severity": severity,
        "message": message,
        "timestamp": now,
        "read": False,
        "source": "pool",
    }


def _collect_pools(nm_results, axe_results) -> dict[str, int]:
    """Map unique pool URL -> count of online devices using it."""
    counts: dict[str, int] = {}

    def _add(url) -> None:
        key = (str(url).strip() if url else "")
        if not key:
            return
        if _pool_target(key) is None:
            return
        counts[key] = counts.get(key, 0) + 1

    raw_nm = nm_results if isinstance(nm_results, list) else (nm_results or {}).get("devices", [])
    if isinstance(raw_nm, list):
        for d in raw_nm:
            if not isinstance(d, dict):
                continue
            if d.get("_online") is False or d.get("online") is False:
                continue
            _add(d.get("pool") or d.get("stratumURL"))

    raw_axe = axe_results if isinstance(axe_results, list) else (axe_results or {}).get("devices", [])
    if isinstance(raw_axe, list):
        for d in raw_axe:
            if not isinstance(d, dict):
                continue
            if not d.get("_online", False):
                continue
            _add(_axe_pool_url(d))

    return counts


def _axe_pool_url(d: dict) -> str:
    """AxeOS reports host and port separately — combine into host:port so the
    pool is pingable (otherwise it has no port and is dropped from monitoring)."""
    use_fb = bool(d.get("isUsingFallbackStratum"))
    host = (d.get("fallbackStratumURL") if use_fb else d.get("stratumURL")) or d.get("stratumURL") or ""
    port = (d.get("fallbackStratumPort") if use_fb else d.get("stratumPort")) or d.get("stratumPort")
    host = str(host).strip()
    if not host:
        return ""
    stripped = host.split("://")[-1]
    if ":" in stripped:  # already has a port
        return host
    return f"{host}:{port}" if port else host


async def check_pool_health(config: dict, nm_results, axe_results) -> list[dict]:
    """Ping the in-use pools (rate-limited) and emit transition alerts.

    Returns a list of alert dicts (same shape as ``alerts._make_alert``) for
    pools that flipped up<->down. Updates ``_pool_health`` in place.
    """
    now = time.time()
    if now - _pool_last_check.get("ts", 0.0) < _CHECK_INTERVAL:
        return []
    _pool_last_check["ts"] = now

    counts = _collect_pools(nm_results, axe_results)
    urls = list(counts.keys())

    async def _probe(url: str) -> float | None:
        target = _pool_target(url)
        if target is None:
            return None
        return await _tcp_latency(*target)

    latencies = await asyncio.gather(*[_probe(u) for u in urls]) if urls else []

    alerts: list[dict] = []
    health_cfg = config.get("pool_health", {}) if isinstance(config, dict) else {}
    failure_checks = max(1, int(health_cfg.get("failure_checks", 2) or 2))
    recovery_checks = max(1, int(health_cfg.get("recovery_checks", 2) or 2))
    for url, latency in zip(urls, latencies):
        up = latency is not None
        prev = _pool_health.get(url)
        target = _pool_target(url)
        label = f"{target[0]}:{target[1]}" if target else url
        devices = counts[url]

        if prev is None:
            # Treat a new pool as healthy until repeated failed probes confirm
            # otherwise. Its observed state is still exposed immediately.
            confirmed_up = True
            pending_up = up
            pending_count = 0 if up else 1
            since = _now_iso()
        else:
            confirmed_up = bool(prev.get("confirmed_up", prev.get("up", True)))
            if up == confirmed_up:
                pending_up = up
                pending_count = 0
                since = prev.get("since") or _now_iso()
            else:
                pending_up = up
                pending_count = (
                    int(prev.get("pending_count", 0)) + 1
                    if prev.get("pending_up") == up else 1
                )
                required = recovery_checks if up else failure_checks
                if pending_count >= required:
                    was_up = confirmed_up
                    confirmed_up = up
                    pending_count = 0
                    since = _now_iso()
                    if was_up and not up:
                        alerts.append(_make_pool_alert(
                            url, "pool_unreachable", "critical",
                            f"Pool {label} is unreachable ({devices} device(s) affected)",
                        ))
                    elif not was_up and up:
                        alerts.append(_make_pool_alert(
                            url, "pool_reachable", "info",
                            f"Pool {label} is reachable again",
                        ))
                else:
                    since = prev.get("since") or _now_iso()

        _pool_health[url] = {
            "up": up,
            "confirmed_up": confirmed_up,
            "pending_up": pending_up,
            "pending_count": pending_count,
            "latency_ms": latency,
            "devices": devices,
            "since": since,
        }

    # Prune pools no longer in use.
    for stale in [u for u in _pool_health if u not in counts]:
        del _pool_health[stale]

    return alerts
