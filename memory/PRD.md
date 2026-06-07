# MyGenie CRM — PRD

## Original Problem Statement
Pull code from `https://github.com/Abhi-mygenie/CRMpreprod.git` (5-june branch), wipe local /app and deploy as-is using remote MongoDB. Then implement CR-024 Phase 1: Marketing Campaigns matching the approved HTML mock.

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Radix UI + Craco (port 3000)
- **Backend**: FastAPI + Motor (async MongoDB) + APScheduler (port 8001)
- **Database**: Remote MongoDB at 52.66.232.149:27017, database: `mygenie`
- **Auth**: JWT-based (PyJWT + python-jose)
- **Preview URL**: https://3b1ba504-2fb4-4af8-b835-6e7539f9fd39.preview.emergentagent.com
- **Branch**: `5-june`

## What's Been Implemented

### 2026-06-06 — CR-024 Phase 1: Marketing Campaigns

**Backend** (`routers/campaigns.py` + `server.py`):
- Campaign CRUD (create/list/get/update/delete)
- Execution engine (background task: audience query → opt-out filter → rate limit → resolve vars → send_bulk → log with campaign_run_id → update stats)
- History endpoints (per-campaign runs + global history with day filter)
- Daily limit endpoint (1000/day per tenant)
- DB indexes for campaigns + campaign_runs collections

**Frontend** (4 new pages + sidebar restructure):
1. `CampaignsPage.jsx` — 5 stat cards (Total/Active/Scheduled/Messages Sent/Avg Delivery%), dark tab filters, campaign rows with individual Sent/Delivered/Read/Failed columns + status badge + action button
2. `AudiencesPage.jsx` — Dedicated 3-column grid with large count numbers, filter tags, "Used in X campaigns", Preview/Delete buttons, dashed "Create New Audience" card, create dialog with filter selectors
3. `CampaignHistoryPage.jsx` — 5 stat cards + proper table layout (Campaign/Audience/Template/Sent/Delivered/Read/Failed/Delivery%/Date/Actions) with delivery % progress bars
4. `CampaignWizardPage.jsx` — Numbered circle step indicator (1→2→3), Step 1 (name+audience with "create audience" link), Step 2 (2-column: left template+variable mapping grid / right WhatsApp preview bubble), Step 3 (all schedule options enabled, amber confirmation box, green "Send to N Customers" button, double confirm >500)
5. `ResponsiveLayout.jsx` — Sidebar restructured: WhatsApp (Settings/Templates/Automation) + Marketing (Campaigns/Audiences/History)
6. `App.js` — New routes + /segments → /audiences redirect

**Seed Data** (Kunafa Mahal):
- 4 segments: Gold Customers (14), Inactive 30+ Days (2023), Birthday This Month (2038), VIP High Spenders (4)
- 4 campaigns: Weekend Biryani Festival (completed, 342 sent), June Loyalty Boost (scheduled/draft), Birthday Club Weekly (completed, 180 sent), Diwali Mega Offer (completed, 500 sent)
- 3 campaign_runs with realistic delivery/read/failed stats

**Design**: All 4 pages match the approved HTML mock (`/app/frontend/public/cr024_mock.html`)

### Previous Sessions (from 5-june branch)
- CR-004 P3.5, CR-015/a/b/c, CR-017, CR-018, CR-020, CR-021, CR-022: All CLOSED
- CR-023: Phase 1+2+3 implemented — awaiting owner E2E test
- CR-014: Code complete, live test PARKED

## Current Status
- **CR-024 Phase 3**: IMPLEMENTED + verified (2026-06-07) — Scheduled & Recurring execution via existing APScheduler. New job `process_due_campaigns` registered (1-min tick), gated by `CAMPAIGN_SCHEDULER_ENABLED` env flag (default OFF). Smoke test passed: scheduled campaign fired at 08:46:00 UTC within 2 sec of due time → `status=scheduled → active → completed`, `run_count: 0→1`, `next_run_at` cleared. 10/10 unit tests pass on `compute_next_run_at()`.
- **CR-024 Phase 1**: PARKED — owner testing live send. 1 message sent to abhishek jain.
- **CR-014 Phase 3**: IMPLEMENTED — Hotel Folio (Mode C) with both patterns. Verified with real DB data.

### 2026-06-07 — CR-024 Phase 3: Scheduled & Recurring Execution

**Backend** (new + edits):
- NEW `core/campaign_jobs.py` (~270 LoC): `compute_next_run_at()` pure function (daily / weekly multi-day / monthly with last-day-of-month roll-back), `process_due_campaigns()` cron worker with atomic claim + missed-window detection, `backfill_next_run_at()` for legacy rows.
- EDIT `core/scheduler.py`: registered `process_due_campaigns` job via `CronTrigger(minute='*')` with `coalesce=True, max_instances=1`.
- EDIT `routers/campaigns.py`: refactored `_execute_campaign_send(campaign_id, user_id: str)` for cron callability; rebuilt `/campaigns/{id}/send` to branch on `schedule_type` — only "now" fires immediately, "scheduled"/"recurring" persist `next_run_at` and return preview.
- EDIT `server.py`: new `(status, next_run_at)` compound sparse index + lifespan-time backfill.
- EDIT `backend/.env`: `CAMPAIGN_SCHEDULER_ENABLED=false` + `CAMPAIGN_TIMEZONE=Asia/Kolkata`.
- NEW `tests/test_campaign_jobs.py`: 10 unit tests, 100% pass.

**Frontend** (wizard fixes):
- EDIT `CampaignWizardPage.jsx`: added 5 missing recurring state vars (`recurringDays`, `recurringDayOfMonth`, `recurringEndOption`, `recurringEndDate`, `recurringOccurrences`); `buildPayload()` now includes all 7 recurring fields; dynamic send-button label ("Send to N Customers" / "Schedule Campaign" / "Start Recurring Campaign"); dynamic post-send toast.

**Design locks** (defaults accepted by owner):
- Tick: every 1 min | TZ: Asia/Kolkata | Safety flag default OFF | Catch-up: 24h then `status=missed` | Empty `recurring_days` → `["Mon"]` | Monthly day-31 → last valid day | Atomic claim via conditional updateOne | No live WhatsApp during smoke test.

**To activate in production**: `echo "CAMPAIGN_SCHEDULER_ENABLED=true" >> backend/.env && sudo supervisorctl restart backend`

## Prioritized Backlog
- P1: CR-024 Phase 4 — Polish (next_run_at column in CampaignsPage, pause/resume, campaign clone, resend failed, edit-while-scheduled guards)
- P1: CR-024 — Flip `CAMPAIGN_SCHEDULER_ENABLED=true` in production after owner smoke test
- P1: CR-023 — Owner E2E test + AuthKey button param wiring
- P2: CR-014 — Unpark when POS/AuthKey webhooks repointed
- P2: Per-tenant timezone (currently single global Asia/Kolkata)
- Backlog: CR-016 — Dynamic Event Registry (deferred next sprint)
- Backlog: CR-025 Virtual Wallet — awaiting owner Q1-Q10

## Test Credentials
- Email: owner@kunafamahal.com
- Password: Qplazm@10
