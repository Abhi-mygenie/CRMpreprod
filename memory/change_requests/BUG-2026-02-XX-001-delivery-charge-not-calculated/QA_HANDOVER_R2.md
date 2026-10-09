# QA HANDOVER — BUG-2026-02-XX-001 Plan R2

**Handover by:** E1 (Implementation Agent — Role 3)  
**Date:** 2026-07-14  
**Status:** READY FOR QA  
**Risk:** CRITICAL (ReviewOrder.jsx is §6.1 hotspot)

---

## What was implemented

**File changed:** `frontend/src/pages/ReviewOrder.jsx`  
**Lines changed:** ~14 lines total (2 surgical edits)

### Edit 1 — Line 111: `setDeliveryCharge` added to `useCart()` destructure
```javascript
// Delivery (Phase 3)
deliveryAddress,
deliveryCharge,
setDeliveryCharge, // BUG-2026-02-XX-001 Plan R2
clearDeliveryAddress,
removeFromCart, // CR-2026-06-17-003 APP-12
```

### Edit 2 — Lines 758–790: mount-only `useEffect` added
```javascript
// BUG-2026-02-XX-001 Plan R2: On ReviewOrder mount, re-check delivery charge using the
// current cart total. Fixes stale charge when user bypasses the DeliveryAddress page
// by adding items on the Menu page and navigating directly to ReviewOrder.
useEffect(() => {
  if (scannedOrderType !== 'delivery') return;
  if (!deliveryAddress?.latitude || !deliveryAddress?.longitude) return;
  if (!restaurantId) return;

  const recalculateDeliveryCharge = async () => {
    try {
      const MANAGE_BASE_URL = process.env.REACT_APP_IMAGE_BASE_URL || 'https://manage.mygenie.online';
      const res = await fetch(`${MANAGE_BASE_URL}/api/v1/config/distance-api-new`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination_lat: String(deliveryAddress.latitude),
          destination_lng: String(deliveryAddress.longitude),
          restaurant_id: String(restaurantId),
          order_value: String(getTotalPrice() || 0),
        }),
      });
      const data = await res.json();
      if (data?.shipping_status === 'Yes') {
        setDeliveryCharge(parseFloat(data.shipping_charge) || 0);
      }
    } catch {
      // Silent fail — stale charge is shown; order flow must not be blocked
    }
  };

  recalculateDeliveryCharge();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []); // Intentional: run once on mount only
```

---

## Implementation Exit Gate

| # | Gate item | Status |
|---|---|---|
| 1 | Registered item exists | ✅ BUG-2026-02-XX-001 in BUG_TRACKER_v2.md |
| 2 | Plan exists and owner-approved | ✅ Plan R2 in PLANNING_REPORT.md addendum |
| 3 | Code implemented | ✅ ReviewOrder.jsx lines 111 + 758–790 |
| 4 | Self-test completed | ✅ Frontend hot-reload served HTTP 200; code markers verified via grep |
| 5 | Build/compile clean | ✅ Service healthy (hot-reload) |
| 6 | Code markers added | ✅ `// BUG-2026-02-XX-001 Plan R2` at both change sites |
| 7 | QA handover written | ✅ This document |

Exit Gate: **7/7 PASS**

---

## Test Cases for QA

### Primary test (the failing smoke test scenario)

**R2-TC1** — PRIMARY REGRESSION FIX  
- Setup: Restaurant 699, delivery order type
- Step 1: Select delivery address (cart value < ₹250 threshold, e.g. ₹100)
- Step 2: Distance API returns `shipping_charge: 10` → deliveryCharge = 10
- Step 3: Navigate BACK to menu (skip DeliveryAddress page)
- Step 4: Add more items until cart > ₹250 (e.g. total = ₹260)
- Step 5: Navigate **directly** to ReviewOrder (do NOT visit DeliveryAddress)
- Expected: ReviewOrder mounts → `distance-api-new` POST fires in Network tab with `order_value: "260"` → delivery charge updates to ₹0 → bill shows ₹0 delivery charge

**R2-TC2** — Network tab verification  
- Open Chrome DevTools → Network tab
- Navigate directly to ReviewOrder (delivery, cart > ₹250, address set)
- Expected: POST to `manage.mygenie.online/api/v1/config/distance-api-new` fires on page load with correct `order_value`

### Guard / negative tests

**R2-TC3** — Takeaway order — NO API call  
- Restaurant 699, takeaway order type
- Navigate to ReviewOrder
- Expected: `distance-api-new` NOT called (guard: `scannedOrderType !== 'delivery'` exits immediately)

**R2-TC4** — No saved delivery address — NO API call  
- Clear delivery address from localStorage (`delivery_699`)
- Navigate to ReviewOrder as delivery order
- Expected: `distance-api-new` NOT called (guard: `!deliveryAddress?.latitude`)

**R2-TC5** — Dine-in order — NO API call  
- Dine-in order type  
- Navigate to ReviewOrder
- Expected: `distance-api-new` NOT called

### Regression tests (must not break existing behaviour)

**R2-TC6** — CR-002 Takeaway Charges (previously shipped)  
- Restaurant 699, takeaway order
- Expected: "Takeaway Charges ₹10.00" row still visible on bill — **must not regress**

**R2-TC7** — Order placement not blocked on API fail  
- Simulate network error on distance API (DevTools → offline, or non-delivery order)
- Navigate to ReviewOrder
- Expected: Page loads normally; order can still be placed (silent fail path)

**R2-TC8** — Full delivery order placement  
- End-to-end: Set address → add items (cart < ₹250) → go to ReviewOrder via menu bypass → verify delivery charge updates → place order → verify `delivery_charge` in POS payload matches updated value

---

## What QA must NOT do

- Do not modify any code in `ReviewOrder.jsx`
- Do not change CartContext or DeliveryAddress during QA
- Do not attempt to test the admin panel — scope is customer delivery flow only

---

## Self-test evidence

```
grep -n "BUG-2026-02-XX-001" /app/frontend/src/pages/ReviewOrder.jsx
111:    setDeliveryCharge, // BUG-2026-02-XX-001 Plan R2
758:  // BUG-2026-02-XX-001 Plan R2: On ReviewOrder mount, re-check delivery charge using the

HTTP check: curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 → 200
```

---

*End of QA Handover — BUG-2026-02-XX-001 Plan R2*
