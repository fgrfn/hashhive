"""AxeOS router."""

import asyncio
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Query

from core import (
    CONFIG_FILE,
    DEFAULT_CONFIG,
    AxeActionBatchRequest,
    AxeConfigBatchRequest,
    _append_entry,
    _validate_device_ip,
    load_json,
)

router = APIRouter()


async def _fetch_axeos_device(client: httpx.AsyncClient, device) -> dict:
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


@router.get("/api/axeos/devices")
async def get_axeos_devices():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    devices = config.get("axeos_devices", [])
    async with httpx.AsyncClient(timeout=10) as client:
        results = await asyncio.gather(*[_fetch_axeos_device(client, d) for d in devices])
    return {"devices": list(results)}


@router.patch("/api/axeos/config/all")
async def patch_axeos_config_all(data: dict):
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    devices = config.get("axeos_devices", [])
    results = []
    async with httpx.AsyncClient(timeout=15) as client:
        for device in devices:
            ip = device.get("ip", "")
            try:
                resp = await client.patch(f"http://{ip}/api/system", json=data)
                results.append({"ip": ip, "status": resp.status_code})
            except Exception as exc:
                results.append({"ip": ip, "error": str(exc)})
    return {"results": results}


@router.get("/api/axeos/info/{ip}")
async def get_axeos_info(ip: str):
    _validate_device_ip(ip)
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    device_cfg = next((d for d in config.get("axeos_devices", []) if d.get("ip") == ip), {})
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"http://{ip}/api/system/info")
        resp.raise_for_status()
        data = resp.json()
        data["_temp_max"] = device_cfg.get("temp_max")
        return data


@router.get("/api/axeos/config/{ip}")
async def get_axeos_config_one(ip: str):
    """Return only the writeable config fields for a single AxeOS device."""
    _validate_device_ip(ip)
    _CONFIG_FIELDS = {
        "stratumURL", "stratumUser", "stratumPassword", "stratumPort",
        "fallbackStratumURL", "fallbackStratumUser", "fallbackStratumPassword", "fallbackStratumPort",
        "frequency", "coreVoltage", "fanspeed", "autofanspeed", "temptarget",
        "hostname", "ssid",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"http://{ip}/api/system/info")
            resp.raise_for_status()
            data = resp.json()
        return {k: v for k, v in data.items() if k in _CONFIG_FIELDS}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.patch("/api/axeos/config/{ip}")
async def patch_axeos_config_one(ip: str, data: dict):
    _validate_device_ip(ip)
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.patch(f"http://{ip}/api/system", json=data)
    return {"ip": ip, "status": resp.status_code}


@router.post("/api/axeos/action/batch")
async def axeos_action_batch(data: AxeActionBatchRequest):
    """Batch action across multiple AxeOS devices. Body: {action, ips: [...]}"""
    action = data.action
    ips: list[str] = data.ips
    valid = {"pause", "resume", "restart", "identify"}
    if action not in valid:
        raise HTTPException(status_code=400, detail=f"action must be one of {valid}")
    if not ips:
        config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
        ips = [d["ip"] for d in config.get("axeos_devices", []) if d.get("ip")]
    results = []
    limits = httpx.Limits(max_connections=30, max_keepalive_connections=0)
    async with httpx.AsyncClient(timeout=15, limits=limits) as client:
        async def _act(ip: str):
            try:
                resp = await client.post(f"http://{ip}/api/system/{action}")
                results.append({"ip": ip, "status": resp.status_code})
            except Exception as exc:
                results.append({"ip": ip, "error": str(exc)})
        await asyncio.gather(*[_act(ip) for ip in ips])
    return {"action": action, "results": results}


@router.patch("/api/axeos/config/batch")
async def patch_axeos_config_batch(data: AxeConfigBatchRequest):
    """Batch PATCH config (frequency, voltage …) to multiple AxeOS devices."""
    ips: list[str] = data.ips
    if not ips:
        config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
        ips = [d["ip"] for d in config.get("axeos_devices", []) if d.get("ip")]
    payload = {k: v for k, v in data.model_dump().items() if k != "ips" and v is not None}
    if not payload:
        raise HTTPException(status_code=400, detail="No config fields to update")
    results: list[dict] = []
    limits = httpx.Limits(max_connections=30, max_keepalive_connections=0)
    async with httpx.AsyncClient(timeout=15, limits=limits) as client:
        async def _patch(ip: str):
            try:
                resp = await client.patch(f"http://{ip}/api/system", json=payload)
                results.append({"ip": ip, "status": resp.status_code})
            except Exception as exc:
                results.append({"ip": ip, "error": str(exc)})
        await asyncio.gather(*[_patch(ip) for ip in ips])
    return {"results": results}


@router.post("/api/axeos/action/{ip}")
async def axeos_action(ip: str, action: str = Query(...)):
    """Single-device action: pause | resume | restart | identify"""
    _validate_device_ip(ip)
    valid = {"pause", "resume", "restart", "identify"}
    if action not in valid:
        raise HTTPException(status_code=400, detail=f"action must be one of {valid}")
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.post(f"http://{ip}/api/system/{action}")
            now = datetime.now(timezone.utc).isoformat()
            _append_entry({
                "id": f"axeos:{ip}:{action}:{now}",
                "device": f"axeos:{ip}",
                "kind": f"device_{action}",
                "severity": "warning" if action == "restart" else "info",
                "message": f"{ip}: {action} triggered",
                "timestamp": now,
                "read": True,
                "source": "axeos",
            })
            return {"ip": ip, "action": action, "status": resp.status_code}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))


@router.get("/api/axeos/scan")
async def scan_axeos_devices():
    """Scan local /24 subnet for AxeOS devices (BitAxe/NerdAxe). No IP required."""
    import socket as _socket
    subnets: list[str] = []
    local_ip = ""
    try:
        s = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        subnets.append(".".join(local_ip.split(".")[:3]))
    except Exception:
        pass

    if not subnets:
        raise HTTPException(status_code=500, detail="Could not determine any subnet to scan")

    ax_fields = {"hashRate", "ASICModel", "stratumURL", "uptimeSeconds", "boardVersion"}
    found: list[dict] = []
    sem = asyncio.Semaphore(80)
    limits = httpx.Limits(max_connections=80, max_keepalive_connections=0)

    async with httpx.AsyncClient(timeout=1.5, limits=limits) as client:
        async def _probe(ip: str):
            async with sem:
                try:
                    resp = await client.get(f"http://{ip}/api/system/info")
                    if resp.status_code != 200:
                        return
                    data = resp.json()
                    if not (ax_fields & set(data.keys())):
                        return
                    asic = data.get("ASICModel", "")
                    device_type = "nerdaxe" if "nerd" in data.get("hostname", "").lower() or \
                                              "1397" in asic else "bitaxe"
                    found.append({
                        "ip": ip,
                        "name": data.get("hostname", ip),
                        "type": device_type,
                        "asic": asic,
                        "hashrate": data.get("hashRate", 0),
                        "temp": data.get("temp", 0),
                    })
                except Exception:
                    pass

        tasks = []
        for subnet in subnets:
            tasks += [_probe(f"{subnet}.{i}") for i in range(1, 255)]
        await asyncio.gather(*tasks)

    return {
        "subnets": subnets,
        "local_ip": local_ip,
        "found": sorted(found, key=lambda x: [int(p) for p in x["ip"].split(".")] if x["ip"].replace(".", "").isdigit() else [999]),
    }
