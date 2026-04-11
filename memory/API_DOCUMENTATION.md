# MyGenie CRM API Documentation

**Base URL:** `https://your-domain.com/api`  
**Version:** v1.0  
**Last Updated:** 2026-03-17

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Customers](#2-customers)
3. [Segments](#3-segments)
4. [Points & Loyalty](#4-points--loyalty)
5. [Wallet](#5-wallet)
6. [Coupons](#6-coupons)
7. [Feedback](#7-feedback)
8. [Analytics](#8-analytics)
9. [WhatsApp](#9-whatsapp)
10. [POS Gateway](#10-pos-gateway)
11. [Migration](#11-migration)
12. [QR Code](#12-qr-code)
13. [Cron Jobs](#13-cron-jobs)

---

## Authentication Header

All authenticated endpoints require:
```
Authorization: Bearer {access_token}
```

POS Gateway endpoints require:
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

## 2. Customers

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

## 3. Segments

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

## 4. Points & Loyalty

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

## 5. Wallet

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

## 6. Coupons

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

## 7. Feedback

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

## 8. Analytics

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

## 9. WhatsApp

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

## 10. POS Gateway

**Note:** All POS endpoints use `X-API-Key` header instead of Bearer token.

### POST `/pos/customers`
**Description:** Create customer from POS  
**Auth:** X-API-Key

**Request Body:** Full customer object with pos_id and restaurant_id

---

### PUT `/pos/customers/{customer_id}`
**Description:** Update customer from POS  
**Auth:** X-API-Key

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

## 11. Migration

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
| **Multiple addresses** | POS returns single address only | POS API needs to return address array |
| f_name | Combined into `name` | Consider storing separately |
| l_name | Combined into `name` | Consider storing separately |
| alternate_phone | Not captured | Add field to schema |
| profile_image | Not captured | Add field to schema |
| company_name | Not captured (different from gst_name) | Add field to schema |
| tags/labels | Not returned by POS | Request from POS team |
| preferred_language | Not returned by POS | Request from POS team |
| gender | Not returned by POS | Request from POS team |
| membership_details | Partially mapped | Review completeness |

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
| **delivery_address** | Only `address_id` returned, NOT full address details | POS API needs to return full address object (address_line, city, pincode, landmark, lat/lng). **Note:** Customer sync DOES return address - this is only missing in Order sync |
| **feedback/rating** | Not included in order response | POS API should include if available |
| **points_earned** | Not returned, CRM calculates | POS should return actual points earned |
| **points_redeemed** | Not returned | POS should return points used in order |
| **wallet_used** | Not returned in migration | POS should return wallet amount used |
| customer full details | Only user_id reference | Acceptable - linked via pos_customer_id |
| item images | Not returned | Low priority |
| item description | Not returned | Low priority |

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

## 12. QR Code

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

## 13. Cron Jobs

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

### v1.0 (2026-03-17)
- Initial API documentation
- 80+ endpoints documented
- Full coverage of Auth, Customers, Points, Wallet, Coupons, WhatsApp, POS, Analytics
