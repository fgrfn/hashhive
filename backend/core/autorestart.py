"""Auto-restart watchdogs for AxeOS and SoloMiner devices."""

import time
from datetime import datetime, timezone

import httpx

from .logs import _append_entry
from .state import _low_hr_since, _solo_zero_hr_since


async def _check_auto_restart(config: dict, axeos_results: list, client: httpx.AsyncClient) -> None:
    """Restart AxeOS devices whose hashrate has been below threshold for too long."""
    ar = config.get("auto_restart", {})
    if not ar.get("enabled"):
        _low_hr_since.clear()
        return
    threshold_pct = float(ar.get("threshold_pct") or 50) / 100.0
    duration_secs = float(ar.get("duration_minutes") or 10) * 60.0
    now = datetime.now(timezone.utc).timestamp()
    for d in axeos_results:
        ip = d.get("_ip", "")
        if not ip or not d.get("_online"):
            _low_hr_since.pop(ip, None)
            continue
        expected = float(d.get("expectedHashrate") or 0)
        actual = float(d.get("hashRate") or 0)
        if expected <= 0:
            _low_hr_since.pop(ip, None)
            continue
        if actual < expected * threshold_pct:
            if ip not in _low_hr_since:
                _low_hr_since[ip] = now
            elif now - _low_hr_since[ip] >= duration_secs:
                # Trigger restart
                try:
                    await client.post(f"http://{ip}/api/system/restart")
                    _append_entry({
                        "id": f"axeos:{ip}:auto-restart:{datetime.now(timezone.utc).isoformat()}",
                        "device": f"axeos:{ip}",
                        "kind": "auto-restart",
                        "severity": "warning",
                        "message": f"Auto-restarted {d.get('_name') or ip}: hashrate {actual:.2f} GH/s < {expected * threshold_pct:.2f} GH/s ({int(threshold_pct*100)}% of {expected:.2f})",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "read": False,
                        "source": "axeos",
                    })
                except Exception:
                    pass
                _low_hr_since.pop(ip, None)
        else:
            _low_hr_since.pop(ip, None)


async def _check_auto_restart_solo(
    config: dict,
    nerdminer: list,
    sparkminer: list,
    client: httpx.AsyncClient,
) -> None:
    """Restart NerdMiner/SparkMiner devices whose hashrate has been 0 for too long."""
    ar = config.get("auto_restart_solo", {})
    if not ar.get("enabled"):
        _solo_zero_hr_since.clear()
        return
    duration_secs = float(ar.get("zero_hr_minutes") or 10) * 60.0
    now = time.time()
    for dev in nerdminer + sparkminer:
        ip = dev.get("_ip") or dev.get("ip") or ""
        if not ip or not dev.get("_online"):
            _solo_zero_hr_since.pop(ip, None)
            continue
        # Parse hashrate string like "1.03 MH/s" or numeric 0
        hr_raw = dev.get("hashRate") or dev.get("hashrate") or 0
        try:
            hr = float(str(hr_raw).split()[0])
        except Exception:
            hr = 0.0
        if hr > 0:
            _solo_zero_hr_since.pop(ip, None)
            continue
        if ip not in _solo_zero_hr_since:
            _solo_zero_hr_since[ip] = now
            continue
        if now - _solo_zero_hr_since[ip] >= duration_secs:
            name = dev.get("hostname") or dev.get("minerName") or dev.get("_name") or ip
            restarted = False
            for path in ("/restart", "/api/restart", "/reboot"):
                try:
                    resp = await client.post(f"http://{ip}{path}", timeout=5)
                    if resp.status_code < 400:
                        restarted = True
                        break
                except Exception:
                    continue
            if restarted:
                _append_entry({
                    "id": f"solo:{ip}:auto-restart:{datetime.now(timezone.utc).isoformat()}",
                    "device": f"solo:{ip}",
                    "kind": "auto-restart",
                    "severity": "warning",
                    "message": f"Auto-restarted {name} ({ip}): hashrate=0 for >{ar.get('zero_hr_minutes',10)} min",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "read": False,
                    "source": "lottominer",
                })
                _solo_zero_hr_since.pop(ip, None)
