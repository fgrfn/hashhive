"""Schedules router + execution engine.

Schedules fire a device action (pool switch / restart / pause / resume) on
selected weekdays at ``time_start``. A background loop evaluates enabled
schedules once a minute and runs the action against the resolved targets.
"""

import asyncio
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
from miners.axeos import axeos_fanout
from miners.lottominer import lottominer_fanout
from routers.pools import push_pool_to_device

router = APIRouter()

_ACTIONS = {"pool_switch", "restart", "pause", "resume", "power_limit", "throttle"}
_DAY_TOKENS = ["mo", "tu", "we", "th", "fr", "sa", "su"]

# fire-once guard: schedule id → "YYYY-MM-DD HH:MM" slot already fired
_last_fired: dict[str, str] = {}


def _normalize_schedule(data: dict, existing: dict | None = None) -> dict:
    base = existing or {}

    def pick(key, default):
        return data[key] if key in data else base.get(key, default)

    action = str(pick("action", "pool_switch"))
    if action not in _ACTIONS:
        action = "pool_switch"
    days = pick("days", [])
    if not isinstance(days, list):
        days = []
    days = [str(d).lower()[:2] for d in days if str(d).lower()[:2] in _DAY_TOKENS]
    device_ips = pick("deviceIps", [])
    if not isinstance(device_ips, list):
        device_ips = []
    return {
        "id": base.get("id") or secrets.token_hex(8),
        "name": str(pick("name", "New Schedule"))[:64],
        "desc": str(pick("desc", ""))[:128],
        "enabled": bool(pick("enabled", True)),
        "action": action,
        "days": days,
        "time_start": str(pick("time_start", "08:00"))[:5],
        "time_end": str(pick("time_end", ""))[:5],
        "scope": str(pick("scope", "all"))[:16],
        "groupId": str(pick("groupId", ""))[:32],
        "deviceIps": [str(ip) for ip in device_ips],
        "pool_id": str(pick("pool_id", ""))[:64],
        "power": pick("power", None),
        "lastRun": str(base.get("lastRun", "never"))[:32],
        "nextRun": str(pick("nextRun", ""))[:32],
    }


@router.get("/api/schedules")
async def get_schedules():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    return config.get("schedules", [])


@router.post("/api/schedules")
async def create_schedule(request: Request):
    data = await request.json()
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    schedules = config.get("schedules", [])
    schedule = _normalize_schedule(data)
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
            schedules[i] = _normalize_schedule(data, existing=s)
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


# ── Execution engine ─────────────────────────────────────────────────────────

def _ip_of(d) -> str:
    return d.get("ip", "") if isinstance(d, dict) else str(d)


def _resolve_target_ips(sched: dict, config: dict) -> list[str]:
    """Resolve a schedule's target device IPs (pure)."""
    scope = sched.get("scope", "all")
    if scope == "device":
        return [ip for ip in sched.get("deviceIps", []) if ip]
    if scope == "group":
        grp = next((g for g in config.get("groups", []) if g.get("id") == sched.get("groupId")), None)
        return [_ip_of(d) for d in (grp.get("devices", []) if grp else []) if _ip_of(d)]
    # scope == all
    ips: list[str] = [_ip_of(d) for d in config.get("axeos_devices", [])]
    master = config.get("lottominer_master")
    if master:
        ips.append(master)
    for key in ("lottominer_devices", "nerdminer_devices", "sparkminer_devices"):
        ips += [_ip_of(d) for d in config.get(key, [])]
    return [ip for ip in ips if ip]


def _schedule_should_fire(sched: dict, now: datetime, last_fired: dict) -> bool:
    """True if an enabled schedule matches the current day+minute and has not yet
    fired in this minute slot (pure given last_fired)."""
    if not sched.get("enabled"):
        return False
    days = sched.get("days") or []
    today = _DAY_TOKENS[now.weekday()]
    if days and today not in days:
        return False
    if now.strftime("%H:%M") != (sched.get("time_start") or ""):
        return False
    slot = now.strftime("%Y-%m-%d %H:%M")
    return last_fired.get(sched.get("id")) != slot


def _split_by_type(ips: list[str], config: dict) -> tuple[list[str], list[str]]:
    axe = {_ip_of(d) for d in config.get("axeos_devices", [])}
    nm = {_ip_of(d) for d in config.get("lottominer_devices", [])}
    master = config.get("lottominer_master", "")
    if master:
        nm.add(master)
    return [ip for ip in ips if ip in axe], [ip for ip in ips if ip in nm]


async def _run_schedule_action(sched: dict, config: dict) -> int:
    """Execute a schedule's action against its targets. Returns affected device count."""
    action = sched.get("action")
    ips = _resolve_target_ips(sched, config)
    if not ips:
        return 0
    if action == "pool_switch":
        pool = next((p for p in config.get("pool_presets", []) if p.get("id") == sched.get("pool_id")), None)
        if pool is None:
            return 0
        count = 0
        for ip in ips:
            try:
                await push_pool_to_device(ip, pool)
                count += 1
            except Exception:
                pass
        return count
    if action in ("restart", "pause", "resume"):
        axe_ips, nm_ips = _split_by_type(ips, config)
        if axe_ips:
            await axeos_fanout(action, axe_ips)
        if nm_ips and action == "restart":
            await lottominer_fanout("restart", nm_ips)
        return len(axe_ips) + (len(nm_ips) if action == "restart" else 0)
    # power_limit / throttle are not implemented yet — no-op.
    return 0


async def _schedules_execution_loop() -> None:
    """Background task: fire due schedules (checked twice a minute)."""
    while True:
        try:
            config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
            now = datetime.now(timezone.utc)
            schedules = config.get("schedules", [])
            changed = False
            for sched in schedules:
                if not _schedule_should_fire(sched, now, _last_fired):
                    continue
                _last_fired[sched["id"]] = now.strftime("%Y-%m-%d %H:%M")
                try:
                    count = await _run_schedule_action(sched, config)
                except Exception:
                    count = 0
                sched["lastRun"] = now.isoformat()
                changed = True
                _append_entry({
                    "id": f"schedule:{sched['id']}:{now.isoformat()}",
                    "device": "system",
                    "kind": "schedule_run",
                    "severity": "info",
                    "message": f"Schedule '{sched.get('name')}' ran {sched.get('action')} on {count} device(s)",
                    "timestamp": now.isoformat(),
                    "read": True,
                    "source": "system",
                })
                try:
                    await _ws_manager.broadcast(json.dumps({"type": "schedule_run", "id": sched["id"], "count": count}))
                except Exception:
                    pass
            if changed:
                config["schedules"] = schedules
                save_json(CONFIG_FILE, config)
        except Exception:
            pass
        await asyncio.sleep(30)
