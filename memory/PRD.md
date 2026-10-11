# MyGenie CRM Pre-prod — PRD

## Original Problem Statement
Deploy the existing React frontend repo directly into `/app` and run it as-is, with no code edits.
Source: https://github.com/Abhi-mygenie/CRMpreprod.git (branch: main)

## Architecture
- **Frontend**: React (CRA + CRACO), running on port 3000 via supervisor
- **Backend**: FastAPI + APScheduler, running on port 8001 via supervisor
- **Database**: MongoDB at `52.66.232.149:27017` (mygenie db, external)
- **External APIs**: MyGenie preprod API, AuthKey SMS, Meta Graph API, AWS S3

## What Was Done (2025-10)
- Cloned repo from GitHub (main branch) into `/tmp/crm_inspect`
- Rsynced `frontend/` and `backend/` to `/app` (excluding `.env` files to preserve platform vars)
- Re-added platform package `@emergentbase/overlay` to `frontend/package.json` (platform requirement)
- Wrote `/app/backend/.env` with all provided env variables
- Kept `/app/frontend/.env` with existing preview URL + `WDS_SOCKET_PORT=443` + `ENABLE_HEALTH_CHECK=false`
- Ran `yarn install` (new packages resolved successfully)
- Ran `pip install -r requirements.txt` (APScheduler, openpyxl, qrcode, reportlab, httpx installed)
- Restarted both services via `supervisorctl restart backend frontend`
- Verified app loads at preview URL — MyGenie CRM login page visible

## Core Requirements (Static)
- No code edits to the cloned repo
- Platform files preserved (.env, @emergentbase/overlay)
- No cloning into /tmp or nested folders as final destination
- All env vars set as provided

## Environment
- Preview URL: https://mygenie-crm-preprod.preview.emergentagent.com
- Production URL (backend): https://crm.mygenie.online
- Frontend REACT_APP_BACKEND_URL → preview URL (platform-assigned)
- Backend REACT_APP_BACKEND_URL → https://crm.mygenie.online/api

## Backlog / P2
- Switch frontend REACT_APP_BACKEND_URL to point at local backend (port 8001) if the backend is intended to serve the API in this environment
- Set up campaign scheduler (CAMPAIGN_SCHEDULER_ENABLED=true) when ready
