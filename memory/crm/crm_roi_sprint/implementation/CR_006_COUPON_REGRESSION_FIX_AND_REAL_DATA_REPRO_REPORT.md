# CR-006 Coupon Regression Fix + Real Data Reproduction Report

**CR:** CR-006 Coupon Engine POS Validate Business Logic Regression
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-26
**Status:** `cr006_b11_fixed_real_data_reproduction_complete`

---

## 1. B11 Frontend Fix — Implementation

### What was done:

**Bug:** Eligible and Excluded item pickers in V3-C Every-Nth coupon form allowed the same item in both lists.

**Fix applied (3 layers):**

1. **Toggle auto-cleanup (line ~450):** When adding an item to eligible list, it is auto-removed from excluded list (and vice versa). This prevents overlap at interaction time.

2. **Picker filtering (lines ~848, ~861):** The eligible `ItemSelector` receives `menuItems` filtered to exclude items already in `excluded_item_ids`. The excluded `ItemSelector` receives `menuItems` filtered to exclude items already in `eligible_food_ids`. Items in the opposite list are hidden, not just disabled.

3. **Save-time sanitization (line ~424):** Before submitting the Every-Nth coupon payload, `excluded_item_ids` is filtered to remove any IDs that overlap with `eligible_food_ids`. This is a defensive guard for any edge case where the toggle auto-cleanup didn't fire.

4. **Edit-mode cleanup (line ~329):** When loading an existing coupon for editing, if the DB contains overlapping eligible/excluded data (legacy bad data), the excluded list is auto-cleaned on load.

### Files changed:
- `/app/frontend/src/pages/CouponsPage.jsx`

### Scope of fix:
- V3-C Every-Nth form only (this is the only form with both eligible and excluded item pickers)
- V2 item/category form has no excluded picker in UI
- V3-B BOGO form uses separate buy/get food ID lists (different concept)

---

## 2. Engine Bug — min_item_qty + cheapest/highest ordering fix

### Bug discovered during real data reproduction:

When `apply_to_cheapest_item=True` (or `apply_to_highest_item=True`) AND `min_item_qty >= 2`, the coupon validation always fails with `MIN_ITEM_QTY_NOT_MET` even when enough eligible items exist.

**Root cause:** In `_compute_v2_discount()`, `_select_cheapest_or_highest()` was called at line 342 (BEFORE the min_item_qty check at line 382). This narrowed the eligible list to 1 item, then `eligible_qty_total` was computed on the narrowed list (= 1), which was always less than `min_item_qty >= 2`.

**Fix:** Moved `min_item_qty` check to run on the FULL eligible pool BEFORE cheapest/highest narrowing. The cheapest/highest narrowing now runs AFTER the min_item_qty gate passes. Discount computation correctly runs on the narrowed set.

**Evidence:** Real R689 coupon `SEED_V2_ITEMS_MULTI` (cheapest=true, min_item_qty=2) was failing via `/api/pos/coupons/validate`. After fix, correctly returns discount=30 on cheapest item.

### Files changed:
- `/app/backend/core/coupon.py` — `_compute_v2_discount()` function

### Regression verified:
- T1 (cheapest item) — PASS
- T2 (highest item) — PASS
- T8 (category positive) — PASS
- T14 (exclusion wins) — PASS

---

## 3. Real Data Reproduction Matrix

| Bug | Real Coupon Used? | Coupon Code | POS Validate Tested? | Expected | Actual | Reproduced? | Root Cause |
|---|---|---|---|---|---|---|---|
| B8-1 cheapest (no min_qty) | Yes — KUNAFA20 | KUNAFA20 | Yes — `/api/pos/coupons/validate` | disc=40 on cheapest (200), 20% | disc=40.0, matched=[182036] | **NOT reproduced — works correctly** | N/A — engine correct |
| B8-2 cheapest + min_qty | Yes — SEED_V2_ITEMS_MULTI | SEED_V2_ITEMS_MULTI | Yes — `/api/pos/coupons/validate` | disc=30 on cheapest | BEFORE FIX: MIN_ITEM_QTY_NOT_MET. AFTER FIX: disc=30.0, matched=[182042] | **REPRODUCED + FIXED** | Engine: `_select_cheapest_or_highest` called before min_item_qty check |
| B9-1 BOGO default | Yes — SEED_V3B_BOGO | SEED_V3B_BOGO | Yes | disc=300 (free cheapest) | disc=300.0, apps=1, same=true | **NOT reproduced — works correctly** | N/A |
| B9-2 BOGO highest target | Yes — SEED_V3B_BOGO (temporarily set highest=true) | SEED_V3B_BOGO | Yes | disc=600 (free 2 highest @300) | disc=600.0, apps=2, benefit qty=2 | **NOT reproduced — works correctly when flag is set** | Test data: No existing R689 BOGO had `apply_to_highest_item=true`. Tester may have toggled in UI but field was not stored. |
| B10 category positive | Yes — SEED_V2_CATFLAT | SEED_V2_CATFLAT | Yes — POS cart with `item_category` | disc=40 on eligible cat | disc=40.0, elig_sub=500.0 | **NOT reproduced — works correctly** | N/A — `item_category` fallback works |
| B10 category negative | Yes — SEED_V2_CATFLAT | SEED_V2_CATFLAT | Yes | NO_ELIGIBLE_CATEGORY_IN_CART | error code matches | **NOT reproduced — correctly rejects** | N/A |
| B12 V3-C Every-3rd cat | Yes — SEED_V3C_EVERY3_FREE | SEED_V3C_EVERY3_FREE | Yes | disc=200 (free cheapest), apps=1 | disc=200.0, apps=1, benefit=[182036@200] | **NOT reproduced — works correctly** | N/A — category matching via `item_category` works |
| B12 V3-C Every-5th cat | Yes — SEED_V3C_EVERY5_PCT | SEED_V3C_EVERY5_PCT | Yes | disc=100 (50% of cheapest 200), apps=1 | disc=100.0, apps=1, benefit=[182050@100] | **NOT reproduced — works correctly** | N/A |

### B9 root cause conclusion:
No existing R689 BOGO coupon had `apply_to_highest_item=True` stored in the DB. When temporarily set via DB update, the engine honoured it correctly (disc=600, 2 applications). Most likely explanation: tester Mayur toggled the switch in the UI but either didn't save, or there was a frontend state issue at time of test.

### B10/B12 root cause conclusion:
Both category-level V2 and V3-C Every-Nth work correctly when POS sends `item_category` matching the `eligible_category_names` stored in the coupon. The engine's 4-level category matching fallback chain handles this. If tester's POS was not sending `item_category` in the validate payload, that would be a POS contract issue, not CRM.

---

## 4. Test DB Changes

| Action | Coupon | Change | Reverted? |
|---|---|---|---|
| Temp update for B9 test | SEED_V3B_BOGO | Set `apply_to_highest_item: true` | **Yes — reverted to false** |

No test coupons were created. No permanent DB changes.

---

## 5. Summary of All Changes

| File | Action | Purpose |
|---|---|---|
| `/app/frontend/src/pages/CouponsPage.jsx` | Modified | B11 fix: eligible/excluded picker cross-validation (toggle auto-cleanup, picker filtering, save sanitization, edit-mode cleanup) |
| `/app/backend/core/coupon.py` | Modified | B8 engine fix: moved min_item_qty check before cheapest/highest narrowing in `_compute_v2_discount()` |
