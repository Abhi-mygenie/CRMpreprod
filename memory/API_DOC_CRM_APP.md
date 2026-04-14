# MyGenie CRM — Complete API Documentation

> **Codebase:** `/app/backend/` (FastAPI)
> **Base URL:** `/api`
> **Database:** MongoDB (`mygenie` on 52.66.232.149)
>
> **Status Legend:**
> - **Existing** = Code exists and is functional
> - **Planned** = Endpoint needed but not yet implemented
> - **Deprecated** = Should be removed or replaced

---
---

# SECTION A: CRM App (Native Dashboard)

> **Consumer:** CRM web dashboard (`/app/frontend/`)
> **Auth:** JWT Bearer token (staff/restaurant owner login)
> **Purpose:** Restaurant staff manages customers, loyalty, campaigns, analytics

---

## A1. Authentication (`/api/auth`)

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| A1.1 | Existing | POST | `/auth/register` | Create restaurant owner account |
| A1.2 | Existing | POST | `/auth/login` | Login via MyGenie SSO |
| A1.3 | Deprecated | POST | `/auth/mygenie-login` | Duplicate of /login — called internally, dead endpoint |
| A1.4 | Existing | POST | `/auth/demo-login` | Demo mode login |
| A1.5 | Existing | GET | `/auth/me` | Get current user profile |
| A1.6 | Existing | PUT | `/auth/profile` | Update profile (phone, address) |
| A1.7 | Existing | PUT | `/auth/reset-password` | Change password (logged-in user) |
| A1.8 | Existing | POST | `/auth/forgot-password/request-otp` | Request password reset OTP |
| A1.9 | Existing | POST | `/auth/forgot-password/verify-otp` | Verify OTP, get reset token |
| A1.10 | Existing | POST | `/auth/forgot-password/reset` | Reset password + auto-login |

**Auth:** A1.1–A1.4, A1.8–A1.10 are public. A1.5–A1.7 require JWT.

---

## A2. Customer Management (`/api/customers`)

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| A2.1 | Existing | POST | `/customers` | Create customer |
| A2.2 | Existing | GET | `/customers` | List/search customers (30+ filters, name+phone search, pagination) |
| A2.3 | Existing | GET | `/customers/{id}` | Get single customer |
| A2.4 | Existing | PUT | `/customers/{id}` | Update customer |
| A2.5 | Existing | DELETE | `/customers/{id}` | Delete customer + transactions |
| A2.6 | Existing | GET | `/customers/{id}/loyalty-details` | Loyalty rates + active coupons |
| A2.7 | Existing | GET | `/customers/{id}/insights` | AI insights (top items, frequency, trends) |
| A2.8 | Existing | GET | `/customers/sample-data` | First customer as template preview |
| A2.9 | Existing | GET | `/customers/sync-status` | MyGenie sync progress |
| A2.10 | Existing | POST | `/customers/sync-from-mygenie` | Start background customer sync |
| A2.11 | Existing | GET | `/customers/segments/stats` | Segment statistics |

**Gap:** A2.3 returns customer but **silently drops `addresses[]`** because the Pydantic `Customer` model lacks the field. Staff cannot see customer addresses from the CRM dashboard.

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| A2.12 | Parked | GET | `/customers/{id}/addresses` | **Parked.** Use `GET /pos/customers/{id}/addresses` instead (works with staff JWT). Separate CRM endpoint only needed if behavior diverges from POS. |
| A2.13 | Parked | POST | `/customers/{id}/addresses` | **Parked.** Use `POST /pos/customers/{id}/addresses` |
| A2.14 | Parked | PUT | `/customers/{id}/addresses/{addr_id}` | **Parked.** Use `PUT /pos/customers/{id}/addresses/{addr_id}` |
| A2.15 | Parked | DELETE | `/customers/{id}/addresses/{addr_id}` | **Parked.** Use `DELETE /pos/customers/{id}/addresses/{addr_id}` |

---

## A3. QR Code Registration (`/api/qr`)

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| A3.1 | Existing | GET | `/qr/generate` | Generate QR code (JWT required) |
| A3.2 | Existing | POST | `/qr/register/{restaurant_id}` | Customer self-registers (public, no auth) |

---

## A4. Segments (`/api/segments`)

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| A4.1 | Existing | POST | `/segments` | Create segment |
| A4.2 | Existing | GET | `/segments` | List segments |
| A4.3 | Existing | POST | `/segments/preview-count` | Preview count for filters |
| A4.4 | Existing | GET | `/segments/{id}` | Get segment |
| A4.5 | Existing | GET | `/segments/{id}/customers` | Get matching customers |
| A4.6 | Existing | PUT | `/segments/{id}` | Update segment |
| A4.7 | Existing | DELETE | `/segments/{id}` | Delete segment |
| A4.8 | Existing | GET | `/segments/{id}/whatsapp-config` | Get WhatsApp automation config |
| A4.9 | Existing | POST | `/segments/{id}/whatsapp-config` | Save WhatsApp config |
| A4.10 | Existing | DELETE | `/segments/{id}/whatsapp-config` | Remove WhatsApp config |
| A4.11 | Existing | PATCH | `/segments/{id}/whatsapp-config/toggle` | Pause/resume |
| A4.12 | Existing | GET | `/segments/whatsapp-configs/all` | All configs |

---

## A5. Points (`/api/points`)

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| A5.1 | Existing | POST | `/points/transaction` | Create earn/redeem/bonus transaction |
| A5.2 | Existing | POST | `/points/earn` | Quick earn (bill amount + tier %) |
| A5.3 | Existing | GET | `/points/transactions/{customer_id}` | Transaction history |
| A5.4 | Existing | GET | `/points/expiring/{customer_id}` | Expiring points info |
| A5.5 | Existing | POST | `/points/process-expiry-reminders` | Process reminders (current user) |
| A5.6 | Existing | POST | `/points/expire` | Expire old points |
| A5.7 | Existing | POST | `/points/process-birthday-bonus` | Birthday bonuses |
| A5.8 | Existing | POST | `/points/process-anniversary-bonus` | Anniversary bonuses |

---

## A6. Loyalty Settings (`/api/loyalty`)

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| A6.1 | Existing | GET | `/loyalty/settings` | Get configuration |
| A6.2 | Existing | PUT | `/loyalty/settings` | Update configuration |

---

## A7. Wallet (`/api/wallet`)

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| A7.1 | Existing | POST | `/wallet/transaction` | Credit/debit wallet |
| A7.2 | Existing | GET | `/wallet/transactions/{customer_id}` | History |
| A7.3 | Existing | GET | `/wallet/balance/{customer_id}` | Balance |

---

## A8. Coupons (`/api/coupons`)

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| A8.1 | Existing | POST | `/coupons` | Create coupon |
| A8.2 | Existing | GET | `/coupons` | List coupons |
| A8.3 | Existing | GET | `/coupons/{id}` | Get coupon |
| A8.4 | Existing | PUT | `/coupons/{id}` | Update coupon |
| A8.5 | Existing | DELETE | `/coupons/{id}` | Delete coupon |
| A8.6 | Existing | POST | `/coupons/{id}/toggle` | Activate/deactivate |
| A8.7 | Existing | POST | `/coupons/validate` | Validate coupon (full checks) |
| A8.8 | Existing | POST | `/coupons/apply` | Apply coupon + record usage |
| A8.9 | Existing | GET | `/coupons/{id}/usage` | Usage history |

---

## A9. Feedback (`/api/feedback`)

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| A9.1 | Existing | POST | `/feedback` | Create feedback |
| A9.2 | Existing | GET | `/feedback` | List feedback |
| A9.3 | Existing | PUT | `/feedback/{id}/resolve` | Mark resolved |

---

## A10. Analytics (`/api/analytics`)

| # | Status | Method | Route | Source File | Purpose |
|---|--------|--------|-------|-------------|---------|
| A10.1 | Existing | GET | `/analytics/dashboard` | feedback.py | Full dashboard stats |
| A10.2 | Existing | GET | `/analytics/item-performance` | analytics.py | Menu item analytics |
| A10.3 | Existing | GET | `/analytics/item-performance/export` | analytics.py | Export |
| A10.4 | Existing | GET | `/analytics/item-customers/{item_name}` | analytics.py | Customers for item |
| A10.5 | Existing | GET | `/analytics/customer-lifecycle` | analytics.py | Lifecycle stages |
| A10.6 | Existing | GET | `/analytics/customer-lifecycle/trend` | analytics.py | Trend |
| A10.7 | Existing | GET | `/analytics/customer-lifecycle/customers` | analytics.py | Customers in stage |
| A10.8 | Existing | GET | `/analytics/customer-lifecycle/export` | analytics.py | Export |

---

## A11. WhatsApp (`/api/whatsapp`)

### Internal Templates

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| A11.1 | Existing | POST | `/whatsapp/setup-defaults` | Create default templates + rules |
| A11.2 | Existing | POST | `/whatsapp/templates` | Create template |
| A11.3 | Existing | GET | `/whatsapp/templates` | List templates |
| A11.4 | Existing | GET | `/whatsapp/templates/{id}` | Get template |
| A11.5 | Existing | PUT | `/whatsapp/templates/{id}` | Update template |
| A11.6 | Existing | DELETE | `/whatsapp/templates/{id}` | Delete template |

### Custom Templates (AuthKey/Meta)

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| A11.7 | Existing | POST | `/whatsapp/custom-templates` | Create |
| A11.8 | Existing | GET | `/whatsapp/custom-templates` | List |
| A11.9 | Existing | PUT | `/whatsapp/custom-templates/{id}` | Update |
| A11.10 | Existing | DELETE | `/whatsapp/custom-templates/{id}` | Delete |
| A11.11 | Existing | PUT | `/whatsapp/custom-templates/{id}/submit` | Submit for approval |
| A11.12 | Existing | POST | `/whatsapp/meta/create-template` | Create via Meta API |
| A11.13 | Existing | POST | `/whatsapp/authkey/sync-templates` | Sync from AuthKey |
| A11.14 | Existing | POST | `/whatsapp/create-and-sync-template` | Create + sync |

### Automation Rules

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| A11.15 | Existing | POST | `/whatsapp/automation` | Create rule |
| A11.16 | Existing | GET | `/whatsapp/automation` | List rules |
| A11.17 | Existing | GET | `/whatsapp/automation/events` | Available events |
| A11.18 | Existing | GET | `/whatsapp/automation/{id}` | Get rule |
| A11.19 | Existing | PUT | `/whatsapp/automation/{id}` | Update rule |
| A11.20 | Existing | DELETE | `/whatsapp/automation/{id}` | Delete rule |
| A11.21 | Existing | POST | `/whatsapp/automation/{id}/toggle` | Enable/disable |
| A11.22 | Existing | GET | `/whatsapp/automation-with-templates` | Rules with templates |

### Event-Template Mapping

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| A11.23 | Existing | PUT | `/whatsapp/event-template-map` | Map event to template |
| A11.24 | Existing | POST | `/whatsapp/event-template-map/{key}/toggle` | Toggle event |
| A11.25 | Existing | GET | `/whatsapp/event-template-map` | Get all mappings |
| A11.26 | Existing | DELETE | `/whatsapp/event-template-map/{key}` | Remove mapping |
| A11.27 | Existing | GET | `/whatsapp/template-variable-map` | Get variable maps |
| A11.28 | Existing | PUT | `/whatsapp/template-variable-map/{id}` | Update variable map |

### Settings & Messaging

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| A11.29 | Existing | GET | `/whatsapp/api-key` | Get AuthKey/Meta credentials |
| A11.30 | Existing | PUT | `/whatsapp/api-key` | Save credentials |
| A11.31 | Existing | GET | `/whatsapp/authkey-templates` | Fetch from AuthKey API |
| A11.32 | Existing | POST | `/whatsapp/test-template` | Send test message |
| A11.33 | Existing | GET | `/whatsapp/message-stats` | Delivery stats |
| A11.34 | Existing | GET | `/whatsapp/message-logs` | Message history |
| A11.35 | Existing | GET | `/whatsapp/message-filters` | Filter options |
| A11.36 | Existing | POST | `/whatsapp/status-callback` | Delivery webhook (public) |
| A11.37 | Existing | POST | `/whatsapp/resend` | Resend failed message |

---

## A12. Migration (`/api/migration`)

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| A12.1 | Existing | GET | `/migration/status` | Migration status |
| A12.2 | Existing | POST | `/migration/skip-permanently` | Skip migration |
| A12.3 | Existing | POST | `/migration/confirm` | Start migration |
| A12.4 | Existing | POST | `/migration/revert` | Revert full |
| A12.5 | Existing | POST | `/migration/revert-customers` | Revert customers |
| A12.6 | Existing | POST | `/migration/revert-orders` | Revert orders |
| A12.7 | Existing | POST | `/migration/sync-orders` | Sync orders |
| A12.8 | Existing | GET | `/migration/sync-orders/status` | Sync progress |

---

## A13. Cron Jobs (`/api/cron`)

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| A13.1 | Existing | GET | `/cron/status` | Scheduler status |
| A13.2 | Existing | POST | `/cron/trigger` | Run jobs for current user |
| A13.3 | Existing | POST | `/cron/trigger-all-users` | Run jobs for all users |

---

## A14. Messaging (`/api/messaging`)

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| A14.1 | Existing | POST | `/messaging/send` | Send message (MOCK) |

---

## A15. Root (`/api`)

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| A15.1 | Existing | GET | `/` | API info |
| A15.2 | Existing | GET | `/health` | Health check |

---

### CRM Section Totals: 82 Existing + 4 Planned = 86

---
---

# SECTION B: POS Gateway

> **Consumer:** POS systems (MyGenie, Petpooja, Ezzo, or any future POS)
> **Auth:** `X-API-Key` header (restaurant-specific API key)
> **Purpose:** POS sends customer data, orders, events. POS reads customer loyalty info, addresses.
>
> **Design Principle:** POS-agnostic. Every request includes `pos_id` + `restaurant_id` so the same endpoints work for any POS provider. MyGenie is just the first integration — it gets no special treatment at the API level.

---

## B1. POS Onboarding & Auth

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| B1.1 | Existing | GET | `/pos/api-key` | Get API key (JWT auth — CRM admin fetches key to configure POS) |
| B1.2 | Existing | POST | `/pos/api-key/regenerate` | Regenerate API key (JWT auth) |

---

## B2. Customer Search & Lookup

| # | Status | Method | Route | Purpose | Response |
|---|--------|--------|-------|---------|----------|
| B2.1 | Existing | POST | `/pos/customer-lookup` | Lookup by exact phone | Lightweight: name, phone, tier, points, wallet, visits, spent, allergies, favorites. **No addresses.** |
| B2.2 | Planned | GET | `/pos/customers?search=&limit=` | Search by name OR phone (partial match) | Lightweight list: id, name, phone, tier, points, wallet_balance. For POS cashier typeahead. |
| B2.3 | Planned | GET | `/pos/customers/{id}` | Full customer details | Everything: profile, loyalty, preferences, dietary, **addresses[]**, order summary. For POS customer detail screen. |

**B2.1 Gap:** Current `/pos/customer-lookup` returns no address data. Needs `addresses[]` added to response.

**B2.2 Design Notes:**
- Partial match on both name and phone (regex, case-insensitive)
- Default limit: 10 (POS typeahead doesn't need 100 results)
- Scoped to `user_id` (restaurant's own customers)
- Sorted by `last_visit` desc (most recent first)

**B2.3 Design Notes:**
- Returns the full customer doc including `addresses[]` array
- Includes computed fields: `points_monetary_value`, `next_tier_threshold`
- Includes last 5 orders summary

---

## B3. Customer CRUD

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| B3.1 | Existing | POST | `/pos/customers` | Create customer from POS |
| B3.2 | Existing | PUT | `/pos/customers/{id}` | Update customer from POS |
| B3.3 | Planned | DELETE | `/pos/customers/{id}` | Soft-delete / deactivate customer from POS |

**B3.1–B3.2 Gap:** These endpoints accept flat address fields (`address`, `city`, `pincode`) but do NOT write to the `addresses[]` array. They also cannot read back the `addresses[]` data. The Pydantic models (`POSCustomerCreate`, `POSCustomerUpdate`) don't include `addresses`.

---

## B4. Customer Addresses

> **Data model:** Addresses live as an array on the customer document: `customers.addresses[]`
> **Each address has:** `id`, `address_type`, `address`, `house`, `floor`, `road`, `city`, `state`, `pincode`, `country`, `latitude`, `longitude`, `contact_person_name`, `contact_person_number`, `delivery_instructions`, `is_default`, `pos_address_id`, `zone_id`

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| B4.1 | Planned | GET | `/pos/customers/{id}/addresses` | List all addresses for a customer |
| B4.2 | Planned | POST | `/pos/customers/{id}/addresses` | Add a new address |
| B4.3 | Planned | PUT | `/pos/customers/{id}/addresses/{addr_id}` | Update a specific address |
| B4.4 | Planned | DELETE | `/pos/customers/{id}/addresses/{addr_id}` | Delete a specific address |
| B4.5 | Planned | PUT | `/pos/customers/{id}/addresses/{addr_id}/default` | Set as default address |

**B4.1 Response:**
```json
{
  "success": true,
  "data": {
    "customer_id": "...",
    "addresses": [
      {
        "id": "addr_xxx",
        "is_default": true,
        "address_type": "Home",
        "address": "123 MG Road",
        "house": "A-101",
        "floor": "1st",
        "city": "Bangalore",
        "state": "Karnataka",
        "pincode": "560001",
        "latitude": "12.97",
        "longitude": "77.59",
        "contact_person_name": "Raj",
        "contact_person_number": "9876543210",
        "delivery_instructions": "Ring bell",
        "pos_address_id": null,
        "zone_id": null
      }
    ],
    "total": 1
  }
}
```

**B4.2 Design Notes:**
- Auto-generates `addr_` prefixed ID
- If `is_default: true`, unset default on all other addresses
- Dedup check: if same `address + pincode` already exists, update `last_used_at` instead of creating duplicate
- `pos_address_id` allows POS to link to its own address system
- `zone_id` for delivery zone mapping

**B4.5 Design Notes:**
- Sets `is_default: true` on target, `is_default: false` on all others
- Returns updated address list

---

## B5. Cross-Restaurant Address Lookup

> For delivery: when a customer orders from a NEW restaurant, POS can look up addresses saved at OTHER restaurants.

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| B5.1 | Planned | POST | `/pos/address-lookup` | Lookup addresses by phone across all restaurants |

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
  "data": {
    "phone": "9876543210",
    "addresses": [
      {
        "address": "123 MG Road",
        "city": "Bangalore",
        "state": "Karnataka",
        "pincode": "560001",
        "latitude": "12.97",
        "longitude": "77.59",
        "address_type": "Home",
        "last_used_at": "2026-04-10T...",
        "source_restaurant": "Pizzeria Roma"
      }
    ]
  }
}
```

**Design Notes:**
- Queries `customers` collection across all `user_id` values, matching by `phone`
- Aggregates and deduplicates `addresses[]` entries
- Returns `source_restaurant` for POS context (B2B — restaurants are on the same platform)
- Does NOT return `contact_person_*` or `delivery_instructions` (those are restaurant-specific)

---

## B6. Orders

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| B6.1 | Existing | POST | `/pos/orders` | Full order webhook (items, points, wallet, WhatsApp triggers) |
| B6.2 | **DEPRECATED** | POST | `/pos/webhook/payment-received` | Legacy payment webhook. Missing coupon validations, no items, no wallet, no WhatsApp. **May still be in active use by MyGenie POS.** Use B6.1 `/pos/orders` instead. See POS_API.md Section 5.2 for migration path. |
| B6.3 | Planned | GET | `/pos/customers/{id}/orders?limit=` | Order history for a customer (POS needs this for "previous orders" display) |

**B6.1 Gap:** The `address_id` field exists in the order schema (`POSOrderWebhook.address_id`) but is stored as-is without resolving to an actual address. POS should send `address_id` referencing a customer's `addresses[].id`, and the order should store the resolved address snapshot.

---

## B7. Loyalty Operations

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| B7.1 | Existing | POST | `/pos/max-redeemable` | Calculate max redeemable points for a bill |
| B7.2 | Planned | GET | `/pos/customers/{id}/loyalty` | Get loyalty summary: points, tier, wallet, tier progress, points monetary value |

**B7.2 Response:**
```json
{
  "success": true,
  "data": {
    "total_points": 1500,
    "points_monetary_value": 375.00,
    "tier": "Gold",
    "next_tier": "Platinum",
    "points_to_next_tier": 3500,
    "wallet_balance": 250.00,
    "total_visits": 42,
    "total_spent": 18500.00,
    "earn_rate_percent": 10.0,
    "redemption_value_per_point": 0.25
  }
}
```

---

## B8. Coupon Operations (POS)

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| B8.1 | Planned | POST | `/pos/coupons/validate` | Validate coupon from POS (API key auth version of A8.7) |
| B8.2 | Planned | POST | `/pos/coupons/apply` | Apply coupon from POS (API key auth version of A8.8) |

**Why needed:** The existing `/coupons/validate` and `/coupons/apply` use JWT auth (CRM staff). POS needs the same with API key auth. The legacy `/pos/webhook/payment-received` has inline coupon logic that skips `per_user_limit`, `specific_users`, and `applicable_channels` checks — these planned endpoints fix that.

---

## B9. POS Events (WhatsApp Triggers)

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| B9.1 | Existing | POST | `/pos/events` | Trigger WhatsApp event (order confirmed, ready, dispatched, served, bill) |

**Supported events:** `new_order_customer`, `new_order_outlet`, `order_confirmed`, `order_ready_customer`, `item_ready`, `order_served`, `item_served`, `order_ready_delivery`, `order_dispatched`, `send_bill_manual`, `send_bill_auto`

---

### POS Section Totals: 11 Existing + 12 Planned + 1 Deprecated = 24

### MyGenie Handshake (Implemented)

Login response (`POST /api/auth/login`) includes `pos_config` with `api_key`, `api_base_url`, and 15 `webhook_endpoints` — enabling MyGenie POS to auto-configure CRM API calls on login. `pos_config` is `null` for demo login. See POS_API.md Appendix A for full response spec.

---
---

# SECTION C: Scan & Order (Customer-Facing App)

> **Consumer:** Customer-facing mobile/web app (scan QR → browse menu → order → manage profile)
> **Auth:** Customer OTP token (phone-based OTP login, per-restaurant context)
> **Purpose:** End customers manage their profile, addresses, view loyalty, place orders
>
> **Current State:** This app exists as a SEPARATE service sharing the same MongoDB. The endpoints below list what SHOULD live in this CRM backend for consolidation. Data already exists in MongoDB (written by the other app).

---

## C1. Customer Authentication

> **Auth flow:** Customer enters phone → receives OTP → verifies → gets session token scoped to a restaurant

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| C1.1 | Planned | POST | `/scan/auth/request-otp` | Send OTP to customer phone (per restaurant context) |
| C1.2 | Planned | POST | `/scan/auth/verify-otp` | Verify OTP, return customer session token |
| C1.3 | Planned | GET | `/scan/auth/me` | Get customer profile (authenticated) |
| C1.4 | Planned | POST | `/scan/auth/register` | Register new customer with password (optional, OTP is primary) |
| C1.5 | Planned | POST | `/scan/auth/login` | Login with phone + password (alternative to OTP) |

**Data exists:** `customer_otps` collection (14 docs), `customers.password_hash` (8 customers)

**C1.1 Design Notes:**
- Request: `{ "phone": "9876543210", "restaurant_id": "pos_0001_restaurant_509" }`
- Generates 6-digit OTP, stores in `customer_otps`, sends via WhatsApp/SMS
- 10-minute expiry

**C1.2 Design Notes:**
- Request: `{ "phone": "9876543210", "otp": "490781", "restaurant_id": "..." }`
- Returns JWT token with `customer_id` + `restaurant_id` claims
- Creates customer record if first time (links to restaurant)

---

## C2. Customer Profile

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| C2.1 | Planned | GET | `/scan/profile` | Get my profile (name, phone, email, loyalty info) |
| C2.2 | Planned | PUT | `/scan/profile` | Update my profile (name, email, dob, anniversary, preferences) |
| C2.3 | Planned | GET | `/scan/loyalty` | My loyalty summary (points, tier, wallet, tier progress) |
| C2.4 | Planned | GET | `/scan/points/history?limit=` | My points transaction history |
| C2.5 | Planned | GET | `/scan/wallet/history?limit=` | My wallet transaction history |
| C2.6 | Planned | GET | `/scan/orders?limit=` | My order history |
| C2.7 | Planned | GET | `/scan/orders/{order_id}` | Single order detail |
| C2.8 | Planned | GET | `/scan/coupons` | Available coupons for me |

---

## C3. Customer Addresses

> **Same `customers.addresses[]` array as POS, different auth and response shape.**
> Customer manages their OWN addresses only. No cross-restaurant lookup.

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| C3.1 | Planned | GET | `/scan/addresses` | List my addresses |
| C3.2 | Planned | POST | `/scan/addresses` | Add new address |
| C3.3 | Planned | PUT | `/scan/addresses/{addr_id}` | Update my address |
| C3.4 | Planned | DELETE | `/scan/addresses/{addr_id}` | Delete my address |
| C3.5 | Planned | PUT | `/scan/addresses/{addr_id}/default` | Set default |

**Data exists:** 20 customers already have `addresses[]` with the full schema.

**C3.2 Design Notes:**
- Same address schema as POS (B4)
- Dedup: prevent exact duplicate `address + pincode` for same customer
- Cap: max 10 addresses per customer (evict oldest unused if exceeded)
- `latitude/longitude` from customer's device GPS or map picker

**Difference from POS (B4):**

| | POS (B4) | Scan & Order (C3) |
|---|---|---|
| Auth | API Key (`X-API-Key`) | Customer OTP Token |
| Scope | Any customer the restaurant owns | Only the authenticated customer's own addresses |
| Cross-restaurant | B5.1 allows cross-restaurant lookup | No — customer sees only their addresses for this restaurant |
| Who calls | POS server (backend-to-backend) | Customer's browser/app (frontend) |
| `pos_address_id` | POS can set this to link to its system | Customer doesn't set this |

---

## C4. Restaurant App Configuration

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| C4.1 | Planned | GET | `/scan/config/{restaurant_id}` | Get restaurant app config (colors, logo, banners, features) |
| C4.2 | Planned | PUT | `/scan/config/{restaurant_id}` | Update config (CRM admin only, JWT auth) |

**Data exists:** `customer_app_config` collection (28 docs)

**C4.1 Design Notes:**
- Public endpoint (customer app fetches on load, no auth needed)
- Returns branding (colors, fonts, logo), feature toggles (showCallWaiter, showPayBill), banners, about us, contact info, social links, nav menu order
- Cached aggressively (changes rarely)

**C4.2 Design Notes:**
- Protected by JWT (CRM admin updates branding from dashboard)
- NOT customer-accessible

---

## C5. Menu & Dietary Tags

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| C5.1 | Planned | GET | `/scan/menu/dietary-tags/{restaurant_id}` | Get dietary tag mappings for menu items |
| C5.2 | Planned | PUT | `/scan/menu/dietary-tags/{restaurant_id}` | Update mappings (CRM admin, JWT auth) |

**Data exists:** `dietary_tags_mapping` collection (5 docs). Maps food IDs to tags: `jain`, `vegan`, `gluten-free`, `lactose-free`, `high-protein`.

---

## C6. Customer Actions

| # | Status | Method | Route | Purpose |
|---|--------|--------|-------|---------|
| C6.1 | Planned | POST | `/scan/feedback` | Submit feedback (rating + message) |
| C6.2 | Planned | POST | `/scan/call-waiter` | Call waiter (dine-in) |
| C6.3 | Planned | POST | `/scan/request-bill` | Request bill (dine-in) |

**Data reference:** `customer_app_config.showCallWaiter`, `showPayBill`, `feedbackEnabled`

---

### Scan & Order Section Totals: 0 Existing + 22 Planned = 22

---
---

# Summary

| Section | Consumer | Auth | Existing | Planned | Deprecated | Total |
|---------|----------|------|----------|---------|------------|-------|
| **A. CRM App** | Dashboard staff | JWT | 82 | 4 | 1 | 87 |
| **B. POS Gateway** | POS systems | API Key | 11 | 12 | 1 | 24 |
| **C. Scan & Order** | End customers | OTP Token | 0 | 22 | 0 | 22 |
| **Total** | | | **93** | **38** | **2** | **133** |

---

## Shared Data: Address Array Ownership

```
                    customers.addresses[]
                           │
              ┌────────────┼────────────┐
              │            │            │
         B4 (POS)    C3 (Customer)  A2 (CRM)
         API Key      OTP Token      JWT
              │            │            │
         Read/Write   Read/Write    Read/Write
         Any cust     Own only      Any cust
         + cross-     No cross-     Staff view
         restaurant   restaurant    + manage
         (B5.1)
```

All three write to the SAME `addresses[]` array on the customer document. Dedup logic must be shared (helper function) to prevent duplicates regardless of which section writes.
