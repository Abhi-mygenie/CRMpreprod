# CR-007 — Loyalty Redemption Fix: Order Never Rejected + POS Mismatch Logging

**CR:** CR-007 Loyalty Redemption Order Rejection Fix
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-27
**Status:** `cr007_implemented_and_tested`

---

## Thumb Rule

**ORDER SHOULD NEVER BE REJECTED.** No matter what happens with loyalty redemption, coupon validation, or any discount flow — the order must always be saved. CRM is a recording system; POS is the source of the order. If CRM disagrees with POS on loyalty/coupon math, CRM logs the mismatch and proceeds with its own calculation, but the order is always persisted.

---

## 1. Problem Statement

When POS sends an order with `loyalty_points_used > 0`, CRM attempts loyalty redemption. If redemption fails (e.g., max_redeemable = 0 due to `order_amount` being post-discount), CRM **hard-fails the entire webhook** at `pos.py` line 1323 (`return POSResponse(success=False, ...)`).

**Consequence:** The order is never saved. No order doc, no earn points, no visit counted, no spend tracked. POS thinks order went through, CRM has no record. Customer's `total_points_redeemed` stays 0, loyalty discount never shows in UI.

**Evidence (R523 Mayur's Kitchen):**
- 4+ orders with loyalty redemption all rejected by CRM
- 0 redeem transactions in `points_transactions`
- Customer `total_points_redeemed = 0` despite POS showing points used
- Customer points balance inflated (never deducted)
- Orders with loyalty redemption don't exist in `orders` collection

---

## 2. Root Causes

### 2a. Wrong bill base for max-redeemable (ALREADY FIXED)

`pos.py` line 1317 was using `order_data.order_amount` (post-discount = 0) instead of `order_data.order_sub_total_amount` (pre-discount = 600). **Fixed in this session** — now uses `order_sub_total_amount`.

### 2b. Hard-fail on redemption rejection (TO BE FIXED)

`pos.py` lines 1320-1327: if `redeem_loyalty_points()` returns `ok: false`, the webhook returns immediately. Order never reaches `_save_order_and_transactions()` at line 1408.

### 2c. CRM blindly trusts POS `loyalty_points_used` (TO BE FIXED)

POS sends both `loyalty_points_used` (points) and `loyalty_discount` (₹ value). CRM uses `loyalty_points_used` directly but ignores `loyalty_discount`. CRM should back-calculate points from `loyalty_discount` using its own `ratio_per_point` and use that as source of truth.

---

## 3. Proposed Fix

### Fix A — Remove hard-fail (MUST)

**File:** `/app/backend/routers/pos.py`, lines 1305-1327

- Remove the `return POSResponse(success=False, ...)` at lines 1323-1327
- If redemption fails: log the failure, set `loyalty_redeemed_value = 0`, **continue** the flow
- Order always proceeds to `_save_order_and_transactions()` at line 1408

### Fix B — Back-calculate points from POS `loyalty_discount` (MUST)

**File:** `/app/backend/routers/pos.py`, inside redemption block (lines 1305-1333)

1. Get `ratio_per_point` from tier-aware settings
2. Back-calculate: `crm_points = int(order_data.loyalty_discount / ratio_per_point)`
3. Compare `crm_points` vs `order_data.loyalty_points_used`
4. If mismatch → log to `loyalty_mismatch_logs` collection:
   ```json
   {
     "pos_order_id": "869099",
     "customer_id": "...",
     "user_id": "...",
     "pos_loyalty_points_used": 600,
     "pos_loyalty_discount": 600.0,
     "crm_calculated_points": 600,
     "ratio_per_point": 1.0,
     "mismatch_type": "points_vs_discount | none",
     "action_taken": "used_crm_calculation",
     "timestamp": "..."
   }
   ```
5. Pass `crm_points` (not POS's `loyalty_points_used`) to `redeem_loyalty_points()`
6. CRM is always source of truth for the conversion

### Fix C — Store both POS and CRM loyalty values in order doc (MUST)

**File:** `/app/backend/routers/pos.py`, order doc builder (lines 867-868)

Add two fields alongside existing POS fields:
```
"loyalty_points_used": order_data.loyalty_points_used or 0,     ← POS value (already exists)
"loyalty_discount": order_data.loyalty_discount or 0.0,         ← POS value (already exists)
"crm_loyalty_points_redeemed": <actual points CRM committed, or 0>,   ← NEW
"crm_loyalty_discount": <actual ₹ value CRM committed, or 0>,         ← NEW
```

---

## 4. Files to Change

| File | Lines | Change |
|---|---|---|
| `/app/backend/routers/pos.py` | 1305-1327 | Remove hard-fail return; add mismatch check + logging; continue flow |
| `/app/backend/routers/pos.py` | 867-868 | Add `crm_loyalty_points_redeemed` and `crm_loyalty_discount` to order doc |

No other files. No frontend changes. No schema changes.

---

## 5. New Collection

`loyalty_mismatch_logs` — records every case where POS loyalty values differ from CRM calculation. No TTL needed; these are audit records.

---

## 6. UI Impact (no frontend code changes needed)

| UI Element | Current | After Fix |
|---|---|---|
| **POINTS balance** | Inflated (never deducted) | Correct balance after deductions |
| **Redeemed (points / ₹)** | 0 / ₹0 | Actual redeemed total |
| **Order history** | Missing loyalty-only orders | All orders visible |
| **Total discount** | Missing loyalty discounts | Loyalty discounts included |
| **Visits / Spent** | Under-counted (loyalty orders lost) | All orders counted |

---

## 7. Earn Logic (separate, not in this CR)

`earn_base_amount = max(0.0, order_data.order_amount - loyalty_redeemed_value)` at line 1344 uses `order_amount` (post-discount). This may also need to use `order_sub_total_amount` minus all discounts. **Not in scope for this CR — separate investigation needed.**

---

## 10. Implementation & Test Results (2026-05-27)

### Changes made:
- `/app/backend/routers/pos.py`: Added `import logging`
- `/app/backend/routers/pos.py` lines 1298-1367: Replaced hard-fail block with CR-007 logic (back-calculate, mismatch log, no rejection)
- `/app/backend/routers/pos.py` lines 867-871: Added `crm_loyalty_points_redeemed` and `crm_loyalty_discount` to order doc
- `/app/backend/routers/pos.py` `_save_order_and_transactions`: Added 2 new params for CRM loyalty fields
- `/app/backend/routers/pos.py` line 1443-1446: Pass CRM loyalty values to save function

### Test 1 — Normal redemption (POS points = CRM calculation):
- POS: `loyalty_points_used=500, loyalty_discount=500, order_sub_total=500`
- CRM: back-calculated 500 points, no mismatch logged
- Result: `success=true`, redemption committed, order saved
- Order doc: `loyalty_points_used=500, crm_loyalty_points_redeemed=250` (auto-capped by max_redeemable)
- Customer: `total_points_redeemed` incremented ✅

### Test 2 — Mismatch (POS points ≠ CRM calculation):
- POS: `loyalty_points_used=999, loyalty_discount=300, order_sub_total=300`
- CRM: back-calculated 300 points (300/1.0), mismatch logged
- Result: `success=true`, used CRM calculation (300 not 999)
- Mismatch log created with `pos=999, crm=300, action=used_crm_calculation` ✅
- Order doc: `loyalty_points_used=999, crm_loyalty_points_redeemed=150` ✅

### Test 3 — Implicit (order never rejected):
- Both test orders returned `success=true` — no hard-fail ✅
- Test data cleaned up after verification

This fix is **forward-only**. The 4+ previously rejected R523 orders are lost — CRM never recorded them. Options:
- **Option A:** Manual one-time reconciliation script to replay lost orders from `pos_request_logs`
- **Option B:** Accept the gap; going forward all orders will be recorded

Owner decision needed.

---

## 9. Thumb Rules (for all future POS webhook work)

1. **Order is NEVER rejected.** CRM always saves the order.
2. **CRM is source of truth** for loyalty/coupon math. POS values are stored for audit but CRM's calculation is what gets committed.
3. **Mismatches are logged**, not blocked. `loyalty_mismatch_logs` provides visibility without breaking the flow.
4. **Use `order_sub_total_amount`** as bill base for any discount/redemption calculation, never `order_amount` (which is post-discount).
