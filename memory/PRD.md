# MyGenie CRM - PRD

## Source
- Repo: https://github.com/Abhi-mygenie/CRMpreprod.git
- Branch: 8oct
- Deployed: 2026-10-08

## Architecture
- **Frontend**: React 19 + CRACO + Tailwind CSS, served on port 3000
- **Backend**: FastAPI + uvicorn on port 8001, multi-module routers
- **Database**: MongoDB at 52.66.232.149 (mygenie DB)

## What Was Done
- Cloned branch `8oct` from the CRMpreprod repo
- Replaced `/app/backend/` source (server.py, core/, models/, routers/, services/, templates/, migrations/) with repo content
- Replaced `/app/frontend/` source (src/, public/, plugins/, config files) with repo content
- Set backend `.env` with all provided variables (Mongo, JWT, AWS S3, AuthKey, Meta, etc.)
- Kept frontend `.env` REACT_APP_BACKEND_URL as pre-configured preview URL
- Installed Python dependencies via pip
- Installed Node dependencies via yarn
- Restarted backend + frontend via supervisorctl

## Backend Routers
analytics, auth, campaigns, coupons, cron, customers, feedback, invoices, menu, migration, points, pos, pos_coupons, pos_loyalty, pos_reports, scan, suggestions, wallet, whatsapp

## Frontend Pages
Dashboard, Login, Customers, CustomerDetail, CustomerLifecycle, CustomerRegistration, Campaigns, CampaignWizard, CampaignHistory, Audiences, Segments, Templates, TemplateBuilder, Coupons, CouponAnalytics, Wallet, Feedback, LoyaltySettings, MessageStatus, Migration, Profile, QRCode, Settings, ItemAnalytics

## Environment Variables Set
- MONGO_URL, DB_NAME (mygenie DB on 52.66.232.149)
- JWT_SECRET, FRONTEND_URL, CRM_EXTERNAL_URL
- AWS S3 (mygenie-prod bucket, ap-south-1)
- MYGENIE_API_URL (preprod.mygenie.online)
- AuthKey, Meta Graph API, Campaign scheduler settings
- POS request logging config

## Status
- Backend: RUNNING (APScheduler active, daily loyalty + campaign cron jobs registered)
- Frontend: RUNNING (webpack compiled with 1 warning — ESLint useEffect deps, non-blocking)
