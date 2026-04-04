# CLAUDE.md – HashHive Development Guide

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
- Docker-Compose für einfaches Deployment
- WebSocket für Echtzeit-Updates statt Polling
- HTTPS + Auth für externen Zugriff
