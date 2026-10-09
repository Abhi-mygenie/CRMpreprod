# INVESTIGATION REPORT — BUG-2026-09-08-001

## Item Identity

| Field | Value |
|-------|-------|
| **Bug ID** | BUG-2026-09-08-001 |
| **Title** | `response is not defined` crash in `handlePlaceOrder` when POS returns HTTP 422 |
| **Date** | 2026-09-08 |
| **Reported By** | Owner (screenshot: `/69/review-order`, 5:24 PM) |
| **Investigation Role** | INVESTIGATION |
| **Status** | ROOT CAUSE CONFIRMED |

---

## 1. Symptoms (from owner evidence)

| # | Observation |
|---|-------------|
| S-1 | URL: `react-app-preview-12.preview.emergentagent.com/69/review-order` (restaurant 69) |
| S-2 | Network tab: `POST /place` → **HTTP 422** received successfully |
| S-3 | React error overlay: **"Uncaught runtime error: `response is not defined`"** |
| S-4 | Stack trace points to `handlePlaceOrder` in `bundle.js:35408:63` |
| S-5 | Stock-out toast message (intended behaviour) **never shown** |

---

## 2. Hypotheses Formed

| # | Hypothesis | Test |
|---|-----------|------|
| H-1 | `response` variable is declared inside `try {}`, not accessible in `catch {}` (JS block-scope) | Read `ReviewOrder.jsx` around `let response` declaration |
| H-2 | `orderService.ts` 422 detection fails, error not typed correctly as `isStockOut` | Read `orderService.ts` catch block |
| H-3 | New BE response shape fields (`available_qty`, `addon_name`, etc.) cause a parse error | Compare `out_of_stock_items` shape vs code |

---

## 3. Investigation Steps

### Step 1 — Read `orderService.ts` 422 detection (H-2)

**File:** `frontend/src/api/services/orderService.ts`, lines 447–461

```typescript
} catch (error: any) {
  if (
    error?.response?.status === 422 &&
    Array.isArray(error?.response?.data?.out_of_stock_items) &&
    error.response.data.out_of_stock_items.length > 0
  ) {
    const stockOutError: any = new Error('STOCK_OUT');
    stockOutError.isStockOut = true;
    stockOutError.out_of_stock_items = error.response.data.out_of_stock_items;
    throw stockOutError;
  }
  throw error;
}
```

**Result:** H-2 **ELIMINATED**. The 422 detection is correct. The `stockOutError` with `isStockOut: true` and `out_of_stock_items` array IS correctly thrown. This error propagates to `ReviewOrder.jsx` catch block.

---

### Step 2 — Find `let response` declaration in `ReviewOrder.jsx` (H-1)

**File:** `frontend/src/pages/ReviewOrder.jsx`

```
Line 1144:   setIsPlacingOrder(true);
Line 1145:   try {                          ← try block OPENS here
Line 1146:     const finalTableId = ...
...
Line 1159:     let response;               ← DECLARED INSIDE try {}
...
Line 1360:     response = await placeOrder(...)   ← assigned
Line 1394:   }
```

**File:** `frontend/src/pages/ReviewOrder.jsx`, catch block:

```
Line 1454:   } catch (error) {              ← catch block starts
Line 1457:     const isTransportError = ...
Line 1463:     const isTrueNetworkLoss =
Line 1464:       orderDispatchedRef.current &&
Line 1465:       !response &&               ← ❌ ReferenceError HERE
Line 1466:       !error?.response &&
Line 1467:       isTransportError;
```

**Result:** H-1 **CONFIRMED**.

`let response` is a `let` declaration (block-scoped). It was placed at line 1159, which is inside the `try {}` block that opens at line 1145. In JavaScript, `let` declarations are block-scoped — they are NOT accessible outside their enclosing `{}` block. The `catch {}` block is a separate block from `try {}`, so `response` does not exist in the `catch` scope.

When the 422 stock-out error is thrown and caught, execution reaches line 1465 (`!response`). JavaScript throws:

```
ReferenceError: response is not defined
```

This ReferenceError:
1. Crashes the entire catch handler
2. Prevents the `error.isStockOut` branch (line 1616) from ever running
3. The finally block at line 1660 still runs (`isPlacingOrderRef.current = false`)
4. React's error boundary catches the uncaught ReferenceError and shows the overlay

---

### Step 3 — Check BE response shape vs current code (H-3)

**Actual BE 422 shape (from `stock_out_web_reply8.md`):**
```json
{
  "error": "Insufficient stock for Finger Tip Stock (available: 10, required: 22)",
  "out_of_stock_items": [
    {
      "food_id": "224396",
      "food_name": "nails",
      "addon_id": 13252,
      "addon_name": "with fingertips",
      "type": "addon",
      "message": "Insufficient stock for...",
      "ingredient_name": "Finger Tip Stock",
      "available_qty": 10,
      "requested_qty": 22
    }
  ]
}
```

**Code that handles it (lines 1620–1631):**
```javascript
const items = error.out_of_stock_items || [];
const parts = items.map((i) =>
  i.type === 'addon'
    ? `${i.addon_name} (addon for ${i.food_name})`
    : i.food_name
);
```

**Result:** H-3 **ELIMINATED**. The code at lines 1620–1631 already handles the new fields (`type`, `addon_name`, `food_name`) correctly. The toast message logic would produce correct output **IF it were ever reached**.

The `available_qty` and `requested_qty` fields are not currently used (no cart clamping). This is an enhancement opportunity, not a crash cause.

---

## 4. Root Cause

| Field | Value |
|-------|-------|
| **Classification** | CODE_ERROR |
| **Root cause** | `let response` declared inside `try {}` block (line 1159), not accessible in `catch {}` block. The `!response` check at line 1465 throws `ReferenceError: response is not defined`, crashing the catch handler before the stock-out branch runs. |
| **File** | `frontend/src/pages/ReviewOrder.jsx` |
| **Scope** | Line 1159 (`let response` position) vs line 1465 (`!response` usage in catch) |
| **Confidence** | HIGH |

---

## 5. Impact

| Area | Impact |
|------|--------|
| Order placement with stock-out items | **BROKEN** — user sees React error overlay instead of toast |
| Cart preservation on stock-out | **BROKEN** — user cannot correct cart because error overlay intercepts |
| Stock-out toast message content | **CORRECT** (code at 1620–1631 handles new BE shape) but never shown |
| Non-stock-out order placement | **UNAFFECTED** — only triggered when 422 is returned |
| Edit-order flow | **SAME BUG** — same `response` scope issue applies to edit path |
| Restaurant 69 (Goan Kitchen) | **CONFIRMED BROKEN** — has inventory tracking, can produce 422 |
| Restaurant 478 used in QA | **UNAFFECTED in QA** — no actual 422 was triggered during QA testing |

---

## 6. Why QA Missed This

The QA report (CR-2026-09-07-001, V-13) confirmed:
> "Live test — successful order flow: ReviewOrder page renders, Place Order button visible and tappable"

QA used restaurant 478 where items were not actually stock-out at test time. The verification matrix checked code structure (V-8, V-9, V-10) but did not trigger a live 422 response. The `let response` scope bug was not detectable by code inspection alone — it only manifests at runtime when a 422 is returned.

---

## 7. Proposed Fix (Planning approval required — no code written)

**Minimal fix — one line moved:**

```diff
  setIsPlacingOrder(true);
+ let response;           ← MOVE HERE (before try opens)
  try {
    const finalTableId = ...
    ...
-   let response;         ← REMOVE from inside try
    ...
```

This is the **only change needed**. Moving `let response` to before the `try {}` block makes it accessible in both `try` and `catch` scopes. All existing logic (isTrueNetworkLoss check, isStockOut branch, generic error branch) works correctly once `response` is in scope.

**Risk assessment:**
- File: `ReviewOrder.jsx` — CRITICAL hotspot
- Change type: Declaration position only — no logic change, no value change, no API change
- Blast radius: SMALL — only affects the `catch` block's ability to read `response`
- No Fast Lane — CRITICAL file requires full gate approval per addendum

---

## 8. New BE Contract — Separate Opportunity (not a crash cause)

From `stock_out_web_reply8.md`, the BE now returns `available_qty` and `requested_qty` per stock-out item. The BE recommendation:
> "Clamp food qty to food_stock when it is an integer."

This is a **new feature opportunity** (cart quantity clamping on 422) — not required for the crash fix. Should be filed as a separate CR after this bug is fixed.

---

## 9. Investigation Output

```
Investigation complete: BUG-2026-09-08-001
Root cause: CODE_ERROR — `let response` declared inside try{} (block-scoped), not accessible in catch{}. Line 1465 `!response` throws ReferenceError before isStockOut branch runs.
Classification: FE / CODE_ERROR
Confidence: HIGH
Steps used: 3/10
Evidence: ReviewOrder.jsx lines 1145, 1159, 1360, 1454, 1465 (scope gap). orderService.ts lines 447–461 (422 detection correct).
Recommendation: Planning gate → owner approval → move `let response` to before try{} (1 line, CRITICAL file)
Report: /app/memory/change_requests/BUG-2026-09-08-001-response-not-defined-422-crash/INVESTIGATION_REPORT.md
```
