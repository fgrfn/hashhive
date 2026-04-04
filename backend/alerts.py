import json
import asyncio
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

BASE_DIR = Path(__file__).parent
# Daten-Verzeichnis: per Env-Variable überschreibbar (z.B. Docker-Volume)
DATA_DIR = Path(os.environ.get("HASHHIVE_DATA_DIR", BASE_DIR))
LOGS_DIR = DATA_DIR / "logs"
DEVICE_STATE_FILE = DATA_DIR / "device_state.json"

MAX_ENTRIES_PER_DAY = 1000


def load_json(path: Path, default: Any) -> Any:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    return default


def save_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _log_file(date_str: str) -> Path:
    return LOGS_DIR / f"{date_str}.json"


def _append_alerts(new_alerts: list) -> None:
    if not new_alerts:
        return
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    date_str = _today()
    lf = _log_file(date_str)
    existing: list = load_json(lf, [])
    merged = new_alerts + existing
    if len(merged) > MAX_ENTRIES_PER_DAY:
        merged = merged[:MAX_ENTRIES_PER_DAY]
    save_json(lf, merged)


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
    grace_seconds: float = float(config.get("offline_grace_minutes", 2)) * 60

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

            prev = previous_state.get(key, {})
            was_online = prev.get("online", True)

            # Base state (carry over offline tracking fields when still offline)
            current_state[key] = {
                "online": is_online,
                "temp": temp,
                "hashrate": hashrate,
                "pool": pool,
            }

            if was_online and not is_online:
                # Just went offline — start grace timer, no alert yet
                current_state[key]["offline_since"] = _now_iso()
                current_state[key]["offline_alerted"] = False
            elif not was_online and not is_online:
                # Still offline — preserve tracking fields
                offline_since = prev.get("offline_since", _now_iso())
                alerted = prev.get("offline_alerted", False)
                current_state[key]["offline_since"] = offline_since
                current_state[key]["offline_alerted"] = alerted
                if not alerted:
                    try:
                        elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(offline_since)).total_seconds()
                        if elapsed >= grace_seconds:
                            new_alerts.append(_make_alert(key, "offline", "critical", f"NMMiner {ip} is offline"))
                            current_state[key]["offline_alerted"] = True
                    except Exception:
                        pass
            elif not was_online and is_online:
                # Came back online
                if prev.get("offline_alerted", False):
                    new_alerts.append(_make_alert(key, "online", "info", f"NMMiner {ip} is back online"))

            if is_online:
                dev_temp_max = device.get("_temp_max")
                effective_temp_max = float(dev_temp_max) if dev_temp_max is not None else temp_max
                if temp > effective_temp_max:
                    new_alerts.append(
                        _make_alert(key, "temp_high", "critical",
                                    f"NMMiner {ip}: temperature {temp:.1f}°C > {effective_temp_max:.0f}°C")
                    )
                if hashrate_min > 0 and hashrate < hashrate_min:
                    new_alerts.append(
                        _make_alert(key, "hashrate_low", "warning",
                                    f"NMMiner {ip}: hashrate {hashrate:.2f} GH/s < {hashrate_min:.2f} GH/s")
                    )
                prev_pool = prev.get("pool", "")
                if prev_pool and not pool:
                    new_alerts.append(_make_alert(key, "pool_lost", "critical", f"NMMiner {ip}: pool connection lost"))
                elif not prev_pool and pool:
                    new_alerts.append(_make_alert(key, "pool_connected", "info", f"NMMiner {ip}: pool connected"))

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
        # Per-device temp_max override
        dev_temp_max = device.get("_temp_max")
        effective_temp_max = float(dev_temp_max) if dev_temp_max is not None else temp_max

        prev = previous_state.get(key, {})
        was_online = prev.get("online", True)

        current_state[key] = {
            "online": is_online,
            "temp": temp,
            "hashrate": hashrate,
            "pool": pool,
        }

        if was_online and not is_online:
            current_state[key]["offline_since"] = _now_iso()
            current_state[key]["offline_alerted"] = False
        elif not was_online and not is_online:
            offline_since = prev.get("offline_since", _now_iso())
            alerted = prev.get("offline_alerted", False)
            current_state[key]["offline_since"] = offline_since
            current_state[key]["offline_alerted"] = alerted
            if not alerted:
                try:
                    elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(offline_since)).total_seconds()
                    if elapsed >= grace_seconds:
                        new_alerts.append(_make_alert(key, "offline", "critical", f"{name} ({ip}) is offline"))
                        current_state[key]["offline_alerted"] = True
                except Exception:
                    pass
        elif not was_online and is_online:
            if prev.get("offline_alerted", False):
                new_alerts.append(_make_alert(key, "online", "info", f"{name} ({ip}) is back online"))

        if is_online:
            if temp > effective_temp_max:
                new_alerts.append(
                    _make_alert(key, "temp_high", "critical",
                                f"{name}: temperature {temp:.1f}°C > {effective_temp_max:.0f}°C")
                )
            if hashrate_min > 0 and hashrate < hashrate_min:
                new_alerts.append(
                    _make_alert(key, "hashrate_low", "warning",
                                f"{name}: hashrate {hashrate:.2f} GH/s < {hashrate_min:.2f} GH/s")
                )
            prev_pool = prev.get("pool", "")
            if prev_pool and not pool:
                new_alerts.append(_make_alert(key, "pool_lost", "critical", f"{name}: pool connection lost"))
            elif not prev_pool and pool:
                new_alerts.append(_make_alert(key, "pool_connected", "info", f"{name}: pool connected"))

    # ── Persist state & history ───────────────────────────────────────────────
    save_json(DEVICE_STATE_FILE, current_state)

    if new_alerts:
        _append_alerts(new_alerts)

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
