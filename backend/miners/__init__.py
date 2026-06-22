"""Miner driver registry.

One module per supported family; ``DRIVERS`` maps a family name to its driver
class. ``probe_all`` runs the discovery probes in order
(AxeOS → WroomMiner → NMMiner → AxeHub).

The Lottominer category is an umbrella for ESP-based lottery/solo miners and
covers several models, each with its own driver/native API: NMMiner
(``lottominer``), WroomMiner (``wroomminer``) and NerdMiner-AxeHub (``axehub``).
"""

from typing import Type

import httpx

from .axehub import AxehubDriver, probe_axehub
from .axeos import AxeosDriver, probe_axeos
from .base import MinerDriver, PoolConfig
from .lottominer import LottominerDriver, probe_lottominer
from .wroomminer import WroomminerDriver, probe_wroomminer

DRIVERS: dict[str, Type[MinerDriver]] = {
    "axeos": AxeosDriver,
    "bitaxe": AxeosDriver,
    "nerdaxe": AxeosDriver,
    "lottominer": LottominerDriver,
    "wroomminer": WroomminerDriver,
    "axehub": AxehubDriver,
}


def get_driver(family: str) -> Type[MinerDriver]:
    if family not in DRIVERS:
        raise ValueError(f"Unknown miner family: {family!r}")
    return DRIVERS[family]


def driver_for_record(record: dict) -> MinerDriver:
    """Instantiate a driver from a device record ({family|type, ip, ...})."""
    family = record.get("family") or record.get("type") or "axeos"
    cls = get_driver(family)
    return cls(record.get("ip") or record.get("_ip", ""))


async def probe_all(ip: str, client: httpx.AsyncClient) -> dict | None:
    """Probe an IP for any known miner family; first match wins."""
    return (
        await probe_axeos(ip, client)
        # WroomMiner is probed before the looser NMMiner /probe heuristic: it
        # ships an NMMiner-compat shim, but its strict /api/probe firmware check
        # avoids misclassifying it (and never matches a real NMMiner).
        or await probe_wroomminer(ip, client)
        or await probe_lottominer(ip, client)
        or await probe_axehub(ip, client)
    )


__all__ = [
    "MinerDriver", "PoolConfig", "DRIVERS", "get_driver", "driver_for_record", "probe_all",
    "AxeosDriver", "LottominerDriver", "WroomminerDriver", "AxehubDriver",
    "probe_axeos", "probe_lottominer", "probe_wroomminer", "probe_axehub",
]
