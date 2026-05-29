"""Base class for per-miner-family drivers (MinerWatch-inspired).

Each supported miner family lives in its own module under ``miners/`` and
exposes a :class:`MinerDriver` subclass plus module-level helper functions
(fetch / probe / actions) that the routers and background loops reuse.

The capability flags advertise what a family supports so the UI/back-end can
gate features generically. The hot polling path still uses the module-level
``fetch_*`` helpers with a shared ``httpx.AsyncClient`` for efficiency; the
driver methods are thin wrappers around the same logic.
"""

from dataclasses import dataclass

import httpx


@dataclass
class PoolConfig:
    """Normalized pool/wallet config used by set_pool across families."""
    url: str = ""
    user: str = ""
    password: str = "x"
    port: int = 0


class MinerDriver:
    """Base driver. Subclasses set ``family`` and override the methods their
    capability flags enable."""

    family: str = "base"
    can_set_fan: bool = False
    can_set_frequency: bool = False
    can_set_voltage: bool = False
    can_restart: bool = False
    can_set_pool: bool = False

    def __init__(self, host: str, port: int | None = None, timeout: float = 10.0):
        self.host = host
        self.port = port
        self.timeout = timeout

    async def poll(self) -> dict:
        """Fetch and return a normalized device dict (same shape consumers expect)."""
        raise NotImplementedError

    async def restart(self) -> bool:
        raise NotImplementedError

    async def set_pool(self, config: PoolConfig) -> bool:
        raise NotImplementedError

    async def set_fan_speed(self, percent: int) -> bool:
        raise NotImplementedError

    async def set_frequency(self, mhz: int) -> bool:
        raise NotImplementedError

    async def set_voltage(self, millivolts: int) -> bool:
        raise NotImplementedError

    @classmethod
    async def probe(cls, ip: str, client: httpx.AsyncClient) -> dict | None:
        """Return a discovery record dict if ``ip`` is this family, else None."""
        return None
