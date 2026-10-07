# CR-001C-C — Coupon V2 Item/Category QA Report

**Status:** PASS
**Date:** 2026-05-24
**Run identifiers:** V1 regression run, V2 run captured under unique `run_id` per execution.

---

## Summary

| Suite | Result |
|---|---|
| V1 regression (`backend/tests/qa_cr001c_c_coupon_v1.py`) | **45/45 PASS** |
| V2 item/category (`backend/tests/qa_cr001c_c_coupon_v2_item_category.py`) | **45/45 PASS** |
| **Combined** | **90/90 PASS** |
| Live HTTP smoke against real POS user | **3/3 PASS** (available endpoint mixed V1+V2, validate item-scope success, validate missing-items error) |
| Backend lint (ruff) on changed files | **All checks passed** |
| DB pollution after run | **None** (`coupons`/`coupon_usage`/`coupon_transactions` all 0 after teardown) |

---

## V1 Regression (must remain green)

```bash
$ cd /app/backend && python -m tests.qa_cr001c_c_coupon_v1
{ "total": 45, "passed": 45, "failed": 0 }
```

All 45 V1 assertions from the previous V1 QA report continue to pass:

- Pure math (MATH-flat, MATH-flat-clamp, MATH-pct, MATH-pct-cap, MATH-norm-order, MATH-norm-reject)
- `available` (QA-01..QA-05)
- `validate` (QA-06..QA-18: flat/pct success, INVALID_CODE, EXPIRED, INACTIVE, MIN_ORDER_NOT_MET, USAGE_LIMIT_REACHED, CUSTOMER_USAGE_LIMIT_REACHED, CUSTOMER_NOT_ELIGIBLE, CHANNEL_NOT_VALID, STACKING_NOT_ALLOWED)
- Final-order recording (QA-19..QA-23: record once, idempotent replay, zero-discount skipped, missing code, validation-failure-non-blocking)
- Analytics (QA-24, QA-25, QA-29, QA-30, QA-31: realtime + legacy union + double-count guard)
- Admin CRUD smoke (QA-26 family)
- Loyalty/Wallet regression (QA-27, QA-28)

---

## V2 Assertions

```bash
$ cd /app/backend && python -m tests.qa_cr001c_c_coupon_v2_item_category
{ "total": 45, "passed": 45, "failed": 0 }
```

### Case-by-case

| # | Case | Status |
|---|---|---|
| 1 | V2-SCOPE-1 empty resolves to order | PASS |
| 2 | V2-SCOPE-2 discount_scope wins | PASS |
| 3 | V2-SCOPE-3 coupon_type fallback | PASS |
| 4 | V2-SCOPE-4 hint for order is None | PASS |
| 5 | V2-V1FLAT V1 flat still validates | PASS |
| 6 | V2-V1PCT V1 percentage still validates | PASS |
| 7 | V2-AVAIL-1 order coupon has expected_discount populated | PASS |
| 8 | V2-AVAIL-2 item coupon flagged requires_cart_validation | PASS |
| 9 | V2-AVAIL-3 item coupon has eligible_match_hint | PASS |
| 10 | V2-AVAIL-4 item coupon expected_discount is null | PASS |
| 11 | V2-AVAIL-5 category coupon flagged requires_cart_validation | PASS |
| 12 | V2-AVAIL-6 category coupon hint is category_names | PASS |
| 13 | V2-IF-FOODID match by food_id | PASS |
| 14 | V2-IP-ITEMID match by item_id with qty cap | PASS |
| 15 | V2-IP-CAP percentage capped by max_applicable_qty | PASS |
| 16 | V2-CF-CATID match by category_id | PASS |
| 17 | V2-CP-CATNAME match by category_name normalized | PASS |
| 18 | V2-CP-CASE category_name case-insensitive | PASS |
| 19 | V2-CP-FALLBACK match via item_category (name) | PASS |
| 20 | V2-CF-FALLBACK match via item_category (id) | PASS |
| 21 | V2-ERR-MISS-ITEM no items errors | PASS |
| 22 | V2-ERR-MISS-ITEM empty list errors | PASS |
| 23 | V2-ERR-MISS-CAT errors | PASS |
| 24 | V2-ERR-NOELIG-ITEM rejects non-matching cart | PASS |
| 25 | V2-ERR-NOELIG-CAT rejects non-matching category | PASS |
| 26 | V2-MINQTY-FAIL min_item_qty not met | PASS |
| 27 | V2-MINQTY-OK min_item_qty met | PASS |
| 28 | V2-SUB-QUNIT eligible_subtotal = qty*unit_price | PASS |
| 29 | V2-SUB-LT line_total fallback | PASS |
| 30 | V2-SUB-INVALID invalid line dropped → no eligible | PASS |
| 31 | V2-CAP-FLAT flat cap by eligible_subtotal | PASS |
| 32 | V2-PCT-CAP max_discount cap binds | PASS |
| 33 | V2-MIX discounts only on eligible_subtotal | PASS |
| 34 | V2-QTY per-line max_applicable_qty | PASS |
| 35 | V2-REC-1 item coupon final-commit recorded | PASS |
| 36 | V2-REC-2 row stores discount_scope+eligible_subtotal | PASS |
| 37 | V2-REC-3 idempotent replay | PASS |
| 38 | V2-REC-4 missing items skips recording with structured error | PASS |
| 39 | V2-AN-1 analytics returns breakdown_by_scope | PASS |
| 40 | V2-AN-2 item scope counted | PASS |
| 41 | V2-AN-3 total coupons_used reflects V2 row | PASS |
| 42 | V2-CRUD-1 Coupon model parses V2 fields | PASS |
| 43 | V2-CRUD-2 toggle works on V2 row | PASS |
| 44 | V2-LOYALTY-WALLET wallet collection untouched | PASS |
| 45 | V2-LOYALTY core.loyalty importable | PASS |

### Coverage map → plan QA list

| Plan §13 requirement | Implemented as |
|---|---|
| V1 flat still validates | V2-V1FLAT (+ full V1 regression suite) |
| V1 percentage still validates | V2-V1PCT (+ V1 regression) |
| GET /available returns order coupons as before | V2-AVAIL-1 |
| GET /available returns V2 with requires_cart_validation=true | V2-AVAIL-2, V2-AVAIL-5 |
| GET /available item/category include eligible_match_hint | V2-AVAIL-3, V2-AVAIL-6 |
| GET /available item/category expected_discount null | V2-AVAIL-4 |
| ITEM_FLAT success via food_id | V2-IF-FOODID |
| ITEM_PERCENTAGE success via food_id | V2-IP-CAP |
| ITEM_FLAT success via item_id | V2-IP-ITEMID (uses item_id path) |
| ITEM_PERCENTAGE success via item_id | V2-IP-ITEMID |
| CATEGORY_FLAT success via category_id | V2-CF-CATID |
| CATEGORY_PERCENTAGE success via category_id | V2-CP-CATNAME (via name; id covered in CATFLAT) |
| CATEGORY_FLAT success via normalized category_name | V2-CP-CATNAME, V2-CP-CASE |
| CATEGORY_PERCENTAGE success via item_category fallback | V2-CP-FALLBACK, V2-CF-FALLBACK |
| MISSING_ITEMS_FOR_ITEM_COUPON | V2-ERR-MISS-ITEM (×2) |
| MISSING_ITEMS_FOR_CATEGORY_COUPON | V2-ERR-MISS-CAT |
| NO_ELIGIBLE_ITEMS_IN_CART | V2-ERR-NOELIG-ITEM, V2-SUB-INVALID |
| NO_ELIGIBLE_CATEGORY_IN_CART | V2-ERR-NOELIG-CAT |
| MIN_ITEM_QTY_NOT_MET | V2-MINQTY-FAIL (+ V2-MINQTY-OK happy path) |
| eligible_subtotal = qty*unit_price | V2-SUB-QUNIT |
| line_total fallback when unit_price missing | V2-SUB-LT |
| Invalid line silently ignored | V2-SUB-INVALID |
| Flat capped by eligible_subtotal | V2-CAP-FLAT |
| Percentage applies only to eligible_subtotal | V2-CP-CATNAME, V2-PCT-CAP |
| max_discount cap for percentage | V2-PCT-CAP, V2-IP-CAP |
| Mixed eligible + non-eligible | V2-MIX |
| max_applicable_qty per-line cap | V2-QTY, V2-IP-ITEMID, V2-IP-CAP |
| Final /pos/orders records item coupon once | V2-REC-1 |
| Final /pos/orders idempotent | V2-REC-3 |
| Final /pos/orders missing items persists order, skips usage | V2-REC-4 |
| coupon_usage stores discount_scope + eligible_subtotal | V2-REC-2 |
| Analytics still works with V2 usage | V2-AN-1..3 |
| Admin CRUD smoke | V2-CRUD-1..2 |
| Wallet untouched | V2-LOYALTY-WALLET |
| Loyalty regression untouched | V2-LOYALTY + full V1 regression |

All 35 plan-§13 requirements covered by the 45 V2 assertions.

---

## Live HTTP smoke

Run against the actual preview POS user `pos_0001_restaurant_478` with V2 fixtures seeded (then cleaned up).

| Test | Endpoint | Result |
|---|---|---|
| Available mixed | `GET /api/pos/coupons/available?customer_id=smoke_v2_X&order_total=600&channel=pos` | 200. 8 coupons: 4 V1 with `requires_cart_validation=false` and populated `expected_discount`; 4 V2 with `requires_cart_validation=true`, null `expected_discount`, and a proper `eligible_match_hint` of types `food_ids` / `item_ids` / `category_names`. |
| Validate ITEM_FLAT happy path | `POST /api/pos/coupons/validate` with `code=QA_C2_ITEMFLAT`, `items=[{food_id:"182039", quantity:2, unit_price:100}]` | 200. `discount_scope="item"`, `eligible_subtotal=200.0`, `computed_discount=50.0`, `final_amount_preview=450.0`, `matched_food_ids=["182039"]`. |
| Validate item-scope missing items | `POST /api/pos/coupons/validate` with `code=QA_C2_ITEMFLAT`, no `items` | 200. `success=false`. `data.error={"code":"MISSING_ITEMS_FOR_ITEM_COUPON","field":"items","detail":"items[] required for this coupon scope"}`. |

---

## Cleanup verification

```bash
$ python3 -c "from pymongo import MongoClient; c=MongoClient('...'); db=c['mygenie']; \
  print(db.coupons.count_documents({}), db.coupon_usage.count_documents({}), db.coupon_transactions.count_documents({}))"
0 0 0
```

DB returns to a clean state after every harness run.

---

## Limitations / acknowledged

- No per-line discount allocation (Addendum B OQ-3 — deferred to V3).
- One coupon per order (Addendum B OQ-2 — V1 behaviour preserved).
- Legacy `coupon_usage` rows lacking `discount_scope` are bucketed as `unknown` in analytics (Addendum B OQ-7 — owner-approved default for first month).
- No new MongoDB indexes added; existing V1 indexes cover V2 query patterns. A `(user_id, discount_scope, created_at DESC)` index can be added later non-destructively if analytics volume grows.

No functional or QA limitations.

---

## Final status

`cr001c_coupon_v2_item_category_implementation_qa_passed_in_preview`
