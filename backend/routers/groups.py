"""Groups router."""

import json
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from core import (
    CONFIG_FILE,
    DEFAULT_CONFIG,
    _append_entry,
    _ws_manager,
    load_json,
    save_json,
)
from routers.axeos import axeos_fanout
from routers.lottominer import lottominer_fanout
from routers.pools import push_pool_to_device

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


def _ip_of(d) -> str:
    return d.get("ip", "") if isinstance(d, dict) else str(d)


def _split_by_type(ips: list[str], config: dict) -> tuple[list[str], list[str]]:
    """Split a list of device IPs into (axeos_ips, lottominer_ips) using the config."""
    axe = {_ip_of(d) for d in config.get("axeos_devices", [])}
    nm = {_ip_of(d) for d in config.get("lottominer_devices", [])}
    master = config.get("lottominer_master", "")
    if master:
        nm.add(master)
    axe_ips = [ip for ip in ips if ip in axe]
    nm_ips = [ip for ip in ips if ip in nm]
    return axe_ips, nm_ips


@router.post("/api/groups/{group_id}/action")
async def group_action(group_id: str, request: Request):
    """Run an action on every device in a group.

    Body: {action: "pool_switch"|"restart"|"pause"|"resume", pool_id?: str}
    """
    data = await request.json()
    action = str(data.get("action", ""))
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    group = next((g for g in config.get("groups", []) if g.get("id") == group_id), None)
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")

    ips = [_ip_of(d) for d in group.get("devices", []) if _ip_of(d)]
    results: list[dict] = []

    if action == "pool_switch":
        pool_id = str(data.get("pool_id") or group.get("poolId") or "")
        pool = next((p for p in config.get("pool_presets", []) if p.get("id") == pool_id), None)
        if pool is None:
            raise HTTPException(status_code=400, detail="No pool preset for this group")
        for ip in ips:
            try:
                res = await push_pool_to_device(ip, pool)
                results.append(res)
            except HTTPException as exc:
                results.append({"ip": ip, "error": exc.detail})
            except Exception as exc:
                results.append({"ip": ip, "error": str(exc)})
    elif action in ("restart", "pause", "resume"):
        axe_ips, nm_ips = _split_by_type(ips, config)
        if axe_ips:
            results += await axeos_fanout(action, axe_ips)
        if nm_ips and action == "restart":
            results += await lottominer_fanout("restart", nm_ips)
    else:
        raise HTTPException(status_code=400, detail="Unsupported action")

    now = datetime.now(timezone.utc).isoformat()
    _append_entry({
        "id": f"group:{group_id}:{action}:{now}",
        "device": f"group:{group_id}",
        "kind": "group_action",
        "severity": "info",
        "message": f"Group '{group.get('name', group_id)}': {action} on {len(ips)} device(s)",
        "timestamp": now,
        "read": True,
        "source": "system",
    })
    try:
        await _ws_manager.broadcast(json.dumps({"type": "group_action", "group": group_id, "action": action}))
    except Exception:
        pass

    return {"group": group_id, "action": action, "results": results}
