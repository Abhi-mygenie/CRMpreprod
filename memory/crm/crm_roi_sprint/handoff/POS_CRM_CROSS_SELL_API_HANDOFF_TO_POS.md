# POS-CRM Customer Order Suggestions API — Handoff to POS Team

> **STATUS: GREEN-LIGHT v1.1 — POS may consume in preview.**
>
> The endpoint is live at the preview origin. QA 10/10 PASS (v1.1, 2026-05-26).
> Auth: same `X-API-Key` as all existing `/api/pos/*` endpoints. Zero new keys needed.
>
> **v1.1 changes (POS feedback shipped in-phase):**
> - `meta.request_id` (UUID) for cross-team debug (P-01)
> - `customer_summary.currency: "INR"` (P-03)
> - `cross_sell_items[].title` renamed to `.name` (P-04) — **BREAKING: update POS field mapping**
> - `available_coupons_count` now per-customer (excludes exhausted coupons) (Q-02)
> - `item_notes_by_id: {item_id: [notes]}` for ALL cart items in one call (Q-04) — no more per-item re-calls

---

**CR:** POS-CRM Customer Cross-Sell / Order Suggestions API
**Date:** 2026-05-26
**From:** CRM Team
**To:** POS 3.0 Team
**Re:** New endpoint for cashier-facing customer intelligence during order build
**Sprint:** ROI Measurement for CRM

---

## 1. What This Endpoint Does

When a cashier selects a CRM customer in POS, call this **one endpoint** to get everything needed to personalise the order:

1. **Customer summary** — name, phone, tier, visits, spend, loyalty, wallet, coupons count
2. **Customer value scoring** — composite score (0-100), band (Low/Medium/High/VIP), churn risk, win-back flag
3. **Order patterns** — top items, top categories, avg items/order, usual channel, usual time of day
4. **Order-level notes** — "less spicy", "no onion", etc. (top 5 by frequency)
5. **Item-level notes** — notes for a specific item when cashier selects it
6. **Cross-sell suggestions** — "Customer usually buys cake → suggest coffee" (top 3, with reason + confidence)

**Advisory only.** POS shows it; cashier picks; nothing is auto-applied to the cart.

---

## 2. Endpoint

```
POST /api/pos/customers/order-suggestions
```

**Preview origin:** `https://crm-variable-mapping.preview.emergentagent.com`

**Auth:** Same `X-API-Key` as all existing `/api/pos/*` endpoints. No new key needed.

```
X-API-Key: <restaurant_api_key>
```

---

## 3. Request Contract

```json
{
  "crm_customer_id": "1779d4fc-7161-4407-ac8c-cce30beb3e53",
  "pos_customer_id": null,
  "current_cart": [
    { "item_id": "182042", "qty": 1, "unit_price": 349.0 }
  ],
  "selected_item": { "item_id": "182042" },
  "order_type": "dine_in"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `crm_customer_id` | string | Yes (or `pos_customer_id`) | CRM customer ID. At least one of `crm_customer_id` or `pos_customer_id` required. |
| `pos_customer_id` | string | No | POS-side customer ID. Fallback if `crm_customer_id` not available. |
| `current_cart` | array | No | Items currently in cart. Used to exclude from cross-sell suggestions. |
| `current_cart[].item_id` | string | Yes | POS `food_id` / `item_id` |
| `current_cart[].qty` | int | No | Default: 1 |
| `current_cart[].unit_price` | float | No | Default: 0 |
| `selected_item` | object | No | If present, returns item-level notes for this item. |
| `selected_item.item_id` | string | Yes | POS `food_id` / `item_id` |
| `order_type` | string | No | Informational: `dine_in`, `takeaway`, `delivery` |
| `restaurant_id` | string | No | Derived from auth. Only needed if POS manages multiple restaurants per key. |

---

## 4. Success Response — Full Example (R689 live data)

```json
{
  "success": true,
  "message": "Order suggestions",
  "data": {
    "customer_summary": {
      "name": "abhishek jain",
      "phone": "7505242126",
      "tier": "Bronze",
      "visits": 19,
      "gross_spend": 18870.0,
      "net_spend": 18870.0,
      "last_visit_at": "2026-05-26T05:16:06.292553+00:00",
      "loyalty_points": 237,
      "wallet_balance": 0.0,
      "available_coupons_count": 24
    },

    "customer_value": {
      "score": 63.7,
      "band": "high",
      "avg_order_value": 993.16,
      "frequency_per_month": 0.61,
      "recency_days": 0,
      "churn_risk": "low",
      "win_back_recommendation": false
    },

    "order_patterns": {
      "top_items": [
        { "item_id": "182040", "name": "Nuts Overload Salankatia", "order_count": 78, "last_ordered_at": "2026-05-26T05:16:06..." },
        { "item_id": "182037", "name": "Pista Dream Salankatia", "order_count": 31, "last_ordered_at": "2026-05-25T05:57:25..." },
        { "item_id": "182033", "name": "Falooda Loua", "order_count": 20, "last_ordered_at": "2026-05-26T05:16:03..." },
        { "item_id": "182038", "name": "Berry Cocoa Swirl Loua", "order_count": 7, "last_ordered_at": "2026-05-26T05:16:03..." },
        { "item_id": "175801", "name": "Dates 2 Pcs [ Extra ]", "order_count": 6, "last_ordered_at": "2026-05-25T05:57:25..." }
      ],
      "top_categories": [
        { "category": "6777", "order_count": 107 },
        { "category": "", "order_count": 50 },
        { "category": "5128", "order_count": 7 }
      ],
      "avg_items_per_order": 3.0,
      "usual_channel": "dinein",
      "usual_time_of_day": "afternoon"
    },

    "customer_notes": [],

    "item_notes": [],

    "cross_sell_items": [
      {
        "item_id": "182040",
        "title": "Nuts Overload Salankatia",
        "reason": "Ordered in 8 of 20 visits",
        "source": "history",
        "confidence": 0.24
      },
      {
        "item_id": "182038",
        "title": "Berry Cocoa Swirl Loua",
        "reason": "Ordered in 7 of 20 visits",
        "source": "history",
        "confidence": 0.21
      },
      {
        "item_id": "182037",
        "title": "Pista Dream Salankatia",
        "reason": "Ordered in 7 of 20 visits",
        "source": "history",
        "confidence": 0.21
      }
    ],

    "meta": {
      "generated_at": "2026-05-26T11:59:10.989639+00:00",
      "feature_flags": {
        "cross_sell": true,
        "upsell": false,
        "ai": false
      }
    }
  }
}
```

---

## 5. Response Field Reference

### 5.1 customer_summary

| Field | Type | Description |
|---|---|---|
| `name` | string | Customer name |
| `phone` | string | Full phone number (not masked) |
| `tier` | string | `Bronze` / `Silver` / `Gold` / `Platinum` |
| `visits` | int | Total visits |
| `gross_spend` | float | Total spend (before discounts) |
| `net_spend` | float | Total spend (currently = gross; net computation in Phase 2) |
| `last_visit_at` | string/null | ISO datetime of last visit |
| `loyalty_points` | int | Current spendable points balance |
| `wallet_balance` | float | Current wallet balance |
| `available_coupons_count` | int | Active coupons count for this restaurant |

### 5.2 customer_value (OMITTED for first-time customers with ≤1 visit)

| Field | Type | Description |
|---|---|---|
| `score` | float | Composite value score 0-100 |
| `band` | string | `low` (<35) / `medium` (35-59) / `high` (60-79) / `vip` (≥80) |
| `avg_order_value` | float | Customer's average order value |
| `frequency_per_month` | float | Average visits per month |
| `recency_days` | int | Days since last visit |
| `churn_risk` | string | `low` / `medium` / `high` |
| `win_back_recommendation` | bool | `true` if churn_risk is `high` — signal for win-back campaigns |

**Scoring model (5 factors):**
- Total Spend (30%) + Visit Frequency (25%) + Recency (20%) + AOV (15%) + Order Consistency (10%)
- Normalized against restaurant-wide benchmarks

**Churn model (4 factors):**
- Recency gap vs personal average (40%) + Frequency trend (30%) + Spend trend (20%) + Absolute recency (10%)

### 5.3 order_patterns

| Field | Type | Description |
|---|---|---|
| `top_items` | array | Top 5 items by quantity. Each: `{item_id, name, order_count, last_ordered_at}` |
| `top_categories` | array | Top 5 categories by quantity. Each: `{category, order_count}` |
| `avg_items_per_order` | float | Average items per order |
| `usual_channel` | string/null | Most common order type: `dinein`, `takeaway`, `delivery` |
| `usual_time_of_day` | string/null | Most common time bucket: `morning`, `afternoon`, `evening`, `night`, `late_night` |

### 5.4 customer_notes

Array of top 5 order-level notes by frequency:

| Field | Type | Description |
|---|---|---|
| `text` | string | Note text (original casing) |
| `used_count` | int | How many times this note appeared |
| `last_used_at` | string | When this note was last used |
| `source` | string | Always `"history"` in v1 |

### 5.5 item_notes (only when `selected_item` provided in request)

Array of item-specific notes:

| Field | Type | Description |
|---|---|---|
| `item_id` | string | The selected item's ID |
| `text` | string | Note text |
| `used_count` | int | Frequency |
| `last_used_at` | string | Last used datetime |
| `source` | string | Always `"history"` in v1 |

### 5.6 cross_sell_items

Top 3 cross-sell suggestions (excludes items already in `current_cart`):

| Field | Type | Description |
|---|---|---|
| `item_id` | string | Suggested item's `pos_food_id` |
| `title` | string | Item name |
| `reason` | string | Human-readable reason (e.g. "Ordered in 8 of 20 visits") |
| `source` | string | `"history"` (from customer's own data) or `"restaurant"` (from restaurant-wide patterns) |
| `confidence` | float | 0-1 blended confidence score |

**Algorithm:** 60% customer personal co-occurrence + 40% restaurant-wide co-occurrence. Items already in cart excluded.

### 5.7 meta

| Field | Type | Description |
|---|---|---|
| `generated_at` | string | ISO timestamp of response generation |
| `feature_flags.cross_sell` | bool | `true` — cross-sell is active |
| `feature_flags.upsell` | bool | `false` — upsell is v2 |
| `feature_flags.ai` | bool | `false` — AI suggestions are v2 |

---

## 6. Error Responses

All errors return HTTP 200 with `success: false` (consistent with all POS endpoints).

| Error Code | Trigger | POS Action |
|---|---|---|
| `CUSTOMER_NOT_FOUND` | Customer ID doesn't match any customer under this restaurant | Show "Customer not found" |
| `INVALID_REQUEST` | Neither `crm_customer_id` nor `pos_customer_id` provided | Fix payload |
| HTTP 401 | Missing / invalid `X-API-Key` | Check API key config |
| HTTP 422 | Malformed request body | Fix payload |

### Error response example

```json
{
  "success": false,
  "message": "Customer not found",
  "data": {
    "error": {
      "code": "CUSTOMER_NOT_FOUND",
      "detail": "No customer matches the provided ID under this restaurant"
    }
  }
}
```

---

## 7. First-Time Customer Response (≤1 visit)

When the customer has 0 or 1 visits:

```json
{
  "success": true,
  "message": "Order suggestions",
  "data": {
    "customer_summary": {
      "name": "priti",
      "phone": "9990818342",
      "tier": "Bronze",
      "visits": 0,
      "gross_spend": 0.0,
      "net_spend": 0.0,
      "last_visit_at": null,
      "loyalty_points": 0,
      "wallet_balance": 0.0,
      "available_coupons_count": 24
    },
    "order_patterns": {
      "top_items": [],
      "top_categories": [],
      "avg_items_per_order": 0,
      "usual_channel": null,
      "usual_time_of_day": null
    },
    "customer_notes": [],
    "item_notes": [],
    "cross_sell_items": [],
    "meta": {
      "generated_at": "2026-05-26T...",
      "feature_flags": { "cross_sell": true, "upsell": false, "ai": false }
    }
  }
}
```

**Note:** `customer_value` block is **not present** (omitted entirely, not null). POS can render a "New Customer" badge when this block is missing.

---

## 8. cURL Examples

### 8.1 Full request (customer with history + cart + selected item)

```bash
curl -X POST 'https://crm-variable-mapping.preview.emergentagent.com/api/pos/customers/order-suggestions' \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: <restaurant_api_key>' \
  -d '{
    "crm_customer_id": "1779d4fc-7161-4407-ac8c-cce30beb3e53",
    "current_cart": [{"item_id": "182042", "qty": 1, "unit_price": 349}],
    "selected_item": {"item_id": "182042"},
    "order_type": "dine_in"
  }'
```

### 8.2 Minimal request (just customer ID)

```bash
curl -X POST '.../api/pos/customers/order-suggestions' \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: <key>' \
  -d '{"crm_customer_id": "1779d4fc-7161-4407-ac8c-cce30beb3e53"}'
```

### 8.3 Lookup by POS customer ID

```bash
curl -X POST '.../api/pos/customers/order-suggestions' \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: <key>' \
  -d '{"pos_customer_id": "22"}'
```

---

## 9. Recommended POS Flow

```
1. Cashier selects a CRM customer in POS.
2. POS calls:
     POST /api/pos/customers/order-suggestions
     { "crm_customer_id": "<id>", "current_cart": [...] }
3. POS renders:
     - Customer summary card (name, tier, visits, spend, points, wallet)
     - Value band badge (VIP/High/Medium/Low) — or "New Customer" if block missing
     - Churn risk indicator (if high → highlight for special attention)
     - Top items / order patterns
     - Customer notes before KOT ("less spicy", "no onion")
     - Cross-sell suggestions ("Add Iced Coffee?")
4. When cashier selects/clicks an item, POS re-calls with:
     { ..., "selected_item": {"item_id": "<clicked_item>"} }
     → item-level notes appear ("extra cheese — used 3 times")
5. When cart changes, POS can optionally re-call with updated current_cart
     → cross-sell refreshes to exclude newly added items
```

---

## 10. Existing Endpoints — NOT Changed

This endpoint is **purely additive**. No existing POS endpoints were modified:

| Endpoint | Status |
|---|---|
| `POST /api/pos/customer-lookup` | UNTOUCHED |
| `GET /api/pos/customers/{id}` | UNTOUCHED |
| `GET /api/pos/customers/{id}/loyalty` | UNTOUCHED |
| `GET /api/pos/customers/{id}/notes/items` | UNTOUCHED |
| `GET /api/pos/customers/{id}/notes/orders` | UNTOUCHED |
| `POST /api/pos/max-redeemable` | UNTOUCHED |
| `POST /api/pos/loyalty/redeem` | UNTOUCHED |
| `GET /api/pos/coupons/available` | UNTOUCHED |
| `POST /api/pos/coupons/validate` | UNTOUCHED |
| `POST /api/pos/orders` | UNTOUCHED |

---

## 11. Things POS Must NOT Do

| Anti-pattern | Correct |
|---|---|
| Auto-add cross-sell items to cart | Only show as suggestions; cashier explicitly adds |
| Cache results for more than 5 minutes | Customer data changes (new orders, points redeemed) |
| Assume `customer_value` always exists | Omitted for first-time customers — check presence |
| String-match `message` for error handling | Use `data.error.code` |
| Call this endpoint without auth | Always send `X-API-Key` header |

---

## 12. Phase 2 (Not in v1)

| Feature | Status |
|---|---|
| Upsell suggestions | Deferred (owner decision) |
| AI-generated notes/suggestions | Deferred |
| Owner-configurable value band thresholds | CRM picks defaults |
| Cross-restaurant suggestions | Phase 1 = same restaurant only |
| `net_spend` computation | Currently = gross; Phase 2 subtracts discounts |
| Category name resolution | Currently returns numeric IDs; Phase 2 maps to names via menu API |

---

## 13. QA Evidence

- Manual QA: 10/10 PASS (2026-05-26)
- Tests: auth (no key=401, valid key=200), customer not found, first-time customer, R689 customer with history, selected item, current cart, invalid request, value scoring sanity, churn risk sanity, existing endpoints unaffected
- Performance: ~3.3s on external DB (network-bound); <500ms expected in co-located production

---

## 14. Status

```
pos_crm_cross_sell_implementation_complete_handoff_ready
```

**POS may consume `POST /api/pos/customers/order-suggestions` in preview now.**
