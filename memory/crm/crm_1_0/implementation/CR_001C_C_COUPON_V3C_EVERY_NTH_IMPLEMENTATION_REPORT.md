# CR-001C-C — Coupon V3-C Every-Nth Item Implementation Report

**Status:** `cr001c_coupon_v3c_every_nth_implementation_qa_passed_in_preview`
**Date:** 2026-05-25
**Continuation context:** Previous V3-C implementation agent died mid-task. This continuation agent verified existing code, created the missing QA harness, ran full regression, and completed documentation.

---

## 1. What Was Already Done Before Crash

The previous agent had already:

1. **`backend/core/coupon.py`** (~200 LOC added):
   - Constants: `_V3C_OFFER_TYPES`, `_V3C_BENEFIT_TYPES`
   - Helper: `_v3c_normalize_offer_type` — canonicalizes `nth_item`/`every_nth`/`every_nth_item` → `"nth_item"`
   - Helper: `_v3c_resolve_eligibility_lists` — single eligibility pool reusing V2 fields
   - Helper: `_v3c_resolve_benefit_type` — prefers `nth_discount_type`, falls back to V3-B `get_discount_type`
   - Helper: `_v3c_resolve_benefit_value` — prefers `nth_discount_value`, falls back to `get_discount_value`
   - Validator: `_v3c_validate_config` — runtime config check (nth_item_number≥2, benefit type, eligibility)
   - Engine: `_v3c_compute_discount` — core V3-C logic: match → expand → floor(qty/N) → cap → select → benefit math
   - Dispatch: V3-C branch in `validate_coupon_for_customer` (after V3-A Step 4, before V3-B)
   - Available: `build_eligible_match_hint` extended for V3-C `{"kind":"nth_item", ...}` shape
   - Available: `list_available_coupons` extended with `nth_item_number`, `nth_discount_type`, `nth_discount_value`
   - Recording: `record_coupon_usage_for_order` extended with V3-C snapshot fields
   - Success/replay envelopes extended with V3-C fields

2. **`backend/models/schemas.py`** (~50 LOC added):
   - `_v3c_validate_nth_int` validator (nth_item_number ≥ 2)
   - `_v3a_validate_offer_type` extended to accept `"every_nth"` / `"every_nth_item"` → `"nth_item"`
   - `Coupon`, `CouponCreate`, `CouponUpdate` models: `nth_item_number`, `nth_discount_type`, `nth_discount_value` fields
   - `CouponUsage` model: `nth_item_number`, `nth_discount_type`, `nth_discount_value`, `eligible_match_summary` fields
   - Pydantic field validators wired

3. **`backend/routers/pos.py`** (~25 LOC added):
   - `pos_validate_coupon` success response: `nth_item_number`, `nth_discount_type`, `nth_discount_value`, `eligible_match_summary`
   - `pos_order_webhook` coupon_usage block: same V3-C fields surfaced

4. **`backend/services/analytics_service.py`** (~60 LOC added):
   - `_get_nth_item_usage` aggregator: `orders`, `total_applications`, `discount_amount`, `benefit_units_given`, `by_nth_number` distribution
   - `get_coupon_stats` returns additive `nth_item_usage` block
   - `breakdown_by_offer_type.nth_item` bucket populated

5. **`backend/tests/seed_coupon_v1_fixtures.py`** (~120 LOC added):
   - 11 `QA_C3C_*` fixtures:
     - `QA_C3C_NTH5_COFFEE_FREE` — every 5th coffee free (same-item)
     - `QA_C3C_NTH3_DESSERT_PCT` — every 3rd dessert 50% off
     - `QA_C3C_NTH4_BEV_FLAT` — every 4th beverage ₹150 flat
     - `QA_C3C_NTH5_BEV_CAT_FREE` — category-level every 5th beverage free
     - `QA_C3C_NTH5_EXCLUDED` — category with excluded_item_ids
     - `QA_C3C_NTH5_MAX_APPS` — max_applications=2
     - `QA_C3C_NTH5_NOREPEAT` — allow_repeat=false
     - `QA_C3C_NTH3_HIGHEST` — apply_to_highest_item=true
     - `QA_C3C_NTH5_HAPPYHOUR` — time-window + every-Nth composition
     - `QA_C3C_NTH5_STACK_LOY` — loyalty stacking regression
   - Cleanup regex extended to `^(?:QA_C1_|QA_C2_|QA_C3A_|QA_C3B_|QA_C3C_)`

---

## 2. What Continuation Agent Completed

1. **Created `backend/tests/qa_cr001c_c_coupon_v3_c_every_nth.py`** (~530 LOC, 41 assertions):
   - The entire QA test harness was missing. Built from scratch following V3-B test pattern.
   - 41 assertions covering all planned V3-C QA cases (exceeds 33 target).
   - Self-cleaning with unique per-run USER_ID/CUSTOMER_ID.

2. **Ran full regression**: V1 45/45, V2 45/45, V3-A 31/31, V3-B 49/49, V3-C 41/41 = **211/211 PASS**.

3. **Created documentation**: This implementation report + QA report. Updated CR_001_INDEX.md and PRD.md.

---

## 3. Data Model / Schema Fields

All fields optional, backward-compatible, no migration needed.

### `coupons` collection (forward-only):
| Field | Type | Default | Notes |
|---|---|---|---|
| `offer_type` | str | `"simple"` | V3-C value: `"nth_item"` |
| `nth_item_number` | int | none | Required for V3-C. Pydantic validator: ≥ 2 |
| `nth_discount_type` | str | `"free"` | Enum: `free` / `percentage` / `flat` |
| `nth_discount_value` | float | none | Required for percentage/flat |
| `max_applications` | int | none | Reused from V3-B |
| `allow_repeat` | bool | `true` | Reused from V3-B |
| `apply_to_cheapest_item` | bool | `false` | Reused from V2 |
| `apply_to_highest_item` | bool | `false` | Reused from V2 |
| `pos_instruction` | str | none | Reused from V3-B |
| `eligible_food_ids` / `eligible_item_ids` / `eligible_category_ids` / `eligible_category_names` | list[str] | none | Reuses V2 fields |
| `excluded_item_ids` / `excluded_category_ids` | list[str] | none | Reuses V2 fields |

### `coupon_usage` collection (forward-only):
- `nth_item_number`, `nth_discount_type`, `nth_discount_value` (snapshots)
- `eligible_match_summary` (new field for V3-C — single pool, no buy/get split)
- Reuses V3-B: `applied_applications`, `benefit_items`, `computed_discount`, `discount_mismatch`

---

## 4. Computation Rules

- `applications = floor(eligible_total_qty / nth_item_number)`
- Capped by `max_applications` and `allow_repeat` (effective = min(natural, M, 1 if !allow_repeat))
- Default benefit selection: cheapest eligible unit; `apply_to_highest_item=true` overrides
- Benefit types: `free` (unit_price), `percentage` (unit_price × v/100), `flat` (min(v, unit_price))
- Coupon-level `max_discount` ceiling applied proportionally
- V3-A time-window pre-check (Step 4) composes automatically

---

## 5. API Behavior

- `GET /api/pos/coupons/available`: V3-C coupons return `requires_cart_validation=true`, `offer_type="nth_item"`, `nth_item_number`, eligible_match_hint
- `POST /api/pos/coupons/validate`: Computes discount, returns `benefit_items`, `applied_applications`, `nth_item_number`, `nth_discount_type`
- `POST /api/pos/orders`: Revalidates; success records coupon_usage; failure is non-blocking (order persists, coupon_usage skipped)
- Idempotency: `(user_id, order_id)` — unchanged
- Variance tolerance: `max(₹1, 1% × computed)` — unchanged

---

## 6. Error Codes (5 new, total surface now 27)

| Code | When |
|---|---|
| `MISSING_ITEMS_FOR_EVERY_NTH_COUPON` | No `items[]` provided |
| `NTH_REQUIREMENT_NOT_MET` | Eligible qty < nth_item_number |
| `NO_ELIGIBLE_NTH_ITEMS_IN_CART` | No matching lines in cart |
| `EVERY_NTH_CONFIG_INVALID` | Malformed coupon config |
| `UNSUPPORTED_NTH_BENEFIT_TYPE` | nth_discount_type outside {free, percentage, flat} |

---

## 7. Analytics

- `breakdown_by_offer_type.nth_item` populated from 0
- New `nth_item_usage` block: `orders`, `total_applications`, `discount_amount`, `benefit_units_given`, `by_nth_number`
- All existing analytics keys unchanged

---

## 8. Files Changed

| File | Change | LOC |
|---|---|---|
| `core/coupon.py` | V3-C helpers, engine, dispatch, available, recording | ~200 |
| `models/schemas.py` | V3-C fields + validators on Coupon/CouponCreate/CouponUpdate/CouponUsage | ~50 |
| `routers/pos.py` | Surface V3-C response fields in validate + order | ~25 |
| `services/analytics_service.py` | `_get_nth_item_usage` aggregator | ~60 |
| `tests/seed_coupon_v1_fixtures.py` | 11 QA_C3C fixtures + cleanup regex | ~120 |
| **NEW** `tests/qa_cr001c_c_coupon_v3_c_every_nth.py` | QA harness (41 assertions) | ~530 |

---

## 9. Untouched Areas Confirmation

- `routers/coupons.py` (9 admin CRUD endpoints): **UNTOUCHED**
- `core/loyalty.py`: **UNTOUCHED**
- `core/loyalty_jobs.py`: **UNTOUCHED**
- Wallet code: **UNTOUCHED**
- Migration code: **UNTOUCHED**
- `coupon_transactions` legacy collection: **UNTOUCHED**
- `/app/memory/final/`: **UNTOUCHED**
- No DB migration, no new indexes, no new dependencies, no env changes

---

## 10. Final Status

`cr001c_coupon_v3c_every_nth_implementation_qa_passed_in_preview`

Combined QA: V1 45/45 + V2 45/45 + V3-A 31/31 + V3-B 49/49 + V3-C 41/41 = **211/211 PASS**
