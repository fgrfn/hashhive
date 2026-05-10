"""Earnings router."""

import json
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Query

from core import (
    CONFIG_FILE,
    DATA_DIR,
    DEFAULT_CONFIG,
    STATS_DIR,
    load_json,
)

router = APIRouter()


@router.get("/api/earnings")
async def get_earnings(days: int = Query(30, ge=1, le=365)):
    """Return daily earnings summary computed from existing hashrate stats."""
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    kwh_price = float(config.get("electricity_kwh_price", 0.0))
    market_cfg = config.get("market", {})
    currency = market_cfg.get("currency", "eur")

    # Try to get current BTC price from cached market data
    btc_price_eur = 0.0
    try:
        prices_file = DATA_DIR / "market_cache.json"
        if prices_file.exists():
            cached = json.loads(prices_file.read_text(encoding="utf-8"))
            btc_price_eur = float(cached.get("bitcoin", {}).get(currency, 0))
    except Exception:
        pass

    result = []
    for i in range(days - 1, -1, -1):
        date_str = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        stats_file = STATS_DIR / f"{date_str}.json"
        samples = load_json(stats_file, [])

        if samples:
            avg_hr_ghs = sum(s.get("total_hr", 0) for s in samples) / len(samples)
            avg_power_w = sum(s.get("total_power", 0) for s in samples) / len(samples)
        else:
            avg_hr_ghs = 0.0
            avg_power_w = 0.0

        btc_reward = 0.0
        usd_reward = 0.0
        if avg_hr_ghs > 0 and btc_price_eur > 0:
            pass

        # Electricity cost
        usd_cost = (avg_power_w / 1000) * 24 * kwh_price if kwh_price > 0 else 0.0

        result.append({
            "date": date_str,
            "avg_hr_ghs": round(avg_hr_ghs, 2),
            "avg_power_w": round(avg_power_w, 2),
            "btc_reward": round(btc_reward, 8),
            "usd_reward": round(usd_reward, 2),
            "usd_cost": round(usd_cost, 2),
            "samples": len(samples),
        })

    return result
