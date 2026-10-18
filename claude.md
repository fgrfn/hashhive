# CLAUDE.md – HashHive Development Guide
<!-- Zuletzt aktualisiert: 2026-10-18 -->

## Projektübersicht

**HashHive** ist ein unified Mining-Dashboard für NMMiner, BitAxe und NerdAxe Geräte.

- **Backend:** Python 3.10+ / FastAPI / httpx / asyncio
- **Frontend:** React 19 / TypeScript / Vite / Zustand (app/); der Build landet in frontend/dist/
- **Persistenz:** JSON-Dateien (kein Datenbankserver nötig)
- **Port:** `http://localhost:8000`
- **API Base URL im Frontend:** `const API = window.location.origin` (dynamisch, kein hardcoded localhost)

---

## Projektstruktur

```
hashhive/
├── .github/
│   └── workflows/
│       └── ci.yml               # Backend/Frontend/Secrets; Docker-Publish auf main/dev/Tags
├── backend/
│   ├── main.py                  # FastAPI-App und Router-Registrierung
│   ├── core/                    # Konfiguration, Persistenz, Auth, Statistiken
│   ├── routers/                 # HTTP- und WebSocket-Endpunkte
│   ├── miners/                  # Geräteadapter
│   └── tests/                   # Backend-Tests
├── app/
│   └── src/                     # React-/TypeScript-Dashboard
├── frontend/dist/               # Generierte Frontend-Dateien (Build-Ausgabe)
├── version.txt                  # App-Version (Single Source of Truth)
├── release-please-config.json   # release-please Konfiguration
├── .release-please-manifest.json # Aktuelle Version für release-please
├── Dockerfile                   # Docker-Image (Backend + Frontend)
├── docker-compose.yml           # Docker Compose mit persistentem Volume
├── .dockerignore
├── setup.ps1                    # Setup-Skript Windows (inkl. Autostart-Option)
├── setup.sh                     # Setup-Skript Linux/macOS (inkl. systemd-Option)
├── claude.md                    # Diese Entwickleranleitung
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
| POST | `/api/settings` | Konfiguration speichern (loggt Eintrag) |
| GET | `/api/settings/backup` | Config als JSON-Datei herunterladen |
| POST | `/api/settings/restore` | Config aus JSON-Body wiederherstellen |
| PATCH | `/api/settings/device` | Per-Gerät Felder aktualisieren (name, temp_max) |
| GET | `/api/nmminer/swarm` | NMMiner Stats (alle Geräte via Master) |
| GET | `/api/nmminer/config` | NMMiner Pool-Config |
| POST | `/api/nmminer/broadcast-config` | Pool-Config an alle NMMiners pushen |
| GET | `/api/nmminer/device-config?ip={ip}` | Einzelne NMMiner-Gerätekonfiguration laden |
| POST | `/api/nmminer/device-config` | Einzelne NMMiner-Gerätekonfiguration speichern (loggt Eintrag) |
| GET | `/api/axeos/devices` | BitAxe / NerdAxe Stats (alle konfigurierten Geräte) |
| GET | `/api/axeos/info/{ip}` | Einzelne AxeOS-Geräteinfo |
| PATCH | `/api/axeos/config/all` | Pool-Config an alle AxeOS-Geräte pushen |
| PATCH | `/api/axeos/config/batch` | Freq/Voltage an ausgewählte AxeOS-Geräte pushen |
| POST | `/api/axeos/action/{ip}?action=` | Einzelaktion: pause / resume / restart / identify (loggt Eintrag) |
| POST | `/api/axeos/action/batch` | Batch-Aktion an mehrere Geräte |
| GET | `/api/axeos/scan` | Lokales /24-Subnet nach AxeOS-Geräten scannen |
| GET | `/api/alerts?days=N` | Log-Einträge (1–30 Tage) |
| GET | `/api/logs/dates` | Verfügbare Log-Datumsliste |
| POST | `/api/alerts/read-all` | Alle Alerts als gelesen markieren |
| DELETE | `/api/alerts` | Heutigen Log löschen |
| POST | `/api/log` | Manuellen Log-Eintrag persistent speichern |
| GET | `/api/health` | Backend-Healthcheck (uptime, device counts) |
| POST | `/api/notifications/test` | Test-Benachrichtigung senden |
| POST | `/api/weekly-summary/test` | Weekly Summary sofort auslösen |
| WebSocket | `/ws` | Push-Updates (Dashboard-Daten) |

### `/api/dashboard` Response-Schema

```json
{
  "nmminer": { "devices": [...], "_error": "optional falls Fehler" },
  "axeos":   { "devices": [...] },
  "unread_alerts": 3,
  "config": { ...dashboard_config.json... }
}
```

### `/api/nmminer/device-config` POST-Endpunkt
Das Backend versucht der Reihe nach:
1. `POST http://{master}/broadcast-config`
2. `POST http://{device_ip}/broadcast-config`
→ `POST /config` existiert nicht (gibt 404). Nur `broadcast-config` funktioniert.

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
  "offline_grace_minutes": 2,
  "alert_cooldown_minutes": 30,
  "thresholds": {
    "temp_max": 70,
    "vr_temp_max": 85,
    "hashrate_min": 0,
    "error_rate_max": 2.0,
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
  },
  "alert_types": {
    "offline": true,
    "online": true,
    "temp-high": true,
    "vr-temp-high": true,
    "hashrate-low": true,
    "error-rate-high": true,
    "fan-failure": true,
    "pool-lost": true,
    "pool-connected": false,
    "fallback-active": true,
    "fallback-recovered": false,
    "mining-paused": true,
    "device-rebooted": true,
    "new-best-diff": false,
    "block-found": true
  },
  "weekly_summary": {
    "enabled": false,
    "day": "monday",
    "time": "08:00"
  },
  "pool_presets": [
    {
      "name": "My Pool",
      "url": "stratum+tcp://pool.example.com:3333",
      "worker": "wallet.{suffix}",
      "password": "x",
      "fallback_url": "",
      "fallback_worker": "",
      "fallback_password": ""
    }
  ]
}
```

---

## Geräte-APIs

### NMMiner
Alle Anfragen laufen über die **Master-IP** (ein NMMiner fungiert als Swarm-Master).

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| GET | `http://{master}/swarm` | Alle Geräte-Stats |
| GET | `http://{master}/config` | Alle Konfigurationen (Response: `{"configs":[{"ip":"...","config":{...}}]}`) |
| GET | `http://{master}/config?ip={device_ip}` | Einzelne Gerätekonfiguration |
| POST | `http://{master}/broadcast-config` | Config pushen (einziger funktionierender Write-Endpunkt!) |
| POST | `http://{device_ip}/broadcast-config` | Config direkt ans Gerät pushen |

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

**Wichtig:** `SaveUptime`, `LedEnable`, `AutoBrightness` sind `1`/`0` integers (nicht `true`/`false`). `RotateScreen` ist `0` (0°) oder `2` (180°) — nur diese zwei Werte. `TimeFormat` ist `24` oder `12` (integer). Pool-URLs müssen das Schema enthalten: `stratum+tcp://host:port` — `nmPoolUrl()` im Frontend ergänzt fehlende Schemata automatisch.

**GET `/config` liefert booleans** (`"SaveUptime": true`), POST erwartet integers (`1`/`0`). Das Gerät akzeptiert beides.

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

Das Frontend ist eine React-19-/TypeScript-Anwendung mit Vite und Zustand. Der Quellcode liegt
unter app/src; app/package.json enthält die npm-Skripte. Für lokale Entwicklung:

```bash
cd app
npm ci
npm run dev
```

Der Vite-Entwicklungsserver leitet /api und /ws an das Backend auf localhost:8000 weiter.
Mit npm run lint, npm test und npm run build werden Linter, Tests und Produktionsbuild ausgeführt.
Der Build erzeugt frontend/dist; FastAPI liefert daraus die Startseite und Assets aus.

Die folgende detaillierte UI-Beschreibung bezieht sich auf die frühere Vanilla-Oberfläche und ist
nicht mehr maßgeblich. Für aktuelle Komponenten und Seiten app/src/App.tsx und app/src/pages/
verwenden.

### Dashboard – Stat-Cards
| Karte | Quelle |
|---|---|
| Total Hashrate | Summe aller online NMMiner + AxeOS GH/s, zeigt TH/s wenn ≥ 1000 |
| Devices Online | Online-Zähler aller Geräteklassen |
| Max. Temperature | Höchste Temperatur über alle Geräte |
| Open Alerts | `unread_alerts` aus `/api/dashboard` |

### Dashboard – Live Log
- Zeigt letzte 100 Log-Einträge (monospace, farbkodiert)
- **Schweregrade:** `critical` (rot), `warning` (gelb), `info` (blau), `ok` (grün)
- **Source-Badges:** `NM` (lila), `AX` (blau), `SYS` (grün) pro Eintrag
- **Tabs:** All / NMMiner / BitAxe\u200bNerdAxe / HashHive
- **🔍 Suchfeld:** Echtzeit-Filter über alle Einträge
- **📅 Load more:** Lädt bis zu 7 Tage History aus der Backend-Log-Datenbank nach
- Initialisierung: lädt letzte 40 Einträge aus `/api/alerts?days=1`
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
**Tabellenspalten:** ☐ | Name/IP | ASIC/Board | Type | Status | Hashrate (GH/s) | 1m Avg | Expected | Err % | Temp (°C) | VR Temp | Power (W) | Eff. (J/TH) | Voltage | Freq | Fan | Fan RPM | Fan 2 | Shares OK | Shares Err | **Share Acc%** | Best Diff | Session Best | Uptime | RSSI | Pool | Actions

**Bulk Bar** (erscheint wenn ≥1 Checkbox aktiv):
- Bulk Pause / Resume / Restart
- Bulk Freq/Voltage Modal (eigenes Fenster mit Freq + Voltage Inputs)

**Inline Rename:** Klick auf Gerätename → Inline-Input, Enter oder Blur speichert via `PATCH /api/settings/device`

**Status:** Online (grün) / Offline (rot) / Paused (rot dot, Text "Paused")

**Actions (nur wenn online) — alle via Backend-Proxy:**
- ⏸ Pause → `POST /api/axeos/action/{ip}?action=pause`
- ▶ Resume → `POST /api/axeos/action/{ip}?action=resume`
- ↺ Restart → `POST /api/axeos/action/{ip}?action=restart`
- 💡 ID → `POST /api/axeos/action/{ip}?action=identify` (LED blinkt, Firmware-abhängig)

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
| `renderDashboard(data)` | Rendert Stat-Cards + NMMiner + AxeOS Tabellen |
| `appendLog(severity, msg, source)` | Fügt Eintrag in Live-Log ein, capped bei 100 |
| `filterLiveLog(q)` | Filtert Live-Log nach Suchbegriff |
| `loadYesterdayLog()` | Lädt zusätzliche Tage History vom Backend (max 7) |
| `initLiveLog()` | Lädt letzte 40 Alert-History beim Start |
| `openNmEdit(ip)` | Öffnet Modal, lädt Device-Config |
| `saveNmEdit()` | Sendet Formular-Daten an `/api/nmminer/device-config` |
| `closeNmEdit()` | Schließt Modal |
| `loadNmPage()` | Lädt `/api/nmminer/swarm`, rendert Tabelle |
| `loadAxPage()` | Lädt `/api/axeos/devices`, rendert Tabelle |
| `pauseDevice(ip)` | `POST /api/axeos/action/{ip}?action=pause` (via Backend-Proxy) |
| `resumeDevice(ip)` | `POST /api/axeos/action/{ip}?action=resume` (via Backend-Proxy) |
| `restartDevice(ip)` | `POST /api/axeos/action/{ip}?action=restart` (via Backend-Proxy) |
| `identifyDevice(ip)` | `POST /api/axeos/action/{ip}?action=identify` (via Backend-Proxy) |
| `doBulkAction(action)` | Batch-Aktion für ausgewählte AxeOS-Geräte |
| `openBulkFreqModal()` | Bulk Freq/Voltage Modal öffnen |
| `renderPoolPresets()` | Preset-Chips rendern |
| `applyPoolPreset(i)` | Preset in Pool-Formular einfüllen |
| `savePoolPreset()` | Aktuelles Formular als Preset speichern |
| `deletePoolPreset(i)` | Preset löschen |
| `broadcastPool()` | Pusht Pool-Config an NMMiner + AxeOS |
| `fmtHr(v)` | Formatiert GH/s, zeigt TH/s wenn ≥ 1000 |
| `fmtUptime(s)` | Sekunden oder String (z.B. "2d 3h") → "Xh Ym" |
| `fmtTemp(v, max)` | Temperatur mit Farbklasse t-ok/t-warn/t-crit |
| `fmtShareAcc(ok, err)` | Share Acceptance Rate in % mit Farbkodierung |
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
| `offline` | critical | Gerät war online, ist jetzt nicht erreichbar (nach Grace-Period) |
| `online` | info | Gerät war offline, ist wieder erreichbar |
| `temp_high` | critical | Chip-Temperatur > `temp_max` Schwellenwert |
| `vr_temp_high` | critical | VR-Temperatur > `vr_temp_max` (AxeOS only) |
| `hashrate_low` | warning | Hashrate < `hashrate_min` (nur wenn > 0) |
| `error_rate_high` | warning | Hash-Fehlerrate > `error_rate_max` % (AxeOS only) |
| `fan_failure` | critical | Fan RPM = 0 (AxeOS only) |
| `pool_lost` | critical | Pool-URL war gesetzt, ist jetzt leer |
| `pool_connected` | info | Pool-Verbindung wiederhergestellt |
| `fallback_active` | warning | Primär-Pool ausgefallen, Fallback aktiv (AxeOS only) |
| `fallback_recovered` | info | Primär-Pool wiederhergestellt (AxeOS only) |
| `mining_paused` | warning | Mining wurde pausiert (AxeOS only) |
| `device_rebooted` | warning | Uptime-Reset erkannt (AxeOS only) |
| `new_best_diff` | info | Neue beste Difficulty (optional, default: aus) |
| `block_found` | critical | Difficulty ≥ Netzwerk-Difficulty 🏆 (AxeOS only) |

**Cooldown:** Alle Alerts (außer Zustandsänderungen) respektieren `alert_cooldown_minutes`.
**Grace-Period:** Offline-Alerts erst nach `offline_grace_minutes`.

### Alert-Schema
```json
{
  "id": "nmminer:10.0.0.1:offline:2026-04-05T...",
  "device": "nmminer:10.0.0.1",
  "kind": "offline",
  "severity": "critical",
  "message": "NMMiner 10.0.0.1 is offline",
  "timestamp": "2026-04-05T12:00:00+00:00",
  "read": false,
  "source": "nmminer"
}
```

**Eintrag-Arten im Log:** Alert-Events (von `alerts.py`), User-Actions (von `POST /api/log`), System-Events (Startup, Config-Speichern, Geräte-Aktionen)

### Daten-Pfad
`DATA_DIR` wird per Env-Variable `HASHHIVE_DATA_DIR` gesteuert (Standard: `backend/`-Verzeichnis).  
Docker setzt: `HASHHIVE_DATA_DIR=/app/backend/data`

---

## GitHub Actions

| Workflow | Datei | Trigger | Beschreibung |
|---|---|---|---|
| CI | `.github/workflows/ci.yml` | Push und Pull Request auf allen Branches | Backend-Lint/Tests, Frontend-Lint/Tests/Build und Secret-Scan |
| Docker/Release | `.github/workflows/ci.yml` | Push auf main, dev oder versionierte Tags | Baut und veröffentlicht Container-Image; Tags erzeugen außerdem ein GitHub Release |

### Historische Release-Please-Notiz (nicht mehr maßgeblich)

Der folgende Release-Please-Ablauf ist veraltet. Aktuelle CI- und Image-Publish-Trigger stehen in
`.github/workflows/ci.yml`.

| Prefix | Bump |
|---|---|
| `feat: ...` | Minor (`1.0.0 → 1.1.0`) |
| `fix: ...` | Patch (`1.0.0 → 1.0.1`) |
| `feat!: ...` oder `BREAKING CHANGE:` | Major (`1.0.0 → 2.0.0`) |
| `chore:`, `docs:`, `style:` | kein Release |

### Ablauf
```
git push (main)
  └► release-please.yml
        └► Release PR mit CHANGELOG.md + version.txt Bump

User merged Release PR
  └► Tag v1.x.x erstellt
        └► release.yml: Docker-Build → GHCR + GitHub Release
```

---

## Versionierung

**Single Source of Truth:** `version.txt` im Projekt-Root.

- `backend/main.py` liest `version.txt` beim Start: `APP_VERSION = (BASE_DIR.parent / "version.txt").read_text().strip()`
- FastAPI-App-Titel und `/api/health` Response verwenden `APP_VERSION`
- Die API gibt die von `backend/core/version.py` ermittelte Version unter `/api/health` zurück
- `Dockerfile` kopiert `version.txt` ins Image (`COPY version.txt ./`)
- Ein versionierter Git-Tag bestimmt die Release-Version; ohne Tag dient `version.txt` als Fallback

---

## Docker

### Starten

```bash
# Aus dem ghcr.io-Image starten (kein Build nötig)
docker run -d -p 8000:8000 \
  -v hashhive-data:/app/backend/data \
  ghcr.io/fgrfn/hashhive:latest

# Oder lokal bauen und starten
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
- Ein einziges Image enthält Backend (FastAPI) und die gebauten Dateien aus `/app/frontend/dist`
- Persistente Daten landen im Named Volume `hashhive-data` → `/app/backend/data`
- Pfad per Env-Variable: `HASHHIVE_DATA_DIR=/app/backend/data`
- Port in `docker-compose.yml` änderbar: `"8000:8000"` → z.B. `"9000:8000"`

---

## Entwicklungs-Tipps

- **API-Docs**: Swagger UI unter `http://localhost:8000/docs`
- **JSON-Dateien** werden beim ersten Start automatisch erstellt
- **Frontend lokal entwickeln**: Vite unter `app/` starten; produktiv liefert FastAPI `frontend/dist` aus
- **Backend normalisiert** alle NMMiner-Swarm-Formate zu `{devices: [...]}`

---

## Bekannte Fallstricke

| Problem | Ursache | Fix |
|---|---|---|
| „Failed to fetch" bei Zugriff via IP | `const API = 'http://localhost:8000'` hardcoded | `window.location.origin` verwenden |
| `NaNh NaNm` Uptime | NMMiner gibt String statt Sekunden zurück | `fmtUptime()` prüft `typeof s === 'string'` |
| `0.00` Hashrate | Falscher Feldname | Fallback-Kette `GHs5s → GHs5 → GHs1m → GHsav → hashrate → ...` |
| Dashboard zeigt „No NMMiner" obwohl NMMiner-Seite funktioniert | `/swarm` gibt anderes Format zurück als `{devices:[]}` | Backend normalisiert alle bekannten Formate |
| Restart/Pause/Resume/ID-Button: „Failed to fetch“ | Browser kann Gerät nicht direkt erreichen (CORS / Netz) | Alle Actions laufen über Backend-Proxy `/api/axeos/action/{ip}?action=` |
| Pool-Push ändert nichts trotz Erfolg | NMMiner erwartet `stratum+tcp://` Prefix | `nmPoolUrl()` ergänzt fehlende Schemata automatisch |
| NMMiner-Config-Booleans werden ignoriert | Gerät erwartet `1`/`0`, nicht `true`/`false` | Alle booleschen Felder als Integer senden |
| 💡 ID Button funktioniert nicht | Firmware unterstützt `/api/system/identify` nicht | Backend gibt 502, Gerät-Firmware aktualisieren |

---

## Typische nächste Schritte / Erweiterungen

- Hashrate-Verlauf mit Chart.js + SQLite
- Weitere Geräteklassen (z.B. Antminer via LuCI-API)
- HTTPS + Auth für externen Zugriff
- Per-Gerät AxeOS-Settings-Modal (Freq, Voltage, Fan, Hostname)
- Power Cost Tracker (Watt × kWh-Preis → Tages-/Monatskosten)
- Auto-Discover AxeOS-Geräte im lokalen /24-Subnetz (Endpunkt existiert bereits: `GET /api/axeos/scan`)
