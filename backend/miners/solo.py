"""SoloMiner (NerdMiner v2 / SparkMiner) drivers + helpers.

Moved out of routers/solominer.py. These ESP lottery miners speak a simple
``GET /stats`` / ``POST /settings`` protocol.
"""

import httpx

from .base import MinerDriver

# Fields that identify a NerdMiner/SparkMiner during a scan/probe.
SOLO_FIELDS = {"hashRate", "walletAddress", "poolUrl", "minerName", "runningTime"}


async def fetch_solo_miner(client: httpx.AsyncClient, device: dict) -> dict:
    """Fetch stats from a NerdMiner v2 or SparkMiner device via GET /stats."""
    ip = device.get("ip", "")
    name = device.get("name", ip)
    device_type = device.get("type", "nerdminer")
    temp_max = device.get("temp_max")
    try:
        resp = await client.get(f"http://{ip}/stats")
        resp.raise_for_status()
        data = resp.json()
        data.update({
            "_ip": ip,
            "_name": name,
            "_type": device_type,
            "_online": True,
            "_temp_max": temp_max,
            # Normalize key fields for unified rendering
            "ip": ip,
            "hostname": data.get("hostname") or data.get("minerName") or name,
            "hashRate": data.get("hashRate") or data.get("hashes") or "0KH/s",
            "temp": data.get("temp") or data.get("temperature") or 0,
            "walletAddress": data.get("walletAddress") or data.get("wallet") or "",
            "poolUrl": data.get("poolUrl") or data.get("pool") or "",
            "poolPort": data.get("poolPort") or data.get("port") or 0,
            "bestDiff": str(data.get("bestDiff") or data.get("best_diff") or ""),
            "uptime": data.get("runningTime") or data.get("uptime") or data.get("uptimeSeconds") or 0,
            "version": data.get("version") or "",
            "online": True,
        })
        return data
    except Exception:
        return {
            "_ip": ip, "_name": name, "_type": device_type,
            "_online": False, "_temp_max": temp_max,
            "ip": ip, "hostname": name, "online": False,
        }


async def probe_solo(ip: str, client: httpx.AsyncClient) -> dict | None:
    """Discovery probe: detect a NerdMiner/SparkMiner via GET /stats."""
    try:
        resp = await client.get(f"http://{ip}/stats", timeout=2.0)
        if resp.status_code != 200:
            return None
        data = resp.json()
        if not (SOLO_FIELDS & set(data.keys())):
            return None
        dtype = "sparkminer" if "spark" in str(data.get("minerName", "")).lower() else "nerdminer"
        return {"ip": ip, "type": dtype,
                "name": data.get("hostname") or data.get("minerName") or ip,
                "hashrate": data.get("hashRate", "0KH/s"),
                "temp": data.get("temp", 0), "version": data.get("version", "")}
    except Exception:
        return None


class _SoloDriver(MinerDriver):
    can_restart = True
    can_set_pool = True

    async def poll(self) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            return await fetch_solo_miner(client, {"ip": self.host, "type": self.family})

    @classmethod
    async def probe(cls, ip: str, client: httpx.AsyncClient) -> dict | None:
        rec = await probe_solo(ip, client)
        # Only claim the record if it matches this family.
        if rec and rec.get("type") == cls.family:
            return rec
        return None


class NerdminerDriver(_SoloDriver):
    family = "nerdminer"


class SparkminerDriver(_SoloDriver):
    family = "sparkminer"
