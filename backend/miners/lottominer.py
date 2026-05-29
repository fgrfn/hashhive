"""Lottominer (NMMiner-style ESP32 master/swarm) driver + helpers.

Moved out of routers/lottominer.py. The router keeps the HTTP endpoints and
imports these helpers.
"""

import asyncio
from datetime import datetime, timezone

import httpx

from core import _append_entry, _validate_device_ip

from .base import MinerDriver

LOTTO_ACTION_MAP = {
    "restart": "/reboot",
}

# Fields that identify an NMMiner-style device config during a scan/probe.
_NM_PROBE_FIELDS = {"PrimaryPool", "WiFiSSID", "Hostname", "PrimaryAddress"}


async def fetch_lottominer_safe(
    client: httpx.AsyncClient,
    master: str,
    nm_devices: list | None = None,
) -> dict:
    def _normalize(data) -> dict | None:
        if isinstance(data, list):
            return {"devices": data}
        if isinstance(data, dict):
            if "devices" in data and isinstance(data["devices"], list):
                return data
            for key in ("miners", "workers", "peers", "swarm", "data"):
                if key in data and isinstance(data[key], list):
                    return {"devices": data[key]}
            values = list(data.values())
            if values and isinstance(values[0], dict) and any(
                k in values[0] for k in ("ip", "hashrate", "GHs", "temp", "pool")
            ):
                return {"devices": [{"ip": k, **v} for k, v in data.items() if isinstance(v, dict)]}
        return None

    # Try master first (one request for all devices)
    if master:
        try:
            resp = await client.get(f"http://{master}/swarm")
            resp.raise_for_status()
            result = _normalize(resp.json())
            if result is not None:
                # Also fetch master config to get PrimaryPool / PrimaryAddress (wallet)
                try:
                    cfg_resp = await client.get(f"http://{master}/config")
                    cfg_resp.raise_for_status()
                    master_cfg = cfg_resp.json()
                    if isinstance(master_cfg, dict):
                        cfg_list = master_cfg.get("configs") if "configs" in master_cfg else None
                        if isinstance(cfg_list, list) and cfg_list:
                            cfg_by_ip_map: dict = {}
                            cfg_by_host_map: dict = {}
                            for c in cfg_list:
                                entry_ip = c.get("ip", "")
                                actual = c.get("config", c) if isinstance(c, dict) else c
                                if entry_ip:
                                    cfg_by_ip_map[entry_ip] = (entry_ip, actual)
                                host = (actual.get("Hostname") or actual.get("hostname") or "")
                                if host:
                                    cfg_by_host_map[host] = (entry_ip, actual)

                            for dev in result.get("devices", []):
                                dev_ip = dev.get("ip", "")
                                dev_host = dev.get("hostname") or dev.get("name") or ""
                                if dev_ip and dev_ip in cfg_by_ip_map:
                                    entry_ip, actual = cfg_by_ip_map[dev_ip]
                                elif dev_host and dev_host in cfg_by_host_map:
                                    entry_ip, actual = cfg_by_host_map[dev_host]
                                    if not dev_ip and entry_ip:
                                        dev["ip"] = entry_ip
                                else:
                                    c0 = cfg_list[0]
                                    entry_ip = c0.get("ip", "")
                                    actual = c0.get("config", c0) if isinstance(c0, dict) else c0
                                pool = actual.get("PrimaryPool") or actual.get("pool") or ""
                                addr = actual.get("PrimaryAddress") or actual.get("user") or ""
                                if pool and not dev.get("PrimaryPool"):
                                    dev["PrimaryPool"] = pool
                                if addr and not dev.get("PrimaryAddress") and not dev.get("worker") and not dev.get("user"):
                                    dev["PrimaryAddress"] = addr
                        else:
                            actual_top = master_cfg.get("config", master_cfg)
                            primary_pool = actual_top.get("PrimaryPool") or actual_top.get("pool") or ""
                            primary_addr = actual_top.get("PrimaryAddress") or actual_top.get("user") or ""
                            for dev in result.get("devices", []):
                                if primary_pool and not dev.get("PrimaryPool"):
                                    dev["PrimaryPool"] = primary_pool
                                if primary_addr and not dev.get("PrimaryAddress") and not dev.get("worker") and not dev.get("user"):
                                    dev["PrimaryAddress"] = primary_addr
                except Exception:
                    pass  # config fetch is best-effort; swarm data still usable
                # Enrich with per-device config overrides by IP
                if nm_devices:
                    cfg_by_ip = {d["ip"]: d for d in nm_devices if d.get("ip")}
                    for dev in result.get("devices", []):
                        ip = dev.get("ip", "")
                        if ip in cfg_by_ip:
                            dev["_temp_max"] = cfg_by_ip[ip].get("temp_max")
                return result
        except Exception:
            pass  # fall through to per-device queries

    # Fallback: query each known device individually
    if nm_devices:
        all_devs: list = []
        cfg_by_ip = {d["ip"]: d for d in nm_devices if d.get("ip")}

        async def _fetch_one(ip: str):
            try:
                r = await client.get(f"http://{ip}/swarm")
                r.raise_for_status()
                data = r.json()
                devs = data if isinstance(data, list) else data.get("devices", [data])
                devs = devs if isinstance(devs, list) else [devs]
                primary_pool = ""
                primary_addr = ""
                try:
                    cr = await client.get(f"http://{ip}/config")
                    cr.raise_for_status()
                    cfg = cr.json()
                    if isinstance(cfg, dict):
                        cfg_items = cfg.get("configs")
                        if isinstance(cfg_items, list) and cfg_items:
                            match = next((c for c in cfg_items if c.get("ip") == ip), cfg_items[0])
                        else:
                            match = cfg
                        actual = match.get("config", match) if isinstance(match, dict) else match
                        primary_pool = actual.get("PrimaryPool") or actual.get("pool") or ""
                        primary_addr = actual.get("PrimaryAddress") or actual.get("user") or ""
                except Exception:
                    pass
                for dev in devs:
                    if not dev.get("ip"):
                        dev["ip"] = ip
                    dev["_temp_max"] = cfg_by_ip.get(ip, {}).get("temp_max")
                    if primary_pool and not dev.get("PrimaryPool"):
                        dev["PrimaryPool"] = primary_pool
                    if primary_addr and not dev.get("PrimaryAddress") and not dev.get("worker") and not dev.get("user"):
                        dev["PrimaryAddress"] = primary_addr
                all_devs.extend(devs)
            except Exception:
                all_devs.append({"ip": ip, "online": False, "_temp_max": cfg_by_ip.get(ip, {}).get("temp_max")})

        await asyncio.gather(*[_fetch_one(d["ip"]) for d in nm_devices if d.get("ip")])
        return {"devices": all_devs}

    return {"devices": [], "_error": "no Lottominer configured"}


async def lottominer_fanout(action: str, ips: list[str]) -> list[dict]:
    """Fire a Lottominer action at many devices concurrently. Reused by the batch
    endpoint, schedules and group actions."""
    path = LOTTO_ACTION_MAP[action]
    results: list[dict] = []

    async def _act(ip: str):
        _validate_device_ip(ip)
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.post(f"http://{ip}{path}")
                results.append({"ip": ip, "status": resp.status_code})
                now = datetime.now(timezone.utc).isoformat()
                _append_entry({
                    "id": f"lottominer:{ip}:{action}:{now}",
                    "device": f"lottominer:{ip}",
                    "kind": f"device_{action}",
                    "severity": "info",
                    "message": f"Lottominer {ip}: {action} triggered",
                    "timestamp": now,
                    "read": True,
                    "source": "lottominer",
                })
        except Exception as exc:
            results.append({"ip": ip, "status": 0, "error": str(exc)})

    await asyncio.gather(*[_act(ip) for ip in ips])
    return results


async def probe_lottominer(ip: str, client: httpx.AsyncClient) -> dict | None:
    """Discovery probe: detect an NMMiner-style master or standalone device."""
    for path in ("/swarm", "/config"):
        try:
            resp = await client.get(f"http://{ip}{path}", timeout=2.0)
            if resp.status_code != 200:
                continue
            data = resp.json()
            if path == "/swarm":
                devs = data if isinstance(data, list) else \
                    data.get("devices", data.get("miners", data.get("workers")))
                if isinstance(devs, list):
                    return {"ip": ip, "type": "lottominer_master", "name": f"Lottominer master ({ip})",
                            "device_count": len(devs)}
            elif path == "/config":
                if isinstance(data, dict):
                    configs = data.get("configs")
                    if isinstance(configs, list):
                        return {"ip": ip, "type": "lottominer_master", "name": f"Lottominer master ({ip})",
                                "device_count": len(configs)}
                    if _NM_PROBE_FIELDS & set(data.keys()):
                        return {"ip": ip, "type": "lottominer_device",
                                "name": data.get("Hostname", ip), "device_count": 1}
        except Exception:
            pass
    return None


class LottominerDriver(MinerDriver):
    family = "lottominer"
    can_restart = True
    can_set_pool = True

    async def poll(self) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            return await fetch_lottominer_safe(client, self.host, None)

    async def restart(self) -> bool:
        res = await lottominer_fanout("restart", [self.host])
        return bool(res and res[0].get("status", 500) < 400)

    @classmethod
    async def probe(cls, ip: str, client: httpx.AsyncClient) -> dict | None:
        return await probe_lottominer(ip, client)
