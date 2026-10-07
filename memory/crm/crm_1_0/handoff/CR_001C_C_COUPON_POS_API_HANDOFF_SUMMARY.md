# CR-001C-C — Coupon POS API Handoff Summary (V1 + V2 + V3-A + V3-B + V3-C)

**Status:** `cr001c_coupon_pos_api_handoff_summary_ready_after_v3c_preview_qa`
**Date:** 2026-05-25
**Audience:** POS / Frontend integration team
**Backend QA:** 211/211 PASS (V1 45 + V2 45 + V3-A 31 + V3-B 49 + V3-C 41)

---

## Table of Contents

1. [Backend Completion Status](#1-backend-completion-status)
2. [Authentication](#2-authentication)
3. [POS Coupon Endpoints Overview](#3-pos-coupon-endpoints-overview)
4. [Coupon Type Support Matrix](#4-coupon-type-support-matrix)
5. [GET /api/pos/coupons/available](#5-get-apiposcouponsavailable)
6. [POST /api/pos/coupons/validate](#6-post-apiposcouponsvalidate)
7. [POST /api/pos/orders — Coupon Final Commit](#7-post-apiposorders--coupon-final-commit)
8. [POSCartItem / items[] Contract](#8-poscartitem--items-contract)
9. [Time-Window / Happy-Hour (V3-A)](#9-time-window--happy-hour-v3-a)
10. [BOGO / Buy-X-Get-Y (V3-B)](#10-bogo--buy-x-get-y-v3-b)
11. [Every-Nth Item (V3-C)](#11-every-nth-item-v3-c)
12. [Structured Error Codes](#12-structured-error-codes)
13. [Deprecated Endpoints](#13-deprecated-endpoints)
14. [Business Rules Summary](#14-business-rules-summary)
15. [POS Implementation Checklist](#15-pos-implementation-checklist)
16. [Open Items and Limitations](#16-open-items-and-limitations)
17. [Final Status](#17-final-status)

---

## 1. Backend Completion Status

| Phase | Description | Status | QA |
|---|---|---|---|
| V1 | Flat / Percentage order coupons | `cr001c_coupon_v1_implementation_qa_passed_in_preview` | 45/45 |
| V2 | Item / Category coupons | `cr001c_coupon_v2_item_category_implementation_qa_passed_in_preview` | 45/45 |
| V3-A | Time-window / Happy-hour | `cr001c_coupon_v3a_time_window_implementation_qa_passed_in_preview` | 31/31 |
| V3-B | BOGO / Buy-X-Get-Y | `cr001c_coupon_v3b_bogo_bxgy_implementation_qa_passed_in_preview` | 49/49 |
| V3-C | Every-Nth item | `cr001c_coupon_v3c_every_nth_implementation_qa_passed_in_preview` | 41/41 |
| **Combined** | | | **211/211** |

All backend work is implemented in preview. POS integration is **not yet started** — this document is the handoff for that work.

---

## 2. Authentication

All POS coupon endpoints use `verify_pos_auth` — dual auth accepting **either**:

| Method | Header | Example |
|---|---|---|
| **API Key** (primary for POS) | `X-API-Key: <key>` | `X-API-Key: ak_abc123...` |
| **JWT Bearer** (fallback) | `Authorization: Bearer <token>` | `Authorization: Bearer eyJ...` |

Both resolve to the restaurant owner's `user` document. The `user["id"]` scopes all coupon queries.

**Obtaining the API key:**  
`GET /api/pos/api-key` (requires JWT auth) returns the restaurant's API key.  
`POST /api/pos/api-key/regenerate` (requires JWT auth) regenerates it.

---

## 3. POS Coupon Endpoints Overview

| # | Method | Path | Purpose | Auth |
|---|---|---|---|---|
| 1 | `GET` | `/api/pos/coupons/available` | List coupons eligible for a customer + order total. Read-only discovery. | `verify_pos_auth` |
| 2 | `POST` | `/api/pos/coupons/validate` | Validate/compute discount for a specific coupon + cart. Read-only — **does NOT commit usage**. | `verify_pos_auth` |
| 3 | `POST` | `/api/pos/orders` | Final order submission. **Commits coupon usage** as a side-effect when `coupon_code` + `coupon_discount > 0` are present. | `verify_pos_auth` |
| ~~4~~ | ~~`POST`~~ | ~~`/api/pos/coupons/apply`~~ | **DEPRECATED.** Legacy endpoint. Do not use. See [§13](#13-deprecated-endpoints). | `verify_pos_auth` |

**Recommended POS flow:**

```
1. GET  /api/pos/coupons/available   → show eligible coupons to cashier
2. POST /api/pos/coupons/validate    → compute discount on cashier selection (with cart items for V2/V3)
3. POST /api/pos/orders              → final order with coupon_code + coupon_discount → CRM commits coupon_usage
```

---

## 4. Coupon Type Support Matrix

| offer_type | discount_scope | Cart items required? | `requires_cart_validation` | Example |
|---|---|---|---|---|
| `simple` | `order` | No | `false` | "20% off entire order" |
| `simple` | `item` | **Yes** | `true` | "₹50 off each eligible pizza" |
| `simple` | `category` | **Yes** | `true` | "10% off all beverages" |
| `bogo` | (V3-B) | **Yes** | `true` | "Buy 1 pizza, get 1 free" |
| `bxg` | (V3-B) | **Yes** | `true` | "Buy 2 pizzas, get 1 garlic bread free" |
| `nth_item` | (V3-C) | **Yes** | `true` | "Every 5th coffee free" |

**Key rule:** When `/available` returns `requires_cart_validation: true`, POS **must** send `items[]` in the `/validate` call. Without items, the validate call returns a `MISSING_ITEMS_FOR_*` error.

---

## 5. GET /api/pos/coupons/available

**Purpose:** Discovery endpoint. Returns all coupons eligible for the given customer/order context. Read-only — no side effects.

### Request

```
GET /api/pos/coupons/available?customer_id={id}&order_total={amount}&channel={channel}
```

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `customer_id` | string | Yes | — | CRM customer ID |
| `order_total` | float | Yes | — | Cart total before coupon |
| `channel` | string | No | `"pos"` | `pos`, `dine_in`, `takeaway`, `delivery` |

### Success Response

```json
{
  "success": true,
  "message": "Available coupons",
  "data": {
    "customer_id": "cust_abc",
    "order_total": 500.0,
    "channel": "pos",
    "count": 2,
    "coupons": [
      {
        "id": "coupon-uuid",
        "code": "SUMMER20",
        "title": "Summer 20% off",
        "coupon_type": "order",
        "discount_scope": "order",
        "discount_type": "percentage",
        "discount_value": 20.0,
        "min_order_value": 100.0,
        "max_discount": 200.0,
        "expected_discount": 100.0,
        "final_amount_preview": 400.0,
        "requires_cart_validation": false,
        "eligible_match_hint": null,
        "stackable_with_loyalty": false,
        "valid_from": "2026-01-01T00:00:00+00:00",
        "valid_until": "2099-01-01T00:00:00+00:00",
        "offer_type": "simple",
        "time_window": {
          "configured": false,
          "within_window_now": true,
          "valid_days": null,
          "start_time": null,
          "end_time": null,
          "tz": null,
          "tz_fallback": null,
          "next_window_start": null
        },
        "buy_quantity": null,
        "get_quantity": null,
        "get_discount_type": null,
        "get_discount_value": null,
        "max_applications": null,
        "allow_repeat": null,
        "same_item_required": null,
        "pos_instruction": null,
        "nth_item_number": null,
        "nth_discount_type": null,
        "nth_discount_value": null
      }
    ]
  }
}
```

### Key Fields for POS UI

| Field | POS Action |
|---|---|
| `requires_cart_validation` | If `true`, POS **must** send `items[]` to `/validate`. If `false`, can validate with just `order_total`. |
| `expected_discount` | Preview discount (null for cart-dependent coupons). Display to cashier for simple order coupons. |
| `final_amount_preview` | Estimated post-discount total (null for cart-dependent coupons). |
| `eligible_match_hint` | Describes what items/categories the coupon targets. Use for UI hints. See [§5.1](#51-eligible_match_hint-shapes). |
| `time_window` | Happy-hour info. If `within_window_now: false`, grey out the coupon and show `next_window_start`. |
| `offer_type` | `simple` / `bogo` / `bxg` / `nth_item` — determines coupon behaviour. |
| `pos_instruction` | Optional hint text from the coupon creator (e.g. "Add more coffee to qualify"). Display when present. |
| `stackable_with_loyalty` | If `false`, POS should not allow this coupon when loyalty points are being redeemed on the same order. |

### 5.1 eligible_match_hint Shapes

**V1 order-scope:** `null`

**V2 item-scope:**
```json
{"type": "food_ids", "values": ["182039", "182040"]}
```

**V2 category-scope:**
```json
{"type": "category_names", "values": ["beverages", "desserts"]}
```

**V3-B BOGO/BXG:**
```json
{
  "kind": "bogo",
  "buy_quantity": 1,
  "get_quantity": 1,
  "buy": {"type": "food_ids", "values": ["P_001"]},
  "get": {"type": "food_ids", "values": ["P_001"]},
  "same_item_required": true,
  "get_discount_type": "free",
  "get_discount_value": null
}
```

**V3-C Every-Nth:**
```json
{
  "kind": "nth_item",
  "nth_item_number": 5,
  "eligibility": {"type": "food_ids", "values": ["182039"]},
  "nth_discount_type": "free",
  "nth_discount_value": null
}
```

---

## 6. POST /api/pos/coupons/validate

**Purpose:** Validate a coupon and compute the discount. Read-only — **does NOT commit usage**. POS should call this when cashier selects a coupon.

### Request Body (JSON)

```json
{
  "code": "SUMMER20",
  "customer_id": "cust_abc",
  "order_total": 500.0,
  "channel": "pos",
  "loyalty_points_used": 0.0,
  "items": [
    {
      "food_id": "182039",
      "item_id": "182039",
      "name": "Coffee",
      "quantity": 5,
      "unit_price": 100.0,
      "line_total": 500.0,
      "category_name": "beverages"
    }
  ],
  "order_time": "2026-05-25T16:30:00+05:30"
}
```

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `code` | string | Yes | — | Coupon code (case-insensitive) |
| `customer_id` | string | Yes | — | CRM customer ID |
| `order_total` | float | Yes | — | Cart total before coupon |
| `channel` | string | No | `"pos"` | `pos` / `dine_in` / `takeaway` / `delivery` |
| `loyalty_points_used` | float | No | `0.0` | If > 0 and coupon has `stackable_with_loyalty=false`, returns `STACKING_NOT_ALLOWED` |
| `items` | array | **Conditional** | `null` | **Required** when coupon has `requires_cart_validation=true`. See [§8](#8-poscartitem--items-contract). |
| `order_time` | string | No | `null` | POS-supplied timestamp (informational only — **server clock decides** time-window membership). Echoed back. |

### Success Response

```json
{
  "success": true,
  "message": "Coupon valid",
  "data": {
    "valid": true,
    "code": "NTH5FREE",
    "coupon_id": "uuid-...",
    "title": "Every 5th Coffee Free",
    "coupon_type": "item",
    "discount_scope": "item",
    "discount_type": "flat",
    "discount_value": 0.0,
    "computed_discount": 100.0,
    "eligible_subtotal": 100.0,
    "final_amount_preview": 400.0,
    "requires_cart_validation": false,
    "matched_food_ids": [],
    "matched_item_ids": [],
    "matched_category_ids": [],
    "matched_category_names": [],
    "stackable_with_loyalty": false,
    "offer_type": "nth_item",
    "time_window_status": null,
    "applied_applications": 1,
    "benefit_items": [
      {"food_id": "182039", "item_id": "182039", "name": "Coffee", "quantity": 1, "unit_price": 100.0, "line_discount": 100.0}
    ],
    "buy_match_summary": [],
    "get_match_summary": [],
    "same_item_required": null,
    "get_discount_type": null,
    "max_applications": null,
    "allow_repeat": true,
    "nth_item_number": 5,
    "nth_discount_type": "free",
    "nth_discount_value": null,
    "eligible_match_summary": [
      {"food_id": "182039", "name": "Coffee", "matched_quantity": 5}
    ]
  }
}
```

### Failure Response

```json
{
  "success": false,
  "message": "Coupon not valid at current local time ...",
  "data": {
    "valid": false,
    "error": {
      "code": "OUTSIDE_TIME_WINDOW",
      "field": "time_window",
      "detail": "Coupon not valid at current local time 2026-05-25T10:30:00+05:30 (Asia/Kolkata)"
    },
    "time_window_status": { ... },
    "pos_instruction": "This coupon is valid Mon-Fri 3PM-6PM"
  }
}
```

### Key Fields POS Must Use

| Field | POS Action |
|---|---|
| `computed_discount` | The CRM-computed discount amount. POS should apply this to the bill. |
| `final_amount_preview` | `order_total - computed_discount`. Display to cashier. |
| `benefit_items` | (V3-B/V3-C) List of items that received benefit. Show to cashier for transparency. |
| `applied_applications` | (V3-B/V3-C) How many times the offer was applied (e.g. 2 for "every 5th" with qty 10). |
| `pos_instruction` | **Only returned on failure.** Display to cashier (e.g. "Add 1 more coffee to qualify"). |

---

## 7. POST /api/pos/orders — Coupon Final Commit

Coupon usage is **only committed** when POS sends the final order. This is not a coupon-specific endpoint — it's the main order webhook. Coupon recording is a **side-effect**.

### Coupon-Related Fields in POSOrderWebhook Body

| Field | Type | Required for Coupon | Aliases Accepted | Notes |
|---|---|---|---|---|
| `coupon_code` | string | Yes | `couponCode`, `coupon` | The coupon code applied |
| `coupon_discount` | float | Yes (must be > 0) | `couponDiscount`, `coupon_amount`, `coupon_discount_amount` | POS-computed discount amount. **Source of truth for billing.** |
| `coupon_title` | string | No | `couponTitle`, `coupon_name` | Display name (informational) |
| `coupon_type` | string | No | `couponType` | Informational (`"order"`, `"item"`, `"category"`) |
| `items` | array[OrderItem] | **Strongly recommended** | — | Required for CRM to revalidate V2/V3 coupons. See [§7.1](#71-orderitem-in-posorderwebhook). |

### Trigger Conditions

CRM records coupon usage **only when both** conditions are met:
1. `coupon_code` is present (non-empty)
2. `coupon_discount > 0`

If `coupon_code` is present but `coupon_discount == 0`, CRM logs a warning and **skips** recording.
If `coupon_discount > 0` but `coupon_code` is missing, CRM logs a warning and **skips** recording.

### CRM Behavior on Final Order

1. CRM **revalidates** the coupon against the final cart (all pre-checks: active, expired, usage limits, stacking, time-window, cart eligibility).
2. **If validation succeeds:** `coupon_usage` row inserted, `coupons.total_used` incremented.
3. **If validation fails:** Order **still persists** (HTTP 200). `coupon_usage` is **NOT** recorded. `coupons.total_used` is **NOT** incremented. A structured warning is logged server-side.
4. **Variance tracking:** CRM computes its own discount. If POS-sent differs from CRM-computed by more than `max(₹1, 1% * CRM-computed)`, `discount_mismatch: true` is flagged on the usage row.

### Coupon Block in Order Response

```json
{
  "success": true,
  "data": {
    "order_id": "crm-uuid",
    "coupon_applied": "NTH5FREE",
    "coupon_discount": 100.0,
    "coupon_usage": {
      "recorded": true,
      "usage_id": "uuid-...",
      "coupon_code": "NTH5FREE",
      "coupon_discount": 100.0,
      "crm_computed_discount": 100.0,
      "discount_scope": "item",
      "eligible_subtotal": 100.0,
      "idempotent_replay": false,
      "offer_type": "nth_item",
      "time_window_status": null,
      "applied_applications": 1,
      "benefit_items": [...],
      "buy_match_summary": [],
      "get_match_summary": [],
      "same_item_required": null,
      "get_discount_type": null,
      "discount_mismatch": false,
      "nth_item_number": 5,
      "nth_discount_type": "free",
      "nth_discount_value": null,
      "eligible_match_summary": [...]
    }
  }
}
```

**On validation failure:**

```json
"coupon_usage": {
  "recorded": false,
  "coupon_code": "NTH5FREE",
  "error": {
    "code": "NTH_REQUIREMENT_NOT_MET",
    "field": "nth_item_number",
    "detail": "Add 1 more eligible item(s) to qualify."
  },
  "pos_instruction": "Add more coffee to qualify for every 5th free."
}
```

### 7.1 OrderItem in POSOrderWebhook

The `items[]` field in `POST /api/pos/orders` uses the `OrderItem` schema (different from `POSCartItem` in `/validate`). CRM internally converts `OrderItem` fields to the coupon engine's expected format:

| OrderItem Field | Maps to Coupon Engine | Aliases |
|---|---|---|
| `pos_food_id` | `food_id` + `item_id` | `item_id` |
| `item_category` | `item_category` | — |
| `item_name` | `name` | — |
| `item_qty` | `quantity` | `qty` |
| `item_price` | `unit_price` | `price` |

**POS should always send `items[]`** in the final order for accurate coupon revalidation, especially for V2/V3 coupons.

### Idempotency

- Keyed on `(user_id, order_id)`.
- If POS retries the same `order_id`, the existing `coupon_usage` row is returned with `idempotent_replay: true`.
- `coupons.total_used` is NOT incremented on replay.
- **One coupon per order.** The system does not support multiple coupons on the same order.

---

## 8. POSCartItem / items[] Contract

When calling `POST /api/pos/coupons/validate`, POS sends `items[]` using the `POSCartItem` schema.

### POSCartItem Fields

| Field | Type | Required | Aliases Accepted | Notes |
|---|---|---|---|---|
| `food_id` | string | Recommended | `foodId`, `pos_food_id` | Primary item identifier for coupon matching |
| `item_id` | string | Optional | `itemId` | Secondary identifier (fallback) |
| `category_id` | string | Optional | `categoryId` | Category ID for category-scope matching |
| `category_name` | string | Optional | `categoryName` | Category name for category-scope matching |
| `item_category` | string | Optional | `itemCategory` | Fallback category field |
| `name` | string | Optional | — | Item display name |
| `quantity` | int | Yes | `qty`, `item_qty` | Default: 1 |
| `unit_price` | float | Recommended | `price`, `item_price` | Per-unit price. If missing, CRM falls back to `line_total / quantity`. |
| `line_total` | float | Optional | `lineTotal` | Total line amount. Used as fallback when `unit_price` is missing. |

### Item Matching Priority

CRM matches cart items to coupon eligibility lists in this order:

1. `food_id` (highest priority)
2. `item_id` (fallback)
3. `category_id` → `category_name` → `item_category` (for category-scope coupons)

**POS must send at least `food_id` (or `item_id`) and `quantity` for item-level coupons.**  
**POS must send `category_name` (or `category_id` or `item_category`) for category-level coupons.**

### Lines Ignored by Coupon Engine

- Lines with `unit_price < 0` (e.g. discounts) are silently dropped.
- Non-dict items are skipped.

---

## 9. Time-Window / Happy-Hour (V3-A)

### How It Works

- Coupons can have `valid_days` (ISO weekdays 0=Mon..6=Sun), `start_time`/`end_time` (HH:MM 24h), and `timezone` (IANA).
- **Server clock is authoritative.** POS-supplied `order_time` is echoed but NOT used for the check.
- If the coupon has a time window and the current server time is outside it, `OUTSIDE_TIME_WINDOW` is returned.
- Time-window pre-check runs **before** V3-B/V3-C computation, so a BOGO or Every-Nth coupon with a happy-hour window returns the time-window error first.

### POS Behavior

1. **`/available`:** Outside-window coupons are still returned with `time_window.within_window_now: false` and `time_window.next_window_start`. POS should grey them out and show "Available from {next_window_start}".
2. **`/validate`:** Returns `OUTSIDE_TIME_WINDOW` error with `time_window_status` block. POS should show the error and `pos_instruction` if present.
3. **Overnight windows** are supported (e.g. `start_time: "22:00"`, `end_time: "02:00"`).
4. **Timezone resolution chain:** coupon.timezone → restaurant settings → `Asia/Kolkata` → UTC.

---

## 10. BOGO / Buy-X-Get-Y (V3-B)

### How It Works

- `offer_type: "bogo"` — Buy 1, get 1 (same item).
- `offer_type: "bxg"` (or `"buy_x_get_y"`) — Buy X of item A, get Y of item B (or same item).
- **Get item must already be in cart.** CRM does NOT auto-add items. POS must NOT auto-add items.
- Applications = `floor(get_eligible_qty / get_quantity)`, capped by `floor(buy_eligible_qty / buy_quantity)`.
- Capped by `max_applications` and `allow_repeat` (if `false`, max 1 application).
- Benefit on get items: `free` / `percentage` / `flat`.
- Default: cheapest eligible get unit receives benefit. `apply_to_highest_item: true` overrides.

### POS Behavior

1. POS **must** send `items[]` with all cart items (both buy and get items) to `/validate`.
2. Response includes `benefit_items` — show to cashier which items got discounted.
3. Response includes `buy_match_summary` and `get_match_summary` — audit trail of what matched.
4. On failure (e.g. `BUY_REQUIREMENT_NOT_MET`), `pos_instruction` tells cashier what to add.

### Example (BOGO same-item)

Coupon: Buy 1 Coffee, Get 1 Free.  
Cart: 2x Coffee @ ₹100.  
Result: `computed_discount: 100.0`, `applied_applications: 1`, `benefit_items: [{food_id: "C_001", name: "Coffee", quantity: 1, unit_price: 100.0, line_discount: 100.0}]`.

---

## 11. Every-Nth Item (V3-C)

### How It Works

- `offer_type: "nth_item"` (aliases: `"every_nth"`, `"every_nth_item"`)
- Math: `applications = floor(eligible_total_qty / nth_item_number)`
  - qty 4 with N=5 → 0 applications (error: `NTH_REQUIREMENT_NOT_MET`)
  - qty 5 with N=5 → 1 application
  - qty 9 with N=5 → 1 application
  - qty 10 with N=5 → 2 applications
- **Quantity-based, NOT cart-sequence-based.** POS line order does not matter.
- Benefit types: `free` / `percentage` / `flat`.
- Supports both item-level (e.g. food_id match) and category-level (e.g. "all beverages").
- Capped by `max_applications` and `allow_repeat`.
- Default: cheapest eligible unit receives benefit.

### POS Behavior

1. POS **must** send `items[]` with all eligible items.
2. Response includes `benefit_items` and `eligible_match_summary`.
3. `nth_item_number`, `nth_discount_type`, `nth_discount_value` describe the offer.
4. On failure, `pos_instruction` tells cashier what to add.

### Example (Every 5th Coffee Free)

Cart: 5x Coffee @ ₹100.  
Result: `computed_discount: 100.0`, `applied_applications: 1`, `nth_item_number: 5`, `nth_discount_type: "free"`, `benefit_items: [{food_id: "182039", name: "Coffee", quantity: 1, unit_price: 100.0, line_discount: 100.0}]`.

---

## 12. Structured Error Codes

POS must handle errors by `error.code`, NOT by string-matching `message`.

### Error Response Shape

```json
{
  "success": false,
  "message": "human-readable summary",
  "data": {
    "valid": false,
    "error": {
      "code": "ERROR_CODE_HERE",
      "field": "field_name",
      "detail": "human-readable detail"
    },
    "time_window_status": { ... },
    "pos_instruction": "optional hint for cashier"
  }
}
```

### Complete Error Code Table (27 codes)

#### V1 — General Coupon Errors (9)

| Code | When | POS Action |
|---|---|---|
| `INVALID_CODE` | Coupon code not found | Show "Invalid coupon code" |
| `EXPIRED` | Coupon past `end_date` | Show "Coupon expired" |
| `INACTIVE` | Coupon disabled by admin | Show "Coupon not active" |
| `MIN_ORDER_NOT_MET` | `order_total < min_order_value` | Show minimum order requirement |
| `USAGE_LIMIT_REACHED` | Global usage cap hit | Show "Coupon fully redeemed" |
| `CUSTOMER_USAGE_LIMIT_REACHED` | Per-customer cap hit | Show "You've used this coupon the maximum number of times" |
| `CUSTOMER_NOT_ELIGIBLE` | Customer not in `specific_users` list | Show "Coupon not available for this customer" |
| `CHANNEL_NOT_VALID` | Current channel not in `applicable_channels` | Show "Coupon not valid for this order type" |
| `STACKING_NOT_ALLOWED` | Loyalty points used + `stackable_with_loyalty=false` | Show "Cannot combine coupon with loyalty points" |

#### V2 — Item/Category Errors (5)

| Code | When | POS Action |
|---|---|---|
| `MISSING_ITEMS_FOR_ITEM_COUPON` | Item-scope coupon, no `items[]` sent | Send items[] and retry |
| `MISSING_ITEMS_FOR_CATEGORY_COUPON` | Category-scope coupon, no `items[]` sent | Send items[] and retry |
| `NO_ELIGIBLE_ITEMS_IN_CART` | No cart line matches item eligibility | Show "No eligible items in cart" |
| `NO_ELIGIBLE_CATEGORY_IN_CART` | No cart line matches category eligibility | Show "No eligible items in cart" |
| `MIN_ITEM_QTY_NOT_MET` | Per-item min quantity not reached | Show quantity requirement |

#### V3-A — Time-Window Error (1)

| Code | When | POS Action |
|---|---|---|
| `OUTSIDE_TIME_WINDOW` | Current time outside coupon's valid window | Show time window info; grey out coupon |

#### V3-B — BOGO/BXG Errors (7)

| Code | When | POS Action |
|---|---|---|
| `MISSING_ITEMS_FOR_BXGY_COUPON` | BOGO/BXG coupon, no `items[]` sent | Send items[] and retry |
| `BUY_REQUIREMENT_NOT_MET` | Not enough buy items in cart | Show `pos_instruction` (e.g. "Add 1 more pizza") |
| `GET_REQUIREMENT_NOT_MET` | Not enough get items in cart | Show `pos_instruction` |
| `NO_ELIGIBLE_BUY_ITEMS_IN_CART` | No buy-eligible lines found | Show "No eligible buy items in cart" |
| `NO_ELIGIBLE_GET_ITEMS_IN_CART` | No get-eligible lines found. **POS must NOT auto-add.** | Show "Required item not in cart" |
| `BXGY_CONFIG_INVALID` | Coupon misconfigured (admin error) | Show "Coupon configuration error" |
| `UNSUPPORTED_BENEFIT_TYPE` | Unknown benefit type | Show "Coupon configuration error" |

#### V3-C — Every-Nth Errors (5)

| Code | When | POS Action |
|---|---|---|
| `MISSING_ITEMS_FOR_EVERY_NTH_COUPON` | Every-Nth coupon, no `items[]` sent | Send items[] and retry |
| `NTH_REQUIREMENT_NOT_MET` | Eligible qty < `nth_item_number` | Show `pos_instruction` (e.g. "Add 1 more coffee") |
| `NO_ELIGIBLE_NTH_ITEMS_IN_CART` | No eligible lines found | Show "No eligible items in cart" |
| `EVERY_NTH_CONFIG_INVALID` | Coupon misconfigured (admin error) | Show "Coupon configuration error" |
| `UNSUPPORTED_NTH_BENEFIT_TYPE` | Unknown benefit type | Show "Coupon configuration error" |

---

## 13. Deprecated Endpoints

### POST /api/pos/coupons/apply — DEPRECATED

This endpoint is **marked `deprecated=True`** in the backend. It still exists for backward compatibility with pre-V1 POS builds.

**POS should NOT use this endpoint.** Instead:
1. Use `POST /api/pos/coupons/validate` to compute the discount.
2. Apply the discount locally on the POS bill.
3. Send the final discount in `POST /api/pos/orders` as `coupon_code` + `coupon_discount`.

**Why deprecated:**
- The old `/apply` endpoint commits usage immediately, bypassing the final-order flow.
- It generates synthetic `order_id`s that don't match real POS orders.
- It doesn't support V2/V3 cart-aware coupons.
- It sends `coupon_discount_from_pos=0.0`, requiring a fallback recomputation.

---

## 14. Business Rules Summary

| Rule | Detail |
|---|---|
| **Usage committed only at final order** | `/validate` is read-only. `coupon_usage` is only written when `POST /api/pos/orders` is processed with `coupon_code` + `coupon_discount > 0`. |
| **Validate/apply click does NOT commit** | POS can call `/validate` any number of times without side effects. |
| **CRM revalidates at final order** | Even if `/validate` succeeded, CRM re-checks everything at final commit (coupon could have expired, usage limit could have been hit by another order). |
| **Failed validation does NOT block order** | Order always persists (HTTP 200). Failed coupon validation is logged; `coupon_usage.recorded = false`. |
| **Idempotency on (user_id, order_id)** | Same order retried → same coupon_usage row returned, `idempotent_replay: true`. |
| **One coupon per order** | The system does not support stacking multiple coupons on one order. |
| **POS-sent discount is source of truth for billing** | CRM records the POS-sent `coupon_discount` as the actual discount. CRM's own recomputation is tracked separately as `crm_computed_discount` for variance monitoring. |
| **POS must NOT auto-add items** | For BOGO/BXG, the get item must already be in the customer's cart. CRM will NOT instruct POS to add items. |
| **Every-Nth is mathematical** | `floor(eligible_qty / N)` — POS line order/sequence does NOT affect computation. |
| **Server clock is authoritative for time-window** | POS-supplied `order_time` is echoed but NOT used for the window check. |
| **Time-window composes with V3-B/V3-C** | A BOGO with a happy-hour window returns `OUTSIDE_TIME_WINDOW` first if outside the window. |
| **POS should show `pos_instruction`** | Returned only on failure responses (not on success). Display as cashier hint. |
| **Handle errors by `error.code`** | Do NOT string-match `message`. Use the structured `error.code` field. |

---

## 15. POS Implementation Checklist

### Phase 1 — Basic Integration

- [ ] **Auth:** Set up `X-API-Key` header for all POS coupon calls.
- [ ] **Available:** Call `GET /api/pos/coupons/available` to list coupons in the POS coupon selection UI.
- [ ] **Validate:** Call `POST /api/pos/coupons/validate` when cashier selects a coupon.
- [ ] **Apply discount:** Use `computed_discount` from validate response to apply on the POS bill.
- [ ] **Final order:** Send `coupon_code` + `coupon_discount` in `POST /api/pos/orders`.
- [ ] **Error handling:** Parse `error.code` from failed responses and show appropriate messages.
- [ ] **Deprecation:** Stop using `POST /api/pos/coupons/apply` if currently in use.

### Phase 2 — Cart-Aware Coupons (V2/V3)

- [ ] **Send items[]:** When coupon has `requires_cart_validation: true`, include `items[]` in the `/validate` request body.
- [ ] **POSCartItem:** Send at minimum `food_id`, `quantity`, `unit_price` per line. Add `category_name` for category-scope coupons.
- [ ] **Display benefit_items:** For BOGO/BXG/Every-Nth, show which items got discounted.
- [ ] **Display pos_instruction:** On failure, show the instruction to the cashier.

### Phase 3 — Time-Window UX

- [ ] **Grey out outside-window coupons:** Use `time_window.within_window_now: false` from `/available`.
- [ ] **Show next_window_start:** Display "Available from {time}" for greyed-out coupons.
- [ ] **Handle OUTSIDE_TIME_WINDOW error:** If cashier force-selects, show clear error.

### Phase 4 — Final Order Items

- [ ] **Send items[] in /api/pos/orders:** Ensure `items[]` (OrderItem format) is always sent so CRM can revalidate V2/V3 coupons at final commit.
- [ ] **Check coupon_usage.recorded:** In the order response, verify `coupon_usage.recorded == true`. If `false`, the coupon was not committed (show warning to cashier if needed).
- [ ] **Handle discount_mismatch:** Optionally track `coupon_usage.discount_mismatch` for audit.

### Phase 5 — Loyalty Stacking

- [ ] **Check stackable_with_loyalty:** If `false`, prevent cashier from selecting this coupon when loyalty points are being redeemed, or pass `loyalty_points_used` to `/validate` and handle `STACKING_NOT_ALLOWED`.

---

## 16. Open Items and Limitations

| Item | Status | Notes |
|---|---|---|
| **POS integration** | Not started | This handoff document is the starting point |
| **Admin UI for V3-B/V3-C** | Not implemented | `CouponsPage.jsx` only exposes V1 fields. Admin must use direct DB/API to create BOGO/BXG/Every-Nth coupons until UI is built. |
| **Live restaurant validation** | Pending | Backend is QA'd with synthetic fixtures. Real restaurant testing requires POS integration. |
| **Variant/add-on matching** | Not supported | Coupon engine matches by `food_id`/`item_id`/`category`; variants and add-ons are not considered for eligibility. |
| **Multi-coupon per order** | Not supported | One coupon per order is locked. |
| **POS auto-add** | Not supported; will NOT be implemented | Get items for BOGO/BXG must already be in cart. |
| **Coupon reversal/refund** | Not implemented | No undo mechanism for committed coupon usage. |
| **`order_time` authority** | Server clock only | POS `order_time` is informational. If POS clock and server clock diverge on time-window boundary, server wins. |
| **`excluded_item_ids` / `excluded_category_ids`** | Backend only | No admin UI to configure exclusions yet. Must be set via API/DB. |
| **Per-line discount allocation** | Not supported | CRM returns total discount only. POS is responsible for deciding how to display per-line discounts on the bill. |

---

## 17. Final Status

`cr001c_coupon_pos_api_handoff_summary_ready_after_v3c_preview_qa`

Backend: 211/211 PASS across V1 + V2 + V3-A + V3-B + V3-C.  
POS integration: Ready for implementation using this handoff.  
Next step: POS team implements Phases 1-5 from the checklist above.
