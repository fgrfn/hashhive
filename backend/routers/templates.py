"""Device-template router — one JSON file per template (MinerWatch-style).

Templates live as individual files under ``TEMPLATES_DIR`` so a single template
can be exported / imported / shared without touching the main config. Applying a
template maps its ``config`` dict to the device-type-specific HTTP call.
"""

import json
import secrets
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Request

from core import (
    CONFIG_FILE,
    DEFAULT_CONFIG,
    TEMPLATES_DIR,
    _append_entry,
    _validate_device_ip,
    load_json,
    save_json,
)

router = APIRouter()

_ALLOWED_TYPES = {"nmminer", "axeos", "both", "solominer"}


def _template_path(template_id: str):
    # Guard against path traversal — ids are hex tokens, but be defensive.
    safe = "".join(c for c in template_id if c.isalnum() or c in "-_")
    return TEMPLATES_DIR / f"{safe}.json"


def _load_all_templates() -> list[dict]:
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    out: list[dict] = []
    for f in sorted(TEMPLATES_DIR.glob("*.json")):
        try:
            out.append(json.loads(f.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, OSError):
            pass
    return out


def _normalize(data: dict, template_id: str, created_at: str) -> dict:
    t = str(data.get("type", "nmminer"))
    if t not in _ALLOWED_TYPES:
        t = "nmminer"
    cfg = data.get("config", {})
    if not isinstance(cfg, dict):
        cfg = {}
    return {
        "id": template_id,
        "name": str(data.get("name", "Template"))[:64],
        "type": t,
        "description": str(data.get("description", ""))[:256],
        "config": cfg,
        "created_at": created_at,
    }


@router.get("/api/templates")
async def list_templates():
    return _load_all_templates()


@router.post("/api/templates")
async def create_template(request: Request):
    data = await request.json()
    template_id = secrets.token_hex(8)
    tmpl = _normalize(data, template_id, datetime.now(timezone.utc).isoformat())
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    save_json(_template_path(template_id), tmpl)
    return tmpl


@router.put("/api/templates/{template_id}")
async def update_template(template_id: str, request: Request):
    path = _template_path(template_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Template not found")
    existing = json.loads(path.read_text(encoding="utf-8"))
    data = await request.json()
    merged = {**existing, **data}
    tmpl = _normalize(merged, template_id, existing.get("created_at", datetime.now(timezone.utc).isoformat()))
    save_json(path, tmpl)
    return tmpl


@router.delete("/api/templates/{template_id}")
async def delete_template(template_id: str):
    path = _template_path(template_id)
    if path.exists():
        path.unlink()
    return {"ok": True}


def _device_type_for_ip(ip: str, config: dict) -> str:
    """Resolve which miner family an IP belongs to from the saved config."""
    if any((d.get("ip") if isinstance(d, dict) else d) == ip for d in config.get("axeos_devices", [])):
        return "axeos"
    if ip == config.get("nmminer_master") or any(
        (d.get("ip") if isinstance(d, dict) else d) == ip for d in config.get("nmminer_devices", [])
    ):
        return "nmminer"
    if any((d.get("ip") if isinstance(d, dict) else d) == ip for d in config.get("nerdminer_devices", [])):
        return "solominer"
    if any((d.get("ip") if isinstance(d, dict) else d) == ip for d in config.get("sparkminer_devices", [])):
        return "solominer"
    return "unknown"


@router.post("/api/device/{ip}/apply-template")
async def apply_template(ip: str, request: Request):
    """Apply a template's config to a single device, dispatched by device type."""
    _validate_device_ip(ip)
    data = await request.json()
    cfg = data.get("config")
    if not isinstance(cfg, dict) or not cfg:
        # Fall back to the stored template if only an id was provided.
        tid = data.get("template_id", "")
        path = _template_path(tid) if tid else None
        if path and path.exists():
            cfg = json.loads(path.read_text(encoding="utf-8")).get("config", {})
    if not isinstance(cfg, dict) or not cfg:
        raise HTTPException(status_code=400, detail="No template config to apply")

    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    dtype = _device_type_for_ip(ip, config)

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            if dtype == "axeos":
                resp = await client.patch(f"http://{ip}/api/system", json=cfg)
            elif dtype == "nmminer":
                resp = await client.post(f"http://{ip}/broadcast-config", json={**cfg, "ip": ip})
            elif dtype == "solominer":
                resp = await client.post(f"http://{ip}/settings", json=cfg)
            else:
                raise HTTPException(status_code=404, detail=f"Unknown device for IP {ip}")
            now = datetime.now(timezone.utc).isoformat()
            _append_entry({
                "id": f"{dtype}:{ip}:template_applied:{now}",
                "device": f"{dtype}:{ip}",
                "kind": "template_applied",
                "severity": "info",
                "message": f"Template applied to {ip}",
                "timestamp": now,
                "read": True,
                "source": dtype,
            })
            return {"ip": ip, "type": dtype, "status": resp.status_code}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))
