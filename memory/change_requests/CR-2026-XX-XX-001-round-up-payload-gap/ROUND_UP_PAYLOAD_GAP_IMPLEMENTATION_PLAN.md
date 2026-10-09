# Implementation Plan — `round_up` Payload Gap (Scan & Order)

**Scope:** Planning only. No code changes. No test changes. Code is the source of truth.

Prerequisite read: `./ROUND_UP_PAYLOAD_GAP_INVESTIGATION_REPORT.md` (this folder).

---

## 1. Planning summary

The investigation confirmed:

- Round-off direction is **always up** (`Math.ceil`) and is gated on
  `restaurant.total_round === 'Yes'` (read once via `useRestaurantDetails`).
- `roundedTotal` and `totalToPay` are both already computed and live in
  `ReviewOrder.jsx` (L697, L701). The **numeric difference** between them is
  never propagated to the network layer.
- All four writer call-sites in `ReviewOrder.jsx` (place + edit + 2 retries)
  pass `totalToPay: roundedTotal` but no rounding-diff field.
- All three payload builders (`placeOrder`, `updateCustomerOrder`,
  `buildMultiMenuPayload`) hardcode `round_up: 0`.
- One existing unit test asserts `round_up === 0` and must be kept consistent.

The fix is a **pure plumbing change**: compute one extra number in
`ReviewOrder.jsx`, thread it through 4 callers and 3 builder functions, and
replace 3 hardcoded zeros with that value. No tax, GST, service charge,
delivery, points, or total-calculation logic is touched.

---

## 2. Locked assumptions

These assumptions are derived from the existing code and are **frozen for
this plan**. Any change to them must trigger a re-plan.

| # | Assumption | Evidence |
|---|---|---|
| A1 | Round-off direction is always upward; `round_up` is the **positive** difference added by the ceiling step. | `ReviewOrder.jsx:701` `Math.ceil(totalToPay)`. Field name is literally `round_up`. |
| A2 | Round-off is enabled iff `restaurant.total_round === 'Yes'`. No other flag is consulted. | `ReviewOrder.jsx:700`. |
| A3 | When round-off is disabled, `roundedTotal === totalToPay` and `round_up` must be `0` (numeric zero, not absent). | Existing builders already send numeric `0`. |
| A4 | The current `order_amount` value in the payload is correct (`Math.ceil(roundedTotal)` = `roundedTotal` because callers already pass the rounded value). The fix must **not** change `order_amount`. | `orderService.ts:380`, `:515`; `helpers.js:438`. |
| A5 | The diff is at most 1.0 (because `Math.ceil` of any positive decimal). With 2-decimal precision it is always ≥ 0 and ≤ 0.99. | Direct consequence of `Math.ceil`. |
| A6 | The field name on the wire is exactly `round_up` (snake_case) for all three builders. | `orderService.ts:405,540`; `helpers.js:491`. |
| A7 | The receive-side transformers do not currently read `round_up`, so no UI display work is in scope. | `frontend/src/api/transformers/*` shows no read of `round_up`. |
| A8 | The unit test at `__tests__/services/orderService.test.js:249` is the **only** test that asserts `round_up`. | Investigation report §4.9. |

### Open items requiring backend-owner confirmation (non-blocking for planning, blocking for merge)

| # | Item | Default if no answer |
|---|---|---|
| B1 | Confirm the field name is `round_up` (snake_case) and accepted on both `/place` and the edit-order endpoint. | Keep as-is (`round_up`). |
| B2 | Confirm the field accepts a **positive float** with 2-decimal precision. | Send positive float with `.toFixed(2)`. |
| B3 | Confirm the field is optional (current `0` works) and that a non-zero value won't break any validation. | Treat as optional, default `0`. |

These are listed in the verdict (§10) and gate **merge**, not coding.

---

## 3. Proposed calculation contract

Single source of truth lives in `ReviewOrder.jsx`, immediately after the
existing `roundedTotal` / `hasRoundingDiff` block (L699–702).

```
roundUpAmount =
    isRoundingEnabled
        ? Math.max(0, parseFloat((roundedTotal - totalToPay).toFixed(2)))
        : 0
```

- `Math.max(0, …)` is a safety belt for the unreachable case where, due to
  pre-existing `parseFloat(...toFixed(2))` rounding, `roundedTotal - totalToPay`
  evaluates to a tiny negative number; `0` is the correct floor.
- `parseFloat(...toFixed(2))` standardises precision (consistent with the
  rest of the payload, which uses the same idiom everywhere).
- When `isRoundingEnabled` is false, value is exactly `0` — matches current
  on-wire behaviour for restaurants without round-off (no regression).
- When rounding is enabled but the true total is already integer-valued
  (e.g. `totalToPay = 150.00`), `roundedTotal - totalToPay = 0` → `round_up: 0`.
  Correct.

Worked example (screenshot): `roundedTotal = 149`, `totalToPay = 148.68` →
`round_up = 0.32`. ✓

---

## 4. Files to change

| # | File | Why |
|---|---|---|
| F1 | `frontend/src/pages/ReviewOrder.jsx` | Compute `roundUpAmount` once; pass it to 4 writer call-sites. |
| F2 | `frontend/src/api/services/orderService.ts` | Accept `roundUpAmount` in `placeOrder` and `updateCustomerOrder`; use it instead of the hardcoded `0`. |
| F3 | `frontend/src/api/transformers/helpers.js` | Accept `roundUpAmount` in `buildMultiMenuPayload`; use it instead of the hardcoded `0`. |
| F4 | `frontend/src/__tests__/services/orderService.test.js` | Update existing assertion + add coverage (see §7). |

No other files are touched. No types/models need new fields on the receive
side (per §A7).

---

## 5. Function / signature changes

### 5.1 `ReviewOrder.jsx`

- Add **one local variable** near L702: `roundUpAmount` (see §3).
- Add **one new key** `roundUpAmount` to the argument objects passed to:
  - `placeOrder(...)` — main flow, around L1152–1184.
  - `updateCustomerOrder(...)` — main flow, around L1030–1057.
  - `placeOrder(...)` — 401 retry, around L1327–1357.
  - `updateCustomerOrder(...)` — 401 retry, around L1290–1317.

No other locals or function signatures in `ReviewOrder.jsx` change.

### 5.2 `orderService.ts`

- `placeOrder(orderData: any)` — destructure or read `orderData.roundUpAmount`
  (default `0`) at the top of the function. Use it at:
  - the multi-menu branch (forward to `buildMultiMenuPayload`), and
  - the normal-flow payload literal that currently hardcodes
    `round_up: 0` at **L405**.
- `updateCustomerOrder({...})` — add `roundUpAmount = 0` to the
  parameter-destructure block (around L453–481). Use it to replace the
  hardcoded `round_up: 0` at **L540**.

### 5.3 `helpers.js`

- `buildMultiMenuPayload(orderData, gstEnabled = true)` — add `roundUpAmount`
  to the destructure block at L391–413 (default `0`). Use it to replace the
  hardcoded `round_up: 0` at **L491**.

### 5.4 Public surface impact

All three signatures take an `orderData`-style object, so adding an optional
key with a default of `0` is **non-breaking** for any current caller. No
TypeScript type definitions need to be expanded because `orderData` is typed
as `any` in `orderService.ts` and `helpers.js` is plain JS.

---

## 6. Payload changes

For each of the three builders, exactly **one** key changes its value source.

### 6.1 `orderService.ts:405` (placeOrder, normal flow)

Before (literal):
```
round_up: 0,
```

After (planned):
```
round_up: parseFloat(((orderData.roundUpAmount) || 0).toFixed(2)),
```

### 6.2 `orderService.ts:540` (updateCustomerOrder)

Before:
```
round_up: 0,
```

After:
```
round_up: parseFloat(((roundUpAmount) || 0).toFixed(2)),
```
(`roundUpAmount` comes from the destructured parameters, default `0`.)

### 6.3 `helpers.js:491` (buildMultiMenuPayload)

Before:
```
round_up: 0,
```

After:
```
round_up: parseFloat(((roundUpAmount) || 0).toFixed(2)),
```

All other fields — `order_amount`, `tax_amount`, `total_gst_tax_amount`,
`total_vat_tax_amount`, `order_sub_total_amount`, `order_sub_total_without_tax`,
`total_service_tax_amount`, `service_gst_tax_amount`, `tip_tax_amount`,
`discount_amount`, etc. — **remain bit-for-bit identical** to today.

---

## 7. Test update plan

### 7.1 Existing test to update

`frontend/src/__tests__/services/orderService.test.js:249`

Current assertion:
```
expect(payload.data).toHaveProperty('round_up', 0);
```

This test calls `placeOrder(makeOrderData({ isMultipleMenuType: true }))`
without passing a `roundUpAmount`. After the fix, with no `roundUpAmount`
supplied, the default `0` flows through both `placeOrder` and
`buildMultiMenuPayload`, so the payload still has `round_up: 0` — **this
assertion remains valid as-is** and no edit is required.

However, the planning agent recommends **strengthening** this test by
making the intent explicit. (Test update is OUT of scope for this plan but
recommended for the implementation phase per the task spec, which allows
test updates as part of the fix delivery.) Concretely, two improvements:

1. Rename/clarify: "round_up defaults to 0 when no roundUpAmount is passed".
2. Add a sibling test that explicitly asserts `round_up: 0` when
   `roundUpAmount` is omitted (covers backward compatibility).

### 7.2 New tests to add

| # | Suite | Scenario | Assertion |
|---|---|---|---|
| T1 | `placeOrder - 716-specific root fields` (or a new "rounding" describe block) | call `placeOrder({ ..., roundUpAmount: 0.32, isMultipleMenuType: true })` | `payload.data.round_up === 0.32` |
| T2 | same | call `placeOrder({ ..., roundUpAmount: 0.32, isMultipleMenuType: false })` (normal flow) | `payload.data.round_up === 0.32` |
| T3 | same | call `placeOrder({ ..., roundUpAmount: 0, isMultipleMenuType: false })` | `payload.data.round_up === 0` |
| T4 | new describe block for `updateCustomerOrder` (if not already present) | call `updateCustomerOrder({ ..., roundUpAmount: 0.32 })` | `payload.data.round_up === 0.32` |
| T5 | precision check | call with `roundUpAmount: 0.319999999` | `payload.data.round_up === 0.32` (verifies the `parseFloat(toFixed(2))` guard) |
| T6 | safety belt | call with `roundUpAmount: -0.001` (defensive) | `payload.data.round_up >= 0` (cannot be negative) |

Tests T1–T3 are the **minimum** set; T4–T6 are recommended for full coverage.
None of the new tests duplicate or weaken existing assertions.

---

## 8. Regression risk checklist

| # | Risk | Mitigation in plan |
|---|---|---|
| R1 | `order_amount` accidentally changes (e.g. someone replaces it with `roundedTotal + roundUp`). | Plan explicitly **does not** touch `order_amount`; it is already correct (= `Math.ceil(totalToPay)` = `roundedTotal`). Spot-check during code review. |
| R2 | GST / VAT / service-charge totals change. | None of those fields are touched. Existing per-item allocator (`allocateServiceChargePerItem`) and tax math in `ReviewOrder.jsx` are not modified. |
| R3 | Floating-point drift causes `round_up` of `0.3199999998` or `0.32000000001`. | `parseFloat((…).toFixed(2))` (the same idiom already used everywhere in these builders) normalises to 2 decimals. |
| R4 | Negative `round_up` due to FP drift in subtraction. | `Math.max(0, …)` guard in `ReviewOrder.jsx`. |
| R5 | Multi-menu (716) flow diverges from normal flow. | Same three-line change applied to all three builders; T1 + T2 unit tests cover both branches. |
| R6 | Edit-order (`updateCustomerOrder`) misses the wiring. | Plan lists L1030 and L1290 explicitly; T4 covers the writer. |
| R7 | 401-retry sites miss the wiring. | Plan lists L1290 and L1327 explicitly. |
| R8 | Restaurants with `total_round !== 'Yes'` accidentally start sending a non-zero `round_up`. | `roundUpAmount = isRoundingEnabled ? … : 0` keeps current behaviour intact. |
| R9 | Restaurants with `total_round` field missing/undefined. | `restaurant?.total_round === 'Yes'` already returns `false` for undefined — current behaviour preserved. |
| R10 | Delivery / takeaway / dinein / walk-in / room payload differences. | All order types flow through the same three builders. Same fix applies uniformly. Regression matrix in §9.7 covers each. |
| R11 | Coupons / points-redemption flow alters totals after `roundedTotal` is computed. | `roundedTotal` is computed **after** `subtotalAfterDiscount` (which already accounts for points/coupons). `roundUpAmount` is derived from `roundedTotal − totalToPay`, so it stays correct. |
| R12 | Razorpay charged amount drifts from `order_amount`. | Razorpay charge uses `order_amount` directly, which is unchanged. `round_up` is metadata only. |
| R13 | Backend rejects non-zero `round_up`. | Open item B3. Mitigation: confirm with backend owner before merge; rollback is trivial (revert to `0`). |
| R14 | Test suite breakage from existing assertion. | The existing assertion remains valid because no caller in tests passes `roundUpAmount`. |
| R15 | Type checking on `orderData: any`. | Both `orderService.ts` and `helpers.js` type the input as `any`; adding an optional field is non-breaking. |

---

## 9. Step-by-step implementation plan

### Step 1 — Backend confirmation (parallel, blocks merge only)
Owner: API lead. Confirm B1 / B2 / B3 from §2. If any answer differs, return
to planning.

### Step 2 — Compute `roundUpAmount` in `ReviewOrder.jsx`
Add a single line right after L702 (after `hasRoundingDiff`):
```
const roundUpAmount = isRoundingEnabled
  ? Math.max(0, parseFloat((roundedTotal - totalToPay).toFixed(2)))
  : 0;
```

### Step 3 — Thread it through the 4 writer call-sites in `ReviewOrder.jsx`
Add `roundUpAmount` to each argument object:

| Call-site | Approx. line |
|---|---|
| `updateCustomerOrder(...)` — main edit flow | 1030–1057 |
| `placeOrder(...)` — main place flow | 1152–1184 |
| `updateCustomerOrder(...)` — 401 retry | 1290–1317 |
| `placeOrder(...)` — 401 retry | 1327–1357 |

### Step 4 — Accept it in `placeOrder` (`orderService.ts`)
- At the top of the function (after `gstEnabled` / `isMultiMenu` reads),
  read `orderData.roundUpAmount` (default `0`).
- Pass it to `buildMultiMenuPayload` for the multi-menu branch.
- Replace the literal at L405 (`round_up: 0,`) with
  `round_up: parseFloat(((orderData.roundUpAmount) || 0).toFixed(2)),`.

### Step 5 — Accept it in `updateCustomerOrder` (`orderService.ts`)
- Add `roundUpAmount = 0` to the parameter destructure (L453–481).
- Replace the literal at L540 with
  `round_up: parseFloat(((roundUpAmount) || 0).toFixed(2)),`.

### Step 6 — Accept it in `buildMultiMenuPayload` (`helpers.js`)
- Add `roundUpAmount` to the destructure at L391–413 (with default `0`).
- Replace the literal at L491 with
  `round_up: parseFloat(((roundUpAmount) || 0).toFixed(2)),`.

### Step 7 — Update / add tests
- Keep the existing assertion at `orderService.test.js:249` (still valid).
- Add tests T1–T6 from §7.2.

### Step 8 — Regression sweep (manual + jest)
Cover the matrix in §9.7. Network-tab verification of `round_up` per scenario.

### 9.7 Regression matrix

| Restaurant | `total_round` | Order type | Flow | Expected `round_up` |
|---|---|---|---|---|
| 18 March (618) | Yes | dinein | new place | `roundedTotal − totalToPay` (e.g. 0.32) |
| 18 March (618) | Yes | dinein | edit | same |
| 18 March (618) | Yes | takeaway | new place | same |
| 18 March (618) | Yes | delivery | new place | same |
| 18 March (618) | Yes | walkin | new place | same |
| 18 March (618) | Yes | dineinroom | new place | same |
| Hyatt (716, multi-menu) | Yes | dinein | new place (multi-menu) | same |
| Hyatt (716, multi-menu) | Yes | dinein | edit | same |
| Any | No | any | any | `0` |
| Any | Yes | any | integer-valued totalToPay | `0` |
| 401-retry path | Yes | any | retry | non-zero, identical to main flow |

### Step 9 — Sign-off
Update `BUG_TRACKER.md` (in `memory/`), record actual vs expected `round_up`
from the regression matrix, and request POS team to verify `round_up` is
reflected correctly in the resulting POS order record.

---

## 10. Final verdict

**`ready_for_implementation`** with two soft gates:

- **Soft gate 1 (parallel):** confirm backend contract items B1–B3 in §2 with
  the POS API owner. The plan’s default (positive float, snake_case
  `round_up`, optional) is the safest interpretation but must be ratified
  before merge.
- **Soft gate 2 (review):** code reviewer verifies that `order_amount`,
  tax fields, service-charge fields, and delivery fields are **unchanged**
  on the wire, and that the only diff is the value of `round_up` on the
  three builders.

The plan is mechanical (4 caller edits + 3 builder edits + 1 new local in
`ReviewOrder.jsx`), touches no business logic, and is fully covered by
existing + 6 proposed unit tests. No clarification from the user is required
to begin implementation.

— End of plan —
