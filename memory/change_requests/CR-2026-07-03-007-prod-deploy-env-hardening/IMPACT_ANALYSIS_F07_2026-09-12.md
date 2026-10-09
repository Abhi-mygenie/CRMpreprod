# IMPACT ANALYSIS — CR-2026-07-03-007 F-07 (Env housekeeping — .env.example + dead-key purge + rotation checklist)

**Role:** Planning (Role 2) · Stage: Impact Analysis
**Date:** 2026-09-12 · **Parent:** CR-2026-09-12-001 (Wave 1)
**Severity:** P1 · **Risk:** LOW (env/docs only; no runtime code)

## 1. Item registered

Existing CR-2026-07-03-007 CR.md; scope F-07 added 2026-09-12 (see CR.md §1 addition).

## 2. Code reality (2026-09-12)

| Fact | Source |
|---|---|
| `/app/backend/.env.example` — **does not exist** | `ls` |
| `/app/frontend/.env.example` — **does not exist** | `ls` |
| Backend `.env` keys (8): `MONGO_URL`, `DB_NAME`, `CORS_ORIGINS`, `MYGENIE_API_URL`, `GOOGLE_MAPS_API_KEY`, `JWT_SECRET`, `MYGENIE_POS_LOGIN_PHONE`, `MYGENIE_POS_LOGIN_PASSWORD` | grep |
| Frontend `.env` keys (8, post-Wave-0 N-1 cleanup): `REACT_APP_BACKEND_URL`, `WDS_SOCKET_PORT`, `ENABLE_HEALTH_CHECK`, `REACT_APP_IMAGE_BASE_URL`, `REACT_APP_API_BASE_URL`, `REACT_APP_CRM_URL`, `REACT_APP_GOOGLE_MAPS_API_KEY`, `REACT_APP_CRM_API_VERSION` | grep |
| **Audit finding** — FE source references 2 keys NOT in `.env`: `REACT_APP_CRM_API_KEY`, `REACT_APP_RESTAURANT_ID` | `grep -rhoE 'process\.env\.REACT_APP_[A-Z_]+' frontend/src` |
| Backend `.env` `GOOGLE_MAPS_API_KEY` present but backend doesn't reference it (only frontend uses maps) | audit — CR-004 Planning will confirm |
| Parked patches available: `memory/v2/phase3_backend_env_example.patch`, `phase3_frontend_env_example.patch`, `phase3_gitignore_allow_examples.patch` | referenced in CR.md |

## 3. Conflict check

| CR | Overlap | Verdict |
|---|---|---|
| Wave 0 N-1 (already done) | Deleted `REACT_APP_LOGIN_*` + misplaced `MYGENIE_POS_LOGIN_*` from `frontend/.env` | Reduces F-07 scope — that step is DONE |
| CR-2026-07-03-000 | Established `MYGENIE_POS_LOGIN_*` in `backend/.env` (correct location) | No conflict — CR-000's placement stands |
| CR-2026-09-12-003 (OTP) | Will add `OTP_TEST_MODE` — new key documented in `.env.example` | Sequential; F-07's template must include it |
| CR-2026-09-12-004 (CORS) | Will add `CORS_ORIGIN_REGEX`, `RATE_LIMIT_AUTH` — same | Sequential |
| CR-2026-07-03-012 (leaked-cred doc scrub + CI lint) | ESLint rule for leaked env names — F-07 uses this list to inform the rule | Complementary; no direct conflict |

## 4. Risk verification

Intake said LOW. **Concur** — `.env.example` files never run at runtime; keys removed here are already unused; no app code path affected.

## 5. Files that WILL change

| # | Path | Change |
|---|---|---|
| 1 | `/app/backend/.env.example` | **NEW** — 8 currently-live keys + placeholders for CR-003 (`OTP_TEST_MODE`) + CR-004 (`CORS_ORIGIN_REGEX`, `RATE_LIMIT_AUTH`) + rotation-date comment header (no secret values) |
| 2 | `/app/frontend/.env.example` | **NEW** — 8 currently-live keys (**no** `LOGIN_*` since Wave 0 removed them) |
| 3 | `/app/.gitignore` | ADD explicit `!.env.example` allow-lines below the `.env` ignore (patch parked in memory/v2) |
| 4 | `/app/memory/change_requests/CR-2026-07-03-007-.../ROTATION_CHECKLIST.md` | **NEW** — F-07c checklist owner ticks off (Mongo password, POS creds, JWT_SECRET, Maps key) |
| 5 | **Audit resolution:** `REACT_APP_CRM_API_KEY` and `REACT_APP_RESTAURANT_ID` referenced in FE src but not set | **Investigate at Implementation** — either add to `.env.example` + `.env` OR delete dead references in code (out of F-07 scope; file follow-up CR) |

## 5.1 Files that WILL NOT touch

- `/app/backend/.env` and `/app/frontend/.env` — dev-only, values stay as-is (only the *template* is added)
- Any source code (except optional dead-reference deletion — deferred to a follow-up CR)
- `.emergent/*`

## 6. Owner decisions — FROZEN 2026-09-12

Owner answered all questions in the same Planning session; the CR-007 F-07 IA gate is now closed.

| # | Decision | Owner answer |
|---|---|---|
| **D-007-1a** | Mongo password rotated since May 2026 leak? | ✅ **YES** — checklist marks CLOSED |
| **D-007-1b** | POS service-account password rotated? | ❌ **NO** — ROTATION_CHECKLIST assigns to Security team (placeholder — owner replaces) |
| **D-007-1c** | `JWT_SECRET` rotated? | ❌ **NO** — ROTATION_CHECKLIST assigns to Backend team |
| **D-007-1d** | Google Maps API key rotated + restricted? | ❌ **NO** — ROTATION_CHECKLIST assigns to Ops team |
| **D-007-2** | 2 audit-flagged FE keys (`REACT_APP_CRM_API_KEY`, `REACT_APP_RESTAURANT_ID`) | **(b)** — new CR to grep and delete dead source references. Wave 3. Provisional ID `CR-2026-09-12-016`. Owner drives Role 1 to file it. |
| **D-007-3** | Include future CR-003/CR-004 keys in `.env.example` now? | **(a)** — include with `TODO(CR-2026-09-12-003)` / `TODO(CR-2026-09-12-004)` comments |
| **D-007-4 (part 1)** | `GOOGLE_MAPS_API_KEY` handling on backend | Full grep audit confirms **0 code refs** — omit from `backend/.env.example` |
| **D-007-4 (part 2)** | Delete orphan line inside F-07 or separate CR? | **(a)** — inside F-07 (single-line change; LOW risk) |
| **Q-F07-A** | Rotation-CR placement | **(a) keep with F-06** — no new CR; existing CR-2026-07-03-007 F-06 already tracks it |
| **Q-F07-B** | Backend Maps feature planned within ~30 days? | **(a)** — no / unknown → delete the orphan; if needed later, a future CR restores it with matching code |
| **A-1** | `WDS_SOCKET_PORT` + `ENABLE_HEALTH_CHECK` handling | Include in `frontend/.env.example` with `# preview/webpack-dev-server plumbing — keep as-is` comment. Do NOT delete from live `frontend/.env`. |
| **A-2** | ROTATION_CHECKLIST team assignments | Placeholder names (Security team / DBA / Ops); owner replaces at Implementation |
| **A-3** | `.gitignore` change format | Add explicit `!*.env.example` allow-line under existing `.env` ignore rule |
| **A-4** | Reuse parked patches | Use `memory/v2/phase3_backend_env_example.patch`, `phase3_frontend_env_example.patch`, `phase3_gitignore_allow_examples.patch` as starting point; hand-edit for (a) CR-003/CR-004 TODO lines, (b) audit-driven updates (Maps orphan removed, WDS_SOCKET_PORT + ENABLE_HEALTH_CHECK header comment), (c) `MYGENIE_POS_LOGIN_*` entries (post-July additions) |
| **A-5** | `.env.example` header comment | `# .env.example — MyGenie Customer App <backend/frontend>` + `# Template only — never commit real secret values.` + `# Generated by CR-2026-07-03-007 F-07 · 2026-09-12` |

**Full audit results captured for record (backend .env × 8 keys + frontend .env × 8 keys + 2 dead-source refs):** all keys code-truthed against `/app/backend/` and `/app/frontend/src/` on 2026-09-12. Only 1 backend orphan (`GOOGLE_MAPS_API_KEY`) and 2 framework/platform-required non-code keys (`WDS_SOCKET_PORT`, `ENABLE_HEALTH_CHECK`) found. No further orphans exist.

## 7. Compact Planning output — UPDATED 2026-09-12

```text
Planning complete: CR-2026-07-03-007 F-07 · Stage: Impact Analysis · Risk: LOW
Impact Analysis: APPROVED BY OWNER 2026-09-12 · Owner literal: "Q-F07-A a / Q-F07-B all defaults"
Wave 1a IA Gate: ✅ CLOSED 2026-09-13 (wave-split decision recorded)
Wave assignment: WAVE 1a — unblocked, proceed to IMPLEMENTATION_PLAN
Files WILL change: 4 new (2 .env.example, .gitignore edit, ROTATION_CHECKLIST.md) + 1 orphan line deletion in live backend/.env (D-007-4 step 3 (a))
Files WILL NOT touch: source code, .emergent/*, live .env values (except the 1-line orphan delete)
Owner decisions: ALL FROZEN (D-007-1..4 + Q-F07-A/B + A-1..5)
Adjacent: CR-2026-07-03-007 F-06 (rotation task) unchanged — sibling scope in same CR
New CR spun off: CR-2026-09-12-016 (dead-code deletion — Wave 3) — owner drives Role 1 to file it
Docs updated: this file, README.md, OWNER_DECISIONS_2026-09-12.md, EXECUTION_PLAN.md v1.1, PRD.md
Next: Owner-driven Planning session for IMPLEMENTATION_PLAN drafting (still no code).
GATE DISCIPLINE: no plan written, no code, all assumptions surfaced.
```
