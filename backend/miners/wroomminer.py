"""WroomMiner driver + helpers — the native WroomMiner HTTP API.

WroomMiner is an ESP32-WROOM solo/lottery miner with its own native JSON API
(snake_case fields, hashrates in H/s). It also ships an NMMiner-compat shim at
``/api/system/info`` but HashHive talks to the native API directly.

Base URL: ``http://<ip>`` (default port 80).

  GET  /api/probe            -> compact discovery/health (firmware, mac, hr, …)
  GET  /api/status           -> dashboard stats (hashrate_hs, shares, rssi, …)
  GET  /api/pool             -> pool config + connection (primary/fallback/active)
  POST /api/config           -> change config (only sent fields are overwritten)
  POST /api/system/restart   -> reboot
  POST /api/system/reset     -> factory reset (destructive — NOT wired as an action)

Unit note: WroomMiner reports ``hashrate_hs`` in H/s. The rest of HashHive uses
GH/s, so we convert: ``GHs = hashrate_hs / 1_000_000_000``. An ESP32-WROOM does a
few hundred kH/s, so the resulting GH/s value is a tiny number — that is correct.
The ESP32-WROOM-32D has no internal temperature sensor; ``temperature_c`` is
always ``-1``, which we surface as ``None``.

Docs: native API spec (GET /api/probe, /api/status, /api/pool, …).
"""

import asyncio
from datetime import datetime, timezone

import httpx

from core import _append_entry, _validate_device_ip

from .base import MinerDriver

WROOM_MODEL = "WroomMiner"

# Only restart is wired — /api/system/reset is a destructive factory reset and is
# intentionally NOT exposed as a routine fleet action.
WROOM_ACTION_MAP = {
    "restart": "/api/system/restart",
}


def _wroom_ghs(hashrate_hs):
    """Convert a WroomMiner hashrate (H/s) to GH/s; pass through bad values."""
    try:
        return float(hashrate_hs) / 1_000_000_000
    except (TypeError, ValueError):
        return None


def _normalize_wroom(ip: str, name: str, temp_max, status: dict, pool: dict) -> dict:
    """Map WroomMiner GET /api/status + /api/pool snapshots to the unified device
    dict. Mirrors lottominer._normalize_info so the Lottominer page renders
    WroomMiner rows with no table changes. Guards against missing fields."""
    status = status if isinstance(status, dict) else {}
    pool = pool if isinstance(pool, dict) else {}

    ghs = _wroom_ghs(status.get("hashrate_hs"))

    url = pool.get("active_url") or ""
    port = pool.get("active_port")
    pool_str = f"{url}:{port}" if url and port else url

    rssi = status.get("wifi_rssi")
    return {
        "_ip": ip, "_name": name, "_type": "wroomminer", "_online": True, "_temp_max": temp_max,
        "ip": ip,
        "name": name,
        "hostname": name,
        "model": WROOM_MODEL,
        "GHs": ghs, "GHs5s": ghs, "hashrate": ghs,
        "temp": None,  # ESP32-WROOM-32D has no temperature sensor
        "pool": pool_str,
        "stratumURL": pool_str,
        "worker": pool.get("worker", ""),
        "stratumUser": pool.get("worker", ""),
        "uptime": status.get("uptime_seconds"),
        "bestDiff": status.get("best_difficulty"),
        "bestShare": status.get("best_difficulty"),
        "lastDiff": None,
        "version": status.get("firmware_version", ""),
        "shares_ok": status.get("shares_accepted"),
        "shares_err": status.get("shares_rejected"),
        "rssi": rssi,
        "wifi_rssi": rssi,
        "online": True,
        "status": "online",
    }


async def fetch_wroomminer_safe(
    client: httpx.AsyncClient,
    devices: list | None = None,
) -> dict:
    """Poll each configured WroomMiner via GET /api/status + /api/pool."""
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
            status_r, pool_r = await asyncio.gather(
                client.get(f"http://{ip}/api/status"),
                client.get(f"http://{ip}/api/pool"),
            )
            status_r.raise_for_status()
            status = status_r.json()
            pool = pool_r.json() if pool_r.status_code == 200 else {}
            results.append(_normalize_wroom(ip, dev.get("name", ip), dev.get("temp_max"), status, pool))
        except Exception:
            results.append({"_ip": ip, "_name": dev.get("name", ip), "_type": "wroomminer",
                            "_online": False, "_temp_max": dev.get("temp_max"), "model": WROOM_MODEL,
                            "ip": ip, "hostname": dev.get("name", ip), "online": False, "status": "offline"})

    await asyncio.gather(*[_one(d) for d in targets])
    return {"devices": results}


async def wroomminer_fanout(action: str, ips: list[str]) -> list[dict]:
    """Fire a WroomMiner action at many devices concurrently. Reused by the batch
    endpoint, schedules and group actions."""
    path = WROOM_ACTION_MAP[action]
    results: list[dict] = []

    async def _act(ip: str):
        _validate_device_ip(ip)
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.post(f"http://{ip}{path}")
                results.append({"ip": ip, "status": resp.status_code})
                now = datetime.now(timezone.utc).isoformat()
                _append_entry({
                    "id": f"wroomminer:{ip}:{action}:{now}",
                    "device": f"wroomminer:{ip}",
                    "kind": f"device_{action}",
                    "severity": "info",
                    "message": f"WroomMiner {ip}: {action} triggered",
                    "timestamp": now,
                    "read": True,
                    "source": "wroomminer",
                })
        except Exception as exc:
            results.append({"ip": ip, "status": 0, "error": str(exc)})

    await asyncio.gather(*[_act(ip) for ip in ips])
    return results


async def set_wroomminer_pool(ip: str, pool: dict) -> dict:
    """Push pool/wallet config to a WroomMiner via POST /api/config.

    WroomMiner stores the wallet and worker name separately and builds the
    stratum worker as ``wallet_address.worker_name`` itself.
    """
    _validate_device_ip(ip)
    wallet = pool.get("wallet") or pool.get("worker", "")
    worker_name = pool.get("worker", "") or ""

    def _split(raw_url: str, default_port: int) -> tuple[str, int]:
        host_port = (raw_url or "").split("://")[-1].strip().strip("/")
        if ":" in host_port:
            host, _, port_s = host_port.rpartition(":")
            try:
                return host, int(port_s)
            except ValueError:
                return host_port, default_port
        return host_port, default_port

    host, port = _split(pool.get("url", ""), int(pool.get("port") or 3333))
    body: dict = {
        "pool_primary_url": host,
        "pool_primary_port": port,
        "wallet_address": wallet,
    }
    if worker_name:
        body["worker_name"] = worker_name
    url2 = pool.get("url2", "")
    if url2:
        host2, port2 = _split(url2, int(pool.get("port2") or 3333))
        body["pool_fallback_url"] = host2
        body["pool_fallback_port"] = port2
        body["wallet_fallback_address"] = pool.get("wallet2") or wallet

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(f"http://{ip}/api/config", json=body)
        return {"ip": ip, "type": "wroomminer", "status": resp.status_code}


async def probe_wroomminer(ip: str, client: httpx.AsyncClient) -> dict | None:
    """Discovery probe: detect a WroomMiner via its GET /api/probe endpoint."""
    try:
        resp = await client.get(f"http://{ip}/api/probe", timeout=2.0)
        if resp.status_code != 200:
            return None
        data = resp.json()
        if not isinstance(data, dict):
            return None
        if str(data.get("firmware", "")).lower() != "wroomminer":
            return None
        rec = {
            "ip": ip,
            "type": "wroomminer_device",
            "name": data.get("hostname") or f"{WROOM_MODEL} ({ip})",
            "model": WROOM_MODEL,
            "device_count": 1,
            "version": data.get("version", ""),
        }
        if data.get("mac"):
            rec["mac"] = data["mac"]
        return rec
    except Exception:
        return None


class WroomminerDriver(MinerDriver):
    family = "wroomminer"
    can_restart = True
    can_set_pool = True

    async def poll(self) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            return await fetch_wroomminer_safe(client, [{"ip": self.host, "name": self.host}])

    async def restart(self) -> bool:
        res = await wroomminer_fanout("restart", [self.host])
        return bool(res and res[0].get("status", 500) < 400)

    @classmethod
    async def probe(cls, ip: str, client: httpx.AsyncClient) -> dict | None:
        return await probe_wroomminer(ip, client)
