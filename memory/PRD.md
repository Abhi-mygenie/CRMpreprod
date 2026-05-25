# CRM Preprod - PRD

## Original Problem Statement
Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git from 26-may branch, use remote MongoDB (mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie), build as-is without running testing agent.

## Architecture
- **Frontend**: React 19 with Craco, Tailwind CSS, Radix UI, Recharts, React Router v7
- **Backend**: FastAPI (Python) with Motor (async MongoDB driver), APScheduler
- **Database**: Remote MongoDB at 52.66.232.149 (DB: mygenie)
- **Auth**: JWT-based authentication

## What's Been Implemented (2026-05-25)
- Cloned 26-may branch from GitHub repo
- Copied all backend, frontend, memory, tests, test_reports files to /app
- Configured backend .env with remote MongoDB connection string (MONGO_URL, DB_NAME=mygenie)
- Installed all Python dependencies from requirements.txt
- Installed all frontend dependencies via yarn
- Both services running and verified (health check + frontend screenshot)

## Core Features (from codebase)
- Login/Register (JWT auth)
- Dashboard, Customer Management, Segments
- Loyalty Points, Wallet, Coupons (V1/V2/V3)
- Feedback, WhatsApp Automation, Templates
- QR Code, Item Analytics, Customer Lifecycle
- POS Integration, Migration tools
- Cron/Scheduler for daily loyalty jobs

## Prioritized Backlog
- P0: N/A (deployed as-is per request)
- P1: Any future feature requests from user
- P2: UI/UX improvements if needed

## Next Tasks
- Awaiting user instructions for any changes or features
