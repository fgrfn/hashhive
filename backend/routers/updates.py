"""Updates router: GitHub release listing + latest-version check (cached)."""

import time

import httpx
from fastapi import APIRouter, HTTPException

from core import APP_VERSION

router = APIRouter()

_releases_cache: dict = {"data": None, "fetched_at": 0.0}
_RELEASES_TTL = 300  # 5 min cache


@router.get("/api/updates/releases")
async def get_releases(force: bool = False):
    """Fetch available releases from GitHub. Cached for 5 minutes."""
    now = time.time()
    if not force and _releases_cache["data"] and (now - _releases_cache["fetched_at"]) < _RELEASES_TTL:
        return _releases_cache["data"]

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.github.com/repos/fgrfn/hashhive/releases",
                headers={"Accept": "application/vnd.github+json"},
            )
            resp.raise_for_status()
            releases_raw = resp.json()
    except Exception as e:
        if _releases_cache["data"]:
            return _releases_cache["data"]
        raise HTTPException(status_code=502, detail=f"GitHub API error: {e}")

    releases = [
        {
            "tag": r["tag_name"],
            "version": r["tag_name"].lstrip("v"),
            "name": r["name"] or r["tag_name"],
            "published_at": r["published_at"],
            "prerelease": r["prerelease"],
            "draft": r["draft"],
            "body": (r.get("body") or "")[:800],
            "html_url": r["html_url"],
            "docker_image": f"ghcr.io/fgrfn/hashhive:{r['tag_name'].lstrip('v')}",
        }
        for r in releases_raw
        if not r["draft"]
    ]

    _releases_cache["data"] = {"current": APP_VERSION, "releases": releases}
    _releases_cache["fetched_at"] = now
    return _releases_cache["data"]


@router.get("/api/updates/latest")
async def get_latest_release():
    """Return only the latest release (fastest check for update badge)."""
    data = await get_releases()
    stable = [r for r in data["releases"] if not r["prerelease"]]
    latest = stable[0] if stable else (data["releases"][0] if data["releases"] else None)
    return {
        "current": APP_VERSION,
        "latest": latest,
        "update_available": latest is not None and latest["version"] != APP_VERSION,
    }
