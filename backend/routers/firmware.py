"""Firmware-update check: compare device firmware against the latest upstream
GitHub release for each miner family (AxeOS, NMMiner, AxeHub)."""

import re
import time

import httpx
from fastapi import APIRouter

router = APIRouter()

# family key -> GitHub repo that publishes that firmware's releases.
_FIRMWARE_REPOS = {
    "axeos": "bitaxeorg/ESP-Miner",        # BitAxe / NerdAxe (AxeOS)
    "lottominer": "NMminer1024/NMMiner",   # NMMiner
    "axehub": "dwespl/nerdminer-axehub",   # nerdminer-axehub
}

_cache: dict = {"data": None, "fetched_at": 0.0}
_TTL = 6 * 3600  # firmware releases change rarely — cache for 6h


def _ver_tuple(v: str) -> tuple[int, ...]:
    """Numeric components of a version string, e.g. 'v2.0.02' -> (2, 0, 2)."""
    return tuple(int(n) for n in re.findall(r"\d+", v or ""))


def is_outdated(current: str, latest: str) -> bool:
    """True if ``current`` is a strictly older version than ``latest``.

    Lenient: ignores any 'v' prefix and non-numeric noise; returns False when
    either side can't be parsed (don't cry wolf on unknown formats)."""
    c, latest_t = _ver_tuple(current), _ver_tuple(latest)
    if not c or not latest_t:
        return False
    n = max(len(c), len(latest_t))
    c += (0,) * (n - len(c))
    latest_t += (0,) * (n - len(latest_t))
    return c < latest_t


async def _fetch_latest(client: httpx.AsyncClient, repo: str) -> dict | None:
    try:
        resp = await client.get(
            f"https://api.github.com/repos/{repo}/releases/latest",
            headers={"Accept": "application/vnd.github+json"},
        )
        if resp.status_code != 200:
            return None
        r = resp.json()
        tag = r.get("tag_name") or ""
        return {"version": tag.lstrip("v"), "tag": tag, "html_url": r.get("html_url", "")}
    except Exception:
        return None


@router.get("/api/firmware/latest")
async def firmware_latest(force: bool = False):
    """Latest upstream firmware version per miner family (cached 6h).

    The frontend compares each device's reported version against these to flag
    outdated firmware. Returns ``{ family: {version, tag, html_url, repo} }``.
    """
    now = time.time()
    if not force and _cache["data"] and (now - _cache["fetched_at"]) < _TTL:
        return _cache["data"]

    out: dict = {}
    async with httpx.AsyncClient(timeout=10) as client:
        for family, repo in _FIRMWARE_REPOS.items():
            info = await _fetch_latest(client, repo)
            if info:
                info["repo"] = repo
                out[family] = info

    if not out and _cache["data"]:
        return _cache["data"]  # keep serving the last good result on failure
    _cache["data"] = out
    _cache["fetched_at"] = now
    return out
