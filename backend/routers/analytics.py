"""Analytics endpoint: predictions (expected time + odds) and best-share records.

Mirrors a MinerWatch-style Analytics page: 'Beat all-time best' and 'Find a block
(solo)' predictions, plus a 'Top best shares' leaderboard built from the persistent
all-time records.
"""

from datetime import datetime, timezone, timedelta

from fastapi import APIRouter

from alerts import _get_network_difficulty
from core import (
    CONFIG_FILE,
    DEFAULT_CONFIG,
    _bestdiff_file,
    _dev_stats_file,
    _load_records,
    _stats_file,
    load_json,
)

from .probability import (
    _TWO32,
    _WINDOWS,
    _latest_fleet_ghs,
    beat_best_share_probability,
    block_probability,
)


def _recent_dates(days: int) -> list[str]:
    """Return the last `days` calendar dates (oldest first) as YYYY-MM-DD."""
    today = datetime.now(timezone.utc)
    return [(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days - 1, -1, -1)]


def _activity_summary() -> dict:
    """Shares + best diff for today and the last 7 days, from the fleet stats files.

    The compact hashrate file stores a cumulative `shares` counter per sample, so
    the daily delta is last - first; we sum those deltas across days for the week.
    """
    def _day_shares(date_str: str) -> int:
        samples = load_json(_stats_file(date_str), [])
        if not isinstance(samples, list) or len(samples) < 1:
            return 0
        vals = [int(s.get("shares", 0) or 0) for s in samples]
        if not vals:
            return 0
        delta = vals[-1] - vals[0]
        return delta if delta > 0 else vals[-1]

    def _day_best(date_str: str) -> float:
        data = load_json(_bestdiff_file(date_str), {})
        best = 0.0
        if isinstance(data, dict):
            for rec in data.values():
                for s in rec.get("samples", []):
                    best = max(best, float(s.get("diff", 0) or 0))
        return best

    week = _recent_dates(7)
    today = week[-1]
    return {
        "shares_today": _day_shares(today),
        "shares_7d": sum(_day_shares(d) for d in week),
        "best_today": _day_best(today),
        "best_7d": max((_day_best(d) for d in week), default=0.0),
    }


def _best_share_series(days: int = 7) -> list[dict]:
    """Daily peak best-diff across the whole fleet, for a trend chart."""
    series = []
    for date_str in _recent_dates(days):
        data = load_json(_bestdiff_file(date_str), {})
        peak = 0.0
        if isinstance(data, dict):
            for rec in data.values():
                for s in rec.get("samples", []):
                    peak = max(peak, float(s.get("diff", 0) or 0))
        series.append({"date": date_str, "best": peak})
    return series


def _efficiency_ranking() -> list[dict]:
    """Per-device efficiency (W/TH) from today's device stats — most efficient first.

    Averages the recent samples that carry both hashrate and power so a single
    spike doesn't dominate. Only AxeOS devices report power, so others are skipped.
    """
    data = load_json(_dev_stats_file(datetime.now(timezone.utc).strftime("%Y-%m-%d")), {})
    if not isinstance(data, dict):
        return []
    records = _load_records()
    rows = []
    for ip, samples in data.items():
        if not isinstance(samples, list):
            continue
        recent = samples[-30:]
        ghs = [float(s.get("gh", 0) or 0) for s in recent if s.get("gh")]
        pwrs = [float(s["pwr"]) for s in recent if s.get("pwr") is not None]
        if not ghs or not pwrs:
            continue
        avg_gh = sum(ghs) / len(ghs)
        avg_pwr = sum(pwrs) / len(pwrs)
        if avg_gh <= 0 or avg_pwr <= 0:
            continue
        rows.append({
            "ip": ip,
            "name": records.get(ip, {}).get("name", ip),
            "hashrate_ghs": round(avg_gh, 1),
            "power_w": round(avg_pwr, 1),
            "w_per_th": round(avg_pwr / (avg_gh / 1000), 1),  # W per TH/s
        })
    rows.sort(key=lambda r: r["w_per_th"])
    return rows


def _energy_from_samples(samples: list[dict]) -> tuple[float, float]:
    """Integrate fleet power samples into (kWh, covered hours).

    Gaps are capped at five minutes. This avoids charging an entire outage or
    monitoring gap at the last observed power draw.
    """
    points: list[tuple[datetime, float]] = []
    for sample in samples:
        try:
            ts = datetime.fromisoformat(str(sample["ts"]).replace("Z", "+00:00"))
            power_w = max(0.0, float(sample.get("pwr", 0) or 0))
        except (KeyError, TypeError, ValueError):
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        points.append((ts.astimezone(timezone.utc), power_w))
    points.sort(key=lambda item: item[0])

    watt_hours = 0.0
    covered_hours = 0.0
    for (start, pwr_start), (end, pwr_end) in zip(points, points[1:]):
        hours = min(max((end - start).total_seconds(), 0.0), 300.0) / 3600
        if hours <= 0:
            continue
        watt_hours += ((pwr_start + pwr_end) / 2) * hours
        covered_hours += hours
    return watt_hours / 1000, covered_hours


def _energy_summary(price_per_kwh: float) -> dict:
    """Energy and cost totals derived from persisted AxeOS fleet power."""
    days = _recent_dates(7)
    daily = []
    for date_str in days:
        samples = load_json(_stats_file(date_str), [])
        kwh, hours = _energy_from_samples(samples if isinstance(samples, list) else [])
        daily.append({"date": date_str, "kwh": kwh, "hours": hours})

    today = daily[-1]
    week_kwh = sum(day["kwh"] for day in daily)
    week_hours = sum(day["hours"] for day in daily)
    hourly_kwh = week_kwh / week_hours if week_hours > 0 else 0.0
    projected_monthly_kwh = hourly_kwh * 24 * 30
    price = max(0.0, float(price_per_kwh or 0))
    return {
        "has_data": week_hours > 0,
        "price_per_kwh": round(price, 4),
        "kwh_today": round(today["kwh"], 4),
        "kwh_7d": round(week_kwh, 4),
        "cost_today": round(today["kwh"] * price, 2),
        "cost_7d": round(week_kwh * price, 2),
        "projected_monthly_kwh": round(projected_monthly_kwh, 2),
        "projected_monthly_cost": round(projected_monthly_kwh * price, 2),
        "series": [{"date": day["date"], "kwh": round(day["kwh"], 4)} for day in daily],
    }


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
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)

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
        "summary": {
            "all_time_best": best_share,
            "record_count": len(leaderboard),
            "active_miners": sum(1 for r in leaderboard if r["best_diff"] > 0),
            **_activity_summary(),
        },
        "best_share_series": _best_share_series(7),
        "efficiency": _efficiency_ranking(),
        "energy": _energy_summary(config.get("electricity_kwh_price", 0)),
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
