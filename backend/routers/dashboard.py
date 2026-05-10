"""Dashboard router and background broadcast loop."""

import asyncio
import json
import httpx
from fastapi import APIRouter

from alerts import check_alerts
from core import (
    CONFIG_FILE,
    DEFAULT_CONFIG,
    DEVICE_STATE_FILE,
    _append_bestdiff_samples,
    _append_device_samples,
    _append_hashrate_sample,
    _check_auto_restart,
    _check_auto_restart_solo,
    _price_cache,
    _read_day,
    _today,
    _ws_manager,
    load_json,
)
from routers.axeos import _fetch_axeos_device
from routers.nmminer import _fetch_nmminer_safe
from routers.solominer import _fetch_solo_miner

router = APIRouter()


def _parse_nm_shares(d: dict) -> tuple[int, int]:
    """Return (accepted, rejected) from an NMMiner device dict.

    Prefers dedicated integer fields; falls back to parsing the combined
    share string whose format is "rejected/accepted/acceptance_rate%"
    (e.g. "266/11925/97.8%" → rejected=266, accepted=11925).
    """
    acc = d.get("Accepted") or d.get("accepted") or d.get("sharesAccepted")
    rej = d.get("Rejected") or d.get("rejected") or d.get("sharesRejected")
    if acc is not None or rej is not None:
        try:
            return int(acc or 0), int(rej or 0)
        except (TypeError, ValueError):
            pass
    share_str = str(d.get("share") or d.get("shares") or "")
    parts = share_str.split("/")
    if len(parts) >= 2:
        try:
            return int(parts[1]), int(parts[0])  # accepted=parts[1], rejected=parts[0]
        except (ValueError, IndexError):
            pass
    return 0, 0


async def _dashboard_broadcast_loop():
    """Background task: fetch dashboard data and push to all WS clients."""
    while True:
        try:
            config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
            interval = max(5, int(config.get("refresh_interval", 30)))
            if _ws_manager.count > 0:
                master = config.get("nmminer_master", "")
                nm_devices = config.get("nmminer_devices", [])
                nerdminer_devices = config.get("nerdminer_devices", [])
                sparkminer_devices = config.get("sparkminer_devices", [])
                axeos_devices = config.get("axeos_devices", [])
                has_nmminer = bool(master or nm_devices)
                async with httpx.AsyncClient(timeout=10) as client:
                    coros = []
                    if has_nmminer:
                        coros.append(_fetch_nmminer_safe(client, master, nm_devices))
                    coros += [_fetch_solo_miner(client, d) for d in nerdminer_devices]
                    coros += [_fetch_solo_miner(client, d) for d in sparkminer_devices]
                    coros += [_fetch_axeos_device(client, d) for d in axeos_devices]
                    results = await asyncio.gather(*coros) if coros else []
                idx = 0
                if has_nmminer:
                    nmminer_data = results[idx] if results else {"devices": []}
                    idx += 1
                else:
                    nmminer_data = {"devices": []}
                nerdminer_results = list(results[idx:idx + len(nerdminer_devices)])
                idx += len(nerdminer_devices)
                sparkminer_results = list(results[idx:idx + len(sparkminer_devices)])
                idx += len(sparkminer_devices)
                axeos_results = list(results[idx:])
                axeos_data = {"devices": axeos_results}
                new_alerts: list = []
                try:
                    new_alerts = await check_alerts(
                        config, nmminer_data, axeos_data,
                        {"devices": nerdminer_results},
                        {"devices": sparkminer_results},
                    )
                except Exception:
                    pass
                today_entries = _read_day(_today())
                unread = sum(1 for a in today_entries if not a.get("read", False))
                # ── Compute totals and record a hashrate sample ────────────
                try:
                    total_gh = 0.0
                    total_pwr = 0.0
                    total_shares = 0
                    for d in nmminer_data.get("devices", []):
                        total_gh += float(d.get("GHs5s") or d.get("GHs5") or d.get("GHs1m") or
                                          d.get("GHsav") or d.get("hashrate") or d.get("currentHashrate") or 0)
                        total_shares += _parse_nm_shares(d)[0]
                    for d in axeos_results:
                        if d.get("_online"):
                            total_gh += float(d.get("hashRate") or d.get("hashrate") or 0)
                            total_pwr += float(d.get("power") or 0)
                            total_shares += int(d.get("sharesAccepted") or 0)
                    _append_hashrate_sample(total_gh, total_pwr, total_shares)
                    _append_device_samples(axeos_results)
                    # ── BestDiff samples (all device types) ───────────────
                    all_bd = (
                        list(nmminer_data.get("devices", []))
                        + nerdminer_results
                        + sparkminer_results
                        + axeos_results
                    )
                    _append_bestdiff_samples(all_bd)
                except Exception:
                    pass
                # ── Auto-restart check ─────────────────────────────────────
                try:
                    async with httpx.AsyncClient(timeout=10) as ar_client:
                        await _check_auto_restart(config, axeos_results, ar_client)
                        await _check_auto_restart_solo(
                            config, nerdminer_results, sparkminer_results, ar_client
                        )
                except Exception:
                    pass
                payload = json.dumps({
                    "type": "dashboard",
                    "nmminer": nmminer_data,
                    "nerdminer": {"devices": nerdminer_results},
                    "sparkminer": {"devices": sparkminer_results},
                    "axeos": axeos_data,
                    "unread_alerts": unread,
                    "new_alerts": new_alerts,
                    "config": config,
                })
                await _ws_manager.broadcast(payload)
        except Exception:
            pass
        await asyncio.sleep(interval)


@router.get("/api/dashboard")
async def get_dashboard():
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    master = config.get("nmminer_master", "")
    nm_devices = config.get("nmminer_devices", [])
    nerdminer_devices = config.get("nerdminer_devices", [])
    sparkminer_devices = config.get("sparkminer_devices", [])
    axeos_devices = config.get("axeos_devices", [])
    has_nmminer = bool(master or nm_devices)

    async with httpx.AsyncClient(timeout=10) as client:
        coros: list = []
        if has_nmminer:
            coros.append(_fetch_nmminer_safe(client, master, nm_devices))
        coros += [_fetch_solo_miner(client, d) for d in nerdminer_devices]
        coros += [_fetch_solo_miner(client, d) for d in sparkminer_devices]
        coros += [_fetch_axeos_device(client, d) for d in axeos_devices]

        results = await asyncio.gather(*coros) if coros else []

    idx = 0
    if has_nmminer:
        nmminer_data = results[idx] if results else {"devices": []}
        idx += 1
    else:
        nmminer_data = {"devices": []}

    nerdminer_results = list(results[idx:idx + len(nerdminer_devices)])
    idx += len(nerdminer_devices)
    sparkminer_results = list(results[idx:idx + len(sparkminer_devices)])
    idx += len(sparkminer_devices)
    axeos_results = list(results[idx:])

    axeos_data = {"devices": axeos_results}

    try:
        await check_alerts(
            config, nmminer_data, axeos_data,
            {"devices": nerdminer_results},
            {"devices": sparkminer_results},
        )
    except Exception:
        pass  # Never let alert checks break the dashboard

    # Annotate offline devices with their offline_since timestamp from device_state
    device_state = load_json(DEVICE_STATE_FILE, {})
    for d in nmminer_data.get("devices", []):
        if not d.get("online", True):
            key = f"nmminer:{d.get('ip', '')}"
            d["_offline_since"] = device_state.get(key, {}).get("offline_since")
    for d in nerdminer_results + sparkminer_results:
        if not d.get("_online", True):
            key = f"{d.get('_type', 'nerdminer')}:{d.get('_ip', '')}"
            d["_offline_since"] = device_state.get(key, {}).get("offline_since")
    for d in axeos_data.get("devices", []):
        if not d.get("_online", True):
            key = f"axeos:{d.get('_ip', '')}"
            d["_offline_since"] = device_state.get(key, {}).get("offline_since")

    today_entries = _read_day(_today())
    unread = sum(1 for a in today_entries if not a.get("read", False))

    return {
        "nmminer": nmminer_data,
        "nerdminer": {"devices": nerdminer_results},
        "sparkminer": {"devices": sparkminer_results},
        "axeos": axeos_data,
        "unread_alerts": unread,
        "config": config,
    }


@router.get("/api/market/prices")
async def get_market_prices():
    """Return cached live coin price from CoinGecko (5-minute cache)."""
    import time
    config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
    market = config.get("market", {})
    coin_id = (market.get("coin_id") or "bitcoin").strip().lower()
    currency = (market.get("currency") or "eur").strip().lower()
    now = time.time()
    cached = _price_cache
    if now - cached["ts"] < 300 and cached["data"]:
        return cached["data"]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params={"ids": coin_id, "vs_currencies": currency},
            )
            resp.raise_for_status()
            data = resp.json()
        _price_cache["ts"] = now
        _price_cache["data"] = {"prices": data, "coin_id": coin_id, "currency": currency}
        return _price_cache["data"]
    except Exception as e:
        from fastapi import HTTPException
        # Return stale cache rather than error
        if cached["data"]:
            return cached["data"]
        raise HTTPException(status_code=503, detail=f"Price fetch failed: {e}")
