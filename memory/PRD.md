# DinePoints / mygenie CRM — PRD

## Original Problem Statement
Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git, branch `28-may`. Wipe local /app first, then pull the remote repo directly into /app (public repo).
Tech stack: Python (FastAPI) backend, React frontend, MongoDB.
Use remote MongoDB only: `mongodb://mygenie_admin:****@52.66.232.149:27017/mygenie`.
Do not use any local database. Do not modify the database unless explicitly required.
Build the project as-is. Do not run a testing agent.

## Architecture
- Backend: FastAPI (`/app/backend/server.py`) with routers under `/app/backend/routers/` (auth, customers, coupons, points, wallet, menu, pos, scan, analytics, feedback, suggestions, whatsapp, cron, migration).
- Frontend: React (CRA + craco), pages under `/app/frontend/src/pages/`.
- DB: Remote MongoDB at `52.66.232.149:27017` / db `mygenie` (read-only by default per user instruction).
- Supervisor manages `backend` (uvicorn :8001) and `frontend` (CRA :3000). Ingress routes `/api/*` → backend.

## Environment Config
- `/app/backend/.env`
  - `MONGO_URL="mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie?authSource=mygenie"`
  - `DB_NAME="mygenie"`
  - `CORS_ORIGINS="*"`
- `/app/frontend/.env`
  - `REACT_APP_BACKEND_URL=https://a28cb9e3-2ed4-46d3-b9be-e6ab5f64fc70.preview.emergentagent.com`
  - `WDS_SOCKET_PORT=443`

## Status (as of 2026-05-28)
- /app wiped and replaced with repo contents from branch `28-may`.
- Python deps installed via `pip install -r backend/requirements.txt`.
- Frontend deps installed via `yarn install`.
- Backend running on :8001 — `/api/` returns `{"message":"DinePoints API - Loyalty & CRM for Restaurants"}` (HTTP 200).
- Frontend running on :3000 — preview URL loads the mygenie sign-in page.
- Remote MongoDB configured via env vars; no local Mongo used.

## Backlog / Next Action Items
- Verify auth and feature flows against remote DB if/when user approves.
- Per user instruction: no testing agent executed and no DB writes performed.
