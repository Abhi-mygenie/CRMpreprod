# CR Registry — Customer-app 3-july branch (Session 2026-07-03)

Index of all Change Requests raised, planned, or shipped during the
INVESTIGATION → PLANNING → IMPLEMENTATION cycles on 2026-07-03.

> **Note on process compliance:** the operating prompt
> `control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` §8 Role 1
> mandates an **INTAKE** step (with an `INTAKE_DOC.md` artefact and
> `Intake complete: <ID>` output block) before any Planning or Implementation.
> The 10 items below were originally created without that step —
> **retroactive `INTAKE_DOC.md` artefacts were added** to each folder to
> restore compliance. Future items should be raised via Role 1 first.

## Legend
- ✅ SHIPPED — code merged, self-tested, QA handover written
- 🚧 IMPLEMENTED, QA-pending — code merged, waiting on human QA
- 📋 PLANNED — CR + IMPLEMENTATION_PLAN written, awaiting owner approval
- 📝 REGISTERED — CR written, no plan yet OR data/ops-owned
- 🔬 AUDIT (INV) — read-only investigation task, no code planned
- ⚰️ TOMBSTONE — ID was issued but renamed to another ID; row kept for traceability

## ID Scheme (canonicalized 2026-07-03 by CR-2026-07-03-010)

This branch uses two ID formats. Both are valid; use is scoped by era, not by type:

| Format | Status | Use for |
|---|---|---|
| `BUG-NNN` (global 3-digit sequence, 001..050) | **FROZEN** at BUG-050 as of 2026-07-03 | Historical cross-references only. Do not issue new IDs in this format. |
| `CR-YYYY-MM-DD-NNN` (per-day 3-digit sequence) | **ACTIVE** — canonical for all new work | New change requests, feature work, refactors, doc updates, data ops. |
| `INV-YYYY-MM-DD-NNN` (per-day 3-digit sequence) | **ACTIVE** | Investigations only (read-only, no code, per Alpha v0.1 §8 Role 6). |

**Canonical bug tracker for the legacy `BUG-NNN` sequence: NONE — the source is gone.**
`/app/memory_repo/` **does not exist in this pod.** Neither `BUG_TRACKER.md` nor
`BUG_TRACKER_ARCHITECTURAL_AUDIT_2026-05.md` (formerly `BUG_TRACKER_v2.md`) can be located.
Owner ruling **D-R5 (session after 2026-10-03): `/app/memory` is canonical; `memory_repo` is
deprecated — do not cite it.** 19 legacy IDs survive only as cross-references in 33 documents;
their open/closed status is being reconstructed in
[INV-2026-10-04-001](./INV-2026-10-04-001-legacy-bug-id-status-reconstruction/INTAKE_DOC.md).
The previously documented count of "10 open bugs (2x P0, 8x P1)" is **unverifiable** and must not
be relied on. Recorded as finding F5/F7 of
[CR-2026-10-04-004](./CR-2026-10-04-004-registry-reconciliation/INTAKE_DOC.md).

**`BUG-YYYY-MM-DD-NNN` is also ACTIVE** for new bugs (3 such folders exist and are now registered
below). The table at line 28 omitted it.

**Tombstones.** If an ID is issued and later renamed (e.g. CR-2026-07-03-006 was renamed
mid-session to INV-2026-07-03-001), a **tombstone row** must be added to the table below
with status `⚰️ TOMBSTONE`, pointing at the successor ID. Do not delete or reuse tombstone IDs.

## Table

| ID | Title | Status | Priority | Files | Effort | Owner action needed |
|---|---|---|---|---|---|---|
| [CR-2026-07-03-000](./CR-2026-07-03-000-remove-hardcoded-login-creds/CR.md) | Remove hardcoded POS login credentials from frontend bundle (Option 1 — FastAPI proxy for token issuance) | 🚧 IMPLEMENTED (QA-pending — needs rotated POS creds in `backend/.env` + owner smoke) | **P1 security** | 4 (2 FE + 2 BE incl. `.env`) | done ✓ | paste rotated creds + 4-step smoke ([QA_HANDOVER §4](./CR-2026-07-03-000-remove-hardcoded-login-creds/QA_HANDOVER.md#4-owner-action-required-to-close-the-last-3-checks)) |
| [CR-2026-07-03-001](./CR-2026-07-03-001-theme-cache-busting/CR.md) | Theme cache busting (`?bustCache=1`) | ✅ SHIPPED | P1 | 1 FE | done | ops broadcasting to team |
| [CR-2026-07-03-002](./CR-2026-07-03-002-remove-dead-restaurant-info-fetch/CR.md) | Remove dead `/api/restaurant-info/{id}` fetch | 🚧 IMPLEMENTED (QA-pending) | P3 | 1 FE | done | admin QA on VisibilityTab + Dietary |
| [CR-2026-07-03-003](./CR-2026-07-03-003-backend-mongo-timeouts-and-healthz/CR.md) | Backend Mongo timeouts + `/api/healthz` | ✅ SHIPPED | P1 | 1 BE | done | ops points probe (see CR-009) |
| [CR-2026-07-03-004](./CR-2026-07-03-004-frontend-fetch-timeouts/CR.md) | Frontend fetch timeouts + AbortController + error UI (plumbing scope; AlertDialog + empty-state deferred to follow-up) | 🚧 IMPLEMENTED (QA-pending — plumbing shipped, error UI wiring deferred) | P2 | 7 FE (~80/−32 LOC) | done ✓ | 6-step smoke ([QA_HANDOVER §5](./CR-2026-07-03-004-frontend-fetch-timeouts/QA_HANDOVER.md#5-owner-smoke-test-5-min)) |
| [CR-2026-07-03-005](./CR-2026-07-03-005-theme-and-flags-dedup/CR.md) | Theme `themeVersion` + dedup follow-ups | 📋 PLANNED | P3 | 3 files | ~1.2 days | approve F-01 design + F-02 cleanup |
| CR-2026-07-03-006 | *(renamed — see INV-2026-07-03-001)* | ⚰️ TOMBSTONE | — | — | — | Renamed mid-session on 2026-07-03; formalised by CR-2026-07-03-010 |
| [INV-2026-07-03-001](./INV-2026-07-03-001-order-create-idempotency-audit/CR.md) | Order-create idempotency AUDIT | ✅ RESOLVED-BY-OWNER-ASSERTION (D-02, 2026-07-04) | **P1** (BLOCKER for CR-004 — CLEARED) | 0 | resolved | none — audit trail in [CR.md §0](./INV-2026-07-03-001-order-create-idempotency-audit/CR.md#0-resolution--owner-assertion-2026-07-04) |
| [CR-2026-07-03-007](./CR-2026-07-03-007-prod-deploy-env-hardening/CR.md) | Prod deploy env hardening (backend URL + secret rotation) | 📝 REGISTERED | **P1 security** | 0 (ops) | half-day distributed | ops + DBA + security team |
| [CR-2026-07-03-008](./CR-2026-07-03-008-prod-db-data-quality/CR.md) | Prod DB data quality remediation | 📝 REGISTERED (DATA) | P2 | 0 code | half-day + owner cross-check | approve seed/archive strategy |
| [CR-2026-07-03-009](./CR-2026-07-03-009-observability-and-lb-probe/CR.md) | Observability + LB probe wiring (post CR-003) | 📝 REGISTERED | P1 (F-13), P3 (F-12) | 0-1 files | 30 min-2 hrs | ops points probe at `/api/healthz` |
| [CR-2026-07-03-010](./CR-2026-07-03-010-registry-hygiene-and-id-scheme-canonicalization/CR.md) | Registry hygiene & ID-scheme canonicalization (BUG-NNN vs CR-YYYY-MM-DD-NNN; tombstones; stale BUG_TRACKER_v2) | ✅ SHIPPED | P2 | 6 MD (docs-only) | ~45 min | none (owner-approved defaults executed 2026-07-03) |
| [CR-2026-07-03-011](./CR-2026-07-03-011-full-pos-proxy-refactor/CR.md) | Full POS-proxy refactor (proxy ALL POS write calls through FastAPI; remediates BUG-001/BUG-002) | 📝 REGISTERED (Role 1 done) | P1 | ~15 files (BE+FE) | 2.5–3.5 dev-days | CR-000 SHIPPED + INV-001 COMPLETE + D-01..D-04 |
| [CR-2026-07-03-012](./CR-2026-07-03-012-leaked-cred-doc-scrub-and-ci-lint/CR.md) | Leaked-credential doc scrub (18 files) + CI lint rule for `REACT_APP_*_PASSWORD/SECRET/TOKEN` | 📝 REGISTERED (Role 1 done) | P2 | 18 MD + 1 FE comment + 1 new CI script | ~1.5 hrs | approve D-01..D-04 + CRM rotation timing |
| [CR-2026-07-04-002](./CR-2026-07-04-002-registry-finish-up/CLOSURE_NOTE.md) | Registry finish-up (A: Alpha v0.1 ref update · B: 39-item reconciliation · C: legacy `memory_repo/change_requests/` README) | ✅ **CLOSED** (session after 2026-10-03) — **§15 cond. 5, owner-accepted exception (D-R6)**. All three parts targeted `/app/memory_repo/` artefacts which **do not exist**; `/app/memory` is canonical (D-R5). Part B carried to INV-2026-10-04-001; parts A+C dropped. [CLOSURE_NOTE](./CR-2026-07-04-002-registry-finish-up/CLOSURE_NOTE.md) | P3 | 0 — no subject | — | none |
| [CR-2026-07-04-003](./CR-2026-07-04-003-cr004-residual-scope/CR.md) | CR-004 residual scope (empty-state on menu-load timeout + 5 AdminConfig CRUD timeout swaps) | 📝 REGISTERED (Role 1 done) | P2 | 3-5 FE (menu component + AdminConfigContext) | 2.5–3 hrs | approve D-01..D-04 or wait for user-pain report |
| [CR-2026-07-04-004](./CR-2026-07-04-004-client-telemetry/CR.md) | Client telemetry to Mongo (POST fetch-timeout + React ErrorBoundary events, 30-day TTL, admin read endpoint) | 📝 REGISTERED (Role 1 done) | P2 | 2 BE endpoints + 1 Mongo collection + ~15 LOC FE | ~4 hrs | approve D-01..D-06 (retention, rate-limit, hashing) |

## Architecture Correction Programme (registered 2026-09-12 — Role 1 INTAKE)

Umbrella + children. Owner request: split `server.py`, fix high/critical bugs, remove hardcoding, prepare for multi-brand; MySQL as Phase B.
**Owner decisions (12) recorded 2026-09-12** → `CR-2026-09-12-001/OWNER_DECISIONS_2026-09-12.md`. Numbered plan → `CR-2026-09-12-001/EXECUTION_PLAN.md`.
Gate status: Wave 0 APPROVED TO START (owner assigns QA role) · Wave 1 APPROVED FOR PLANNING after Wave 0 · Waves 2–5 + Phase B sequencing approved, each needs own Planning gate · CR-2026-08-03-001 owner re-read pending.

| ID | Title | Status | Priority / Risk | Wave | Owner action needed |
|---|---|---|---|---|---|
| [CR-2026-09-12-001](./CR-2026-09-12-001-architecture-correction-programme/INTAKE_DOC.md) | **Architecture Correction Programme (umbrella)** | 📝 REGISTERED — owner decisions RECORDED 2026-09-12 | P0 / CRITICAL | — | assign role for Point 1 |
| [CR-2026-09-12-002](./CR-2026-09-12-002-qa-backlog-closure/QA_SUMMARY.md) | QA backlog closure — 10 IMPLEMENTED/QA-pending items | ✅ **CLOSED 2026-09-12 — 10/10 PASS** (owner inputs supplied; 4 non-blocking NOTEs filed) | P1 / LOW | 0 | none — Wave 1 Planning may now open |
| [CR-2026-09-12-003](./CR-2026-09-12-003-otp-echo-removal-persistent-otp-store/IMPACT_ANALYSIS.md) | Remove OTP echo + persistent throttled OTP store (GAP-003) | 🔍 **RE-SCOPED 2026-09-14** — investigation found: (1) backend `/api/auth/send-otp` is never called by the frontend (dead code); (2) CRM is already the SMS provider via frontend-direct calls; (3) CR-017 blocker is INVALID. **New scope:** Part A (delete `otp_for_testing` key — 1-line, zero deps) deferred until owner confirms OTP E2E works on a real device. Parts B+C (Mongo store + attempt cap) deferred until OTP feature is turned ON. | **P1 / LOW** (downgraded from P0 — frontend never calls the leaking endpoint) | **deferred** | Owner to confirm: (a) real SMS arrives on test phone for `crmSendOtp`, (b) decision to turn on OTP — then assign Role 3 for Part A only |
| [CR-2026-09-12-004](./CR-2026-09-12-004-cors-lockdown-rate-limit-middleware/QA_HANDOVER.md) | CORS hybrid static+regex allow-list + auth rate-limit + middleware stack (GAP-005/004) | 🧪 **QA PASSED — AWAITING OWNER SMOKE** (session after 2026-10-03, Gate 0; §15 reserves CLOSED for owner acceptance): 429 fires under burst, all 5 security headers present, no backend crash. Regression test added (`tests/smoke/test_cr_2026_09_12_004.py`). **Side effect found + fixed:** its own 5/min login limit was breaking the contract suite → CR-2026-10-04-002 | **P0 / CRITICAL** | **1a** | QA (Role 4) |
| [CR-2026-09-12-005](./CR-2026-09-12-005-ci-gate-contract-snapshots/IMPACT_ANALYSIS.md) | CI gate + API contract snapshots + smoke tests on UAT Mongo (GAP-009) | ✅ **Wave 1a · CLOSED 2026-09-13** — 22/22 PASS (QA agent verified). Snapshots committed. Safety net live. | P1 / MEDIUM | **1a** (Phase 1) | none — owner drives next session |
| CR-2026-07-03-007 (F-07) | `.env.example` + purge dead FE env keys + rotation checklist — **folded into CR-007** | ✅ **Wave 1a · CLOSED 2026-09-13** — QA agent 8/8 PASS. .env.example files, .gitignore, ROTATION_CHECKLIST created; orphan key deleted. | P1 / LOW | **1a** | none — owner drives next session |
| [CR-2026-09-12-006](./CR-2026-09-12-006-backend-modular-split/INTAKE_DOC.md) | Backend modular split + delete dead `/api/docs/*` (GAP-013/018) | 📝 REGISTERED (Role 1 done) | P1 / CRITICAL | 2 | none until CR-005 CLOSED |
| [INV-2026-09-12-001](./INV-2026-09-12-001-legacy-customer-routes-usage-trace/INVESTIGATION_REPORT.md) | Legacy `customer/*` routes + `AdminSettings.jsx` usage trace (GAP-020) | 🔬 REPORT WRITTEN 2026-09-15 — FE does not call FastAPI `/api/customer/*` (TRUE). **Deletion wording withdrawn** pending owner decision; feature health is CRM-side → see INV-2026-09-15-001 | — | 2 | owner decision on `/api/status` external callers |
| [INV-2026-09-15-001](./INV-2026-09-15-001-profile-data-crm-v2-contract-gap/INVESTIGATION_REPORT.md) | Profile page Orders/Points/Wallet tabs 404 on CRM v2 (`crmGetOrders/Points/Wallet` still on v1 `/customer/me/*`) + CRM contract verification request incl. OTP routes | ✅ **CLOSED 2026-09-15** — root cause confirmed, CRM reply validated, shared-DB fact recorded (§10). Spawned CR-2026-09-15-001/-002, INV-2026-09-15-002, fold-ins to CR-007, guards on CR-006/-014. Owner decisions in `control/OWNER_DECISIONS_2026-09-15.md`. | **P1** | 2 | none |
| [CR-2026-09-15-001](./CR-2026-09-15-001-profile-crm-v2-adapter/INTAKE_DOC.md) | Profile → CRM v2 adapter: orders/points/wallet via `/scan/*`, points sign mapping, `order_type` labels, wallet-tab gating (G1–G5) | 📝 REGISTERED (Role 1 done, 2026-09-15) | **P1 / HIGH** | 2 | Planning; UAT rid 689 |
| [CR-2026-09-15-002](./CR-2026-09-15-002-skip-otp-dead-branch-cleanup/INTAKE_DOC.md) | Remove dead skip-otp 409/429/Retry-After branches (OD-3 accept) | 📝 REGISTERED — PARKED behind CR-2026-09-15-001; coordinate with CR-013 | P3 / HIGH (hotspot file) | 2 | none |
| [INV-2026-09-15-002](./INV-2026-09-15-002-shared-db-collection-ownership-map/INTAKE_DOC.md) | Shared-MongoDB collection ownership map (reads/writes, defaults, config write-lock OD-7, auth-secret overlap) — gates CR-006/010/014 | 📝 REGISTERED (Role 1 done, 2026-09-15) | **P1** (gating) | 2 | owner "go" + CRM counterpart |
| [INV-2026-09-15-003](./INV-2026-09-15-003-direct-crm-table-access-audit/INVESTIGATION_REPORT.md) | Direct CRM-table access audit — 8 collections, 20 sites (14 dead / 6 live). CRM reply INV-022 validated. | ✅ COMPLETE · **Owner decisions 2026-10-03:** F1 ✅ F2=(a) ✅ F4 frozen ✅. CRM reply v2 APPROVED TO SEND. O7 approved. O5 blocked — Q-CA-6 raised. P4 parked. | **P1** | 1 | POS P1 (owner checking) · POS P5 (owner sharing) |
| [CR-2026-09-15-004](./CR-2026-09-15-004-admin-login-users-table-dependency/INTAKE_DOC.md) | Remove admin login direct read of CRM `users`. Direction D (POS direct). P0 projection sub-item. | 📝 REGISTERED — **P0 projection fix approved by owner 2026-10-03**, ship independently. F3 pending impact doc after POS P5. | **P1** (P0 approved) | 2 BE + 2 FE | P0: go to Planning · F3: after P5 |
| [CR-2026-09-15-003](./CR-2026-09-15-003-canonical-phone-alignment/INTAKE_DOC.md) | Canonical phone alignment POS↔CRM↔App: `extractPhoneNumber` blanks non-`+91` numbers (order unlinkable) | 🅿️ **PARKED 2026-10-03** — India-only confirmed by owner. Re-open if international numbers introduced. | P2 / CRITICAL | 2 | none — parked |
| [CR-2026-09-12-007](./CR-2026-09-12-007-fe-api-client-and-session-facade/INTAKE_DOC.md) | FE API-client facade + `session.js` storage facade (GAP-014/011) | 📝 REGISTERED (Role 1 done) | P1 / CRITICAL | 3 | NEW-2, NEW-3 |
| [CR-2026-09-12-008](./CR-2026-09-12-008-fe-route-guard/INTAKE_DOC.md) | FE `ProtectedRoute` / `RoleGuard` (GAP-006) | 📝 REGISTERED (Role 1 done) | P1 / HIGH | 3 | NEW-2 |
| CR-2026-08-03-001 | 716 hardcoding → config flags — **adopted into programme** | 🛑 **HELD (D-S4, session after 2026-10-03)** — plan complete, but live preprod now returns `locationSelection:'scanner'` / `ordersAutoPaid:0` for **716**; shipping as planned would silently break Hyatt's room-only + autopaid behaviour. Blocker is a **POS data backfill**, not POS engineering | P1 / HIGH | 3 | confirm 716 flag backfill in **preprod + production**, then re-read the plan and "go" |
| [CR-2026-09-12-009](./CR-2026-09-12-009-remove-default-rid-posid-countrycode-hardcoding/INTAKE_DOC.md) | Remove `478` default → "Restaurant not found" page, `pos_id`, `+91` hardcoding | 📝 REGISTERED (D-478 = remove) | P2 / MEDIUM | 3 | none |
| [CR-2026-09-12-010](./CR-2026-09-12-010-config-defaults-single-source-of-truth/INTAKE_DOC.md) | Config defaults master → **DB record, admin-editable, versioned** (GAP-008) | 📝 REGISTERED (G0.7 = DB) | P1 / HIGH | 3 | approve `config_defaults` schema at Planning |
| [CR-2026-09-12-011](./CR-2026-09-12-011-multi-brand-tenant-readiness/INTAKE_DOC.md) | Multi-brand tenant readiness (`resolveTenant`, `get_tenant()`, namespaced storage) | 📝 REGISTERED (Role 1 done) | P1 / HIGH | 4 | none until CR-006/007 CLOSED |
| CR-2026-07-03-011 | Full POS proxy (BFF) — **re-sequenced into programme Wave 4**, phased, money/credential calls first (NEW-3) | 📝 REGISTERED | P1 | 4 | none until CR-007 CLOSED |
| [CR-2026-09-12-012](./CR-2026-09-12-012-thick-page-decomposition-revieworder/INTAKE_DOC.md) | Thick-page decomposition — `ReviewOrder.jsx` | 📝 REGISTERED (Role 1 done) | P2 / CRITICAL | 5 | none until CR-005/007 CLOSED |
| [CR-2026-09-12-013](./CR-2026-09-12-013-thick-page-decomposition-landing-delivery-ordersuccess/INTAKE_DOC.md) | Thick-page decomposition — Landing / DeliveryAddress / OrderSuccess / legacy AdminSettings | 📝 REGISTERED (Role 1 done) | P2 / HIGH | 5 | none until CR-012 |
| [CR-2026-09-12-014](./CR-2026-09-12-014-phase-b-mysql-migration/INTAKE_DOC.md) | **Phase B — MySQL migration** (INTAKE ONLY) | 📝 REGISTERED — Planning BLOCKED | P2 / CRITICAL | B | D-B1 at Planning time |
| [CR-2026-09-12-015](./CR-2026-09-12-015-github-actions-ci-workflow/IMPACT_ANALYSIS.md) | **GitHub Actions CI workflow** — Phase 2 of the CR-005 split | 🔒 **DEFERRED TO WAVE 2 — 2026-09-13** (was Wave 1b). Blocked on git access + 6 repo secrets + CR-005 P1 close. | P1 / LOW-MEDIUM | **2** (deferred) | grant git access + add 6 secrets after CR-005 P1 closes |
| [CR-2026-09-12-017](./CR-2026-09-12-017-crm-sms-finalization-for-otp/INTAKE_DOC.md) | **CRM SMS finalization for OTP** — prereq for CR-003 | ❌ **PREMISE INVALIDATED 2026-09-14** — investigation (code + live probe) confirmed: CRM is already the SMS provider; frontend calls CRM directly via `crmSendOtp()` → `POST /scan/auth/request-otp`; backend wiring is not needed. CRM v2 endpoint returns HTTP 200 with `dev_otp` in response. **Action:** cancel this CR; real question is whether SMS is physically delivered (owner to confirm on real device). If SMS delivery fails → re-file as a CRM-team investigation, not a customer-app backend CR. | ~~P0~~ **CANCELLED** | — | Owner to check: does SMS arrive on phone `9579504871` when OTP is sent? Answer determines if CRM-team action needed. |

| [CR-2026-09-14-001](./CR-2026-09-14-001-otp-sms-removal/QA_HANDOVER.md) | **Comment out broken OTP SMS path** — frontend (PasswordSetup OTP UI, crmSendOtp/Verify/ForgotPassword/ResetPassword), backend (send-otp endpoint, otp_store, generate_otp, verify_otp, OTPRequest, reset-password, otpRequired* config), admin config (otpRequired* + skipOtp* admin toggles). Code commented with `OTP-DEFERRED` markup, not deleted. Supersedes CR-003 Part A. | 🚧 **IMPLEMENTED 2026-09-15** → 🧪 **QA PASSED — AWAITING OWNER SMOKE** (session after 2026-10-03, Gate 0): `/api/auth/send-otp` → 404 (not 500, so the removal is clean), no OTP UI on admin or customer flows, no `otpRequired*`/`skipOtp*` toggles, customer login/password-setup works end to end without any OTP step. | P2 / LOW | **2** | none |

Dependencies: `002 → {003,004,005,007(F-07)} → 006 → {007,008,009,010, CR-2026-08-03-001} → 011 → (Master Outlet ∥ 012 → 013) → 014`.
Superseded reference: `/app/memory/ARCHITECTURE_PLAN_2026-06_PHASE_A.md` (pre-intake proposal).

## Shared-DB boundary remediation (registered 2026-10-03 — Role 1 INTAKE)

Gap-closure pass over INV-2026-09-15-003 (direct CRM-table access audit) + CRM reply INV-022 +
owner decisions of 2026-10-03. Every remaining live/dead violation now has a registered ID; the
INV folders keep the evidence, these CRs carry the work. **No code changed at intake.**

| ID | Title | Status | Severity / Risk | Files | Blocked on |
|---|---|---|---|---|---|
| [CR-2026-10-03-001](./CR-2026-10-03-001-delete-dead-crm-table-call-sites/INTAKE_DOC.md) | Delete the 14 dead CRM-table call sites in `server.py` (legacy customer API shim) | 📝 REGISTERED — **owner approved (O7)**, READY FOR PLANNING | P3 / HIGH (hotspot file) | 1 BE | nothing — sequence before CR-2026-09-15-004 |
| [CR-2026-10-03-002](./CR-2026-10-03-002-users-read-projection/QA_HANDOVER.md) | **BUG (security)** — admin-auth `db.users` reads load CRM's `api_key`/`authkey_api_key`/`mygenie_token`; add a projection | 🧪 **IMPLEMENTED · QA PASSED — AWAITING OWNER SMOKE** ⚠️ *plan-approval + Role-3 gates were skipped; see `/app/memory/GATE_RECONCILIATION_2026-10-04.md`* — 30 fields → 9; `api_key`/`authkey_api_key`/`pos_crm_token_response`/`password_hash` gone. **Awaiting QA (Role 4).** Intake's "nothing reads them" **corrected** — `mygenie_token` IS read at `server.py:902`, residual → CR-2026-10-04-001 | **P0** / CRITICAL (admin auth path) | 1 BE (3 edits) | nothing — shipped |
| [CR-2026-10-03-003](./CR-2026-10-03-003-feedback-wrong-schema-crm-collection/INTAKE_DOC.md) | **BUG (data integrity)** — feedback written into CRM's `feedback` collection in our own schema, unreadable by anyone; migrate to `POST /scan/feedback` | 📝 REGISTERED — **A9-b decided 2026-10-03 (hybrid); design frozen**, blocked on CRM shipping the additive CR | P1 / CRITICAL (live write to CRM collection) | 2 FE + 1 BE | CRM feedback CR number + ship date (contract **O-8**) |
| [CR-2026-10-03-004](./CR-2026-10-03-004-pre-login-lookups-to-crm-api/INTAKE_DOC.md) | Pre-login reads → CRM API: `check-customer` → `/scan/auth/lookup`, `loyalty-settings` → `/scan/loyalty-rules/{rid}`, retire `customer-lookup` (F2 = a) | 📝 REGISTERED — BLOCKED | P1 / CRITICAL (`LandingPage.jsx`, `ReviewOrder.jsx`) | 3 FE + 1 BE | CRM **CR-093** + **CR-094** not yet shipped (contract **O-9**) |
| [CR-2026-10-03-005](./CR-2026-10-03-005-call-waiter-pay-bill-no-op-buttons/INTAKE_DOC.md) | **BUG (customer-visible)** — Call Waiter / Pay Bill buttons are silent no-ops in the live UI | 📝 REGISTERED — **Q-CA-6 answered: the endpoints were correct all along, premise withdrawn.** Blocked on POS consumption + owner direction | P2 / HIGH (two hotspot pages) | 3 FE | POS **P1** + owner direction (contract **O-4**); interim mitigation decidable today |

| [CR-2026-10-03-006](./CR-2026-10-03-006-franchise-multi-outlet-admin/INTAKE_DOC.md) | **Franchise support** — an admin managing several outlets must be able to choose which one they administer (POS confirmed `restaurants[]` can hold multiple entries) | 📝 REGISTERED — BLOCKED | P2 / CRITICAL (admin auth + every per-restaurant write) | 4 FE + 1 BE | POS multi-entry response shape (**O-13**); must land **after** CR-2026-09-15-004 |

Already-registered siblings on this track: **CR-2026-09-15-001** (profile v2 adapter, approved to
plan) · **CR-2026-09-15-002** (skip-otp dead branch, parked) · **CR-2026-09-15-003** (canonical
phone, parked — India-only) · **CR-2026-09-15-004** (admin login off CRM `users`, Option D, gated
on F3 + POS P5; its P0 sub-item is now **CR-2026-10-03-002**).

Not registered as CRs (deliberately): CRM-side work (CR-093/094/095, board JSON, GAP-11), POS
questions (P1/P4/P5), signing `OWNERSHIP_MAP.md`, and `CR-2026-09-15-004/IMPACT_AND_NEW_FLOW.md`
(a Planning artefact inside an existing CR, not a new item).

Boundary scorecard after all five close: direct touches on CRM-owned collections **20 → 0**.

## Code-Correctness Sprint (opened in the session after 2026-10-03)

Owner-approved batch: **Gate 0 + Track A + Track B + Track C** — fix the code before adding
functionality. Full plan, sequencing and the 7 owner decisions (D-S1…D-S7):
**`/app/memory/SPRINT_CODE_CORRECTNESS.md`**.

| ID | Title | Status | Severity / Risk | Files | Blocked on |
|---|---|---|---|---|---|
| [CR-2026-10-04-001](./CR-2026-10-04-001-table-config-mygenie-token-fallback/INTAKE_DOC.md) | `GET /api/table-config` falls back to CRM's `users.mygenie_token`, pinning one CRM secret to the admin auth path | 📝 REGISTERED (Role 1 done) — residual of CR-2026-10-03-002 | P2 / HIGH (hotspot; **two-POS-identity trap**) | 1 BE | owner direction on §4 A/B/C/D |
| [CR-2026-10-04-002](./CR-2026-10-04-002-test-harness-defects/INTAKE_DOC.md) | **BUG (test infra)** — suite could not run: self-inflicted 429 from CR-2026-09-12-004's own rate limit, wrong `testpaths`, plugins absent from pod | 🧪 **IMPLEMENTED + self-tested, AWAITING OWNER ACK** ⚠️ *gates skipped — see GATE_RECONCILIATION_2026-10-04.md* — 17 passed/4 errors → **21 passed, 12 snapshots, 0 errors** | P1 / LOW (test-only) | 2 test files | nothing — done |
| [CR-2026-10-04-003](./CR-2026-10-04-003-admin-reload-logout-race/INTAKE_DOC.md) | **BUG** — hard reload of any `/admin/*` route logged the admin out; `AdminLayout` redirected before `AuthContext` restored the session | ↩️ **REVERTED BY OWNER DECISION** — fix implemented then withdrawn; belongs to CR-2026-09-12-008 (out of sprint, D-S1). **Bug is still LIVE**: admins must re-login after any refresh. Intake + impact + line-by-line plan retained; requirement handed to -008 as `PREWORK_FROM_CR-2026-10-04-003.md` | P1 / LOW | 1 FE | nothing — done |

### Gate 0 result (session after 2026-10-03) — **QA PASSED, awaiting owner smoke**

Two CRs that had been merged in earlier sessions and marked *"awaiting QA (Role 4)"* for weeks were
finally QA'd, and **both pass**: **CR-2026-09-12-004** (rate limit fires under burst; all 5 security
headers present) and **CR-2026-09-14-001** (`/api/auth/send-otp` → 404, no OTP UI, no
`otpRequired*` toggles, customer flow unaffected). Both now have regression tests
(`backend/tests/smoke/test_cr_2026_09_12_004.py`) so they cannot silently rot again.
**CR-2026-10-03-002 QA PASSED** — and QA found one unrelated P1 (**CR-2026-10-04-003**), whose fix the owner then **reverted** into CR-2026-09-12-008's scope; that bug remains live.
Suite: **25 passed · 12 snapshots · 0 errors**. QA report: `/app/test_reports/iteration_2.json`.


**Correction to the record (5th on this track):** CR-2026-09-12-005 is registered as
*"✅ CLOSED — 22/22 PASS, safety net live."* On a fresh pod the suite **could not complete a green
run** (missing plugins, then 429 from a sibling CR's rate limiter). Fixed as CR-2026-10-04-002.
Measured coverage is **~16 of 44 routes** — the uncovered set is the money-and-identity surface
(`/orders`, `/points`, `/wallet`, `/profile`, `/set-password`, `/verify-password`, `/feedback`…).
Owner decision **D-S2**: extend snapshots to all 44 routes **before** the monolith split.

**Measured state of the code, re-verified this session (not from docs):** `server.py` **1,878**
lines (not 1,829) · **21** direct CRM-table touches (not 20) · **65** occurrences of `716` ·
`ReviewOrder.jsx` **2,070** lines. Zero architecture work has been built.


### Contract freeze (2026-10-03)

CRM replied twice to INV-022. Round 2 settled A9-b and Q-CA-6, so the exchange has been collapsed
into one signable document: **`/app/memory/control/CONTRACT_CUSTOMER_APP_CRM_v1.0.md` (v1.0-RC1)**.
Part 1 (ground rules · collection ownership · identity · endpoint-by-endpoint API contract ·
accepted limitations · execution sequence) is **ready to sign**. Part 2 (§7) lists the 9 items
that still block a full freeze — the biggest being **O-1**, CRM's ownership-board JSON, which was
referenced in round 2 but never reached us and which gates `OWNERSHIP_MAP.md` (and therefore
CR-2026-09-12-006, CR-010 and CR-014).

**Update — CRM's ownership-board JSON received 2026-10-03 (contract item O-1 closed).** 39
collections, code-scanned with read/write counts and file:line. Reconciled in
`INV-002/RECONCILIATION_CRM_BOARD_2026-10-03.md`: **36 of 39 rows agree**, including all 8 rows we
had previously assigned by elimination. Contract bumped to **v1.0-RC2** with §2 completed; O-1, O-2
and O-3 closed; four new items opened — **D-1** `pos_event_logs` owner semantics (CRM assigns
ownership to the consumer, our rule assigns it to the sole writer), **D-2** `orders`/`order_items`
"Shared (POS-origin)" label, **D-3** `otp_tokens` contradicts CRM's own round-1 E3, and **O-10** a
`users` change-notice gap created by CRM withdrawing B4 while we still read that collection on
every admin request. **`OWNERSHIP_MAP.md` deliberately still unedited** — the CRM half is in, but
POS P1/P4/P5 and three owner rulings remain.

**Owner rulings 2026-10-03 → contract v1.0-RC3.** **D-1** `pos_event_logs` owner = **CRM** (the sole
writer), consumer = POS required, inert until POS consumes — CRM's proposal to assign ownership to
the consumer was declined so that "owner = writer" stays consistent across all 39 rows. **D-2**
`orders`/`order_items` owner = **CRM**, annotated "originates in POS via webhook"; the "Shared"
label rejected. **O-4** (Call Waiter / Pay Bill direction) and the **Pay-Bill definition** referred
to **POS** → `INV-002/QUESTIONS_FOR_POS_2026-09-15.md` extended with **P1-refined, P5, P6, P7**
(P2/P3 closed by CRM, P4 parked). Pay-Bill semantics reserved as contract clause **§3 I6**: a
request to settle at the table, **never** an in-app payment. **All 39 ownership rows now have an
owner; Part 1 of the contract is ready for signature.** Remaining blocker is **POS**, plus F3.

**CRM SIGNED Part 1 on 2026-10-03** (`INV-003/crm_replies/CONTRACT_v1.0_CRM_SIGNOFF.md`; validated
clean in `INV-003/VALIDATION_OF_CRM_SIGNOFF_2026-10-03.md` — no conflicts, no conditional clauses).
CRM **concurs** with the D-1/D-2 rulings, so those rows are now mutually agreed rather than
unilaterally ruled. **D-3, O-8 and O-10 closed**: `otp_tokens` confirmed as a separate staff
password-reset store (E3 was scoped to customer OTP); feedback CR = **CR-096**, `restaurant_id` =
short form; and **CRM agreed to give advance notice before renaming any of the six `users` fields**
until our POS switch lands — the item most likely to have caused a silent admin-login outage.
**CONTRACT PART 1 §1-§6 IS NOW FROZEN — countersigned by the owner 2026-10-03.** It may only change under §8 change control (written agreement from both teams + version bump). §7 stays open and is owed by **POS** (P1-refined, P5, P6, P7) and the **owner** (F3, O-7); nothing in §7 reopens Part 1, and POS is not a Part-1 signatory.
Two findings from validating the sign-off: CRM's per-tier `*_earn_percent` warning is **already
satisfied** in our code (`LoyaltyRewardsSection.jsx:29`), so CR-094 is a URL swap; and CR-093's
`exists` **must** be mapped to our `found` flag or the first-visit-bonus line will show for every
diner — both recorded in CR-2026-10-03-004 §1a.

**Owner decisions on the POS reply (2026-10-03):** amendment **A-1 drafted** for CRM
(`control/AMENDMENT_A-1_pos_event_logs_consumer.md`, awaiting owner sign-off) · POS **not** being
chased for the two missing shapes — they said they would come back · **franchise support split out
as CR-2026-10-03-006**, so CR-2026-09-15-004 stays single-outlet on `restaurants[0]` (no
regression — identical to today's behaviour and CRM's) with a new acceptance criterion that the
backend **warns when it ignores extra outlets** · Call Waiter "not live" clarified as **not built
yet, not cancelled** → CR-2026-10-03-005 is **parked, not withdrawn**; buttons, flags and CRM
endpoints all stay in place · **still in INTAKE** — no code, no Planning artefacts.

**POS replied 2026-10-03** (`INV-002/VALIDATION_OF_POS_REPLY_2026-10-03.md`). **P1 = (b): POS does
not read `pos_event_logs`** — so with CRM write-only and us never touching it, **no component
anywhere reads that collection**; Call Waiter / Pay Bill cannot work in the current architecture,
not merely "not yet wired". POS then **parked** the direction (P2) and the Pay-Bill semantics (P3)
— "feature is not live" — so **CR-2026-10-03-005 is PARKED** with evidence. **P4.2: `restaurants[]`
CAN hold multiple entries, for franchises** → **CR-2026-09-15-004 scope widened**: it now needs an
outlet picker and a selected-outlet concept threaded through every per-restaurant admin operation,
not just an identity swap. Two shapes still owed by POS (**O-14** profile path + shape — their "ok"
acknowledged rather than answered P4.1; **O-13** multi-entry shape), plus **P4.3** (rate limit /
token lifetime / refresh), whose rationale is written up for them.

🔴 **First change-control event: contract amendment A-1.** Frozen §2d annotates `pos_event_logs` as
*"consumer = POS — required"*, which POS's answer makes factually wrong. **It has not been edited** —
§2 is frozen, so under **§8 C1** this needs written agreement from CRM plus a version bump to
**v1.1**. Proposed text: *consumer = NONE as at 2026-10-03; a consumer must be designated before
any producer is wired.* Ownership unchanged (CRM remains sole writer).

**Measured, not assumed:** the owner's "buttons are already hidden by configuration" was verified
against the live shared DB — true for **12 of 13** tenants, but restaurant **`672`** has
`showLandingPayBill: true` and is showing a dead Pay Bill button today. Also found: the two
`showLanding*` flags have **no admin toggle** (`VisibilityTab.jsx` / `AdminVisibilityPage.jsx`
expose only `showCallWaiter`/`showPayBill`), so 672's flag cannot be cleared from the admin UI.
Both recorded in CR-2026-10-03-005 §1b.

Supporting artefacts: `INV-003/VALIDATION_OF_CRM_REPLY_ROUND2.md` (row-by-row verdict, 2 corrections
to our own record) · `INV-003/REPLY_TO_CRM_ROUND2_AND_FREEZE.md` (draft reply + freeze request,
awaiting owner sign-off) · `INV-003/crm_replies/INV_022_CRM_REPLY_TO_CUSTOMER_APP_ROUND2.md`.

### Security escalation — INV-2026-10-03-001 (2026-10-03)

Contract item **O-16** has been **escalated out of the contract** into its own security
investigation on owner instruction: [INV-2026-10-03-001](./INV-2026-10-03-001-uat-secrets-and-pii-exposure/INTAKE_DOC.md).
Two findings: (1) preprod issues a **static `dp_live_`-prefixed CRM credential** — obtainable by
anyone with a preprod POS account, and almost certainly the `api_key` on CRM's `users` row;
(2) the **shared UAT database holds real customer PII**, including **114 `customer_documents`**
(hotel guest identity documents), admin emails and `password_hash`.

**P1 SECURITY · owning team DevOps/Ops** (+ CRM, POS). **No Customer App code change expected** —
the defect is in environment and data-handling practice, so filing it as a code CR would bury it in
a queue nobody who can fix it reads. Brief ready to send:
`INV-2026-10-03-001/BRIEF_FOR_DEVOPS_UAT_DATA_HYGIENE.md`. The secret value is **not recorded in
any document**; raw HTTP responses were deleted; no production access was attempted and no DB
writes were made. Its **Q9** (preprod/production shared secrets) pairs with contract **O-7**.

Direct consequence for the registry: **this finding is the evidence that CR-2026-10-03-002 is a
real P0** — the `api_key` it projects away is demonstrably a live-prefixed credential, not a
theoretical secret.

## ID convention (per operating prompt §ID Format line 1364 + repo precedent)

> **See the `## ID Scheme` section above** for the authoritative arbitration between
> `BUG-NNN` (frozen legacy), `CR-YYYY-MM-DD-NNN` (active), and `INV-YYYY-MM-DD-NNN` (active).

| Prefix | Meaning | Example in this session |
|---|---|---|
| `CR-YYYY-MM-DD-NNN` | Change Request (code, data, or ops change) | CR-2026-07-03-003 |
| `INV-YYYY-MM-DD-NNN` | Investigation only (no code) | INV-2026-07-03-001 |
| `BUG-NNN` | **FROZEN** legacy sequence (001–050). No new IDs issued in this format after 2026-07-03. | BUG-048 |

## Blocking / Dependencies

```
CR-000 ─── (independent, ship anytime)
CR-001 ── SHIPPED
CR-002 ── SHIPPED (needs admin QA)
CR-003 ── SHIPPED
         └── CR-009 (needs ops)
CR-004 ── blocked by ─→ INV-2026-07-03-001 (audit)
CR-005 ── independent; depends on 001/002 which shipped
INV-001 ── prerequisite for CR-004
CR-007 ── independent (ops+security)
CR-008 ── independent (DATA)
CR-009 ── depends on CR-003 (shipped) — just needs ops wiring
```

## Recommended execution order (if capacity allows)

1. **CR-2026-07-03-009 F-13** — free win, ops-only, 30 min.
2. **INV-2026-07-03-001** — audit, unblocks CR-004.
3. **CR-2026-07-03-000** — security P1, security team owns.
4. **CR-2026-07-03-007** — deploy env; often blocks real go-live.
5. **CR-2026-07-03-004** (after INV-001 verdict).
6. **CR-2026-07-03-008** — DATA; coordinate with operator team.
7. **CR-2026-07-03-005** — cleanup, ship anytime.

## Artefacts per item (per operating prompt §22)

| ID | INTAKE_DOC | CR.md | IMPLEMENTATION_PLAN | QA_HANDOVER |
|---|---|---|---|---|
| CR-000 | ✅ | ✅ | — | — |
| CR-001 | ✅ | ✅ | — | ✅ |
| CR-002 | ✅ | ✅ | ✅ | ✅ |
| CR-003 | ✅ | ✅ | ✅ | ✅ |
| CR-004 | ✅ | ✅ | ✅ | — |
| CR-005 | ✅ | ✅ | — | — |
| INV-001 | ✅ | ✅ | — | — |
| CR-007 | ✅ | ✅ | — | — |
| CR-008 | ✅ | ✅ | — | — |
| CR-000 | ✅ | ✅ | ✅ (FINDINGS + IMPACT + PLAN) | — |
| CR-010 | ✅ | ✅ | ✅ (IMPACT + PLAN) | ✅ |
| CR-011 | ✅ | ✅ | — | — |
| CR-012 | ✅ | ✅ | — | — |
| CR-2026-07-04-002 | ✅ | ✅ | — | — |
| CR-2026-07-04-003 | ✅ | ✅ | — | — |
| CR-2026-07-04-004 | ✅ | ✅ | — | — |
| CR-2026-09-12-001 … 014, INV-2026-09-12-001 | ✅ (15 items) | — (INTAKE_DOC carries CR content) | — | — |

## Legacy backfill — 23 items that existed on disk with no registry row

Registered under **[CR-2026-10-04-004](./CR-2026-10-04-004-registry-reconciliation/INTAKE_DOC.md)**
(Role 1 Intake, session after 2026-10-03, owner-approved).

Statuses below are taken **verbatim from each folder's own documents**, not inferred. Where a
folder carries no status line, the row says so rather than guessing. Per **R1 (code is truth)**,
where a folder's `CR.md` and its `QA_HANDOVER.md` disagree, the QA artefact wins and the conflict
is flagged.

Owner decision **D-R2:** the three `2026-02-XX` IDs are registered **as-is**. The day of month was
never recorded ("Registered: 2026-02 (this session)"), git cannot recover it (repo cloned fresh),
and the three IDs carry **22 code markers across 4 CRITICAL hotspot files**
(`ReviewOrder.jsx` 11, `CartContext.js` 4, `DeliveryAddress.jsx` 4, `LandingPage.jsx` 3).
Renaming would invent a date and churn open work. Canonicalisation may be filed separately.

### Change requests (12)

| ID | Title | Status (from its own docs) | Severity | Files | Owner action needed |
|---|---|---|---|---|---|
| [CR-2026-02-XX-001](./CR-2026-02-XX-001-reviewOrder-landing-fetch-timeouts/QA_HANDOVER.md) | Wrap 5 raw `fetch()` calls in `ReviewOrder.jsx` + `LandingPage.jsx` with `fetchWithTimeout` (8 s read / 15 s write) — residual exposure from PROD-INCIDENT-2026-07-02-001 | ✅ **IMPLEMENTED + testing_agent VERIFIED (5/5 PASS)** — awaiting owner smoke. ⚠️ **DRIFT (F3):** its `CR.md` still says *"REGISTERED — Planning stage"*; the QA handover and the live code markers both say shipped | P1 | 2 FE (+11/−9) | **owner smoke** |
| [CR-2026-02-XX-002](./CR-2026-02-XX-002-restaurant-699-takeaway-charge/INTAKE_DOC.md) | Restaurant 699 — ₹10 takeaway charge via `delivery_charge` (temporary, GAP-021) | ⚠️ **CODE IS LIVE BUT ITS OWN HANDOVER SAYS APPROVAL WAS STILL PENDING** (blockers B3+B4). Shipped **estate-wide from POS `takeaway_charges`**, not the 699-only hardcode requested. Escalated as **[CR-2026-10-04-005](./CR-2026-10-04-005-takeaway-surcharge-scope-deviation/INTAKE_DOC.md)** | **P1** (raised from P2 — blast radius is estate-wide) | 1 FE (`ReviewOrder.jsx`) | **answer Q1–Q4 on CR-2026-10-04-005** |
| [CR-2026-04-11-001](./CR-2026-04-11-001-order-placement-fixes/QA_HANDOVER.md) | Order placement fixes | 🚧 **IMPLEMENTED — QA PENDING.** Its own doc states *"IMPLEMENTED in code — **no QA artifact exists**"* | P1 | FE | QA then owner smoke |
| [CR-2026-05-30-001](./CR-2026-05-30-001-config-mandatory-fields-and-scan-misrouting/CR.md) | Config mandatory fields + table/room scan misrouting | 🚧 **IMPLEMENTED (Item 1: skipOtp + mandatory fields).** Items 2 & 3 (misrouting root cause) **parked by design** — CR-2026-05-30-002 shipped as the policy workaround | P1 | FE + BE | none — parked items are deliberate |
| [CR-2026-05-30-002](./CR-2026-05-30-002-restrict-non-qr-orders/IMPLEMENTATION_PLAN.md) | Restrict non-QR orders (policy workaround for the above) | 🚧 **IMPLEMENTED** — all components shipped (3 new FE files + 6 FE edits + 1 BE endpoint); status verified by code read 2026-06-17 | P1 | 9 FE + 1 BE | QA/smoke confirmation |
| [CR-2026-06-17-001](./CR-2026-06-17-001-menu-order-enhancements/QA_REPORT.md) | Menu order enhancements (2 phases) | 🧪 **QA PASSED (Phase 1 + Phase 2)** — ready for owner sign-off / closure | P2 | FE + BE | **owner sign-off** |
| [CR-2026-06-17-002](./CR-2026-06-17-002-channel-preview-in-admin/QA_HANDOVER.md) | Channel preview in admin | 🚧 **IMPLEMENTED — QA PENDING** (all 3 items shipped, self-test passed, unverified since 2026-06-17) | P2 | FE | QA |
| [CR-2026-06-17-003](./CR-2026-06-17-003-customer-menu-availability/QA_HANDOVER.md) | Customer menu availability | 🚧 **IMPLEMENTED — QA PENDING** (all 3 items shipped, self-test passed, unverified since 2026-06-17) | P2 | FE | QA |
| [CR-2026-06-17-004](./CR-2026-06-17-004-delivery-gst-backend-key/IMPACT_ANALYSIS.md) | Delivery GST backend key | ✅ **IMPLEMENTED + QA PASSED** (iteration 11, 2026-06-18) | P2 | BE | owner closure |
| [CR-2026-08-06-001](./CR-2026-08-06-001-time-controlled-ordering/QA_REPORT.md) | Time-controlled ordering | 🚧 **IMPLEMENTATION COMPLETE — QA READY** (unverified since 2026-08-06) | P2 | FE + BE | QA |
| [CR-2026-09-07-001](./CR-2026-09-07-001-inventory-stock-out-control/QA_REPORT.md) | Inventory / stock-out control | ✅ **QA CLOSED — QA PASS 2026-09-08** | P2 | FE + BE | owner closure |
| [CR-2026-09-08-001](./CR-2026-09-08-001-menuitem-no-image-add-channel-guard/INTAKE_DOC.md) | Menu item with no image + add-channel guard | 📝 **INTAKE COMPLETE** — awaiting owner approval to open the Planning gate | P2 | TBD | **approve Planning gate** |

### Bugs (3) — `BUG-YYYY-MM-DD-NNN` scheme

| ID | Title | Status (from its own docs) | Severity | Files | Owner action needed |
|---|---|---|---|---|---|
| [BUG-2026-02-XX-001](./BUG-2026-02-XX-001-delivery-charge-not-calculated/SESSION_HANDOVER_R5.md) | Delivery charge not calculated on Select-Address page even when the address is serviceable. Root cause: distance API called with `order_value` hardcoded to `'0'`, so value-tiered rules evaluate against zero | 🚧 **IMPLEMENTATION COMPLETE — OWNER SMOKE TEST PENDING.** 13 docs, 5 fix rounds (R2–R5), and a **documented owner smoke FAILURE on 2026-07-13** before the later rounds | **P1 — money path** | `DeliveryAddress.jsx`, `CartContext.js`, `RestaurantConfigContext` | **owner smoke** (previous one failed) |
| [BUG-2026-09-08-001](./BUG-2026-09-08-001-response-not-defined-422-crash/QA_HANDOVER.md) | `response` not defined → 422 crash | 🚧 **IMPLEMENTATION COMPLETE — awaiting QA** (full artefact set: impact, plan, investigation, QA handover, QA report) | P1 | BE | QA |
| [BUG-2026-09-10-001](./BUG-2026-09-10-001-image-upload-local-disk/IMPLEMENTATION_PLAN.md) | Image upload writes to local disk (lost on pod restart) | 📋 **PLAN WRITTEN — awaiting owner approval to implement.** A `QA_REPORT_WAVE_0_SIGNOFF.md` exists alongside, so state needs an owner read | P1 | BE | **approve implementation** |

### Investigations (7)

| ID | Title | Status (from its own docs) | Severity | Owner action needed |
|---|---|---|---|---|
| [INV-2026-10-03-001](./INV-2026-10-03-001-uat-secrets-and-pii-exposure/INTAKE_DOC.md) | **Production-grade secrets and real customer PII in UAT / preprod** — static `dp_live_` CRM credential; shared UAT DB holds real PII incl. 114 `customer_documents` | 📝 **REGISTERED — brief ready to send to DevOps/Ops.** Was **entirely absent from this registry until now**, which is the single most serious consequence of the drift | **P1 SECURITY** | **send `BRIEF_FOR_DEVOPS_UAT_DATA_HYGIENE.md`**; confirm whether it has gone out |
| [INV-2026-09-10-001](./INV-2026-09-10-001-logo-upload-emergent-storage/CLOSURE_NOTE.md) | Logo upload → Emergent object storage | ✅ **CLOSED** — two distinct root causes confirmed; closure note written | P2 | none |
| [INV-2026-06-17-001](./INV-2026-06-17-001-tableless-order-bypass/INVESTIGATION_REPORT.md) | Table-less order received despite the non-QR block | 🔬 **REPORT WRITTEN** — root cause: **3 bypass paths**, incl. table-status check skipped when `finalTableId === '0'`. No status line in source | P1 | ruling on whether the 3 paths get fixed |
| [INV-2026-06-17-002](./INV-2026-06-17-002-menu-order-investigation/INVESTIGATION_REPORT.md) | Menu-order admin interface — full data flow (+ default ordering, POS payload mapping) | 🔬 **REPORT WRITTEN** — knowledge request, not a bug (*"Root cause: N/A"*). 3 documents | P3 | none |
| [INV-2026-06-17-003](./INV-2026-06-17-003-room-qr-flow/INVESTIGATION_REPORT.md) | Room QR scan flow — status check, UI states, new-order capability | 🔬 **REPORT WRITTEN** — documents that multi-menu restaurants (e.g. 716) **skip the table-status check entirely** at landing. No status line in source | P2 | feeds CR-2026-08-03-001 |
| [INV-2026-07-03-002](./INV-2026-07-03-002-restaurant-709-provisioning/INVESTIGATION_REPORT.md) | Restaurant 709 provisioning | 🔬 **REPORT WRITTEN** — intake + report present, no status line in source | P2 | ops |
| [INV-2026-07-03-003](./INV-2026-07-03-003-restaurant-698-provisioning/INVESTIGATION_REPORT.md) | Restaurant 698 provisioning | 🔬 **REPORT WRITTEN** — intake + report present, no status line in source | P2 | ops |

### Production incidents (1)

| ID | Title | Status | Note |
|---|---|---|---|
| [PROD-INCIDENT-2026-07-02-001](./PROD-INCIDENT-2026-07-02-001-atlas-slowness-frozen-tab/RE_INVESTIGATION_REPORT_2026-02.md) | Atlas slowness → frozen customer tab | 🔬 RE-INVESTIGATION REPORT WRITTEN | **Folder renamed** under D-R3 from `PROD-INCIDENT-2026-07-02-21:30-IST` — a colon in a path is a portability hazard. All 5 references updated; 0 residual |

### New items raised by this pass (4)

| ID | Title | Status | Severity / Risk | Owner action needed |
|---|---|---|---|---|
| [CR-2026-10-04-004](./CR-2026-10-04-004-registry-reconciliation/INTAKE_DOC.md) | **Registry reconciliation** — 23 unregistered items; 15 code markers referencing unregistered IDs; findings F1–F7 | ✅ **EXECUTED** this session (docs only, no app code) | P1 / LOW | review findings F1–F7 |
| [CR-2026-10-04-005](./CR-2026-10-04-005-takeaway-surcharge-scope-deviation/INTAKE_DOC.md) | **Takeaway surcharge shipped estate-wide** from POS `takeaway_charges` instead of the 699-only hardcode requested, without its recorded approval | 📝 REGISTERED (Role 1 done) | **P1 / HIGH** (`ReviewOrder.jsx`, order totals) | **answer Q1–Q4**; V1 exposure check can run read-only first |
| [CR-2026-10-04-006](./CR-2026-10-04-006-google-sheet-registry-mirror/INTAKE_DOC.md) | **Google Sheet registry mirror** (intake rev 2) — machine-readable index (YAML/JSON) as source of truth, generating both these markdown tables and the Sheet. **One-way only**; an append-only change log replaces sync-back. Requests a new **ROLE 13 — REGISTRAR** in the operating prompt | 🚧 **IMPLEMENTED (QA-pending — needs owner smoke + the 78-row status adjudication)** (Role 3, gate 5, 2026-10-05). Built: `memory/tools/registry_sync.py` (bootstrap · audit · propose · sync), `index.yml` (**78 records**), `CHANGELOG.md`, `.registry_state.json`. Sheet **`Scan and Order issue tracker`** live with 9 tabs. **Auth changed by owner to an OAuth *Desktop* client** (not the planned service account) — recorded in [AUTH_AMENDMENT.md](./CR-2026-10-04-006-google-sheet-registry-mirror/AUTH_AMENDMENT.md); still **0 routes added to `server.py`**, 0 new deps. Self-test 9/9 incl. V1/V2/V3/V7/V8/V11/V16/V20/V21. 🔴 **All 6 gate tabs are empty** — `status` is unadjudicated for all 78 items and is never guessed (O-G4); see [STATUS_WORKSHEET.md](./CR-2026-10-04-006-google-sheet-registry-mirror/STATUS_WORKSHEET.md). 2 declared deviations: 9th `All Items` tab, and `money_path` as an 18th field | P2 / **LOW** (downgraded from MEDIUM — two-way sync removed, so no write path into the registry) | 0 app files; `memory/tools/registry_sync.py` + 3 generated | **adjudicate the 78 statuses** (worksheet ready) · confirm OAuth consent is *Published* not *Testing* (7-day token expiry risk) · ratify the 7 money-path items · rule on ROLE 13 · ratify the 2 deviations |
| [INV-2026-10-04-001](./INV-2026-10-04-001-legacy-bug-id-status-reconstruction/INTAKE_DOC.md) | **Legacy `BUG-NNN` status reconstruction** — 19 IDs survive across 33 docs with no status source; prompt claimed 10 open incl. 2× P0 | 📝 REGISTERED (Role 1 done) — no blockers | P1 / LOW to run | assign Role 6 |

### Audit findings recorded (§10.6)

| # | Finding |
|---|---|
| F1 | **15 IDs carried live code markers with no registry row** — now all registered |
| F2 | **Ghost ID `INV-2026-08-06-001`** — appears in a code marker, has no folder and no row anywhere. Origin unknown |
| F3 | **Status drift** inside `CR-2026-02-XX-001` (its `CR.md` says "Planning", its QA handover says shipped and verified) |
| F4 | **`CR-2026-02-XX-002` shipped beyond its approved scope** → CR-2026-10-04-005 |
| F5 | The registry's own ID-Scheme section pointed into the absent `/app/memory_repo` — **corrected above** |
| F6 | **`CR-2026-07-03-010` is marked ✅ SHIPPED** but left 3 `XX`-day IDs, a colon-bearing folder and 23 unregistered items behind. Recorded, not re-opened |
| F7 | **19 legacy `BUG-NNN` IDs with no status source** → INV-2026-10-04-001 |

**Not done, deliberately:** the operating prompt's addendum Part B §10 carries the same stale
`memory_repo` references. A corrected replacement was drafted and the owner has **held it for
review** (D-R7). Editing the prompt requires owner approval per §7, so it is unchanged.

**Registry rows: 52 → 79.** `grep` for code markers referencing unregistered IDs now returns **0**
(excluding the F2 ghost, which has no artefacts to register).

## What this registry is NOT

- Not an issue tracker. This is a session-scoped planning artefact.
- Not a substitute for a real ticketing system. Owner should port these to whatever tracker they use.
- Not evidence of implementation for anything marked ✅ — SHIPPED. Refer to each folder's `QA_HANDOVER.md` for that.

## Session shipping summary

- **Session dates:** 2026-07-03 (initial) + 2026-07-04 (continuation)
- **Items raised:** 16 (14 CR + 1 INV + 1 tombstone; CR-006 tombstoned in favour of INV-2026-07-03-001)
- **Shipped (code merged + self-tested):** 3 (001, 002, 003)
- **Shipped (docs-only, self-tested):** 1 (010 — registry hygiene)
- **Resolved by owner assertion:** 1 (INV-001 — order-create idempotency, D-02)
- **Implemented, awaiting owner smoke:** 2 (000, 004)
- **Planned (Role 2 complete, awaiting owner approval / prereqs):** 1 (005)
- **Registered (Role 1 complete):** 8 (007, 008, 009, 011, 012, plus new 2026-07-04 items 002/003/004)
- **Process compliance:** Role 1 (INTAKE) was skipped initially; retroactively remediated on 2026-07-03. Full ID-scheme canonicalization performed by CR-2026-07-03-010. CR-000 upgraded from stub to full Role 6+2+3 flow; CR-011 (full POS proxy) and CR-012 (doc scrub + CI lint) filed as its architectural + hygiene follow-ups. CR-004 shipped in plumbing scope; residual UI + admin work filed as CR-2026-07-04-003. Owner-asked telemetry gap filed as CR-2026-07-04-004. Registry canonicalization finish-up (A/B/C from CR-010 §8) filed as CR-2026-07-04-002.

---

## Previously unregistered items — backfilled 2026-10-06

Two folders existed on disk with **no ID at all**, so they could not be indexed and were invisible to
every count, the Summary tab and the Tech Dashboard. Both contain completed work.

**Root cause:** `CR-2026-07-03-010` (registry hygiene / ID-scheme canonicalisation) explicitly listed
both by name under *"files NOT touched"*, treating them as closed folders whose internal artefacts
were out of scope. The CR that should have caught them scoped them out. Surfaced by
`CR-2026-10-04-006`'s audit (*"folders without a well-formed ID"*) and ID'd on owner instruction.

| ID | Title | Status | Priority | Files | Owner action |
|---|---|---|---|---|---|
| [CR-2026-XX-XX-001](./CR-2026-XX-XX-001-round-up-payload-gap/ROUND_UP_PAYLOAD_GAP_INVESTIGATION_REPORT.md) | **`round_up` payload gap** | 📝 **UNADJUDICATED** — backfilled, status pending owner ruling. Carries investigation report, implementation plan, implementation report **and** QA report, i.e. a completed plan→implement→QA lifecycle | TBD | TBD | adjudicate status; confirm `Type` = CR (code shipped) rather than INV; **supply a registration date — no date appears anywhere in its documents** |
| [INV-2026-05-01-001](./INV-2026-05-01-001-metadata-branch-diff/METADATA_BRANCH_DIFF_INVESTIGATION_REPORT.md) | **Metadata branch diff: `main` vs `14-may`** | 📝 **UNADJUDICATED** — backfilled, status pending owner ruling. Investigation report, Phase 1 cherry-pick plan, Phase 1 file-restore execution report | TBD | TBD | adjudicate status; date `2026-05-01` derived from the earliest date in its own documents |

**Judgement calls made, cheap to reverse:**
- `CR-2026-XX-XX-001` uses the `XX-XX` placeholder because **no date exists in any of its four
  documents** — month and day are both unknown. The year is assumed 2026 in line with every other
  item. `Registered` stays blank; per contract §3 the owner fills it.
- Its `Type` was set to **CR** rather than INV because it shipped code through a full implement→QA
  cycle. The folder name says "investigation" and its first artefact is an investigation report, so
  INV is arguable.
- `INV-2026-05-01-001` is dated from the **earliest** date found in its documents (`2026-05-01`; the
  other is `2026-05-13`).

**Effect:** registry goes **78 → 80 items**, with nothing on disk invisible. Both are **Unrouted**
until adjudicated — a valid transitional state under contract v1.1 §4 (back-catalogue interim).
`round_up` is also a **money-path candidate** (scored 56 on money-path keyword density in
`CR-2026-10-04-006`'s impact analysis §16.1) that could not previously be tagged because it could not
be indexed.

---

## Intake pass — 2026-10-06 (ROLE 1) · registry 80 → 87

Full record, method and the four deliberate non-registrations:
[`INTAKE_PASS_2026-10-06.md`](./INTAKE_PASS_2026-10-06.md).

The previous audit showed 80 indexed / 80 folders with zero orphans, so nothing **on disk** was
unregistered. What it could not see was IDs living in **documents and shipped code** with no row
behind them. A sweep of every `TYPE-YYYY-MM-DD-NNN` token across `memory/`, `backend/`,
`frontend/src` and `tests/` found **89 distinct IDs, 80 registered, 9 unregistered** — of which 7
were real items.

Severities and risks below were proposed by the agent and **ratified by the owner in chat**.

| ID | Title | Status | Severity / Risk | Owner action needed |
|---|---|---|---|---|
| [CR-2026-10-06-001](./CR-2026-10-06-001-walkin-and-tableless-order-enforcement/INTAKE_DOC.md) | **Enforce the non-QR order block** — walk-in QR is an exempt scan type and the table-status check is skipped when `table_id` is `'0'`. Fix CR for `INV-2026-06-17-001`, whose report was written **2026-06-17** and never got one. All 3 bypass paths re-verified live this session | 📝 REGISTERED (Role 1 done) | **P1 / HIGH** (`orderAccessPolicy.js`, `ReviewOrder.jsx`, order-placement path) | **rule on option A/B/C/D.** Only **B** (server-side enforcement) closes the dev-tools bypass, and B overlaps `CR-2026-07-03-011` — plan together if chosen |
| [CR-2026-10-06-002](./CR-2026-10-06-002-multi-menu-table-status-check-skip/INTAKE_DOC.md) | **Multi-menu restaurants skip the table/room status check at landing**, and the manually-picked room is never validated. Skip is keyed to the literal `'716'`. Fix CR for `INV-2026-06-17-003`, also **2026-06-17**, also never given one | 📝 REGISTERED (Role 1 done) | **P1 / HIGH** — upgraded from the parent's P2, rationale in intake §7, **needs ratification** | **answer Q1–Q3.** Q3 collides with `CR-2026-08-03-001`, which is **HELD** on a POS data backfill |
| [INV-2026-08-06-001](./INV-2026-08-06-001-admin-qr-pos-token-session/INTAKE_DOC.md) | **Ghost ID closed out** — admin QR page, POS token expiry handling (fix 2a) + direct order-type QR codes (fix 2b). Both live in `AdminQRPage.jsx`, never owner-verified. Folder and intake **reconstructed from the code markers**; this was finding **F2** of `CR-2026-10-04-004`, origin recorded as *unknown* | 📝 REGISTERED (reconstructed) — fixes already live | P2 / LOW | none required. Optional QA of fix 2a/2b rides on `CR-2026-10-04-001`, which owns the same file |
| [INV-2026-08-03-001](./INV-2026-08-03-001-716-hardcoding-audit/INTAKE_DOC.md) | **Hyatt (716) hardcoding audit** — 27 code-level hardcodings across 8 files plus 3 other hardcoding classes. Complete since August with a full Role 6 sign-off (10/10 steps, HIGH confidence), cited by three documents, and carried **no registry row** | 🔬 REPORT WRITTEN / resolved — subsumed by `CR-2026-08-03-001` | P2 / LOW | none. Remediation stays with `CR-2026-08-03-001` (HELD) |
| [CR-2026-09-12-016](./CR-2026-09-12-016-dead-fe-env-key-deletion/INTAKE_DOC.md) | **Delete dead references to `REACT_APP_CRM_API_KEY` and `REACT_APP_RESTAURANT_ID`.** ID was reserved on 2026-09-12 by decision D-007-2, which ended *"Owner drives Role 1 to file it"* — never filed until now | 📝 REGISTERED (Role 1 done) — Wave 3 | P3 / LOW | none to unblock. **V3 runs first:** if either key is present in `frontend/.env`, the CR's premise is void |
| [CR-2026-06-XX-001](./CR-2026-06-XX-001-architecture-tier-a/INTAKE_DOC.md) | **DUPLICATE** — "architecture tier A" (OTP echo · CORS · `.env.example` · CI). Was a *proposed* ID inside a June handover recommendation, never filed. All four parts shipped under `CR-2026-09-12-003`, `CR-2026-09-12-004`, `CR-2026-07-03-007`, `CR-2026-09-12-005` and `CR-2026-09-12-015` | **DUPLICATE** — registered for traceability only | — | none. Closed on arrival |
| [BUG-2026-10-06-001](./BUG-2026-10-06-001-non-qr-bypass-not-observable/INTAKE_DOC.md) | **Non-QR policy telemetry records blocks but never bypasses.** `postNonQrBlock` sits *inside* `if (policy.block)` at all three checkpoints, so every allow — including every walk-in bypass — is unrecorded; the decision is `console.log`'d to the **customer's own browser** instead. Endpoint, collection and index already exist and need no change. **This is why `CR-2026-10-06-001` cannot be sized** | 📝 REGISTERED (Role 1 done) | **P1 / LOW to fix** | **none to start** — needs no A/B/C/D ruling. The cheapest P1 on the board |

### `CR-2026-10-04-006` — ✅ GATE 2 PASSED, 2026-10-06

Contract **v1.2** merged; **all three SO-raised defects closed** (A and C in v1.1; **B as D-A8**,
resolved at **3** accepted columns — `Status`, `Registered`, `Closed` — against SO's 1-column
recommendation). The amendment carries **21 changes · 36 verifications · 13 phases**, risk **MEDIUM**
(owner ruling R2).

[`IMPACT_ANALYSIS_AMENDMENT.md`](./CR-2026-10-04-006-google-sheet-registry-mirror/IMPACT_ANALYSIS_AMENDMENT.md)
(rev 3) and
[`IMPLEMENTATION_PLAN_AMENDMENT.md`](./CR-2026-10-04-006-google-sheet-registry-mirror/IMPLEMENTATION_PLAN_AMENDMENT.md)
are written, and the owner **accepted the plan line-by-line**, accepting the open items as known
risks (**D-A2** OAuth publishing status, 7th ask; column M protected by omission, not permission).

**GATE 3 is SHUT.** Execution needs `Role 3 approved for CR-2026-10-04-006`, verbatim. Two things the
implementing agent must not get wrong: the **first push after P6 is irreversible** (the live sheet has
no version history we control and four other projects read it — the only rollback is P0's 9-tab
snapshot), and **`changelog()` at `registry_sync.py:536` is not the contract's `Change Log` tab** —
merging them destroys the approval trail (V48).

**Also updated, no new IDs:** `BUG-042` added to `INV-2026-10-04-001` (**the legacy set is 20, not
19** — its ID list was built from documents and never cross-checked against source) · a stale
self-citation inside `INV-2026-09-15-003` corrected to the owning item · the stock-out investigation
referenced by `CR-2026-09-07-001` recorded as that CR's paperwork rather than its own item ·
`CR-2026-10-04-006` addendum for **contract v1.1.1 accepted, 21 changes, risk LOW → MEDIUM**. The two
non-registered IDs are named in [`INTAKE_PASS_2026-10-06.md`](./INTAKE_PASS_2026-10-06.md) §4 and
deliberately kept out of this file, because every ID named here is counted by the audit.

**Note on blank `Status` cells.** All six new rows carry `status: null` in `index.yml`, with their
adjudicated contract value held in `status_note` (`INTAKE` ×3, `IMPLEMENTED`, `CLOSED`, `DUPLICATE`).
`registry_sync.py` still validates the **legacy 13-value** enum, so writing a v1.1 status today would
make every `audit` and `sync` exit 1 against its own registry. The 8-value enum ships with amendment
change **#10**, and all statuses are written in one pass after it.

**Audit after the pass:** 87 indexed · 87 folders · 0 orphans · 0 duplicates · 0 index rows missing
from this README · **1** README-only row remaining — `CR-2026-07-03-006`, the intentional tombstone.
The `INV-2026-08-06-001` ghost is gone.

## Registered 2026-10-07 (Role 1)

| ID | Title | Status | Priority / Risk | Blocked on |
|---|---|---|---|---|
| [CR-2026-10-07-001](./CR-2026-10-07-001-feedback-hybrid-no-token-path/INTAKE_DOC.md) | Feedback for diners without a CRM session — hybrid `{phone, restaurant_id}` path (follow-up to CR-2026-10-03-003 D10=a) | 📝 REGISTERED | P2 / MEDIUM | CRM CR-096 (Wave 3) · CR-2026-10-03-003 CLOSED |
| [CR-2026-10-07-002](./CR-2026-10-07-002-otp-permanent-deletion/INTAKE_DOC.md) | Permanently delete the OTP-DEFERRED code (31 markers / 8 files); retire "restore when live" of CR-2026-09-14-001; confirm to CRM CR-084 on exit. `skipOtp*` live flags **out of scope** (CRM validation first) | 📝 REGISTERED | P2 / LOW logic · HIGH process (hotspots) | none to start |
| [CR-2026-10-08-001](./CR-2026-10-08-001-single-identity-path-skip-otp/INTAKE_DOC.md) | **Single identity path = skip-otp** — remove `/password-setup`, retire `skipOtp*`, landing phone → lookup → skip-otp. **HARD DEADLINE w/c 13 Oct 2026** (CRM CR-098 deletes register/login) | 📝 REGISTERED | **P1 / HIGH** | none for Step 1 |
