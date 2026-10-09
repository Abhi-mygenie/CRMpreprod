# Project Final Baseline Discovery

> **Agent:** Baseline Discovery Agent (read-only)
> **Date (UTC):** 2026-05-30
> **Repo:** https://github.com/Abhi-mygenie/customer-app5th-march.git
> **Branch:** `main`
> **Inspected local clone:** `/tmp/baseline_repo` (fresh `git clone --branch main`)
> **Cloned HEAD:** `4612953a31e988dabb5af685fa3bc33c6febb1b6` — "Auto-generated changes" — `emergent-agent-e1` — 2026-05-30 13:18:35 +0000
> **Scope:** READ-ONLY. No deploy, no service restart, no code/DB/env writes, no scaffolding, no implementation plans. One live **read-only** DB query was run (counts + field-key inspection only) using a URI found in committed handover docs, per explicit user approval.

---

## 1. Executive Verdict

This is a **live, in-production, multi-tenant restaurant "scan & order" + loyalty customer web app (MyGenie)**. It is **NOT a greenfield project and NOT broken** — `main` is the deployment-blessed branch, the backend and frontend are coherent and feature-complete for their intended scope, and the app is actively serving a shared production MongoDB (32,573 orders, 3,869 customers as of this inspection).

The true status is: **a working application carrying significant accumulated architectural and security debt, with no automated quality gate.** The codebase is a **single-file FastAPI "companion backend"** (config + loyalty-lookup + admin auth + diagnostics) plus a **large React 19 SPA** that talks to **three different backends** (its own FastAPI, an external MyGenie **CRM** API, and an external MyGenie **POS** API) using **three different token systems** and **three different API base URLs**.

The most material findings are not functional bugs — they are **missing control layers** (no auth/route guard abstraction, no backend middleware stack, no rate limiting, in-memory OTP, OTP echoed in responses), **secrets committed into tracked docs**, **config-default triplication / drift risk**, and **no CI with a stale/broken backend test**. The latest real feature work (CR-2026-05-30-001 OTP-skip flags, CR-2026-05-30-002 non-QR order block) is **fully present in code and verified**, and the project memory (`/app/memory`) is current. Older `memory_repo/` audit docs are directionally correct but carry stale line-numbers, branch names, and DB counts.

**Recommended action before any correction work:** freeze `main @ 4612953` and the live-DB data baseline captured below, then proceed to a *planning-only* hardening/remediation agent.

---

## 2. Repository / Branch / Scope

| Item | Value |
|---|---|
| Repository | `https://github.com/Abhi-mygenie/customer-app5th-march.git` (public) |
| Branch inspected | `main` |
| Local inspected path | `/tmp/baseline_repo` |
| Cloned HEAD SHA | `4612953a31e988dabb5af685fa3bc33c6febb1b6` (2026-05-30 13:18:35 +0000) |
| Remote branches present | **40+** (`dev`, `11-may-uat`, `14-may-phase2`, `30-may`, many `conflict_*`, `abhi-*`, dated refactor branches). Only `main` is in scope. |
| Read/Write actions taken | Clone (read), file inspection (read), **one read-only live Mongo query** (ping + `estimated_document_count` + projected `find_one`/`find` for collection/field discovery). **No writes anywhere.** |
| DB write/modify | None |
| Env/code/service changes | None |

The `.emergent/emergent.yml` confirms the base image `fastapi_react_mongo_shadcn_base_image_cloud_arm:release-14052026-2`, job `e8c53b7e-31a7-410e-a303-c438c7b1352f`.

---

## 3. Files and Docs Inspected

**Backend (code):**
- `backend/server.py` (1,707 lines — entire file read)
- `backend/requirements.txt` (123 pinned pkgs)
- `backend/seed_defaults.py`, `backend/seed_demo_data.py` (header/role)
- `backend/db_export.py`, `backend/db_import.py` (env usage)
- `backend/tests/test_api.py` (full) + listing of `test_config_api.py`, `test_login_auth.py`, `test_banner_edit.py`, `test_content_tab.py`, `test_default_pages.py`, `test_qr_table_config.py`, `test_social_media_fields.py`, `test_timing_controls.py`, `test_upload_api.py`
- `backend/db_data/` → `_manifest.json`, `_export_metadata.json`, `README.md`, `loyalty_settings.json` (full), plus listing of `customer_app_config.json`, `customers.json`, `orders.json`, etc.

**Frontend (code):**
- `frontend/src/App.js` (route map + provider stack)
- `frontend/src/context/AuthContext.jsx`, `RestaurantConfigContext.jsx` (full); `AdminConfigContext.jsx` (restaurant-info reference); `CartContext.js` (listed)
- `frontend/src/api/config/axios.js`, `api/config/endpoints.js`, `api/interceptors/request.js`, `api/interceptors/response.js`
- `frontend/src/api/services/crmService.js` (full — CRM v1/v2 adapter)
- `frontend/src/layouts/AdminLayout.jsx` (full — admin guard pattern)
- `frontend/src/utils/authToken.js` (full — POS order-token system)
- `frontend/package.json`, `frontend/.gitignore`, root `.gitignore`
- Full `frontend/src` file tree (pages, components, hooks, utils, `__tests__`, `__mocks__`)

**Docs / memory:**
- Root: `README.md`, `HANDOVER.md` (full), `DEPLOYMENT_HANDOVER.md` (header), `test_result.md` (full), `SCAN_AND_ORDER_VALIDATION_TRACKER.xlsx` (presence only)
- `memory/PRD.md` (full) + `memory/change_requests/CR-2026-05-30-001*`, `CR-2026-05-30-002*`, `round_up_*`, `metadata_branch_diff_*` (listing + dates)
- `memory_repo/current-state/CURRENT_ARCHITECTURE.md` (full), `PROJECT_INVENTORY.md` (full), `USER_CONFIRMED_RUNTIME_CONTEXT_ADDENDUM.md` (full) + listing of `API_USAGE_MAP.md`, `MODULE_MAP.md`, `AUTH_TOKEN_FLOW_AUDIT.md`, `RUNTIME_API_FLOW_AUDIT.md`, `STALE_OR_MISSING_ROUTE_REPORT.md`, `NEXT_IMPLEMENTATION_RISK_REGISTER.md`, etc.
- `memory_repo/` v2 doc set: `ARCHITECTURE_v2.md`, `PRD_v2.md`, `ROADMAP_v2.md`, `BUG_TRACKER_v2.md`, `DEFAULTS_FALLBACKS_AUDIT_v2.md`, `API_MAPPING_v2.md`, `CODE_AUDIT_v2.md`, `DEPLOYMENT_RUN_ISSUES.md`, `SCAN_AND_ORDER_API_v2.md`, `DOCUMENTATION_AUDIT_SUMMARY_v2.md` (dates + role)
- `test_reports/iteration_1..4.json` (iteration_4 read in full — CR-002 verification)
- `.emergent/emergent.yml`

**Live DB (read-only):** `mygenie` database at `52.66.232.149:27017` — collection list, counts, and `customer_app_config` / `loyalty_settings` field-key + id discovery.

---

## 4. Current Backend Reality

**Shape:** A single-file FastAPI monolith — `backend/server.py` (1,707 lines). No package/module split, no service/repository layer; all models, auth helpers, OTP store, POS proxy logic, Mongo access, static serving, and "docs" endpoints live in one file.

**App & routers:**
- `app = FastAPI(title="Customer App API")`
- `api_router` (prefix `/api`) aggregates: `auth_router` (`/auth`), `customer_router` (`/customer`), `config_router` (`/config`), `upload_router` (`/upload`), `dietary_router` (`/dietary-tags`), `diagnostics_router` (`/diagnostics`), `air_bnb_router` (`/air-bnb`).
- Static mount: `/api/uploads` → `backend/uploads/`.

**What this backend actually does (its real responsibility):**
1. **Admin (restaurant) auth** — `POST /api/auth/login` against `users` collection (bcrypt), issues a 24h HS256 JWT; on login it also calls the **POS** API (`/auth/vendoremployee/login`) to fetch a fresh `pos_token` returned to the FE (not stored).
2. **Customer auth helpers** (legacy/secondary) — `send-otp`, `check-customer`, `set-password`, `verify-password`, `reset-password`, plus `customer/profile|orders|points|wallet|coupons`. **NOTE:** the live customer identity/loyalty flow in the FE is served by the **external CRM API**, not these endpoints — these FastAPI customer routes appear largely legacy.
3. **Restaurant app config CRUD** — `GET /api/config/{restaurant_id}` (public; returns a **large hardcoded default config dict** when no doc exists), `PUT /api/config/` (admin), banners, custom pages, feedback.
4. **Loyalty lookup** — `GET /api/loyalty-settings/{restaurant_id}` (public; hardcoded defaults fallback), `GET /api/customer-lookup/{restaurant_id}?phone=`.
5. **POS proxies** — `GET /api/table-config` (admin + `X-POS-Token`), `GET /api/air-bnb/get-order-details/{order_id}`.
6. **Dietary tags** mapping; **image upload** (5 MB, ext-allowlist); **diagnostics** `POST /api/diagnostics/non-qr-block` (204, fire-and-forget, rolling 200/restaurant cap, lazy index).
7. **Doc-serving endpoints** `/api/docs/*` that read `/app/memory/*.md` from disk (several target files like `BUG_TRACKER.md`, `API_MAPPING.md`, `ARCHITECTURE.md` are **not present** at those exact paths → 404).
8. Boilerplate leftovers: `/api/`, `/api/status` (`status_checks` collection).

**Env (required, fail-fast):** `MONGO_URL`, `DB_NAME`, `JWT_SECRET` (raises if missing), `MYGENIE_API_URL` (raises if missing); `CORS_ORIGINS` optional (defaults `*`).

**Notable backend characteristics:**
- Auth is **per-route** via FastAPI `Depends(get_current_user)` / `get_restaurant_user`. There is **no auth middleware**.
- OTP is an **in-process Python dict** (`otp_store`) with 5-min expiry — not Redis, lost on restart, not multi-worker safe — and the generated OTP is **returned in the HTTP response** (`otp_for_testing`).
- Only **one** `add_middleware` call: CORS. No request logging, no global exception handler, no rate limiting, no security headers.
- Only `@app.on_event("shutdown")` exists; **no startup/lifespan hook** and **no index management** except the lazy `non_qr_blocks` index.
- `datetime.now(timezone.utc)` used consistently (good). Mongo `_id` is excluded via projections (`{"_id": 0}`) rather than a typed document base model.

---

## 5. Current Frontend Reality

**Stack:** React 19 + CRA 5 via **craco**, Tailwind 3.4 + shadcn/ui (Radix), `react-router-dom` 7, `axios` 1.8, `@tanstack/react-query` 5, `@react-google-maps/api`, tiptap, dnd-kit, `react-hot-toast`. Package manager: **yarn 1.22**.

**Provider stack (`App.js`):** `QueryClientProvider → AuthProvider → RestaurantConfigProvider → Router → CartWrapper → routes + CartBar + Toaster`.

**Routing:** Restaurant-scoped paths dominate (`/:restaurantId`, `/:restaurantId/stations`, `/:restaurantId/menu/:stationId?`, `/:restaurantId/review-order`, `/:restaurantId/order-success`, `/:restaurantId/password-setup`, `/:restaurantId/delivery-address`, about/contact/feedback), plus subdomain-mode fallbacks (`/`, `/menu`, `/stations`). Admin lives under `/admin/*` via `AdminLayout` (nested: settings, branding, visibility, banners, content, menu, dietary, qr-scanners). `restaurantId` is resolved by `useRestaurantId` with a fallback chain ending in a **hardcoded default `478`**.

**Three external integration surfaces from the FE:**
1. **Own FastAPI backend** via `REACT_APP_BACKEND_URL` (fetch-based) — config, loyalty-settings, customer-lookup, admin auth, dietary, banners, uploads, diagnostics, feedback.
2. **MyGenie CRM API** via `REACT_APP_CRM_URL` (fetch-based, `crmService.js`) — customer register/login/OTP/skip-OTP, profile, points, wallet, addresses. Has a **v1/v2 contract adapter** gated by `REACT_APP_CRM_API_VERSION` and **per-restaurant `x-api-key`** map from `REACT_APP_CRM_API_KEY` (JSON).
3. **MyGenie POS API** via `REACT_APP_API_BASE_URL` (axios `apiClient` + interceptors) — `/web/restaurant-info`, `/web/restaurant-product`, `/web/menu-master`, `/web/table-config`, `/customer/order/place`, `/customer/check-table-status`, `/razor-pay/*`.

**State & storage:** Context (`AuthContext`, `CartContext`, `RestaurantConfigContext`, `AdminConfigContext`) + React Query (menu/restaurant/table/dietary) + heavy `localStorage`/`sessionStorage` use for tokens, cart, edit-order, scan context, config cache, guest identity.

**Business logic in pages:** `LandingPage`, `ReviewOrder`, `OrderSuccess` are thick — they encode routing, auth branching, payment branching, table/scan logic, retry/error behavior, and **restaurant `716` hardcoded carve-outs** (user-confirmed temporary).

**Unfinished/known-stub features:** `Call Waiter` / `Pay Bill` log-only stubs (user-confirmed unfinished integrations). Google Maps features depend on `REACT_APP_GOOGLE_MAPS_API_KEY` (documented blank).

---

## 6. Current Config / Env Reality

- **No `.env` files are tracked in git and none exist on disk in the repo** (`git ls-files` → none; filesystem → none). Root `.gitignore` blocks `.env`, `.env.*`, `*.env` (the file even contains a self-contradictory comment claiming Emergent needs `.env` in the repo, but the ignore rules win — they are **not** committed). **Both `.env` files must be recreated on every deployment.**
- **Backend env contract (5 vars):** `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `MYGENIE_API_URL`, `CORS_ORIGINS`. Server raises `ValueError` if `JWT_SECRET` or `MYGENIE_API_URL` are missing; `MONGO_URL`/`DB_NAME` accessed with `os.environ[...]` (KeyError if missing).
- **Frontend env contract (≈11 vars, discovered via `process.env` grep):** `REACT_APP_BACKEND_URL`, `REACT_APP_API_BASE_URL`, `REACT_APP_CRM_URL`, `REACT_APP_CRM_API_VERSION`, `REACT_APP_CRM_API_KEY`, `REACT_APP_GOOGLE_MAPS_API_KEY`, `REACT_APP_IMAGE_BASE_URL`, `REACT_APP_RESTAURANT_ID`, `REACT_APP_LOGIN_PHONE`, `REACT_APP_LOGIN_PASSWORD`, plus `WDS_SOCKET_PORT`/`NODE_ENV`.
- **Concrete env *values* are not in the repo** but the committed `HANDOVER.md` (§3) **prints real production values**, including the live Mongo URI **with password**, `MYGENIE_API_URL`, `REACT_APP_LOGIN_PHONE`/`REACT_APP_LOGIN_PASSWORD`, and CRM base. This is a **secret-exposure issue** (see §13).
- **Inconsistency confirmed in code:** the app simultaneously uses `REACT_APP_BACKEND_URL` (own backend) and `REACT_APP_API_BASE_URL` (POS) and `REACT_APP_CRM_URL` (CRM). `axios.js`/`endpoints.js` log a CRITICAL error if `REACT_APP_API_BASE_URL` is missing but do not hard-fail.

---

## 7. Current DB / Data Baseline

### 7.1 Live DB (authoritative — read-only query, 2026-05-30)
**Database:** `mygenie` @ `52.66.232.149:27017` (MongoDB 7.x). Reachable from this sandbox; queried read-only.

| Collection | Live count | Notes |
|---|---|---|
| `customer_app_config` | **5** | restaurant_ids: **`364, 618, 698, 478, 716`** |
| `loyalty_settings` | **15** | user_ids `pos_0001_restaurant_{689,719,523,364,601,558,478,618,634,541,702,645,762,391,698}` |
| `customers` | 3,869 | |
| `orders` | 32,573 | |
| `order_items` | 81,638 | |
| `points_transactions` | 8,196 | |
| `pos_request_logs` | 5,538 | |
| `coupons` | 60 | |
| `coupon_usage` | 116 | `coupon_transactions` = 0 |
| `wallet_transactions` | 12 | |
| `non_qr_blocks` | **13** | confirms CR-2026-05-30-002 diagnostics is **live & writing** |
| `users` | 15 | admin accounts |
| `segments` | 0 | |
| `migration_sync_logs` | 123 | |
| `cron_job_logs` | 5 | |
| `loyalty_mismatch_logs` | 0 | |
| whatsapp_* (callback/message/event_template_map/template_variable_map) | 43 / 11 / 4 / 4 | |

**Not present in live DB but referenced by backend code:** `dietary_tags_mapping`, `feedback`, `status_checks`, `automation_rules`, `whatsapp_templates`. These resolve to empty/default responses or are created lazily on first write.

**`customer_app_config` shape (live, sampled keys):** ~90 keys — all the visibility toggles, branding (colors/fonts/borderRadius), CMS (aboutUs/openingHours/footer/customPages/navMenuOrder), payment flags, notification popups, plus legacy `otpRequired*` keys. The sampled live doc **does not** contain the newer `skipOtp*` or `allowNonQrOrders` keys → they are **absent by design**, so code defaults apply (matches the CR-001/002 "Day-1 no behaviour change" intent).

**`loyalty_settings` shape (live):** richer than code reads — includes `loyalty_enabled`, `wallet_enabled`, `coupon_enabled`, `gold_redemption_value`, `custom_field_{1,2,3}_*`, `loyalty_clean_slate_recalc`, in addition to the `*_earn_percent`, `redemption_value`, `tier_*_min`, bonus fields. The backend `/api/loyalty-settings/{rid}` only projects a subset.

**Coverage gap (confirmed):** only **5** restaurants have `customer_app_config`, while **15** have `loyalty_settings`; the sets only partially overlap (e.g., `716` has config but no loyalty doc; `689/719/523/...` have loyalty but no config). Restaurants without a config doc fall back to the hardcoded defaults in `get_app_config`.

### 7.2 Committed `db_data/` exports (STALE — different databases)
The repo ships JSON exports that are **inconsistent with each other and with the live DB**:
- `_manifest.json` → db `test_database`, exported 2026-03-05, `customer_app_config: 12`, `customers: 1967`, `loyalty_settings: 7`.
- `_export_metadata.json` → db `loyalty_app`, exported 2026-02-25, includes `automation_rules: 70`, `whatsapp_templates: 70`, `orders: 0`.
- `loyalty_settings.json` contains 7 docs, one legacy `demo-user-restaurant` with an **old schema** (`points_per_rupee`, `redemption_rate`) different from both the live schema and the backend's expected fields.

➡️ These exports are historical restore snapshots from **other databases**, not the current `mygenie` DB. **Do not treat `db_data/` as the data baseline.** Running `db_import.py` against the live DB would be dangerous.

### 7.3 Seed defaults & hardcoded fallbacks (three sources of truth — drift risk)
1. **Backend** `get_app_config()` returns a ~90-field default dict when no config doc exists.
2. **Frontend** `RestaurantConfigContext.DEFAULT_CONFIG` is a near-mirror of the same defaults (plus FE-only normalization in the context `value`).
3. **`loyalty-settings`** backend defaults (`bronze_earn_percent 5.0`, `redemption_value 0.25`, `first_visit_bonus_points 50`, …) when no doc exists.
4. `seed_defaults.py` seeds About/openingHours/footer/feedbackIntro/nav into `customer_app_config` for restaurant users; `seed_demo_data.py` (529 lines) seeds demo customers/users.

These three default sets can silently diverge — a known config-consistency risk.

---

## 8. Current Auth / Session / RBAC Reality

**What exists:**
- **Admin/restaurant auth** = own FastAPI JWT (HS256, 24h, `JWT_SECRET` fail-fast). bcrypt password verify against `users`. Token stored FE-side as `localStorage.auth_token`; restored via `GET /api/auth/me`.
- **POS token** = fetched during admin login from the POS API and returned as `pos_token` (stored in `localStorage.pos_token`) for QR/table-config admin operations.
- **Customer auth** = **external CRM** tokens (per-restaurant), stored as `localStorage.crm_token_{restaurantId}`, validated/restored via `crmGetProfile()` and `setRestaurantScope()`. Supports password, OTP, and **skip-OTP** frictionless login (v2).
- **POS order-token** = a *fourth* token in `utils/authToken.js` (`localStorage.order_auth_token` + `order_token_expiry`), bootstrapped from `REACT_APP_LOGIN_PHONE`/`REACT_APP_LOGIN_PASSWORD` (a **service account** baked into the JS bundle), used by the axios interceptor for POS calls.
- **RBAC** = two roles only (`customer`, `restaurant`) distinguished by the JWT `user_type` claim; `get_restaurant_user` enforces admin-only routes server-side.

**What is missing / weak:**
- **No frontend route-guard abstraction.** There is no `<ProtectedRoute>`. `/admin/*` is protected only by a **soft client-side `useEffect` redirect inside `AdminLayout`** (renders, then redirects if `!token`/`!isRestaurant`). `/profile` has **no route-level guard** in `App.js`.
- **Three (four) coexisting token systems** with no unifying abstraction → fragmentation and inconsistent expiry semantics (`authToken.js` comment says "30 minutes" but constant is **10 minutes**; that util also POSTs `{phone,password}` to `/auth/login`, a shape that matches the POS API, not the FastAPI `/api/auth/login` — a documented ambiguity).
- **OTP is insecure**: in-memory store + OTP returned in API responses (`otp_for_testing`, CRM `debug_otp`).
- **No rate limiting / brute-force protection / lockout** on `/auth/login`, `/auth/send-otp`, `/auth/verify-*`.
- **No refresh-token / rotation**; JWT secret fail-fast is the only hardening present.
- No password-reset throttling beyond OTP single-use.

---

## 9. Current Middleware / Logging / Error Handling Reality

**Exists:**
- **CORS** middleware only (`allow_origins = CORS_ORIGINS or '*'`, `allow_credentials=True`, `allow_methods=['*']`, `allow_headers=['*']`).
- Python `logging.basicConfig(level=INFO)` configured at module bottom; ad-hoc `logging.info/warning` in auth/POS helpers.
- Frontend: a custom `utils/logger.js`, axios request/response interceptors that log and handle 401 (single retry + `auth:unauthorized` CustomEvent), and a response interceptor that auto-unwraps `response.data.data` (POS envelope).
- Diagnostics endpoint swallows its own errors and always returns 204 (intentional fire-and-forget).

**Missing:**
- **No global exception handler** / standardized error envelope (raw `HTTPException` detail strings only).
- **No request-logging / correlation-ID middleware**, no structured/JSON logs, no log levels per environment.
- **No security headers** (HSTS, CSP, X-Frame-Options, etc.).
- **No rate limiting / throttling middleware.**
- **CORS `*` + `allow_credentials=True`** is an invalid/insecure combination for credentialed requests and must be tightened for production.
- **No startup hook** for index creation / connection validation (only lazy `non_qr_blocks` index).

---

## 10. Current Test / CI Reality

**Backend tests (`backend/tests/`):** 10 pytest files (api, config, login_auth, banner_edit, content_tab, default_pages, qr_table_config, social_media_fields, timing_controls, upload_api). They are **black-box** tests that hit a **running** server via httpx against `REACT_APP_BACKEND_URL` (need live server + DB). **`test_api.py` is stale/broken** — it asserts the root returns `{"message": "Hello World"}` while the code returns `{"message": "Customer App API"}`, and its `status` tests depend on a writable DB.

**Frontend tests (`frontend/src/__tests__/`):** ~22 Jest/craco test files (pages: Landing/DeliveryAddress/OrderSuccess/PasswordSetupOtp; services: orderService variants; transformers; utils: authToken/constants/errorHandler/itemAvailability/restaurantIdConfig/useRestaurantId; components: CartBar/Header/Sidebar/PromoBanner/NotificationPopup; context: CartContext) + `react-router-dom` mock + a `.cjs` channel-eligibility test.

**Testing-agent artifacts:** `test_reports/iteration_1..4.json` — these are from the CR-2026-05-30-002 work; **iteration_4 = all in-scope scenarios PASS, `retest_needed: false`**. `test_result.md` is the standard Emergent protocol template with **no logged test data** (header only).

**CI/CD:** **None.** No `.github/workflows`, no GitLab/CircleCI/Jenkins/Dockerfile/Procfile tracked. There is **no automated regression gate**; tests are run manually or by the testing agent. (Build note from handover: `CI=true yarn build` fails on `react-hooks/exhaustive-deps`; use plain `yarn build` or disable the ESLint plugin.)

---

## 11. Valid Docs vs Stale Docs

### Confirmed-VALID (code/DB-corroborated)
- **`memory/PRD.md`** (2026-05-30) — describes CR-001 (`skipOtp*`) and CR-002 (`allowNonQrOrders` + diagnostics). **All confirmed present in `server.py` and `RestaurantConfigContext.jsx`, and `non_qr_blocks` is live in the DB.** Current.
- **`memory/change_requests/CR-2026-05-30-001*` and `CR-2026-05-30-002*`** — match code. Current.
- **`memory_repo/current-state/CURRENT_ARCHITECTURE.md`, `PROJECT_INVENTORY.md`, `USER_CONFIRMED_RUNTIME_CONTEXT_ADDENDUM.md`** — architecturally accurate and the best long-form reference. **Caveat:** written ~2026-05-14 against an earlier `server.py` (~1,610 lines) and partly on branch `abhi-2-may`, so **line numbers, branch name, and some counts are stale**; the architectural substance still holds.
- **`HANDOVER.md`** (2026-05-30) — env contract, service topology, and reproduction steps are valid and useful. **Caveats:** its HEAD SHA `2deb245`/date 2026-05-14 and DB counts (`customer_app_config: 2`) are **already stale** vs current main HEAD `4612953` and live DB (`customer_app_config: 5`). Also **leaks live secrets**.

### STALE / PARTIAL / MISLEADING
- **`DEPLOYMENT_HANDOVER.md`** (2026-05-14, HEAD `3d5197c`) — superseded by `HANDOVER.md`; stale HEAD and pre-CR-30 state.
- **`memory_repo/*_v2.md`** (`ARCHITECTURE_v2`, `PRD_v2`, `ROADMAP_v2`, `BUG_TRACKER_v2`, `DEFAULTS_FALLBACKS_AUDIT_v2`, `API_MAPPING_v2`, `CODE_AUDIT_v2`, `SCAN_AND_ORDER_API_v2`, …) — all 2026-05-14; **predate CR-001/002** and the latest main commits; useful history, not current truth.
- **`backend/db_data/` exports + README** — STALE and from **different databases** (`test_database`, `loyalty_app`); counts and one loyalty schema do not match live `mygenie`.
- **`backend/tests/test_api.py`** — asserts the wrong root message; would FAIL today.
- **`test_result.md`** — empty protocol template; not a record of current state.
- **`memory/change_requests/round_up_*` and `metadata_branch_diff_*`** (2026-05-14) — historical investigations; status not re-verified against current code in this pass.
- **`/api/docs/*` endpoints** in `server.py` point to `/app/memory/BUG_TRACKER.md`, `API_MAPPING.md`, `ARCHITECTURE.md`, etc. — several of those exact files do not exist at those paths (they live in `memory_repo/` with `_v2` suffixes) → those doc endpoints 404.

---

## 12. Missing Control Layers

**Backend:**
1. No modular structure (single 1,707-line file); no router/service/repository separation.
2. No typed Mongo document/base-model layer (raw dicts + `{"_id":0}` projections).
3. No auth **middleware** (per-route `Depends` only); no centralized authorization policy.
4. No rate limiting / brute-force / lockout layer.
5. No global exception handler / standardized error response model.
6. No request logging / correlation IDs / structured logging.
7. No security-headers middleware; CORS is `*` + credentials (insecure).
8. No startup/lifespan hook; no index management (except lazy `non_qr_blocks`).
9. OTP/session store is in-memory (no Redis/persistent store); not horizontally scalable.
10. No config schema versioning/validation; defaults duplicated across backend + FE + DB.
11. No secrets management beyond `.env` (and secrets are leaked in tracked docs).

**Frontend:**
12. No `<ProtectedRoute>` / centralized route-guard layer (admin guard is a soft post-render redirect; `/profile` unguarded at route level).
13. No unified API gateway/client — three base URLs and a mix of `axios` + `fetch`.
14. No unified token/session manager — 3–4 token systems across `localStorage`.
15. No React error boundary observed at the app shell.

**Cross-cutting:**
16. No CI/CD pipeline / automated test gate.
17. No environment/config contract validation at boot (FE logs but does not fail).

---

## 13. Production Risk Findings (confirmed from code/docs)

| # | Severity | Finding | Evidence |
|---|---|---|---|
| R1 | **HIGH** | **Live secrets committed in tracked docs** — `HANDOVER.md`/`memory/PRD.md` print the live Mongo URI **with password**, `MYGENIE_API_URL`, and `REACT_APP_LOGIN_PHONE`/`PASSWORD`. | `HANDOVER.md` §3; `memory/PRD.md` |
| R2 | **HIGH** | **POS service-account creds shipped in the JS bundle** via `REACT_APP_LOGIN_PHONE`/`REACT_APP_LOGIN_PASSWORD`. | `utils/authToken.js:15-21,93-100` |
| R3 | **HIGH** | **OTP echoed in API responses** (`otp_for_testing`, CRM `debug_otp`) → auth-bypass risk in prod. | `server.py:437`; `crmService.js` |
| R4 | **HIGH/MED** | **In-memory OTP store** — lost on restart, not multi-worker safe; not production-grade. | `server.py:336-354` |
| R5 | **MED** | **CORS `*` + `allow_credentials=True`** default; insecure for credentialed calls. | `server.py:1689-1695` |
| R6 | **MED** | **No rate limiting / lockout** on auth/OTP endpoints. | absence in `server.py` |
| R7 | **MED** | **No frontend route guard** — `/admin/*` soft redirect only; `/profile` unguarded; brief unauthorized render possible. | `App.js`; `AdminLayout.jsx:40-64` |
| R8 | **MED** | **`/api/restaurant-info/{id}` referenced by FE but not implemented in backend** → silent 404. | `AdminConfigContext.jsx:163`; absent in `server.py` |
| R9 | **MED** | **Config-default triplication / drift** (backend defaults vs FE `DEFAULT_CONFIG` vs DB); only 5/15 restaurants have config docs. | `server.py:980-1100`; `RestaurantConfigContext.jsx:9-132`; live DB |
| R10 | **MED** | **No CI + stale/broken backend test** (`test_api.py` expects "Hello World"); no regression gate. | `backend/tests/test_api.py:29`; no CI files |
| R11 | **MED** | **Stale DB exports from different DBs** (`test_database`/`loyalty_app`); `db_import.py` against live DB is dangerous. | `db_data/_manifest.json`, `_export_metadata.json` |
| R12 | **MED** | **`.env` not in repo** (gitignored) → must be recreated each deploy; backend fails fast if any required var missing. | root `.gitignore`; `server.py:23-40` |
| R13 | **LOW/MED** | **Three backends + 3–4 token systems**, heavy reliance on browser storage → fragile session continuity. | `AuthContext.jsx`, `authToken.js`, `crmService.js` |
| R14 | **LOW/MED** | **Restaurant `716` hardcoded business logic** across FE files (user-confirmed temporary). | `ReviewOrder.jsx`, `orderService.ts`, `orderAccessPolicy.js` |
| R15 | **LOW** | **`Call Waiter` / `Pay Bill` are stubs** (user-confirmed unfinished). | `LandingPage.jsx`, `OrderSuccess.jsx` |
| R16 | **LOW** | **`/api/docs/*` endpoints 404** (target md paths don't exist). | `server.py:1614-1684` |
| R17 | **LOW** | **`authToken.js` expiry comment/constant mismatch** (10 min vs "30 minutes") and possible login-contract ambiguity. | `utils/authToken.js:11,69-78,97-100` |

---

## 14. Recommended Baseline Freeze

Freeze the following as the **current canonical baseline** before any correction/refactor work:

1. **Code baseline:** `main @ 4612953a31e988dabb5af685fa3bc33c6febb1b6` (2026-05-30). All other 40+ branches are out of scope.
2. **Backend baseline:** single-file `server.py` (1,707 lines) with routers `auth/customer/config/upload/dietary/diagnostics/air-bnb` under `/api`; CORS-only middleware; in-memory OTP; JWT(HS256, 24h); env contract = `MONGO_URL, DB_NAME, JWT_SECRET, MYGENIE_API_URL, CORS_ORIGINS`.
3. **Frontend baseline:** React 19 + craco SPA; provider stack as in §5; three integration base URLs (`REACT_APP_BACKEND_URL`, `REACT_APP_API_BASE_URL`, `REACT_APP_CRM_URL`); ~11-var FE env contract; CRM v1/v2 adapter (intended `v2`).
4. **Data baseline (authoritative = live `mygenie`, 2026-05-30):** `customer_app_config` = **5** (`364,618,698,478,716`), `loyalty_settings` = **15**, `customers` = 3,869, `orders` = 32,573, `non_qr_blocks` = 13. **`backend/db_data/` exports are explicitly NOT the baseline** (stale, foreign DBs).
5. **Config/default baseline:** the hardcoded default sets in `server.py:get_app_config()` and `RestaurantConfigContext.DEFAULT_CONFIG` are the de-facto defaults for restaurants without a config doc; `skipOtp*` and `allowNonQrOrders` are absent in live docs by design.
6. **Behavioral baseline docs:** `memory/PRD.md` + `memory/change_requests/CR-2026-05-30-001/002` + `memory_repo/current-state/*` (treat line numbers/branch/counts as stale).
7. **Test baseline:** manual/agent-run only; `test_reports/iteration_4.json` = last green for CR-002; **no CI**; `backend/tests/test_api.py` flagged broken.

**Freeze guardrails:** Do not run `db_import.py` against the live DB. Do not treat `HANDOVER.md` secret values as safe to retain — they must be rotated. Do not delete legacy FastAPI `customer/*` routes or `otpRequired*`/`AdminSettings.jsx` legacy files without a usage trace (parts are runtime-active per user confirmation).

---

## 15. Next Agent Recommendation

Recommend a **Remediation / Hardening Planning Agent (planning-only, no implementation)** as the immediate next step — specifically a **"Backend Control-Layer & Security Hardening Planner."**

Its first mandate should be planning (not coding) to address, in priority order: (1) secret exposure & rotation (R1–R3), (2) auth/OTP hardening + rate limiting + CORS (R3–R6), (3) frontend route-guard + token-system unification (R7, R13), (4) config-default consolidation (R9), and (5) CI + test-baseline repair (R10).

A **Frontend Architecture Planning Agent** (route-guard layer, unified API client, token/session manager) and a **DevOps/CI Planning Agent** can follow. **Do not begin implementation, env changes, DB changes, or refactors until the freeze in §14 is acknowledged and a correction plan is approved.**

---

_End of baseline discovery. Read-only inspection only; no deploy, no restart, no writes performed._
