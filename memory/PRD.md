# CRM Preprod - PRD

## Original Problem Statement
Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git from 30-April branch. Use external MongoDB (mongodb://mygenie_admin:***@52.66.232.149:27017/mygenie). Build as-is without testing.

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Radix UI + Recharts (craco build)
- **Backend**: FastAPI (Python) with Motor (async MongoDB driver)
- **Database**: External MongoDB at 52.66.232.149:27017, DB: mygenie
- **Branch**: 30-April (commit 7c1d280)

## What's Been Implemented (2026-05-20)
- Cloned repo from `30-April` branch, services running
- **Login flow investigation** → `/app/memory/crm/CRM_LATEST_BRANCH_LOGIN_FLOW_EXPLANATION.md`
- **CR-001 plan** → `/app/memory/crm/CR_001_RESTAURANT_CRM_TOKEN_PUSH_IMPLEMENTATION_PLAN.md`
- **CR-001 implemented** → `/app/memory/crm/CR_001_RESTAURANT_CRM_TOKEN_PUSH_IMPLEMENTATION_REPORT.md`
  - Helper `_register_crm_token_with_pos()` added to `auth.py`
  - Pushes `users.api_key` as `crm_token` to MyGenie POS on every real login
  - Backfills `api_key` for legacy users missing it
  - Fire-and-forget: never blocks login
  - Tracks status via `crm_token_registered_with_pos` field in Mongo

## Prioritized Backlog
### P0 (Done)
- ~~CR-001: Push CRM token to MyGenie on login~~ DONE

### P1
- Fix `api_base_url` — set `CRM_EXTERNAL_URL` in backend .env
- Multi-restaurant support (currently hardcoded to restaurants[0])

### P2
- Remove plaintext password storage in localStorage (Remember Me)
- Clean up unused pos_config from frontend login response handling

## Status
- Backend: RUNNING (health OK, CR-001 deployed)
- Frontend: RUNNING
- Database: Connected to external MongoDB (mygenie)
