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

## 2026-10-08 — DECISIONS: Scan & Order Q-A answered · CR-098 registered · CR-093 Impact Analysis COMPLETE (held at IA gate)
- Owner rulings: skip-otp is the ONLY diner identity path; customer password routes retired → **CR-098** (w/c 13 Oct with CR-093); skip-otp = find-or-create, lookup = read-only; CR-096 w/c 27 Oct. CR-093 Q1–Q7 all FINAL (Q3 null · Q4 oldest · Q6 index · Q7 `{phone, country_code?}`).
- Root cause of duplicates/junk phones = CRM-side (importer double-insert, importer drops `country_code`, webhook exact-string + create-on-blank, no normalisation on any write path). POS shape already correct. → CR-085 scope, zero POS dependency. Import bugs to register later.
- Docs: `handoff/CRM_REPLY_TO_SCAN_ORDER_QA_IDENTITY_PATH_2026_10_08.md` (owner sends) · `DECISIONS_LOG.md` +4 · dashboard rows 093/098 · `CR_093_IMPACT_ANALYSIS.md` §8–§10a. **No code.** Next gate (when owner opens): Implementation Plan for CR-093 + CR-098.

## 2026-10-08 — IMPLEMENTATION: CR-098 retire customer password routes (owner-approved)
- `scan.py`: removed `POST /scan/auth/register`, `POST /scan/auth/login`, `CustomerRegister`/`CustomerLogin`, dead hashing imports; `CR-098` markers. Self-test 9/9 (404 ×2, skip-otp alive, password-holder still logs in via skip-otp, staff login 200). QA handover `qa/CR_098_QA_HANDOVER.md`. Change-log Wave 2 row CONFIRMED. Next: QA → smoke → closure → open CR-093 implementation (plan already written).

## 2026-10-08 — QA PASS: CR-098 (13/13, `test_reports/iteration_2.json`). Awaiting owner smoke → closure → CR-093 implementation gate.

## 2026-10-08 — IMPLEMENTATION: CR-093 `POST /scan/auth/lookup` (owner-approved, D-1 overridden)
- New read-only public route with Mongo TTL rate limiter + `{user_id,phone}` index. Self-test 12/12 (never creates, oldest-dup, blank→null, 429 both keys, IXSCAN). QA + Scan & Order validation pending. Docs: `qa/CR_093_QA_HANDOVER.md`, consumer note, change-log row.

## 2026-10-08 — QA PASS: CR-093 (18/18, `test_reports/iteration_3.json`). Closure gated on Scan & Order validation + owner smoke. Both Wave-2 consumer notes (098, 093) ready for owner to send.

## 2026-10-09 — PLANNING + IMPLEMENTATION: CR-089 skip-otp rate limit (owner-approved); CR-085 Impact Analysis CLOSED (Q1 intl, Q2 Option A, Q4 forward-only — all data ops deferred to end of batch, Q5 +91)
- CR-089: `scan.py` limiter on skip-otp (30/min/IP, 5/5min/phone, separate buckets). Self-test 10/10. QA + Scan & Order validation pending.
- CR-085: `planning/CR_085_IMPACT_ANALYSIS.md` — 14 write/match points, 390 junk phones hold 4,658 orders / 41,002 pts; design `core/phone.py normalize_phone()`; 085-A forward-only plan not yet opened.

## 2026-10-09 — IMPLEMENTATION: CR-085-A canonical phone (owner-approved). Helper `core/phone.py` at all 15 write/match points; CRM/skip-otp reject invalid, POS/sync flag `phone_invalid`. DEVIATION: W1/W2 invalid → flag (F) not guest-order (G) — owner decision 085-A2 pending. QA pending.

## 2026-10-09 — QA PASS: CR-085-A (16/17 + 13/13, `test_reports/iteration_5.json`). Open owner decision 085-A2: (1) invalid-phone bills → guest order (G) vs current flag (F); (2) should POS customer-lookup hide `phone_invalid` records. Baseline customers now 7700 (QA removed 37 TEST_* orphans).

## 2026-10-09 — DECISION 085-A2: invalid-phone bills → GUEST ORDER (G); 085-B last in batch (docs only, no code)
- Owner ruled W1/W2 (realtime + webhook) invalid phone → `customer_id:null` guest order, no customer created/credited; `pos_customer_id` match still first. Shipped F = deviation → follow-up **085-A2 Implementation Plan** required (§14 realtime path, `customer` optional) before CR-085-A closure. W3/W4/sync keep F. Open sub-Q: hide `phone_invalid` in POS `customer-lookup`.
- CR-085-B data cleanup re-confirmed as the final item of this batch (after 096/094/086/087/095/088).
- Updated: `DECISIONS_LOG.md`, `CR_STATUS_DASHBOARD.md` (row 085 + transition), `CR_085A_IMPLEMENTATION_PLAN.md` amendment, wave change-log POS row.

## 2026-10-09 — DECISION: 085-A2 sub-Q YES (POS lookup hides flagged, later) · 085-B report-first (docs only, no code)
- POS `customer-lookup` will hide `phone_invalid` records → bundled into the 085-A2 Implementation Plan (W1/W2 guest order + W5 hide).
- CR-085-B: before any data write, CRM sends a per-restaurant report of every customer needing correction (phone, raw, cc, reason, dup-group, orders, points, proposed action) for owner/restaurant review. Still last in batch.

## 2026-10-09 — PLANNING: CR-085-A2 Implementation Plan written (no code)
- `planning/CR_085A2_IMPLEMENTATION_PLAN.md`: G on W1 (`_find_or_create_customer` returns None on invalid; `is_guest` branches through `/pos/orders`; `_save_order_and_transactions` None-safe), W2 early guest return, W5 lookup hides invalid + `phone_invalid` records; 6 new tests; verification V1–V14 + 3-tenant regression. Only `routers/pos.py` + test file change. Risk CRITICAL (§14). Awaiting owner approval; proposed defaults (a) wallet on guest accepted/not debited (b) invoice yes/WhatsApp no (c) coupon usage `customer_id:null`.

## 2026-10-09 — DECISION 085-A2 (c1): guest-bill coupon usage recorded with `customer_id:null` (docs only, no code)
- Per-user / specific-users limits skipped for guests (no customer); `core/coupon.py` untouched. CR-082 `requires_customer` per-coupon flag remains queued. Defaults (a)/(b) stand. Plan `CR_085A2_IMPLEMENTATION_PLAN.md` awaiting owner approval to implement.

## 2026-10-09 — IMPLEMENTATION: CR-085-A2 guest orders + lookup hides flagged (owner-approved)
- `routers/pos.py` only (18 `# CR-085-A2` markers): invalid/blank phone on `/pos/orders` or `payment-received` → guest (`customer_id:null`, no points/wallet/stats/WhatsApp; invoice yes; coupon usage `customer_id:null`); `pos_customer_id` still wins; `customer-lookup` hides invalid/`phone_invalid`. `_apply_coupon_discount` helper extracted (legacy maths unchanged).
- Tests: A9 rewritten, +A7b/A11/A11b/A11c/A12. Self-test **68/68**. Baseline 7700. Legacy `Customer ` `phone:""` doc (34 visits) noted for 085-B report.
- Docs: `qa/CR_085A2_QA_HANDOVER.md`, `handoff/SESSION_2026_10_09_HANDOVER_CR085A2_IMPL.md`, wave change-log POS row updated. **Next: QA** (V5 coupon, V12 replay, V13 orders page, R1–R4).

## 2026-10-09 — QA + REGRESSION (Roles 4+9): Batch Waves 1–3 PASS (no code changed)
- Owner-approved plan (a). Backend Phase A (085-A2 independent, 32/32 — A16 fixed) + Phase B (cross-item 18/18 + all suites) → `iteration_6.json`; frontend Phase C 9/9 desktop+mobile → `iteration_7.json`. Baseline 7700.
- MINOR ×4: CR-089 limiter bucket evasion by prefix (candidate CR-099) · `test_cr098.py` stale phone data · older suites leak 2 customers · `/customers` overflow @390 (pre-existing). NOTE ×3. Report `qa/BATCH_QA_REGRESSION_REPORT_2026_10_09.md`.
- Next: owner smoke (5 steps, plan §5) → closure 098/093/089/085-A/A2; owner decision on F1–F4 follow-ups; then CR-096/094 planning.

## 2026-10-09 — INTAKE (Role 1): batch QA findings registered (docs only, no code)
- **BUG-025** P2/LOW skip-otp limiter bucket evaded by `+91`/leading-0 prefix (`scan.py:208`; key on canonical phone, 1 line) · **BUG-026** P3 stale `test_cr098.py` phone · **BUG-027** P3 suites leak customers · **BUG-028** P3 `/customers` overflow @390 (pre-existing) · **CR-099** P3 formatted phone input in Add/Edit (owner a/b pending) · **ENV-001** r69 loyalty off (owner). N3 handover path corrected.
- Docs: `discovery/SESSION_2026_10_09_BATCH_INTAKE_BUG025_BUG028_CR099.md`, `BUG_REGISTRY_CAMPAIGNS.md`, CR register rows, dashboard board + transition. Next: Planning BUG-025 (owner opens gate); owner decisions CR-099, ENV-001.

## 2026-10-09 — Customer App confirmed CR-084 (docs only)
- Their OTP code fully deleted; CR-084 closed both sides; recorded in closure doc + change-log. Reply drafted (owner sends) listing still-open consumer items: CR-098/093/089/085-A validations + contract CA-1…CA-9.
- Consolidated Scan & Order bundle (all pending asks in one doc, owner sends): `handoff/CRM_TO_SCAN_ORDER_CONSOLIDATED_BUNDLE_2026_10_09.md`.

## 2026-10-09 — PLANNING: BUG-025 + BUG-026 Impact Analysis + Implementation Plan (no code)
- `planning/BUG_025_BUG_026_IMPACT_AND_IMPL_PLAN.md`. BUG-025 fix = reorder skip-otp: IP bucket → normalise/400 → phone bucket keyed `{cc}{digits}` (~12 lines `scan.py`, +2 tests). BUG-026 = tests-only: `test_cr098.py` fixtures use now-invalid phones; new root cause for BUG-027: legacy r689 doc `9876543210` lacks `country_code` → skip-otp duplicates each run (53 missing-cc docs DB-wide → 085-B). Switch tests to `9838777712` + count assertions. Owner Q1–Q4 pending.

## 2026-10-09 — DECISIONS: BUG-025/026 plan approved (Q1 A, Q2 yes, Q3 yes); CR-100 registered + IA (no code)
- CR-100 = tolerant identity match for 53 legacy `country_code:null` docs (`+91` only); probe: 0 active 90d, 13 twins; Impl Plan gate closed by owner. New owner rule: complete validation test on production DB after all data changes (085-B/087). Docs: `DECISIONS_LOG.md`, `planning/CR_100_IMPACT_ANALYSIS.md`, register row, dashboard board + transition.

## 2026-10-09 — INTAKE: CR-101 · BUG-029 · BUG-030 · PROC-001 registered (docs only)
- CR-101 data hygiene (2 dead `password_hash`, 3 orphan-tenant customers, drop `customer_otps`) end of batch · BUG-029 lookup IP-bucket order (mirror of 025) · BUG-030 r69 short-id → non-existent tenant · PROC-001 production-DB validation rule. CR-085-B scope +53 null-cc, +13 twins, +legacy phone "" doc. Owner Qs: CR-101 deletions, BUG-029 ride with 025, BUG-030 a/b.

## 2026-10-09 — Scan & Order validations accepted (docs only)
- CR-098/093/089/085-A consumer-validated (Scan & Order half); CA-3/6/7 accepted → CR-096 + CR-094 planning unblocked. CA-2/4/5/8 bounced back (their items); CA-1 → owner. New gap → propose **CR-102** (`skip-otp` accept `country_code`). Baseline 7705 (POS till traffic). Reply draft in handoff/.

## 2026-10-09 — INTAKE: CR-102 registered (docs only)
- `skip-otp` must accept `country_code` (Customer App sends it; schema drops it). P2/LOW, may ride with BUG-025 (owner Q-B). CR-100/085-B scope +10 docs with `country_code:""` (63 total + 13 twins).

## 2026-10-09 — PLANNING amendment: BUG-025/026 plan + opt-in E5 (BUG-029) / E6 (CR-102) (no code)

## 2026-10-09 — PLANNING: BUG-029 + CR-102 IA + Impl Plans (separate docs, no code)
- BUG-029 lookup IP-bucket-first (+2 tests). CR-102 skip-otp `country_code` Option A (+4 tests), contract v1.1 note, CR-096 must carry cc. Both LOW; implement with BUG-025/026 once approved.

## 2026-10-09 — IMPLEMENTED + QA: BUG-025 · 026 · 027 · 029 · CR-102 (bundled, `scan.py`)
- skip-otp: IP bucket → normalise → 400 → canonical `so-ph:{rid}:{cc}{digits}`; `country_code` accepted (default +91); lookup IP bucket before validation; stale/leaking fixtures fixed. Self-test 105+2s; independent QA `iteration_8.json` PASS (10/10 + 105/105), baseline 7705. Report `qa/BUG025_029_CR102_QA_REPORT.md`; change-log entry for Customer App; contract v1.1 additive note. Next: owner smoke → Closure.

## 2026-10-09 — PLANNING: CR-094 + CR-096 Impact Analyses (no code)
- 094 public loyalty-rules whitelist (Q1 per-tier redemption, Q2 feedback bonus fields, Q3 flat vs nested). 096 hybrid feedback: optional token, phone+cc match existing only, never create, unlinked on miss, limits, index (Q1 invalid token, Q2 invalid phone, Q3 order_id mismatch, Q4 bonus out of scope). Awaiting owner answers.

## 2026-10-09 — DECISIONS CR-094 (Q1 yes, Q2 yes, Q3 flat) · CR-096 (phone optional, 400 on invalid supplied phone, Q4 no; Q1/Q3 pending) — docs only

## 2026-10-09 — DECISIONS CR-096 Q1 401 · Q3 order_id null → IA closed; case table A–G frozen. CR-094 IA closed. Impl Plan gates not opened (owner). Docs only.

## 2026-10-09 — PLANNING: CR-094 + CR-096 Implementation Plans (no code)
- 094: whitelist public route, 9 tests, LOW. 096: hybrid route per case table, limits, index, 14 tests, MEDIUM; finding: `Feedback` response model requires name/phone → staff list 500s for scan-feedback tenants today (Q5 fold fix). Q6 keep `linked`. Awaiting approval.

## 2026-10-09 — APPROVAL: CR-094 + CR-096 Implementation Plans approved (Q5 yes, Q6 yes); order 094 → 096; gate not opened. Docs only.
