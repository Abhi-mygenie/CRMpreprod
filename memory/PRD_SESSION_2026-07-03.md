# Customer App (MyGenie) — PRD

## Problem Statement
Pull the latest code from https://github.com/Abhi-mygenie/customer-app5th-march.git (branch `3-july`) directly into `/app`, and create the required `.env` files.

## Setup Done (2026-01)
- Cloned branch `3-july` (HEAD `666368c`) fresh into `/app`.
- Installed backend deps (`pip install -r backend/requirements.txt`).
- Installed frontend deps (`yarn install`).
- Created `/app/backend/.env` with MONGO_URL, DB_NAME, CORS_ORIGINS, JWT_SECRET (freshly generated 32-byte hex), MYGENIE_API_URL.
- Created `/app/frontend/.env` with REACT_APP_BACKEND_URL (preview), REACT_APP_API_BASE_URL, REACT_APP_IMAGE_BASE_URL, REACT_APP_CRM_URL, REACT_APP_CRM_API_VERSION, REACT_APP_GOOGLE_MAPS_API_KEY, REACT_APP_LOGIN_PHONE/PASSWORD, WDS_SOCKET_PORT, ENABLE_HEALTH_CHECK.
- Restarted supervisor; backend + frontend both RUNNING.
- Verified: `GET /api/` → `{"message":"Customer App API"}`; frontend UI loads (`18march` restaurant page).

## Tech Stack
- Backend: FastAPI + Motor/PyMongo → remote MongoDB (52.66.232.149:27017, db `mygenie`)
- Frontend: React 19 + CRA + CRACO (yarn)
- Ports: backend 8001, frontend 3000 (supervisor-managed)

## Next Action Items
- Rotate JWT_SECRET and MongoDB creds for production.
- Lock down CORS_ORIGINS (currently `*`).
- Remove `REACT_APP_LOGIN_PHONE/PASSWORD` from frontend bundle before prod.
- Restrict Google Maps API key to prod domain in GCP.
- Provision persistent volume for `/app/backend/uploads/`.

## Backlog / Future
- Fix `react-hooks/exhaustive-deps` ESLint warnings (see DEPLOYMENT_HANDOVER.md §4.3).
- Add proper `/api/health` endpoint.
