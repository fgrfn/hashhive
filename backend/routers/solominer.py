"""SoloMiner router: NerdMiner, SparkMiner, and solo device endpoints."""

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
# SoloMiner device logic lives in the miners/ driver package. Re-exported here
# so existing importers (dashboard, notifications) keep working.
from miners.solo import fetch_solo_miner as _fetch_solo_miner  # noqa: F401

router = APIRouter()


@router.get("/api/nerdminer/devices")
async def get_nerdminer_devices():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    devices = config.get("nerdminer_devices", [])
    async with httpx.AsyncClient(timeout=10) as client:
        results = await asyncio.gather(*[_fetch_solo_miner(client, d) for d in devices])
    return {"devices": list(results)}


@router.get("/api/sparkminer/devices")
async def get_sparkminer_devices():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    devices = config.get("sparkminer_devices", [])
    async with httpx.AsyncClient(timeout=10) as client:
        results = await asyncio.gather(*[_fetch_solo_miner(client, d) for d in devices])
    return {"devices": list(results)}


@router.get("/api/solominer/scan")
async def scan_solominer_devices():
    """Scan local /24 subnet for NerdMiner v2 and SparkMiner devices."""
    import socket as _socket
    try:
        s = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Could not determine local network interface")

    subnet = ".".join(local_ip.split(".")[:3])
    SOLO_FIELDS = {"hashRate", "walletAddress", "poolUrl", "minerName", "runningTime"}
    found: list[dict] = []
    sem = asyncio.Semaphore(60)
    limits = httpx.Limits(max_connections=60, max_keepalive_connections=0)

    async with httpx.AsyncClient(timeout=1.5, limits=limits) as client:
        async def _probe(ip: str):
            async with sem:
                try:
                    resp = await client.get(f"http://{ip}/stats")
                    if resp.status_code != 200:
                        return
                    data = resp.json()
                    if not (SOLO_FIELDS & set(data.keys())):
                        return
                    miner_name = str(data.get("minerName", "")).lower()
                    if "spark" in miner_name:
                        dev_type = "sparkminer"
                    else:
                        dev_type = "nerdminer"
                    found.append({
                        "ip": ip,
                        "name": data.get("hostname") or data.get("minerName") or ip,
                        "type": dev_type,
                        "hashrate": data.get("hashRate", "0KH/s"),
                        "temp": data.get("temp", 0),
                        "version": data.get("version", ""),
                    })
                except Exception:
                    pass

        await asyncio.gather(*[_probe(f"{subnet}.{i}") for i in range(1, 255)])

    return {
        "subnet": f"{subnet}.0/24",
        "local_ip": local_ip,
        "found": sorted(found, key=lambda x: [int(p) for p in x["ip"].split(".")]),
    }


@router.post("/api/solominer/config")
async def post_solominer_config(data: dict):
    """Push pool config to a NerdMiner v2 or SparkMiner device.

    Accepts: {ip, poolUrl, poolPort, walletAddress, workerName (optional)}
    Tries POST /settings then POST /config on the device.
    """
    ip = data.get("ip", "")
    if not ip:
        raise HTTPException(status_code=400, detail="ip required")
    _validate_device_ip(ip)

    pool_url = data.get("poolUrl", "")
    pool_port = data.get("poolPort", 3333)
    wallet = data.get("walletAddress", "")
    worker = data.get("workerName", "")

    payload = {
        "poolUrl": pool_url,
        "poolPort": int(pool_port),
        "walletAddress": wallet,
    }
    if worker:
        payload["workerName"] = worker

    async with httpx.AsyncClient(timeout=15) as client:
        last_exc: str = ""
        for path in ("/settings", "/config"):
            try:
                resp = await client.post(f"http://{ip}{path}", json=payload)
                if resp.status_code < 400:
                    now = datetime.now(timezone.utc).isoformat()
                    _append_entry({
                        "id": f"solominer:{ip}:config_saved:{now}",
                        "device": f"solominer:{ip}",
                        "kind": "config_saved",
                        "severity": "info",
                        "message": f"SoloMiner {ip} pool config saved",
                        "timestamp": now,
                        "read": True,
                        "source": "nerdminer",
                    })
                    return {"status": resp.status_code, "detail": resp.text[:200]}
            except Exception as exc:
                last_exc = str(exc)
        raise HTTPException(status_code=502, detail=last_exc or "Device unreachable")
