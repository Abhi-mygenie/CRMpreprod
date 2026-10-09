# IMPACT ANALYSIS — CR-2026-09-07-001

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-07-001 |
| **Title** | Inventory stock-out control — FE three-layer defence |
| **Planning Stage** | Impact Analysis — **CLOSED ✅** |
| **Date** | 2026-09-07 |
| **Gate Closed** | 2026-09-07 — owner approved all decisions + design |
| **Risk** | HIGH (ReviewOrder.jsx = CRITICAL, CartContext.js = HIGH per Part C) |
| **Code Reality** | NONE — no existing FE stock-out handling anywhere |

---

## 1. Verified Item Registration

- Intake doc: `/app/memory/change_requests/CR-2026-09-07-001-inventory-stock-out-control/INTAKE_DOC.md` ✅
- PRD.md updated ✅
- No duplicate ✅

---

## 2. Code Reality (verified by direct file inspection)

### 2.1 `useMenuData.js` — item transform (lines 64–128)

```
food_stock: Number(item.food_stock)   ← mapped (line 108), comment says "downstream CR A-4"
stock_out:  ← NOT MAPPED              ← GAP 1 ROOT CAUSE
add_ons:    item.add_ons || []        ← raw passthrough (line 74)
```

**Critical finding — addon `stock_out` passthrough:**
Because `add_ons` is mapped as `item.add_ons || []` (raw passthrough), any field POS sends
inside each addon object — including `stock_out` — is already available downstream.
`addon.stock_out` does NOT need an explicit mapping step. It passes through automatically.

This changes the addon work scope: no transform change needed for addons, only for food-level `stock_out`.

### 2.2 `MenuItems.jsx` — `filterItems()` (lines 372–422)

Two existing filters chained:
```
Filter 1 (line 380): isItemAllowedForChannel  ← CR A-1
Filter 2 (line 390): isItemAvailable           ← CR-2026-06-17-003
```
Stock-out filter is **absent**. New filter must be inserted as Filter 3, after Filter 2.

`restaurant` object is already available in `MenuItems.jsx` scope (line 57, `useRestaurantDetails`).
`restaurant?.show_out_of_stock_items` can be read directly — no new hook or context needed.

### 2.3 `MenuItem.jsx` — ADD button (lines 157, 218)

Two ADD button render sites:

| Layout | Line | Current condition |
|--------|------|-------------------|
| No-image | 157 | `isAvailable && isOnlineOrderEnabled` |
| Image | 218 | `isAvailable && isOnlineOrderEnabled && isChannelAllowed` |

`item.stock_out` is available on the `item` prop — it will be populated once the transform fix lands.
No new prop needed. `isStockOut` derived locally: `const isStockOut = item.stock_out === 'Y'`.

When `isStockOut`:
- ADD button is replaced by a "Sold Out" indicator (both layout sites)
- `isInCart` (QuantitySelector) branch is NOT affected — item cannot reach cart if OOS, but
  defensive: if an item was in cart before `stock_out` changed to `Y`, QuantitySelector still
  renders. Planning decision needed (see Section 5, D-IA-1).

### 2.4 `CartContext.js` — `addToCart()` (lines 219–272)

Existing guard at line 221 (CR A-1 channel check):
```js
if (activeOrderType && !isItemAllowedForChannel(item, activeOrderType)) {
  toast.error(`"${item?.name}" is not available for ${channelLabel} orders.`);
  return;
}
```

New stock-out guard is **additive** — insert immediately after line 225 (after the channel guard):
```js
if (item.stock_out === 'Y') {
  toast.error(`"${item?.name || 'This item'}" is currently out of stock.`);
  return;
}
```

**Scope boundary confirmed:** `setCart()` call starts at line 227. The new guard is before it.
No impact on: `setCart`, expiry, cross-tab sync, `cartId` generation, edit-order logic, or
localStorage key naming.

### 2.5 `orderService.ts` — `placeOrder()` (lines 313–451) and `updateCustomerOrder()` (lines 456–583)

Both functions:
- Call POS API with `formData`
- Have `catch (error: any)` that logs and re-throws
- Since backend returns **HTTP 422**, Axios throws automatically — the catch fires naturally

The current catch at line 447 (`placeOrder`) and line 579 (`updateCustomerOrder`) just re-throws.
The stock-out error propagates as-is to `ReviewOrder.jsx`.

**Decision point:** Where to detect stock-out — in service or in ReviewOrder?

Recommendation (for Planning to confirm): detect in service catch.
```ts
// In both placeOrder and updateCustomerOrder catch blocks:
if (error.response?.status === 422 && error.response?.data?.out_of_stock_items?.length > 0) {
  const stockOutError = new Error('STOCK_OUT');
  (stockOutError as any).isStockOut = true;
  (stockOutError as any).out_of_stock_items = error.response.data.out_of_stock_items;
  throw stockOutError;
}
throw error; // everything else re-throws as before
```

This keeps ReviewOrder.jsx's catch clean — it checks `error.isStockOut` rather than parsing raw Axios error.
It also means `ReviewOrder.jsx` has zero knowledge of HTTP status codes for stock-out.

**The `placeOrder` return type `Promise<ApiPlaceOrderResponse>` remains unchanged.**
Stock-out is an error path (thrown), not a return path.

### 2.6 `ReviewOrder.jsx` — catch block (lines 1394–1603)

Current catch branch order:
```
1. isTrueNetworkLoss  (line 1424)  ← transport-layer only
2. status === 401     (line 1430)  ← auth retry (complex, 140 lines)
3. else               (line 1571)  ← generic error + post-place-order JS exception recovery
```

Stock-out (422) currently falls into branch 3 (generic). With the typed `StockOutError` from
service layer, the catch sees `error.isStockOut === true`.

**New branch to insert between branch 2 and branch 3 (after line 1570, before line 1571):**
```js
} else if (error.isStockOut) {
  // CR-2026-09-07-001: stock-out hard stop
  // Do NOT navigate. Do NOT clearCart. Show list of OOS items.
  const items = error.out_of_stock_items || [];
  const itemNames = items.map(i =>
    i.type === 'addon'
      ? `${i.addon_name} (addon for ${i.food_name})`
      : i.food_name
  ).join(', ');
  toast.error(
    items.length === 1
      ? `"${itemNames}" is out of stock. Please remove it from your cart.`
      : `Some items are out of stock: ${itemNames}. Please update your cart.`,
    { duration: 6000 }
  );
```

**Scope boundary confirmed — what this branch DOES NOT touch:**
- `isTrueNetworkLoss` branch (line 1424) — unaffected, evaluated before stock-out check
- `401` branch (line 1430) — unaffected, evaluated before stock-out check
- `response?.order_id` recovery (line 1580) — in branch 3 (generic), unaffected
- 716 hardcoded logic (lines 1375, 1444, 1549) — all in try block before catch
- Razorpay path (lines 1051–1070) — in try block, before catch
- `orderDispatchedRef` / `isPlacingOrderRef` — handled in `finally` block (unaffected)
- `clearCart()` — NOT called in stock-out branch (deliberate — cart retained for user to edit)

### 2.7 `CustomizeItemModal.jsx` — addon list (lines 261–292)

Addons rendered at line 261: `{item.add_ons.map((addon) => { ... })}`

`addon.stock_out` will be available (raw passthrough confirmed). No transform needed.

Per-addon change: add `const isAddonStockOut = addon.stock_out === 'Y'` inside the `.map()`,
then:
- `disabled={isAddonStockOut}` on the checkbox input (line 266)
- Visual "Sold Out" label beside addon name when `isAddonStockOut`
- When `isAddonStockOut`, the addon counter (`QuantitySelector`) does not render

**Boundary confirmed:** Food item ADD button in modal footer (line 308-314) is NOT affected.
Item remains orderable without the OOS addon.

### 2.8 `order.types.ts` — types (lines 177–236)

Additions needed (no existing types changed):

```ts
// New interfaces (add before ApiPlaceOrderResponse):
export interface StockOutFoodItem {
  type: 'food';
  food_id: string | number;
  food_name: string;
  message: string;
}
export interface StockOutAddonItem {
  type: 'addon';
  food_id: string | number;
  food_name: string;
  addon_id: string | number;
  addon_name: string;
  message: string;
}

// Extend existing:
export interface ApiPlaceOrderResponse {
  message: string;
  order_id: number;
  error?: string;                                          // new
  out_of_stock_items?: (StockOutFoodItem | StockOutAddonItem)[];  // new
}
export interface ApiProductAddon {
  id: number;
  name: string;
  price: number;
  stock_out?: 'Y' | 'N';                                  // new
}
export interface ApiProductResponse {
  // ... existing fields ...
  stock_out?: 'Y' | 'N';                                  // new
  is_inventory?: 'Yes' | 'No';                            // new (FYI — not read by FE logic)
}
export interface ApiRestaurantInfoResponse {
  // ... existing fields ...
  show_out_of_stock_items?: 'Yes' | 'No';                 // new
}
```

---

## 3. Conflict Check

| Active CR | Overlap | Risk |
|-----------|---------|------|
| `CR-2026-08-06-001-time-controlled-ordering` | Both touch `MenuItems.jsx` `filterItems()` and `ReviewOrder.jsx` | **MEDIUM** — must check if time-controlled CR is IMPLEMENTED before this CR lands. If both are in flight, merge conflict possible in `filterItems()`. |
| `CR-2026-06-17-003-customer-menu-availability` | `isItemAvailable` in same `filterItems()` chain | LOW — already shipped, our new filter is additive |
| `CR A-1` (channel filter) | Both in `addToCart()` guard chain | LOW — already shipped, our guard is additive |

**Action for Planning:** Check status of `CR-2026-08-06-001` before implementation. If IMPLEMENTED and merged, cherry-pick its `filterItems()` changes as the base. If still in progress, coordinate.

---

## 4. Data Flow Trace — Full End-to-End

```
POS API (preprod.mygenie.online)
  POST /web/restaurant-product
    → item.stock_out: "Y"/"N"          → useMenuData.js transform (GAP 1 — must add)
    → addon.stock_out: "Y"/"N"         → add_ons raw passthrough (already works)
  POST /web/restaurant-info
    → show_out_of_stock_items: "No"    → restaurant object (already flows through raw)

MenuItems.jsx
  filterItems()
    Filter 1: channel (CR A-1)
    Filter 2: time (CR-003)
    Filter 3: stock_out [NEW]           → hide if stock_out='Y' && !showStockOut

MenuItem.jsx
  props: item (with stock_out), isOnlineOrderEnabled, orderType
  isStockOut = item.stock_out === 'Y'  [NEW derived bool]
  No-image ADD: isAvailable && isOnlineOrderEnabled && !isStockOut → ADD or "Sold Out"
  Image ADD:    isAvailable && isOnlineOrderEnabled && isChannelAllowed && !isStockOut

CustomizeItemModal.jsx
  addon.stock_out === 'Y'              [NEW]
  → checkbox disabled + "Sold Out" label

CartContext.js addToCart()
  Guard 1: channel check (CR A-1 — existing)
  Guard 2: stock_out === 'Y' [NEW]     → toast + return

orderService.ts placeOrder() / updateCustomerOrder()
  POST to POS API
  ← HTTP 422 + { error, out_of_stock_items }
  catch: detect 422 + out_of_stock_items  [NEW]
  → throw StockOutError { isStockOut:true, out_of_stock_items }

ReviewOrder.jsx handlePlaceOrder() — pre-submission check [NEW]
  Before placeOrder() call:
  Read React Query menuSections cache
  For each cart item:
    if cache.stock_out === 'Y'            → flag as fully OOS
    if cartQty > cache.food_stock > 0     → flag as partial stock
  If any flags → show quantity-aware message, SKIP API call

ReviewOrder.jsx handlePlaceOrder() catch
  Branch 1: isTrueNetworkLoss (existing)
  Branch 2: 401 retry (existing)
  Branch 3: error.isStockOut [NEW]     → toast item list + hard stop (no navigate, no clearCart)
  Branch 4: generic else (existing)
```

---

## 5. Owner Decisions — ALL LOCKED (2026-09-07)

### D-IA-1 — Cart OOS item on ReviewOrder arrival
**LOCKED: Option A** — No proactive re-check on ReviewOrder load.
Layer 3 (422) catches at submission. Customer finds out when they tap Place Order.
Pre-submission cache-check on Place Order tap (see D-IA-3 refinement) mitigates the worst case.

---

### D-IA-2 — Sold-out label text
**LOCKED: "Sold Out"**
Used in both MenuItem.jsx (ADD button replacement) and CustomizeItemModal.jsx (addon label).

---

### D-IA-3 — QuantitySelector + pre-submission stock check (refined)
**LOCKED: Option A + pre-submission cache-check with quantity display**

Two-part decision:

**Part 1:** QuantitySelector stays visible when `stock_out = 'Y'` on a cart item.
Layer 3 catches at submission. No UI change to QuantitySelector itself.

**Part 2 (new — owner addition):** On "Place Order" button tap in ReviewOrder,
**before** calling `placeOrder()`, run a client-side pre-submission check using the
React Query `menuSections` cache:

```
For each cart item:
  Look up item in React Query cache by food_id (String cast)
  If found in cache:
    CASE A — cache.stock_out === 'Y':
      → "X is sold out. Please remove it to continue."
      → Block API call, do not call placeOrder()
    CASE B — cache.food_stock is not null AND cache.food_stock > 0
              AND cartItem.quantity > cache.food_stock:
      → "Only {food_stock} of X available. You have {cartItem.quantity} in your cart."
      → Block API call, do not call placeOrder()
  If NOT found in cache:
    → Proceed to API call. Layer 3 (422) is the backstop.
```

**Why this satisfies the owner requirement:**
- Customer with qty 2 in cart, item goes to `stock_out = 'Y'` or `food_stock = 1`:
  pre-submission check fires before API → customer sees quantity-aware message immediately
- No additional API call on page load or tap (cache-read only)
- Layer 3 (422) remains backstop for cache misses and race conditions

**`food_stock` field status — confirmed live (probe 2026-09-07):**
```
Probe: POST /web/restaurant-product {"restaurant_id":"478","category_id":"0"}
Result: food_stock field present on all items
  - is_inventory='Yes' items: food_stock = numeric (0 in test env, non-zero in production)
  - is_inventory='No'  items: food_stock = 0 always
  - rum: food_stock=0, stock_out='N', is_inventory='Yes' → anomaly noted
    (FE trusts stock_out as single source of truth — rum is treated as orderable)
```

**food_stock read rule:**
- Only read `food_stock` for the quantity display message (Case B above)
- Do NOT use `food_stock === 0` as a proxy for OOS — use `stock_out === 'Y'` for Case A
- `food_stock` is meaningful only when: `is_inventory='Yes'` AND `stock_out='N'` AND `food_stock > 0`
- `food_stock` is already mapped in useMenuData.js (line 108) — no new mapping needed

**New file added to scope:** `ReviewOrder.jsx` pre-submission check is a new addition
to the existing catch-block change (Section 2.6 above). It runs in the `handlePlaceOrder`
function **before** `placeOrder()` is called, not in the catch block.

---

### D-IA-4 — Toast message format for pre-submission quantity warning (new)

**Proposed messages (for owner review):**

| Scenario | Message |
|----------|---------|
| Item fully OOS (stock_out='Y') | `"[Item name] is sold out. Please remove it from your cart to continue."` |
| Item partial stock (qty > food_stock) | `"Only [N] of [Item name] available. You have [qty] in your cart."` |
| Multiple items OOS/partial | One toast per item, or a single combined message listing all? |

**Recommendation:** Single combined toast listing all problematic items. Prevents toast stack.
Example: *"Some items need attention: Burger is sold out · Only 1 Extra Cheese available (you have 2)"*

**Owner: confirm message format or provide preferred copy.**

---

## 6. Files Confirmed WILL Change (8)

| # | File | Risk | Change Type | Lines affected |
|---|------|------|-------------|----------------|
| 1 | `frontend/src/hooks/useMenuData.js` | MEDIUM | Add 1 field to item transform (`stock_out`) | ~108 |
| 2 | `frontend/src/pages/MenuItems.jsx` | MEDIUM | Add 1 filter in `filterItems()` | ~394 |
| 3 | `frontend/src/components/MenuItem/MenuItem.jsx` | MEDIUM | `isStockOut` derived bool + 2 ADD render sites + "Sold Out" state | ~47, 157, 218 |
| 4 | `frontend/src/components/CustomizeItemModal/CustomizeItemModal.jsx` | MEDIUM | Disable OOS addons + "Sold Out" label in `.map()` | ~261–292 |
| 5 | `frontend/src/context/CartContext.js` | HIGH | Add 1 guard in `addToCart()` after line 225 | ~226 |
| 6 | `frontend/src/api/services/orderService.ts` | HIGH | Add stock-out detection in both catch blocks | ~447, ~579 |
| 7 | `frontend/src/pages/ReviewOrder.jsx` | CRITICAL | (a) Pre-submission cache-check with qty display before `placeOrder()` call; (b) `isStockOut` catch branch between 401 and generic | ~884 (pre-check), ~1570 (catch) |
| 8 | `frontend/src/types/api/order.types.ts` | LOW | Add 4 new types/interfaces, extend 4 existing | 177–236 |

---

## 7. Files Confirmed WILL NOT Change

| File | Why |
|------|-----|
| `frontend/src/context/AuthContext.jsx` | No auth changes |
| `frontend/src/context/RestaurantConfigContext.jsx` | `show_out_of_stock_items` from POS restaurant-info, not local config |
| `frontend/src/pages/LandingPage.jsx` | Not in OOS flow |
| `frontend/src/pages/OrderSuccess.jsx` | Hard stop prevents reaching it on OOS |
| `frontend/src/api/services/restaurantService.js` | Raw passthrough already works |
| `frontend/src/api/config/endpoints.js` | No new endpoints |
| `frontend/src/App.js` | No provider or route changes |
| `frontend/src/lib/itemAvailability.js` | Time-based availability — separate concern |
| `backend/server.py` | Inventory logic lives in POS API |
| Any payment file | Zero overlap |

---

## 8. Verification Matrix (for QA, pre-written)

| Test ID | Scenario | Expected Result | Layer |
|---------|----------|-----------------|-------|
| V-1 | Item `stock_out='Y'`, config `show_out_of_stock_items='No'` | Item hidden from menu entirely | L1 |
| V-2 | Item `stock_out='Y'`, config `show_out_of_stock_items='Yes'` | Item visible, "Sold Out" shown, ADD button absent | L1 |
| V-3 | Item `stock_out='N'`, any config | Item visible and orderable — no change | L1 |
| V-4 | All other items at restaurant 478 and 716 | Unaffected — no regression | L1 |
| V-5 | Direct call to `addToCart()` with OOS item | Blocked, toast shown, cart unchanged | L2 |
| V-6 | Addon `stock_out='Y'` in CustomizeItemModal | Addon checkbox disabled, "Sold Out" label shown | L2 |
| V-7 | Addon `stock_out='N'` in CustomizeItemModal | Addon fully selectable — no change | L2 |
| V-8 | Pre-submission: cart item `stock_out='Y'` in cache, tap Place Order | Toast: "X is sold out. Please remove it to continue." API NOT called. | L3-pre |
| V-9 | Pre-submission: cart qty 2, cache `food_stock=1`, tap Place Order | Toast: "Only 1 of X available. You have 2 in your cart." API NOT called. | L3-pre |
| V-10 | Pre-submission: cart item NOT in cache, tap Place Order | API called normally, Layer 3 (422) acts as backstop | L3-pre |
| V-11 | Pre-submission: multiple items OOS or low-stock | All problematic items listed in one combined message | L3-pre |
| V-12 | Place order with OOS item → POS returns 422 (cache miss path) | Toast with item name(s), stay on ReviewOrder, cart NOT cleared | L3 |
| V-13 | Place order with OOS addon → POS returns 422 | Toast: "Extra Cheese (addon for Burger) is out of stock" | L3 |
| V-14 | Place order with mix of OOS food + OOS addon | All failing items listed in one toast | L3 |
| V-15 | Place order — network loss (no response) | Network-loss warning still shown (existing branch unaffected) | L3 regression |
| V-16 | Place order — auth 401 | 401 retry still fires (existing branch unaffected) | L3 regression |
| V-17 | Place order — success (no OOS) | Navigate to OrderSuccess — unaffected | L3 regression |
| V-18 | Restaurant 716 order flow (room selection etc.) | Hardcoded 716 logic unaffected | regression |
| V-19 | Edit order (updateCustomerOrder) with OOS item | Same L3 hard stop | L3 |
| V-20 | Cart retained after any OOS hard stop | Cart items intact (clearCart NOT called on stock-out path) | L3 |
| V-21 | `food_stock=0` AND `stock_out='N'` item (e.g. 'rum' in 478) | Treated as available — stock_out is single source of truth | data rule |

---

## 9. Risk Summary

| Risk | Description | Mitigation |
|------|-------------|------------|
| `ReviewOrder.jsx` catch order wrong | Stock-out branch inserted after 401 branch — if order is wrong, 422 could be caught by wrong handler | Implementation Plan must specify exact insertion line. QA tests V-11, V-12, V-13 verify adjacent branches. |
| `filterItems()` merge conflict with CR-2026-08-06 | Both CRs add a filter to the same function | Check CR-2026-08-06 status before implementation. If concurrent, coordinate merge. |
| `add_ons` passthrough assumption wrong | Probe confirmed `stock_out` in addon objects from POS API. But if the raw passthrough adds undocumented fields, it may cause issues elsewhere. | Low risk — raw passthrough is existing pattern. Monitor for addon-related regressions. |
| `stock_out` stale in cart (D-IA-1) | Cart snapshot may not reflect live OOS state | Layer 3 is the backstop. Accepted for v1 (Option A). |

---

## 10. Planning Output

```
Planning complete: CR-2026-09-07-001
Stage: Impact Analysis v2 — owner decisions locked
Code reality: NONE — zero existing FE stock-out handling confirmed
Risk: HIGH (ReviewOrder.jsx = CRITICAL, CartContext.js = HIGH per Part C)

Owner decisions LOCKED:
  D-IA-1: No re-check on ReviewOrder load (Option A)
  D-IA-2: Label text = "Sold Out"
  D-IA-3: QuantitySelector stays (Option A) + pre-submission cache-check
           with qty-aware messages before placeOrder() API call
  D-IA-4: Toast message copy — LOCKED (owner approved 2026-09-07)
           Fully OOS:     "[Item] is sold out. Please remove it from your cart to continue."
           Partial stock: "Only [N] [Item] available. You have [qty] in your cart."
           Multiple:      Combined single toast — "Some items need attention:
                           [Item A] is sold out · Only [N] [Item B] available (you have [qty])"

Files WILL change (8):
  useMenuData.js          MEDIUM   — 1 field (stock_out) added to item transform
  MenuItems.jsx           MEDIUM   — 1 filter added to filterItems()
  MenuItem.jsx            MEDIUM   — isStockOut bool + 2 ADD sites + Sold Out state
  CustomizeItemModal.jsx  MEDIUM   — addon disable + Sold Out label
  CartContext.js          HIGH     — 1 guard in addToCart() (additive, line ~226)
  orderService.ts         HIGH     — stock-out detection in 2 catch blocks
  ReviewOrder.jsx         CRITICAL — pre-submission cache-check (line ~884)
                                     + isStockOut catch branch (line ~1570)
  order.types.ts          LOW      — 4 new + 4 extended

Files WILL NOT touch (10):
  AuthContext.jsx, RestaurantConfigContext.jsx, LandingPage.jsx,
  OrderSuccess.jsx, restaurantService.js, endpoints.js, App.js,
  itemAvailability.js, server.py, all payment files

Verification matrix: 21 test cases (V-1 to V-21)

Conflict check:
  CR-2026-08-06-001: check status before implementation

Docs:
  /app/memory/change_requests/CR-2026-09-07-001-inventory-stock-out-control/IMPACT_ANALYSIS.md
  /app/design_guidelines.json (4 change points, side-by-side before/after, CSS specs, test-ids)

Design mockup: /app/frontend/public/stockout-mockup.html
  Owner approved: 2026-09-07 — all 4 change points confirmed
  Design decisions locked: CP-1A, CP-1B, CP-2, CP-3, CP-4

Gate: IMPACT ANALYSIS CLOSED ✅ (2026-09-07, owner approval)
Next gate: Implementation Plan
```
