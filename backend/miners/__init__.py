"""Miner driver registry.

One module per supported family; ``DRIVERS`` maps a family name to its driver
class. ``probe_all`` runs the discovery probes in the same order the unified
scan used previously (AxeOS → Lottominer → SoloMiner).
"""

from typing import Type

import httpx

from .axeos import AxeosDriver, probe_axeos
from .base import MinerDriver, PoolConfig
from .lottominer import LottominerDriver, probe_lottominer
from .solo import NerdminerDriver, SparkminerDriver, probe_solo

DRIVERS: dict[str, Type[MinerDriver]] = {
    "axeos": AxeosDriver,
    "bitaxe": AxeosDriver,
    "nerdaxe": AxeosDriver,
    "lottominer": LottominerDriver,
    "nerdminer": NerdminerDriver,
    "sparkminer": SparkminerDriver,
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
        or await probe_lottominer(ip, client)
        or await probe_solo(ip, client)
    )


__all__ = [
    "MinerDriver", "PoolConfig", "DRIVERS", "get_driver", "driver_for_record", "probe_all",
    "AxeosDriver", "LottominerDriver", "NerdminerDriver", "SparkminerDriver",
    "probe_axeos", "probe_lottominer", "probe_solo",
]
