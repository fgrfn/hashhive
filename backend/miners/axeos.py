"""AxeOS (BitAxe / NerdAxe) miner driver + helpers.

Moved out of routers/axeos.py so all AxeOS device logic lives in one place.
The router imports these helpers and keeps the HTTP endpoints.
"""

import asyncio

import httpx

from .base import MinerDriver

# Writeable config fields exposed by GET /api/axeos/config/{ip}
CONFIG_FIELDS = {
    "stratumURL", "stratumUser", "stratumPassword", "stratumPort",
    "fallbackStratumURL", "fallbackStratumUser", "fallbackStratumPassword", "fallbackStratumPort",
    "frequency", "coreVoltage", "fanspeed", "autofanspeed", "temptarget",
    "hostname", "ssid",
}

AXE_ACTIONS = {"pause", "resume", "restart", "identify"}

# Fields that identify an AxeOS device during a network scan/probe.
_AXE_PROBE_FIELDS = {"hashRate", "ASICModel", "stratumURL", "uptimeSeconds"}


async def fetch_axeos_device(client: httpx.AsyncClient, device) -> dict:
    if isinstance(device, str):
        device = {"ip": device, "name": device, "type": "bitaxe"}
    ip = device.get("ip", "")
    name = device.get("name", ip)
    device_type = device.get("type", "bitaxe")
    temp_max = device.get("temp_max")  # per-device override, may be None
    try:
        resp = await client.get(f"http://{ip}/api/system/info")
        resp.raise_for_status()
        data = resp.json()
        data.update({"_ip": ip, "_name": name, "_type": device_type, "_online": True, "_temp_max": temp_max})
        return data
    except Exception:
        return {"_ip": ip, "_name": name, "_type": device_type, "_online": False, "_temp_max": temp_max}


async def axeos_fanout(action: str, ips: list[str]) -> list[dict]:
    """Fire an AxeOS system action at many devices concurrently. Reused by the
    batch endpoint, schedules and group actions."""
    results: list[dict] = []
    limits = httpx.Limits(max_connections=30, max_keepalive_connections=0)
    async with httpx.AsyncClient(timeout=15, limits=limits) as client:
        async def _act(ip: str):
            try:
                resp = await client.post(f"http://{ip}/api/system/{action}")
                results.append({"ip": ip, "status": resp.status_code})
            except Exception as exc:
                results.append({"ip": ip, "error": str(exc)})
        await asyncio.gather(*[_act(ip) for ip in ips])
    return results


async def probe_axeos(ip: str, client: httpx.AsyncClient) -> dict | None:
    """Discovery probe: return an AxeOS record (with MAC if available) or None."""
    try:
        resp = await client.get(f"http://{ip}/api/system/info", timeout=2.0)
        if resp.status_code != 200:
            return None
        data = resp.json()
        if not (_AXE_PROBE_FIELDS & set(data.keys())):
            return None
        asic = data.get("ASICModel", "")
        dtype = "nerdaxe" if "nerd" in data.get("hostname", "").lower() or "1397" in asic else "bitaxe"
        mac = data.get("macAddr") or data.get("macAddress")
        result = {"ip": ip, "type": dtype, "name": data.get("hostname", ip),
                  "asic": asic, "hashrate": data.get("hashRate", 0), "temp": data.get("temp", 0)}
        if mac:
            result["mac"] = str(mac).lower()
        return result
    except Exception:
        return None


class AxeosDriver(MinerDriver):
    family = "axeos"
    can_set_fan = True
    can_set_frequency = True
    can_set_voltage = True
    can_restart = True
    can_set_pool = True

    async def poll(self) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            return await fetch_axeos_device(client, {"ip": self.host})

    async def restart(self) -> bool:
        res = await axeos_fanout("restart", [self.host])
        return bool(res and res[0].get("status", 500) < 400)

    async def set_fan_speed(self, percent: int) -> bool:
        pct = max(0, min(100, int(percent)))
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.patch(f"http://{self.host}/api/system",
                                      json={"autofanspeed": 0, "fanspeed": pct})
            return resp.status_code < 400

    @classmethod
    async def probe(cls, ip: str, client: httpx.AsyncClient) -> dict | None:
        return await probe_axeos(ip, client)
