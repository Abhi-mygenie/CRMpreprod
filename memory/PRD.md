# MyGenie CRM - PRD

## Original Problem Statement
Deploy the existing React+FastAPI CRM repo from GitHub (Abhi-mygenie/CRMpreprod, branch: 7oct) directly into /app and run it as-is, with no code edits.

## Architecture
- **Frontend**: React 19, Craco, TailwindCSS, Radix UI, react-router-dom v7
- **Backend**: FastAPI + Motor (async MongoDB), APScheduler, JWT auth
- **Database**: Remote MongoDB at 52.66.232.149 (mygenie DB)
- **External APIs**: MyGenie preprod API, AuthKey WhatsApp, Meta Graph API, AWS S3

## What's Been Implemented (2026-10-07)
- Cloned branch `7oct` from https://github.com/Abhi-mygenie/CRMpreprod.git
- Synced backend/ and frontend/ into /app (excluding .env files)
- Updated /app/backend/.env with all production env variables
- Installed missing Python packages: APScheduler, Jinja2, openpyxl, qrcode, reportlab, httpx
- Ran `yarn install` for frontend dependencies
- Restarted supervisor — both backend (port 8001) and frontend (port 3000) RUNNING

## Core Features (from repo)
- Login / Auth (JWT via MyGenie preprod API)
- Dashboard, Customers, Campaigns, Coupons, Templates
- WhatsApp messaging (AuthKey + Meta Graph API)
- Loyalty & Points, Wallet, Feedback, QR Codes
- POS integration, Analytics, Invoices
- Campaign scheduling (APScheduler)
- AWS S3 media uploads

## Environment
- Backend .env: All keys set (MongoDB, JWT, AWS S3, Meta, AuthKey, MyGenie API)
- Frontend .env: REACT_APP_BACKEND_URL = platform preview URL (proxy to backend)

## Backlog / Next Steps
- P0: Verify login with real credentials against preprod.mygenie.online
- P1: Test campaign scheduler, WhatsApp send flow end-to-end
- P2: Production deploy to crm.mygenie.online
