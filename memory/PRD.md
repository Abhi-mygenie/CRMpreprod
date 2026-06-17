# MyGenie CRM - PRD

## Original Problem Statement
- Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git branch `17-june`
- Wipe local /app and pull remote directly
- Use remote MongoDB: `mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie`
- Build as-is, no testing agent

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Radix UI + Recharts (CRA with craco)
- **Backend**: FastAPI (Python) with Motor (async MongoDB driver)
- **Database**: Remote MongoDB at `52.66.232.149:27017/mygenie`
- **Scheduler**: APScheduler for loyalty cron jobs and campaign processing

## What's Been Implemented (June 17, 2026)
- ✅ Cloned repo from `17-june` branch into /app
- ✅ Configured remote MongoDB connection
- ✅ Installed backend (pip) and frontend (yarn) dependencies
- ✅ Backend running on port 8001, Frontend on port 3000
- ✅ Health check verified: API responsive
- ✅ Frontend compiling and rendering login page

## Core Modules (from repo)
- Auth, Customers, Points, Wallet, Coupons, Feedback
- WhatsApp integration, POS, Migration, Analytics
- Scan, Menu, Suggestions, Invoices, Campaigns
- Loyalty jobs, Campaign scheduler

## Backlog / Next Steps
- P0: None (build-as-is complete)
- P1: User testing with actual credentials
- P2: Any feature additions as directed by user
