# POS-CRM Customer Cross-Sell / Order Suggestions API — Phase 1 Plan

**Date:** 2026-05-26
**Status:** `pos_crm_cross_sell_phase_1_plan_locked`
**Sprint:** ROI Measurement for CRM
**Sprint folder:** `/app/memory/crm/crm_roi_sprint/`
**Predecessor:** `../discovery/POS_CRM_CUSTOMER_CROSS_SELL_PHASE_0_REQUIREMENTS_FREEZE.md`
**Register entry:** `../00_register/ROI_MEASUREMENT_CR_REGISTER.md` (CR #3)

---

## 1. Locked Owner Decisions

### A. Customer Summary
| # | Decision | Choice |
|---|---|---|
| Q1 | Include full customer summary in response | **a** — full summary (name, phone, tier, visits, spend, loyalty, wallet, coupons) — one less round-trip for POS |

### B. Notes
| # | Decision | Choice |
|---|---|---|
| Q2 | Notes aggregation | **b** — Top 5 most-used notes (order-level and item-level) |

### C. Cross-Sell
| # | Decision | Choice |
|---|---|---|
| Q3 | Cross-sell source | **c** — Hybrid (customer's own history + restaurant-wide co-purchase patterns) |
| Q4 | Max cross-sell items | **a** — 3 items max |

### D. Upsell
| # | Decision | Choice |
|---|---|---|
| Q5 | Upsell in v1 | **c** — Skip upsell in v1, ship cross-sell only |

### E. Customer Value Scoring
| # | Decision | Choice |
|---|---|---|
| Q6 (from prev session) | Score + Band | **c** — Return both `score` (0-100) and `band` (Low/Medium/High/VIP) |
| Q7 (from prev session) | Scoring factors | **c** — Full RFM-style with multiple variables |
| Scoring model | Composite weighted score | See §2 below — skip loyalty/coupon factors |
| First-time customers | Omit `customer_value` block entirely for ≤1 visit | **c** (from prev session) |

### F. Churn Risk
| # | Decision | Choice |
|---|---|---|
| Q9 (from prev session) | Churn risk | **d** — Return churn risk AND `win_back_recommendation` flag. Cross-CR linkage to CR-004 WhatsApp Marketing Automation. |
| Churn model | Multi-factor | See §3 below — based on recency gap vs personal avg, frequency trend, spend trend, absolute recency |

### G. Performance & Scope
| # | Decision | Choice |
|---|---|---|
| Q8 | Latency target | **b** — <500ms (allows live computation) |
| Q9 | Multi-restaurant scope | **a** — Same restaurant only (Phase 1) |
| Q10 | Pilot restaurant | **a** — R689 only |

### H. Existing Endpoints
| Decision | Detail |
|---|---|
| Notes endpoints | **Already live** — `GET /api/pos/customers/{id}/notes/items` (L2714) and `GET /api/pos/customers/{id}/notes/orders` (L2755). Reuse shared helpers internally. |
| CRM admin UI for notes | **Not needed** — B8 not logged |
| Existing POS endpoints | **All untouched** — the new endpoint is purely additive |

---

## 2. Customer Value Scoring Model

**Composite score: 0–100**, weighted from 5 factors (loyalty/coupon factors excluded per owner decision):

| Factor | Weight | Computation | Rationale |
|---|---|---|---|
| **Total Spend** | 30% | `customer_spend / max_spend_in_restaurant` × 100 | Revenue contribution |
| **Visit Frequency** | 25% | `visits_per_month / max_freq_in_restaurant` × 100 | Engagement level |
| **Recency** | 20% | Inverse decay: `max(0, 100 - (days_since_last_visit / 180) × 100)` | Active vs dormant |
| **AOV (Avg Order Value)** | 15% | `customer_aov / restaurant_avg_aov` × 100, capped at 100 | Ticket quality |
| **Order Consistency** | 10% | `1 - (std_dev_of_visit_gaps / mean_visit_gap)`, scaled 0–100. Lower variance = higher score | Predictability |

**Final score** = `0.30×spend + 0.25×frequency + 0.20×recency + 0.15×aov + 0.10×consistency`, capped 0–100.

**Band mapping:**
| Band | Score range |
|---|---|
| **VIP** | ≥ 80 |
| **High** | 60–79 |
| **Medium** | 35–59 |
| **Low** | < 35 |

**First-time customers (≤1 visit):** `customer_value` block omitted entirely from response.

---

## 3. Churn Risk Model

**Multi-factor composite**, not just recency:

| Factor | Weight | Logic |
|---|---|---|
| **Recency gap vs personal average** | 40% | `(days_since_last_visit - avg_visit_gap) / avg_visit_gap`. If customer usually visits every 7 days but hasn't in 21 days → high signal. Clamped 0–1. |
| **Frequency trend** | 30% | Compare last-30-day visit count vs previous-30-to-60-day count. `(prev_count - recent_count) / max(prev_count, 1)`. Declining = higher risk. |
| **Spend trend** | 20% | AOV of last 3 orders vs prior 3 orders. `(prior_aov - recent_aov) / max(prior_aov, 1)`. Declining = higher risk. |
| **Last visit absolute** | 10% | `min(days_since_last_visit / 90, 1.0)`. >90 days = max contribution regardless. |

**Composite churn score** = weighted sum, clamped 0–1.

| Risk band | Score range | `win_back_recommendation` |
|---|---|---|
| **High** | > 0.7 | `true` |
| **Medium** | 0.4–0.7 | `false` |
| **Low** | < 0.4 | `false` |

**First-time customers (≤1 visit):** Churn risk omitted (same as customer_value — entire block omitted).

**Cross-CR linkage:** `win_back_recommendation: true` will feed CR-004 WhatsApp Marketing Automation (win-back campaign triggers).

---

## 4. API Contract (Final)

### Endpoint

```
POST /api/pos/customers/order-suggestions
```

**Auth:** `verify_pos_auth` (same `X-API-Key` as all `/api/pos/*` endpoints)

### Request

```json
{
  "restaurant_id": "R689",
  "crm_customer_id": "<customer_id>",
  "pos_customer_id": "<optional>",
  "current_cart": [
    { "item_id": "182042", "qty": 1, "unit_price": 100 }
  ],
  "selected_item": { "item_id": "182042" },
  "order_type": "dine_in"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `restaurant_id` | string | No | Derived from auth if absent |
| `crm_customer_id` | string | Yes (or `pos_customer_id`) | At least one required |
| `pos_customer_id` | string | No | Fallback lookup |
| `current_cart` | array | No | Used for cross-sell filtering (exclude items already in cart) |
| `selected_item` | object | No | If present, item-level notes returned for this item |
| `order_type` | string | No | Informational |

### Response

```json
{
  "success": true,
  "data": {
    "customer_summary": {
      "name": "Neelam Sharma",
      "phone": "+919736078200",
      "tier": "Bronze",
      "visits": 12,
      "gross_spend": 8400,
      "net_spend": 7900,
      "last_visit_at": "2026-05-20T...",
      "loyalty_points": 240,
      "wallet_balance": 0,
      "available_coupons_count": 2
    },

    "customer_value": {
      "score": 62.5,
      "band": "high",
      "avg_order_value": 700,
      "frequency_per_month": 3.2,
      "recency_days": 6,
      "churn_risk": "low",
      "win_back_recommendation": false
    },

    "order_patterns": {
      "top_items": [
        { "item_id": "182042", "name": "Veg Pasta", "order_count": 8, "last_ordered_at": "..." },
        { "item_id": "182045", "name": "Iced Coffee", "order_count": 6, "last_ordered_at": "..." }
      ],
      "top_categories": [
        { "category": "main_course", "order_count": 10 },
        { "category": "beverages", "order_count": 7 }
      ],
      "avg_items_per_order": 3.2,
      "usual_channel": "dine_in",
      "usual_time_of_day": "evening"
    },

    "customer_notes": [
      { "text": "less spicy", "used_count": 5, "last_used_at": "...", "source": "history" },
      { "text": "no onion", "used_count": 3, "last_used_at": "...", "source": "history" }
    ],

    "item_notes": [
      { "item_id": "182042", "text": "extra cheese", "used_count": 2, "last_used_at": "...", "source": "history" }
    ],

    "cross_sell_items": [
      { "item_id": "182045", "title": "Iced Coffee", "reason": "Ordered with Veg Pasta on 3 of 5 visits", "source": "history", "confidence": 0.72 },
      { "item_id": "182050", "title": "Garlic Bread", "reason": "Popular combo across restaurant", "source": "restaurant", "confidence": 0.58 }
    ],

    "meta": {
      "generated_at": "2026-05-26T...",
      "feature_flags": { "cross_sell": true, "upsell": false, "ai": false }
    }
  }
}
```

**Omissions for first-time customers (≤1 visit):**
- `customer_value` block: omitted entirely
- `customer_notes`: empty array
- `item_notes`: empty array
- `cross_sell_items`: may contain restaurant-wide suggestions only

**Omissions for unknown customer:**
- Return `success: false` with `error.code: "CUSTOMER_NOT_FOUND"`

---

## 5. Existing Endpoints — NOT Modified

| Endpoint | Status |
|---|---|
| `POST /api/pos/customer-lookup` | UNTOUCHED |
| `GET /api/pos/customers/{id}` | UNTOUCHED |
| `GET /api/pos/customers/{id}/loyalty` | UNTOUCHED |
| `GET /api/pos/customers/{id}/notes/items` | UNTOUCHED (reuse helpers internally) |
| `GET /api/pos/customers/{id}/notes/orders` | UNTOUCHED (reuse helpers internally) |
| `POST /api/pos/max-redeemable` | UNTOUCHED |
| `POST /api/pos/loyalty/redeem` | UNTOUCHED |
| `GET /api/pos/coupons/available` | UNTOUCHED |
| `POST /api/pos/coupons/validate` | UNTOUCHED |
| `POST /api/pos/orders` | UNTOUCHED |

---

## 6. Detailed Implementation Plan

### 6.1 File Change Matrix

| File | Action | What changes | Impact |
|---|---|---|---|
| `backend/core/customer_intelligence.py` | **NEW** | Value scoring, churn risk, cross-sell computation, order patterns aggregation | No existing code affected — pure addition |
| `backend/routers/suggestions.py` | **NEW** | `POST /api/pos/customers/order-suggestions` endpoint + Pydantic schemas | No existing code affected — pure addition |
| `backend/server.py` | **EDIT (1 line import + 1 line router wire)** | Add `from routers import suggestions` at L16 and `api_router.include_router(suggestions.router)` after L76 | Minimal — only adds one new router to the existing chain. No changes to existing router registrations. |

**Files NOT modified (zero changes):**
- `routers/pos.py` — untouched. Notes logic at L2714-L2787 will be **duplicated as lightweight pipelines** in `customer_intelligence.py` rather than importing from `pos.py` (to avoid coupling the new module to the 2816-line POS router). The pipelines are 10-15 lines each; DRY extraction into a shared helper is a Phase 2 cleanup if needed.
- `models/schemas.py` — untouched. New Pydantic models live inside `routers/suggestions.py` (co-located, no cross-file dependency).
- `core/auth.py` — untouched. Uses existing `verify_pos_auth` (L93-127) via import.
- `core/database.py` — untouched. Uses existing `db` handle.
- All other routers — untouched.
- All frontend files — untouched (no CRM admin UI for this CR).

---

### 6.2 New File: `backend/core/customer_intelligence.py`

**Purpose:** Pure computation module. All functions take a `db` handle + `user_id` + `customer_id` and return dicts. No HTTP, no Pydantic, no auth — just Mongo queries + math.

**Functions:**

| Function | Inputs | Output | Mongo queries | Notes |
|---|---|---|---|---|
| `compute_customer_summary(db, user_id, customer_id)` | db, user_id, customer_id | `dict` with name, phone, tier, visits, spend, loyalty, wallet, coupons count | `customers.find_one` + `coupons.count_documents` (active, not expired, not usage-capped for this customer) | Reads `customer.total_visits`, `customer.total_spent`, `customer.total_points`, `customer.wallet_balance`, `customer.tier`, `customer.name`, `customer.phone`. Available coupons count uses simplified filter (active + not expired + not per-user-capped). |
| `compute_customer_value(db, user_id, customer_id, customer_doc)` | db, user_id, customer_id, pre-fetched customer doc | `dict` with score, band, aov, frequency_per_month, recency_days, churn_risk, win_back_recommendation | `orders.aggregate` (for restaurant-wide max_spend, max_freq, avg_aov — **cached per request**) + customer doc fields + `orders.find` (last 6 orders for spend/frequency trend) | Returns `None` for first-time customers (≤1 visit). Churn risk uses the 4-factor model from §3. |
| `compute_order_patterns(db, user_id, customer_id)` | db, user_id, customer_id | `dict` with top_items, top_categories, avg_items_per_order, usual_channel, usual_time_of_day | `order_items.aggregate` (group by item_name + pos_food_id, sort by count desc, limit 5) + `orders.aggregate` (group by order_type, group by hour bucket, avg items count) | Top 5 items, top 5 categories. Channel = mode of `order_type`. Time = mode of hour bucket (morning/afternoon/evening/night). |
| `compute_customer_notes(db, user_id, customer_id, limit=5)` | db, user_id, customer_id, limit | `list[dict]` with text, used_count, last_used_at, source | `orders.aggregate` (same pipeline as `pos_customer_order_notes` at L2765-L2776 in pos.py, with `$limit`) | Replicates the pipeline from pos.py L2765-L2776 but adds `$limit: 5`. |
| `compute_item_notes(db, user_id, customer_id, selected_item_id)` | db, user_id, customer_id, selected_item_id | `list[dict]` with item_id, text, used_count, last_used_at, source | `order_items.aggregate` (filtered by `pos_food_id` = selected_item_id, same pattern as L2724-L2739 in pos.py) | Only runs when `selected_item` is provided in request. |
| `compute_cross_sell(db, user_id, customer_id, cart_item_ids, limit=3)` | db, user_id, customer_id, list of item_ids already in cart, limit | `list[dict]` with item_id, title, reason, source, confidence | **Step 1:** `order_items.aggregate` → get customer's top items (by frequency). **Step 2:** For each top item, `order_items.aggregate` → find co-occurring items in the same orders. **Step 3:** `order_items.aggregate` → restaurant-wide co-occurrence for cart items. **Step 4:** Merge, exclude cart items, rank by confidence, limit 3. | Hybrid: customer-personal co-occurrence weighted 60%, restaurant-wide weighted 40%. Confidence = `co_occurrence_count / total_orders_with_item`. |
| `_get_restaurant_stats(db, user_id)` | db, user_id | `dict` with max_spend, max_freq, avg_aov, total_customers | `customers.aggregate` + `orders.aggregate` | **Called once per request**, results passed to `compute_customer_value`. Restaurant-wide benchmarks for normalization. |

**Detailed algorithm for `compute_cross_sell`:**

```
1. Fetch customer's order_ids: db.orders.find({customer_id, user_id}, {id: 1})
2. For each order, fetch co-occurring items: db.order_items.find({order_id: {$in: order_ids}})
3. Build item co-occurrence matrix: {item_A → {item_B: count, item_C: count}}
4. For items in current_cart, find most co-occurring items NOT already in cart
5. Also fetch restaurant-wide top co-occurrences for cart items:
   db.order_items.aggregate([
     {$match: {user_id, pos_food_id: {$in: cart_item_ids}}},
     {$lookup: {from: "order_items", localField: "order_id", foreignField: "order_id", as: "siblings"}},
     {$unwind: "$siblings"},
     {$match: {"siblings.pos_food_id": {$nin: cart_item_ids}}},
     {$group: {_id: "$siblings.pos_food_id", count: {$sum: 1}, name: {$first: "$siblings.item_name"}}},
     {$sort: {count: -1}},
     {$limit: 10}
   ])
6. Blend: personal_weight=0.6, restaurant_weight=0.4
7. Normalize confidence to 0-1
8. Return top 3
```

**Performance notes:**
- `_get_restaurant_stats` is the heaviest query (scans all customers + orders for the restaurant). For R689: ~2035 customers, ~8250 orders. On indexed fields this should be <100ms.
- Cross-sell co-occurrence query uses `$lookup` which can be expensive. Bounded by customer's order count (most customers: <50 orders). Restaurant-wide query bounded by `$limit: 10`.
- Total target: <500ms for the full endpoint.

---

### 6.3 New File: `backend/routers/suggestions.py`

**Purpose:** HTTP layer only. Validates request, calls `customer_intelligence` functions, assembles response.

**Pydantic models (defined inside this file):**

```python
class CartItem(BaseModel):
    item_id: str
    qty: int = 1
    unit_price: float = 0.0

class SelectedItem(BaseModel):
    item_id: str

class OrderSuggestionsRequest(BaseModel):
    restaurant_id: Optional[str] = None  # Derived from auth if absent
    crm_customer_id: Optional[str] = None
    pos_customer_id: Optional[str] = None
    current_cart: Optional[List[CartItem]] = None
    selected_item: Optional[SelectedItem] = None
    order_type: Optional[str] = None

class OrderSuggestionsResponse(BaseModel):  # For documentation; actual return is POSResponse
    pass
```

**Endpoint logic:**

```python
@router.post("/pos/customers/order-suggestions", response_model=POSResponse)
async def order_suggestions(req: OrderSuggestionsRequest, user: dict = Depends(verify_pos_auth)):
    user_id = user["id"]
    
    # 1. Resolve customer
    customer = None
    if req.crm_customer_id:
        customer = await db.customers.find_one({"id": req.crm_customer_id, "user_id": user_id}, {"_id": 0})
    elif req.pos_customer_id:
        customer = await db.customers.find_one({"pos_customer_id": req.pos_customer_id, "user_id": user_id}, {"_id": 0})
    
    if not customer:
        return POSResponse(success=False, message="Customer not found",
                          data={"error": {"code": "CUSTOMER_NOT_FOUND"}})
    
    customer_id = customer["id"]
    cart_item_ids = [c.item_id for c in (req.current_cart or [])]
    selected_item_id = req.selected_item.item_id if req.selected_item else None
    
    # 2. Run computations (sequential — some depend on customer doc)
    summary = await compute_customer_summary(db, user_id, customer_id, customer)
    
    is_first_time = (customer.get("total_visits", 0) or 0) <= 1
    
    value = None if is_first_time else await compute_customer_value(db, user_id, customer_id, customer)
    patterns = await compute_order_patterns(db, user_id, customer_id)
    notes = await compute_customer_notes(db, user_id, customer_id, limit=5)
    item_notes = (await compute_item_notes(db, user_id, customer_id, selected_item_id)) if selected_item_id else []
    cross_sell = await compute_cross_sell(db, user_id, customer_id, cart_item_ids, limit=3)
    
    # 3. Assemble response
    data = {
        "customer_summary": summary,
        "order_patterns": patterns,
        "customer_notes": notes,
        "item_notes": item_notes,
        "cross_sell_items": cross_sell,
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "feature_flags": {"cross_sell": True, "upsell": False, "ai": False}
        }
    }
    if value is not None:
        data["customer_value"] = value
    
    return POSResponse(success=True, message="Order suggestions", data=data)
```

**Error codes:**

| Code | When | HTTP |
|---|---|---|
| `CUSTOMER_NOT_FOUND` | Neither `crm_customer_id` nor `pos_customer_id` resolves | 200 + `success: false` |
| `INVALID_REQUEST` | Both `crm_customer_id` and `pos_customer_id` missing | 200 + `success: false` |
| `422` | Pydantic validation (malformed body) | 422 (automatic) |
| `401` | Auth failure (`verify_pos_auth`) | 401 (automatic) |

---

### 6.4 Edit: `backend/server.py`

**Exact changes (2 lines):**

Line 16 — add `suggestions` to import:
```python
# BEFORE:
from routers import auth, customers, points, wallet, coupons, feedback, whatsapp, pos, migration, analytics, scan, menu

# AFTER:
from routers import auth, customers, points, wallet, coupons, feedback, whatsapp, pos, migration, analytics, scan, menu, suggestions
```

After line 76 (after `api_router.include_router(menu.router)`) — add:
```python
api_router.include_router(suggestions.router)
```

**Impact:** Zero. Only adds a new router to the chain. All existing routes unchanged. Startup behavior unchanged (no new indexes, no new lifespan hooks).

---

### 6.5 Index Recommendations

| Collection | Index | Reason | Priority |
|---|---|---|---|
| `orders` | `{user_id: 1, customer_id: 1}` | Customer's orders lookup (for value scoring, patterns, notes). Currently **no index** — full collection scan on 8250+ docs per R689 query. | **P0 — create at startup** |
| `orders` | `{user_id: 1, created_at: -1}` | Restaurant-wide stats computation (recent orders for benchmarks). | **P1 — create at startup** |
| `order_items` | `{user_id: 1, customer_id: 1}` | Customer's item-level aggregation (patterns, item notes). `customer_id` index exists but not compound with `user_id`. | **P1 — create at startup** |
| `order_items` | `{order_id: 1, user_id: 1}` | Cross-sell co-occurrence query ($lookup). `order_id` index exists but not compound. | **P2 — nice-to-have** |

These indexes are **additive** — they don't affect existing queries. They'll be created in the `lifespan` function in `server.py` (same pattern as existing index creation at L27-35).

---

### 6.6 Data Flow Diagram

```
POS sends POST /api/pos/customers/order-suggestions
  │
  ├─ verify_pos_auth (existing) → user_id
  │
  ├─ Resolve customer (customers collection) → customer_doc
  │
  ├─ compute_customer_summary
  │    └─ customers.find_one + coupons.count_documents
  │
  ├─ compute_customer_value (skip if ≤1 visit)
  │    ├─ _get_restaurant_stats (customers.aggregate + orders.aggregate)
  │    ├─ orders.find (last 6 orders for trend analysis)
  │    └─ Math: 5-factor weighted score + 4-factor churn risk
  │
  ├─ compute_order_patterns
  │    ├─ order_items.aggregate (top items by frequency)
  │    ├─ order_items.aggregate (top categories)
  │    └─ orders.aggregate (avg items, channel mode, time mode)
  │
  ├─ compute_customer_notes
  │    └─ orders.aggregate (distinct notes, sorted by frequency, limit 5)
  │
  ├─ compute_item_notes (only if selected_item provided)
  │    └─ order_items.aggregate (item-specific notes)
  │
  ├─ compute_cross_sell
  │    ├─ orders.find (customer's order_ids)
  │    ├─ order_items.aggregate (customer co-occurrence)
  │    ├─ order_items.aggregate (restaurant-wide co-occurrence for cart items)
  │    └─ Blend + rank + limit 3
  │
  └─ Assemble POSResponse → return to POS
```

**Total Mongo queries per request:** ~8-12 (depending on whether selected_item is provided and cart is non-empty). All are read-only. No writes to any collection.

---

### 6.7 Edge Cases & Error Handling

| Edge case | Behavior |
|---|---|
| Customer not found | `success: false`, `error.code: "CUSTOMER_NOT_FOUND"` |
| First-time customer (≤1 visit) | Omit `customer_value` block. Notes/patterns likely empty. Cross-sell uses restaurant-wide only. |
| Customer with 0 orders (but exists in `customers`) | Same as first-time. |
| Empty cart (no `current_cart` in request) | Cross-sell returns top restaurant-wide suggestions (no cart-exclusion filtering). |
| No `selected_item` in request | `item_notes` returns empty array. |
| No notes exist for customer | `customer_notes` returns empty array. |
| No order_items records (migration gap) | `order_patterns.top_items` returns empty. Fallback to `orders.items[]` embedded array. |
| Division by zero in scoring (e.g. max_spend = 0) | Clamp to 0. All normalization uses `max(denominator, 1)` or `max(denominator, 0.01)`. |
| Customer belongs to different restaurant | Not found (query scoped by `user_id` from auth). |

---

### 6.8 Testing Plan (Post-Implementation)

| # | Test | Method | Expected |
|---|---|---|---|
| T1 | Auth: no key/token | curl | 401 |
| T2 | Auth: valid API key | curl | 200 + customer data |
| T3 | Customer not found | curl with fake ID | `success: false`, `CUSTOMER_NOT_FOUND` |
| T4 | First-time customer (≤1 visit) | curl | No `customer_value` block |
| T5 | R689 customer with history | curl | Full response with all blocks |
| T6 | With `selected_item` | curl | `item_notes` populated |
| T7 | With `current_cart` | curl | Cross-sell excludes cart items |
| T8 | Value scoring sanity | curl + inspect | Score 0-100, band matches thresholds |
| T9 | Churn risk sanity | curl + inspect | Risk band matches model |
| T10 | Performance | curl + time | <500ms end-to-end |
| T11 | Existing endpoints unaffected | curl to `/pos/customer-lookup`, `/pos/customers/{id}`, `/pos/coupons/available` | Identical responses as before |

---

## 7. Strict Boundaries

- **No changes to existing POS endpoints** — verified file-by-file in §6.1
- **No changes to existing collections/schemas** — only additive indexes
- **No real WhatsApp messages** (CR-004 linkage is documentation only)
- **Read-only** against `orders`, `customers`, `order_items`, `points_transactions`, `coupon_usage`, `coupons`
- **New endpoint only writes to response** — no DB mutations
- **R689 pilot only** (scoped by auth — `user_id = pos_0001_restaurant_689`)
- **No frontend changes** — this is a POS-facing API only

---

## 8. Dependencies

| Dependency | Status | Live Data |
|---|---|---|
| `orders` collection | Available | R689: 8,250 orders |
| `customers` collection | Available | R689: 2,035 customers |
| `order_items` collection | Available | Indexed on `customer_id`, `item_name`, `order_id` |
| `coupons` collection | Available | 41 active coupons |
| `coupon_usage` collection | Available | Indexed on `user_id` + `coupon_id` + `customer_id` |
| `verify_pos_auth` (core/auth.py L93) | Live | Dual auth: API Key + JWT |
| `POSResponse` (models/schemas.py L1164) | Live | Standard `{success, message, data}` shape |
| Notes pipelines (pos.py L2714-L2787) | Live | Duplicated as lightweight pipelines (no import coupling) |

---

## 9. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Cross-sell `$lookup` query slow on large order sets | Medium | Latency > 500ms | Limit customer order scan to last 100 orders. Restaurant-wide query capped at `$limit: 10`. |
| Missing `customer_id` on `order_items` (migration gap) | Low | Empty patterns/notes | Fallback to `orders.items[]` embedded array if `order_items` is empty for customer. |
| `orders` collection has no compound index on `{user_id, customer_id}` | **Known** | Full scan on 8250 docs | Create index in lifespan startup (§6.5). |
| New router changes startup order | Negligible | None | Router is stateless — no lifespan hooks, no init logic. |

---

## 10. Phase 2 (Not in v1 — deferred)

| Item | Why deferred |
|---|---|
| Upsell suggestions | Owner decision: skip v1 (Q5=c) |
| AI-generated suggestions (LLM) | Out of scope per M confirmation |
| Owner-configurable value band thresholds | CRM picks defaults for v1 |
| Cross-restaurant suggestions | Phase 1 = same restaurant only (Q9=a) |
| Pre-computed nightly cache | <500ms target achievable with live queries + indexes |
| DRY extraction of notes pipelines into shared helper | Phase 2 cleanup — duplicating 10-15 line pipelines is acceptable for v1 isolation |

---

## 11. Status

```
pos_crm_cross_sell_phase_1_plan_locked
```

Detailed implementation plan complete. All owner decisions locked. File impact matrix documented. Ready for implementation.
