"""Wallets router."""

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from core import (
    CONFIG_FILE,
    DEFAULT_CONFIG,
    load_json,
    save_json,
)

router = APIRouter()


@router.get("/api/wallets")
async def get_wallets():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    return config.get("wallets", [])


@router.post("/api/wallets")
async def create_wallet(request: Request):
    data = await request.json()
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    wallets = config.get("wallets", [])
    wallet = {
        "id": secrets.token_hex(8),
        "label": str(data.get("label", "My Wallet"))[:64],
        "coin": str(data.get("coin", "BTC"))[:8],
        "address": str(data.get("address", ""))[:256],
        "derivation": str(data.get("derivation", "native segwit"))[:32],
        "addedOn": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "lastPayout": "—",
        "payoutTotal": 0.0,
    }
    wallets.append(wallet)
    config["wallets"] = wallets
    save_json(CONFIG_FILE, config)
    return wallet


@router.put("/api/wallets/{wallet_id}")
async def update_wallet(wallet_id: str, request: Request):
    data = await request.json()
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    wallets = config.get("wallets", [])
    for i, w in enumerate(wallets):
        if w.get("id") == wallet_id:
            wallets[i] = {**w, **{
                k: v for k, v in data.items()
                if k in ("label", "coin", "address", "derivation", "lastPayout", "payoutTotal")
            }}
            config["wallets"] = wallets
            save_json(CONFIG_FILE, config)
            return wallets[i]
    raise HTTPException(status_code=404, detail="Wallet not found")


@router.delete("/api/wallets/{wallet_id}")
async def delete_wallet(wallet_id: str):
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    wallets = config.get("wallets", [])
    config["wallets"] = [w for w in wallets if w.get("id") != wallet_id]
    save_json(CONFIG_FILE, config)
    return {"ok": True}
