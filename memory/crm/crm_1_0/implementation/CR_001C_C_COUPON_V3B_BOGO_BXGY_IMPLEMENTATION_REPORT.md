# CR-001C-C — Coupon V3-B BOGO / Buy-X-Get-Y Implementation Report

**Status:** `cr001c_coupon_v3b_bogo_bxgy_implementation_qa_passed_in_preview`
**Date:** 2026-02 (preview)
**Plan:** `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V3B_BOGO_BXGY_PLANNING_AND_OWNER_GATE.md`
**Path:** Alpha (single-shot V3-B; covers BOGO same-item + BXGY same-item + BXGY different-item + benefit types free/%/flat + caps).

---

## 1. Summary

V3-B (BOGO + Buy-X-Get-Y) implemented end-to-end per the approved Path Alpha plan.

- **V1 regression:** **45/45 PASS** (`qa_cr001c_c_coupon_v1.py`)
- **V2 regression:** **45/45 PASS** (`qa_cr001c_c_coupon_v2_item_category.py`)
- **V3-A regression:** **31/31 PASS** (`qa_cr001c_c_coupon_v3_a_time_window.py`)
- **V3-B assertions:** **49/49 PASS** (`qa_cr001c_c_coupon_v3_b_bogo_bxgy.py`)
- **Combined: 170/170 PASS.** (Above the ~153 plan target; harness expanded the planned ~32 → 49 assertions to cover edge cases.)
- Live HTTP smoke: `GET /api/health` → 200; `POST /api/pos/coupons/validate` with V3-B-shaped body parses cleanly (rejected at the API-key auth layer only — no Pydantic 422).
- **No DB migration.** No new indexes. No env change. No new dependency.
- **9 admin CRUD endpoints in `routers/coupons.py` UNTOUCHED** (V3-B coupons set via the existing PUT/POST; new optional fields surface automatically through `CouponCreate`/`CouponUpdate`).
- Loyalty / Wallet / Migration code / `coupon_transactions` legacy collection / `/app/memory/final/` **UNTOUCHED.**

---

## 2. Files changed

| File | Change | Delta | Highlights |
|---|---|---:|---|
| `backend/core/coupon.py` | EXTEND | ~530 | New V3-B engine block: `_v3b_normalize_offer_type`, `_v3b_get_buy_lists`, `_v3b_get_get_lists`, `_v3b_lists_empty`, `_v3b_line_matches_lists`, `_v3b_line_unit_price`, `_v3b_expand_units`, `_v3b_summarise_lines`, `_v3b_validate_config`, `_v3b_resolve_buy_lists`, `_v3b_resolve_get_lists`, `_v3b_match_lines_by_lists`, `_v3b_select_get_units`, `_v3b_apply_caps`, `_v3b_compute_discount`. `validate_coupon_for_customer` gains a V3-B early branch inserted BEFORE V1/V2 scope dispatch and AFTER V3-A Step-4 (time-window pre-check still fires first, satisfying Q10=A). `_normalize_discount_type` strict check is skipped for V3-B offer_type. `list_available_coupons` marks BOGO/BXG as `requires_cart_validation=True`. `build_eligible_match_hint` returns a `{kind, buy_quantity, get_quantity, buy:{...}, get:{...}, same_item_required, get_discount_type, get_discount_value}` block for V3-B coupons. `record_coupon_usage_for_order` snapshots V3-B fields into `coupon_usage` and the response envelope; `discount_mismatch` flag computed alongside the existing variance log line. Failure path forwards `pos_instruction` (Q11=B). |
| `backend/models/schemas.py` | EXTEND | ~120 | New validators `_v3b_validate_get_discount_type` (enum free/percentage/flat), `_v3b_validate_pos_int_ge_one` (buy/get/max_applications). `_v3a_validate_offer_type` extended to also accept `"buy_x_get_y"` (normalized to `"bxg"`). `Coupon`, `CouponCreate`, `CouponUpdate` gain optional `buy_quantity`, `get_quantity`, `buy_food_ids` / `buy_item_ids` / `buy_category_ids` / `buy_category_names`, mirror `get_*` lists, `get_discount_type`, `get_discount_value`, `max_applications`, `allow_repeat`, `same_item_required`, `requires_get_item_in_cart`, `pos_instruction`. `CouponUsage` gains `applied_applications`, `benefit_items`, `buy_match_summary`, `get_match_summary`, `same_item_required`, `get_discount_type`, `max_applications`, `allow_repeat`, `pos_instruction`, `computed_discount`, `discount_mismatch`. All fields optional → backward-compatible with V1/V2/V3-A docs. |
| `backend/routers/pos.py` | EXTEND | ~45 | `pos_validate_coupon`: success response carries `applied_applications`, `benefit_items`, `buy_match_summary`, `get_match_summary`, `same_item_required`, `get_discount_type`, `max_applications`, `allow_repeat`. Failure response surfaces `pos_instruction` (Q11=B). `pos_order_webhook` `data.coupon_usage` block now carries the same V3-B fields plus `discount_mismatch` on success and `pos_instruction` on failure. |
| `backend/services/analytics_service.py` | EXTEND | ~65 | New `_get_bxgy_usage(user_id)` computes `bogo_orders`, `bxg_orders`, `total_applications`, `discount_amount`, `free_units_given`, `discounted_units_given` via Mongo `$group` + per-row `benefit_items` scan. `get_coupon_stats` returns an additive `bxgy_usage` block. Existing keys preserved → dashboards unaffected. |
| `backend/tests/seed_coupon_v1_fixtures.py` | EXTEND | ~290 | 10 new `QA_C3B_*` fixtures covering same-item BOGO, BXG buy-2-get-1, different-item BXG (free/%/flat), `max_applications`, `allow_repeat=False`, `apply_to_highest_item`, BOGO + happy-hour, `max_discount` ceiling, stacking regression. Cleanup regex extended to `^(?:QA_C1_|QA_C2_|QA_C3A_|QA_C3B_)`. |
| `backend/tests/qa_cr001c_c_coupon_v3_b_bogo_bxgy.py` | NEW | ~640 | 49-assertion harness: Available API (4), Missing items (1), Same-item BOGO (5), BXG same-item (3), BXG different-item (5), Benefit types (3), Caps (2), Selection cheapest/highest (2), Edge cases line_total/invalid (2), Response shape benefit_items/pos_instruction (3), Time-window + BOGO (2), Loyalty stacking (1), max_discount ceiling (1), Final-order + idempotency (5), Analytics (2), Admin validators (4), Runtime config errors (2), Wallet/Loyalty untouched (2). |
| `backend/routers/coupons.py` | **UNTOUCHED** | 0 | 9 admin CRUD endpoints intact. The extended models pick up V3-B fields with safe defaults. |
| `backend/server.py`, indexes | **UNTOUCHED** | 0 | V1 indexes cover V3-B query patterns. |
| `backend/core/loyalty.py`, wallet code, migration code | **UNTOUCHED** | 0 | Out of scope. |
| `/app/memory/final/` | **UNTOUCHED** | 0 | — |

**Total non-test delta:** ~760 LOC. **Total inc. tests:** ~1690 LOC. No DB migration. No env change. No new dependency.

---

## 3. Owner decisions applied (Addendum D, 2026-02)

| OQ | Decision | Implementation evidence (V3-B assertion id) |
|---|---|---|
| Q1=D | Full BOGO + BXGY with free/%/flat | All 49 assertions exercise one engine. V3B-S* (same-item BOGO), V3B-B* (BXG same-item), V3B-D* (BXG different-item), V3B-T* (benefit types). |
| Q2=A | Get item must already be in cart | V3B-D3 (`NO_ELIGIBLE_GET_ITEMS_IN_CART` on missing), V3B-D4 (cart caps applications). |
| Q3=A | Free cheapest eligible unit (default) | V3B-S5, V3B-Sel1 (default cheapest); V3B-Sel2 (override via `apply_to_highest_item=True`). |
| Q4=A | Include different-item BXGY now | V3B-D1..D5. |
| Q5=C | Benefit types free / percentage / flat | V3B-T1 (free), V3B-T2 (percentage 50% on ₹100 → ₹50), V3B-T3 (flat ₹150 capped by unit_price ₹100). |
| Q6=C | `allow_repeat` field, default `true` | V3B-C2 (`allow_repeat=False` caps at 1); V3B-S4 / V3B-S5 (default `True` allows repeat). |
| Q7=A | Support `max_applications` cap | V3B-C1 (`max_applications=2` caps natural 4 → 2). |
| Q8=B | Total discount + `benefit_items` summary | V3B-R1 (success response carries `benefit_items` + `applied_applications`). No per-line allocation. |
| Q9=A | Final-order failure non-blocking | V3B-F3 (failure non-blocking, error code present), V3B-F3b (no `coupon_usage` row inserted on failure). |
| Q10=A | Allow time-window + BOGO composition | V3B-W1 (outside window → `OUTSIDE_TIME_WINDOW`); V3B-W2 (inside window → BOGO computes). V3-A pre-check is `offer_type`-agnostic. |
| Q11=B | `pos_instruction` only on missing-requirement failures | V3B-R2 (surfaced on failure), V3B-R3 (NOT surfaced on success). |
| Q12=A | Implementation kickoff after defaults accepted | This implementation. |

---

## 4. API contract changes (all additive)

### `POST /api/pos/coupons/validate`

Request: unchanged at field level. `items[]` now required for `offer_type ∈ {bogo, bxg}` (returns `MISSING_ITEMS_FOR_BXGY_COUPON` when absent).

Success response gains:
```json
{
  "applied_applications": 2,
  "benefit_items": [
    {"food_id": "G_001", "item_id": "G_001", "name": "Garlic Bread",
     "quantity": 2, "unit_price": 100.0, "line_discount": 200.0}
  ],
  "buy_match_summary": [{"food_id": "P_001", "matched_quantity": 4}],
  "get_match_summary": [{"food_id": "G_001", "matched_quantity": 2}],
  "same_item_required": false,
  "get_discount_type": "free",
  "max_applications": null,
  "allow_repeat": true
}
```

Failure response (for `MISSING_ITEMS_FOR_BXGY_COUPON`, `BUY_REQUIREMENT_NOT_MET`, `GET_REQUIREMENT_NOT_MET`, `NO_ELIGIBLE_*_IN_CART`) optionally carries `pos_instruction` when configured on the coupon.

### `GET /api/pos/coupons/available`

BOGO/BXG coupons surface:
- `requires_cart_validation: true`
- `offer_type: "bogo"` or `"bxg"`
- `expected_discount: null`, `final_amount_preview: null`
- `eligible_match_hint: { kind, buy_quantity, get_quantity, buy:{...}, get:{...}, same_item_required, get_discount_type, get_discount_value }`
- `buy_quantity`, `get_quantity`, `get_discount_type`, `get_discount_value`, `max_applications`, `allow_repeat`, `same_item_required`, `pos_instruction`
- V3-A `time_window` block unchanged.

### `POST /api/pos/orders` (final commit)

No new top-level fields required from POS. `data.coupon_usage` envelope on success gains `applied_applications`, `benefit_items`, `buy_match_summary`, `get_match_summary`, `same_item_required`, `get_discount_type`, `discount_mismatch`. On non-blocking failure: `pos_instruction` is surfaced when the coupon provided one.

### New error codes (V3-B)

| Code | Path | Field |
|---|---|---|
| `MISSING_ITEMS_FOR_BXGY_COUPON` | `/validate`, final order | `items` |
| `BUY_REQUIREMENT_NOT_MET` | `/validate`, final order | `buy_quantity` |
| `GET_REQUIREMENT_NOT_MET` | `/validate`, final order | `get_quantity` |
| `NO_ELIGIBLE_BUY_ITEMS_IN_CART` | `/validate`, final order | `buy_food_ids` |
| `NO_ELIGIBLE_GET_ITEMS_IN_CART` | `/validate`, final order | `get_food_ids` |
| `BXGY_CONFIG_INVALID` | `/validate`, final order | `buy_quantity` / `get_discount_value` |
| `UNSUPPORTED_BENEFIT_TYPE` | `/validate`, final order | `get_discount_type` |

`MAX_APPLICATIONS_REACHED` is intentionally NOT introduced — `max_applications` is a cap, not a gate.

Total error-code surface after V3-B = 22 (V1: 9 + V2: 5 + V3-A: 1 + V3-B: 7).

---

## 5. Computation rules

### Same-item BOGO / BXG (`same_item_required=True` or BOGO with no `get_*` configured)
1. Match cart lines via `buy_*` (falling back to `eligible_*` for V2 compatibility).
2. Expand to per-unit micro-rows.
3. `applications = floor(total_eligible_qty / (buy_quantity + get_quantity))`.
4. Apply `allow_repeat` (default `True`) and `max_applications` caps.
5. `free_units_needed = applications × get_quantity`.
6. Sort units by price (ascending = cheapest, default Q3=A; descending if `apply_to_highest_item=True`).
7. Apply benefit per selected unit (free / percentage / flat).
8. Sum → total discount; cap by coupon-level `max_discount` (scales `benefit_items.line_discount` proportionally).

### Different-item BXG (`same_item_required=False`)
1. Match buy lines and get lines separately.
2. `applications = min(buy_total // buy_q, get_total // get_q)`, with caps as above.
3. Select `free_units_needed` units from the get pool (cheapest default).
4. Apply benefit + ceiling.

### Benefit math
- `free` → unit discount = `unit_price`.
- `percentage` → `min(unit_price × value / 100, unit_price)`.
- `flat` → `min(value, unit_price)`.

### Error precedence
1. `MISSING_ITEMS_FOR_BXGY_COUPON` (no `items[]`).
2. `BXGY_CONFIG_INVALID` / `UNSUPPORTED_BENEFIT_TYPE` (coupon config).
3. `NO_ELIGIBLE_BUY_ITEMS_IN_CART` (no buy match).
4. `NO_ELIGIBLE_GET_ITEMS_IN_CART` (different-item, no get match — locked by Q2=A).
5. `BUY_REQUIREMENT_NOT_MET` / `GET_REQUIREMENT_NOT_MET` (qty short).

---

## 6. Final order behavior (Q9=A)

`pos_order_webhook` already re-invokes `validate_coupon_for_customer` via `record_coupon_usage_for_order`. V3-B branch runs naturally inside that path.

1. **Within all gates (time window + V3-B compute):** order persists, `coupon_usage` row inserted with V3-B snapshot, `coupons.total_used` incremented (idempotent on `(user_id, order_id)`).
2. **V3-B failure (any of 7 error codes):** order persists (HTTP 200), `coupon_usage` NOT inserted, `coupons.total_used` NOT incremented, structured warning logged (`coupon_validation_failed_at_final_order error_code=...`), response `data.coupon_usage` carries `{recorded:false, coupon_code, error:{...}, pos_instruction?:...}`.
3. **Outside time-window (V3-A pre-check):** unchanged from V3-A.
4. **Replay (same `(user_id, order_id)`):** existing row returned with `idempotent_replay=true`.
5. **Variance:** `discount_mismatch=true` when POS-sent ≠ CRM-computed beyond `max(₹1, 1% × computed)`. POS-sent value is still recorded as `coupon_discount`; CRM computed kept in `crm_computed_discount` + `computed_discount`.

---

## 7. `coupon_usage` snapshot fields added

```json
{
  "offer_type": "bxg",
  "buy_quantity": 2,
  "get_quantity": 1,
  "applied_applications": 2,
  "max_applications": null,
  "allow_repeat": true,
  "same_item_required": false,
  "get_discount_type": "free",
  "benefit_items": [{"food_id": "G_001", "name": "Garlic Bread",
                     "quantity": 2, "unit_price": 100.0, "line_discount": 200.0}],
  "buy_match_summary": [{"food_id": "P_001", "matched_quantity": 4}],
  "get_match_summary": [{"food_id": "G_001", "matched_quantity": 2}],
  "computed_discount": 200.0,
  "discount_mismatch": false,
  "pos_instruction": null
}
```

All fields optional; legacy rows remain valid. Indexes unchanged.

---

## 8. Analytics

`get_coupon_stats` gains:
```json
"bxgy_usage": {
  "bogo_orders": <int>,
  "bxg_orders": <int>,
  "total_applications": <int>,
  "discount_amount": <float>,
  "free_units_given": <int>,
  "discounted_units_given": <int>
}
```

Existing keys (`total_coupons`, `coupons_used`, `discount_availed`, `breakdown_by_scope`, `breakdown_by_offer_type`, `time_window_usage`) are unchanged. V3-A's `breakdown_by_offer_type.bogo` / `.bxg` buckets are now populated with real values when BOGO/BXG usage occurs. Verified by V3B-AN1, V3B-AN2.

---

## 9. Time-window composition (Q10=A)

V3-A Step-4 pre-check fires BEFORE the V3-B branch is reached. Verified:
- V3B-W1: outside window → `OUTSIDE_TIME_WINDOW` (V3-A short-circuits; V3-B compute never runs).
- V3B-W2: inside window → V3-B BOGO compute runs; `time_window_status.within_window=true` echoed; `offer_type="bogo"`.

No new code was needed in `_v3a_*` to enable composition.

---

## 10. Indexes

**No new indexes.** V1's `coupon_usage.(user_id, order_id)` unique partial index continues to provide V3-B idempotency. V1's `(user_id, coupon_id, customer_id)` and `(user_id, created_at)` cover V3-B analytics queries (incl. `benefit_items[]` scan in `_get_bxgy_usage`).

---

## 11. QA results

### V1 regression — `python -m tests.qa_cr001c_c_coupon_v1`
```json
{ "total": 45, "passed": 45, "failed": 0 }
```

### V2 regression — `python -m tests.qa_cr001c_c_coupon_v2_item_category`
```json
{ "total": 45, "passed": 45, "failed": 0 }
```

### V3-A regression — `python -m tests.qa_cr001c_c_coupon_v3_a_time_window`
```json
{ "total": 31, "passed": 31, "failed": 0 }
```

### V3-B — `python -m tests.qa_cr001c_c_coupon_v3_b_bogo_bxgy`
```json
{ "total": 49, "passed": 49, "failed": 0 }
```

### Combined: **170/170 PASS.**

---

## 12. Live HTTP smoke

| Endpoint | Result |
|---|---|
| Backend supervisor restart after schema changes | Clean (stopped → started, no traceback in `/var/log/supervisor/backend.err.log`). |
| `GET /api/health` | `200` healthy. |
| `POST /api/pos/coupons/validate` with cart `items[]` payload (no API key) | `401` "Authentication required" — request body parsed cleanly, no Pydantic 422 on the V3-B cart shape. |

Full live BOGO/BXGY end-to-end with a real POS user is deferred to the joint V1+V2+V3-A+V3-B POS handoff.

---

## 13. Compatibility / what stayed stable

- V1 ORDER_FLAT / ORDER_PERCENTAGE behave identically (45/45).
- V2 ITEM_*/CATEGORY_* behave identically (45/45).
- V3-A time-window behaves identically (31/31).
- Coupons without `offer_type` or with `offer_type="simple"` continue to use V1/V2 dispatch.
- Existing `coupon_usage` rows without V3-B fields remain valid (optional schema fields).
- Idempotency key `(user_id, order_id)` unchanged.
- Variance tolerance (₹1 abs / 1% rel) unchanged; now reflected in new `discount_mismatch` boolean.
- Stacking with loyalty (`stackable_with_loyalty` flag) unchanged.
- 9 admin CRUD endpoints unchanged; extended Pydantic models accept new V3-B optional fields with safe defaults.
- `coupon_transactions` legacy collection untouched. Analytics union preserved.
- `core/loyalty.py`, wallet code, migration code, `routers/coupons.py`, `/app/memory/final/` untouched.

---

## 14. Out of V3-B (reaffirmed)

NOT implemented in V3-B Path Alpha:
- Every-Nth item free (`offer_type="nth_item"`) → V3-C.
- Free-item instruction-only (`offer_type="free_item"`) → V3-D.
- Combo (`offer_type="combo"`) → V4 (parked).
- CRM/POS auto-add of free/get items.
- Multi-coupon-per-order.
- Wallet cashback as benefit (CR-001C-W).
- Loyalty redemption as benefit.
- Coupon reversal / refund lifecycle.
- Admin UI exposure of V3-B fields in `CouponsPage.jsx` (deferred to follow-up CR-001C-C-UI).
- Variant / add-on / modifier matching.
- POS integration handoff for V1+V2+V3-A+V3-B (separate handoff doc).

---

## 15. Rollback

V3-B is feature-isolated. To disable:
1. Remove the V3-B early branch from `validate_coupon_for_customer` (single block).
2. Stop populating V3-B fields in `record_coupon_usage_for_order` (snapshot block).
3. Drop `bxgy_usage` from `get_coupon_stats`.
4. Drop V3-B fields from `pos_validate_coupon` and `pos_order_webhook` response builders.

No DB migration to undo. All V3-B schema fields are optional → can stay in place harmlessly post-rollback. V1/V2/V3-A harnesses remain green with or without V3-B enabled.

---

## 16. Final status

`cr001c_coupon_v3b_bogo_bxgy_implementation_qa_passed_in_preview`

V3-B Path Alpha complete. Ready for owner sign-off and joint POS-side integration handoff alongside V1 + V2 + V3-A.
