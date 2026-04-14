# MyGenie CRM — Scan & Order API Reference v2

> **Version:** 2.0
> **Base URL:** `https://{your-crm-domain}/api/scan`
> **Last Updated:** April 14, 2026
> **Consumer:** Customer-facing mobile/web app (QR scan → browse menu → order → manage profile)

---

## Authentication

The Scan & Order API uses **Customer JWT Token** — different from CRM staff JWT and POS API Key.

### How to get a token

**Option A: OTP Login (Primary)**
1. `POST /scan/auth/request-otp` → sends OTP to customer phone
2. `POST /scan/auth/verify-otp` → verifies OTP, returns token

**Option B: Password Login (Secondary)**
1. `POST /scan/auth/register` → creates account with password
2. `POST /scan/auth/login` → login with phone + password

### Using the token

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Token claims

```json
{
  "customer_id": "uuid",
  "restaurant_id": "pos_0001_restaurant_509",
  "phone": "9876543210",
  "type": "customer",
  "exp": 1776266299
}
```

The token is scoped to a **customer + restaurant** pair. A customer at Restaurant A gets a different token than at Restaurant B. Token expires in 24 hours.

### Token Isolation

| Token Type | Can access `/scan/*` | Can access `/pos/*` | Can access `/auth/*`, `/customers/*` etc. |
|------------|---------------------|---------------------|------------------------------------------|
| Customer Token | Yes | No (401) | No (401) |
| CRM Staff JWT | No (401) | Yes | Yes |
| POS API Key | No (401) | Yes | No |

### Auth Errors

| HTTP Code | Response | Meaning |
|-----------|----------|---------|
| 401 | `{"detail": "Invalid customer token"}` | Missing, malformed, or staff/POS token used |
| 401 | `{"detail": "Token expired"}` | Token older than 24 hours |
| 429 | `{"detail": "Too many OTP requests..."}` | Rate limit: 3 OTPs per phone per 5 minutes |

---

## Standard Response Format

```json
{
  "success": true,
  "message": "Human-readable description",
  "data": { ... }
}
```

---
---

## 1. Authentication

### 1.1 Request OTP

Send a 6-digit OTP to the customer's phone for a specific restaurant.

```
POST /api/scan/auth/request-otp
```

**Auth:** None (public)

**Request:**

```json
{
  "phone": "9876543210",
  "restaurant_id": "509"
}
```

`restaurant_id` accepts both short (`"509"`) and full (`"pos_0001_restaurant_509"`) format.

**Response:**

```json
{
  "success": true,
  "message": "OTP sent",
  "data": {
    "phone": "9876543210",
    "expires_in_seconds": 600,
    "dev_otp": "565079"
  }
}
```

**Notes:**
- `dev_otp` is returned in development mode only. In production, OTP will be delivered via WhatsApp/SMS and this field will be removed.
- OTP is valid for 10 minutes
- **Rate limit:** Max 3 OTP requests per phone per 5 minutes. 4th request returns HTTP 429.

---

### 1.2 Verify OTP

Verify the OTP and receive a customer token. Auto-creates the customer if first time at this restaurant.

```
POST /api/scan/auth/verify-otp
```

**Auth:** None (public)

**Request:**

```json
{
  "phone": "9876543210",
  "otp": "565079",
  "restaurant_id": "509"
}
```

**Response (success — new customer):**

```json
{
  "success": true,
  "message": "OTP verified",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "customer_id": "c4530678-647c-42d1-b959-3e457323cab4",
    "is_new_customer": true,
    "phone": "9876543210"
  }
}
```

**Response (success — existing customer):**

```json
{
  "success": true,
  "message": "OTP verified",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "customer_id": "existing-uuid",
    "is_new_customer": false,
    "phone": "9876543210"
  }
}
```

**Response (failure):**

```json
{ "success": false, "message": "Invalid OTP", "data": null }
```
```json
{ "success": false, "message": "OTP expired", "data": null }
```

**Notes:**
- If `is_new_customer: true`, the app should prompt the customer to complete their profile (name, email, etc.)
- The same phone at a different restaurant creates a separate token (different `restaurant_id` scope)

---

### 1.3 Get Me

Get the authenticated customer's profile.

```
GET /api/scan/auth/me
```

**Auth:** Customer Token

**Response:**

```json
{
  "success": true,
  "message": "Profile loaded",
  "data": {
    "id": "c4530678-647c-42d1-b959-3e457323cab4",
    "user_id": "pos_0001_restaurant_509",
    "name": "",
    "phone": "9876543210",
    "country_code": "+91",
    "email": null,
    "tier": "Bronze",
    "total_points": 0,
    "wallet_balance": 0.0,
    "total_visits": 0,
    "total_spent": 0.0,
    "allergies": [],
    "favorites": [],
    "customer_type": "normal",
    "whatsapp_opt_in": false,
    "is_blocked": false,
    "created_at": "2026-04-14T15:18:17+00:00",
    "updated_at": "2026-04-14T15:18:17+00:00"
  }
}
```

---

### 1.4 Register (Password)

Create a customer account with a password. Alternative to OTP flow.

```
POST /api/scan/auth/register
```

**Auth:** None (public)

**Request:**

```json
{
  "phone": "9876543210",
  "name": "Raj Kumar",
  "password": "securepass123",
  "restaurant_id": "509",
  "email": "raj@example.com"
}
```

**Required:** `phone`, `name`, `password`, `restaurant_id`

**Response:**

```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "customer_id": "66c10655-cadb-4ef2-a128-1da6f3e95c84"
  }
}
```

**Notes:**
- If the phone already has a customer record (from OTP or POS) but no password, registration adds the password to the existing account
- If the phone already has a password, returns `{ "success": false, "message": "Phone already registered" }`

---

### 1.5 Login (Password)

Login with phone + password.

```
POST /api/scan/auth/login
```

**Auth:** None (public)

**Request:**

```json
{
  "phone": "9876543210",
  "password": "securepass123",
  "restaurant_id": "509"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "customer_id": "ed08325b-3798-49fa-899e-f43730af6f75"
  }
}
```

**Failure:** `{ "success": false, "message": "Invalid credentials" }`

---
---

## 2. Customer Profile

### 2.1 Get Profile

```
GET /api/scan/profile
```

**Auth:** Customer Token

Same response as `GET /scan/auth/me`. Returns full customer profile excluding `password_hash`.

---

### 2.2 Update Profile

```
PUT /api/scan/profile
```

**Auth:** Customer Token

**Request (partial — only fields to update):**

```json
{
  "name": "Raj Kumar",
  "email": "raj@example.com",
  "dob": "1990-05-15",
  "anniversary": "2020-11-20",
  "gender": "male",
  "allergies": ["peanuts", "gluten"],
  "favorites": ["Butter Chicken", "Garlic Naan"],
  "diet_preference": "non-veg",
  "spice_level": "medium",
  "cuisine_preference": "North Indian"
}
```

All fields are optional. Only provided fields are updated.

**Cannot update:** `phone` (identity), `tier`, `total_points`, `wallet_balance` (system-managed)

**Response:**

```json
{ "success": true, "message": "Profile updated", "data": null }
```

---

### 2.3 Loyalty Summary

```
GET /api/scan/loyalty
```

**Auth:** Customer Token

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
| `total_points` | Current redeemable points balance |
| `points_monetary_value` | `total_points × redemption_value_per_point` (money equivalent) |
| `tier` | Current tier: Bronze, Silver, Gold, Platinum |
| `next_tier` | Next tier name (`null` if Platinum) |
| `points_to_next_tier` | Points needed to reach next tier (0 if Platinum) |
| `wallet_balance` | Current digital wallet balance |
| `earn_rate_percent` | % of bill amount earned as points (depends on tier) |

---

### 2.4 Points History

```
GET /api/scan/points/history?limit=20
```

**Auth:** Customer Token

**Response:**

```json
{
  "success": true,
  "message": "5 transactions",
  "data": {
    "transactions": [
      {
        "id": "txn-uuid",
        "type": "earn",
        "points": 42,
        "description": "Earned 42 points on order",
        "bill_amount": 850.0,
        "created_at": "2026-04-14T..."
      }
    ],
    "total": 5
  }
}
```

---

### 2.5 Wallet History

```
GET /api/scan/wallet/history?limit=20
```

**Auth:** Customer Token

**Response:**

```json
{
  "success": true,
  "message": "3 transactions",
  "data": {
    "transactions": [
      {
        "id": "txn-uuid",
        "type": "credit",
        "amount": 100.0,
        "description": "Wallet credit",
        "created_at": "2026-04-14T..."
      }
    ],
    "total": 3
  }
}
```

---

### 2.6 Order History

```
GET /api/scan/orders?limit=20
```

**Auth:** Customer Token

**Response:**

```json
{
  "success": true,
  "message": "3 orders",
  "data": {
    "orders": [
      {
        "id": "order-uuid",
        "pos_order_id": "ORD-12345",
        "order_amount": 850.0,
        "order_type": "dinein",
        "items": [ ... ],
        "order_notes": "No plastic cutlery",
        "points_earned": 42,
        "created_at": "2026-04-14T..."
      }
    ],
    "total": 19
  }
}
```

---

### 2.7 Order Detail

```
GET /api/scan/orders/{order_id}
```

**Auth:** Customer Token

Returns full order detail. Only the customer's own orders are accessible — requesting another customer's order returns `{ "success": false, "message": "Order not found" }`.

---

### 2.8 Available Coupons

```
GET /api/scan/coupons
```

**Auth:** Customer Token

Lists active coupons the customer is eligible for (within date range, not exhausted, customer not over per-user limit).

**Response:**

```json
{
  "success": true,
  "message": "2 coupons available",
  "data": {
    "coupons": [
      {
        "id": "coupon-uuid",
        "code": "SAVE20",
        "description": "20% off on orders above Rs.500",
        "discount_type": "percentage",
        "discount_value": 20.0,
        "max_discount": 200.0,
        "min_order_value": 500.0,
        "start_date": "2026-04-01T...",
        "end_date": "2026-04-30T...",
        "my_usage_count": 0
      }
    ]
  }
}
```

`my_usage_count` shows how many times the current customer has already used this coupon.

---
---

## 3. Customer Addresses

Addresses are stored as an array on the customer document. Each address has a unique `addr_` prefixed ID.

### Address Object Schema

```json
{
  "id": "addr_2f06e4e6d68b",
  "pos_address_id": null,
  "is_default": true,
  "address_type": "Home",
  "address": "123 Main Street",
  "house": null,
  "floor": null,
  "road": null,
  "city": "Mumbai",
  "state": "MH",
  "pincode": "400001",
  "country": "India",
  "latitude": "19.07",
  "longitude": "72.87",
  "contact_person_name": null,
  "contact_person_number": null,
  "dial_code": null,
  "zone_id": null,
  "delivery_instructions": "Ring bell",
  "created_at": "2026-04-14T15:18:35+00:00",
  "updated_at": "2026-04-14T15:18:35+00:00"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Auto-generated `addr_` prefixed ID |
| `is_default` | bool | Default delivery address |
| `address_type` | string | `Home`, `Office`, `Other` |
| `address` | string | Full address text (**required** on add) |
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
| `contact_person_number` | string | Delivery contact phone |
| `delivery_instructions` | string | Special delivery notes |

**Note:** Customer addresses share the same `addresses[]` array that POS reads/writes. Changes from either side are visible to both.

---

### 3.1 List My Addresses

```
GET /api/scan/addresses
```

**Auth:** Customer Token

**Response:**

```json
{
  "success": true,
  "message": "2 addresses",
  "data": {
    "addresses": [
      { "id": "addr_xxx", "address_type": "Home", "is_default": true, ... },
      { "id": "addr_yyy", "address_type": "Office", "is_default": false, ... }
    ],
    "total": 2
  }
}
```

Sorted: default address first, then by creation date.

---

### 3.2 Add Address

```
POST /api/scan/addresses
```

**Auth:** Customer Token

**Request:**

```json
{
  "address_type": "Home",
  "address": "123 Main Street",
  "city": "Mumbai",
  "state": "MH",
  "pincode": "400001",
  "latitude": "19.07",
  "longitude": "72.87",
  "delivery_instructions": "Ring bell",
  "is_default": true
}
```

**Required:** `address`

**Response (new):**

```json
{
  "success": true,
  "message": "Address added",
  "data": {
    "address_id": "addr_2f06e4e6d68b",
    "address": { ... }
  }
}
```

**Response (deduplicated — same address+pincode exists):**

```json
{
  "success": true,
  "message": "Address already exists, updated timestamp",
  "data": {
    "address_id": "addr_existing",
    "deduplicated": true
  }
}
```

**Behavior:**
- First address is automatically set as default
- If `is_default: true`, all other addresses are unset
- Dedup check: if `address` text + `pincode` already exist (case-insensitive), updates timestamp instead of creating duplicate

---

### 3.3 Update Address

```
PUT /api/scan/addresses/{addr_id}
```

**Auth:** Customer Token

**Request (partial):**

```json
{
  "delivery_instructions": "Leave at door",
  "contact_person_name": "Wife"
}
```

Only provided fields are updated. Others preserved.

**Response:**

```json
{ "success": true, "message": "Address updated", "data": { "address_id": "addr_xxx" } }
```

---

### 3.4 Delete Address

```
DELETE /api/scan/addresses/{addr_id}
```

**Auth:** Customer Token

**Response:**

```json
{ "success": true, "message": "Address deleted", "data": { "address_id": "addr_xxx" } }
```

If the deleted address was default, the most recently updated remaining address becomes the new default.

---

### 3.5 Set Default Address

```
PUT /api/scan/addresses/{addr_id}/default
```

**Auth:** Customer Token

**Response:**

```json
{ "success": true, "message": "Default address set", "data": { "address_id": "addr_xxx" } }
```

Idempotent — setting an already-default address returns success.

---
---

## 4. Restaurant App Configuration

Branding, feature toggles, and UI configuration for the customer-facing app.

### 4.1 Get Config

```
GET /api/scan/config/{restaurant_id}
```

**Auth:** None (public — loaded on app startup)

`restaurant_id` accepts: `"509"` or `"pos_0001_restaurant_509"` (both resolve to the same config).

**Response:**

```json
{
  "success": true,
  "message": "Config loaded",
  "data": {
    "restaurant_id": "509",
    "primaryColor": "#F26B33",
    "secondaryColor": "#329937",
    "backgroundColor": "#ffffff",
    "buttonTextColor": "#ffffff",
    "textColor": "#4A4A4A",
    "textSecondaryColor": "#6B7280",
    "fontHeading": "Poppins",
    "fontBody": "Poppins",
    "logoUrl": "",
    "tagline": "",
    "welcomeMessage": "Welcome!",
    "banners": [],
    "borderRadius": "rounded",
    "browseMenuButtonText": "Browse Menu",

    "showCallWaiter": false,
    "showPayBill": false,
    "showCategories": true,
    "showPriceBreakdown": true,
    "showTableInfo": true,
    "showLoyaltyPoints": true,
    "showWallet": false,
    "showLoginButton": false,
    "showCookingInstructions": true,
    "showSpecialInstructions": true,
    "showFoodStatus": true,
    "showOrderStatusTracker": false,
    "showEstimatedTimes": false,
    "showCouponCode": false,
    "showMenuFab": true,
    "showHamburgerMenu": true,
    "showTableNumber": true,

    "feedbackEnabled": false,
    "feedbackIntroText": "",
    "aboutUsContent": "",
    "aboutUsImage": "",
    "openingHours": "",
    "restaurantOpeningTime": "06:00",
    "restaurantClosingTime": "03:00",
    "address": "",
    "contactEmail": "",
    "phone": "",
    "instagramUrl": "",
    "facebookUrl": "",
    "twitterUrl": "",
    "whatsappNumber": "",
    "youtubeUrl": "",
    "mapEmbedUrl": "",
    "navMenuOrder": [ ... ],
    "footerLinks": [],
    "footerText": "",
    "customPages": [],
    "updated_at": "2026-03-11T19:31:36+00:00"
  }
}
```

**Not found:** `{ "success": false, "message": "Config not found" }`

---

### 4.2 Update Config

```
PUT /api/scan/config/{restaurant_id}
```

**Auth: CRM Staff JWT** (not customer token — only restaurant admin can update branding)

**Request (partial):**

```json
{
  "primaryColor": "#E63946",
  "tagline": "Best Food in Town",
  "showCallWaiter": true,
  "feedbackEnabled": true,
  "banners": [
    { "id": "banner-1", "bannerImage": "https://...", "bannerTitle": "New Menu!" }
  ]
}
```

Only provided fields are updated. Creates a new config document if none exists for this restaurant.

**Response:**

```json
{ "success": true, "message": "Config updated", "data": null }
```

**Customer token on this endpoint:** Returns `401 — Invalid token. Customer tokens cannot access staff endpoints.`

---

### Feature Toggle Reference

| Toggle | Type | Default | Description |
|--------|------|---------|-------------|
| `showCallWaiter` | bool | false | Show "Call Waiter" button (dine-in) |
| `showPayBill` | bool | false | Show "Pay Bill" / "Request Bill" button |
| `showCategories` | bool | true | Show menu categories |
| `showPriceBreakdown` | bool | true | Show itemized price breakdown |
| `showTableInfo` | bool | true | Show table number in header |
| `showTableNumber` | bool | true | Display table number badge |
| `showLoyaltyPoints` | bool | true | Show loyalty points in profile |
| `showWallet` | bool | false | Show wallet balance |
| `showLoginButton` | bool | false | Show login button on landing |
| `showCookingInstructions` | bool | true | Allow cooking instructions on items |
| `showSpecialInstructions` | bool | true | Allow special instructions on order |
| `showFoodStatus` | bool | true | Show food preparation status |
| `showOrderStatusTracker` | bool | false | Show live order tracking |
| `showEstimatedTimes` | bool | false | Show estimated preparation time |
| `showCouponCode` | bool | false | Show coupon code input field |
| `showMenuFab` | bool | true | Show floating menu button |
| `showHamburgerMenu` | bool | true | Show hamburger navigation menu |
| `showDescription` | bool | false | Show item descriptions on menu |
| `showPromotionsOnMenu` | bool | false | Show promotion badges on menu items |
| `showExtraInfo` | bool | true | Show extra info section |
| `showFooter` | bool | true | Show footer |
| `showLogo` | bool | true | Show restaurant logo |
| `showPoweredBy` | bool | true | Show "Powered by MyGenie" |
| `showSocialIcons` | bool | false | Show social media icons |
| `showWelcomeText` | bool | false | Show welcome message on landing |
| `showCustomerDetails` | bool | false | Show customer details form |
| `showCustomerName` | bool | false | Ask for customer name |
| `showCustomerPhone` | bool | true | Ask for customer phone |
| `showLandingCallWaiter` | bool | false | Show call waiter on landing page |
| `showLandingCustomerCapture` | bool | false | Show customer capture on landing |
| `showLandingPayBill` | bool | false | Show pay bill on landing page |
| `feedbackEnabled` | bool | false | Enable feedback submission |

---
---

## 5. Dietary Tags

Maps food item IDs (from POS menu) to dietary labels for display on the customer app.

### 5.1 Get Dietary Tags

```
GET /api/scan/menu/dietary-tags/{restaurant_id}
```

**Auth:** None (public)

**Response:**

```json
{
  "success": true,
  "message": "Dietary tags loaded",
  "data": {
    "restaurant_id": "689",
    "mappings": {
      "168400": ["jain"],
      "168409": ["jain"],
      "160550": ["lactose-free", "gluten-free"],
      "160632": ["vegan"]
    },
    "updated_at": "2026-03-14T06:27:44+00:00"
  }
}
```

Keys in `mappings` are food IDs (from POS menu system). Values are arrays of dietary tags.

**Available tags:** `jain`, `vegan`, `vegetarian`, `gluten-free`, `lactose-free`, `high-protein`, `keto`, `sugar-free`

**No tags configured:** Returns `{ "success": true, "data": { "restaurant_id": "...", "mappings": {} } }`

---

### 5.2 Update Dietary Tags

```
PUT /api/scan/menu/dietary-tags/{restaurant_id}
```

**Auth: CRM Staff JWT** (admin only)

**Request:**

```json
{
  "mappings": {
    "168400": ["jain", "gluten-free"],
    "160550": ["vegan", "lactose-free"]
  }
}
```

Replaces the entire mappings object. To add a tag to one item without affecting others, send the full mappings.

**Response:**

```json
{ "success": true, "message": "Dietary tags updated", "data": null }
```

---
---

## 6. Customer Actions

### 6.1 Submit Feedback

```
POST /api/scan/feedback
```

**Auth:** Customer Token

**Request:**

```json
{
  "rating": 4,
  "message": "Good food, slow service",
  "order_id": "order-uuid"
}
```

**Required:** `rating` (1-5)
**Optional:** `message`, `order_id`

**Response:**

```json
{
  "success": true,
  "message": "Feedback submitted",
  "data": {
    "feedback_id": "23ec16ef-953c-40dc-83fa-4991c78e1a77"
  }
}
```

**Validation:** Rating must be 1-5. Returns `{ "success": false, "message": "Rating must be between 1 and 5" }` otherwise.

Feedback is visible to restaurant staff in CRM Dashboard → Feedback section.

---

### 6.2 Call Waiter

```
POST /api/scan/call-waiter
```

**Auth:** Customer Token

**Request:**

```json
{
  "table_id": "T5",
  "message": "Need water please"
}
```

**Required:** `table_id`
**Optional:** `message`

**Response:**

```json
{
  "success": true,
  "message": "Waiter notified",
  "data": {
    "event_id": "aa61ba92-7e03-4c67-b643-b4d1435ad665",
    "table_id": "T5"
  }
}
```

**Note:** Only visible when `showCallWaiter: true` in app config. The event is logged to `pos_event_logs` and can trigger notifications to restaurant staff.

---

### 6.3 Request Bill

```
POST /api/scan/request-bill
```

**Auth:** Customer Token

**Request:**

```json
{
  "table_id": "T5",
  "message": "Split bill for 2"
}
```

**Required:** `table_id`
**Optional:** `message`

**Response:**

```json
{
  "success": true,
  "message": "Bill requested",
  "data": {
    "event_id": "30b56973-ea1f-4e27-bd7f-231da6b178c8",
    "table_id": "T5"
  }
}
```

**Note:** Only visible when `showPayBill: true` in app config.

---
---

## Quick Reference — All Endpoints

| # | Method | Endpoint | Auth | Purpose |
|---|--------|----------|------|---------|
| **Authentication** | | | | |
| 1.1 | POST | `/scan/auth/request-otp` | Public | Send OTP |
| 1.2 | POST | `/scan/auth/verify-otp` | Public | Verify OTP → token |
| 1.3 | GET | `/scan/auth/me` | Customer | Get my profile |
| 1.4 | POST | `/scan/auth/register` | Public | Register with password |
| 1.5 | POST | `/scan/auth/login` | Public | Login with password |
| **Profile** | | | | |
| 2.1 | GET | `/scan/profile` | Customer | Get profile |
| 2.2 | PUT | `/scan/profile` | Customer | Update profile |
| 2.3 | GET | `/scan/loyalty` | Customer | Loyalty summary |
| 2.4 | GET | `/scan/points/history?limit=` | Customer | Points history |
| 2.5 | GET | `/scan/wallet/history?limit=` | Customer | Wallet history |
| 2.6 | GET | `/scan/orders?limit=` | Customer | Order history |
| 2.7 | GET | `/scan/orders/{order_id}` | Customer | Order detail |
| 2.8 | GET | `/scan/coupons` | Customer | Available coupons |
| **Addresses** | | | | |
| 3.1 | GET | `/scan/addresses` | Customer | List my addresses |
| 3.2 | POST | `/scan/addresses` | Customer | Add address (dedup) |
| 3.3 | PUT | `/scan/addresses/{addr_id}` | Customer | Update address |
| 3.4 | DELETE | `/scan/addresses/{addr_id}` | Customer | Delete address |
| 3.5 | PUT | `/scan/addresses/{addr_id}/default` | Customer | Set default |
| **App Config** | | | | |
| 4.1 | GET | `/scan/config/{restaurant_id}` | Public | Get restaurant config |
| 4.2 | PUT | `/scan/config/{restaurant_id}` | Staff JWT | Update config |
| **Dietary Tags** | | | | |
| 5.1 | GET | `/scan/menu/dietary-tags/{restaurant_id}` | Public | Get tag mappings |
| 5.2 | PUT | `/scan/menu/dietary-tags/{restaurant_id}` | Staff JWT | Update mappings |
| **Actions** | | | | |
| 6.1 | POST | `/scan/feedback` | Customer | Submit feedback |
| 6.2 | POST | `/scan/call-waiter` | Customer | Call waiter |
| 6.3 | POST | `/scan/request-bill` | Customer | Request bill |

**Total: 22 endpoints** (5 public, 15 customer-authenticated, 2 admin-only)

---

## Error Codes

| HTTP | Meaning |
|------|---------|
| 200 | Success or business error (check `success` field) |
| 401 | Authentication failed (missing/invalid/wrong-type token) |
| 422 | Validation error (missing required field, wrong type) |
| 429 | Rate limit exceeded (OTP requests) |
| 500 | Server error |

---

## Integration Flow

### First-Time Customer (QR Scan)

```
1. Customer scans QR at table
2. App loads: GET /scan/config/{restaurant_id} → branding, features
3. App prompts phone: POST /scan/auth/request-otp
4. Customer enters OTP: POST /scan/auth/verify-otp → token (is_new_customer: true)
5. App prompts name: PUT /scan/profile → saves name
6. Customer browses menu, places order (via POS)
7. Customer adds delivery address: POST /scan/addresses
8. After meal: POST /scan/feedback
```

### Returning Customer

```
1. Customer scans QR
2. App loads config
3. OTP login or password login
4. GET /scan/loyalty → show points, tier
5. GET /scan/orders → show past orders for reorder
6. GET /scan/addresses → pre-fill delivery address
7. GET /scan/coupons → show available offers
```

### Dine-In Flow

```
1. Customer scans QR at table
2. App loads, customer logs in
3. Browse menu (from POS menu system)
4. Place order
5. POST /scan/call-waiter → need water
6. POST /scan/request-bill → ready to leave
7. POST /scan/feedback → rate the experience
```
