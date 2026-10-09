# Investigation Report — `round_up` Payload Gap (Scan & Order)

**Scope:** Investigation only. No code changes. Code is the source of truth.

---

## 1. Issue summary (plain English)

When a restaurant has total-round-off enabled in its profile (POS API restaurant
config), the Scan & Order frontend correctly:
1. Computes the actual grand total from items + service charge + taxes,
2. Rounds it **up** to the next integer (`Math.ceil`) for display, and
3. Sends that **rounded** value as `order_amount` in the place-order payload.

However, the **difference between the rounded and the actual total** (the
"round-off amount") is **never captured into the `round_up` key of the payload**.
That key is **hardcoded to `0`** at every payload-building call-site, so the
backend never receives the rounding adjustment. As a result, the POS / order
record cannot reconcile the rounded total back to the true line-item totals,
and any downstream report that expects `round_up` to balance the bill will
see zero.

---

## 2. Affected restaurant / example

- Restaurant: **18 March** (subdomain `18march.mygenie.online`)
- Numeric POS `restaurant_id` seen in the captured payload: **`618`**
  (the user’s problem statement mentions internal id `478`; the captured
  network payload from the order-success screen shows `restaurant_id: "618"`.
  This mismatch is informational only — the bug is restaurant-agnostic and
  triggers whenever `restaurant.total_round === 'Yes'`.)
- Reproduction from screenshot (Order #000330, dinein):

  | Field (UI / Bill Summary)        | Value      |
  |----------------------------------|------------|
  | Item Total                       | ₹120.00    |
  | Service Charge (Optional)        | ₹6.00      |
  | Subtotal                         | ₹126.00    |
  | CGST 9% (item)                   | ₹10.80     |
  | SGST 9% (item)                   | ₹10.80     |
  | CGST on SC 9%                    | ₹0.54      |
  | SGST on SC 9%                    | ₹0.54      |
  | Total tax (payload `tax_amount`) | ₹22.68     |
  | True grand total (computed)      | **₹148.68** |
  | Displayed Grand Total            | **₹149.00** |
  | Payload `order_amount`           | **149**    |
  | Payload `round_up`               | **0** ← bug |
  | Expected payload `round_up`      | **0.32** (= 149 − 148.68) |

---

## 3. Current calculation flow

All calculation happens in `/app/frontend/src/pages/ReviewOrder.jsx`.
Restaurant config is fetched and the rounding flag is read here:

| # | File : Lines | Code | Note |
|---|---|---|---|
| 3.1 | `frontend/src/pages/ReviewOrder.jsx` L80 | `const { restaurantId } = useRestaurantId();` | Restaurant id derived from URL / env. |
| 3.2 | `frontend/src/pages/ReviewOrder.jsx` L107–108 | `const { restaurant } = useRestaurantDetails(restaurantId);` | Pulls full restaurant profile via React Query. |
| 3.3 | `frontend/src/hooks/useMenuData.js` L323–337 | `useRestaurantDetails(identifier)` → `getRestaurantDetails(identifier)` | React Query hook. |
| 3.4 | `frontend/src/api/services/restaurantService.js` L14–24 | `POST` to `ENDPOINTS.RESTAURANT_DETAILS()` with `{ restaurant_web: restaurantId }` | Returns the restaurant object (the source of the `total_round` flag). |
| 3.5 | `frontend/src/api/config/endpoints.js` L22 | `RESTAURANT_DETAILS: () => \`${API_BASE_URL}/web/restaurant-info\`` | External POS API endpoint (`preprod.mygenie.online/api/v1/web/restaurant-info`). |

Totalling, in `ReviewOrder.jsx`:

| # | Lines | Variable | Formula / Note |
|---|---|---|---|
| 3.6 | L686–692 | `finalCgst`, `finalSgst`, `finalVat`, `finalTotalTax` | Tax aggregation including SC-GST and delivery-GST. |
| 3.7 | L694 | `finalSubtotal` | `subtotalAfterDiscount + serviceCharge + effectiveDeliveryCharge` |
| 3.8 | L697 | `totalToPay` | `parseFloat((finalSubtotal + finalTotalTax).toFixed(2))` — the **true** grand total before any rounding. |
| 3.9 | L699–702 | `isRoundingEnabled`, `roundedTotal`, `hasRoundingDiff` | <code>const isRoundingEnabled = restaurant?.total_round === 'Yes';</code><br><code>const roundedTotal = isRoundingEnabled ? Math.ceil(totalToPay) : totalToPay;</code><br><code>const hasRoundingDiff = isRoundingEnabled && roundedTotal !== totalToPay;</code> |
| 3.10 | L1762–1769 | Grand Total UI | Renders `roundedTotal.toFixed(2)`; if `hasRoundingDiff`, shows the pre-round value in parens. |

**Key observation:** the rounding *difference* itself (`roundedTotal − totalToPay`)
is never stored or passed downstream. Only the boolean `hasRoundingDiff` and
the original `totalToPay` are kept, purely for UI.

---

## 4. Current payload flow

`ReviewOrder.jsx` invokes one of three writer functions, and each one calls a
payload builder that hardcodes `round_up: 0`.

| # | Caller in `ReviewOrder.jsx` | Lines | Writer | Payload builder |
|---|---|---|---|---|
| 4.1 | Main place (non-edit) | 1152–1184 | `placeOrder({ … totalToPay: roundedTotal, … })` | `frontend/src/api/services/orderService.ts` L310–447 |
| 4.2 | Main update (edit mode) | 1030–1057 | `updateCustomerOrder({ … totalToPay: roundedTotal, … })` | `frontend/src/api/services/orderService.ts` L453–584 |
| 4.3 | 401-retry place | 1327–1357 | same `placeOrder` | same as 4.1 |
| 4.4 | 401-retry update | 1290–1317 | same `updateCustomerOrder` | same as 4.2 |
| 4.5 | Multi-menu branch inside `placeOrder` | `orderService.ts` L318–340 → `buildMultiMenuPayload(orderData, gstEnabled)` | `frontend/src/api/transformers/helpers.js` L391–495 |

**Every call site passes `totalToPay: roundedTotal` but does NOT pass any
`roundUp` / `roundOffDiff` / `roundingAdjustment` parameter.**

The three payload builders all hardcode `round_up: 0`:

| # | File : Line | Code |
|---|---|---|
| 4.6 | `frontend/src/api/services/orderService.ts:405` | `round_up: 0,` (inside `placeOrder` normal-flow payload) |
| 4.7 | `frontend/src/api/services/orderService.ts:540` | `round_up: 0,` (inside `updateCustomerOrder` payload) |
| 4.8 | `frontend/src/api/transformers/helpers.js:491` | `round_up: 0,` (inside `buildMultiMenuPayload`) |

`order_amount` is **independently** set to `Math.ceil(totalToPay || 0)` at
`orderService.ts:380` (placeOrder) and `:515` (updateCustomerOrder). For the
multi-menu branch, `helpers.js:438` uses `parseFloat((totalToPay || 0).toFixed(2))`
— but since the caller already passes the **already-rounded** `roundedTotal`,
the result is the same ceiling integer.

A test currently codifies the buggy contract:

| # | File : Line | Code |
|---|---|---|
| 4.9 | `frontend/src/__tests__/services/orderService.test.js:249` | `expect(payload.data).toHaveProperty('round_up', 0);` |

This test will need to be updated when the fix is implemented.

---

## 5. Root cause

Three independent but related defects compound into the observed gap:

1. **No propagation of the rounding diff out of `ReviewOrder.jsx`.**
   `roundedTotal − totalToPay` is computed (implicitly via `hasRoundingDiff`)
   but the numeric value is never added to the `placeOrder` /
   `updateCustomerOrder` argument objects (lines 1030–1057, 1152–1184,
   1290–1317, 1327–1357).

2. **No `roundUp` / `roundOffDiff` parameter accepted by the writer functions.**
   `placeOrder` (`orderService.ts:310`) and `updateCustomerOrder`
   (`orderService.ts:453`) destructure many fields from `orderData` /
   parameters but neither defines, accepts, nor forwards a rounding-diff field.

3. **`round_up` is hardcoded `0` in every payload builder.**
   - `orderService.ts:405` (placeOrder normal flow)
   - `orderService.ts:540` (updateCustomerOrder)
   - `helpers.js:491` (`buildMultiMenuPayload`, used by 716 + any other
     multi-menu restaurants)

   Even if a caller wanted to send the diff, the builders ignore any such input.

Net effect: the backend `place` and `update-order` endpoints always receive
`round_up: 0`, regardless of whether rounding actually occurred and regardless
of how large the diff is.

---

## 6. Expected backend payload contract for `round_up` (best inference)

> ⚠️ The backend source code is **not in this repository** — `MYGENIE_API_URL`
> points to the external POS API at `https://preprod.mygenie.online/api/v1`.
> The receive-side transformers in `/app/frontend/src/api/transformers/` do
> **not** read or surface a `round_up` field, so we cannot derive the contract
> from response handling either. The points below are the **best inference
> from existing code and field naming**; final confirmation should come from
> the POS backend team / API contract document before implementing the fix.

Based on the field name (`round_up`), the local rounding direction
(`Math.ceil`, which always rounds **up**), and the structure of the bill
fields the backend already accepts, the most likely contract is:

- **Type:** `number` (float, 2 decimal places).
- **Sign / direction:** **Positive** value = the amount **added** by rounding the
  true total upward to reach `order_amount`.
- **Formula:** `round_up = parseFloat((roundedTotal − totalToPay).toFixed(2))`
  i.e. `parseFloat((order_amount − (finalSubtotal + finalTotalTax)).toFixed(2))`.
- **When rounding is disabled** (`restaurant.total_round !== 'Yes'`)
  or when there is no fractional difference: `round_up = 0`.
- **Worked example (from screenshot):** `149 − 148.68 = 0.32` → `round_up: 0.32`.

If the backend instead expects a signed adjustment (e.g. could be negative
when rounding down) or an absolute value, this contract needs to be confirmed
with the API owner. Since the frontend only ever uses `Math.ceil` today,
the diff is **always ≥ 0**, so positive-magnitude is a safe interpretation
for the present scope.

A related local type already anticipates this concept on the receive side:
`frontend/src/types/models/order.types.ts:143` defines
`roundingAdjustment?: number` on `BillSummary` — currently unused on the
network boundary.

---

## 7. Affected flows

The same three payload builders are used by **every** Scan & Order writer path.
Because rounding is gated on `restaurant.total_round === 'Yes'` (a restaurant-
level flag) and not on order type, all order types are affected wherever
rounding is enabled:

| Flow | Order type(s) | Path through code | Impacted? |
|---|---|---|---|
| Scan & Order new place — single menu | `dinein`, `takeaway`, `walkin`, `delivery`, room orders | `ReviewOrder` → `placeOrder` → `orderService.ts:405` | YES |
| Scan & Order new place — multi-menu (e.g. 716) | any | `ReviewOrder` → `placeOrder` → `buildMultiMenuPayload` → `helpers.js:491` | YES |
| Edit existing order (re-submit) | any | `ReviewOrder` → `updateCustomerOrder` → `orderService.ts:540` | YES |
| 401-retry of new place / edit | any | same writers as above | YES |
| Restaurants with `total_round !== 'Yes'` | any | `roundedTotal === totalToPay`, diff is 0 | Not affected (already correct, since 0 ≡ 0). |

There is no separate delivery / takeaway / dine-in payload builder — they all
share these three functions, so all are equally affected.

---

## 8. Recommended implementation plan (no code written — outline only)

> The investigation is read-only. The plan below is provided for the next
> planning session; it must **not** be implemented as part of this report.

Step 1 — **Confirm the backend contract** with the POS API owner:
   exact field name (`round_up`), sign, type (float vs integer paise),
   precision, and whether the field is mandatory or optional. Also confirm
   that the field is honored by both `/place` and the edit-order endpoint
   used by `updateCustomerOrder`.

Step 2 — **Compute the diff once, in `ReviewOrder.jsx`** (single source of
   truth, next to where `roundedTotal` is calculated, around L699–702):
   `const roundUpAmount = parseFloat((roundedTotal − totalToPay).toFixed(2));`
   (zero when rounding disabled).

Step 3 — **Plumb `roundUpAmount` through every writer call**:
   - 4 call sites in `ReviewOrder.jsx`: L1030, L1152, L1290, L1327.
   - Add a `roundUpAmount` parameter to `placeOrder` and `updateCustomerOrder`
     argument objects.

Step 4 — **Replace the three hardcoded `0`s** with the propagated value:
   - `orderService.ts:405` (placeOrder)
   - `orderService.ts:540` (updateCustomerOrder)
   - `helpers.js:491` (`buildMultiMenuPayload` — accept it from `orderData`)

Step 5 — **Update the unit test** at
   `frontend/src/__tests__/services/orderService.test.js:249`:
   change the assertion to reflect the new behavior (either pass a non-zero
   `roundUpAmount` and assert it round-trips, or keep `0` only when rounding
   is disabled and add a new test for the rounded case).

Step 6 — **Regression sweep**: place-order (dinein, takeaway, delivery,
   walkin, room), edit-order, multi-menu (716), and rounding-disabled
   restaurants, all with and without service charge / delivery / points.

---

## 9. Risks / unknowns

| # | Risk / unknown | Why it matters |
|---|---|---|
| 9.1 | **Backend contract not visible in this repo.** | We can confirm the field is being sent and is hardcoded to `0`, but we cannot prove from code alone whether the backend wants a positive, signed, or absolute value, or whether the field is used in any settlement / accounting flow. |
| 9.2 | **A test currently asserts `round_up === 0`** (`orderService.test.js:249`). | Naïvely changing only the source files will break the test suite. The fix plan must include a test update. |
| 9.3 | **Multiple call-sites** in `ReviewOrder.jsx` (4 writer invocations) — easy to miss one. | A partial fix would still ship `0` on the 401-retry paths. |
| 9.4 | **`order_amount` is independently `Math.ceil`-ed** inside the writers (`orderService.ts:380, 515`). | Even after fix, callers must still pass the **rounded** total as `totalToPay` so the recomputed `Math.ceil(totalToPay)` doesn't drift. Today this is already the case (callers pass `roundedTotal`). |
| 9.5 | **Multi-menu (716) parity.** | The fix must also be applied in `helpers.js:491` so multi-menu restaurants stay aligned with the normal contract. |
| 9.6 | **`restaurant_id` mismatch in the user’s report** (478 vs 618 in payload). | This is observational only and does not affect the rounding bug, but the planning step should confirm which id is the canonical POS id for "18 March" before any restaurant-scoped regression. |
| 9.7 | **No receive-side handling.** | Order-detail receive transformers do not currently read `round_up`, so reverting to `0` after a write would be invisible on the UI but visible in any backend report. |

---

## 10. Final verdict

**`ready_for_planning`**

The current behaviour, the gap, and the three exact payload-builder lines
that hardcode `round_up: 0` are fully identified, along with all four caller
sites in `ReviewOrder.jsx` and the in-place unit test that codifies the bug.
The one remaining external dependency — final confirmation of the backend
contract (sign / precision) — should be resolved at the start of the planning
session, but it does not block planning itself: the most likely contract is
unambiguous from the field name and the local `Math.ceil` rounding direction
(positive float = amount added by rounding up).

— End of report —
