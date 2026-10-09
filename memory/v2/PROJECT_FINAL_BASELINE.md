# Project Final Baseline

> **Agent:** Baseline Freeze + Gap Register Agent (read-only freeze; no code/refactor/deploy/env/DB changes)
> **Freeze date (UTC):** 2026-05-30
> **Source of truth:** code (verified) + the read-only live-DB facts captured in `PROJECT_FINAL_BASELINE_DISCOVERY.md`
> **Companion document:** `/app/memory/v2/PROJECT_GAP_REGISTER.md`
> **Discovery input:** `/app/memory/v2/PROJECT_FINAL_BASELINE_DISCOVERY.md`

---

## 1. Executive Baseline Verdict

The project is a **live, in-production, multi-tenant restaurant "scan & order" + loyalty customer web app (MyGenie)**. It is **working and feature-complete for its intended scope — not greenfield and not broken.** `main` is the deployment-blessed branch; the app actively serves a shared production MongoDB (32,573 orders, 3,869 customers at inspection time).

The frozen reality is **"a working app carrying material security + architectural debt with no automated quality gate."** The system is a **single-file FastAPI companion backend** (config + loyalty-lookup + admin auth + diagnostics) plus a **large React 19 SPA** that integrates **three different backends** (own FastAPI, external MyGenie **CRM**, external MyGenie **POS**) over **three base URLs** and **three/four token systems**. The dominant issues are **missing control layers** (no route-guard abstraction, no backend middleware stack, no rate limiting, in-memory OTP, OTP echoed in responses), **secrets committed into tracked docs**, **config-default triplication/drift**, and **no CI**. The latest feature work (CR-2026-05-30-001 OTP-skip flags, CR-2026-05-30-002 non-QR order block) is **present in code and verified**, and `non_qr_blocks` is live in the DB.

This document **freezes** that state. No correction plan is produced here; gaps are classified in the companion Gap Register.

---

## 2. Frozen Code Baseline

| Field | Frozen value |
|---|---|
| Repository | `https://github.com/Abhi-mygenie/customer-app5th-march.git` (public) |
| Branch | `main` (only deployment-blessed branch; 40+ other branches are OUT OF SCOPE) |
| **Frozen HEAD commit** | **`4612953a31e988dabb5af685fa3bc33c6febb1b6`** — "Auto-generated changes" — `emergent-agent-e1` — 2026-05-30 13:18:35 +0000 |
| Freeze date (UTC) | 2026-05-30 |
| Base image | `fastapi_react_mongo_shadcn_base_image_cloud_arm:release-14052026-2` (`.emergent/emergent.yml`) |

**Freeze rule:** all subsequent planning/correction work is measured against `main @ 4612953`. Any other branch (`dev`, `conflict_*`, dated refactors) must not be treated as baseline without explicit user direction.

---

## 3. Frozen Data Baseline

**The live `mygenie` MongoDB is the single authoritative source for the current data baseline** (read-only verified during discovery, 2026-05-30):

| Collection | Authoritative live count | Notes |
|---|---|---|
| `customer_app_config` | **5** | restaurant_ids `364, 618, 698, 478, 716` |
| `loyalty_settings` | **15** | `pos_0001_restaurant_{689,719,523,364,601,558,478,618,634,541,702,645,762,391,698}` |
| `customers` | 3,869 | |
| `orders` | 32,573 | |
| `order_items` | 81,638 | |
| `points_transactions` | 8,196 | |
| `coupons` / `coupon_usage` | 60 / 116 | |
| `wallet_transactions` | 12 | |
| `non_qr_blocks` | 13 | confirms CR-2026-05-30-002 diagnostics is live + writing |
| `users` | 15 | admin accounts |

**`backend/db_data/` JSON exports are NOT authoritative.** Discovery confirmed they are stale snapshots from **different databases** (`test_database` 2026-03-05, `loyalty_app` 2026-02-25) with mismatched counts and one legacy loyalty schema. They must not be used as the data baseline, and `db_import.py` must not be run against the live DB.

---

## 4. Backend Baseline

- **Single-file FastAPI monolith:** `backend/server.py` (1,707 lines). No module/package split; no service/repository layer; raw `motor` calls with `{"_id":0}` projections (no typed document/base-model layer).
- **Routers under `/api`:** `auth_router` (`/auth`), `customer_router` (`/customer`), `config_router` (`/config`), `upload_router` (`/upload`), `dietary_router` (`/dietary-tags`), `diagnostics_router` (`/diagnostics`), `air_bnb_router` (`/air-bnb`). Static mount `/api/uploads`.
- **Actual responsibility:** admin/restaurant auth (JWT + bcrypt + POS-token fetch), restaurant app-config CRUD (with large hardcoded defaults fallback), loyalty-settings lookup (hardcoded defaults fallback), customer-lookup, POS proxies (`table-config`, `air-bnb/get-order-details`), dietary tags, image upload, non-QR diagnostics, plus legacy `/api/status` boilerplate and `/api/docs/*` file-serving endpoints (several 404 — target md files absent at coded paths).
- **Required env (fail-fast):** `MONGO_URL`, `DB_NAME`, `JWT_SECRET` (raises if missing), `MYGENIE_API_URL` (raises if missing); `CORS_ORIGINS` optional (defaults `*`).
- **Lifecycle:** only `@app.on_event("shutdown")`. No startup/lifespan hook; no index management except a lazy `non_qr_blocks` index.

---

## 5. Frontend Baseline

- **Stack:** React 19 + CRA 5 via **craco**, Tailwind 3.4 + shadcn/ui (Radix), `react-router-dom` 7, `axios` 1.8, `@tanstack/react-query` 5, `@react-google-maps/api`, tiptap, dnd-kit, `react-hot-toast`. Package manager **yarn 1.22**.
- **Provider stack (`App.js`):** `QueryClientProvider → AuthProvider → RestaurantConfigProvider → Router → CartWrapper → routes + CartBar + Toaster`.
- **Routing:** restaurant-scoped paths dominate (`/:restaurantId`, `/:restaurantId/stations|menu|review-order|order-success|password-setup|delivery-address|about|contact|feedback`) + subdomain-mode fallbacks; admin under `/admin/*` via `AdminLayout` (settings, branding, visibility, banners, content, menu, dietary, qr-scanners). `useRestaurantId` fallback chain ends at hardcoded default `478`.
- **State/storage:** Context (`Auth`, `Cart`, `RestaurantConfig`, `AdminConfig`) + React Query (menu/restaurant/table/dietary) + heavy `localStorage`/`sessionStorage`.
- **Thick pages with embedded business logic:** `LandingPage`, `ReviewOrder`, `OrderSuccess`, including restaurant `716` hardcoded carve-outs (user-confirmed temporary). `Call Waiter`/`Pay Bill` are log-only stubs.

---

## 6. Auth / Token / Session Baseline

- **Admin/restaurant auth:** own FastAPI **JWT (HS256, 24h)**, `JWT_SECRET` fail-fast; bcrypt verify vs `users`. FE stores `localStorage.auth_token`; restored via `GET /api/auth/me`.
- **POS token:** fetched during admin login from the POS API, returned as `pos_token`, stored in `localStorage.pos_token` for QR/table-config admin ops.
- **Customer auth:** delegated to the **external CRM** — per-restaurant tokens stored as `localStorage.crm_token_{restaurantId}`, validated via `crmGetProfile()` / `setRestaurantScope()`. Supports password, OTP, and **skip-OTP** (v2). CRM has a **v1/v2 adapter** gated by `REACT_APP_CRM_API_VERSION` (intended `v2`) with per-restaurant `x-api-key`.
- **POS order-token (4th system):** `utils/authToken.js` maintains `localStorage.order_auth_token` + `order_token_expiry`, bootstrapped from `REACT_APP_LOGIN_PHONE`/`REACT_APP_LOGIN_PASSWORD` (a service account in the JS bundle). Known inconsistency: comment says "30 minutes" but constant is **10 minutes**; login-contract shape is ambiguous (matches POS, not FastAPI).
- **OTP:** backend **in-memory dict** (`otp_store`, 5-min expiry) — lost on restart, not multi-worker safe — and the OTP is **returned in the HTTP response** (`otp_for_testing`; CRM `debug_otp`).
- **Session continuity:** heavily dependent on browser storage (tokens, cart, edit-order, scan context, config cache, guest identity).

---

## 7. RBAC / Permissions Baseline

**Exists:**
- Two roles only — `customer` and `restaurant` — distinguished by the JWT `user_type` claim.
- Server-side enforcement on admin routes via `Depends(get_restaurant_user)`; customer-only routes check `user_type == "customer"`.

**Does NOT exist:**
- No granular permissions/scopes, no resource-level authorization model, no role hierarchy beyond the two roles.
- No centralized authorization policy/middleware (per-route `Depends` only).
- No refresh-token/rotation, no admin lockout, no privilege separation for super-admin vs restaurant-admin.
- **Frontend has no route-guard abstraction** — `/admin/*` is a soft post-render `useEffect` redirect in `AdminLayout`; `/profile` is unguarded at the route level.

---

## 8. Middleware / Security Baseline

**Present:**
- **CORS only** (`allow_origins = CORS_ORIGINS or '*'`, `allow_credentials=True`, `allow_methods=['*']`, `allow_headers=['*']`).
- Python `logging.basicConfig(INFO)` + ad-hoc `logging.info/warning`; FE custom `logger.js` + axios interceptors (401 single-retry, `response.data.data` auto-unwrap).

**Missing:**
- No global exception handler / standardized error envelope.
- No request-logging / correlation-ID middleware; no structured logs.
- **No rate limiting / brute-force protection** on auth/OTP endpoints.
- **No security headers** (HSTS, CSP, X-Frame-Options, etc.).
- **CORS `*` + `allow_credentials=True`** is an insecure/invalid combination for credentialed requests.
- No startup hook for index creation / connection validation.

---

## 9. Config / Env Baseline

- **No `.env` files are tracked or present in the repo** (root `.gitignore` blocks `.env`, `.env.*`, `*.env`). **Both backend and frontend `.env` must be recreated on every deploy.** **No `.env.example` exists** → onboarding/deploy fragility; backend fails fast if any required var is missing.
- **Backend env contract (5):** `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `MYGENIE_API_URL`, `CORS_ORIGINS`.
- **Frontend env contract (~11):** `REACT_APP_BACKEND_URL`, `REACT_APP_API_BASE_URL`, `REACT_APP_CRM_URL`, `REACT_APP_CRM_API_VERSION`, `REACT_APP_CRM_API_KEY`, `REACT_APP_GOOGLE_MAPS_API_KEY`, `REACT_APP_IMAGE_BASE_URL`, `REACT_APP_RESTAURANT_ID`, `REACT_APP_LOGIN_PHONE`, `REACT_APP_LOGIN_PASSWORD`, `WDS_SOCKET_PORT`/`NODE_ENV`.
- **Committed-secrets issue (frozen, not yet remediated):** `HANDOVER.md` / `memory/PRD.md` print the **live Mongo URI with password**, `MYGENIE_API_URL`, and `REACT_APP_LOGIN_PHONE`/`PASSWORD`. Secret **rotation is NOT approved/executed yet** (see §16).
- **Default drift:** restaurant config defaults are duplicated across **three sources** — backend `get_app_config()`, FE `RestaurantConfigContext.DEFAULT_CONFIG`, and DB docs — plus a separate loyalty-settings default block. These can silently diverge.

---

## 10. API / External Integration Baseline

The frontend integrates **three distinct backends**, frozen as-is:

| Surface | Base URL env | Client style | Tokens | Responsibility |
|---|---|---|---|---|
| **Own FastAPI** | `REACT_APP_BACKEND_URL` | `fetch` | `auth_token` (admin JWT) | config, loyalty-settings, customer-lookup, admin auth, dietary, banners, uploads, diagnostics, feedback |
| **MyGenie CRM** | `REACT_APP_CRM_URL` (+ `REACT_APP_CRM_API_VERSION`, `REACT_APP_CRM_API_KEY`) | `fetch` (`crmService.js`, v1/v2 adapter) | `crm_token_{rid}` | customer register/login/OTP/skip-OTP, profile, points, wallet, addresses |
| **MyGenie POS** | `REACT_APP_API_BASE_URL` (server: `MYGENIE_API_URL`) | `axios` + interceptors | `order_auth_token` + `pos_token` | restaurant-info, menu-master, restaurant-product, table-config, place order, check-table-status, Razorpay |

**Frozen facts:** mixed `axios`/`fetch`; three base URLs; the backend also proxies a subset of POS calls. `/api/restaurant-info/{id}` is **called by the FE (`AdminConfigContext`) but not implemented in the backend** → silent 404.

---

## 11. DB / Seed / Defaults Baseline

- **`customer_app_config` (live: 5 docs):** ~90 keys (visibility toggles, branding, CMS, payment flags, notification popups, legacy `otpRequired*`). The newer `skipOtp*` and `allowNonQrOrders` keys are **absent in live docs by design** → code defaults apply (matches CR-001/002 "Day-1 no behaviour change" intent).
- **`loyalty_settings` (live: 15 docs):** richer than backend reads — includes `loyalty_enabled`, `wallet_enabled`, `coupon_enabled`, `gold_redemption_value`, `custom_field_{1,2,3}_*`, `loyalty_clean_slate_recalc`, plus `*_earn_percent`/`redemption_value`/`tier_*_min`/bonus fields. Backend `/api/loyalty-settings/{rid}` projects only a subset.
- **Coverage gap:** only 5 restaurants have config docs vs 15 with loyalty docs; sets only partly overlap (e.g., `716` has config but no loyalty doc). Restaurants without config fall back to hardcoded defaults.
- **Seed/hardcoded fallbacks:** `seed_defaults.py` (About/hours/footer/nav), `seed_demo_data.py` (demo customers/users), backend `get_app_config()` defaults, backend loyalty defaults, FE `DEFAULT_CONFIG`.
- **Stale exports:** `backend/db_data/*` are from foreign DBs (`test_database`, `loyalty_app`) — **not authoritative**; `db_import.py` against live is dangerous.

---

## 12. Test / CI Baseline

- **Backend tests:** 10 pytest files (black-box vs a running server + DB). **`backend/tests/test_api.py` is stale/broken** — asserts root `{"message":"Hello World"}` while code returns `{"message":"Customer App API"}`.
- **Frontend tests:** ~22 Jest/craco files (pages/services/transformers/utils/components/context) + `react-router-dom` mock + a `.cjs` test.
- **Testing-agent artifacts:** `test_reports/iteration_1..4.json`; **iteration_4 = all in-scope CR-002 scenarios PASS, `retest_needed:false`.** `test_result.md` is the empty protocol template.
- **CI/CD:** **none** (no `.github/workflows`, GitLab/CircleCI/Jenkins/Dockerfile/Procfile). No automated regression gate. Build note: `CI=true yarn build` fails on `react-hooks/exhaustive-deps`.

---

## 13. Valid Reference Docs

These remain useful (code/DB-corroborated, with noted caveats):
- **`/app/memory/v2/PROJECT_FINAL_BASELINE_DISCOVERY.md`** — the discovery this freeze is built on.
- **`memory/PRD.md`** (2026-05-30) — CR-001/002 confirmed in code + DB. Current.
- **`memory/change_requests/CR-2026-05-30-001*` and `CR-2026-05-30-002*`** — match code. Current.
- **`memory_repo/current-state/CURRENT_ARCHITECTURE.md`, `PROJECT_INVENTORY.md`, `USER_CONFIRMED_RUNTIME_CONTEXT_ADDENDUM.md`** — best long-form architecture reference. *Caveat: line numbers/branch (`abhi-2-may`)/counts are stale; substance holds.*
- **`HANDOVER.md`** (2026-05-30) — env contract, service topology, reproduction steps. *Caveat: stale HEAD/DB counts AND leaks live secrets (also listed in §14).* Use for structure, not for secret values or counts.

---

## 14. Stale / Dangerous Docs

- **`HANDOVER.md` / `memory/PRD.md`** — **DANGEROUS: contain live secrets** (Mongo URI+password, POS login creds). Useful structurally but must be treated as secret-bearing.
- **`DEPLOYMENT_HANDOVER.md`** (2026-05-14, HEAD `3d5197c`) — superseded; stale.
- **`memory_repo/*_v2.md`** (`ARCHITECTURE_v2`, `PRD_v2`, `ROADMAP_v2`, `BUG_TRACKER_v2`, `DEFAULTS_FALLBACKS_AUDIT_v2`, `API_MAPPING_v2`, `CODE_AUDIT_v2`, `SCAN_AND_ORDER_API_v2`, `DOCUMENTATION_AUDIT_SUMMARY_v2`) — predate CR-001/002; history only.
- **`backend/db_data/` exports + README** — STALE and from foreign DBs; **db_import danger**.
- **`backend/tests/test_api.py`** — broken assertion ("Hello World").
- **`test_result.md`** — empty protocol template.
- **`memory/change_requests/round_up_*`, `metadata_branch_diff_*`** (2026-05-14) — historical; not re-verified.
- **Backend `/api/docs/*` endpoints** — point to `/app/memory/*.md` paths that don't exist → 404.

---

## 15. Frozen Assumptions

Future agents MUST assume:
1. Code baseline = `main @ 4612953`; no other branch is baseline.
2. Data baseline = **live `mygenie` DB** counts in §3; `db_data/` exports are non-authoritative.
3. Code is the source of truth; stale docs are not trusted unless code-confirmed.
4. The app integrates **three backends** (FastAPI/CRM/POS) with **three base URLs** and **3–4 token systems**; CRM intent is **v2**.
5. Customer identity/loyalty is served by the **external CRM**, not the FastAPI `customer/*` routes (which are legacy/secondary).
6. `skipOtp*` and `allowNonQrOrders` are **absent in live config docs by design** (defaults apply); CR-001/002 are live with no Day-1 behaviour change.
7. Restaurant `716` hardcoding is **temporary** (user-confirmed); Call Waiter/Pay Bill are **unfinished stubs**; custom pages are **runtime-active** even though the render route is not provable from this repo.
8. `.env` is not in the repo and must be recreated per deploy; backend fails fast on missing required vars.
9. There is **no CI** and no automated regression gate; `test_api.py` is broken.
10. **Secrets in committed docs are a known, unremediated risk** — not yet rotated (see §16).

---

## 16. Not Frozen / Not Approved Yet

The following are explicitly **NOT approved and NOT performed** at this freeze stage:
- ❌ Any **code change, refactor, or modularization** (backend or frontend).
- ❌ Any **deployment** or **service restart**.
- ❌ Any **env file creation/edit** or **env value change**.
- ❌ Any **DB modification, migration, seeding, or `db_import`**.
- ❌ **Secret rotation / git-history purge execution** (identified as needed, but not authorized to execute here).
- ❌ Any **implementation of fixes** for the Gap Register items.
- ❌ Any **correction/remediation plan** (this freeze only classifies; planning is the next agent's job).

All of the above require explicit owner approval before a subsequent agent acts.

---

## 17. Recommended Next Agent

**A planning-only "Backend Control-Layer & Security Hardening Planner."** Its mandate is to produce a prioritized **remediation plan (no implementation)** ordered by the Gap Register: (1) P0-Security secret exposure + rotation/purge strategy, (2) P0-Production-Risk auth/OTP hardening + CORS lockdown + rate limiting + db_import safety, (3) P1 auth/route-guard + token unification + config-baseline consolidation, then (4) P2 architecture/observability/test-CI. A **Frontend Architecture Planner** and a **DevOps/CI Planner** may follow. No implementation, env, DB, or secret-rotation execution until that plan is approved.

---

_End of frozen baseline. Read-only; no code/refactor/deploy/env/DB/secret changes performed._
