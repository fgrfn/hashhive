"""Unified auto-discovery: ARP table + mDNS + HTTP probing.

Detects AxeOS (BitAxe/NerdAxe), NMMiner masters/devices and SoloMiners
(NerdMiner/SparkMiner) in one pass, can add discovered devices to the config,
and runs an optional continuous background scan that notifies on new devices.
"""

import asyncio
import ipaddress
import json
import socket as _socket
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Query, Request

from core import (
    CONFIG_FILE,
    DEFAULT_CONFIG,
    DISCOVERY_STATE_FILE,
    _append_entry,
    _validate_device_ip,
    _ws_manager,
    load_json,
    save_json,
)

router = APIRouter()

# ── Helpers ────────────────────────────────────────────────────────────────────

def _local_ip_and_subnet() -> tuple[str, str]:
    """Return (local_ip, subnet_prefix) e.g. ('192.168.1.5', '192.168.1')."""
    try:
        s = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip, ".".join(local_ip.split(".")[:3])
    except Exception:
        return "", ""


def _arp_hosts() -> set[str]:
    """Read /proc/net/arp for reachable LAN hosts."""
    hosts: set[str] = set()
    try:
        with open("/proc/net/arp") as f:
            for line in f.readlines()[1:]:
                parts = line.split()
                if len(parts) >= 3 and parts[2] == "0x2":  # 0x2 = complete/valid
                    try:
                        ipaddress.IPv4Address(parts[0])
                        hosts.add(parts[0])
                    except ValueError:
                        pass
    except OSError:
        pass
    return set(hosts)


async def _mdns_hosts(service_types: list[str], timeout: float = 3.0) -> set[str]:
    """Resolve mDNS service types and return discovered IPs."""
    found: set[str] = set()
    try:
        from zeroconf.asyncio import AsyncZeroconf, AsyncServiceBrowser

        class _Listener:
            def __init__(self, zc: AsyncZeroconf):
                self._zc = zc

            def add_service(self, zc, type_, name):  # noqa: ARG002
                asyncio.ensure_future(self._resolve(type_, name))

            def remove_service(self, *_):
                pass

            def update_service(self, *_):
                pass

            async def _resolve(self, type_: str, name: str):
                try:
                    info = await self._zc.async_get_service_info(type_, name, timeout=2000)
                    if info:
                        for addr in info.parsed_addresses():
                            found.add(addr)
                except Exception:
                    pass

        aiozc = AsyncZeroconf()
        listener = _Listener(aiozc)
        browsers = [AsyncServiceBrowser(aiozc.zeroconf, stype, listener) for stype in service_types]
        await asyncio.sleep(timeout)
        for b in browsers:
            b.cancel()
        await aiozc.async_close()
    except Exception:
        pass
    return found


async def _probe_nmminer(ip: str, client: httpx.AsyncClient) -> dict | None:
    NM_FIELDS = {"PrimaryPool", "WiFiSSID", "Hostname", "PrimaryAddress"}
    for path in ("/swarm", "/config"):
        try:
            resp = await client.get(f"http://{ip}{path}", timeout=2.0)
            if resp.status_code != 200:
                continue
            data = resp.json()
            if path == "/swarm":
                devs = data if isinstance(data, list) else \
                    data.get("devices", data.get("miners", data.get("workers")))
                if isinstance(devs, list):
                    return {"ip": ip, "type": "nmminer_master", "name": f"NMMiner master ({ip})",
                            "device_count": len(devs)}
            elif path == "/config":
                if isinstance(data, dict):
                    configs = data.get("configs")
                    if isinstance(configs, list):
                        return {"ip": ip, "type": "nmminer_master", "name": f"NMMiner master ({ip})",
                                "device_count": len(configs)}
                    if NM_FIELDS & set(data.keys()):
                        return {"ip": ip, "type": "nmminer_device",
                                "name": data.get("Hostname", ip), "device_count": 1}
        except Exception:
            pass
    return None


async def _probe_axeos(ip: str, client: httpx.AsyncClient) -> dict | None:
    AX_FIELDS = {"hashRate", "ASICModel", "stratumURL", "uptimeSeconds"}
    try:
        resp = await client.get(f"http://{ip}/api/system/info", timeout=2.0)
        if resp.status_code != 200:
            return None
        data = resp.json()
        if not (AX_FIELDS & set(data.keys())):
            return None
        asic = data.get("ASICModel", "")
        dtype = "nerdaxe" if "nerd" in data.get("hostname", "").lower() or "1397" in asic else "bitaxe"
        return {"ip": ip, "type": dtype, "name": data.get("hostname", ip),
                "asic": asic, "hashrate": data.get("hashRate", 0), "temp": data.get("temp", 0)}
    except Exception:
        return None


async def _probe_solo(ip: str, client: httpx.AsyncClient) -> dict | None:
    """Probe for a NerdMiner v2 / SparkMiner device via GET /stats."""
    SOLO_FIELDS = {"hashRate", "walletAddress", "poolUrl", "minerName", "runningTime"}
    try:
        resp = await client.get(f"http://{ip}/stats", timeout=2.0)
        if resp.status_code != 200:
            return None
        data = resp.json()
        if not (SOLO_FIELDS & set(data.keys())):
            return None
        dtype = "sparkminer" if "spark" in str(data.get("minerName", "")).lower() else "nerdminer"
        return {"ip": ip, "type": dtype,
                "name": data.get("hostname") or data.get("minerName") or ip,
                "hashrate": data.get("hashRate", "0KH/s"),
                "temp": data.get("temp", 0), "version": data.get("version", "")}
    except Exception:
        return None


def _parse_extra_ips(extra_ips: str | None) -> set[str]:
    """Parse a comma-separated list of manually-entered IPs (validated, private only)."""
    out: set[str] = set()
    if not extra_ips:
        return out
    for raw in extra_ips.split(","):
        ip = raw.strip()
        if not ip:
            continue
        try:
            addr = ipaddress.ip_address(ip)
            if addr.is_private or addr.is_loopback or addr.is_link_local:
                out.add(ip)
        except ValueError:
            pass
    return out


async def _run_scan(subnet: str | None = None, extra_ips: str | None = None) -> dict:
    """Run a unified discovery scan and return the result payload.

    Shared by the HTTP endpoint and the background loop.
    """
    local_ip, auto_subnet = _local_ip_and_subnet()
    manual = bool(subnet)
    subnet = (subnet or auto_subnet).strip().rstrip(".")
    if not subnet:
        return {"local_ip": "", "found": [], "method": "error", "error": "Could not determine local subnet"}

    # ARP hosts (fast, instant)
    arp_ips = _arp_hosts()

    # mDNS (3 second window, in parallel with ARP probe)
    mdns_task = asyncio.create_task(
        _mdns_hosts(["_http._tcp.local.", "_axeos._tcp.local.", "_nmminer._tcp.local."], timeout=3.0)
    )

    candidates: set[str] = set(arp_ips)
    candidates.discard(local_ip)
    candidates |= _parse_extra_ips(extra_ips)

    # Fallback: if ARP is sparse (or a subnet was explicitly requested), scan the full /24
    use_full_scan = manual or len(candidates) < 4
    if use_full_scan:
        candidates.update(f"{subnet}.{i}" for i in range(1, 255))
        candidates.discard(local_ip)

    mdns_ips = await mdns_task
    for ip in mdns_ips:
        if ip.startswith(subnet + "."):
            candidates.add(ip)
    candidates.discard(local_ip)

    found: list[dict] = []
    sem = asyncio.Semaphore(80)
    limits = httpx.Limits(max_connections=80, max_keepalive_connections=0)

    async def _probe(ip: str):
        async with sem:
            async with httpx.AsyncClient(timeout=1.5, limits=limits) as client:
                result = (await _probe_axeos(ip, client)
                          or await _probe_nmminer(ip, client)
                          or await _probe_solo(ip, client))
                if result:
                    result["discovered_via"] = (
                        "mdns" if ip in mdns_ips else ("arp" if ip in arp_ips else "scan")
                    )
                    found.append(result)

    await asyncio.gather(*[_probe(ip) for ip in candidates])

    found.sort(key=lambda x: [int(p) for p in x["ip"].split(".")] if x["ip"].replace(".", "").isdigit() else [999])

    return {
        "local_ip": local_ip,
        "subnet": f"{subnet}.0/24",
        "arp_count": len(arp_ips),
        "mdns_count": len(mdns_ips),
        "probed": len(candidates),
        "method": "full_scan" if use_full_scan else "arp+mdns",
        "found": found,
    }


def _add_devices_to_config(config: dict, devices: list[dict]) -> list[dict]:
    """Insert discovered devices into the correct config lists (dedupe by IP).

    Mutates ``config`` in place and returns the list of devices that were
    actually newly added.
    """
    added: list[dict] = []
    for d in devices:
        ip = str(d.get("ip", "")).strip()
        dtype = d.get("type", "")
        if not ip:
            continue
        try:
            _validate_device_ip(ip)
        except Exception:
            continue
        name = d.get("name") or ip

        if dtype in ("bitaxe", "nerdaxe"):
            lst = config.setdefault("axeos_devices", [])
            if any((x.get("ip") if isinstance(x, dict) else x) == ip for x in lst):
                continue
            lst.append({"ip": ip, "name": name, "type": dtype})
            added.append(d)
        elif dtype == "nmminer_master":
            if config.get("nmminer_master") != ip:
                config["nmminer_master"] = ip
                added.append(d)
        elif dtype == "nmminer_device":
            lst = config.setdefault("nmminer_devices", [])
            if any((x.get("ip") if isinstance(x, dict) else x) == ip for x in lst):
                continue
            lst.append({"ip": ip, "name": name})
            added.append(d)
        elif dtype == "nerdminer":
            lst = config.setdefault("nerdminer_devices", [])
            if any((x.get("ip") if isinstance(x, dict) else x) == ip for x in lst):
                continue
            lst.append({"ip": ip, "name": name, "type": "nerdminer"})
            added.append(d)
        elif dtype == "sparkminer":
            lst = config.setdefault("sparkminer_devices", [])
            if any((x.get("ip") if isinstance(x, dict) else x) == ip for x in lst):
                continue
            lst.append({"ip": ip, "name": name, "type": "sparkminer"})
            added.append(d)
    return added


def _new_devices(found: list[dict], known_ips: dict) -> list[dict]:
    """Return the subset of ``found`` whose IPs are not in ``known_ips`` (pure, testable)."""
    return [d for d in found if d.get("ip") and d["ip"] not in known_ips]


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/api/discovery/scan")
async def discovery_scan(
    subnet: str | None = Query(None, description="Override subnet prefix, e.g. 192.168.1"),
    extra_ips: str | None = Query(None, description="Comma-separated extra IPs to probe"),
):
    """Unified device discovery (ARP + mDNS + HTTP probing) for AxeOS, NMMiner and SoloMiners."""
    return await _run_scan(subnet, extra_ips)


@router.post("/api/discovery/add")
async def discovery_add(request: Request):
    """Add selected discovered devices to the config, sorted into the right lists by type."""
    data = await request.json()
    devices = data.get("devices", [])
    if not isinstance(devices, list):
        devices = []
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    added = _add_devices_to_config(config, devices)
    if added:
        save_json(CONFIG_FILE, config)
        now = datetime.now(timezone.utc).isoformat()
        _append_entry({
            "id": f"discovery:add:{now}",
            "device": "system",
            "kind": "devices_added",
            "severity": "info",
            "message": f"Added {len(added)} device(s) via discovery",
            "timestamp": now,
            "read": True,
            "source": "discovery",
        })
    return {"added": added, "count": len(added)}


# ── Continuous background scan ───────────────────────────────────────────────────

async def _notify_new_devices(new_devices: list[dict], notify: bool) -> None:
    """Log + optionally notify about newly discovered devices."""
    for d in new_devices:
        now = datetime.now(timezone.utc).isoformat()
        _append_entry({
            "id": f"discovery:{d['ip']}:{now}",
            "device": f"discovery:{d['ip']}",
            "kind": "device_discovered",
            "severity": "info",
            "message": f"New device discovered: {d.get('name', d['ip'])} ({d['ip']}, {d.get('type', 'unknown')})",
            "timestamp": now,
            "read": False,
            "source": "discovery",
        })
    if notify and new_devices:
        try:
            from routers.notifications import dispatch_notification
            names = ", ".join(f"{d.get('name', d['ip'])} ({d['ip']})" for d in new_devices[:10])
            await dispatch_notification(
                "🔍 HashHive — new device(s) discovered",
                f"{len(new_devices)} new miner(s) found on the network:\n{names}",
            )
        except Exception:
            pass


async def _discovery_background_loop() -> None:
    """Periodically scan the network, notify on new devices, optionally auto-add them."""
    while True:
        delay = 1800  # default 30 min; refined from config each iteration
        try:
            config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
            disc = config.get("discovery", {})
            delay = max(60, int(disc.get("interval_minutes", 30)) * 60)
            if disc.get("auto_scan"):
                state = load_json(DISCOVERY_STATE_FILE, {"known_ips": {}})
                known_ips = state.get("known_ips", {})
                result = await _run_scan()
                found = result.get("found", [])
                new = _new_devices(found, known_ips)
                if new:
                    await _notify_new_devices(new, bool(disc.get("notify", True)))
                    if disc.get("auto_add"):
                        cfg = load_json(CONFIG_FILE, DEFAULT_CONFIG)
                        added = _add_devices_to_config(cfg, new)
                        if added:
                            save_json(CONFIG_FILE, cfg)
                    try:
                        await _ws_manager.broadcast(
                            json.dumps({"type": "discovery", "new_devices": new})
                        )
                    except Exception:
                        pass
                now = datetime.now(timezone.utc).timestamp()
                for d in found:
                    ip = d.get("ip")
                    if ip:
                        known_ips.setdefault(ip, {"name": d.get("name", ip), "type": d.get("type", ""),
                                                  "first_seen": now})
                state["known_ips"] = known_ips
                state["last_scan_ts"] = now
                save_json(DISCOVERY_STATE_FILE, state)
        except Exception:
            pass
        await asyncio.sleep(delay)
