# HashHive Roadmap

A living list of what's shipped and what's planned. Not a commitment — priorities
shift. Open an issue or PR to propose changes.

## Recently shipped

- **AxeHub support** — `nerdminer-axehub` devices (the NerdMiner fork with a real
  HTTP API) alongside NMMiner on the Lottominer page.
- **SoloMiner cleanup** — removed NerdMiner v2 / SparkMiner (no monitoring API).
- **Interactive Discord bot** — fleet commands, push embeds, optional channel lock.
- **Schedules** — `power_limit` / `throttle` (AxeOS frequency cap) + SSRF-hardened
  batch endpoints.
- **Discovery** — single guided "Add device" page; full /24 scan so devices not in
  ARP/mDNS are still found; instant appearance after add.
- **UI consistency** — Lottominer and BitAxe/NerdAxe pages + device detail aligned;
  stable hostname sorting; long-value wrapping in stat boxes.
- **Device log tab** — AxeOS logs via HTTP history + live WebSocket fallback.
- **Fixes** — NMMiner hostname refresh, `stratum+tcp://` pool scheme, restart 405.

## Planned

### Near-term
- **Energy & cost tracking** — power-over-time × electricity price
  (`electricity_kwh_price`) → daily/monthly cost, W/TH efficiency trend, charts.
  (AxeOS reports power; NMMiner/AxeHub have none, so cost is AxeOS-scoped.)
- **Firmware update check** — compare device firmware versions (AxeOS / NMMiner)
  against the latest upstream GitHub release and flag outdated devices, mirroring
  the existing app-update check.
- **Pool health & failover** — monitor pool reachability/latency (stratum ping
  exists) and auto-switch to the fallback pool on outage, with an alert.
- **Alerts refinement** — per-type mute/snooze, burst de-duplication, and
  flapping protection so notifications stay useful.

### Later
- **Live shares feed** — a per-poll activity feed derived from accepted/rejected
  counter deltas ("when did the last share land"), not just cumulative totals.
- **Localization (i18n)** — multi-language frontend (DE/EN to start).

### Considered / not planned
- **Prometheus `/metrics` export** — proposed; revisit if there's demand.
- **Remote console / arbitrary device exec** — neither AxeOS nor NMMiner exposes
  a remote shell, so it's not feasible.
