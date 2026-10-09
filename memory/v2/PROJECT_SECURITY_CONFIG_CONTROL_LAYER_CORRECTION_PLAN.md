# Project Security, Config, and Control-Layer Correction Plan

> **Agent:** Security, Config & Control-Layer Correction Planner (planning-only)
> **Plan date (UTC):** 2026-05-30
> **Baseline frozen at:** `main @ 4612953a31e988dabb5af685fa3bc33c6febb1b6`
> **Inputs:** `PROJECT_FINAL_BASELINE.md`, `PROJECT_GAP_REGISTER.md`, `PROJECT_FINAL_BASELINE_DISCOVERY.md`
> **Status:** **NO IMPLEMENTATION APPROVED.** This document only plans. No code/refactor/deploy/restart/env/DB/secret changes were made.

---

## 1. Executive Plan Verdict

The 20 registered gaps are sequenced into **11 phases (Phase 0–Phase 10)**, deliberately ordered so that **security containment and production-risk containment happen first**, before any architecture refactor. The plan splits work along clean boundaries — **security → config/env → auth/OTP → frontend control → backend middleware → missing-endpoint/bug → test/CI → modularization → cleanup** — and each phase is intentionally small enough for a single implementation agent to ship and a single QA agent to verify.

The single most important sequencing rule: **GAP-001/002 (exposed live secrets) cannot be "fixed" by code alone** — they require **credential rotation in MongoDB + the POS provider (outside the codebase)** coordinated with an env update and a deploy. Everything else is staged behind a one-time **Owner/Security Approval Gate (Phase 0)** because containment touches live credentials, CORS origins, and OTP behavior that affect a production app serving real orders.

A small set of changes are **safe, additive, code-only** (OTP-echo removal, `.env.example`, backend middleware additions, `ProtectedRoute`, CI + test fix, doc-endpoint repair). The heavy architecture items (server.py modularization, integration-topology consolidation, restaurant-716 de-hardcoding, legacy-route removal) are **explicitly deferred** to the back of the queue and gated on a successful security/control baseline first.

**Bottom line:** implementation remains **BLOCKED** until the Phase 0 owner decisions (secret rotation authorization, prod CORS origins, OTP policy, restaurant-info contract) are made.

---

## 2. Inputs Read

**Frozen baseline docs (authoritative for this plan):**
- `/app/memory/v2/PROJECT_FINAL_BASELINE.md`
- `/app/memory/v2/PROJECT_GAP_REGISTER.md`
- `/app/memory/v2/PROJECT_FINAL_BASELINE_DISCOVERY.md`

**Read-only code verification performed for file/line precision (no edits):**
- `backend/server.py` — OTP echo `:437` (`otp_for_testing`); CORS block `:1689-1695`; `/api/docs/*` file paths `:1617-1680` (8 endpoints → non-existent `/app/memory/*.md`); JWT/auth helpers `:287-329`; config defaults `get_app_config()` `:980-1100`; legacy customer routes `:754-952`.
- `frontend/src/context/AdminConfigContext.jsx:157-182` — `/api/restaurant-info/{id}` fetch is `.catch(()=>null)`-wrapped and only sets `restaurantFlags` (`is_loyalty`, `is_coupon`, `multiple_menu`).
- `frontend/src/api/services/crmService.js:285,308` — `debug_otp: data?.dev_otp` (external CRM origin; consume-only).
- `frontend/src/utils/authToken.js` — `order_auth_token`/`order_token_expiry`, 10-min constant vs "30 minutes" comment, `REACT_APP_LOGIN_PHONE/PASSWORD`.
- `frontend/src/pages/Login.jsx:60-61` — stores `pos_token`; `frontend/src/context/AuthContext.jsx` — `auth_token` / `crm_token_{rid}`.
- Confirmed: **frontend makes zero calls to FastAPI `/api/customer/*`** → those routes are legacy/unused by this repo's FE.

---

## 3. Planning Rules

This phase is **planning only**. Per the task constraints, NONE of the following were or may be done here:
- ❌ No code written, no refactor.
- ❌ No deploy, no service restart.
- ❌ No env file creation/edit, no env value change.
- ❌ No DB modification, no `db_import`, no seeding.
- ❌ No secret rotation, no git-history rewrite.
- ❌ No file removal.
- ❌ No frontend/backend behavior change.

Additional governing rules: frozen baseline is the source of truth; code wins if a claim needs verification; live `mygenie` DB is the authoritative data baseline; `db_data/` exports are non-authoritative; **security containment precedes architecture refactor**; unrelated fixes are **not** merged into one phase; every phase must be independently shippable and QA-verifiable.

---

## 4. Gap-to-Phase Matrix

| Gap ID | Bucket | Primary Phase | Cross-ref | Change class | Pre-deploy? | Needs out-of-code rotation? |
|---|---|---|---|---|---|---|
| GAP-001 Secrets in docs | P0-Security | **Phase 1 (1A)** | Phase 0 | Docs purge + rotation + git-history | **YES** | **YES (Mongo + POS creds)** |
| GAP-002 POS creds in JS bundle | P0-Security | **Phase 1 (1B)** | Phase 4 | FE+BE auth move + rotation | **YES** | **YES (POS service acct)** |
| GAP-003 OTP echo + in-memory store | P0-Security | **Phase 1 (1C: echo)** | Phase 4 (store) | Code-only (echo) / infra (store) | **YES (echo)** | No |
| GAP-004 No backend middleware | P2-Observability | **Phase 6** | — | Additive code | No | No |
| GAP-005 CORS `*`+creds, no rate-limit | P0-Production Risk | **Phase 1 (1D)** | Phase 6 | Config code + middleware | **YES** | No (needs prod origins) |
| GAP-006 No FE route guard | P1-Frontend-Control | **Phase 5** | — | Additive code | Recommended | No |
| GAP-007 Missing `/api/restaurant-info/{id}` | P2-Architecture | **Phase 7** | Phase 3 | New endpoint (contract decision) | No | No |
| GAP-008 Config-default drift | P1-Config-Baseline | **Phase 3** | Phase 7 | Code + data backfill plan | No | No (DB backfill later) |
| GAP-009 No CI + broken test | P2-Test-CI | **Phase 8** | — | Code + CI config | No | No |
| GAP-010 db_data/import danger | P0-Production Risk | **Phase 2** | Phase 10 | Guard + quarantine | **YES** | No |
| GAP-011 Token-system fragmentation | P1-Auth-Control | **Phase 5** | Phase 4 | FE abstraction + tiny fix | No | No |
| GAP-012 Thin RBAC / token lifecycle | P1-Auth-Control | **Phase 4** | Phase 5 | Backend auth foundation | No | No |
| GAP-013 server.py monolith | P2-Architecture | **Phase 9** | — | Structural refactor (no behavior change) | No | No |
| GAP-014 Integration topology | P2-Architecture | **Phase 9** | Phase 5 | Structural (FE+BE) | No | No |
| GAP-015 No `.env.example` | P1-Config-Baseline | **Phase 3** | — | New file (no secrets) | Recommended | No |
| GAP-016 Restaurant 716 hardcoding | P3-Cleanup | **Phase 10** | — | Refactor (deferred) | No | No |
| GAP-017 Call Waiter / Pay Bill stubs | P3-Cleanup | **Phase 10** | — | Feature or hide (deferred) | No | No |
| GAP-018 `/api/docs/*` 404 endpoints | P3-Cleanup | **Phase 10** | — | Code-only | No | No |
| GAP-019 Stale docs | P3-Cleanup | **Phase 10** | — | Docs hygiene | No | No |
| GAP-020 Legacy routes/files | P3-Cleanup | **Phase 10** | Phase 9 | Removal after trace (deferred) | No | No |

All **20 gaps mapped**. Phases: **0–10 (11 phases total)**.

---

## 5. Recommended Phase Sequence

The required sequence is adopted as-is (code inspection did not prove a better order; it only confirmed sub-splits within Phase 1 and Phase 4):

```
Phase 0  — Owner/Security Approval Gate            (decisions only)
Phase 1  — P0 Security Containment                 (1A docs/secrets, 1B POS creds, 1C OTP echo, 1D CORS+rate-limit)
Phase 2  — P0 Production-Risk Containment          (db_data/import safety)
Phase 3  — Config / Env Baseline                   (.env.example, config default consolidation)
Phase 4  — Auth / Token / OTP Control              (OTP store, RBAC foundation, token lifecycle)
Phase 5  — Frontend Route Guard / Token Abstraction (ProtectedRoute/RoleGuard, token manager)
Phase 6  — Backend Middleware / Error / Request Control (request-id, logging, error formatter, security headers, rate-limit pattern)
Phase 7  — Missing Endpoint + Production Bug Fixes (/api/restaurant-info, authToken expiry fix)
Phase 8  — Test / CI Baseline                      (fix broken test, smoke tests, GitHub Actions)
Phase 9  — Backend Modularization / Control Layer  (split server.py, topology — behavior-preserving)
Phase 10 — Cleanup / Deprecated Route & Doc Hygiene (docs, 404 endpoints, legacy, 716, stubs)
```

**Hard gate:** Phase 1A/1B cannot ship until Phase 0 authorizes credential rotation. Phases 3–10 should not start until Phase 1 + Phase 2 containment are merged and QA-green.

---

## 6. Phase 0 — Owner/Security Approval Gate

**Type:** Decisions only. No code, no rotation executed here.
**Gaps unblocked:** GAP-001, GAP-002, GAP-003, GAP-005, GAP-007, GAP-008.

**Decisions required from owner before any P0 work begins:**
1. **Authorize MongoDB credential rotation** for `mygenie_admin` (password currently printed in `HANDOVER.md`/`memory/PRD.md`). Confirm who owns the Mongo host (`52.66.232.149`) and the maintenance window.
2. **Authorize POS service-account rotation** for the account behind `REACT_APP_LOGIN_PHONE`/`REACT_APP_LOGIN_PASSWORD` and the MyGenie POS admin login.
3. **Authorize git-history treatment** for committed secrets: choose (a) rotate-only (leave history, accept exposure of now-dead creds) or (b) rotate + history purge (BFG/filter-repo) — note history purge rewrites shared history and needs coordination across the 40+ branches.
4. **Provide the exact production allowed origins** for CORS (to replace `*`), and confirm whether credentialed cross-origin requests are actually required.
5. **Confirm OTP policy:** acknowledge removal of `otp_for_testing` from API responses; decide whether a real SMS provider is in place or OTP delivery is handled by the CRM (the FastAPI OTP path may be legacy).
6. **Decide the `/api/restaurant-info/{id}` contract:** what `is_loyalty/is_coupon/multiple_menu` should resolve to (proxy POS vs read config) — because implementing it **changes admin behavior** (flags become populated).
7. **Decide config source-of-truth ownership** (backend defaults vs FE defaults vs DB) for GAP-008 consolidation.

**Done criteria:** all 7 decisions recorded in writing; rotation window scheduled; prod origins supplied. **Until then, implementation is BLOCKED.**

---

## 7. Phase 1 — P0 Security Containment

Split into four independently shippable sub-phases. **Owner approval required (Phase 0).**

### Phase 1A — Secrets in tracked docs (GAP-001)
- **Scope:** Stop the live-secret leak in `HANDOVER.md` and `memory/PRD.md`; rotate the leaked Mongo + POS creds; decide history purge.
- **Files likely affected:** `HANDOVER.md`, `memory/PRD.md` (redact to placeholders). **Out-of-code:** MongoDB user password rotation; POS account rotation; `backend/.env` regenerated at deploy (not in repo).
- **Change type:** Docs redaction (code-safe) + **external credential rotation** + optional git-history rewrite.
- **Owner approval:** **MANDATORY** (Phase 0 #1–#3).
- **Risks:** Rotating Mongo/POS creds without coordinated env update **breaks the live app**; history rewrite disrupts open branches.
- **Rollback:** Keep old creds valid until new creds verified in a deploy; docs change is trivially revertible; do history rewrite last, on a tag-backed snapshot.
- **QA checklist:** redacted docs contain no live secret; app reachable with rotated creds in a staging/preview env; `git grep` for old password returns nothing in working tree.
- **Done criteria:** no live secret in tracked working tree; rotated creds active; app verified healthy post-rotation.

### Phase 1B — POS service creds in JS bundle (GAP-002)
- **Scope:** Remove reliance on `REACT_APP_LOGIN_PHONE`/`REACT_APP_LOGIN_PASSWORD` baked into the FE bundle; plan a backend-mediated POS token acquisition; rotate the exposed POS account.
- **Files likely affected:** `frontend/src/utils/authToken.js` (remove embedded-cred login), `frontend/src/api/interceptors/request.js`, a **new backend proxy endpoint** under `backend/server.py` (e.g., `/api/pos/order-token`) that holds POS creds server-side.
- **Change type:** FE + BE auth-flow change (behavior-preserving for the user) + **external POS rotation**.
- **Owner approval:** **MANDATORY** (Phase 0 #2).
- **Risks:** POS ordering flow is core revenue path — any token-acquisition change risks breaking order placement. High blast radius.
- **Rollback:** Feature-flag the new token path; keep the old path importable behind the flag for instant revert.
- **QA checklist:** place order end-to-end on a test restaurant; verify no POS creds in built JS (`grep` the bundle); token refresh on 401 works.
- **Done criteria:** POS creds absent from FE bundle; ordering still works; account rotated.

### Phase 1C — OTP echoed in responses (GAP-003, echo part)
- **Scope:** Remove `otp_for_testing` from the `/api/auth/send-otp` response; stop surfacing CRM `debug_otp`/`dev_otp` in production UI paths.
- **Files likely affected:** `backend/server.py:437`; `frontend/src/api/services/crmService.js:308` (stop consuming `debug_otp`); any FE caller relying on it (`PasswordSetup.jsx`).
- **Change type:** **Safe, code-only** (remove a response field + its consumers).
- **Owner approval:** Acknowledgement only (Phase 0 #5).
- **Risks:** Low. Risk is that a dev/QA flow depended on the echoed OTP — must confirm a real OTP delivery channel exists before removing in prod.
- **Rollback:** Single-field revert.
- **QA checklist:** `send-otp` response no longer contains the OTP; OTP login still completes via the real channel (or documented test path); no FE crash when `debug_otp` is absent.
- **Done criteria:** OTP never returned to clients; login still functional.

### Phase 1D — CORS lockdown + auth rate-limit containment (GAP-005)
- **Scope:** Replace `CORS_ORIGINS='*'` default with explicit origins; reconcile `allow_credentials=True`; add **targeted** rate-limiting/lockout on `/api/auth/login`, `/api/auth/send-otp`, `/api/auth/verify-password`, `/api/auth/reset-password`.
- **Files likely affected:** `backend/server.py:1689-1695` (CORS), a small rate-limit utility (e.g., slowapi or a Mongo/TTL counter) applied to auth routes; `backend/requirements.txt` if a lib is added.
- **Change type:** Config code + minimal middleware (containment scope only; generalized pattern deferred to Phase 6).
- **Owner approval:** Needs prod origins (Phase 0 #4).
- **Risks:** Wrong origin list breaks the live FE; over-aggressive rate-limit blocks legitimate users.
- **Rollback:** Origins/limits are env-driven; revert to previous values instantly.
- **QA checklist:** FE origin works; disallowed origin blocked; >N rapid login attempts get throttled (not the genuine user); credentials mode behaves.
- **Done criteria:** No wildcard CORS in production; auth endpoints throttled.

---

## 8. Phase 2 — P0 Production-Risk Containment

- **Scope (GAP-010):** Make `db_import.py` **safe-by-default** (refuse to run against the live `mygenie` DB without an explicit override flag + typed confirmation), and quarantine/label the stale `backend/db_data/` exports as **non-authoritative / foreign-DB**.
- **Gaps covered:** GAP-010.
- **Files likely affected:** `backend/db_import.py` (guard rail), `backend/db_data/README.md` (clear "STALE — foreign DB, do not import to prod" banner). **No file deletion.**
- **Change type:** Defensive code + doc label. No DB writes.
- **Owner approval:** Recommended sign-off (low risk); MANDATORY before any actual import.
- **Risks:** Very low (adds a guard). Risk is a future agent bypassing the guard.
- **Rollback:** Revert the guard commit.
- **QA checklist:** `python db_import.py` against a `mygenie`-like target aborts without override; aborts with a clear message; README banner visible.
- **Done criteria:** Accidental import to live DB is structurally prevented; exports clearly labeled stale.

---

## 9. Phase 3 — Config / Env Baseline

- **Scope:** (GAP-015) Add `backend/.env.example` + `frontend/.env.example` documenting the 5 backend + ~11 FE variables with **placeholder values only** (no secrets). (GAP-008) Plan a **single source-of-truth** for restaurant config defaults and a **backfill strategy** for restaurants lacking a config doc.
- **Gaps covered:** GAP-015, GAP-008.
- **Files likely affected:** new `backend/.env.example`, `frontend/.env.example`; a shared defaults module (e.g., `backend/config_defaults.py`) referenced by `get_app_config()`; `frontend/src/context/RestaurantConfigContext.jsx` `DEFAULT_CONFIG` aligned to the same contract; **documentation** of which layer owns defaults. **No DB writes in this phase** (backfill is a later, separately-approved data task).
- **Change type:** New example files (safe) + defaults de-duplication (code-only, behavior-preserving if values kept identical).
- **Owner approval:** Phase 0 #7 (defaults ownership).
- **Risks:** If the de-dup accidentally changes a default value, restaurants without a config doc see different UI. Must be a 1:1 value-preserving consolidation.
- **Rollback:** Revert to the two duplicated default blocks.
- **QA checklist:** `.env.example` contains every required var, no secrets; a restaurant with no config doc renders identically before/after (snapshot compare of `GET /api/config/{rid}`); FE `DEFAULT_CONFIG` matches backend defaults key-for-key.
- **Done criteria:** Documented env contract exists; defaults have one authoritative definition; zero behavior change for existing restaurants.

---

## 10. Phase 4 — Auth / Token / OTP Control

- **Scope:** (GAP-003 store part) Move OTP from the in-memory dict to a **persistent, TTL + attempt-throttled store** (Mongo TTL collection or Redis). (GAP-012) Establish an **RBAC foundation** (formalize `customer`/`restaurant` roles + a place to add scopes) and decide **token lifecycle** (JWT expiry, optional refresh). (GAP-011 backend part) Reconcile the login-contract ambiguity surfaced in `authToken.js`.
- **Gaps covered:** GAP-003 (store), GAP-012; cross-ref GAP-011.
- **Files likely affected:** `backend/server.py` OTP helpers (`:336-354`), auth helpers (`:287-329`), possibly a new `auth`/`security` module (created in Phase 9 split or here as a thin module), `backend/requirements.txt` if Redis used.
- **Change type:** Backend auth hardening (behavior-preserving for end users; storage/internal change).
- **Owner approval:** Recommended (token-lifecycle policy decision).
- **Risks:** OTP/store changes can break login if TTL/throttle is mis-tuned; multi-worker correctness must be verified.
- **Rollback:** Keep in-memory fallback behind a flag during rollout.
- **QA checklist:** OTP survives a backend restart; expired OTP rejected; throttle blocks brute force; admin + customer login unaffected; works with >1 worker.
- **Done criteria:** OTP persistent + throttled; documented role/token model; no login regression.

---

## 11. Phase 5 — Frontend Route Guard / Token Abstraction

- **Scope:** (GAP-006) Introduce a `<ProtectedRoute>` + `<RoleGuard>` wrapper; protect `/admin/*` (require `restaurant`) and `/profile` (require an authenticated user) at the **route layer** instead of the soft `AdminLayout` redirect. (GAP-011) Introduce a **single token/session manager** abstraction over the 3–4 token keys (`auth_token`, `crm_token_{rid}`, `pos_token`, `order_auth_token`) and fix the `authToken.js` 10-min-vs-"30-min" comment/constant mismatch.
- **Gaps covered:** GAP-006, GAP-011; cross-ref GAP-014.
- **Files likely affected:** `frontend/src/App.js` (wrap routes), new `frontend/src/components/ProtectedRoute.jsx` + `RoleGuard.jsx`, `frontend/src/layouts/AdminLayout.jsx` (keep redirect as defense-in-depth), new `frontend/src/utils/session.js` (token facade), `frontend/src/utils/authToken.js`, `frontend/src/context/AuthContext.jsx`.
- **Change type:** Additive FE control layer (behavior-preserving for authorized users; tightens unauthorized access).
- **Owner approval:** Not mandatory (no secret/DB); recommend product sign-off on redirect targets.
- **Risks:** Guard misconfig could lock out legitimate admins/customers or cause redirect loops.
- **Rollback:** Routes revert to un-wrapped; token facade is additive.
- **QA checklist:** unauthenticated `/admin/*` → `/login` (no flashed admin UI); customer hitting `/admin` → `/profile`; authorized admin unaffected; `/profile` requires auth; token expiry consistent across the app.
- **Done criteria:** Centralized route guards live; no unauthorized render; one token facade in use.

---

## 12. Phase 6 — Backend Middleware / Error / Request Control

- **Scope (GAP-004):** Add, as small composable middleware: (a) **request-ID / correlation-ID**, (b) **structured request/response logging**, (c) **global exception handler** with a standardized error envelope, (d) **security headers** (HSTS/CSP/X-Frame-Options/X-Content-Type-Options), (e) a **reusable rate-limit/validation pattern** generalizing the Phase 1D containment, (f) a **startup hook** for index creation/connection validation.
- **Gaps covered:** GAP-004 (+ generalizes GAP-005).
- **Files likely affected:** `backend/server.py` (or new `backend/middleware/` if Phase 9 split has happened), `backend/requirements.txt` if libs added.
- **Change type:** Additive, cross-cutting middleware (must not alter existing success responses).
- **Owner approval:** Not mandatory.
- **Risks:** A global exception handler can mask/alter existing error shapes the FE depends on; security headers (CSP) can break the SPA/maps/CDN if too strict.
- **Rollback:** Each middleware is independently removable; ship one at a time.
- **QA checklist:** existing endpoints return identical success payloads; errors now have a consistent envelope without breaking FE parsing; CSP doesn't block FE/maps/image CDN; correlation ID present in logs; startup creates indexes idempotently.
- **Done criteria:** Middleware stack present; no regression in existing responses; logs traceable.

---

## 13. Phase 7 — Missing Endpoint + Production Bug Fixes

- **Scope:** (GAP-007) Implement `/api/restaurant-info/{id}` per the Phase 0 #6 contract so `AdminConfigContext.restaurantFlags` resolves to real values (currently silent-404 → defaults). Include any other **confirmed** broken route discovered (none beyond `/api/docs/*`, which is Phase 10).
- **Gaps covered:** GAP-007.
- **Files likely affected:** `backend/server.py` (new route returning `is_loyalty`, `is_coupon`, `multiple_menu`), possibly proxying POS or reading config/loyalty docs; optionally `frontend/src/context/AdminConfigContext.jsx` if the contract shape is refined.
- **Change type:** New backend endpoint — **behavior-changing** (admin flags become populated). Treat as a feature, not a trivial fix.
- **Owner approval:** **Required** (Phase 0 #6 — what the flags mean / where they come from).
- **Risks:** Populating flags changes admin UI conditionals (e.g., loyalty/coupon/multi-menu toggles); must verify admin pages handle real values.
- **Rollback:** Remove the route → FE returns to silent-404/defaults (current behavior).
- **QA checklist:** endpoint returns correct flags for a known restaurant; admin UI behaves correctly with flags on/off; no 500s; unauthorized access controlled per Phase 5.
- **Done criteria:** Endpoint live, contract-correct, admin flags accurate, no regression.

---

## 14. Phase 8 — Test / CI Baseline

- **Scope:** (GAP-009) Fix the broken `test_api.py` assertion (`"Hello World"` → `"Customer App API"`); add a minimal **backend smoke-test** set (health, config GET, loyalty-settings GET) and a **frontend build check**; add **GitHub Actions** running backend pytest (smoke) + `yarn build` (with `react-hooks/exhaustive-deps` handled, e.g. `DISABLE_ESLINT_PLUGIN` for the build gate) + lint.
- **Gaps covered:** GAP-009.
- **Files likely affected:** `backend/tests/test_api.py`, new `.github/workflows/ci.yml`, possibly a small `backend/tests/test_smoke.py`.
- **Change type:** Test fix + new CI config (no app behavior change).
- **Owner approval:** Not mandatory (recommend confirming where CI secrets/test DB come from — CI must NOT use the live DB).
- **Risks:** CI wired to the live DB would be dangerous; smoke tests must run against an ephemeral/local Mongo, not `mygenie`.
- **Rollback:** Remove the workflow file.
- **QA checklist:** `test_api.py` passes against the real root message; CI runs green on a PR; CI uses a disposable DB; build gate catches compile errors.
- **Done criteria:** Green CI gate on PRs; no test points at the live DB.

---

## 15. Phase 9 — Backend Modularization / Control Layer

- **Scope:** (GAP-013) Split `backend/server.py` (1,707 lines) into modules — `routers/` (auth, customer, config, upload, dietary, diagnostics, air_bnb), `services/`, `auth/security.py`, `db.py`, `middleware/`, `models/` — with **zero behavior change** (pure move + import). (GAP-014) Plan FE integration-topology consolidation (single API-client/gateway facade over the three base URLs) — design first, incremental adoption.
- **Gaps covered:** GAP-013, GAP-014; cross-ref GAP-005/006 modules land here cleanly.
- **Files likely affected:** new `backend/` package layout; `frontend/src/api/` facade. Large surface — **must be behavior-preserving**.
- **Change type:** Structural refactor (no functional change). **Deferred** until Phases 1–8 are green.
- **Owner approval:** Recommended (large diff, review-heavy).
- **Risks:** Highest blast radius of the plan; import/wiring mistakes can take the backend down; must be done in small, test-guarded steps (relies on Phase 8 CI).
- **Rollback:** Keep `server.py` as a thin shim re-exporting the app during transition; revert per-module.
- **QA checklist:** every pre-split route returns identical responses (contract snapshot diff); CI green; app boots; no import cycles.
- **Done criteria:** Modular backend with identical external behavior; CI proves parity.

---

## 16. Phase 10 — Cleanup / Deprecated Route and Doc Hygiene

- **Scope:** (GAP-018) Fix or remove the 8 `/api/docs/*` endpoints pointing to non-existent `/app/memory/*.md`. (GAP-019) Archive/label stale docs (`DEPLOYMENT_HANDOVER.md`, `memory_repo/*_v2.md`, `db_data/README`, empty `test_result.md`, `round_up_*`, `metadata_branch_diff_*`). (GAP-020) After a usage trace, deprecate legacy FastAPI `customer/*` routes and `pages/AdminSettings.jsx`. (GAP-016) Plan restaurant-`716` de-hardcoding into config-driven flags. (GAP-017) Decide complete-vs-hide for Call Waiter / Pay Bill.
- **Gaps covered:** GAP-016, GAP-017, GAP-018, GAP-019, GAP-020.
- **Files likely affected:** `backend/server.py:1614-1684`; doc tree; `frontend/src/pages/ReviewOrder.jsx`/`orderService.ts`/`orderAccessPolicy.js` (716); `LandingPage.jsx`/`OrderSuccess.jsx` (stubs).
- **Change type:** Cleanup + small refactors. **Deferred / lowest priority.**
- **Owner approval:** Required before deleting legacy routes (cross-repo consumers may exist) and before changing 716 behavior.
- **Risks:** Deleting "legacy" routes that a non-repo client (mobile/admin) still calls; changing 716 logic mid-phase-2 plan.
- **Rollback:** Revert per item; deletions only after trace + grace period.
- **QA checklist:** doc endpoints return 200 or are cleanly removed; no runtime caller hits deleted routes (verified via logs/trace); 716 parity maintained until config-driven replacement verified.
- **Done criteria:** No dead doc endpoints; docs labeled; legacy removed only with evidence; 716/stubs tracked decisions recorded.

---

## 17. Files Likely Affected

**Backend:**
- `backend/server.py` — OTP echo `:437`, CORS `:1689-1695`, auth helpers `:287-329`, OTP helpers `:336-354`, config defaults `:980-1100`, `/api/docs/*` `:1617-1680`, legacy customer routes `:754-952`, new `/api/restaurant-info/{id}`, new `/api/pos/order-token`.
- `backend/db_import.py` (safety guard), `backend/db_data/README.md` (stale label).
- `backend/requirements.txt` (only if rate-limit/Redis libs added — via install+freeze, not hand-edit).
- New (Phase 9): `backend/routers/*`, `backend/services/*`, `backend/auth/security.py`, `backend/db.py`, `backend/middleware/*`, `backend/models/*`, `backend/config_defaults.py`.
- New `backend/tests/test_smoke.py`; fix `backend/tests/test_api.py`.

**Frontend:**
- `frontend/src/utils/authToken.js` (remove embedded creds, fix expiry), `frontend/src/api/interceptors/request.js`, `frontend/src/api/services/crmService.js:308`, `frontend/src/pages/PasswordSetup.jsx`.
- `frontend/src/App.js`, new `frontend/src/components/ProtectedRoute.jsx` + `RoleGuard.jsx`, `frontend/src/layouts/AdminLayout.jsx`, new `frontend/src/utils/session.js`, `frontend/src/context/AuthContext.jsx`, `frontend/src/context/AdminConfigContext.jsx`, `frontend/src/context/RestaurantConfigContext.jsx`.
- New `frontend/.env.example`.
- Deferred: `frontend/src/pages/ReviewOrder.jsx`, `orderService.ts`, `orderAccessPolicy.js`, `LandingPage.jsx`, `OrderSuccess.jsx`, `pages/AdminSettings.jsx`.

**Docs / CI:**
- New `backend/.env.example`; redact `HANDOVER.md`, `memory/PRD.md`; label `DEPLOYMENT_HANDOVER.md`, `memory_repo/*_v2.md`, `db_data/README.md`.
- New `.github/workflows/ci.yml`.

---

## 18. Owner Approval Gates (mandatory)

| Gate | Blocks | Decision |
|---|---|---|
| G0.1 | Phase 1A | Authorize Mongo credential rotation + maintenance window |
| G0.2 | Phase 1B | Authorize POS service-account rotation + server-side token plan |
| G0.3 | Phase 1A | git-history: rotate-only vs rotate + purge |
| G0.4 | Phase 1D | Provide production CORS origins; confirm credentialed-CORS need |
| G0.5 | Phase 1C / Phase 4 | Confirm OTP delivery channel; approve removing echoed OTP |
| G0.6 | Phase 7 | Define `/api/restaurant-info/{id}` contract (flag source) |
| G0.7 | Phase 3 | Choose config defaults source-of-truth |
| G0.8 | Phase 10 (GAP-020/016) | Authorize legacy-route removal (after trace) + 716 change |
| G0.9 | Phase 8 | Confirm CI uses a disposable DB (never live `mygenie`) |

**No implementation begins until G0.1–G0.5 (the P0 set) are granted.**

---

## 19. QA Strategy

- **Per-phase QA agent** runs the phase's QA checklist (above) before merge; no phase merges without green QA.
- **Contract-snapshot harness:** before Phases 6/9, capture `GET` responses for all current `/api/*` routes; diff after each structural change to prove **zero behavior change**.
- **Security QA (Phase 1):** verify no secret in working tree (`git grep`), no POS creds in built JS, OTP absent from responses, CORS allow/deny matrix, auth-endpoint throttle.
- **Auth QA (Phases 4–5):** admin + customer + guest login matrices; restart-survival of OTP; route-guard allow/deny including redirect-loop checks.
- **Regression QA:** run the existing frontend Jest suite + the (fixed) backend tests; CR-002 non-QR block scenarios (per `test_reports/iteration_4.json`) must still pass.
- **No QA runs against the live `mygenie` DB** — use a preview/ephemeral DB. Live DB remains read-only for verification only.

---

## 20. Deployment Strategy

- **Coordinated-rotation deploys (cannot be code-only):** Phase 1A (Mongo creds) and Phase 1B (POS creds) **must** pair a credential rotation with an env update and a single deploy in the agreed window. App downtime risk → schedule.
- **Pre-deploy-mandatory:** Phase 1 (all) and Phase 2 should be merged + deployed before the project is considered production-safe. CORS lockdown (1D) requires prod origins at deploy time.
- **Independently deployable, low-risk:** `.env.example` (Phase 3, GAP-015), OTP-echo removal (1C), backend middleware (Phase 6, ship one at a time), CI (Phase 8), doc-endpoint fix (Phase 10/GAP-018). These need no credential rotation.
- **Deferred / large:** Phase 9 (modularization) deploys only after Phase 8 CI is green and behind contract-snapshot parity. Phase 10 legacy removal deploys only after a usage trace + grace period.
- **Env-driven toggles:** CORS origins, rate-limit thresholds, and OTP store backend should be env-configurable so rollback is an env flip, not a redeploy.

---

## 21. Rollback Strategy

- **Phase 0:** N/A (decisions).
- **Phase 1A:** keep old creds valid until new verified; docs redaction revertible; do history rewrite last on a tagged snapshot.
- **Phase 1B:** feature-flag the server-side POS token path; old embedded path remains revertible until ordering verified.
- **Phase 1C:** single-field revert.
- **Phase 1D:** CORS/limits are env values → instant revert.
- **Phase 2:** revert the guard commit (it is additive/defensive).
- **Phase 3–6:** all additive; revert per file/module; defaults consolidation guarded by value-parity snapshot.
- **Phase 7:** remove the endpoint → FE returns to current silent-404 default behavior.
- **Phase 8:** delete workflow file.
- **Phase 9:** keep `server.py` as a thin re-export shim during transition; revert per module; CI parity gate prevents bad merges.
- **Phase 10:** revert per item; deletions reversible via git until grace period passes.
- **Global:** every phase is a small, separately-revertible commit/PR against `main @ 4612953`; tag the baseline before Phase 1.

---

## 22. Final Recommended Implementation Order (agents after this plan)

1. **Owner/Security Decision session (human)** — resolve gates G0.1–G0.9. *(Phase 0)*
2. **Security Containment Implementation Agent** — Phases 1A→1B→1C→1D (separate PRs, in this order), each with a QA agent. *(GAP-001/002/003-echo/005)*
3. **Production-Risk Containment Agent** — Phase 2. *(GAP-010)*
4. **Config/Env Baseline Agent** — Phase 3. *(GAP-015, GAP-008)*
5. **Auth/OTP Control Agent** — Phase 4. *(GAP-003-store, GAP-012, GAP-011-backend)*
6. **Frontend Control Agent** — Phase 5. *(GAP-006, GAP-011-FE)*
7. **Backend Middleware Agent** — Phase 6. *(GAP-004, GAP-005-generalized)*
8. **Endpoint/Bugfix Agent** — Phase 7. *(GAP-007)*
9. **Test/CI Agent** — Phase 8. *(GAP-009)*  ← (may run in parallel-early since it de-risks Phase 9)
10. **Backend Modularization Agent** — Phase 9. *(GAP-013, GAP-014)*
11. **Cleanup/Doc-Hygiene Agent** — Phase 10. *(GAP-016/017/018/019/020)*

Each agent is paired with a **QA agent** and must keep the phase small and contract-preserving. **Implementation stays BLOCKED until Phase 0 gates are granted.**

---

_End of correction plan. Planning only — no code, refactor, deploy, restart, env, DB, secret, or file changes were performed._
