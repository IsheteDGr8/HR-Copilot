# HR Copilot — Boot Up Instructions

Run the **backend** (FastAPI on `:8000`) and the **frontend** (Next.js on `:3000`) in two separate terminals. The frontend proxies `/api/v1/*` to the backend.

## Prerequisites

- Node.js 18+ and npm
- Python 3.11+
- A filled-in `backend/.env` (see below)

## 1. Backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
# source .venv/bin/activate

pip install -r requirements.txt
python main.py
```

Backend should be available at:

- API: http://localhost:8000
- Health: http://localhost:8000/health
- Chat SSE: `POST http://localhost:8000/api/v1/chat/stream?message=...`

### Backend `.env`

Create `backend/.env` with at least:

```env
# LLM — Azure AI Foundry / OpenAI-compatible (preferred)
LLM_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.2
OPENAI_BASE_URL=https://<your-foundry-resource>.services.ai.azure.com/openai/v1

# Cosmos DB (onboarding / documents tools)
COSMOS_CONNECTION_STRING=...

# Optional Azure AI Search (policy search)
SEARCH_ENDPOINT=...
SEARCH_INDEX_NAME=...
SEARCH_KEY=...

# Optional
USE_MOCK_AZURE=true
```

> Gemini is no longer the default. Legacy `LLM_MODEL=gemini/...` + `GEMINI_API_KEY` still works if you set those instead of the OpenAI vars.

## 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

Chat messages stream from the FastAPI SSE endpoint via the Next.js rewrite (`/api/v1/*` → `http://localhost:8000/api/v1/*`).

## Quick check

1. Backend health returns `{"status":"healthy"}`.
2. Frontend loads at http://localhost:3000.
3. Send a chat message — the assistant bubble should stream tokens live.
4. Tool results (employee profile, PTO, email draft) should open the Side Canvas.

## Common issues

| Symptom | Likely cause |
|---|---|
| Chat errors / failed stream | Backend not running on `:8000`, or missing JWT/`Authorization` |
| Import / Cosmos / Search errors on tool calls | Missing or invalid `backend/.env` values |
| Frontend proxy 500s | Backend crashed; check the backend terminal traceback |
| Port already in use | Stop the other process on `3000` or `8000`, then restart |
