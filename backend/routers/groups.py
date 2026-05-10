"""Groups router."""

import secrets

from fastapi import APIRouter, HTTPException, Request

from core import (
    CONFIG_FILE,
    DEFAULT_CONFIG,
    load_json,
    save_json,
)

router = APIRouter()


@router.get("/api/groups")
async def get_groups():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    return config.get("groups", [])


@router.post("/api/groups")
async def create_group(request: Request):
    data = await request.json()
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    groups = config.get("groups", [])
    group = {
        "id": secrets.token_hex(8),
        "name": str(data.get("name", "New Group"))[:64],
        "desc": str(data.get("desc", ""))[:128],
        "color": str(data.get("color", "#a855f7"))[:16],
        "devices": [str(d) for d in data.get("devices", [])],
        "poolId": str(data.get("poolId", ""))[:64],
        "wallet": str(data.get("wallet", ""))[:128],
    }
    groups.append(group)
    config["groups"] = groups
    save_json(CONFIG_FILE, config)
    return group


@router.put("/api/groups/{group_id}")
async def update_group(group_id: str, request: Request):
    data = await request.json()
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    groups = config.get("groups", [])
    for i, g in enumerate(groups):
        if g.get("id") == group_id:
            groups[i] = {**g, **{
                k: v for k, v in data.items()
                if k in ("name", "desc", "color", "devices", "poolId", "wallet")
            }}
            config["groups"] = groups
            save_json(CONFIG_FILE, config)
            return groups[i]
    raise HTTPException(status_code=404, detail="Group not found")


@router.delete("/api/groups/{group_id}")
async def delete_group(group_id: str):
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    groups = config.get("groups", [])
    config["groups"] = [g for g in groups if g.get("id") != group_id]
    save_json(CONFIG_FILE, config)
    return {"ok": True}
