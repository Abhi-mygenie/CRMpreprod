# QA HANDOVER — BUG-2026-02-XX-001 Plan R3

**Handover by:** E1 (Implementation Agent — Role 3)  
**Date:** 2026-07-14  
**Status:** READY FOR QA  
**Risk:** CRITICAL (ReviewOrder.jsx is §6.1 hotspot)  
**Supersedes:** QA_HANDOVER_R2.md (R2 useEffect replaced by R3)

---

## What was implemented

**File changed:** `frontend/src/pages/ReviewOrder.jsx`  
**Lines changed:** ~10 lines net (ref added + R2 useEffect replaced by R3 useEffect)

### Edit 1 — Line 259: new `useRef` for debounce timer
```javascript
const deliveryChargeTimerRef = useRef(null); // BUG-2026-02-XX-001 Plan R3
```

### Edit 2 — Lines 759–796: R2 mount-only `useEffect` replaced with R3 cart-reactive `useEffect`

Key differences from R2:
- **`[], [subtotal]`** — now re-runs whenever cart total changes (not just on mount)
- **500ms debounce** via `deliveryChargeTimerRef` — avoids API spam on rapid +/- taps
- **Cleanup** — `return () => clearTimeout(...)` prevents stale callbacks on unmount
- **`subtotal` in payload** — uses already-computed `subtotal = getTotalPrice()` (no extra call)
- All three guards preserved: delivery-only, valid lat/lng, valid restaurantId

---

## Implementation Exit Gate

| # | Gate item | Status |
|---|---|---|
| 1 | Registered item exists | ✅ BUG-2026-02-XX-001 in BUG_TRACKER_v2.md |
| 2 | Plan exists and owner-approved | ✅ Plan R3 approved by owner in this session |
| 3 | Code implemented | ✅ ReviewOrder.jsx lines 259 + 759–796 |
| 4 | Self-test completed | ✅ grep confirms markers; HTTP 200; no R2 remnants |
| 5 | Build/compile clean | ✅ hot-reload serving cleanly |
| 6 | Code markers added | ✅ `// BUG-2026-02-XX-001 Plan R3` at both change sites |
| 7 | QA handover written | ✅ This document |

Exit Gate: **7/7 PASS**

---

## Test Cases for QA

### Primary tests (the newly reported scenarios)

**R3-TC1** — Remove item on ReviewOrder, cart drops below threshold  
- Setup: Restaurant 699, delivery, cart > ₹250 (delivery charge = Free)
- Action: On ReviewOrder page, tap **−** to remove an item → cart drops to < ₹250
- Expected: Delivery charge updates to ₹10 within ~500ms (after debounce)

**R3-TC2** — Add item on ReviewOrder, cart rises above threshold  
- Setup: Restaurant 699, delivery, cart < ₹250 (delivery charge = ₹10)
- Action: On ReviewOrder page, tap **+** to add more items → cart rises above ₹250
- Expected: Delivery charge updates to Free within ~500ms

**R3-TC3** — Grand Total updates correctly  
- After charge updates per TC1/TC2, verify Grand Total recalculates to include/exclude delivery charge

### Mount / navigation tests (R2 scenarios — must not regress)

**R3-TC4** — Navigate directly to ReviewOrder (bypass DeliveryAddress)  
- Cart > ₹250, delivery address set → go directly to ReviewOrder
- Expected: Distance API fires on mount (subtotal initial value triggers effect), charge = Free

**R3-TC5** — Navigate back to menu, modify cart, return to ReviewOrder  
- Cart < ₹250 (charge = ₹10) → go to menu → add items (> ₹250) → return to ReviewOrder
- Expected: ReviewOrder mounts → effect fires with new subtotal → charge = Free

### Guard / negative tests

**R3-TC6** — Takeaway order, cart changes on ReviewOrder  
- Expected: Delivery charge API NOT called on any cart change (guard: `scannedOrderType !== 'delivery'`)

**R3-TC7** — Dine-in order, cart changes on ReviewOrder  
- Expected: Delivery charge API NOT called

**R3-TC8** — Delivery order, no saved address  
- Expected: API NOT called (guard: `!deliveryAddress?.latitude`)

**R3-TC9** — Rapid +/- tapping (debounce verification)  
- Tap +/- 5 times quickly on ReviewOrder
- Expected: Only ONE API call fires (500ms debounce; prior timers cancelled)

### Regression tests

**R3-TC10** — CR-002 Takeaway Charges (previously shipped)  
- Restaurant 699, takeaway → "Takeaway Charges ₹10.00" row still visible on bill

**R3-TC11** — Order placement not blocked  
- After delivery charge updates, Place Order → succeeds normally

---

## What QA must NOT do
- Do not modify any code
- Scope is delivery order flow on ReviewOrder only

---

## Self-test evidence
```
grep -n "Plan R3\|deliveryChargeTimerRef\|\[subtotal\]" /app/frontend/src/pages/ReviewOrder.jsx
259:  const deliveryChargeTimerRef = useRef(null); // BUG-2026-02-XX-001 Plan R3
759:  // BUG-2026-02-XX-001 Plan R3: ...
796:  }, [subtotal]); // BUG-2026-02-XX-001 Plan R3

HTTP: 200 (frontend serving)
R2 useEffect: REPLACED (no stale [], mount-only version remains)
```

---

*End of QA Handover — BUG-2026-02-XX-001 Plan R3*
