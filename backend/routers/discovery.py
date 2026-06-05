"""Unified auto-discovery: ARP table + mDNS + HTTP probing.

Detects AxeOS (BitAxe/NerdAxe) and the Lottominer-family devices — NMMiner,
WroomMiner and NerdMiner-AxeHub — in one pass, can add discovered devices to the
config, and runs an optional continuous background scan that notifies on new
devices.
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
from miners import probe_all

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


def _arp_map() -> dict[str, str]:
    """Read /proc/net/arp → {ip: mac} for reachable LAN hosts (complete entries only)."""
    out: dict[str, str] = {}
    try:
        with open("/proc/net/arp") as f:
            for line in f.readlines()[1:]:
                parts = line.split()
                # cols: IP, HWtype, Flags, MAC, Mask, Device
                if len(parts) >= 4 and parts[2] == "0x2":  # 0x2 = complete/valid
                    mac = parts[3].lower()
                    try:
                        ipaddress.IPv4Address(parts[0])
                    except ValueError:
                        continue
                    if mac and mac != "00:00:00:00:00:00":
                        out[parts[0]] = mac
    except OSError:
        pass
    return out


def _arp_hosts() -> set[str]:
    """Reachable LAN host IPs (from the ARP table)."""
    return set(_arp_map().keys())


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
    subnet = (subnet or auto_subnet).strip().rstrip(".")
    if not subnet:
        return {"local_ip": "", "found": [], "method": "error", "error": "Could not determine local subnet"}

    # ARP table (fast, instant) — gives both reachable IPs and their MACs
    arp = _arp_map()
    arp_ips = set(arp.keys())

    # mDNS (3 second window, in parallel with ARP probe)
    mdns_task = asyncio.create_task(
        _mdns_hosts(["_http._tcp.local.", "_axeos._tcp.local.", "_nmminer._tcp.local."], timeout=3.0)
    )

    candidates: set[str] = set(arp_ips)
    candidates.discard(local_ip)
    candidates |= _parse_extra_ips(extra_ips)

    # Always probe the full /24. ARP/mDNS alone miss devices the host hasn't
    # recently talked to and that don't advertise mDNS (common for NMMiner),
    # which is why some only showed up when added by direct IP. ARP still
    # supplies MACs and mDNS still supplies names below.
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
                result = await probe_all(ip, client)
                if result:
                    result["discovered_via"] = (
                        "mdns" if ip in mdns_ips else ("arp" if ip in arp_ips else "scan")
                    )
                    # Pin identity to MAC; prefer the device-reported MAC, else ARP.
                    if not result.get("mac") and ip in arp:
                        result["mac"] = arp[ip]
                    found.append(result)

    await asyncio.gather(*[_probe(ip) for ip in candidates])

    found.sort(key=lambda x: [int(p) for p in x["ip"].split(".")] if x["ip"].replace(".", "").isdigit() else [999])

    return {
        "local_ip": local_ip,
        "subnet": f"{subnet}.0/24",
        "arp_count": len(arp_ips),
        "mdns_count": len(mdns_ips),
        "probed": len(candidates),
        "method": "full_scan",
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
        mac = d.get("mac")

        def _entry(extra: dict) -> dict:
            e = {"ip": ip, "name": name, **extra}
            if mac:
                e["mac"] = mac
            return e

        if dtype in ("bitaxe", "nerdaxe"):
            lst = config.setdefault("axeos_devices", [])
            if any((x.get("ip") if isinstance(x, dict) else x) == ip for x in lst):
                continue
            lst.append(_entry({"type": dtype}))
            added.append(d)
        elif dtype == "lottominer_device":
            lst = config.setdefault("lottominer_devices", [])
            if any((x.get("ip") if isinstance(x, dict) else x) == ip for x in lst):
                continue
            lst.append(_entry({}))
            added.append(d)
        elif dtype == "wroomminer_device":
            lst = config.setdefault("wroomminer_devices", [])
            if any((x.get("ip") if isinstance(x, dict) else x) == ip for x in lst):
                continue
            lst.append(_entry({}))
            added.append(d)
        elif dtype == "axehub_device":
            lst = config.setdefault("axehub_devices", [])
            if any((x.get("ip") if isinstance(x, dict) else x) == ip for x in lst):
                continue
            lst.append(_entry({}))
            added.append(d)
    return added


_DEVICE_LISTS = ("axeos_devices", "lottominer_devices", "wroomminer_devices", "axehub_devices")


def reconcile_macs(config: dict, mac_to_ip: dict[str, str]) -> list[dict]:
    """Update stored device IPs when a known MAC now resolves to a different IP.

    Pure (no I/O): mutates ``config`` device lists in place and returns a list of
    ``{mac, old_ip, new_ip, list}`` change records. Survives DHCP lease changes.
    """
    changes: list[dict] = []
    mac_to_ip = {str(k).lower(): v for k, v in mac_to_ip.items()}
    for list_name in _DEVICE_LISTS:
        for dev in config.get(list_name, []):
            if not isinstance(dev, dict):
                continue
            mac = str(dev.get("mac", "")).lower()
            if not mac or mac not in mac_to_ip:
                continue
            new_ip = mac_to_ip[mac]
            old_ip = dev.get("ip")
            if new_ip and new_ip != old_ip:
                dev["ip"] = new_ip
                changes.append({"mac": mac, "old_ip": old_ip, "new_ip": new_ip, "list": list_name})
    return changes


def _new_devices(found: list[dict], known_ips: dict) -> list[dict]:
    """Return the subset of ``found`` whose IPs are not in ``known_ips`` (pure, testable)."""
    return [d for d in found if d.get("ip") and d["ip"] not in known_ips]


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/api/discovery/scan")
async def discovery_scan(
    subnet: str | None = Query(None, description="Override subnet prefix, e.g. 192.168.1"),
    extra_ips: str | None = Query(None, description="Comma-separated extra IPs to probe"),
):
    """Unified device discovery (ARP + mDNS + HTTP probing) for AxeOS and NMMiner."""
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

                # Reconcile known devices' IPs against current MACs (DHCP-proof),
                # and optionally auto-add new devices — both on one fresh config.
                cfg = load_json(CONFIG_FILE, DEFAULT_CONFIG)
                mac_to_ip = {d["mac"]: d["ip"] for d in found if d.get("mac") and d.get("ip")}
                ip_changes = reconcile_macs(cfg, mac_to_ip)
                added = _add_devices_to_config(cfg, new) if (new and disc.get("auto_add")) else []
                if ip_changes or added:
                    save_json(CONFIG_FILE, cfg)
                for ch in ip_changes:
                    now_iso = datetime.now(timezone.utc).isoformat()
                    _append_entry({
                        "id": f"discovery:ipchange:{ch['mac']}:{now_iso}",
                        "device": f"discovery:{ch['new_ip']}",
                        "kind": "device_ip_changed",
                        "severity": "info",
                        "message": f"Device {ch['mac']} IP changed {ch['old_ip']} → {ch['new_ip']}",
                        "timestamp": now_iso,
                        "read": False,
                        "source": "discovery",
                    })

                if new:
                    await _notify_new_devices(new, bool(disc.get("notify", True)))
                if new or ip_changes:
                    try:
                        await _ws_manager.broadcast(
                            json.dumps({"type": "discovery", "new_devices": new, "ip_changes": ip_changes})
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
