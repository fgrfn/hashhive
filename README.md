<div align="center">

<svg width="72" height="84" viewBox="0 0 38 44" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="hxGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
  </defs>
  <path d="M19 1 L37 11 L37 33 L19 43 L1 33 L1 11 Z" fill="url(#hxGrad)" stroke="#92400e" stroke-width="1"/>
  <ellipse cx="19" cy="26" rx="5.5" ry="7.5" fill="#1a1a10" stroke="#92400e" stroke-width=".8"/>
  <rect x="13.5" y="24" width="11" height="2" rx="1" fill="#fbbf24"/>
  <rect x="13.5" y="27.5" width="11" height="2" rx="1" fill="#fbbf24"/>
  <circle cx="19" cy="18" r="4" fill="#1a1a10"/>
  <line x1="17" y1="14.5" x2="14" y2="11" stroke="#1a1a10" stroke-width="1.2" stroke-linecap="round"/>
  <circle cx="13.5" cy="10.5" r="1" fill="#1a1a10"/>
  <line x1="21" y1="14.5" x2="24" y2="11" stroke="#1a1a10" stroke-width="1.2" stroke-linecap="round"/>
  <circle cx="24.5" cy="10.5" r="1" fill="#1a1a10"/>
  <ellipse cx="12" cy="22" rx="5.5" ry="3" fill="rgba(255,255,255,0.55)" transform="rotate(-20 12 22)"/>
  <ellipse cx="26" cy="22" rx="5.5" ry="3" fill="rgba(255,255,255,0.55)" transform="rotate(20 26 22)"/>
  <text x="19" y="30" text-anchor="middle" font-size="5.5" font-weight="900" fill="#fbbf24" font-family="monospace">#</text>
</svg>

# HashHive

**Unified mining dashboard for NMMiner, BitAxe and NerdAxe**

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## Features

| | |
|---|---|
| 📊 **Dashboard** | Live stats — hashrate, temperature, power, share rate |
| ⛏️ **NMMiner** | Full swarm table · per-device config modal · pool push |
| 🔧 **BitAxe / NerdAxe** | Live stats · pause / resume / restart / identify per device |
| 🌐 **Pool** | Push primary + fallback pool to all devices at once, with live preview |
| 🔔 **Alerts** | Offline · temp spike · hashrate drop · pool loss — with daily log rotation |
| 📨 **Notifications** | Telegram · Discord · Gotify |
| 📋 **Live Log** | Persistent per-session log (survives refresh, rolls after 24 h) |

---

## Quick Start

### Option A — Setup Script (recommended)

**Linux / macOS**
```bash
git clone https://github.com/fgrfn/hashhive.git
cd hashhive
chmod +x setup.sh && ./setup.sh
```

**Windows**
```powershell
git clone https://github.com/fgrfn/hashhive.git
cd hashhive
.\setup.ps1
```

Both scripts: check Python 3.10+, create `.venv/`, install dependencies, optionally configure autostart (systemd / Task Scheduler).

---

### Option B — Manual

```bash
git clone https://github.com/fgrfn/hashhive.git
cd hashhive
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

---

### Option C — Docker

```bash
git clone https://github.com/fgrfn/hashhive.git
cd hashhive
docker compose up -d
```

Data (config, logs, device state) persists in the `hashhive-data` volume.  
Change the port in `docker-compose.yml`: `"9000:8000"`.

---

## Access

| URL | |
|---|---|
| `http://localhost:8000` | Dashboard |
| `http://localhost:8000/docs` | Swagger API docs |

---

## Configuration

On first start, `dashboard_config.json` is created automatically. Configure via the **Settings** page:

- NMMiner master IP (all devices fetched via swarm)
- AxeOS device list (IP · name · type)
- Alert thresholds (max temp · min hashrate · min share rate)
- Refresh interval
- Notification credentials (Telegram / Discord / Gotify)

---

## Log Rotation

Logs are stored as daily files in `data/logs/YYYY-MM-DD.json`:

- Max **1 000 entries** per day
- Files older than **30 days** are deleted automatically
- The Alert History page supports filtering by 1 / 3 / 7 / 14 / 30 days
- Legacy `alert_history.json` is migrated automatically on first start

---

## Manage Autostart

**Linux (systemd)**
```bash
sudo systemctl status|stop|disable hashhive
sudo journalctl -u hashhive -f
```

**Windows (Task Scheduler)**
```powershell
Stop-ScheduledTask    -TaskName "HashHive"
Unregister-ScheduledTask -TaskName "HashHive" -Confirm:$false
```

---

## Stack

- **Backend** — Python 3.10+ · FastAPI · httpx · asyncio
- **Frontend** — Vanilla HTML / CSS / JS · single file · no build step
- **Persistence** — JSON files · daily log rotation · no database required
- **Notifications** — Telegram · Discord · Gotify

---

## License

[MIT](LICENSE)

