#!/usr/bin/env bash
# HashHive Setup script for Linux / macOS
set -e

# Use sudo only when not running as root
if [ "$(id -u)" -eq 0 ]; then
    APT="apt-get"
    SUDO=""
else
    APT="sudo apt-get"
    SUDO="sudo"
fi

echo ""
echo "══════════════════════════════════"
echo "      HashHive Setup (Linux)      "
echo "══════════════════════════════════"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
VENV_DIR="$SCRIPT_DIR/.venv"

# ── Check Python ─────────────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
    echo "✗  Python3 not found. Please install Python 3.10+."
    exit 1
fi

echo "✓  $(python3 --version)"

# ── Ensure python3-venv ──────────────────────────────────────────────────────
if ! python3 -m ensurepip --version &>/dev/null; then
    echo "python3-venv not found – installing via apt..."
    $APT update -qq
    $APT install -y "python3-venv" "python3.$(python3 -c 'import sys; print(sys.version_info.minor)')-venv" 2>/dev/null || \
    $APT install -y python3-venv
fi

# ── Create / reuse virtualenv ────────────────────────────────────────────────
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtualenv in .venv ..."
    python3 -m venv "$VENV_DIR"
fi
PIP="$VENV_DIR/bin/pip"
UVICORN="$VENV_DIR/bin/uvicorn"

# ── Install dependencies ─────────────────────────────────────────────────────
echo ""
echo "Installing dependencies..."
"$PIP" install --quiet --upgrade pip
"$PIP" install --quiet -r "$BACKEND_DIR/requirements.txt"
echo "✓  Dependencies installed."

# ── Autostart ────────────────────────────────────────────────────────────────
echo ""
read -rp "Enable autostart as systemd service? [y/N] " answer

# ── HTTPS option ─────────────────────────────────────────────────────────────
echo ""
read -rp "Enable HTTPS? (self-signed certificate will be generated) [y/N] " https_answer

SSL_ARGS=""
PROTOCOL="http"
PORT=8000
CERT_DIR="$SCRIPT_DIR/backend/data/ssl"

if [[ "$https_answer" =~ ^[jJyY] ]]; then
    read -rp "Port for HTTPS [8443]: " https_port
    PORT="${https_port:-8443}"

    CERT_FILE="$CERT_DIR/cert.pem"
    KEY_FILE="$CERT_DIR/key.pem"

    if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
        echo "Generating self-signed certificate …"
        mkdir -p "$CERT_DIR"
        "$VENV_DIR/bin/python" "$BACKEND_DIR/gen_cert.py" "$CERT_FILE" "$KEY_FILE"
    else
        echo "✓  Reusing existing certificate in $CERT_DIR"
    fi

    SSL_ARGS="--ssl-certfile $CERT_FILE --ssl-keyfile $KEY_FILE"
    PROTOCOL="https"
    echo "✓  HTTPS configured (port $PORT)."
else
    read -rp "Port [8000]: " http_port
    PORT="${http_port:-8000}"
fi

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
ExecStart=$UVICORN main:app --host 0.0.0.0 --port $PORT $SSL_ARGS
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target"

    echo "$SERVICE_CONTENT" | $SUDO tee "$SERVICE_FILE" > /dev/null
    SYSTEMCTL="$(command -v systemctl)"
    $SUDO $SYSTEMCTL daemon-reload
    $SUDO $SYSTEMCTL enable hashhive

    echo "✓  systemd service 'hashhive' enabled (starts on boot)."

    read -rp "Start now? [y/N] " startNow
    if [[ "$startNow" =~ ^[jJyY] ]]; then
        $SUDO $SYSTEMCTL start hashhive
        echo "✓  HashHive started."
        echo "   Status: systemctl status hashhive"
        echo "   Logs:   journalctl -u hashhive -f"
    fi
else
    echo "  No autostart configured."
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════"
echo " Start manually:"
echo "   cd backend"
if [ -n "$SSL_ARGS" ]; then
echo "   ../.venv/bin/uvicorn main:app --host 0.0.0.0 --port $PORT $SSL_ARGS"
else
echo "   ../.venv/bin/uvicorn main:app --host 0.0.0.0 --port $PORT"
fi
echo ""
echo " Dashboard: $PROTOCOL://localhost:$PORT"
echo " API-Docs:  $PROTOCOL://localhost:$PORT/docs"
if [[ "$https_answer" =~ ^[jJyY] ]]; then
echo ""
echo " NOTE: Self-signed cert – import $CERT_FILE into your browser/OS"
echo "       trust store to remove the security warning."
fi
echo "══════════════════════════════════════════════════════════════"
echo ""
