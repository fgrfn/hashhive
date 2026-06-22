"""Pool-preset CRUD + push-to-device."""

import asyncio
import time
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Query

from core import CONFIG_FILE, DEFAULT_CONFIG, _pool_health, _validate_device_ip, load_json, save_json
from miners.axehub import set_axehub_pool
from miners.wroomminer import set_wroomminer_pool
from miners.lottominer import ensure_stratum_scheme

router = APIRouter()


@router.get("/api/pools/ping")
async def ping_pool(target: str = Query(..., description="host:port or stratum+tcp://host:port")):
    """Measure TCP connect latency to a stratum pool endpoint."""
    host_port = target.split("://")[-1].strip().strip("/").split("/")[0]
    if ":" not in host_port:
        raise HTTPException(status_code=400, detail="target must be host:port")
    host, _, port_s = host_port.rpartition(":")
    try:
        port = int(port_s)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid port")
    if not host or not (1 <= port <= 65535):
        raise HTTPException(status_code=400, detail="invalid target")
    start = time.perf_counter()
    try:
        reader, writer = await asyncio.wait_for(asyncio.open_connection(host, port), timeout=4)
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        return {"target": f"{host}:{port}", "latency_ms": round((time.perf_counter() - start) * 1000, 1)}
    except Exception:
        return {"target": f"{host}:{port}", "latency_ms": None}



@router.get("/api/pools/health")
async def pool_health():
    """Return the server-monitored health of pools the fleet actually uses."""
    out = []
    for url, entry in _pool_health.items():
        if not url or not isinstance(entry, dict):
            continue
        out.append({
            "url": url,
            "up": entry.get("up"),
            "latency_ms": entry.get("latency_ms"),
            "devices": entry.get("devices"),
            "since": entry.get("since"),
        })
    return out


def _presets(config: dict) -> list[dict]:
    return config.setdefault("pool_presets", [])


@router.get("/api/pools")
async def list_pools():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    return _presets(config)


@router.post("/api/pools")
async def create_pool(data: dict):
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    preset = {
        "id": str(uuid.uuid4()),
        "created_at": datetime.now(timezone.utc).isoformat(),
        **{k: v for k, v in data.items() if k != "id"},
    }
    _presets(config).append(preset)
    save_json(CONFIG_FILE, config)
    return preset


@router.put("/api/pools/{pool_id}")
async def update_pool(pool_id: str, data: dict):
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    presets = _presets(config)
    for i, p in enumerate(presets):
        if p.get("id") == pool_id:
            presets[i] = {**p, **{k: v for k, v in data.items() if k != "id"}}
            save_json(CONFIG_FILE, config)
            return presets[i]
    raise HTTPException(status_code=404, detail="Pool not found")


@router.delete("/api/pools/{pool_id}")
async def delete_pool(pool_id: str):
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    presets = _presets(config)
    new = [p for p in presets if p.get("id") != pool_id]
    if len(new) == len(presets):
        raise HTTPException(status_code=404, detail="Pool not found")
    config["pool_presets"] = new
    save_json(CONFIG_FILE, config)
    return {"status": "deleted"}


async def _get_axe_hostname(client: httpx.AsyncClient, ip: str) -> str:
    try:
        r = await client.get(f"http://{ip}/api/system/info", timeout=5.0)
        return r.json().get("hostname", ip)
    except Exception:
        return ip


async def _get_nm_hostname(client: httpx.AsyncClient, ip: str) -> str:
    try:
        r = await client.get(f"http://{ip}/api/setting/network", timeout=5.0)
        data = r.json()
        return data.get("Hostname") or data.get("hostname") or ip
    except Exception:
        return ip


@router.post("/api/pools/push/{ip}")
async def push_pool_to_device(ip: str, pool: dict):
    """Push a pool preset to a single device. Worker is auto-built as wallet.hostname."""
    _validate_device_ip(ip)
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)

    nm_devices = config.get("lottominer_devices", [])
    axe_devices = config.get("axeos_devices", [])

    is_axe = any(d.get("ip") == ip for d in axe_devices)
    is_axehub = any(
        (d.get("ip") if isinstance(d, dict) else d) == ip for d in config.get("axehub_devices", [])
    )
    is_wroom = any(
        (d.get("ip") if isinstance(d, dict) else d) == ip for d in config.get("wroomminer_devices", [])
    )
    is_nm = any(
        (d.get("ip") == ip if isinstance(d, dict) else d == ip) for d in nm_devices
    )

    if not is_axe and not is_axehub and not is_wroom and not is_nm:
        raise HTTPException(status_code=404, detail=f"Device {ip} not found in config")

    if is_axehub:
        return await set_axehub_pool(ip, pool)

    if is_wroom:
        return await set_wroomminer_pool(ip, pool)

    wallet = pool.get("wallet") or pool.get("worker", "")
    password = pool.get("password") or "x"
    url = pool.get("url", "")
    url2 = pool.get("url2", "")
    password2 = pool.get("password2") or "x"

    async with httpx.AsyncClient(timeout=15) as client:
        if is_axe:
            hostname = await _get_axe_hostname(client, ip)
            worker = f"{wallet}.{hostname}" if wallet else pool.get("worker", "")
            payload: dict = {
                "stratumURL": url,
                "stratumUser": worker,
                "stratumPassword": password,
            }
            if url2:
                w2 = f"{wallet}.{hostname}" if wallet else pool.get("worker2", "")
                payload["fallbackStratumURL"] = url2
                payload["fallbackStratumUser"] = w2
                payload["fallbackStratumPassword"] = password2
            resp = await client.patch(f"http://{ip}/api/system", json=payload)
            return {"ip": ip, "type": "axeos", "status": resp.status_code}

        else:
            # NMMiner: POST mining settings to the device itself (no master/swarm).
            hostname = await _get_nm_hostname(client, ip)
            worker = f"{wallet}.{hostname}" if wallet else pool.get("worker", "")
            payload = {
                "PrimaryPool": ensure_stratum_scheme(url),
                "PrimaryAddress": worker,
                "PrimaryPassword": password,
            }
            if url2:
                w2 = f"{wallet}.{hostname}" if wallet else pool.get("worker2", "")
                payload["SecondaryPool"] = ensure_stratum_scheme(url2)
                payload["SecondaryAddress"] = w2
                payload["SecondaryPassword"] = password2
            resp = await client.post(f"http://{ip}/api/setting/mining", json=payload)
            return {"ip": ip, "type": "lottominer", "status": resp.status_code}
