# HashHive

Unified Mining-Dashboard für NMMiner, BitAxe und NerdAxe.

## Setup

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Dashboard öffnen: **http://localhost:8000**

API-Docs: **http://localhost:8000/docs**

## Stack

- Backend: Python / FastAPI / httpx
- Frontend: Vanilla HTML + CSS + JS (single file, kein Build-Step)
- Persistenz: JSON-Dateien (kein Datenbankserver)

