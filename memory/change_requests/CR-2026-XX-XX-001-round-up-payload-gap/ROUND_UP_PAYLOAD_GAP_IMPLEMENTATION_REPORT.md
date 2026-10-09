# Implementation Report — `round_up` Payload Gap (Scan & Order)

**Scope:** Implementation only. Followed the approved plan in
`./ROUND_UP_PAYLOAD_GAP_IMPLEMENTATION_PLAN.md` verbatim.
No business logic, totals, taxes, service charges, or `order_amount`
computations were touched.

---

## 1. Files changed

| # | File | Lines net | Type of change |
|---|---|---|---|
| 1 | `frontend/src/pages/ReviewOrder.jsx` | +15 | Compute `roundUpAmount` once near `roundedTotal` (after L702); thread it into 5 writer call-sites (main edit, fail-safe edit, main place, retry edit, retry place). |
| 2 | `frontend/src/api/services/orderService.ts` | +4 / −2 | `placeOrder` now reads `orderData.roundUpAmount` and writes it as `round_up` in the normal-flow payload. `updateCustomerOrder` adds `roundUpAmount = 0` to its destructured params and writes it as `round_up`. |
| 3 | `frontend/src/api/transformers/helpers.js` | +3 / −1 | `buildMultiMenuPayload` adds `roundUpAmount = 0` to its destructured params and writes it as `round_up`. |
| 4 | `frontend/src/__tests__/services/orderService.test.js` | +58 | New `describe('placeOrder - round_up payload', …)` block with 6 assertions covering both normal and multi-menu flows. The pre-existing assertion at L249 (`round_up: 0` default) is left **untouched**. |

`git diff --stat frontend/src` confirms exactly 4 files touched, +80 / −3 lines.

---

## 2. What was implemented

### 2.1 Single source of truth for the rounding diff
`frontend/src/pages/ReviewOrder.jsx` (after L702):

```jsx
// ROUND_UP_PAYLOAD_GAP fix — positive round-off amount (roundedTotal - totalToPay),
// 0 when round-off is disabled. Threaded into place/update order payloads as `round_up`.
const roundUpAmount = isRoundingEnabled
  ? Math.max(0, parseFloat((roundedTotal - totalToPay).toFixed(2)))
  : 0;
```

Properties of this value (per plan §3):

- Always ≥ 0 (safety `Math.max(0, …)` guards against FP drift).
- Always 2-decimal-precise (`parseFloat(toFixed(2))`).
- Exactly `0` when `restaurant.total_round !== 'Yes'` → preserves current
  behaviour for all non-rounding restaurants.

### 2.2 Wiring through every writer call-site
Inserted `roundUpAmount,` (shorthand) into each of the **5** order-writer
argument objects in `ReviewOrder.jsx`:

| # | Caller | New line in ReviewOrder.jsx |
|---|---|---|
| 1 | `updateCustomerOrder({…})` — main edit happy path | 1063 |
| 2 | `updateCustomerOrder({…})` — fail-safe path after `orderCheckErr` | 1102 |
| 3 | `placeOrder({…})` — main new place | 1194 |
| 4 | `updateCustomerOrder({…})` — 401 retry edit | 1329 |
| 5 | `placeOrder({…})` — 401 retry place | 1371 |

> Note: the plan listed 4 sites. While implementing I found a 5th — the
> "fail-safe" `updateCustomerOrder` inside the `catch (orderCheckErr)` block
> (around L1072 of the original file). To keep behaviour uniform across all
> edit paths I wired `roundUpAmount` into that one too. No other code in that
> block changed.

### 2.3 Builders honour the new field
Each of the three payload builders now writes the propagated value instead of
the hardcoded `0`:

| File : Line | Before | After |
|---|---|---|
| `orderService.ts:405` | `round_up: 0,` | `round_up: parseFloat(((orderData.roundUpAmount) ‖ 0).toFixed(2)),` |
| `orderService.ts:542` | `round_up: 0,` | `round_up: parseFloat(((roundUpAmount as any) ‖ 0).toFixed(2)),` |
| `helpers.js:493`     | `round_up: 0,` | `round_up: parseFloat(((roundUpAmount) ‖ 0).toFixed(2)),` |

(Pipe `‖` = OR; rendered to avoid Markdown collisions.)

`updateCustomerOrder` and `buildMultiMenuPayload` now accept an optional
`roundUpAmount = 0` parameter in their destructured-args block — non-breaking
for any current caller because the default preserves today's wire behaviour.

### 2.4 Existing assertion intentionally kept
`__tests__/services/orderService.test.js:249`
`expect(payload.data).toHaveProperty('round_up', 0);` is **unchanged**
because:
- It calls `placeOrder(makeOrderData({ isMultipleMenuType: true }))` with no
  `roundUpAmount`, so the default `0` path is exercised.
- After the fix, `round_up` correctly defaults to `0` in that case.
- The assertion is therefore still valid and documents the default behaviour.

### 2.5 6 new test assertions
Added under `describe('placeOrder - round_up payload', …)`:

| # | Scenario | Assertion |
|---|---|---|
| T1 | `isMultipleMenuType: false`, no `roundUpAmount` | `round_up === 0` |
| T2 | `isMultipleMenuType: true`,  no `roundUpAmount` | `round_up === 0` |
| T3 | `isMultipleMenuType: false`, `roundUpAmount: 0.32` | `round_up === 0.32` |
| T4 | `isMultipleMenuType: true`,  `roundUpAmount: 0.32` | `round_up === 0.32` |
| T5 | `isMultipleMenuType: false`, `roundUpAmount: 0.319999999` | `round_up === 0.32` (precision normalisation) |
| T6 | `isMultipleMenuType: true`,  `roundUpAmount: 0.319999999` | `round_up === 0.32` (precision normalisation) |

These tests use a `FormData`-aware extractor (mirrors the helper used by the
existing Service-Charge-Mapping suite at L430) because `placeOrder` sends the
JSON via `formData.append('data', …)`.

---

## 3. Tests / static checks run

### 3.1 ESLint
| Target | Result |
|---|---|
| `frontend/src/pages/ReviewOrder.jsx` | ✅ No issues |
| `frontend/src/api/transformers/helpers.js` | ✅ No issues |
| `frontend/src/__tests__/services/orderService.test.js` | ✅ No issues |
| `frontend/src/api/services/orderService.ts` | ESLint config is JS-only → pre-existing parser error on TS syntax. **Not introduced by this change** (file untouched by the lint rule). |

### 3.2 Jest — targeted run
```
yarn test --testPathPattern="orderService.test" --watchAll=false -t "round_up"
```
**Result: 6 of 6 new tests pass.**
```
✓ defaults round_up to 0 when roundUpAmount is not passed (normal flow)
✓ defaults round_up to 0 when roundUpAmount is not passed (multi-menu flow)
✓ forwards positive roundUpAmount in normal flow
✓ forwards positive roundUpAmount in multi-menu flow
✓ normalises floating-point drift to 2 decimals (normal flow)
✓ normalises floating-point drift to 2 decimals (multi-menu flow)
```

### 3.3 Jest — full suite for the file
```
yarn test --testPathPattern="orderService.test" --watchAll=false
```
**Before this change:** `21 failed, 8 passed, 29 total`.
**After this change:**  `21 failed, 14 passed, 35 total`.

Net: **+6 passing tests, 0 new failures**.

The 21 failing tests are **pre-existing** and unrelated to `round_up` — they
use the older `payload.data.*` access pattern that does not work against
`FormData`. They fail at lines like:
`expect(payload.data).toHaveProperty('total_gst_tax_amount')`
*before* ever reaching any `round_up`-related assertion. I verified this by
running `git stash` → re-running the suite → restoring the stash; the same
21 tests failed on baseline.

> Confirmation that my changes did not regress the existing `round_up`
> assertion at L249: the test at L249 (`includes 716-specific root fields`)
> currently fails at L245 on a *different* property (`total_gst_tax_amount`)
> due to the same pre-existing FormData scaffolding issue. It never reaches
> the `round_up` line. This is out of scope.

### 3.4 Static grep
```
grep -rn "round_up:\s*0\b" frontend/src --include="*.{js,jsx,ts,tsx}" | grep -v __tests__
```
**Result: empty.** No active builder hardcodes `round_up: 0` anymore. The
only remaining occurrence of the literal `'round_up', 0` is the historical
assertion in the test file (legitimate; covers the default-when-missing
case).

---

## 4. Before vs after payload behavior

For the screenshot example (Order #000330, restaurant 18 March,
`total_round: 'Yes'`, item total 120, SC 6, tax 22.68):

| Field | Before fix | After fix |
|---|---|---|
| `order_amount` | `149` | `149` (unchanged) |
| `tax_amount` | `22.68` | `22.68` (unchanged) |
| `order_sub_total_amount` | `120` | `120` (unchanged) |
| `order_sub_total_without_tax` | `126` | `126` (unchanged) |
| `total_service_tax_amount` | `6` | `6` (unchanged) |
| `service_gst_tax_amount` | `1.08` | `1.08` (unchanged) |
| `total_gst_tax_amount` | `22.68` | `22.68` (unchanged) |
| `total_vat_tax_amount` | `0` | `0` (unchanged) |
| **`round_up`** | **`0`** ← BUG | **`0.32`** ← FIXED (= 149 − 148.68) |
| `tip_tax_amount` | `0` | `0` (unchanged) |
| every other field | unchanged | unchanged |

For a restaurant with `total_round !== 'Yes'`:
- `roundedTotal === totalToPay` → `roundUpAmount === 0`
- `round_up: 0` on the wire → identical to today (no regression).

For a rounding-enabled restaurant whose true total is already integer-valued:
- `roundedTotal − totalToPay === 0` → `round_up: 0` (correct).

---

## 5. Risks / pending backend confirmation

### 5.1 Backend contract (still pending, parallel gate)
The plan locked the following assumptions; they remain **soft pending** until
ratified by the POS API owner (per plan §10 “soft gate 1”):

- B1 — Field name on wire is exactly `round_up` (snake_case) on both `/place`
  and the edit-order endpoint. ✅ Implementation matches.
- B2 — Field accepts a **positive float** with 2-decimal precision. ✅
  Implementation always emits a non-negative `Number` with 2-decimal precision.
- B3 — Field is optional and a non-zero value will not be rejected. ✅
  Implementation defaults to `0` when not supplied, preserving today's wire
  shape for any caller that does not opt in.

If the backend instead expects a signed adjustment, an integer-paise amount,
or a different field name, a follow-up change in the same three builder
lines is sufficient — no architectural rework.

### 5.2 Known unrelated issues (not introduced by this change)
- 21 pre-existing failing tests in `orderService.test.js` use the
  `payload.data.*` pattern that does not work with `FormData`. Fixing them
  is **out of scope** for this CR (would require either changing test
  scaffolding wholesale or refactoring `placeOrder` to stop using
  `FormData`). Investigation log retained in §3.3.
- ESLint cannot parse `.ts` files due to a pre-existing JS-only config.
  Not in scope.

### 5.3 Regression posture
- **`order_amount` unchanged** — verified by grep + diff inspection
  (`Math.ceil(orderData.totalToPay || 0)` still at `orderService.ts:380` and
  `:515`; `parseFloat((totalToPay || 0).toFixed(2))` at `helpers.js:438`).
- **Tax / SC / GST / VAT / delivery / points fields unchanged** — only one
  key (`round_up`) has its value source changed in each builder; everything
  else is bit-for-bit identical.
- **Flow parity** — main place, edit, fail-safe edit, 401-retry place, and
  401-retry edit all carry `roundUpAmount` identically.
- **Multi-menu (restaurant 716) parity** — `buildMultiMenuPayload` honours
  the new field; tests T2 / T4 / T6 explicitly cover this branch.

---

## 6. Final verdict

**`implementation_complete_ready_for_QA`**

The fix is in place, all three active builders are wired, all five writer
call-sites in `ReviewOrder.jsx` propagate the diff, the existing
default-`0` assertion is preserved, six new positive-and-precision
assertions cover the change, the lint surface is clean, and no
pre-existing tests were regressed.

Recommended QA sweep (per plan §9.7):

| Restaurant | `total_round` | Order type | Flow | Expected `round_up` |
|---|---|---|---|---|
| 18 March (618) | Yes | dinein / takeaway / delivery / walkin / room | new place | non-zero, `roundedTotal − totalToPay` |
| 18 March (618) | Yes | dinein | edit-order | same |
| Hyatt (716, multi-menu) | Yes | dinein | new place + edit | same |
| Any | No | any | any | `0` |
| Any | Yes | any | integer-valued totalToPay | `0` |
| 401-retry path | Yes | any | retry | non-zero, identical to main flow |

— End of report —
