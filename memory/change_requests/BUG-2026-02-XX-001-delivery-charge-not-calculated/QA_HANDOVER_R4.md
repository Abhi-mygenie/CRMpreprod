# QA Handover — BUG-2026-02-XX-001 Plan R4

**Document:** QA_HANDOVER_R4.md  
**Date:** 2026-07-14  
**Status:** READY FOR QA  
**Author:** Implementation Agent (Role 3)

---

## What Changed

**File:** `frontend/src/pages/ReviewOrder.jsx`  
**Lines:** 795–801 (delivery charge useEffect dependency array)

**Before (Plan R3):**
```js
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [subtotal]); // Plan R3
```

**After (Plan R4):**
```js
  // BUG-2026-02-XX-001 Plan R4: added deliveryAddress ...
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [subtotal, deliveryAddress]); // Plan R4
```

---

## Root Cause Fixed

`deliveryAddress` is loaded **asynchronously** in `CartContext` via a `useEffect` that reads `localStorage`.  
On `ReviewOrder` mount after navigating back from Menu:
- `subtotal` is immediately available (synchronous lazy init from localStorage via `useState`)
- `deliveryAddress` is `null` — loads moments later

With Plan R3 (`[subtotal]` only):
1. Effect fires on mount → guard `!deliveryAddress?.latitude` → **returns early** → API not called
2. `deliveryAddress` loads → React re-renders → **subtotal has NOT changed** → effect does NOT re-fire
3. Stale `deliveryCharge` from localStorage (e.g. ₹10) persists ❌

With Plan R4 (`[subtotal, deliveryAddress]`):
1. Effect fires on mount → guard → returns early (deliveryAddress still null) ✓
2. `deliveryAddress` loads → `deliveryAddress` changes from `null` → object → effect **fires again**
3. `subtotal` = 260 (new correct value), API called → delivery charge updated correctly ✅

---

## Test Cases

### R4-TC1 — Core regression: back-nav + modified cart (was failing in R3)
**Priority:** BLOCKER  
**Steps:**
1. Restaurant 699, delivery order type, delivery address saved
2. On ReviewOrder — cart subtotal below free delivery threshold (e.g. ₹200 → charge = ₹10)
3. Navigate back to Menu (`handleBackClick`)
4. Add items to raise cart above free delivery threshold (e.g. to ₹260+)
5. Navigate back to ReviewOrder
**Expected:** Delivery charge shows "Free" (₹0) or the correct reduced charge per API response  
**Previously (R3):** Delivery charge remained ₹10 (stale) ❌

### R4-TC2 — Reverse: above threshold → back → below threshold
**Priority:** BLOCKER  
**Steps:**
1. Cart at ₹260 (free delivery), navigate to ReviewOrder — shows Free
2. Navigate back to Menu, remove items to bring cart to ₹150
3. Navigate back to ReviewOrder  
**Expected:** Delivery charge shows ₹10 (or whatever API returns for ₹150)

### R4-TC3 — Existing R3 behaviour preserved: inline cart modification on ReviewOrder
**Priority:** MAJOR  
**Steps:**
1. Delivery order, on ReviewOrder page
2. Remove an item directly from the ReviewOrder cart (without navigating away)
3. Watch delivery charge update
**Expected:** Delivery charge updates within ~500ms (debounce) — same as R3

### R4-TC4 — No double API call on fresh load (performance)
**Priority:** MINOR  
**Steps:**
1. Fresh session, navigate directly to ReviewOrder with delivery order
2. Open browser DevTools → Network tab
3. Watch `distance-api-new` calls
**Expected:** Maximum 2 calls — one on mount (aborted by guard if address null), one when address hydrates. Not more.  
(Note: If address is synchronously available — extremely rare — only 1 call on `subtotal` change.)

### R4-TC5 — Non-delivery orders: no API calls
**Priority:** MAJOR  
**Steps:**
1. Takeaway or dine-in order type
2. Navigate to ReviewOrder, modify cart
3. DevTools Network — watch `distance-api-new`
**Expected:** Zero calls to distance API (guard `scannedOrderType !== 'delivery'` blocks it)

### R4-TC6 — No delivery address set: no API calls
**Priority:** MAJOR  
**Steps:**
1. Delivery order type, but `delivery_<restaurantId>` cleared from localStorage
2. Navigate to ReviewOrder
**Expected:** Zero calls to distance API (`!deliveryAddress?.latitude` guard blocks it)

### R4-TC7 — Total picture: grand total and bill breakdown correct after update
**Priority:** MAJOR  
**Steps:**
1. Same as R4-TC1, verify delivery charge is free
2. Check bill breakdown — "Delivery Charges" row should show ₹0.00 or be absent
3. Grand total should not include ₹10 delivery charge
**Expected:** Grand total matches subtotal + tax (no ₹10 delivery charge included)

---

## Test Account

| Field | Value |
|---|---|
| URL | See `REACT_APP_BACKEND_URL` from `frontend/.env` |
| Restaurant | 699 (delivery order type) |
| Admin login | `owner@brew.com` / `Qplazm@10` |
| Full credentials | `/app/memory/test_credentials.md` |

---

## Files Changed (this plan)

| File | Change |
|---|---|
| `frontend/src/pages/ReviewOrder.jsx` | Dependency array: `[subtotal]` → `[subtotal, deliveryAddress]` |

## Files NOT Changed

- `CartContext.js` — No changes
- `server.py` — No changes
- Any `.env` files — No changes
- `DeliveryAddress.jsx` — No changes (A-1/A-2 from previous plans preserved)

---

## Exit Gate Status

| Gate | Status |
|---|---|
| 1. Registered item exists | ✅ BUG-2026-02-XX-001 |
| 2. Plan exists (R4 plan in ask_human) | ✅ |
| 3. Code implemented | ✅ |
| 4. Self-test: build compiled clean | ✅ webpack compiled with 0 errors |
| 5. Code marker added | ✅ `// BUG-2026-02-XX-001 Plan R4` at change site |
| 6. QA handover written | ✅ this doc |
| 7. Session handover written | → SESSION_HANDOVER_R4.md |

Exit gate: **6/7 PASS** (session handover in progress)

---

## Regression Note

This change touches `ReviewOrder.jsx` (CRITICAL hotspot per addendum Part C §6.1).  
Only the `useEffect` dependency array for the delivery charge recalculation was modified.  
No other logic, no other effects, no state, no order placement code was touched.  
Full order placement regression is NOT expected but recommended as standard practice for this file.
