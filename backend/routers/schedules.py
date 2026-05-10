"""Schedules router."""

import secrets

from fastapi import APIRouter, HTTPException, Request

from core import (
    CONFIG_FILE,
    DEFAULT_CONFIG,
    load_json,
    save_json,
)

router = APIRouter()


@router.get("/api/schedules")
async def get_schedules():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    return config.get("schedules", [])


@router.post("/api/schedules")
async def create_schedule(request: Request):
    data = await request.json()
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    schedules = config.get("schedules", [])
    schedule = {
        "id": secrets.token_hex(8),
        "name": str(data.get("name", "New Schedule"))[:64],
        "desc": str(data.get("desc", ""))[:128],
        "enabled": bool(data.get("enabled", True)),
        "target": str(data.get("target", "All devices"))[:64],
        "window": str(data.get("window", ""))[:64],
        "action": str(data.get("action", ""))[:128],
        "nextRun": str(data.get("nextRun", ""))[:32],
        "lastRun": str(data.get("lastRun", "never"))[:32],
    }
    schedules.append(schedule)
    config["schedules"] = schedules
    save_json(CONFIG_FILE, config)
    return schedule


@router.put("/api/schedules/{schedule_id}")
async def update_schedule(schedule_id: str, request: Request):
    data = await request.json()
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    schedules = config.get("schedules", [])
    for i, s in enumerate(schedules):
        if s.get("id") == schedule_id:
            schedules[i] = {**s, **{
                k: v for k, v in data.items()
                if k in ("name", "desc", "enabled", "target", "window", "action", "nextRun", "lastRun")
            }}
            config["schedules"] = schedules
            save_json(CONFIG_FILE, config)
            return schedules[i]
    raise HTTPException(status_code=404, detail="Schedule not found")


@router.delete("/api/schedules/{schedule_id}")
async def delete_schedule(schedule_id: str):
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    schedules = config.get("schedules", [])
    config["schedules"] = [s for s in schedules if s.get("id") != schedule_id]
    save_json(CONFIG_FILE, config)
    return {"ok": True}
