# MyGenie CRM — PRD

## Original Problem Statement
Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git, branch 28-may. Wipe local /app, then pull the remote repo directly into /app. Tech stack: Python backend, React frontend, MongoDB database. Use remote MongoDB only: `mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie`. Do not use any local database. Do not call or modify the database unless explicitly required. Build the project as-is. Do not run a testing agent. Post deployment, read README and follow instructions, no code edits.

## Architecture
- **Backend**: FastAPI (Python) on port 8001
- **Frontend**: React 19 (CRA/craco) + Tailwind + Radix UI on port 3000
- **Database**: Remote MongoDB at 52.66.232.149:27017/mygenie
- **WhatsApp**: AuthKey.io integration (per-tenant keys in DB)
- **Preview URL**: https://c158ad1e-e16c-449c-b11f-8eaabb028c19.preview.emergentagent.com

## What's Been Implemented (2026-05-29)
- Cloned repo from GitHub (branch 28-may) into /app
- Created backend/.env with remote MongoDB connection
- Created frontend/.env with preview URL
- Installed Python dependencies (pip install -r requirements.txt)
- Installed frontend dependencies (yarn install)
- Both services running and healthy
- Frontend login page loading correctly
- Backend health endpoint responding

## Core Features (from existing codebase)
- Multi-tenant restaurant CRM
- Loyalty points system
- Coupon engine (V1-V3)
- WhatsApp automation (AuthKey.io)
- POS integration
- Customer feedback system
- Customer segments
- Analytics & PDF reports

## Primary Tenant
- R689 Kunafa Mahal (`pos_0001_restaurant_689`)

## Status
- **Deployment**: Complete, all services running
- **No code edits** per owner instructions

## Backlog / Next Items
- Per owner direction only — no modifications without explicit approval
- See memory/CR_STATUS_DASHBOARD.md for active CRs
