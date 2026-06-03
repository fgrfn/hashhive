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
- **Firmware update check** — flag outdated AxeOS/NMMiner/AxeHub firmware vs the
  latest upstream release (device detail + list badges).
- **Pool health monitoring** — server-side reachability/latency checks with
  unreachable/reachable alerts and a Pool-status health badge.
- **Alert snooze** — per-type temporary mute (1h/4h/24h).
- **Device management** — remove devices from the list pages; assign devices to
  groups from the group detail page; clickable device IP opens its web UI.
- **Fixes** — NMMiner hostname refresh, `stratum+tcp://` pool scheme, restart
  405, implausible hashrate-spike filtering, MH/s chart scaling for ESP miners,
  continuous (headless) sampling/monitoring, settings save toast.

## Planned

### Near-term
- **Energy & cost tracking** — power-over-time × electricity price
  (`electricity_kwh_price`) → daily/monthly cost, W/TH efficiency trend, charts.
  (AxeOS reports power; NMMiner/AxeHub have none, so cost is AxeOS-scoped.)
- **Multi-coin odds & analytics** — Analytics and the block-chance/odds
  estimates currently assume **Bitcoin** network difficulty, but devices can
  mine other coins (NMMiner: BCH, DGB, …). Use the coin each device is actually
  mining (and that coin's network difficulty) instead of hard-coding BTC.
- **Top-bar price ticker** — the BTC price in the header currently shows no
  value. Either fix it and extend to the coins in use (per the watch/main coin
  config), or remove the ticker entirely.
- **Pool failover (phase 2)** — active auto-switch to the fallback pool on a
  sustained outage (opt-in). *Phase 1 (server-side pool reachability monitoring
  + alerts) shipped.*
- **Flapping protection (extend)** — apply the offline-grace style debounce to
  other toggling alerts (e.g. `pool_lost`/`pool_connected`). *Per-type
  mute/snooze and burst de-dup already shipped.*

### Later
- **Live shares feed** — a per-poll activity feed derived from accepted/rejected
  counter deltas ("when did the last share land"), not just cumulative totals.
- **Localization (i18n)** — multi-language frontend (DE/EN to start).

### Considered / not planned
- **Prometheus `/metrics` export** — proposed; revisit if there's demand.
- **Remote console / arbitrary device exec** — neither AxeOS nor NMMiner exposes
  a remote shell, so it's not feasible.
