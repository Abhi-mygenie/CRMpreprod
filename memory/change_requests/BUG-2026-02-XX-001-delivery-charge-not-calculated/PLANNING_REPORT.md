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
The existing "Delivery Charge" display row (line 1795) is gated by `{scannedOrderType === 'delivery' && ...}` — it is completely hidden for takeaway orders. For delivery orders `takeawaySurcharge = 0`, so `effectiveDeliveryCharge = deliveryCharge` (unchanged). The delivery row is NOT touched.

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
- Only renders when `takeawaySurcharge > 0` — safe for all other restaurants
- `totalToPay` and `roundedTotal` already include the ₹10 via `effectiveDeliveryCharge` (line 707) — grand total is correct without any separate calculation change

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
  - Original B-1 display change (deliveryCharge → effectiveDeliveryCharge in line 1799) CANCELLED —
    unnecessary and incorrect (delivery row hidden for takeaway; delivery orders unaffected)

Docs: /app/memory/change_requests/BUG-2026-02-XX-001-delivery-charge-not-calculated/PLANNING_REPORT.md
      /app/memory/change_requests/CR-2026-02-XX-002-restaurant-699-takeaway-charge/PLANNING_REPORT.md
Next: Implementation (Role 3) → QA (Role 4) →
      Owner smoke (restaurant 699, takeaway + delivery flows) → Regression → Closure
```

---

*End of PLANNING REPORT (finalised 2026-07-13 — all gates open). Planning agent must not code.*

---
---

## ADDENDUM — Plan R2 (2026-07-13 — post smoke-test failure)

**Trigger:** BUG-001 smoke test failed. Screenshot confirmed: item total ₹260 (> ₹250 threshold), delivery charge shown ₹10 (wrong — should be ₹0). Network tab: `distance-api-new` NOT called on ReviewOrder page. R2 approved by owner.

**Root cause of A-1 gap:**
Plan A-1 re-triggers `checkDistance` in `DeliveryAddress.jsx` — only fires while the user is ON the delivery address page. The smoke test flow was:
```
Address selected (cart < ₹250) → setDeliveryCharge(10)
User navigated to menu → added items (cart = ₹260 > ₹250) — A-1 never fired
User navigated directly to /699/review-order — no checkDistance call here
ReviewOrder reads stale deliveryCharge = 10 from CartContext/localStorage → shows ₹10
```

A-1 alone is not sufficient. R2 is required as an additional fix.

---

### Plan R2 — ReviewOrder.jsx — mount re-check of delivery charge

**File:** `frontend/src/pages/ReviewOrder.jsx`
**Risk:** CRITICAL (§6.1, Part C — owner gate: ✅ approved 2026-07-13)
**Code marker:** `// BUG-2026-02-XX-001 R2:`

**Pre-conditions confirmed (from code read):**
- `getTotalPrice` ✅ already destructured from `useCart()` at line 100
- `deliveryAddress` ✅ already destructured from `useCart()` at line 109 — has `latitude`, `longitude` (string fields, set in DeliveryAddress.jsx lines 247–248)
- `scannedOrderType` ✅ already available from `useScannedTable()`
- `restaurantId` ✅ already available
- `setDeliveryCharge` ❌ NOT in ReviewOrder.jsx useCart destructure — **must be added to line 109 block**
- `MANAGE_BASE_URL` ❌ NOT defined in ReviewOrder.jsx — **must be defined in component body**

**Change 1 — add `setDeliveryCharge` to useCart destructuring (line 109):**

Locate the existing `useCart()` destructure block (lines 97–113). Add `setDeliveryCharge` after `clearDeliveryAddress`:
```javascript
clearDeliveryAddress,
setDeliveryCharge,    // BUG-2026-02-XX-001 R2
```

**Change 2 — define `MANAGE_BASE_URL` in component body (near top of component, after `restaurant` line ~120):**
```javascript
// BUG-2026-02-XX-001 R2: distance API base URL (mirrors DeliveryAddress.jsx)
const MANAGE_BASE_URL = process.env.REACT_APP_IMAGE_BASE_URL || 'https://manage.mygenie.online';
```

**Change 3 — add mount-only useEffect (after existing delivery-related state, around line 155):**
```javascript
// BUG-2026-02-XX-001 R2: Re-check delivery charge on ReviewOrder mount using final cart total.
// Handles the case where user adds items on menu page then navigates directly to ReviewOrder
// without returning to DeliveryAddress — A-1 (cartTotal useEffect) cannot catch that scenario.
// Guards: delivery orders only; valid lat/lng from saved address required.
useEffect(() => {
  if (scannedOrderType !== 'delivery') return;
  if (!deliveryAddress?.latitude || !deliveryAddress?.longitude) return;
  const finalCartTotal = getTotalPrice();
  fetch(`${MANAGE_BASE_URL}/api/v1/config/distance-api-new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      destination_lat: String(deliveryAddress.latitude),
      destination_lng: String(deliveryAddress.longitude),
      restaurant_id:   String(restaurantId),
      order_value:     String(finalCartTotal || 0),
    }),
  })
    .then(res => res.json())
    .then(data => {
      if (data?.shipping_charge !== undefined) {
        setDeliveryCharge(data.shipping_charge || 0); // persistDeliveryCharge under the hood (A-2)
      }
    })
    .catch(() => {}); // silent fail — stale charge stays if network error; user can go back and re-select
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []); // mount-only: fires once per ReviewOrder visit; finalCartTotal stable at mount
```

**Why `[]` deps (mount-only) is correct:**
- Cart is already fully loaded from localStorage before ReviewOrder renders
- `getTotalPrice()` at mount time returns the final, correct cart total
- We want exactly ONE re-check per ReviewOrder visit (not on every render)
- If the user goes back to menu and changes the cart, they must revisit ReviewOrder — which re-mounts and fires the effect again

**Blast radius:**
- Delivery orders with a saved address: one extra API call per ReviewOrder mount
- Takeaway/dinein orders: `scannedOrderType !== 'delivery'` guard exits immediately — NO API call
- All other restaurants: fires the same way; harmless (API returns correct charge for any restaurant)
- A-2 (`persistDeliveryCharge`): the `setDeliveryCharge` from context IS `persistDeliveryCharge` — the updated charge is automatically persisted to localStorage

**Files changing for R2:**
| File | Change | Risk |
|---|---|---|
| `frontend/src/pages/ReviewOrder.jsx` | Add `setDeliveryCharge` to destructure + `MANAGE_BASE_URL` const + mount useEffect (~20 lines) | CRITICAL |

**Files NOT changing:** `DeliveryAddress.jsx` (A-1 stays — complements R2), `CartContext.js` (A-2 stays), `orderService.ts`, `server.py`, any `.env`

---

### Updated verification matrix (R2 additional test cases)

| ID | Test | Expected |
|---|---|---|
| R2-TC1 (primary) | Restaurant 699, delivery · Set address (cart ₹100) · Go to menu · Add items (cart ₹260) · Navigate directly to ReviewOrder | ReviewOrder auto-rechecks → delivery charge updates to ₹0 |
| R2-TC2 | Restaurant 699, delivery · Cart ₹260 · Open ReviewOrder · Check Network tab | `distance-api-new` POST called on mount with `order_value: "260"` |
| R2-TC3 | Restaurant 699, **takeaway** order | No `distance-api-new` call on ReviewOrder mount |
| R2-TC4 | Restaurant 699, delivery · No saved address (deliveryAddress = null) | No `distance-api-new` call on ReviewOrder mount |
| R2-TC5 (regression) | Delivery charge ₹10 already correct (cart < ₹250) | Mount re-check returns ₹10 — no visible change |

---

```text
R3 Plan: APPROVED (2026-07-14) — R2 mount-only fix insufficient; cart changes on ReviewOrder not covered
Scope: ReviewOrder.jsx only (~10 lines net: 1 ref + R2 useEffect replaced by R3)
Risk: CRITICAL (§6.1 hotspot — gate open from previous sessions)
Change from R2: [] → [subtotal] + 500ms debounce + cleanup return

R3 IMPLEMENTATION STATUS: ✅ COMPLETE (2026-07-14)
Files changed: frontend/src/pages/ReviewOrder.jsx
  - Line 259: deliveryChargeTimerRef = useRef(null) added (marker: BUG-2026-02-XX-001 Plan R3)
  - Lines 759–796: R2 useEffect replaced with R3 useEffect — [subtotal] dep + 500ms debounce (marker: BUG-2026-02-XX-001 Plan R3)
Implementation exit gate: 7/7
Next: QA (Role 4) → Owner smoke re-test
```
