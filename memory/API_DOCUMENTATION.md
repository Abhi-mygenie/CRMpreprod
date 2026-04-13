# MyGenie CRM API Documentation

**Base URL:** `https://your-domain.com/api`  
**Version:** v1.2  
**Last Updated:** 2026-04-13

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Customer Self-Service](#2-customer-self-service)
3. [Customers](#3-customers)
4. [Segments](#4-segments)
5. [Points & Loyalty](#5-points--loyalty)
6. [Wallet](#6-wallet)
7. [Coupons](#7-coupons)
8. [Feedback](#8-feedback)
9. [Analytics](#9-analytics)
10. [WhatsApp](#10-whatsapp)
11. [POS Gateway](#11-pos-gateway)
12. [Migration](#12-migration)
13. [QR Code](#13-qr-code)
14. [Cron Jobs](#14-cron-jobs)

---

## Authentication Header

**Restaurant Owner/Admin endpoints:**
```
Authorization: Bearer {access_token}
```

**Customer Self-Service endpoints:**
```
Authorization: Bearer {customer_token}
```
Note: Customer token contains `user_id` (restaurant context)

**POS Gateway endpoints:**
```
X-API-Key: {api_key}
```

---

## 1. Authentication

### POST `/auth/login`
**Description:** Login via MyGenie POS authentication  
**Auth Required:** No

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | User email |
| password | string | Yes | User password |

**Response (200):**
```json
{
  "access_token": "eyJhbG...",
  "token_type": "bearer",
  "user": {
    "id": "pos_0001_restaurant_709",
    "email": "owner@restaurant.com",
    "restaurant_name": "My Restaurant",
    "phone": "9876543210",
    "pos_id": "0001",
    "pos_name": "MyGenie",
    "created_at": "2026-03-06T10:33:11.321718+00:00"
  },
  "is_demo": false
}
```

**Errors:** `401` Invalid credentials | `503` MyGenie API error | `504` Timeout

---

### POST `/auth/register`
**Description:** Register new user  
**Auth Required:** No

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | User email |
| password | string | Yes | Password (min 6 chars) |
| restaurant_name | string | Yes | Restaurant name |
| phone | string | Yes | Phone number |

---

### GET `/auth/me`
**Description:** Get current user profile  
**Auth Required:** Yes

**Response:** User object with id, email, restaurant_name, phone, pos_id, pos_name, created_at

---

### PUT `/auth/profile`
**Description:** Update user profile  
**Auth Required:** Yes

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| phone | string | No | Phone number |
| address | string | No | Address |

---

### PUT `/auth/reset-password`
**Description:** Reset password (logged in user)  
**Auth Required:** Yes

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| current_password | string | Yes | Current password |
| new_password | string | Yes | New password (min 6 chars) |

---

### POST `/auth/forgot-password/request-otp`
**Description:** Request OTP for password reset  
**Auth Required:** No

**Request Body:** `{ "email": "user@example.com" }`

---

### POST `/auth/forgot-password/verify-otp`
**Description:** Verify OTP and get reset token  
**Auth Required:** No

**Request Body:**
```json
{ "email": "user@example.com", "otp": "123456" }
```

---

### POST `/auth/forgot-password/reset`
**Description:** Reset password with token  
**Auth Required:** No

**Request Body:**
```json
{
  "email": "user@example.com",
  "reset_token": "uuid-token",
  "new_password": "newpass123"
}
```

---

## 2. Customer Self-Service

**Purpose:** Allow customers to login with phone number (OTP) and access their own data. All endpoints are scoped by restaurant (user_id).

**Authentication Flow:**
```
1. Customer provides phone number + restaurant_id (user_id)
2. POST /customer/send-otp → OTP sent via WhatsApp/SMS
3. POST /customer/verify-otp → Returns customer_token + FULL customer details
4. GET /customer/me → Same details (optional - use to refresh data later)
```

**Important:** `user_id` (restaurant ID) is **REQUIRED** in send-otp and verify-otp. Customer token contains restaurant context.

---

### POST `/customer/send-otp`
**Description:** Send OTP to customer phone number  
**Auth Required:** No

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| phone | string | Yes | Customer phone number |
| user_id | string | **Yes** | Restaurant ID (e.g., `pos_0001_restaurant_509`) |
| country_code | string | No | Country code (default: 91) |

**Example Request:**
```bash
curl -X POST "https://your-domain.com/api/customer/send-otp" \
  -H "Content-Type: application/json" \
  -d '{"phone": "9876543210", "user_id": "pos_0001_restaurant_509"}'
```

**Response (200):**
```json
{
  "success": true,
  "message": "OTP sent to +91 9876543210",
  "expires_in_minutes": 10,
  "restaurant_name": "My Restaurant"
}
```

**Errors:**
| Code | Message |
|------|---------|
| 404 | Restaurant not found |
| 404 | Customer not found. Please contact the restaurant to register. |
| 422 | user_id field required |

---

### POST `/customer/verify-otp`
**Description:** Verify OTP and get customer token  
**Auth Required:** No

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| phone | string | Yes | Customer phone number |
| otp | string | Yes | 6-digit OTP received |
| user_id | string | **Yes** | Restaurant ID |
| country_code | string | No | Country code (default: 91) |

**Example Request:**
```bash
curl -X POST "https://your-domain.com/api/customer/verify-otp" \
  -H "Content-Type: application/json" \
  -d '{"phone": "9876543210", "otp": "123456", "user_id": "pos_0001_restaurant_509"}'
```

**Response (200):**
```json
{
  "success": true,
  "message": "OTP verified successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in_hours": 24,
  "customer": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "John Doe",
    "phone": "9876543210",
    "email": "john@email.com",
    "country_code": "+91",
    
    "dob": "1990-05-15",
    "anniversary": "2015-06-20",
    "gender": "male",
    
    "tier": "Gold",
    "total_points": 1500,
    "points_value": 375.00,
    "wallet_balance": 250.00,
    
    "total_visits": 25,
    "total_spent": 35000.00,
    "last_visit": "2026-04-10T14:30:00+00:00",
    
    "addresses": [
      {
        "id": "addr_abc123",
        "pos_address_id": 101,
        "is_default": true,
        "address_type": "Home",
        "address": "123 Main Street",
        "city": "Mumbai",
        "state": "Maharashtra",
        "pincode": "400001",
        "country": "India"
      }
    ],
    
    "allergies": ["peanuts", "shellfish"],
    "favorites": ["Butter Chicken", "Naan"],
    
    "restaurant_id": "pos_0001_restaurant_709"
  }
}
```

**Errors:**
| Code | Message |
|------|---------|
| 400 | Invalid OTP |
| 400 | OTP expired. Please request a new one. |
| 404 | Customer not found |

**Customer Object Fields:**
| Field | Type | Description |
|-------|------|-------------|
| id | string | Customer UUID |
| name | string | Customer name |
| phone | string | Phone number |
| email | string | Email address |
| country_code | string | Country code (e.g., +91) |
| dob | string | Date of birth (YYYY-MM-DD) |
| anniversary | string | Anniversary date |
| gender | string | Gender |
| tier | string | Loyalty tier (Bronze/Silver/Gold/Platinum) |
| total_points | int | Current points balance |
| points_value | float | Monetary value of points |
| wallet_balance | float | Current wallet balance |
| total_visits | int | Total visit count |
| total_spent | float | Lifetime spend |
| last_visit | string | Last visit timestamp (ISO 8601) |
| addresses | array | Array of address objects (id, address_type, address, city, state, pincode, is_default, etc.) |
| allergies | array | List of allergies |
| favorites | array | Favorite items |
| restaurant_id | string | Associated restaurant ID |

---

### GET `/customer/me`
**Description:** Get current customer details (same data as verify-otp response)  
**Auth Required:** Yes (Customer Token)  
**Use Case:** Refresh customer data after initial login

**Headers:**
| Header | Value |
|--------|-------|
| Authorization | Bearer {customer_token} |

**Example Request:**
```bash
curl -X GET "https://your-domain.com/api/customer/me" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

**Response (200):** Same as `/verify-otp` customer object

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "John Doe",
  "phone": "9876543210",
  "email": "john@email.com",
  "country_code": "+91",
  
  "dob": "1990-05-15",
  "anniversary": "2015-06-20",
  "gender": "male",
  
  "tier": "Gold",
  "total_points": 1500,
  "points_value": 375.00,
  "wallet_balance": 250.00,
  
  "total_visits": 25,
  "total_spent": 35000.00,
  "last_visit": "2026-04-10T14:30:00+00:00",
  
  "addresses": [
    {
      "id": "addr_abc123",
      "is_default": true,
      "address_type": "Home",
      "address": "123 Main Street",
      "city": "Mumbai",
      "state": "Maharashtra",
      "pincode": "400001"
    }
  ],
  
  "allergies": ["peanuts", "shellfish"],
  "favorites": ["Butter Chicken", "Naan"],
  
  "restaurant_id": "pos_0001_restaurant_709"
}
```

**Errors:**
| Code | Message |
|------|---------|
| 401 | Authorization header required |
| 401 | Token expired |
| 401 | Invalid token |
| 404 | Customer not found |

---

### Future Endpoints (Planned)

| Endpoint | Method | Status | Description |
|----------|--------|--------|-------------|
| `/customer/me/addresses` | GET | 🟢 **Completed** | Get customer's addresses |
| `/customer/me/points` | GET | 🔴 Pending | Get points history |
| `/customer/me/wallet` | GET | 🔴 Pending | Get wallet history |
| `/customer/me/orders` | GET | 🔴 Pending | Get order history |

---

## 3. Customers

### POST `/customers`
**Description:** Create new customer  
**Auth Required:** Yes

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Customer name |
| phone | string | Yes | Phone number (unique per user) |
| email | string | No | Email address |
| country_code | string | No | Country code (default: +91) |
| dob | string | No | Date of birth (YYYY-MM-DD) |
| anniversary | string | No | Anniversary date |
| gender | string | No | male/female/other |
| customer_type | string | No | normal/corporate |
| whatsapp_opt_in | boolean | No | WhatsApp consent |
| gst_name | string | No | GST name |
| gst_number | string | No | GST number |
| address | string | No | Address |
| city | string | No | City |
| allergies | array | No | List of allergies |
| favorites | array | No | Favorite items |

**Response:** Customer object with auto-generated id, tier (Bronze), and first_visit_bonus if enabled

---

### GET `/customers`
**Description:** List customers with filters  
**Auth Required:** Yes

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| search | string | Search by name/phone |
| tier | string | Filter by tier (Bronze/Silver/Gold/Platinum) |
| customer_type | string | normal/corporate |
| city | string | Filter by city |
| last_visit_days | int | Inactive for X days |
| whatsapp_opt_in | string | true/false/all |
| vip_flag | string | true/false/all |
| has_birthday_this_month | boolean | Birthday this month |
| has_anniversary_this_month | boolean | Anniversary this month |
| total_visits | string | 0/1-5/6-10/10+ |
| total_spent | string | 0-500/500-2000/2000-5000/5000-10000/10000+ |
| sort_by | string | created_at/last_visit/total_spent/total_points |
| sort_order | string | asc/desc |
| limit | int | Results limit (default: 100) |
| skip | int | Pagination offset |

---

### GET `/customers/{customer_id}`
**Description:** Get single customer  
**Auth Required:** Yes

---

### PUT `/customers/{customer_id}`
**Description:** Update customer  
**Auth Required:** Yes  
**Note:** Syncs to MyGenie POS if token available

---

### DELETE `/customers/{customer_id}`
**Description:** Delete customer and related transactions  
**Auth Required:** Yes

---

### GET `/customers/sample-data`
**Description:** Get sample customer data for template previews  
**Auth Required:** Yes

---

### GET `/customers/segments/stats`
**Description:** Get customer segment statistics  
**Auth Required:** Yes

**Response:**
```json
{
  "total": 1000,
  "by_tier": {"bronze": 500, "silver": 300, "gold": 150, "platinum": 50},
  "by_type": {"normal": 900, "corporate": 100},
  "inactive_30_days": 200,
  "inactive_60_days": 100,
  "with_allergies": 50,
  "top_cities": [{"city": "Mumbai", "count": 300}],
  "top_favorites": [{"item": "Pizza", "count": 150}]
}
```

---

### GET `/customers/{customer_id}/loyalty-details`
**Description:** Get loyalty details with redemption value and active coupons  
**Auth Required:** Yes

---

### GET `/customers/{customer_id}/insights`
**Description:** Get AI-powered customer insights  
**Auth Required:** Yes

**Response:**
```json
{
  "top_items": [{"name": "Butter Chicken", "count": 15}],
  "top_categories": [{"name": "Main Course", "count": 20, "percent": 45}],
  "avg_frequency_days": 14,
  "preferred_day": "Saturday",
  "preferred_time": "Dinner (7-11 PM)",
  "spending_trend": {"change_percent": 15, "direction": "up"},
  "common_notes": [{"note": "Less spicy", "count": 5}],
  "avg_order_value": 850.50
}
```

---

### POST `/customers/sync-from-mygenie`
**Description:** Start background customer sync from MyGenie  
**Auth Required:** Yes

---

### GET `/customers/sync-status`
**Description:** Get customer sync progress  
**Auth Required:** Yes

---

## 4. Segments

### POST `/segments`
**Description:** Create customer segment  
**Auth Required:** Yes

**Request Body:**
```json
{
  "name": "VIP Customers",
  "filters": {
    "tier": "Platinum",
    "total_spent": "10000+",
    "whatsapp_opt_in": "true"
  },
  "customer_count": 50
}
```

---

### GET `/segments`
**Description:** List all segments with updated customer counts  
**Auth Required:** Yes

---

### GET `/segments/{segment_id}`
**Description:** Get single segment  
**Auth Required:** Yes

---

### GET `/segments/{segment_id}/customers`
**Description:** Get customers in segment  
**Auth Required:** Yes

---

### PUT `/segments/{segment_id}`
**Description:** Update segment  
**Auth Required:** Yes

---

### DELETE `/segments/{segment_id}`
**Description:** Delete segment  
**Auth Required:** Yes

---

### POST `/segments/preview-count`
**Description:** Preview customer count for filters  
**Auth Required:** Yes

**Request Body:** `{ "filters": {...} }`

---

### GET `/segments/{segment_id}/whatsapp-config`
**Description:** Get WhatsApp automation config for segment  
**Auth Required:** Yes

---

### POST `/segments/{segment_id}/whatsapp-config`
**Description:** Save WhatsApp automation config  
**Auth Required:** Yes

---

### PATCH `/segments/{segment_id}/whatsapp-config/toggle`
**Description:** Pause/resume WhatsApp automation  
**Auth Required:** Yes

---

## 5. Points & Loyalty

### POST `/points/transaction`
**Description:** Create points transaction (earn/redeem/bonus)  
**Auth Required:** Yes

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| customer_id | string | Yes | Customer ID |
| points | int | Yes | Points amount |
| transaction_type | string | Yes | earn/redeem/bonus |
| description | string | No | Transaction description |
| bill_amount | float | No | Associated bill amount |

---

### GET `/points/transactions/{customer_id}`
**Description:** Get customer's points history  
**Auth Required:** Yes

**Query:** `limit` (default: 50)

---

### POST `/points/earn`
**Description:** Quick earn points based on bill and tier  
**Auth Required:** Yes

**Query:** `customer_id`, `bill_amount`

---

### GET `/points/expiring/{customer_id}`
**Description:** Get expiring points info  
**Auth Required:** Yes

**Response:**
```json
{
  "expiring_soon": 500,
  "expiring_date": "2026-04-15T00:00:00+00:00",
  "already_expired": 100,
  "expiry_months": 6
}
```

---

### POST `/points/process-birthday-bonus`
**Description:** Process birthday bonus for eligible customers  
**Auth Required:** Yes

---

### POST `/points/process-anniversary-bonus`
**Description:** Process anniversary bonus  
**Auth Required:** Yes

---

### POST `/points/process-expiry-reminders`
**Description:** Send expiry reminders  
**Auth Required:** Yes

---

### POST `/points/expire`
**Description:** Expire old points  
**Auth Required:** Yes

---

### GET `/loyalty/settings`
**Description:** Get loyalty program settings  
**Auth Required:** Yes

**Response:**
```json
{
  "loyalty_enabled": true,
  "min_order_value": 100.0,
  "bronze_earn_percent": 5.0,
  "silver_earn_percent": 7.0,
  "gold_earn_percent": 10.0,
  "platinum_earn_percent": 15.0,
  "redemption_value": 0.25,
  "min_redemption_points": 100,
  "max_redemption_percent": 50.0,
  "max_redemption_amount": 500.0,
  "points_expiry_months": 6,
  "tier_silver_min": 500,
  "tier_gold_min": 1500,
  "tier_platinum_min": 5000,
  "birthday_bonus_enabled": true,
  "birthday_bonus_points": 100,
  "anniversary_bonus_enabled": true,
  "anniversary_bonus_points": 150,
  "first_visit_bonus_enabled": true,
  "first_visit_bonus_points": 50,
  "off_peak_bonus_enabled": false
}
```

---

### PUT `/loyalty/settings`
**Description:** Update loyalty settings  
**Auth Required:** Yes

---

## 6. Wallet

### POST `/wallet/transaction`
**Description:** Create wallet transaction  
**Auth Required:** Yes

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| customer_id | string | Yes | Customer ID |
| amount | float | Yes | Amount |
| transaction_type | string | Yes | credit/debit |
| description | string | No | Description |
| payment_method | string | No | Payment method |

---

### GET `/wallet/transactions/{customer_id}`
**Description:** Get wallet history  
**Auth Required:** Yes

---

### GET `/wallet/balance/{customer_id}`
**Description:** Get wallet balance  
**Auth Required:** Yes

---

## 7. Coupons

### POST `/coupons`
**Description:** Create coupon  
**Auth Required:** Yes

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| code | string | Yes | Coupon code (auto-uppercased) |
| discount_type | string | Yes | percentage/fixed |
| discount_value | float | Yes | Discount value |
| start_date | string | Yes | Start date (ISO) |
| end_date | string | Yes | End date (ISO) |
| usage_limit | int | No | Total usage limit |
| per_user_limit | int | No | Per user limit (default: 1) |
| min_order_value | float | No | Minimum order value |
| max_discount | float | No | Max discount (for percentage) |
| specific_users | array | No | Customer IDs (for targeted) |
| applicable_channels | array | Yes | ["dine_in", "takeaway", "delivery"] |
| description | string | No | Description |

---

### GET `/coupons`
**Description:** List coupons  
**Auth Required:** Yes

**Query:** `active_only` (boolean)

---

### GET `/coupons/{coupon_id}`
**Description:** Get single coupon  
**Auth Required:** Yes

---

### PUT `/coupons/{coupon_id}`
**Description:** Update coupon  
**Auth Required:** Yes

---

### DELETE `/coupons/{coupon_id}`
**Description:** Delete coupon  
**Auth Required:** Yes

---

### POST `/coupons/{coupon_id}/toggle`
**Description:** Toggle coupon active status  
**Auth Required:** Yes

---

### POST `/coupons/validate`
**Description:** Validate coupon without applying  
**Auth Required:** Yes

**Query:** `code`, `customer_id`, `order_value`, `channel`

**Response:**
```json
{
  "valid": true,
  "coupon": {...},
  "discount": 100.00,
  "final_amount": 900.00
}
```

---

### POST `/coupons/apply`
**Description:** Apply coupon and record usage  
**Auth Required:** Yes

---

### GET `/coupons/{coupon_id}/usage`
**Description:** Get coupon usage history  
**Auth Required:** Yes

---

## 8. Feedback

### POST `/feedback`
**Description:** Create feedback entry  
**Auth Required:** Yes

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| customer_id | string | No | Customer ID |
| customer_name | string | No | Customer name |
| customer_phone | string | No | Customer phone |
| rating | int | Yes | Rating (1-5) |
| message | string | No | Feedback message |

---

### GET `/feedback`
**Description:** List feedback  
**Auth Required:** Yes

**Query:** `status` (pending/resolved), `rating` (1-5), `limit`

---

### PUT `/feedback/{feedback_id}/resolve`
**Description:** Mark feedback as resolved  
**Auth Required:** Yes

---

## 9. Analytics

### GET `/analytics/dashboard`
**Description:** Get comprehensive dashboard stats  
**Auth Required:** Yes

**Response:**
```json
{
  "loyalty_orders_percent": 45.5,
  "repeat_revenue_percent": 68.2,
  "total_customers": 1500,
  "active_customers_30d": 450,
  "new_customers_7d": 25,
  "total_orders": 5000,
  "avg_order_value": 750.00,
  "total_points_issued": 125000,
  "total_points_redeemed": 45000,
  "wallet_issued": 50000.00,
  "wallet_used": 32000.00,
  "total_coupons": 15,
  "coupons_used": 234,
  "total_revenue": 3750000.00,
  "avg_rating": 4.2,
  "top_items_30d": [...],
  "loyalty_enabled": true,
  "wallet_enabled": true,
  "coupon_enabled": true
}
```

---

### GET `/analytics/item-performance`
**Description:** Get item performance with repeat rate  
**Auth Required:** Yes

**Query:** `time_period` (7d/30d/90d/all), `sort_by`, `search`, `category`, `limit`

**Response:**
```json
{
  "items": [
    {
      "item_name": "Butter Chicken",
      "total_orders": 150,
      "repeat_orders": 85,
      "repeat_rate": 57,
      "unique_customers": 100,
      "return_visits": 50
    }
  ],
  "categories": ["Main Course", "Starters"],
  "summary": {"total_items": 50, "avg_repeat_rate": 35.5}
}
```

---

### GET `/analytics/item-customers/{item_name}`
**Description:** Get customers who ordered specific item  
**Auth Required:** Yes

---

### GET `/analytics/customer-lifecycle`
**Description:** Get customer lifecycle summary  
**Auth Required:** Yes

**Response:**
```json
{
  "summary": {
    "new": {"count": 100, "percent": 10.0},
    "active": {"count": 350, "percent": 35.0},
    "at_risk": {"count": 200, "percent": 20.0},
    "dormant": {"count": 150, "percent": 15.0},
    "churned": {"count": 200, "percent": 20.0}
  },
  "total_customers": 1000
}
```

---

### GET `/analytics/customer-lifecycle/trend`
**Description:** Get lifecycle trend over time  
**Auth Required:** Yes

**Query:** `time_period` (30d/90d/180d/365d), `granularity` (daily/weekly/monthly)

---

### GET `/analytics/customer-lifecycle/customers`
**Description:** Get customers by lifecycle stage  
**Auth Required:** Yes

**Query:** `stage` (all/new/active/at_risk/dormant/churned), `sort_by`, `search`, `limit`, `skip`

---

## 10. WhatsApp

### GET `/whatsapp/templates`
**Description:** List WhatsApp templates  
**Auth Required:** Yes

---

### POST `/whatsapp/templates`
**Description:** Create template  
**Auth Required:** Yes

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Template name |
| message | string | Yes | Message body |
| media_type | string | No | image/video/document |
| media_url | string | No | Media URL |
| variables | array | No | Variable placeholders |

---

### PUT `/whatsapp/templates/{template_id}`
**Description:** Update template  
**Auth Required:** Yes

---

### DELETE `/whatsapp/templates/{template_id}`
**Description:** Delete template  
**Auth Required:** Yes

---

### GET `/whatsapp/automation`
**Description:** List automation rules  
**Auth Required:** Yes

---

### POST `/whatsapp/automation`
**Description:** Create automation rule  
**Auth Required:** Yes

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| event_type | string | Yes | Event trigger type |
| template_id | string | Yes | Template to send |
| is_enabled | boolean | No | Enable/disable |
| delay_minutes | int | No | Delay before sending |
| conditions | object | No | Additional conditions |

---

### GET `/whatsapp/automation/events`
**Description:** Get available automation events  
**Auth Required:** Yes

**Response:**
```json
{
  "events": ["new_order_customer", "order_confirmed", "birthday", ...],
  "pos_events": [...],
  "crm_events": [...],
  "descriptions": {...}
}
```

---

### POST `/whatsapp/automation/{rule_id}/toggle`
**Description:** Toggle automation rule  
**Auth Required:** Yes

---

### GET `/whatsapp/api-key`
**Description:** Get WhatsApp API credentials  
**Auth Required:** Yes

---

### PUT `/whatsapp/api-key`
**Description:** Save WhatsApp API credentials  
**Auth Required:** Yes

**Request Body:**
```json
{
  "authkey_api_key": "...",
  "brand_number": "...",
  "meta_waba_id": "...",
  "meta_access_token": "..."
}
```

---

### GET `/whatsapp/authkey-templates`
**Description:** Fetch templates from AuthKey.io  
**Auth Required:** Yes

---

### POST `/whatsapp/custom-templates`
**Description:** Create custom template (draft)  
**Auth Required:** Yes

---

### POST `/whatsapp/meta/create-template`
**Description:** Create template on Meta Graph API  
**Auth Required:** Yes

---

### POST `/whatsapp/authkey/sync-templates`
**Description:** Sync templates to AuthKey  
**Auth Required:** Yes

---

### PUT `/whatsapp/event-template-map`
**Description:** Save event to template mappings  
**Auth Required:** Yes

---

### GET `/whatsapp/event-template-map`
**Description:** Get event template mappings  
**Auth Required:** Yes

---

### POST `/whatsapp/test-template`
**Description:** Send test WhatsApp message  
**Auth Required:** Yes

**Request Body:**
```json
{
  "template_id": "template_123",
  "phone": "9876543210",
  "country_code": "91",
  "body_values": {"1": "John", "2": "100"},
  "media_url": null
}
```

---

### GET `/whatsapp/message-stats`
**Description:** Get message statistics by status  
**Auth Required:** Yes

**Query:** `date_from`, `date_to`

---

### GET `/whatsapp/message-logs`
**Description:** Get paginated message logs  
**Auth Required:** Yes

**Query:** `status`, `event_type`, `campaign_id`, `template_name`, `search`, `date_from`, `date_to`, `skip`, `limit`

---

### POST `/whatsapp/resend`
**Description:** Resend failed messages  
**Auth Required:** Yes

**Request Body:** `{ "message_ids": ["id1", "id2"] }`

---

### POST `/whatsapp/status-callback`
**Description:** Webhook for AuthKey status updates  
**Auth Required:** No (public webhook)

---

## 11. POS Gateway

**Note:** All POS endpoints use `X-API-Key` header instead of Bearer token.

### POST `/pos/customers`
**Description:** Create customer from POS  
**Auth:** X-API-Key

**Request Body:**
```json
{
  "pos_id": "mygenie",
  "restaurant_id": "509",
  "name": "John Doe",
  "phone": "9876543210",
  "email": "john@email.com",
  "country_code": "+91",
  "dob": "1990-05-15",
  "anniversary": "2015-06-20",
  "gender": "male",
  "customer_type": "normal",
  "addresses": [
    {
      "id": 1,
      "address_type": "Home",
      "address": "123 Main Street",
      "house": "A-101",
      "floor": "1st",
      "road": "Main Road",
      "city": "Mumbai",
      "state": "Maharashtra",
      "pincode": "400001",
      "latitude": "19.0760",
      "longitude": "72.8777",
      "contact_person_name": "John",
      "contact_person_number": "9876543210",
      "dial_code": "+91",
      "zone_id": 6
    },
    {
      "id": 2,
      "address_type": "Work",
      "address": "456 Office Park",
      "city": "Mumbai",
      "pincode": "400051"
    }
  ]
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Customer created successfully",
  "data": {
    "customer_id": "uuid",
    "name": "John Doe",
    "phone": "9876543210",
    "addresses": [
      {
        "id": "addr_abc123",
        "pos_address_id": 1,
        "is_default": true,
        "address_type": "Home",
        "address": "123 Main Street",
        "city": "Mumbai",
        "pincode": "400001"
      }
    ],
    "created_at": "2026-04-13T..."
  }
}
```

**Address Mapping (POS → CRM):**
| POS Field | CRM Field |
|-----------|-----------|
| id | pos_address_id |
| (generated) | id (addr_xxx) |
| (first valid) | is_default: true |
| address_type | address_type |
| address | address |
| city | city |
| pincode | pincode |
| latitude | latitude |
| longitude | longitude |

---

### PUT `/pos/customers/{customer_id}`
**Description:** Update customer from POS  
**Auth:** X-API-Key

**Request Body:**
```json
{
  "pos_id": "mygenie",
  "restaurant_id": "509",
  "phone": "9876543210",
  "addresses": [
    {
      "id": 3,
      "address_type": "New Address",
      "address": "789 New Street",
      "city": "Pune",
      "pincode": "411001"
    }
  ]
}
```

**Note:** Providing `addresses` will **replace** existing addresses.

**Response (200):**
```json
{
  "success": true,
  "message": "Customer updated successfully",
  "data": {
    "customer_id": "uuid",
    "name": "John Doe",
    "phone": "9876543210",
    "addresses": [...],
    "updated_at": "2026-04-13T..."
  }
}
```

---

### POST `/pos/orders`
**Description:** Order webhook from POS  
**Auth:** X-API-Key

**Request Body:**
```json
{
  "pos_id": "mygenie",
  "restaurant_id": "123",
  "order_id": "ORD-001",
  "cust_mobile": "9876543210",
  "cust_name": "John Doe",
  "order_amount": 1500.00,
  "wallet_used": 100.00,
  "coupon_code": "SAVE10",
  "payment_status": "success",
  "items": [
    {
      "item_name": "Butter Chicken",
      "item_qty": 2,
      "item_price": 450.00,
      "item_category": "Main Course"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Order processed successfully",
  "data": {
    "order_id": "uuid",
    "customer_id": "uuid",
    "is_new_customer": false,
    "points_earned": 75,
    "off_peak_bonus": 0,
    "total_points": 1500,
    "tier": "Silver",
    "wallet_balance_after": 400.00
  }
}
```

---

### POST `/pos/max-redeemable`
**Description:** Check max redeemable points  
**Auth:** X-API-Key

**Request Body:**
```json
{
  "pos_id": "mygenie",
  "restaurant_id": "123",
  "cust_mobile": "9876543210",
  "bill_amount": 1000.00
}
```

---

### POST `/pos/customer-lookup`
**Description:** Lookup customer by phone  
**Auth:** X-API-Key

**Request Body:** `{ "phone": "9876543210" }`

---

### POST `/pos/webhook/payment-received`
**Description:** Legacy payment webhook  
**Auth:** X-API-Key

---

### POST `/pos/events`
**Description:** Trigger WhatsApp events from POS  
**Auth:** X-API-Key

**Request Body:**
```json
{
  "pos_id": "mygenie",
  "restaurant_id": "123",
  "event_type": "order_ready_customer",
  "order_id": "ORD-001",
  "customer_phone": "9876543210",
  "event_data": {
    "estimated_time": "10 mins"
  }
}
```

**Supported Events:**
- `new_order_customer` - Customer order notification
- `new_order_outlet` - Outlet alert
- `order_confirmed` - Order confirmation
- `order_ready_customer` - Order ready notification
- `item_ready` - Item ready notification
- `order_served` - Order served
- `order_dispatched` - Delivery dispatched
- `send_bill_manual` - Manual bill send
- `send_bill_auto` - Auto bill send

---

### GET `/pos/api-key`
**Description:** Get POS API key  
**Auth:** Bearer token

---

### POST `/pos/api-key/regenerate`
**Description:** Regenerate POS API key  
**Auth:** Bearer token

---

## 12. Migration

### GET `/migration/status`
**Description:** Get migration status  
**Auth Required:** Yes

**Response:**
```json
{
  "migration_confirmed": false,
  "customers_synced": 500,
  "orders_synced": 2000,
  "total_customers_in_pos": 520,
  "total_orders_in_pos": 2100,
  "last_customer_sync": "2026-03-16T10:00:00+00:00",
  "last_order_sync": "2026-03-16T10:30:00+00:00"
}
```

---

### POST `/migration/sync-orders`
**Description:** Start background order sync  
**Auth Required:** Yes

---

### GET `/migration/sync-orders/status`
**Description:** Get order sync progress  
**Auth Required:** Yes

---

### POST `/migration/confirm`
**Description:** Confirm migration complete  
**Auth Required:** Yes

---

### POST `/migration/revert`
**Description:** Revert all synced data  
**Auth Required:** Yes

---

### POST `/migration/revert-customers`
**Description:** Revert only customers  
**Auth Required:** Yes

---

### POST `/migration/revert-orders`
**Description:** Revert only orders  
**Auth Required:** Yes

---

### POST `/migration/skip-permanently`
**Description:** Skip migration permanently  
**Auth Required:** Yes

---

### Migration Field Mapping - Customer Sync

**POS API:** `POST /api/v1/vendoremployee/whatsappcrm/customer-migration`

#### Fields MAPPED (Stored in CRM) ✅

| POS Field | CRM Field | Notes |
|-----------|-----------|-------|
| id | pos_customer_id | POS unique ID |
| name | name | Full name |
| phone | phone | Primary phone |
| country_code | country_code | Default: +91 |
| email | email | Email address |
| dob | dob | Date of birth |
| anniversary | anniversary | Anniversary date |
| gst_name | gst_name | GST registered name |
| gst_number | gst_number | GST number |
| loyalty_point | total_points | Current points (int) |
| total_points_earned | total_points_earned | Lifetime earned (string→int) |
| total_points_redeemed | total_points_redeemed | Lifetime redeemed (string→int) |
| wallet_balance | wallet_balance | Current wallet (int→float) |
| total_wallet_received | total_wallet_received | Lifetime credits (string→float) |
| total_wallet_used | total_wallet_used | Lifetime usage (string→float) |
| total_coupon_used | total_coupon_used | Coupons used count |
| customer_type | customer_type | normal/corporate |
| address | address | Single address only |
| city | city | City |
| pincode | pincode | Pincode |
| pos_id | pos_id | POS system ID |
| restaurant_id | pos_restaurant_id | Restaurant ID in POS |
| created_time | created_at | Creation timestamp |
| updated_time | last_updated_at | Last update |

#### Fields NOT MAPPED (Not stored) ❌

| POS Field | Reason | Action Required |
|-----------|--------|-----------------|
| f_name | Combined into `name` | Consider storing separately |
| l_name | Combined into `name` | Consider storing separately |
| alternate_phone | Not captured | Add field to schema |
| profile_image | Not captured | Add field to schema |
| company_name | Not captured (different from gst_name) | Add field to schema |
| tags/labels | Not returned by POS | Request from POS team |
| preferred_language | Not returned by POS | Request from POS team |
| gender | Not returned by POS | Request from POS team |
| membership_details | Partially mapped | Review completeness |

#### Fields NEWLY MAPPED (Apr 2026) ✅

| POS Field | CRM Field | Notes |
|-----------|-----------|-------|
| customer_addresses[] | addresses[] | Full array of addresses mapped via `address_utils.py`. Each address: pos_address_id, address_type, address, city, pincode, house, floor, road, lat, lng, contact_person_name, contact_person_number, zone_id |

#### Auto-Calculated Fields (CRM side)

| CRM Field | Calculation |
|-----------|-------------|
| tier | Based on total_points: Bronze(<500), Silver(500-1499), Gold(1500-4999), Platinum(5000+) |
| mygenie_synced | Set to `true` |
| last_synced_at | Current timestamp |

---

### Migration Field Mapping - Order Sync

**POS API:** `POST /api/v1/vendoremployee/whatsappcrm/customer-order-migration`

#### Fields MAPPED (Stored in CRM) ✅

| POS Field | CRM Field | Notes |
|-----------|-----------|-------|
| id | pos_order_id | POS order ID |
| restaurant_order_id | restaurant_order_id | Display order number |
| user_id | pos_customer_id | POS customer reference |
| restaurant_id | pos_restaurant_id | Restaurant ID |
| order_amount | order_amount | Total amount |
| delivery_charge | delivery_charge | Delivery fee |
| coupon_code | coupon_code | Applied coupon |
| coupon_discount_amount | coupon_discount | Discount amount |
| payment_method | payment_method | Payment mode |
| payment_status | payment_status | Payment status |
| order_status | order_status | Order status |
| order_type | order_type | dine_in/takeaway/delivery |
| table_id | table_id | Table number |
| waiter_id | waiter_id | Waiter ID |
| employee_id | employee_id | Employee who created |
| print_kot | print_kot | KOT printed |
| print_bill_status | print_bill_status | Bill printed |
| order_note | order_notes | Order notes |
| created_at | order_created_at | Order creation time |
| updated_at | order_updated_at | Order update time |
| orderDetails | items | Array of items |

**Order Items (from orderDetails):**
| POS Field | CRM Field |
|-----------|-----------|
| food_details.name | item_name |
| food_details.id | pos_food_id |
| food_details.category_id | item_category |
| quantity | item_qty |
| price/unit_price | item_price |
| variation | variation |
| add_ons | add_ons |
| station | station |
| item_type | item_type |
| food_level_notes | item_notes |
| food_details.veg | is_veg |
| food_details.tax | tax |
| food_details.tax_type | tax_type |
| food_status | food_status |
| ready_at | ready_at |
| serve_at | serve_at |
| cancel_at | cancel_at |

#### Fields NOT MAPPED (Not stored) ❌

| POS Field | Reason | Action Required |
|-----------|--------|-----------------|
| **feedback/rating** | Not included in order response | POS API should include if available |
| **points_earned** | Not returned, CRM calculates | POS should return actual points earned |
| **points_redeemed** | Not returned | POS should return points used in order |
| **wallet_used** | Not returned in migration | POS should return wallet amount used |
| customer full details | Only user_id reference | Acceptable - linked via pos_customer_id |
| item images | Not returned | Low priority |
| item description | Not returned | Low priority |

#### Fields NEWLY MAPPED (Apr 2026) ✅

| POS Field | CRM Field | Notes |
|-----------|-----------|-------|
| delivery_address | delivery_address | Full address object for delivery orders (contact_person_name, address, pincode, house, floor, road, lat, lng). `None` for pos/take_away orders. |

#### Auto-Calculated Fields (CRM side)

| CRM Field | Calculation |
|-----------|-------------|
| customer_id | Matched via pos_customer_id or phone |
| points_earned | Calculated based on loyalty settings |
| mygenie_synced | Set to `true` |
| last_synced_at | Current timestamp |

---

> **⚠️ IMPORTANT:** See `BACKEND_CHANGES_CHECKLIST.md` for detailed action items required from POS team to address unmapped fields.

---

## 13. QR Code

### GET `/qr/generate`
**Description:** Generate customer registration QR code  
**Auth Required:** Yes

**Response:**
```json
{
  "qr_code": "data:image/png;base64,...",
  "registration_url": "https://domain.com/register-customer/{user_id}",
  "restaurant_name": "My Restaurant"
}
```

---

### POST `/qr/register/{restaurant_id}`
**Description:** Register customer via QR (public)  
**Auth Required:** No

**Request Body:** Customer registration fields

---

## 14. Cron Jobs

### GET `/cron/status`
**Description:** Get scheduler status and recent logs  
**Auth Required:** Yes

**Response:**
```json
{
  "scheduler_running": true,
  "scheduled_jobs": [
    {
      "id": "daily_loyalty_jobs",
      "name": "Daily Loyalty Jobs",
      "next_run": "2026-03-18T00:00:00+00:00"
    }
  ],
  "last_run_summary": {...},
  "recent_logs": [...]
}
```

---

### POST `/cron/trigger`
**Description:** Manually trigger loyalty jobs for current user  
**Auth Required:** Yes

---

### POST `/cron/trigger-all-users`
**Description:** Trigger jobs for all users (admin)  
**Auth Required:** Yes

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "detail": "Error message"
}
```

Or for validation errors:

```json
{
  "detail": [
    {
      "loc": ["body", "field_name"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

### Common HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request / Validation Error |
| 401 | Unauthorized |
| 404 | Not Found |
| 422 | Unprocessable Entity |
| 500 | Internal Server Error |
| 503 | Service Unavailable |
| 504 | Gateway Timeout |

---

## Rate Limits

- Standard endpoints: 100 requests/minute
- POS webhooks: 500 requests/minute
- WhatsApp sending: 10 messages/second

---

## Changelog

### v1.3 (2026-04-13)
- **Order Migration - delivery_address**
  - POS order API verified to return full `delivery_address` object for delivery orders
  - `migration.py` now captures `delivery_address` in order_doc during sync
  - Contains: contact_person_name, contact_person_number, address_type, address, pincode, house, floor, road, lat, lng
- **Frontend Address Management**
  - CustomerDetailPage: New "Addresses" tab with full CRUD (add/edit/delete/set-default)
  - CustomersPage Add Modal: Creates addresses via CRUD API after customer creation
  - CustomersPage Edit Modal: Shows addresses array summary with "Manage addresses" link
- **Bug Fixes**
  - Fixed GET `/customers/{id}/addresses` returning false 404 for customers without addresses field (MongoDB projection issue)
- **Full Smoke Test Passed**
  - Backend: 22/22 endpoints (100%)
  - Frontend: 15+ pages all loading correctly
  - Migration verified: 532 customers, 7989 orders for pav2

### v1.2 (2026-04-13)
- **Multiple Addresses Feature**
  - Customer schema now uses `addresses[]` array instead of single address fields
  - Migration sync maps `customer_addresses[]` from POS to `addresses[]`
  - Added Address CRUD endpoints:
    - `GET /customers/{id}/addresses`
    - `POST /customers/{id}/addresses`
    - `PUT /customers/{id}/addresses/{addr_id}`
    - `DELETE /customers/{id}/addresses/{addr_id}`
    - `POST /customers/{id}/addresses/{addr_id}/set-default`
- **Customer Self-Service - Restaurant Scoping**
  - `user_id` (restaurant ID) now **REQUIRED** in send-otp and verify-otp
  - Customer token contains restaurant context
  - All customer self-service endpoints scoped by restaurant
  - Added `GET /customer/me/addresses` endpoint
- **POS Gateway - Addresses Array**
  - `POST /pos/customers` now accepts `addresses[]` array
  - `PUT /pos/customers/{id}` now accepts `addresses[]` array
  - Removed single address fields (address, city, pincode, etc.)
  - Response includes full `addresses[]` array

### v1.1 (2026-04-11)
- Added **Section 2: Customer Self-Service** (3 new endpoints)
  - `POST /customer/send-otp` - Send OTP to customer phone
  - `POST /customer/verify-otp` - Verify OTP & return token + full customer details
  - `GET /customer/me` - Get customer details (refresh)
- `/verify-otp` now returns full customer object (same as `/me`)
- Added customer token authentication type
- Updated section numbering (now 14 sections)

### v1.0 (2026-03-17)
- Initial API documentation
- 80+ endpoints documented
- Full coverage of Auth, Customers, Points, Wallet, Coupons, WhatsApp, POS, Analytics
