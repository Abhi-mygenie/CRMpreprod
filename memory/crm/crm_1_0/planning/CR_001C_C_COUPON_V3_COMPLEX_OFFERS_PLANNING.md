# CR-001C-C — Coupon V3 Complex Offers Planning

**Module:** CR-001C-C (Coupon) — V3 complex offers (BOGO / Buy-X-Get-Y / Every-Nth / Happy-hour / Free-item / Combo)
**Date:** 2026-02-XX (Feb 2026)
**Author:** CRM Team
**Status:** `cr001c_coupon_v3a_time_window_plan_ready_for_implementation_approval`
**Previous status (history):** `cr001c_coupon_v3_complex_offers_plan_waiting_owner_decisions` → superseded by owner decisions in Addendum C (this doc)
**Prerequisites (frozen):**
- V1 → `cr001c_coupon_v1_implementation_qa_passed_in_preview` (45/45 PASS)
- V2 → `cr001c_coupon_v2_item_category_implementation_qa_passed_in_preview` (45/45 PASS, combined 90/90)
- POS integration (V1 + V2) is intentionally deferred and will be handed off jointly with V3-A once owner approves the V3 phasing.

> **PLANNING DOCUMENT ONLY.** No code changes, no DB changes, no env changes, no migrations, no deployment, no Wallet code touched, no Loyalty code touched, `/app/memory/final/` not touched. The agent halts after writing this doc and the optional INDEX / PRD status flips.

---

## 1. Executive Summary

V3 covers **complex restaurant offers** that the current V1/V2 engine cannot express:

1. BOGO (Buy One Get One)
2. Buy X Get Y (different buy / get groups, percentage or free get-item)
3. Every Nth item free / discounted (cart-level repetition rule)
4. Happy-hour / time-window eligibility (orthogonal to discount type)
5. Free-item coupons (fixed free item with optional threshold)
6. Combo offers (fixed-price item bundles)

Recommended approach: **do NOT attempt all six in one sprint.** Phase V3 into five releases:

| Phase | Title | Why this position |
|---|---|---|
| **V3-A** | Time-window / Happy-hour as a generic cross-cutting rule | Highest business value at lowest engine risk. CRM-only — no POS cart automation. Unlocks V1/V2 happy-hour variants without new offer types. |
| **V3-B** | BOGO + Buy-X-Get-Y (CRM validates + computes; POS owns cart shape) | Core "complex" engine work. POS must already send `items[]` (V2 contract). No auto-add — POS UI shows benefit_items and cashier adds them. |
| **V3-C** | Every-Nth item discounted (repeat applications of V3-B) | Pure superset of V3-B with `max_applications` + `nth_item_number`. No new POS contract surface beyond V3-B. |
| **V3-D** | Free-item coupons (threshold + free benefit item) | Depends on POS cart UI from V3-B. Simpler computation, harder POS UX (zero-priced line). |
| **V3-E** | Combo fixed-price offers | Most invasive contract change (combo_groups + required slots). Park until V3-A..D usage data informs design. |

V3 is built on a **new lightweight `offer_type` discriminator** layered on top of V1/V2's `discount_scope` × `discount_type` composition. V1/V2 rows default to `offer_type="simple"` and behave identically. No migration is required.

The **single biggest design principle:** CRM remains the source of truth for *eligibility, computation, recording, and analytics*. POS remains the source of truth for the *final money POS-printed bill amount*. CRM **does not** mutate the POS cart in any V3 phase. POS UI changes are out of scope for CRM but are explicitly documented as dependencies per phase in §12.

Recommended first phase: **V3-A (time-window / happy-hour)** — generic rule, low risk, immediate business value (lunch/evening promos), zero POS cart automation dependency.

---

## 2. Inputs Reviewed

### Documents
| # | Document | Purpose |
|---|---|---|
| 1 | `/app/memory/PRD.md` | Top-level CR-001C-C status (V1/V2 frozen) |
| 2 | `/app/memory/crm/crm_1_0/planning/CR_001_INDEX.md` | CR-001C-C row, status ladder |
| 3 | `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_EXISTING_SYSTEM_CAPABILITY_AUDIT.md` | V0 baseline + missing types |
| 4 | `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_SCRAP_VS_KEEP_DECISION.md` | Option B (rebuild contract + engine) architecture |
| 5 | `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V1_OWNER_DECISIONS.md` | Q1=A, Q2=C, Q3=D, Q4=B, Q5=C, Q6=B (V3=BOGO/happy-hour) |
| 6 | `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V1_IMPLEMENTATION_PLAN.md` (+Addendum A.1–A.7) | V1 contract baseline |
| 7 | `/app/memory/crm/crm_1_0/implementation/CR_001C_C_COUPON_V1_IMPLEMENTATION_REPORT.md` | V1 outcome |
| 8 | `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V2_ITEM_CATEGORY_PLANNING.md` (+Addendum B) | V2 plan + frozen OQ decisions |
| 9 | `/app/memory/crm/crm_1_0/implementation/CR_001C_C_COUPON_V2_ITEM_CATEGORY_IMPLEMENTATION_REPORT.md` | V2 outcome (90/90 PASS) |
| 10 | `/app/memory/crm/crm_1_0/qa/CR_001C_C_COUPON_V2_ITEM_CATEGORY_QA_REPORT.md` | V2 QA detail |
| 11 | `/app/memory/crm/crm_1_0/planning/POS3_0_BUG_108_API_INVENTORY_FOR_CRM_2026_05_22.md` | POS field inventory (for V2 contract) |

> The V1 QA report file path used in V1 was `qa_cr001c_c_coupon_v1.py` (harness only — no standalone .md report). The V2 QA report exists and was read.

### Code (READ-ONLY, no edits made)
| File | Region |
|---|---|
| `backend/core/coupon.py` | Full file (905 LOC) — service module |
| `backend/routers/pos.py` | Coupon endpoints (`pos_validate_coupon`, `pos_available_coupons`, `pos_order_webhook`, legacy `/coupons/apply`, payment webhook) |
| `backend/routers/coupons.py` | Admin CRUD (untouched in V1/V2, must remain untouched in V3) |
| `backend/models/schemas.py` | `Coupon`, `CouponCreate`, `CouponUpdate`, `CouponUsage`, `POSCartItem`, `POSCouponValidateRequest`, `OrderItem`, `POSOrderWebhook` |
| `backend/services/analytics_service.py` | `get_coupon_stats` (union of `coupon_usage` + `coupon_transactions`) |
| `backend/tests/qa_cr001c_c_coupon_v1.py` | 45 assertions baseline |
| `backend/tests/qa_cr001c_c_coupon_v2_item_category.py` | 45 assertions baseline |
| `backend/tests/seed_coupon_v1_fixtures.py` | Seeder for V1+V2 fixtures |

### Collections (read-only confirmation)
| Collection | Role | V3 plan |
|---|---|---|
| `coupons` | Definitions | EXTEND with optional V3 fields (no migration) |
| `coupon_usage` | Realtime canonical recording | EXTEND with optional V3 audit fields |
| `coupon_transactions` | Legacy migration-sourced | UNTOUCHED (analytics union preserved) |

### Searches confirmed absent in current code (no V3 plumbing yet)
- No `offer_type`, `buy_quantity`, `get_quantity`, `buy_food_ids`, `get_food_ids`, `nth_item_number`, `max_applications`, `free_item_ids`, `combo_groups`, `time_window`, `valid_days`, `start_time`, `end_time`, `timezone`, `happy_hour`, `bogo`, `benefit_items`, `apply_to_cheapest_item` (cart-wide), `combo_fixed_price`, `required_item_groups`.
- `apply_to_cheapest_item` / `apply_to_highest_item` flags exist on the V2 coupon model but operate **per coupon as a single-line restriction**, not as a cart-wide BOGO selector.

---

## 3. V1/V2 Baseline (must remain stable in V3)

| Surface | Stability requirement |
|---|---|
| `ORDER_FLAT` / `ORDER_PERCENTAGE` (V1) | Identical behavior. V1 harness 45/45 must remain green. |
| `ITEM_*` / `CATEGORY_*` (V2) | Identical behavior. V2 harness 45/45 must remain green. |
| `GET /api/pos/coupons/available` | Same signature. New `offer_type` field is additive. |
| `POST /api/pos/coupons/validate` | Same JSON body shape. V3 adds optional `order_time` (ISO) for time-window. Existing callers continue to work. |
| `POST /api/pos/orders` | Same contract. `data.coupon_usage` gains optional V3 audit fields. |
| Idempotency `(user_id, order_id)` | Unchanged. One coupon per order remains the V3 invariant. |
| Final-order non-blocking failure (Addendum A.3, V2 §B.8) | Unchanged. V3 inherits — failed revalidation → order persists, usage NOT recorded, structured warning logged. |
| Variance tolerance (₹1 abs / 1% rel) | Unchanged. |
| Loyalty stacking (`stackable_with_loyalty`) | Unchanged. |
| 9 admin CRUD endpoints in `routers/coupons.py` | UNTOUCHED. Model gains optional V3 fields only. |
| `core/loyalty.py`, wallet code, migration code, `coupon_transactions` collection | UNTOUCHED. |
| `/app/memory/final/` | UNTOUCHED. |

---

## 4. V3 Candidate Feature Inventory

| Feature | Example | Business Value | POS Complexity | CRM Complexity | Recommended Phase |
|---|---|---|---|---|---|
| Time-window / Happy-hour | "20% off beverages, weekdays 3–6 PM" | HIGH (lunch / evening promos) | LOW (no cart mutation, just display window) | LOW (timezone-safe DOW/HOUR check) | **V3-A** |
| BOGO same-item | "Buy 1 pizza, get 1 pizza free" | HIGH (mass restaurant promo) | MEDIUM (cashier adds 2nd line; CRM advises) | MEDIUM | **V3-B** |
| BOGO same-category | "Buy any burger, get any burger free" | HIGH | MEDIUM | MEDIUM | **V3-B** |
| Buy X Get Y (different get item) | "Buy 2 pizzas, get 1 garlic bread free" | HIGH | HIGH (cashier must add get-item explicitly) | MEDIUM-HIGH | **V3-B** |
| Buy X Get Y (% off get item) | "Buy 3 coffees, get 4th 50% off" | MEDIUM-HIGH | MEDIUM | MEDIUM | **V3-B** |
| Every Nth item free | "Every 5th coffee free" | MEDIUM | MEDIUM | MEDIUM (multi-application of V3-B) | **V3-C** |
| Every Nth at % off | "Every 3rd dessert at 50% off" | MEDIUM | MEDIUM | MEDIUM | **V3-C** |
| Free item (threshold) | "Free dessert on orders above ₹999" | MEDIUM-HIGH | HIGH (zero-priced line, cashier flow) | MEDIUM | **V3-D** |
| Birthday free item | "Free coffee on birthday" | MEDIUM | HIGH | MEDIUM | **V3-D** (gated by `customer.birthday_window`; reuses loyalty L4 helpers read-only) |
| Combo fixed price | "Burger + Fries + Coke = ₹199" | HIGH but COMPLEX | VERY HIGH (combo groups, slot substitution) | HIGH | **V3-E** (or park to V4) |
| Combo with free item | "Buy burger+fries, get coke free" | MEDIUM | VERY HIGH | HIGH | **V3-E** (or park to V4) |

---

## 5. Current Engine Readiness

### What the existing V1/V2 engine can already extend cleanly
1. **Pre-checks reusable as-is** — `is_active`, `start_date`/`end_date`, `usage_limit`, `per_user_limit`, `min_order_value`, `applicable_channels`, `specific_users`, `stackable_with_loyalty`.
2. **Cart matching reusable as-is** — `_line_matches_item_scope`, `_line_matches_category_scope`, `_line_is_excluded` handle the eligibility filter needed for "buy group" and "get group" matching.
3. **`POSCartItem` payload** — already includes `food_id`, `item_id`, `category_id`, `category_name`, `item_category`, `quantity`, `unit_price`, `line_total` — sufficient for BOGO / BXG / Nth without contract change.
4. **Final-commit idempotency `(user_id, order_id)`** — works for V3 unchanged.
5. **`coupon_usage` audit-fields pattern** — easy to extend with `applied_applications`, `benefit_items`, `offer_type`.

### What needs new engine work
1. **Buy/Get group concept.** V1/V2 has *one* eligibility set. V3-B needs **two** — `buy_*` and `get_*` — and a quantity loop (how many "applications" of the rule fit into the cart).
2. **Multi-application loop.** V3-B/C need to compute how many times the rule applies (with `max_applications` cap). V1/V2 always returns a single `eligible_subtotal`.
3. **Benefit-items concept.** V3-B/C/D need to return *which* cart lines (and how many units of them) received the free / discounted benefit. Currently CRM only returns a single `coupon_discount` total (V2 OQ-3 frozen).
4. **Time-window eligibility (V3-A).** Needs `order_time` ISO from POS (or `datetime.now()` in restaurant timezone as fallback) plus `start_time`, `end_time`, `valid_days`, `timezone` config on the coupon. Reusable across all V3 phases and even backportable to V1/V2 (e.g. a V1 percentage that only applies during happy hour).
5. **Free-item presence guard.** V3-D needs to either *require* POS to send the benefit item in `items[]` (recommended; mirrors V2 cart-aware validation) or return a `requires_pos_action` hint so POS UI can prompt the cashier.
6. **Combo definition (V3-E).** Multi-group eligibility (e.g. "1 burger AND 1 fries AND 1 drink"). Requires `combo_groups: List[{group_id, min_qty, eligible_item_ids/category_ids}]`. Significantly larger schema delta. **Park to V3-E or V4 until V3-A..D usage informs design.**

### Engine refactor vs incremental extension
**Recommendation: incremental extension, NOT a rule-engine rewrite.**

The existing `_compute_v2_discount` is well-structured. V3 adds:
- A new dispatcher `_compute_v3_discount(coupon, scope, items, order_time)` that switches on `offer_type`:
  - `"simple"` → falls through to V1/V2 path (no change)
  - `"bogo"` / `"bxg"` → V3-B compute
  - `"nth_item"` → V3-C compute (loop V3-B)
  - `"free_item"` → V3-D compute
  - `"combo"` → V3-E compute
- A new pre-check `_is_within_time_window(coupon, order_time)` invoked early in `validate_coupon_for_customer` — applies to **all offer types** including V1/V2 (only when the coupon defines a window).

V1/V2 row defaults: `offer_type` absent → "simple" → V1/V2 logic unchanged.

---

## 6. Proposed V3 Data Model

All V3 schema additions are **optional, backward-compatible, no migration required**.

### 6.1 Common fields (used by all V3 offer types)

| Field | Type | Default | Used by | Notes |
|---|---|---|---|---|
| `offer_type` | str | `"simple"` | All V3 | `"simple"` \| `"bogo"` \| `"bxg"` \| `"nth_item"` \| `"free_item"` \| `"combo"`. Default keeps V1/V2 untouched. |
| `max_applications` | int \| None | `None` (= 1) | BOGO/BXG/Nth/Free/Combo | Cap on how many times the rule applies per order (e.g. cashier rings up 4 burgers → up to 2 BOGO applications). |
| `allow_repeat` | bool | `True` | BOGO/BXG/Nth/Combo | If `False`, only one application per order regardless of cart size. Mirrors V2's `max_applicable_qty` philosophy. |
| `pos_instruction` | str \| None | `None` | All V3 (server-returned hint) | Free-text instruction for cashier UI (e.g. "Add a free dessert"). Returned by `available` + `validate`. |
| `requires_pos_action` | bool | `False` | Server-returned | Set by CRM when POS must add a benefit line manually (BOGO get-item, free-item, etc.). |

### 6.2 Time-window fields (V3-A — generic, usable by all coupon types)

| Field | Type | Default | Notes |
|---|---|---|---|
| `valid_days` | List[int] \| None | `None` | ISO weekday integers `[0..6]` (Mon=0 … Sun=6). `None` = all days. |
| `start_time` | str \| None | `None` | `"HH:MM"` 24h, restaurant local. `None` = no daily window. |
| `end_time` | str \| None | `None` | `"HH:MM"` 24h, restaurant local. If `end_time < start_time` → overnight window (wraps midnight). |
| `timezone` | str \| None | `None` | IANA tz (e.g. `"Asia/Kolkata"`). `None` → fall back to restaurant's `settings.timezone` from `users` doc, then UTC. |
| `valid_from_iso` | str \| None | `None` | Reused from V1 `start_date` (already exists). Optional override for finer granularity. |
| `valid_until_iso` | str \| None | `None` | Reused from V1 `end_date`. |

Owner-server time policy (recommended): CRM uses **server-derived `now_iso` in restaurant timezone**, NOT POS-supplied time. Accept optional `order_time` in validate/orders payload for *display* but **server clock is the source of truth** to prevent clock-drift abuse.

### 6.3 BOGO / Buy-X-Get-Y fields (V3-B)

| Field | Type | Default | Notes |
|---|---|---|---|
| `buy_quantity` | int | 1 | Items required from `buy_*` set for one application. |
| `get_quantity` | int | 1 | Items granted as benefit per application. |
| `buy_item_ids` | List[str] \| None | `None` | Eligible "buy" items by `item_id`. |
| `buy_food_ids` | List[str] \| None | `None` | Eligible "buy" items by `food_id` (POS canonical). |
| `buy_category_ids` | List[str] \| None | `None` | Eligible "buy" items by category id. |
| `buy_category_names` | List[str] \| None | `None` | Case-insensitive name fallback. |
| `get_item_ids` | List[str] \| None | `None` | Benefit items. If `None` AND same-item-only flag set, get = buy. |
| `get_food_ids` | List[str] \| None | `None` | Same. |
| `get_category_ids` | List[str] \| None | `None` | Benefit by category. |
| `get_category_names` | List[str] \| None | `None` | Same. |
| `get_discount_type` | str | `"free"` | `"free"` \| `"percentage"` \| `"flat"`. `"free"` = 100% off get-item. |
| `get_discount_value` | float | 100.0 | When `get_discount_type="percentage"`. For `"flat"`, ₹ off per get-unit. |
| `apply_to_cheapest_get_item` | bool | `True` | When multiple get-eligible items present and `get_quantity < get-eligible count`, pick cheapest by default (industry-standard BOGO). |
| `same_item_only` | bool | `False` | Restrict get-set to lines matching the *exact same* item as a buy-line. Used by "Buy 1 coffee, get 1 coffee free". |

### 6.4 Every-Nth fields (V3-C — superset of V3-B)

| Field | Type | Default | Notes |
|---|---|---|---|
| `nth_item_number` | int | None | `5` means "every 5th item free". Implementation: `applications = floor(eligible_qty / nth_item_number)`. |
| `apply_across_orders` | bool | `False` | If `True`, count Nth across customer's lifetime (requires per-customer counter — explicitly **DEFERRED to V3-C2+** if owner wants it; V3-C ships as cart-only). |

V3-C reuses BOGO/BXG `buy_*`/`get_*` fields. `nth_item_number` simply replaces `buy_quantity = nth_item_number, get_quantity = 1` semantically.

### 6.5 Free-item fields (V3-D)

| Field | Type | Default | Notes |
|---|---|---|---|
| `free_item_ids` | List[str] \| None | `None` | Specific free items eligible (e.g. one specific dessert). |
| `free_food_ids` | List[str] \| None | `None` | Same by food_id. |
| `free_category_ids` | List[str] \| None | `None` | Free benefit allowed from this category (cashier/customer picks). |
| `free_category_names` | List[str] \| None | `None` | Same by name. |
| `free_item_threshold` | float \| None | `None` | Min order_total required to unlock the free item (overlaps with `min_order_value` — kept separate for clarity). |
| `free_item_max_value` | float \| None | `None` | Cap on free-item line value (e.g. "free dessert up to ₹150"). |

### 6.6 Combo fields (V3-E)

| Field | Type | Default | Notes |
|---|---|---|---|
| `combo_groups` | List[ComboGroup] \| None | `None` | Each group: `{group_id, min_qty, max_qty, eligible_food_ids, eligible_category_ids, eligible_category_names}`. |
| `combo_fixed_price` | float \| None | `None` | Final combo price (total of all groups). Discount = `combo_lines_subtotal - combo_fixed_price`. |
| `combo_repeats` | bool | `True` | If cart has 2× combos worth of items, charge 2× combo price (or fall to 1× if `False`). |

> §6.6 fields are **NOT** to be implemented before V3-E. Listed here only for plan completeness.

### 6.7 Phased schema delta — only ship what each phase needs

| Phase | Mandatory new fields (this phase) | Optional new fields |
|---|---|---|
| V3-A | `valid_days`, `start_time`, `end_time`, `timezone` | — |
| V3-B | `offer_type`, `buy_quantity`, `get_quantity`, `buy_*` set, `get_*` set, `get_discount_type`, `get_discount_value`, `max_applications`, `same_item_only`, `apply_to_cheapest_get_item` | `allow_repeat`, `pos_instruction` |
| V3-C | `nth_item_number` | `apply_across_orders` (deferred) |
| V3-D | `free_item_ids`, `free_food_ids`, `free_category_ids`, `free_category_names`, `free_item_threshold`, `free_item_max_value`, `requires_pos_action` | `pos_instruction` |
| V3-E | `combo_groups`, `combo_fixed_price`, `combo_repeats` | — |

---

## 7. Proposed POS API Contract

### 7.1 `POST /api/pos/coupons/validate` — V3 request additions

| Field | Type | Required? | Phases | Notes |
|---|---|---|---|---|
| `items[]` | List[POSCartItem] | **Required for V2 item/category and ALL V3 offer types** | V2/V3 | Already present in V2. |
| `order_time` | str (ISO 8601) \| omitted | Optional | V3-A | If absent, CRM uses server time in restaurant tz. **Server clock wins** for window decision (anti-abuse). Echoed back in response for transparency. |

**No new top-level fields beyond `order_time`.** All V3 logic activates from the coupon doc's `offer_type` field.

### 7.2 `POST /api/pos/coupons/validate` — V3 response additions

| Field | Type | Phases | Notes |
|---|---|---|---|
| `offer_type` | str | V3-A+ | Echoed for POS UI rendering. |
| `computed_discount` | float | All | (Unchanged) Total ₹ discount. For V3-D free-item, equals the free-item line total. |
| `eligible_subtotal` | float \| null | V2/V3 | (Unchanged) Subtotal the discount was computed against. |
| `benefit_items` | List[BenefitItem] | V3-B/C/D | New: which cart lines / units of them received the benefit. Shape: `{food_id, item_id, name, quantity, unit_value, benefit_amount, source: "buy" \| "get" \| "free"}`. **POS uses for receipt line-spread; CRM keeps total-only allocation (V2 OQ-3 preserved — `benefit_items` is informational, not authoritative).** |
| `missing_requirements` | List[Requirement] | V3-B/C/D/E | When eligibility partially met. E.g. for "Buy 2 pizzas get 1 garlic bread" with 1 pizza in cart → `[{kind: "more_buy_items", need: 1, candidates: [...]}]`. |
| `applied_applications` | int | V3-B/C | How many times the rule fired (e.g. 4 burgers + buy 1 get 1 = 2 applications). |
| `max_applications` | int \| null | V3-B/C | Cap from coupon config. |
| `requires_pos_action` | bool | V3-D | True if cashier must add a free line. |
| `pos_instruction` | str \| null | V3-A+ | Human-readable cashier hint. |
| `time_window_status` | obj | V3-A | `{within_window: bool, server_time_used: ISO, tz: "Asia/Kolkata", next_window_start: ISO \| null}`. |

### 7.3 `GET /api/pos/coupons/available` — V3 response additions

Per coupon entry adds:

```json
{
  "offer_type": "bogo",
  "requires_cart_validation": true,
  "eligible_match_hint": { "type": "category_names", "values": ["Pizza"] },
  "time_window": {
    "within_window_now": true,
    "valid_days": [0,1,2,3,4],
    "start_time": "15:00",
    "end_time": "18:00",
    "next_window_start": null
  },
  "pos_instruction": "Buy 1 Pizza, Get 1 Pizza Free (cheapest free)",
  "max_applications": 2
}
```

**`GET /available` recommendation:** keep **query-only** (matches V2 OQ-1). Cart-aware decisions stay in `/validate`. For V3-A, this means the available endpoint returns happy-hour coupons with `within_window_now=false` so POS UI can grey them out before 3 PM but show the upcoming window. Cart-aware POST `/available` remains **REJECTED** (would duplicate `/validate`).

### 7.4 `POST /api/pos/orders` — V3 expectations

- **No new top-level fields required from POS.** POS already sends `items[]` per V2. POS already sends `coupon_code` + `coupon_discount`. CRM derives `offer_type` from the coupon doc.
- `data.coupon_usage` adds optional V3 audit fields (see §10).
- Final non-blocking failure semantics (Addendum A.3 / V2 §B.8) — **unchanged for V3**. If V3 revalidation fails (e.g. POS rang up 3 burgers but coupon was BOGO with min 2 + odd qty rule), order persists, usage not recorded, structured warning logged with the V3 error code.

### 7.5 New error codes (V3)

| Code | Phase | Meaning |
|---|---|---|
| `OUTSIDE_TIME_WINDOW` | V3-A | Coupon valid but cart submitted outside the window. |
| `BUY_QTY_NOT_MET` | V3-B | Cart has < `buy_quantity` eligible buy items. |
| `GET_ITEM_NOT_IN_CART` | V3-B/C | Cart lacks the get-item required (when `get_item_ids` mandatory and not in cart). |
| `NTH_ITEM_NOT_REACHED` | V3-C | Cart has fewer than `nth_item_number` eligible items. |
| `FREE_ITEM_MISSING` | V3-D | Cart does not include the required free item line (only enforced when policy = require-present; see OQ-V3-4). |
| `COMBO_INCOMPLETE` | V3-E | One or more combo groups under-filled. |

All preserve V1/V2 envelope: `{ ok: false, error: { code, field, detail } }`.

---

## 8. Offer-Type Rule Plans

> Each subsection lists in-scope-for-first-version, out-of-scope, required fields, computation rule, POS responsibility, final-order behavior, and QA examples.

### 8.1 BOGO (V3-B)

#### In scope (first version)
- Same-item BOGO ("Buy 1 coffee, get 1 coffee free") via `same_item_only=true`.
- Same-category BOGO ("Buy any burger, get any burger free").
- `get_discount_type ∈ {"free", "percentage"}` (`"flat"` deferred).
- `apply_to_cheapest_get_item=true` as default (cheapest free is industry standard).
- `max_applications` cap.
- Single-coupon-per-order.

#### Out of scope (V3-B)
- Variants / add-ons participating in eligibility (deferred — match on parent `food_id` only).
- Multi-item benefit (`get_quantity > 1` is allowed in plan but **default behavior is `get_quantity=1`**).
- Persisting "this customer used BOGO 3 times today" beyond `usage_limit` — already handled by V1/V2 limits.

#### Required fields
`offer_type="bogo"`, `buy_quantity`, `get_quantity`, `buy_food_ids` (or category equivalents), `get_*` mirroring, `get_discount_type`, `get_discount_value`, `same_item_only`, `apply_to_cheapest_get_item`.

#### Computation rule
```
1. Filter cart into buy_eligible_lines (units = sum of qty)
2. Filter cart into get_eligible_lines (if get_* missing AND same_item_only → get = buy)
3. applications = floor(buy_units / buy_quantity)
4. cap by max_applications and by floor(get_units / get_quantity)
5. Select the `applications * get_quantity` cheapest get-units (or highest if apply_to_highest set)
6. benefit_amount per unit:
     "free"        → unit_price
     "percentage"  → unit_price * get_discount_value / 100
     "flat"        → min(get_discount_value, unit_price)   # deferred to V3-B+
7. computed_discount = Σ benefit_amount over selected units
8. eligible_subtotal = Σ unit_price over selected units
```

Odd quantities (e.g. 3 coffees, BOGO 1+1): `applications = floor(3/1) → 3 buy units used to derive applications`. With `buy_quantity=1, get_quantity=1` → up to 1 free per pair = 1 application from the 3rd buy unit being unpaired. CRM rule: `applications = floor(min(buy_units / buy_quantity, get_units / get_quantity))`. So 3 coffees → 1 free (cheapest of those 3). Captured in QA QA-V3B-09.

#### POS responsibility
- **MUST** include all items (paid AND benefit) in `items[]` on `validate` and final `/orders`.
- **MUST** ring up the get-line at full price OR at zero (cashier UX choice). CRM trusts POS-sent `coupon_discount` as source of truth (Q5=C). CRM-computed BOGO discount is the guardrail.
- POS may display "Cheapest get-item: {item_name} (₹{value}) — free" using `benefit_items[]` in CRM response.

#### Final-order validation
- Revalidate at `/api/pos/orders` time using order's `items[]`.
- If `applied_applications` falls below what POS implied (variance > ₹1 / 1%), log `coupon_amount_variance` (same V1 pattern). Coupon still recorded — POS amount is source of truth.

#### QA examples
- QA-V3B-01: Cart 2× coffee, BOGO same-item → applications=1, discount=cheaper-coffee value.
- QA-V3B-02: Cart 4× burger, same-cat BOGO, max_applications=2 → applications=2, discount=2× cheapest unit.
- QA-V3B-09 (odd qty): Cart 3× coffee → applications=1.
- QA-V3B-10: Cart 1× coffee → `BUY_QTY_NOT_MET`.
- QA-V3B-11: Cart 2× coffee, BOGO different get-cat (Beverages → Snacks), 0 snacks in cart → `GET_ITEM_NOT_IN_CART`.

### 8.2 Buy X Get Y (V3-B)

Same engine as BOGO but `buy_* ≠ get_*`.

#### In scope
- Different buy/get groups.
- `get_discount_type="free"` or `"percentage"`.
- Required: POS sends the get-item in `items[]` (cashier added it). CRM does **not** auto-add.

#### Out of scope
- CRM-side auto-add of free get-item to POS cart (POS UI dependency; out of CRM scope).
- "CRM suggests get-item options" feature — deferred to V3-B post-launch (could be a `suggested_get_items: [...]` field in available/validate response).

#### Computation
Identical to §8.1 with `get_eligible_lines` filtered against `get_*` instead of mirroring `buy_*`.

#### POS responsibility
**Critical:** POS UI must allow cashier to add a zero-priced get-line OR add at full price then mark discount. The CRM contract supports both because POS-sent `coupon_discount` is the source of truth.

#### QA examples
- QA-V3B-20: Cart 2× pizza + 1× garlic bread. BXG = "Buy 2 pizzas, get 1 garlic bread free". → applications=1, discount=garlic_bread_unit_price.
- QA-V3B-21: Cart 2× pizza, 0 garlic bread → `GET_ITEM_NOT_IN_CART`.

### 8.3 Every Nth Item Free (V3-C)

#### In scope
- Cart-only Nth (no cross-order counter).
- `nth_item_number ∈ {2,3,4,5,…}`.
- Repeated applications via `max_applications` (default unlimited within cart, e.g. 10 coffees + every 5th free → 2 free).
- Cheapest among eligible group is the free one.

#### Out of scope (V3-C v1)
- Lifetime counter ("customer's 5th coffee ever"). Captured in OQ-V3-7; if approved, becomes **V3-C2**.
- "Every Nth at 50% off" requires `get_discount_type="percentage"` — included.

#### Computation
```
buy_eligible_units = total qty across eligible buy lines
applications = floor(buy_eligible_units / nth_item_number)
apply max_applications cap
benefit = `applications` cheapest eligible units → apply get_discount_type
```

#### POS responsibility
Same as V3-B BOGO same-item. POS rings all items; CRM marks N of them as free/discounted.

#### Final-order validation
Same V3-B pattern.

#### QA examples
- QA-V3C-01: 10× coffee, every 5th free → applications=2, discount=2× cheapest coffee.
- QA-V3C-02: 7× coffee, every 5th free → applications=1.
- QA-V3C-03: 12× coffee, every 5th free, max_applications=1 → applications=1.
- QA-V3C-04: 4× coffee, every 5th free → `NTH_ITEM_NOT_REACHED`.

### 8.4 Happy-Hour / Time-Window (V3-A — generic)

#### In scope (V3-A v1)
- `valid_days[]` (ISO weekdays).
- `start_time` / `end_time` (HH:MM, 24h, restaurant local).
- Overnight wrap (e.g. `21:00 → 02:00`).
- IANA `timezone` per coupon (with fallback to restaurant `settings.timezone` → UTC).
- Server clock used for window decision (anti-abuse).
- Applies to V1/V2/V3 — **any coupon type** can carry a time window. A V1 `ORDER_PERCENTAGE` becomes a happy-hour coupon by adding `valid_days` + `start_time` + `end_time`.

#### Out of scope (V3-A v1)
- Per-day distinct windows ("Mon 3–6, Sat 12–4"). For V3-A v1, the window is the same on every valid day. Per-day overrides park to V3-A2 if owner wants it.
- Holiday/event calendar override.

#### Required fields
`valid_days`, `start_time`, `end_time`, `timezone` (all optional, defaulting to the V1 `start_date`/`end_date` ISO span).

#### Computation
```
1. Resolve effective_tz = coupon.timezone OR restaurant.settings.timezone OR "UTC"
2. now_local = now_utc.astimezone(effective_tz)
3. If valid_days set AND now_local.weekday() not in valid_days → OUTSIDE_TIME_WINDOW
4. If start_time/end_time set:
     If start <= end:  within = start_time <= now_local.time() < end_time
     Else (overnight): within = now_local.time() >= start_time OR now_local.time() < end_time
   If not within → OUTSIDE_TIME_WINDOW
5. Compute next_window_start for response transparency.
```

`/available` returns the coupon even if `within_window_now=false` so POS UI can grey it out with `next_window_start`. `/validate` rejects with `OUTSIDE_TIME_WINDOW` if outside.

#### POS responsibility
- Display the time window (optional UI).
- Do not send `order_time` from cashier device clock as authoritative (CRM ignores it). Accepted as informational only.

#### Final-order behavior
Window check runs in `record_coupon_usage_for_order` too. If POS rings the bill 5 minutes past the window end, the order persists but `coupon_usage` is NOT recorded; warning logged with `OUTSIDE_TIME_WINDOW`. (Same non-blocking pattern.)

#### QA examples
- QA-V3A-01: Happy-hour ORDER_PERCENTAGE coupon. now_local within window → V1 % computed normally.
- QA-V3A-02: Same coupon validated outside window → `OUTSIDE_TIME_WINDOW`.
- QA-V3A-03: Overnight wrap 22:00–02:00, now=01:00 → within.
- QA-V3A-04: `valid_days=[0,1,2,3,4]` (Mon–Fri), now=Saturday → `OUTSIDE_TIME_WINDOW`.
- QA-V3A-05: `/available` outside window → returned with `within_window_now=false`, `next_window_start` populated.
- QA-V3A-06: DST edge in `Asia/Kolkata` (no DST) — sanity that fallback `effective_tz` works.

### 8.5 Free Item Coupons (V3-D)

#### In scope (V3-D v1)
- Threshold-gated free item ("Free dessert on orders above ₹999").
- Multiple eligible free choices (cashier/customer picks one).
- `free_item_max_value` cap on the free-line value.
- POS **must include the chosen free item in `items[]`** (cart-aware presence check). This is the simplest contract that prevents cashier mistakes.

#### Out of scope (V3-D v1)
- CRM auto-adding free item to POS cart.
- Multiple free items per coupon ("free dessert + free drink"). Deferred to V3-D2.
- Birthday-gated free item — covered by **V3-D extension** that joins on `customer.birthday` from existing customer doc. Recommended: **ship V3-D first with `free_item_threshold` only; birthday gating as V3-D2 add-on**.

#### Required fields
`offer_type="free_item"`, `free_item_ids` OR `free_category_ids/names`, `free_item_threshold` (re-uses `min_order_value`), `free_item_max_value`.

#### Computation
```
1. If order_total < free_item_threshold → MIN_ORDER_NOT_MET
2. Identify free-eligible lines in items[]:
     line matches free_item_ids / free_food_ids / free_category_ids / free_category_names
3. If zero free-eligible lines → FREE_ITEM_MISSING (and set requires_pos_action=true)
4. Pick one free-eligible line (cheapest unit OR first match if owner prefers — recommend cheapest).
5. benefit_amount = min(unit_price, free_item_max_value or +∞)
6. computed_discount = benefit_amount
7. benefit_items = [{food_id, item_id, name, quantity:1, unit_value: unit_price, benefit_amount, source:"free"}]
```

#### POS responsibility
- Include chosen free item in `items[]`.
- Display CRM-returned `pos_instruction` to cashier (e.g. "Add a free dessert (up to ₹150) to the cart").
- POS-sent `coupon_discount` should equal CRM `benefit_amount` (within variance tolerance).

#### Final-order behavior
If POS submits final order **without** the free item line (cashier forgot), CRM:
1. Order persists.
2. `coupon_usage` NOT recorded.
3. Warning `FREE_ITEM_MISSING` logged.
4. Response surfaces `data.coupon_usage = {recorded: false, error: {code: "FREE_ITEM_MISSING", …}}`.

Alternative policy (OQ-V3-4): record usage anyway with `requires_pos_action=true` flag. **Recommended default: do NOT record** — keeps coupon usage tied to actual benefit delivered.

#### QA examples
- QA-V3D-01: order_total=1200, free_item_ids=[dessert_X], cart has dessert_X → discount = unit_price(dessert_X) capped at free_item_max_value.
- QA-V3D-02: order_total=800, threshold=999 → `MIN_ORDER_NOT_MET`.
- QA-V3D-03: order_total=1200, but cart has no dessert → `FREE_ITEM_MISSING`.
- QA-V3D-04: order_total=1200, cart has 2× dessert_X → only 1 free, other is paid.

### 8.6 Combo Offers (V3-E)

#### Recommendation: **DEFER V3-E.** Park until V3-A..D usage informs combo design.

If owner mandates V3-E in this roadmap, scope as:

#### In scope (V3-E v1)
- Fixed-price combo (`combo_fixed_price`).
- Required item groups (1+ groups, each with `min_qty=1, max_qty=1, eligible_food_ids/category_ids`).
- One combo application per order (`combo_repeats=false`).

#### Out of scope (V3-E v1)
- Combo repeats (cart with 2× combo worth).
- Substitution slots / "pick 2 from these 5".
- Combo with free item layered on top.

#### Required fields
`offer_type="combo"`, `combo_groups: [{group_id, min_qty=1, eligible_food_ids OR eligible_category_ids}]`, `combo_fixed_price`.

#### Computation
```
1. For each group: at least one matching line in cart with qty >= min_qty. If any group misses → COMBO_INCOMPLETE
2. combo_lines = pick exactly min_qty matching units per group (cheapest by default)
3. combo_lines_subtotal = Σ unit_price over combo_lines
4. computed_discount = max(0, combo_lines_subtotal - combo_fixed_price)
5. benefit_items = combo_lines (annotated with source="combo")
```

#### POS responsibility
Items must be in `items[]`. POS-sent `coupon_discount` is source of truth.

#### Final-order behavior
Non-blocking failure pattern preserved.

#### QA examples
- QA-V3E-01: 3-group combo (burger/fries/drink) at ₹199, cart has one of each (sum ₹250) → discount=₹51.
- QA-V3E-02: Cart missing fries → `COMBO_INCOMPLETE`.

---

## 9. Recommended Phased V3 Roadmap

| Phase | Scope | Why this position | Hard Dependency | Soft Dependency |
|---|---|---|---|---|
| **V3-A** | Time-window / Happy-hour as a generic rule layered on V1/V2/V3 | Unblocks immediate restaurant demand (lunch / evening promos) with the lowest engine risk. CRM-only — no POS cart changes needed. Restaurant timezone story gets resolved here once for all V3+ work. | Restaurant `settings.timezone` exists (verify; fallback to UTC if missing) | POS UI shows window (optional) |
| **V3-B** | BOGO + Buy-X-Get-Y core engine | Highest business value among complex offers; reuses V2 cart matching. Establishes buy/get-set abstraction that V3-C reuses verbatim. | V2 (done) | POS UI displays `benefit_items` and `pos_instruction` |
| **V3-C** | Every-Nth item discounted | Pure superset of V3-B — same fields, just `nth_item_number` + loop. No new POS contract surface. Could ship in same release as V3-B if owner approves combined scope. | V3-B | None |
| **V3-D** | Free-item coupons (threshold + free benefit) | Requires POS UI capable of adding a benefit line at zero or full price (POS dependency from V3-B already in place). Simpler computation than V3-B but harder cashier UX. | V3-B (POS cart UX) | Birthday gating as V3-D2 |
| **V3-E** | Combo fixed-price offers | Most invasive schema (`combo_groups`). Recommended **park** until V3-A..D data informs design. Implementable but should not be promised in V3 sprint without owner go-ahead. | V3-B (POS cart UX) | None |

**Recommended ship cadence:**
- Sprint 1: V3-A.
- Sprint 2: V3-B (+ optionally V3-C if scope allows).
- Sprint 3: V3-C standalone OR V3-D.
- Sprint 4+: remaining V3-D / V3-E based on owner priorities.

**Owner-approved compression option:** Sprint 1 = V3-A + V3-B (BOGO same-item only) — yields biggest customer-visible win in a single release.

---

## 10. Final Order Recording Plan

`coupon_usage` row gains the following V3-additive fields. All optional, all nullable for V1/V2 backward compat.

| Field | Type | Phase | Notes |
|---|---|---|---|
| `offer_type` | str | V3-A+ | Echoes the coupon's offer_type at usage time. |
| `applied_applications` | int \| null | V3-B/C | How many times the rule fired. |
| `max_applications` | int \| null | V3-B/C | Cap at usage time (for analytics). |
| `benefit_items` | List[BenefitItem] | V3-B/C/D | Items selected as benefit. |
| `time_window_status` | obj \| null | V3-A | Snapshot of `{within_window, server_time_used, tz}` at usage time. |
| `requires_pos_action_at_record` | bool | V3-D | True if POS was supposed to add a benefit line. |

**Idempotency:** `(user_id, order_id)` — unchanged.
**One coupon per order:** unchanged (V2 OQ-2 inherited).
**Non-blocking failure:** unchanged — Addendum A.3 / V2 §B.8 pattern. V3 failures (`OUTSIDE_TIME_WINDOW`, `BUY_QTY_NOT_MET`, `GET_ITEM_NOT_IN_CART`, `NTH_ITEM_NOT_REACHED`, `FREE_ITEM_MISSING`, `COMBO_INCOMPLETE`) all behave identically: order persists, `coupon_usage` NOT recorded, structured warning logged, `data.coupon_usage.error.code` populated.

**Idempotency on partial re-validation:** if the first `/orders` call recorded usage at `applied_applications=2` and a retry recomputes `applied_applications=1`, the **first recorded row wins** (Mongo `$setOnInsert` semantics). This preserves audit fidelity and POS-amount-wins philosophy.

---

## 11. Analytics Plan

`get_coupon_stats` adds an additive `breakdown_by_offer_type` block (mirrors V2's `breakdown_by_scope` pattern):

```json
{
  "total_coupons": 28,
  "coupons_used": 142,
  "discount_availed": 18750.0,
  "breakdown_by_scope":      { "order": {...}, "item": {...}, "category": {...}, "unknown": {...} },
  "breakdown_by_offer_type": {
    "simple":     { "used": 100, "discount": 12000.0 },
    "bogo":       { "used":  18, "discount":  3200.0 },
    "bxg":        { "used":   6, "discount":  1100.0 },
    "nth_item":   { "used":   4, "discount":   650.0 },
    "free_item":  { "used":  10, "discount":  1500.0 },
    "combo":      { "used":   4, "discount":   300.0 },
    "unknown":    { "used":   0, "discount":     0.0 }
  }
}
```

**V3-A specific analytics:** `time_window_usage = { coupons_with_window: int, used_within_window: int, used_outside_window: int (non-recorded warnings) }` — additive, V3-A only.

**Deferred (post-V3 separate CR):**
- `discount_by_food_id` — per-item BOGO/Nth attribution.
- `discount_by_category_id` — already partially via V2 breakdown.
- Cohort analytics (BOGO uplift on per-customer spend).
- Hour-of-day analytics for happy-hour ROI.

---

## 12. POS Dependency Matrix

| Feature | CRM Can Validate Alone | POS UI Needed | POS Cart Mutation Needed | Safe for Immediate V3 |
|---|---|---|---|---|
| Time-window / Happy-hour (V3-A) | YES | OPTIONAL (greyed-out + countdown) | NO | **YES — safest first phase** |
| BOGO same-item (V3-B) | YES | YES (display benefit_items) | NO (cashier rings extra unit naturally) | YES |
| BOGO same-category (V3-B) | YES | YES | NO | YES |
| Buy-X-Get-Y (V3-B) | YES | YES (cashier must add get-line) | NO (manual cashier action) | YES, with cashier training |
| Every-Nth item (V3-C) | YES | YES (display N applications) | NO | YES |
| Free-item (V3-D) | YES (if POS includes free item in cart) | YES (cashier adds free line) | OPTIONAL auto-add | YES, with caveat |
| Combo fixed-price (V3-E) | YES | YES (combo slot picker) | YES (combo bundle rendering) | NO — defer |

**Bold rule:** CRM never mutates the POS cart. POS is the source of truth for the final money rendered. CRM is the source of truth for *eligibility, computation, recording, and analytics*. This rule holds for all V3 phases.

---

## 13. Compatibility Plan

| Surface | Guarantee |
|---|---|
| V1 `ORDER_FLAT` / `ORDER_PERCENTAGE` | Identical. V1 45/45 must remain green. |
| V2 `ITEM_*` / `CATEGORY_*` | Identical. V2 45/45 must remain green. |
| `POST /validate` body without `order_time` | Works — server time used. |
| `GET /available` shape | All V3 fields are additive. POS may ignore. |
| 9 admin CRUD endpoints | UNTOUCHED. Pydantic gains optional V3 fields. |
| `coupon_usage` legacy rows | Treated as `offer_type="simple"`, time window N/A. |
| `coupon_transactions` legacy collection | UNTOUCHED. Analytics union preserved. |
| `core/loyalty.py`, wallet code, migration code | UNTOUCHED. |
| `/app/memory/final/` | UNTOUCHED. |
| Variance tolerance | Unchanged for V3. |
| One coupon per order | Unchanged. |
| Idempotency key | Unchanged. |

**Regression posture:** V3 implementation must rerun and pass the entire V1+V2 harness (90/90) before V3-specific tests are authoritative.

---

## 14. QA Strategy

### Per-phase QA assertion targets (estimates)

| Phase | New assertions | Cumulative regression |
|---|---|---|
| V3-A | ~25 | V1 45 + V2 45 + V3-A 25 = 115 |
| V3-B | ~40 | V1 45 + V2 45 + V3-A 25 + V3-B 40 = 155 |
| V3-C | ~20 | 175 |
| V3-D | ~25 | 200 |
| V3-E | ~25 | 225 |

### Staged QA harnesses (one harness per phase)

- `backend/tests/qa_cr001c_c_coupon_v3_a_time_window.py`
- `backend/tests/qa_cr001c_c_coupon_v3_b_bogo_bxg.py`
- `backend/tests/qa_cr001c_c_coupon_v3_c_nth_item.py`
- `backend/tests/qa_cr001c_c_coupon_v3_d_free_item.py`
- `backend/tests/qa_cr001c_c_coupon_v3_e_combo.py`

### Cross-cutting test categories

| Category | Coverage |
|---|---|
| **V1 regression** | All 45 V1 assertions rerun via existing harness; must remain green. |
| **V2 regression** | All 45 V2 assertions rerun; must remain green. |
| **V3 happy paths** | One per offer_type variant. |
| **V3 error paths** | Each new error code (`OUTSIDE_TIME_WINDOW`, `BUY_QTY_NOT_MET`, `GET_ITEM_NOT_IN_CART`, `NTH_ITEM_NOT_REACHED`, `FREE_ITEM_MISSING`, `COMBO_INCOMPLETE`). |
| **Timezone tests** | UTC, Asia/Kolkata, overnight wrap, weekday boundary. |
| **Odd-quantity BOGO** | 1, 3, 5 buy-units with buy_quantity=1, get_quantity=1. |
| **Duplicate / idempotency** | Repeat `/orders` with same `order_id` → idempotent. |
| **POS missing free item** | Final order without free line → recorded=false + warning. |
| **POS cart variance** | POS-sent `coupon_discount` differs from CRM-computed by > variance → warning, POS amount honored. |
| **Stacking with loyalty** | V3 + `loyalty_points_used > 0`. Behaves per `stackable_with_loyalty` flag (V1 Q2=C inherited). |
| **Server time vs POS time** | POS-supplied `order_time` ignored for window decision; echoed in response. |
| **`/available` greyed-out window** | Happy-hour outside window → returned with `within_window_now=false`. |
| **Analytics breakdown** | `breakdown_by_offer_type` populated correctly for mixed usage. |
| **Final-order non-blocking failure** | All 6 new V3 error codes trigger non-blocking behavior; order persists. |
| **Loyalty / Wallet untouched** | Existing 52/52 Loyalty + Wallet smoke must remain green. |

### Test data
Add V3 fixtures in `backend/tests/seed_coupon_v1_fixtures.py` (or a new `seed_coupon_v3_fixtures.py`) keyed `QA_C3_*` so V1/V2 cleanup regex (`QA_C1_*` + `QA_C2_*`) remains intact.

---

## 15. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | Wrong free-item discount (BOGO picks expensive instead of cheap) | Medium | Money loss / customer dispute | `apply_to_cheapest_get_item=true` default. QA-V3B-02. |
| R-2 | Duplicate BOGO applications (`max_applications` not honored) | Medium | Money loss | Idempotency + explicit cap test (QA-V3C-03). |
| R-3 | Odd-quantity BOGO miscounts | High (cashier confusion) | Customer dispute | Explicit floor() rule (QA-V3B-09). |
| R-4 | POS cart mutation mismatch (POS rings 2 but CRM expects 3) | High | Coupon variance warnings, audit confusion | Variance tolerance (₹1/1%) + POS-amount-wins; document loudly. |
| R-5 | Missing free item in final order | High | Customer feels cheated of free item | Non-blocking failure pattern + structured warning + POS UI prompt. Cashier-training dependency. |
| R-6 | Tax treatment of free items / BOGO discount | Medium | Compliance issue | CRM stays out of tax math — POS-sent amount is source of truth. Document in handoff. |
| R-7 | Rounding (per-line vs total) | Medium | ₹0.01 disputes | Round to 2 decimals at every step (matches V1/V2). |
| R-8 | Timezone errors (DST in tz like America/New_York) | Low for India (Asia/Kolkata no DST), High for international | Coupon fires off-hours | IANA tz strictly; rely on Python `zoneinfo` (3.9+); fall back to UTC with explicit warning. |
| R-9 | Overnight happy-hour windows | Medium | Incorrect within/outside decision around midnight | Explicit wrap logic; QA-V3A-03 covers 22:00–02:00. |
| R-10 | Analytics double-count (BOGO 1 free counted as 2 transactions) | Medium | Inflated KPIs | `applied_applications` is the canonical counter; `coupons_used` increments once per order. |
| R-11 | POS source-of-truth amount mismatch | High | Operational | Keep POS-sent `coupon_discount` as committed amount (Q5=C). Log variance >> tolerance. |
| R-12 | Complex stacking (V3 + loyalty + future wallet) | Medium | Edge-case bugs | `stackable_with_loyalty` already gates V3; wallet remains out of scope (CR-001C-W). |
| R-13 | Customer entitlement + BOGO interaction (`specific_users` + per-user limit) | Low | Eligibility bypass | V1 pre-checks still run before V3 compute; no shortcut. |
| R-14 | `coupon_usage` row growth (audit fields) | Low | Storage | Optional fields; legacy rows unaffected. |
| R-15 | Backward-incompatible Pydantic changes | Low | Admin frontend breakage | All V3 fields Optional with defaults; CouponsPage.jsx untouched. |
| R-16 | Hidden race condition on `max_applications` cap when same coupon used twice in concurrent orders | Low | Money loss | V1 already serializes via `usage_limit` + idempotent `(user_id, order_id)`. Test concurrent path in V3-B QA. |

---

## 16. Owner Questions (Multiple-Choice — for blocking decisions)

All questions are multiple-choice. Recommended default in **bold**. Genuine blocking questions are marked 🟥; others have safe defaults the implementation can run with.

### OQ-V3-1 🟥 — Which V3 phase ships first?
- a. V3-A (time-window only) — safest, fastest, highest immediate restaurant demand
- b. V3-B (BOGO/BXG) — highest "complex offer" customer-visible win
- c. **V3-A + V3-B BOGO same-item only — combined first sprint** ← recommended (covers happy-hour + flagship BOGO in one release)
- d. V3-D (free-item) — depends on POS UI readiness
- e. Park V3 entirely; finalize POS integration of V1/V2 first

### OQ-V3-2 — Should BOGO V3-B v1 be same-item only?
- a. **Yes — `same_item_only=true` only, multi-item BOGO in V3-B2** ← recommended
- b. No — include same-category in v1
- c. Both same-item and same-category in v1 (recommended if owner has restaurants demanding category BOGO)

### OQ-V3-3 🟥 — Should Buy-X-Get-Y require the get-item to already be in cart at validate time?
- a. **Yes — POS cashier adds the get-line manually; CRM only validates / computes** ← recommended (simpler contract, no cart automation)
- b. No — CRM returns `requires_pos_action=true` and POS auto-adds the line (complex; POS dependency)
- c. CRM returns *suggested* get-items list; POS chooses

### OQ-V3-4 🟥 — Should free-item coupons auto-add the free line or only return instruction?
- a. **Return instruction only — POS UI prompts cashier; cashier adds the line** ← recommended
- b. CRM auto-adds via a POS callback API (out of CRM scope; needs POS pull)
- c. Mark coupon as `requires_pos_action=true` and record usage anyway even if free item missing in final order
- d. Mark coupon as `requires_pos_action=true` but do **not** record usage if free item missing ← recommended sub-policy under (a)

### OQ-V3-5 🟥 — Should happy-hour use restaurant local timezone or POS-supplied timestamp?
- a. **Restaurant local timezone from `users.settings.timezone`; server clock decides** ← recommended (anti-abuse)
- b. POS-supplied `order_time`; trust POS
- c. UTC always (simplest, but breaks cross-region restaurants)

### OQ-V3-6 — Should V3 still return total discount only or include benefit lines?
- a. **Total only as authoritative; `benefit_items[]` as informational** ← recommended (preserves V2 OQ-3)
- b. Per-line allocation (significant POS-side reconciliation work; tax recompute risk)

### OQ-V3-7 — Should one coupon per order remain locked in V3?
- a. **Yes — preserve V2 OQ-2** ← recommended
- b. No — allow multi-coupon (V3+ engine rewrite needed)

### OQ-V3-8 — Should V3 final-order coupon failures remain non-blocking (order persists)?
- a. **Yes — preserve V1 Addendum A.3 / V2 §B.8** ← recommended
- b. No — block the order until cashier corrects (operational risk; customer waiting)

### OQ-V3-9 🟥 — Should combo offers be V3-E or parked to V4?
- a. **Park to V4** ← recommended (most invasive schema; V3-A..D usage data should inform combo design)
- b. Ship V3-E with simple fixed-price combo (single application, no repeats, no substitutions)
- c. Skip combos entirely; combos are POS-side menu config

### OQ-V3-10 — Should advanced offers be visible in admin UI now or backend/API only?
- a. **Backend/API only in V3-A and V3-B v1; admin UI follow-up CR** ← recommended (CouponsPage.jsx remains untouched in CRM v1; admin uses API/CRUD directly or via a follow-up CR-001C-C-UI)
- b. Ship admin UI alongside each V3 phase
- c. Build a generic "offer JSON config" admin form (lowest UI cost, technical-only operators)

### OQ-V3-11 (V3-C extension) — Every-Nth lifetime counter ("customer's 5th coffee ever")?
- a. **Cart-only in V3-C v1; lifetime counter as V3-C2 if owner needs it** ← recommended
- b. Lifetime counter from day 1 (requires per-customer-per-item counter — new analytics writes)

### OQ-V3-12 (V3-D extension) — Birthday-gated free items in V3-D v1?
- a. **No — V3-D v1 is threshold-gated only; birthday gating as V3-D2** ← recommended
- b. Yes — read `customer.birthday` and apply ±N day window

---

## 17. Final Recommendation

**Recommended first V3 phase: V3-A (time-window / happy-hour) as a generic cross-cutting rule.**

Reasons:
1. **Lowest engine risk** — pure pre-check; reuses V1/V2 compute paths unchanged.
2. **Highest immediate business value** — restaurants want lunch promos / weekday discounts NOW.
3. **No POS cart automation dependency** — POS can ship V3-A without any UI changes (CRM rejects out-of-window coupons; POS sees the error code).
4. **Establishes the timezone story** — once for all subsequent V3 phases.
5. **Backportable to V1/V2** — a V1 ORDER_PERCENTAGE becomes a happy-hour coupon by just adding `valid_days` + `start_time` + `end_time`.
6. **Sprint-sized** — estimate ~25 QA assertions, ~250 LOC service delta, ~50 LOC schema delta, ~30 LOC router/POS delta.

**Owner-approved compression option:** Sprint 1 = V3-A + V3-B BOGO same-item only — yields biggest customer-visible win in a single release.

**Hold sprint 2+:** wait for V3-A telemetry (which restaurants enabled windows, BOGO usage shape) before scoping V3-C / V3-D.

**Combo (V3-E):** park to V4 unless owner explicitly insists.

**Ready for owner decision** on:
- OQ-V3-1 (which phase first)
- OQ-V3-3 (Buy-X-Get-Y get-item requirement)
- OQ-V3-4 (free-item POS contract)
- OQ-V3-5 (happy-hour timezone source)
- OQ-V3-9 (combo phasing)

All other OQs have safe recommended defaults and are non-blocking for implementation kickoff.

---

## 18. Final Status

`cr001c_coupon_v3a_time_window_plan_ready_for_implementation_approval`

V3-A (Time-window / Happy-hour) is the approved first V3 phase. Owner decisions captured in **Addendum C** below.

V3-B / V3-C / V3-D phases remain in plan but require separate owner approval before implementation kickoff (their blocking OQs are pre-answered in Addendum C but each phase will still get a phase-specific implementation plan and approval cycle).

V3-E (Combo offers) is **PARKED TO V4** per OQ-V3-9.

---

# Addendum C — Owner Decisions Applied (Feb 2026)

This addendum freezes the owner decisions on the blocking OQs (1, 3, 4, 5, 9) and accepts the recommended defaults for all non-blocking OQs (2, 6, 7, 8, 10, 11, 12). Sections §1–§17 above remain the structural plan; Addendum C is the operative truth for V3-A implementation kickoff and for V3-B / V3-C / V3-D scope locks.

## C.0 Owner decisions — frozen

| OQ | Question | Frozen decision |
|---|---|---|
| **OQ-V3-1** 🟥 | Which V3 phase ships first? | **APPROVED: V3-A (Time-window / Happy-hour) ships first.** Single-phase sprint. V3-B and later phases follow only on subsequent owner approval. The "V3-A + V3-B combined sprint 1" compression option was **not** selected. |
| **OQ-V3-2** | BOGO V3-B v1 same-item only? | **APPROVED default — yes, `same_item_only=true` only in V3-B v1.** Same-category BOGO becomes V3-B2 if owner needs it later. (Scope-locked for V3-B; does not affect V3-A.) |
| **OQ-V3-3** 🟥 | Buy-X-Get-Y get-item must already be in cart at validate / final order? | **APPROVED: yes.** POS cashier must include the get-item line in `items[]` on both `/validate` and `/orders` payloads. CRM only validates / computes. **No CRM-side auto-add. No POS-side auto-add.** If the get-item is missing in the cart, CRM returns `GET_ITEM_NOT_IN_CART`. (Scope-locked for V3-B; does not affect V3-A.) |
| **OQ-V3-4** 🟥 | Free-item: auto-add or instruction-only? | **APPROVED: instruction-only.** CRM returns `requires_pos_action=true` + `pos_instruction` text. POS UI prompts cashier to add the free line. **No POS auto-add.** Sub-policy: do **not** record coupon usage if the free item is missing in the final order payload (recommended sub-default under (a)). Mirrors V2 §B.8 non-blocking failure. (Scope-locked for V3-D; does not affect V3-A.) |
| **OQ-V3-5** 🟥 | Happy-hour timezone source? | **APPROVED: restaurant local timezone.** Resolution order: 1. `coupon.timezone` (IANA) if set on the coupon; 2. else `users.settings.timezone` for the restaurant (`user_id`); 3. fallback to `"Asia/Kolkata"` (current default; flagged for owner to widen if international restaurants onboard); 4. final fallback to UTC with explicit `time_window_status.tz_fallback="utc"` warning logged. **Server clock decides** the within-window check — POS-supplied `order_time` is informational only (echoed back, never authoritative). |
| **OQ-V3-6** | Total discount only or per-line allocation? | **APPROVED default — total only as authoritative; `benefit_items[]` informational.** Preserves V2 OQ-3. Per-line allocation deferred to a separate CR if POS/tax/accounting needs it. |
| **OQ-V3-7** | One coupon per order in V3? | **APPROVED default — yes, locked.** Idempotency key `(user_id, order_id)` unchanged. Multi-coupon-per-order remains out of scope across all V3 phases. |
| **OQ-V3-8** | Final-order V3 failures non-blocking? | **APPROVED default — yes, preserve V1 Addendum A.3 / V2 §B.8.** Order persists, `coupon_usage` NOT recorded, structured warning logged with the V3 error code. Applies to all V3 phases including V3-A (`OUTSIDE_TIME_WINDOW` at final order is non-blocking). |
| **OQ-V3-9** 🟥 | Combo offers V3-E or V4? | **APPROVED: PARK TO V4.** §8.6 and §6.6 remain in this doc as forward-looking reference only. No V3-E implementation plan will be authored. Combo offers will be revisited after V3-A..D telemetry. |
| **OQ-V3-10** | Admin UI ships with V3 or follow-up CR? | **APPROVED default — backend/API only in V3-A and V3-B v1; admin UI is a follow-up CR.** `CouponsPage.jsx` remains untouched in CRM v1; admin users configure V3 coupons via the existing admin CRUD API (or a future CR-001C-C-UI). |
| **OQ-V3-11** | Every-Nth lifetime counter? | **APPROVED default — cart-only in V3-C v1.** Lifetime counter (`apply_across_orders=true`) deferred to V3-C2 if owner needs it. (Scope-locked for V3-C; does not affect V3-A.) |
| **OQ-V3-12** | Birthday-gated free items in V3-D v1? | **APPROVED default — no, threshold-gated only in V3-D v1.** Birthday gating deferred to V3-D2 add-on. (Scope-locked for V3-D; does not affect V3-A.) |

## C.1 V3-A scope freeze (operative)

The following is the **frozen V3-A v1 scope** that implementation will execute against once approved:

### C.1.1 In-V3-A
1. New `offer_type` field on `coupons` (default `"simple"`). V3-A v1 only uses `"simple"` — the **time-window fields are orthogonal to `offer_type`** and apply to any coupon, V1/V2/V3 alike. (`offer_type="bogo"` etc. are reserved for V3-B+ and not implemented in V3-A.)
2. New time-window fields on `coupons` (all optional; absent = no window, V1/V2 behavior preserved):
   - `valid_days: List[int] | None` — ISO weekday integers `[0..6]` (Mon=0 … Sun=6).
   - `start_time: str | None` — `"HH:MM"` 24h, restaurant local.
   - `end_time: str | None` — `"HH:MM"` 24h, restaurant local. Overnight wrap supported when `end_time <= start_time`.
   - `timezone: str | None` — IANA tz; resolution order per OQ-V3-5.
3. New `_is_within_time_window(coupon, now_utc)` helper in `core/coupon.py` invoked **early** in `validate_coupon_for_customer` (before V1/V2 dispatch).
4. `/validate` request: accepts optional `order_time` (ISO 8601) — **informational only**, echoed in response; server clock decides.
5. `/validate` response on outside-window: `success=false`, `error.code="OUTSIDE_TIME_WINDOW"`, `error.field="time_window"`, `error.detail="Coupon valid only on Mon-Fri 15:00-18:00 Asia/Kolkata; current time 12:34"`.
6. `/validate` response on success carries a `time_window_status` object: `{within_window: true, server_time_used: ISO_with_tz, tz: "Asia/Kolkata", next_window_start: null}` (only when the coupon has a window; null block when the coupon has no window — additive, V1/V2 callers ignore).
7. `/available` response per coupon: adds `time_window` object with `{within_window_now: bool, valid_days: [...], start_time, end_time, next_window_start: ISO|null}`. Coupons **outside** their window are **still returned** so POS UI can grey them out with a countdown to the next window.
8. Final `/api/pos/orders` recording: same time-window check runs in `record_coupon_usage_for_order`. If outside window → order persists, usage NOT recorded, warning `coupon_validation_failed_at_final_order` logged with `OUTSIDE_TIME_WINDOW`. `data.coupon_usage = {recorded: false, coupon_code, error: {code: "OUTSIDE_TIME_WINDOW", field: "time_window", detail: "..."}}`.
9. `coupon_usage` row gains optional `time_window_status` snapshot (`{within_window, server_time_used, tz}`) plus `offer_type` (always `"simple"` in V3-A v1).
10. Analytics `get_coupon_stats` gains `breakdown_by_offer_type` additive block (V3-A v1 will only populate `simple` and `unknown` buckets; non-simple buckets stay at zero until V3-B+).
11. Analytics V3-A-specific: optional `time_window_usage = {coupons_with_window: int, used_within_window: int, used_outside_window: int}`.
12. New QA harness `backend/tests/qa_cr001c_c_coupon_v3_a_time_window.py` — target **~25 V3-A assertions**.
13. V1 (45) + V2 (45) regression must remain green — combined regression baseline after V3-A: **~115 assertions**.

### C.1.2 Out-of-V3-A (explicit)
- `offer_type ∈ {"bogo", "bxg", "nth_item", "free_item", "combo"}` — none implemented in V3-A.
- All V3-B / V3-C / V3-D / V3-E fields (`buy_*`, `get_*`, `nth_item_number`, `max_applications`, `free_item_*`, `combo_*`).
- BOGO / BXG / Nth / Free-item / Combo computation paths.
- POS cart auto-add behavior.
- Per-day distinct time windows (Mon 3–6, Sat 12–4) — V3-A v1 uses the same window across all `valid_days`. Per-day overrides park to **V3-A2** if owner needs it.
- Holiday / event calendar override.
- Lifetime Nth-item counters.
- Per-line discount allocation in responses (V2 OQ-3 preserved).

### C.1.3 V3-A error codes (frozen)
| Code | Path | Meaning |
|---|---|---|
| `OUTSIDE_TIME_WINDOW` | `/validate`, `/orders` revalidation | Coupon valid in principle but cart submitted outside the configured `valid_days` / `start_time`–`end_time` window in the resolved restaurant timezone. |

(All V1 and V2 error codes remain unchanged. New V3-B/C/D/E codes — `BUY_QTY_NOT_MET`, `GET_ITEM_NOT_IN_CART`, `NTH_ITEM_NOT_REACHED`, `FREE_ITEM_MISSING`, `COMBO_INCOMPLETE` — are documented but NOT introduced in V3-A.)

### C.1.4 V3-A QA target (frozen estimate)
~25 V3-A assertions covering:
- 4× window evaluation (within / before-window / after-window / valid-days mismatch)
- 2× overnight-window wrap (within / outside)
- 3× timezone resolution (coupon.timezone wins / users.settings.timezone fallback / Asia/Kolkata final default with `tz_fallback="utc"` only if both absent)
- 2× server-clock vs POS-supplied `order_time` (POS time ignored for decision; echoed)
- 3× `/available` response shape with windows (within / outside / no-window)
- 2× V1 coupon + window — V1 ORDER_PERCENTAGE happy-hour
- 2× V2 coupon + window — V2 ITEM_PERCENTAGE happy-hour
- 3× final-order non-blocking failure (`OUTSIDE_TIME_WINDOW` at `/orders`)
- 1× idempotent replay (`(user_id, order_id)` after the first window check)
- 2× analytics (`breakdown_by_offer_type.simple` increments, `time_window_usage` accumulates)
- 1× admin CRUD round-trip (create coupon with time-window fields, GET/PUT/DELETE preserve them)

Final exact count and case naming will be locked in the V3-A Implementation Plan (next doc).

### C.1.5 V3-A timezone fallback chain (frozen per OQ-V3-5)
```
effective_tz =
    coupon.timezone                            # IANA from coupon doc, if set
 OR users.settings.timezone (restaurant)        # restaurant-level setting
 OR "Asia/Kolkata"                              # current product default
 OR "UTC"                                       # last-resort with tz_fallback="utc" warning
```
The resolved tz string is **echoed in every response** under `time_window_status.tz` so cashiers / observability can audit which fallback fired. Log `coupon_timezone_fallback_to_utc` warning if step 4 fires.

### C.1.6 V3-A POS contract delta (frozen, additive)
| Endpoint | New field | Direction | Required? |
|---|---|---|---|
| `POST /api/pos/coupons/validate` | `order_time` (ISO) | Request → CRM | Optional; informational only; CRM ignores for decision |
| `POST /api/pos/coupons/validate` | `time_window_status` | CRM → Response | Present only when coupon has a window |
| `POST /api/pos/coupons/validate` | `error.code="OUTSIDE_TIME_WINDOW"` | CRM → Response | New error code |
| `GET /api/pos/coupons/available` | `time_window` per coupon | CRM → Response | Present only when coupon has a window |
| `POST /api/pos/orders` | (none — no new top-level fields) | — | — |
| `POST /api/pos/orders` response | `data.coupon_usage.error.code="OUTSIDE_TIME_WINDOW"` | CRM → Response | Only on non-blocking failure |
| `coupon_usage` row | `offer_type`, `time_window_status` snapshot | CRM → Mongo | Optional, V3-A always writes `offer_type="simple"` |

**No breaking changes.** All V1/V2 callers continue to work.

## C.2 V3-B / V3-C / V3-D — scope locks (for follow-up implementation plans)

These phases are **NOT** approved for implementation yet. Their scope is locked here for the next planning round so each phase only needs a thin implementation-plan doc on top of the decisions below.

### C.2.1 V3-B scope lock (when owner approves)
- `offer_type="bogo"` and `offer_type="bxg"` only.
- `same_item_only=true` BOGO + same-category BOGO + BXG with explicit `buy_*` / `get_*` sets.
- POS cashier **must include get-item in `items[]`** (no auto-add anywhere — frozen per OQ-V3-3).
- `apply_to_cheapest_get_item=true` default.
- `max_applications` cap supported.
- `get_discount_type ∈ {"free", "percentage"}` (`"flat"` deferred to V3-B2).
- New error codes: `BUY_QTY_NOT_MET`, `GET_ITEM_NOT_IN_CART`.
- ~40 V3-B assertions in `qa_cr001c_c_coupon_v3_b_bogo_bxg.py`.
- V1+V2+V3-A regression baseline (~115) must remain green.

### C.2.2 V3-C scope lock (when owner approves)
- `offer_type="nth_item"` only.
- Cart-only Nth (lifetime counter deferred per OQ-V3-11).
- Reuses V3-B `buy_*` / `get_*` field set with `nth_item_number` driver.
- `get_discount_type ∈ {"free", "percentage"}`.
- New error code: `NTH_ITEM_NOT_REACHED`.
- ~20 V3-C assertions.

### C.2.3 V3-D scope lock (when owner approves)
- `offer_type="free_item"` only.
- Threshold-gated free item (uses `min_order_value` / `free_item_threshold`).
- POS cashier **must include free item in `items[]`** (instruction-only contract per OQ-V3-4).
- Single free item per coupon (multi-free-item deferred to V3-D2).
- Birthday gating **NOT** in V3-D v1 (deferred to V3-D2 per OQ-V3-12).
- CRM does NOT record `coupon_usage` if free item missing in the final order (non-blocking warning logged).
- `requires_pos_action=true` flag returned by `available` and `validate`.
- `pos_instruction` text returned by `available` and `validate`.
- New error code: `FREE_ITEM_MISSING`.
- ~25 V3-D assertions.

### C.2.4 V3-E — PARKED TO V4 (OQ-V3-9)
- No implementation plan to be authored.
- §6.6 / §8.6 of this doc remain as forward reference only.
- Will be revisited after V3-A..D telemetry.

## C.3 Cross-phase invariants (frozen for all V3 phases)

These invariants apply to every V3 phase and are not re-negotiated per phase:

| Invariant | Frozen value (OQ source) |
|---|---|
| Total discount only is authoritative | OQ-V3-6 |
| One coupon per order | OQ-V3-7 |
| Final-order V3 failures are non-blocking | OQ-V3-8 |
| Idempotency key `(user_id, order_id)` | V1 / V2 inherited |
| Variance tolerance ₹1 abs / 1% rel | V1 / V2 inherited |
| Stacking with loyalty gated by `stackable_with_loyalty` | V1 Q2=C inherited |
| Wallet untouched | V1 Q3=D inherited (CR-001C-W separate) |
| POS-sent amount is source of truth for the bill | V1 Q5=C inherited |
| CRM never mutates POS cart | All V3 phases (OQ-V3-3, OQ-V3-4) |
| `coupon_transactions` legacy collection untouched | V1 / V2 inherited |
| 9 admin CRUD endpoints untouched | V1 / V2 inherited |
| `core/loyalty.py`, wallet code, migration code untouched | V1 / V2 inherited |
| Admin UI deferred (`CouponsPage.jsx` unchanged) | OQ-V3-10 |
| `/app/memory/final/` untouched | V1 / V2 inherited |

## C.4 Status flips applied by Addendum C

- This doc's top-of-file status: `cr001c_coupon_v3_complex_offers_plan_waiting_owner_decisions` → **`cr001c_coupon_v3a_time_window_plan_ready_for_implementation_approval`**.
- `/app/memory/crm/crm_1_0/planning/CR_001_INDEX.md` — V3 row updated to reflect Addendum C + V3-A approval.
- `/app/memory/PRD.md` — V3 block updated to reflect Addendum C + V3-A approval.

## C.5 What this Addendum does NOT do

- Does NOT modify any code. No edits to `backend/core/coupon.py`, `backend/models/schemas.py`, `backend/routers/pos.py`, `backend/services/analytics_service.py`, `backend/routers/coupons.py`, or any test file.
- Does NOT modify any DB collection, index, or document.
- Does NOT modify any `.env` file.
- Does NOT deploy or restart any service.
- Does NOT run any migration.
- Does NOT touch `core/loyalty.py` or any Loyalty code.
- Does NOT touch any Wallet code.
- Does NOT touch `/app/memory/final/`.

The next agent picking up V3-A will receive an "Owner-approved V3-A scope — write V3-A Implementation Plan" task. This addendum is the operative scope-lock for that planning step.

## C.6 Final status (this doc)

`cr001c_coupon_v3a_time_window_plan_ready_for_implementation_approval`
