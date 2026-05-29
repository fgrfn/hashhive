"""Pool-preset CRUD + push-to-device."""

import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException

from core import CONFIG_FILE, DEFAULT_CONFIG, _validate_device_ip, load_json, save_json

router = APIRouter()


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
        r = await client.get(f"http://{ip}/config", timeout=5.0)
        data = r.json()
        actual = data.get("config", data)
        return actual.get("Hostname") or actual.get("hostname") or ip
    except Exception:
        return ip


@router.post("/api/pools/push/{ip}")
async def push_pool_to_device(ip: str, pool: dict):
    """Push a pool preset to a single device. Worker is auto-built as wallet.hostname."""
    _validate_device_ip(ip)
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)

    nm_master = config.get("lottominer_master", "")
    nm_devices = config.get("lottominer_devices", [])
    axe_devices = config.get("axeos_devices", [])

    is_axe = any(d.get("ip") == ip for d in axe_devices)
    is_nm = (ip == nm_master) or any(
        (d.get("ip") == ip if isinstance(d, dict) else d == ip) for d in nm_devices
    )

    if not is_axe and not is_nm:
        raise HTTPException(status_code=404, detail=f"Device {ip} not found in config")

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
            target = nm_master if nm_master else ip
            hostname = await _get_nm_hostname(client, ip)
            worker = f"{wallet}.{hostname}" if wallet else pool.get("worker", "")
            payload = {
                "PrimaryPool": url,
                "PrimaryAddress": worker,
                "PrimaryPassword": password,
            }
            if url2:
                w2 = f"{wallet}.{hostname}" if wallet else pool.get("worker2", "")
                payload["SecondaryPool"] = url2
                payload["SecondaryAddress"] = w2
                payload["SecondaryPassword"] = password2
            resp = await client.post(f"http://{target}/broadcast-config", json=payload)
            return {"ip": ip, "type": "lottominer", "status": resp.status_code}
