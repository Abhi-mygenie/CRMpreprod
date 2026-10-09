# BUG-035 / 039 / 040 / 041 — Order Placement & Payment Bug Fixes

> **Folder rename note (CR-2026-07-03-010, 2026-07-03):**
> This folder was originally named `BUG-035-039-040-041-order-placement-fixes/`.
> It was renamed to `CR-2026-04-11-001-order-placement-fixes/` to comply with the operating
> prompt's ID convention (one folder = one CR-YYYY-MM-DD-NNN ID). The four legacy BUG IDs
> (BUG-035, BUG-039, BUG-040, BUG-041) remain valid cross-references and are documented below.
> Canonical status for each is in [`/app/memory_repo/BUG_TRACKER.md`](../../../memory_repo/BUG_TRACKER.md).

**ID:** BUG-035, BUG-039, BUG-040, BUG-041
**Classification:** Bug fixes (4 related issues in the order placement / payment retry flow)
**Severity:** BUG-035 = P3 (logging), BUG-039/040/041 = P1 (CRITICAL path — order placement + payment)
**Risk:** MEDIUM (touches ReviewOrder.jsx — protected file, payment flow)
**Status:** IMPLEMENTED in code — **no QA artifact exists**
**Files affected:** `ReviewOrder.jsx`, `orderService.ts`

---

## BUG-035 — Order Payload Debug Logging

**Problem:** No way to inspect the order payload being sent to POS during debugging.

**Fix:** Added `logger.order('[BUG-035 TEST] placeOrder Payload:', {...})` at `orderService.ts:424` logging key payload fields (`payment_type`, `restaurant_id`, `table_id`, `order_type`, `order_amount`) before the API call.

**File:** `frontend/src/api/services/orderService.ts` line 424
**Impact:** Zero functional change. Debug logging only. No user-facing effect.
**Risk:** None.

---

## BUG-039 — Double-Submit on Edit Order

**Problem:** In the edit-order flow, `orderDispatchedRef.current` was NOT set to `true` before calling `updateCustomerOrder`. If the network was slow, the user could click "Place Order" again, causing a duplicate order update. The new-order flow already had this guard, but the edit-order path was missing it.

**Fix:** Added `orderDispatchedRef.current = true;` at `ReviewOrder.jsx:1043` — BEFORE the `updateCustomerOrder` API call in the edit-order branch. If the network drops during the call, the catch block now shows a duplicate-prevention warning instead of allowing a retry that could double-submit.

**File:** `frontend/src/pages/ReviewOrder.jsx` line 1043
**Impact:** Edit-order flow now has the same double-submit protection as new-order flow.
**Risk:** Low. Additive guard. If the API call fails, user sees "Order may have been submitted" warning (same pattern as new-order).

---

## BUG-040 — Missing Razorpay Flow After 401 Retry

**Problem:** When a 401 (auth expired) occurs during `placeOrder`, the code retries with a fresh token. After the retry succeeds, the **main flow** correctly checks if Razorpay payment is needed and opens the Razorpay checkout. But the **401-retry path** was missing this check — after a successful retry, it went straight to "COD success" navigation, **skipping online payment entirely**.

**Scenario:** Customer selects "Pay Online" → clicks Place Order → gets 401 → token refreshes → retry succeeds → **BUG: navigates to success without opening Razorpay** → order placed as unpaid.

**Fix:** Added Razorpay check after 401 retry at `ReviewOrder.jsx:1452`:
```js
const shouldRetryRazorpay = paymentMethod === 'online' 
  && retryResponse?.razorpay_id 
  && restaurant?.razorpay?.razorpay_key;
if (shouldRetryRazorpay) {
  await openRazorpayCheckout(retryResponse, 'Razorpay-Retry');
  return;
}
```
Mirrors the main flow check at line 1278.

**File:** `frontend/src/pages/ReviewOrder.jsx` lines 1452-1465
**Impact:** Online payment orders that hit 401 retry now correctly open Razorpay instead of being placed as unpaid.
**Risk:** Medium. Payment flow — but the fix mirrors the exact pattern from the main flow. Failure to open Razorpay falls through to error toast + state reset (safe).

---

## BUG-041 — Wrong Payment Type on 401 Retry

**Problem:** In the 401-retry path for `placeOrder`, the `paymentType` was being determined by `razorpay_key` existence rather than the user's actual payment selection (`paymentMethod` state). If a restaurant had Razorpay configured but the user chose COD, the retry would send `paymentType: 'prepaid'` instead of `'postpaid'`.

**Scenario:** Restaurant has Razorpay configured → Customer selects COD → clicks Place Order → gets 401 → token refreshes → retry sends `paymentType: 'prepaid'` based on key existence → **BUG: POS creates a prepaid order that should have been COD**.

**Fix:** At `ReviewOrder.jsx:1414`:
```js
// BUG-041 FIX: Use paymentMethod (user's selection), NOT razorpay_key existence
const retryPaymentType = paymentMethod === 'online' ? 'prepaid' : 'postpaid';
```
And passed as `paymentType: retryPaymentType` at line 1434.

This mirrors the main flow at line 1222:
```js
const selectedPaymentType = paymentMethod === 'online' ? 'prepaid' : 'postpaid';
```

**File:** `frontend/src/pages/ReviewOrder.jsx` lines 1414, 1434
**Impact:** 401 retry now sends the correct payment type matching user's selection.
**Risk:** Low. Aligns retry path with main path. Same pattern, same variable.

---

## Summary of All 4 Fixes

| Bug | Severity | Flow | What Was Wrong | What Was Fixed | Lines |
|---|---|---|---|---|---|
| BUG-035 | P3 | Logging | No payload visibility | Added debug log | `orderService.ts:424` |
| BUG-039 | P1 | Edit order | Double-submit possible | Set `orderDispatchedRef` before API call | `ReviewOrder.jsx:1043` |
| BUG-040 | P1 | 401 retry | Razorpay skipped after retry | Added Razorpay check post-retry | `ReviewOrder.jsx:1452-1465` |
| BUG-041 | P1 | 401 retry | Wrong payment type sent | Use user's `paymentMethod` selection | `ReviewOrder.jsx:1414,1434` |

---

## Relationship Between BUG-040 and BUG-041

These are **two fixes in the same 401-retry code block** (lines 1370-1470). They fix different aspects:
- BUG-041 fixes WHAT is sent (correct `paymentType` in the retry request)
- BUG-040 fixes WHAT HAPPENS AFTER (correct Razorpay flow after retry response)

Together they make the 401-retry path **functionally identical** to the main flow for payment handling.

---

*Documented: 2026-06-17 | Status: IMPLEMENTED — awaiting QA*
