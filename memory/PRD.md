# DinePoints / MyGenie CRM

## Problem statement
Pull `https://github.com/Abhi-mygenie/CRMpreprod.git` (branch `28-may`) into `/app`. Build as-is. Use remote MongoDB only.

## Stack
- Backend: FastAPI (Python 3.11) — `/app/backend`
- Frontend: React 19 (CRA + craco) — `/app/frontend`
- DB: Remote MongoDB `mongodb://mygenie_admin:***@52.66.232.149:27017/mygenie` (DB name: `mygenie`)

## Setup performed (2026-05-28)
- Wiped `/app`, cloned repo branch `28-may` into `/app`.
- Created `/app/backend/.env` with `MONGO_URL`, `DB_NAME=mygenie`, `CORS_ORIGINS=*`, `JWT_SECRET`.
- Created `/app/frontend/.env` with `REACT_APP_BACKEND_URL` (preview URL) and `WDS_SOCKET_PORT=443`.
- Installed Python deps from `backend/requirements.txt`, frontend deps via `yarn install`.
- Verified remote Mongo reachability (15+ collections present: orders, customers, users, coupons, etc.).
- Restarted supervisor; backend `/api/health` returns healthy; frontend serves the MyGenie login page.

## Constraint
Do NOT call/modify the remote database unless explicitly approved.

## Not done (per user)
- No testing agent run.
- No feature/code changes.
