# SESSION HANDOVER — Wave 1 Closure Roadmap

**From:** Planning/Intake/QA session 2026-09-12 (this session)
**To:** Next agent(s) driving Wave 1 to CLOSED
**Author:** Role-multi (Roles 1, 2, 4 used per gate)
**Session outcome:** ✅ Wave 0 CLOSED · ✅ Wave 1 IA phase 100% CLOSED · Wave 1 Implementation Plan phase NOT YET OPENED

---

## 1. Read these FIRST (mandatory, before any tool call)

Read in this exact order — anything else is a shortcut that will cause rework:

1. `/app/memory/control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` — **the gate rules.** Every action must follow §8 (roles) + §11 (Ground Rules R1..R10). Do NOT skip.
2. `/app/memory/change_requests/CR-2026-09-12-001-architecture-correction-programme/EXECUTION_PLAN.md` — the 8-point Wave sequence.
3. `/app/memory/change_requests/CR-2026-09-12-001-architecture-correction-programme/OWNER_DECISIONS_2026-09-12.md` — every owner decision this year lives here. Do NOT re-ask questions already answered.
4. `/app/memory/change_requests/README.md` — full registry; every CR's status at a glance.
5. `/app/memory/PRD.md` — programme-level status.
6. `/app/memory/test_credentials.md` — working admin login for restaurant 478 (`owner@18march.com` / `Qplazm@10` / `restaurant_id=478`). POS-auth proxy `POST /api/pos/auth-token` verified live on this pod.

---

## 2. Current programme state (verbatim)

```text
Wave 0 ─────────────────── ✅ CLOSED (10/10 items PASS + 4/4 notes CLOSED)
Wave 1 · IA phase ──────── ✅ CLOSED (6/6 IAs settled)
Wave 1 · IP phase ───────── ⏳ NOT YET OPENED (this is where you start)
Wave 1 · Implementation ── ⏳ NOT YET OPENED
Wave 2..5, Phase B ─────── sequenced, gates closed
```

### Wave 1 CRs — decision state, prereqs, next action per CR

| CR | IA status | Blockers | Next role you should assign |
|---|---|---|---|
| **CR-2026-09-12-005 Phase 1** (pytest + contract snapshots, local) | ✅ APPROVED (Gate 2 CLOSED) | None | **Role 2 → IMPLEMENTATION_PLAN** |
| **CR-2026-07-03-007 F-07** (env housekeeping — `.env.example` + rotation checklist) | ✅ APPROVED (Gate 2 CLOSED) | None | **Role 2 → IMPLEMENTATION_PLAN** |
| **CR-2026-09-12-004** (CORS hybrid + rate-limit + middleware) | ✅ APPROVED (Gate 2 CLOSED) | None | **Role 2 → IMPLEMENTATION_PLAN** |
| **CR-2026-09-12-015** (GitHub Actions CI workflow — Phase 2 of CR-005) | ✅ COMPLETE (no decisions) | Git write access + 6 GitHub repo secrets + CR-005 P1 CLOSED | Cannot proceed — owner-side prereqs (see §4) |
| **CR-2026-09-12-017** (CRM SMS finalization — NEW prereq for CR-003) | 📝 INTAKE done (Role 1 CLOSED) | CRM contract + DLT status + template + sender ID + UAT phones (see `.../INTAKE_DOC.md §7`) — all owner-side | Owner supplies §7 items → Role 2 for IA |
| **CR-2026-09-12-003** (OTP echo removal + persistent OTP store) | 🔒 PARTIALLY FROZEN (Q1/Q2/D-003-3..6 locked; D-003-7 + A-1..A-7 deferred) | CR-017 CLOSED | Waits for CR-017; then Role 2 for remaining IA decisions → IP |

### Wave-1 build order (revised 2026-09-12)

```
CR-005 P1  →  CR-007 F-07  →  CR-2026-09-12-017 (NEW)  →  CR-003  →  CR-004  →  CR-015 (Phase 2)
```

**Notes on the build order:**
- CR-005 P1 first because every downstream CR uses its snapshot suite as its safety net.
- CR-007 F-07 next because CR-003 + CR-004 both add new env keys that F-07's `.env.example` must document.
- CR-017 blocks CR-003 (production login relies on OTP echo today; removing echo without SMS = outage).
- CR-004 last of the code CRs — snapshots will need one-time regen after security headers land.
- CR-015 whenever git access + secrets clear.

---

## 3. Priority action queue (in order)

### 🥇 P0 — write 3 Implementation Plans (Role 2, no code)

The 3 APPROVED CRs need IP docs before Role 3 (Implementation) can start. Do them in build order:

1. **CR-2026-09-12-005 Phase 1** — IP doc at `.../CR-2026-09-12-005-.../IMPLEMENTATION_PLAN.md`. Must include:
   - Edit-by-edit list of the 12 new files + 1 modified (`backend/requirements.txt` append: `syrupy`, `pytest-asyncio`).
   - Snapshot dir structure under `backend/tests/fixtures/snapshots/`.
   - Seed strategy for restaurant 478/716 on UAT.
   - Self-test matrix from IA §9 verbatim.
   - Rollback: `git revert` — no data effect.

2. **CR-2026-07-03-007 F-07** — IP doc at `.../CR-2026-07-03-007-.../IMPLEMENTATION_PLAN_F07_2026-09-12.md`. Must include:
   - Create `/app/backend/.env.example` + `/app/frontend/.env.example` from the parked patches at `/app/memory/v2/phase3_*.patch`, hand-edited per D-007-3 = a (TODO comments for future CR-003/CR-004 keys) and Wave 0 N-1 findings.
   - Add `!*.env.example` to `.gitignore`.
   - Create `ROTATION_CHECKLIST.md` with placeholder team assignments (per A-2).
   - Delete orphan `GOOGLE_MAPS_API_KEY` line from live `backend/.env` (D-007-4 = a inside F-07).

3. **CR-2026-09-12-004** — IP doc at `.../CR-2026-09-12-004-.../IMPLEMENTATION_PLAN.md`. Must include:
   - `server.py` middleware rewrite — CORS with hybrid `allow_origins` + `allow_origin_regex`, fail-fast on wildcard+credentials, `slowapi` in-memory rate-limiter at 10/5/5/3 per-minute per (IP + phone-when-available), 5 security headers middleware, unified 500 handler with UUID `request_id`, request-id middleware.
   - `backend/requirements.txt` append: `slowapi`.
   - `backend/.env` + `backend/.env.example` — add `CORS_ORIGINS`, `CORS_ORIGIN_REGEX`, `RATE_LIMIT_AUTH`.
   - `POST /api/pos/auth-token` throttled same as `/api/auth/login` (per A-1).
   - CR-005 snapshot one-time regen (deliberate delta for new headers).

**Rules for writing each IP:**
- Follow Alpha v0.1 §8 Role 2 output contract.
- Each IP ends with owner "go" gate before Role 3.
- No code files written during Role 2.

---

### 🥈 P1 — drive owner-side prereqs in parallel

**CR-2026-09-12-017 prereqs** (someone at MyGenie must complete these — see `.../INTAKE_DOC.md §7`):
1. Document current state of "half-baked" CRM SMS pipeline
2. Obtain CRM API contract for `POST /customer/send-otp` (URL, auth, request/response shapes, error codes)
3. DLT registration status (India regulatory — days-to-weeks)
4. Approved OTP SMS template text
5. Sender ID (6-char DLT-registered)
6. UAT phone number list for end-to-end delivery testing
7. Fallback decision: MSG91 pivot if CRM cannot be completed on timeline

**CR-2026-09-12-015 prereqs:**
1. Git repo write access OR owner "Save to GitHub" push readiness
2. Add 6 GitHub Actions secrets: `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `MYGENIE_API_URL`, `MYGENIE_POS_LOGIN_PHONE`, `MYGENIE_POS_LOGIN_PASSWORD`
3. Confirm GitHub-hosted runners can reach UAT Mongo + preprod POS

None of these are agent tasks. Escalate to owner + relevant teams.

---

### 🥉 P2 — small paperwork tasks

- **File CR-2026-09-12-016** — the dead-code deletion CR for the 2 FE keys (`REACT_APP_CRM_API_KEY`, `REACT_APP_RESTAURANT_ID`) flagged by D-007-2. Owner drives Role 1 (INTAKE) when ready. Wave 3 placement.
- **CR-2026-09-12-017 §7 questions** — surface them to owner if not answered within a few days.

---

## 4. Rules for the next agent — don't break these

Follow Alpha v0.1 gate rules ruthlessly. Concrete DOs and DON'Ts:

### ✅ DO
- Read the system prompt, EXECUTION_PLAN, OWNER_DECISIONS, README, PRD, test_credentials before ANY tool call.
- Output the mandatory session-start format block (project / role / reason / risk / docs / blocked / next action) before any real work.
- Follow the build order in §2.
- When the owner asks a decision, use plain English + concrete examples + my recommendation with a reason. Owner is not deeply technical but pushes back hard on assumptions.
- Surface every assumption explicitly (like A-1..A-7 in each IA). Owner has said "don't assume" more than once.
- Update PRD.md + README.md + OWNER_DECISIONS_2026-09-12.md whenever a gate closes.
- After ANY code change (Role 3 / Role 5 only), invoke `testing_agent` per the system prompt. Testing agent MUST run before you claim a fix is done.

### ❌ DON'T
- Never write code during Role 2 (Planning) or Role 1 (Intake). Both are documentation-only.
- Never re-ask a question already answered in `OWNER_DECISIONS_2026-09-12.md`.
- Never modify `.emergent/emergent.yml`, `frontend/.env` REACT_APP_BACKEND_URL, backend `MONGO_URL`/`DB_NAME` — platform-protected (addendum §12).
- Never invoke `testing_agent` during Planning — no code exists to test. Testing agent runs only after Implementation.
- Never spread `.env` changes across roles — env files touch only during Role 3 and only with owner sign-off.
- Never trigger any Wave 2+ activity until Wave 1 CLOSES.

---

## 5. Where each decision + evidence lives

| Artefact | Path |
|---|---|
| Wave-1 IA docs (6 files) | Each CR folder under `/app/memory/change_requests/CR-*-*/IMPACT_ANALYSIS*.md` |
| Wave-1 INTAKE docs (6 files) | Each CR folder under `/app/memory/change_requests/CR-*-*/INTAKE_DOC.md` |
| Wave-0 QA reports | `/app/memory/change_requests/CR-2026-09-12-002-qa-backlog-closure/QA_SUMMARY.md` + `NOTES_CLOSURE_2026-09-12.md` |
| Owner decisions (all this year) | `/app/memory/change_requests/CR-2026-09-12-001-.../OWNER_DECISIONS_2026-09-12.md` |
| Registry | `/app/memory/change_requests/README.md` |
| Programme status | `/app/memory/PRD.md` |
| Credentials | `/app/memory/test_credentials.md` |
| Parked env-hardening patches (F-07 base) | `/app/memory/v2/phase3_backend_env_example.patch` · `phase3_frontend_env_example.patch` · `phase3_gitignore_allow_examples.patch` |
| Gate rules | `/app/memory/control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` |

---

## 6. Code truth — verified during this session (2026-09-12)

Snapshots for future reference — no need to re-verify unless doing an audit:

- Backend at `/app/backend/server.py` — 1830 lines, 46 route decorators, single-file monolith. Untouched this session.
- Backend `send_otp()` line 437: NO SMS integration. Echoes OTP + logs plaintext.
- Backend `otp_store = {}` line 366: in-memory dict, not multi-worker safe.
- Backend CORS line 1805–1809: `allow_origins=os.environ.get('CORS_ORIGINS','*').split(',')` + `allow_credentials=True`. Wildcard fallback = security bug.
- Backend `.env` (8 keys): all used except `GOOGLE_MAPS_API_KEY` (orphan — F-07 deletes).
- Frontend `.env` (8 keys post-Wave-0 N-1 cleanup): 5 source-consumed + `REACT_APP_GOOGLE_MAPS_API_KEY` (used in `DeliveryAddress.jsx`) + 2 framework/platform (`WDS_SOCKET_PORT`, `ENABLE_HEALTH_CHECK`).
- 2 FE-source refs not in `.env`: `REACT_APP_CRM_API_KEY`, `REACT_APP_RESTAURANT_ID` (spun off to CR-016).
- Frontend `crmService.js:287–314`: `crmSendOtp()` exists but only imported by `PasswordSetup.jsx` (password-setup flow), NOT by `AuthContext.jsx` (customer login).
- `/api/config/{rid}` returns 105 keys from Mongo `customer_app_config` collection. 18 FE files consume it. No newer endpoint exists.
- Live admin login for restaurant 478 works with `owner@18march.com` / `Qplazm@10` / `restaurant_id=478`.
- Live POS-auth proxy `POST /api/pos/auth-token` returned real JWT during Wave 0 QA (rotated creds ARE on this pod).

---

## 7. Session boundaries that must not be crossed by the next agent

- Wave 2 + Wave 3 + Wave 4 + Wave 5 + Phase B intake docs exist but are LOCKED. No Planning or Implementation activity there until Wave 1 CLOSES.
- CR-2026-08-03-001 has "owner re-read pending" — do not act on it.
- CR-016 (dead-code deletion) has not been filed yet — do not file it without owner Role 1 directive.
- The 4 "OPS backlog" items in PRD (legacy logo URL cleanup on restaurants 364, 716, 523, 672) are ops tasks, NOT code CRs. Do not open a CR for them.
- Ground Rule R2 (Alpha v0.1 §11): "**No wholesale rewrites of `server.py`.**" This applies until CR-006 (Wave 2) is Planning-approved.

---

## 8. Compact status block for next agent to output on session start

```text
Project: MyGenie Customer App
Role selected: <PLANNING / QA / IMPLEMENTATION / INTAKE — depending on owner directive>
Reason: <specific CR + gate step referenced from §3 of this handover>
Risk level: <per the CR's IA>
Docs read: MYGENIE_..._ALPHA_v0_1.md, EXECUTION_PLAN, OWNER_DECISIONS_2026-09-12.md, README, PRD, test_credentials, SESSION_HANDOVER_WAVE_1_CLOSURE.md
Blocked by unknowns: <per §3 or §4 of this handover>
Next action: <one specific artefact to produce>
```

---

## 9. Success criteria — Wave 1 is CLOSED when…

- Each of the 6 Wave-1 CRs has passed through: INTAKE → IA APPROVED → IP APPROVED → Implementation → Self-test → QA_REPORT → owner CLOSE.
- Each CR has a `QA_REPORT.md` with 0 failures.
- CR-005 P1 snapshots exist on disk and pass locally.
- CR-015 CI workflow runs green on first PR (only when git access clears).
- CR-017 SMS delivery proven end-to-end on UAT phones.
- CR-003 removes echo + persistent OTP store live in production.
- CR-004 CORS + rate-limit + middleware live in production.
- CR-007 F-07 `.env.example` files committed + ROTATION_CHECKLIST assigned.

At Wave 1 CLOSE: update `EXECUTION_PLAN.md` to mark Point 3 done and open Wave 2.

---

## 10. Author's final note

Owner drives gate transitions. Do not skip role assignments. If owner uses shorthand like "approved" or "as suggested" — read the previous message carefully to understand what they're approving. When in doubt, re-ask in plain English with concrete options.

This session did 3 things well:
- Closed Wave 0 fully (including converting owner UAT recommendations into live API-driven validations).
- Closed Wave 1 IA phase 100% by walking every decision through plain-English explanations.
- Filed CR-015 + CR-017 as new prereq CRs cleanly via Role 1.

Wave 1 is now a paperwork-complete but implementation-empty state. The next agent's job is to turn that paper into shipped code, one gated CR at a time, in the build order at §2.

Good luck.
