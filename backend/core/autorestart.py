"""Auto-restart watchdog for AxeOS devices."""

from datetime import datetime, timezone

import httpx

from .logs import _append_entry
from .state import _low_hr_since


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
