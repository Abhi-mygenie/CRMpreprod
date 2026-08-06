# CR-001C-C — Coupon V2 Item/Category Implementation Report

**Status:** `cr001c_coupon_v2_item_category_implementation_qa_passed_in_preview`
**Date:** 2026-05-24
**Plan:** `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V2_ITEM_CATEGORY_PLANNING.md` (incl. Addendum B owner clarifications)
**V1 baseline:** `cr001c_coupon_v1_implementation_qa_passed_in_preview` (preserved)
**Branch:** `24-may` (working in `/app`)

---

## 1. Summary

Coupon V2 implemented end-to-end per the approved plan + Addendum B.

- **V1 regression: 45/45 PASS** — `qa_cr001c_c_coupon_v1.py` rerun green after every change.
- **V2 assertions: 45/45 PASS** — `qa_cr001c_c_coupon_v2_item_category.py` covers all required scenarios.
- **Live HTTP smoke confirmed** for `GET /api/pos/coupons/available` (mixed V1+V2 response with `requires_cart_validation` + `eligible_match_hint`) and `POST /api/pos/coupons/validate` (success + structured `MISSING_ITEMS_FOR_ITEM_COUPON` error).
- No DB migration. All new fields optional. V1 rows resolve to `discount_scope="order"` automatically.

Combined: **V1 45/45 + V2 45/45 = 90/90 assertions PASS.**

---

## 2. Files changed

| File | Change | Highlights |
|---|---|---|
| `backend/core/coupon.py` | EXTEND | New `resolve_discount_scope(coupon)`. New cart helpers: `_line_matches_item_scope`, `_line_matches_category_scope`, `_line_is_excluded`, `_line_contribution`, `_select_cheapest_or_highest`. New `_compute_v2_discount(coupon, scope, items)`. New `build_eligible_match_hint(coupon)`. `validate_coupon_for_customer` extended with `items` + `skip_cart_validation` params and scope-aware dispatch. `list_available_coupons` returns `requires_cart_validation` + `eligible_match_hint` for V2 scopes. `record_coupon_usage_for_order` passes `items` through, stores `discount_scope` + `eligible_subtotal` + matched id/name lists on `coupon_usage`. `normalize_coupon_type` widened to accept item/category aliases. ~390 LOC delta. |
| `backend/models/schemas.py` | EXTEND | Added `AliasChoices` to imports. `Coupon` / `CouponCreate` / `CouponUpdate` gain V2 optional fields: `discount_scope`, `eligible_food_ids`, `eligible_item_ids`, `eligible_category_ids`, `eligible_category_names`, `excluded_item_ids`, `excluded_category_ids`, `min_item_qty`, `max_applicable_qty`, `apply_to_cheapest_item`, `apply_to_highest_item`. `CouponUsage` gains `discount_scope`, `eligible_subtotal`, `eligible_food_ids`, `eligible_item_ids`, `eligible_category_ids`, `eligible_category_names`. New `POSCartItem` Pydantic model with `AliasChoices` for `food_id`/`pos_food_id`, `item_id`/`itemId`, `category_id`/`categoryId`, `category_name`/`categoryName`, `item_category`, `quantity`/`qty`/`item_qty`, `unit_price`/`price`/`item_price`, `line_total`/`lineTotal`. `POSCouponValidateRequest` gains optional `items: Optional[List[POSCartItem]] = None`. |
| `backend/routers/pos.py` | EXTEND | Imports `POSCartItem`. `pos_validate_coupon` passes `request.items` to service and surfaces V2 fields in response (`discount_scope`, `eligible_subtotal`, `matched_*`). `pos_order_webhook` converts `order_data.items` (List[OrderItem]) → cart dicts and passes through `record_coupon_usage_for_order(..., items=...)`. Response `data.coupon_usage` extended with `discount_scope` + `eligible_subtotal`. |
| `backend/services/analytics_service.py` | EXTEND | `get_coupon_stats` adds `breakdown_by_scope` (order/item/category/unknown buckets with used count + summed discount). Top-level keys unchanged → no dashboard regression risk. |
| `backend/tests/seed_coupon_v1_fixtures.py` | EXTEND | Added 4 V2 fixtures (`QA_C2_ITEMFLAT`, `QA_C2_ITEMPCT`, `QA_C2_CATFLAT`, `QA_C2_CATPCT`). Cleanup regex now matches both `QA_C1_*` and `QA_C2_*`. |
| `backend/tests/qa_cr001c_c_coupon_v2_item_category.py` | **NEW** | 45-assertion V2 QA harness (~440 LOC). |
| `backend/routers/coupons.py` | **UNTOUCHED** | All 9 admin CRUD endpoints intact. The extended `Coupon` Pydantic model adds the V2 fields with safe defaults, so admin GET/PUT continue to work and now surface V2 fields where present. |
| `backend/core/loyalty.py`, wallet code, migration code, `server.py`, indexes | **UNTOUCHED** | Out-of-scope. V2 reuses the existing `(user_id, order_id)` partial unique index added in V1. |
| `/app/memory/final/` | **UNTOUCHED** | — |

No DB migration. No env change. No deployment.

---

## 3. Owner decisions applied (Addendum B)

| OQ | Decision | Implementation |
|---|---|---|
| OQ-1 | `GET /available` stays query-only with `requires_cart_validation` + `eligible_match_hint`. | `list_available_coupons` returns those fields per coupon. Item/category coupons get `expected_discount=null`, `final_amount_preview=null`. Verified by V2-AVAIL-1..6. |
| OQ-2 | One coupon per order. | Idempotency key `(user_id, order_id)` unchanged (V1 partial unique index). |
| OQ-3 | Total coupon discount only. | `record_coupon_usage_for_order` returns a single `coupon_discount`. No per-line allocation. |
| OQ-4 | Category matching via `category_id` → `category_name` → `item_category` fallback. | `_line_matches_category_scope` implements the 3-priority cascade. Verified by V2-CF-CATID, V2-CP-CATNAME, V2-CP-FALLBACK, V2-CF-FALLBACK. |
| OQ-5 | Item matching via `food_id` → `item_id`. | `_line_matches_item_scope` implements priority. Verified by V2-IF-FOODID, V2-IP-ITEMID. |
| OQ-6 | `max_applicable_qty` per line. | `_line_contribution` caps per line. Verified by V2-QTY, V2-IP-CAP. |
| OQ-7 | Legacy rows bucket as `unknown` first month. | `breakdown_by_scope` includes `unknown` bucket using Mongo `$ifNull`. |

---

## 4. API contract changes

### `GET /api/pos/coupons/available`
**Unchanged signature.** Per-coupon response gains `discount_scope`, `requires_cart_validation`, `eligible_match_hint`. For V1 order-scope coupons: `requires_cart_validation=false`, `expected_discount`/`final_amount_preview` populated as today. For V2 item/category coupons: `requires_cart_validation=true`, `expected_discount=null`, `final_amount_preview=null`, `eligible_match_hint = {type, values}`.

### `POST /api/pos/coupons/validate`
**Body extended.** New optional `items: List[POSCartItem]`. Required for item/category-scope coupons; absent → `MISSING_ITEMS_FOR_ITEM_COUPON` / `MISSING_ITEMS_FOR_CATEGORY_COUPON`. Response success carries `discount_scope`, `eligible_subtotal`, `matched_food_ids/item_ids/category_ids/category_names`, `requires_cart_validation=false`. V1 (without `items`) for order-scope coupons unchanged.

### `POST /api/pos/orders`
**Contract unchanged.** Internally `pos_order_webhook` now converts `order_data.items` → cart dicts and passes through for V2 server-side revalidation. `data.coupon_usage` adds `discount_scope` + `eligible_subtotal` keys (additive; V1 callers can ignore).

### New error codes implemented (in addition to V1's 9)
`MISSING_ITEMS_FOR_ITEM_COUPON`, `MISSING_ITEMS_FOR_CATEGORY_COUPON`, `NO_ELIGIBLE_ITEMS_IN_CART`, `NO_ELIGIBLE_CATEGORY_IN_CART`, `MIN_ITEM_QTY_NOT_MET`.

---

## 5. Final POS order behavior

In `pos_order_webhook` (`POST /api/pos/orders`) after WhatsApp triggers:

1. If `coupon_code` present AND `coupon_discount > 0` → build cart dicts from `order_data.items` → call `record_coupon_usage_for_order(..., items=...)`.
2. Service re-runs `validate_coupon_for_customer` server-side with `items` for V2 scopes.
3. **Validation success path** → `coupon_usage` row inserted via idempotent upsert on `(user_id, order_id)`. `coupons.total_used` incremented only on first insert. V2 fields (`discount_scope`, `eligible_subtotal`, `eligible_food_ids/item_ids/category_ids/category_names`) recorded. Response surfaces full block under `data.coupon_usage`.
4. **Validation failure path** (e.g. `MISSING_ITEMS_FOR_ITEM_COUPON`, `NO_ELIGIBLE_ITEMS_IN_CART`, `NO_ELIGIBLE_CATEGORY_IN_CART`, `MIN_ITEM_QTY_NOT_MET`) → **order persists normally**, `coupon_usage` NOT recorded, `total_used` NOT incremented, structured `coupon_validation_failed_at_final_order` warning logged, response `data.coupon_usage = {recorded: false, coupon_code, error: {code, field, detail}}`. Mirrors V1 Addendum A.3.
5. **Zero discount path** (POS sent `coupon_code` but `coupon_discount==0`) → unchanged from V1 (warn-log, skip).
6. **Replay** (same `order_id`) → idempotent, no `total_used` increment.

---

## 6. Indexes

**No new indexes required.** V1's `coupon_usage.(user_id, order_id)` partial unique index continues to provide V2 idempotency (one coupon per order, same key). V1's lookup indexes (`(user_id, coupon_id, customer_id)`, `(user_id, created_at)`) cover V2 query patterns.

If V2 analytics breakdown queries become hot (current expected volume: low), a future additive index `(user_id, discount_scope, created_at DESC)` can be added non-destructively.

---

## 7. QA results

### V1 regression — `python -m tests.qa_cr001c_c_coupon_v1`
```json
{ "total": 45, "passed": 45, "failed": 0 }
```

### V2 assertions — `python -m tests.qa_cr001c_c_coupon_v2_item_category`
```json
{ "total": 45, "passed": 45, "failed": 0 }
```

### Combined: **90/90 PASS.**

V2 coverage breakdown:
- Scope resolution (4)
- V1 sanity through extended code path (2)
- `available` endpoint V1+V2 mix + hints (6)
- ITEM_FLAT / ITEM_PERCENTAGE (food_id + item_id paths, qty cap) (3)
- CATEGORY_FLAT / CATEGORY_PERCENTAGE (category_id, category_name normalized, item_category id-fallback, item_category name-fallback, case-insensitive) (5)
- Error codes — MISSING / NO_ELIGIBLE / MIN_ITEM_QTY (6)
- Eligible subtotal math (qty*unit_price, line_total fallback, invalid-line drop) (3)
- Caps + mixed cart + per-line qty (4)
- Final-order recording (record once, idempotent replay, missing items skipped) (4)
- Analytics breakdown_by_scope (3)
- Admin CRUD compat (Pydantic round-trip for V2 row, toggle) (2)
- Loyalty + Wallet regression (untouched) (2)

---

## 8. Live HTTP smoke (against real POS user `pos_0001_restaurant_478`)

| Endpoint | Result |
|---|---|
| `GET /api/pos/coupons/available?customer_id=...&order_total=600&channel=pos` | 200, 8 coupons returned (4 V1 with `requires_cart_validation=false`+populated discount, 4 V2 with `requires_cart_validation=true`+null discount+hint). |
| `POST /api/pos/coupons/validate` ITEM_FLAT success with cart | 200, `success=true`, `discount_scope="item"`, `eligible_subtotal=200.0`, `computed_discount=50.0`, `final_amount_preview=450.0`, `matched_food_ids=["182039"]`. |
| `POST /api/pos/coupons/validate` item-scope without `items[]` | 200, `success=false`, `data.error={"code":"MISSING_ITEMS_FOR_ITEM_COUPON","field":"items","detail":"items[] required for this coupon scope"}`. |

Smoke fixtures cleaned up post-run. DB state: 0/0/0 for `coupons`/`coupon_usage`/`coupon_transactions`.

---

## 9. Compatibility / what stayed stable

- V1 ORDER_FLAT + ORDER_PERCENTAGE behave identically (V1 harness 45/45).
- V1 `validate` body without `items` for order-scope coupons unchanged.
- V1 `available` shape for order-scope coupons unchanged.
- V1 final-order recording for order-scope coupons unchanged.
- Idempotency key `(user_id, order_id)` unchanged.
- Variance tolerance (₹1.00 abs / 1% rel) unchanged.
- Stacking with loyalty (`stackable_with_loyalty` flag) unchanged.
- Analytics `total_coupons`, `coupons_used`, `discount_availed` top-level keys unchanged; `breakdown_by_scope` is additive.
- Loyalty code untouched.
- Wallet code untouched.
- Migration code untouched.
- `/app/memory/final/` untouched.
- 9 admin CRUD endpoints unchanged; Pydantic models add optional V2 fields with safe defaults.

---

## 10. Out-of-V2 reaffirmed

NOT implemented (per plan): BOGO, Buy X Get Y, every-Nth-item-free, happy-hour/time-window, free-item, wallet cashback, referral, coupon reversal/refund, multi-coupon-per-order, per-line discount allocation, POS cart auto-add free item, Wallet CR, Loyalty changes, production deployment.

---

## 11. Rollback

Feature-isolated. To disable V2:
- Remove cart-aware branch in `validate_coupon_for_customer` (revert to V1 dispatch).
- Remove `items` param wiring from `pos_validate_coupon` and `pos_order_webhook`.
- Drop `breakdown_by_scope` from `get_coupon_stats`.

No DB migration to undo. All V2 schema fields are optional → can stay in place harmlessly even after rollback.

---

## 12. Final status

`cr001c_coupon_v2_item_category_implementation_qa_passed_in_preview`

Ready for owner sign-off and joint POS-side integration handoff alongside V1.
