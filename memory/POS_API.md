# MyGenie CRM — POS API Reference

> **Version:** 1.0
> **Base URL:** `https://{your-crm-domain}/api/pos`
> **Last Updated:** April 14, 2026

---

## Authentication

All POS endpoints accept **two authentication methods**. Use whichever suits your integration:

### Option 1: API Key (Recommended for POS systems)

```
X-API-Key: dp_live_xxxxxxxxxxxxxxxxxx
```

- Long-lived, doesn't expire until regenerated
- Get your key from CRM Dashboard → Settings → POS Integration
- Or call `GET /api/pos/api-key` with JWT token

### Option 2: JWT Bearer Token

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

- Short-lived (24 hours), obtained from CRM login flow
- Use if your POS shares the CRM login session (e.g., MyGenie)

### Auth Errors

| HTTP Code | Response | Meaning |
|-----------|----------|---------|
| 401 | `{"detail": "Authentication required. Provide X-API-Key header or Bearer token."}` | No auth provided |
| 401 | `{"detail": "Invalid API key"}` | Wrong API key |
| 401 | `{"detail": "Token expired"}` | JWT expired, get a new one |
| 401 | `{"detail": "Invalid token"}` | Malformed JWT |

---

## Standard Response Format

Every POS endpoint returns:

```json
{
  "success": true,
  "message": "Human-readable description",
  "data": { ... }
}
```

On failure:

```json
{
  "success": false,
  "message": "Error description",
  "data": null
}
```

---
---

## 1. Customer Search & Lookup

### 1.1 Search Customers (Lightweight)

Search by name or phone number. Designed for cashier typeahead — fast, minimal response.

```
GET /api/pos/customers?search={query}&limit={n}
```

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `search` | string | Yes | — | Min 2 characters. Matches name OR phone (partial, case-insensitive) |
| `limit` | int | No | 10 | Max results (capped at 50) |

**Response:**

```json
{
  "success": true,
  "message": "2 customers found",
  "data": {
    "customers": [
      {
        "id": "baa223be-25e9-4db1-b39e-34b83d7b23a5",
        "name": "Kriele",
        "phone": "1234567890",
        "tier": "Bronze",
        "total_points": 0,
        "wallet_balance": 0.0,
        "last_visit": "2025-12-31 15:00:11"
      }
    ],
    "total": 2
  }
}
```

**Notes:**
- Sorted by `last_visit` descending (most recent first)
- Blocked/deactivated customers are excluded
- Only returns fields shown above — no addresses, no full profile

---

### 1.2 Customer Lookup by Phone (Exact Match)

Quick lookup for a known phone number. Returns loyalty info + saved addresses.

```
POST /api/pos/customer-lookup
```

**Request:**

```json
{
  "phone": "1234567890"
}
```

**Response (found):**

```json
{
  "success": true,
  "message": "Customer found",
  "data": {
    "registered": true,
    "customer_id": "baa223be-25e9-4db1-b39e-34b83d7b23a5",
    "name": "Kriele",
    "phone": "1234567890",
    "tier": "Bronze",
    "total_points": 0,
    "points_value": 0.0,
    "wallet_balance": 0.0,
    "total_visits": 19,
    "total_spent": 5675.0,
    "allergies": [],
    "favorites": [],
    "last_visit": "2025-12-31 15:00:11",
    "addresses": [
      {
        "id": "addr_059445f6fa32",
        "address_type": "Home",
        "address": "Narayan Nagar Road, Surat, Gujarat",
        "city": "Surat",
        "pincode": "395006",
        "is_default": true
      }
    ]
  }
}
```

**Response (not found):**

```json
{
  "success": false,
  "message": "Customer not found",
  "data": { "registered": false }
}
```

---

### 1.3 Get Full Customer Details

Complete customer profile with loyalty computed fields, addresses, and recent orders.

```
GET /api/pos/customers/{customer_id}
```

**Response:**

```json
{
  "success": true,
  "message": "Customer found",
  "data": {
    "id": "baa223be-...",
    "name": "Kriele",
    "phone": "1234567890",
    "email": "customer@mygenie.local",
    "tier": "Bronze",
    "total_points": 0,
    "wallet_balance": 0.0,
    "total_visits": 19,
    "total_spent": 5675.0,
    "allergies": [],
    "favorites": [],
    "dob": null,
    "anniversary": null,
    "addresses": [ ... ],
    "loyalty": {
      "total_points": 0,
      "points_monetary_value": 0.0,
      "tier": "Bronze",
      "next_tier": "Silver",
      "points_to_next_tier": 500,
      "wallet_balance": 0.0,
      "earn_rate_percent": 5.0,
      "redemption_value_per_point": 1.0
    },
    "recent_orders": [
      {
        "id": "order-uuid",
        "pos_order_id": "12345",
        "order_amount": 450.0,
        "order_type": "dinein",
        "points_earned": 22,
        "items": [ ... ],
        "created_at": "2025-12-31 15:00:11"
      }
    ]
  }
}
```

---

## 2. Customer CRUD

### 2.1 Create Customer

```
POST /api/pos/customers
```

**Request:**

```json
{
  "pos_id": "mygenie",
  "restaurant_id": "509",
  "name": "Raj Kumar",
  "phone": "9876543210",
  "country_code": "+91",
  "email": "raj@example.com",
  "gender": "male",
  "dob": "1990-05-15",
  "customer_type": "normal",
  "addresses": [
    {
      "address_type": "Home",
      "address": "123 MG Road, Sector 5",
      "house": "A-101",
      "floor": "1st",
      "city": "Bangalore",
      "state": "Karnataka",
      "pincode": "560001",
      "latitude": "12.97",
      "longitude": "77.59",
      "delivery_instructions": "Ring bell twice",
      "is_default": true
    }
  ]
}
```

**Required fields:** `pos_id`, `restaurant_id`, `name`, `phone`

**Optional:** All other fields including `addresses` array. If `addresses` is omitted, no address array is created.

**Response:**

```json
{
  "success": true,
  "message": "Customer created successfully",
  "data": {
    "customer_id": "uuid-here",
    "name": "Raj Kumar",
    "phone": "9876543210",
    "created_at": "2026-04-14T..."
  }
}
```

**Error — duplicate phone:**

```json
{
  "success": false,
  "message": "Customer with this phone already exists",
  "data": { "customer_id": "existing-uuid", "existing": true }
}
```

---

### 2.2 Update Customer

```
PUT /api/pos/customers/{customer_id}
```

**Request:**

```json
{
  "pos_id": "mygenie",
  "restaurant_id": "509",
  "phone": "9876543210",
  "name": "Raj Kumar Updated",
  "email": "raj.new@example.com"
}
```

**Required fields:** `pos_id`, `restaurant_id`, `phone`

**Address behavior:**
- If `addresses` field is **omitted** → existing addresses are **untouched**
- If `addresses` field is **provided** → replaces the entire array
- To update individual addresses, use the Address CRUD endpoints (Section 3)

**Response:**

```json
{
  "success": true,
  "message": "Customer updated successfully",
  "data": {
    "customer_id": "uuid",
    "name": "Raj Kumar Updated",
    "phone": "9876543210",
    "updated_at": "2026-04-14T..."
  }
}
```

---

### 2.3 Deactivate Customer (Soft Delete)

Sets `is_blocked: true`. Customer is excluded from search results but data is preserved.

```
DELETE /api/pos/customers/{customer_id}
```

**Response:**

```json
{
  "success": true,
  "message": "Customer deactivated",
  "data": { "customer_id": "uuid" }
}
```

---

## 3. Customer Addresses

Addresses are stored as an array on the customer document. Each address has a unique `addr_` prefixed ID.

### Address Object Schema

```json
{
  "id": "addr_48756c400795",
  "pos_address_id": null,
  "is_default": true,
  "address_type": "Home",
  "address": "123 MG Road, Sector 5",
  "house": "A-101",
  "floor": "1st",
  "road": "Main Road",
  "city": "Bangalore",
  "state": "Karnataka",
  "pincode": "560001",
  "country": "India",
  "latitude": "12.97",
  "longitude": "77.59",
  "contact_person_name": "Raj Kumar",
  "contact_person_number": "9876543210",
  "dial_code": "+91",
  "zone_id": null,
  "delivery_instructions": "Ring bell twice",
  "created_at": "2026-04-14T10:30:00+00:00",
  "updated_at": "2026-04-14T10:30:00+00:00"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Auto-generated `addr_` prefixed ID |
| `pos_address_id` | string/null | Your POS system's address ID (for linking) |
| `is_default` | bool | Default delivery address |
| `address_type` | string | `Home`, `Office`, `Other` |
| `address` | string | Full address text |
| `house` | string | House/flat number |
| `floor` | string | Floor number |
| `road` | string | Road/street name |
| `city` | string | City |
| `state` | string | State |
| `pincode` | string | PIN/ZIP code |
| `country` | string | Country (default: India) |
| `latitude` | string | GPS latitude |
| `longitude` | string | GPS longitude |
| `contact_person_name` | string | Delivery contact (if different from customer) |
| `contact_person_number` | string | Delivery phone |
| `dial_code` | string | Phone dial code |
| `zone_id` | string | Delivery zone ID |
| `delivery_instructions` | string | Special delivery notes |

---

### 3.1 List Addresses

```
GET /api/pos/customers/{customer_id}/addresses
```

**Response:**

```json
{
  "success": true,
  "message": "3 addresses found",
  "data": {
    "customer_id": "uuid",
    "addresses": [ ... ],
    "total": 3
  }
}
```

Sorted: default address first, then by most recently created.

---

### 3.2 Add Address

```
POST /api/pos/customers/{customer_id}/addresses
```

**Request:**

```json
{
  "address_type": "Home",
  "address": "123 MG Road, Sector 5",
  "city": "Bangalore",
  "state": "Karnataka",
  "pincode": "560001",
  "latitude": "12.97",
  "longitude": "77.59",
  "delivery_instructions": "Ring bell twice",
  "is_default": true,
  "pos_address_id": "your-pos-addr-id"
}
```

**Required:** `address`

**Deduplication:** If an address with the same `address` text + `pincode` already exists, the endpoint updates the existing address's timestamp instead of creating a duplicate.

**Response (new):**

```json
{
  "success": true,
  "message": "Address added",
  "data": {
    "address_id": "addr_48756c400795",
    "address": { ... }
  }
}
```

**Response (deduplicated):**

```json
{
  "success": true,
  "message": "Address already exists, updated timestamp",
  "data": {
    "address_id": "addr_existing123",
    "deduplicated": true
  }
}
```

**Default behavior:**
- If `is_default: true`, all other addresses are unset
- First address added is automatically set as default

---

### 3.3 Update Address

```
PUT /api/pos/customers/{customer_id}/addresses/{addr_id}
```

**Request (partial update):**

```json
{
  "delivery_instructions": "Use back door",
  "contact_person_name": "Wife"
}
```

Only provided fields are updated. All others are preserved.

**Response:**

```json
{
  "success": true,
  "message": "Address updated",
  "data": { "address_id": "addr_xxx" }
}
```

---

### 3.4 Delete Address

```
DELETE /api/pos/customers/{customer_id}/addresses/{addr_id}
```

**Response:**

```json
{
  "success": true,
  "message": "Address deleted",
  "data": { "address_id": "addr_xxx" }
}
```

If the deleted address was the default, the most recently updated remaining address becomes the new default.

---

### 3.5 Set Default Address

```
PUT /api/pos/customers/{customer_id}/addresses/{addr_id}/default
```

**Response:**

```json
{
  "success": true,
  "message": "Default address set",
  "data": { "address_id": "addr_xxx" }
}
```

---

## 4. Cross-Restaurant Address Lookup

Look up a customer's saved addresses across ALL restaurants on the platform. Useful for delivery — if a customer ordered from Restaurant A before, Restaurant B can reuse the address.

```
POST /api/pos/address-lookup
```

**Request:**

```json
{
  "phone": "9876543210",
  "country_code": "+91"
}
```

**Response:**

```json
{
  "success": true,
  "message": "3 addresses found",
  "data": {
    "phone": "9876543210",
    "addresses": [
      {
        "address": "123 MG Road, Bangalore, Karnataka",
        "city": "Bangalore",
        "state": "Karnataka",
        "pincode": "560001",
        "country": "India",
        "latitude": "12.97",
        "longitude": "77.59",
        "address_type": "Home",
        "last_used_at": "2026-04-10T12:00:00+00:00",
        "source_restaurant": "Pizzeria Roma"
      }
    ]
  }
}
```

**Notes:**
- Deduplicated by `address + pincode` — same address from multiple restaurants appears once
- Sorted by `last_used_at` descending (most recent first)
- `source_restaurant` shows which restaurant collected the address
- `contact_person_*` and `delivery_instructions` are NOT included (privacy — those are restaurant-specific)
- Returns empty array for unknown phone (doesn't reveal if phone exists)

---

## 5. Orders

### 5.1 Submit Order (Webhook)

Primary order ingestion endpoint. Processes payment, calculates loyalty points (with off-peak bonus), deducts wallet, records order + items, triggers WhatsApp notifications.

```
POST /api/pos/orders
```

**Request:**

```json
{
  "pos_id": "mygenie",
  "restaurant_id": "509",
  "order_id": "ORD-12345",
  "cust_mobile": "9876543210",
  "cust_name": "Raj Kumar",
  "cust_email": "raj@example.com",
  "user_id": "pos-customer-id",
  "order_amount": 850.0,
  "order_sub_total_amount": 800.0,
  "order_discount": 0.0,
  "coupon_code": null,
  "coupon_discount": 0.0,
  "wallet_used": 0.0,
  "tax_amount": 50.0,
  "gst_tax": 50.0,
  "payment_method": "upi",
  "payment_status": "success",
  "order_type": "dinein",
  "table_id": "T5",
  "waiter_id": "W3",
  "order_notes": "No plastic cutlery",
  "items": [
    {
      "item_name": "Dal Tadka",
      "pos_food_id": 1234,
      "item_category": "Main Course",
      "item_qty": 1,
      "item_price": 250.0,
      "item_notes": "Make it spicy",
      "variant": null,
      "station": "KITCHEN"
    },
    {
      "item_name": "Butter Naan",
      "pos_food_id": 1235,
      "item_category": "Breads",
      "item_qty": 2,
      "item_price": 60.0,
      "item_notes": "Extra butter"
    }
  ]
}
```

**Required:** `restaurant_id`, `order_id`, `cust_mobile`, `order_amount`

**`payment_status` must be `"success"`** — orders with other statuses are rejected.

**Response:**

```json
{
  "success": true,
  "message": "Order processed successfully",
  "data": {
    "order_id": "internal-uuid",
    "pos_order_id": "ORD-12345",
    "customer_id": "cust-uuid",
    "customer_name": "Raj Kumar",
    "is_new_customer": false,
    "first_visit_bonus_awarded": 0,
    "order_amount": 850.0,
    "points_earned": 42,
    "off_peak_bonus": 0,
    "total_points": 542,
    "tier": "Silver",
    "wallet_used": 0.0,
    "wallet_balance_after": 100.0,
    "coupon_applied": null,
    "coupon_discount": 0.0
  }
}
```

**Auto-creates customer** if `cust_mobile` not found. First visit bonus awarded if configured.

**Duplicate protection:** Same `pos_id + restaurant_id + order_id` combination is rejected.

---

### 5.2 Customer Order History

```
GET /api/pos/customers/{customer_id}/orders?limit=10
```

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | int | 10 | Max orders (capped at 50) |

**Response:**

```json
{
  "success": true,
  "message": "3 orders found",
  "data": {
    "orders": [
      {
        "id": "order-uuid",
        "pos_order_id": "ORD-12345",
        "order_amount": 850.0,
        "order_type": "dinein",
        "cust_mobile": "9876543210",
        "items": [ ... ],
        "points_earned": 42,
        "order_notes": "No plastic cutlery",
        "created_at": "2026-04-14T..."
      }
    ],
    "total": 19
  }
}
```

---

## 6. Loyalty

### 6.1 Max Redeemable Points

Calculate maximum points a customer can redeem on a given bill.

```
POST /api/pos/max-redeemable
```

**Request:**

```json
{
  "pos_id": "mygenie",
  "restaurant_id": "509",
  "cust_mobile": "9876543210",
  "bill_amount": 1000.0
}
```

**Response:**

```json
{
  "success": true,
  "message": "Max redeemable calculated",
  "data": {
    "max_points_redeemable": 400,
    "max_discount_value": 100.0
  }
}
```

Calculations respect: min redemption points, max redemption %, max redemption amount, and available points.

---

### 6.2 Loyalty Summary

```
GET /api/pos/customers/{customer_id}/loyalty
```

**Response:**

```json
{
  "success": true,
  "message": "Loyalty summary",
  "data": {
    "total_points": 1500,
    "points_monetary_value": 375.0,
    "tier": "Gold",
    "next_tier": "Platinum",
    "points_to_next_tier": 3500,
    "wallet_balance": 250.0,
    "total_visits": 42,
    "total_spent": 18500.0,
    "earn_rate_percent": 10.0,
    "redemption_value_per_point": 0.25
  }
}
```

| Field | Description |
|-------|-------------|
| `points_monetary_value` | `total_points × redemption_value_per_point` |
| `tier` | Current tier: Bronze, Silver, Gold, Platinum |
| `next_tier` | Next tier name (null if Platinum) |
| `points_to_next_tier` | Points needed for next tier (0 if Platinum) |
| `earn_rate_percent` | % of bill amount earned as points (tier-based) |
| `redemption_value_per_point` | Money value per point |

---

## 7. Coupons

### 7.1 Validate Coupon

Check if a coupon is valid for a specific customer, order value, and channel. Does NOT apply it.

```
POST /api/pos/coupons/validate?code=SAVE20&customer_id={id}&order_value=500&channel=pos
```

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | Yes | Coupon code (case-insensitive) |
| `customer_id` | string | Yes | Customer UUID |
| `order_value` | float | Yes | Bill amount |
| `channel` | string | No | `pos`, `delivery`, `takeaway`, `dine_in` (default: `pos`) |

**Response (valid):**

```json
{
  "success": true,
  "message": "Coupon valid",
  "data": {
    "code": "SAVE20",
    "discount": 100.0,
    "final_amount": 400.0,
    "discount_type": "percentage",
    "discount_value": 20.0
  }
}
```

**Validation checks performed:**
- Coupon exists and is active
- Within start/end date
- Global usage limit not exceeded
- Per-customer usage limit not exceeded
- Minimum order value met
- Channel is applicable
- Customer is in allowed list (if restricted)

---

### 7.2 Apply Coupon

Validates + records the coupon usage. Call this when the order is confirmed.

```
POST /api/pos/coupons/apply?code=SAVE20&customer_id={id}&order_value=500&channel=pos
```

Same parameters as validate. Returns same response + usage record ID:

```json
{
  "success": true,
  "message": "Coupon applied",
  "data": {
    "usage_id": "uuid",
    "discount": 100.0,
    "final_amount": 400.0
  }
}
```

---

## 8. Customer Notes (Historical Patterns)

These are **read-only** endpoints. Notes are written through the Order webhook (Section 5.1) via `item_notes` and `order_notes` fields. These endpoints aggregate the history to show recurring customer preferences.

### 8.1 Item-Level Notes

What notes does this customer typically add to specific menu items?

```
GET /api/pos/customers/{customer_id}/notes/items
```

**Response:**

```json
{
  "success": true,
  "message": "3 items with notes",
  "data": {
    "customer_id": "uuid",
    "customer_name": "HimValley Retreat",
    "item_notes": [
      {
        "item_name": "Farm fresh Pizza",
        "total_notes": 4,
        "notes": [
          { "note": "Without Mushroom And Corn", "count": 1, "last_ordered": "2026-04-14T..." },
          { "note": "No Mushroom", "count": 1, "last_ordered": "2026-04-14T..." },
          { "note": "Without Mushroom", "count": 1, "last_ordered": "2026-04-14T..." }
        ]
      },
      {
        "item_name": "Chilly Paneer",
        "total_notes": 1,
        "notes": [
          { "note": "Less Chilly. Gravy.", "count": 1, "last_ordered": "2026-04-14T..." }
        ]
      }
    ],
    "total_unique_items_with_notes": 3
  }
}
```

- Grouped by item name, notes sorted by frequency (most common first)
- Case-insensitive grouping ("spicy" and "Spicy" are counted together)
- Items sorted by total note count descending

---

### 8.2 Order-Level Notes

What order-level instructions does this customer typically give?

```
GET /api/pos/customers/{customer_id}/notes/orders
```

**Response:**

```json
{
  "success": true,
  "message": "5 unique order notes",
  "data": {
    "customer_id": "uuid",
    "customer_name": "Parikshit",
    "order_notes": [
      { "note": "test order. dont prepare.", "count": 2, "last_used": "2025-10-23 16:33:34" },
      { "note": "wohoo", "count": 1, "last_used": "2025-10-09 13:40:50" },
      { "note": "no plastic cutlery", "count": 1, "last_used": "2025-11-04 16:30:49" }
    ],
    "total_orders_with_notes": 6
  }
}
```

- Sorted by frequency descending
- Case-insensitive grouping
- Empty/null notes are excluded

---

## 9. WhatsApp Event Triggers

Trigger WhatsApp messages for order lifecycle events.

```
POST /api/pos/events
```

**Request:**

```json
{
  "pos_id": "mygenie",
  "restaurant_id": "509",
  "event_type": "order_confirmed",
  "order_id": "ORD-12345",
  "customer_phone": "9876543210",
  "event_data": {
    "customer_name": "Raj Kumar",
    "order_amount": 850.0
  }
}
```

**Supported `event_type` values:**

| Event | Description |
|-------|-------------|
| `new_order_customer` | Order placed — notify customer |
| `new_order_outlet` | Order placed — notify outlet |
| `order_confirmed` | Order confirmed — customer |
| `order_ready_customer` | Order ready — customer |
| `item_ready` | Specific item ready — customer |
| `order_served` | Order served — customer |
| `item_served` | Item served — customer |
| `order_ready_delivery` | Order ready — delivery boy (requires `event_data.delivery_boy_phone`) |
| `order_dispatched` | Out for delivery — customer |
| `send_bill_manual` | Send bill manually — customer |
| `send_bill_auto` | Auto send bill — customer |

**Response:**

```json
{
  "success": true,
  "message": "Event 'order_confirmed' processed and WhatsApp sent",
  "data": {
    "event_id": "uuid",
    "event_type": "order_confirmed",
    "whatsapp_sent": true
  }
}
```

---

## 10. POS Configuration

### 10.1 Get API Key

**Auth: JWT only** (CRM admin fetches key to configure in POS system)

```
GET /api/pos/api-key
```

**Response:**

```json
{
  "api_key": "dp_live_xxxxxxxxxxxxxxxxxx"
}
```

---

### 10.2 Regenerate API Key

**Auth: JWT only**

```
POST /api/pos/api-key/regenerate
```

**Response:**

```json
{
  "message": "API key regenerated successfully",
  "api_key": "dp_live_new_key_here",
  "warning": "Make sure to update your POS system with the new key"
}
```

---
---

## Quick Reference — All Endpoints

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| **Search & Lookup** | | | |
| 1.1 | GET | `/pos/customers?search=&limit=` | Search (lightweight, typeahead) |
| 1.2 | POST | `/pos/customer-lookup` | Lookup by exact phone |
| 1.3 | GET | `/pos/customers/{id}` | Full details + loyalty + orders |
| **Customer CRUD** | | | |
| 2.1 | POST | `/pos/customers` | Create customer |
| 2.2 | PUT | `/pos/customers/{id}` | Update customer |
| 2.3 | DELETE | `/pos/customers/{id}` | Deactivate (soft delete) |
| **Addresses** | | | |
| 3.1 | GET | `/pos/customers/{id}/addresses` | List addresses |
| 3.2 | POST | `/pos/customers/{id}/addresses` | Add address (with dedup) |
| 3.3 | PUT | `/pos/customers/{id}/addresses/{addr_id}` | Update address |
| 3.4 | DELETE | `/pos/customers/{id}/addresses/{addr_id}` | Delete address |
| 3.5 | PUT | `/pos/customers/{id}/addresses/{addr_id}/default` | Set default |
| **Cross-Restaurant** | | | |
| 4.1 | POST | `/pos/address-lookup` | Address lookup by phone (all restaurants) |
| **Orders** | | | |
| 5.1 | POST | `/pos/orders` | Submit order (webhook) |
| 5.2 | GET | `/pos/customers/{id}/orders?limit=` | Order history |
| **Loyalty** | | | |
| 6.1 | POST | `/pos/max-redeemable` | Max redeemable points for bill |
| 6.2 | GET | `/pos/customers/{id}/loyalty` | Loyalty summary |
| **Coupons** | | | |
| 7.1 | POST | `/pos/coupons/validate?code=&customer_id=&order_value=&channel=` | Validate coupon |
| 7.2 | POST | `/pos/coupons/apply?code=&customer_id=&order_value=&channel=` | Apply coupon |
| **Notes** | | | |
| 8.1 | GET | `/pos/customers/{id}/notes/items` | Item-level note patterns |
| 8.2 | GET | `/pos/customers/{id}/notes/orders` | Order-level note patterns |
| **WhatsApp Events** | | | |
| 9.1 | POST | `/pos/events` | Trigger WhatsApp event |
| **Config** | | | |
| 10.1 | GET | `/pos/api-key` | Get API key (JWT only) |
| 10.2 | POST | `/pos/api-key/regenerate` | Regenerate key (JWT only) |

**Total: 23 endpoints**

---

## Error Codes

| HTTP | Meaning | Example |
|------|---------|---------|
| 200 | Success (check `success` field in body) | `{ "success": true }` or `{ "success": false, "message": "..." }` |
| 401 | Authentication failed | Missing/invalid API key or JWT |
| 404 | Not found (via `success: false` in 200) | Customer or address not found |
| 422 | Validation error | Missing required field, wrong type |
| 500 | Server error | Unexpected failure |

**Note:** Most "not found" errors return HTTP 200 with `success: false` in the body (POS-friendly). Only auth errors return HTTP 401/422.

---

## Integration Checklist

1. Get your API key from CRM Dashboard → Settings → POS Integration
2. Test auth: `curl -H "X-API-Key: your-key" https://your-domain/api/pos/customers?search=test`
3. Start sending orders via `POST /pos/orders`
4. Enable WhatsApp events via `POST /pos/events` (requires WhatsApp templates configured in CRM)
5. Use address endpoints for delivery order flows
6. Display customer notes in POS UI for personalization
