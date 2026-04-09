#!/usr/bin/env bash
# HashHive startup script – handles HTTP and HTTPS modes.
#
# Environment variables:
#   SSL_SELFSIGNED=true          Auto-generate a self-signed certificate (stored in DATA_DIR/ssl/).
#   SSL_CERT_FILE=/path/cert.pem  Path to an existing PEM certificate file.
#   SSL_KEY_FILE=/path/key.pem    Path to the matching private key file.
#   PORT=8000                     TCP port to listen on (default: 8000).
#   HASHHIVE_DATA_DIR=…           Data directory (used for storing generated certs).

set -e

PORT="${PORT:-8000}"
DATA_DIR="${HASHHIVE_DATA_DIR:-/app/backend/data}"
SSL_ARGS=()

CERT_FILE="${SSL_CERT_FILE:-}"
KEY_FILE="${SSL_KEY_FILE:-}"

# ── Auto-generate self-signed cert ───────────────────────────────────────────
if [ "${SSL_SELFSIGNED:-false}" = "true" ] && [ -z "$CERT_FILE" ]; then
    SSL_DIR="$DATA_DIR/ssl"
    CERT_FILE="$SSL_DIR/cert.pem"
    KEY_FILE="$SSL_DIR/key.pem"

    if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
        mkdir -p "$SSL_DIR"
        echo "[HashHive] Generating self-signed certificate …"
        python3 /app/backend/gen_cert.py "$CERT_FILE" "$KEY_FILE"
    else
        echo "[HashHive] Reusing existing self-signed certificate from $SSL_DIR"
    fi
fi

# ── Build uvicorn SSL arguments ───────────────────────────────────────────────
if [ -n "$CERT_FILE" ] && [ -n "$KEY_FILE" ]; then
    if [ ! -f "$CERT_FILE" ]; then
        echo "[HashHive] ERROR: SSL_CERT_FILE not found: $CERT_FILE" >&2
        exit 1
    fi
    if [ ! -f "$KEY_FILE" ]; then
        echo "[HashHive] ERROR: SSL_KEY_FILE not found: $KEY_FILE" >&2
        exit 1
    fi
    SSL_ARGS=(--ssl-certfile "$CERT_FILE" --ssl-keyfile "$KEY_FILE")
    echo "[HashHive] HTTPS enabled on port $PORT"
    echo "[HashHive] Certificate: $CERT_FILE"
else
    echo "[HashHive] HTTP mode on port $PORT (set SSL_SELFSIGNED=true for HTTPS)"
fi

# ── Start uvicorn ─────────────────────────────────────────────────────────────
exec uvicorn main:app \
    --host 0.0.0.0 \
    --port "$PORT" \
    "${SSL_ARGS[@]}"
