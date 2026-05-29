"""Server-side PID auto-fan controller for AxeOS devices.

When enabled (config["auto_fan"]), a background loop reads each online AxeOS
device's chip temperature and drives its fan to hold a target temperature using a
PID controller, replicating a firmware-style loop. Disabled by default — it
actively writes fanspeed to hardware. The pure ``pid_step`` is unit-testable.
"""

import asyncio

import httpx

from core import (
    CONFIG_FILE,
    DEFAULT_CONFIG,
    load_json,
)
from routers.axeos import _fetch_axeos_device

# Per-device PID state: ip -> {"integral": float, "last_err": float}
_pid_state: dict[str, dict] = {}


def pid_step(state: dict, temp: float, target: float, gains: dict, clamp: tuple[float, float]) -> tuple[float, dict]:
    """One PID iteration. Returns (fan_pct, new_state).

    Error is (temp - target): hotter than target → higher fan. Integral is clamped
    to the output range to prevent wind-up. Pure function (no I/O).
    """
    lo, hi = clamp
    kp = float(gains.get("kp", 4.0))
    ki = float(gains.get("ki", 0.1))
    kd = float(gains.get("kd", 1.0))
    err = float(temp) - float(target)
    integral = float(state.get("integral", 0.0)) + err
    # Anti-windup: keep the integral term within the achievable output band.
    if ki > 0:
        integral = max(-hi / ki, min(hi / ki, integral))
    derivative = err - float(state.get("last_err", err))
    output = kp * err + ki * integral + kd * derivative
    pct = max(lo, min(hi, output + lo))
    return round(pct), {"integral": integral, "last_err": err}


async def _autofan_loop() -> None:
    """Background task: hold each AxeOS device at its target temperature."""
    while True:
        delay = 15
        try:
            config = load_json(CONFIG_FILE, DEFAULT_CONFIG)
            af = config.get("auto_fan", {})
            delay = max(5, int(af.get("interval_seconds", 15)))
            if af.get("enabled"):
                target = float(af.get("target_temp", 60))
                clamp = (float(af.get("min_pct", 30)), float(af.get("max_pct", 100)))
                gains = {"kp": af.get("kp", 4.0), "ki": af.get("ki", 0.1), "kd": af.get("kd", 1.0)}
                devices = config.get("axeos_devices", [])
                async with httpx.AsyncClient(timeout=10) as client:
                    for dev in devices:
                        ip = dev.get("ip") if isinstance(dev, dict) else dev
                        if not ip:
                            continue
                        data = await _fetch_axeos_device(client, dev)
                        if not data.get("_online"):
                            _pid_state.pop(ip, None)
                            continue
                        temp = data.get("temp")
                        if temp is None:
                            continue
                        pct, _pid_state[ip] = pid_step(
                            _pid_state.get(ip, {}), float(temp), target, gains, clamp
                        )
                        try:
                            # Disable on-device autofan so the two controllers don't fight.
                            await client.patch(f"http://{ip}/api/system",
                                               json={"autofanspeed": 0, "fanspeed": pct})
                        except Exception:
                            pass
            else:
                _pid_state.clear()
        except Exception:
            pass
        await asyncio.sleep(delay)
