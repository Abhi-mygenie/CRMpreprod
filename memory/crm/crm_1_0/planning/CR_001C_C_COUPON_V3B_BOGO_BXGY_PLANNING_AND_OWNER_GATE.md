# CR-001C-C — Coupon V3-B BOGO / Buy-X-Get-Y Planning and Owner Gate

**Status:** `cr001c_coupon_v3b_bogo_bxgy_plan_ready_for_implementation_approval`
**Previous status (history):** `cr001c_coupon_v3b_bogo_bxgy_plan_waiting_owner_decisions`
**Date:** 2026-02 (preview)
**Owner decisions frozen:** 2026-02 — owner accepted all recommended defaults; Path Alpha (single-shot V3-B) selected. See §16 (Owner Decisions Frozen) and Addendum D below.
**Prereqs (all green in preview):**
- V1: `cr001c_coupon_v1_implementation_qa_passed_in_preview` (45/45)
- V2: `cr001c_coupon_v2_item_category_implementation_qa_passed_in_preview` (45/45)
- V3-A: `cr001c_coupon_v3a_time_window_implementation_qa_passed_in_preview` (31/31)
- Combined baseline: **121/121 PASS**

This is a planning + owner-decision-gate doc. No code, DB, env, migration, or deployment changes have been made.

---

## 1. Executive Summary

V3-B introduces **BOGO** (Buy-One-Get-One) and **Buy-X-Get-Y** (BXGY) coupons on top of the V1/V2/V3-A engine.

Locked invariants carried forward from prior phases:
- One coupon per order.
- POS-sent total discount is the source of truth for billing; CRM revalidates and persists `coupon_usage` only at final `/api/pos/orders`.
- Get item **must already be in the cart** at validate-time and at final-order-time (no CRM/POS auto-add) — locked by OQ-V3-3.
- Time-window pre-check (V3-A) is **generic and remains Step 4** regardless of `offer_type`, so BOGO/BXGY composes cleanly with happy-hour.
- Loyalty stacking via `stackable_with_loyalty`; Wallet untouched (CR-001C-W separate).
- 9 admin CRUD endpoints in `routers/coupons.py` remain untouched.
- `/app/memory/final/`, migration code, `coupon_transactions` legacy collection untouched.

This plan recommends a **three-sub-phase rollout** (V3-B1 → V3-B2 → V3-B3) and gates V3-B on **12 multiple-choice owner questions** (5 blocking, 7 non-blocking with safe defaults).

V3-B is **NOT approved for implementation yet** — implementation begins only after the owner answers Q1–Q12 (or accepts the recommended defaults explicitly).

---

## 2. Inputs Reviewed

### Documentation
- `/app/memory/PRD.md` — CRM PRD, V3-A "implementation complete" status reflected via index.
- `/app/memory/crm/crm_1_0/planning/CR_001_INDEX.md` — CR-001C-C row history (V1 → V2 → V3-A).
- `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_EXISTING_SYSTEM_CAPABILITY_AUDIT.md`
- `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_SCRAP_VS_KEEP_DECISION.md` (Option B confirmed)
- `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V1_IMPLEMENTATION_PLAN.md`
- `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V1_OWNER_DECISIONS.md`
- `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V2_ITEM_CATEGORY_PLANNING.md` (Addendum B)
- `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V3_COMPLEX_OFFERS_PLANNING.md` (Addendum C — V3-B scope-lock)
- `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V3A_TIME_WINDOW_IMPLEMENTATION_PLAN.md`
- `/app/memory/crm/crm_1_0/implementation/CR_001C_C_COUPON_V1_IMPLEMENTATION_REPORT.md`
- `/app/memory/crm/crm_1_0/implementation/CR_001C_C_COUPON_V2_ITEM_CATEGORY_IMPLEMENTATION_REPORT.md`
- `/app/memory/crm/crm_1_0/implementation/CR_001C_C_COUPON_V3A_TIME_WINDOW_IMPLEMENTATION_REPORT.md`
- `/app/memory/crm/crm_1_0/qa/CR_001C_C_COUPON_V2_ITEM_CATEGORY_QA_REPORT.md`
- `/app/memory/crm/crm_1_0/qa/CR_001C_C_COUPON_V3A_TIME_WINDOW_QA_REPORT.md`
- `/app/memory/crm/crm_1_0/planning/POS3_0_BUG_108_API_INVENTORY_FOR_CRM_2026_05_22.md`

### Code (read-only inspection)
- `backend/core/coupon.py` — V1 engine, V2 `resolve_discount_scope` + scope-aware compute, V3-A `_v3a_*` window helpers + Step-4 pre-check, `record_coupon_usage_for_order` with `offer_type`/`time_window_status` snapshot.
- `backend/models/schemas.py` — `Coupon`/`CouponCreate`/`CouponUpdate` already expose optional `offer_type` (enum: `simple` / `bogo` / `bxg` / `nth_item` / `free_item` / `combo` — validator accepts the V3-B values today); `POSCartItem` with `food_id` / `item_id` / `category_id` / `category_name` / `item_category` / `quantity` / `unit_price` / `line_total` plus aliases; `POSCouponValidateRequest.items`/`order_time`.
- `backend/routers/pos.py` — `pos_validate_coupon`, `pos_list_available_coupons`, `pos_order_webhook` final-commit path; `data.coupon_usage` envelope already carries `discount_scope` / `offer_type` / `time_window_status`.
- `backend/routers/coupons.py` — 9 admin CRUD endpoints (untouched since V1, kept in V3-B).
- `backend/services/analytics_service.py` — V2 `breakdown_by_scope` + V3-A `breakdown_by_offer_type` + `time_window_usage`.
- `backend/tests/qa_cr001c_c_coupon_v1.py` (45 assertions), `qa_cr001c_c_coupon_v2_item_category.py` (45 assertions), `qa_cr001c_c_coupon_v3_a_time_window.py` (31 assertions), `seed_coupon_v1_fixtures.py`.

### Key evidence carried into the plan
- `offer_type` discriminator already exists end-to-end (validator, persisted, snapshotted in `coupon_usage`, emitted in `breakdown_by_offer_type` analytics). **No schema migration needed to introduce BOGO/BXGY persistence**, only new optional fields to describe buy/get groups + benefit.
- `POSCartItem` already supports per-line `quantity`, `unit_price`, `line_total` — sufficient to compute BOGO/BXGY benefit without POS protocol changes.
- V3-A Step-4 pre-check is `offer_type`-agnostic — BOGO/BXGY automatically inherits time-window enforcement.
- V2 line-matching helpers (`_line_matches_*`) can be **reused** for buy-group and get-group matching.
- Final-commit non-blocking path (`record_coupon_usage_for_order` returns `recorded:false` with a structured warning) is already proven for V1/V2/V3-A; V3-B inherits.

---

## 3. V1 / V2 / V3-A Baseline (what V3-B must not break)

| Surface | V1 | V2 | V3-A |
|---|---|---|---|
| `discount_scope` | `"order"` (implicit) | `"order"` / `"item"` / `"category"` | unchanged |
| `discount_type` | `ORDER_FLAT` / `ORDER_PERCENTAGE` | + `ITEM_FLAT` / `ITEM_PERCENTAGE` / `CATEGORY_FLAT` / `CATEGORY_PERCENTAGE` | unchanged |
| `offer_type` | n/a (defaults to `"simple"` on read) | n/a | `"simple"` enforced for V3-A v1 |
| Pre-check ordering | code → INACTIVE → EXPIRED → usage limits → channel → stacking | + V2 cart eligibility | + Step-4 time window |
| Final-commit | idempotent on `(user_id, order_id)`; warn-skip on revalidation failure | same; revalidates against final `items[]` | same; time-window failure non-blocking |
| Analytics | base | + `breakdown_by_scope` | + `breakdown_by_offer_type`, + `time_window_usage` |
| Admin CRUD | untouched | untouched | untouched |

**V3-B must keep all of the above green** (combined 121/121 regression + new V3-B assertions).

---

## 4. V3-B Scope Candidate

**In scope (V3-B):**
1. **BOGO same-item** (e.g., "Buy 1 coffee, get 1 coffee free"). Same-item rule = both `buy` and `get` requirement match the same eligible item set.
2. **Buy-X-Get-Y same-item** (e.g., "Buy 2 burgers, get 1 burger free").
3. **Buy-X-Get-Y different-item** (e.g., "Buy 2 pizzas, get 1 garlic bread free" — get-item MUST already be in the cart). *Owner may downscope via Q1/Q4.*
4. **Benefit types on get item:**
   - `free` (100% off the get-line up to `get_quantity × eligible_unit_price`)
   - `percentage` (e.g., 50% off get item)
   - `flat` (₹X off get item, capped at get-line subtotal)
5. **Repeated applications** (e.g., qty 6 with Buy-2-Get-1 → 2 applications). Capped by `max_applications` if configured.
6. **Time-window composability** — V3-A pre-check applies automatically; BOGO/BXGY coupons can carry `valid_days` / `start_time` / `end_time` / `timezone`.
7. **One-coupon-per-order** locked (no stacking BOGO with other coupons).
8. **Final `/api/pos/orders`** revalidation, non-blocking on BOGO/BXGY validation failure.

**Out of V3-B (deferred):**
- Every-Nth item free → **V3-C**
- Free-item instruction-only → **V3-D**
- Combo offers → **V4 (parked)**
- CRM/POS auto-add of free/get items → never in V3-B (OQ-V3-3 locked).
- Multi-coupon-per-order → not approved.
- Wallet cashback as benefit → CR-001C-W separate.
- Loyalty redemption as benefit → out of scope.
- Coupon reversal / refund lifecycle → not approved.
- Admin UI exposure of BOGO/BXGY fields (`CouponsPage.jsx`) → follow-up CR-001C-C-UI.
- Variant / add-on / modifier matching → not part of V3-B (POS does not currently send variants per audit).

---

## 5. Engine Readiness Assessment

| Question | Finding | Action |
|---|---|---|
| Can `core/coupon.py` be extended safely? | **Yes.** Existing dispatcher in `validate_coupon_for_customer` already branches on `discount_scope`. V3-B branches on `offer_type` BEFORE scope dispatch (or as a parallel branch under `discount_scope="order"` for "order-scope" BOGO/BXGY semantics — preferred). | Add new module section "V3-B BOGO/BXGY engine"; reuse V2 line-matchers (`_line_matches_*`) wholesale. |
| Do we need a new `offer_type` separate from `discount_scope`? | **Yes.** `discount_scope` describes WHERE the discount applies on the cart (order/item/category); `offer_type` describes the OFFER MECHANIC. V3-A already established this separation. | Use `offer_type="bogo"` and `offer_type="bxg"` (validator already accepts both). `discount_scope` remains `"item"` (or `"category"` for category-scope buy/get). |
| Should BOGO/BXGY use `offer_type="bogo"` / `offer_type="bxg"`? | **Yes** — already the validator's accepted enum. | Reuse. No schema-enum change required. |
| Should current V1/V2/V3-A paths remain unchanged? | **Yes.** Coupons without `offer_type in ("bogo","bxg")` fall through to existing V1/V2 compute. | Branch on `offer_type` early; default branch = today's behavior. |
| What helper functions are needed? | See below. | Implement in `core/coupon.py`. |

**Recommended new helpers (all internal to `core/coupon.py`):**
- `_v3b_resolve_offer_type(coupon) -> str` — defensive normalizer.
- `_v3b_extract_buy_spec(coupon) -> dict` — buy quantity + eligible food/item/category lists.
- `_v3b_extract_get_spec(coupon) -> dict` — get quantity + eligible lists + benefit type/value.
- `_v3b_match_lines(items, spec) -> List[matched_line]` — reuses V2 `_line_matches_*`.
- `_v3b_compute_applications(buy_matches, get_matches, buy_qty, get_qty, max_applications, allow_repeat, same_item_required) -> int` — counts how many full "buy-X + get-Y" applications can be satisfied by current cart.
- `_v3b_select_get_units(get_matches, units_needed, apply_to_cheapest|highest) -> List[unit]` — selects which get-line units receive the benefit.
- `_v3b_compute_discount(selected_units, get_discount_type, get_discount_value) -> float` — applies free / percentage / flat with per-unit cap = unit price.
- `_v3b_build_benefit_summary(...) -> dict` — for response + `coupon_usage` snapshot.

---

## 6. Data Model Plan (all backward-compatible, all optional)

### `coupons` (forward-only additions, no migration)

| Field | Type | Default | Notes |
|---|---|---|---|
| `offer_type` | str | `"simple"` | Already exists; V3-B values `"bogo"` / `"bxg"`. |
| `buy_quantity` | int | none | Required when `offer_type in ("bogo","bxg")`. ≥1. |
| `get_quantity` | int | none | Required when `offer_type in ("bogo","bxg")`. ≥1. |
| `buy_food_ids` / `buy_item_ids` / `buy_category_ids` / `buy_category_names` | list[str] | none | At least one must be non-empty for BXGY; for same-item BOGO the get-lists default to the buy-lists if unset. |
| `get_food_ids` / `get_item_ids` / `get_category_ids` / `get_category_names` | list[str] | none | Optional for same-item BOGO (defaults to buy lists if `same_item_required=true`). |
| `get_discount_type` | str | `"free"` | Enum `"free" / "percentage" / "flat"`. |
| `get_discount_value` | float | none | Required when `get_discount_type in ("percentage","flat")`. For `"free"`, ignored. |
| `max_applications` | int | none | Optional cap on number of applications per order (e.g., 3 means at most 3 free items even if cart contains qty 12). |
| `allow_repeat` | bool | `true` | When `false`, hard cap at 1 application regardless of cart size. |
| `same_item_required` | bool | `false` | When `true`, buy and get must match the SAME line(s); used for "buy 2 get 1 of the same". |
| `apply_to_cheapest_item` | bool | `false` | Reused from V2; controls which get-unit receives the benefit when multiple eligible. |
| `apply_to_highest_item` | bool | `false` | Reused from V2. |
| `requires_get_item_in_cart` | bool | `true` | Locked `true` in V3-B (OQ-V3-3). Field exists for future toggling; not user-editable in V3-B. |
| `pos_instruction` | str | none | Optional human-readable cashier hint ("Free coffee with this code"). |

**No DB index changes.** V2's `(user_id, code)` unique index + V1's `coupon_usage` indexes cover V3-B queries.

### `coupon_usage` (forward-only additions, no migration)

Additions on top of V2/V3-A:
- `offer_type` (already exists) — now writes `"bogo"` or `"bxg"`.
- `buy_quantity` (snapshot from coupon)
- `get_quantity` (snapshot from coupon)
- `applied_applications` (int — how many applications fired)
- `benefit_items` (list[{food_id,item_id,name,quantity,unit_price,line_discount}])
- `buy_match_summary` (list of matched buy lines with quantities consumed)
- `get_match_summary` (list of matched get lines with quantities discounted)
- `computed_discount` (CRM-computed BXGY discount before variance check)
- `pos_coupon_discount` (POS-sent value; already captured today as `coupon_discount` — keep alias)
- `discount_mismatch` (bool — `true` if CRM-computed vs POS-sent exceeds tolerance)
- `pos_instruction` (snapshot if configured)

### POS request bodies — **no protocol change required**

`POSCouponValidateRequest.items` and the final-order webhook already carry `food_id` / `item_id` / `category_id` / `category_name` / `quantity` / `unit_price` / `line_total` per line. POS does NOT need to mark get/free lines.

---

## 7. POS API Contract Plan

### `POST /api/pos/coupons/validate`

**Request:** Unchanged at field level. Cart MUST be supplied for BOGO/BXGY (when `items` missing → new error `MISSING_ITEMS_FOR_BXGY_COUPON`).

**Success response (additive — V3-B fields only present when `offer_type in ("bogo","bxg")`):**
```json
{
  "success": true,
  "data": {
    "coupon_code": "...",
    "coupon_title": "...",
    "offer_type": "bxg",
    "discount_scope": "item",
    "discount_amount": 250.0,
    "final_amount": 1250.0,
    "eligible_subtotal": 500.0,
    "time_window_status": { ... },
    "bxgy": {
      "buy_quantity": 2,
      "get_quantity": 1,
      "applied_applications": 2,
      "max_applications": null,
      "benefit_items": [
        {"food_id":"f_garlic", "name":"Garlic Bread", "quantity":2, "unit_price":125.0, "line_discount":250.0}
      ],
      "buy_match_summary": [
        {"food_id":"f_pizza", "matched_quantity":4, "consumed_for_buy":4}
      ],
      "get_match_summary": [
        {"food_id":"f_garlic", "matched_quantity":2, "discounted_quantity":2}
      ],
      "get_discount_type": "free",
      "pos_instruction": "Mark 2 Garlic Bread as free on bill",
      "requires_pos_action": false
    }
  }
}
```

**Failure responses:** Structured `error.code` (see §12). Outside-window failure already emits `OUTSIDE_TIME_WINDOW` from V3-A; BOGO failure adds V3-B-specific codes.

### `POST /api/pos/orders` (final commit)

- No new top-level fields required from POS.
- `data.coupon_usage` envelope extends with the `bxgy` summary on success.
- On revalidation failure: `recorded:false`, `error.code` from §12, `bxgy.missing_requirements` populated. Order persists. `coupon_usage` row NOT inserted. `coupons.total_used` NOT incremented. Structured warning logged.

### Auth, idempotency, variance tolerance

Unchanged. `(user_id, order_id)` idempotency key, ₹1 / 1% variance tolerance applied to CRM-computed vs POS-sent `coupon_discount` for BOGO/BXGY too.

---

## 8. Available API Plan

`GET /api/pos/coupons/available` remains **query-only** (no cart payload). For BOGO/BXGY coupons:

- Always return `requires_cart_validation: true`.
- Return `eligible_match_hint` block describing buy and get specs (reusing V2's match-hint shape, extended with `buy:{...}` and `get:{...}` sub-blocks).
- Return `expected_discount: null` and `final_amount_preview: null` — cannot compute without a cart.
- Return `offer_type` and `time_window` (V3-A) blocks as today.
- Return `pos_instruction` if configured (helps POS render a hint).
- Time-window-outside coupons still listed with `within_window_now=false` + `next_window_start` (V3-A behavior unchanged).

POS UI calls `/available` for discovery and `/validate` only after the cart is finalized.

---

## 9. Computation Rule Plan

### 9.1 BOGO Same-item

Configuration: `offer_type="bogo"`, `same_item_required=true`, `buy_quantity=1`, `get_quantity=1`, `get_discount_type="free"`, `buy_food_ids` populated, `get_food_ids` defaults to `buy_food_ids`.

Algorithm:
1. Match cart lines against `buy_food_ids`/`buy_item_ids`/etc. → `eligible_lines`.
2. `total_eligible_qty = sum(line.quantity for line in eligible_lines)`.
3. `applications = floor(total_eligible_qty / (buy_quantity + get_quantity))` — for buy-1-get-1 free this is `floor(qty / 2)`.
4. Cap by `max_applications` if set.
5. `free_units = applications × get_quantity`.
6. Select which units are free per `apply_to_cheapest_item` / `apply_to_highest_item` (default: cheapest of eligible lines). Build the unit list by expanding eligible lines into per-unit micro-rows ordered by unit price.
7. `discount = sum(unit_price of selected free units)`.

Worked examples (buy 1, get 1, same item; free):
- qty 1 → 0 applications → not eligible → `BUY_REQUIREMENT_NOT_MET`.
- qty 2 → 1 application → 1 free → discount = 1 × unit_price.
- qty 3 → 1 application → 1 free (one remaining is paid).
- qty 4 → 2 applications → 2 free.

Buy 2 get 1 same-item:
- qty 2 → 0 (need 3 to get one free) → `BUY_REQUIREMENT_NOT_MET`.
- qty 3 → 1 free.
- qty 6 → 2 free.
- qty 7 → 2 free.

### 9.2 Buy-X-Get-Y Same-item

Same as §9.1 with `buy_quantity=X`, `get_quantity=Y`, `same_item_required=true`. Algorithm identical; only the group size changes (X+Y per application).

### 9.3 Buy-X-Get-Y Different-item

Configuration: `same_item_required=false`, `buy_*` lists distinct from `get_*` lists.

Algorithm:
1. Match buy lines → `buy_eligible` (sum quantity = `buy_qty_total`).
2. Match get lines → `get_eligible` (sum quantity = `get_qty_total`).
3. `applications_by_buy = floor(buy_qty_total / buy_quantity)`.
4. `applications_by_get = floor(get_qty_total / get_quantity)`.
5. `applications = min(applications_by_buy, applications_by_get)`. Cap by `max_applications`.
6. If `applications == 0`:
   - If `buy_eligible` empty → `NO_ELIGIBLE_BUY_ITEMS_IN_CART`.
   - Else if `get_eligible` empty → `NO_ELIGIBLE_GET_ITEMS_IN_CART` (locked by OQ-V3-3 — no auto-add).
   - Else if `buy_qty_total < buy_quantity` → `BUY_REQUIREMENT_NOT_MET`.
   - Else `GET_REQUIREMENT_NOT_MET`.
7. `discounted_units = applications × get_quantity`.
8. Select `discounted_units` from `get_eligible` per cheapest/highest preference. Default = cheapest (consumer-friendly is typically highest, but for restaurants the convention in current V2 helpers is cheapest unless overridden).
9. Apply `get_discount_type` per §9.4.

Worked examples (Buy 2 pizzas, get 1 garlic bread free):
- 2 pizzas + 1 garlic bread → 1 application → 1 free garlic bread.
- 2 pizzas + 0 garlic bread → `NO_ELIGIBLE_GET_ITEMS_IN_CART`.
- 4 pizzas + 2 garlic bread → 2 applications → 2 free garlic bread.
- 4 pizzas + 1 garlic bread → 1 application → 1 free garlic bread (cart limits applications).

### 9.4 Benefit Types

For each unit chosen as "get":
- `get_discount_type="free"` → unit discount = `unit_price`.
- `get_discount_type="percentage"` → unit discount = `unit_price × get_discount_value / 100`, capped at `unit_price`.
- `get_discount_type="flat"` → unit discount = `min(get_discount_value, unit_price)`. Per-unit cap is critical to avoid flat ₹100 making a ₹50 item negative.

Total discount = sum across selected units. Coupon-level `max_discount` (existing V1 field) still applies as the final ceiling — `discount = min(total_unit_discount, max_discount)` when `max_discount` set.

### 9.5 Repeated Applications / Max Applications

- `allow_repeat=true` (default) — applications can repeat (qty 12 with buy-1-get-1 → 6 free).
- `allow_repeat=false` — hard cap at 1 application regardless of cart size.
- `max_applications=N` (when set, integer ≥1) — additionally caps applications at N. Combined rule: `effective_applications = min(natural_applications, max_applications if set else ∞, 1 if not allow_repeat else ∞)`.
- `MAX_APPLICATIONS_REACHED` is **NOT** an error — `max_applications` is a cap, not a gate. Coupon still applies up to the cap.

### 9.6 Odd Quantity Rules

Integer floor division throughout. Examples:
- Buy-2-Get-1, qty 5 → 1 application (5 ≥ 3; remaining 2 is just paid).
- Buy-1-Get-1, qty 5 → 2 applications (group size 2 → floor(5/2)=2).
- Buy-1-Get-1, qty 3 → 1 application (one is free, one is paid; one remaining is paid).

No fractional applications. No "give them an extra one because they're close" logic.

---

## 10. Final Order Recording Plan

`pos_order_webhook` calls `record_coupon_usage_for_order(...)` which already invokes `validate_coupon_for_customer(...)`. The V3-B branch within validate runs naturally.

**Success path:**
1. Order persists (HTTP 200).
2. `coupon_usage` row inserted with `offer_type`, `buy_quantity`, `get_quantity`, `applied_applications`, `benefit_items`, `buy_match_summary`, `get_match_summary`, `computed_discount`, `pos_coupon_discount`, `discount_mismatch`.
3. `coupons.total_used` incremented (idempotent on `(user_id, order_id)`).

**Failure path (any V3-B error code or OUTSIDE_TIME_WINDOW):**
1. Order **still persists** (non-blocking, locked by OQ-V3-8 from V3 planning).
2. `coupon_usage` NOT inserted.
3. `coupons.total_used` NOT incremented.
4. Response `data.coupon_usage = {recorded:false, coupon_code, error:{code,field,detail}, bxgy:{missing_requirements:[...]}}`.
5. Structured log line: `coupon_validation_failed_at_final_order error_code=BUY_REQUIREMENT_NOT_MET ...`.

**Idempotent replay:** Same `(user_id, order_id)` → existing row returned with `idempotent_replay=true`; no recomputation, no increment. Unchanged from V1.

**Variance:** If POS-sent `coupon_discount` differs from CRM-computed by more than `max(₹1, 1% × computed)`, set `discount_mismatch=true` and log warning. Still records `coupon_usage` (POS-sent is source of truth for the bill; CRM is the auditor).

---

## 11. `coupon_usage` Field Plan

Snapshot inserted at final commit (in addition to existing V1/V2/V3-A fields):

```json
{
  "offer_type": "bxg",
  "buy_quantity": 2,
  "get_quantity": 1,
  "applied_applications": 2,
  "max_applications": null,
  "allow_repeat": true,
  "same_item_required": false,
  "buy_match_summary": [{"food_id":"f_pizza","matched_quantity":4,"consumed_for_buy":4}],
  "get_match_summary": [{"food_id":"f_garlic","matched_quantity":2,"discounted_quantity":2}],
  "benefit_items": [{"food_id":"f_garlic","quantity":2,"unit_price":125.0,"line_discount":250.0}],
  "get_discount_type": "free",
  "get_discount_value": null,
  "computed_discount": 250.0,
  "pos_coupon_discount": 250.0,
  "discount_mismatch": false,
  "pos_instruction": "Mark 2 Garlic Bread as free on bill",
  "time_window_status": { ... }
}
```

All fields optional; legacy rows remain valid.

---

## 12. Error Code Plan

V3-B introduces **5 new structured error codes**. All emitted from `validate_coupon_for_customer` and surfaced at `/validate` and final-order non-blocking failure.

| Code | When | `error.field` | Detail template |
|---|---|---|---|
| `MISSING_ITEMS_FOR_BXGY_COUPON` | `offer_type in (bogo,bxg)` but request has no `items[]` | `items` | "BOGO/BXGY coupons require cart items at validate time." |
| `BUY_REQUIREMENT_NOT_MET` | Buy-eligible matched lines have total qty < `buy_quantity` | `buy_quantity` | "Add N more eligible items to qualify." |
| `GET_REQUIREMENT_NOT_MET` | Buy satisfied, but get-eligible total qty < `get_quantity` | `get_quantity` | "Add N more get-eligible items to redeem benefit." |
| `NO_ELIGIBLE_BUY_ITEMS_IN_CART` | No cart line matches any buy spec | `buy_food_ids` (or whichever list) | "Cart contains no items eligible for the buy requirement." |
| `NO_ELIGIBLE_GET_ITEMS_IN_CART` | No cart line matches any get spec | `get_food_ids` | "Cart contains no items eligible to receive the benefit. Auto-add not allowed." |
| `BXGY_CONFIG_INVALID` | Admin saved a malformed BOGO/BXGY (e.g., `get_discount_type="percentage"` with no `get_discount_value`) | `discount_value` | "Coupon configuration is incomplete." |
| `UNSUPPORTED_BENEFIT_TYPE` | `get_discount_type` outside `{free,percentage,flat}` | `get_discount_type` | "Benefit type not supported in V3-B." |

**`MAX_APPLICATIONS_REACHED` is intentionally NOT introduced** — `max_applications` is a cap, not a gate. Treating it as an error would break the "more is better, just stop counting" contract.

All V1 (9 codes) + V2 (5 codes) + V3-A (1 code) remain. V3-B adds these 7 (5 functional + 2 admin/config). Total error-code surface after V3-B = 22.

---

## 13. Analytics Plan (additive, non-breaking)

`get_coupon_stats` (and its v2 sibling, if any) extends:

```json
{
  "breakdown_by_offer_type": {
    "simple": ...,
    "bogo":   { "usage_count": ..., "discount_amount": ..., "applications_total": ... },
    "bxg":    { "usage_count": ..., "discount_amount": ..., "applications_total": ... },
    "nth_item": ...,
    "free_item": ...,
    "combo": ...,
    "unknown": ...
  },
  "bxgy_usage": {
    "bogo_orders": <int>,
    "bxg_orders": <int>,
    "total_applications": <int>,
    "free_units_given": <int>,
    "discounted_units_given": <int>
  }
}
```

- V3-A's `breakdown_by_offer_type` already exists; V3-B promotes the `bogo` / `bxg` buckets from 0-counters to real values.
- New `bxgy_usage` block is additive and tolerant of missing fields (defaults to 0). Existing dashboards unaffected.
- `coupons_with_window` / `used_within_window` / `used_outside_window_attempts` (V3-A2 placeholder, still `0`) unchanged.
- No new aggregation pipeline beyond a per-row `$ifNull` group on `offer_type` + `$sum` on `applied_applications`.

---

## 14. Compatibility Plan

Hard regression gates (must remain green before V3-B implementation merges):

| Suite | Target | Reason |
|---|---|---|
| `qa_cr001c_c_coupon_v1` | 45/45 | V1 ORDER_FLAT / ORDER_PERCENTAGE untouched. |
| `qa_cr001c_c_coupon_v2_item_category` | 45/45 | V2 ITEM_* / CATEGORY_* untouched. |
| `qa_cr001c_c_coupon_v3_a_time_window` | 31/31 | V3-A Step-4 pre-check untouched (BOGO/BXGY auto-inherits). |
| `coupon_transactions` legacy collection | untouched | Realtime canonical is still `coupon_usage`. |
| `routers/coupons.py` 9 admin CRUD endpoints | untouched | Field additions are model-level, optional, validator-fronted. |
| `core/loyalty.py`, wallet code, migration code | untouched | Out of scope. |
| `/app/memory/final/` | untouched | Out of scope. |

**Combined pre-V3-B baseline:** 121/121. **Combined post-V3-B target:** 121 + ~30 V3-B assertions = **~151 PASS**.

---

## 15. QA Plan

New harness: `backend/tests/qa_cr001c_c_coupon_v3_b_bogo_bxgy.py` — target **~30 assertions**. Synthetic `QA_C3B_*` fixtures in `seed_coupon_v1_fixtures.py`. Self-cleaning. Same pattern as V3-A.

### V3-B assertion coverage (planned ~30)

**BOGO same-item (5):**
- V3B-01 qty 1 → `BUY_REQUIREMENT_NOT_MET`.
- V3B-02 qty 2 → 1 free, discount = 1 × unit_price.
- V3B-03 qty 3 → 1 free (odd qty).
- V3B-04 qty 4 → 2 free, `applied_applications=2`.
- V3B-05 mixed-eligible lines, cheapest-unit selection verified.

**BXGY same-item (3):**
- V3B-06 Buy-2-Get-1, qty 3 → 1 free.
- V3B-07 Buy-2-Get-1, qty 6 → 2 free.
- V3B-08 Buy-2-Get-1, qty 7 → 2 free (1 remainder paid).

**BXGY different-item (5):**
- V3B-09 Buy 2 pizza + 1 garlic bread → 1 free garlic bread.
- V3B-10 Buy 2 pizza + 0 garlic bread → `NO_ELIGIBLE_GET_ITEMS_IN_CART`.
- V3B-11 Buy 1 pizza + 1 garlic bread → `BUY_REQUIREMENT_NOT_MET`.
- V3B-12 Buy 4 pizza + 2 garlic bread → 2 applications.
- V3B-13 Buy 4 pizza + 1 garlic bread → 1 application (capped by get).

**Benefit types (3):**
- V3B-14 percentage 50% on get item.
- V3B-15 flat ₹50 on get item, where `unit_price=30` → discount capped at 30.
- V3B-16 `max_discount` ceiling caps total discount.

**Cap fields (3):**
- V3B-17 `max_applications=2` with qty supporting 5 → caps at 2.
- V3B-18 `allow_repeat=false` with qty supporting 5 → caps at 1.
- V3B-19 No cap fields → natural floor division.

**API surface (3):**
- V3B-20 `/available` returns `requires_cart_validation=true` + `eligible_match_hint` for BOGO.
- V3B-21 `/validate` without `items[]` → `MISSING_ITEMS_FOR_BXGY_COUPON`.
- V3B-22 `/validate` success response carries `bxgy.applied_applications` + `benefit_items`.

**Final order (3):**
- V3B-23 Final-order success records `coupon_usage` with `offer_type="bxg"` + benefit snapshot.
- V3B-24 Final-order failure (missing get item) — order persists, `coupon_usage` NOT recorded, structured warning logged.
- V3B-25 Idempotent replay returns `idempotent_replay=true`.

**Cross-cutting (3):**
- V3B-26 V3-A time-window + BOGO: outside window → `OUTSIDE_TIME_WINDOW` (V3-A pre-check fires before BOGO compute).
- V3B-27 Loyalty stacking: `stackable_with_loyalty=false` + loyalty_points_used>0 → `STACKING_NOT_ALLOWED`.
- V3B-28 Wallet collection untouched after BOGO flow (regression smoke).

**Analytics (2):**
- V3B-29 `breakdown_by_offer_type.bxg` and `.bogo` buckets populated.
- V3B-30 `bxgy_usage.total_applications` aggregates correctly.

**Admin/config (2):**
- V3B-31 `BXGY_CONFIG_INVALID` raised when `get_discount_type="percentage"` and `get_discount_value` missing.
- V3B-32 `UNSUPPORTED_BENEFIT_TYPE` raised when `get_discount_type="cashback"`.

Total: **~32 V3-B assertions** (above the ~30 target, leaves headroom).

Combined V1+V2+V3-A+V3-B target: **~153 PASS**.

---

## 16. Owner Question Gate

Twelve multiple-choice questions. **5 are blocking** (Q1, Q2, Q4, Q9, Q12). **7 are non-blocking with safe defaults** (Q3, Q5, Q6, Q7, Q8, Q10, Q11). Implementation cannot begin until Q1/Q2/Q4/Q9/Q12 are answered explicitly (or defaults are accepted explicitly).

---

### **Q1. V3-B first implementation scope**

- A. BOGO same-item only
- B. BOGO same-item + BXGY same-item
- C. BOGO same-item + BXGY different-item
- D. **Full BOGO + BXGY with free/percentage/flat get benefit** ← *recommended default*

**Why D:** All four mechanics share one engine (buy-match → get-match → applications → benefit). Splitting into sub-phases doubles test surface without halving risk. The V3-A engine landed clean as one shot; V3-B can too.
**Implementation impact:** Choosing A/B/C reduces V3-B QA from ~32 to ~15–22 assertions and defers ~50% of `core/coupon.py` additions to V3-B2/V3-B3.
**Blocking:** ✅ **YES.**

---

### **Q2. Should get item already be in cart?**

- A. **Yes, required.** ← *recommended default (and already locked by OQ-V3-3)*
- B. No, CRM/POS can auto-add.
- C. Return `pos_instruction` only if missing; cashier adds manually.

**Why A:** OQ-V3-3 already froze this. No auto-add anywhere in V3-B. POS UI can render `pos_instruction` as a hint (Q11), but coupon does NOT apply until cart shows the get item.
**Implementation impact:** A = `NO_ELIGIBLE_GET_ITEMS_IN_CART` error code. B would require POS protocol change + cart-mutation contract (rejected). C is V3-D territory.
**Blocking:** ✅ **YES** (re-affirms locked decision).

---

### **Q3. Same-item BOGO unit-selection rule**

- A. Free **cheapest** eligible unit ← *recommended default*
- B. Free highest eligible unit
- C. Same line item only (no cross-line selection)
- D. Configurable per coupon (`apply_to_cheapest_item` / `apply_to_highest_item`)

**Why A:** Consumer-fair default. Matches V2's `apply_to_cheapest_item` convention (already in admin CRUD).
**Implementation impact:** A = single code path. D = both fields wired (low cost; recommended for V3-B if owner wants flexibility). If D, default both fields `false` → falls back to A.
**Blocking:** ❌ no (safe default A).

---

### **Q4. Different-item BXGY in V3-B**

- A. **Include now.** ← *recommended default*
- B. Plan now but implement in V3-B-later.
- C. Exclude completely.

**Why A:** Same engine. Splitting deflates value (BOGO same-item alone covers only ~30% of real-world offers per audit).
**Implementation impact:** A = ~6 additional assertions; B = 2 sub-phases; C = breaks V3-B value proposition.
**Blocking:** ✅ **YES.**

---

### **Q5. Benefit types in V3-B**

- A. Free only
- B. Free + percentage
- C. **Free + percentage + flat** ← *recommended default*
- D. Configurable later

**Why C:** All three are single-line conditional in `_v3b_compute_discount`. ~10 LOC delta total. Flat capped at per-unit price prevents negative discounts.
**Implementation impact:** Pick A/B and we get a feature-request for the missing type within weeks.
**Blocking:** ❌ no (safe default C).

---

### **Q6. Repeated applications default**

- A. Allow repeat by default ← *recommended default*
- B. No repeat by default
- C. **Controlled by `allow_repeat` field** ← *recommended default (with `true` default value)*

**Why C with default `true`:** Owners control per coupon; safe consumer-friendly default. A and C-with-`true` produce identical runtime behavior; C exposes the lever for opt-out.
**Implementation impact:** C = one extra optional bool field + one validator + one branch. ~5 LOC.
**Blocking:** ❌ no.

---

### **Q7. `max_applications` field**

- A. **Support in V3-B** ← *recommended default*
- B. Do not support yet (treat as unlimited)
- C. Hard cap 1 only (ignore `allow_repeat`)

**Why A:** Realistic offer: "Buy 1 get 1 free, max 3 free per order." Without this, qty 20 = 10 free, which restaurants will not allow.
**Implementation impact:** A = one optional int + one `min(..., max_applications)` line.
**Blocking:** ❌ no.

---

### **Q8. Response granularity**

- A. Total discount only.
- B. **Total discount + `benefit_items` summary** ← *recommended default*
- C. Per-line allocation (CRM tells POS exactly which units to mark free).

**Why B:** Matches V2 OQ-3 (total only, no per-line allocation) but adds informational `benefit_items` for POS UI hinting. Avoids CRM dictating bill formatting.
**Implementation impact:** B = response field. C would be a breaking change requiring POS to honor CRM's selection (rejected — POS owns the bill).
**Blocking:** ❌ no.

---

### **Q9. Final-order revalidation failure**

- A. **Non-blocking, skip `coupon_usage`** ← *recommended default (locked by OQ-V3-8)*
- B. Hard fail the order
- C. Record usage with warning anyway

**Why A:** OQ-V3-8 already froze this for V1/V2/V3-A. Consistency demands V3-B inherits.
**Implementation impact:** A = identical to today's V1 warn-skip path. B would break the POS contract (orders must persist).
**Blocking:** ✅ **YES** (re-affirms locked decision).

---

### **Q10. Time-window + BOGO/BXGY composition**

- A. **Allow combination because V3-A is generic** ← *recommended default*
- B. Do not allow combination yet (reject coupons with both window + BXGY config)
- C. Allow only if coupon config says yes (`time_window_applies` flag)

**Why A:** V3-A Step-4 pre-check runs before any V1/V2/V3-B compute. Composition is automatic. No extra code. V3B-26 assertion verifies.
**Implementation impact:** A = 0 LOC delta. B = new validator rejecting combinations.
**Blocking:** ❌ no.

---

### **Q11. `pos_instruction` field on response**

- A. Always return for BOGO/BXGY (`null` when not configured).
- B. **Only when requirements missing** (i.e., on `NO_ELIGIBLE_GET_ITEMS_IN_CART` or similar) ← *recommended default*
- C. Do not return.

**Why B:** Avoids cluttering happy-path response. On failure, POS UI can prompt cashier with the configured hint.
**Implementation impact:** B = conditional inclusion. A = unconditional. C = drop field.
**Blocking:** ❌ no.

---

### **Q12. Implementation kickoff after this plan**

- A. **Yes, if owner accepts defaults for Q1/Q2/Q4/Q9.** ← *recommended default*
- B. No, require separate decision-freeze doc first.

**Why A:** All blocking questions have explicit recommended defaults (Q1=D, Q2=A, Q4=A, Q9=A). Non-blocking questions have safe defaults. If owner replies "accept defaults", flip status directly to `cr001c_coupon_v3b_bogo_bxgy_plan_ready_for_implementation_approval` and proceed.
**Implementation impact:** A = 2–3 working days kickoff. B = +1 day documentation cycle.
**Blocking:** ✅ **YES.**

---

### Owner question gate summary

| # | Question | Default | Blocking |
|---|---|---|---:|
| Q1 | V3-B scope | D (full) | ✅ |
| Q2 | Get item in cart | A (yes, required) | ✅ |
| Q3 | BOGO unit-selection | A (cheapest) | — |
| Q4 | Different-item BXGY | A (include) | ✅ |
| Q5 | Benefit types | C (free+%+flat) | — |
| Q6 | Repeated applications | C (`allow_repeat=true` default) | — |
| Q7 | `max_applications` | A (support) | — |
| Q8 | Response granularity | B (total + benefit_items) | — |
| Q9 | Final-order failure | A (non-blocking) | ✅ |
| Q10 | Time-window composition | A (allow) | — |
| Q11 | `pos_instruction` | B (failure-only) | — |
| Q12 | Kickoff after plan | A (yes on defaults) | ✅ |

**Blocking count: 5.** **Total: 12.** Non-blocking: 7.

---

## 17. Recommended V3-B Implementation Phases

**Owner choice driven.** Two paths:

### Path Alpha — single-shot V3-B (recommended if Q1=D, Q4=A)

One implementation sprint covering everything in §4 in-scope. ~2–3 working days for one engineer. Same shape as V3-A.

- Files extended: `core/coupon.py` (~250 LOC), `models/schemas.py` (~70 LOC — buy/get fields + validators), `routers/pos.py` (~40 LOC), `services/analytics_service.py` (~40 LOC), `tests/seed_coupon_v1_fixtures.py` (~120 LOC), NEW `tests/qa_cr001c_c_coupon_v3_b_bogo_bxgy.py` (~700 LOC). Admin CRUD untouched.
- Combined post-V3-B: 121 + 32 = **153 PASS**.

### Path Beta — three sub-phases (recommended if Q1<D)

- **V3-B1:** BOGO same-item, free-only benefit. ~12 assertions. ~1 day.
- **V3-B2:** Add BXGY same-item + benefit types (percentage, flat). ~10 additional assertions. ~1 day.
- **V3-B3:** Add BXGY different-item. ~10 additional assertions. ~1 day.

Total elapsed similar to Alpha (~3 days), but with 2 extra freeze cycles. Useful only if owner wants staged review.

---

## 18. Final Recommendation

**Owner decisions are required before V3-B implementation begins.**

**UPDATE (2026-02 — owner reply received):** Owner accepted all 12 recommended defaults (Q1=D, Q2=A, Q3=A, Q4=A, Q5=C, Q6=C, Q7=A, Q8=B, Q9=A, Q10=A, Q11=B, Q12=A) and selected **Path Alpha (single-shot V3-B implementation)**. Status flipped to `cr001c_coupon_v3b_bogo_bxgy_plan_ready_for_implementation_approval`. See Addendum D (§19) for the frozen decision table. Implementation kickoff awaits owner's explicit "begin V3-B implementation" trigger.

---

### Pre-freeze recommendation rationale (historical)

Five questions are blocking (Q1, Q2, Q4, Q9, Q12). Two of these (Q2, Q9) merely re-affirm decisions already locked in V3 planning Addendum C and V3-A — owner can answer "accept locked default" for both.

The remaining three (Q1, Q4, Q12) determine whether Path Alpha (single-shot) or Path Beta (three sub-phases) is taken, and whether implementation begins immediately or waits for a separate freeze doc.

**Recommended owner reply template:**
> "Accept all recommended defaults (Q1=D, Q2=A, Q3=A, Q4=A, Q5=C, Q6=C, Q7=A, Q8=B, Q9=A, Q10=A, Q11=B, Q12=A). Proceed with Path Alpha (single-shot V3-B implementation)."

On that reply, status flips to `cr001c_coupon_v3b_bogo_bxgy_plan_ready_for_implementation_approval` (and then to `..._implementation_in_progress` on kickoff).

---

## 19. Final Status

`cr001c_coupon_v3b_bogo_bxgy_plan_ready_for_implementation_approval`

Owner accepted all recommended defaults (Q1=D, Q2=A, Q3=A, Q4=A, Q5=C, Q6=C, Q7=A, Q8=B, Q9=A, Q10=A, Q11=B, Q12=A) on 2026-02. Path Alpha (single-shot V3-B implementation) is selected. No code, DB, env, migration, or deployment changes performed by this planning step. Implementation kickoff awaits owner's explicit "begin V3-B implementation" trigger; on kickoff, status flips to `cr001c_coupon_v3b_bogo_bxgy_implementation_in_progress`.

---

## Addendum D — Owner Decisions Frozen (2026-02)

Owner reply received: **"Accept all recommended defaults; proceed with Path Alpha."**

| # | Question | Frozen answer | Notes |
|---|---|---|---|
| Q1 | V3-B first implementation scope | **D** — Full BOGO + BXGY with free / percentage / flat get benefit | Single-shot delivery; covers BOGO same-item, BXGY same-item, BXGY different-item. |
| Q2 | Get item already in cart at validate + final | **A** — Yes, required | Re-affirms locked OQ-V3-3. No CRM/POS auto-add anywhere in V3-B. `NO_ELIGIBLE_GET_ITEMS_IN_CART` is the failure code on miss. |
| Q3 | Same-item BOGO unit-selection rule | **A** — Free cheapest eligible unit | Matches V2's `apply_to_cheapest_item` convention. Single code path. `apply_to_highest_item` field still exists as optional override (per coupon config). |
| Q4 | Different-item BXGY in V3-B | **A** — Include now | One engine for BOGO + BXGY same-item + BXGY different-item. |
| Q5 | Benefit types on get item | **C** — Free + percentage + flat | All three implemented in V3-B. Per-unit cap on flat prevents negative discounts. Coupon-level `max_discount` still applies as final ceiling. |
| Q6 | Repeated applications default | **C** — Controlled by `allow_repeat` field, default `true` | Owner-friendly per-coupon lever. Default behavior matches consumer expectations. |
| Q7 | `max_applications` cap field | **A** — Support in V3-B | Optional int ≥1. Combined rule: `effective = min(natural, max_applications if set, 1 if not allow_repeat)`. Not an error code — cap, not gate. |
| Q8 | Response granularity | **B** — Total discount + `benefit_items` summary | Informational `benefit_items` list (food_id, quantity, unit_price, line_discount) for POS UI hint. CRM does NOT dictate which units POS marks free — POS owns the bill. |
| Q9 | Final-order revalidation failure | **A** — Non-blocking, skip `coupon_usage` | Re-affirms locked OQ-V3-8. Order persists; `coupon_usage` NOT inserted; `coupons.total_used` NOT incremented; structured warning logged. |
| Q10 | Time-window + BOGO/BXGY composition | **A** — Allow combination (V3-A is generic) | Zero extra code; V3-A Step-4 pre-check fires before V3-B compute. Verified by V3B-26. |
| Q11 | `pos_instruction` field on response | **B** — Only when requirements missing (failure path) | Keeps happy-path response lean; surfaces hint when cashier needs prompting. |
| Q12 | Implementation kickoff | **A** — Yes on accepting defaults | Path Alpha (single-shot V3-B, ~2–3 working days) approved as the implementation plan. |

### Implementation plan summary (post-freeze)

- **Files extended:** `core/coupon.py` (~250 LOC), `models/schemas.py` (~70 LOC — buy/get fields + validators), `routers/pos.py` (~40 LOC), `services/analytics_service.py` (~40 LOC), `tests/seed_coupon_v1_fixtures.py` (~120 LOC).
- **Files created:** `tests/qa_cr001c_c_coupon_v3_b_bogo_bxgy.py` (~700 LOC, ~32 assertions).
- **Files explicitly UNTOUCHED:** `backend/routers/coupons.py` (9 admin CRUD endpoints), `backend/core/loyalty.py`, wallet code, migration code, `coupon_transactions` legacy collection, `/app/memory/final/`.
- **DB:** No migration. No new indexes. V1/V2 indexes cover V3-B query patterns.
- **Env / dependencies:** No changes. Stdlib only.
- **Regression gates (must remain green at merge):** V1 `45/45`, V2 `45/45`, V3-A `31/31`. Combined post-V3-B target: **~153 PASS**.
- **Effort estimate:** 2–3 working days for one engineer (Path Alpha single-shot).

### Locked invariants carried into implementation

- One coupon per order.
- POS-sent total discount is source of truth for billing; CRM revalidates and persists `coupon_usage` only at final `/api/pos/orders`.
- Get item must already be in cart at validate AND final order — no CRM/POS auto-add anywhere.
- V3-A time-window pre-check (Step 4) is `offer_type`-agnostic; BOGO/BXGY automatically composes with happy-hour.
- Loyalty stacking via `stackable_with_loyalty` flag.
- Wallet untouched (CR-001C-W is separate).
- 9 admin CRUD endpoints in `routers/coupons.py` remain untouched.
- `coupon_transactions` legacy collection untouched.
- `core/loyalty.py`, migration code, `/app/memory/final/` untouched.
- `MAX_APPLICATIONS_REACHED` is NOT an error code (cap, not gate).

### Trigger to begin implementation

Owner sends an explicit "begin V3-B implementation" message → status flips to `cr001c_coupon_v3b_bogo_bxgy_implementation_in_progress` → on QA pass (V1 45/45 + V2 45/45 + V3-A 31/31 + V3-B ~32/~32) → `cr001c_coupon_v3b_bogo_bxgy_implementation_qa_passed_in_preview`.
