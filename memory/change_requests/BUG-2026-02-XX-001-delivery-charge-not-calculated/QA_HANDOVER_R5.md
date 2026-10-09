# QA Handover — BUG-2026-02-XX-001 Plan R5

**Document:** QA_HANDOVER_R5.md  
**Date:** 2026-07-14  
**Status:** READY FOR QA / OWNER SMOKE TEST  
**Author:** Implementation Agent (Role 3)

---

## What Changed

**File:** `frontend/src/pages/ReviewOrder.jsx`  
**Lines:** 795–803 (delivery charge useEffect dependency array)

```diff
- // eslint-disable-next-line react-hooks/exhaustive-deps
- }, [subtotal, deliveryAddress]); // Plan R4

+ // BUG-2026-02-XX-001 Plan R5: added scannedOrderType to dep array.
+ // useScannedTable initialises scannedTable as null (useState(null)) ...
+ // eslint-disable-next-line react-hooks/exhaustive-deps
+ }, [subtotal, deliveryAddress, scannedOrderType]); // Plan R5
```

---

## Root Cause Fixed (R5 — confirmed by investigation)

`useScannedTable` initialises with `useState(null)` and reads sessionStorage inside its own `useEffect([restaurantId, searchParams])`. This means `scannedOrderType` is **`null` on the first render** of ReviewOrder, regardless of what is in sessionStorage.

**Execution trace (second ReviewOrder mount, cart ₹325):**

| Step | Value | Outcome |
|---|---|---|
| Render 1 | `scannedOrderType = null` | `useEffect([subtotal, deliveryAddress])` fires — guard `null !== 'delivery'` → returns early |
| useScannedTable effect | `setScannedTable({order_type:'delivery',...})` | `scannedOrderType` → `'delivery'` |
| Re-render | subtotal & deliveryAddress unchanged | Dep array `[subtotal, deliveryAddress]` — effect does NOT re-fire |
| **Result** | Distance API never called | Stale ₹10 persists ✗ |

**With R5 (`[subtotal, deliveryAddress, scannedOrderType]`):**

| Step | Value | Outcome |
|---|---|---|
| Render 1 | `scannedOrderType = null` | Effect fires — guard blocks — early return |
| `scannedOrderType` → `'delivery'` | Dep changed | Effect re-fires: all guards pass → 500ms timer → API called |
| API response | `shipping_charge = 0` (₹325 > ₹250) | `setDeliveryCharge(0)` → Free ✓ |

---

## Previous Plans Summary

| Plan | Dep Array | Gap |
|---|---|---|
| R2 | `[]` | Only mount-once; inline cart changes not caught |
| R3 | `[subtotal]` | Caught inline changes; back-nav failed (deliveryAddress null on mount) |
| R4 | `[subtotal, deliveryAddress]` | Caught address async load; scannedOrderType still null on first render — blocked |
| **R5** | **`[subtotal, deliveryAddress, scannedOrderType]`** | **Catches all three async loads** |

---

## Test Cases for Owner Smoke Test

### R5-TC1 — Core scenario (was failing in R4 smoke test) ★ MUST PASS
**Steps:**
1. Restaurant 699, delivery order type, delivery address already saved
2. Add items below ₹250 (e.g. ₹200) → navigate to ReviewOrder → confirm Delivery Charge = ₹10
3. Click back → navigate to Menu
4. Add items to raise cart above ₹250 (e.g. to ₹325)
5. Navigate back to ReviewOrder

**Expected:** Delivery Charge = Free (₹0) within ~1 second of page load  
**Network:** POST to `manage.mygenie.online/api/v1/config/distance-api-new` visible  
**Previously:** ₹10 stale — no network call made ✗

### R5-TC2 — Reverse: free → paid
**Steps:**
1. Cart ₹325 (free delivery) → ReviewOrder → Free
2. Back to Menu → remove items → cart ₹150
3. Back to ReviewOrder

**Expected:** Delivery Charge = ₹10

### R5-TC3 — Inline modification (R3 regression)
**Steps:**
1. On ReviewOrder page, add/remove item directly
**Expected:** Delivery charge updates within ~500ms

### R5-TC4 — Non-delivery order: no API calls
**Steps:**
1. Takeaway or dine-in order
2. Navigate to ReviewOrder, modify cart
**Expected:** Zero calls to distance-api-new

---

## Safety Analysis

| Risk | Assessment |
|---|---|
| Infinite loop | None — `setDeliveryCharge` modifies `deliveryCharge` which is NOT in the dep array |
| Extra API calls for non-delivery | None — guard `scannedOrderType !== 'delivery'` blocks at first line |
| Extra API calls for delivery | 1 extra call on mount (when `scannedOrderType` transitions `null → 'delivery'`), debounced at 500ms. Acceptable. |
| Order placement regression | None — dep array change only affects the delivery charge recalculation effect, not order submission logic |

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/pages/ReviewOrder.jsx` | Dep array: `[subtotal, deliveryAddress]` → `[subtotal, deliveryAddress, scannedOrderType]` |

## Files NOT Changed

- `CartContext.js` — unchanged
- `useScannedTable.js` — unchanged (root cause understood, fix applied at consumption site)
- `server.py` — unchanged
- Any `.env` files — unchanged

---

## Exit Gate

| Gate | Status |
|---|---|
| 1. Registered item | ✅ BUG-2026-02-XX-001 |
| 2. Plan approved | ✅ Owner approved R5 |
| 3. Code implemented | ✅ |
| 4. Build clean | ✅ webpack 0 errors |
| 5. Code marker | ✅ `// BUG-2026-02-XX-001 Plan R5` |
| 6. QA handover | ✅ this doc |
| 7. Session handover | → SESSION_HANDOVER_R5.md |

Exit gate: **6/7** (session handover in progress)
