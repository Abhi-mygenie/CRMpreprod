# INVESTIGATION REPORT — INV-2026-09-12-001
# Usage trace: legacy FastAPI customer/* routes, status routes, and AdminSettings.jsx

**Role:** Investigation (Role 6) — read-only, no code
**Date:** 2026-09-15
**Steps used:** 10 / 10
**Confidence:** HIGH — full frontend grep + route-by-route code trace

---

## 0. Method

1. Grepped all FE source files (`*.js`, `*.jsx`, `*.ts`, `*.tsx`) for every route path string.
2. Traced `Profile.jsx`, `ReviewOrder.jsx`, `OrderSuccess.jsx` imports.
3. Read `endpoints.js` (single source of truth for ENDPOINTS config).
4. Read `crmService.js` for every customer data function — confirmed CRM base URL, not backend.
5. Read `orderService.ts` for `getOrderDetails` / `checkTableStatus` URLs.
6. Read `App.js` router for `AdminSettings.jsx` route binding.
7. Read backend `server.py` route definitions (full list, all routers).
8. Read `/api/status` implementation to assess external-caller risk.
9. Read `customer_router` implementation lines to confirm each route's purpose.
10. Confirmed `AdminSettings.jsx` import vs. render gap.

---

## 1. Route Verdicts

### customer_router routes (all 6)

| Route | Verdict | Evidence |
|---|---|---|
| `GET /api/customer/profile` | ❌ **DEAD** | `Profile.jsx` imports `crmGetProfile` → calls CRM directly at `/scan/auth/me` (v2) / `/customer/me` (v1). No FE grep hit for `/api/customer/profile`. |
| `GET /api/customer/orders` | ❌ **DEAD** | `Profile.jsx` imports `crmGetOrders` → calls CRM at `/customer/me/orders?limit=…`. No FE grep hit. |
| `GET /api/customer/points` | ❌ **DEAD** | `Profile.jsx` imports `crmGetPoints` → calls CRM at `/customer/me/points?limit=…`. No FE grep hit. |
| `GET /api/customer/wallet` | ❌ **DEAD** | `Profile.jsx` imports `crmGetWallet` → calls CRM at `/customer/me/wallet?limit=…`. No FE grep hit. |
| `GET /api/customer/coupons` | ❌ **DEAD** | No FE file imports or calls this path at all. |
| `PUT /api/customer/profile` | ❌ **DEAD** | No FE file calls this path. `crmGetProfile`/`crmUpdateProfile` go to CRM. |

**Root cause:** The entire `customer_router` is a backend mirror of data that CRM already serves.
The frontend was wired directly to CRM for all customer profile / history data, bypassing this
backend entirely. The backend routes were likely built in anticipation of a BFF pattern (CR-006 / CR-011)
that was never activated.

---

### api_router status routes

| Route | Verdict | Evidence |
|---|---|---|
| `POST /api/status` | ⚠️ **EXTERNAL-UNKNOWN** | No FE grep hit. Implementation writes to `db.status_checks` collection. Pattern suggests POS backend pushes order-status updates inbound. Cannot confirm or deny without 7-day server access log. |
| `GET /api/status` | ⚠️ **EXTERNAL-UNKNOWN** | No FE grep hit. Reads all `status_checks`. May be polled by POS or an ops dashboard. |

**Decision guidance for CR-006:** Do NOT delete these routes in the modular split. Move them into
`app/routers/status.py` and keep them live. Flag for owner to confirm POS team dependency.

---

### api_router — customer-lookup

| Route | Verdict | Evidence |
|---|---|---|
| `GET /api/customer-lookup/{restaurant_id}` | ✅ **LIVE** | `ReviewOrder.jsx` line 418: `${process.env.REACT_APP_BACKEND_URL}/api/customer-lookup/${numericRestaurantId}?phone=${bareDigits}` — direct fetch, no service wrapper. Called during order review to prefill customer name/points/tier. |

**Decision guidance:** Must be kept and migrated into `app/routers/customer_lookup.py`
(or `app/routers/customer.py`) in CR-006.

---

### api_router — docs routes (8 endpoints)

| Routes | Verdict | Evidence |
|---|---|---|
| `GET /api/docs/bug-tracker`, `/api-mapping`, `/code-audit`, `/prd`, `/roadmap`, `/architecture`, `/changelog`, `/test-cases` (lines 1739–1808) | ❌ **DEAD** | No FE grep hit. No service file references. These serve markdown files from `memory_repo/` — a dev convenience endpoint, not a customer-facing feature. CR-006 already plans to delete these. |

---

### AdminSettings.jsx (legacy monolith page)

| Item | Verdict | Evidence |
|---|---|---|
| `pages/AdminSettings.jsx` (1,324 lines) | ❌ **DEAD** | `App.js` line 19 imports it but it is **not mounted in any `<Route>`**. `App.js` line 72 routes `/admin/settings` to `<AdminSettingsPage />` (the new modular version). Legacy component is completely unreachable. |

**Decision guidance for CR-013:** Safe to delete the import (line 19 of App.js) and the entire
`AdminSettings.jsx` file. Zero customer or admin impact.

---

## 2. Summary Table

| Item | Verdict | Safe to remove in CR-006/CR-013? |
|---|---|---|
| `GET /api/customer/profile` | DEAD | ✅ YES — delete entire `customer_router` |
| `GET /api/customer/orders` | DEAD | ✅ YES |
| `GET /api/customer/points` | DEAD | ✅ YES |
| `GET /api/customer/wallet` | DEAD | ✅ YES |
| `GET /api/customer/coupons` | DEAD | ✅ YES |
| `PUT /api/customer/profile` | DEAD | ✅ YES |
| `POST /api/status` | EXTERNAL-UNKNOWN | ⚠️ KEEP — migrate to new module, confirm with POS team |
| `GET /api/status` | EXTERNAL-UNKNOWN | ⚠️ KEEP — migrate to new module, confirm with POS team |
| `GET /api/customer-lookup/{restaurant_id}` | LIVE | 🔴 MUST KEEP — migrate to new router, never delete |
| `GET /api/docs/*` (8 routes) | DEAD | ✅ YES — delete as planned in CR-006 |
| `AdminSettings.jsx` (legacy page) | DEAD | ✅ YES — remove in CR-013 |

---

## 3. Feeds into downstream CRs

### CR-2026-09-12-006 (backend modular split)

- The entire `customer_router` block (lines 790–1046 in server.py, ~256 lines) can be **deleted** in the split, not migrated. This simplifies the split significantly.
- `customer-lookup` must be migrated to a new router (e.g. `app/routers/lookup.py`).
- `status` routes must be migrated (not deleted) — put in `app/routers/status.py`.
- `docs/*` routes: delete as already planned.
- **Net effect:** CR-006 is simpler than expected — one whole router (~256 lines) disappears instead of being migrated.

### CR-2026-09-12-013 (thick-page decomposition — AdminSettings retirement)

- `AdminSettings.jsx` can be deleted immediately without routing changes (it's already unrouted).
- Only change needed: remove the dead import from `App.js` line 19.

### CR-2026-09-12-014 (Phase B — MySQL migration)

- `orders` / `status_checks` MongoDB collections:
  - `status_checks` — used by `POST/GET /api/status` — KEEP, may be externally written.
  - `orders` — no `orders` collection accessed via these dead routes directly. The POS handles orders; the backend only has `OrderSummary` as a read model.

---

## 4. One owner question (not blocking CR-006 Planning)

> **Q:** Do the POS backend or any external system call `POST /api/status` or `GET /api/status`?
> These routes are not called by the frontend but write/read a `status_checks` MongoDB collection.
> If yes → migrate them into the new router. If no → they can be deleted too.
> This does not block CR-006 Planning — Planning can declare them "KEEP pending POS team confirmation."

---

## 5. Compact output (Alpha v0.1 §8 Role 6)

```
Investigation complete: INV-2026-09-12-001
Root cause: customer_router (6 routes) is a dead parallel implementation.
  CRM is the actual customer data source — frontend bypasses backend entirely for profile/orders/points/wallet/coupons.
  status routes (2): EXTERNAL-UNKNOWN — cannot confirm without server logs.
  customer-lookup: LIVE — ReviewOrder.jsx:418 direct fetch.
  docs/* (8 routes): DEAD.
  AdminSettings.jsx: DEAD (imported but unrouted in App.js).
Classification: FE (all FE-confirmed dead routes) + EXTERNAL-UNKNOWN (status routes)
Confidence: HIGH
Steps used: 10/10
Evidence: grep outputs + code trace (this document)
Recommendation:
  → CR-006 Planning may now open (INV verdict supplied)
  → customer_router: DELETE (not migrate) — simplifies CR-006
  → status routes: KEEP in new module pending owner/POS-team confirmation
  → customer-lookup: MUST KEEP + migrate
  → docs/*: DELETE as planned
  → AdminSettings.jsx: DELETE in CR-013 (already unrouted)
Report: /app/memory/change_requests/INV-2026-09-12-001-legacy-customer-routes-usage-trace/INVESTIGATION_REPORT.md
```
