# Deployment Log — 2026-09-12

## Source
- Repo: https://github.com/Abhi-mygenie/customer-app5th-march
- Branch: main
- Commit: cb7a0fa22b8da9cebb6181a5b350cfe440565f86

## What Was Done
1. Cloned repo to /tmp/repo_clone (inspection only)
2. Backed up /app/.emergent/ to /tmp/backup/
3. Cleared /app (kept .git)
4. Rsync'd repo contents into /app (excluding .git)
5. Restored platform .emergent/ from backup
6. Created /app/backend/.env with production MongoDB + JWT + API credentials
7. Created /app/frontend/.env with all REACT_APP_* env vars
8. Installed Python dependencies: pip install -r /app/backend/requirements.txt
9. Installed Node dependencies: yarn install in /app/frontend
10. Restarted backend and frontend via supervisorctl

## Services Status
- Backend: RUNNING on port 8001 (FastAPI + uvicorn)
- Frontend: RUNNING on port 3000 (React + craco)
- MongoDB: Connected to external MongoDB at 52.66.232.149:27017 (mygenie DB)
- Health check: /api/healthz returns {"ok":true,"mongo":"up"}

## Environment
### Backend (.env)
- MONGO_URL: mongodb://mygenie_admin@52.66.232.149:27017/mygenie
- DB_NAME: mygenie
- MYGENIE_API_URL: https://preprod.mygenie.online/api/v1
- JWT_SECRET: set

### Frontend (.env)
- REACT_APP_BACKEND_URL: https://mygenie-customer-ui-1.preview.emergentagent.com
- REACT_APP_API_BASE_URL: https://preprod.mygenie.online/api/v1
- REACT_APP_IMAGE_BASE_URL: https://preprod.mygenie.online
- REACT_APP_GOOGLE_MAPS_API_KEY: set
- REACT_APP_CRM_URL: https://crm.mygenie.online/api
- REACT_APP_CRM_API_VERSION: v2
- REACT_APP_LOGIN_PHONE/PASSWORD: set

## Memory Dir Status
- Fully synced from repo (main branch)
- All change_requests/, v2/, master_outlet/, control/ dirs present
