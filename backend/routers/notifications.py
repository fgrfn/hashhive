"""Notifications router: test notification, weekly summary."""

import asyncio
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter

from core import (
    CONFIG_FILE,
    DEFAULT_CONFIG,
    _load_recent,
    load_json,
)
from routers.axeos import _fetch_axeos_device
from routers.nmminer import _fetch_nmminer_safe
from routers.dashboard import _parse_nm_shares

router = APIRouter()

_WEEKDAY_MAP = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}


async def dispatch_notification(title: str, message: str, priority: int = 3) -> dict:
    """Send a simple title+message notification to every enabled channel.

    Reused by the weekly summary, discovery alerts, and any other feature that
    needs to push a one-off message. Failures per channel are swallowed so one
    broken integration never blocks the others. Returns {channel: bool} results.
    """
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    n = config.get("notifications", {})
    results: dict = {}
    async with httpx.AsyncClient(timeout=15) as client:
        if n.get("telegram_enabled") and n.get("telegram_token") and n.get("telegram_chat_id"):
            try:
                resp = await client.post(
                    f"https://api.telegram.org/bot{n['telegram_token']}/sendMessage",
                    json={"chat_id": n["telegram_chat_id"], "text": f"<b>{title}</b>\n{message}", "parse_mode": "HTML"},
                )
                results["telegram"] = resp.status_code == 200
            except Exception:
                results["telegram"] = False

        if n.get("discord_enabled") and n.get("discord_webhook"):
            embed = {
                "title": title,
                "description": message,
                "color": 0x7C3AED,
                "footer": {"text": "HashHive"},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            try:
                resp = await client.post(n["discord_webhook"], json={"embeds": [embed]})
                results["discord"] = resp.status_code in (200, 204)
            except Exception:
                results["discord"] = False

        if n.get("gotify_enabled") and n.get("gotify_url") and n.get("gotify_token"):
            try:
                resp = await client.post(
                    f"{n['gotify_url'].rstrip('/')}/message",
                    headers={"X-Gotify-Key": n["gotify_token"]},
                    json={"title": title, "message": message, "priority": priority},
                )
                results["gotify"] = resp.status_code == 200
            except Exception:
                results["gotify"] = False

        if n.get("ntfy_enabled") and n.get("ntfy_url") and n.get("ntfy_topic"):
            ntfy_url = n["ntfy_url"].rstrip("/")
            headers = {"Title": title, "Priority": str(priority), "Tags": "honeybee"}
            if n.get("ntfy_token"):
                headers["Authorization"] = f"Bearer {n['ntfy_token']}"
            try:
                resp = await client.post(f"{ntfy_url}/{n['ntfy_topic']}", content=message, headers=headers)
                results["ntfy"] = resp.status_code == 200
            except Exception:
                results["ntfy"] = False

        if n.get("pushover_enabled") and n.get("pushover_user_key") and n.get("pushover_app_token"):
            try:
                resp = await client.post(
                    "https://api.pushover.net/1/messages.json",
                    data={"token": n["pushover_app_token"], "user": n["pushover_user_key"],
                          "title": title, "message": message, "priority": priority - 3},
                )
                results["pushover"] = resp.status_code == 200
            except Exception:
                results["pushover"] = False

    return results


async def _send_weekly_summary() -> None:
    """Build and ship the weekly summary via all configured notification channels."""
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    notifications = config.get("notifications", {})
    # Collect last 7 days of alerts
    entries = _load_recent(7)
    total = len(entries)
    by_kind: dict[str, int] = {}
    best_diffs: list[str] = []
    blocks: int = 0
    offline_events: int = 0
    for e in entries:
        kind = e.get("kind", "unknown")
        by_kind[kind] = by_kind.get(kind, 0) + 1
        if kind == "new_best_diff":
            best_diffs.append(e.get("message", ""))
        if kind == "block_found":
            blocks += 1
        if kind == "offline":
            offline_events += 1

    # Fetch live device data to collect current share totals
    shares_accepted: int = 0
    shares_rejected: int = 0
    try:
        master = config.get("nmminer_master", "")
        nm_devices = config.get("nmminer_devices", [])
        axeos_devices = config.get("axeos_devices", [])
        has_nmminer = bool(master or nm_devices)
        async with httpx.AsyncClient(timeout=10) as client:
            coros = []
            if has_nmminer:
                coros.append(_fetch_nmminer_safe(client, master, nm_devices))
            coros += [_fetch_axeos_device(client, d) for d in axeos_devices]
            results = await asyncio.gather(*coros, return_exceptions=True) if coros else []
        nmminer_devices = []
        axeos_results = []
        if has_nmminer and results:
            nm_result = results[0]
            if isinstance(nm_result, dict):
                nmminer_devices = nm_result.get("devices", [])
            axeos_results = list(results[1:])
        else:
            axeos_results = list(results)
        for d in nmminer_devices:
            if isinstance(d, dict):
                _acc, _rej = _parse_nm_shares(d)
                shares_accepted += _acc
                shares_rejected += _rej
        for d in axeos_results:
            if isinstance(d, dict) and d.get("_online"):
                try:
                    shares_accepted += int(d.get("sharesAccepted") or 0)
                    shares_rejected += int(d.get("sharesRejected") or 0)
                except (TypeError, ValueError):
                    pass
    except Exception:
        pass

    shares_total = shares_accepted + shares_rejected
    share_acc_pct = f"{shares_accepted / shares_total * 100:.1f}%" if shares_total > 0 else "–"

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    nm_count = len(config.get("nmminer_devices", []))
    ax_count = len(config.get("axeos_devices", []))

    # ── Telegram ─────────────────────────────────────────────────────────────
    if notifications.get("telegram_enabled") and notifications.get("telegram_token") and notifications.get("telegram_chat_id"):
        lines = [
            "📊 <b>HashHive Weekly Summary</b>",
            f"<i>{now}</i>",
            "",
            f"📦 Devices: {nm_count} NMMiner · {ax_count} AxeOS",
            f"📋 Total events (7 days): {total}",
            f"✅ Shares accepted: {shares_accepted:,}",
            f"❌ Shares rejected: {shares_rejected:,}",
            f"📈 Share acceptance rate: {share_acc_pct}",
        ]
        if offline_events:
            lines.append(f"⚠️ Offline events: {offline_events}")
        if blocks:
            lines.append(f"🏆 Block(s) found: {blocks}")
        if by_kind:
            lines.append("")
            lines.append("Events by type:")
            for k, c in sorted(by_kind.items(), key=lambda x: -x[1]):
                lines.append(f"  • {k.replace('_', ' ').title()}: {c}")
        text = "\n".join(lines)
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                await client.post(
                    f"https://api.telegram.org/bot{notifications['telegram_token']}/sendMessage",
                    json={"chat_id": notifications["telegram_chat_id"], "text": text, "parse_mode": "HTML"},
                )
        except Exception:
            pass

    # ── Discord ───────────────────────────────────────────────────────────────
    if notifications.get("discord_enabled") and notifications.get("discord_webhook"):
        breakdown = "\n".join(f"{k.replace('_', ' ').title()}: **{c}**" for k, c in sorted(by_kind.items(), key=lambda x: -x[1])) or "No events"
        embed = {
            "title": "📊 HashHive Weekly Summary",
            "color": 0x7C3AED,
            "fields": [
                {"name": "Devices", "value": f"{nm_count} NMMiner · {ax_count} AxeOS", "inline": True},
                {"name": "Total Events (7 days)", "value": str(total), "inline": True},
                {"name": "Shares Accepted", "value": f"{shares_accepted:,}", "inline": True},
                {"name": "Shares Rejected", "value": f"{shares_rejected:,}", "inline": True},
                {"name": "Share Acceptance Rate", "value": share_acc_pct, "inline": True},
                {"name": "Offline Events", "value": str(offline_events), "inline": True},
                {"name": "Blocks Found", "value": str(blocks), "inline": True},
                {"name": "Event Breakdown", "value": breakdown[:1000], "inline": False},
            ],
            "footer": {"text": "HashHive"},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                await client.post(notifications["discord_webhook"], json={"embeds": [embed]})
        except Exception:
            pass

    # ── Gotify ────────────────────────────────────────────────────────────────
    if notifications.get("gotify_enabled") and notifications.get("gotify_url") and notifications.get("gotify_token"):
        body = f"Period: last 7 days | Events: {total} | Shares: {shares_accepted:,} accepted / {shares_rejected:,} rejected ({share_acc_pct}) | Offline: {offline_events} | Blocks found: {blocks}"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                await client.post(
                    f"{notifications['gotify_url'].rstrip('/')}/message",
                    headers={"X-Gotify-Key": notifications["gotify_token"]},
                    json={"title": "HashHive Weekly Summary", "message": body, "priority": 3},
                )
        except Exception:
            pass

    # ── Ntfy ──────────────────────────────────────────────────────────────────
    if notifications.get("ntfy_enabled") and notifications.get("ntfy_url") and notifications.get("ntfy_topic"):
        ntfy_url = notifications["ntfy_url"].rstrip("/")
        ntfy_topic = notifications["ntfy_topic"]
        ntfy_token = notifications.get("ntfy_token", "")
        body = f"Last 7 days: {total} events | {shares_accepted:,} accepted / {shares_rejected:,} rejected ({share_acc_pct}) | Offline events: {offline_events}"
        headers = {"Title": "HashHive Weekly Summary", "Priority": "3", "Tags": "honeybee,chart_with_upwards_trend"}
        if ntfy_token:
            headers["Authorization"] = f"Bearer {ntfy_token}"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                await client.post(f"{ntfy_url}/{ntfy_topic}", content=body, headers=headers)
        except Exception:
            pass


async def _weekly_summary_loop() -> None:
    """Background task: send weekly summary at the configured day+time (UTC)."""
    last_sent_week: int = -1  # ISO calendar week number of last send
    while True:
        try:
            config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
            ws = config.get("weekly_summary", {})
            if ws.get("enabled"):
                now = datetime.now(timezone.utc)
                target_weekday = _WEEKDAY_MAP.get(ws.get("day", "monday").lower(), 0)
                try:
                    th, tm = (int(x) for x in ws.get("time", "08:00").split(":"))
                except ValueError:
                    th, tm = 8, 0
                iso_week = now.isocalendar()[1]
                if (
                    now.weekday() == target_weekday
                    and now.hour == th
                    and now.minute == tm
                    and iso_week != last_sent_week
                ):
                    last_sent_week = iso_week
                    asyncio.create_task(_send_weekly_summary())
        except Exception:
            pass
        await asyncio.sleep(60)


@router.post("/api/notifications/test")
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
                    json={
                        "chat_id": chat_id,
                        "text": "🐝 <b>HashHive</b>\n🟢 <b>[TEST]</b> Test notification — everything is working!",
                        "parse_mode": "HTML",
                    },
                )
                results["telegram"] = resp.status_code == 200
            except Exception:
                results["telegram"] = False

        if notifications.get("discord_enabled") and notifications.get("discord_webhook"):
            webhook = notifications["discord_webhook"]
            try:
                resp = await client.post(webhook, json={
                    "username": "HashHive",
                    "embeds": [{
                        "title": "🐝  HashHive Alert",
                        "color": 0x22C55E,
                        "fields": [{
                            "name": "🟢  Connection Test",
                            "value": "`Test notification — everything is working!`",
                            "inline": False,
                        }],
                        "footer": {"text": "HashHive Mining Dashboard"},
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }],
                })
                results["discord"] = resp.status_code in (200, 204)
            except Exception:
                results["discord"] = False

        if notifications.get("gotify_enabled") and notifications.get("gotify_url"):
            url = notifications["gotify_url"].rstrip("/")
            gotify_token = notifications["gotify_token"]
            try:
                resp = await client.post(
                    f"{url}/message",
                    json={"title": "🐝 HashHive", "message": "🟢 [TEST] Test notification — everything is working!", "priority": 3},
                    headers={"X-Gotify-Key": gotify_token},
                )
                results["gotify"] = resp.status_code == 200
            except Exception:
                results["gotify"] = False

        if notifications.get("ntfy_enabled") and notifications.get("ntfy_url") and notifications.get("ntfy_topic"):
            ntfy_url = notifications["ntfy_url"].rstrip("/")
            ntfy_topic = notifications["ntfy_topic"]
            ntfy_token = notifications.get("ntfy_token", "")
            headers = {"Title": "HashHive Test", "Priority": "3", "Tags": "honeybee,white_check_mark"}
            if ntfy_token:
                headers["Authorization"] = f"Bearer {ntfy_token}"
            try:
                resp = await client.post(
                    f"{ntfy_url}/{ntfy_topic}",
                    content="🟢 [TEST] Test notification — everything is working!",
                    headers=headers,
                )
                results["ntfy"] = resp.status_code == 200
            except Exception:
                results["ntfy"] = False

    return {"results": results}


@router.post("/api/weekly-summary/test")
async def test_weekly_summary():
    """Immediately send a weekly summary via all configured notification channels."""
    asyncio.create_task(_send_weekly_summary())
    return {"status": "queued"}
