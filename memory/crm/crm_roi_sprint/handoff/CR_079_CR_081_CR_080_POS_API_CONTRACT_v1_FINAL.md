# POS ↔ CRM: API Contract — CR-079 + CR-081 + CR-080
## Customer Edit · Coupon Management · Loyalty & Wallet Management

**Version**: 1.0 FINAL
**Date**: 2026-08-06
**From**: CRM Team
**To**: POS Team (Frontend + Backend)
**Status**: ✅ LIVE — CRM implemented + QA passed (26/26). POS may integrate.
**Auth**: Same `X-API-Key` as all existing `/api/pos/*` endpoints. Zero new keys needed.
**CRM Base URL**: `https://crm.mygenie.online`
**Preview URL**: `https://vendor-crm-preview-1.preview.emergentagent.com`

---

## Summary of Changes

| # | CR | Endpoint | Type | Breaking? |
|---|---|---|---|---|
| 1 | CR-079 | `PUT /api/pos/customers/{id}` | Existing — schema + response fix | ❌ Backward compatible |
| 2 | CR-081 | `GET /api/pos/coupons` | **NEW** | N/A |
| 3 | CR-081 | `GET /api/pos/coupons/{id}` | **NEW** | N/A |
| 4 | CR-081 | `POST /api/pos/coupons` | **NEW** | N/A |
| 5 | CR-081 | `PUT /api/pos/coupons/{id}` | **NEW** | N/A |
| 6 | CR-081 | `POST /api/pos/coupons/{id}/toggle` | **NEW** | N/A |
| 7 | CR-081 | `DELETE /api/pos/coupons/{id}` | **NEW** | N/A |
| 8 | CR-081 | `GET /api/pos/coupons/{id}/usage` | **NEW** | N/A |
| 9 | CR-081 | `POST /api/pos/coupons/{id}/distribute` | **NEW** | N/A |
| 10 | CR-080 | `GET /api/pos/loyalty/settings` | **NEW** | N/A |
| 11 | CR-080 | `GET /api/pos/customers/{id}/points-history` | **NEW** | N/A |
| 12 | CR-080 | `POST /api/pos/customers/{id}/points/award` | **NEW** | N/A |
| 13 | CR-080 | `GET /api/pos/customers/{id}/wallet-history` | **NEW** | N/A |
| 14 | CR-080 | `POST /api/pos/customers/{id}/wallet/credit` | **NEW** | N/A |

**Backward compatibility**: All changes are additive. Existing POS payloads work unchanged.

---

## Authentication

All endpoints use `X-API-Key` — the same key used for all existing POS endpoints (`POST /api/pos/orders`, `POST /api/pos/max-redeemable`, etc.).

```
X-API-Key: <restaurant_api_key>
```

Missing or invalid key → `HTTP 401`

To retrieve your API key: **CRM → Settings → POS Integration → API Key**.

---

## String Constants

| Constant | Values |
|---|---|
| `discount_type` | `"flat"` · `"percentage"` |
| `offer_type` | `"simple"` · `"bogo"` · `"bxg"` · `"nth_item"` · `"free_item"` · `"combo"` |
| `discount_scope` | `"order"` · `"item"` · `"category"` |
| `transaction_type` (points) | `"earn"` · `"redeem"` · `"bonus"` |
| `transaction_type` (wallet) | `"credit"` · `"debit"` |

---

# PART 1 — CR-079: Customer Edit (Schema Fix)

## What changed

`PUT /api/pos/customers/{customer_id}` — two improvements:

1. **`pos_id` and `restaurant_id` are now optional** in the request body. POS previously had to send these on every edit. Now only `phone` is required.
2. **Response now returns the full customer object** instead of the previous 4-field stub `{customer_id, name, phone, updated_at}`.

## 1.1 Request

```
PUT /api/pos/customers/{customer_id}
X-API-Key: <api_key>
Content-Type: application/json
```

**Request body — all fields optional except `phone`:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `phone` | string | **Required** | Dedup key — uniqueness validated |
| `pos_id` | string | Optional | Was required before; now optional |
| `restaurant_id` | string | Optional | Was required before; now optional |
| `name` | string | Optional | |
| `email` | string | Optional | |
| `dob` | string | Optional | `YYYY-MM-DD` |
| `anniversary` | string | Optional | `YYYY-MM-DD` |
| `gender` | string | Optional | `male`, `female`, `other`, `prefer_not_to_say` |
| `whatsapp_opt_in` | bool | Optional | |
| `gst_name` | string | Optional | Business name for B2B |
| `gst_number` | string | Optional | GSTIN — auto-sets `is_b2b=true` + `customer_type="corporate"` |
| `is_blocked` | bool | Optional | `true` to deactivate, `false` to reactivate |
| `notes` | string | Optional | |
| `allergies` | array | Optional | List of allergy strings |
| `addresses` | array | Optional | See address schema below |

**Minimal edit payload** (name-only update):
```json
{
    "phone": "7505242126",
    "name": "Abhishek Jain"
}
```

**Full payload** (with pos_id for backward compat):
```json
{
    "phone": "7505242126",
    "name": "Abhishek Jain",
    "pos_id": "mygenie",
    "restaurant_id": "689",
    "email": "abhishek@example.com",
    "dob": "1990-08-15"
}
```

## 1.2 Success Response (200)

Returns the **full customer object** (same shape as `GET /api/pos/customers/{id}`):

```json
{
    "success": true,
    "message": "Customer updated successfully",
    "data": {
        "user_id": "pos_0001_restaurant_689",
        "name": "Abhishek Jain",
        "phone": "7505242126",
        "country_code": "+91",
        "email": "abhishek@example.com",
        "dob": "1990-08-15",
        "anniversary": null,
        "gender": null,
        "gst_name": null,
        "gst_number": null,
        "is_b2b": false,
        "customer_type": "normal",
        "total_points": 200,
        "total_points_earned": 8251,
        "total_points_redeemed": 7758,
        "wallet_balance": 0.0,
        "total_wallet_received": 0.0,
        "total_wallet_used": 0.0,
        "total_coupon_used": 13,
        "total_visits": 75,
        "total_spent": 74840.0,
        "avg_order_value": 997.87,
        "tier": "Bronze",
        "last_visit": "2026-08-04T12:00:00Z",
        "is_blocked": false,
        "whatsapp_opt_in": true,
        "addresses": [ ... ],
        "pos_customer_id": "22",
        "pos_id": "mygenie",
        "pos_restaurant_id": "689",
        "mygenie_synced": true,
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-08-06T14:00:00Z"
    }
}
```

> **Note**: `_id` is NOT present in the response (MongoDB internal ID excluded).

## 1.3 Error Responses

| Code | When | Message |
|---|---|---|
| `success: false` | `phone` belongs to another customer | `"Another customer with this phone already exists"` |
| `success: false` | `customer_id` not found | `"Customer not found"` |
| `HTTP 401` | Missing/invalid X-API-Key | Authentication error |
| `HTTP 422` | Missing `phone` in body | Pydantic validation error |

## 1.4 cURL

```bash
# Minimal edit — no pos_id/restaurant_id needed
curl -X PUT "https://crm.mygenie.online/api/pos/customers/{customer_id}" \
  -H "X-API-Key: <api_key>" \
  -H "Content-Type: application/json" \
  -d '{"phone": "7505242126", "name": "Abhishek Jain"}'

# Block/deactivate a customer
curl -X PUT "https://crm.mygenie.online/api/pos/customers/{customer_id}" \
  -H "X-API-Key: <api_key>" \
  -H "Content-Type: application/json" \
  -d '{"phone": "7505242126", "is_blocked": true}'

# Reactivate a blocked customer
curl -X PUT "https://crm.mygenie.online/api/pos/customers/{customer_id}" \
  -H "X-API-Key: <api_key>" \
  -H "Content-Type: application/json" \
  -d '{"phone": "7505242126", "is_blocked": false}'
```

---

# PART 2 — CR-081: Coupon Management (8 New Endpoints)

All endpoints use `X-API-Key` auth. All responses use `POSResponse` envelope: `{success, message, data}`.

> **Important**: `POST /api/pos/coupons` (create) requires `start_date` and `end_date`. These are mandatory ISO date strings.

---

## 2.1 List All Coupons

```
GET /api/pos/coupons
GET /api/pos/coupons?active_only=true
GET /api/pos/coupons?active_only=false&limit=50
```

**Query parameters:**

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `active_only` | bool | `false` | `true` = only active coupons |
| `limit` | int | `100` | Max 500 |

**Response (200):**
```json
{
    "success": true,
    "message": "5 coupon(s)",
    "data": {
        "coupons": [
            {
                "id": "d91230d4-...",
                "code": "WELCOME20",
                "title": "Welcome 20% Off",
                "discount_type": "percentage",
                "discount_value": 20.0,
                "offer_type": "simple",
                "discount_scope": "order",
                "min_order_value": 300.0,
                "max_discount": 200.0,
                "usage_limit": 100,
                "per_user_limit": null,
                "is_active": true,
                "total_used": 12,
                "start_date": "2026-01-01",
                "end_date": "2026-12-31",
                "applicable_channels": ["delivery", "takeaway", "dine_in"],
                "stackable_with_loyalty": false,
                "created_at": "2026-01-01T00:00:00Z"
            }
        ],
        "total": 5
    }
}
```

**cURL:**
```bash
curl "https://crm.mygenie.online/api/pos/coupons?active_only=true" \
  -H "X-API-Key: <api_key>"
```

---

## 2.2 Get Single Coupon

```
GET /api/pos/coupons/{coupon_id}
```

**Response (200):** Same coupon object as list, with all fields.

**Error:** `success: false` — "Coupon not found"

**cURL:**
```bash
curl "https://crm.mygenie.online/api/pos/coupons/{coupon_id}" \
  -H "X-API-Key: <api_key>"
```

---

## 2.3 Create Coupon

```
POST /api/pos/coupons
```

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | string | **Required** | Uppercase auto-applied. Must be unique for restaurant. |
| `discount_type` | string | **Required** | `"flat"` or `"percentage"` |
| `discount_value` | float | **Required** | Amount (Rs.) or percentage |
| `start_date` | string | **Required** | ISO date `"YYYY-MM-DD"` |
| `end_date` | string | **Required** | ISO date `"YYYY-MM-DD"` |
| `title` | string | Optional | Human-readable display name |
| `description` | string | Optional | |
| `min_order_value` | float | Optional | Default `0` |
| `max_discount` | float | Optional | Cap for percentage coupons |
| `usage_limit` | int | Optional | Total uses across all customers. `null` = unlimited |
| `per_user_limit` | int | Optional | Per-customer cap. `null` = unlimited |
| `applicable_channels` | array | Optional | Default `["delivery", "takeaway", "dine_in"]` |
| `stackable_with_loyalty` | bool | Optional | Default `false` |
| `offer_type` | string | Optional | Default `"simple"`. See string constants. |
| `discount_scope` | string | Optional | Default `"order"`. `"item"` or `"category"` for item-level coupons. |
| `specific_users` | array | Optional | List of `customer_id` — restrict to specific customers |

**Minimal payload:**
```json
{
    "code": "SAVE50",
    "discount_type": "flat",
    "discount_value": 50,
    "start_date": "2026-01-01",
    "end_date": "2026-12-31"
}
```

**Full payload (example):**
```json
{
    "code": "WEEKEND20",
    "title": "Weekend Special",
    "discount_type": "percentage",
    "discount_value": 20,
    "max_discount": 150,
    "min_order_value": 300,
    "start_date": "2026-08-01",
    "end_date": "2026-08-31",
    "usage_limit": 500,
    "per_user_limit": 2,
    "applicable_channels": ["dine_in", "takeaway"],
    "stackable_with_loyalty": false
}
```

**Success (200):**
```json
{
    "success": true,
    "message": "Coupon created",
    "data": {
        "coupon_id": "d91230d4-...",
        "code": "WEEKEND20",
        "created_at": "2026-08-06T14:00:00Z"
    }
}
```

**Errors:**

| Condition | Response |
|---|---|
| Duplicate code | `success: false` — "Coupon code already exists" |
| Missing `start_date` or `end_date` | `HTTP 422` — Pydantic validation error |

**cURL:**
```bash
curl -X POST "https://crm.mygenie.online/api/pos/coupons" \
  -H "X-API-Key: <api_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "SAVE50",
    "discount_type": "flat",
    "discount_value": 50,
    "start_date": "2026-01-01",
    "end_date": "2026-12-31"
  }'
```

---

## 2.4 Edit Coupon

```
PUT /api/pos/coupons/{coupon_id}
```

All fields optional. Only send fields to update.

**Example — extend expiry:**
```json
{ "end_date": "2027-12-31" }
```

**Example — change discount:**
```json
{ "discount_value": 30, "max_discount": 200 }
```

**Success (200):** Returns full updated coupon object.

**Error:** `success: false` — "Coupon not found" or "Coupon code already exists"

**cURL:**
```bash
curl -X PUT "https://crm.mygenie.online/api/pos/coupons/{coupon_id}" \
  -H "X-API-Key: <api_key>" \
  -H "Content-Type: application/json" \
  -d '{"end_date": "2027-12-31", "discount_value": 25}'
```

---

## 2.5 Toggle Coupon (Activate / Deactivate)

```
POST /api/pos/coupons/{coupon_id}/toggle
```

No request body. Flips `is_active` between `true` and `false`.

**Success (200):**
```json
{
    "success": true,
    "message": "Coupon activated",
    "data": { "is_active": true }
}
```
*(or `"Coupon deactivated"` + `"is_active": false`)*

**cURL:**
```bash
curl -X POST "https://crm.mygenie.online/api/pos/coupons/{coupon_id}/toggle" \
  -H "X-API-Key: <api_key>"
```

---

## 2.6 Delete Coupon

```
DELETE /api/pos/coupons/{coupon_id}
```

**Rules:**
- Coupon is permanently deleted.
- All `coupon_usage` records for this coupon are also deleted.
- **Blocked if coupon is used in an active campaign** — returns error instead.

> ⚠️ This endpoint adds a campaign in-use guard that the CRM web UI delete does NOT currently have. POS delete is safer.

**Success (200):**
```json
{
    "success": true,
    "message": "Coupon deleted",
    "data": { "coupon_id": "d91230d4-..." }
}
```

**Blocked by active campaign (200):**
```json
{
    "success": false,
    "message": "Coupon is used in active campaign 'Summer Blast'",
    "data": {
        "campaign_id": "...",
        "campaign_name": "Summer Blast"
    }
}
```

**Error:** `success: false` — "Coupon not found"

**cURL:**
```bash
curl -X DELETE "https://crm.mygenie.online/api/pos/coupons/{coupon_id}" \
  -H "X-API-Key: <api_key>"
```

---

## 2.7 Coupon Usage History

```
GET /api/pos/coupons/{coupon_id}/usage
GET /api/pos/coupons/{coupon_id}/usage?limit=20
```

**Query parameters:**

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `limit` | int | `50` | Max 200 |

**Success (200):**
```json
{
    "success": true,
    "message": "8 usage record(s)",
    "data": {
        "coupon_id": "d91230d4-...",
        "coupon_code": "WELCOME20",
        "usage": [
            {
                "id": "usage_abc...",
                "customer_id": "1779d4fc-...",
                "customer_name": "Abhishek Jain",
                "customer_phone": "7505242126",
                "order_id": "...",
                "pos_order_id": "KM-1234",
                "coupon_discount": 100.0,
                "order_total": 500.0,
                "channel": "dine_in",
                "used_at": "2026-08-04T14:00:00Z"
            }
        ],
        "total_discount": 800.0
    }
}
```

> **Note**: `customer_name` and `customer_phone` are `null` for anonymous orders (future CR-082).

**cURL:**
```bash
curl "https://crm.mygenie.online/api/pos/coupons/{coupon_id}/usage?limit=20" \
  -H "X-API-Key: <api_key>"
```

---

## 2.8 Distribute Coupon to Customer

```
POST /api/pos/coupons/{coupon_id}/distribute
```

Assigns a coupon to a specific customer. Records the distribution for tracking.

> **Phase 1**: Records only. WhatsApp notification to customer deferred to Phase 2.

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `customer_id` | string | **Required** | CRM customer UUID |
| `note` | string | Optional | Reason / context (e.g. "VIP reward — 10th visit") |

```json
{
    "customer_id": "1779d4fc-7161-4407-ac8c-cce30beb3e53",
    "note": "VIP reward — 10th visit milestone"
}
```

**Success (200):**
```json
{
    "success": true,
    "message": "Coupon distributed to Abhishek Jain",
    "data": {
        "distribution_id": "dist_abc123",
        "coupon_id": "d91230d4-...",
        "coupon_code": "WELCOME20",
        "customer_id": "1779d4fc-...",
        "assigned_at": "2026-08-06T14:00:00Z"
    }
}
```

**Errors:**

| Condition | Response |
|---|---|
| Missing `customer_id` | `success: false` — "customer_id is required" |
| Coupon not found | `success: false` — "Coupon not found" |
| Customer not found | `success: false` — "Customer not found" |

**cURL:**
```bash
curl -X POST "https://crm.mygenie.online/api/pos/coupons/{coupon_id}/distribute" \
  -H "X-API-Key: <api_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "1779d4fc-...",
    "note": "VIP reward"
  }'
```

---

# PART 3 — CR-080: Loyalty & Wallet Management (5 New Endpoints)

---

## 3.1 Read Loyalty Settings

```
GET /api/pos/loyalty/settings
```

Returns the restaurant's loyalty configuration for POS display (earn percentages, tier thresholds, enabled flags).

> **Read-only**. Does not expose campaign limits or lifecycle thresholds.

**Success (200):**
```json
{
    "success": true,
    "message": "Loyalty settings",
    "data": {
        "loyalty_enabled": true,
        "wallet_enabled": false,
        "coupon_enabled": true,
        "bronze_earn_percent": 5.0,
        "silver_earn_percent": 7.0,
        "gold_earn_percent": 10.0,
        "platinum_earn_percent": 15.0,
        "tier_silver_min": 500,
        "tier_gold_min": 1500,
        "tier_platinum_min": 5000,
        "redemption_value": 1.0,
        "min_redemption_points": 50,
        "off_peak_bonus_enabled": false,
        "off_peak_start_time": "14:00",
        "off_peak_end_time": "17:00"
    }
}
```

**Field Reference:**

| Field | Type | Description |
|---|---|---|
| `loyalty_enabled` | bool | Master toggle — if false, points earn/redeem disabled |
| `wallet_enabled` | bool | Wallet top-up and usage enabled |
| `coupon_enabled` | bool | Coupon validation and apply enabled |
| `bronze_earn_percent` | float | Points earned per Rs. 100 spent for Bronze tier (5% = 5 pts per ₹100) |
| `tier_silver_min` | int | Total points needed to reach Silver |
| `tier_gold_min` | int | Total points needed to reach Gold |
| `tier_platinum_min` | int | Total points needed to reach Platinum |
| `redemption_value` | float | Rs. value of 1 point (e.g. `1.0` = ₹1 per point) |
| `min_redemption_points` | int | Minimum points required per redemption |
| `off_peak_bonus_enabled` | bool | Happy-hour bonus points enabled |

**cURL:**
```bash
curl "https://crm.mygenie.online/api/pos/loyalty/settings" \
  -H "X-API-Key: <api_key>"
```

---

## 3.2 Customer Points History

```
GET /api/pos/customers/{customer_id}/points-history
GET /api/pos/customers/{customer_id}/points-history?limit=20
```

Returns the full loyalty points transaction log for a customer, newest first.

**Query parameters:**

| Parameter | Type | Default | Max |
|---|---|---|---|
| `limit` | int | `20` | `100` |

**Success (200):**
```json
{
    "success": true,
    "message": "5 transaction(s)",
    "data": {
        "customer_id": "1779d4fc-...",
        "customer_name": "Abhishek Jain",
        "current_balance": 200,
        "transactions": [
            {
                "id": "tx_abc...",
                "points": 100,
                "transaction_type": "bonus",
                "description": "Service recovery bonus",
                "bill_amount": null,
                "balance_after": 200,
                "created_at": "2026-08-06T14:00:00Z"
            },
            {
                "id": "tx_def...",
                "points": 493,
                "transaction_type": "earn",
                "description": "Earned 5% on bill of Rs.9870",
                "bill_amount": 9870.0,
                "balance_after": 100,
                "created_at": "2026-08-04T12:00:00Z"
            }
        ]
    }
}
```

**Transaction type values:**

| `transaction_type` | Meaning |
|---|---|
| `"earn"` | Points earned on an order |
| `"redeem"` | Points redeemed at billing |
| `"bonus"` | Manual bonus awarded (see §3.3) |
| `"expired"` | Points expired |

**Error:** `success: false` — "Customer not found"

**cURL:**
```bash
curl "https://crm.mygenie.online/api/pos/customers/{customer_id}/points-history?limit=10" \
  -H "X-API-Key: <api_key>"
```

---

## 3.3 Award Bonus Points

```
POST /api/pos/customers/{customer_id}/points/award
```

Manually award bonus points to a customer (service recovery, complimentary gift, cashier discretion).

**Rules:**
- Requires `loyalty_enabled = true` for the restaurant.
- Maximum **1,000 points per single award** (POS cap). CRM admin path is uncapped.
- Fires `bonus_points` WhatsApp notification to customer (if configured).
- Idempotency: no server-side enforcement in Phase 1 — caller must not double-call.

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `points` | int | **Required** | Positive integer. Max 1,000. |
| `description` | string | Optional | Reason shown in points history. Default: "Bonus points awarded at POS" |
| `idempotency_key` | string | Optional | Logged for audit. Not server-enforced in Phase 1. |

```json
{
    "points": 200,
    "description": "Service recovery — long wait at counter",
    "idempotency_key": "award_KM_20260806_001"
}
```

**Success (200):**
```json
{
    "success": true,
    "message": "200 bonus points awarded",
    "data": {
        "transaction_id": "tx_abc123",
        "customer_id": "1779d4fc-...",
        "points_awarded": 200,
        "new_balance": 400,
        "new_tier": "Bronze",
        "tier_changed": false
    }
}
```

**Errors:**

| Condition | Response |
|---|---|
| `points > 1000` | `success: false` — "Exceeds maximum award of 1,000 points per transaction" |
| `points <= 0` or non-integer | `success: false` — "points must be a positive integer" |
| `loyalty_enabled = false` | `success: false` — "Loyalty program is not enabled for this restaurant" |
| Customer not found | `success: false` — "Customer not found" |

**cURL:**
```bash
curl -X POST "https://crm.mygenie.online/api/pos/customers/{customer_id}/points/award" \
  -H "X-API-Key: <api_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "points": 100,
    "description": "Thank you for your patience",
    "idempotency_key": "award_20260806_001"
  }'
```

---

## 3.4 Customer Wallet History

```
GET /api/pos/customers/{customer_id}/wallet-history
GET /api/pos/customers/{customer_id}/wallet-history?limit=20
```

Returns wallet transaction log plus current balance, newest first.

**Query parameters:**

| Parameter | Type | Default | Max |
|---|---|---|---|
| `limit` | int | `20` | `100` |

**Success (200):**
```json
{
    "success": true,
    "message": "3 transaction(s)",
    "data": {
        "customer_id": "1779d4fc-...",
        "customer_name": "Abhishek Jain",
        "current_balance": 150.0,
        "transactions": [
            {
                "id": "wtx_abc...",
                "amount": 200.0,
                "transaction_type": "credit",
                "description": "Wallet top-up at counter",
                "payment_method": "cash",
                "balance_after": 200.0,
                "created_at": "2026-08-06T14:00:00Z"
            },
            {
                "id": "wtx_def...",
                "amount": 50.0,
                "transaction_type": "debit",
                "description": "Used on order KM-1234",
                "payment_method": null,
                "balance_after": 150.0,
                "created_at": "2026-08-05T10:00:00Z"
            }
        ]
    }
}
```

**Note**: `current_balance` is in INR (₹). All amounts are INR.

**Error:** `success: false` — "Customer not found"

**cURL:**
```bash
curl "https://crm.mygenie.online/api/pos/customers/{customer_id}/wallet-history?limit=10" \
  -H "X-API-Key: <api_key>"
```

---

## 3.5 Credit Customer Wallet

```
POST /api/pos/customers/{customer_id}/wallet/credit
```

Top up a customer's wallet at the POS counter (customer pays cash / card / UPI to load wallet).

**Rules:**
- Requires `wallet_enabled = true` for the restaurant.
- `payment_method` is mandatory — required for financial audit trail.
- Fires `wallet_credit` WhatsApp notification to customer (if configured).
- All monetary values in INR (₹).

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `amount` | float | **Required** | Positive number. In INR (₹). |
| `payment_method` | string | **Required** | How the customer paid: `"cash"`, `"card"`, `"upi"`, etc. |
| `description` | string | Optional | Default: "Wallet top-up at POS" |
| `idempotency_key` | string | Optional | Logged for audit. Not server-enforced in Phase 1. |

```json
{
    "amount": 500.0,
    "payment_method": "cash",
    "description": "Customer paid ₹500 cash to load wallet",
    "idempotency_key": "topup_KM_20260806_001"
}
```

**Success (200):**
```json
{
    "success": true,
    "message": "Wallet credited ₹500.0",
    "data": {
        "transaction_id": "wtx_abc123",
        "customer_id": "1779d4fc-...",
        "amount_credited": 500.0,
        "new_balance": 650.0,
        "payment_method": "cash"
    }
}
```

**Errors:**

| Condition | Response |
|---|---|
| Missing `payment_method` | `success: false` — "payment_method is required (cash / card / upi)" |
| `amount <= 0` | `success: false` — "amount must be positive" |
| Invalid amount | `success: false` — "amount must be a positive number" |
| `wallet_enabled = false` | `success: false` — "Wallet feature is not enabled for this restaurant" |
| Customer not found | `success: false` — "Customer not found" |

**cURL:**
```bash
curl -X POST "https://crm.mygenie.online/api/pos/customers/{customer_id}/wallet/credit" \
  -H "X-API-Key: <api_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 500.0,
    "payment_method": "cash",
    "description": "Wallet top-up at counter"
  }'
```

---

# PART 4 — Error Reference

All endpoints return HTTP 200 with `success: false` for business errors (consistent with all POS endpoints). HTTP non-200 only for auth failures and invalid request format.

| HTTP Status | When | Body |
|---|---|---|
| `200` + `success: false` | Business rule violation (not found, cap exceeded, disabled feature, etc.) | `{success: false, message: "...", data: null}` |
| `401` | Missing or invalid `X-API-Key` | `{detail: "Authentication required..."}` |
| `422` | Malformed request body (missing required field, wrong type) | FastAPI validation error object |
| `500` | CRM server error | Retry with backoff; report to CRM team |

---

# PART 5 — Backward Compatibility

1. **CR-079 `PUT /api/pos/customers/{id}`**: POS callers currently sending `pos_id`/`restaurant_id` continue to work unchanged. The fields are accepted when present; ignored if absent. No breaking change.
2. **All CR-081 coupon endpoints**: Net-new paths. Existing `GET /pos/coupons/available`, `POST /pos/coupons/validate`, and coupon recording via `POST /pos/orders` are **untouched**.
3. **All CR-080 loyalty/wallet endpoints**: Net-new paths. Existing `GET /pos/customers/{id}/loyalty`, `POST /pos/max-redeemable`, `POST /pos/loyalty/redeem`, and loyalty earn via `POST /pos/orders` are **untouched**.

---

# PART 6 — Existing Endpoints — NOT Changed

| Endpoint | Status |
|---|---|
| `POST /api/pos/orders` | UNTOUCHED |
| `POST /api/pos/customer-lookup` | UNTOUCHED |
| `POST /api/pos/customers` (create) | UNTOUCHED |
| `GET /api/pos/customers/{id}` | UNTOUCHED |
| `GET /api/pos/customers/{id}/loyalty` | UNTOUCHED |
| `POST /api/pos/max-redeemable` | UNTOUCHED |
| `POST /api/pos/loyalty/redeem` | UNTOUCHED |
| `GET /api/pos/coupons/available` | UNTOUCHED |
| `POST /api/pos/coupons/validate` | UNTOUCHED |
| `POST /api/pos/customers/{id}/documents` | UNTOUCHED |
| `GET /api/pos/customers/{id}/documents` | UNTOUCHED |
| `POST /api/pos/customers/order-suggestions` | UNTOUCHED |
| `GET /api/pos/reports/summary` | UNTOUCHED (CR-078) |
| `GET /api/pos/reports/top-customers` | UNTOUCHED (CR-078) |
| `GET /api/pos/reports/churn-risk` | UNTOUCHED (CR-078) |

---

# PART 7 — Phase 2 (Deferred — Not in This Contract)

| Feature | Deferred to |
|---|---|
| WhatsApp notification on coupon distribute (C-8) | CR-081 Phase 2 |
| `sort_by=value_score` on top-customers report | CR-078 Phase 2 |
| Coupon `requires_customer` flag (generic/anonymous coupons) | CR-082 |
| Revenue intelligence report | CR-078 Phase 2 |

---

# PART 8 — POS Integration Checklist

| Step | Owner | Status |
|---|---|---|
| CRM implementation | CRM | ✅ Done |
| CRM QA (26/26 pass) | CRM | ✅ Done |
| POS contract review | POS | ⬜ Ready |
| CR-079: update PUT customer caller (pos_id optional) | POS BE | ⬜ Ready |
| CR-081: integrate coupon management screen | POS FE | ⬜ Ready |
| CR-080: integrate loyalty settings display | POS FE | ⬜ Ready |
| CR-080: award bonus points from POS UI | POS FE | ⬜ Ready |
| CR-080: wallet top-up from POS counter | POS FE | ⬜ Ready |
| E2E test on preprod | Both | ⬜ Pending |

---

# PART 9 — Things POS Must NOT Do

| Anti-pattern | Correct approach |
|---|---|
| Cache `GET /pos/loyalty/settings` indefinitely | Re-fetch at session start or when displaying earn info |
| Assume `wallet_enabled=true` | Check `loyalty/settings` before showing wallet top-up option |
| Award > 1,000 pts in one call | Split into multiple calls or route to CRM admin |
| Send `amount: 0` or negative to wallet credit | Validate on POS side before calling |
| Delete a coupon without checking if cashier intended it | Show confirmation dialog — delete is irreversible |
| Send `payment_method` as empty string for wallet credit | Must be a non-empty string: `"cash"`, `"card"`, `"upi"` |

---

# PART 10 — QA Evidence

| Check | Result | Test |
|---|---|---|
| CR-079: PUT without `pos_id`/`restaurant_id` | ✅ PASS | iteration_10.json |
| CR-079: PUT response contains full customer fields | ✅ PASS | iteration_10.json |
| CR-081: All 8 endpoints functional | ✅ PASS (11/11) | iteration_10.json |
| CR-081: Delete blocked by active campaign | ✅ PASS | iteration_10.json |
| CR-081: Distribute records in `coupon_distributions` | ✅ PASS | iteration_10.json |
| CR-080: Settings, history, award, wallet-history all respond | ✅ PASS (10/10) | iteration_10.json |
| CR-080: Bonus cap 1,000 pts enforced | ✅ PASS | iteration_10.json |
| CR-080: Wallet credit without `payment_method` blocked | ✅ PASS | iteration_10.json |
| All existing POS endpoints regression clean | ✅ PASS | iteration_10.json |

---

*Contract v1.0 FINAL — 2026-08-06 | CRM: implemented + QA passed (26/26) | POS: ready to integrate*
