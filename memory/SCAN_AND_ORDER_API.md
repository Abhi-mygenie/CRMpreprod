# Scan & Order — API Endpoint Reference

**Purpose:** Complete API reference for building a customer-facing self-ordering web app (scan QR → login → browse → order → track).  
**Base URL:** `https://your-domain.com/api`  
**Last Updated:** 2026-04-13

---

## Flow Overview

```
┌─────────────────────────────────────────────────────────────┐
│  CUSTOMER SCANS QR CODE                                     │
│  QR contains: restaurant_id (user_id)                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: LOGIN (OTP or Password)                            │
│  POST /customer/send-otp    → Send OTP                      │
│  POST /customer/verify-otp  → Get token + profile           │
│  --- OR ---                                                 │
│  POST /customer/register    → Sign up with password         │
│  POST /customer/login       → Login with password           │
│  POST /customer/forgot-password → Send reset OTP            │
│  POST /customer/reset-password  → OTP + new password        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: BROWSE PROFILE & LOYALTY                           │
│  GET /customer/me            → Full profile + addresses     │
│  GET /customer/me/points     → Points balance & history     │
│  GET /customer/me/wallet     → Wallet balance & history     │
│  GET /customer/me/orders     → Past order history           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 3: SELECT DELIVERY ADDRESS                            │
│  GET  /customer/me/addresses              → List saved      │
│  POST /customer/me/addresses              → Add new         │
│  PUT  /customer/me/addresses/{id}         → Edit            │
│  DELETE /customer/me/addresses/{id}       → Remove          │
│  POST /customer/me/addresses/{id}/set-default → Set default │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 4: CHECKOUT                                           │
│  POST /coupons/validate      → Validate coupon code         │
│  POST /pos/max-redeemable    → Check redeemable points      │
│  POST /pos/orders            → Place order                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 5: POST-ORDER (WhatsApp notifications auto-triggered) │
│  POST /feedback              → Submit feedback/rating       │
└─────────────────────────────────────────────────────────────┘
```

---

## Authentication

All endpoints after login use **Customer Token** (from verify-otp):

```
Authorization: Bearer {customer_token}
```

Token is valid for **24 hours** and contains `customer_id`, `phone`, and `user_id` (restaurant).

---

## STEP 1: Login

Customers can authenticate via **OTP** (phone only) or **Password** (phone + password). Both return the same `customer_token`.

### Option A: OTP Login

### POST `/customer/send-otp`
Send OTP to customer's phone number.

**Auth:** None

**Request:**
```json
{
  "phone": "9876543210",
  "user_id": "pos_0001_restaurant_509",
  "country_code": "91"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| phone | string | Yes | Customer phone number |
| user_id | string | **Yes** | Restaurant ID from QR code |
| country_code | string | No | Default: 91 |

**Response (200):**
```json
{
  "success": true,
  "message": "OTP sent to +91 9876543210",
  "expires_in_minutes": 10,
  "restaurant_name": "Pav & Pages Cafe"
}
```

**Errors:** `404` Restaurant not found | `404` Customer not found (not registered)

---

### POST `/customer/verify-otp`
Verify OTP and receive auth token + full customer profile.

**Auth:** None

**Request:**
```json
{
  "phone": "9876543210",
  "otp": "453559",
  "user_id": "pos_0001_restaurant_509",
  "country_code": "91"
}
```

**Response (200):**
```json
{
  "success": true,
  "token": "eyJhbG...",
  "token_type": "bearer",
  "expires_in_hours": 24,
  "customer": { ... full profile ... }
}
```

**Errors:** `400` Invalid OTP | `400` OTP expired

---

### Option B: Password Login

### POST `/customer/register`
Register with phone + password. If phone already exists → links password. If not → creates new customer.

**Auth:** None

**Request:**
```json
{
  "phone": "9876543210",
  "password": "mypassword",
  "user_id": "pos_0001_restaurant_509",
  "name": "Vivan",
  "email": "vivan@email.com",
  "country_code": "+91"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| phone | string | Yes | Customer phone number |
| password | string | Yes | Min 6 characters |
| user_id | string | **Yes** | Restaurant ID from QR code |
| name | string | No | Customer name (defaults to phone if not provided) |
| email | string | No | Email address |
| country_code | string | No | Default: +91 |

**Response (200):**
```json
{
  "success": true,
  "message": "Registration successful",
  "token": "eyJhbG...",
  "token_type": "bearer",
  "expires_in_hours": 24,
  "is_new_customer": true,
  "customer": { ... full profile ... }
}
```

**Behavior:**
- Phone exists + no password set → links password to existing customer (`is_new_customer: false`)
- Phone exists + password already set → returns `400: Account already exists. Please login.`
- Phone doesn't exist → creates new customer with first-visit bonus if enabled (`is_new_customer: true`)

**Errors:** `400` Password too short | `400` Account already exists | `404` Restaurant not found

---

### POST `/customer/login`
Login with phone + password.

**Auth:** None

**Request:**
```json
{
  "phone": "9876543210",
  "password": "mypassword",
  "user_id": "pos_0001_restaurant_509"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbG...",
  "token_type": "bearer",
  "expires_in_hours": 24,
  "customer": { ... full profile ... }
}
```

**Errors:** `401` Invalid password | `404` Customer not found | `400` No password set (use OTP)

---

### POST `/customer/forgot-password`
Send OTP to reset password.

**Auth:** None

**Request:**
```json
{
  "phone": "9876543210",
  "user_id": "pos_0001_restaurant_509"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "OTP sent to +91 9876543210",
  "expires_in_minutes": 10,
  "restaurant_name": "Pav & Pages Cafe"
}
```

**Errors:** `404` Restaurant not found | `404` Customer not found

---

### POST `/customer/reset-password`
Verify OTP and set new password.

**Auth:** None

**Request:**
```json
{
  "phone": "9876543210",
  "otp": "617417",
  "user_id": "pos_0001_restaurant_509",
  "new_password": "newpassword123"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Password reset successful. You can now login with your new password."
}
```

**Errors:** `400` Invalid OTP | `400` OTP expired | `400` Password too short

---

## STEP 2: Profile & Loyalty

### GET `/customer/me`
Refresh full customer profile (same data as verify-otp customer object).

**Auth:** Customer Token

```bash
curl -H "Authorization: Bearer {token}" /api/customer/me
```

---

### GET `/customer/me/points`
Points balance, tier, expiring info, and transaction history.

**Auth:** Customer Token  
**Query:** `limit` (default: 50)

**Response (200):**
```json
{
  "total_points": 1500,
  "points_value": 375.00,
  "total_earned": 2000,
  "total_redeemed": 500,
  "tier": "Gold",
  "expiring_soon": 200,
  "transactions": [
    {
      "id": "tx-001",
      "type": "earn",
      "points": 75,
      "description": "Points earned from order",
      "created_at": "2026-04-10T14:30:00+00:00"
    }
  ]
}
```

**Transaction types:** `earn`, `redeem`, `bonus`, `expired`

---

### GET `/customer/me/wallet`
Wallet balance and transaction history.

**Auth:** Customer Token  
**Query:** `limit` (default: 50)

**Response (200):**
```json
{
  "wallet_balance": 250.00,
  "total_received": 1000.00,
  "total_used": 750.00,
  "transactions": [
    {
      "id": "wtx-001",
      "type": "credit",
      "amount": 500.00,
      "description": "Wallet recharge",
      "payment_method": "upi",
      "balance_after": 750.00,
      "created_at": "2026-04-10T14:30:00+00:00"
    }
  ]
}
```

**Transaction types:** `credit`, `debit`

---

### GET `/customer/me/orders`
Past order history with items and delivery address.

**Auth:** Customer Token  
**Query:** `limit` (default: 50), `skip` (default: 0)

**Response (200):**
```json
{
  "total_orders": 25,
  "orders": [
    {
      "id": "order-uuid-001",
      "order_id": "007172",
      "order_amount": 570.00,
      "delivery_charge": 30.00,
      "order_type": "delivery",
      "order_status": "delivered",
      "payment_method": "upi",
      "payment_status": "paid",
      "coupon_code": "SAVE10",
      "coupon_discount": 57.00,
      "points_earned": 25,
      "delivery_address": {
        "contact_person_name": "Vivan",
        "address": "123 Main Street, Shoghi",
        "pincode": "171219",
        "house": "first floor"
      },
      "order_notes": "Less spicy",
      "items": [
        {"item_name": "Farm Fresh Pizza", "item_qty": 1, "item_price": 350.00},
        {"item_name": "Masala Dosa", "item_qty": 2, "item_price": 110.00}
      ],
      "created_at": "2026-04-10T14:30:00"
    }
  ]
}
```

**Order types:** `pos` (dine-in), `take_away`, `delivery`  
**Note:** `delivery_address` is `null` for non-delivery orders.

---

## STEP 3: Delivery Address Management

### GET `/customer/me/addresses`
List all saved addresses.

**Auth:** Customer Token

**Response (200):**
```json
{
  "customer_id": "550e8400-...",
  "addresses": [
    {
      "id": "addr_abc123",
      "pos_address_id": 2010,
      "is_default": true,
      "address_type": "Home",
      "address": "123 Main Street, Shoghi",
      "house": "A-101",
      "floor": "1st",
      "road": "Main Road",
      "city": "Shimla",
      "state": "HP",
      "pincode": "171219",
      "country": "India",
      "latitude": "31.0537",
      "longitude": "77.1273",
      "contact_person_name": "Vivan",
      "contact_person_number": "9876543210",
      "delivery_instructions": "Ring bell at gate"
    }
  ],
  "total": 1
}
```

---

### POST `/customer/me/addresses`
Add new delivery address. First address auto-becomes default.

**Auth:** Customer Token

**Request:**
```json
{
  "address_type": "Work",
  "address": "Office Park, Sector 5",
  "house": "B-201",
  "floor": "2nd",
  "road": "Near Metro Station",
  "city": "Shimla",
  "state": "HP",
  "pincode": "171001",
  "country": "India",
  "latitude": "31.1048",
  "longitude": "77.1734",
  "contact_person_name": "Vivan",
  "contact_person_number": "9876543210",
  "delivery_instructions": "Ask for Vivan at reception"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| address_type | string | No | Home / Work / Other (default: Home) |
| address | string | Yes* | Street address |
| house | string | No | Flat/House number |
| floor | string | No | Floor |
| road | string | No | Road / Landmark |
| city | string | Yes* | City |
| state | string | No | State |
| pincode | string | Yes* | Pincode |
| country | string | No | Default: India |
| latitude | string | No | GPS lat |
| longitude | string | No | GPS lng |
| contact_person_name | string | No | Delivery contact name |
| contact_person_number | string | No | Delivery contact phone |
| delivery_instructions | string | No | Special notes for delivery |

*At least one of `address`, `city`, or `pincode` required.

**Response (200):** Created address object with generated `id`

**Errors:** `400` Validation — at least address/city/pincode required

---

### PUT `/customer/me/addresses/{address_id}`
Update an existing address. Send only fields to change.

**Auth:** Customer Token

**Request:**
```json
{
  "delivery_instructions": "Ring bell at gate 2",
  "floor": "3rd"
}
```

**Response (200):** Updated address object

**Errors:** `404` Address not found

---

### DELETE `/customer/me/addresses/{address_id}`
Delete an address. If default is deleted, next address becomes default.

**Auth:** Customer Token

**Response (200):**
```json
{
  "message": "Address deleted",
  "remaining_addresses": 2
}
```

**Errors:** `404` Address not found

---

### POST `/customer/me/addresses/{address_id}/set-default`
Set an address as the default delivery address.

**Auth:** Customer Token

**Response (200):** Updated address object with `is_default: true`

**Errors:** `404` Address not found

---

## STEP 4: Checkout & Place Order

### POST `/coupons/validate`
Check if a coupon code is valid before applying.

**Auth:** Customer Token (or Admin Token)

**Request (query params):**
| Param | Type | Description |
|-------|------|-------------|
| code | string | Coupon code (e.g., SAVE10) |
| customer_id | string | Customer ID |
| order_value | float | Cart total |
| channel | string | `delivery` / `takeaway` / `dine_in` |

**Response (200):**
```json
{
  "valid": true,
  "coupon": {
    "code": "SAVE10",
    "discount_type": "percentage",
    "discount_value": 10,
    "max_discount": 100
  },
  "discount": 57.00,
  "final_amount": 513.00
}
```

**Errors:** `400` Invalid/expired coupon | `400` Min order value not met | `400` Usage limit exceeded

---

### POST `/pos/max-redeemable`
Check how many points the customer can redeem on this order.

**Auth:** X-API-Key

**Request:**
```json
{
  "pos_id": "mygenie",
  "restaurant_id": "509",
  "cust_mobile": "9876543210",
  "bill_amount": 1000.00
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "max_redeemable_points": 500,
    "max_discount": 125.00,
    "current_points": 1500,
    "redemption_value": 0.25,
    "max_redemption_percent": 50,
    "max_redemption_amount": 500
  }
}
```

**Logic:** Capped by `max_redemption_percent` of bill, `max_redemption_amount`, and available points.

---

### POST `/pos/orders`
Place the order. Triggers loyalty points calculation, wallet deduction, and WhatsApp notifications.

**Auth:** X-API-Key

**Request:**
```json
{
  "pos_id": "mygenie",
  "restaurant_id": "509",
  "order_id": "SCAN-001",
  "cust_mobile": "9876543210",
  "cust_name": "Vivan",
  "order_amount": 570.00,
  "delivery_charge": 30.00,
  "wallet_used": 100.00,
  "coupon_code": "SAVE10",
  "redeem_points": 200,
  "payment_status": "success",
  "payment_method": "upi",
  "order_type": "delivery",
  "delivery_address": {
    "address": "123 Main Street, Shoghi",
    "city": "Shimla",
    "pincode": "171219",
    "house": "A-101",
    "contact_person_name": "Vivan",
    "contact_person_number": "9876543210"
  },
  "order_note": "Less spicy please",
  "items": [
    {
      "item_name": "Farm Fresh Pizza",
      "item_qty": 1,
      "item_price": 350.00,
      "item_category": "Pizza"
    },
    {
      "item_name": "Masala Dosa",
      "item_qty": 2,
      "item_price": 110.00,
      "item_category": "South Indian"
    }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| pos_id | string | Yes | Always `"mygenie"` |
| restaurant_id | string | Yes | Restaurant ID |
| order_id | string | No | External order reference |
| cust_mobile | string | Yes | Customer phone |
| cust_name | string | No | Customer name |
| order_amount | float | Yes | Total order amount |
| delivery_charge | float | No | Delivery fee |
| wallet_used | float | No | Wallet amount to deduct |
| coupon_code | string | No | Applied coupon code |
| redeem_points | int | No | Points to redeem |
| payment_status | string | Yes | `success` / `pending` |
| payment_method | string | No | `upi` / `card` / `cash` |
| order_type | string | Yes | `delivery` / `take_away` / `pos` |
| delivery_address | object | No | Full address for delivery orders |
| order_note | string | No | Special instructions |
| items | array | Yes | Array of order items |

**Response (200):**
```json
{
  "success": true,
  "message": "Order processed successfully",
  "data": {
    "order_id": "crm-uuid-001",
    "customer_id": "cust-uuid-001",
    "is_new_customer": false,
    "points_earned": 28,
    "off_peak_bonus": 0,
    "total_points": 1328,
    "tier": "Gold",
    "wallet_balance_after": 150.00
  }
}
```

**What happens on order placement:**
1. Customer looked up by phone → linked to order
2. Points earned based on tier percentage
3. Wallet deducted if `wallet_used > 0`
4. Coupon usage recorded if `coupon_code` provided
5. Customer stats updated (total_visits, total_spent, last_visit)
6. Order items stored for analytics
7. WhatsApp notification triggered (if automation configured)

---

## STEP 5: Post-Order

### POST `/feedback`
Submit feedback after order delivery.

**Auth:** Customer Token (or Admin Token)

**Request:**
```json
{
  "customer_id": "550e8400-...",
  "customer_name": "Vivan",
  "customer_phone": "9876543210",
  "rating": 5,
  "message": "Amazing pizza, delivered hot!"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| customer_id | string | No | Customer UUID |
| customer_name | string | Yes | Name |
| customer_phone | string | Yes | Phone |
| rating | int | Yes | 1-5 stars |
| message | string | No | Feedback text |

**Response (200):** Feedback object with `id`, `status: "pending"`, `created_at`

---

## Endpoint Summary

| Step | Endpoint | Method | Auth | Purpose |
|------|----------|--------|------|---------|
| Login (OTP) | `/customer/send-otp` | POST | None | Send OTP |
| Login (OTP) | `/customer/verify-otp` | POST | None | Verify → token + profile |
| Login (Password) | `/customer/register` | POST | None | Sign up (or link password to existing) |
| Login (Password) | `/customer/login` | POST | None | Login with phone + password |
| Login (Password) | `/customer/forgot-password` | POST | None | Send reset OTP |
| Login (Password) | `/customer/reset-password` | POST | None | OTP + set new password |
| Profile | `/customer/me` | GET | Token | Refresh profile |
| Profile | `/customer/me/points` | GET | Token | Points & history |
| Profile | `/customer/me/wallet` | GET | Token | Wallet & history |
| Profile | `/customer/me/orders` | GET | Token | Order history |
| Address | `/customer/me/addresses` | GET | Token | List addresses |
| Address | `/customer/me/addresses` | POST | Token | Add address |
| Address | `/customer/me/addresses/{id}` | PUT | Token | Edit address |
| Address | `/customer/me/addresses/{id}` | DELETE | Token | Delete address |
| Address | `/customer/me/addresses/{id}/set-default` | POST | Token | Set default |
| Checkout | `/coupons/validate` | POST | Token | Validate coupon |
| Checkout | `/pos/max-redeemable` | POST | API Key | Check redeemable points |
| Checkout | `/pos/orders` | POST | API Key | Place order |
| Post-Order | `/feedback` | POST | Token | Submit rating |

**Total: 19 endpoints**

---

## Notes for Frontend Developer

1. **QR Code** contains the `user_id` (restaurant ID). Extract it and pass to `send-otp`.
2. **Token storage:** Store `customer_token` in localStorage/sessionStorage after verify-otp. Include in all subsequent requests.
3. **Address selection UI:** Fetch addresses on page load. Show default pre-selected. Allow add/edit/delete. Selected address goes into the `/pos/orders` request body.
4. **Points/Wallet at checkout:** Call `/pos/max-redeemable` to show "You can save ₹X with Y points". Let customer toggle redemption.
5. **Coupon validation:** Validate on input before submitting order. Show discount preview.
6. **Order placement:** `/pos/orders` uses `X-API-Key` auth (not customer token). The frontend needs the API key — either proxy through a backend-for-frontend or store securely.
7. **Real-time updates:** WhatsApp notifications are sent automatically based on automation rules. No additional API calls needed from frontend.
8. **Menu/Items:** Not served by CRM. Menu data comes from POS or a separate menu service — to be integrated separately.
