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
- **CR-024 COMPLETE (pending owner manual QA)**: All 13 discovery gaps closed across 4 phases. Phase 4 Batches A+B+C+D shipped in session 6.
- **CR-024 Phase 4 Batch C+D**: IMPLEMENTED + verified (2026-06-07) — Data quality + power features. Cached `list_segments` (no per-list recount, 594ms vs multi-sec), `POST /segments/{id}/refresh-count` + `last_counted_at` field + refresh icon UI (P4.2). `resolve_audience()` helper + "all-customers" synthetic support in `get_segment` and `get_segment_customers` (P4.3). Inline guidance banner for partially-mapped templates in wizard Step 2 (P4.4). `POST /campaigns/{id}/clone` + dropdown action (P4.7). `POST /campaigns/{cid}/runs/{rid}/resend-failed` with parent_run_id linkage + retry-cap 5 + "Resend N" button on CampaignHistoryPage (P4.8). End-to-end curl smoke passed.
- **CR-024 Phase 4 Batch B**: IMPLEMENTED + verified (2026-06-07) — Editability & UX. Edit-audience dialog with usage warning (P4.1), Pause/Resume backend + frontend (P4.6), Edit-while-scheduled guards (P4.9).
- **CR-024 Phase 4 Batch A**: IMPLEMENTED + verified (2026-06-07) — Test Send (P4.10), `next_run_at` display (P4.5), Missed UI + Re-run (P4.11).
- **CR-024 Phase 3**: IMPLEMENTED + verified (2026-06-07) — Scheduled & Recurring via existing APScheduler. 10/10 unit tests pass.
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
- **P0 NEXT**: Owner manual QA on entire CR-024 (testing deferred per owner request)
- **P0 PROD**: Flip `CAMPAIGN_SCHEDULER_ENABLED=true` after Owner Test Send confirms WhatsApp delivery
- P1: CR-023 — Owner E2E test + AuthKey button param wiring
- P1: Daily auto-refresh of segment counts via midnight cron (~10 LoC, hooks into existing daily_loyalty_jobs)
- P2: CR-014 — Unpark when POS/AuthKey webhooks repointed
- P2: AudiencesPage — array-typed tier filter shows empty in Select dropdown (pre-existing). Trivial coerce-to-string fix.
- P2: Per-tenant timezone (currently single global Asia/Kolkata)
- Backlog: CR-016 — Dynamic Event Registry (deferred next sprint)
- Backlog: CR-025 Virtual Wallet — awaiting owner Q1-Q10

## Test Credentials
- Email: owner@kunafamahal.com
- Password: Qplazm@10
