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

### Session: 2026-07-03 — WhatsApp Reliability Sprint (4 P1s shipped)

**Context**: Owner reported webhook delivery statuses not reaching dashboard. Deep investigation surfaced a chain of related defects, all fixed in this session.

**Investigations conducted (Role 6):**
- INV-2026-07-03-01 — MongoDB Atlas no-PRIMARY error `e1.txt` traced to customer-app5th-march (NOT CRM). Owner/DevOps action pending.
- INV-2026-07-03-02 — CR-024 scheduler hang-risk audit. No defect; scale-out concern registered as CR-038.
- INV-2026-07-03-03 — Webhook not updating dashboard: 84% callbacks were `no_matching_row` due to AuthKey webhook URL misrouting per tenant. Fixed externally via owner.
- INV-2026-07-03-04 — Multi-recipient campaign duplicate LogID bug in CRM code, surfaced by live campaign test. Routed to CR-039.

**Code changes (all in this session):**
- **CR-039** (P1 CRITICAL) — Webhook row disambiguation. `routers/whatsapp.py:1398-1450`. Composite `(message_id, customer_phone)` lookup + `verdict="ambiguous_row"` skip. Fixes silent stuck-pending on every multi-recipient campaign.
- **CR-041** (P1 HIGH, pre-existing) — Timestamp overwrite on `transition_ignored` webhooks. Surfaced by QA. `routers/whatsapp.py:1453-1495`. Timestamp block moved AFTER state-machine gate.
- **CR-037** (P1) — Template status sync overwrites Meta-truth. `routers/whatsapp.py:711-731`. Query now projects `status:1`; overwrite gated behind `current_status != "rejected"`.
- **CR-026** (P1 UX) — Campaign "View Messages" deep-link. Frontend only. `CampaignsPage.jsx` (inline button + dropdown item) + `MessageStatusPage.jsx` (useSearchParams + filter banner).

**New CRs registered (planning complete, awaits owner priority):**
- **CR-038** (P3) — Campaign scheduler sequential outer-loop scale-out. 6 options sized. Deferred to backlog.

**QA & Tests:**
- 11-test pytest suite created by testing agent at `/app/backend/tests/test_cr039_webhook.py`. Covers composite lookup, ambiguous_row, no_matching_row, form-urlencoded, fallback, callback persistence, state-machine terminal states, and duplicate-delivered timestamp preservation. All 11 PASS after CR-041 fix.
- Live browser verification for CR-026 (Jeh's Nest tenant, owner@jehsnest.com): 10/10 checks PASS.

**Docs created / updated:**
- `discovery/CR_038_CAMPAIGN_SCHEDULER_SCALE_OUT_DISCOVERY.md`
- `discovery/CR_039_WEBHOOK_ROW_DISAMBIGUATION_DISCOVERY.md` + `planning/CR_039_..._PLAN.md`
- `discovery/CR_041_TIMESTAMP_OVERWRITE_DISCOVERY.md` + `planning/CR_041_..._IMPACT_ANALYSIS.md` + `planning/CR_041_..._PLAN.md`
- `investigations/INV-2026-07-03-01_MONGODB_ATLAS_NO_PRIMARY.md`
- `investigations/INV-2026-07-03-02_CR024_HANG_RISK_ANALYSIS.md`
- `investigations/INV-2026-07-03-04_CAMPAIGN_DUPLICATE_LOGID.md`
- `HANDOVER_2026-07-03.md` (this session's handover)
- Full memory restore: 8 → 304 files from `2-july` branch clone
- `CR_STATUS_DASHBOARD.md` updated with all transitions
- `test_credentials.md` updated with Jeh's Nest owner credentials
- `frontend/public/cr026_mockup.html` — live-viewable UI mockup

**Owner action items surfaced (NOT code):**
- 🚨 **RANSOMWARE indicator** in prod MongoDB (`READ_ME_TO_RECOVER_YOUR_DATA` DB found on 52.66.232.149). Backup + firewall + credential rotation required.
- **DB backup snapshot failures** observed in cluster event feed on 2026-07-02.
- **AuthKey duplicate-LogID escalation** (CR-040 pending) — CRM defensively handled but should be reported to AuthKey support.
- **1 corrupt row** (phone 7505242126) — one-off backfill script deferred (~10 LOC).

### Session end state (2026-07-03)
- Both backend and frontend healthy, hot-reload picked up all code changes.
- Zero regressions on prior tests.
- Prod DB has 1 rejected template + 565 message_logs + 2066 callback_logs — all consistent.
- Webhook pipeline now working end-to-end for Jeh's Nest (verified with live campaigns at 08:37, 08:44, 09:29 UTC).

### Session: 2026-06-26 — CR-DIRECT-SEND Feature
**Goal**: Allow external servers (e.g. POS/MyGenie) to trigger WhatsApp template messages using a flat JSON payload without dealing with nested AuthKey format.

**Backend changes:**
- `PATCH /api/whatsapp/custom-templates/{id}/labels` — saves `variable_labels` dict (e.g. `{"1": "name", "2": "meeting_link"}`) on a CRM template document
- `GET /api/pos/templates` — lists CRM custom templates with their UUID, variable_labels, authkey_sync status, and required_fields for external callers (X-API-Key auth)
- `POST /api/pos/send` — accepts flat JSON payload (`mobile`, `country_code`, `template_id`, + named fields), maps them to AuthKey bodyValues via `variable_labels`, sends WhatsApp, logs to `whatsapp_message_logs` (X-API-Key auth)
- Updated `POST /api/whatsapp/authkey/sync-templates` — after sync, auto-fetches all AuthKey templates and back-fills `authkey_wid` field on matching `custom_templates` documents

**Frontend changes (TemplatesPage.jsx):**
- Added "Set Labels" / "Edit Labels" button on CRM approved template cards
- New Direct-Send Labels modal: per-variable label name inputs + live payload JSON preview
- Fixed filter logic: approved/pending/rejected CRM templates now appear under their matching status filter (not just "All")
- Renamed "Draft Templates" section header to "CRM Templates"

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
- [x] **CR-DIRECT-SEND**: COMPLETE (2026-06-26). New `POST /api/pos/send` endpoint — accepts flat JSON, maps via `variable_labels`, fires via AuthKey, logs to `whatsapp_message_logs`. Also: `GET /api/pos/templates` listing, `PATCH /api/whatsapp/custom-templates/{id}/labels` for label config, sync endpoint back-fills `authkey_wid`.

### P1 — Known issues from previous sessions
- [ ] AUTHKEY_WEBHOOK_SECRET not set (webhook unauthenticated)
- [ ] POS_REQUEST_LOGGING can be enabled when needed

### P2 — Future
- [ ] Capacitor mobile build (iOS/Android)
- [ ] Production deployment
