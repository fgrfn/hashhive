"""Analytics endpoint: predictions (expected time + odds) and best-share records.

Mirrors a MinerWatch-style Analytics page: 'Beat all-time best' and 'Find a block
(solo)' predictions, plus a 'Top best shares' leaderboard built from the persistent
all-time records.
"""

from fastapi import APIRouter

from alerts import _get_network_difficulty
from core import _load_records

from .probability import (
    _TWO32,
    _WINDOWS,
    _latest_fleet_ghs,
    beat_best_share_probability,
    block_probability,
)

router = APIRouter()


def expected_seconds(hashrate_ghs: float, divisor: float | None) -> float | None:
    """Mean time to the first Poisson event: (2^32 * divisor) / hashrate_h_s."""
    if not divisor or divisor <= 0 or hashrate_ghs <= 0:
        return None
    return _TWO32 * divisor / (hashrate_ghs * 1e9)


def _windows(fn, hashrate_ghs: float, divisor: float | None) -> dict:
    if not divisor or divisor <= 0 or hashrate_ghs <= 0:
        return {k: None for k in _WINDOWS}
    hr_hs = hashrate_ghs * 1e9
    return {k: round(fn(hr_hs, divisor, secs), 8) for k, secs in _WINDOWS.items()}


@router.get("/api/analytics")
async def get_analytics():
    difficulty = await _get_network_difficulty()
    fleet_ghs = _latest_fleet_ghs()

    records = _load_records()
    leaderboard = sorted(
        ({"ip": ip, "name": r.get("name", ip), "type": r.get("type", ""),
          "best_diff": float(r.get("best_diff", 0)), "ts": r.get("ts")} for ip, r in records.items()),
        key=lambda x: x["best_diff"], reverse=True,
    )
    best_share = leaderboard[0]["best_diff"] if leaderboard else 0.0

    return {
        "fleet": {
            "hashrate_ghs": round(fleet_ghs, 2),
            "network_difficulty": difficulty,
            "best_share": best_share,
        },
        "beat_best": {
            "record": best_share,
            "expected_seconds": expected_seconds(fleet_ghs, best_share or None),
            "windows": _windows(beat_best_share_probability, fleet_ghs, best_share or None),
        },
        "block": {
            "expected_seconds": expected_seconds(fleet_ghs, difficulty),
            "windows": _windows(block_probability, fleet_ghs, difficulty),
        },
        "leaderboard": leaderboard,
    }
