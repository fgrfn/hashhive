import json
import asyncio
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

BASE_DIR = Path(__file__).parent
# Daten-Verzeichnis: per Env-Variable überschreibbar (z.B. Docker-Volume)
DATA_DIR = Path(os.environ.get("HASHHIVE_DATA_DIR", BASE_DIR))
LOGS_DIR = DATA_DIR / "logs"
DEVICE_STATE_FILE = DATA_DIR / "device_state.json"

MAX_ENTRIES_PER_DAY = 1000

# ── Network difficulty cache ──────────────────────────────────────────────────
_NET_DIFF_CACHE: dict = {"difficulty": None, "fetched_at": None}
_NET_DIFF_TTL = 600  # refresh every 10 minutes


async def _get_network_difficulty() -> float | None:
    """Fetch current Bitcoin network difficulty from mempool.space, cached for 10 min."""
    now = datetime.now(timezone.utc).timestamp()
    cached_at = _NET_DIFF_CACHE["fetched_at"]
    if cached_at and (now - cached_at) < _NET_DIFF_TTL and _NET_DIFF_CACHE["difficulty"]:
        return _NET_DIFF_CACHE["difficulty"]
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get("https://mempool.space/api/v1/difficulty-adjustment")
            if resp.status_code == 200:
                data = resp.json()
                # currentDifficulty is the raw difficulty value
                diff = float(data.get("currentDifficulty") or data.get("difficulty") or 0)
                if diff > 0:
                    _NET_DIFF_CACHE["difficulty"] = diff
                    _NET_DIFF_CACHE["fetched_at"] = now
                    return diff
    except Exception:
        pass
    return _NET_DIFF_CACHE["difficulty"]  # return stale value if fetch fails


def load_json(path: Path, default: Any) -> Any:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    return default


def save_json(path: Path, data: Any) -> None:
    """Atomically write JSON: write to a temp file then rename to avoid corruption on crash."""
    tmp = path.with_suffix(".tmp")
    try:
        tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        tmp.replace(path)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _log_file(date_str: str) -> Path:
    return LOGS_DIR / f"{date_str}.json"


def _append_alerts(new_alerts: list) -> None:
    if not new_alerts:
        return
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    date_str = _today()
    lf = _log_file(date_str)
    existing: list = load_json(lf, [])
    merged = new_alerts + existing
    if len(merged) > MAX_ENTRIES_PER_DAY:
        merged = merged[:MAX_ENTRIES_PER_DAY]
    save_json(lf, merged)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_alert(device_key: str, kind: str, severity: str, message: str) -> dict:
    now = _now_iso()
    source = device_key.split(":")[0] if ":" in device_key else "system"
    return {
        "id": f"{device_key}:{kind}:{now}",
        "device": device_key,
        "kind": kind,
        "severity": severity,
        "message": message,
        "timestamp": now,
        "read": False,
        "source": source,
    }


def _should_alert(prev: dict, kind: str, cooldown_seconds: float) -> bool:
    """Returns True if enough time has passed since the last alert of this kind."""
    last = prev.get("last_alerted", {}).get(kind)
    if not last:
        return True
    try:
        elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(last)).total_seconds()
        return elapsed >= cooldown_seconds
    except Exception:
        return True


def _mark_alerted(state_entry: dict, kind: str) -> None:
    state_entry.setdefault("last_alerted", {})[kind] = _now_iso()


def _fmt_diff(val) -> str:
    """Format a difficulty value as human-readable string."""
    try:
        n = float(val)
    except (TypeError, ValueError):
        return str(val)
    if n >= 1_000_000_000_000:
        return f"{n / 1_000_000_000_000:.2f} T"
    if n >= 1_000_000_000:
        return f"{n / 1_000_000_000:.2f} G"
    if n >= 1_000_000:
        return f"{n / 1_000_000:.2f} M"
    if n >= 1_000:
        return f"{n / 1_000:.2f} K"
    return f"{n:.0f}"


async def check_alerts(
    config: dict,
    nmminer_data: dict,
    axeos_data: dict,
    nerdminer_data: dict | None = None,
    sparkminer_data: dict | None = None,
) -> list[dict]:
    network_difficulty = await _get_network_difficulty()
    previous_state: dict = load_json(DEVICE_STATE_FILE, {})
    thresholds = config.get("thresholds", {})
    temp_max: float = float(thresholds.get("temp_max", 70))
    vr_temp_max: float = float(thresholds.get("vr_temp_max", 85))
    hashrate_min: float = float(thresholds.get("hashrate_min", 0))
    error_rate_max: float = float(thresholds.get("error_rate_max", 2.0))
    rssi_min: int = int(thresholds.get("rssi_min", -75))
    grace_seconds: float = float(config.get("offline_grace_minutes", 2)) * 60
    cooldown_seconds: float = float(config.get("alert_cooldown_minutes", 30)) * 60

    # Build a fast lookup: kind (underscore) → enabled bool
    _at_cfg = config.get("alert_types", {})
    def _type_enabled(kind: str) -> bool:
        key = kind.replace("_", "-")
        return bool(_at_cfg.get(key, True))  # default: enabled

    current_state: dict = {}
    new_alerts: list[dict] = []

    # ── NMMiner devices ──────────────────────────────────────────────────────
    raw_nm = nmminer_data if isinstance(nmminer_data, list) else nmminer_data.get("devices", [])
    if isinstance(raw_nm, list):
        for device in raw_nm:
            ip: str = device.get("ip", "") or device.get("_ip", "")
            if not ip:
                continue
            key = f"nmminer:{ip}"
            is_online: bool = device.get("online", True)
            temp: float = float(device.get("temp", 0) or device.get("temperature", 0) or 0)
            hashrate: float = float(device.get("GHs5s", 0) or device.get("hashrate", 0) or 0)
            pool: str = str(device.get("pool", "") or "")

            prev = previous_state.get(key, {})
            was_online = prev.get("online", True)

            # Base state (carry over offline tracking fields when still offline)
            current_state[key] = {
                "online": is_online,
                "temp": temp,
                "hashrate": hashrate,
                "pool": pool,
                "last_alerted": prev.get("last_alerted", {}),
            }

            if was_online and not is_online:
                # Just went offline — start grace timer, no alert yet
                current_state[key]["offline_since"] = _now_iso()
                current_state[key]["offline_alerted"] = False
            elif not was_online and not is_online:
                # Still offline — preserve tracking fields
                offline_since = prev.get("offline_since", _now_iso())
                alerted = prev.get("offline_alerted", False)
                current_state[key]["offline_since"] = offline_since
                current_state[key]["offline_alerted"] = alerted
                if not alerted:
                    try:
                        elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(offline_since)).total_seconds()
                        if elapsed >= grace_seconds and _type_enabled("offline"):
                            new_alerts.append(_make_alert(key, "offline", "critical", f"NMMiner {ip} is offline"))
                            current_state[key]["offline_alerted"] = True
                    except Exception:
                        pass
            elif not was_online and is_online:
                # Came back online
                if prev.get("offline_alerted", False) and _type_enabled("online"):
                    new_alerts.append(_make_alert(key, "online", "info", f"NMMiner {ip} is back online"))

            if is_online:
                dev_temp_max = device.get("_temp_max")
                effective_temp_max = float(dev_temp_max) if dev_temp_max is not None else temp_max
                if temp > effective_temp_max and _should_alert(prev, "temp_high", cooldown_seconds) and _type_enabled("temp_high"):
                    new_alerts.append(
                        _make_alert(key, "temp_high", "critical",
                                    f"NMMiner {ip}: temperature {temp:.1f}°C > {effective_temp_max:.0f}°C")
                    )
                    _mark_alerted(current_state[key], "temp_high")
                if hashrate_min > 0 and hashrate < hashrate_min and _should_alert(prev, "hashrate_low", cooldown_seconds) and _type_enabled("hashrate_low"):
                    new_alerts.append(
                        _make_alert(key, "hashrate_low", "warning",
                                    f"NMMiner {ip}: hashrate {hashrate:.2f} GH/s < {hashrate_min:.2f} GH/s")
                    )
                    _mark_alerted(current_state[key], "hashrate_low")
                prev_pool = prev.get("pool", "")
                if prev_pool and not pool and _should_alert(prev, "pool_lost", cooldown_seconds) and _type_enabled("pool_lost"):
                    new_alerts.append(_make_alert(key, "pool_lost", "critical", f"NMMiner {ip}: pool connection lost"))
                    _mark_alerted(current_state[key], "pool_lost")
                elif not prev_pool and pool and _should_alert(prev, "pool_connected", cooldown_seconds) and _type_enabled("pool_connected"):
                    new_alerts.append(_make_alert(key, "pool_connected", "info", f"NMMiner {ip}: pool connected"))
                    _mark_alerted(current_state[key], "pool_connected")
                # ── RSSI ──────────────────────────────────────────────────────
                rssi = device.get("rssi")
                if rssi is not None:
                    try:
                        rssi_val = int(float(rssi))
                        current_state[key]["rssi"] = rssi_val
                        if rssi_val < rssi_min and _should_alert(prev, "rssi_low", cooldown_seconds) and _type_enabled("rssi_low"):
                            new_alerts.append(_make_alert(key, "rssi_low", "warning",
                                                          f"NMMiner {ip}: weak WiFi signal {rssi_val} dBm (min {rssi_min} dBm)"))
                            _mark_alerted(current_state[key], "rssi_low")
                    except (TypeError, ValueError):
                        pass

    # ── NerdMiner / SparkMiner devices ───────────────────────────────────────
    for solo_data, dev_prefix in [
        (nerdminer_data or {}, "nerdminer"),
        (sparkminer_data or {}, "sparkminer"),
    ]:
        for device in solo_data.get("devices", []):
            ip = device.get("_ip", "") or device.get("ip", "")
            if not ip:
                continue
            name = device.get("hostname") or device.get("minerName") or device.get("_name") or ip
            key = f"{dev_prefix}:{ip}"
            is_online = bool(device.get("_online", False) or device.get("online", False))
            temp = float(device.get("temp") or device.get("temperature") or 0)
            pool = str(device.get("poolUrl") or device.get("pool") or "")
            best_diff = device.get("bestDiff") or device.get("best_diff")
            valid_blocks = device.get("validBlocks") or device.get("valid_blocks") or device.get("blockFound")
            rssi_raw = device.get("rssi")
            dev_temp_max = device.get("_temp_max")
            effective_temp_max = float(dev_temp_max) if dev_temp_max is not None else temp_max

            prev = previous_state.get(key, {})
            was_online = prev.get("online", True)

            current_state[key] = {
                "online": is_online,
                "temp": temp,
                "pool": pool,
                "best_diff": best_diff,
                "valid_blocks": valid_blocks,
                "last_alerted": prev.get("last_alerted", {}),
            }

            # ── Offline / Online ─────────────────────────────────────────────
            if was_online and not is_online:
                current_state[key]["offline_since"] = _now_iso()
                current_state[key]["offline_alerted"] = False
            elif not was_online and not is_online:
                offline_since = prev.get("offline_since", _now_iso())
                alerted = prev.get("offline_alerted", False)
                current_state[key]["offline_since"] = offline_since
                current_state[key]["offline_alerted"] = alerted
                if not alerted:
                    try:
                        elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(offline_since)).total_seconds()
                        if elapsed >= grace_seconds and _type_enabled("offline"):
                            new_alerts.append(_make_alert(key, "offline", "critical", f"{name} ({ip}) is offline"))
                            current_state[key]["offline_alerted"] = True
                    except Exception:
                        pass
            elif not was_online and is_online:
                if prev.get("offline_alerted", False) and _type_enabled("online"):
                    new_alerts.append(_make_alert(key, "online", "info", f"{name} ({ip}) is back online"))

            if is_online:
                # ── Temperature ──────────────────────────────────────────────
                if temp > effective_temp_max and _should_alert(prev, "temp_high", cooldown_seconds) and _type_enabled("temp_high"):
                    new_alerts.append(_make_alert(key, "temp_high", "critical",
                                                  f"{name}: temperature {temp:.1f}°C > {effective_temp_max:.0f}°C"))
                    _mark_alerted(current_state[key], "temp_high")

                # ── Pool ─────────────────────────────────────────────────────
                prev_pool = prev.get("pool", "")
                if prev_pool and not pool and _should_alert(prev, "pool_lost", cooldown_seconds) and _type_enabled("pool_lost"):
                    new_alerts.append(_make_alert(key, "pool_lost", "critical", f"{name}: pool connection lost"))
                    _mark_alerted(current_state[key], "pool_lost")
                elif not prev_pool and pool and _should_alert(prev, "pool_connected", cooldown_seconds) and _type_enabled("pool_connected"):
                    new_alerts.append(_make_alert(key, "pool_connected", "info", f"{name}: pool connected"))
                    _mark_alerted(current_state[key], "pool_connected")

                # ── Block found / Best diff ───────────────────────────────────
                prev_blocks = prev.get("valid_blocks")
                block_via_counter = (
                    valid_blocks is not None
                    and prev_blocks is not None
                    and int(valid_blocks) > int(prev_blocks)
                )
                prev_best = prev.get("best_diff")
                best_diff_increased = (
                    best_diff is not None
                    and prev_best is not None
                    and float(best_diff) > float(prev_best)
                )
                block_via_diff = (
                    best_diff_increased
                    and network_difficulty is not None
                    and float(best_diff) >= network_difficulty
                )
                if (block_via_counter or block_via_diff) and _type_enabled("block_found"):
                    diff_label = _fmt_diff(best_diff) if best_diff is not None else "?"
                    net_label = _fmt_diff(network_difficulty) if network_difficulty else "?"
                    new_alerts.append(_make_alert(key, "block_found", "critical",
                                                  f"🏆 {name} FOUND A BLOCK! "
                                                  f"Diff: {diff_label} (network: {net_label}) 🎉🎉🎉"))
                elif best_diff_increased and _type_enabled("new_best_diff"):
                    new_alerts.append(_make_alert(key, "new_best_diff", "info",
                                                  f"{name}: new best difficulty! {_fmt_diff(best_diff)} "
                                                  f"(was {_fmt_diff(prev_best)}) 🎉"))

                # ── RSSI ──────────────────────────────────────────────────────
                if rssi_raw is not None:
                    try:
                        rssi_val = int(float(rssi_raw))
                        current_state[key]["rssi"] = rssi_val
                        if rssi_val < rssi_min and _should_alert(prev, "rssi_low", cooldown_seconds) and _type_enabled("rssi_low"):
                            new_alerts.append(_make_alert(key, "rssi_low", "warning",
                                                          f"{name}: weak WiFi signal {rssi_val} dBm (min {rssi_min} dBm)"))
                            _mark_alerted(current_state[key], "rssi_low")
                    except (TypeError, ValueError):
                        pass

    # ── AxeOS devices ────────────────────────────────────────────────────────
    for device in axeos_data.get("devices", []):
        ip = device.get("_ip", "")
        name: str = device.get("_name", ip)
        if not ip:
            continue
        key = f"axeos:{ip}"
        is_online = bool(device.get("_online", False))
        temp = float(device.get("temp", 0) or 0)
        hashrate = float(device.get("hashRate", 0) or 0)
        pool = str(device.get("stratumURL", "") or "")
        # Per-device temp_max override
        dev_temp_max = device.get("_temp_max")
        effective_temp_max = float(dev_temp_max) if dev_temp_max is not None else temp_max

        prev = previous_state.get(key, {})
        was_online = prev.get("online", True)

        vr_temp = float(device.get("vrTemp", 0) or 0)
        fan_rpm = device.get("fanrpm")
        error_pct = float(device.get("errorPercentage", 0) or 0)
        using_fallback = bool(device.get("isUsingFallbackStratum"))
        paused = bool(device.get("miningPaused"))
        uptime = device.get("uptimeSeconds")
        best_diff = device.get("bestDiff")
        session_diff = device.get("bestSessionDiff")
        block_found_count = device.get("blockFound")

        current_state[key] = {
            "online": is_online,
            "temp": temp,
            "hashrate": hashrate,
            "pool": pool,
            "using_fallback": using_fallback,
            "paused": paused,
            "uptime": uptime,
            "best_diff": best_diff,
            "session_diff": session_diff,
            "block_found_count": block_found_count,
            "last_alerted": prev.get("last_alerted", {}),
        }

        if was_online and not is_online:
            current_state[key]["offline_since"] = _now_iso()
            current_state[key]["offline_alerted"] = False
        elif not was_online and not is_online:
            offline_since = prev.get("offline_since", _now_iso())
            alerted = prev.get("offline_alerted", False)
            current_state[key]["offline_since"] = offline_since
            current_state[key]["offline_alerted"] = alerted
            if not alerted:
                try:
                    elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(offline_since)).total_seconds()
                    if elapsed >= grace_seconds and _type_enabled("offline"):
                        new_alerts.append(_make_alert(key, "offline", "critical", f"{name} ({ip}) is offline"))
                        current_state[key]["offline_alerted"] = True
                except Exception:
                    pass
        elif not was_online and is_online:
            if prev.get("offline_alerted", False) and _type_enabled("online"):
                new_alerts.append(_make_alert(key, "online", "info", f"{name} ({ip}) is back online"))

        if is_online:
            # ── Temperature ──────────────────────────────────────────────────
            if temp > effective_temp_max and _should_alert(prev, "temp_high", cooldown_seconds) and _type_enabled("temp_high"):
                new_alerts.append(
                    _make_alert(key, "temp_high", "critical",
                                f"{name}: temperature {temp:.1f}°C > {effective_temp_max:.0f}°C")
                )
                _mark_alerted(current_state[key], "temp_high")
            if vr_temp > 0 and vr_temp > vr_temp_max and _should_alert(prev, "vr_temp_high", cooldown_seconds) and _type_enabled("vr_temp_high"):
                new_alerts.append(
                    _make_alert(key, "vr_temp_high", "critical",
                                f"{name}: VR temperature {vr_temp:.1f}°C > {vr_temp_max:.0f}°C")
                )
                _mark_alerted(current_state[key], "vr_temp_high")

            # ── Hashrate & error rate ────────────────────────────────────────
            if hashrate_min > 0 and hashrate < hashrate_min and _should_alert(prev, "hashrate_low", cooldown_seconds) and _type_enabled("hashrate_low"):
                new_alerts.append(
                    _make_alert(key, "hashrate_low", "warning",
                                f"{name}: hashrate {hashrate:.2f} GH/s < {hashrate_min:.2f} GH/s")
                )
                _mark_alerted(current_state[key], "hashrate_low")
            if error_pct > error_rate_max and _should_alert(prev, "error_rate_high", cooldown_seconds) and _type_enabled("error_rate_high"):
                new_alerts.append(
                    _make_alert(key, "error_rate_high", "warning",
                                f"{name}: error rate {error_pct:.1f}% > {error_rate_max:.0f}%")
                )
                _mark_alerted(current_state[key], "error_rate_high")

            # ── Fan ──────────────────────────────────────────────────────────
            if fan_rpm is not None and int(fan_rpm) == 0 and _should_alert(prev, "fan_failure", cooldown_seconds) and _type_enabled("fan_failure"):
                new_alerts.append(_make_alert(key, "fan_failure", "critical", f"{name}: fan RPM is 0 — fan may be failing"))
                _mark_alerted(current_state[key], "fan_failure")

            # ── Pool ─────────────────────────────────────────────────────────
            prev_pool = prev.get("pool", "")
            if prev_pool and not pool and _should_alert(prev, "pool_lost", cooldown_seconds) and _type_enabled("pool_lost"):
                new_alerts.append(_make_alert(key, "pool_lost", "critical", f"{name}: pool connection lost"))
                _mark_alerted(current_state[key], "pool_lost")
            elif not prev_pool and pool and _should_alert(prev, "pool_connected", cooldown_seconds) and _type_enabled("pool_connected"):
                new_alerts.append(_make_alert(key, "pool_connected", "info", f"{name}: pool connected"))
                _mark_alerted(current_state[key], "pool_connected")

            # ── Fallback pool ────────────────────────────────────────────────
            prev_fallback = prev.get("using_fallback", False)
            if not prev_fallback and using_fallback and _type_enabled("fallback_active"):
                new_alerts.append(_make_alert(key, "fallback_active", "warning",
                                              f"{name}: switched to fallback pool"))
            elif prev_fallback and not using_fallback and _type_enabled("fallback_recovered"):
                new_alerts.append(_make_alert(key, "fallback_recovered", "info",
                                              f"{name}: primary pool restored"))

            # ── Mining paused ────────────────────────────────────────────────
            prev_paused = prev.get("paused", False)
            if not prev_paused and paused and _type_enabled("mining_paused"):
                new_alerts.append(_make_alert(key, "mining_paused", "warning", f"{name}: mining paused"))

            # ── Unexpected reboot ────────────────────────────────────────────
            prev_uptime = prev.get("uptime")
            if (uptime is not None and prev_uptime is not None
                    and float(prev_uptime) > 300 and float(uptime) < 60
                    and _type_enabled("device_rebooted")):
                new_alerts.append(_make_alert(key, "device_rebooted", "warning",
                                              f"{name}: unexpected reboot detected (uptime reset to {uptime}s)"))

            # ── Block found (primary: blockFound counter) ─────────────────────
            prev_block_count = prev.get("block_found_count")
            block_via_counter = (
                block_found_count is not None
                and prev_block_count is not None
                and int(block_found_count) > int(prev_block_count)
            )
            # Fallback: bestDiff crossed network difficulty
            prev_best = prev.get("best_diff")
            best_diff_increased = (
                best_diff is not None
                and prev_best is not None
                and float(best_diff) > float(prev_best)
            )
            block_via_diff = (
                best_diff_increased
                and network_difficulty is not None
                and float(best_diff) >= network_difficulty
            )
            if (block_via_counter or block_via_diff) and _type_enabled("block_found"):
                diff_label = _fmt_diff(best_diff) if best_diff is not None else "?"
                net_label = _fmt_diff(network_difficulty) if network_difficulty else "?"
                new_alerts.append(_make_alert(key, "block_found", "critical",
                                              f"🏆 {name} FOUND A BLOCK! "
                                              f"Diff: {diff_label} "
                                              f"(network: {net_label}) 🎉🎉🎉"))
            elif best_diff_increased and _type_enabled("new_best_diff"):
                new_alerts.append(_make_alert(key, "new_best_diff", "info",
                                              f"{name}: new best difficulty! {_fmt_diff(best_diff)} "
                                              f"(was {_fmt_diff(prev_best)}) 🎉"))

            # ── New session best difficulty ───────────────────────────────────
            prev_session = prev.get("session_diff")
            if (session_diff is not None and prev_session is not None
                    and float(session_diff) > float(prev_session)
                    and _type_enabled("new_session_best_diff")):
                new_alerts.append(_make_alert(key, "new_session_best_diff", "info",
                                              f"{name}: new session best difficulty! {_fmt_diff(session_diff)} "
                                              f"(was {_fmt_diff(prev_session)}) 🎯"))

    # ── Global best difficulty (across all AxeOS devices) ────────────────────
    global_prev = previous_state.get("_global", {})
    global_prev_best = global_prev.get("best_diff")
    global_best_val: float | None = None
    global_best_name: str = ""
    for device in axeos_data.get("devices", []):
        bd = device.get("bestDiff")
        if bd is None:
            continue
        try:
            bd_f = float(bd)
        except (TypeError, ValueError):
            continue
        if global_best_val is None or bd_f > global_best_val:
            global_best_val = bd_f
            global_best_name = device.get("_name", device.get("_ip", ""))
    current_state["_global"] = {
        "best_diff": global_best_val,
        "device": global_best_name,
    }
    if (global_best_val is not None and global_prev_best is not None
            and global_best_val > float(global_prev_best)
            and _type_enabled("new_global_best_diff")):
        prev_holder = global_prev.get("device", "")
        prev_label = f" (prev holder: {prev_holder})" if prev_holder and prev_holder != global_best_name else ""
        new_alerts.append(_make_alert(
            "system:global", "new_global_best_diff", "info",
            f"🌐 New global best difficulty! {_fmt_diff(global_best_val)} by {global_best_name}"
            f" (was {_fmt_diff(global_prev_best)}{prev_label}) 🏅"
        ))

    # ── Persist state & history ───────────────────────────────────────────────
    save_json(DEVICE_STATE_FILE, current_state)

    if new_alerts:
        _append_alerts(new_alerts)

        notifications = config.get("notifications", {})
        if any([
            notifications.get("telegram_enabled"),
            notifications.get("discord_enabled"),
            notifications.get("gotify_enabled"),
            notifications.get("ntfy_enabled"),
            notifications.get("pushover_enabled"),
        ]):
            asyncio.create_task(_send_notifications(notifications, new_alerts))

    return new_alerts


_SEV_EMOJI = {"critical": "🔴", "warning": "🟡", "info": "🔵", "ok": "🟢", "block_found": "🏆"}
_DISCORD_COLOR = {"critical": 0xEF4444, "warning": 0xF59E0B, "info": 0x3B82F6, "ok": 0x22C55E, "block_found": 0xFFD700}


def _telegram_text(alerts: list[dict]) -> str:
    block_alerts = [a for a in alerts if a.get("kind") == "block_found"]
    other_alerts = [a for a in alerts if a.get("kind") != "block_found"]

    lines = []
    for a in block_alerts:
        lines.append(
            f"🏆🏆🏆 <b>BLOCK FOUND!</b> 🏆🏆🏆\n"
            f"<b>{a['message']}</b>"
        )
    if other_alerts:
        lines.append("🐝 <b>HashHive Alert</b>")
        for a in other_alerts:
            emoji = _SEV_EMOJI.get(a["severity"], "⚪")
            sev = a["severity"].upper()
            lines.append(f"{emoji} <b>[{sev}]</b> {a['message']}")
    return "\n".join(lines)


_KIND_LABEL = {
    "offline":           "Device Offline",
    "online":            "Device Online",
    "temp_high":         "High Temperature",
    "vr_temp_high":      "VR Overtemperature",
    "hashrate_low":      "Low Hashrate",
    "error_rate_high":   "High Error Rate",
    "fan_failure":       "Fan Failure",
    "pool_lost":         "Pool Connection Lost",
    "pool_connected":    "Pool Connected",
    "fallback_active":   "Fallback Pool Active",
    "fallback_recovered":"Primary Pool Restored",
    "mining_paused":     "Mining Paused",
    "device_rebooted":   "Unexpected Reboot",
    "new_best_diff":     "New Best Difficulty",
    "block_found":       "⚡ BLOCK FOUND",
    "rssi_low":          "Weak WiFi Signal",
}


def _discord_embeds(alerts: list[dict]) -> list[dict]:
    severity_order = ["block_found", "critical", "warning", "info", "ok"]
    # Color = most severe alert in this batch
    top_sev = next((s for s in severity_order if any(a["severity"] == s or a.get("kind") == s for a in alerts)), "info")
    color = _DISCORD_COLOR.get(top_sev, 0x6B7280)

    fields = []
    for a in alerts:
        kind = a.get("kind", "")
        sev = a["severity"]
        emoji = "🏆" if kind == "block_found" else _SEV_EMOJI.get(sev, "⚪")
        label = _KIND_LABEL.get(kind, kind.replace("_", " ").title())
        fields.append({
            "name": f"{emoji}  {label}",
            "value": f"`{a['message']}`",
            "inline": False,
        })

    return [{
        "title": "🐝  HashHive Alert",
        "color": color,
        "fields": fields[:25],  # Discord max
        "footer": {
            "text": "HashHive Mining Dashboard",
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }]


def _gotify_message(alerts: list[dict]) -> str:
    lines = []
    for a in alerts:
        if a.get("kind") == "block_found":
            lines.append(f"🏆 BLOCK FOUND! {a['message']}")
        else:
            emoji = _SEV_EMOJI.get(a["severity"], "⚪")
            lines.append(f"{emoji} [{a['severity'].upper()}] {a['message']}")
    return "\n".join(lines)


async def _send_notifications(notifications: dict, alerts: list[dict]) -> None:
    has_critical = any(a["severity"] == "critical" for a in alerts)
    has_block = any(a.get("kind") == "block_found" for a in alerts)
    title = "🏆 BLOCK FOUND!" if has_block else "🐝 HashHive Alert"

    async with httpx.AsyncClient(timeout=10) as client:
        if notifications.get("telegram_enabled") and notifications.get("telegram_token"):
            token = notifications["telegram_token"]
            chat_id = notifications["telegram_chat_id"]
            try:
                await client.post(
                    f"https://api.telegram.org/bot{token}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": _telegram_text(alerts),
                        "parse_mode": "HTML",
                    },
                )
            except Exception:
                pass

        if notifications.get("discord_enabled") and notifications.get("discord_webhook"):
            webhook = notifications["discord_webhook"]
            try:
                await client.post(webhook, json={
                    "username": "HashHive",
                    "avatar_url": "https://raw.githubusercontent.com/fgrfn/hashhive/main/frontend/favicon.png",
                    "embeds": _discord_embeds(alerts),
                })
            except Exception:
                pass

        if notifications.get("gotify_enabled") and notifications.get("gotify_url"):
            url = notifications["gotify_url"].rstrip("/")
            token = notifications["gotify_token"]
            priority = 10 if has_block else (8 if has_critical else 5)
            try:
                await client.post(
                    f"{url}/message",
                    json={
                        "title": title,
                        "message": _gotify_message(alerts),
                        "priority": priority,
                    },
                    headers={"X-Gotify-Key": token},
                )
            except Exception:
                pass

        if notifications.get("ntfy_enabled") and notifications.get("ntfy_topic"):
            ntfy_base = (notifications.get("ntfy_url") or "https://ntfy.sh").rstrip("/")
            ntfy_topic = notifications["ntfy_topic"].strip()
            ntfy_token = (notifications.get("ntfy_token") or "").strip()
            priority = "max" if has_block else ("high" if has_critical else "default")
            headers: dict[str, str] = {
                "Title": title,
                "Priority": priority,
                "Tags": "pick,axe",
            }
            if ntfy_token:
                headers["Authorization"] = f"Bearer {ntfy_token}"
            try:
                await client.post(
                    f"{ntfy_base}/{ntfy_topic}",
                    content=_gotify_message(alerts).encode("utf-8"),
                    headers=headers,
                )
            except Exception:
                pass

        if notifications.get("pushover_enabled") and notifications.get("pushover_user_key") and notifications.get("pushover_app_token"):
            po_priority = 2 if has_block else (1 if has_critical else 0)
            payload: dict = {
                "token":   notifications["pushover_app_token"],
                "user":    notifications["pushover_user_key"],
                "message": _gotify_message(alerts),
                "title":   title,
                "priority": po_priority,
            }
            if po_priority == 2:  # emergency — requires retry + expire
                payload["retry"] = 60
                payload["expire"] = 3600
            try:
                await client.post("https://api.pushover.net/1/messages.json", data=payload)
            except Exception:
                pass
