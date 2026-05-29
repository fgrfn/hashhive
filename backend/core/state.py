"""Mutable in-process shared state (mutated in place, never reassigned)."""

from datetime import datetime, timezone

_startup_time = datetime.now(timezone.utc)

_price_cache: dict = {"ts": 0.0, "data": {}}

_low_hr_since: dict[str, float] = {}        # AxeOS: ip → ts when low hashrate first seen
_solo_zero_hr_since: dict[str, float] = {}  # NerdMiner/SparkMiner: ip → ts when hr=0 first seen
