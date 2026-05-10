# ── Stage 1: Build React/Vite frontend ───────────────────────────────────────
FROM node:22-slim AS frontend-builder

# Mirror the repo layout so vite outDir (../frontend/dist) resolves correctly
WORKDIR /workspace/app

COPY app/package.json app/package-lock.json ./
RUN npm ci

COPY app/ ./
# npm run build = tsc -b && vite build → outputs to /workspace/frontend/dist
RUN npm run build

# ── Stage 2: Python backend ───────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Abhängigkeiten zuerst (Layer-Caching)
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Backend + Frontend (prototype/shared) + Vite dist + Version
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY --from=frontend-builder /workspace/frontend/dist ./frontend/dist/
COPY version.txt ./

# Make startup script executable
RUN chmod +x /app/backend/start.sh

WORKDIR /app/backend

# Port is configurable via PORT env var (default 8000)
EXPOSE 8000

CMD ["/app/backend/start.sh"]
