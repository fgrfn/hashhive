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
            _add(d.get("stratumURL"))

    return counts


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
    for url, latency in zip(urls, latencies):
        up = latency is not None
        prev = _pool_health.get(url)
        target = _pool_target(url)
        label = f"{target[0]}:{target[1]}" if target else url
        devices = counts[url]

        if prev is None:
            # First observation. Only alert if already down (a problem worth
            # surfacing); never alert on a healthy pool seen for the first time.
            since = _now_iso()
            if not up:
                alerts.append(_make_pool_alert(
                    url, "pool_unreachable", "critical",
                    f"Pool {label} is unreachable ({devices} device(s) affected)",
                ))
        else:
            was_up = bool(prev.get("up"))
            if was_up == up:
                since = prev.get("since") or _now_iso()
            else:
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

        _pool_health[url] = {
            "up": up,
            "latency_ms": latency,
            "devices": devices,
            "since": since,
        }

    # Prune pools no longer in use.
    for stale in [u for u in _pool_health if u not in counts]:
        del _pool_health[stale]

    return alerts
