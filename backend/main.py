import json
import asyncio
from pathlib import Path
from typing import Any
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from alerts import check_alerts

BASE_DIR = Path(__file__).parent
CONFIG_FILE = BASE_DIR / "dashboard_config.json"
ALERT_HISTORY_FILE = BASE_DIR / "alert_history.json"
DEVICE_STATE_FILE = BASE_DIR / "device_state.json"
FRONTEND_DIR = BASE_DIR.parent / "frontend"

DEFAULT_CONFIG: dict = {
    "nmminer_master": "",
    "nmminer_devices": [],
    "axeos_devices": [],
    "refresh_interval": 30,
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_json(CONFIG_FILE, DEFAULT_CONFIG)
    load_json(ALERT_HISTORY_FILE, [])
    load_json(DEVICE_STATE_FILE, {})
    yield


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
    if not master:
        return {"devices": []}
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(f"http://{master}/swarm")
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))


@app.get("/api/nmminer/config")
async def get_nmminer_config():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    master = config.get("nmminer_master", "")
    if not master:
        return {}
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(f"http://{master}/config")
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))


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


# ── AxeOS ─────────────────────────────────────────────────────────────────────

async def _fetch_axeos_device(client: httpx.AsyncClient, device: dict) -> dict:
    ip = device.get("ip", "")
    name = device.get("name", ip)
    device_type = device.get("type", "bitaxe")
    try:
        resp = await client.get(f"http://{ip}/api/system/info")
        resp.raise_for_status()
        data = resp.json()
        data.update({"_ip": ip, "_name": name, "_type": device_type, "_online": True})
        return data
    except Exception:
        return {"_ip": ip, "_name": name, "_type": device_type, "_online": False}


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


# ── Dashboard ─────────────────────────────────────────────────────────────────

async def _fetch_nmminer_safe(client: httpx.AsyncClient, master: str) -> dict:
    try:
        resp = await client.get(f"http://{master}/swarm")
        resp.raise_for_status()
        return resp.json()
    except Exception:
        return {"devices": [], "_error": True}


@app.get("/api/dashboard")
async def get_dashboard():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    master = config.get("nmminer_master", "")
    axeos_devices = config.get("axeos_devices", [])

    async with httpx.AsyncClient(timeout=10) as client:
        coros: list = []
        has_nmminer = bool(master)
        if has_nmminer:
            coros.append(_fetch_nmminer_safe(client, master))
        coros += [_fetch_axeos_device(client, d) for d in axeos_devices]

        results = await asyncio.gather(*coros) if coros else []

    if has_nmminer:
        nmminer_data = results[0] if results else {"devices": []}
        axeos_results = list(results[1:])
    else:
        nmminer_data = {"devices": []}
        axeos_results = list(results)

    axeos_data = {"devices": axeos_results}

    await check_alerts(config, nmminer_data, axeos_data)

    alert_history = load_json(ALERT_HISTORY_FILE, [])
    unread = sum(1 for a in alert_history if not a.get("read", False))

    return {
        "nmminer": nmminer_data,
        "axeos": axeos_data,
        "unread_alerts": unread,
        "config": config,
    }


# ── Alerts ────────────────────────────────────────────────────────────────────

@app.get("/api/alerts")
async def get_alerts():
    return load_json(ALERT_HISTORY_FILE, [])


@app.post("/api/alerts/read-all")
async def mark_alerts_read():
    alerts = load_json(ALERT_HISTORY_FILE, [])
    for alert in alerts:
        alert["read"] = True
    save_json(ALERT_HISTORY_FILE, alerts)
    return {"status": "ok"}


@app.delete("/api/alerts")
async def delete_alerts():
    save_json(ALERT_HISTORY_FILE, [])
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
