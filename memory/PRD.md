# MyGenie CRM — PRD (index)

> **Authoritative state**: `PROJECT_BASELINE_2026-09-08.md` · **Security**: `SECURITY_AUDIT_2026-09-08.md` · **Operating prompt**: `control/MYGENIE_CRM_AGENT_SYSTEM_PROMPT_v0_2.md` · **CR truth**: `CR_STATUS_DASHBOARD.md` + `crm/crm_roi_sprint/00_register/ROI_MEASUREMENT_CR_REGISTER.md` · **Decisions**: `DECISIONS_LOG.md`

## Original problem statement (product)
Multi-tenant restaurant/hotel CRM for MyGenie POS customers: loyalty points & tiers, coupons (flat/%, item/category, BOGO/BXG, Nth), WhatsApp automation (event → Meta template via AuthKey) and marketing campaigns (segments, scheduled/recurring), POS integration (orders webhook, customer lookup/edit, loyalty/wallet/coupon APIs, reports), e-invoicing (food / hotel room / hotel folio, S3), customer intelligence, hotel guest document capture & migration, scan-and-order customer app.

## Session problem statements (chronological)
- 2026-05 → 2026-08: `crm_roi_sprint` — CR-002 … CR-083, BUG-001 … 024, INV-001 … 014 (see dashboard).
- 2026-09-08 (bootstrap): pull `main` into `/app`, configure env, build as-is; S3-only file staging refactor (`routers/auth.py`, `routers/whatsapp.py`) — **uncommitted, unregistered → baseline INC-03**.
- 2026-09-08 (this session): (1) **Security audit** (Phase 0), (2) **consolidated project baseline** (Phase 1), (3) **agent prompt v0.2** with mode lock, missing-prerequisite protocol, regression gate (Phase 2). Read-only — no application code changed.

## Architecture
FastAPI + Motor (remote MongoDB `mygenie`, shared live data) · React 19 (craco) · APScheduler in-process (campaign job gated OFF) · AWS S3 · integrations: MyGenie POS (SSO + webhooks), AuthKey.io WhatsApp, Meta Graph v21, Freshmarketer webhook. 20 routers / 26,476 backend LOC / 26 pages. Hotspots and regression map: prompt v0.2 §B7.

## What's been implemented — 2026-09-08
- `memory/SECURITY_AUDIT_2026-09-08.md` — 24 findings (6 P0 / 7 P1 / 7 P2 / 4 P3), 4 P0/P2 items have no CR yet (skip-otp bypass, OTP-in-response ×2, secrets in `/me` + settings, cross-tenant cron, open registration). Remediation order R1–R4.
- `memory/PROJECT_BASELINE_2026-09-08.md` — snapshot, local-vs-remote gaps (INC-01…05: **test suites missing on this pod**, coupon suite lost, uncommitted S3 refactor), CR matrix, 15 doc inconsistencies (D-01…15), 8 process gaps (G-01…08), P0/P1/P2 backlog.
- `memory/control/MYGENIE_CRM_AGENT_SYSTEM_PROMPT_v0_2.md` — new controls + refreshed facts + owner questions B15.
- `memory/README.md` — banner to new entry points; fixed CR range, testing-agent rule, preview URL.
- **Test suites restored** (27 files from `main@2089f9f`, unchanged) + `design_guidelines.json`; `test_credentials.md` populated (4 tenants verified). Baseline run: **257 pass / 69 fail / 2 error / 4 skip — 0 confirmed app regressions** (failures = stale hardcoded JWT/API-key fixtures + preprod data state). Report: `/app/test_reports/pytest/BASELINE_2026-09-08_REPORT.md`. New finding SEC-P2-08: credentials (Mongo admin URL, JWT secret, tenant passwords) committed in test files → rotation needed.

## Environment
Backend `.env` 30+ keys (never print), frontend `REACT_APP_BACKEND_URL`. `test_credentials.md` **populated 2026-09-08** (4 tenant logins verified).

## Backlog (prioritised — full list baseline §9)
- **P0**: ~~restore `backend/tests/`~~ ✅ · Security R1 fast-track (6 removals) · owner decision on `skip-otp` · CR-046 DB lockdown/backups · **rotate credentials leaked in test files (SEC-P2-08)** · register + commit S3 refactor
- **P1**: fix 4 fixture-drift suites (login at setup) · CR-047/048 (HMAC, CORS, remember-me, rate limit) · CR-052 CI (+ secret scanning) · rebuild coupon regression suite · Starlette/FastAPI bump · owner smoke for 15 ✅ items · reconcile CR-026/032/062/067/068
- **P2**: CR-049…058 platform work · registration gate, security headers, log masking · feature backlog CR-082/025/016/045/064/060/038


## 2026-09-15 — INV-017 Customer App ↔ CRM v2 contract verification (READ-ONLY, no code changed)
- Role: INVESTIGATION (10/10 steps). Source: `crm/inbox/CRM_CONTRACT_VERIFICATION_REQUEST.md`.
- Result: orders/points/wallet v2 routes EXIST under `/scan/*` (`/scan/orders`, `/scan/loyalty`, `/scan/points/history`, `/scan/wallet/history`); Customer App probed wrong paths + expects different field names. Password reset for customers does NOT exist. OTP is dev-only (`dev_otp` returned, no SMS provider).
- Reports: `crm/crm_roi_sprint/investigations/INV_017_CUSTOMER_APP_CONTRACT_GAPS.md`, `.../INV_017_CRM_CONTRACT_REPLY_TO_CUSTOMER_APP.md`, `.../INV_017_CUSTOMER_SCAN_API_CONTRACT_v2.md` (formal as-built contract + PROPOSED P-1..P-6), `.../INV_017_openapi_scan_v2.json` (OpenAPI export).
- Next: INTAKE for GAP-05 (`dev_otp` in prod, P1 security) + optional CR (skip pagination, expiring_soon); owner decisions on SMS provider & skip-otp guard rails.

## 2026-09-15 — INV-018 Order linkage gaps (READ-ONLY, no code changed)
- 28% of 66,977 orders linked to a customer. 93% of unlinked = POS sent empty phone (DATA). GAP-13: migration never creates customers (3,517 orphaned). GAP-14: zero phone normalisation → 38 duplicate customer groups, split histories; Customer App `skip-otp` format mismatch → 0 orders.
- Proposed P-8 (normalise phone everywhere, CRITICAL hotspot), P-9 (migration creates customers), P-10 (backfill/merge, dry-run first). Awaiting owner approval.
- Report + POS/Customer-App briefs: `crm/crm_roi_sprint/investigations/INV_018_ORDER_LINKAGE_GAPS.md`.

## 2026-09-15 — INTAKE: CR-084 → CR-090 registered (docs only, zero code)
- From INV-017/018. 084 dev_otp leak (P1 HIGH) · 085 phone normalisation (P1 CRITICAL) · 086 migration creates customers (P1 HIGH) · 087 backfill+merge (P1 CRITICAL, conflicts no-backfill rule) · 088 /scan hygiene (P2) · 089 skip-otp guard rails (P2) · 090 OTP delivery + reset-password (P2, 🔴 blocked on channel).
- Blockers for Customer App next phase: CR-084, CR-085. Recommended before UAT sign-off: CR-086, CR-087.
- Intake doc: `crm/crm_roi_sprint/discovery/SESSION_2026_09_15_BATCH_INTAKE_CR084_CR090.md`. Dashboard + register updated.

## 2026-09-15 — Session handover written
- `crm/crm_roi_sprint/handoff/SESSION_2026_09_15_HANDOVER_INV017_INV018_INTAKE_CR084_CR090.md` — next agent presents the 7-step decision table; owner pending: 5 restaurant IDs (Aug recon), CR-084 approval, CR-085 direction (leaning no-normalise), CR-086 Q1-Q2, CR-087 rule lift.

## 2026-09-28 — INV-021 Digital invoice tax lines (READ-ONLY, no code changed)
- Owner ask: does the e-invoice ship GST/VAT/SC/GST-on-SC? Checked The Goan Kitchen (r69), customer 7602832329, order 000224.
- Result: NO. POS never populates `gst_tax`/`vat_tax`/`service_tax` (1/0/0 orders >0 across 67k) and does not send SC base; sends only `tax_amount` + item `gst_amount` + `service_gst_tax_amount`. Invoice reads only the empty fields → no tax rows, badge RECEIPT, GST-on-SC printed as "Service Charge Rs.1". Sample render saved under `investigations/INV_021_assets/`.
- Secondary P1: `invoices` collection has no new docs since 2026-08-04 while 979 realtime orders arrived → live invoice generation silently failing (needs live logs). Owner's sample link 404s.
- Report: `crm/crm_roi_sprint/investigations/INV_021_DIGITAL_INVOICE_TAX_LINES_MISSING.md`. Owner decision pending on options A–D.

## 2026-09-28 — INV-022 Customer App endpoint-validation brief (READ-ONLY, no code changed)
- Trigger: Customer App brief INV-2026-09-15-003 (`crm/inbox/CRM_BRIEF_ENDPOINT_VALIDATION.md`) — 30 rows to confirm OK / OK-but / MISSING.
- Result: A-rows 4 exact + 6 with field/auth differences (no `skip`, no `order_id` on points rows, no `balance_after`, no `expires_at`, feedback token-only + no name/email, `table_id` not `table_no`). B1–B3 MISSING → CRM builds `POST /scan/auth/lookup` + `GET /scan/loyalty-rules/{rid}`; points/tier/wallet stay login-gated. C1/C2: CRM is not the IdP → Customer App auths against MyGenie POS directly (owner Option a). D1/D2 owner YES: `/scan/config` + `/scan/menu/dietary-tags` PUT+GET are orphan, unscoped routes → remove after cutover.
- Owner rules: symmetric — CRM never reads Customer App collections; Customer App reads CRM only via API; `users` read-freeze retired.
- Proposed (INTAKE pending): CR-093 lookup · CR-094 loyalty-rules · CR-095 remove 4 routes.
- Reports: `crm/crm_roi_sprint/investigations/INV_022_CRM_REPLY_ENDPOINT_VALIDATION_BRIEF.md` (final) · `INV_022_CRM_REPLY_TO_CUSTOMER_APP_ENDPOINT_VALIDATION.md` (outbound, send pending owner).

## 2026-09-28 — INTAKE: CR-093 → CR-095 registered (docs only, zero code)
- From INV-022. CR-093 `POST /scan/auth/lookup` (P1/HIGH) · CR-094 `GET /scan/loyalty-rules/{rid}` (P2/MEDIUM) · CR-095 remove 4 orphan `/scan/config` + `/scan/menu/dietary-tags` routes (P1/CRITICAL, GET removal gated on Customer App cutover Q-CA-1).
- Not CRs: C1 Option (a) — Customer App auths against MyGenie POS directly; `users` read-freeze retired; JWT-secret overlap (Issue 3) closed by design.
- Still proposed, not registered: CR-091/092 (INV-021 invoice) — await owner.
- Docs: `crm/crm_roi_sprint/discovery/SESSION_2026_09_28_BATCH_INTAKE_CR093_CR095.md` · dashboard rows 093–095 + transition · register rows 41–43.

## 2026-09-28 → 2026-10-03 — Customer App ↔ CRM CONTRACT v1.0 Part 1 SIGNED (READ-ONLY, no code changed)
- Filled shared-DB ownership board (38+ collections, R/W evidence), answered Customer App round 2 (Q-CA-1/5/6, A9-b hybrid, GAP-11), signed Part 1 §1–§6 of `CONTRACT_CUSTOMER_APP_CRM_v1.0` (RC3). D-1/D-2 owner ruling (owner=writer) accepted. CR-096 registered (feedback hybrid). POS brief sent: P1=NO (nobody reads `pos_event_logs` → Call Waiter/Pay Bill inert), P6 parked, P7 open.
- Parked at PLANNING gate: CR-093 lookup · CR-094 loyalty-rules · CR-095 remove 4 orphan routes · CR-096 feedback hybrid. Owner must open gate.
- Handover with pending-from-Customer-App list (CA-1…CA-9), POS (P5/P6/P7) and owner items: `crm/crm_roi_sprint/handoff/SESSION_2026_10_03_HANDOVER_CONTRACT_V1_CUSTOMER_APP.md`.

## 2026-10-08 — CLOSURE: Wave 1 CR-084 + CR-097 🔒 CLOSED
- Owner smoke PASS. Closure doc `final/CR_084_CR_097_CLOSURE.md`. Not yet released to production (next release batch). Wave 2 next: CR-093 (Q3/Q4/Q6/Q7 pending) → CR-094 (Q1 pending).

## 2026-10-08 — QA PASS (testing agent, independent): Wave 1 CR-084 + CR-097
- Backend 15/15 pytest PASS, Frontend 18/18 Playwright PASS (desktop 1920 + mobile 390). Report: `/app/test_reports/iteration_1.json`. Dashboard rows 084/097 → 🟢 QA PASS, awaiting owner smoke → closure.

- **CR-084** (scope expanded by owner: "remove otp flow entirely"): deleted `POST /scan/auth/request-otp`, `POST /scan/auth/verify-otp`, `OTPRequest`/`OTPVerify` from `routers/scan.py`. `skip-otp` + customer `/auth/register` untouched.
- **CR-097** (new; owner: "CRM user logs in from POS creds", "no change password anywhere in CRM"): deleted `POST /auth/register`, `PUT /auth/reset-password`, 3× `/auth/forgot-password/*`, Dashboard Reset-Password modal, `RegisterPage` + `/register`, LoginPage forgot modal, WA `reset_password` event (CRM_EVENTS 16→15). 11 files, deletions only, code markers at each site.
- **CR-090** closed OBSOLETE. `test_credentials.md` populated. Owner rules: live read-only probe is part of Planning; keep running change-log for Scan&Order/POS agents (`handoff/WAVE_CHANGE_LOG_FOR_SCAN_ORDER_AND_POS_AGENTS.md`) → new contracts after all waves.
- Self-test 12/12 PASS (7 routes 404, login 200, WA list clean, dashboard dropdown Logout-only). **Next: QA** (`qa/CR_084_CR_097_QA_HANDOVER.md`), then Wave 2 (CR-093 Q3/Q4/Q6/Q7 → CR-094). Sequence: `planning/PLANNING_GATE_SEQUENCE_2026_10_08.md`.
