#!/usr/bin/env bash
# HashHive Setup-Skript für Linux / macOS
set -e

echo ""
echo "══════════════════════════════════"
echo "      HashHive Setup (Linux)      "
echo "══════════════════════════════════"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
VENV_DIR="$SCRIPT_DIR/.venv"

# ── Python prüfen ─────────────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
    echo "✗  Python3 nicht gefunden. Bitte Python 3.10+ installieren."
    exit 1
fi

echo "✓  $(python3 --version)"

# ── python3-venv sicherstellen ────────────────────────────────────────────────
if ! python3 -m ensurepip --version &>/dev/null; then
    echo "python3-venv / ensurepip nicht gefunden – installiere via apt..."
    sudo apt-get update -qq
    sudo apt-get install -y "python3-venv" "python3.$(python3 -c 'import sys; print(sys.version_info.minor)')-venv" 2>/dev/null || \
    sudo apt-get install -y python3-venv
fi

# ── Virtualenv erstellen / wiederverwenden ────────────────────────────────────
if [ ! -d "$VENV_DIR" ]; then
    echo "Erstelle virtualenv in .venv ..."
    python3 -m venv "$VENV_DIR"
fi
PIP="$VENV_DIR/bin/pip"
UVICORN="$VENV_DIR/bin/uvicorn"

# ── Abhängigkeiten installieren ───────────────────────────────────────────────
echo ""
echo "Installiere Abhängigkeiten..."
"$PIP" install --quiet --upgrade pip
"$PIP" install --quiet -r "$BACKEND_DIR/requirements.txt"
echo "✓  Abhängigkeiten installiert."

# ── Autostart abfragen ────────────────────────────────────────────────────────
echo ""
read -rp "Autostart als systemd-Service aktivieren? [j/N] " answer

if [[ "$answer" =~ ^[jJyY] ]]; then
    USER_NAME="$(whoami)"
    SERVICE_FILE="/etc/systemd/system/hashhive.service"

    SERVICE_CONTENT="[Unit]
Description=HashHive Mining Dashboard
After=network.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$BACKEND_DIR
ExecStart=$UVICORN main:app --host 0.0.0.0 --port 8000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target"

    echo "$SERVICE_CONTENT" | sudo tee "$SERVICE_FILE" > /dev/null
    sudo systemctl daemon-reload
    sudo systemctl enable hashhive

    echo "✓  systemd-Service 'hashhive' aktiviert (startet beim Booten)."

    read -rp "Jetzt starten? [j/N] " startNow
    if [[ "$startNow" =~ ^[jJyY] ]]; then
        sudo systemctl start hashhive
        echo "✓  HashHive gestartet."
        echo "   Status: sudo systemctl status hashhive"
        echo "   Logs:   sudo journalctl -u hashhive -f"
    fi
else
    echo "  Kein Autostart eingerichtet."
fi

# ── Fertig ────────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════"
echo " Manuell starten:"
echo "   cd backend"
echo "   ../.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
echo ""
echo " Dashboard: http://localhost:8000"
echo " API-Docs:  http://localhost:8000/docs"
echo "══════════════════════════════════════════════════════════════"
echo ""
