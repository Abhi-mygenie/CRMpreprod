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
- Installed all backend Python dependencies
- Installed all frontend Node.js dependencies (yarn)
- Both services running and healthy
- **Login flow investigation** completed — full trace documented at `/app/memory/crm/CRM_LATEST_BRANCH_LOGIN_FLOW_EXPLANATION.md`

## Key Modules
- Auth (MyGenie POS login + local user management)
- Customers, Points/Loyalty, Wallet, Coupons, Feedback
- WhatsApp integration, POS Gateway, Migration, Analytics, Scan, Cron/Scheduler

## Login Flow Summary
- `/api/auth/login` → delegates to `mygenie_login()`
- Calls MyGenie POS login + profile on every real login
- Creates local user + api_key + loyalty settings + templates on first login
- Updates mygenie_token + password_hash on subsequent logins
- Returns CRM JWT + pos_config (but frontend ignores pos_config)
- `restaurant-crm-token` push: NOT IMPLEMENTED (CR-001 PLANNED)

## Prioritized Backlog
### P0
- Implement CR-001: Push CRM token to MyGenie on first login
- Fix `api_base_url` — set `CRM_EXTERNAL_URL` in backend .env

### P1
- Add api_key backfill for existing users without one
- Multi-restaurant support (currently hardcoded to restaurants[0])

### P2
- Remove plaintext password storage in localStorage (Remember Me)
- Clean up unused pos_config from frontend login response handling

## Status
- Backend: RUNNING (health check passing)
- Frontend: RUNNING (webpack compiled with warnings only)
- Database: Connected to external MongoDB (mygenie)
