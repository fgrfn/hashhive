# CLAUDE.md – HashHive Development Guide

## Projektübersicht

**HashHive** ist ein unified Mining-Dashboard für NMMiner, BitAxe und NerdAxe Geräte.

- **Backend:** Python 3.10+ / FastAPI / httpx / asyncio
- **Frontend:** Vanilla HTML + CSS + JavaScript (kein Framework, kein Build-Step)
- **Persistenz:** JSON-Dateien (kein Datenbankserver nötig)
- **Port:** `http://localhost:8000`
- **API Base URL im Frontend:** `const API = window.location.origin` (dynamisch, kein hardcoded localhost)

---

## Projektstruktur

```
hashhive/
├── backend/
│   ├── main.py                  # FastAPI App, alle API-Endpunkte
│   ├── alerts.py                # Alert-Erkennung & Benachrichtigungen
│   ├── requirements.txt         # Python-Abhängigkeiten
│   ├── dashboard_config.json    # Gespeicherte Einstellungen (auto-generiert)
│   ├── alert_history.json       # Alert-Log (auto-generiert)
│   └── device_state.json        # Gerätestatus für Alert-Diff (auto-generiert)
├── frontend/
│   └── index.html               # Komplettes Dashboard (single file)
├── Dockerfile                   # Docker-Image (Backend + Frontend)
├── docker-compose.yml           # Docker Compose mit persistentem Volume
├── .dockerignore
├── setup.ps1                    # Setup-Skript Windows (inkl. Autostart-Option)
├── setup.sh                     # Setup-Skript Linux/macOS (inkl. systemd-Option)
├── claude.md                    # Diese Datei (in .gitignore)
├── README.md
├── .gitignore
└── LICENSE
```

---

## Setup & Starten

### Schnell-Setup (empfohlen)

**Windows:**
```powershell
.\setup.ps1
```

**Linux / macOS:**
```bash
chmod +x setup.sh && ./setup.sh
```

Beide Skripte:
1. Prüfen Python 3.10+
2. Erstellen ein `.venv/` Virtualenv im Projektroot
3. Installieren alle Abhängigkeiten darin
4. Fragen optional nach Autostart-Einrichtung:
   - **Windows:** Windows Aufgabenplanung (startet beim Anmelden, `RunLevel=Highest`)
   - **Linux:** systemd-Service `/etc/systemd/system/hashhive.service` (`WantedBy=multi-user.target`)

**setup.sh nutzt venv** (PEP 668 kompatibel):
- Prüft `python3 -m ensurepip`; falls fehlt → installiert `python3.X-venv` via apt
- Ist root → kein `sudo` Präfix (wird dynamisch erkannt)

### Manuell starten

```bash
# 1. Abhängigkeiten installieren
cd backend
pip install -r requirements.txt

# 2. Backend starten
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 3. Dashboard öffnen
# http://localhost:8000
```

`--reload` aktiviert Hot-Reload bei Code-Änderungen (nur für Entwicklung).

### Autostart verwalten

**Windows** – Aufgabenplanung:
```powershell
Stop-ScheduledTask -TaskName "HashHive"
Disable-ScheduledTask -TaskName "HashHive"
Unregister-ScheduledTask -TaskName "HashHive" -Confirm:$false
```

**Linux** – systemd:
```bash
sudo systemctl status hashhive
sudo systemctl stop hashhive
sudo systemctl disable hashhive
sudo journalctl -u hashhive -f   # Logs
```

---

## Alle API-Endpunkte (Backend)

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/dashboard` | Alle Daten + unread Alert-Count |
| GET | `/api/settings` | Aktuelle Konfiguration laden |
| POST | `/api/settings` | Konfiguration speichern |
| GET | `/api/nmminer/swarm` | NMMiner Stats (alle Geräte via Master) |
| GET | `/api/nmminer/config` | NMMiner Pool-Config |
| POST | `/api/nmminer/broadcast-config` | Pool-Config an alle NMMiners pushen |
| GET | `/api/nmminer/device-config?ip={ip}` | Einzelne NMMiner-Gerätekonfiguration laden |
| POST | `/api/nmminer/device-config` | Einzelne NMMiner-Gerätekonfiguration speichern |
| GET | `/api/axeos/devices` | BitAxe / NerdAxe Stats |
| PATCH | `/api/axeos/config/all` | Pool-Config an alle AxeOS pushen |
| GET | `/api/alerts` | Alert-Historie |
| POST | `/api/alerts/read-all` | Alle Alerts als gelesen markieren |
| DELETE | `/api/alerts` | Alert-Historie löschen |
| POST | `/api/notifications/test` | Test-Benachrichtigung senden |

---

## Konfigurationsschema (dashboard_config.json)

```json
{
  "nmminer_master": "10.10.40.182",
  "nmminer_devices": [],
  "axeos_devices": [
    { "ip": "10.10.40.201", "name": "BitAxe Gamma", "type": "bitaxe" },
    { "ip": "10.10.40.203", "name": "NerdAxe",      "type": "nerdaxe" }
  ],
  "refresh_interval": 30,
  "thresholds": {
    "temp_max": 70,
    "hashrate_min": 0,
    "share_rate_min": 80
  },
  "notifications": {
    "telegram_enabled": false,
    "telegram_token": "",
    "telegram_chat_id": "",
    "discord_enabled": false,
    "discord_webhook": "",
    "gotify_enabled": false,
    "gotify_url": "",
    "gotify_token": ""
  }
}
```

---

## Geräte-APIs

### NMMiner
Alle Anfragen laufen über die **Master-IP** (ein NMMiner fungiert als Swarm-Master).

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| GET | `http://{master}/swarm` | Alle Geräte-Stats |
| GET | `http://{master}/config` | Alle Konfigurationen |
| GET | `http://{master}/config?ip={device_ip}` | Einzelne Gerätekonfiguration |
| POST | `http://{master}/config?ip={device_ip}` | Einzelne Gerätekonfiguration speichern |
| POST | `http://{master}/broadcast-config` | Config an alle Geräte pushen (JSON body) |

**Bekannte Response-Formate von `/swarm`** (werden normalisiert):
- Flat Array: `[{ip, hashrate, ...}, ...]`
- Object mit devices-Key: `{"devices": [...]}`
- Object mit anderen List-Keys: `miners`, `workers`, `peers`, `swarm`, `data`
- IP-keyed dict: `{"10.0.0.1": {stats}, "10.0.0.2": {stats}}`

**Bekannte Hashrate-Feldnamen** (Fallback-Kette im Frontend):
`GHs5s` → `GHs5` → `GHs1m` → `GHsav` → `hashrate` → `currentHashrate` → `mhsAv / 1000`

**Bekannte Uptime-Formate**: Sekunden (number) **oder** String (z.B. `"1d 14h"`) – beides wird korrekt dargestellt.

**Gerätekonfiguration-Felder** (NMMiner, per Gerät):
```json
{
  "ip": "10.10.40.112",
  "hostname": "NMMiner1_3a3ba",
  "ssid": "Graefen",
  "wifiPassword": "...",
  "stratumURL": "stratum+tcp://digi.hmpool.io:3337",
  "stratumUser": "wallet.worker",
  "stratumPassword": "x",
  "fallbackStratumURL": "stratum+tcp://pool.tazmining.ch:33333",
  "fallbackStratumUser": "wallet.worker",
  "fallbackStratumPassword": "x",
  "timezone": 8,
  "timeFormat": "12h (AM/PM)",
  "dateFormat": "DD-MM-YYYY",
  "uiRefresh": 2,
  "screenTimeout": 60,
  "brightness": 50,
  "saveHistory": true,
  "ledEnable": true,
  "rotateScreen": 0,
  "autoBrightness": false
}
```

### BitAxe / NerdAxe (AxeOS)
Firmware-Repo: https://github.com/bitaxeorg/ESP-Miner  
OpenAPI-Spec: `main/http_server/openapi.yaml`

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| GET | `http://{ip}/api/system/info` | Vollständige Stats |
| GET | `http://{ip}/api/system/asic` | ASIC-Modell + Freq/Voltage-Optionen |
| PATCH | `http://{ip}/api/system` | Einstellungen ändern |
| POST | `http://{ip}/api/system/restart` | Neustart (**POST**, nicht GET!) |
| POST | `http://{ip}/api/system/pause` | Mining pausieren |
| POST | `http://{ip}/api/system/resume` | Mining fortsetzen |
| POST | `http://{ip}/api/system/identify` | LED-Blinken (Gerät identifizieren) |

**Wichtige Felder in `/api/system/info`:**

| Feld | Beschreibung |
|---|---|
| `hashRate` | Aktuelle Hashrate in GH/s |
| `hashRate_1m` | 1-Minuten-Durchschnitt GH/s |
| `hashRate_10m` | 10-Minuten-Durchschnitt GH/s |
| `hashRate_1h` | 1-Stunden-Durchschnitt GH/s |
| `expectedHashrate` | Erwartete Hashrate bei aktuellen Einstellungen |
| `errorPercentage` | Hash-Fehlerrate in % |
| `temp` | Chip-Temperatur (Durchschnitt) |
| `temp2` | Zweiter Temperatursensor |
| `vrTemp` | Spannungsregler-Temperatur |
| `power` | Stromverbrauch in Watt |
| `current` | Stromaufnahme in mA |
| `voltage` | Eingangsspannung |
| `frequency` | Konfigurierte ASIC-Frequenz MHz |
| `actualFrequency` | Echtzeit ASIC-Frequenz MHz |
| `fanspeed` | Lüftergeschwindigkeit % |
| `fanrpm` | Lüfter RPM |
| `fan2rpm` | Zweiter Lüfter RPM |
| `sharesAccepted` | Akzeptierte Shares |
| `sharesRejected` | Abgelehnte Shares |
| `stratumURL` | Pool-URL |
| `stratumUser` | Pool-Worker |
| `fallbackStratumURL` | Fallback-Pool-URL |
| `uptimeSeconds` | Uptime in Sekunden |
| `miningPaused` | `true` wenn Mining pausiert |
| `bestDiff` | Bisher beste Difficulty |
| `bestSessionDiff` | Beste Difficulty dieser Session |
| `ASICModel` | ASIC-Modell (BM1366, BM1368, BM1370, BM1397) |
| `boardVersion` | Hardware-Version |
| `hostname` | Gerätename |
| `version` | Firmware-Version |
| `axeOSVersion` | AxeOS-Version |

**PATCH `/api/system` Felder** (Settings-Schema):

| Feld | Beschreibung |
|---|---|
| `stratumURL` | Pool-URL |
| `stratumUser` | Worker-Name |
| `stratumPassword` | Pool-Passwort |
| `stratumPort` | Pool-Port (1–65535) |
| `fallbackStratumURL` | Fallback-Pool |
| `fallbackStratumUser` | Fallback-Worker |
| `fallbackStratumPassword` | Fallback-Passwort |
| `fallbackStratumPort` | Fallback-Port |
| `frequency` | ASIC-Frequenz MHz |
| `coreVoltage` | ASIC-Kernspannung mV |
| `fanspeed` | Manueller Lüfterspeed % (0–100) |
| `autofanspeed` | Auto-Lüftersteuerung (0=manuell, 1=auto) |
| `temptarget` | Ziel-Temperatur für PID-Regler °C |
| `hostname` | Gerätename |
| `ssid` | WLAN-SSID |
| `wifiPass` | WLAN-Passwort |

---

## Frontend-Architektur

Das gesamte Frontend befindet sich in **einer einzigen Datei**: `frontend/index.html`.

- Kein Build-Schritt, kein npm, kein Webpack
- Vanilla JS mit `fetch()` gegen das lokale Backend
- Dark Theme mit lila Akzentfarbe (`--accent: #a855f7`)
- API Base URL: `const API = window.location.origin` (funktioniert bei Zugriff via IP/Domain)
- Sidebar-Navigation mit 6 Seiten

### Seiten
| Seite | Beschreibung |
|---|---|
| Dashboard | Stat-Cards (Hashrate, Online, Max-Temp, Alerts) + kompakte Tabellen + Live-Log |
| NMMiner | Vollständige Tabelle + ✏ Edit-Button pro Gerät (öffnet Konfig-Modal) |
| BitAxe / NerdAxe | Vollständige Tabelle mit Pause/Resume/Restart/Identify-Buttons |
| Pool | Primär/Sekundär Pool für alle Geräte gleichzeitig pushen |
| Settings | NMMiner Master-IP, AxeOS Devices, Alert-Schwellenwerte, Refresh-Interval |
| Notifications | Telegram/Discord/Gotify + Alert-Verlauf |

### Dashboard – Live Log
- Zeigt letzte 60 Log-Einträge (monospace, farbkodiert)
- **Schweregrade:** `critical` (rot), `warning` (gelb), `info` (blau), `ok` (grün)
- Initialisierung: lädt letzten 20 Alerts aus der Alert-Historie
- Jeder Dashboard-Refresh → neuer "Refreshed – X/Y online · Z GH/s" Eintrag
- Geräte offline/online Übergänge werden dedupliziert geloggt
- Fetch-Fehler werden rot geloggt

### NMMiner – Konfig-Modal
Öffnet sich per ✏ Edit-Button pro Gerät, 5 Sektionen:
1. **WiFi** – Hostname, SSID, Passwort
2. **Primary Pool** – URL, Worker/Wallet, Passwort
3. **Secondary Pool** – URL, Worker/Wallet, Passwort
4. **Region** – Timezone (UTC-Offset), Zeitformat, Datumsformat
5. **Display & System** – UI-Refresh, Screen-Timeout, Brightness, Save History, LED, Screen-Rotation, Auto-Brightness

### BitAxe / NerdAxe – Aktionen pro Gerät
- **⏸ Pause** / **▶ Resume** (kontextabhängig, basiert auf `miningPaused`)
- **↺ Restart** (POST, nicht GET)
- **💡 ID** (LED-Blinken zur Identifikation)

### CSS-Variablen
```css
--bg: #0f0f13
--surface: #1a1a24
--surface2: #22222e
--border: #2e2e3e
--text: #e2e2f0
--text-muted: #6b6b8a
--accent: #a855f7      /* Lila – NMMiner-Karten */
--accent-dim: #9333ea
--success: #22c55e
--warning: #f59e0b
--danger: #ef4444
--info: #38bdf8         /* Blau – BitAxe/NerdAxe-Karten */
```

### Miner-Karten (Dashboard)
- NMMiner-Karte: `border-top: 3px solid var(--accent)` (lila)
- BitAxe/NerdAxe-Karte: `border-top: 3px solid #38bdf8` (blau)

---

## Alert-System (`alerts.py`)

Alerts werden bei jedem `/api/dashboard` Request automatisch geprüft:

1. Aktuellen Gerätezustand mit `device_state.json` vergleichen
2. Unterschiede → neue Alerts erzeugen
3. Alerts in `alert_history.json` speichern (max. 500 Einträge)
4. Benachrichtigungen asynchron senden (Telegram, Discord, Gotify)

### Alert-Typen
| Kind | Schwere | Auslöser |
|---|---|---|
| `offline` | critical | Gerät war online, ist jetzt nicht erreichbar |
| `online` | info | Gerät war offline, ist wieder erreichbar |
| `temp_high` | critical | Temperatur > `temp_max` Schwellenwert |
| `hashrate_low` | warning | Hashrate < `hashrate_min` (nur wenn > 0) |
| `pool_lost` | critical | Pool-URL war gesetzt, ist jetzt leer |
| `pool_connected` | info | Pool-Verbindung wiederhergestellt |

### Daten-Pfad
`DATA_DIR` wird per Env-Variable `HASHHIVE_DATA_DIR` gesteuert (Standard: `backend/`-Verzeichnis).  
Docker setzt: `HASHHIVE_DATA_DIR=/app/backend/data`

---

## Docker

### Starten

```bash
# Image bauen und starten
docker compose up -d

# Logs
docker compose logs -f

# Stoppen
docker compose down

# Rebuild nach Code-Änderungen
docker compose up -d --build
```

Dashboard: **http://localhost:8000**

### Details
- Ein einziges Image enthält Backend (FastAPI) + Frontend (`/frontend/index.html`)
- Persistente Daten landen im Named Volume `hashhive-data` → `/app/backend/data`
- Pfad per Env-Variable: `HASHHIVE_DATA_DIR=/app/backend/data`
- Port in `docker-compose.yml` änderbar: `"8000:8000"` → z.B. `"9000:8000"`

---

## Entwicklungs-Tipps

- **API-Docs**: Swagger UI unter `http://localhost:8000/docs`
- **CORS** ist offen (`allow_origins=["*"]`) – nur für lokalen Betrieb
- **JSON-Dateien** werden beim ersten Start automatisch erstellt
- **Frontend direkt öffnen**: `frontend/index.html` im Browser (API → `localhost:8000`)
- **Backend normalisiert** alle NMMiner-Swarm-Formate zu `{devices: [...]}`

## Bekannte Fallstricke

| Problem | Ursache | Fix |
|---|---|---|
| „Failed to fetch" bei Zugriff via IP | `const API = 'http://localhost:8000'` hardcoded | `window.location.origin` verwenden |
| NaNh NaNm Uptime | NMMiner gibt String statt Sekunden zurück | `fmtUptime()` prüft `typeof s === 'string'` |
| 0.00 Hashrate | Falscher Feldname | Fallback-Kette `GHs5s → GHs1m → GHsav → hashrate → ...` |
| Dashboard zeigt „No NMMiner" obwohl NMMiner-Seite funktioniert | `/swarm` gibt anderes Format zurück als `{devices:[]}` | Backend normalisiert alle Formate |
| Restart funktioniert nicht | AxeOS `restart` benötigt POST, kein GET | `fetch(url, { method: 'POST' })` |

## Typische nächste Schritte / Erweiterungen

- Hashrate-Verlauf mit Chart.js + SQLite
- Weitere Geräteklassen (z.B. Antminer via LuCI-API)
- WebSocket für Echtzeit-Updates statt Polling
- HTTPS + Auth für externen Zugriff


## Projektübersicht

**HashHive** ist ein unified Mining-Dashboard für NMMiner, BitAxe und NerdAxe Geräte.

- **Backend:** Python 3.10+ / FastAPI / httpx / asyncio
- **Frontend:** Vanilla HTML + CSS + JavaScript (kein Framework, kein Build-Step)
- **Persistenz:** JSON-Dateien (kein Datenbankserver nötig)
- **Port:** `http://localhost:8000`

---

## Projektstruktur

```
hashhive/
├── backend/
│   ├── main.py                  # FastAPI App, alle API-Endpunkte
│   ├── alerts.py                # Alert-Erkennung & Benachrichtigungen
│   ├── requirements.txt         # Python-Abhängigkeiten
│   ├── dashboard_config.json    # Gespeicherte Einstellungen (auto-generiert)
│   ├── alert_history.json       # Alert-Log (auto-generiert)
│   └── device_state.json        # Gerätestatus für Alert-Diff (auto-generiert)
├── frontend/
│   └── index.html               # Komplettes Dashboard (single file)
├── Dockerfile                   # Docker-Image (Backend + Frontend)
├── docker-compose.yml           # Docker Compose mit persistentem Volume
├── .dockerignore
├── setup.ps1                    # Setup-Skript Windows (inkl. Autostart-Option)
├── setup.sh                     # Setup-Skript Linux/macOS (inkl. systemd-Option)
├── claude.md                    # Diese Datei (in .gitignore)
├── README.md
├── .gitignore
└── LICENSE
```

---

## Setup & Starten

### Schnell-Setup (empfohlen)

**Windows:**
```powershell
.\setup.ps1
```

**Linux / macOS:**
```bash
chmod +x setup.sh && ./setup.sh
```

Beide Skripte:
1. Prüfen Python 3.10+
2. Installieren alle Abhängigkeiten (`pip install -r requirements.txt`)
3. Fragen optional nach Autostart-Einrichtung:
   - **Windows:** Windows Aufgabenplanung (startet beim Anmelden, `RunLevel=Highest`)
   - **Linux:** systemd-Service `/etc/systemd/system/hashhive.service` (`WantedBy=multi-user.target`)

### Manuell starten

```bash
# 1. Abhängigkeiten installieren
cd backend
pip install -r requirements.txt

# 2. Backend starten
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 3. Dashboard öffnen
# http://localhost:8000
```

`--reload` aktiviert Hot-Reload bei Code-Änderungen (nur für Entwicklung).

### Autostart verwalten

**Windows** – Aufgabenplanung:
```powershell
# Stoppen
Stop-ScheduledTask -TaskName "HashHive"
# Deaktivieren
Disable-ScheduledTask -TaskName "HashHive"
# Entfernen
Unregister-ScheduledTask -TaskName "HashHive" -Confirm:$false
```

**Linux** – systemd:
```bash
sudo systemctl status hashhive
sudo systemctl stop hashhive
sudo systemctl disable hashhive
sudo journalctl -u hashhive -f   # Logs
```

---

## Wichtige API-Endpunkte

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/dashboard` | Alle Daten + unread Alert-Count |
| GET | `/api/settings` | Aktuelle Konfiguration laden |
| POST | `/api/settings` | Konfiguration speichern |
| GET | `/api/nmminer/swarm` | NMMiner Stats (alle Geräte) |
| GET | `/api/nmminer/config` | NMMiner Pool-Config |
| POST | `/api/nmminer/broadcast-config` | Pool-Config an alle NMMiners pushen |
| GET | `/api/axeos/devices` | BitAxe / NerdAxe Stats |
| PATCH | `/api/axeos/config/all` | Pool-Config an alle AxeOS pushen |
| GET | `/api/alerts` | Alert-Historie |
| POST | `/api/alerts/read-all` | Alle Alerts als gelesen markieren |
| DELETE | `/api/alerts` | Alert-Historie löschen |
| POST | `/api/notifications/test` | Test-Benachrichtigung senden |

---

## Konfigurationsschema (dashboard_config.json)

```json
{
  "nmminer_master": "10.10.40.182",
  "nmminer_devices": [
    { "ip": "10.10.40.112", "name": "NMMiner 1" }
  ],
  "axeos_devices": [
    { "ip": "10.10.40.201", "name": "BitAxe Gamma", "type": "bitaxe" }
  ],
  "refresh_interval": 30,
  "thresholds": {
    "temp_max": 70,
    "hashrate_min": 0,
    "share_rate_min": 80
  },
  "notifications": {
    "telegram_enabled": false,
    "telegram_token": "",
    "telegram_chat_id": "",
    "discord_enabled": false,
    "discord_webhook": "",
    "gotify_enabled": false,
    "gotify_url": "",
    "gotify_token": ""
  }
}
```

---

## Geräte-APIs

### NMMiner
- `GET http://{master_ip}/swarm` → alle Geräte-Stats
- `GET http://{master_ip}/config` → alle Konfigurationen
- `GET http://{master_ip}/config?ip={device_ip}` → einzelne Config
- `POST http://{master_ip}/broadcast-config` → Config an alle pushen (JSON body)

### BitAxe / NerdAxe (AxeOS)
- `GET http://{ip}/api/system/info` → Stats (hashRate, temp, sharesAccepted, etc.)
- `PATCH http://{ip}/api/system` → Einstellungen ändern
- `GET http://{ip}/api/system/restart` → Neustart

---

## Frontend-Architektur

Das gesamte Frontend befindet sich in **einer einzigen Datei**: `frontend/index.html`.

- Kein Build-Schritt, kein npm, kein Webpack
- Vanilla JS mit `fetch()` gegen das lokale Backend
- AxeOS-inspiriertes Dark Theme mit lila Akzentfarbe (`#a855f7`)
- Sidebar-Navigation mit 6 Seiten: Dashboard, NMMiner, BitAxe/NerdAxe, Pool, Einstellungen, Benachrichtigungen
- API Base URL: `const API = 'http://localhost:8000'` im Script-Block

### Seiten
- **Dashboard** – Zusammenfassung + kompakte Tabellen beider Geräteklassen
- **NMMiner** – Vollständige Tabelle mit allen Spalten
- **BitAxe / NerdAxe** – Vollständige Tabelle inkl. Spannung, Freq, Fan
- **Pool Einstellungen** – Primär/Sekundär Pool für alle Geräte gleichzeitig
- **Einstellungen** – NMMiner Master-IP, manuelle Geräte, AxeOS Geräte, Alert-Schwellenwerte, Telegram/Discord/Gotify
- **Benachrichtigungen** – Alert-Log mit Schweregrad und Zeitstempel

---

## Alert-System (alerts.py)

Alerts werden bei jedem `/api/dashboard` Request automatisch geprüft:

1. Aktuellen Gerätezustand mit `device_state.json` vergleichen
2. Unterschiede → neue Alerts erzeugen
3. Alerts in `alert_history.json` speichern
4. Benachrichtigungen asynchron senden (Telegram, Discord, Gotify)

### Alert-Typen
| Kind | Schwere | Auslöser |
|---|---|---|
| `offline` | critical | Gerät war online, ist jetzt nicht erreichbar |
| `online` | info | Gerät war offline, ist wieder erreichbar |
| `temp_high` | critical | Temperatur > `temp_max` Schwellenwert |
| `hashrate_low` | warning | Hashrate < `hashrate_min` (nur wenn > 0) |
| `pool_lost` | critical | Pool-URL war gesetzt, ist jetzt leer |
| `pool_connected` | info | Pool-Verbindung wiederhergestellt |

---

## Entwicklungs-Tipps

- **API-Docs**: Swagger UI automatisch unter `http://localhost:8000/docs`
- **CORS** ist offen (`allow_origins=["*"]`) – nur für lokalen Betrieb
- **JSON-Dateien** werden beim ersten Start automatisch erstellt
- **Frontend direkt öffnen**: `frontend/index.html` im Browser öffnen (API zeigt auf `localhost:8000`)
- **VS Code Extensions empfohlen**: Python, Pylance, REST Client

---

## Typische nächste Schritte / Erweiterungen

- Hashrate-Verlauf mit Chart.js + SQLite
- Weitere Geräteklassen (z.B. Antminer via LuCI-API)
- WebSocket für Echtzeit-Updates statt Polling
- HTTPS + Auth für externen Zugriff

---

## Docker

### Starten

```bash
# Image bauen und starten
docker compose up -d

# Logs
docker compose logs -f

# Stoppen
docker compose down
```

Dashboard: **http://localhost:8000**

### Details
- Ein einziges Image beinhaltet Backend (FastAPI) + Frontend (`/frontend/index.html`)
- Persistente Daten (Config, Alerts, Gerätestatus) landen im Named Volume `hashhive-data`
  → gemountet unter `/app/backend/data` im Container
- Pfad wird per Env-Variable gesteuert: `HASHHIVE_DATA_DIR=/app/backend/data`
- Port in `docker-compose.yml` änderbar: `"8000:8000"` → z.B. `"9000:8000"`

### Rebuild nach Code-Änderungen

```bash
docker compose up -d --build
```
