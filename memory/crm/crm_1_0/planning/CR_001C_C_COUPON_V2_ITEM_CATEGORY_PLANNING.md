# CR-001C-C — Coupon V2 Item/Category Coupon Planning

**Module:** CR-001C-C (Coupon) — V2 item/category planning
**Date:** 2026-05-24
**Author:** CRM Team
**Prerequisites:**
- V1 status: `cr001c_coupon_v1_implementation_qa_passed_in_preview`
- V1 implementation report: `/app/memory/crm/crm_1_0/implementation/CR_001C_C_COUPON_V1_IMPLEMENTATION_REPORT.md`
- V1 plan + addendum: `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V1_IMPLEMENTATION_PLAN.md`

---

## 1. Executive Summary

Coupon V2 adds **item-level** and **category-level** coupons on top of V1. The change is purely additive at the data, service, and API layers — V1 (ORDER_FLAT / ORDER_PERCENTAGE) remains the **default scope** and continues to work without modification.

Approach:
- Introduce a single new **`discount_scope`** field on `coupons` (`"order"` | `"item"` | `"category"`) — a discriminator separate from the existing `discount_type` (`"flat"` | `"percentage"`). This composition gives us **4 V2 types** (ITEM_FLAT, ITEM_PERCENTAGE, CATEGORY_FLAT, CATEGORY_PERCENTAGE) without exploding the type space and without renaming any V1 field.
- Add eligibility/exclusion lists (`eligible_item_ids`, `eligible_food_ids`, `eligible_category_ids`, `eligible_category_names`, `excluded_item_ids`, `excluded_category_ids`) and `min_item_qty` / `max_applicable_qty`. All optional, defaulting to V1 behaviour.
- Add an `items: List[POSCartItem]` array to the `POST /api/pos/coupons/validate` body. The field is **optional for V1 order-scope coupons** but **required for V2 item/category coupons** — CRM returns a structured `MISSING_ITEMS_FOR_ITEM_COUPON` / `MISSING_ITEMS_FOR_CATEGORY_COUPON` error if absent.
- Keep `GET /api/pos/coupons/available` as a **query-only endpoint** that returns *possibly eligible* item/category coupons with a per-coupon `requires_cart_validation: true` flag and `eligible_match_hint` so POS can show "applicable on Pizzas" before adding the item. Final eligibility runs through `/validate` or final-order recording (recommendation **Option D-with-A-hint** — see §7.2).
- Final `/api/pos/orders` continues to be the commit point. The `items[]` from the order payload is used for server-side V2 revalidation; recorded `coupon_usage` rows gain `eligible_item_ids`, `eligible_category_ids`, and `coupon_scope` so analytics can break down by scope.
- One coupon per order remains the V1 invariant (Addendum A.5). The idempotency key stays `(user_id, order_id)`.

V2 does NOT include BOGO, Buy-X-Get-Y, every-Nth-free, happy-hour/time-window, free-item, wallet cashback, referral, coupon reversal, Wallet CR, or Loyalty changes — those remain V3+.

---

## 2. Inputs Reviewed

| # | Document / Code | Source |
|---|---|---|
| 1 | `/app/memory/PRD.md` | Top-level CR-001C-C status |
| 2 | `/app/memory/crm/crm_1_0/planning/CR_001_INDEX.md` | CR-001C-C row |
| 3 | `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_EXISTING_SYSTEM_CAPABILITY_AUDIT.md` | Capability baseline |
| 4 | `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_SCRAP_VS_KEEP_DECISION.md` | Option B architecture |
| 5 | `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V1_OWNER_DECISIONS.md` | Q1–Q6 frozen answers |
| 6 | `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V1_IMPLEMENTATION_PLAN.md` + Addendum A.1–A.7 | V1 contract + owner clarifications |
| 7 | `/app/memory/crm/crm_1_0/implementation/CR_001C_C_COUPON_V1_IMPLEMENTATION_REPORT.md` | V1 implementation outcome (45/45 QA) |
| 8 | `/app/memory/crm/crm_1_0/planning/POS3_0_BUG_108_API_INVENTORY_FOR_CRM_2026_05_22.md` | POS field inventory |
| 9 | `backend/core/coupon.py` | V1 service (5 fns + tolerances + index bootstrap) |
| 10 | `backend/routers/pos.py` lines 1026–1093 (`OrderItem`), 1130–1180 (POSOrderWebhook canonical coupon fields), 2400–2540 (V1 coupon endpoints), 1240–1500 (`pos_order_webhook`) | Existing POS contract |
| 11 | `backend/routers/coupons.py` (full 238 LOC) | 9 admin CRUD endpoints (must remain unchanged) |
| 12 | `backend/models/schemas.py` lines 460–560 (Coupon models + POSCouponValidateRequest) | V1 model state |
| 13 | `backend/services/analytics_service.py::get_coupon_stats` | Analytics path |
| 14 | `backend/tests/qa_cr001c_c_coupon_v1.py` + `seed_coupon_v1_fixtures.py` | V1 QA harness (32 cases → 45/45) |
| 15 | `order_items` collection (live sample, 18,188 rows) | Confirmed schema for live POS payloads |

### Live data-shape verification (sample row)

```
{
  id, order_id, customer_id, user_id,
  item_name: "Veggie Pizza",
  pos_food_id: 125229,            # numeric in DB, string in OrderItem alias `item_id`
  item_category: 3411,            # numeric/string single field — IS a category identifier
  item_qty: 1, item_price: 70.0,
  ...
}
```

> Critical insight: `item_category` in `order_items` is **one field that carries either a category-id (numeric) or a category-name (string) depending on POS**. CRM cannot universally assume `category_id` vs `category_name`. V2 matching must support both.

---

## 3. V1 Baseline (must remain stable)

| V1 capability | Behaviour to preserve |
|---|---|
| `ORDER_FLAT` + `ORDER_PERCENTAGE` | Default scope. All current QA must remain green. |
| `GET /api/pos/coupons/available` (query-only) | Continues to return `discount_scope="order"` coupons with `expected_discount`. V2 adds new `discount_scope` and `requires_cart_validation` fields — strictly additive. |
| `POST /api/pos/coupons/validate` (JSON body) | New optional `items[]` field added. Body without `items` still validates V1 order-scope coupons exactly as today. V1 errors `error.code` unchanged. |
| Final `/api/pos/orders` recording | Same flow + same idempotency `(user_id, order_id)`. `items[]` reused for V2 revalidation. |
| Analytics union | `coupon_usage` + `coupon_transactions` continues. New scope breakdowns are additive. |
| 9 admin CRUD endpoints | Unchanged. Only the model gains new optional fields. |
| Loyalty stacking (Q2=C, `stackable_with_loyalty`) | Applies to all scopes identically. |
| Wallet | Untouched (Q3=D). |
| `core/loyalty.py` | Untouched. |
| `/app/memory/final/` | Untouched. |

---

## 4. V2 Scope

### In-V2
1. New `discount_scope` field on `coupons`: `"order"` (default) | `"item"` | `"category"`.
2. Four new effective coupon types: `ITEM_FLAT`, `ITEM_PERCENTAGE`, `CATEGORY_FLAT`, `CATEGORY_PERCENTAGE` (combinations of `discount_scope` + existing `discount_type`).
3. New eligibility fields: `eligible_item_ids`, `eligible_food_ids`, `eligible_category_ids`, `eligible_category_names`, `excluded_item_ids`, `excluded_category_ids`.
4. New quantity fields: `min_item_qty`, `max_applicable_qty`, `apply_to_cheapest_item`, `apply_to_highest_item` (last two: bool flags for percentage-on-subset selection).
5. POS `validate` body extension: optional `items: List[POSCartItem]`. Required for item/category scopes.
6. POS `available` response extension: per-coupon `discount_scope`, `requires_cart_validation`, and `eligible_match_hint`.
7. Final-order recording: record `eligible_item_ids`, `eligible_category_ids`, `discount_scope` on `coupon_usage` rows for analytics-by-scope.
8. Analytics: new scope-breakdown counts/sums on `get_coupon_stats` (additive, not replacing existing keys).
9. New structured error codes: `MISSING_ITEMS_FOR_ITEM_COUPON`, `MISSING_ITEMS_FOR_CATEGORY_COUPON`, `NO_ELIGIBLE_ITEMS_IN_CART`, `NO_ELIGIBLE_CATEGORY_IN_CART`, `MIN_ITEM_QTY_NOT_MET`.
10. QA harness extension `qa_cr001c_c_coupon_v2.py` + fixture additions (`QA_C2_ITEMFLAT`, `QA_C2_ITEMPCT`, `QA_C2_CATFLAT`, `QA_C2_CATPCT`).

### Out-of-V2 (deferred to V3+)
- BOGO (Buy One Get One Free)
- BUY_X_GET_Y
- EVERY_NTH_ITEM_FREE
- HAPPY_HOUR / TIME_WINDOW coupons
- FREE_ITEM (auto-add to POS cart)
- COMBO_FIXED_PRICE / COMBO_FREE_ITEM
- WALLET_CASHBACK (CR-001C-W)
- REFERRAL_COUPON
- Coupon reversal/refund lifecycle
- Multi-coupon-per-order
- Per-line allocation in the response (planned-but-deferred — see §14 OQ-3)
- Loyalty code changes
- L5 cleanup
- Production deployment

---

## 5. Proposed Coupon Type Model

### 5.1 Discriminator design — `discount_scope` × `discount_type`

We do NOT add `coupon_type=ITEM_FLAT` as a single enum value. Instead, `discount_scope` and `discount_type` compose:

| discount_scope | discount_type | Resulting type | Computation base |
|---|---|---|---|
| `order` (default) | `flat` | `ORDER_FLAT` (V1) | Whole `order_total` |
| `order` | `percentage` | `ORDER_PERCENTAGE` (V1) | Whole `order_total` |
| `item` | `flat` | `ITEM_FLAT` | Sum of eligible item line totals |
| `item` | `percentage` | `ITEM_PERCENTAGE` | Sum of eligible item line totals |
| `category` | `flat` | `CATEGORY_FLAT` | Sum of eligible category line totals |
| `category` | `percentage` | `CATEGORY_PERCENTAGE` | Sum of eligible category line totals |

The existing `coupon_type` field added in V1 (default `"order"`) is **kept and reused as a synonym** of `discount_scope` for backward compat:
- If `discount_scope` is set → it wins.
- Else if `coupon_type` is `"item"` / `"category"` → treat as that scope.
- Else → default `"order"` (V1 behaviour).

This means **no migration is required for V1 rows** (`discount_scope` absent ⇒ resolves to `"order"`).

### 5.2 V2 type semantics

| Type | When eligible | Discount base | Notes |
|---|---|---|---|
| `ITEM_FLAT` | Cart contains ≥1 line whose `pos_food_id` is in `eligible_food_ids` or `item_id` in `eligible_item_ids`, and not in `excluded_item_ids`. | `min(discount_value, eligible_subtotal)` | Flat ₹ off only the eligible-item subtotal. |
| `ITEM_PERCENTAGE` | Same as ITEM_FLAT. | `min(eligible_subtotal * discount_value / 100, max_discount or +∞)` | Percentage on eligible-item subtotal, capped. |
| `CATEGORY_FLAT` | Cart contains ≥1 line whose `item_category` matches `eligible_category_ids` (numeric) OR `eligible_category_names` (string, case-insensitive), and not excluded. | `min(discount_value, eligible_subtotal)` | Flat ₹ off only the eligible-category subtotal. |
| `CATEGORY_PERCENTAGE` | Same as CATEGORY_FLAT. | `min(eligible_subtotal * discount_value / 100, max_discount or +∞)` | Percentage on eligible-category subtotal, capped. |

### 5.3 Eligible subtotal calculation

Given a cart of `POSCartItem` lines:

1. Filter lines that match the coupon's eligibility (item-id OR food-id OR category-id OR category-name set membership) AND are NOT in any exclusion list.
2. If `min_item_qty` set: require total eligible quantity `>= min_item_qty`; else return `MIN_ITEM_QTY_NOT_MET`.
3. If `max_applicable_qty` set: cap each line's effective quantity at `max_applicable_qty` (applied across all eligible lines or per line — see §14 OQ).
4. Compute `eligible_subtotal = Σ(line_total or unit_price * qty)` over the (capped) eligible lines.
5. If `eligible_subtotal == 0` after filtering: return `NO_ELIGIBLE_ITEMS_IN_CART` (item scope) or `NO_ELIGIBLE_CATEGORY_IN_CART` (category scope).
6. Apply flat / percentage formula from §5.2 onto `eligible_subtotal`.

`apply_to_cheapest_item` / `apply_to_highest_item` (when both `false`) ⇒ apply to ALL eligible lines (default). When exactly one is `true` ⇒ restrict the eligible subtotal to that single line. This is a V2 nicety; out if owner prefers V3.

---

## 6. Coupon Schema Extension Plan

All V2 additions are **optional, backward compatible, no migration required**. Existing V1 rows continue to resolve to `discount_scope="order"`.

### 6.1 `coupons` collection — new optional fields

| Field | Type | Default | Notes |
|---|---|---|---|
| `discount_scope` | str | `"order"` | New discriminator. `"order"` \| `"item"` \| `"category"`. |
| `eligible_item_ids` | List[str] \| None | `None` | Match against `POSCartItem.item_id`. |
| `eligible_food_ids` | List[str] \| None | `None` | Match against `POSCartItem.food_id` / `OrderItem.pos_food_id`. *Both* accepted; either match = eligible. |
| `eligible_category_ids` | List[str] \| None | `None` | Match against `POSCartItem.category_id`. |
| `eligible_category_names` | List[str] \| None | `None` | Match against `POSCartItem.category_name` (case-insensitive). |
| `excluded_item_ids` | List[str] \| None | `None` | Hard exclude. |
| `excluded_category_ids` | List[str] \| None | `None` | Hard exclude. |
| `min_item_qty` | int \| None | `None` | Total eligible qty floor. |
| `max_applicable_qty` | int \| None | `None` | Per-coupon-applied-qty cap. |
| `apply_to_cheapest_item` | bool | `False` | Restrict eligible subtotal to cheapest eligible line. |
| `apply_to_highest_item` | bool | `False` | Restrict eligible subtotal to highest-priced eligible line. |

### 6.2 `coupon_usage` collection — new optional fields

| Field | Type | Default | Notes |
|---|---|---|---|
| `discount_scope` | str \| None | `None` | Denormalized from coupon at usage time (`"order"` for V1 replays — null fine for legacy). |
| `eligible_item_ids_resolved` | List[str] | `[]` | Item-ids that actually qualified for this order (audit trail for analytics). |
| `eligible_category_ids_resolved` | List[str] \| List[int \| str] | `[]` | Category-ids that actually qualified. |
| `eligible_subtotal` | float \| None | `None` | The subtotal the discount was computed against. |

### 6.3 Backward-compatibility strategy

- **All new fields optional.** Pydantic `Optional[...]` with safe defaults.
- **`coupons` collection**: no migration. V1 rows naturally have `discount_scope` absent ⇒ resolve to `"order"` in the service module.
- **`coupon_usage` collection**: same — V1 rows lack the V2 columns; the analytics query treats absent values as zero / empty.
- **Admin CRUD endpoints**: Pydantic `Coupon` / `CouponCreate` / `CouponUpdate` add the new optional fields. Existing payloads (without the new fields) continue to work. Frontend forms do not need to send them.

---

## 7. POS API Contract Changes

### 7.1 `POST /api/pos/coupons/validate` — V2 body

**New optional `items: List[POSCartItem]`** added to `POSCouponValidateRequest`. Required when CRM resolves the coupon to be item/category-scope.

#### V2 body shape (proposed)

```json
{
  "code": "ITEM20",
  "customer_id": "cust_abc",
  "order_total": 1000.0,
  "channel": "pos",
  "loyalty_points_used": 0,
  "items": [
    {
      "item_id": "L_3324",
      "food_id": "125229",
      "category_id": "3411",
      "category_name": "Pizza",
      "name": "Veggie Pizza",
      "quantity": 2,
      "unit_price": 70.0,
      "line_total": 140.0
    }
  ]
}
```

#### `POSCartItem` field plan — required vs optional

| Field | Required? | Notes |
|---|---|---|
| `name` | optional | Cosmetic. Echoed back for debugging. |
| `item_id` | optional* | Used by `eligible_item_ids` / `excluded_item_ids`. |
| `food_id` | optional* | Used by `eligible_food_ids`. Accepts `pos_food_id` alias (V1 OrderItem convention). |
| `category_id` | optional* | Used by `eligible_category_ids`. |
| `category_name` | optional* | Used by `eligible_category_names`. Case-insensitive match. |
| `quantity` | **required** | int ≥ 1. Used for `min_item_qty` / `max_applicable_qty` / line total. |
| `unit_price` | required (one of) | Float ≥ 0. If `line_total` absent, computed as `unit_price * quantity`. |
| `line_total` | required (one of) | Float ≥ 0. If both present, `line_total` wins. |

* At least one of `{item_id, food_id, category_id, category_name}` MUST be present **per line** — else CRM cannot match the line to any coupon. Lines with none are silently ignored during matching (still counted toward `order_total` if POS includes them but rejected as eligibility candidates).

**Aliases accepted** (Addendum A.2 precedent): `itemId`, `foodId`, `categoryId`, `categoryName`, `qty`, `price`, `lineTotal` — via Pydantic `AliasChoices`.

#### Behaviour without `items`

- **V1 order-scope coupon** (`discount_scope` absent / `"order"`): proceeds exactly as V1 (no validation against items).
- **V2 item-scope coupon** + `items` absent or `[]`: returns `MISSING_ITEMS_FOR_ITEM_COUPON`.
- **V2 category-scope coupon** + `items` absent or `[]`: returns `MISSING_ITEMS_FOR_CATEGORY_COUPON`.

### 7.2 `GET /api/pos/coupons/available` — V2 recommendation

**Recommended: Option D-with-A-hint** — keep `GET` query-only, but enrich the response so POS can show hints without re-querying.

| Option | Verdict | Rationale |
|---|---|---|
| A — keep GET query-only, return possibly-eligible item/category coupons | ✅ chosen part | Cart not needed up-front; reduces POS payload size. |
| B — add `POST /pos/coupons/available` with cart body | ✗ rejected V2 | Doubles surface area; cart-aware validation already covered by `/validate`. Re-evaluate if POS UX demands it later. |
| C — extend GET with item/category query params | ✗ rejected | Query-string carrying a cart is fragile (URL length, ordering, repeats). |
| D — keep available simple; make validate source of truth | ✅ chosen base | Already true in V1. Final eligibility is `validate` + final-order. |

**V2 response delta per coupon:**

```json
{
  "id": "cpn_xyz",
  "code": "ITEM20",
  "discount_scope": "item",                       // NEW
  "discount_type": "percentage",
  "discount_value": 20.0,
  "min_order_value": 200.0,
  "max_discount": 100.0,
  "stackable_with_loyalty": false,
  "requires_cart_validation": true,               // NEW — true for item/category scopes
  "eligible_match_hint": {                        // NEW — display hint, not authoritative
    "type": "category_names",
    "values": ["Pizza", "Pasta"]
  },
  "expected_discount": null,                      // null when requires_cart_validation=true
  "final_amount_preview": null                    // null when requires_cart_validation=true
}
```

For V1 order-scope coupons the response is **unchanged** — `requires_cart_validation` is `false` and `expected_discount`/`final_amount_preview` are populated as today.

### 7.3 Response shape changes

| Endpoint | V2 additions (all backward-compatible) |
|---|---|
| `GET /pos/coupons/available` | `discount_scope`, `requires_cart_validation`, `eligible_match_hint`. `expected_discount` / `final_amount_preview` nullable when `requires_cart_validation=true`. |
| `POST /pos/coupons/validate` (success) | `discount_scope`, `eligible_item_ids_matched`, `eligible_category_ids_matched`, `eligible_subtotal`. V1 fields preserved. |
| `POST /pos/coupons/validate` (error) | New `error.code` values: `MISSING_ITEMS_FOR_ITEM_COUPON`, `MISSING_ITEMS_FOR_CATEGORY_COUPON`, `NO_ELIGIBLE_ITEMS_IN_CART`, `NO_ELIGIBLE_CATEGORY_IN_CART`, `MIN_ITEM_QTY_NOT_MET`. |
| `POST /pos/orders` `data.coupon_usage` | Adds `discount_scope`, `eligible_subtotal`. Other keys unchanged. |

---

## 8. Discount Computation Rules

### 8.1 Common pre-checks (all V2 scopes)

1. Run **all V1 validation gates** first (active, expiry, usage_limit, per_user_limit, min_order_value, channel, specific_users, stacking) — V2 inherits them via `validate_coupon_for_customer`.
2. Then run V2 cart eligibility:
   - `items` list non-empty (else `MISSING_ITEMS_FOR_*_COUPON`).
   - Filter eligible lines (set membership in `eligible_*` minus `excluded_*`).
   - Apply `min_item_qty` and `max_applicable_qty`.
   - Compute `eligible_subtotal` (with optional cheapest/highest restriction).
   - If `eligible_subtotal == 0`: return `NO_ELIGIBLE_*_IN_CART`.
3. Apply formula from §5.2.

### 8.2 ITEM_FLAT

- `discount = min(discount_value, eligible_subtotal)`
- Returned as a single `coupon_discount` total.
- Multiple eligible lines combine into one subtotal then capped.

### 8.3 ITEM_PERCENTAGE

- `raw = eligible_subtotal * discount_value / 100`
- `discount = min(raw, max_discount or +∞)`
- Returned as a single `coupon_discount` total.

### 8.4 CATEGORY_FLAT

- Same as ITEM_FLAT but eligibility filter is on `category_id` / `category_name`.

### 8.5 CATEGORY_PERCENTAGE

- Same as ITEM_PERCENTAGE but eligibility filter is on category.

### 8.6 Quantity handling

- **Default:** every eligible line contributes `min(line_total, qty * unit_price)` to `eligible_subtotal`.
- **`max_applicable_qty` set:** for each eligible line, effective qty = `min(line.quantity, max_applicable_qty)`; contribution = `effective_qty * unit_price` (use unit_price not line_total since line_total may include the full qty). Per-line vs cart-wide cap interpretation: **per line in V2** for simplicity (owner can revisit in V3).
- **`apply_to_cheapest_item`:** before subtotal, keep only the eligible line with the smallest `unit_price`. Ignore others.
- **`apply_to_highest_item`:** keep only the eligible line with the largest `unit_price`.

### 8.7 No-eligible-line semantics

| Coupon scope | Cart shape | Result |
|---|---|---|
| `order` | empty items | OK — V1 path |
| `item` | no items at all | `MISSING_ITEMS_FOR_ITEM_COUPON` |
| `item` | items present, none eligible | `NO_ELIGIBLE_ITEMS_IN_CART` |
| `category` | no items at all | `MISSING_ITEMS_FOR_CATEGORY_COUPON` |
| `category` | items present, none eligible | `NO_ELIGIBLE_CATEGORY_IN_CART` |
| any | `min_item_qty` floor not met by eligible qty sum | `MIN_ITEM_QTY_NOT_MET` |

### 8.8 Per-line allocation

V2 returns **a single total `coupon_discount`** only (no per-line allocation). This avoids POS-side reconciliation complexity (rounding spread, tax recalculation per line). If POS needs per-line breakdown for receipt printing, it can spread the total proportionally on its side. Per-line allocation is deferred to V3 if owners want it (§14 OQ-3).

---

## 9. Final Order Recording Plan

### 9.1 Reuse V1 path

`pos_order_webhook` already passes the order's `items[]` to `_persist_order` for `order_items` collection writes. V2 adds: just before calling `record_coupon_usage_for_order`, convert `order_data.items` (List[OrderItem]) → List[POSCartItem-equivalent dict] using existing `pos_food_id`/`item_category`/`item_qty`/`item_price` fields. Pass into `record_coupon_usage_for_order(..., items=[...])`.

### 9.2 Server-side V2 revalidation

`record_coupon_usage_for_order` server-side re-runs `validate_coupon_for_customer` (Q5 guardrail). For V2 coupons, it now also runs the cart eligibility filter using the order payload's `items`. If revalidation fails → same Addendum-A.3 behaviour: order persists, `coupon_usage` NOT recorded, structured `coupon_validation_failed_at_final_order` warning logged with the V2 error code, `data.coupon_usage.recorded=false` in response.

### 9.3 `coupon_usage` row additions

V2 records these new keys on the `coupon_usage` row:

```
discount_scope            : "order" | "item" | "category"
eligible_item_ids_resolved: list[str] (V2 item scope only)
eligible_category_ids_resolved: list[str|int] (V2 category scope only)
eligible_subtotal         : float (V2 only) — the subtotal the discount was computed against
```

V1 fields (`coupon_code`, `coupon_discount`, `crm_computed_discount`, `order_id`, `user_id`, `order_total`, etc.) all remain.

### 9.4 Idempotency / single-coupon rules

- **Idempotency key unchanged:** `(user_id, order_id)` unique partial index. (Addendum A.5 V1 invariant.)
- **One coupon per order in V2:** matches V1. The schema still carries a single `coupon_code` on `POSOrderWebhook`. Multi-coupon-per-order is a V3 conversation.
- Future-safe key (`(user_id, order_id, coupon_code)`) remains a non-destructive migration when needed.

### 9.5 Computed vs POS-sent discount

- **POS-sent `coupon_discount` remains source of truth** (Q5=C inherited).
- CRM stores its own `crm_computed_discount` (existing column) for variance reconciliation.
- The tolerance check (`COUPON_VARIANCE_ABS_TOLERANCE=₹1.00`, `COUPON_VARIANCE_REL_TOLERANCE=1%`) applies to V2 the same way. For item/category scopes the CRM-computed value is the discount on the eligible subtotal — typically smaller than the order_total — so variance is expected to be even smaller in absolute terms.

---

## 10. Analytics Plan

### 10.1 Stay simple, add breakdowns additively

`get_coupon_stats` keeps its existing top-level keys (`total_coupons`, `coupons_used`, `discount_availed`) so dashboards do not break. V2 adds an OPTIONAL `breakdown_by_scope` block:

```json
{
  "total_coupons": 12,
  "coupons_used": 34,
  "discount_availed": 4250.0,
  "breakdown_by_scope": {                      // V2 addition
    "order":    {"used": 22, "discount": 2800.0},
    "item":     {"used": 8,  "discount": 950.0},
    "category": {"used": 4,  "discount": 500.0},
    "unknown":  {"used": 0,  "discount": 0.0}
  }
}
```

`unknown` collects legacy `coupon_usage` rows that have no `discount_scope` (treated as `order` is also acceptable — recommendation `unknown` for transparency in the first month, then collapse into `order`).

### 10.2 Future deeper breakdowns

`discount by item_id` and `discount by category_id` are NOT in V2. Owner can opt into a separate `GET /api/coupons/analytics/breakdown` query later — left out to keep V2 tight.

---

## 11. Compatibility Plan

| Surface | Compatibility guarantee |
|---|---|
| V1 `ORDER_FLAT` / `ORDER_PERCENTAGE` | Identical behaviour. Same 45/45 QA harness must rerun green. |
| V1 `POST /validate` body without `items` | Still works for order-scope coupons. Returns same shape. |
| V1 `GET /available` query-only | Still returns order-scope coupons with `expected_discount` populated. New fields (`discount_scope`, `requires_cart_validation`) added — POS may ignore them. |
| Admin CRUD (9 endpoints) | All payloads gain optional V2 fields. No required-field changes. Frontend continues to work unchanged. |
| `coupon_usage` rows from V1 | Continue to exist. Lack of `discount_scope` ⇒ treated as `"order"` in computations and bucketed under `unknown` in V2 analytics breakdown (or collapsed into `order` per owner preference). |
| `core/loyalty.py`, wallet code, migration code | UNTOUCHED. |
| `coupon_transactions` legacy collection | UNTOUCHED. Analytics union still includes it. |
| `/app/memory/final/` | UNTOUCHED. |
| Loyalty stacking (`stackable_with_loyalty`) | Works identically across all scopes. |
| Idempotency `(user_id, order_id)` | UNCHANGED. |
| Variance tolerance (₹1.00 abs OR 1% rel) | UNCHANGED. |

### Regression posture

V2 must rerun and pass the **entire V1 QA harness (45/45)** before V2-specific tests are considered authoritative. Plan §13 includes V1-replay cases explicitly.

---

## 12. File-by-File Future Implementation Plan

| File | Planned Change | Risk |
|---|---|---|
| `backend/core/coupon.py` | EXTEND — add `POSCartItem` parameter (typed dict / Pydantic) to `validate_coupon_for_customer` and `list_available_coupons`. Add `_filter_eligible_lines(coupon, items)`, `_compute_eligible_subtotal(coupon, eligible_lines)`. Replace direct `compute_coupon_discount(coupon, order_total)` call with scope-aware dispatch: `_compute_v2_discount(coupon, order_total, items)` that returns `(discount, eligible_subtotal, matched_item_ids, matched_category_ids)`. New error codes wired into existing return envelope. ~150 LOC delta. | LOW — `discount_scope` defaults to `order`, V1 logic short-circuits unchanged. |
| `backend/models/schemas.py` | EXTEND — `Coupon` / `CouponCreate` / `CouponUpdate` gain V2 optional fields (§6.1). `CouponUsage` gains V2 optional fields (§6.2). New `POSCartItem` model with `AliasChoices` aliases. `POSCouponValidateRequest` gains `items: Optional[List[POSCartItem]] = None`. ~50 LOC delta. | LOW — all additions optional. |
| `backend/routers/pos.py` | EXTEND — `pos_validate_coupon` passes new `request.items` to service. `pos_available_coupons` calls service, populates `requires_cart_validation` & `eligible_match_hint`. `pos_order_webhook` converts `order_data.items` (List[OrderItem]) → List[POSCartItem-dict] and passes through `record_coupon_usage_for_order(..., items=...)`. ~80 LOC delta. | MEDIUM — pos.py is large; isolate inside V2-marked block. |
| `backend/services/analytics_service.py` | EXTEND — `get_coupon_stats` adds optional `breakdown_by_scope` block via Mongo `$group` on `discount_scope`. ~30 LOC delta. | LOW — additive. |
| `backend/server.py` | NO CHANGE — `ensure_coupon_indexes` already covers V2 query patterns. Optional new index `(user_id, discount_scope, created_at)` if analytics queries get heavy — defer until needed. | NONE |
| `backend/tests/qa_cr001c_c_coupon_v1.py` | NO CHANGE — must rerun green as regression. | NONE |
| `backend/tests/qa_cr001c_c_coupon_v2.py` | NEW — V2-specific harness covering §13 cases. ~600 LOC. | LOW |
| `backend/tests/seed_coupon_v1_fixtures.py` | EXTEND — add V2 fixtures (`QA_C2_ITEMFLAT`, `QA_C2_ITEMPCT`, `QA_C2_CATFLAT`, `QA_C2_CATPCT`). Idempotent additions. ~80 LOC delta. | LOW |
| `backend/routers/coupons.py` | NO CHANGE — admin CRUD untouched; model gains pick up optional fields automatically. | NONE |
| `backend/routers/migration.py`, `core/loyalty.py`, wallet code | NO CHANGE | NONE |
| `backend/tests/seed_coupon_v2_fixtures.py` (alt) | Could be a separate file or extension of V1 seeder. **Recommendation:** extend the existing seeder with a `v2` flag rather than fork. | LOW |

---

## 13. QA Plan

V2 harness runs **on top of** the V1 harness — V1 must rerun green first. The V2 harness adds the cases below. Same `QA_C2_USER_<run-id>` scoping pattern as V1.

### 13.1 V1 regression (must remain green)

| # | Case |
|---|---|
| R-01..R-45 | Rerun the complete V1 QA harness (`qa_cr001c_c_coupon_v1.py`) — expect 45/45 PASS. |

### 13.2 V2 happy paths

| # | Case | Expected |
|---|---|---|
| V2-01 | ITEM_FLAT validate success | discount = min(value, eligible_subtotal); response carries `discount_scope=item`, `eligible_subtotal`. |
| V2-02 | ITEM_PERCENTAGE validate success | discount = eligible_subtotal * pct / 100, capped by `max_discount`. |
| V2-03 | CATEGORY_FLAT validate success (match by `category_id`) | discount applied on eligible-category subtotal. |
| V2-04 | CATEGORY_FLAT match by `category_name` (case-insensitive) | match works regardless of casing. |
| V2-05 | CATEGORY_PERCENTAGE validate success | percentage applied + cap. |
| V2-06 | ITEM_FLAT with multiple eligible lines | subtotal sums correctly; flat cap honoured. |
| V2-07 | Quantity handling: `max_applicable_qty=2` on a line of qty=5 | only 2*unit_price contributes. |
| V2-08 | `min_item_qty=3` met across two eligible lines | success. |
| V2-09 | `apply_to_cheapest_item=true` | discount computed only on cheapest eligible line. |
| V2-10 | `apply_to_highest_item=true` | discount computed only on highest eligible line. |

### 13.3 V2 error / edge cases

| # | Case | Expected |
|---|---|---|
| V2-11 | item-scope validate with no `items` | `error.code == "MISSING_ITEMS_FOR_ITEM_COUPON"`. |
| V2-12 | category-scope validate with no `items` | `error.code == "MISSING_ITEMS_FOR_CATEGORY_COUPON"`. |
| V2-13 | item-scope validate with items present but none eligible | `error.code == "NO_ELIGIBLE_ITEMS_IN_CART"`. |
| V2-14 | category-scope validate with items present but none in category | `error.code == "NO_ELIGIBLE_CATEGORY_IN_CART"`. |
| V2-15 | `min_item_qty=3` but only 2 eligible qty in cart | `error.code == "MIN_ITEM_QTY_NOT_MET"`. |
| V2-16 | Excluded item in cart but other eligible items present | excluded line skipped; coupon still applies to remaining. |
| V2-17 | All eligible items are in `excluded_item_ids` | `NO_ELIGIBLE_ITEMS_IN_CART`. |
| V2-18 | Eligible subtotal smaller than flat `discount_value` | discount capped at eligible subtotal (not order_total). |
| V2-19 | `max_discount` cap binds on percentage coupon | discount == max_discount. |
| V2-20 | Loyalty stacking off on V2 coupon + `loyalty_points_used>0` | `STACKING_NOT_ALLOWED` (same V1 rule). |

### 13.4 Final-order recording

| # | Case | Expected |
|---|---|---|
| V2-21 | Final `/pos/orders` with item-scope coupon records `coupon_usage` once with `discount_scope=item`, `eligible_subtotal`, `eligible_item_ids_resolved` populated. | Single row inserted. |
| V2-22 | Final `/pos/orders` retry with same `order_id` is idempotent | Same `(user_id, order_id)` key path as V1. |
| V2-23 | Final order with item-scope coupon BUT `items` array empty/missing | Server-side revalidation fails ⇒ recorded=false, error logged, order persists. |
| V2-24 | Final order with category-scope coupon happy path | row recorded with `discount_scope=category`, `eligible_category_ids_resolved`. |

### 13.5 Analytics

| # | Case | Expected |
|---|---|---|
| V2-25 | `get_coupon_stats` after V1+V2 mixed usage | top-level keys unchanged; `breakdown_by_scope` shows correct splits across `order`/`item`/`category`/`unknown`. |
| V2-26 | Legacy `coupon_usage` rows (no `discount_scope`) | bucket under `unknown` (or `order` per owner) — does NOT skew V2 buckets. |
| V2-27 | Analytics double-count guard still holds | `coupon_transactions` not touched by V2 path (parity with V1 QA-30/31). |

### 13.6 Compatibility / regression

| # | Case | Expected |
|---|---|---|
| V2-28 | V1 order-scope coupon validate without `items` in V2 build | identical V1 response shape; `discount_scope` echoed as `order`. |
| V2-29 | Admin CRUD round-trip for V2 coupon (create with `discount_scope=item, eligible_food_ids=[...]`) | returns coupon with all V2 fields visible; PUT/DELETE/toggle work. |
| V2-30 | Loyalty regression (LX-A 6-key blob, LR redeem path) | UNTOUCHED — Loyalty harness 52/52 still PASS. |
| V2-31 | Wallet regression | wallet collections untouched after V2 record. |
| V2-32 | Variance tolerance applies on V2 too | within ₹1 / 1% slack → silent; outside → warning, POS amount still honoured. |

**Total: V1 regression (45) + V2 additions (32) = 77 assertions.**

---

## 14. Owner Questions

Five questions remaining. Defaults proposed; only OQ-1 and OQ-3 are genuinely blocking — the others have safe defaults the implementation can run with.

| # | Question | Recommended default | Blocking? |
|---|---|---|---|
| OQ-1 | Should `GET /available` remain query-only, or add a cart-aware `POST /available`? | **Query-only (Option D + A-hint).** Add per-coupon `requires_cart_validation` + `eligible_match_hint`. Validate becomes the cart-aware source of truth. | **Yes** — POS UX implications. |
| OQ-2 | Should V2 allow only one coupon per order? | **Yes — one coupon per order, same as V1.** Schema only carries one `coupon_code`. Multi-coupon is V3. | No — safe default. |
| OQ-3 | Should item/category discount be returned as total only, or per-line allocation too? | **Total only in V2.** Per-line allocation deferred to V3 (rounding/tax complexity). | **Yes** — receipt UX implications. |
| OQ-4 | Should category matching use `category_id`, `category_name`, or both? | **Both.** Either match counts as eligible. Live data shows `item_category` is a single field that may carry id OR name — both must be supported to be robust. | No. |
| OQ-5 | Should item matching use `food_id`, `item_id`, or both? | **Both.** `food_id` matches `pos_food_id` (live POS field); `item_id` matches the order-line identifier. Either match counts. | No. |

Two extra OQs surfaced during design that the owner may want to weigh in on (non-blocking):

| # | Question | Recommended default |
|---|---|---|
| OQ-6 | `max_applicable_qty` — per line or cart-wide? | **Per line** in V2 (simpler). Cart-wide deferred. |
| OQ-7 | Legacy `coupon_usage` rows in V2 analytics breakdown — bucket as `unknown` or `order`? | **`unknown` for first month**, then collapse into `order` once owner sees the volume is benign. |

---

## 15. Final Recommendation

V2 plan is **complete enough for owner approval pending OQ-1 and OQ-3 decisions** (and confirmations on OQ-2/OQ-4/OQ-5). All other surface area is decided in this doc with safe defaults.

**Why this approach is low-risk:**
1. Zero migration. All schema additions are optional.
2. V1 path is untouched — 45/45 V1 QA must remain green and is regressed first.
3. Composition (`discount_scope` × `discount_type`) avoids breaking the existing `coupon_type`/`discount_type` enum surface; legacy values resolve naturally.
4. Single new POS endpoint *contract* surface — `items[]` becomes optional on `validate`; no new endpoint is introduced.
5. Idempotency key, variance tolerance, stacking rule, admin CRUD, loyalty/wallet — all preserved.
6. Final-order recording continues to be commit point (Q4=B / Q5=C semantics preserved).

**Implementation effort estimate (assuming OQs answered):**
- Core service additions: ~150 LOC.
- Schema + Pydantic model additions: ~50 LOC.
- Router/POS plumbing: ~80 LOC.
- Analytics breakdown: ~30 LOC.
- New QA harness `qa_cr001c_c_coupon_v2.py`: ~600 LOC (77 assertions).
- Fixture seeder extension: ~80 LOC.

Recommend the owner:
1. Answer OQ-1 (available endpoint shape) and OQ-3 (per-line allocation in V2 response).
2. Confirm OQ-2 / OQ-4 / OQ-5 defaults.
3. Approve plan → status flips to `cr001c_coupon_v2_item_category_plan_ready_for_implementation_approval` → implementation begins under `cr001c_coupon_v2_implementation_in_progress`.

---

## 16. Final Status

`cr001c_coupon_v2_item_category_plan_ready_for_implementation_approval`

Owner decisions OQ-1 (query-only `GET /available` with `requires_cart_validation` hint) and OQ-3 (total coupon discount only, no per-line allocation) approved 2026-05-24. See **Addendum B** below for frozen owner decisions, payload examples, matching priorities, and computation/QA freezes.

---

# Addendum B — Owner Decisions Applied (2026-05-24)

This addendum freezes the remaining owner decisions and adds 12 implementation clarifications. Sections §1–§16 above remain the structural plan; Addendum B is the operative truth for implementation kickoff.

## B.0 Owner decisions — frozen

| OQ | Question | Frozen decision |
|---|---|---|
| **OQ-1** | Available coupons API shape | **APPROVED.** `GET /api/pos/coupons/available` stays query-only. For item/category coupons: response carries `requires_cart_validation=true` + `eligible_match_hint`. CRM does **not** compute exact `expected_discount` without cart items. Actual discount for item/category coupons is computed only by `POST /api/pos/coupons/validate` when `items[]` is supplied. |
| OQ-2 | One coupon per order? | **APPROVED default — yes**, same as V1. Schema continues to carry a single `coupon_code`. Multi-coupon-per-order remains V3+. |
| **OQ-3** | Per-line discount allocation? | **APPROVED.** V2 returns **total coupon discount only**. No per-line allocation. Per-line breakdown is deferred to V3 only if POS/tax/accounting needs it. |
| OQ-4 | Category matching: id, name, or both? | **APPROVED default — both** (`category_id` primary, `category_name` normalized fallback, plus `item_category` fallback). See §B.3. |
| OQ-5 | Item matching: food_id, item_id, or both? | **APPROVED default — both** (`food_id` primary, `item_id` secondary). See §B.2. |
| OQ-6 | `max_applicable_qty` — per line or cart-wide? | **APPROVED default — per line** in V2. Cart-wide is deferred. |
| OQ-7 | Legacy `coupon_usage` rows in V2 analytics bucket? | **APPROVED default — `unknown`** for the first month, then collapse into `order` once owner confirms volume is benign. |

## B.1 POS `/validate` payload — concrete examples

### Example 1 — ITEM_PERCENTAGE on coffee (food_id + item_id + category present)

```json
{
  "code": "COFFEE20",
  "customer_id": "cust_123",
  "order_total": 500.0,
  "channel": "pos",
  "loyalty_points_used": 0,
  "items": [
    {
      "food_id": "182039",
      "item_id": "2248572",
      "category_id": "12",
      "category_name": "Beverages",
      "name": "Coffee",
      "quantity": 2,
      "unit_price": 100.0,
      "line_total": 200.0
    },
    {
      "food_id": "300001",
      "item_id": "2248573",
      "category_id": "5",
      "category_name": "Mains",
      "name": "Burger",
      "quantity": 1,
      "unit_price": 300.0,
      "line_total": 300.0
    }
  ]
}
```

Coupon: `COFFEE20`, `discount_scope="item"`, `discount_type="percentage"`, `discount_value=20`, `eligible_food_ids=["182039"]`, `max_discount=50`.

- Eligible lines: line 1 (Coffee). `eligible_subtotal = 2 * 100 = 200`.
- Raw discount: `200 * 20 / 100 = 40`. Cap: `min(40, 50) = 40`.
- Response: `computed_discount = 40.0`, `final_amount_preview = 500 - 40 = 460.0`, `eligible_subtotal = 200.0`, `discount_scope = "item"`.

### Example 2 — CATEGORY_FLAT matched only via `item_category` (live-data shape)

POS payload where the cart line carries `item_category` (the live `order_items` field) instead of canonical `category_id` / `category_name`:

```json
{
  "code": "BEVFLAT50",
  "customer_id": "cust_456",
  "order_total": 320.0,
  "channel": "pos",
  "loyalty_points_used": 0,
  "items": [
    {
      "food_id": "125229",
      "item_id": "L_3324",
      "item_category": "Beverages",
      "name": "Cold Coffee",
      "quantity": 2,
      "unit_price": 80.0,
      "line_total": 160.0
    },
    {
      "food_id": "125230",
      "item_id": "L_3325",
      "item_category": "12",
      "name": "Iced Tea",
      "quantity": 1,
      "unit_price": 60.0,
      "line_total": 60.0
    }
  ]
}
```

Coupon: `BEVFLAT50`, `discount_scope="category"`, `discount_type="flat"`, `discount_value=50`, `eligible_category_ids=["12"]`, `eligible_category_names=["Beverages"]`.

- Line 1 `item_category="Beverages"` → matches `eligible_category_names`.
- Line 2 `item_category="12"` → matches `eligible_category_ids`.
- Both eligible. `eligible_subtotal = 160 + 60 = 220`.
- Flat 50, cap at eligible_subtotal: `min(50, 220) = 50`.
- Response: `computed_discount = 50.0`, `eligible_subtotal = 220.0`, `discount_scope = "category"`.

### Example 3 — Missing items for an item-scope coupon (error path)

```json
{
  "code": "PIZZA15",
  "customer_id": "cust_789",
  "order_total": 1000.0,
  "channel": "pos",
  "loyalty_points_used": 0
}
```

Coupon: `PIZZA15`, `discount_scope="item"`, `discount_type="percentage"`, `discount_value=15`.

- `items[]` absent and coupon is item-scope.
- Response: `success=false`, `data.error.code="MISSING_ITEMS_FOR_ITEM_COUPON"`, `field="items"`, `detail="items[] required for item-scope coupon"`.

## B.2 Item matching priority (frozen)

Per cart line, evaluate matches in this order. First positive match marks the line eligible (no need to check later fields).

| Priority | Field on cart line | Match against | Comparison |
|---|---|---|---|
| 1 | `food_id` (alias: `foodId`, `pos_food_id`) | `coupon.eligible_food_ids` | String exact (coerce numeric → string before compare) |
| 2 | `item_id` (alias: `itemId`) | `coupon.eligible_item_ids` | String exact (coerce numeric → string) |
| 3 | (none — fallback to name-based match is **NOT** implemented in V2) | — | Names are unreliable (typos, locale, casing). If owner explicitly opts into a "weak name fallback" later, it must be a separate documented field (e.g. `eligible_item_names_weak`) with explicit warning logging on every match. Out of V2. |

Exclusion list `coupon.excluded_item_ids` is checked **after** eligibility — a line that passes priority 1 or 2 is dropped if its `item_id` is in `excluded_item_ids`.

## B.3 Category matching priority (frozen)

Per cart line:

| Priority | Field on cart line | Match against | Comparison |
|---|---|---|---|
| 1 | `category_id` (alias: `categoryId`) | `coupon.eligible_category_ids` | String exact (coerce numeric → string) |
| 2 | `category_name` (alias: `categoryName`) | `coupon.eligible_category_names` | Normalized: `str(value).strip().casefold()` on both sides |
| 3 | `item_category` (single field — may carry id OR name) | First check against `coupon.eligible_category_ids` (string exact), then against `coupon.eligible_category_names` (normalized) | Try both — if either hits, the line is eligible. Live `order_items` rows commonly carry only this field. |

Exclusion list `coupon.excluded_category_ids` checked after a positive match — dropped if hit.

## B.4 Eligible subtotal calculation (frozen)

```
eligible_subtotal = Σ over eligible lines of:
    if   max_applicable_qty is None:  quantity * unit_price
    else:                              min(quantity, max_applicable_qty) * unit_price

Fallbacks:
  • If unit_price is missing/invalid but line_total is valid:
      contribution = min(line_total, max_applicable_qty * (line_total / quantity)) if max_applicable_qty else line_total
  • If BOTH unit_price and line_total missing/invalid:
      line is silently dropped from eligible set (not from order_total)

After all lines processed:
  • If eligible_subtotal == 0 → return NO_ELIGIBLE_ITEMS_IN_CART (item scope)
                                  or NO_ELIGIBLE_CATEGORY_IN_CART (category scope)
```

`apply_to_cheapest_item` / `apply_to_highest_item` (when exactly one is `true`) restrict the eligible set to a single line before subtotal computation. When both `false` (default) all eligible lines contribute.

## B.5 Flat discount cap (frozen)

For `ITEM_FLAT` and `CATEGORY_FLAT`:

```
computed_discount = min(coupon.discount_value, eligible_subtotal)
```

**Example:** Coupon `BEV100OFF` (flat ₹100 off Beverages). Eligible beverage subtotal = ₹80. → `computed_discount = ₹80` (not ₹100).

The flat value never exceeds the eligible subtotal, ever. No spill-over to non-eligible lines.

## B.6 Percentage discount (frozen)

For `ITEM_PERCENTAGE` and `CATEGORY_PERCENTAGE`:

```
raw      = eligible_subtotal * coupon.discount_value / 100
computed = min(raw, coupon.max_discount or +∞)
```

The percentage applies **only to `eligible_subtotal`**, not to the full `order_total`. If `max_discount` is set, it caps the result. Non-eligible lines are entirely outside the discount base.

## B.7 Quantity cap behavior (frozen)

`max_applicable_qty` is **per line in V2**.

**Example:** Customer buys 5 coffees in one cart line (qty=5, unit_price=100). Coupon `max_applicable_qty=2`. Only `2 * 100 = 200` contributes to `eligible_subtotal` from that line. Other eligible lines apply the same per-line cap independently. Cart-wide cap is V3+.

## B.8 Final `/api/pos/orders` — missing items behavior (frozen, non-blocking)

If the final order payload carries an item/category coupon (`coupon_code` + `coupon_discount > 0`) and CRM's server-side V2 revalidation can't complete because:

- `items[]` is missing or empty on the order payload, OR
- After matching, no eligible lines remain, OR
- `min_item_qty` floor not met after matching,

then:

1. **Order persists normally** (mirrors Addendum A.3 V1 behavior).
2. **`coupon_usage` is NOT recorded**, `coupons.total_used` is NOT incremented.
3. **Structured warning logged** with one of the codes:
   - `MISSING_ITEMS_FOR_ITEM_COUPON`
   - `MISSING_ITEMS_FOR_CATEGORY_COUPON`
   - `NO_ELIGIBLE_ITEMS_IN_CART`
   - `NO_ELIGIBLE_CATEGORY_IN_CART`
   - `MIN_ITEM_QTY_NOT_MET`
4. **Response surfaces the failure** under `data.coupon_usage`:

   ```json
   "coupon_usage": {
     "recorded": false,
     "coupon_code": "PIZZA15",
     "error": { "code": "NO_ELIGIBLE_ITEMS_IN_CART", "field": "items", "detail": "..." }
   }
   ```

5. Order HTTP status remains 200 (envelope `success=true`). Loyalty / wallet outcomes are independent.

## B.9 QA additions (frozen)

The 32 V2 cases from §13 stand. The following are explicitly **named and added** to the harness `qa_cr001c_c_coupon_v2.py` for clarity:

| New QA case | Scenario | Expected |
|---|---|---|
| **V2-MIX-1** | Mixed cart: Coffee (eligible) + Burger (non-eligible). Item-scope coupon on Coffee. | `eligible_subtotal` = coffee subtotal only. `computed_discount` derived from coffee subtotal. Burger untouched. |
| **V2-MIX-2** | Mixed cart with two category-eligible lines + one non-eligible. Category percentage with max_discount cap. | Eligible subtotal sums both eligible lines. Percentage applied. Cap honored. Non-eligible line excluded. |
| **V2-QTY-1** | Customer buys 5 coffees (qty=5). Coupon `max_applicable_qty=2`. | Only 2 units (2 * unit_price) contribute to eligible_subtotal. |
| **V2-QTY-2** | Two eligible cart lines each with qty=3. Coupon `max_applicable_qty=2`. | Per-line cap applies → each line contributes 2 * unit_price. Cart-wide qty cap is NOT enforced. |
| **V2-NOITEMS-1** | Item-scope coupon, validate body has no `items` key. | `success=false`, `error.code="MISSING_ITEMS_FOR_ITEM_COUPON"`. |
| **V2-NOITEMS-2** | Item-scope coupon, validate body has `items: []`. | Same — `MISSING_ITEMS_FOR_ITEM_COUPON`. |
| **V2-NOITEMS-3** | Category-scope coupon, validate body has no `items`. | `MISSING_ITEMS_FOR_CATEGORY_COUPON`. |
| **V2-NOITEMS-4** | Final `/pos/orders` payload for item-scope coupon, no `items[]`. | Order persists. `data.coupon_usage.recorded=false`. Warning logged with `MISSING_ITEMS_FOR_ITEM_COUPON`. |
| **V2-FALLBACK-1** | Cart line missing `unit_price` but has `line_total`. | Line still contributes (line_total fallback). |
| **V2-FALLBACK-2** | Cart line missing both `unit_price` and `line_total`. | Line dropped silently. If no lines remain → `NO_ELIGIBLE_*_IN_CART`. |

## B.10 V1 regression QA (explicit requirement)

Before V2 QA is considered authoritative, the existing V1 harness MUST rerun green:

```
python -m backend.tests.qa_cr001c_c_coupon_v1   →  45/45 PASS expected
```

V2 changes **must not** regress any of:

| V1 capability | V1 QA cases |
|---|---|
| `GET /api/pos/coupons/available` for order-scope coupons | QA-01..QA-05 |
| `POST /api/pos/coupons/validate` (JSON body) for order-scope coupons | QA-06..QA-18 |
| Structured `error.code` × 9 V1 codes | QA-09..QA-17 |
| Final `/api/pos/orders` `coupon_usage` recording | QA-19..QA-23 |
| Idempotency `(user_id, order_id)` | QA-20 |
| Analytics union of `coupon_usage` + `coupon_transactions` | QA-24, QA-25, QA-29, QA-30, QA-31 |
| Admin CRUD (9 endpoints) smoke | QA-26 family |
| Loyalty stacking (`stackable_with_loyalty`) | QA-17, QA-18 |
| Loyalty / Wallet regression | QA-27, QA-28 |

V2 implementation report will record both:

```
v1_regression: 45/45 PASS
v2_assertions: 32/32 PASS (or actual count when harness lands)
```

Total expected after implementation: **77 / 77 PASS**.

## B.11 Status flip (this update)

- Previous: `cr001c_coupon_v2_item_category_plan_waiting_owner_decisions`
- **Current:** `cr001c_coupon_v2_item_category_plan_ready_for_implementation_approval`
- Next on approval: `cr001c_coupon_v2_implementation_in_progress`
- Target on QA pass: `cr001c_coupon_v2_implementation_qa_passed_in_preview`
