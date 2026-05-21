# CRMpreprod — mygenie CRM (DinePoints Loyalty & CRM)

## Source
- Repo: https://github.com/Abhi-mygenie/CRMpreprod.git
- Branch: `21-may` (commit f09abb3 at pull time)
- Action: code wiped and overwritten in /app, services restarted

## Stack
- Backend: FastAPI (uvicorn @ :8001, /api prefix), APScheduler, motor/pymongo
- Frontend: React 19 + CRA/CRACO, Tailwind, Radix UI
- DB: Remote MongoDB at 52.66.232.149:27017 / db=`mygenie`

## Config
- backend/.env: MONGO_URL (remote), DB_NAME=mygenie, JWT_SECRET, CORS_ORIGINS=*
- frontend/.env: REACT_APP_BACKEND_URL=https://fb9eddd8-99d0-49e1-a5be-b1a2b12ee5a1.preview.emergentagent.com

## Status
- Backend RUNNING — /api/health returns 200 OK, connected to remote Mongo
- Frontend RUNNING — login page renders correctly (mygenie branding)
- Testing agent NOT invoked (per user instruction "dont run testing agent")

## Backlog
- Verify auth/login flow against remote DB users
- Validate POS/wallet/coupons/feedback/whatsapp/analytics modules end-to-end
