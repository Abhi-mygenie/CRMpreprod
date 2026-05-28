# MyGenie / DinePoints CRM - Setup Notes

## Source
- Repo: https://github.com/Abhi-mygenie/CRMpreprod.git
- Branch: 28-may (pulled as-is)

## Tech Stack
- Backend: FastAPI (Python), motor (async MongoDB)
- Frontend: React 19 + CRA/craco + Tailwind + Radix UI
- DB: Remote MongoDB at 52.66.232.149:27017/mygenie

## Environment
- /app/backend/.env: MONGO_URL (remote), DB_NAME=mygenie, CORS_ORIGINS=*
- /app/frontend/.env: REACT_APP_BACKEND_URL set to current preview URL

## Status (2026-05-28)
- Wiped /app and cloned remote repo (branch 28-may) into /app
- Installed Python deps via pip from requirements.txt
- Installed frontend deps via yarn
- Backend running on :8001, frontend on :3000 (supervisor managed)
- /api/health OK, /api/ root OK
- Remote MongoDB connected (19 collections detected)
- Login screen ("mygenie" branding) renders successfully

## Notes
- No local DB used. No DB modifications performed.
- Per user instructions, testing agent was NOT invoked.
- Build was completed as-is from the repo.
