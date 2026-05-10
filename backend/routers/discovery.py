"""Unified auto-discovery: ARP table + mDNS + HTTP probing."""

import asyncio
import ipaddress
import socket as _socket

import httpx
from fastapi import APIRouter

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


# ── Endpoint ───────────────────────────────────────────────────────────────────

@router.get("/api/discovery/scan")
async def discovery_scan():
    """
    Unified device discovery:
    1. Read ARP table for already-known active LAN hosts
    2. mDNS browse for _http._tcp.local and _axeos._tcp.local (3 s window)
    3. Merge candidate IPs and probe them for NMMiner/AxeOS signatures concurrently
    4. Fall back to full /24 subnet scan if ARP+mDNS yield < 4 candidates
    """
    local_ip, subnet = _local_ip_and_subnet()
    if not local_ip:
        return {"local_ip": "", "found": [], "method": "error", "error": "Could not determine local IP"}

    # ARP hosts (fast, instant)
    arp_ips = _arp_hosts()

    # mDNS (3 second window, in parallel with ARP probe)
    mdns_task = asyncio.create_task(
        _mdns_hosts(["_http._tcp.local.", "_axeos._tcp.local.", "_nmminer._tcp.local."], timeout=3.0)
    )

    # While mDNS runs, probe ARP candidates immediately
    candidates: set[str] = set(arp_ips)
    # Remove local machine itself
    candidates.discard(local_ip)

    # Fallback: if ARP is sparse, scan the full subnet
    use_full_scan = len(candidates) < 4
    if use_full_scan:
        candidates.update(f"{subnet}.{i}" for i in range(1, 255))
        candidates.discard(local_ip)

    # Wait for mDNS and merge
    mdns_ips = await mdns_task
    # Only add mDNS IPs on the same subnet
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
                # Try AxeOS first (more specific field check)
                result = await _probe_axeos(ip, client)
                if result:
                    result["discovered_via"] = "mdns" if ip in mdns_ips else ("arp" if ip in arp_ips else "scan")
                    found.append(result)
                    return
                result = await _probe_nmminer(ip, client)
                if result:
                    result["discovered_via"] = "mdns" if ip in mdns_ips else ("arp" if ip in arp_ips else "scan")
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
