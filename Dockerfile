FROM python:3.12-slim

WORKDIR /app

# Abhängigkeiten zuerst (Layer-Caching)
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Backend + Frontend + Version kopieren
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY version.txt ./

# Make startup script executable
RUN chmod +x /app/backend/start.sh

WORKDIR /app/backend

# Port is configurable via PORT env var (default 8000)
EXPOSE 8000

CMD ["/app/backend/start.sh"]
