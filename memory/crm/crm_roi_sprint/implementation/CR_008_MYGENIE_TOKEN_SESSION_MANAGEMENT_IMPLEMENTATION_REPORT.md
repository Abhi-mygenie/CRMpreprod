# CR-008 — MyGenie Token Session Management (Option C) — Implementation Report

**CR:** CR-008 MyGenie Token Session Management
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-27
**Status:** `cr008_implemented_ready_for_qa`

---

## 1. Summary

Implemented Option C exactly as specified in
`/app/memory/crm/crm_roi_sprint/planning/CR_008_MYGENIE_TOKEN_SESSION_MANAGEMENT_PLAN.md`.

- Backend returns `mygenie_token` in the login `TokenResponse`.
- Backend reads `X-MyGenie-Token` header FIRST in every MyGenie-dependent path,
  falling back to the DB-stored `mygenie_token` when the header is absent
  (full backward compatibility).
- Frontend stores `mygenie_token` in `sessionStorage` on login, attaches it
  as `X-MyGenie-Token` on every API call via the shared axios client, and
  clears it on logout.

No code outside the 6 files listed in the plan was touched. No DB writes,
no env/deploy changes, no migrations.

---

## 2. Files Changed

| # | File | Change |
|---|---|---|
| 1 | `/app/backend/models/schemas.py` | `TokenResponse.mygenie_token: Optional[str] = None` added |
| 2 | `/app/backend/routers/auth.py` | Both `mygenie_login()` return paths (existing-user + new-user) now pass `mygenie_token=mygenie_token` to `TokenResponse` |
| 3 | `/app/backend/routers/menu.py` | `Request` import added; `_get_mygenie_token(user, request=None)` reads `X-MyGenie-Token` header first, DB fallback; both `get_menu_items` and `get_menu_categories` now accept `request: Request` |
| 4 | `/app/backend/routers/customers.py` | `Request` import added; `sync_customers_from_mygenie`, `create_customer`, `update_customer` now accept `request: Request` and prefer the header; all three retain DB fallback |
| 5 | `/app/backend/routers/migration.py` | `Request` import added; `sync_orders_from_mygenie` accepts `request: Request` and prefers the header; DB fallback retained (also needed for `last_customer_sync_at` check) |
| 6 | `/app/frontend/src/contexts/AuthContext.jsx` | `createApiClient` reads `sessionStorage["mygenie_token"]` and sets `X-MyGenie-Token` header; `login()` writes the token to sessionStorage; `logout()` clears it |

Total: 6 files. No new files. No deletions.

---

## 3. Verification Performed (Local)

| Check | Result |
|---|---|
| `python3 -m ast` parse of all 5 modified backend files | OK |
| `ruff` lint of modified backend files | No CR-008-related errors (2 pre-existing warnings in `analytics.py` and 1 in `customers.py:1509` are unrelated, were present pre-CR-008) |
| `eslint` of `AuthContext.jsx` | No issues |
| `sudo supervisorctl restart backend` + `/api/health` | `{"status":"healthy"}` after restart, scheduler started, no startup errors |
| `GET /openapi.json` → `components.schemas.TokenResponse.properties` | Includes `mygenie_token` ✔︎ |
| Backend MongoDB connection | Still authenticated against `mongodb://…@52.66.232.149:27017/mygenie` (no env changes) |

No QA agent run, per baseline operational posture rules and per planning doc §3 — implementation completes here, QA is the next gate.

---

## 4. Backward Compatibility (Confirmed in Code)

- If `X-MyGenie-Token` header is missing → DB fallback path is taken (identical to pre-CR-008 behaviour).
- If frontend receives `mygenie_token: null` (e.g. demo login) → `sessionStorage` write is skipped.
- POS webhook endpoints (use `X-API-Key`, not MyGenie token) — UNTOUCHED.
- `/auth/me` / `/auth/profile` / forgot-password endpoints — UNTOUCHED.
- DB `users.mygenie_token` field continues to be written on every login.

---

## 5. Boundaries Honoured

- `/app/memory/crm/crm_1_0/handoff/CRM_1_0_BASELINE_CLOSE_2026_05_26.md` not modified.
- `/app/memory/final/` not created/touched (still does not exist).
- No DB schema changes, no migrations, no historical backfill.
- No env changes.
- No new dependencies added to `requirements.txt` or `package.json`.
- POS contract (CR-001C) not affected — POS paths use `X-API-Key`, unchanged.
- Coupon engine (CR-006) not affected.
- CRM 1.0 baseline modules continue to operate exactly as before when the
  header is absent.

---

## 6. Next Gate

QA pass (manual or scripted) covering:
1. Fresh login → response body contains `mygenie_token`; sessionStorage populated.
2. `GET /api/menu/items` with header → header value reaches MyGenie (token rotates if user rotates).
3. `GET /api/menu/items` without header (e.g. curl with only JWT) → DB fallback works (existing behaviour).
4. `POST /api/customers/sync-from-mygenie` and `POST /api/migration/sync-orders` honour the header.
5. Logout → sessionStorage cleared.
6. Page refresh → sessionStorage survives → menu/sync calls still work without re-login.
7. Tab close + reopen → sessionStorage cleared → DB fallback engaged; if DB token expired, "Please re-login" UX surfaces as before.

Status to flip after QA pass: `cr008_qa_passed`.
