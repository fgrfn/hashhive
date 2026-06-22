"""Lottominer router — generalized ESP-based lottery miners (formerly NMMiner).

Handles the NMMiner-style firmware (master/swarm + per-device config).
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
    save_json,
)
# Lottominer device logic lives in the miners/ driver package. Re-exported here
# so existing importers (dashboard, notifications) keep working.
from miners.axehub import AXEHUB_ACTION_MAP as _AXEHUB_ACTION_MAP, axehub_fanout
from miners.lottominer import (  # noqa: F401
    LOTTO_ACTION_MAP as _LOTTO_ACTION_MAP,
    ensure_stratum_scheme,
    fetch_lottominer_safe as _fetch_lottominer_safe,
    lottominer_fanout,
    probe_lottominer as _probe_lottominer,
)
from miners.wroomminer import (  # noqa: F401
    WROOM_ACTION_MAP as _WROOM_ACTION_MAP,
    fetch_wroomminer_safe as _fetch_wroomminer_safe,
    wroomminer_fanout,
)

router = APIRouter()


@router.get("/api/lottominer/swarm")
async def get_lottominer_swarm():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    nm_devices = config.get("lottominer_devices", [])
    async with httpx.AsyncClient(timeout=10) as client:
        return await _fetch_lottominer_safe(client, nm_devices)


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
    async with httpx.AsyncClient(timeout=2.0, limits=limits) as client:
        async def _probe(ip: str):
            async with sem:
                # Reuse the driver probe so this picks up firmware that only
                # serves /api/system/info (e.g. v2.0.02), not just /probe.
                rec = await _probe_lottominer(ip, client)
                if rec:
                    found.append({
                        "ip": ip,
                        "role": "device",
                        "device_count": 1,
                        "devices": [{"ip": ip, "name": rec.get("name") or f"NMMiner ({ip})"}],
                    })

        await asyncio.gather(*[_probe(f"{subnet}.{i}") for i in range(1, 255)])

    return {"subnet": f"{subnet}.0/24", "local_ip": local_ip, "found": found}


@router.post("/api/lottominer/action/batch")
async def lottominer_action_batch(data: NmActionBatchRequest):
    """Batch action across Lottominer + AxeHub devices. Body: {action, ips: [...]}

    IPs are routed by family: those configured as ``axehub_devices`` go through
    the AxeHub fanout, the rest through the NMMiner/Lottominer fanout. An action
    unsupported by a family is skipped for that family.
    """
    valid = set(_LOTTO_ACTION_MAP) | set(_WROOM_ACTION_MAP) | set(_AXEHUB_ACTION_MAP)
    if data.action not in valid:
        raise HTTPException(status_code=400, detail=f"action must be one of {valid}")

    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    axehub_ips_set = {
        (d.get("ip") if isinstance(d, dict) else d) for d in config.get("axehub_devices", [])
    }
    wroom_ips_set = {
        (d.get("ip") if isinstance(d, dict) else d) for d in config.get("wroomminer_devices", [])
    }
    axehub_ips = [ip for ip in data.ips if ip in axehub_ips_set]
    wroom_ips = [ip for ip in data.ips if ip in wroom_ips_set]
    nm_ips = [ip for ip in data.ips if ip not in axehub_ips_set and ip not in wroom_ips_set]

    results: list[dict] = []
    if nm_ips and data.action in _LOTTO_ACTION_MAP:
        results += await lottominer_fanout(data.action, nm_ips)
    if wroom_ips and data.action in _WROOM_ACTION_MAP:
        results += await wroomminer_fanout(data.action, wroom_ips)
    if axehub_ips and data.action in _AXEHUB_ACTION_MAP:
        results += await axehub_fanout(data.action, axehub_ips)
    return {"action": data.action, "results": results}


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
    for pool_key in ("PrimaryPool", "SecondaryPool"):
        if mining.get(pool_key):
            mining[pool_key] = ensure_stratum_scheme(mining[pool_key])
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
            # Keep HashHive's stored label in sync with the device hostname so the
            # new name shows up after the next refresh (the device itself may only
            # apply the hostname on its next restart, but the UI follows right away).
            new_name = (data.get("Hostname") or "").strip()
            if new_name:
                config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
                changed = False
                for dev in config.get("lottominer_devices", []):
                    if isinstance(dev, dict) and dev.get("ip") == device_ip and dev.get("name") != new_name:
                        dev["name"] = new_name
                        changed = True
                if changed:
                    save_json(CONFIG_FILE, config)
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

