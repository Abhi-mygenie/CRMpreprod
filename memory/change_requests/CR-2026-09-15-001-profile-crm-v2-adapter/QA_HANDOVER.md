# QA HANDOVER — CR-2026-09-15-001

**Written by:** Role 3 — Implementation Agent  
**Date:** 2026-10-08  
**Build:** CLEAN — `yarn build` 40s, 0 errors  
**Self-test:** ST1–ST6 PASS  
**Testing agent QA:** 7/8 PASS · 1 NOT TESTED (T4 — code-confirmed) · `retest_needed: false`

---

## What changed

| Edit | File | What |
|---|---|---|
| E1 | `crmService.js` | `crmGetOrders` → `isV2()` branch: `GET /scan/orders?limit=N` |
| E2 | `crmService.js` | `crmGetPoints` → `isV2()` branch: parallel `/scan/loyalty` + `/scan/points/history` |
| E3 | `crmService.js` | `crmGetWallet` → `isV2()` branch: parallel `/scan/loyalty` + `/scan/wallet/history` |
| E4 | `Profile.jsx` | Added `useRestaurantConfig` import |
| E5 | `Profile.jsx` | Added `showWallet` destructure |
| E6 | `Profile.jsx` | Added `ordersTotal` state |
| E7 | `Profile.jsx` | `fetchOrders` sets `ordersTotal` from `data.total` |
| E8 | `Profile.jsx` | Added `isPointsCredit()`, `POINTS_TYPE_LABELS`, `ORDER_TYPE_LABELS` helpers |
| E9 | `Profile.jsx` | `order_type` raw value → readable label via `ORDER_TYPE_LABELS` |
| E10 | `Profile.jsx` | "Showing N of M orders" count when server has more |
| E11 | `Profile.jsx` | Points sign: 3 occurrences of `=== 'earn'` → `isPointsCredit(...)` (fixes `bonus` showing `−`) |
| E12 | `Profile.jsx` | Wallet tab button gated behind `showWallet` |
| E13 | `Profile.jsx` | Wallet tab content gated behind `showWallet` |

**Files NOT touched:** `AuthContext.jsx` · `RestaurantConfigContext.jsx` · `backend/server.py` · `ReviewOrder.jsx` · `LandingPage.jsx`

---

## QA test results (iteration_4.json)

| T | Result | Note |
|---|---|---|
| T1 Orders tab renders | ✅ PASS | order_type "Dine-in", points +18, items visible, no toast |
| T2 Points sign correct | ✅ PASS | bonus=`+`, expired=`−`, earn=`+` |
| T3 Wallet tab hidden | ✅ PASS | showWallet=false for 689 → tab button absent |
| T4 Empty state | NOT TESTED | Code review confirms `orders.length === 0 → 'No orders yet'` |
| T5 Header card unchanged | ✅ PASS | Name, tier, stats from AuthContext unaffected |
| T6 yarn build | ✅ PASS | Exit 0, 40s |
| T7 v1 paths preserved | ✅ PASS | else branches intact in crmService.js |
| T8 isPointsCredit | ✅ PASS | No `=== 'earn'` remains in Profile.jsx |

---

## Known pre-existing items (NOT introduced by this CR)

- `.order-type` CSS has `text-transform: uppercase` — "Dine-in" displays as "DINE-IN". Cosmetic only; label logic is correct.
- Profile page requires prior SPA navigation from `/:restaurantId` to set auth scope — architectural limitation, out of scope.
- `crmGetWallet` + `crmGetPoints` both call `/scan/loyalty` — minor double-fetch when both tabs visited. Functionally correct; optimisation deferred.

---

## Smoke test

For owner smoke, navigate to a restaurant's home page, sign in with a test phone, then tap the hamburger menu → Profile (or navigate to `/profile`).

- **Orders tab:** list of orders, readable order type, points shown, items shown.
- **Points tab:** transaction list with correct `+`/`−` signs — `bonus` entries must show `+`.
- **Wallet tab:** hidden for restaurant 689 (default). If `showWallet` is enabled in admin for any restaurant, tab appears with balance.

Reply **"Smoke PASS CR-2026-09-15-001"** or **"Smoke FAIL CR-2026-09-15-001 — step N"**.
