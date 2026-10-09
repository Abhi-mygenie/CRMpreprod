# Project Gap Register

> **Agent:** Baseline Freeze + Gap Register Agent (read-only classification; no implementation)
> **Freeze date (UTC):** 2026-05-30
> **Baseline:** `main @ 4612953a31e988dabb5af685fa3bc33c6febb1b6`
> **Inputs:** `/app/memory/v2/PROJECT_FINAL_BASELINE_DISCOVERY.md` + `/app/memory/v2/PROJECT_FINAL_BASELINE.md`
> **Status of all gaps:** classification only. **No implementation approved or started.**

---

## Severity & Bucket key

- **Severity:** `High` / `Med` / `Low` (qualitative production impact).
- **Bucket (priority lane):** `P0-Security`, `P0-Production Risk`, `P1-Auth-Control`, `P1-Frontend-Control`, `P1-Config-Baseline`, `P2-Architecture`, `P2-Observability`, `P2-Test-CI`, `P3-Cleanup`.
- **Implementation Status:** all `NOT STARTED — implementation not approved` at freeze.
- **P-count is derived from the Bucket prefix** (`P0-*`, `P1-*`, `P2-*`, `P3-*`).

---

## Gap Register Table

| Gap ID | Severity | Bucket | Area | Confirmed Finding | Evidence Source | Production Risk | Recommended Owner Decision | Implementation Status |
|---|---|---|---|---|---|---|---|---|
| GAP-001 | High | P0-Security | Secrets | **Live secrets committed in tracked docs** — live Mongo URI **with password**, `MYGENIE_API_URL`, POS login creds printed in handover/PRD. | `HANDOVER.md` §3; `memory/PRD.md`; Discovery R1 | Credential leakage to anyone with repo access → full DB compromise. | Approve secret **rotation** + **git-history purge** + move values to runtime secrets. | NOT STARTED — implementation not approved |
| GAP-002 | High | P0-Security | Secrets / FE | **POS service-account creds shipped in the JS bundle** via `REACT_APP_LOGIN_PHONE`/`REACT_APP_LOGIN_PASSWORD`. | `frontend/src/utils/authToken.js:15-21,93-100`; Discovery R2 | Anyone can extract POS service creds from public JS → POS API abuse. | Approve moving POS auth **server-side**; rotate the exposed account. | NOT STARTED — implementation not approved |
| GAP-003 | High | P0-Security | Auth / OTP | **OTP echoed in API responses** (`otp_for_testing`, CRM `debug_otp`) **and in-memory OTP store** (lost on restart, not multi-worker safe). | `backend/server.py:336-354,437`; `crmService.js`; Discovery R3/R4 | OTP returned to client = auth bypass; in-memory store = unreliable/insecure auth at scale. | Approve removing OTP from responses + moving OTP to a persistent/throttled store. | NOT STARTED — implementation not approved |
| GAP-004 | Med | P2-Observability | Backend middleware | **No backend middleware stack** — no global exception handler, no request/correlation logging, no security headers, no startup/index hook. | `backend/server.py` (only CORS `add_middleware`, only shutdown hook); Discovery §9/R-middleware | Inconsistent errors, no traceability, weak hardening on a live prod service. | Approve adding error-handler + logging + security-headers + startup/index middleware (plan stage). | NOT STARTED — implementation not approved |
| GAP-005 | High | P0-Production Risk | CORS / Rate-limit | **CORS `*` + `allow_credentials=True`** (insecure combo) **and no brute-force / rate-limiting** on auth/OTP endpoints. | `backend/server.py:1689-1695`; absence of throttling; Discovery R5/R6 | Credentialed cross-origin misuse + unthrottled credential/OTP attacks. | Approve CORS lockdown to explicit origins + rate-limit/lockout policy. | NOT STARTED — implementation not approved |
| GAP-006 | Med | P1-Frontend-Control | FE route guard | **No frontend route-guard layer** — `/admin/*` protected only by a soft post-render `useEffect` redirect; `/profile` unguarded at the route level. | `frontend/src/App.js`; `layouts/AdminLayout.jsx:40-64`; Discovery R7 | Brief unauthorized render; weak/centralization-less access control on admin UI. | Approve a `<ProtectedRoute>` / guard abstraction (plan stage). | NOT STARTED — implementation not approved |
| GAP-007 | Med | P2-Architecture | API contract | **Missing backend endpoint `/api/restaurant-info/{id}`** — called by FE `AdminConfigContext` but not implemented in `server.py` → silent 404. | `frontend/src/context/AdminConfigContext.jsx:163`; absent in `server.py`; Discovery R8 | Silent failure of an admin data dependency; hidden contract drift. | Decide: implement endpoint OR consolidate to an existing runtime path. | NOT STARTED — implementation not approved |
| GAP-008 | Med | P1-Config-Baseline | Config defaults | **Config-default triplication/drift** (backend `get_app_config()` vs FE `DEFAULT_CONFIG` vs DB) **and many restaurants lack config docs** (5 config vs 15 loyalty). | `server.py:980-1100`; `RestaurantConfigContext.jsx:9-132`; live DB; Discovery R9 | Silent UI/behaviour divergence between layers; inconsistent restaurant experience. | Approve a single source-of-truth config schema + backfill strategy (plan stage). | NOT STARTED — implementation not approved |
| GAP-009 | Med | P2-Test-CI | Test / CI | **No CI pipeline and a stale/broken backend test** (`test_api.py` asserts "Hello World" vs actual "Customer App API"). | `backend/tests/test_api.py:29`; no CI files; Discovery R10 | No automated regression gate; broken test masks real status. | Approve fixing the test + adding a minimal CI gate (plan stage). | NOT STARTED — implementation not approved |
| GAP-010 | High | P0-Production Risk | DB / Data baseline | **Stale baseline artifacts / `db_data` exports from different DBs** (`test_database`, `loyalty_app`); `db_import.py` against live `mygenie` is dangerous. | `backend/db_data/_manifest.json`, `_export_metadata.json`, `loyalty_settings.json`; Discovery R11 | Accidental `db_import` could corrupt/overwrite the live production DB. | Approve quarantining/labelling exports + a db_import safety guard (plan stage). | NOT STARTED — implementation not approved |
| GAP-011 | Med | P1-Auth-Control | Token/session | **Three/four coexisting token systems** (`auth_token`, `crm_token_{rid}`, `pos_token`, `order_auth_token`) with no unified manager; `authToken.js` 10-min vs "30-min" mismatch + ambiguous login contract. | `AuthContext.jsx`; `utils/authToken.js:11,69-78,97-100`; `crmService.js`; Discovery R13/R17 | Fragile/inconsistent session continuity; expiry/contract confusion. | Approve a unified token/session manager design (plan stage). | NOT STARTED — implementation not approved |
| GAP-012 | Med | P1-Auth-Control | RBAC | **RBAC limited to 2 roles** (`customer`/`restaurant`); no granular permissions, no refresh-token/rotation, 24h JWT, no admin lockout. | `backend/server.py:287-329`; Discovery §8 (Baseline §7) | Coarse authorization; long-lived tokens; no privilege separation. | Decide target RBAC model + token lifecycle (plan stage). | NOT STARTED — implementation not approved |
| GAP-013 | Med | P2-Architecture | Backend structure | **Single-file 1,707-line FastAPI monolith** — no router/service/repository split, no typed Mongo document/base-model layer. | `backend/server.py:1-1707`; Discovery §12 #1-2 | Low maintainability; high change-risk blast radius. | Decide modularization approach (plan stage). | NOT STARTED — implementation not approved |
| GAP-014 | Med | P2-Architecture | Integration topology | **Three backends + three base URLs + mixed `axios`/`fetch`**; heavy reliance on browser storage for session continuity; no unified API gateway. | `axios.js`, `endpoints.js`, `crmService.js`, contexts; Discovery R13/§5 | Hard-to-reason integration surface; brittle storage-coupled state. | Decide an API-client/gateway consolidation direction (plan stage). | NOT STARTED — implementation not approved |
| GAP-015 | Med | P1-Config-Baseline | Env contract | **`.env` not in repo (gitignored), no `.env.example`**; backend fail-fast on missing required vars → deploy/onboarding fragility. | root `.gitignore`; `server.py:23-40`; Discovery R12/§6 | Deploys break if any of 5 backend / ~11 FE vars are missed; no documented template. | Approve adding `.env.example` + documented env contract (plan stage). | NOT STARTED — implementation not approved |
| GAP-016 | Low | P3-Cleanup | Hardcoding | **Restaurant `716` hardcoded business logic** across FE files (user-confirmed temporary). | `ReviewOrder.jsx`, `orderService.ts`, `orderAccessPolicy.js`; Discovery R14; `USER_CONFIRMED_RUNTIME_CONTEXT_ADDENDUM.md` | Tenant-specific branching baked into shared code → future bugs. | Decide phase-2 generalization timing. | NOT STARTED — implementation not approved |
| GAP-017 | Low | P3-Cleanup | Unfinished feature | **`Call Waiter` / `Pay Bill` are log-only stubs** (user-confirmed unfinished). | `LandingPage.jsx`, `OrderSuccess.jsx`; Discovery R15 | UI affordances with no real integration → user confusion. | Decide complete vs hide. | NOT STARTED — implementation not approved |
| GAP-018 | Low | P3-Cleanup | Doc endpoints | **Backend `/api/docs/*` endpoints 404** — point to `/app/memory/*.md` paths that don't exist (files live in `memory_repo/` with `_v2`). | `backend/server.py:1614-1684`; Discovery R16 | Dead endpoints; misleading. | Decide fix paths vs remove endpoints. | NOT STARTED — implementation not approved |
| GAP-019 | Low | P3-Cleanup | Stale docs | **Stale/misleading docs** — `DEPLOYMENT_HANDOVER.md`, `memory_repo/*_v2.md`, `db_data/README.md`, empty `test_result.md`, `round_up_*`/`metadata_branch_diff_*`. | Discovery §11/§14; doc git dates 2026-05-14 | Future agents may trust stale truth/counts. | Approve archiving/labelling stale docs. | NOT STARTED — implementation not approved |
| GAP-020 | Low | P3-Cleanup | Legacy code | **Legacy FastAPI `customer/*` routes likely unused** (CRM serves live customer flows); legacy `pages/AdminSettings.jsx` overlaps new `pages/admin/*`. | `server.py:754-952`; `crmService.js`; `App.js`; Discovery §4/PROJECT_INVENTORY §12 | Dead/duplicate paths increase confusion + maintenance. | Decide after a usage trace (do NOT delete blindly — some paths runtime-active). | NOT STARTED — implementation not approved |
| GAP-021 | ~~Low~~ | ~~P3-Cleanup~~ | ~~Hardcoding~~ | **CLOSED 2026-07-13** — Restaurant `699` takeaway charge implemented via Option C (config-driven). `ReviewOrder.jsx` reads `restaurant.takeaway_charges` from `useRestaurantDetails` (POS restaurant-info hook). No hardcode. No `orderService.ts` change. Generalises to all restaurants automatically. | CR-2026-02-XX-002 PLANNING_REPORT.md | No hardcode introduced — GAP-021 never materialised. POS `takeaway_charges` field used directly from API. | N/A — config-driven, no sunset needed. | ✅ CLOSED — CR-2026-02-XX-002 implemented 2026-07-13 |

---

## Bucket / Severity Roll-up

| Priority lane (P-count source) | Gap IDs | Count |
|---|---|---|
| **P0** | GAP-001, GAP-002, GAP-003 (P0-Security); GAP-005, GAP-010 (P0-Production Risk) | **5** |
| **P1** | GAP-006 (Frontend-Control); GAP-008, GAP-015 (Config-Baseline); GAP-011, GAP-012 (Auth-Control) | **5** |
| **P2** | GAP-004 (Observability); GAP-007, GAP-013, GAP-014 (Architecture); GAP-009 (Test-CI) | **5** |
| **P3** | GAP-016, GAP-017, GAP-018, GAP-019, GAP-020, GAP-021 (Cleanup) | **6** |
| **Total** | | **21** |

**By severity:** High = 5 (GAP-001/002/003/005/010), Med = 10 (GAP-004/006/007/008/009/011/012/013/014/015), Low = 6 (GAP-016/017/018/019/020/021).

**Update log:**
- 2026-02 — GAP-021 added (Restaurant 699 takeaway ₹10 hardcode via `delivery_charge`, temporary; ref CR-2026-02-XX-002).

**Bucket coverage:** P0-Security (3), P0-Production Risk (2), P1-Auth-Control (2), P1-Frontend-Control (1), P1-Config-Baseline (2), P2-Architecture (3), P2-Observability (1), P2-Test-CI (1), P3-Cleanup (5).

---

## Notes / Guardrails

- This register is **classification only**. **No fix is approved, planned, or implemented.**
- All 10 discovery gaps are represented: #1→GAP-001, #2→GAP-002, #3→GAP-003, #4→GAP-004, #5→GAP-005, #6→GAP-006, #7→GAP-007, #8→GAP-008, #9→GAP-009, #10→GAP-010. GAP-011..GAP-020 are additional confirmed findings carried from the discovery report (R12–R17 + §7/§12).
- Do **not** delete legacy code (GAP-020), run `db_import` (GAP-010), or rotate secrets (GAP-001/002/003) without explicit owner approval and a reviewed plan.
- Next step is a **planning-only** agent (see `PROJECT_FINAL_BASELINE.md` §17).

_End of Gap Register._
