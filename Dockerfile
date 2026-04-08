FROM python:3.12-slim

WORKDIR /app

# Abhängigkeiten zuerst (Layer-Caching)
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Backend + Frontend + Version kopieren
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY version.txt ./

WORKDIR /app/backend

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
