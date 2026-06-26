# MyGenie CRM — PRD

## Original Problem Statement
Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git (main branch), wipe local /app and pull remote directly. Use remote MongoDB at mongodb://mygenie_admin:****@52.66.232.149:27017/mygenie. Build as-is, no local DB.

## Architecture

### Stack
- **Frontend**: React (CRACO), Tailwind CSS, Radix UI / shadcn, Capacitor (mobile)
- **Backend**: FastAPI + Motor (async MongoDB driver), APScheduler
- **Database**: Remote MongoDB at 52.66.232.149:27017/mygenie (27 collections)

### Key Services
- Auth: MyGenie external API + JWT (24h expiry)
- WhatsApp: AuthKey.io integration
- Campaigns: APScheduler cron jobs
- POS: Order ingestion with configurable request logging
- Loyalty: Points, wallet, coupons, segments
- Analytics: Customer lifecycle, feedback, item analytics

## What's Been Implemented (as of 2026-06-26)

### Session: 2026-06-26 — Initial Setup
- Cloned repo from `https://github.com/Abhi-mygenie/CRMpreprod.git` (main)
- Wiped /app and replaced with repo contents (preserving .git/.emergent)
- Configured backend/.env with remote MongoDB + all required env vars
- Configured frontend/.env with platform REACT_APP_BACKEND_URL
- Installed all backend pip dependencies (requirements.txt)
- Installed all frontend yarn dependencies (package.json)
- Both backend (port 8001) and frontend (port 3000) running via supervisor
- Remote MongoDB connected: 27 collections confirmed
- App loads at https://crm-preprod-6.preview.emergentagent.com

## Environment Variables Set

### Backend (/app/backend/.env)
- MONGO_URL — remote MongoDB (52.66.232.149)
- DB_NAME=mygenie
- JWT_SECRET — set (needs rotation for production)
- MYGENIE_API_URL=https://preprod.mygenie.online
- MYGENIE_LOGIN/PROFILE/CRM_TOKEN endpoints
- AUTHKEY_API_URL, AUTHKEY_TEMPLATES_URL, AUTHKEY_SYNC_URL
- META_GRAPH_API_URL=https://graph.facebook.com/v21.0
- CAMPAIGN_TIMEZONE=Asia/Kolkata
- POS_REQUEST_LOGGING_ENABLED=false (configurable)

### Env Vars Still Needed from User
- Any production AUTHKEY credentials (authkey API keys per WABA account)
- META access token / WABA IDs (per tenant, stored in DB)
- AUTHKEY_WEBHOOK_SECRET (optional, for webhook auth)

## Prioritized Backlog

### P0 — Needed for full functionality
- [ ] User to supply any additional API keys needed (AUTHKEY per-tenant, Meta tokens)
- [ ] JWT_SECRET rotation for production security

### P1 — Registered CRs
- [ ] **CR-DIRECT-SEND**: New `POST /api/pos/send` endpoint — accepts `crm_template_id` + `body_values` + `customer_phone` via `X-API-Key`, bypasses event mapping system. Requires: (a) store `authkey_wid` back into `custom_templates` during sync, (b) `GET /api/pos/templates` to list available templates. Logged: 2026-06-26.

### P1 — Known issues from previous sessions
- [ ] AUTHKEY_WEBHOOK_SECRET not set (webhook unauthenticated)
- [ ] POS_REQUEST_LOGGING can be enabled when needed

### P2 — Future
- [ ] Capacitor mobile build (iOS/Android)
- [ ] Production deployment
