# CRM Reply to POS Team — 5 Blocker Answers for Order Suggestions API

**Date:** 2026-05-26
**From:** CRM Team
**To:** POS 3.0 Team
**Re:** Answers to S-01, S-02, Q-01, Q-02, Q-03 from POS feedback on `POST /api/pos/customers/order-suggestions`
**Status:** `crm_5_blocker_answers_shipped`
**POS Feedback doc:** `../discovery/CRM2_0_CR_002_POS_FEEDBACK_TO_CRM_HANDOFF_2026_05_26.md`

---

## S-01: Are legacy `/notes/items` + `/notes/orders` GETs being deprecated?

**Answer: NO — both endpoints remain LIVE and are NOT deprecated.**

The new POST endpoint includes notes as a convenience (single round-trip for the full order-build UX), but the existing GETs serve a different use case:

| Endpoint | Use case | Keeps working? |
|---|---|---|
| `GET /pos/customers/{id}/notes/items` | Standalone item-note lookup (richer response: grouped by item, all items) | **YES** |
| `GET /pos/customers/{id}/notes/orders` | Standalone order-note lookup (richer response: full list with total counts) | **YES** |
| `POST /pos/customers/order-suggestions` → `customer_notes` + `item_notes` | Inline in order-build flow (top 5, single selected item) | **YES** |

**POS can use whichever suits their UX:**
- Use the POST for the order-build flow (single call, all context)
- Use the GETs for a dedicated "Customer Notes" screen or for items not in the current cart
- No migration needed — the GETs are not going away

**Code evidence:** `routers/pos.py` L2714 and L2755 — untouched, no deprecation marker.

---

## S-02: Is `item_notes[].item_id` identical to POS `food_id`?

**Answer: YES — `item_notes[].item_id` is exactly `pos_food_id` from `order_items` collection, which is the POS `food.id` cast to string.**

**Code evidence:** `core/customer_intelligence.py` L296 matches on `pos_food_id: selected_item_id`, and L307 returns it as `item_id`:
```python
{"$match": {"pos_food_id": selected_item_id, ...}}
...
{"$project": {"item_id": {"$literal": selected_item_id}, ...}}
```

**DB evidence:** All 13,890 `order_items` rows for R689 have `pos_food_id` as type `string`. Sample: `"182042"`, `"146588"`, `"175801"`.

**G-01 risk resolution:** Yes — since `item_notes[].item_id` uses `pos_food_id` (the stable ID POS assigns at menu creation), it is immune to item renames. If POS renames "Veg Pasta" to "Premium Veg Pasta", `pos_food_id = "182042"` stays the same → notes continue to match.

---

## Q-01: Is `cross_sell_items[].item_id` exactly POS `food.id` (string)?

**Answer: YES — same namespace, same type (string), same field (`pos_food_id`).**

**Code evidence:** `core/customer_intelligence.py`:
- L205/211: `top_items` aggregation groups by `pos_food_id`, returns as `item_id`
- L330: cross-sell baskets extract `"id": "$pos_food_id"`
- L365: restaurant-wide co-occurrence groups by `"_id": "$pos_food_id"`
- L389: final output uses `"item_id": iid` where `iid` = `pos_food_id`

**Confirmed:** `cross_sell_items[].item_id` = `current_cart[].item_id` = `item_notes[].item_id` = `order_patterns.top_items[].item_id` — all are `pos_food_id` (string). POS can use these directly as `food.id` for "Add to cart" matching.

---

## Q-02: Is `available_coupons_count` sourced from the same query as `GET /pos/coupons/available?customer_id=X`?

**Answer: NO — the queries are DIFFERENT. The count is a simpler/broader approximation.**

| | `available_coupons_count` (in order-suggestions) | `GET /pos/coupons/available?customer_id=X` |
|---|---|---|
| Source | `core/customer_intelligence.py` L21-30 | `core/coupon.py` L1865 `list_available_coupons()` |
| Filter | `user_id` + `is_active: true` + not expired | Same + per-user usage limit + customer scope + channel + min_order_value + V3-A time-window + V3-B/C item checks |
| Per-customer? | **No** — counts all active restaurant coupons | **Yes** — filters by customer's usage history |
| Result | Higher count (all active coupons for restaurant) | Lower count (only those the customer can actually use right now) |

**What this means for POS:**
- `available_coupons_count: 24` means "24 active coupons exist for this restaurant"
- `GET /pos/coupons/available?customer_id=X&order_value=500` might return only 3 (after per-user limits, channel, min order value, etc.)
- **POS should NOT display this as "24 coupons you can use"** — it's a "this restaurant has 24 promotions running" indicator
- For the actual "coupons available for YOU" count, call `GET /pos/coupons/available` separately

**CRM Phase 2 consideration:** We can align the count to per-customer filtering if POS needs an accurate "coupons for you" number in the summary. This would add one more DB query (~200ms on external DB). Let us know if this is a priority.

---

## Q-03: Is the `tier` enum fully closed at `{Bronze, Silver, Gold, Platinum}` with that casing?

**Answer: YES — the enum is closed and the casing is exactly `Bronze`, `Silver`, `Gold`, `Platinum`.**

**Code evidence:** `core/loyalty.py` L40-52 (single source of truth for tier calculation):
```python
def calculate_tier(total_points: int, settings: dict) -> str:
    if total_points >= settings.get("tier_platinum_min", 5000):
        return "Platinum"
    if total_points >= settings.get("tier_gold_min", 1500):
        return "Gold"
    if total_points >= settings.get("tier_silver_min", 500):
        return "Silver"
    return "Bronze"
```

**DB evidence (live, 2026-05-26):**
```
Distinct tier values: ['Bronze', 'Gold', 'Platinum', 'Silver']
Distribution: Bronze=2906, Silver=149, Gold=19, Platinum=4
```

No other values exist. The function is a pure `if/elif` chain with string literals — no dynamic values, no config-driven tier names. **POS can hardcode the 4-value enum with these exact strings.**

Default for new customers or missing tier: `"Bronze"` (see `customer_intelligence.py` L35: `customer.get("tier", "Bronze")`).

---

## Quick Answers to Non-Blocking Questions

| # | Question | Quick answer |
|---|---|---|
| Q-04 | Batch item_notes for all cart items | Phase 2 — would require request schema change. For now, re-call with different `selected_item` or call `GET /pos/customers/{id}/notes/items` for all items at once. |
| Q-05 | `net_spend = gross_spend` rendering | Show only `gross_spend` as "Total Spend". Suppress `net_spend` until Phase 2 computes it properly. |
| Q-06 | Numeric categories | POS should map via `GET /api/menu/{restaurant_id}` (already live). Phase 2 will inline category names. |
| Q-07 | Score display | Band is cashier-friendly. Show band as badge; hide score unless POS has a "details" view. |
| Q-08 | 5-min RAM cache | Acceptable. Aligns with handoff §11 ("don't cache >5 min"). |
| Q-09 | Time-of-day buckets | Based on `order_created_at` string parsing (restaurant-local time as stored by POS). Not UTC-converted. |
| Q-10 | 3s timeout + skeleton | Acceptable for preview. Production co-located will be <500ms. |
| Q-11 | Churn badge UX | CRM recommends: red badge for `high`, yellow for `medium`, no badge for `low`. High-churn + win_back=true → "Win Back" CTA. |

## Sprint-Level Answer

| # | Answer |
|---|---|
| **SL-01** | Phase 2 upsell will live on the **same endpoint** — added as `upsell_items` array in response with `feature_flags.upsell: true`. No new endpoint. POS can check `feature_flags.upsell` to know when to render the upsell section. |

---

## Status

```
crm_5_blocker_answers_shipped
```

POS team can proceed with CR-002 discovery + contract freeze + requirements freeze.
