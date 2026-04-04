import json
import asyncio
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from alerts import check_alerts

BASE_DIR = Path(__file__).parent
# Daten-Verzeichnis: per Env-Variable überschreibbar (z.B. Docker-Volume)
DATA_DIR = Path(os.environ.get("HASHHIVE_DATA_DIR", BASE_DIR))
CONFIG_FILE = DATA_DIR / "dashboard_config.json"
ALERT_HISTORY_FILE = DATA_DIR / "alert_history.json"  # legacy – migrated on first start
DEVICE_STATE_FILE = DATA_DIR / "device_state.json"
LOGS_DIR = DATA_DIR / "logs"
FRONTEND_DIR = BASE_DIR.parent / "frontend"

MAX_ENTRIES_PER_DAY = 1000
KEEP_DAYS = 30

_startup_time = datetime.now(timezone.utc)


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _log_file(date_str: str) -> Path:
    return LOGS_DIR / f"{date_str}.json"


def _read_day(date_str: str) -> list:
    return load_json(_log_file(date_str), [])


def _write_day(date_str: str, entries: list) -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    save_json(_log_file(date_str), entries)


def _append_entry(record: dict) -> None:
    """Append one record to today's log file and enforce MAX_ENTRIES_PER_DAY."""
    date_str = _today()
    entries = _read_day(date_str)
    entries.insert(0, record)
    if len(entries) > MAX_ENTRIES_PER_DAY:
        entries = entries[:MAX_ENTRIES_PER_DAY]
    _write_day(date_str, entries)


def _cleanup_old_logs() -> None:
    """Delete log files older than KEEP_DAYS."""
    if not LOGS_DIR.exists():
        return
    cutoff = datetime.now(timezone.utc) - timedelta(days=KEEP_DAYS)
    for f in LOGS_DIR.glob("*.json"):
        try:
            file_date = datetime.strptime(f.stem, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            if file_date < cutoff:
                f.unlink()
        except ValueError:
            pass


def _load_recent(days: int = 1) -> list:
    """Return entries from the last N days, newest first."""
    result = []
    for i in range(days):
        date_str = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        result.extend(_read_day(date_str))
    return result


def _migrate_legacy() -> None:
    """Move old alert_history.json into daily log files on first start."""
    if not ALERT_HISTORY_FILE.exists():
        return
    try:
        old = load_json(ALERT_HISTORY_FILE, [])
        if not old:
            return
        # Group by date
        by_day: dict = {}
        for entry in old:
            ts = entry.get("timestamp", "")
            try:
                day = datetime.fromisoformat(ts).strftime("%Y-%m-%d")
            except (ValueError, TypeError):
                day = _today()
            by_day.setdefault(day, []).append(entry)
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        for day, entries in by_day.items():
            existing = _read_day(day)
            merged = entries + existing
            if len(merged) > MAX_ENTRIES_PER_DAY:
                merged = merged[:MAX_ENTRIES_PER_DAY]
            _write_day(day, merged)
        ALERT_HISTORY_FILE.rename(ALERT_HISTORY_FILE.with_suffix(".json.migrated"))
    except Exception:
        pass

DEFAULT_CONFIG: dict = {
    "nmminer_master": "",
    "nmminer_devices": [],
    "axeos_devices": [],
    "refresh_interval": 30,
    "offline_grace_minutes": 2,
    "thresholds": {
        "temp_max": 70,
        "hashrate_min": 0,
        "share_rate_min": 80,
    },
    "notifications": {
        "telegram_enabled": False,
        "telegram_token": "",
        "telegram_chat_id": "",
        "discord_enabled": False,
        "discord_webhook": "",
        "gotify_enabled": False,
        "gotify_url": "",
        "gotify_token": "",
    },
}


def load_json(path: Path, default: Any) -> Any:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    save_json(path, default)
    return default


def save_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


# ── WebSocket connection manager ──────────────────────────────────────────────

class _WSManager:
    def __init__(self):
        self._clients: set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._clients.add(ws)

    def disconnect(self, ws: WebSocket):
        self._clients.discard(ws)

    async def broadcast(self, payload: str):
        dead: list[WebSocket] = []
        for ws in list(self._clients):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._clients.discard(ws)

    @property
    def count(self) -> int:
        return len(self._clients)


_ws_manager = _WSManager()


async def _dashboard_broadcast_loop():
    """Background task: fetch dashboard data and push to all WS clients."""
    while True:
        try:
            config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
            interval = max(5, int(config.get("refresh_interval", 30)))
            if _ws_manager.count > 0:
                # Re-use the same logic as GET /api/dashboard
                master = config.get("nmminer_master", "")
                nm_devices = config.get("nmminer_devices", [])
                axeos_devices = config.get("axeos_devices", [])
                has_nmminer = bool(master or nm_devices)
                async with httpx.AsyncClient(timeout=10) as client:
                    coros = []
                    if has_nmminer:
                        coros.append(_fetch_nmminer_safe(client, master, nm_devices))
                    coros += [_fetch_axeos_device(client, d) for d in axeos_devices]
                    results = await asyncio.gather(*coros) if coros else []
                nmminer_data = results[0] if (has_nmminer and results) else {"devices": []}
                axeos_results = list(results[1:]) if has_nmminer else list(results)
                axeos_data = {"devices": axeos_results}
                try:
                    await check_alerts(config, nmminer_data, axeos_data)
                except Exception:
                    pass
                today_entries = _read_day(_today())
                unread = sum(1 for a in today_entries if not a.get("read", False))
                payload = json.dumps({
                    "type": "dashboard",
                    "nmminer": nmminer_data,
                    "axeos": axeos_data,
                    "unread_alerts": unread,
                    "config": config,
                })
                await _ws_manager.broadcast(payload)
        except Exception:
            pass
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    load_json(CONFIG_FILE, DEFAULT_CONFIG)
    load_json(DEVICE_STATE_FILE, {})
    _migrate_legacy()
    _cleanup_old_logs()
    task = asyncio.create_task(_dashboard_broadcast_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="HashHive", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", include_in_schema=False)
async def root():
    index = FRONTEND_DIR / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return JSONResponse({"status": "HashHive API running. Frontend not found."})


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await _ws_manager.connect(ws)
    try:
        # Send current data immediately on connect so the client doesn't wait
        config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
        master = config.get("nmminer_master", "")
        nm_devices = config.get("nmminer_devices", [])
        axeos_devices = config.get("axeos_devices", [])
        has_nmminer = bool(master or nm_devices)
        async with httpx.AsyncClient(timeout=10) as client:
            coros = []
            if has_nmminer:
                coros.append(_fetch_nmminer_safe(client, master, nm_devices))
            coros += [_fetch_axeos_device(client, d) for d in axeos_devices]
            results = await asyncio.gather(*coros) if coros else []
        nmminer_data = results[0] if (has_nmminer and results) else {"devices": []}
        axeos_results = list(results[1:]) if has_nmminer else list(results)
        axeos_data = {"devices": axeos_results}
        today_entries = _read_day(_today())
        unread = sum(1 for a in today_entries if not a.get("read", False))
        await ws.send_text(json.dumps({
            "type": "dashboard",
            "nmminer": nmminer_data,
            "axeos": axeos_data,
            "unread_alerts": unread,
            "config": config,
        }))
        # Keep alive — wait for client to close
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        _ws_manager.disconnect(ws)


# ── Settings ──────────────────────────────────────────────────────────────────

@app.get("/api/settings")
async def get_settings() -> dict:
    return load_json(CONFIG_FILE, DEFAULT_CONFIG)


@app.post("/api/settings")
async def post_settings(data: dict) -> dict:
    save_json(CONFIG_FILE, data)
    return {"status": "ok"}


# ── NMMiner ───────────────────────────────────────────────────────────────────

@app.get("/api/nmminer/swarm")
async def get_nmminer_swarm():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    master = config.get("nmminer_master", "")
    # Prefer master (returns aggregated swarm stats in one request)
    if master:
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.get(f"http://{master}/swarm")
                resp.raise_for_status()
                return resp.json()
            except Exception:
                pass  # fall through to per-device queries
    # Fallback: query each known device individually
    devices = config.get("nmminer_devices", [])
    if not devices:
        return {"devices": []}
    results = []
    async with httpx.AsyncClient(timeout=5) as client:
        async def _fetch(ip: str):
            try:
                r = await client.get(f"http://{ip}/swarm")
                r.raise_for_status()
                data = r.json()
                devs = data if isinstance(data, list) else data.get("devices", [data])
                results.extend(devs)
            except Exception:
                results.append({"ip": ip, "online": False})
        await asyncio.gather(*[_fetch(d["ip"]) for d in devices if d.get("ip")])
    return {"devices": results}


@app.get("/api/nmminer/config")
async def get_nmminer_config():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    master = config.get("nmminer_master", "")
    # Prefer master (returns all device configs at once)
    if master:
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.get(f"http://{master}/config")
                resp.raise_for_status()
                return resp.json()
            except Exception:
                pass  # fall through to per-device queries
    # Fallback: query each known device individually
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


@app.get("/api/nmminer/scan")
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
    sem = asyncio.Semaphore(60)  # max 60 concurrent connections

    limits = httpx.Limits(max_connections=60, max_keepalive_connections=0)
    async with httpx.AsyncClient(timeout=1.5, limits=limits) as client:
        async def _probe(ip: str):
            async with sem:
                # Try /swarm first (master exposes this)
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


@app.post("/api/nmminer/broadcast-config")
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


@app.get("/api/nmminer/device-config")
async def get_nmminer_device_config(ip: str):
    # Query device directly — no master needed for individual config reads
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(f"http://{ip}/config")
            resp.raise_for_status()
            data = resp.json()
            # Unwrap {"configs": [{"ip": "...", "config": {...}}, ...]} format
            if isinstance(data, dict) and "configs" in data:
                for entry in data["configs"]:
                    if entry.get("ip") == ip:
                        return entry.get("config", entry)
                # fallback: first entry
                if data["configs"]:
                    first = data["configs"][0]
                    return first.get("config", first)
            return data
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))


@app.post("/api/nmminer/device-config")
async def post_nmminer_device_config(data: dict):
    device_ip = data.get("ip")
    if not device_ip:
        raise HTTPException(status_code=400, detail="ip field required in body")
    # Push directly to the device — master is only needed for discovery, not for writes
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.post(f"http://{device_ip}/broadcast-config", json=data)
            return {"status": resp.status_code, "detail": resp.text[:200]}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))


# ── AxeOS ─────────────────────────────────────────────────────────────────────

async def _fetch_axeos_device(client: httpx.AsyncClient, device: dict) -> dict:
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


@app.get("/api/axeos/devices")
async def get_axeos_devices():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    devices = config.get("axeos_devices", [])
    async with httpx.AsyncClient(timeout=10) as client:
        results = await asyncio.gather(*[_fetch_axeos_device(client, d) for d in devices])
    return {"devices": list(results)}


@app.patch("/api/axeos/config/all")
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


@app.get("/api/axeos/info/{ip}")
async def get_axeos_info(ip: str):
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    device_cfg = next((d for d in config.get("axeos_devices", []) if d.get("ip") == ip), {})
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"http://{ip}/api/system/info")
        resp.raise_for_status()
        data = resp.json()
        data["_temp_max"] = device_cfg.get("temp_max")
        return data


@app.patch("/api/settings/device")
async def patch_device_settings(data: dict):
    """Update per-device HashHive config overrides (e.g. temp_max)."""
    ip = data.get("ip")
    if not ip:
        raise HTTPException(status_code=400, detail="ip required")
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    for d in config.get("axeos_devices", []):
        if d.get("ip") == ip:
            if "temp_max" in data and data["temp_max"] is not None:
                d["temp_max"] = float(data["temp_max"])
            elif d.get("temp_max") is not None and data.get("temp_max") is None:
                d.pop("temp_max", None)
            break
    save_json(CONFIG_FILE, config)
    return {"status": "ok"}


@app.patch("/api/axeos/config/{ip}")
async def patch_axeos_config_one(ip: str, data: dict):
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.patch(f"http://{ip}/api/system", json=data)
    return {"ip": ip, "status": resp.status_code}


@app.post("/api/axeos/action/{ip}")
async def axeos_action(ip: str, action: str = Query(...)):
    """Single-device action: pause | resume | restart | identify"""
    valid = {"pause", "resume", "restart", "identify"}
    if action not in valid:
        raise HTTPException(status_code=400, detail=f"action must be one of {valid}")
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.post(f"http://{ip}/api/system/{action}")
            return {"ip": ip, "action": action, "status": resp.status_code}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))


@app.post("/api/axeos/action/batch")
async def axeos_action_batch(data: dict):
    """Batch action across multiple AxeOS devices. Body: {action, ips: [...]}"""
    action = data.get("action", "")
    ips: list[str] = data.get("ips", [])
    valid = {"pause", "resume", "restart", "identify"}
    if action not in valid:
        raise HTTPException(status_code=400, detail=f"action must be one of {valid}")
    if not ips:
        # Fall back to all configured devices
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


@app.get("/api/axeos/scan")
async def scan_axeos_devices():
    """Scan local /24 subnet for AxeOS devices (BitAxe/NerdAxe). No IP required."""
    import socket as _socket
    # Determine local /24 subnet to scan
    subnets: list[str] = []
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
        "found": sorted(found, key=lambda x: [int(p) for p in x["ip"].split(".")] if x["ip"].replace(".","").isdigit() else [999]),
    }


# ── Dashboard ─────────────────────────────────────────────────────────────────

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
                return result
        except Exception:
            pass  # fall through to per-device queries

    # Fallback: query each known device individually
    if nm_devices:
        all_devs: list = []

        async def _fetch_one(ip: str):
            try:
                r = await client.get(f"http://{ip}/swarm")
                r.raise_for_status()
                data = r.json()
                devs = data if isinstance(data, list) else data.get("devices", [data])
                all_devs.extend(devs if isinstance(devs, list) else [devs])
            except Exception:
                all_devs.append({"ip": ip, "online": False})

        await asyncio.gather(*[_fetch_one(d["ip"]) for d in nm_devices if d.get("ip")])
        return {"devices": all_devs}

    return {"devices": [], "_error": "no NMMiner configured"}


@app.get("/api/dashboard")
async def get_dashboard():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    master = config.get("nmminer_master", "")
    nm_devices = config.get("nmminer_devices", [])
    axeos_devices = config.get("axeos_devices", [])
    has_nmminer = bool(master or nm_devices)

    async with httpx.AsyncClient(timeout=10) as client:
        coros: list = []
        if has_nmminer:
            coros.append(_fetch_nmminer_safe(client, master, nm_devices))
        coros += [_fetch_axeos_device(client, d) for d in axeos_devices]

        results = await asyncio.gather(*coros) if coros else []

    if has_nmminer:
        nmminer_data = results[0] if results else {"devices": []}
        axeos_results = list(results[1:])
    else:
        nmminer_data = {"devices": []}
        axeos_results = list(results)

    axeos_data = {"devices": axeos_results}

    try:
        await check_alerts(config, nmminer_data, axeos_data)
    except Exception:
        pass  # Never let alert checks break the dashboard

    # Annotate offline devices with their offline_since timestamp from device_state
    device_state = load_json(DEVICE_STATE_FILE, {})
    for d in nmminer_data.get("devices", []):
        if not d.get("online", True):
            key = f"nmminer:{d.get('ip', '')}"
            d["_offline_since"] = device_state.get(key, {}).get("offline_since")
    for d in axeos_data.get("devices", []):
        if not d.get("_online", True):
            key = f"axeos:{d.get('_ip', '')}"
            d["_offline_since"] = device_state.get(key, {}).get("offline_since")

    today_entries = _read_day(_today())
    unread = sum(1 for a in today_entries if not a.get("read", False))

    return {
        "nmminer": nmminer_data,
        "axeos": axeos_data,
        "unread_alerts": unread,
        "config": config,
    }


@app.get("/api/health")
async def health():
    uptime = (datetime.now(timezone.utc) - _startup_time).total_seconds()
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    nm_count = len(config.get("nmminer_devices", []))
    ax_count = len(config.get("axeos_devices", []))
    return {
        "status": "ok",
        "version": "1.0.0",
        "uptime_seconds": round(uptime),
        "devices": {"nmminer": nm_count, "axeos": ax_count},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ── Alerts & Logs ─────────────────────────────────────────────────────────────

@app.get("/api/alerts")
async def get_alerts(days: int = Query(default=1, ge=1, le=30)):
    """Return log entries. days=1 → today only; days=7 → last 7 days."""
    return _load_recent(days)


@app.get("/api/logs/dates")
async def get_log_dates():
    """List available log file dates (newest first)."""
    if not LOGS_DIR.exists():
        return []
    dates = sorted(
        [f.stem for f in LOGS_DIR.glob("*.json") if len(f.stem) == 10],
        reverse=True,
    )
    return dates


@app.post("/api/alerts/read-all")
async def mark_alerts_read():
    date_str = _today()
    entries = _read_day(date_str)
    for entry in entries:
        entry["read"] = True
    _write_day(date_str, entries)
    return {"status": "ok"}


@app.delete("/api/alerts")
async def delete_alerts():
    """Delete today's log file."""
    lf = _log_file(_today())
    if lf.exists():
        lf.unlink()
    return {"status": "ok"}


@app.post("/api/log")
async def post_log_entry(entry: dict):
    """Persist a manual action log entry (pool push, config save, etc.) to today's log file."""
    severity = entry.get("severity", "info")
    message  = entry.get("message", "")
    source   = entry.get("source", "system")
    if not message:
        raise HTTPException(status_code=400, detail="message required")
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "id":        f"log:{source}:{now}",
        "device":    f"log:{source}",
        "kind":      "user_action",
        "severity":  severity,
        "message":   message,
        "timestamp": now,
        "read":      True,   # action logs are pre-read; don't bump unread counter
    }
    _append_entry(record)
    return {"status": "ok"}


# ── Notifications ─────────────────────────────────────────────────────────────

@app.post("/api/notifications/test")
async def test_notification():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    notifications = config.get("notifications", {})
    results: dict = {}

    async with httpx.AsyncClient(timeout=10) as client:
        if notifications.get("telegram_enabled") and notifications.get("telegram_token"):
            token = notifications["telegram_token"]
            chat_id = notifications["telegram_chat_id"]
            try:
                resp = await client.post(
                    f"https://api.telegram.org/bot{token}/sendMessage",
                    json={"chat_id": chat_id, "text": "HashHive: Test-Benachrichtigung"},
                )
                results["telegram"] = resp.status_code == 200
            except Exception:
                results["telegram"] = False

        if notifications.get("discord_enabled") and notifications.get("discord_webhook"):
            webhook = notifications["discord_webhook"]
            try:
                resp = await client.post(webhook, json={"content": "**HashHive**: Test-Benachrichtigung"})
                results["discord"] = resp.status_code in (200, 204)
            except Exception:
                results["discord"] = False

        if notifications.get("gotify_enabled") and notifications.get("gotify_url"):
            url = notifications["gotify_url"].rstrip("/")
            gotify_token = notifications["gotify_token"]
            try:
                resp = await client.post(
                    f"{url}/message",
                    json={"title": "HashHive", "message": "Test-Benachrichtigung", "priority": 5},
                    headers={"X-Gotify-Key": gotify_token},
                )
                results["gotify"] = resp.status_code == 200
            except Exception:
                results["gotify"] = False

    return {"results": results}
