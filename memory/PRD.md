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
- [x] **CR-042 / BUG-009 / CR-043**: COMPLETE (2026-07-03). Export Message Logs (CSV/XLSX) · Details deep-link · Customer Tag Filter + Popover. 38/38 pytest · Playwright verified. Owner UAT ready.
- [x] **CR-035**: ✅ QA PASS 2026-07-04 (iteration_4). 19/19 backend pytest + all frontend flows. Test file: `test_cr035_customer_export_import.py`. Owner UAT ready.
- [ ] **CR-040**: REGISTERED (2026-07-04). AuthKey duplicate-LogID upstream escalation — 0 CRM dev hours, owner-side vendor ticket. Intake: `crm/crm_roi_sprint/discovery/CR_040_*`.
- [ ] **CR-036**: 🟢 **Batch A + A.1 shipped 2026-07-04**. Batch A = `core/s3.py` + Part 3 (bill logo → S3) + Part 4 (invoices → S3), all dual-mode. Batch A.1 = `_resolve_logo_url()` legacy-tenant PDF logo fix + `PUBLIC_BACKEND_URL` env var. Planning RCA authored (6 root causes + 12 Batch B gaps). G2/G5/G6/G10 locked. **Batch B awaits owner-go**: Parts 1+2 (Meta `/uploads` + Template Builder file picker + campaign send delivery + silent-degrade banner). ~12-14 hrs.
- [ ] **CR-032**: Intake complete — awaits owner planning approval (~2 hrs).

### P1 — Known issues from previous sessions
- [ ] AUTHKEY_WEBHOOK_SECRET not set (webhook unauthenticated)
- [ ] POS_REQUEST_LOGGING can be enabled when needed

### P2 — Future
- [ ] Capacitor mobile build (iOS/Android)
- [ ] Production deployment

## Environment Setup (2026-07-06)
- Repo pulled from https://github.com/Abhi-mygenie/CRMpreprod.git (main branch) into /app
- Platform files preserved (.env, .emergent, .git); backend deps installed (emergentintegrations via extra index)
- backend/.env recreated with PLACEHOLDER values for: JWT_SECRET, AUTHKEY_WEBHOOK_SECRET, AWS_* (S3), MYGENIE_* endpoints. User to provide real values.
- Services running: backend (8001), frontend (3000), MongoDB. Login page verified.

## Session: 2026-07-06 — Sprint Closure (SESSION 10)

**Role**: CLOSURE. Owner directive: Option A for CR-033/034/037 (run QA now) + Option B for CR-026/029 (close-with-exception).

**Environment reconnected**: Owner supplied real preprod credentials — `MONGO_URL=mongodb://mygenie_admin:****@52.66.232.149:27017/mygenie`, real AWS S3 creds, MyGenie endpoints. Backend restarted; MongoDB confirmed live (29 collections, 5,971 customers, 24 campaigns, 28 users). MyGenie SSO end-to-end verified (`owner@cafe103.com` → HTTP 200 + real POS config + `mygenie_token`).

**QA (`testing_agent_v3_fork` iteration_5)** — 14/14 backend pytest PASS + UI smoke PASS, zero issues:
- CR-033 BUG-A regression (`vip_flag`, `whatsapp_opt_in`, `has_birthday_this_month`) confirmed fixed on live preprod data — filters return proper subsets, not full-customer-count leaks.
- CR-034 tag CRUD verified: `POST /api/customers/{id}/tags` (`$addToSet`), tag catalog aggregation, tags audience preview, ANY/ALL logic.
- CR-037 end-to-end direct-write: forced 1 real `custom_templates` doc to `status='rejected'` → `POST /api/whatsapp/authkey/sync-templates` → status preserved (guard works), `authkey_wid` back-filled, doc reverted.
- Frontend smoke: Create Audience dialog shows 5 accordion sections with correct default open/collapsed state; Customers page shows '+ tag' + chip UI on every row.
- Test file: `/app/backend/tests/test_cr033_034_037_sprint_closure.py`. Report: `/app/test_reports/iteration_5.json`.

**Registry drift corrected**:
- `CR_STATUS_DASHBOARD.md`: CR-033/034/037 → ✅ QA PASS · Owner UAT ready (2026-07-06); duplicate BUG-009 stub row removed; new closure transition entry added; header "Last updated" refreshed.
- `BUG_REGISTRY_CAMPAIGNS.md`: BUG-009 row + detail block flipped 🔴 OPEN → ✅ FIXED (2026-07-03; QA iteration_3).
- `test_credentials.md`: populated with real owner accounts (`owner@cafe103.com`, `owner@kunafamahal.com`).

**Docs produced**:
- `/app/memory/ARCHITECTURE.md` — v1.0 baseline with 6 Mermaid diagrams (system architecture, auth flow, campaign send + webhook, template lifecycle, audience/tag flow, POS + external send pipeline) + env/deployment/hotspot sections.
- `/app/memory/crm/crm_roi_sprint/handoff/SESSION_2026_07_06_SPRINT_CLOSURE.md` — closure report + full QA evidence matrix + owner sign-off checklist.

**Sprint verdict**: ✅ CLOSED — READY FOR OWNER UAT + PRODUCTION CUT-OVER.

**Rolls to next sprint (backlog)**: CR-036 Batch B.1-B.4 (awaits per-tenant Meta APP_IDs) · CR-016 · CR-025 · CR-032 · CR-038 · CR-040 · CR-045 · CR-041-B/F1/F2/F3 · pytest teardown micro-CR · `routers/customers.py` and `routers/whatsapp.py` file-split refactors.

**Owner action items (NOT code)** — still open from prior sessions:
- 🚨 Ransomware indicator in prod MongoDB (`READ_ME_TO_RECOVER_YOUR_DATA` DB found on 52.66.232.149). Backup + firewall + credential rotation required.
- DB backup snapshot failures observed 2026-07-02.
- AuthKey duplicate-LogID vendor escalation (CR-040).

---

## Session: 2026-07-06 (b) — Architecture v1.1: Consolidated Data-Flow Views

**Role**: CLOSURE / DOCUMENTATION CONSOLIDATION (docs only — zero code/DB changes to app logic).

**Done**:
- Verified all 6 existing ARCHITECTURE.md diagrams against code reality (grep of every `db.<collection>.<write-op>` across routers/, core/, services/) — no drift found.
- `ARCHITECTURE.md` bumped to **v1.1** — added Part II · Consolidated data-flow views:
  - §10 End-to-end POS order data flow (collections per hop, integrity anchors)
  - §11 MongoDB collection read/write ownership map (diagram + ownership table)
  - §12 Scheduler & async data flow (APScheduler jobs + webhook path)
- Rendered HTML visual docs (Mermaid, dark theme) served from frontend static:
  - `/docs/architecture.html` — §1–6 (6/6 diagrams rendered, 0 errors, screenshot-verified)
  - `/docs/dataflow.html` — §10–12 (3/3 diagrams rendered, 0 errors, screenshot-verified)

**Backlog unchanged** — CR-036 B.1-B.4 (blocked on Meta APP_IDs), CR-016/025/032/038/040/045, CR-041-B/F1/F2/F3, hotspot refactors. Owner UAT for CR-033/034/037 still pending.

---

## Session: 2026-07-06 (c) — Architecture Audit Bible v1.0

**Role**: PRE-RELEASE AUDIT (read-only — zero code changes).

**Done**:
- Full evidence-based architecture audit for scaling to thousands of clients — every finding verified against actual code (server.py, core/, routers/, frontend) with file/line refs.
- `/app/memory/ARCHITECTURE_AUDIT.md` created: **45 findings — 14 High / 21 Medium / 10 Low** across Security (10), Scalability (9), Reliability (6), Performance (4), Data Model (4), Maintainability (4), Deployment (4), Monitoring (4). Each finding: What / Why risk / Impact at scale / Fix / Priority.
- 4-phase remediation roadmap (Phase 0 stop-the-bleeding → Phase 3 optimization).
- Rendered HTML version: `/docs/audit.html` (45 expandable finding cards, screenshot-verified).

**Top P0s surfaced**: SEC-01 public MongoDB + ransomware indicator, REL-02 unverified backups, SEC-03 dormant webhook HMAC, SCA-01 monolith scheduler, MON-01 zero observability, DEP-01 no prod pipeline.

---

## Session: 2026-07-06 (d) — Audit → Registered CRs (CR-046 → CR-059)

**Role**: INTAKE (batch) — zero code changes.

**Done**:
- 14 CRs registered on `CR_STATUS_DASHBOARD.md` from the 45 audit findings, grouped one-CR-per-workstream, mapped to the 4-phase roadmap:
  - **P0**: CR-046 (Mongo lockdown+backups, owner-infra) · CR-047 (webhook HMAC + CORS, absorbs CR-041-F3) · CR-048 (remove stored password + rate limiting)
  - **P1**: CR-049 (worker split + Redis + locks) → CR-050 (queue sends + DLQ, supersedes CR-038 A-C) · CR-051 (observability) · CR-052 (CI + staging) · CR-053 (refresh-token auth)
  - **P2**: CR-054 (tenant isolation layer) · CR-055 (data hygiene, absorbs CR-041-F2, requires CR-046 backups) · CR-056 (SSO resilience) · CR-057 (config validation + POS v1) · CR-058 (secrets mgmt)
  - **P3**: CR-059 (umbrella — splits at promotion). MAI-01 stays as pre-existing CR-041-F1.
- Intake doc: `crm/crm_roi_sprint/discovery/CR_046_059_AUDIT_REMEDIATION_BATCH_INTAKE.md`. Transition logged; dashboard header updated (Session 11). Audit MD + audit.html roadmap tables now show CR traceability.

**Owner decisions pending**: promote Phase 0? · obtain AUTHKEY_WEBHOOK_SECRET · auth-gate approvals for CR-048/053/056 · Redis provisioning choice.

---

## Session: 2026-07-06 (e) — Capacity & Breakpoints (§10 added to Audit Bible → v1.1)

**Done** (docs only, owner-approved scope: §10 in ARCHITECTURE_AUDIT.md, tiers 100/1,000/10,000, default load assumptions):
- §10 added: load model, projected load per tier, 9 subsystem breakpoints (B1–B9) with degrade/break tenant counts, per-tier requirement checklists mapped to CR-046→059, external vendor ceilings (AuthKey SLA, Meta WABA tiers, MyGenie).
- Key conclusions: safe to ~100 tenants with Phase-0 only; **first hard wall = campaign send pipeline at ~300–500 tenants** (CR-049+CR-050 must land before ~300); 1,000 tenants needs full Phase-1/2; 10,000 = platform build-out (sharding, dedicated workers, archival, multi-AZ, vendor contracts).
- audit.html updated to v1.1 with the full §10 tables (screenshot-verified).
- Method caveat documented: estimates from code-verified constraints, not load tests; load-test CI gates registered as Tier-3 follow-up.
