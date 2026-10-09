# INTAKE DOC — CR-2026-09-07-001

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-07-001 |
| **Title** | Inventory stock-out control — FE three-layer defence (menu hide, cart guard, order hard stop) |
| **Classification** | CR — Feature (FE implementation of completed backend change) |
| **Date Registered** | 2026-09-07 |
| **Reported By** | Owner |
| **Severity** | P1 |
| **Risk** | HIGH (ReviewOrder.jsx = CRITICAL; CartContext.js = HIGH per Part C) |
| **Status** | QA CLOSED ✅ — QA PASS 2026-09-08 |

---

## 1. Owner Request (verbatim / paraphrased)

> "basically currently we dont have inventory control, so backend has made changes for inventory control"
> "we need not to show item which are out of stock, or i can add key added show out of stock item,
>  basis which if yes then we show item if no then we dont"
> "and we do another check while adding item and third check by placing order"

**Decisions confirmed during investigation (D1–D6):**

| # | Decision | Answer |
|---|----------|--------|
| D1 | Default display of OOS items | **HIDE** — do not show by default |
| D2 | Config key for showing OOS items | `show_out_of_stock_items` from POS `restaurant-info` — `"Yes"` = show with Sold Out state; `"No"` (default) = hide |
| D3 | When shown (config=Yes): orderable? | **No** — visible but ADD disabled, "Sold Out" state |
| D4 | Add-to-cart guard | **Layer 2** — block `addToCart()` if `item.stock_out === 'Y'` even if visible |
| D5 | Order placement stock-out | **Layer 3** — hard stop on 422, show list of OOS items, do NOT navigate to success |
| D6 | Addon OOS when food item is in stock | Disable only that addon in CustomizeItemModal; food item remains orderable |

---

## 2. Classification

| Check | Result |
|-------|--------|
| Bug? | Partially — silent order failure path exists (OOS item in cart → 422 at placement → generic error) |
| Feature? | Yes — stock-out awareness is entirely new FE capability |
| Refactor? | No |
| Investigation done? | Yes — INV-2026-09-07-001 (session), all BE clarification rounds, live curl probes |
| *Registry note, added 2026-10-06 (Role 1)* | **`INV-2026-09-07-001` is paperwork belonging to this CR, not a separate registry item** — owner ruling. Its surviving artefact is `/app/memory/BE_ASK_STOCKOUT_INV-2026-09-07-001.md`. It gets no folder and no `index.yml` row; the evidence is already consumed here. Recorded in `../INTAKE_PASS_2026-10-06.md` §4 |
| **Final classification** | **CR — Feature + Silent-failure gap fix** |

---

## 3. Duplicate Check

| Related item | Relationship | Status |
|-------------|-------------|--------|
| All active CRs in `/app/memory/change_requests/` | No stock-out or inventory CR exists | Confirmed DISTINCT |
| Historical CRs in `/app/memory_repo/change_requests/` | No match | Confirmed DISTINCT |
| `CR-2026-06-17-003-customer-menu-availability` | Item availability by time — different mechanism (`isItemAvailable`, time windows), not inventory | RELATED but distinct |
| Bug tracker (`/app/memory_repo/BUG_TRACKER_v2.md`) | No stock-out bug registered | Confirmed |

**Verdict: DISTINCT.** No duplicate. Extends menu item availability concept but via an entirely different data signal (`stock_out` from POS, not time-window logic).

---

## 4. Severity Assessment

| Factor | Assessment |
|--------|-----------|
| Customer impact today | HIGH — OOS items appear fully orderable; on placement the 422 lands in a generic catch block with no item-level feedback |
| Operational impact | HIGH — restaurants with inventory control enabled are receiving attempted orders for zero-stock items |
| Revenue / trust impact | MEDIUM — failed orders create confusion; no clear recovery path shown to customer |
| Technical debt | LOW — backend contract is clean (422, typed body); FE gap is purely missing implementation |
| **Final Severity** | **P1** |

---

## 5. Risk Assessment

| File / Area | Risk | Reason |
|-------------|------|--------|
| `ReviewOrder.jsx` | **CRITICAL** | Hotspot file per Part C. Catch block change — must not affect payment flow, Razorpay path, network-loss guard, 401 retry, or 716 hardcode |
| `CartContext.js` | **HIGH** | Hotspot file per Part C. Touching `addToCart()` — must not affect restaurant scoping, expiry, cross-tab sync, or edit-order state |
| `orderService.ts` | **HIGH** | Adjacent to interceptors layer (HIGH per Part C). 422 detection must not interfere with global 401 interceptor or other error paths |
| `MenuItems.jsx` | **MEDIUM** | Filter applied before render. Wrong filter = entire category hidden. Additive check only |
| `MenuItem.jsx` | **MEDIUM** | Component render state. Additive sold-out branch |
| `useMenuData.js` | **MEDIUM** | Data transform layer. New fields mapped — no existing fields changed |
| `CustomizeItemModal` | **MEDIUM** | Addon disable — UI-only change, local to modal |
| `order.types.ts` | **LOW** | TypeScript types only. No runtime impact |
| `restaurant-info` contract | **LOW** | `show_out_of_stock_items` confirmed live, root-level, string `"Yes"/"No"`. Read-only, no write |
| **Overall Risk** | **HIGH** | CRITICAL hotspot `ReviewOrder.jsx` + HIGH hotspot `CartContext.js` involved |

**No Fast Lane.** CRITICAL and HIGH hotspot files are in scope. Full gate flow mandatory per Part C.

---

## 6. Evidence (all verified by live probe 2026-09-07)

### Backend contracts — confirmed live

| Signal | Endpoint | Shape | Probe result |
|--------|----------|-------|--------------|
| `stock_out` on food item | `POST /web/restaurant-product` | `"Y"` / `"N"`, root of item object | ✅ LIVE — live `"N"` on 478 food items |
| `stock_out` on addon | `POST /web/restaurant-product` | `"Y"` / `"N"`, inside `add_ons[]` item | ✅ LIVE — live `"Y"` on 3 addons in 478 |
| `show_out_of_stock_items` | `POST /web/restaurant-info` | `"Yes"` / `"No"`, root level | ✅ LIVE — `"No"` for both 478 and 716 |
| Stock-out error on order place | `POST /customer/order/place` | HTTP 422, `{ error, out_of_stock_items[] }` | ✅ Confirmed by BE (reply 1 + 2) |
| Stock-out error on order update | `POST /customer/order/update-customer-order` | Same as above | ✅ Confirmed by BE (reply 2) |
| `type: "food"` in OOS item | above | `{ type, food_id, food_name, message }` | ✅ Confirmed |
| `type: "addon"` in OOS item | above | `{ type, food_id, food_name, addon_id, addon_name, message }` | ✅ Confirmed |

### Current FE state — confirmed by code grep

| Component | Current state |
|-----------|--------------|
| `useMenuData.js` item transform | `stock_out` field NOT mapped. `food_stock` (numeric) mapped separately |
| `useMenuData.js` addon transform | `stock_out` field NOT mapped |
| `MenuItem.jsx` ADD button | No `stock_out` check — `isAvailable` is time+status only |
| `MenuItems.jsx` item filter | No `stock_out` filter — all items rendered if category matched |
| `CartContext.js` `addToCart()` | No `stock_out` guard |
| `orderService.ts` `placeOrder` | Returns `response.data` — no 422 content parse |
| `orderService.ts` `updateCustomerOrder` | Returns `response.data` — same gap |
| `ReviewOrder.jsx` catch block | Reads `error.response?.data?.message` — no `out_of_stock_items` handling |
| `order.types.ts` `ApiPlaceOrderResponse` | No `error` or `out_of_stock_items` fields typed |

### No change needed in

| Component | Why |
|-----------|-----|
| `RestaurantConfigContext.jsx` | `show_out_of_stock_items` from POS `restaurant-info`, not local config — `isOn()` not used |
| `backend/server.py` | All inventory logic is in POS API (external). Local backend unchanged |
| `AuthContext.jsx` | No auth changes |
| `type=all` query param | NOT needed — `stock_out` returned on standard product call |
| Auth token for product call | NOT needed — product endpoint is public (probe confirmed) |

---

## 7. Blast Radius

### Files WILL change (8)

| File | Risk | Change type |
|------|------|-------------|
| `ReviewOrder.jsx` | **CRITICAL** | Add `out_of_stock_items` check in catch block → hard stop + item list display |
| `CartContext.js` | **HIGH** | Add `stock_out === 'Y'` guard in `addToCart()` |
| `orderService.ts` | **HIGH** | On 422 catch: parse `out_of_stock_items`, throw typed `StockOutError` for caller |
| `MenuItems.jsx` | **MEDIUM** | Add filter: hide item if `stock_out=Y` and `show_out_of_stock_items !== 'Yes'` |
| `MenuItem.jsx` | **MEDIUM** | Add "Sold Out" render branch when `stock_out=Y` and config=Yes |
| `useMenuData.js` | **MEDIUM** | Map `stock_out` on food items + on each addon in `add_ons[]` |
| `CustomizeItemModal` (or addon selector) | **MEDIUM** | Disable addon option when `addon.stock_out === 'Y'` |
| `order.types.ts` | **LOW** | Add `error?`, `out_of_stock_items?`, `StockOutFoodItem`, `StockOutAddonItem` types |

### Files WILL NOT change

| File | Why |
|------|-----|
| `AuthContext.jsx` | No auth changes |
| `RestaurantConfigContext.jsx` | Not the source of `show_out_of_stock_items` |
| `LandingPage.jsx` | Not in OOS flow |
| `backend/server.py` | POS API owns inventory — local backend unchanged |
| `OrderSuccess.jsx` | Hard stop prevents reaching this page on OOS |
| `App.js` | No provider or route changes |
| `endpoints.js` | No new endpoints |
| `itemAvailability.js` | Time-based availability — separate concern, untouched |
| `restaurantService.js` | `getRestaurantDetails` returns raw object — `show_out_of_stock_items` flows through already |

### Downstream consumers impacted

| Consumer | How |
|----------|-----|
| All restaurant customers | OOS items filtered from menu by default (invisible change — items already unavailable to order) |
| Restaurant 478 | Live addon OOS data (`"Y"`) confirmed — addon disable will be visible immediately |
| Restaurant 716 | Protected — `ReviewOrder.jsx` catch block change must not alter 716 hardcode path |
| Admin users | No admin-facing change (config toggle is in POS admin, not this app) |

---

## 8. Constraints and Hard Rules

1. **No Fast Lane** — `ReviewOrder.jsx` (CRITICAL) and `CartContext.js` (HIGH) are both in scope.
2. **ReviewOrder.jsx catch block scope** — change is ADDITIVE only. Must not touch: payment flow, Razorpay path, network-loss guard, 401 retry, 716 hardcoded logic, or table check logic.
3. **CartContext.js `addToCart` scope** — guard is ADDITIVE only. Must not affect: restaurant scoping, 3-hour expiry, cross-tab sync, edit-order mode, or `localStorage` key naming.
4. **`isOn()` default behaviour** — DO NOT use `isOn()` for `show_out_of_stock_items`. Read directly: `restaurant?.show_out_of_stock_items === 'Yes'` (explicit true-check, permissive default of false/hide).
5. **DO NOT reorder context providers in App.js.**
6. **`stock_out` is the single source of truth** — `is_inventory` field is NOT read by FE. If `is_inventory='No'`, backend sets `stock_out='N'` — FE trusts `stock_out` only.
7. **`food_id` casting** — `String(food_id)` always — field can be string or number from POS API.

---

## 9. Three-Layer Architecture (final owner-confirmed)

```
LAYER 1 — Menu Display
  product listing → stock_out on item / addon
  show_out_of_stock_items from restaurant-info
  OOS + config=No  → HIDE item entirely (filter before render)
  OOS + config=Yes → SHOW item, Sold Out state, ADD disabled

LAYER 2 — Add to Cart
  addToCart() in CartContext.js
  item.stock_out === 'Y' → block + toast "This item is currently unavailable"
  addon.stock_out === 'Y' → disable in CustomizeItemModal (item still orderable)

LAYER 3 — Place / Update Order (POS API 422)
  HTTP 422 → Axios throws → catch block in ReviewOrder.jsx
  error.response.data.out_of_stock_items → hard stop
  Show list: food_name / "addon_name (addon for food_name)"
  Do NOT navigate to OrderSuccess
  Applies identically to order/place and update-customer-order
```

---

## 10. Pre-Implementation Probe Results

| Probe | Command ran | Result |
|-------|-------------|--------|
| Q1 — `show_out_of_stock_items` live | `POST /web/restaurant-info {"restaurant_web":"478"}` | `"No"` ✅ |
| Q2 — Root level? | Same response key inspection | Root level confirmed ✅ |
| Q3 — Addon `stock_out` on std call | `POST /web/restaurant-product {"restaurant_id":"478","category_id":"0"}` | `"Y"` on 3 addons ✅ |
| Q4 — Food `stock_out` on std call | Same call, item level | `"N"` on all food items (none OOS right now) ✅ |
| Auth required for product call | No token in probe | Not required — public endpoint ✅ |

---

## 11. Intake Output

```
Intake complete: CR-2026-09-07-001
Classification: CR — Feature + Silent-failure gap fix
Severity: P1
Risk: HIGH (ReviewOrder.jsx CRITICAL, CartContext.js HIGH per Part C)
Duplicate check: DISTINCT — no prior CR or bug for stock-out/inventory
Evidence: INV-2026-09-07-001 (session), 3 rounds BE clarification,
          live curl probes on 478 and 716, code grep across 8 files
Blast radius: LARGE — 8 files, CRITICAL + HIGH hotspot files, all restaurants
              affected by default hide behaviour
Docs updated: /app/memory/change_requests/CR-2026-09-07-001-inventory-stock-out-control/INTAKE_DOC.md
Next: Planning (owner approval required before Implementation)
```
