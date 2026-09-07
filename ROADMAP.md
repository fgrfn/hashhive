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
- **Group management** — edit name, description, colour and assigned pool; live
  member and online counts on overview cards.
- **Multi-coin price ticker** — configurable CoinGecko coins and currency with a
  server-side cache and stale-data fallback.
- **WroomMiner support** — native discovery, polling, restart and pool push.
- **Energy & cost tracking** — integrates AxeOS power samples into daily/weekly
  kWh, cost, monthly projection and efficiency analytics.
- **Flapping protection** — pool reachability, device pool connection and
  fallback transitions require repeated observations before alerting.
- **Fixes** — NMMiner hostname refresh, `stratum+tcp://` pool scheme, restart
  405, implausible hashrate-spike filtering, MH/s chart scaling for ESP miners,
  continuous (headless) sampling/monitoring, settings save toast.

## Planned

### Near-term
- **Multi-coin odds & analytics** — Analytics and the block-chance/odds
  estimates currently assume **Bitcoin** network difficulty, but devices can
  mine other coins (NMMiner: BCH, DGB, …). Use the coin each device is actually
  mining (and that coin's network difficulty) instead of hard-coding BTC.
- **Pool failover (phase 2)** — active auto-switch to the fallback pool on a
  sustained outage (opt-in). *Phase 1 (server-side pool reachability monitoring
  + alerts) shipped.*

### Later
- **Live shares feed** — a per-poll activity feed derived from accepted/rejected
  counter deltas ("when did the last share land"), not just cumulative totals.
- **Localization (i18n)** — multi-language frontend (DE/EN to start).

### Considered / not planned
- **Prometheus `/metrics` export** — proposed; revisit if there's demand.
- **Remote console / arbitrary device exec** — neither AxeOS nor NMMiner exposes
  a remote shell, so it's not feasible.
