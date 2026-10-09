# MyGenie Customer App — Pull & Run

## Original Problem Statement
Pull the existing MyGenie customer app repo from GitHub (branch `main`), install deps, wire env vars, and get both backend (FastAPI, :8001) and frontend (React+CRACO, :3000) running on this Emergent container.

## Architecture
- Backend: FastAPI single-file (`/app/backend/server.py`, ~1791 lines, 38 API routes under `/api`)
- Frontend: React 19 + CRACO + Tailwind + shadcn (yarn)
- Database: Remote MongoDB @ `52.66.232.149:27017/mygenie`
- Managed by supervisor (backend + frontend + mongodb)

## Repo pulled
- Source: https://github.com/Abhi-mygenie/customer-app5th-march.git (branch: main, public)
- Cloned into /tmp/customer-app then copied into /app/backend + /app/frontend

## Env Configuration
### Backend `/app/backend/.env`
- MONGO_URL (remote MyGenie preprod)
- DB_NAME=mygenie
- JWT_SECRET (fresh 32-byte hex via openssl rand -hex 32)
- MYGENIE_API_URL=https://preprod.mygenie.online/api/v1
- MYGENIE_POS_LOGIN_PHONE / MYGENIE_POS_LOGIN_PASSWORD (from handover doc — user said "will put in env later")
- CORS_ORIGINS=*

### Frontend `/app/frontend/.env`
- REACT_APP_BACKEND_URL=<external emergent preview URL> (kept for K8s ingress /api routing)
- REACT_APP_API_BASE_URL, REACT_APP_IMAGE_BASE_URL, REACT_APP_CRM_URL, REACT_APP_CRM_API_VERSION
- REACT_APP_CRM_API_KEY={"478":"REPLACE_ME"} (placeholder — user to supply)
- REACT_APP_LOGIN_PHONE / REACT_APP_LOGIN_PASSWORD / REACT_APP_GOOGLE_MAPS_API_KEY

## Status (2026-02)
- Backend: RUNNING on :8001 — `/api/` returns 200 `{"message":"Customer App API"}`
- Frontend: RUNNING on :3000 — page title "MyGenie", landing page renders (phone/name form + Browse Menu)
- MongoDB: connected (no errors in backend log; app boot passed all fail-fast env checks)

## Next Action Items
- P0: User to replace placeholder `REACT_APP_CRM_API_KEY` JSON with real per-restaurant keys → CRM features currently non-functional
- P0: User to verify `MYGENIE_POS_LOGIN_PHONE/PASSWORD` are current (used defaults from prior handover doc)
- P1: Add proper `/api/health` endpoint for k8s probes (currently only `/api/` acts as health)
- P1: Restrict CORS_ORIGINS from `*` before production
- P2: End-to-end functional test of login/OTP + menu-browse flow with real POS creds
