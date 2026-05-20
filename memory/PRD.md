# CRM Preprod - PRD

## Original Problem Statement
Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git from 30-April branch. Use external MongoDB (mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie). Build as-is without testing.

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Radix UI + Recharts (craco build)
- **Backend**: FastAPI (Python) with Motor (async MongoDB driver)
- **Database**: External MongoDB at 52.66.232.149:27017, DB: mygenie
- **Branch**: 30-April (commit 7c1d280)

## What's Been Implemented (2026-05-20)
- Cloned repo from `30-April` branch
- Configured backend .env with external MongoDB connection
- Installed all backend Python dependencies
- Installed all frontend Node.js dependencies (yarn)
- Both services running and healthy

## Key Modules
- Auth, Customers, Points/Loyalty, Wallet, Coupons, Feedback, WhatsApp, POS, Migration, Analytics, Scan, Cron/Scheduler

## Status
- Backend: RUNNING (health check passing)
- Frontend: RUNNING (webpack compiled with warnings only)
- Database: Connected to external MongoDB (mygenie)
