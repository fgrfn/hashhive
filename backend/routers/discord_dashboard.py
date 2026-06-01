"""Live Discord dashboard — a single self-updating embed posted via webhook.

Inspired by fgrfn/bitaxe-discord-bot's pinned dashboard, but driven by
HashHive's whole fleet. A background loop fetches the same device data the
WebSocket dashboard uses, renders a fleet-summary embed, and edits one webhook
message in place (rather than spamming the channel). The message id is kept in
DISCORD_DASHBOARD_STATE_FILE so the embed survives restarts.

A real pinned message needs bot permissions; that arrives with the interactive
bot ("phase A"). Webhooks can post + edit, which is enough for a live tile.
"""

import asyncio
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException

from core import (
    CONFIG_FILE,
    DEFAULT_CONFIG,
    DISCORD_DASHBOARD_STATE_FILE,
    load_json,
    save_json,
)
from routers.axeos import _fetch_axeos_device
from routers.dashboard import _parse_nm_shares
from routers.lottominer import _fetch_lottominer_safe

router = APIRouter()

_EMBED_COLOR = 0x7C3AED  # HashHive purple


def _fmt_hashrate(gh: float) -> str:
    """GH/s → human string (mirrors the frontend fmtHashrate thresholds)."""
    if gh >= 1_000_000:
        return f"{gh / 1_000_000:.2f} PH/s"
    if gh >= 1_000:
        return f"{gh / 1_000:.2f} TH/s"
    if gh < 1 and gh > 0:
        return f"{gh * 1000:.1f} MH/s"
    return f"{gh:.1f} GH/s"


async def _collect_fleet() -> dict:
    """Fetch every configured device and aggregate fleet-wide totals.

    Reuses the same per-family fetch helpers as the WebSocket dashboard loop so
    the numbers stay consistent with the web UI.
    """
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    master = config.get("lottominer_master", "")
    nm_devices = config.get("lottominer_devices", [])
    axeos_devices = config.get("axeos_devices", [])
    has_nm = bool(master or nm_devices)

    async with httpx.AsyncClient(timeout=10) as client:
        coros = []
        if has_nm:
            coros.append(_fetch_lottominer_safe(client, master, nm_devices))
        coros += [_fetch_axeos_device(client, d) for d in axeos_devices]
        results = await asyncio.gather(*coros, return_exceptions=True) if coros else []

    idx = 0
    nm_data = {"devices": []}
    if has_nm:
        first = results[0] if results else {}
        nm_data = first if isinstance(first, dict) else {"devices": []}
        idx = 1
    axeos_results = [r for r in results[idx:] if isinstance(r, dict)]

    total_gh = 0.0
    total_pwr = 0.0
    total_acc = 0
    total_rej = 0
    online = 0
    total = 0
    max_temp = 0.0

    for d in nm_data.get("devices", []):
        total += 1
        if d.get("online", True) and d.get("status") != "offline":
            online += 1
        total_gh += float(d.get("GHs5s") or d.get("GHs5") or d.get("GHs1m") or
                          d.get("GHsav") or d.get("hashrate") or 0)
        acc, rej = _parse_nm_shares(d)
        total_acc += acc
        total_rej += rej
        max_temp = max(max_temp, float(d.get("temp") or 0))

    for d in axeos_results:
        total += 1
        if d.get("_online"):
            online += 1
            total_gh += float(d.get("hashRate") or d.get("hashrate") or 0)
            total_pwr += float(d.get("power") or 0)
            total_acc += int(d.get("sharesAccepted") or 0)
            total_rej += int(d.get("sharesRejected") or 0)
            max_temp = max(max_temp, float(d.get("temp") or 0))

    return {
        "total_gh": total_gh,
        "total_pwr": total_pwr,
        "shares_acc": total_acc,
        "shares_rej": total_rej,
        "online": online,
        "total": total,
        "max_temp": max_temp,
    }


def _build_embed(fleet: dict) -> dict:
    shares_total = fleet["shares_acc"] + fleet["shares_rej"]
    acc_pct = f"{fleet['shares_acc'] / shares_total * 100:.1f}%" if shares_total else "–"
    temp = fleet["max_temp"]
    temp_str = f"{temp:.0f} °C" if temp > 0 else "–"
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return {
        "title": "🐝  HashHive — Live Dashboard",
        "color": _EMBED_COLOR,
        "fields": [
            {"name": "⚡ Hashrate", "value": _fmt_hashrate(fleet["total_gh"]), "inline": True},
            {"name": "🖥️ Devices online", "value": f"{fleet['online']} / {fleet['total']}", "inline": True},
            {"name": "🌡️ Max temp", "value": temp_str, "inline": True},
            {"name": "🔌 Power", "value": f"{fleet['total_pwr']:.1f} W" if fleet["total_pwr"] else "–", "inline": True},
            {"name": "✅ Shares (acc/rej)", "value": f"{fleet['shares_acc']:,} / {fleet['shares_rej']:,}", "inline": True},
            {"name": "📈 Acceptance", "value": acc_pct, "inline": True},
        ],
        "footer": {"text": f"HashHive · updated {now}"},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def _resolve_webhook(config: dict) -> str:
    """Dedicated dashboard webhook, else fall back to the alert discord webhook."""
    dd = config.get("discord_dashboard", {})
    return dd.get("webhook") or config.get("notifications", {}).get("discord_webhook", "")


async def _post_or_edit(webhook: str, embed: dict) -> bool:
    """Edit the existing dashboard message if we have one, else post a new one
    (with ?wait=true to capture its id). Returns True on success."""
    state = load_json(DISCORD_DASHBOARD_STATE_FILE, {})
    msg_id = state.get(webhook)
    async with httpx.AsyncClient(timeout=15) as client:
        if msg_id:
            resp = await client.patch(f"{webhook}/messages/{msg_id}", json={"embeds": [embed]})
            if resp.status_code == 200:
                return True
            # message was deleted (404) or invalid — fall through and re-post
        resp = await client.post(f"{webhook}?wait=true", json={"embeds": [embed]})
        if resp.status_code in (200, 204):
            try:
                new_id = resp.json().get("id")
                if new_id:
                    state[webhook] = new_id
                    save_json(DISCORD_DASHBOARD_STATE_FILE, state)
            except Exception:
                pass
            return True
    return False


async def _update_discord_dashboard() -> bool:
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    webhook = _resolve_webhook(config)
    if not webhook:
        return False
    fleet = await _collect_fleet()
    embed = _build_embed(fleet)
    return await _post_or_edit(webhook, embed)


async def _discord_dashboard_loop() -> None:
    """Background task: refresh the Discord dashboard embed on its interval."""
    while True:
        interval = 60
        try:
            config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
            dd = config.get("discord_dashboard", {})
            interval = max(30, int(dd.get("interval_seconds", 60)))
            if dd.get("enabled") and _resolve_webhook(config):
                await _update_discord_dashboard()
        except Exception:
            pass
        await asyncio.sleep(interval)


@router.post("/api/discord-dashboard/test")
async def test_discord_dashboard():
    """Immediately push/update the Discord dashboard embed (manual trigger)."""
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    if not _resolve_webhook(config):
        raise HTTPException(status_code=400, detail="No Discord webhook configured")
    ok = await _update_discord_dashboard()
    if not ok:
        raise HTTPException(status_code=502, detail="Failed to deliver to Discord")
    return {"status": "ok"}
