# BUG-035/039/040/041 — QA Handover

**From:** Documentation Agent (retroactive — fixes were already implemented)
**Date:** 2026-06-17
**Stage:** IMPLEMENTED — ready for QA
**Risk:** MEDIUM (BUG-039/040/041 touch CRITICAL order placement + payment path)

---

## What was fixed

| Bug | Fix Summary |
|---|---|
| BUG-035 | Debug log added to placeOrder payload (P3 — logging only) |
| BUG-039 | Double-submit guard added to edit-order path |
| BUG-040 | Razorpay checkout added to 401-retry path |
| BUG-041 | Payment type on 401-retry uses user's selection, not razorpay_key existence |

---

## Test credentials

- Customer flow: `https://<preview>/478` (restaurant 478 = 18march)
- Phone: +919579504871 / Password: Qplazm@10 (from env)
- Restaurant 478 config: has Razorpay configured (razorpay_key present)

---

## Acceptance Tests

### BUG-035 (Logging — P3, optional to test)

| # | Test | Expected |
|---|---|---|
| 35-1 | Place a new order, check browser console | `[ORDER] [BUG-035 TEST] placeOrder Payload:` log visible with `payment_type`, `restaurant_id`, `table_id`, `order_type`, `order_amount` |

### BUG-039 (Double-submit guard on edit order)

| # | Test | Expected |
|---|---|---|
| 39-1 | Navigate to review-order in edit mode, click Place Order | Order submits once. `orderDispatchedRef` prevents double-click. Button should disable or show loading state. |
| 39-2 | Rapidly double-click Place Order in edit mode | Only ONE API call fires. No duplicate order update. |
| 39-3 | New order (non-edit) double-click still works as before | Pre-existing guard still active. No regression. |

### BUG-040 (Razorpay after 401 retry)

**Note:** This bug only manifests when a 401 occurs during placeOrder AND the user selected online payment. Reproducing a real 401 is difficult in normal testing. QA approach: **code review verification**.

| # | Test | Expected |
|---|---|---|
| 40-1 | CODE REVIEW: Verify `shouldRetryRazorpay` check exists at ReviewOrder.jsx ~L1452 | Line reads: `const shouldRetryRazorpay = paymentMethod === 'online' && retryResponse?.razorpay_id && restaurant?.razorpay?.razorpay_key;` |
| 40-2 | CODE REVIEW: Verify Razorpay checkout call follows | `await openRazorpayCheckout(retryResponse, 'Razorpay-Retry')` with error handling |
| 40-3 | CODE REVIEW: Verify pattern matches main flow at ~L1278 | Same three conditions: `paymentMethod === 'online'`, `response?.razorpay_id`, `restaurant?.razorpay?.razorpay_key` |
| 40-4 | Normal online payment flow (no 401) | Razorpay opens normally after placeOrder succeeds. No regression. |
| 40-5 | Normal COD flow (no 401) | Navigates to success without Razorpay. No regression. |

### BUG-041 (Payment type on 401 retry)

**Same note:** 401 retry is hard to trigger naturally. QA approach: **code review + normal flow regression**.

| # | Test | Expected |
|---|---|---|
| 41-1 | CODE REVIEW: Verify `retryPaymentType` at ReviewOrder.jsx ~L1414 | Line reads: `const retryPaymentType = paymentMethod === 'online' ? 'prepaid' : 'postpaid';` |
| 41-2 | CODE REVIEW: Verify it's passed to placeOrder at ~L1434 | `paymentType: retryPaymentType` (not hardcoded, not based on razorpay_key) |
| 41-3 | CODE REVIEW: Verify pattern matches main flow at ~L1222 | `const selectedPaymentType = paymentMethod === 'online' ? 'prepaid' : 'postpaid';` — identical logic |
| 41-4 | Normal COD order placement | Order placed with `payment_type: 'postpaid'`. Check payload in console (BUG-035 log). |
| 41-5 | Normal online payment order placement | Order placed with `payment_type: 'prepaid'`. Razorpay opens. |

### Regression

| # | Test | Expected |
|---|---|---|
| R-1 | Place a new COD dine-in order (full flow) | Order succeeds, navigates to success page |
| R-2 | Place a new order with online payment (if Razorpay configured) | Razorpay modal opens |
| R-3 | Cart + review order + back to menu + review again | Cart persists, no duplicate orders |
| R-4 | Landing page → Browse Menu → Add items → Review Order | Full flow works |
| R-5 | Edit order flow (if available for dine-in) | Update succeeds, no double-submit |

---

## Testing constraints

- **401 retry path (BUG-040/041)** cannot be easily triggered in a normal test session. These are **code-review verified** bugs — the fix pattern mirrors the main flow exactly. Runtime regression tests (R-1 through R-5) confirm the main flow is unbroken.
- **Razorpay** requires a real payment test environment. If restaurant 478 has Razorpay configured, online payment can be tested. If not, code review is sufficient.
- **Edit order** requires an existing order on a valid table — may need QR scan context or an active dine-in session.

---

*QA Handover complete | 2026-06-17*
