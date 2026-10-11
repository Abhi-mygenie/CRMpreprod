# CR-001C-C — Coupon V3-C Every-Nth Item Planning and Owner Gate

**Status:** `cr001c_coupon_v3c_every_nth_plan_ready_for_implementation_approval`
**Previous status (history):** `cr001c_coupon_v3c_every_nth_plan_waiting_owner_decisions`
**Date:** 2026-02 (preview)
**Owner decisions frozen:** 2026-02 — owner accepted all recommended defaults; Path Alpha (single-shot V3-C) selected. See §19 (Final Status) and Addendum E below.

**Prereqs (all green in preview):**
- V1: `cr001c_coupon_v1_implementation_qa_passed_in_preview` (45/45)
- V2: `cr001c_coupon_v2_item_category_implementation_qa_passed_in_preview` (45/45)
- V3-A: `cr001c_coupon_v3a_time_window_implementation_qa_passed_in_preview` (31/31)
- V3-B: `cr001c_coupon_v3b_bogo_bxgy_implementation_qa_passed_in_preview` (49/49)
- Combined baseline: **170/170 PASS**

This is planning + owner-decision-gate only. No code, DB, env, migration, or deployment changes have been made.

---

## 1. Executive Summary

V3-C introduces **Every-Nth item free / discounted** coupons (e.g., "every 5th coffee free", "every 3rd dessert 50% off", "buy 9, 10th free").

The V3-B BOGO/BXGY engine landed in `core/coupon.py` already exposes a near-complete toolbox: line matchers (`_v3b_match_lines_by_lists`), per-unit expansion (`_v3b_expand_units`), unit selection with cheapest/highest preference (`_v3b_select_get_units`), application caps (`_v3b_apply_caps`), summary builders (`_v3b_summarise_lines`), and config validator (`_v3b_validate_config`). The `offer_type` Pydantic validator **already accepts `"nth_item"`** via the V3-A step (no schema-enum change needed).

**Every-Nth is mathematically a degenerate Buy-X-Get-Y:**
> `every Nth free` ≡ `buy_x_get_y` with `buy_quantity = N-1`, `get_quantity = 1`, `same_item_required=true`, `get_discount_type ∈ {free, percentage, flat}`. Applications = `floor(eligible_qty / N)`.

So V3-C is implementable as a **thin shim over the V3-B compute path** with a separate input vocabulary (`nth_item_number`, `nth_discount_type`, `nth_discount_value`) — this matches the owner's intent of "different business language, same math".

Locked invariants carried forward:
- One coupon per order.
- POS-sent total discount is source of truth for billing; CRM revalidates and records `coupon_usage` only at final `/api/pos/orders`.
- No CRM/POS auto-add. Benefit item must already be in cart.
- V3-A Step-4 time-window pre-check composes automatically (it runs before V3-B/V3-C compute).
- Loyalty stacking via `stackable_with_loyalty`. Wallet untouched. `core/loyalty.py` untouched.
- 9 admin CRUD endpoints in `routers/coupons.py` untouched.
- `coupon_transactions` legacy collection, migration code, `/app/memory/final/` untouched.

This plan recommends **three sub-phases (V3-C1/V3-C2/V3-C3)** mapped to a recommended single-shot path when the owner accepts defaults. **12 owner questions** (5 blocking, 7 with safe defaults). V3-C is **NOT approved for implementation** until owner answers Q1/Q2/Q7/Q9/Q12 (or replies "accept all defaults").

---

## 2. Inputs Reviewed

### Documentation
- `/app/memory/PRD.md`
- `/app/memory/crm/crm_1_0/planning/CR_001_INDEX.md`
- `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_EXISTING_SYSTEM_CAPABILITY_AUDIT.md`
- `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_SCRAP_VS_KEEP_DECISION.md`
- `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V1_IMPLEMENTATION_PLAN.md`
- `/app/memory/crm/crm_1_0/implementation/CR_001C_C_COUPON_V1_IMPLEMENTATION_REPORT.md`
- `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V2_ITEM_CATEGORY_PLANNING.md`
- `/app/memory/crm/crm_1_0/implementation/CR_001C_C_COUPON_V2_ITEM_CATEGORY_IMPLEMENTATION_REPORT.md`
- `/app/memory/crm/crm_1_0/qa/CR_001C_C_COUPON_V2_ITEM_CATEGORY_QA_REPORT.md`
- `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V3_COMPLEX_OFFERS_PLANNING.md`
- `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V3A_TIME_WINDOW_IMPLEMENTATION_PLAN.md`
- `/app/memory/crm/crm_1_0/implementation/CR_001C_C_COUPON_V3A_TIME_WINDOW_IMPLEMENTATION_REPORT.md`
- `/app/memory/crm/crm_1_0/qa/CR_001C_C_COUPON_V3A_TIME_WINDOW_QA_REPORT.md`
- `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V3B_BOGO_BXGY_PLANNING_AND_OWNER_GATE.md` (Addendum D — V3-B decisions, mirrors what V3-C should follow)
- `/app/memory/crm/crm_1_0/implementation/CR_001C_C_COUPON_V3B_BOGO_BXGY_IMPLEMENTATION_REPORT.md`
- `/app/memory/crm/crm_1_0/qa/CR_001C_C_COUPON_V3B_BOGO_BXGY_QA_REPORT.md`
- POS bug log POS3_0_BUG_108 (POS does not currently transmit variants / add-ons / line sequence numbers; per-line `quantity` + `unit_price` is the canonical contract).

### Code (read-only)
- `backend/core/coupon.py` — V1/V2/V3-A/V3-B engine. V3-B helpers `_v3b_*` reusable for V3-C math. `_v3a_*` time-window pre-check is `offer_type`-agnostic. `_normalize_discount_type` strict check already skipped for V3-B `offer_type`; pattern extensible to `"nth_item"`.
- `backend/models/schemas.py` — `_v3a_validate_offer_type` already accepts `"nth_item"`. `POSCartItem` already exposes `food_id` / `item_id` / `category_id` / `category_name` / `item_category` / `quantity` / `unit_price` / `line_total`. No POS protocol change needed.
- `backend/routers/pos.py` — `pos_validate_coupon`, `pos_list_available_coupons`, `pos_order_webhook` already plumb `applied_applications`, `benefit_items`, `same_item_required`, `pos_instruction`, `discount_mismatch` — V3-C reuses the response shape with `nth_item_number` substituted for `buy_quantity`/`get_quantity` (or in parallel).
- `backend/routers/coupons.py` — 9 admin CRUD endpoints (untouched in V3-A and V3-B; extensible via additive optional fields).
- `backend/services/analytics_service.py` — `_get_breakdown_by_offer_type` already iterates `nth_item` bucket (currently 0); V3-C populates it. New `_get_nth_item_usage` block is the natural additive analytics.
- `backend/tests/qa_cr001c_c_coupon_v1.py` / `_v2_item_category.py` / `_v3_a_time_window.py` / `_v3_b_bogo_bxgy.py` — 170 assertions form the regression gate. V3-C harness will mirror V3-B's structure.
- `backend/tests/seed_coupon_v1_fixtures.py` — `QA_C1_/QA_C2_/QA_C3A_/QA_C3B_` fixtures, cleanup regex pattern.

### Key evidence carried into the plan
- `offer_type = "nth_item"` **already accepted** by Pydantic (V3-A enum).
- `POSCartItem` carries everything V3-C needs — no POS protocol change.
- V3-B helpers cover ~80% of the V3-C compute. V3-C is a small wrapper that:
  1. accepts `nth_item_number`, `nth_discount_type`, `nth_discount_value`,
  2. internally calls a `_v3c_compute_discount` that mirrors `_v3b_compute_discount` but uses `group_size = N` and `units_per_app = 1`,
  3. snapshots a small set of V3-C-specific fields into `coupon_usage`.
- V3-A time-window pre-check (Step 4) is `offer_type`-agnostic → composes with V3-C for free.
- V3-B's `requires_cart_validation=True` listing pattern reused for V3-C coupons.

---

## 3. V1 / V2 / V3-A / V3-B Baseline (V3-C must not break)

| Surface | V1 | V2 | V3-A | V3-B |
|---|---|---|---|---|
| `discount_scope` | `"order"` | + `"item"` / `"category"` | unchanged | unchanged |
| `discount_type` | `ORDER_FLAT` / `ORDER_PERCENTAGE` | + `ITEM_*` / `CATEGORY_*` | unchanged | placeholder; not consulted for `offer_type ∈ {bogo,bxg}` |
| `offer_type` enum | n/a | n/a | `"simple"` baseline | `"bogo"` / `"bxg"` engine |
| Pre-check order | code → INACTIVE → EXPIRED → usage/channel/min/specific → stacking | + V2 cart eligibility | + Step-4 time window | + V3-B branch before V1/V2 dispatch |
| Final-commit | idempotent on `(user_id,order_id)` | same | same | same |
| Analytics | base | + `breakdown_by_scope` | + `breakdown_by_offer_type`, `time_window_usage` | + `bxgy_usage` |
| Admin CRUD | untouched | untouched | untouched | untouched |

**V3-C must keep all of the above green** (170/170 regression + new V3-C assertions).

---

## 4. V3-C Scope Candidate

**In scope (V3-C):**
1. **Same-item every-Nth free** (e.g., "every 5th coffee free", "10th coffee free after buying 9").
2. **Same-item every-Nth discounted** (e.g., "every 3rd dessert 50% off", "every 4th beverage ₹50 off").
3. **Category-level every-Nth** (e.g., "every 5th beverage free" — N counted across all matching beverage lines, cheapest beverage receives benefit).
4. **Benefit types** on the Nth unit: `free` / `percentage` / `flat` (reuses V3-B benefit math; flat capped per-unit).
5. **Repeated applications** (10 coffees with every-5th-free → 2 free).
6. **`max_applications`** cap.
7. **`allow_repeat=false`** cap at 1.
8. **`apply_to_cheapest_item`** (default per Q3=A) and **`apply_to_highest_item`** override.
9. **V3-A time-window composition** — automatic via Step-4 pre-check.
10. **One coupon per order** locked.
11. **Final `/api/pos/orders`** revalidation, non-blocking on V3-C failure.

**Out of V3-C (deferred):**
- Free-item instruction-only → V3-D.
- Combo offers → V4 (parked).
- CRM/POS auto-add of Nth item.
- Variant / add-on / modifier matching.
- Multi-coupon-per-order.
- Wallet cashback as benefit → CR-001C-W.
- Loyalty redemption as benefit.
- Coupon reversal / refund lifecycle.
- Admin UI exposure → follow-up CR-001C-C-UI.
- Sequence-aware "physical Nth" (Nth is mathematically the Nth eligible **quantity**, not the Nth scan; POS line order is non-deterministic anyway).

---

## 5. Engine Readiness Assessment

| Question | Finding | Action |
|---|---|---|
| Can V3-C reuse V3-B helpers? | **Yes.** `_v3b_line_matches_lists`, `_v3b_line_unit_price`, `_v3b_expand_units`, `_v3b_summarise_lines`, `_v3b_select_get_units`, `_v3b_apply_caps`, `_v3b_resolve_buy_lists` (with `buy_*` field aliases for V3-C `eligible_*`), benefit math via `_v3b_compute_discount`'s per-unit `free/%/flat` branch — all reusable verbatim. | Add `_v3c_compute_discount` that wraps V3-B logic with `group_size = nth_item_number` and `units_per_app = 1`. |
| Is Every-Nth internally just BXGY repeated? | **Yes.** `Every Nth ≡ buy_x_get_y` with `buy_q = N-1`, `get_q = 1`, `same_item_required=true`. | Owner sees `nth_item_number` vocabulary; internally we either (a) translate at compute time, or (b) keep a parallel `_v3c_compute_discount` for clarity. Recommended: (b) for self-documenting code, but internally the function body is a 15-LOC shim. |
| Need `offer_type="nth_item"`? | **Yes.** Already accepted by Pydantic (V3-A enum). | Adopt the existing enum value. No schema-enum change. Add `nth_item` to the V3-C dispatch helper. |
| Translate to `buy_q = N-1, get_q = 1`? | Internally, **yes** — but the persisted coupon document carries the V3-C vocabulary (`nth_item_number`, `nth_discount_type`, `nth_discount_value`) so the admin CRUD and analytics use the business-friendly names. | At compute time, derive `group_size = N` directly without writing `buy_quantity`/`get_quantity` to the coupon doc. |
| Reuse V3-B `benefit_items`, `applied_applications`, `pos_instruction`? | **Yes.** Same response field names; meaning is identical. | Add: `nth_item_number`, `nth_discount_type` to validate/order responses and `coupon_usage`. |
| V3-A composition? | **Yes.** Step-4 pre-check is generic. | V3-C branch fires AFTER Step-4, same position as V3-B. |
| Risk to V1/V2/V3-A/V3-B? | **Low.** V3-C branches when `offer_type == "nth_item"`. Default branch unchanged. | Same dispatch pattern as V3-B — proven safe. |

### Recommended new helpers (in `core/coupon.py`)
- `_v3c_normalize_offer_type(coupon) -> Optional[str]` — returns `"nth_item"` or `None`.
- `_v3c_validate_config(coupon) -> Optional[dict]` — checks `nth_item_number ≥ 2`, `nth_discount_type ∈ {free, percentage, flat}`, `nth_discount_value > 0` when type is percentage/flat, at least one eligibility list.
- `_v3c_compute_discount(coupon, items) -> dict` — orchestrates: match eligible lines → expand units → `applications = floor(eligible_qty / N)` → apply `_v3b_apply_caps` → select `applications` units via `_v3b_select_get_units` → apply per-unit benefit math → build summary.

No new low-level helpers — V3-C is a wrapper around the V3-B toolbox.

---

## 6. Data Model Plan (all optional, no migration)

### `coupons` (forward-only additions)

| Field | Type | Default | Notes |
|---|---|---|---|
| `offer_type` | str | `"simple"` | Already exists; V3-C value `"nth_item"`. |
| `nth_item_number` | int | none | Required when `offer_type="nth_item"`. ≥ 2 (Nth=1 is meaningless). |
| `nth_discount_type` | str | `"free"` | Enum `{"free","percentage","flat"}`. Validator added. |
| `nth_discount_value` | float | none | Required when `nth_discount_type ∈ {percentage, flat}`. |
| `max_applications` | int | none | Reused from V3-B. Optional cap. |
| `allow_repeat` | bool | `true` | Reused from V3-B. |
| `apply_to_cheapest_item` | bool | `false` | Reused from V2/V3-B. |
| `apply_to_highest_item` | bool | `false` | Reused from V2/V3-B. |
| `pos_instruction` | str | none | Reused from V3-B. |
| `eligible_food_ids` / `eligible_item_ids` / `eligible_category_ids` / `eligible_category_names` | list[str] | none | **Reuses V2 fields** — no new `nth_*_ids`. Item-level vs category-level is determined by which list is populated. |
| `excluded_item_ids` / `excluded_category_ids` | list[str] | none | Reuses V2 `_line_is_excluded` logic. |

**Naming alternative considered & rejected:** introducing `nth_food_ids`/`nth_item_ids`/`nth_category_ids` parallels V3-B's `buy_*`/`get_*` lists. **Rejected** because (a) every-Nth has only one eligibility pool (no buy/get split), and (b) reusing `eligible_*` mirrors V2 admin CRUD vocabulary and avoids confusing the operator. See Q2 (mathematical interpretation) for the corresponding decision.

### `coupon_usage` (forward-only additions)

Additions on top of V1/V2/V3-A/V3-B:
- `nth_item_number` (snapshot from coupon)
- `nth_discount_type` (snapshot)
- `nth_discount_value` (snapshot)

The V3-B snapshot fields (`applied_applications`, `benefit_items`, `computed_discount`, `discount_mismatch`, `max_applications`, `allow_repeat`, `same_item_required`, `get_discount_type`, `pos_instruction`) are **reused** with the following semantic mapping:
- `same_item_required` ← always `true` for V3-C (every Nth is by definition same-eligibility-pool).
- `get_discount_type` ← echoes `nth_discount_type` for V3-A/V3-B analytics convenience.
- `buy_match_summary` / `get_match_summary` ← V3-C writes a single `eligible_match_summary` list; the two V3-B fields will both be empty for V3-C rows (or aliased — recommended Q11-style decision).

Recommended: keep V3-B `buy_match_summary`/`get_match_summary` empty for V3-C and add **one** new `eligible_match_summary` field with the `[{food_id, item_id, name, matched_quantity}]` shape. Avoids polluting V3-B semantics.

**No DB indexes added.** V1/V2 indexes cover V3-C queries (Mongo `$match offer_type ∈ {nth_item}` over `coupon_usage`).

### POS request bodies — **no protocol change required**

`POSCartItem` already has everything V3-C needs. POS does not need to send a sequence number; "every Nth" is computed mathematically on the eligible **quantity total**, not on the cart's line order (see Q2).

---

## 7. POS API Contract Plan

### `POST /api/pos/coupons/validate`

**Request:** Unchanged at field level. `items[]` required when `offer_type="nth_item"` (returns `MISSING_ITEMS_FOR_EVERY_NTH_COUPON` when absent).

**Success response (additive — V3-C fields only present when applicable):**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "code": "...",
    "title": "...",
    "offer_type": "nth_item",
    "discount_scope": "item",
    "discount_amount": 100.0,
    "computed_discount": 100.0,
    "eligible_subtotal": 100.0,
    "final_amount_preview": 400.0,
    "applied_applications": 1,
    "benefit_items": [
      {"food_id": "f_coffee", "name": "Coffee", "quantity": 1, "unit_price": 100.0, "line_discount": 100.0}
    ],
    "eligible_match_summary": [
      {"food_id": "f_coffee", "name": "Coffee", "matched_quantity": 5}
    ],
    "nth_item_number": 5,
    "nth_discount_type": "free",
    "nth_discount_value": null,
    "max_applications": null,
    "allow_repeat": true,
    "time_window_status": null,
    "requires_cart_validation": false
  }
}
```

**Failure response:** Structured `error.code` from §12. `pos_instruction` carried only on missing-requirement codes (Q11=B).

### `GET /api/pos/coupons/available`

For V3-C coupons:
- `requires_cart_validation: true`
- `offer_type: "nth_item"`
- `eligible_match_hint: {kind: "nth_item", nth_item_number: N, eligibility: {type: "food_ids"/"item_ids"/"category_ids"/"category_names", values: [...]}, nth_discount_type, nth_discount_value}`
- `expected_discount: null`, `final_amount_preview: null`
- `nth_item_number`, `nth_discount_type`, `nth_discount_value`, `max_applications`, `allow_repeat`, `pos_instruction`
- V3-A `time_window` block unchanged.

### `POST /api/pos/orders` (final commit)

- No new top-level POS fields required.
- `data.coupon_usage` on success carries `nth_item_number`, `nth_discount_type`, `applied_applications`, `benefit_items[]`, `eligible_match_summary`, `discount_mismatch`.
- On non-blocking failure: `pos_instruction` when configured.

### Auth, idempotency, variance tolerance — unchanged

`(user_id, order_id)` idempotency; ₹1 / 1% variance tolerance applied to CRM-computed vs POS-sent.

---

## 8. Available API Plan

`GET /api/pos/coupons/available` remains query-only (no cart payload). V3-C coupons:
- Always `requires_cart_validation: true`.
- Return `eligible_match_hint` describing the Nth rule + eligibility pool.
- Return `expected_discount: null`.
- Return `time_window` block (V3-A) unchanged.
- Return `pos_instruction` when configured (helps POS UI hint).

POS UI calls `/available` for discovery and `/validate` only after cart is finalized.

---

## 9. Computation Rule Plan

### 9.1 Same-item Every-Nth

Configuration: `offer_type="nth_item"`, `nth_item_number=N`, `eligible_food_ids=[…]` (or `eligible_item_ids`), `nth_discount_type ∈ {free, percentage, flat}`, `nth_discount_value` (when not free).

Algorithm:
1. Match cart lines via `_v3b_line_matches_lists` against `eligible_*` lists.
2. Skip `_line_is_excluded(...)` lines (V2 excluded lists).
3. Expand to per-unit micro-rows via `_v3b_expand_units(...)`.
4. `eligible_total = len(units)`.
5. If `eligible_total < N` → `NTH_REQUIREMENT_NOT_MET`.
6. `applications = eligible_total // N`.
7. Apply `_v3b_apply_caps(applications, coupon)` (handles `allow_repeat`, `max_applications`).
8. `benefit_units_needed = applications × 1`.
9. Select via `_v3b_select_get_units(...)` — default cheapest (Q3=A), `apply_to_highest_item` overrides.
10. Per selected unit: apply `nth_discount_type` math (free → `unit_price`; percentage → `min(unit_price × value/100, unit_price)`; flat → `min(value, unit_price)`).
11. Sum → `total_discount`; cap by coupon-level `max_discount` (if set, scaling `benefit_items[*].line_discount`).

Worked examples (every 5th coffee free):
- qty 4 → 0 applications → `NTH_REQUIREMENT_NOT_MET`.
- qty 5 → 1 free (₹100 if unit_price = ₹100).
- qty 9 → 1 free (`floor(9/5) = 1`).
- qty 10 → 2 free.
- qty 14 → 2 free.

Every 3rd dessert 50% off:
- qty 2 → `NTH_REQUIREMENT_NOT_MET`.
- qty 3 → 1 dessert 50% off.
- qty 6 → 2 desserts 50% off.

### 9.2 Category-level Every-Nth

Same algorithm. The only difference is the eligibility pool comes from `eligible_category_ids` / `eligible_category_names`. Per-line matching reuses `_v3b_line_matches_lists` (V2 priority: food_id → item_id → category_id → category_name).

Worked example (every 5th beverage free):
- 2 coffees + 3 teas (both category=beverages) → `eligible_total=5` → 1 application → 1 free beverage; cheapest of the 5 units selected by default (Q3=A).
- 7 beverages → 1 application.
- 10 beverages → 2 applications.

### 9.3 Benefit Types

Same as V3-B per-unit math (verified V3B-T1..T3):
- `free`: discount = `unit_price`.
- `percentage`: discount = `min(unit_price × nth_discount_value / 100, unit_price)`.
- `flat`: discount = `min(nth_discount_value, unit_price)`.

Coupon-level `max_discount` still applies as a final ceiling, scaling `benefit_items[*].line_discount` proportionally.

### 9.4 Repeated Applications / Max Applications

- `allow_repeat=true` (default) → natural repetition (qty 10 with N=5 → 2 applications).
- `allow_repeat=false` → hard cap at 1 application.
- `max_applications=M` → caps applications at M. **Not an error.**
- Combined: `effective = min(natural, M if set, 1 if !allow_repeat)`.

`MAX_APPLICATIONS_REACHED` is **NOT** introduced — consistent with V3-B precedent.

### 9.5 Quantity and Selection Rules

- Integer floor division (`eligible_total // N`).
- `unit_price` fallback: `line_total / quantity` when `unit_price` missing (V3-B parity).
- Lines with `unit_price < 0` or no price → silently dropped (matches V3-B).
- `excluded_item_ids` / `excluded_category_ids` honored (V2 `_line_is_excluded`).
- Selection default = cheapest eligible unit (Q3=A).
- `apply_to_highest_item=True` → highest.
- Both flags together → cheapest wins (Q3 default), consistent with V3-B.

---

## 10. Final Order Recording Plan

Identical to V3-B's contract.

**Success:**
1. Order persists (HTTP 200).
2. `coupon_usage` row inserted with V3-C snapshot.
3. `coupons.total_used` incremented (idempotent on `(user_id, order_id)`).

**Failure (any V3-C error or `OUTSIDE_TIME_WINDOW`):**
1. Order persists.
2. `coupon_usage` NOT inserted.
3. `coupons.total_used` NOT incremented.
4. Response carries `data.coupon_usage.error` + `pos_instruction` when configured.
5. Structured warning logged (`coupon_validation_failed_at_final_order error_code=...`).

**Idempotent replay:** Same `(user_id, order_id)` → existing row returned, `idempotent_replay=true`.

**Variance:** `discount_mismatch=true` when POS-sent vs CRM-computed exceeds `max(₹1, 1% × computed)`. POS-sent recorded as `coupon_discount`; CRM kept as `crm_computed_discount`/`computed_discount`.

---

## 11. `coupon_usage` Field Plan

Additive snapshot fields (in addition to V1/V2/V3-A/V3-B):

```json
{
  "offer_type": "nth_item",
  "nth_item_number": 5,
  "nth_discount_type": "free",
  "nth_discount_value": null,
  "applied_applications": 2,
  "max_applications": null,
  "allow_repeat": true,
  "benefit_items": [
    {"food_id": "f_coffee", "name": "Coffee", "quantity": 2, "unit_price": 100.0, "line_discount": 200.0}
  ],
  "eligible_match_summary": [
    {"food_id": "f_coffee", "name": "Coffee", "matched_quantity": 10}
  ],
  "computed_discount": 200.0,
  "discount_mismatch": false,
  "pos_instruction": null,
  "time_window_status": null
}
```

`buy_match_summary` / `get_match_summary` / `same_item_required` / `get_discount_type` / `buy_quantity` / `get_quantity` (V3-B fields) remain `null`/empty for V3-C rows.

---

## 12. Error Code Plan

V3-C introduces **5 new structured error codes** (4 functional + 1 admin/config). All emitted from `validate_coupon_for_customer`.

| Code | When | `error.field` | Detail template |
|---|---|---|---|
| `MISSING_ITEMS_FOR_EVERY_NTH_COUPON` | `offer_type="nth_item"` and request has no `items[]` | `items` | "Every-Nth coupons require cart items at validate time." |
| `NTH_REQUIREMENT_NOT_MET` | Eligible total qty < `nth_item_number` | `nth_item_number` | "Add N more eligible item(s) to qualify." |
| `NO_ELIGIBLE_NTH_ITEMS_IN_CART` | No cart line matches the eligibility lists | `eligible_food_ids` (or whichever list) | "Cart contains no items eligible for this every-Nth offer." |
| `EVERY_NTH_CONFIG_INVALID` | Admin saved a malformed Nth coupon (`nth_item_number < 2`, missing value for percentage/flat, no eligibility list) | `nth_item_number` / `nth_discount_value` / `eligible_food_ids` | "Coupon configuration is incomplete." |
| `UNSUPPORTED_NTH_BENEFIT_TYPE` | `nth_discount_type` outside `{free, percentage, flat}` | `nth_discount_type` | "Benefit type not supported in V3-C." |

**Not introduced:**
- `MAX_APPLICATIONS_REACHED` — consistent with V3-B (cap, not gate).
- `NTH_AUTO_ADD_NOT_ALLOWED` — not needed; the Nth unit is selected from items already in cart (mathematically, the Nth eligible unit IS in cart whenever `eligible_total ≥ N`, by definition). Unlike V3-B different-item BXGY, there's no separate "get" pool that could be missing.

**Total error-code surface after V3-C** = 22 + 5 = **27**.

---

## 13. Analytics Plan (additive, non-breaking)

`get_coupon_stats` returns one new top-level block:

```json
"nth_item_usage": {
  "orders": <int>,           // count of coupon_usage rows with offer_type=nth_item
  "total_applications": <int>,
  "discount_amount": <float>,
  "benefit_units_given": <int>,
  "by_nth_number": {         // e.g. {"3": 12, "5": 27, "10": 4}
    "<N>": <int>
  }
}
```

- `breakdown_by_offer_type.nth_item` (already present, currently 0) becomes populated.
- `by_nth_number` lets the dashboard show "which Nth values are popular" — useful business intel.
- `bxgy_usage` (V3-B) unchanged.
- All other keys unchanged → dashboards safe.

Aggregation: one `$ifNull` group on `offer_type="nth_item"` + per-row `benefit_items` scan (same shape as V3-B `_get_bxgy_usage`) + a `$group nth_item_number` for the distribution.

---

## 14. Compatibility Plan

Hard regression gates (must remain green before V3-C merges):

| Suite | Target | Reason |
|---|---|---|
| `qa_cr001c_c_coupon_v1` | 45/45 | V1 ORDER paths untouched. |
| `qa_cr001c_c_coupon_v2_item_category` | 45/45 | V2 ITEM/CATEGORY paths untouched. |
| `qa_cr001c_c_coupon_v3_a_time_window` | 31/31 | V3-A Step-4 pre-check untouched (V3-C auto-inherits). |
| `qa_cr001c_c_coupon_v3_b_bogo_bxgy` | 49/49 | V3-B branch untouched; V3-C runs in a sibling branch. |
| `coupon_transactions` legacy collection | untouched | — |
| `routers/coupons.py` 9 admin CRUD endpoints | untouched | Field additions are model-level, optional, validator-fronted. |
| `core/loyalty.py`, wallet code, migration code | untouched | Out of scope. |
| `/app/memory/final/` | untouched | Out of scope. |

**Combined pre-V3-C baseline:** 170/170. **Combined post-V3-C target:** 170 + ~28 V3-C assertions = **~198 PASS**.

---

## 15. QA Plan

New harness: `backend/tests/qa_cr001c_c_coupon_v3_c_every_nth.py` — target **~28 assertions**. Synthetic `QA_C3C_*` fixtures in `seed_coupon_v1_fixtures.py`. Self-cleaning. Same pattern as V3-B.

### V3-C assertion coverage (planned ~28)

**Available API (3):**
- V3C-A1 `/available` lists Nth coupon with `requires_cart_validation=true`.
- V3C-A2 `offer_type="nth_item"` returned.
- V3C-A3 `eligible_match_hint` carries `{kind: "nth_item", nth_item_number, eligibility, nth_discount_type, nth_discount_value}`.

**Missing items (1):**
- V3C-M1 No `items[]` → `MISSING_ITEMS_FOR_EVERY_NTH_COUPON`.

**Same-item Every-5th free (5):**
- V3C-S1 qty 4 → `NTH_REQUIREMENT_NOT_MET`.
- V3C-S2 qty 5 → 1 free.
- V3C-S3 qty 9 → 1 free.
- V3C-S4 qty 10 → 2 free.
- V3C-S5 Mixed-eligible lines, cheapest unit selected (₹80 over ₹150).

**Every-3rd percentage (2):**
- V3C-P1 qty 3, 50% off, unit_price ₹100 → discount ₹50.
- V3C-P2 qty 6 → 2 applications, discount ₹100.

**Every-4th flat (2):**
- V3C-F1 flat ₹150 capped by unit_price ₹100 → discount ₹100.
- V3C-F2 flat ₹20 on ₹100 → discount ₹20.

**Category-level (3):**
- V3C-C1 2 coffees + 3 teas, eligibility="beverages", N=5 → 1 free beverage (cheapest).
- V3C-C2 7 beverages → 1 application.
- V3C-C3 10 beverages → 2 applications.

**Mixed cart + excluded (2):**
- V3C-X1 3 desserts (eligible) + 2 mains (non-eligible), N=3 → 1 dessert 50% off; mains untouched.
- V3C-X2 `excluded_item_ids` honored.

**Caps (2):**
- V3C-K1 `max_applications=2` with qty 15 (N=5) → caps at 2.
- V3C-K2 `allow_repeat=false` with qty 10 → 1 application.

**Selection (1):**
- V3C-Sel1 `apply_to_highest_item=true` picks highest unit.

**Edge cases (2):**
- V3C-E1 `line_total` fallback.
- V3C-E2 Negative `unit_price` line ignored.

**Response shape + pos_instruction (3):**
- V3C-R1 Success response carries `benefit_items` + `applied_applications` + `nth_item_number`.
- V3C-R2 `pos_instruction` surfaced on `NTH_REQUIREMENT_NOT_MET`.
- V3C-R3 `pos_instruction` NOT surfaced on success.

**Time-window composition (2):**
- V3C-W1 Outside window → `OUTSIDE_TIME_WINDOW` (V3-A short-circuits).
- V3C-W2 Inside window → V3-C computes.

**Loyalty + final order + idempotency + analytics (3):**
- V3C-L1 `STACKING_NOT_ALLOWED` when `stackable_with_loyalty=false` + loyalty points.
- V3C-F1o Final-order success records `coupon_usage` with `offer_type="nth_item"`, `nth_item_number`, `applied_applications`, `benefit_items`.
- V3C-F2o Idempotent replay returns `recorded=false, idempotent_replay=true`.
- V3C-F3o Failure path persists order, no `coupon_usage` row, structured warning logged.
- V3C-AN1 `breakdown_by_offer_type.nth_item.used` populated.
- V3C-AN2 `nth_item_usage` block populated (`orders`, `total_applications`, `benefit_units_given`, `by_nth_number`).

**Admin validators + runtime config (3):**
- V3C-V1 Valid V3-C `CouponCreate` round-trips.
- V3C-V2 `nth_item_number < 2` raises Pydantic error.
- V3C-V3 Invalid `nth_discount_type` raises.
- V3C-RT1 `EVERY_NTH_CONFIG_INVALID` (insert-bypass) raised when percentage without `nth_discount_value`.
- V3C-RT2 `UNSUPPORTED_NTH_BENEFIT_TYPE` raised on `nth_discount_type="cashback"`.

**Wallet + Loyalty untouched (2):**
- V3C-LW1 `wallet_transactions` count unchanged.
- V3C-LW2 `core.loyalty` importable.

Total: **~33 V3-C assertions** (above the ~28 target; covers edges so we can absorb late-discovered issues without expanding scope).

Combined target: **170 + 33 = ~203 PASS**.

---

## 16. Owner Question Gate

Twelve multiple-choice questions. **5 are blocking** (Q1, Q2, Q7, Q9, Q12). **7 are non-blocking with safe defaults** (Q3, Q4, Q5, Q6, Q8, Q10, Q11). Implementation cannot begin until Q1/Q2/Q7/Q9/Q12 are answered (or "accept all defaults").

---

### **Q1. V3-C first implementation scope [BLOCKING]**

- A. Same-item every-Nth free only
- B. Same-item every-Nth free + percentage
- C. Same-item + category-level every-Nth with free / percentage / flat
- **D. Full V3-C: item/category every-Nth with free/percentage/flat, repeat, max_applications ← recommended**

**Why D:** All four mechanics share one engine (`_v3c_compute_discount` wraps V3-B helpers; adds ~120 LOC total). Splitting doubles test surface without halving risk — same finding that drove V3-B Path Alpha.
**Impact:** D = ~33 assertions, one sprint. A/B/C = staged sub-phases V3-C1/V3-C2/V3-C3, +1 day each freeze cycle.
**Blocking:** ✅ YES.

---

### **Q2. Every-Nth interpretation: eligible quantity vs cart sequence [BLOCKING]**

- **A. Mathematically: floor(eligible_total / N) — counted across eligible quantity ← recommended**
- B. Sequence-aware: every Nth scan/line in the order POS sent them.
- C. Decide later.

**Why A:** (1) POS does not currently transmit a deterministic line sequence per audit. (2) Sequence-aware would mean two identical carts with different POS line orderings get different discounts — fairness/auditability nightmare. (3) Every-Nth-by-quantity is the industry-standard meaning and what the planning examples assume ("buy 9, 10th free" — qty math).
**Impact:** A = current plan as written. B requires POS protocol change + line-order audit trail (out of scope).
**Blocking:** ✅ YES (semantic foundation).

---

### **Q3. Benefit selection default**

- **A. Cheapest eligible benefit units ← recommended**
- B. Highest eligible benefit units.
- C. Same line only.
- D. Configurable per coupon (`apply_to_cheapest_item` / `apply_to_highest_item`).

**Why A:** Consumer-fair default and consistent with V2/V3-B precedent. D is implicitly available because both flags already exist on the coupon (reused from V2). Default = A; `apply_to_highest_item=true` overrides.
**Impact:** A = identical code path to V3-B. D = "both flags exposed in admin", which is already true.
**Blocking:** ❌ no.

---

### **Q4. Benefit types in V3-C**

- A. Free only.
- B. Free + percentage.
- **C. Free + percentage + flat ← recommended**

**Why C:** Engine already supports all three (V3-B `_v3b_compute_discount` per-unit branch). Excluding any of them is more code, not less. Owner gets all three for free (literally).
**Impact:** C = +0 LOC vs A. A = 5 LOC to forbid percentage/flat.
**Blocking:** ❌ no.

---

### **Q5. Repeated applications default**

- A. Allow repeat by default.
- B. No repeat by default.
- **C. Controlled by `allow_repeat` field (default `true`) ← recommended (matches V3-B Q6=C)**

**Why C with default `true`:** Consistent with V3-B. Owners control per coupon.
**Impact:** C = 0 LOC delta (helper already reads the flag).
**Blocking:** ❌ no.

---

### **Q6. `max_applications` field**

- **A. Support in V3-C ← recommended**
- B. Do not support yet.
- C. Hard cap 1 only.

**Why A:** Realistic offer ("every 5th coffee free, max 2 free per order"). `_v3b_apply_caps` already handles it.
**Impact:** A = 0 LOC delta.
**Blocking:** ❌ no.

---

### **Q7. Category-level every-Nth [BLOCKING]**

- **A. Include in V3-C ← recommended**
- B. Plan but implement later (V3-C2).
- C. Exclude completely.

**Why A:** Category eligibility is one extra list type, already handled by `_v3b_line_matches_lists` (V2 priority). Excluding it cuts ~5 LOC and removes 3 QA assertions but breaks the "every 5th beverage" canonical example.
**Impact:** A = +0 LOC vs B/C (the matchers already exist).
**Blocking:** ✅ YES (semantic scope, owner should consciously affirm).

---

### **Q8. Response granularity**

- A. Total discount only.
- **B. Total discount + `benefit_items` summary ← recommended (matches V3-B Q8=B)**
- C. Per-line allocation.

**Why B:** Mirrors V3-B; POS UI already knows how to parse `benefit_items[]`. No per-line allocation (CRM does not dictate which units POS marks free).
**Impact:** B = identical to V3-B response.
**Blocking:** ❌ no.

---

### **Q9. Final-order failure [BLOCKING]**

- **A. Non-blocking, skip `coupon_usage` ← recommended (re-affirms locked OQ-V3-8 / V3-B Q9)**
- B. Hard fail order.
- C. Record usage with warning anyway.

**Why A:** Locked in V1/V2/V3-A/V3-B. Consistency demands V3-C inherits.
**Impact:** A = identical to today's warn-skip path.
**Blocking:** ✅ YES (re-affirms locked decision).

---

### **Q10. Time-window + Every-Nth composition**

- **A. Allow combination (V3-A is generic) ← recommended (matches V3-B Q10=A)**
- B. Do not allow yet.
- C. Allow only if coupon config says yes (`time_window_applies` flag).

**Why A:** V3-A Step-4 pre-check runs before V3-C compute. Zero extra code; V3C-W1/W2 verify.
**Impact:** A = 0 LOC delta.
**Blocking:** ❌ no.

---

### **Q11. `pos_instruction` field**

- A. Always return for every-Nth.
- **B. Only return when requirements missing ← recommended (matches V3-B Q11=B)**
- C. Do not return.

**Why B:** Keeps happy-path response lean; surfaces hint when cashier needs prompting ("add 1 more coffee for free Nth!").
**Impact:** B = identical to V3-B.
**Blocking:** ❌ no.

---

### **Q12. Implementation kickoff after this plan [BLOCKING]**

- **A. Yes, if owner accepts defaults for Q1/Q2/Q7/Q9 ← recommended**
- B. No, require separate decision-freeze doc first.

**Why A:** All blocking questions have explicit recommended defaults. Same pattern that worked for V3-B Path Alpha.
**Impact:** A = ~2 days kickoff (smaller than V3-B because helpers are already in place). B = +1 day freeze cycle.
**Blocking:** ✅ YES.

---

### Owner question gate summary

| # | Question | Default | Blocking |
|---|---|---|---:|
| Q1 | V3-C scope | D (full) | ✅ |
| Q2 | Nth interpretation | A (eligible quantity, math) | ✅ |
| Q3 | Selection default | A (cheapest) | — |
| Q4 | Benefit types | C (free+%+flat) | — |
| Q5 | Repeated applications | C (`allow_repeat=true` default) | — |
| Q6 | `max_applications` | A (support) | — |
| Q7 | Category-level | A (include) | ✅ |
| Q8 | Response granularity | B (total + benefit_items) | — |
| Q9 | Final-order failure | A (non-blocking) | ✅ |
| Q10 | Time-window composition | A (allow) | — |
| Q11 | `pos_instruction` | B (failure-only) | — |
| Q12 | Kickoff | A (yes on defaults) | ✅ |

**Blocking count: 5.** **Total: 12.** Non-blocking: 7.

---

## 17. Recommended V3-C Implementation Phases

### Path Alpha — single-shot V3-C (recommended if Q1=D, Q7=A)

One implementation sprint covering item-level + category-level every-Nth with all three benefit types and both caps. ~1.5–2 working days (smaller than V3-B because the V3-B helper layer is already in place).

- Files extended:
  - `core/coupon.py` (~120 LOC: `_v3c_normalize_offer_type`, `_v3c_validate_config`, `_v3c_compute_discount`, dispatch branch in `validate_coupon_for_customer`).
  - `models/schemas.py` (~50 LOC: `nth_item_number` / `nth_discount_type` / `nth_discount_value` validators on Coupon/CouponCreate/CouponUpdate/CouponUsage).
  - `routers/pos.py` (~25 LOC: surface V3-C response fields in `pos_validate_coupon` and `pos_order_webhook`).
  - `services/analytics_service.py` (~60 LOC: `_get_nth_item_usage` aggregator + `nth_item_usage` block in `get_coupon_stats`).
  - `tests/seed_coupon_v1_fixtures.py` (~120 LOC: 6–8 `QA_C3C_*` fixtures + cleanup regex extension).
  - NEW `tests/qa_cr001c_c_coupon_v3_c_every_nth.py` (~550 LOC, ~33 assertions).
- Combined post-V3-C: 170 + 33 = **~203 PASS**.

### Path Beta — three sub-phases (if Q1<D or Q7<A)

- **V3-C1:** Same-item every-Nth free only. ~12 assertions. ~1 day.
- **V3-C2:** Add percentage + flat benefit. ~10 additional assertions. ~0.5 day.
- **V3-C3:** Add category-level every-Nth. ~10 additional assertions. ~0.5 day.

Total elapsed similar to Alpha, but with 2 extra freeze cycles.

**Recommended: Path Alpha.**

---

## 18. Final Recommendation

**Owner decisions are required before V3-C implementation begins.**

**UPDATE (2026-02 — owner reply received):** Owner accepted all 12 recommended defaults (Q1=D, Q2=A, Q3=A, Q4=C, Q5=C, Q6=A, Q7=A, Q8=B, Q9=A, Q10=A, Q11=B, Q12=A) and selected **Path Alpha (single-shot V3-C implementation)**. Status flipped to `cr001c_coupon_v3c_every_nth_plan_ready_for_implementation_approval`. See Addendum E (§19) for the frozen decision table. Implementation kickoff awaits owner's explicit "begin V3-C implementation" trigger.

---

### Pre-freeze recommendation rationale (historical)

Five questions are blocking (Q1, Q2, Q7, Q9, Q12). Two of those (Q2, Q9) re-affirm semantic and operational decisions already locked at planning level (Q2: math, not sequence; Q9: non-blocking failure).

The remaining three (Q1 scope, Q7 category-level, Q12 kickoff) determine Path Alpha vs Path Beta and whether implementation begins immediately or after a separate freeze doc.

**Recommended owner reply template:**
> *"Accept all recommended defaults (Q1=D, Q2=A, Q3=A, Q4=C, Q5=C, Q6=A, Q7=A, Q8=B, Q9=A, Q10=A, Q11=B, Q12=A). Proceed with Path Alpha."*

On that reply, status flips to `cr001c_coupon_v3c_every_nth_plan_ready_for_implementation_approval` and Path Alpha (single-shot V3-C, ~1.5–2 working days) begins on owner's explicit "begin V3-C implementation" trigger.

---

## 19. Final Status

`cr001c_coupon_v3c_every_nth_plan_ready_for_implementation_approval`

Owner accepted all recommended defaults (Q1=D, Q2=A, Q3=A, Q4=C, Q5=C, Q6=A, Q7=A, Q8=B, Q9=A, Q10=A, Q11=B, Q12=A) on 2026-02. Path Alpha (single-shot V3-C implementation) is selected. No code, DB, env, migration, or deployment changes performed by this planning step. Implementation kickoff awaits owner's explicit "begin V3-C implementation" trigger; on kickoff, status flips to `cr001c_coupon_v3c_every_nth_implementation_in_progress`.

---

## Addendum E — Owner Decisions Frozen (2026-02)

Owner reply received: **"Accept all recommended defaults; proceed with Path Alpha."**

| # | Question | Frozen answer | Notes |
|---|---|---|---|
| Q1 | V3-C first implementation scope | **D** — Full V3-C: item + category every-Nth with free / percentage / flat, `allow_repeat`, `max_applications` | Single-shot delivery; one engine wrapping V3-B helpers. |
| Q2 | Every-Nth interpretation: eligible quantity vs cart sequence | **A** — Mathematically: `floor(eligible_total / N)` counted across eligible quantity | Semantic foundation. POS does not transmit a deterministic line sequence per audit; sequence-aware would break fairness/auditability. |
| Q3 | Benefit selection default | **A** — Cheapest eligible benefit unit | Matches V2 / V3-B precedent. `apply_to_highest_item=true` available as per-coupon override. |
| Q4 | Benefit types in V3-C | **C** — Free + percentage + flat | All three already supported by V3-B per-unit benefit math (~0 LOC delta). |
| Q5 | Repeated applications default | **C** — Controlled by `allow_repeat` field, default `true` | Matches V3-B Q6. Owner controls per coupon. |
| Q6 | `max_applications` cap field | **A** — Support in V3-C | Realistic offer ("every 5th coffee free, max 2 per order"). `_v3b_apply_caps` already handles it. |
| Q7 | Category-level every-Nth | **A** — Include in V3-C | Single extra list type, already handled by V2 line matchers. Required for the "every 5th beverage" canonical example. |
| Q8 | Response granularity | **B** — Total discount + `benefit_items` summary | Mirrors V3-B Q8. POS UI already parses `benefit_items[]`. No per-line allocation — POS owns the bill. |
| Q9 | Final-order revalidation failure | **A** — Non-blocking, skip `coupon_usage` | Re-affirms V3-B Q9 / V3 OQ-V3-8. Order persists; `coupon_usage` NOT inserted; `coupons.total_used` NOT incremented; structured warning logged. |
| Q10 | Time-window + Every-Nth composition | **A** — Allow combination (V3-A is generic) | Zero extra code; V3-A Step-4 pre-check fires before V3-C compute. Verified by V3C-W1/W2 in QA plan. |
| Q11 | `pos_instruction` field on response | **B** — Only return when requirements missing (failure path) | Keeps happy-path response lean. Mirrors V3-B Q11. |
| Q12 | Implementation kickoff after plan | **A** — Yes on accepting defaults | Path Alpha (single-shot V3-C, ~1.5–2 working days) approved as the implementation plan. |

### Implementation plan summary (post-freeze)

- **Files extended:**
  - `core/coupon.py` (~120 LOC: `_v3c_normalize_offer_type`, `_v3c_validate_config`, `_v3c_compute_discount`, dispatch branch in `validate_coupon_for_customer` inserted at the same position as V3-B branch — after V3-A Step-4 pre-check, before V1/V2 scope dispatch).
  - `models/schemas.py` (~50 LOC: `nth_item_number` / `nth_discount_type` / `nth_discount_value` validators on `Coupon` / `CouponCreate` / `CouponUpdate` / `CouponUsage`; reuses `_v3b_validate_pos_int_ge_one` pattern; reuses `_v3a_validate_offer_type` (already accepts `"nth_item"`)).
  - `routers/pos.py` (~25 LOC: surface `nth_item_number` / `nth_discount_type` / `nth_discount_value` / `eligible_match_summary` in `pos_validate_coupon` success response, `pos_order_webhook` `data.coupon_usage` block, and on-failure `pos_instruction` (Q11=B)).
  - `services/analytics_service.py` (~60 LOC: new `_get_nth_item_usage` aggregator with `$ifNull` group on `offer_type="nth_item"` + per-row `benefit_items` scan + `nth_item_number` distribution; `get_coupon_stats` returns additive `nth_item_usage` block).
  - `tests/seed_coupon_v1_fixtures.py` (~120 LOC: 6–8 `QA_C3C_*` fixtures + cleanup regex extended to `^(?:QA_C1_|QA_C2_|QA_C3A_|QA_C3B_|QA_C3C_)`).
- **Files created:** `tests/qa_cr001c_c_coupon_v3_c_every_nth.py` (~550 LOC, ~33 assertions).
- **Files explicitly UNTOUCHED:** `backend/routers/coupons.py` (9 admin CRUD endpoints), `backend/core/loyalty.py`, wallet code, migration code, `coupon_transactions` legacy collection, `/app/memory/final/`.
- **DB:** No migration. No new indexes. V1/V2 indexes cover V3-C query patterns.
- **Env / dependencies:** No changes. Stdlib only.
- **Regression gates (must remain green at merge):** V1 `45/45`, V2 `45/45`, V3-A `31/31`, V3-B `49/49`. Combined post-V3-C target: **~203 PASS** (170 + ~33 V3-C).
- **Effort estimate:** 1.5–2 working days for one engineer (Path Alpha single-shot; smaller than V3-B because the V3-B helper layer is already in place).

### Locked invariants carried into implementation

- One coupon per order.
- POS-sent total discount is source of truth for billing; CRM revalidates and persists `coupon_usage` only at final `/api/pos/orders`.
- Benefit item must already be in cart at validate AND final order — no CRM/POS auto-add anywhere.
- Every-Nth is computed mathematically on `floor(eligible_total / nth_item_number)`; POS line order/sequence is NOT consulted.
- V3-A time-window pre-check (Step 4) is `offer_type`-agnostic; Every-Nth automatically composes with happy-hour.
- Loyalty stacking via `stackable_with_loyalty` flag.
- Wallet untouched (CR-001C-W is separate).
- `core/loyalty.py` untouched.
- 9 admin CRUD endpoints in `routers/coupons.py` untouched (Pydantic models gain optional V3-C fields with safe defaults).
- `coupon_transactions` legacy collection untouched.
- Migration code, `/app/memory/final/` untouched.
- `MAX_APPLICATIONS_REACHED` is NOT an error code (cap, not gate — consistent with V3-B precedent).

### Trigger to begin implementation

Owner sends an explicit "begin V3-C implementation" message → status flips to `cr001c_coupon_v3c_every_nth_implementation_in_progress` → on QA pass (V1 45/45 + V2 45/45 + V3-A 31/31 + V3-B 49/49 + V3-C ~33/~33) → `cr001c_coupon_v3c_every_nth_implementation_qa_passed_in_preview`.
