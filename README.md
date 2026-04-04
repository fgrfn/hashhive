# HashHive

A unified mining dashboard for **NMMiner**, **BitAxe**, and **NerdAxe** devices.

Monitor hashrates, temperatures, pool connections, and alerts — all in one place.

---

## Features

- Real-time stats for NMMiner and AxeOS (BitAxe / NerdAxe) devices
- Alert system with Telegram, Discord, and Gotify notifications
- Push pool config to all devices at once
- Dark theme, single-file frontend — no build step required
- Docker support with persistent data volume

---

## Quick Start

### Option A – Setup Script (recommended)

**Linux / macOS:**
```bash
git clone https://github.com/fgrfn/hashhive.git
cd hashhive
chmod +x setup.sh
./setup.sh
```

The script will:
1. Check for Python 3.10+
2. Install `python3-venv` via apt if needed
3. Create a virtual environment (`.venv/`)
4. Install all dependencies
5. Optionally set up autostart (systemd service)

**Windows:**
```powershell
git clone https://github.com/fgrfn/hashhive.git
cd hashhive
.\setup.ps1
```

The script will:
1. Check for Python 3.10+
2. Install all dependencies
3. Optionally set up autostart (Windows Task Scheduler)

---

### Option B – Manual

```bash
git clone https://github.com/fgrfn/hashhive.git
cd hashhive

python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

pip install -r backend/requirements.txt

cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

---

### Option C – Docker

```bash
git clone https://github.com/fgrfn/hashhive.git
cd hashhive
docker compose up -d
```

Config, alerts, and device state are persisted in a named Docker volume (`hashhive-data`).

To change the port, edit `docker-compose.yml`:
```yaml
ports:
  - "9000:8000"   # host:container
```

---

## Access

| URL | Description |
|---|---|
| `http://localhost:8000` | Dashboard |
| `http://localhost:8000/docs` | API documentation (Swagger UI) |

---

## Managing Autostart

**Linux (systemd):**
```bash
sudo systemctl status hashhive
sudo systemctl stop hashhive
sudo systemctl disable hashhive
sudo journalctl -u hashhive -f     # live logs
```

**Windows (Task Scheduler):**
```powershell
Stop-ScheduledTask    -TaskName "HashHive"
Disable-ScheduledTask -TaskName "HashHive"
Unregister-ScheduledTask -TaskName "HashHive" -Confirm:$false
```

---

## Stack

- **Backend:** Python 3.10+ / FastAPI / httpx / asyncio
- **Frontend:** Vanilla HTML + CSS + JS — single file, no build step
- **Persistence:** JSON files, no database required
- **Notifications:** Telegram, Discord, Gotify

---

## License

MIT
- Persistenz: JSON-Dateien (kein Datenbankserver)

