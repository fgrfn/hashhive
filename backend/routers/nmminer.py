"""NMMiner router."""

import asyncio
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException

from core import (
    CONFIG_FILE,
    DEFAULT_CONFIG,
    _append_entry,
    _validate_device_ip,
    load_json,
)

router = APIRouter()


async def _fetch_nmminer_safe(
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

    return {"devices": [], "_error": "no NMMiner configured"}


@router.get("/api/nmminer/swarm")
async def get_nmminer_swarm():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    master = config.get("nmminer_master", "")
    nm_devices = config.get("nmminer_devices", [])
    async with httpx.AsyncClient(timeout=10) as client:
        return await _fetch_nmminer_safe(client, master, nm_devices)


@router.get("/api/nmminer/config")
async def get_nmminer_config():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    master = config.get("nmminer_master", "")
    if master:
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.get(f"http://{master}/config")
                resp.raise_for_status()
                return resp.json()
            except Exception:
                pass  # fall through to per-device queries
    devices = config.get("nmminer_devices", [])
    if not devices:
        return {"configs": []}
    configs = []
    async with httpx.AsyncClient(timeout=5) as client:
        async def _fetch_cfg(ip: str):
            try:
                r = await client.get(f"http://{ip}/config")
                r.raise_for_status()
                data = r.json()
                entries = data.get("configs", []) if isinstance(data, dict) else []
                for e in entries:
                    if e.get("ip") == ip:
                        configs.append(e)
                        return
                configs.append({"ip": ip, "config": data})
            except Exception:
                pass
        await asyncio.gather(*[_fetch_cfg(d["ip"]) for d in devices if d.get("ip")])
    return {"configs": configs}


@router.get("/api/nmminer/scan")
async def scan_nmminer_devices():
    """Scan the local /24 subnet for NMMiner devices (no master IP required)."""
    import socket as _socket
    try:
        s = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Could not determine local network interface")

    parts = local_ip.split(".")
    subnet = ".".join(parts[:3])

    NM_FIELDS = {"PrimaryPool", "WiFiSSID", "Hostname", "PrimaryAddress"}
    found: list[dict] = []
    sem = asyncio.Semaphore(60)

    limits = httpx.Limits(max_connections=60, max_keepalive_connections=0)
    async with httpx.AsyncClient(timeout=1.5, limits=limits) as client:
        async def _probe(ip: str):
            async with sem:
                for path in ("/swarm", "/config"):
                    try:
                        resp = await client.get(f"http://{ip}{path}")
                        if resp.status_code != 200:
                            continue
                        data = resp.json()
                        if path == "/swarm":
                            devs = data if isinstance(data, list) else \
                                   data.get("devices", data.get("miners", data.get("workers", None)))
                            if isinstance(devs, list):
                                found.append({
                                    "ip": ip,
                                    "role": "master",
                                    "device_count": len(devs),
                                    "devices": [
                                        {"ip": d.get("ip", ip), "name": d.get("hostname") or d.get("name") or d.get("ip", ip)}
                                        for d in devs if isinstance(d, dict)
                                    ],
                                })
                                return
                        elif path == "/config":
                            configs = data.get("configs") if isinstance(data, dict) else None
                            if isinstance(configs, list):
                                found.append({
                                    "ip": ip,
                                    "role": "master",
                                    "device_count": len(configs),
                                    "devices": [
                                        {"ip": e.get("ip", ip), "name": (e.get("config") or {}).get("Hostname") or e.get("ip", ip)}
                                        for e in configs if isinstance(e, dict)
                                    ],
                                })
                                return
                            if isinstance(data, dict) and NM_FIELDS & set(data.keys()):
                                found.append({
                                    "ip": ip,
                                    "role": "device",
                                    "device_count": 1,
                                    "devices": [{"ip": ip, "name": data.get("Hostname", ip)}],
                                })
                                return
                    except Exception:
                        pass

        await asyncio.gather(*[_probe(f"{subnet}.{i}") for i in range(1, 255)])

    return {"subnet": f"{subnet}.0/24", "local_ip": local_ip, "found": found}


@router.post("/api/nmminer/broadcast-config")
async def broadcast_nmminer_config(data: dict):
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    master = config.get("nmminer_master", "")
    if not master:
        raise HTTPException(status_code=400, detail="No NMMiner master configured")
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.post(f"http://{master}/broadcast-config", json=data)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))


@router.get("/api/nmminer/device-config")
async def get_nmminer_device_config(ip: str):
    _validate_device_ip(ip)
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(f"http://{ip}/config")
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, dict) and "configs" in data:
                for entry in data["configs"]:
                    if entry.get("ip") == ip:
                        return entry.get("config", entry)
                if data["configs"]:
                    first = data["configs"][0]
                    return first.get("config", first)
            return data
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))


@router.post("/api/nmminer/device-config")
async def post_nmminer_device_config(data: dict):
    device_ip = data.get("ip")
    if not device_ip:
        raise HTTPException(status_code=400, detail="ip field required in body")
    _validate_device_ip(device_ip)
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.post(f"http://{device_ip}/broadcast-config", json=data)
            hostname = data.get("Hostname") or device_ip
            now = datetime.now(timezone.utc).isoformat()
            _append_entry({
                "id": f"nmminer:{device_ip}:config_saved:{now}",
                "device": f"nmminer:{device_ip}",
                "kind": "config_saved",
                "severity": "info",
                "message": f"NMMiner {hostname} config saved",
                "timestamp": now,
                "read": True,
                "source": "nmminer",
            })
            return {"status": resp.status_code, "detail": resp.text[:200]}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))
