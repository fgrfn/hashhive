"""AxeHub driver + helpers — the nerdminer-axehub firmware HTTP API.

nerdminer-axehub is a NerdMiner fork that DOES expose an HTTP API.

Base URL: http://<ip>/api/axehub/v1
ALL requests require the header ``X-AxeHub-Compat: 1``; POSTs with a body also
need ``Content-Type: application/json``.

  GET  /info             -> nested {device, hashing, hardware, firmware, pool}
  GET  /ping             -> lightweight uptime + firmware version (used for probe)
  POST /pool/set         -> {url, port, user, pass}
  POST /system/restart   -> no body
  POST /system/reset_stats -> no body

Unit note: ``hashing.current`` is in kH/s. The rest of HashHive (NMMiner) uses
GH/s, so we convert: ``GHs = current_khs / 1_000_000``. AxeHub/NerdMiner do tens
of kH/s, so the resulting GH/s value is a tiny number — that is correct.

Docs: https://github.com/dwespl/nerdminer-axehub
"""

import asyncio
from datetime import datetime, timezone

import httpx

from core import _append_entry, _validate_device_ip

from .base import MinerDriver

AXEHUB_BASE = "/api/axehub/v1"
AXEHUB_HEADERS = {"X-AxeHub-Compat": "1"}

AXEHUB_ACTION_MAP = {
    "restart": "/system/restart",
    "reset_stats": "/system/reset_stats",
}


def _normalize_axehub(ip: str, name: str, temp_max, data: dict) -> dict:
    """Map an AxeHub GET /info snapshot to the unified device dict.

    Mirrors lottominer._normalize_info so the Lottominer page renders AxeHub
    rows with no table changes. Guards against missing nested objects.
    """
    data = data if isinstance(data, dict) else {}
    device = data.get("device") or {}
    hashing = data.get("hashing") or {}
    hardware = data.get("hardware") or {}
    firmware = data.get("firmware") or {}
    pool = data.get("pool") or {}
    primary = pool.get("primary") or {}

    current_khs = hashing.get("current")
    ghs = (current_khs / 1_000_000) if isinstance(current_khs, (int, float)) else None

    url = primary.get("url") or ""
    port = primary.get("port")
    pool_str = f"{url}:{port}" if url and port else url

    return {
        "_ip": ip, "_name": name, "_type": "axehub", "_online": True, "_temp_max": temp_max,
        "ip": ip,
        "name": name,
        "model": "NerdMiner-AxeHub",
        "hostname": device.get("hostname") or name,
        "GHs": ghs, "GHs5s": ghs, "hashrate": ghs,
        "temp": hardware.get("temp_board_c"),
        "pool": pool_str,
        "stratumURL": pool_str,
        "worker": primary.get("user", ""),
        "stratumUser": primary.get("user", ""),
        "uptime": hardware.get("uptime_s"),
        "bestDiff": hashing.get("best_diff"),
        "bestShare": hashing.get("best_diff"),
        "lastDiff": hashing.get("best_session_diff"),
        "version": firmware.get("version", ""),
        "mac": device.get("mac"),
        "shares_ok": hashing.get("shares_accepted"),
        "shares_err": hashing.get("shares_rejected"),
        "rssi": hardware.get("wifi_rssi_dbm"),
        "wifi_rssi": hardware.get("wifi_rssi_dbm"),
        "online": True,
        "status": "online",
    }


async def fetch_axehub_safe(
    client: httpx.AsyncClient,
    devices: list | None = None,
) -> dict:
    """Poll each configured AxeHub via GET /info (devices are standalone)."""
    targets: list[dict] = []
    seen: set[str] = set()
    for d in (devices or []):
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
            r = await client.get(f"http://{ip}{AXEHUB_BASE}/info", headers=AXEHUB_HEADERS)
            r.raise_for_status()
            results.append(_normalize_axehub(ip, dev.get("name", ip), dev.get("temp_max"), r.json()))
        except Exception:
            results.append({"_ip": ip, "_name": dev.get("name", ip), "_type": "axehub",
                            "_online": False, "_temp_max": dev.get("temp_max"),
                            "ip": ip, "hostname": dev.get("name", ip), "online": False, "status": "offline"})

    await asyncio.gather(*[_one(d) for d in targets])
    return {"devices": results}


async def axehub_fanout(action: str, ips: list[str]) -> list[dict]:
    """Fire an AxeHub action at many devices concurrently. Reused by the batch
    endpoint, schedules and group actions."""
    path = AXEHUB_ACTION_MAP[action]
    results: list[dict] = []

    async def _act(ip: str):
        _validate_device_ip(ip)
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.post(f"http://{ip}{AXEHUB_BASE}{path}", headers=AXEHUB_HEADERS)
                results.append({"ip": ip, "status": resp.status_code})
                now = datetime.now(timezone.utc).isoformat()
                _append_entry({
                    "id": f"axehub:{ip}:{action}:{now}",
                    "device": f"axehub:{ip}",
                    "kind": f"device_{action}",
                    "severity": "info",
                    "message": f"AxeHub {ip}: {action} triggered",
                    "timestamp": now,
                    "read": True,
                    "source": "axehub",
                })
        except Exception as exc:
            results.append({"ip": ip, "status": 0, "error": str(exc)})

    await asyncio.gather(*[_act(ip) for ip in ips])
    return results


async def _get_axehub_hostname(client: httpx.AsyncClient, ip: str) -> str:
    try:
        r = await client.get(f"http://{ip}{AXEHUB_BASE}/info", headers=AXEHUB_HEADERS, timeout=5.0)
        device = (r.json() or {}).get("device") or {}
        return device.get("hostname") or ip
    except Exception:
        return ip


async def set_axehub_pool(ip: str, pool: dict) -> dict:
    """Push pool/wallet config to an AxeHub via POST /pool/set.

    Worker is built as ``wallet.hostname`` (matching the other families).
    """
    _validate_device_ip(ip)
    wallet = pool.get("wallet") or pool.get("worker", "")
    password = pool.get("password") or "x"
    raw_url = pool.get("url", "") or ""
    # Strip any scheme (stratum+tcp://host:port) and split host:port.
    host_port = raw_url.split("://")[-1].strip().strip("/")
    if ":" in host_port:
        host, _, port_s = host_port.rpartition(":")
        try:
            port = int(port_s)
        except ValueError:
            host, port = host_port, int(pool.get("port") or 3333)
    else:
        host = host_port
        port = int(pool.get("port") or 3333)

    async with httpx.AsyncClient(timeout=15) as client:
        hostname = await _get_axehub_hostname(client, ip)
        worker = f"{wallet}.{hostname}" if wallet else pool.get("worker", "")
        body = {"url": host, "port": int(port), "user": worker, "pass": password}
        headers = {**AXEHUB_HEADERS, "Content-Type": "application/json"}
        resp = await client.post(f"http://{ip}{AXEHUB_BASE}/pool/set", json=body, headers=headers)
        return {"ip": ip, "type": "axehub", "status": resp.status_code}


async def probe_axehub(ip: str, client: httpx.AsyncClient) -> dict | None:
    """Discovery probe: detect an AxeHub via its lightweight GET /ping endpoint."""
    try:
        resp = await client.get(f"http://{ip}{AXEHUB_BASE}/ping", headers=AXEHUB_HEADERS, timeout=2.0)
        if resp.status_code != 200:
            return None
        ver = ""
        try:
            data = resp.json()
        except Exception:
            data = None
        if isinstance(data, dict):
            fw = data.get("firmware") or {}
            ver = (fw.get("version") if isinstance(fw, dict) else None) or data.get("version") or ""
            looks_axehub = bool(ver) or "uptime_s" in data or "uptime" in data or "firmware" in data
            if not looks_axehub:
                return None
        return {
            "ip": ip,
            "type": "axehub_device",
            "name": f"AxeHub ({ip})",
            "device_count": 1,
            "version": ver,
        }
    except Exception:
        return None


class AxehubDriver(MinerDriver):
    family = "axehub"
    can_restart = True
    can_set_pool = True

    async def poll(self) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            return await fetch_axehub_safe(client, [{"ip": self.host, "name": self.host}])

    async def restart(self) -> bool:
        res = await axehub_fanout("restart", [self.host])
        return bool(res and res[0].get("status", 500) < 400)

    @classmethod
    async def probe(cls, ip: str, client: httpx.AsyncClient) -> dict | None:
        return await probe_axehub(ip, client)
