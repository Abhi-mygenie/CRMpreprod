# POS Team Feedback to CRM — Order Suggestions API Handoff (CR-002)

**Date:** 2026-05-26
**From:** POS 3.0 Team
**To:** CRM Team
**Re:** `POST /api/pos/customers/order-suggestions` handoff review
**Status:** `pos_team_green_on_cr002_awaiting_5_blocker_answers`

---

## 1. Live-Probe Verdict

All 11 documented behaviours **reproduced live** (P-1 … P-11) against preview origin:

| # | Behaviour | Result |
|---|---|---|
| P-1 | Full request (cart + selected_item) | PASS |
| P-2 | No `selected_item` → empty `item_notes` | PASS |
| P-3 | `pos_customer_id` lookup | PASS |
| P-4 | INVALID_REQUEST (no customer ID) | PASS |
| P-5 | CUSTOMER_NOT_FOUND | PASS |
| P-6 | 401 (no auth) | PASS |
| P-7 | First-time customer (`customer_value` correctly omitted) | PASS |
| P-8 | Cart-exclusion (item drops from cross-sell when in cart) | PASS |
| P-9 | HTTP 422 (malformed body) | PASS |
| P-10 | Cache headers (`Cache-Control: no-store`) | PASS |
| P-11 | Response shape matches spec | PASS |

**Spec is honest.**

---

## 2. POS Verdict

> POS team is **GREEN** on consuming `POST /api/pos/customers/order-suggestions` in CR-002.

---

## 3. Supersedure Decisions (2)

| # | Question | Impact |
|---|---|---|
| **S-01** | Are legacy `GET /pos/customers/{id}/notes/items` + `GET /pos/customers/{id}/notes/orders` being deprecated now that the new POST returns both blocks inline? | POS needs to know whether to maintain both call paths or migrate to single POST. |
| **S-02** | Is `item_notes[].item_id` identical to POS `food_id` (e.g. `"182042"`)? If yes, our G-01 risk (CR-001 item-rename gap) is resolved by API design. | ID stability for item-level note matching. |

## 4. Blocking Clarifications (3)

| # | Question | Why blocking |
|---|---|---|
| **Q-01** | Is `cross_sell_items[].item_id` exactly POS `food.id` (string), same namespace as `current_cart[].item_id`? | POS needs to match suggestions to menu items for "Add to cart" button. |
| **Q-02** | Is `available_coupons_count` sourced from the same query as `GET /pos/coupons/available?customer_id=X`? | Count mismatch would confuse cashier ("24 coupons available" but only 3 show in coupon picker). |
| **Q-03** | Is the `tier` enum fully closed at `{Bronze, Silver, Gold, Platinum}` with that casing? | POS tier badge rendering needs closed enum. |

## 5. Non-Blocking Clarifications (8)

| # | Question |
|---|---|
| Q-04 | Per-item re-call cost: could we get `item_notes_by_id` map for all `current_cart` items in one call instead of re-calling per `selected_item`? |
| Q-05 | `net_spend = gross_spend` placeholder — should POS render both or suppress net until Phase 2? |
| Q-06 | Numeric `top_categories` (e.g. `"6777"`) — POS can't render names. Phase 2 timeline? Or should POS map via menu API? |
| Q-07 | Score float display — is `63.7` meaningful to cashier? Should POS just show the band? |
| Q-08 | Cache strategy — POS will do RAM-only 5-min memoization per customer+cart. Acceptable? |
| Q-09 | Time-of-day buckets (`morning`/`afternoon`/`evening`/`night`/`late_night`) — comparison logic: is this UTC or restaurant-local? |
| Q-10 | Latency 1.7-2.7s on preview vs <500ms target — POS shipping with 3s hard timeout + skeleton. Acceptable? |
| Q-11 | Churn-risk badge UX — should POS highlight "high churn" customers differently? Any CRM recommendation? |

## 6. Nice-to-Haves (8)

| # | Suggestion |
|---|---|
| P-01 | Add `meta.request_id` for cross-team debug (currently relying on Cloudflare `cf-ray`) |
| P-02 | Schema closures (strict enum types for `band`, `churn_risk`, `source`) |
| P-03 | `currency` field in `customer_summary` (for multi-currency restaurants) |
| P-04 | Unify `title` vs `name` across cross-sell items and top items |
| P-05 | `order_patterns.top_items[].item_id` type guarantee (always string, never null) |
| P-06 | `confidence` floor documentation (current minimum appears to be 0.05) |
| P-07 | `meta.computation_time_ms` for POS-side latency monitoring |
| P-08 | Pagination/streaming option for customers with very large order histories |

## 7. Sprint-Level Question (1)

| # | Question |
|---|---|
| **SL-01** | Will Phase-2 `upsell` live on the same endpoint (added to response) or a new endpoint? POS architecture differs. |

## 8. POS Risk Absorption (no CRM action needed)

- Latency 1.7-2.7s on preview → POS ships with 3s hard timeout + skeleton UI
- `Cache-Control: no-store` → POS does RAM-only 5-min memoization per customer+cart-version
- No `request_id` → POS uses Cloudflare `cf-ray` for debug until P-01 ships
- `customer_value` omission for first-time → POS uses `'customer_value' in data` presence check

## 9. Next Step

**POS will write CR-002 discovery + contract freeze + requirements freeze once S-01, S-02, Q-01, Q-02, Q-03 are answered** (the 5 blockers).

The 8 non-blocking + 8 polish items can be answered in parallel without delaying POS.

---

## 10. Status

```
pos_team_green_on_cr002_awaiting_5_blocker_answers
```
