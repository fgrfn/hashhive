<div align="center">

<img src="assets/logo.png" width="" alt="HashHive">

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
| 🔧 **BitAxe / NerdAxe** | Live stats · pause / resume / restart / identify · bulk actions · inline rename |
| 🌐 **Pool** | Push primary + fallback pool to all devices at once · saved pool presets |
| 🔔 **Alerts** | Offline · temp spike · VR temp · hashrate drop · error rate · fan failure · pool loss · fallback · reboot detection |
| 📨 **Notifications** | Telegram · Discord · Gotify · weekly summary |
| 📋 **Live Log** | Source badges · search filter · load up to 7 days history · persists across refresh |
| 📊 **Share Acceptance Rate** | Color-coded acc% column on AxeOS table · Pool Status table |

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
- Alert thresholds (max chip temp · max VR temp · min hashrate · max error rate)
- Refresh interval
- Notification credentials (Telegram / Discord / Gotify)
- Weekly summary schedule (day + time)
- Pool presets (saved on the Pool page)

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

## GitHub Actions

| Workflow | Trigger | Was passiert |
|---|---|---|
| **Secret Scan** | Jeder Push / PR | `gitleaks` scannt die gesamte Git-History auf API-Keys, Tokens, Passwörter |
| **Release Please** | Push auf `main` | Analysiert Commits; öffnet/aktualisiert Release PR mit `CHANGELOG.md` + `version.txt` Bump |
| **Release** | `v*`-Tag (nach Merge des Release PR) | Docker-Build → Push zu GHCR; GitHub Release mit `docker run`-Snippet |

### Release auslösen

Commits nach [Conventional Commits](https://www.conventionalcommits.org/) schreiben:

| Prefix | Version-Bump |
|---|---|
| `feat: ...` | Minor (`1.0.0 → 1.1.0`) |
| `fix: ...` | Patch (`1.0.0 → 1.0.1`) |
| `feat!: ...` | Major (`1.0.0 → 2.0.0`) |
| `chore:`, `docs:` | kein Release |

Nach dem Merge des Release PR steht das Image bereit:

```bash
docker pull ghcr.io/fgrfn/hashhive:latest
```

---

## Version

Die App-Version steht in [`version.txt`](version.txt) und wird automatisch durch Release Please aktualisiert.

- **Backend** liest `version.txt` beim Start und exposes sie in `/api/health`
- **Frontend** zeigt die Version in der Sidebar (lädt von `/api/health`)
- **Docker-Image** enthält `version.txt` im Build-Kontext

---

## Stack

- **Backend** — Python 3.10+ · FastAPI · httpx · asyncio
- **Frontend** — Vanilla HTML / CSS / JS · single file · no build step
- **Persistence** — JSON files · daily log rotation · no database required
- **Notifications** — Telegram · Discord · Gotify

---

## License

[MIT](LICENSE)
