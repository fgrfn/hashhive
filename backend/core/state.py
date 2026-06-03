"""Mutable in-process shared state (mutated in place, never reassigned)."""

from datetime import datetime, timezone

_startup_time = datetime.now(timezone.utc)

_price_cache: dict = {"ts": 0.0, "data": {}}

_low_hr_since: dict[str, float] = {}        # AxeOS: ip → ts when low hashrate first seen

# Server-side pool health monitoring (poolhealth.py)
_pool_health: dict = {}                     # url -> {"up": bool, "latency_ms": float|None, "devices": int, "since": iso-str}
_pool_last_check: dict = {"ts": 0.0}        # rate-limit timestamp for pool health checks
