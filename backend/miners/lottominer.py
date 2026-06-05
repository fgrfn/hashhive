"""Lottominer (NMMiner) driver + helpers — uses the real NMMiner HTTP API.

NMMiner exposes:
  GET  /probe                  -> {model:"NMMiner", hostname, ver, hr, sbd, ebd, ut, ...}
  GET  /api/system/info        -> {identity, miner, stratum, temps, storage}
  GET/POST /api/setting/mining -> Primary/Secondary pool+address+password
  GET/POST /api/setting/network-> Hostname, WiFiSSID
  POST /api/system/restart
(There is no /swarm, /config or /reboot — those were assumed incorrectly before.)
Docs: https://github.com/NMminer1024/NMMiner/blob/main/docs/api-reference.md
"""

import asyncio
import re
from datetime import datetime, timezone

import httpx

from core import _append_entry, _validate_device_ip

from .base import MinerDriver

LOTTO_ACTION_MAP = {
    "restart": "/api/system/restart",
}


def ensure_stratum_scheme(url: str) -> str:
    """NMMiner needs a full ``stratum+tcp://host:port`` pool URL. A bare
    ``host:port`` makes its resolver fail with DNS errors, so prepend the
    default scheme when none is present. URLs that already carry a scheme
    (``stratum+tcp://``, ``stratum+ssl://``, …) are returned unchanged."""
    url = (url or "").strip()
    if not url or "://" in url:
        return url
    return f"stratum+tcp://{url}"


# An ESP32 lottominer realistically does ~10 H/s … ~5 MH/s. Different NMMiner
# firmwares report miner.hashRate in inconsistent units (GH/s, MH/s, kH/s), and
# we treat the value as GH/s. Anything above this generous ceiling (50 MH/s) is
# therefore mis-scaled, so we divide it down by 1000s into a sane range.
_ESP32_MAX_GHS = 0.05


def _plausible_ghs(hr):
    """Normalize a NMMiner hashRate to GH/s, scaling down implausible values that
    were reported in a smaller unit (kH/s / MH/s) but assumed to be GH/s."""
    try:
        v = float(hr)
    except (TypeError, ValueError):
        return hr
    if v <= 0:
        return v
    for _ in range(4):  # cover up to GH/s mislabeled as H/s
        if v <= _ESP32_MAX_GHS:
            break
        v /= 1000.0
    return v


def _normalize_info(ip: str, name: str, temp_max, data: dict) -> dict:
    """Map a NMMiner /api/system/info snapshot to the unified device dict."""
    identity = data.get("identity", {}) if isinstance(data, dict) else {}
    miner = data.get("miner", {}) if isinstance(data, dict) else {}
    stratum = data.get("stratum", {}) if isinstance(data, dict) else {}
    temps = data.get("temps", {}) if isinstance(data, dict) else {}
    hr = _plausible_ghs(miner.get("hashRate"))  # normalized to GH/s
    temp = temps.get("asic")
    if temp is None:
        temp = temps.get("vcore")
    return {
        "_ip": ip, "_name": name, "_type": "lottominer", "_online": True, "_temp_max": temp_max,
        "ip": ip,
        "name": name,
        "model": identity.get("model") or identity.get("hwModel") or "NMMiner",
        "hostname": identity.get("hostName") or name,
        "GHs": hr, "GHs5s": hr, "hashrate": hr,
        "temp": temp,
        "pool": stratum.get("url", ""),
        "stratumURL": stratum.get("url", ""),
        "worker": stratum.get("user", ""),
        "stratumUser": stratum.get("user", ""),
        "uptime": miner.get("uptimeSeconds"),
        "bestDiff": miner.get("bestDiffEver"),
        "bestShare": miner.get("bestDiffEver"),
        "lastDiff": miner.get("lastDiff"),
        "version": identity.get("fwVersion", ""),
        "shares_ok": miner.get("sAccepted"),
        "shares_err": miner.get("sRejected"),
        "rssi": identity.get("rssi"),
        "wifi_rssi": identity.get("rssi"),
        "online": True,
        "status": "online",
    }


# ── Legacy NMMiner (v1.8.x "swarm" firmware) ──────────────────────────────────
# Old firmware predates /probe and /api/system/info; it serves GET /swarm with a
# summary + devices[] list whose values are pre-formatted strings. Parsing logic
# mirrors the official NMController_web controller.
_HR_UNITS = {"H/S": 1, "KH/S": 1e3, "MH/S": 1e6, "GH/S": 1e9, "TH/S": 1e12, "PH/S": 1e15}
_DIFF_SUFFIX = {"": 1, "K": 1e3, "M": 1e6, "G": 1e9, "T": 1e12, "P": 1e15}


def _swarm_hashrate_ghs(s):
    """Parse a swarm hashRate string like ``"1.0045MH/s"`` to GH/s."""
    if isinstance(s, (int, float)):
        return float(s) / 1e9
    if not isinstance(s, str):
        return None
    m = re.fullmatch(r"\s*([\d.]+)\s*([KMGTP]?H/s)\s*", s, re.IGNORECASE)
    if not m:
        try:
            return float(s) / 1e9
        except ValueError:
            return None
    return float(m.group(1)) * _HR_UNITS.get(m.group(2).upper(), 1) / 1e9


def _parse_diff_token(tok: str):
    m = re.fullmatch(r"\s*([\d.]+)\s*([KMGTP]?)\s*", tok, re.IGNORECASE)
    if not m:
        return None
    return float(m.group(1)) * _DIFF_SUFFIX.get(m.group(2).upper(), 1)


def _swarm_diff(s):
    """Parse a diff string. Handles the dual ``"0.016 /3.282K"`` (session/best)
    form by returning the larger value, and single ``"0.001 "`` values."""
    if s is None or isinstance(s, (int, float)):
        return s
    vals = [v for v in (_parse_diff_token(p) for p in str(s).split("/")) if v is not None]
    return max(vals) if vals else None


def _swarm_uptime_seconds(s):
    """Parse the ``"000d 00:00:09/263d 22:30:09"`` (current/total) uptime to the
    current uptime in seconds."""
    if s is None:
        return None
    cur = str(s).split("/")[0].strip()
    m = re.fullmatch(r"(\d+)d\s+(\d{1,2}):(\d{2}):(\d{2})", cur)
    if not m:
        return None
    d, h, mi, sec = (int(x) for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + sec


def _swarm_shares(s):
    """Parse ``"rejected/accepted/rate%"`` -> ``(accepted, rejected)`` (matching
    the dashboard's NMMiner share convention)."""
    if not isinstance(s, str):
        return (None, None)
    parts = s.split("/")
    if len(parts) >= 2:
        try:
            return (int(parts[1]), int(parts[0]))
        except ValueError:
            return (None, None)
    return (None, None)


def _swarm_int(s):
    try:
        return int(float(s))
    except (TypeError, ValueError):
        return None


def _normalize_swarm(master_ip: str, master_name, temp_max, sd: dict) -> dict:
    """Map one entry of a legacy ``/swarm`` ``devices[]`` list to the unified dict.

    A swarm master can report several workers; each carries its own ``ip``.
    """
    sd = sd if isinstance(sd, dict) else {}
    worker_ip = sd.get("ip") or master_ip
    name = master_name if worker_ip == master_ip else (sd.get("boardType") or worker_ip)
    ghs = _swarm_hashrate_ghs(sd.get("hashRate"))
    acc, rej = _swarm_shares(sd.get("share"))
    temp_raw = sd.get("temp")
    temp = None if str(temp_raw).strip().upper() in ("", "N/A", "NONE") else _swarm_int(temp_raw)
    best = _swarm_diff(sd.get("bestDiff"))
    return {
        "_ip": worker_ip, "_name": name, "_type": "lottominer", "_online": True,
        "_temp_max": temp_max, "_legacy": True,
        "ip": worker_ip,
        "name": name,
        "model": "NMMiner",
        "legacy": True,
        "hostname": sd.get("boardType") or name,
        "GHs": ghs, "GHs5s": ghs, "hashrate": ghs,
        "temp": temp,
        "pool": sd.get("pool", ""),
        "stratumURL": sd.get("pool", ""),
        "worker": "",
        "stratumUser": "",
        "uptime": _swarm_uptime_seconds(sd.get("uptime")),
        "bestDiff": best,
        "bestShare": best,
        "lastDiff": _swarm_diff(sd.get("lastDiff")),
        "version": sd.get("version", ""),
        "shares_ok": acc,
        "shares_err": rej,
        "rssi": _swarm_int(sd.get("rssi")),
        "wifi_rssi": _swarm_int(sd.get("rssi")),
        "online": True,
        "status": "online",
    }


async def fetch_lottominer_safe(
    client: httpx.AsyncClient,
    nm_devices: list | None = None,
) -> dict:
    """Poll each configured NMMiner via GET /api/system/info (devices are standalone)."""
    seen: set[str] = set()
    targets: list[dict] = []
    for d in (nm_devices or []):
        ip = d.get("ip") if isinstance(d, dict) else d
        if ip and ip not in seen:
            seen.add(ip)
            targets.append({"ip": ip, "name": (d.get("name") if isinstance(d, dict) else "") or ip,
                            "temp_max": d.get("temp_max") if isinstance(d, dict) else None})
    if not targets:
        return {"devices": []}

    results: list[dict] = []

    async def _one(dev: dict):
        ip = dev["ip"]
        # New firmware (v2.x): per-device GET /api/system/info.
        try:
            r = await client.get(f"http://{ip}/api/system/info")
            r.raise_for_status()
            results.append(_normalize_info(ip, dev.get("name", ip), dev.get("temp_max"), r.json()))
            return
        except Exception:
            pass
        # Legacy firmware (v1.8.x): GET /swarm returns a summary + devices[] list.
        try:
            r = await client.get(f"http://{ip}/swarm")
            r.raise_for_status()
            data = r.json()
            swarm_devs = data.get("devices") if isinstance(data, dict) else None
            if swarm_devs:
                for sd in swarm_devs:
                    results.append(_normalize_swarm(ip, dev.get("name", ip), dev.get("temp_max"), sd))
                return
        except Exception:
            pass
        results.append({"_ip": ip, "_name": dev.get("name", ip), "_type": "lottominer",
                        "_online": False, "_temp_max": dev.get("temp_max"), "model": "NMMiner",
                        "ip": ip, "hostname": dev.get("name", ip), "online": False, "status": "offline"})

    await asyncio.gather(*[_one(d) for d in targets])
    return {"devices": results}


async def lottominer_fanout(action: str, ips: list[str]) -> list[dict]:
    """Fire a Lottominer action at many devices concurrently. Reused by the batch
    endpoint, schedules and group actions."""
    path = LOTTO_ACTION_MAP[action]
    results: list[dict] = []

    async def _act(ip: str):
        _validate_device_ip(ip)
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                # NMMiner registers restart as a JSON-body handler — without an
                # application/json Content-Type the POST handler doesn't match and
                # the device replies 405. Send the documented empty body `{}`.
                resp = await client.post(f"http://{ip}{path}", json={})
                results.append({"ip": ip, "status": resp.status_code})
                now = datetime.now(timezone.utc).isoformat()
                _append_entry({
                    "id": f"lottominer:{ip}:{action}:{now}",
                    "device": f"lottominer:{ip}",
                    "kind": f"device_{action}",
                    "severity": "info",
                    "message": f"Lottominer {ip}: {action} triggered",
                    "timestamp": now,
                    "read": True,
                    "source": "lottominer",
                })
        except Exception as exc:
            results.append({"ip": ip, "status": 0, "error": str(exc)})

    await asyncio.gather(*[_act(ip) for ip in ips])
    return results


async def probe_lottominer(ip: str, client: httpx.AsyncClient) -> dict | None:
    """Discovery probe: detect a NMMiner.

    Tries three endpoints, newest first, so every firmware generation is found:
    ``/probe`` (older v1.x/v2.x fast path) → ``/api/system/info`` (v2.x firmware
    without ``/probe``, e.g. v2.0.02) → ``/swarm`` (legacy v1.8.x swarm firmware,
    which serves neither of the first two).
    """
    # Stage 1: NMMiner's lightweight /probe endpoint.
    try:
        resp = await client.get(f"http://{ip}/probe", timeout=2.0)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, dict):
                is_nm = str(data.get("model", "")).lower() == "nmminer" or (
                    "hr" in data and "ver" in data
                )
                if is_nm:
                    return {
                        "ip": ip,
                        "type": "lottominer_device",
                        "name": data.get("hostname") or f"NMMiner ({ip})",
                        "model": "NMMiner",
                        "device_count": 1,
                        "version": data.get("ver", ""),
                    }
    except Exception:
        pass

    # Stage 2: identify via /api/system/info (the endpoint used for polling).
    try:
        resp = await client.get(f"http://{ip}/api/system/info", timeout=2.0)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, dict):
                identity = data.get("identity") or {}
                model = str(identity.get("model") or identity.get("hwModel") or "").lower()
                # Require an explicit NMMiner marker so this never grabs an AxeOS
                # device or a WroomMiner (compat shim reports model "WroomMiner").
                if "nmminer" in model:
                    return {
                        "ip": ip,
                        "type": "lottominer_device",
                        "name": identity.get("hostName") or f"NMMiner ({ip})",
                        "model": "NMMiner",
                        "device_count": 1,
                        "version": identity.get("fwVersion", ""),
                    }
    except Exception:
        pass

    # Stage 3: legacy v1.8.x swarm firmware — GET /swarm (summary + devices[]).
    try:
        resp = await client.get(f"http://{ip}/swarm", timeout=2.0)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, dict) and "summary" in data and isinstance(data.get("devices"), list):
                devs = data["devices"]
                ver = devs[0].get("version", "") if devs else ""
                return {
                    "ip": ip,
                    "type": "lottominer_device",
                    "name": f"NMMiner ({ip})",
                    "model": "NMMiner",
                    "legacy": True,
                    "device_count": len(devs) or 1,
                    "version": ver,
                }
    except Exception:
        pass

    return None


class LottominerDriver(MinerDriver):
    family = "lottominer"
    can_restart = True
    can_set_pool = True

    async def poll(self) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            return await fetch_lottominer_safe(client, [{"ip": self.host, "name": self.host}])

    async def restart(self) -> bool:
        res = await lottominer_fanout("restart", [self.host])
        return bool(res and res[0].get("status", 500) < 400)

    @classmethod
    async def probe(cls, ip: str, client: httpx.AsyncClient) -> dict | None:
        return await probe_lottominer(ip, client)
