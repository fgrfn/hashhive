"""Settings router: get/post settings, backup/restore, device patch."""

import copy
import shutil
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

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
    load_json,
    save_json,
)

router = APIRouter()


# Purgeable data categories. Each maps to config keys reset to their default
# and/or on-disk paths to delete. Keeps destructive actions explicit + scoped.
_PURGE_CATEGORIES: dict[str, dict] = {
    "devices": {
        "label": "Devices",
        "config_keys": ["lottominer_master", "lottominer_devices", "axeos_devices"],
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
    # Never expose the password hash to the frontend
    auth = config.get("auth", {})
    config["auth"] = {k: v for k, v in auth.items() if k != "password_hash"}
    return config


@router.post("/api/settings")
async def post_settings(data: dict) -> dict:
    # Hash plaintext password if provided (crypto.subtle unavailable on plain HTTP,
    # so the frontend sends plaintext and the backend performs SHA-256 hashing)
    auth_data = data.get("auth")
    if isinstance(auth_data, dict):
        plaintext_pw = auth_data.pop("password", None)
        if plaintext_pw:
            auth_data["password_hash"] = _hash_pw(plaintext_pw)
    # Merge with DEFAULT_CONFIG so new keys added in updates are preserved
    merged = {**DEFAULT_CONFIG, **data}
    merged.setdefault("thresholds", {}).update({k: v for k, v in DEFAULT_CONFIG["thresholds"].items() if k not in data.get("thresholds", {})})
    save_json(CONFIG_FILE, merged)
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
    return {"status": "ok"}


@router.get("/api/settings/backup")
async def download_config():
    """Download dashboard_config.json as a file attachment."""
    if not CONFIG_FILE.exists():
        raise HTTPException(status_code=404, detail="No config file found")
    return FileResponse(
        CONFIG_FILE,
        media_type="application/json",
        filename="dashboard_config.json",
        headers={"Content-Disposition": 'attachment; filename="dashboard_config.json"'},
    )


@router.post("/api/settings/restore")
async def restore_config(data: dict) -> dict:
    """Restore dashboard_config.json from uploaded JSON body."""
    # Merge with DEFAULT_CONFIG to ensure all required keys exist
    merged = {**DEFAULT_CONFIG, **data}
    save_json(CONFIG_FILE, merged)
    return {"status": "ok"}


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
