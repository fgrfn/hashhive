"""Lottominer router — generalized ESP-based lottery miners (formerly NMMiner).

Handles the NMMiner-style firmware (master/swarm + per-device config). NerdMiner
and SparkMiner are handled in solominer.py; the frontend Lottominer page unifies
all three families.
"""

import asyncio
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException

from core import (
    CONFIG_FILE,
    DEFAULT_CONFIG,
    NmActionBatchRequest,
    _append_entry,
    _validate_device_ip,
    load_json,
)
# Lottominer device logic lives in the miners/ driver package. Re-exported here
# so existing importers (dashboard, notifications) keep working.
from miners.lottominer import (  # noqa: F401
    LOTTO_ACTION_MAP as _LOTTO_ACTION_MAP,
    fetch_lottominer_safe as _fetch_lottominer_safe,
    lottominer_fanout,
)

router = APIRouter()


@router.get("/api/lottominer/swarm")
async def get_lottominer_swarm():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    master = config.get("lottominer_master", "")
    nm_devices = config.get("lottominer_devices", [])
    async with httpx.AsyncClient(timeout=10) as client:
        return await _fetch_lottominer_safe(client, master, nm_devices)


@router.get("/api/lottominer/config")
async def get_lottominer_config():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    master = config.get("lottominer_master", "")
    if master:
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.get(f"http://{master}/config")
                resp.raise_for_status()
                return resp.json()
            except Exception:
                pass  # fall through to per-device queries
    devices = config.get("lottominer_devices", [])
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


@router.get("/api/lottominer/scan")
async def scan_lottominer_devices():
    """Scan the local /24 subnet for Lottominer (NMMiner-style) devices."""
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


@router.post("/api/lottominer/action/batch")
async def lottominer_action_batch(data: NmActionBatchRequest):
    """Batch action across multiple Lottominer devices. Body: {action, ips: [...]}"""
    valid = set(_LOTTO_ACTION_MAP)
    if data.action not in valid:
        raise HTTPException(status_code=400, detail=f"action must be one of {valid}")
    results = await lottominer_fanout(data.action, data.ips)
    return {"action": data.action, "results": results}


@router.post("/api/lottominer/broadcast-config")
async def broadcast_lottominer_config(data: dict):
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    master = config.get("lottominer_master", "")
    if not master:
        raise HTTPException(status_code=400, detail="No Lottominer master configured")
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.post(f"http://{master}/broadcast-config", json=data)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))


@router.get("/api/lottominer/device-config")
async def get_lottominer_device_config(ip: str):
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


@router.post("/api/lottominer/device-config")
async def post_lottominer_device_config(data: dict):
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
                "id": f"lottominer:{device_ip}:config_saved:{now}",
                "device": f"lottominer:{device_ip}",
                "kind": "config_saved",
                "severity": "info",
                "message": f"Lottominer {hostname} config saved",
                "timestamp": now,
                "read": True,
                "source": "lottominer",
            })
            return {"status": resp.status_code, "detail": resp.text[:200]}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))
