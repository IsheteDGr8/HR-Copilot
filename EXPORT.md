# Export map — merge this UI into the advanced backend repo

Copy **frontend** pages and contracts below. Do **not** copy this repo’s `backend/` or `hr-skills/` unless you explicitly want those files; the destination already has a stronger AI backend.

## Copy these first

### Landing (`/`)
- `frontend/src/app/page.tsx`
- `frontend/src/components/landing-page.tsx`
- `frontend/src/lib/landing-content.ts`
- `frontend/src/components/agent-avatar.tsx`

### Intake + mini-chatbot
- `frontend/src/components/pages/intake-page.tsx`
- `frontend/src/components/pages/intake-cluster-detail.tsx`
- `frontend/src/components/pages/ai-summary-panel.tsx`
- `frontend/src/components/intake-bits.tsx`
- `frontend/src/lib/intake-api.ts`
- `frontend/src/lib/intake-data.ts`
- `frontend/src/app/api/ai-summary/route.ts`

Intake tickets expect `GET/PATCH /api/v1/intake/tickets`. The floating chatbot posts to Next `POST /api/ai-summary` (needs `OPENAI_API_KEY` + `OPENAI_BASE_URL` in `frontend/.env.local`). Ticket cards must keep `data-intake-id={item.id}` so the chatbot can highlight `IN-####` ids.

### Checklist
- `frontend/src/components/pages/onboarding-dashboard-page.tsx`
- Shell wiring: `frontend/src/components/app-shell.tsx`, `frontend/src/lib/navigation.tsx` (`"onboarding-dashboard"`), `frontend/src/components/app-sidebar.tsx`

Checklist expects `GET /api/v1/onboarding/checklist` → `{ employees: [{ employeeId, name, role, department, hireDate, done[], pending[] }] }` with `Authorization: Bearer …` (dev accepts `mock-jwt-token`).

If the destination backend does not already expose that list route, port:
- `backend/api/v1/onboarding.py` (`GET /checklist`)
- `backend/tools/azure_cosmos.py` (`list_onboarding_checklists`)

### Shared UI the pages import
- `frontend/src/components/management/shared.tsx`
- `frontend/src/lib/utils.ts`
- Theme/tokens in `frontend/src/app/globals.css` and `frontend/src/app/layout.tsx`

## Keep in this repo, skip on merge

- `backend/` (except the onboarding list helper if the other API lacks it)
- `hr-skills/`
- `terraform/`
- `docs/` PDFs and `hr_copilot_master_roadmap.md`

## Local run (this repo)

See `BOOTUP.md`. Frontend is `:3001`; backend is `:8000`; Next rewrites `/api/v1/*` → FastAPI.
