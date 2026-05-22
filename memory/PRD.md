# CRM Preprod (mygenie / DinePoints) — Setup Log

## Original Problem Statement
1. Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git (branch: 22-may), copy all folders into /app directly.
2. Use MongoDB: `mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie`.
3. Build as-is. Do not run testing agent.

## What was done (2026-05-22)
- Cloned `22-may` branch into /tmp/crm_repo and copied backend/, frontend/, memory/, tests/, test_reports/, test_result.md, README.md, .gitignore into /app (preserved /app/.git and /app/.emergent).
- Created `/app/backend/.env` with:
  - MONGO_URL=mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie
  - DB_NAME=mygenie
  - CORS_ORIGINS=*
  - JWT_SECRET=dinepoints-secret-key-2024
- Created `/app/frontend/.env` with REACT_APP_BACKEND_URL pointing to the preview URL.
- Installed Python deps via `pip install -r backend/requirements.txt` and frontend deps via `yarn install`.
- Restarted supervisor (backend, frontend) — both RUNNING.
- Verified `/api/health` returns healthy and login page renders.

## Stack
- Backend: FastAPI (uvicorn on :8001), Motor/PyMongo, APScheduler. App: "DinePoints - Loyalty & CRM".
- Frontend: React 19 + CRACO + Tailwind + Radix UI + Capacitor.
- DB: Remote MongoDB at 52.66.232.149:27017 (db=mygenie).

## Notes / Backlog
- Testing agent was intentionally skipped per user request.
- ESLint warnings present in several pages (missing useEffect deps) — non-blocking.
- VisualEdits overlay file missing inside node_modules; non-blocking warning only.

