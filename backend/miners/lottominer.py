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
        try:
            r = await client.get(f"http://{ip}/api/system/info")
            r.raise_for_status()
            results.append(_normalize_info(ip, dev.get("name", ip), dev.get("temp_max"), r.json()))
        except Exception:
            results.append({"_ip": ip, "_name": dev.get("name", ip), "_type": "lottominer",
                            "_online": False, "_temp_max": dev.get("temp_max"),
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
    """Discovery probe: detect a NMMiner via its /probe endpoint (model == NMMiner)."""
    try:
        resp = await client.get(f"http://{ip}/probe", timeout=2.0)
        if resp.status_code != 200:
            return None
        data = resp.json()
        if not isinstance(data, dict):
            return None
        is_nm = str(data.get("model", "")).lower() == "nmminer" or (
            "hr" in data and "ver" in data
        )
        if not is_nm:
            return None
        return {
            "ip": ip,
            "type": "lottominer_device",
            "name": data.get("hostname") or f"NMMiner ({ip})",
            "device_count": 1,
            "version": data.get("ver", ""),
        }
    except Exception:
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
