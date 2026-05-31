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

import httpx

from core import CONFIG_FILE, DEFAULT_CONFIG, load_json
from routers.axeos import _fetch_axeos_device
from routers.dashboard import _parse_nm_shares
from routers.lottominer import _fetch_lottominer_safe
from routers.solominer import _fetch_solo_miner


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
    nerd_devices = config.get("nerdminer_devices", [])
    spark_devices = config.get("sparkminer_devices", [])
    axeos_devices = config.get("axeos_devices", [])
    has_nm = bool(master or nm_devices)

    async with httpx.AsyncClient(timeout=10) as client:
        coros = []
        if has_nm:
            coros.append(_fetch_lottominer_safe(client, master, nm_devices))
        coros += [_fetch_solo_miner(client, d) for d in nerd_devices]
        coros += [_fetch_solo_miner(client, d) for d in spark_devices]
        coros += [_fetch_axeos_device(client, d) for d in axeos_devices]
        results = await asyncio.gather(*coros, return_exceptions=True) if coros else []

    idx = 0
    nm_data = {"devices": []}
    if has_nm:
        first = results[0] if results else {}
        nm_data = first if isinstance(first, dict) else {"devices": []}
        idx = 1
    nerd_results = [r for r in results[idx:idx + len(nerd_devices)] if isinstance(r, dict)]
    idx += len(nerd_devices)
    spark_results = [r for r in results[idx:idx + len(spark_devices)] if isinstance(r, dict)]
    idx += len(spark_devices)
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

    for d in nerd_results + spark_results:
        devices.append({
            "name": d.get("hostname") or d.get("minerName") or d.get("_name") or d.get("_ip"),
            "ip": d.get("_ip") or d.get("ip"),
            "family": d.get("_type") or "solo",
            "online": bool(d.get("_online") or d.get("online")),
            "hashrate": float(d.get("hashrate") or d.get("GHs") or 0),
            "temp": d.get("temp"),
            "power": None,
            "uptime": d.get("uptime") or d.get("uptimeSeconds"),
            "best_diff": d.get("bestDiff") or d.get("best_share") or d.get("bestShare"),
            "accepted": d.get("shares_ok"), "rejected": d.get("shares_err"),
            "pool": d.get("pool") or d.get("stratumURL"),
            "worker": d.get("worker") or d.get("stratumUser"),
            "frequency": None, "fan": None,
            "rssi": d.get("rssi"),
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


def _line(d: dict, body: str) -> str:
    dot = "🟢" if d.get("online") else "🔴"
    return f"{dot} **{d.get('name')}** — {body}"


def _cmd_status(devices: list[dict]) -> str:
    if not devices:
        return "No devices configured."
    online = sum(1 for d in devices if d.get("online"))
    total_gh = sum(d.get("hashrate", 0) for d in devices if d.get("online"))
    lines = [f"**Fleet:** {online}/{len(devices)} online · {_fmt_hashrate(total_gh)}", ""]
    for d in devices:
        if d.get("online"):
            lines.append(_line(d, f"{_fmt_hashrate(d.get('hashrate', 0))}"
                                 + (f" · {d['temp']:.0f}°C" if d.get("temp") else "")))
        else:
            lines.append(_line(d, "offline"))
    return "\n".join(lines)


def _per_device(devices: list[dict], render, empty: str) -> str:
    if not devices:
        return empty
    return "\n".join(_line(d, render(d)) for d in devices)


_HELP = (
    "**HashHive bot — commands**\n"
    "`status` — fleet overview\n"
    "`hashrate [name]` — hashrate per device\n"
    "`temp [name]` — chip temperature\n"
    "`power [name]` — power draw (AxeOS)\n"
    "`fans [name]` — fan speed (AxeOS)\n"
    "`uptime [name]` — uptime\n"
    "`best [name]` — best difficulty\n"
    "`wifi [name]` — WiFi signal (RSSI)\n"
    "`stratum [name]` — pool + worker\n"
    "`version [name]` — firmware version\n"
    "`help` — this message"
)


def handle_command(cmd: str, args: str, devices: list[dict]) -> str | None:
    """Map a command + args to reply text. Returns None for unknown commands
    (so the bot can stay silent on unrelated messages)."""
    cmd = cmd.lower().lstrip("!/")
    sel = _match(devices, args)

    if cmd in ("help", "commands", "h"):
        return _HELP
    if cmd in ("status", "fleet"):
        return _cmd_status(devices)
    if cmd in ("hashrate", "hr"):
        return _per_device(sel, lambda d: _fmt_hashrate(d.get("hashrate", 0)) if d.get("online") else "offline", "No matching devices.")
    if cmd in ("temp", "temperature"):
        return _per_device(sel, lambda d: f"{d['temp']:.0f}°C" if d.get("temp") else "—", "No matching devices.")
    if cmd == "power":
        return _per_device(sel, lambda d: f"{d['power']:.1f} W" if d.get("power") else "—", "No matching devices.")
    if cmd in ("fans", "fan"):
        return _per_device(sel, lambda d: (f"{d['fan']}%" if d.get("fan") is not None else "—"), "No matching devices.")
    if cmd == "uptime":
        return _per_device(sel, lambda d: _fmt_uptime(d.get("uptime")), "No matching devices.")
    if cmd in ("best", "bestdiff", "bestshare"):
        return _per_device(sel, lambda d: _fmt_diff(d.get("best_diff")), "No matching devices.")
    if cmd in ("wifi", "rssi"):
        return _per_device(sel, lambda d: f"{d['rssi']} dBm" if d.get("rssi") is not None else "—", "No matching devices.")
    if cmd in ("stratum", "pool"):
        return _per_device(sel, lambda d: f"{d.get('pool') or '—'} ({d.get('worker') or '—'})", "No matching devices.")
    if cmd in ("version", "ver"):
        return _per_device(sel, lambda d: d.get("version") or "—", "No matching devices.")
    return None


# ── Gateway glue (discord.py imported lazily) ────────────────────────────────

_bot_task: asyncio.Task | None = None


async def _run_bot(token: str, prefix: str) -> None:
    import discord  # lazy: only needed when the bot is actually enabled

    intents = discord.Intents.default()
    intents.message_content = True
    client = discord.Client(intents=intents)

    @client.event
    async def on_message(message):
        if message.author == client.user or not message.content.startswith(prefix):
            return
        parts = message.content[len(prefix):].strip().split(maxsplit=1)
        if not parts:
            return
        cmd, args = parts[0], (parts[1] if len(parts) > 1 else "")
        try:
            devices = await collect_devices()
            reply = handle_command(cmd, args, devices)
        except Exception:
            reply = "⚠️ Failed to query the fleet."
        if reply:
            for chunk in _chunk(reply, 1900):
                await message.channel.send(chunk)

    await client.start(token)


def _chunk(text: str, size: int) -> list[str]:
    """Split a reply into Discord-message-sized pieces on line boundaries."""
    out, buf = [], ""
    for line in text.split("\n"):
        if len(buf) + len(line) + 1 > size:
            out.append(buf)
            buf = ""
        buf += line + "\n"
    if buf.strip():
        out.append(buf)
    return out or [text[:size]]


async def _discord_bot_loop() -> None:
    """Start/stop the gateway connection as the config toggles. Polls the config
    so enabling the bot in Settings takes effect without a restart."""
    global _bot_task
    while True:
        try:
            config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
            cfg = config.get("discord_bot", {})
            enabled = bool(cfg.get("enabled") and cfg.get("token"))
            running = _bot_task is not None and not _bot_task.done()
            if enabled and not running:
                token = cfg["token"]
                prefix = cfg.get("prefix") or "!"
                _bot_task = asyncio.create_task(_run_bot(token, prefix))
            elif not enabled and running:
                _bot_task.cancel()
                _bot_task = None
        except Exception:
            pass
        await asyncio.sleep(30)
