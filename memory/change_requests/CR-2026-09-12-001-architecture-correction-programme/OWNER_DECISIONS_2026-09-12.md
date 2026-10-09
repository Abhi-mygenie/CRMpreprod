# OWNER DECISIONS — Architecture Correction Programme (CR-2026-09-12-001)

Recorded: 2026-09-12 · Collected one-by-one in plain English · Recorded by: Intake agent (Role 1)
Supersedes the "Default if silent" column in `INTAKE_DOC.md` §6.

| # | ID | Question (plain English) | Owner answer | What it means for the plan |
|---|---|---|---|---|
| 1 | G0.1 / G0.2 | Were the Mongo + POS passwords changed after the May leak? | **d — Not sure, will check with team** | CR-2026-07-03-007 F-07c becomes a Wave 1 task: rotation checklist + owner sign-off. Until confirmed, treat both credentials as exposed. |
| 2 | G0.4 | Which websites may call the backend (CORS)? | **c — Fixed list, but it grows daily; needs more thought** | CR-2026-09-12-004 Planning must design a **dynamic allow-list** (backend derives allowed origins from the restaurant-hostname registry it already resolves against) instead of a static `.env` list. Design returns to owner before coding. |
| 3 | G0.7 | Where is the master copy of default settings? | **b — Database, admin-editable; note earlier caching problems** | CR-2026-09-12-010: a `config_defaults` record in DB, editable from admin UI; must include a **version stamp + client refetch on version change** to kill the stale-cache issue (`restaurant_config_<rid>` in browser storage). |
| 4 | G0.9 | Tests only on a throw-away DB? | **b — Current Mongo is UAT, not production. Deleting rows is fine; adding/removing fields or collections must be cautious** | CR-2026-09-12-005 may run tests against the UAT Mongo using dedicated test restaurant IDs and cleaning up after itself. **Any schema change (new field/collection/index) anywhere in the programme must be listed explicitly in that CR's plan for owner approval.** |
| 5 | NEW-1 | Approve Wave 1 as one package (OTP, CORS/middleware, CI gate, env housekeeping)? | **Yes — all four** | Wave 1 children may enter Planning as soon as Wave 0 is closed. |
| 6 | NEW-2 | Feature-folder + one API-gateway-per-backend as the frontend standard? | **a — Yes, and migrate existing code gradually** | Standard applies to all new FE work incl. Master Outlet; existing pages move only when touched. |
| 7 | NEW-3 | Browser talks to POS/CRM directly, or via own backend (BFF)? | **"As suggested" = Target BFF, phased** | End state: all traffic via FastAPI. Path: FE gateway first (Wave 3), then move calls to backend group by group via CR-2026-07-03-011 (now a **Wave 4** item), money/credential calls first. |
| 8 | NEW-4 | Approve order Wave 0→1→2→3→4→(Master Outlet ∥ 5)→Phase B? | **a — Yes** | Sequencing locked. A wave opens Planning only when the previous wave's CRITICAL items are QA-closed. |
| 9 | D-716 | Approve existing CR-2026-08-03-001 (716 → 2 config flags)? | **b — Yes in principle; owner will re-read the plan first** | Stays 📋 PLANNED. Owner reads `CR-2026-08-03-001/CR.md` then `IMPLEMENTATION_PLAN.md`; explicit "go" required before Wave 3 implementation. |
| 10 | D-478 | What happens when the restaurant can't be determined from the URL? | **a — Show "Restaurant not found" page; remove silent 478 fallback** | CR-2026-09-12-009 scope confirmed. Preview/test links must include the restaurant id explicitly (e.g. `/478`). |
| 11 | D-OTP | How do customers get the OTP once the API stops echoing it? | **b — Add a dedicated SMS provider** | CR-2026-09-12-003 gains an SMS-provider integration sub-item. At Planning: owner picks provider (MSG91 recommended for Indian DLT; Twilio alternative) and supplies account + API key. Server-side test mode (OTP to backend log only) added for UAT. |
| 12 | Start | Start Wave 0 QA backlog now? | **a — Yes, in principle. But roles are assigned by owner; this agent's role is Intake, not QA.** | Wave 0 is APPROVED TO START. Owner will assign the QA role explicitly. Owner still owes three inputs (see below). |

## Open owner inputs (needed by Wave 0 QA, not by Intake) — ANSWERED 2026-09-12

| Item | Input needed | **Owner answer (2026-09-12)** | QA outcome |
|---|---|---|---|
| CR-2026-07-03-000 | Are the *new* POS credentials in `backend/.env` on this pod? | **Don't know** | QA live-tested `POST /api/pos/auth-token` → HTTP 200 with a valid JWT ⇒ **creds are on the pod and working**. Item CLOSED PASS. |
| INV-2026-09-10-001 | Razorpay `index.html` fix pushed to GitHub `main`? | **Yes — latest code pushed** | Owner assertion recorded. INV CLOSED. |
| CR-2026-06-17-001 | QA already passed — owner sign-off to CLOSE? | **Yes** | Sign-off recorded. CR CLOSED. |

## Owner decision addendum — 2026-09-12 (later same day)

**Owner directive:** *"n1, n2, n3 and n4 should be closed and validated by you before moving to wave 1"*

**Implication:** Zero-backlog gate at end of Wave 0. All 4 non-blocking NOTEs must be resolved (either fixed or independently validated by the agent) before Wave 1 Planning opens. Agent may use Fast Lane where eligible (Alpha v0.1 §6) and QA-drives admin state via API to validate customer-side effects.

**Outcome:** All 4 notes CLOSED on 2026-09-12. Detail in `CR-2026-09-12-002-.../NOTES_CLOSURE_2026-09-12.md`.

| Note | Action taken | Verdict |
|---|---|---|
| N-1 | Fast Lane deleted 4 stale keys from `frontend/.env` (`REACT_APP_LOGIN_*`, misplaced `MYGENIE_POS_LOGIN_*`) → frontend restart → HTTP 200 | ✅ CLOSED |
| N-2 | Admin JWT → PUT `deliveryShifts=[{"start":"23:55","end":"23:56"}]` → customer `?orderType=delivery` screenshot proved delivery btn grayed with "Opens 11:55 PM" + Browse Menu disabled → config restored | ✅ CLOSED |
| N-3 | Admin JWT → PUT `categoryTimings` probe → GET reflected → customer menu screenshot proved 129 items render + no errors + `filterItems` path live → config restored | ✅ CLOSED |
| N-4 | Upload byte-perfect round-trip validated (POST 200 + GET 200 + md5 match) with admin JWT. Legacy URL 404 confirmed. Data cleanup for 4 restaurants filed as OPS task, not code. | ✅ CLOSED |

## Wave 1 CR-005 (CI gate + contract snapshots) — Planning decisions frozen 2026-09-12

Role 2 (Planning) session on 2026-09-12 produced `CR-2026-09-12-005-.../IMPACT_ANALYSIS.md`. All 10 D-05-* decisions and 4 follow-up Q1–Q4 clarifications frozen. Also 2-phase split adopted (git access not available now).

| Ref | Decision | Owner answer |
|---|---|---|
| D-05-1 | Snapshot scope: 13 contracts + 8 negative + 8 smokes (29 checks) | Accepted after full endpoint list delivered |
| D-05-2 | Test restaurants for reads AND writes | Real 478 + 716 on UAT (more added later as needed) |
| D-05-3 | CI Mongo target | UAT Mongo (`52.66.232.149:27017`) via current `MONGO_URL` |
| D-05-4 | GitHub secrets (Phase 2 only) | 6 secrets: `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `MYGENIE_API_URL`, `MYGENIE_POS_LOGIN_PHONE`, `MYGENIE_POS_LOGIN_PASSWORD` |
| D-05-5 | Snapshot storage | (a) Commit JSON files to git under `backend/tests/fixtures/snapshots/` |
| D-05-6 | CI triggers (Phase 2) | All 3: PR + push-to-main + weekly cron |
| D-05-7 | Failure policy (Phase 2) | (a) Hard fail — merge blocked on snapshot mismatch |
| D-05-8 | Snapshot library | `syrupy` (audit accepted after Q3 re-validation) |
| D-05-9 | POS-auth smoke | (a) 200 AND 502 both PASS |
| D-05-10 | `/api/docs/*` handling | (a) Snapshot 200 today; CR-006 will flip to 404 |
| Q1 | Config-in-code intent | (a) Typo — "no config in code" is the goal. CR-010 (Wave 3) already scheduled to fix. |
| Q2 | Snapshot defaults-in-code fallback today? | (a) Yes — snapshot `/api/config/9999` so CR-010 removal is visible delta |
| Q3 | D-05-8 audit re-validation | (a) Accepted — 18 FE files consume `/api/config/{rid}`; no replacement exists |
| Q4 | File Phase 2 CR intake now? | (a) Yes but not in this Planning gate — owner will invoke Role 1 (INTAKE) in a follow-up gate |
| Split | Phase 1 (this CR) vs Phase 2 (future CR) | Phase 1: local pytest + snapshot harness. Phase 2: `.github/workflows/ci.yml` filed as separate CR when git access is available. |

## Owner decision addendum — 2026-09-13 (Wave 1 split)

**Owner directive (2026-09-13):** CR-015, CR-017, and CR-003 are blocked (owner-side infrastructure and regulatory dependencies). Owner confirmed these are Wave 2 material. Wave 1 is formally split:

- **Wave 1a** — 3 unblocked, IA-approved CRs; proceed to IMPLEMENTATION_PLAN immediately: CR-2026-09-12-005 P1, CR-2026-07-03-007 F-07, CR-2026-09-12-004
- **Wave 1b → deferred to Wave 2** — 3 blocked CRs: CR-2026-09-12-015 (needs git access + 6 GitHub secrets), CR-2026-09-12-017 (needs CRM contract + DLT registration + SMS template), CR-2026-09-12-003 (blocked on CR-017 closing first)

**Blockers in plain English:**

| CR | Blocker type | What owner must supply |
|---|---|---|
| CR-015 (GitHub Actions CI) | Infrastructure | Git repo write access + 6 GitHub Actions secrets |
| CR-017 (CRM SMS for OTP) | Regulatory / Business | CRM API contract, DLT registration, SMS template, sender ID, UAT phones |
| CR-003 (OTP echo removal) | Depends on CR-017 | CR-017 must close first — removing echo without SMS = production login outage |

**Build order updated:**
```
Wave 1a: CR-005 P1 → CR-007 F-07 → CR-004   (all unblocked; proceed now)
Wave 2:  CR-017 → CR-003 → CR-015            (when blockers clear — owner drives)
```

---

## Gate status after these decisions

| Gate | Status |
|---|---|
| Wave 0 (CR-2026-09-12-002 QA backlog) | ✅ **CLOSED — 10/10 items PASS + 4/4 notes CLOSED, 2026-09-12.** See `CR-2026-09-12-002-.../QA_SUMMARY.md` + `NOTES_CLOSURE_2026-09-12.md`. |
| Wave 1 · CR-2026-09-12-005 P1 (snapshots) | ✅ **Wave 1a · IA APPROVED 2026-09-12 · IA GATE CLOSED 2026-09-13** — next: IMPLEMENTATION_PLAN |
| Wave 1 · CR-2026-07-03-007 F-07 (env housekeeping) | ✅ **Wave 1a · IA APPROVED 2026-09-12 · IA GATE CLOSED 2026-09-13** — next: IMPLEMENTATION_PLAN |
| Wave 1 · CR-2026-09-12-004 (CORS + rate-limit) | ✅ **Wave 1a · IA APPROVED 2026-09-12 · IA GATE CLOSED 2026-09-13** — next: IMPLEMENTATION_PLAN |
| Wave 1b → Wave 2 · CR-2026-09-12-015 (CI workflow) | 🔒 **DEFERRED TO WAVE 2** — blocked on git access + 6 GitHub secrets (owner-side) |
| Wave 1b → Wave 2 · CR-2026-09-12-017 (CRM SMS) | 🔒 **DEFERRED TO WAVE 2** — blocked on CRM contract + DLT status + SMS template (owner-side) |
| Wave 1b → Wave 2 · CR-2026-09-12-003 (OTP echo) | 🔒 **DEFERRED TO WAVE 2** — blocked on CR-017 closing first |
| Wave 2–5, Phase B | Sequencing approved; each still needs its own Planning → owner approval → Implementation gate |
| CR-2026-08-03-001 | Owner re-read pending |
