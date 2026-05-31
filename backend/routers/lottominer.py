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

    found: list[dict] = []
    sem = asyncio.Semaphore(60)

    limits = httpx.Limits(max_connections=60, max_keepalive_connections=0)
    async with httpx.AsyncClient(timeout=1.5, limits=limits) as client:
        async def _probe(ip: str):
            async with sem:
                try:
                    resp = await client.get(f"http://{ip}/probe")
                    if resp.status_code != 200:
                        return
                    data = resp.json()
                    if not isinstance(data, dict):
                        return
                    if str(data.get("model", "")).lower() == "nmminer" or ("hr" in data and "ver" in data):
                        found.append({
                            "ip": ip,
                            "role": "device",
                            "device_count": 1,
                            "devices": [{"ip": ip, "name": data.get("hostname") or f"NMMiner ({ip})"}],
                        })
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


# NMMiner groups settings across several POST endpoints (see API reference):
#   /api/setting/mining      → pool credentials
#   /api/setting/network     → hostname + WiFi
#   /api/setting/time        → timezone + clock format
#   /api/setting/preference  → display (brightness, rotation, LED, screen saver)
#   /api/setting/market      → coin/price display (BTC ticker, watch list, kline)
#   /api/setting/weather     → on-device weather widget
_MINING_KEYS = {"PrimaryPool", "PrimaryAddress", "PrimaryPassword",
                "SecondaryPool", "SecondaryAddress", "SecondaryPassword"}
_NETWORK_KEYS = {"Hostname", "WiFiSSID", "WiFiPWD"}
_TIME_KEYS = {"Timezone", "TimeFormat", "DateFormat"}
_PREFERENCE_KEYS = {"Brightness", "RotateScreen", "LedEnable", "ScreenSaver", "ScreenSaverMode"}
_MARKET_KEYS = {"MainCoin", "WatchCoins", "KlineRotate", "KlineInterval", "PricePageMode"}
_WEATHER_KEYS = {"WeatherCity", "WeatherLat", "WeatherLon", "WeatherTempUnit",
                 "WeatherSpeedUnit", "WeatherAltMode"}

# Read-back: which fields to surface from each GET endpoint (WiFiPWD is never returned).
_NETWORK_READ = {"Hostname", "WiFiSSID"}


@router.get("/api/lottominer/device-config")
async def get_lottominer_device_config(ip: str):
    """Read NMMiner mining + network + time + preference + market settings into one object."""
    _validate_device_ip(ip)
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            mining = await client.get(f"http://{ip}/api/setting/mining")
            mining.raise_for_status()
            cfg = dict(mining.json()) if isinstance(mining.json(), dict) else {}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

        async def _merge(path: str, allowed: set | None):
            try:
                r = await client.get(f"http://{ip}{path}")
                if r.status_code == 200 and isinstance(r.json(), dict):
                    cfg.update({k: v for k, v in r.json().items() if allowed is None or k in allowed})
            except Exception:
                pass

        await _merge("/api/setting/network", _NETWORK_READ)
        await _merge("/api/setting/time", _TIME_KEYS)
        await _merge("/api/setting/preference", _PREFERENCE_KEYS)
        await _merge("/api/setting/market", _MARKET_KEYS)
        await _merge("/api/setting/weather", _WEATHER_KEYS)
        cfg["ip"] = ip
        return cfg


@router.post("/api/lottominer/device-config")
async def post_lottominer_device_config(data: dict):
    device_ip = data.get("ip")
    if not device_ip:
        raise HTTPException(status_code=400, detail="ip field required in body")
    _validate_device_ip(device_ip)
    mining = {k: v for k, v in data.items() if k in _MINING_KEYS}
    network = {k: v for k, v in data.items() if k in _NETWORK_KEYS}
    time_cfg = {k: v for k, v in data.items() if k in _TIME_KEYS}
    preference = {k: v for k, v in data.items() if k in _PREFERENCE_KEYS}
    market = {k: v for k, v in data.items() if k in _MARKET_KEYS}
    weather = {k: v for k, v in data.items() if k in _WEATHER_KEYS}
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            if mining:
                await client.post(f"http://{device_ip}/api/setting/mining", json=mining)
            if network:
                await client.post(f"http://{device_ip}/api/setting/network", json=network)
            if time_cfg:
                await client.post(f"http://{device_ip}/api/setting/time", json=time_cfg)
            if preference:
                await client.post(f"http://{device_ip}/api/setting/preference", json=preference)
            if market:
                await client.post(f"http://{device_ip}/api/setting/market", json=market)
            if weather:
                await client.post(f"http://{device_ip}/api/setting/weather", json=weather)
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
            return {"status": 200}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

