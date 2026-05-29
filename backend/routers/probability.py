"""Solo-mining probability endpoint (Poisson model).

Estimates the chance of finding a block — and of beating the current best share —
within 1 h / 24 h / 7 d, from the most recent persisted hashrate samples and the
Bitcoin network difficulty. Pure-math helpers are kept separate so they are unit
testable without any I/O.
"""

import math
from datetime import datetime, timezone

from fastapi import APIRouter

from alerts import _get_network_difficulty
from core import (
    _bestdiff_file,
    _dev_stats_file,
    _stats_file,
    load_json,
)

router = APIRouter()

_TWO32 = 2 ** 32
_WINDOWS = {"1h": 3600, "24h": 86400, "7d": 604800}


def block_probability(hashrate_hs: float, difficulty: float, seconds: float) -> float:
    """P(>=1 block within `seconds`) for a given hashrate (H/s) and network difficulty."""
    if hashrate_hs <= 0 or difficulty <= 0 or seconds <= 0:
        return 0.0
    lam = seconds * hashrate_hs / (_TWO32 * difficulty)
    return 1.0 - math.exp(-lam)


def beat_best_share_probability(hashrate_hs: float, best_diff: float, seconds: float) -> float:
    """P(>=1 share whose difficulty exceeds `best_diff` within `seconds`)."""
    if hashrate_hs <= 0 or best_diff <= 0 or seconds <= 0:
        return 0.0
    lam = seconds * hashrate_hs / (_TWO32 * best_diff)
    return 1.0 - math.exp(-lam)


def _windows(fn, hashrate_ghs: float, divisor: float | None) -> dict:
    """Apply a probability fn across all windows. Returns None values when inputs are unusable."""
    if not divisor or divisor <= 0 or hashrate_ghs <= 0:
        return {k: None for k in _WINDOWS}
    hr_hs = hashrate_ghs * 1e9
    return {k: round(fn(hr_hs, divisor, secs), 8) for k, secs in _WINDOWS.items()}


def _latest_fleet_ghs() -> float:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    samples = load_json(_stats_file(today), [])
    return float(samples[-1].get("gh", 0)) if samples else 0.0


@router.get("/api/probability")
async def get_probability():
    """Fleet- and per-device block / best-share probabilities (Poisson)."""
    difficulty = await _get_network_difficulty()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    fleet_ghs = _latest_fleet_ghs()
    fleet = {
        "hashrate_ghs": round(fleet_ghs, 2),
        "block": _windows(block_probability, fleet_ghs, difficulty),
    }

    dev_samples = load_json(_dev_stats_file(today), {})
    bestdiff = load_json(_bestdiff_file(today), {})
    devices: list[dict] = []
    for ip, samples in dev_samples.items():
        if not samples:
            continue
        ghs = float(samples[-1].get("gh", 0))
        bd_entry = bestdiff.get(ip, {})
        bd_samples = bd_entry.get("samples", [])
        best_diff = float(bd_samples[-1]["diff"]) if bd_samples else 0.0
        devices.append({
            "ip": ip,
            "name": bd_entry.get("name", ip),
            "hashrate_ghs": round(ghs, 2),
            "best_diff": best_diff,
            "block": _windows(block_probability, ghs, difficulty),
            "beat_best_share": _windows(beat_best_share_probability, ghs, best_diff or None),
        })

    return {
        "network_difficulty": difficulty,
        "windows": list(_WINDOWS.keys()),
        "fleet": fleet,
        "devices": devices,
    }
