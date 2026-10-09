# Session Handover — BUG-2026-02-XX-001 Plan R5

**Document:** SESSION_HANDOVER_R5.md  
**Date:** 2026-07-14  
**Session role:** IMPLEMENTATION (Role 3)  
**Status:** IMPLEMENTATION COMPLETE — OWNER SMOKE TEST PENDING

---

## What Happened This Session

1. Owner smoke test for R4 failed: delivery charge still ₹10 on back-nav. Network tab confirmed zero calls to distance-api-new.
2. Investigated `useScannedTable.js` — confirmed root cause: `useState(null)` init + async `useEffect` load means `scannedOrderType` is **null on first render**.
3. Traced execution: delivery charge effect fires on mount → `scannedOrderType=null` → guard blocks → early return → API never called. When `scannedOrderType` loads to `'delivery'`, subtotal/deliveryAddress unchanged → effect doesn't re-fire.
4. Proposed Plan R5 (add `scannedOrderType` to dep array) via investigation report.
5. Owner approved R5.
6. Implemented: `[subtotal, deliveryAddress]` → `[subtotal, deliveryAddress, scannedOrderType]`.
7. Build verified: webpack compiled clean, 0 errors.
8. QA_HANDOVER_R5.md + SESSION_HANDOVER_R5.md written. PRD.md updated.

---

## Root Cause (Definitive — confirmed by code inspection)

**File:** `frontend/src/hooks/useScannedTable.js` line 15  
```js
const [scannedTable, setScannedTable] = useState(null); // null on first render
```
All reads from sessionStorage happen inside `useEffect([restaurantId, searchParams])` — AFTER first paint.

**Effect in ReviewOrder.jsx (delivery charge recalculation):**
```js
useEffect(() => {
  if (scannedOrderType !== 'delivery') return; // null !== 'delivery' → returns early on first render
  ...
}, [subtotal, deliveryAddress]); // scannedOrderType NOT in dep array → effect never re-fires when it loads
```

---

## Full Plan History for BUG-2026-02-XX-001

| Plan | Dep Array | Gap | Status |
|---|---|---|---|
| A-1 | DeliveryAddress.jsx only | Didn't fix ReviewOrder stale state | Superseded |
| A-2 | CartContext persist | Correct persistence, not a trigger fix | Still in place |
| R2 | `[]` (mount-only) | Inline cart changes not caught | Superseded |
| R3 | `[subtotal]` | Back-nav: deliveryAddress null on mount | Superseded |
| R4 | `[subtotal, deliveryAddress]` | Back-nav: scannedOrderType null on first render | Superseded |
| **R5** | **`[subtotal, deliveryAddress, scannedOrderType]`** | **Catches all three async loads** | ✅ CURRENT |

---

## Code Change

**File:** `frontend/src/pages/ReviewOrder.jsx` — lines 795–803

```diff
- // eslint-disable-next-line react-hooks/exhaustive-deps
- }, [subtotal, deliveryAddress]); // Plan R4

+ // BUG-2026-02-XX-001 Plan R5: added scannedOrderType to dep array.
+ // useScannedTable initialises scannedTable as null (useState(null)) and loads from sessionStorage
+ // inside its own useEffect — so scannedOrderType is null on the very first render of ReviewOrder.
+ // On fresh mount the effect fires, guard "scannedOrderType !== 'delivery'" blocks it (null !== 'delivery'),
+ // then useScannedTable's effect sets scannedOrderType to 'delivery', but subtotal and deliveryAddress
+ // are unchanged so the effect never re-fires — leaving a stale delivery charge.
+ // Adding scannedOrderType ensures the effect re-fires when it transitions null → 'delivery'.
+ // eslint-disable-next-line react-hooks/exhaustive-deps
+ }, [subtotal, deliveryAddress, scannedOrderType]); // Plan R5
```

---

## What Next Agent Should Do

1. **Owner smoke test** — follow R5-TC1 in `QA_HANDOVER_R5.md`.
   - Restaurant 699, delivery order
   - Cart below ₹250 → ReviewOrder (see ₹10) → back to Menu → cart above ₹250 → back to ReviewOrder
   - Expected: delivery charge updates to Free within ~1 second
   - Expected: POST to `manage.mygenie.online/api/v1/config/distance-api-new` visible in Network tab

2. **If smoke passes:** Mark BUG-2026-02-XX-001 as CLOSED in PRD.md and BUG_TRACKER_v2.md.

3. **If smoke fails again:** The next thing to investigate is whether the `shipping_status` field in the API response is something other than `'Yes'` when cart is above threshold (the code only updates charge when `shipping_status === 'Yes'`). Check actual API response with DevTools.

4. **Regression:** CR-2026-02-XX-002 (₹10 takeaway charge for restaurant 699) is already implemented and tested — owner smoke test also pending for that.

---

## Services at Session Close

| Service | Status |
|---|---|
| Frontend (React :3000) | ✅ Running — webpack compiled clean |
| Backend (FastAPI :8001) | ✅ Running — no changes |
| MongoDB | ✅ Running — no changes |

---

## Key Docs

| Doc | Path |
|---|---|
| QA Handover (R5) | `/app/memory/change_requests/BUG-2026-02-XX-001-delivery-charge-not-calculated/QA_HANDOVER_R5.md` |
| QA Handover (R4) | `/app/memory/change_requests/BUG-2026-02-XX-001-delivery-charge-not-calculated/QA_HANDOVER_R4.md` |
| PRD (active) | `/app/memory/PRD.md` |
| Agent System Prompt | `/app/memory/control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` |
