# Scalable Architecture Plan — Phase A (pre Multi-Brand) + Phase B (MySQL)

> **STATUS: PRE-INTAKE PROPOSAL — REFERENCE ONLY (2026-09-12).** Written before Role 1 Intake, so it is not a plan of record.
> Superseded by the registered programme `change_requests/CR-2026-09-12-001-architecture-correction-programme/INTAKE_DOC.md`
> and its children CR-2026-09-12-002…014 / INV-2026-09-12-001. Task numbering A0–A6 / B0–B5 below maps to those CRs; use the CR IDs.

Date: 2026-09-12 | Status: SUPERSEDED (see note above)
Inputs: `SESSION_HANDOVER_2026-06-ARCHITECTURE-TRACK.md`, `v2/PROJECT_GAP_REGISTER.md`, `INV-2026-08-03-001-716-HARDCODING-REPORT.md`, live code grep (this session).

## Verified current state (code is truth)

| Area | Fact |
|---|---|
| Backend | `server.py` 1,829 lines, ~60 routes, 11 Mongo collections (`customers`, `users`, `customer_app_config`, `loyalty_settings`, `coupons`, `feedback`, `dietary_tags_mapping`, `orders`, `points_transactions`, `wallet_transactions`, `status_checks`) |
| P0 security | `otp_store = {}` in-memory (L366); `otp_for_testing` echoed (L466); CORS `*` + `allow_credentials=True` (L1806-09); no rate-limit on `/auth/*` |
| Dead endpoints | `/api/docs/*` (8 routes) point to missing files; `/api/restaurant-info/{id}` called by FE, not implemented |
| Frontend | 20 files read `process.env.REACT_APP_*` directly; 14 files use raw `fetch`, 7 use axios; 56 direct `localStorage/sessionStorage` calls; no `ProtectedRoute` |
| Hardcoding | default rid `478` (`useRestaurantId.js:134`); rid `716` in 8 files / 27 sites; `pos_id`, country code `+91` (per INV report) |
| Thick pages | `ReviewOrder` 2,070 · `AdminSettings` 1,324 · `LandingPage` 1,296 · `MenuOrderTab` 1,231 · `DeliveryAddress` 1,056 · `MenuItems` 974 · `OrderSuccess` 852 |
| Env hygiene | `frontend/.env` carries dead `REACT_APP_LOGIN_PHONE/PASSWORD` and `MYGENIE_POS_LOGIN_*` (POS creds in frontend env — must go); no `.env.example` |
| Tests/CI | `backend/tests/` empty, no `.github/workflows`, `test_result.md` stale |

## Design principles (drive every task)

1. **Behaviour-preserving first.** Every A-step must leave `/api/*` responses byte-identical (contract snapshot) unless the step is explicitly a fix.
2. **Repository pattern is the MySQL hinge.** All DB access goes through `repositories/*.py`. Phase B swaps repositories only; routers/services stay untouched.
3. **Tenant is explicit, never implicit.** `restaurant_id` (later `brand_id`) is a required parameter in every service/repository call — no defaults. This is what makes multi-brand conflict-free.
4. **Config-driven, not rid-driven.** Every `if rid === '716'` becomes a flag on `customer_app_config`.
5. **One way in, one way out.** FE talks to backends via `api/clients/{own,pos,crm}.js`; browser storage via `session.js`.

---

## PHASE A — Architecture correction (Mongo stays)

### A0 · Safety net (do first, ~½ day)
| # | Task | Test |
|---|---|---|
| A0.1 | Contract-snapshot harness: `backend/tests/contracts/` hits every `GET /api/*` for rid 478 + auth flows, stores JSON snapshots | `pytest backend/tests/contracts` green on untouched code |
| A0.2 | Backend smoke tests: `/healthz`, `/auth/send-otp`, `/auth/login`, `/app-config/{rid}`, `/loyalty-settings/{rid}` | pytest green |
| A0.3 | CI workflow `.github/workflows/ci.yml`: `yarn build` + Jest + pytest on ephemeral Mongo (never live DB) | PR shows green check |
| A0.4 | `backend/.env.example`, `frontend/.env.example`; remove dead `REACT_APP_LOGIN_*` + `MYGENIE_POS_LOGIN_*` from `frontend/.env` | Grep = 0 hits; app boots |

### A1 · P0 security fixes (~½ day)
| # | Task | Test |
|---|---|---|
| A1.1 | Remove `otp_for_testing` from send-otp response | curl → no `otp_for_testing` key; login via OTP still works (SMS/CRM path) |
| A1.2 | Move OTP to Mongo collection `otp_codes` with TTL index (5 min), attempt counter (max 5) | Restart backend mid-flow → OTP still valid; 6th wrong attempt → 429 |
| A1.3 | CORS: explicit `CORS_ORIGINS` list, fail-fast if `*` with credentials | curl with foreign `Origin` → no ACAO header; preview works |
| A1.4 | Rate-limit `/auth/*` (slowapi, per-IP + per-phone) | 11th send-otp in 1 min → 429 |
| A1.5 | Security headers middleware (HSTS, X-Frame-Options, nosniff) + global exception handler + request-id logging | Response headers present; 500 returns `{error, request_id}` |

### A2 · Backend modular split (~1.5 days, behaviour-preserving)
Target layout:
```
backend/
  app/
    main.py            # create_app(), middleware, router mounting
    core/config.py     # Settings (pydantic-settings), fail-fast env
    core/security.py   # JWT, bcrypt, get_current_user, get_restaurant_user
    db/mongo.py        # client, get_db()  ← Phase B replaces this module only
    models/            # Pydantic request/response schemas (from server.py L80-310)
    repositories/      # customers.py, users.py, app_config.py, loyalty.py, feedback.py, banners.py, dietary_tags.py, otp.py
    services/          # auth_service.py, pos_service.py (refresh_pos_token, table-config), config_service.py
    routers/           # auth.py, customer.py, config.py, banners.py, pages.py, feedback.py, loyalty.py, dietary_tags.py, uploads.py, telemetry.py, health.py
  server.py            # 3 lines: from app.main import app
  tests/
```
| # | Task | Test |
|---|---|---|
| A2.1 | `core/config.py` + `db/mongo.py` + `core/security.py`; `server.py` imports them | contract snapshot green |
| A2.2 | Extract `models/` | snapshot green |
| A2.3 | Routers one domain at a time: auth → config → customer → banners/pages → feedback/loyalty/dietary → uploads/telemetry/health | snapshot green after each |
| A2.4 | Introduce `repositories/` — every `db.<coll>` call moves here; routers never touch `db` | `grep -r "db\." app/routers app/services` = 0 |
| A2.5 | Delete dead `/api/docs/*`; implement or remove FE call to `/api/restaurant-info/{id}` (owner decision) | 404 count in FE console = 0 |
| A2.6 | Mark legacy `customer/*` routes: add usage log for 1 week → decide keep/delete | log review |

### A3 · Frontend API + session facade (~1.5 days)
| # | Task | Test |
|---|---|---|
| A3.1 | `src/api/clients/{own,pos,crm}.js` — single axios instance each, base URL from env read **once**, timeout, auth interceptor, error normaliser | Jest unit tests per client |
| A3.2 | Migrate the 14 raw-`fetch` files + 20 direct `process.env` reads onto clients | `grep -r "process.env.REACT_APP" src --exclude-dir=api/clients` = 0; `grep -rl "fetch("` = 0 |
| A3.3 | `src/session/session.js` facade over `cart_<rid>`, `delivery_<rid>`, `scanned_table_<rid>`, `crm_token_<rid>`, `auth_token`, `pos_token`, `order_auth_token` | `grep -r "localStorage\.\|sessionStorage\." src --exclude-dir=session` = 0 |
| A3.4 | `ProtectedRoute` + `RoleGuard`; wrap `/admin/*`, `/profile` | Unauth visit → redirect before render (Playwright) |
| A3.5 | Feature-folder standard `src/features/<name>/{pages,components,hooks,api}`; move **one** small feature (e.g. `feedback` or `dietary-tags`) as the reference | Build green; doc `PLANNING_FE_MODULE_STRUCTURE.md` |

### A4 · Hardcoding removal → config flags (~1 day)
New fields on `customer_app_config` (backend default + admin UI toggle):
```
orderLocationType: 'table_only' | 'room_only' | 'room_and_table'   (default table_only)
requireFreshLocationPerOrder: bool  (default false)
allowMultipleOrdersPerLocation: bool (default false)
orderAccessBypass: bool (default false)
defaultCountryCode: '+91'
```
| # | Task | Test |
|---|---|---|
| A4.1 | Add flags to config schema + `get_app_config` defaults + admin settings UI | Snapshot updated intentionally; admin toggle persists |
| A4.2 | Replace 27 `716` sites (`ReviewOrder`, `TableRoomSelector`, `OrderSuccess`, `orderAccessPolicy`) with flag reads | `grep -rn "'716'" src` = 0; set flags on 716 in DB → Hyatt flow identical (Playwright) |
| A4.3 | Remove `478` default: unresolved hostname → `/select-restaurant` or 404 page instead of silent fallback | Visit preview root without rid → explicit screen |
| A4.4 | `pos_id`, country code → config | grep = 0 |
| A4.5 | Config source of truth = backend `config_service.DEFAULTS`; FE `DEFAULT_CONFIG` deleted, FE fetches defaults via `/api/app-config/defaults` | Diff FE vs BE defaults = 0 |

### A5 · Thick-page decomposition (~2 days, under CI cover) — can overlap with multi-brand
| # | Task | Test |
|---|---|---|
| A5.1 | `ReviewOrder.jsx` → `features/checkout/{hooks/useOrderSubmit, useDeliveryFee, useTableLocation, components/…}`; page < 300 lines | Playwright: dine-in, takeaway, delivery, Razorpay, COD, edit-order |
| A5.2 | `LandingPage.jsx`, `DeliveryAddress.jsx` same treatment | Playwright regression |
| A5.3 | Retire legacy `pages/AdminSettings.jsx` in favour of `pages/admin/*` (after usage trace) | Admin flows via new pages only |

### A6 · Multi-brand readiness (prep only, no feature) (~½ day)
| # | Task | Test |
|---|---|---|
| A6.1 | Typed hostname resolver: `resolveTenant(hostname) → {type:'brand'|'restaurant', id}` extending `useRestaurantId` | Unit tests |
| A6.2 | Tenant context on backend: `get_tenant()` dependency injected into every router; repositories filter by `restaurant_id` always | Repo unit tests reject calls without tenant |
| A6.3 | Storage keys namespaced by tenant via `session.js` (already `<rid>` — enforce, add `brand_` prefix support) | Unit tests |
| A6.4 | Raise POS-team blocker: public `master-outlet/{id}` leaks `crm_token`, `upi_id`, `email` | Ticket filed |

**Phase A total ≈ 8–9 working days.** Recommended order: A0 → A1 → A2 → A3 → A4 → A6 → (multi-brand starts) → A5 in parallel.

---

## PHASE B — MySQL migration (planned separately; enabled by A2.4)

Pre-conditions: A0 (snapshots), A2.4 (repositories), A6.2 (tenant filter).

| # | Task | Test |
|---|---|---|
| B0 | Schema design: 11 collections → tables. JSON-heavy docs (`customer_app_config`, `dietary_tags_mapping`) → `JSON` columns; `restaurant_id` indexed FK everywhere; `otp_codes` with expiry column + cron purge | ERD reviewed by owner |
| B1 | `db/mysql.py` (SQLAlchemy 2.x async + aiomysql) + Alembic migrations | `alembic upgrade head` on empty DB |
| B2 | Re-implement `repositories/*` against SQLAlchemy behind the **same interface**; keep Mongo impl; select via `DB_BACKEND=mongo|mysql` | Both impls pass identical repo tests |
| B3 | One-shot migration script Mongo → MySQL with row-count + checksum report; dry-run mode | Counts match, spot-check 20 docs |
| B4 | Dual-run on staging: contract snapshots against MySQL backend | Snapshot diff = 0 |
| B5 | Cut-over, remove Mongo impl + `motor` dependency | CI green, `MONGO_URL` no longer required |

Phase B ≈ 4–5 days after Phase A. Do **not** start any B task before A2.4 lands — otherwise the split happens twice.

---

## Owner decisions needed before starting (answer once)

| ID | Question | Default if silent |
|---|---|---|
| D-A1 | Approve Phase A sequence A0→A1→A2→A3→A4→A6, A5 in parallel with multi-brand? | Yes |
| D-A2 | CORS production origins list (hostnames) | Preview URL only |
| D-A3 | OTP delivery after echo removal — CRM SMS path only, or add an SMS provider? | CRM only |
| D-A4 | `/api/restaurant-info/{id}` — implement (proxy POS) or remove FE call? | Remove FE call |
| D-A5 | Rid `478` fallback removal acceptable (preview must use `/478` explicitly)? | Yes |
| D-A6 | Legacy `customer/*` FastAPI routes — trace-then-delete OK? | Trace 1 week |
| D-B1 | MySQL flavour/host (managed MySQL 8 / MariaDB / self-hosted)? | MySQL 8 |
| D-B2 | Freeze window for cut-over? | TBD |
