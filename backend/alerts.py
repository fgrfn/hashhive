import json
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

BASE_DIR = Path(__file__).parent
ALERT_HISTORY_FILE = BASE_DIR / "alert_history.json"
DEVICE_STATE_FILE = BASE_DIR / "device_state.json"

MAX_ALERT_HISTORY = 500


def load_json(path: Path, default: Any) -> Any:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    return default


def save_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_alert(device_key: str, kind: str, severity: str, message: str) -> dict:
    return {
        "id": f"{device_key}:{kind}:{_now_iso()}",
        "device": device_key,
        "kind": kind,
        "severity": severity,
        "message": message,
        "timestamp": _now_iso(),
        "read": False,
    }


async def check_alerts(config: dict, nmminer_data: dict, axeos_data: dict) -> list[dict]:
    previous_state: dict = load_json(DEVICE_STATE_FILE, {})
    thresholds = config.get("thresholds", {})
    temp_max: float = float(thresholds.get("temp_max", 70))
    hashrate_min: float = float(thresholds.get("hashrate_min", 0))

    current_state: dict = {}
    new_alerts: list[dict] = []

    # ── NMMiner devices ──────────────────────────────────────────────────────
    raw_nm = nmminer_data if isinstance(nmminer_data, list) else nmminer_data.get("devices", [])
    if isinstance(raw_nm, list):
        for device in raw_nm:
            ip: str = device.get("ip", "") or device.get("_ip", "")
            if not ip:
                continue
            key = f"nmminer:{ip}"
            is_online: bool = device.get("online", True)
            temp: float = float(device.get("temp", 0) or device.get("temperature", 0) or 0)
            hashrate: float = float(device.get("GHs5s", 0) or device.get("hashrate", 0) or 0)
            pool: str = str(device.get("pool", "") or "")

            current_state[key] = {
                "online": is_online,
                "temp": temp,
                "hashrate": hashrate,
                "pool": pool,
            }
            prev = previous_state.get(key, {})

            # Online/offline transitions
            if prev.get("online", True) and not is_online:
                new_alerts.append(_make_alert(key, "offline", "critical", f"NMMiner {ip} ist offline"))
            elif not prev.get("online", True) and is_online:
                new_alerts.append(_make_alert(key, "online", "info", f"NMMiner {ip} ist wieder online"))

            if is_online:
                if temp > temp_max:
                    new_alerts.append(
                        _make_alert(key, "temp_high", "critical",
                                    f"NMMiner {ip}: Temperatur {temp:.1f}°C > {temp_max:.0f}°C")
                    )
                if hashrate_min > 0 and hashrate < hashrate_min:
                    new_alerts.append(
                        _make_alert(key, "hashrate_low", "warning",
                                    f"NMMiner {ip}: Hashrate {hashrate:.2f} GH/s < {hashrate_min:.2f} GH/s")
                    )
                prev_pool = prev.get("pool", "")
                if prev_pool and not pool:
                    new_alerts.append(_make_alert(key, "pool_lost", "critical", f"NMMiner {ip}: Pool-Verbindung verloren"))
                elif not prev_pool and pool:
                    new_alerts.append(_make_alert(key, "pool_connected", "info", f"NMMiner {ip}: Pool verbunden"))

    # ── AxeOS devices ────────────────────────────────────────────────────────
    for device in axeos_data.get("devices", []):
        ip = device.get("_ip", "")
        name: str = device.get("_name", ip)
        if not ip:
            continue
        key = f"axeos:{ip}"
        is_online = bool(device.get("_online", False))
        temp = float(device.get("temp", 0) or 0)
        hashrate = float(device.get("hashRate", 0) or 0)
        pool = str(device.get("stratumURL", "") or "")

        current_state[key] = {
            "online": is_online,
            "temp": temp,
            "hashrate": hashrate,
            "pool": pool,
        }
        prev = previous_state.get(key, {})

        if prev.get("online", True) and not is_online:
            new_alerts.append(_make_alert(key, "offline", "critical", f"{name} ({ip}) ist offline"))
        elif not prev.get("online", True) and is_online:
            new_alerts.append(_make_alert(key, "online", "info", f"{name} ({ip}) ist wieder online"))

        if is_online:
            if temp > temp_max:
                new_alerts.append(
                    _make_alert(key, "temp_high", "critical",
                                f"{name}: Temperatur {temp:.1f}°C > {temp_max:.0f}°C")
                )
            if hashrate_min > 0 and hashrate < hashrate_min:
                new_alerts.append(
                    _make_alert(key, "hashrate_low", "warning",
                                f"{name}: Hashrate {hashrate:.2f} GH/s < {hashrate_min:.2f} GH/s")
                )
            prev_pool = prev.get("pool", "")
            if prev_pool and not pool:
                new_alerts.append(_make_alert(key, "pool_lost", "critical", f"{name}: Pool-Verbindung verloren"))
            elif not prev_pool and pool:
                new_alerts.append(_make_alert(key, "pool_connected", "info", f"{name}: Pool verbunden"))

    # ── Persist state & history ───────────────────────────────────────────────
    save_json(DEVICE_STATE_FILE, current_state)

    if new_alerts:
        history: list = load_json(ALERT_HISTORY_FILE, [])
        history.extend(new_alerts)
        if len(history) > MAX_ALERT_HISTORY:
            history = history[-MAX_ALERT_HISTORY:]
        save_json(ALERT_HISTORY_FILE, history)

        notifications = config.get("notifications", {})
        if any([
            notifications.get("telegram_enabled"),
            notifications.get("discord_enabled"),
            notifications.get("gotify_enabled"),
        ]):
            asyncio.create_task(_send_notifications(notifications, new_alerts))

    return new_alerts


async def _send_notifications(notifications: dict, alerts: list[dict]) -> None:
    message = "\n".join(f"[{a['severity'].upper()}] {a['message']}" for a in alerts)

    async with httpx.AsyncClient(timeout=10) as client:
        if notifications.get("telegram_enabled") and notifications.get("telegram_token"):
            token = notifications["telegram_token"]
            chat_id = notifications["telegram_chat_id"]
            try:
                await client.post(
                    f"https://api.telegram.org/bot{token}/sendMessage",
                    json={"chat_id": chat_id, "text": f"🐝 HashHive Alert:\n{message}"},
                )
            except Exception:
                pass

        if notifications.get("discord_enabled") and notifications.get("discord_webhook"):
            webhook = notifications["discord_webhook"]
            try:
                await client.post(webhook, json={"content": f"**🐝 HashHive Alert**\n{message}"})
            except Exception:
                pass

        if notifications.get("gotify_enabled") and notifications.get("gotify_url"):
            url = notifications["gotify_url"].rstrip("/")
            token = notifications["gotify_token"]
            priority = 8 if any(a["severity"] == "critical" for a in alerts) else 5
            try:
                await client.post(
                    f"{url}/message",
                    json={"title": "HashHive Alert", "message": message, "priority": priority},
                    headers={"X-Gotify-Key": token},
                )
            except Exception:
                pass
