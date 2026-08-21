# HR Copilot

Next.js UI (`frontend/`, port 3001) plus a FastAPI backend (`backend/`, port 8000).

- **Landing:** `/`
- **App / chat:** `/chat`
- **Intake** (with page chatbot): sidebar → Intake
- **Checklist:** sidebar → Checklist

Setup: [BOOTUP.md](BOOTUP.md).  
Merging this UI into another backend: [EXPORT.md](EXPORT.md).

Secrets stay in `backend/.env` and `frontend/.env.local` (see `.env.example` files). Never commit those files.
