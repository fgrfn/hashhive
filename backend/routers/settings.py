"""Settings router: get/post settings, backup/restore, device patch."""

import copy
import json
import shutil
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response

from core import (
    CONFIG_FILE,
    DEFAULT_CONFIG,
    LOGS_DIR,
    RECORDS_FILE,
    STATS_DIR,
    TEMPLATES_DIR,
    DEVICE_STATE_FILE,
    DISCOVERY_STATE_FILE,
    PatchDeviceRequest,
    _append_entry,
    _hash_pw,
    _revoke_sessions,
    _session_valid,
    merge_config,
    public_config,
    load_json,
    save_json,
)

router = APIRouter()


# Purgeable data categories. Each maps to config keys reset to their default
# and/or on-disk paths to delete. Keeps destructive actions explicit + scoped.
_PURGE_CATEGORIES: dict[str, dict] = {
    "devices": {
        "label": "Devices",
        "config_keys": ["lottominer_devices", "wroomminer_devices", "axeos_devices",
                        "axehub_devices"],
    },
    "pools": {"label": "Pool presets", "config_keys": ["pool_presets"]},
    "groups": {"label": "Groups", "config_keys": ["groups"]},
    "schedules": {"label": "Schedules", "config_keys": ["schedules"]},
    "wallets": {"label": "Wallets", "config_keys": ["wallets"]},
    "templates": {"label": "Templates", "dirs": [TEMPLATES_DIR]},
    "stats": {"label": "Stats & history", "dirs": [STATS_DIR], "files": [RECORDS_FILE]},
    "logs": {"label": "Alert log", "dirs": [LOGS_DIR]},
    "discovery_state": {"label": "Discovery state", "files": [DISCOVERY_STATE_FILE, DEVICE_STATE_FILE]},
    "notifications": {"label": "Notification channels", "config_keys": ["notifications"]},
}


@router.get("/api/settings/purge-categories")
async def list_purge_categories():
    """Expose the purgeable categories so the UI can build the selection list."""
    return [{"id": cid, "label": c["label"]} for cid, c in _PURGE_CATEGORIES.items()]


@router.post("/api/settings/purge")
async def purge_data(data: dict):
    """Reset selected data categories to their defaults. Body: {categories: [...]}.

    Each category resets its config keys to DEFAULT_CONFIG values and/or deletes
    the associated data files/dirs. Auth and core preferences are never touched.
    """
    categories = data.get("categories", [])
    if not isinstance(categories, list) or not categories:
        raise HTTPException(status_code=400, detail="categories (non-empty list) required")
    unknown = [c for c in categories if c not in _PURGE_CATEGORIES]
    if unknown:
        raise HTTPException(status_code=400, detail=f"unknown categories: {unknown}")

    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    purged: list[str] = []
    for cid in categories:
        spec = _PURGE_CATEGORIES[cid]
        for key in spec.get("config_keys", []):
            config[key] = copy.deepcopy(DEFAULT_CONFIG[key])
        for d in spec.get("dirs", []):
            if d.exists():
                shutil.rmtree(d, ignore_errors=True)
            d.mkdir(parents=True, exist_ok=True)
        for f in spec.get("files", []):
            try:
                f.unlink(missing_ok=True)
            except OSError:
                pass
        purged.append(spec["label"])

    save_json(CONFIG_FILE, config)
    now = datetime.now(timezone.utc).isoformat()
    _append_entry({
        "id": f"system:purge:{now}",
        "device": "system",
        "kind": "config_purged",
        "severity": "warning",
        "message": f"Purged: {', '.join(purged)}",
        "timestamp": now,
        "read": True,
        "source": "system",
    })
    return {"status": "ok", "purged": categories}


@router.get("/api/settings")
async def get_settings() -> dict:
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    return public_config(config)


@router.post("/api/settings")
async def post_settings(data: dict) -> dict:
    current = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    patch = copy.deepcopy(data)
    # Backward compatibility for older clients that changed the password through
    # the general settings endpoint. New clients use /api/settings/auth.
    auth_data = patch.get("auth")
    password_changed = False
    if isinstance(auth_data, dict):
        plaintext_pw = auth_data.pop("password", None)
        if plaintext_pw:
            if len(str(plaintext_pw)) < 8:
                raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
            auth_data["password_hash"] = _hash_pw(plaintext_pw)
            password_changed = True
        elif auth_data.get("enabled") and not current.get("auth", {}).get("password_hash"):
            raise HTTPException(status_code=400, detail="Set a password before enabling authentication")
    merged = merge_config(current, patch)
    save_json(CONFIG_FILE, merged)
    if password_changed:
        _revoke_sessions()
    now = datetime.now(timezone.utc).isoformat()
    _append_entry({
        "id": f"system:config_saved:{now}",
        "device": "system",
        "kind": "config_saved",
        "severity": "info",
        "message": "Configuration saved",
        "timestamp": now,
        "read": True,
        "source": "system",
    })
    return public_config(merged)


@router.post("/api/settings/auth")
async def update_auth_settings(request: Request, data: dict) -> dict:
    """Atomically enable/disable auth or change its password."""
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    auth = dict(config.get("auth", {}))
    enabled = bool(data.get("enabled", auth.get("enabled", False)))
    password = str(data.get("password") or "")
    if password:
        if len(password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
        auth["password_hash"] = _hash_pw(password)
    if enabled and not auth.get("password_hash"):
        raise HTTPException(status_code=400, detail="Set a password before enabling authentication")
    auth["enabled"] = enabled
    config["auth"] = auth
    save_json(CONFIG_FILE, config)

    # A password change revokes other browsers, while preserving the caller's
    # current authenticated session. Disabling auth invalidates every session.
    current_token = request.cookies.get("hh_session", "") if enabled else None
    _revoke_sessions(except_token=current_token)
    return public_config(config)


@router.get("/api/settings/backup")
async def download_config(
    request: Request,
    include_secrets: bool = Query(False),
):
    """Download a safe backup, or a full backup for authenticated installs."""
    if not CONFIG_FILE.exists():
        raise HTTPException(status_code=404, detail="No config file found")
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    if include_secrets:
        if not config.get("auth", {}).get("enabled") or not _session_valid(request):
            raise HTTPException(
                status_code=403,
                detail="Full backups require enabled authentication and a valid session",
            )
        payload = config
        filename = "hashhive-config-full.json"
    else:
        payload = public_config(config)
        filename = "hashhive-config.json"
    return Response(
        json.dumps(payload, indent=2, ensure_ascii=False),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/api/settings/restore")
async def restore_config(data: dict) -> dict:
    """Restore dashboard_config.json from uploaded JSON body."""
    current = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    merged = merge_config(current, data)
    save_json(CONFIG_FILE, merged)
    return public_config(merged)


@router.patch("/api/settings/device")
async def patch_device_settings(data: PatchDeviceRequest):
    """Update per-device HashHive config overrides (e.g. temp_max)."""
    ip = data.ip
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    updated = False
    for d in config.get("axeos_devices", []):
        if d.get("ip") == ip:
            if data.temp_max is not None:
                d["temp_max"] = data.temp_max
            elif "temp_max" in d:
                d.pop("temp_max", None)
            if data.name is not None:
                d["name"] = data.name.strip()
            updated = True
            break
    if not updated:
        for d in config.get("lottominer_devices", []):
            if d.get("ip") == ip:
                if data.temp_max is not None:
                    d["temp_max"] = data.temp_max
                elif "temp_max" in d:
                    d.pop("temp_max", None)
                if data.name is not None:
                    d["name"] = data.name.strip()
                break
    save_json(CONFIG_FILE, config)
    return {"status": "ok"}
