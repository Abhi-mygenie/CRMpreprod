# EXECUTION PLAN — Architecture Correction Programme (CR-2026-09-12-001)

Version 1.1 · 2026-09-13 · Wave 1 split into Wave 1a (unblocked) + Wave 1b→Wave 2 (blocked). See `OWNER_DECISIONS_2026-09-12.md` addendum 2026-09-13.
Process: Alpha v0.1 gates. **Every point below is a separate session with an owner-assigned role.** Nothing is coded without its own Planning → owner approval.

Legend — ROLE = role owner assigns for that point · IN = what must exist before it starts · OUT = artefacts produced · DONE WHEN = exit gate · OWNER = what only the owner does.

---

## POINT 1 — Clear the QA backlog (Wave 0) · CR-2026-09-12-002

**Plain English:** Ten pieces of work were built earlier but never formally verified. We test them all before touching architecture, so we start from a known-good state.

- **ROLE:** QA (Role 4). If something fails → owner assigns Bug Fix (Role 5) for that item only.
- **IN:** nothing new. Test credentials in `memory/test_credentials.md`.
- **Order of testing:** 1) BUG-2026-09-08-001 (P0 crash on 422) · 2) CR-2026-07-03-000 · 3) CR-2026-07-03-002 · 4) CR-2026-07-03-004 · 5) CR-2026-08-06-001 · 6) CR-2026-06-17-002 · 7) CR-2026-06-17-003 · then owner-input items 8) BUG-2026-09-10-001 smoke · 9) INV-2026-09-10-001 push confirmation · 10) CR-2026-06-17-001 sign-off.
- **OUT:** `QA_REPORT.md` in each item folder; `README.md` + `PRD.md` statuses updated.
- **DONE WHEN:** every item is CLOSED, DEFERRED (owner rationale) or has a registered bug-fix child.
- **OWNER:** three inputs listed in `OWNER_DECISIONS_2026-09-12.md`.

## POINT 2 — Plan Wave 1a (security + safety net) · CR-005 P1, CR-007 F-07, CR-004

**Plain English:** Write the exact, file-by-file implementation plan for the three unblocked, IA-approved items. No code yet.

> **Wave 1 split — 2026-09-13:** Wave 1 is formally split into Wave 1a (3 unblocked CRs, proceed now) and Wave 1b (3 blocked CRs, deferred to Wave 2). See `OWNER_DECISIONS_2026-09-12.md` addendum.

- **ROLE:** Planning (Role 2).
- **IN:** Point 1 closed. Wave 1a IA gates ALL CLOSED (2026-09-12/13). Owner decisions 1, 2, 4, 5, 11 recorded.
- **Must be designed and shown to owner before coding:**
  - CR-005 P1: snapshot bucket, seed strategy, pytest.ini, requirements.txt append, test README.
  - CR-007 F-07: `.env.example` contents (keys only, no values), orphan-key deletion, .gitignore allow-line, rotation checklist placeholder names.
  - CR-004: hybrid static+regex CORS env keys, slowapi configuration, 5 security headers, request-id middleware, 500 handler envelope.
- **OUT:** `IMPLEMENTATION_PLAN.md` per CR, each stating *files WILL change / WILL NOT touch* and a verification matrix.
- **DONE WHEN:** owner approves each plan ("go") — one plan at a time in build order.
- **Build order:** CR-005 P1 → CR-007 F-07 → CR-004

## POINT 2b — Wave 1b (DEFERRED → Wave 2) · CR-017, CR-003, CR-015

> **These three CRs are NOT part of Wave 1a. They move to Wave 2 and open only when their owner-side blockers clear.**

| CR | Blocker | Who unblocks |
|---|---|---|
| CR-2026-09-12-015 (GitHub Actions CI) | Git repo write access + 6 GitHub secrets | Owner |
| CR-2026-09-12-017 (CRM SMS for OTP) | CRM API contract + DLT registration + SMS template + sender ID + UAT phones | Owner + MyGenie ops |
| CR-2026-09-12-003 (OTP echo removal) | CR-017 must close first | Depends on CR-017 |

When blockers clear: owner assigns Role 2 (Planning) for each CR individually in dependency order (CR-017 → CR-003 → CR-015).

## POINT 3 — Build Wave 1a · CR-005 P1, CR-007 F-07, CR-004

- **ROLE:** Implementation (Role 3), one CR at a time, in build order:
  1. **CR-005 P1** — pytest + snapshot harness (safety net first, so CR-004 security changes are snapshot-covered)
  2. **CR-007 F-07** — env housekeeping (adds .env.example keys for CR-004's new vars)
  3. **CR-004** — CORS lockdown + rate-limit + middleware (snapshots already exist as regression gate)
- **OUT:** code with `// CR-2026-09-12-00X` markers, `QA_HANDOVER.md` per CR.
- **Then:** QA (Role 4) per CR → owner smoke on UAT → CLOSED.
- **DONE WHEN:** all three CLOSED; `pytest -m "contract or smoke"` green locally; snapshots committed.

## POINT 4 — Plan + build the backend split (Wave 2) · CR-2026-09-12-006, INV-2026-09-12-001

**Plain English:** Turn the 1,829-line `server.py` into a folder of small modules. The app must behave *identically* — proven by the snapshots from Point 3.

- **ROLE:** Investigation (Role 6) for INV-001 first (are the old `customer/*` routes used by anyone?), then Planning (Role 2), then Implementation (Role 3).
- **IN:** Point 3 closed (snapshots exist). INV-001 verdict.
- **Key rule fixed in Planning:** all database access lives in `repositories/`; every repository call takes `restaurant_id` explicitly. This is what makes Phase B (MySQL) a swap instead of a rewrite.
- **OUT:** `app/{core,db,models,repositories,services,routers}`; `server.py` becomes a 3-line mount; dead `/api/docs/*` removed; legacy routes kept or removed per INV verdict.
- **DONE WHEN:** snapshot suite green; QA + owner smoke passed; CLOSED.

## POINT 5 — Plan + build the frontend foundations (Wave 3)

Five CRs, planned together, built in this order:

| Order | CR | Plain English | Owner gate |
|---|---|---|---|
| 5a | CR-2026-09-12-007 | One gateway file per backend; one `session.js` for all browser storage. Storage key names do **not** change. | plan approval |
| 5b | CR-2026-09-12-008 | Real route guards for `/admin/*` and `/profile`. | plan approval |
| 5c | CR-2026-08-03-001 | Hyatt 716: 27 `if 716` checks → 2 settings from POS profile. | **owner re-read + go (decision 9)** |
| 5d | CR-2026-09-12-009 | Remove silent 478 fallback → "Restaurant not found" page; `pos_id`, `+91` → settings. | plan approval |
| 5e | CR-2026-09-12-010 | Default settings master copy moves to a DB record (admin-editable) with version stamp + cache refresh. **Schema addition → explicit approval.** | plan approval |

- **ROLE:** Planning (Role 2) for the set → Implementation (Role 3) per CR → QA (Role 4) per CR.
- **IN:** Point 4 closed.
- **DONE WHEN:** all five CLOSED; `grep '716'`/`"478"` in `src` = 0; no `process.env` reads outside the gateway files.

## POINT 6 — Multi-brand plumbing + start BFF (Wave 4) · CR-2026-09-12-011, CR-2026-07-03-011

**Plain English:** Give the app a proper notion of "tenant" (brand *or* restaurant) at both ends, and begin routing calls through your own backend, money/credential calls first.

- **ROLE:** Planning → Implementation → QA.
- **IN:** Point 5 (5a) closed.
- **OUT:** `resolveTenant(hostname)`; backend `get_tenant()` dependency enforced in every repository; tenant-aware storage key builder (existing keys untouched); first POS write calls proxied via FastAPI (CR-011 Phase 1); ticket raised to POS team about the public master-outlet endpoint leaking `crm_token`/`upi_id`/`email`.
- **DONE WHEN:** Master Outlet Planning can list these as existing primitives.

## ► MASTER OUTLET / MULTI-BRAND BUILD STARTS HERE (own CRs; needs owner decisions D1–D6 from `master_outlet/ARCHITECTURE_REEVALUATION.md`)

## POINT 7 — Break up the giant pages (Wave 5, in parallel) · CR-2026-09-12-012 then -013

- **ROLE:** Planning → Implementation → QA, **ReviewOrder first** (CRITICAL — full order/payment regression matrix).
- **IN:** Points 3 and 5a closed.
- **OUT:** `features/checkout/*`, then Landing / DeliveryAddress / OrderSuccess; legacy `AdminSettings.jsx` retired after usage trace.
- **DONE WHEN:** each page ≤ ~300 lines; payload byte-diff vs pre-refactor = 0; E2E matrix green.

## POINT 8 — Phase B: MySQL · CR-2026-09-12-014

- **ROLE:** Planning (Role 2) — **may not start before Point 4 is CLOSED.**
- **Steps inside:** B0 schema/ERD (owner review) → B1 SQLAlchemy + Alembic → B2 SQL repositories behind the same interface, `DB_BACKEND=mongo|mysql` switch → B3 migration script with counts/checksums → B4 dual-run against snapshots → B5 cut-over (owner-approved freeze window, rollback plan).
- **OWNER (at Planning):** MySQL flavour/host; freeze window; keep Mongo read-only for N days after cut-over?

---

## Owner touchpoints summary

| When | Owner does |
|---|---|
| Now | Assign role for Point 1; supply the three Wave 0 inputs |
| Point 2 | Approve four Wave 1 plans; pick SMS provider + supply key; approve OTP collection schema |
| Point 4 | Approve backend-split plan |
| Point 5 | Re-read + approve CR-2026-08-03-001; approve `config_defaults` schema; approve four other plans |
| Point 6 | Approve tenant/BFF plan; answer Master Outlet D1–D6 |
| Point 8 | MySQL host/flavour, freeze window, cut-over go |

## Decision trace

All choices above derive from `OWNER_DECISIONS_2026-09-12.md` (12 answers). If any answer changes, this plan is re-issued as v1.1 with the delta noted.
