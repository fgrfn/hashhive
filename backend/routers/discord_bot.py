"""Interactive Discord bot — phase A of the bitaxe-discord-bot integration.

Where discord_dashboard.py *pushes* a fleet embed via webhook, this connects to
the Discord Gateway with a bot token and *answers commands* (!status, !hashrate,
!temp, …) for the whole fleet — the original bot's feature, generalised.

Design: the command logic (`handle_command`) is pure and synchronous — it takes
the command, args and a list of normalised device dicts and returns the reply
text. That keeps it fully unit-testable without a Discord connection. The
gateway glue (`_run_bot` / `_discord_bot_loop`) imports discord.py lazily so the
rest of the backend (and the test suite) never needs it installed.
"""

import asyncio
from datetime import datetime, timezone

import httpx

from core import CONFIG_FILE, DEFAULT_CONFIG, load_json
from routers.axeos import _fetch_axeos_device
from routers.dashboard import _parse_nm_shares
from routers.lottominer import _fetch_lottominer_safe


def _fmt_hashrate(gh: float) -> str:
    if gh >= 1_000_000:
        return f"{gh / 1_000_000:.2f} PH/s"
    if gh >= 1_000:
        return f"{gh / 1_000:.2f} TH/s"
    if 0 < gh < 1:
        return f"{gh * 1000:.1f} MH/s"
    return f"{gh:.1f} GH/s"


def _fmt_uptime(seconds) -> str:
    try:
        s = int(seconds)
    except (TypeError, ValueError):
        return "—"
    if s <= 0:
        return "—"
    d, rem = divmod(s, 86400)
    h, rem = divmod(rem, 3600)
    m, _ = divmod(rem, 60)
    if d:
        return f"{d}d {h}h"
    if h:
        return f"{h}h {m}m"
    return f"{m}m"


def _fmt_diff(val) -> str:
    try:
        v = float(val)
    except (TypeError, ValueError):
        return "—"
    for unit, factor in (("T", 1e12), ("G", 1e9), ("M", 1e6), ("K", 1e3)):
        if v >= factor:
            return f"{v / factor:.2f}{unit}"
    return f"{v:.0f}"


async def collect_devices() -> list[dict]:
    """Return one normalised dict per configured device, across all families.

    Normalised keys: name, ip, family, online, hashrate (GH/s), temp, power,
    uptime, best_diff, accepted, rejected, pool, worker, frequency, fan, rssi,
    version. Missing values are None. Reuses the same fetch helpers as the web
    dashboard so the numbers match.
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

    devices: list[dict] = []

    for d in nm_data.get("devices", []):
        acc, rej = _parse_nm_shares(d)
        devices.append({
            "name": d.get("hostname") or d.get("name") or d.get("ip"),
            "ip": d.get("ip") or d.get("_ip"),
            "family": "lottominer",
            "online": bool(d.get("online", True)) and d.get("status") != "offline",
            "hashrate": float(d.get("GHs5s") or d.get("GHs5") or d.get("GHs1m") or d.get("GHsav") or d.get("hashrate") or 0),
            "temp": d.get("temp"),
            "power": None,
            "uptime": d.get("uptime"),
            "best_diff": d.get("bestDiff") or d.get("bestShare") or d.get("best_share"),
            "accepted": acc, "rejected": rej,
            "pool": d.get("pool") or d.get("stratumURL"),
            "worker": d.get("worker") or d.get("stratumUser"),
            "frequency": None, "fan": None,
            "rssi": d.get("rssi") or d.get("wifi_rssi"),
            "version": d.get("version"),
        })

    for d in axeos_results:
        devices.append({
            "name": d.get("_name") or d.get("hostname") or d.get("_ip"),
            "ip": d.get("_ip") or d.get("ip"),
            "family": d.get("_type") or "axeos",
            "online": bool(d.get("_online")),
            "hashrate": float(d.get("hashRate") or d.get("hashrate") or 0),
            "temp": d.get("temp"),
            "power": d.get("power"),
            "uptime": d.get("uptimeSeconds"),
            "best_diff": d.get("bestDiff"),
            "accepted": d.get("sharesAccepted"), "rejected": d.get("sharesRejected"),
            "pool": d.get("stratumURL"),
            "worker": d.get("stratumUser"),
            "frequency": d.get("frequency"),
            "fan": d.get("fanspeed") if d.get("fanspeed") is not None else d.get("fanrpm"),
            "rssi": d.get("rssi"),
            "version": d.get("version") or d.get("axeOSVersion"),
        })

    return devices


# ── Command handlers ─────────────────────────────────────────────────────────
# Each takes the device list and returns reply text. Pure + synchronous.

def _match(devices: list[dict], query: str) -> list[dict]:
    """Filter devices by a name/IP substring; empty query returns all."""
    q = query.strip().lower()
    if not q:
        return devices
    return [d for d in devices if q in str(d.get("name", "")).lower() or q in str(d.get("ip", "")).lower()]


_EMBED_COLOR = 0x7C3AED  # HashHive purple — matches the alert/dashboard embeds


def _embed(title: str, fields: list[dict], description: str = "") -> dict:
    """Build a Discord embed dict in the HashHive house style (purple, 🐝,
    timestamped footer). Returned as plain JSON so the logic stays test-friendly."""
    out: dict = {
        "title": f"🐝  {title}",
        "color": _EMBED_COLOR,
        "footer": {"text": "HashHive"},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if description:
        out["description"] = description
    if fields:
        out["fields"] = fields[:25]  # Discord cap
    return out


def _dev_field(d: dict, value: str) -> dict:
    dot = "🟢" if d.get("online") else "🔴"
    return {"name": f"{dot}  {d.get('name')}", "value": value or "—", "inline": True}


def _cmd_status(devices: list[dict]) -> dict:
    if not devices:
        return _embed("Fleet status", [], "No devices configured.")
    online = sum(1 for d in devices if d.get("online"))
    total_gh = sum(d.get("hashrate", 0) for d in devices if d.get("online"))
    fields = []
    for d in devices:
        if d.get("online"):
            val = _fmt_hashrate(d.get("hashrate", 0)) + (f" · {d['temp']:.0f}°C" if d.get("temp") else "")
        else:
            val = "offline"
        fields.append(_dev_field(d, val))
    desc = f"**{online}/{len(devices)}** online · {_fmt_hashrate(total_gh)}"
    return _embed("Fleet status", fields, desc)


def _per_device(title: str, devices: list[dict], render) -> dict:
    if not devices:
        return _embed(title, [], "No matching devices.")
    return _embed(title, [_dev_field(d, render(d)) for d in devices])


_HELP_FIELDS = [
    {"name": "Fleet", "value": "`status`", "inline": False},
    {"name": "Performance", "value": "`hashrate` · `temp` · `power` · `fans`", "inline": False},
    {"name": "Info", "value": "`uptime` · `best` · `wifi` · `stratum` · `version`", "inline": False},
    {"name": "Tip", "value": "Add a device name to filter, e.g. `temp gamma`", "inline": False},
]


def handle_command(cmd: str, args: str, devices: list[dict]) -> dict | None:
    """Map a command + args to a Discord embed dict. Returns None for unknown
    commands (so the bot can stay silent on unrelated messages)."""
    cmd = cmd.lower().lstrip("!/")
    sel = _match(devices, args)

    if cmd in ("help", "commands", "h"):
        return _embed("Bot commands", _HELP_FIELDS)
    if cmd in ("status", "fleet"):
        return _cmd_status(devices)
    if cmd in ("hashrate", "hr"):
        return _per_device("Hashrate", sel, lambda d: _fmt_hashrate(d.get("hashrate", 0)) if d.get("online") else "offline")
    if cmd in ("temp", "temperature"):
        return _per_device("Chip temperature", sel, lambda d: f"{d['temp']:.0f}°C" if d.get("temp") else "—")
    if cmd == "power":
        return _per_device("Power draw", sel, lambda d: f"{d['power']:.1f} W" if d.get("power") else "—")
    if cmd in ("fans", "fan"):
        return _per_device("Fan speed", sel, lambda d: (f"{d['fan']}%" if d.get("fan") is not None else "—"))
    if cmd == "uptime":
        return _per_device("Uptime", sel, lambda d: _fmt_uptime(d.get("uptime")))
    if cmd in ("best", "bestdiff", "bestshare"):
        return _per_device("Best difficulty", sel, lambda d: _fmt_diff(d.get("best_diff")))
    if cmd in ("wifi", "rssi"):
        return _per_device("WiFi signal", sel, lambda d: f"{d['rssi']} dBm" if d.get("rssi") is not None else "—")
    if cmd in ("stratum", "pool"):
        return _per_device("Pool", sel, lambda d: f"{d.get('pool') or '—'} ({d.get('worker') or '—'})")
    if cmd in ("version", "ver"):
        return _per_device("Firmware version", sel, lambda d: d.get("version") or "—")
    return None


# ── Gateway glue (discord.py imported lazily) ────────────────────────────────

_bot_task: asyncio.Task | None = None


async def _run_bot(token: str, prefix: str, channel_id: str) -> None:
    import discord  # lazy: only needed when the bot is actually enabled

    # Optional channel restriction: blank → respond anywhere the bot can read;
    # set → only react to messages in that channel.
    try:
        only_channel = int(channel_id) if channel_id else None
    except (TypeError, ValueError):
        only_channel = None

    intents = discord.Intents.default()
    intents.message_content = True
    client = discord.Client(intents=intents)

    @client.event
    async def on_message(message):
        if message.author == client.user or not message.content.startswith(prefix):
            return
        if only_channel is not None and message.channel.id != only_channel:
            return
        parts = message.content[len(prefix):].strip().split(maxsplit=1)
        if not parts:
            return
        cmd, args = parts[0], (parts[1] if len(parts) > 1 else "")
        try:
            devices = await collect_devices()
            reply = handle_command(cmd, args, devices)
        except Exception:
            reply = _embed("Error", [], "⚠️ Failed to query the fleet.")
        if reply:
            await message.channel.send(embed=discord.Embed.from_dict(reply))

    await client.start(token)


# Settings the running connection was started with — used to restart the bot
# when the token/prefix/channel change while it's already running.
_bot_signature: tuple | None = None


async def _discord_bot_loop() -> None:
    """Start/stop/restart the gateway connection as the config changes. Polls the
    config so changes in Settings take effect without a backend restart."""
    global _bot_task, _bot_signature
    while True:
        try:
            config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
            cfg = config.get("discord_bot", {})
            enabled = bool(cfg.get("enabled") and cfg.get("token"))
            token = cfg.get("token") or ""
            prefix = cfg.get("prefix") or "!"
            channel_id = str(cfg.get("channel_id") or "")
            signature = (token, prefix, channel_id)
            running = _bot_task is not None and not _bot_task.done()

            if enabled and (not running or signature != _bot_signature):
                if running:
                    _bot_task.cancel()
                _bot_task = asyncio.create_task(_run_bot(token, prefix, channel_id))
                _bot_signature = signature
            elif not enabled and running:
                _bot_task.cancel()
                _bot_task = None
                _bot_signature = None
        except Exception:
            pass
        await asyncio.sleep(30)
