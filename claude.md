# CLAUDE.md – HashHive Development Guide
<!-- Zuletzt aktualisiert: 2026-04-04 -->

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
- Ist root → kein `sudo` Präfix (wird dynamisch per `id -u` erkannt)

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
| GET | `/api/axeos/devices` | BitAxe / NerdAxe Stats (alle konfigurierten Geräte) |
| PATCH | `/api/axeos/config/all` | Pool-Config an alle AxeOS-Geräte pushen |
| GET | `/api/alerts` | Alert-Historie |
| POST | `/api/alerts/read-all` | Alle Alerts als gelesen markieren |
| DELETE | `/api/alerts` | Alert-Historie löschen |
| POST | `/api/notifications/test` | Test-Benachrichtigung senden |

### `/api/dashboard` Response-Schema

```json
{
  "nmminer": { "devices": [...], "_error": "optional falls Fehler" },
  "axeos":   { "devices": [...] },
  "unread_alerts": 3,
  "config": { ...dashboard_config.json... }
}
```

### `/api/nmminer/device-config` POST-Fallback-Kette
Das Backend versucht der Reihe nach:
1. `POST http://{master}/config?ip={device_ip}`
2. `POST http://{master}/config`
3. `POST http://{device_ip}/config`
→ Erster HTTP-Status < 500 wird zurückgegeben.

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

**Bekannte Response-Formate von `/swarm`** (werden im Backend normalisiert):
- Flat Array: `[{ip, hashrate, ...}, ...]`
- Object mit `devices`-Key: `{"devices": [...]}`
- Object mit anderen List-Keys: `miners`, `workers`, `peers`, `swarm`, `data`
- IP-keyed dict: `{"10.0.0.1": {stats}, "10.0.0.2": {stats}}`
- Fehler: `{"devices": [], "_error": "Fehlermeldung"}`

**Bekannte Hashrate-Feldnamen** (Fallback-Kette im Frontend):
`GHs5s` → `GHs5` → `GHs1m` → `GHsav` → `hashrate` → `currentHashrate` → `mhsAv / 1000`

**Bekannte Pool-Feldnamen:** `pool` → `stratumURL` → `stratum_url` → `poolURL`

**Bekannte Worker-Feldnamen:** `worker` → `stratumUser` → `user`

**Bekannte Uptime-Formate:** Sekunden (number) **oder** String (z.B. `"1d 14h"`) – `fmtUptime()` behandelt beide.

**Bekannte BestShare-Feldnamen:** `bestShare` → `best_share` → `bestDiff`

**Bekannte Temp-Feldnamen:** `temp` → `temperature` → `chipTemp`

**Gerätekonfiguration-Felder** (per Gerät, PascalCase — gesendet an `POST /config?ip=`):
```json
{
  "ip": "10.10.40.129",
  "IP": "10.10.40.129",
  "Hostname": "NMMiner2_df409",
  "WiFiSSID": "Graefen",
  "WiFiPWD": "...",
  "PrimaryPool": "stratum+tcp://digi.hmpool.io:3335",
  "PrimaryAddress": "wallet.NMMiner2_df409",
  "PrimaryPassword": "x",
  "SecondaryPool": "stratum+tcp://pool.tazmining.ch:33333",
  "SecondaryAddress": "wallet.worker",
  "SecondaryPassword": "x",
  "Timezone": 2,
  "TimeFormat": 24,
  "DateFormat": "DD-MM-YYYY",
  "UIRefresh": 2,
  "ScreenTimeout": 0,
  "Brightness": 100,
  "SaveUptime": 1,
  "LedEnable": 1,
  "RotateScreen": 0,
  "SelectedCoins": "BTC,ETH,BCH,BNB,DOGE,LTC,SOL,XRP",
  "AutoBrightness": 0
}
```

**Wichtig:** Alle booleschen Felder (`SaveUptime`, `LedEnable`, `AutoBrightness`) sind `1`/`0` (integer), nicht `true`/`false`. `RotateScreen` ist ein integer: `0`, `90`, `180` oder `270`. `TimeFormat` ist `24` oder `12` (integer). Pool-URLs müssen das Schema enthalten: `stratum+tcp://host:port` — `nmPoolUrl()` im Frontend ergänzt fehlende Schemata automatisch.

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

| Feld | Typ | Beschreibung |
|---|---|---|
| `hashRate` | number | Aktuelle Hashrate in GH/s |
| `hashRate_1m` | number | 1-Minuten-Durchschnitt GH/s |
| `hashRate_10m` | number | 10-Minuten-Durchschnitt GH/s |
| `hashRate_1h` | number | 1-Stunden-Durchschnitt GH/s |
| `expectedHashrate` | number | Erwartete Hashrate bei aktuellen Einstellungen |
| `errorPercentage` | number | Hash-Fehlerrate in % |
| `temp` | number | Chip-Temperatur Durchschnitt °C |
| `temp2` | number | Zweiter Temperatursensor °C |
| `vrTemp` | number | Spannungsregler-Temperatur °C |
| `power` | number | Stromverbrauch in Watt |
| `current` | number | Stromaufnahme in mA |
| `voltage` | number | Eingangsspannung mV |
| `frequency` | number | Konfigurierte ASIC-Frequenz MHz |
| `actualFrequency` | number | Echtzeit ASIC-Frequenz MHz (wird bevorzugt angezeigt) |
| `fanspeed` | number | Lüftergeschwindigkeit % |
| `fanrpm` | number | Lüfter RPM |
| `fan2rpm` | number | Zweiter Lüfter RPM |
| `sharesAccepted` | number | Akzeptierte Shares |
| `sharesRejected` | number | Abgelehnte Shares |
| `stratumURL` | string | Pool-URL |
| `stratumUser` | string | Pool-Worker |
| `fallbackStratumURL` | string | Fallback-Pool-URL |
| `isUsingFallbackStratum` | number | 0/1 ob Fallback aktiv |
| `uptimeSeconds` | number | Uptime in Sekunden |
| `miningPaused` | boolean | `true` wenn Mining pausiert |
| `bestDiff` | number | Bisher beste Difficulty |
| `bestSessionDiff` | number | Beste Difficulty dieser Session |
| `ASICModel` | string | BM1366 / BM1368 / BM1370 / BM1397 |
| `boardVersion` | string | Hardware-Version |
| `hostname` | string | Gerätename |
| `version` | string | Firmware-Version |
| `axeOSVersion` | string | AxeOS-Version |

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

**Interne AxeOS-Felder** (vom Backend hinzugefügt, nicht vom Gerät):

| Feld | Beschreibung |
|---|---|
| `_ip` | Konfigurierte IP-Adresse |
| `_name` | Konfigurierter Anzeigename |
| `_type` | `bitaxe` oder `nerdaxe` |
| `_online` | `true` wenn Gerät erreichbar war |

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

### Dashboard – Stat-Cards
| Karte | Quelle |
|---|---|
| Total Hashrate | Summe aller online NMMiner + AxeOS GH/s, zeigt TH/s wenn ≥ 1000 |
| Devices Online | Online-Zähler aller Geräteklassen |
| Max. Temperature | Höchste Temperatur über alle Geräte |
| Open Alerts | `unread_alerts` aus `/api/dashboard` |

### Dashboard – Live Log
- Zeigt letzte 60 Log-Einträge (monospace, farbkodiert)
- **Schweregrade:** `critical` (rot), `warning` (gelb), `info` (blau), `ok` (grün)
- Initialisierung: lädt letzte 20 Alerts aus der Alert-Historie via `/api/alerts`
- Jeder Dashboard-Refresh → neuer `"Refreshed – X/Y online · Z GH/s"` Eintrag (grün)
- Geräte offline/online Übergänge werden dedupliziert geloggt (`_offlineTracked` Set)
- Fetch-Fehler werden rot geloggt
- "✕ Clear" Button leert den Log

### NMMiner-Seite
**Tabellenspalten:** IP | Name | Status | Hashrate (GH/s) | Temp (°C) | Pool | Worker | Uptime | Best Share | Actions

**Actions:** ✏ Edit-Button → öffnet Konfig-Modal

### NMMiner – Konfig-Modal
Öffnet sich per ✏ Edit-Button pro Gerät (lädt Config via `GET /api/nmminer/device-config?ip=`), 5 Sektionen:
1. **📶 WiFi** – Hostname, SSID, Passwort
2. **🔵 Primary Pool** – URL, Worker/Wallet, Passwort
3. **🟣 Secondary Pool** – URL, Worker/Wallet, Passwort
4. **🌐 Region** – Timezone (UTC-Offset -12 bis +14), Zeitformat (24h/12h AM/PM), Datumsformat
5. **🖥 Display & System** – UI-Refresh, Screen-Timeout, Brightness (0–100), Save History, LED Enable, Rotate Screen (0°/90°/180°/270°), Auto-Brightness

Speichern via `POST /api/nmminer/device-config`. Außerhalb klicken oder Cancel schließt ohne Speichern.

### BitAxe / NerdAxe-Seite
**Tabellenspalten:** Name/IP | Type | Status | Hashrate (GH/s) | 1m Avg | Expected | Err % | Temp (°C) | VR Temp | Power (W) | Voltage (mV) | Freq (MHz) | Fan (%) | Fan RPM | Shares OK | Shares Err | Pool | Actions

**Status:** Online (grün) / Offline (rot) / Paused (rot dot, Text "Paused")

**Actions (nur wenn online):**
- ⏸ Pause → `POST /api/system/pause` (wird zu ▶ Resume wenn `miningPaused = true`)
- ▶ Resume → `POST /api/system/resume`
- ↺ Restart → `POST /api/system/restart` (**POST**, nicht GET!)
- 💡 ID → `POST /api/system/identify` (LED blinkt)

### CSS-Variablen (`:root`)
```css
--bg:           #0f0f13
--surface:      #1a1a24
--surface2:     #222230
--border:       #2d2d3d
--text:         #e2e2f0
--text-muted:   #8888aa
--accent:       #a855f7      /* Lila – NMMiner-Akzent */
--accent-dim:   #7c3aed
--accent-glow:  rgba(168,85,247,.15)
--success:      #22c55e
--warning:      #f59e0b
--danger:       #ef4444
--info:         #3b82f6      /* Blau – BitAxe/NerdAxe-Akzent */
```

### Wichtige JS-Funktionen
| Funktion | Beschreibung |
|---|---|
| `showPage(name)` | Navigiert zu einer Seite, startet/stoppt Auto-Refresh |
| `loadDashboard()` | Lädt `/api/dashboard`, ruft `renderDashboard()` auf |
| `startAutoRefresh()` | Startet interval-Timer basierend auf `config.refresh_interval` |
| `renderDashboard(data)` | Rendert Stat-Cards + NMMiner + AxeOS Tabellen, gibt `{totalHr, onlineCnt, total}` zurück |
| `appendLog(severity, msg)` | Fügt Eintrag in Live-Log ein, capped bei 60 |
| `initLiveLog()` | Lädt letzte 20 Alert-History beim Start |
| `openNmEdit(ip)` | Öffnet Modal, lädt Device-Config |
| `saveNmEdit()` | Sendet Formular-Daten an `/api/nmminer/device-config` |
| `closeNmEdit()` | Schließt Modal |
| `loadNmPage()` | Lädt `/api/nmminer/swarm`, rendert Tabelle |
| `loadAxPage()` | Lädt `/api/axeos/devices`, rendert Tabelle |
| `pauseDevice(ip)` | POST `/api/system/pause` direkt ans Gerät |
| `resumeDevice(ip)` | POST `/api/system/resume` direkt ans Gerät |
| `restartDevice(ip)` | POST `/api/system/restart` direkt ans Gerät |
| `identifyDevice(ip)` | POST `/api/system/identify` direkt ans Gerät |
| `broadcastPool()` | Pusht Pool-Config an NMMiner + AxeOS |
| `fmtHr(v)` | Formatiert GH/s, zeigt TH/s wenn ≥ 1000 |
| `fmtUptime(s)` | Sekunden oder String (z.B. "2d 3h") → "Xh Ym" |
| `fmtTemp(v, max)` | Temperatur mit Farbklasse t-ok/t-warn/t-crit |
| `toast(msg, type)` | Zeigt temporäre Benachrichtigung (success/error/info) |

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

### Alert-Schema
```json
{
  "id": "nmminer:10.0.0.1:offline:2026-04-04T...",
  "device": "nmminer:10.0.0.1",
  "kind": "offline",
  "severity": "critical",
  "message": "NMMiner 10.0.0.1 is offline",
  "timestamp": "2026-04-04T12:00:00+00:00",
  "read": false
}
```

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

---

## Bekannte Fallstricke

| Problem | Ursache | Fix |
|---|---|---|
| „Failed to fetch" bei Zugriff via IP | `const API = 'http://localhost:8000'` hardcoded | `window.location.origin` verwenden |
| `NaNh NaNm` Uptime | NMMiner gibt String statt Sekunden zurück | `fmtUptime()` prüft `typeof s === 'string'` |
| `0.00` Hashrate | Falscher Feldname | Fallback-Kette `GHs5s → GHs5 → GHs1m → GHsav → hashrate → ...` |
| Dashboard zeigt „No NMMiner" obwohl NMMiner-Seite funktioniert | `/swarm` gibt anderes Format zurück als `{devices:[]}` | Backend normalisiert alle bekannten Formate |
| Restart funktioniert nicht | AxeOS `restart` benötigt POST, kein GET | `fetch(url, { method: 'POST' })` |
| Pool-Push ändert nichts trotz Erfolg | NMMiner erwartet `stratum+tcp://` Prefix | `nmPoolUrl()` ergänzt fehlende Schemata automatisch |
| NMMiner-Config-Booleans werden ignoriert | Gerät erwartet `1`/`0`, nicht `true`/`false` | Alle booleschen Felder als Integer senden |

---

## Typische nächste Schritte / Erweiterungen

- Hashrate-Verlauf mit Chart.js + SQLite
- Weitere Geräteklassen (z.B. Antminer via LuCI-API)
- WebSocket für Echtzeit-Updates statt Polling
- HTTPS + Auth für externen Zugriff
- Per-Gerät AxeOS-Settings-Modal (Freq, Voltage, Fan, Hostname)
