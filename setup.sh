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
if ! python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'; then
    echo "✗  HashHive requires Python 3.10 or newer."
    exit 1
fi

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
"$PIP" install --quiet -r "$BACKEND_DIR/requirements.lock"
echo "✓  Dependencies installed."

# ── Build web frontend (React/Vite → frontend/dist) ────────────────────────────
# The backend serves the compiled dashboard from frontend/dist. Without this
# step the app only answers {"status": "... Frontend not found."}.
APP_DIR="$SCRIPT_DIR/app"
DIST_DIR="$SCRIPT_DIR/frontend/dist"

# Major version of the installed Node.js, or 0 if none/unusable.
node_major() {
    command -v node &>/dev/null && node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0
}

echo ""
echo "Building web frontend..."
if [ ! -d "$APP_DIR" ]; then
    echo "⚠  app/ directory not found – skipping frontend build."
else
    # HashHive's frontend (Vite) needs Node.js 20+. Install it if missing/too old.
    if [ "$(node_major)" -lt 20 ] || ! command -v npm &>/dev/null; then
        echo "Node.js 20+ not found – installing via NodeSource..."
        if command -v apt-get &>/dev/null; then
            command -v curl &>/dev/null || $APT install -y curl || true
            curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash - && $APT install -y nodejs || true
        else
            echo "⚠  Automatic Node.js install is only supported on apt-based systems."
        fi
    fi

    if [ "$(node_major)" -lt 20 ] || ! command -v npm &>/dev/null; then
        echo "⚠  Node.js 20+ still unavailable – the dashboard UI will NOT be built."
        echo "   Install Node.js 20+ manually, then run:  cd app && npm ci && npm run build"
    elif ( cd "$APP_DIR" && { npm ci || npm install; } && npm run build ) && [ -f "$DIST_DIR/index.html" ]; then
        echo "✓  Frontend built → frontend/dist  (Node $(node -v))"
    else
        echo "⚠  Frontend build failed – the dashboard UI won't be available."
        echo "   Fix Node/npm, then run:  cd app && npm ci && npm run build"
    fi
fi

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
