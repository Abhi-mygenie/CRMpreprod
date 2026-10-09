# PLANNING REPORT — BUG-2026-02-XX-001 + CR-2026-02-XX-002

**Planning by:** E1 (Role 2 — Planning, read-only)
**Date:** 2026-07-13
**Status:** COMPLETE — awaiting owner gate approval before Implementation (Role 3)

---

## SESSION START

```text
Project: MyGenie Customer App
Role selected: PLANNING (Role 2)
Risk level: BUG-001 = HIGH · CR-002 = CRITICAL
Docs read: Alpha v0.1 (full), all investigation reports, QA_HANDOVER, SESSION_HANDOVER (both),
           DeliveryAddress.jsx, CartContext.js, ReviewOrder.jsx (660–700), orderService.ts,
           useMenuData.js (useRestaurantDetails)
Blocked by unknowns: None
```

---

## 1. Impact Analysis — BUG-2026-02-XX-001 (Delivery Charge Stale Check)

### Root cause (confirmed)
`checkDistance` is never re-triggered when `getTotalPrice()` changes after the delivery address page has already loaded. Stale `distanceResult.shipping_charge` persists until next address-level event.

### Files WILL change

| File | Risk | Change type |
|---|---|---|
| `frontend/src/pages/DeliveryAddress.jsx` | MEDIUM | Add 1 `useEffect` (~8 lines) watching `cartTotal` to re-call `checkDistance` when address already selected |
| `frontend/src/context/CartContext.js` | HIGH (§6.3 hotspot) | Add `deliveryCharge` localStorage persistence (init + wrapper setter + clear + export) |

### Files WILL NOT change
`ReviewOrder.jsx`, `orderService.ts`, `RestaurantConfigContext.jsx`, `backend/server.py`, any `.env`

### Blast radius
- Delivery order flow only (re-trigger only when `hasActiveAddress`)
- CartContext change writes new key `delivery_charge_<restaurantId>` — isolated, follows existing pattern
- All downstream consumers of `deliveryCharge` auto-correct (no additional changes)

### Downstream consumers verified (no code change needed)

| Consumer | File | Impact |
|---|---|---|
| `effectiveDeliveryCharge` computation | `ReviewOrder.jsx:674–677` | Value becomes correct; logic unchanged |
| `placeOrder`/`updateCustomerOrder` | `ReviewOrder.jsx:1103,1142,1261,1404,1446` | Receives correct value via effectiveDeliveryCharge |
| `delivery_charge` POS field | `orderService.ts:369` | Correct; no code change |
| Bill display | `ReviewOrder.jsx:1799` | Correct; no code change |

---

## 2. Impact Analysis — CR-2026-02-XX-002 (Takeaway Charge)

### Data chain confirmed (live probe + code trace)
```
POS /web/restaurant-info → restaurant.takeaway_charges = 10 (restaurant 699)
  → useRestaurantDetails → restaurant object ✅ already in ReviewOrder.jsx:119
  → effectiveDeliveryCharge [CURRENT] = 0 for takeaway (gated by includeDelivery = false)
  → effectiveDeliveryCharge [PROPOSED] = 0 + takeawaySurcharge(10) = 10
  → all 7 placeOrder/updateCustomerOrder calls auto-correct via effectiveDeliveryCharge
  → delivery_charge: "10" in POS payload ✅
```

### Files WILL change

| File | Risk | Change type |
|---|---|---|
| `frontend/src/pages/ReviewOrder.jsx` | CRITICAL (§6.1, Part C) | Modify `effectiveDeliveryCharge` block + 1 display line (~8 lines total) |
| `memory_repo/v2/PROJECT_GAP_REGISTER.md` | LOW | Mark GAP-021 CLOSED |

### Files WILL NOT change
`orderService.ts`, `CartContext.js`, `RestaurantConfigContext.jsx`, `backend/server.py`, any `.env`

### Blast radius
- Restaurant 699, takeaway only: `delivery_charge` changes from `"0"` to `"10"`
- All other restaurants: `restaurant.takeaway_charges` is null → `takeawaySurcharge = 0` → no change
- Delivery orders: `scannedOrderType === 'takeaway'` is false → no change
- Dinein orders: same, no change
- Restaurant 716 carve-out: independent path in `orderService.ts:325`, unaffected
- Delivery GST chain (`applyDeliveryGst` at line 685): gated by `includeDelivery` (false for takeaway) → GST not applied to surcharge (correct per Q6 deferral)

---

## 3. Implementation Plan

### Implementation order
BUG-001 first (MEDIUM/HIGH risk), then CR-002 (CRITICAL). Both in same session — no file overlap.

---

### Plan A-1 — DeliveryAddress.jsx — Cart-change re-trigger

**File:** `frontend/src/pages/DeliveryAddress.jsx`
**Code marker:** `// BUG-2026-02-XX-001 R1:`

**Locate:** `const hasActiveAddress = Boolean(selectedId) || Boolean(reverseAddress);` (line ~651)

**Insert immediately after:**
```javascript
// BUG-2026-02-XX-001 R1: Re-check delivery charge when cart total changes after address load.
// cartTotal drives this effect; checkDistance already handles the 500ms debounce internally.
const cartTotal = getTotalPrice();
useEffect(() => {
  if (!markerPos || !hasActiveAddress) return;
  checkDistance(markerPos.lat, markerPos.lng);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [cartTotal]); // intentional: only cartTotal; address/marker changes already trigger via their own handlers
```

---

### Plan A-2 — CartContext.js — deliveryCharge persistence

**File:** `frontend/src/context/CartContext.js`
**Code marker:** `// BUG-2026-02-XX-001 persist:`

**Change 1 — line 504 — initialize from localStorage:**
```javascript
// BUG-2026-02-XX-001 persist: load persisted delivery charge on mount
const [deliveryCharge, setDeliveryCharge] = useState(() => {
  if (!restaurantId || restaurantId === 'default') return 0;
  const stored = localStorage.getItem(`delivery_charge_${restaurantId}`);
  return stored ? (parseFloat(stored) || 0) : 0;
});
```

**Change 2 — add persistDeliveryCharge wrapper after the useState:**
```javascript
// BUG-2026-02-XX-001 persist: wrap setter to persist charge to localStorage
const persistDeliveryCharge = useCallback((charge) => {
  setDeliveryCharge(charge);
  if (restaurantId && restaurantId !== 'default') {
    localStorage.setItem(`delivery_charge_${restaurantId}`, String(charge));
  }
}, [restaurantId]);
```

**Change 3 — clearDeliveryAddress (around line 517) — clear persisted charge:**
After `setDeliveryCharge(0);`, add:
```javascript
localStorage.removeItem(`delivery_charge_${restaurantId}`); // BUG-2026-02-XX-001 persist
```

**Change 4 — context value export (around line 557) — expose persistDeliveryCharge as setDeliveryCharge:**
```javascript
setDeliveryCharge: persistDeliveryCharge, // BUG-2026-02-XX-001 persist
```

---

### Plan B-1 — ReviewOrder.jsx — takeawaySurcharge injection (computation only)

**File:** `frontend/src/pages/ReviewOrder.jsx`
**Code marker:** `// CR-2026-02-XX-002:`
**Owner gate:** ✅ APPROVED (2026-07-13)

**Locate anchor (lines 671–677):**
```javascript
// ─── Delivery Charge gating (DELIVERY_CHARGE_GATING CR D-2) ─────
const includeDelivery        = scannedOrderType === 'delivery';
const effectiveDeliveryCharge = includeDelivery
                              ? (parseFloat(deliveryCharge) || 0)
                              : 0;
```

**Replace with:**
```javascript
// ─── Delivery Charge gating (DELIVERY_CHARGE_GATING CR D-2) ─────
const includeDelivery   = scannedOrderType === 'delivery';
// CR-2026-02-XX-002: POS restaurant.takeaway_charges funds packaging fee for takeaway orders.
// Returns 0 for all other order types and restaurants that have no takeaway_charges configured.
const takeawaySurcharge = (scannedOrderType === 'takeaway')
                        ? (restaurant?.takeaway_charges || 0)
                        : 0;
const effectiveDeliveryCharge = (includeDelivery
                              ? (parseFloat(deliveryCharge) || 0)
                              : 0) + takeawaySurcharge;
```

**Why no display change here:**
The existing "Delivery Charge" display row (line 1795) is gated by `{scannedOrderType === 'delivery' && ...}` — it is completely hidden for takeaway orders. Changing the value inside that row for delivery orders is unnecessary because for delivery `takeawaySurcharge = 0`, so `effectiveDeliveryCharge = deliveryCharge` (unchanged). The delivery row is NOT touched.

**Financial propagation (no extra work needed):**
```javascript
// Line 707 — effectiveDeliveryCharge already flows into all financial totals:
const finalSubtotal = subtotalAfterDiscount + serviceCharge + effectiveDeliveryCharge;
// → totalToPay (line 710) +₹10 ✅
// → roundedTotal (line 714) +₹10 ✅
// → order_amount in POS payload +₹10 ✅
// → delivery_charge in POS payload = "10" ✅ (all 7 call sites via effectiveDeliveryCharge)
```

---

### Plan B-2 — ReviewOrder.jsx — Q3-B "Takeaway Charges" display row (NEW row)

**File:** `frontend/src/pages/ReviewOrder.jsx`
**Code marker:** `// CR-2026-02-XX-002 Q3-B:`
**Owner decision:** ✅ Q3-B approved — label = "Takeaway Charges" (2026-07-13)

**Locate anchor — end of the existing "Delivery Charge" block (after line 1801):**
```jsx
{scannedOrderType === 'delivery' && (
  <div className="price-row price-row-sub">
    <span className="price-label-sub">Delivery Charge</span>
    <span className="price-value-sub">{deliveryCharge > 0 ? `₹${deliveryCharge.toFixed(2)}` : 'Free'}</span>
  </div>
)}
```

**Insert immediately AFTER this block:**
```jsx
{/* CR-2026-02-XX-002 Q3-B: Takeaway Charges — packaging/handling fee from POS restaurant.takeaway_charges */}
{scannedOrderType === 'takeaway' && takeawaySurcharge > 0 && (
  <div className="price-row price-row-sub">
    <span className="price-label-sub">Takeaway Charges</span>
    <span className="price-value-sub">₹{takeawaySurcharge.toFixed(2)}</span>
  </div>
)}
```

**Why this is the correct approach:**
- Does NOT touch the existing "Delivery Charge" row — zero regression risk on delivery flow
- Is fully self-contained — only renders when `takeawaySurcharge > 0` (i.e., restaurant has the field configured in POS)
- Label "Takeaway Charges" matches owner decision (Q3-B, 2026-07-13)
- Value comes directly from `takeawaySurcharge` (already computed in B-1) — no new API call
- `totalToPay` and `roundedTotal` already include the ₹10 via `effectiveDeliveryCharge` (line 707) — grand total shown on screen is correct without any separate change

**Customer-visible result (restaurant 699, takeaway):**
```
Takeaway Charges    ₹10.00
──────────────────────────
Subtotal            ₹XXX.00
Grand Total         ₹(XXX+10).00
```

---

### Plan B-3 — GAP Register update

**File:** `memory_repo/v2/PROJECT_GAP_REGISTER.md`
Mark GAP-021 as CLOSED with date and reason (Option C implemented, config-driven, no hardcode).

---

## 4. Verification Matrix

### BUG-2026-02-XX-001

| ID | Test | Expected |
|---|---|---|
| R1-TC1 | Cart < ₹250 → open delivery address → add items (→ > ₹250) → stay on page | Charge re-checks to ₹0 automatically |
| R1-TC2 | Cart > ₹250, open delivery address fresh | Charge shows ₹0 (pre-existing — must not regress) |
| R1-TC3 | Cart > ₹250, NO active address on delivery page | No distance check fires |
| R1-TC4 | Charge = ₹0 stored → page refresh → ReviewOrder | Shows ₹0 (persistence) |
| R1-TC5 | Charge = ₹50 stored → page refresh → ReviewOrder | Shows ₹50 (persistence) |
| R1-TC6 | Clear delivery address | `delivery_charge_699` removed from localStorage |

### CR-2026-02-XX-002

| ID | Test | Expected |
|---|---|---|
| CR-TC1 | Rest 699, takeaway → place order | POS `delivery_charge = "10"` |
| CR-TC2 | Rest 699, takeaway → ReviewOrder bill | **"Takeaway Charges" row shows ₹10.00** (separate row; "Delivery Charge" row hidden for takeaway) |
| CR-TC3 | Rest 699, delivery → place order | `delivery_charge = distance API charge` (unchanged) |
| CR-TC4 | Rest 699, dinein → place order | `delivery_charge = "0"` (unchanged) |
| CR-TC5 | Rest 478, takeaway → place order | `delivery_charge = "0"` (no regressions) |
| CR-TC6 | Rest 716, any order | 716 carve-out behavior unchanged |
| CR-TC7 | Rest 699, takeaway → edit order | Update payload `delivery_charge = "10"` |
| CR-TC8 | Any rest, GST + delivery | Delivery GST computed correctly; takeaway GST still 0 |

---

## 5. Owner Approval Gate

```
OWNER APPROVALS — ALL RECEIVED (2026-07-13)

BUG-2026-02-XX-001:
  [✅] A-1 (DeliveryAddress.jsx useEffect) — approved
  [✅] A-2 (CartContext.js persistence)    — approved, bundled with A-1

CR-2026-02-XX-002:
  [✅] B-1 (ReviewOrder.jsx CRITICAL hotspot) — approved
  [✅] B-2 (Q3-B display row) — "Takeaway Charges" label approved
  [✅] Display: "Delivery Charge" row unchanged; new "Takeaway Charges" row added

OWNER CONFIRMED:
  Screen will show "Takeaway Charges ₹10.00" as a separate bill row for takeaway orders.
  POS order API receives delivery_charge = "10" under the existing delivery_charge key.
  Grand total on screen correctly includes ₹10 (via effectiveDeliveryCharge → finalSubtotal → totalToPay).

STATUS: GATE OPEN — Implementation (Role 3) may proceed immediately.
```

---

## 6. Planning output (canonical)

```text
Planning complete + all owner approvals received: BUG-2026-02-XX-001 + CR-2026-02-XX-002
Stage: Implementation (Role 3) — GATE OPEN
Date: 2026-07-13

BUG-2026-02-XX-001 (approved):
  Files WILL change:
    - frontend/src/pages/DeliveryAddress.jsx  (MEDIUM  — Plan A-1: cartTotal useEffect)
    - frontend/src/context/CartContext.js      (HIGH    — Plan A-2: deliveryCharge localStorage persistence)
  Files WILL NOT touch:
    - ReviewOrder.jsx, orderService.ts, RestaurantConfigContext.jsx, server.py, any .env

CR-2026-02-XX-002 (approved):
  Files WILL change:
    - frontend/src/pages/ReviewOrder.jsx        (CRITICAL — Plan B-1: effectiveDeliveryCharge + Plan B-2: new Takeaway Charges row)
    - memory_repo/v2/PROJECT_GAP_REGISTER.md    (LOW      — Plan B-3: GAP-021 closure)
  Files WILL NOT touch:
    - orderService.ts, CartContext.js, RestaurantConfigContext.jsx, server.py, any .env

Owner confirmations:
  [✅] A-1 approved
  [✅] A-2 approved (bundle)
  [✅] CR-002 B-1 ReviewOrder.jsx gate approved
  [✅] Q3-B: label "Takeaway Charges" approved; new standalone row (not modifying delivery row)
  [✅] Confirmed: screen shows "Takeaway Charges ₹10" | POS receives delivery_charge="10"
  [✅] Confirmed: grand total includes ₹10 automatically (effectiveDeliveryCharge → finalSubtotal → totalToPay)

Key correction vs original plan:
  - "Delivery Charge" row (line 1795) is gated scannedOrderType==='delivery' — NOT shown for takeaway
  - Plan B-2 adds a NEW "Takeaway Charges" row after the delivery block — zero touch to delivery row
  - Original B-1 display change (deliveryCharge → effectiveDeliveryCharge in line 1799) is CANCELLED —
    unnecessary and incorrect (delivery row hidden for takeaway; delivery orders unaffected)

Docs: /app/memory/change_requests/BUG-2026-02-XX-001-delivery-charge-not-calculated/PLANNING_REPORT.md
      /app/memory/change_requests/CR-2026-02-XX-002-restaurant-699-takeaway-charge/PLANNING_REPORT.md
Next: Implementation (Role 3) → QA (Role 4) →
      Owner smoke (restaurant 699, takeaway + delivery flows) → Regression → Closure
```

---

*End of PLANNING REPORT (finalised 2026-07-13 — all gates open). Planning agent must not code.*
