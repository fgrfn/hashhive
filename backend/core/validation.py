"""Request validation helpers."""

import ipaddress

from fastapi import HTTPException


def _validate_device_ip(ip: str) -> str:
    """Validate that ip is a valid IP address (no hostname/URL injection).
    Raises HTTPException 400 for invalid values, 403 for non-private addresses."""
    ip = ip.strip()
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid IP address: {ip!r}")
    if not (addr.is_private or addr.is_loopback or addr.is_link_local):
        raise HTTPException(status_code=403, detail=f"Only private/local IP addresses are allowed: {ip}")
    return ip
