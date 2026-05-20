# CRM Preprod - PRD

## Original Problem Statement
Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git from 30-April branch. Use external MongoDB (mongodb://mygenie_admin:***@52.66.232.149:27017/mygenie). Build as-is without testing.

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Radix UI + Recharts (craco build)
- **Backend**: FastAPI (Python) with Motor (async MongoDB driver)
- **Database**: External MongoDB at 52.66.232.149:27017, DB: mygenie
- **Branch**: 30-April (commit 7c1d280)

## What's Been Implemented (2026-05-20)
- Cloned repo from `30-April` branch
- Configured backend .env with external MongoDB connection
- Installed all backend Python dependencies + frontend Node.js dependencies
- Both services running and healthy
- **Login flow investigation** → `/app/memory/crm/CRM_LATEST_BRANCH_LOGIN_FLOW_EXPLANATION.md`
- **CR-001 implementation plan** → `/app/memory/crm/CR_001_RESTAURANT_CRM_TOKEN_PUSH_IMPLEMENTATION_PLAN.md`

## Key Modules
- Auth (MyGenie POS login + local user management)
- Customers, Points/Loyalty, Wallet, Coupons, Feedback
- WhatsApp integration, POS Gateway, Migration, Analytics, Scan, Cron/Scheduler

## Prioritized Backlog
### P0
- **CR-001: Push CRM token to MyGenie on login** — Plan ready, awaiting owner approval
- Fix `api_base_url` — set `CRM_EXTERNAL_URL` in backend .env

### P1
- Multi-restaurant support (currently hardcoded to restaurants[0])

### P2
- Remove plaintext password storage in localStorage (Remember Me)
- Clean up unused pos_config from frontend login response handling

## Status
- Backend: RUNNING
- Frontend: RUNNING
- Database: Connected to external MongoDB (mygenie)
- CR-001: PLANNED → implementation_plan_ready_for_owner_approval
