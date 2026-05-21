# MyGenie CRM — Database Schema Documentation

## Overview

- **Database**: MongoDB (`mygenie`)
- **Driver**: Motor (async Python)
- **Host**: External (52.66.232.149)
- **Collections**: 22
- **Total Documents**: ~52K
- **Multi-tenancy**: `user_id` field on every collection isolates restaurant data

---

## Data Flow

```
                    +----------------+
                    |  MyGenie POS   |
                    +-------+--------+
                            |
               Webhooks     |    Migration Sync
            (real-time)     |    (batch pull)
                            v
+----------+  JWT   +-------------+  API Key   +----------------+
|   CRM    |<------>|   FastAPI   |<---------->|  External POS  |
|   Staff  |        |   Backend   |            |  (Petpooja..)  |
+----------+        +------+------+            +----------------+
                           |
                    OTP / Skip-OTP
                           |
                           v
                    +-------------+
                    | Scan & Order|
                    |   (Mobile)  |
                    +-------------+
```

---

## Entity Relationship Diagram

```
users (1)
  |
  |-- 1:N --> customers
  |             |
  |             |-- embedded --> addresses[]
  |             |-- 1:N ------> points_transactions
  |             |-- 1:N ------> wallet_transactions
  |             |
  |-- 1:N --> orders
  |             |
  |             |-- embedded --> items[]
  |             |-- 1:N ------> order_items
  |             
  |-- 1:1 --> loyalty_settings
  |-- 1:N --> automation_rules
  |-- 1:N --> whatsapp_templates
  |-- 1:N --> coupons
  |-- 1:N --> segments
  |-- 1:1 --> customer_app_config (by restaurant_id)
  |-- 1:N --> feedback
  |-- 1:N --> pos_event_logs
```

---

## Collections

### 1. `users` — Restaurant Owners/Staff

**Role**: Each document = 1 restaurant. This is the **tenant key** for all data isolation.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Primary key. Format: `pos_0001_restaurant_{N}` |
| `email` | string | Login email |
| `password_hash` | string | Bcrypt hash |
| `restaurant_name` | string | Display name |
| `phone` | string | Owner phone |
| `first_name` | string | Owner first name |
| `last_name` | string | Owner last name |
| `pos_id` | string | POS system ID (e.g., "0001") |
| `pos_name` | string | POS system name (e.g., "MyGenie") |
| `restaurant_id` | string | POS restaurant ID (e.g., "478") |
| `api_key` | string | API key for POS integration (format: `dp_live_xxx`) |
| `mygenie_token` | string | SSO token for MyGenie API calls. Refreshed on each login. |
| `mygenie_synced` | boolean | Whether initial data sync has been done |
| `total_customers_in_pos` | integer | Total customers reported by MyGenie API |
| `total_orders_in_pos` | integer | Total orders reported by MyGenie API |
| `last_customer_sync_at` | ISO string | Last customer sync timestamp |
| `last_order_sync_at` | ISO string | Last order sync timestamp |
| `created_at` | ISO string | Account creation date |
| `last_login` | ISO string | Last login timestamp |
| `migration_confirmed` | boolean | Whether migration was confirmed by user |
| `migration_confirmed_at` | ISO string | Migration confirmation timestamp |
| `migration_skipped_permanently` | boolean | User chose to never show migration |

**Document count**: 19

---

### 2. `customers` — End Customers

**Role**: Customer records. One doc per customer per restaurant (multi-tenant). Same phone at 2 restaurants = 2 separate documents.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Primary key |
| `user_id` | string | FK to `users.id` (tenant isolation) |
| `name` | string | Customer name |
| `phone` | string | Phone number (unique per user_id) |
| `country_code` | string | Default "+91" |
| `email` | string | Email address |
| `dob` | string | Date of birth |
| `anniversary` | string | Anniversary date |
| `customer_type` | string | "normal" or other types |
| `tier` | string | Loyalty tier: Bronze / Silver / Gold / Platinum |
| `total_points` | integer | Current available points |
| `total_points_earned` | integer | Lifetime points earned |
| `total_points_redeemed` | integer | Lifetime points redeemed |
| `wallet_balance` | float | Current wallet balance |
| `total_wallet_received` | float | Lifetime wallet credits |
| `total_wallet_used` | float | Lifetime wallet debits |
| `total_coupon_used` | integer | Total coupons used |
| `total_visits` | integer | Order count |
| `total_spent` | float | Lifetime spend amount |
| `last_visit` | ISO string | Last order date |
| `addresses` | array | **Embedded address array** (see section below) |
| `allergies` | array | Customer allergies |
| `favorites` | array | Favorite items |
| `notes` | string | Staff notes |
| `address` | string | Legacy flat address (from migration) |
| `city` | string | Legacy city |
| `pincode` | string | Legacy pincode |
| `gst_name` | string | GST billing name |
| `gst_number` | string | GST number |
| `custom_field_1` | string | Custom field |
| `custom_field_2` | string | Custom field |
| `custom_field_3` | string | Custom field |
| `password_hash` | string | For Scan & Order password login |
| `whatsapp_opt_in` | boolean | WhatsApp marketing consent |
| `is_blocked` | boolean | Soft-delete flag |
| `pos_customer_id` | integer | MyGenie POS customer ID |
| `pos_id` | string | POS system ID |
| `pos_restaurant_id` | string | POS restaurant ID |
| `mygenie_synced` | boolean | Whether synced from MyGenie |
| `last_synced_at` | ISO string | Last sync timestamp |
| `last_updated_at` | ISO string | Last update from POS |
| `last_points_expiry` | ISO string | Last points expiry check |
| `created_at` | ISO string | Record creation date |
| `updated_at` | ISO string | Last modification date |

**Document count**: ~1,667

**Cross-restaurant lookup**: Phone number is used to find a customer across all restaurants (e.g., address-lookup endpoint).

---

### 2a. `customers.addresses[]` — Embedded Address Array

**Role**: All addresses for a customer. Shared between POS, Scan & Order app, and CRM staff. Written by migration, POS CRUD, and Scan CRUD.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | CRM internal ID (format: `addr_xxxxxxxxxxxx`) |
| `pos_address_id` | string | MyGenie POS address ID (integer cast to string) |
| `address_type` | string | "Home" / "Office" / "Other" |
| `address` | string | Full address text |
| `house` | string | House/flat number |
| `floor` | string | Floor |
| `road` | string | Road/street |
| `city` | string | City |
| `state` | string | State |
| `pincode` | string | Postal code |
| `country` | string | Default "India" |
| `latitude` | string | GPS latitude |
| `longitude` | string | GPS longitude |
| `contact_person_name` | string | Contact name for delivery |
| `contact_person_number` | string | Contact phone for delivery |
| `dial_code` | string | Phone dial code (e.g., "+91") |
| `zone_id` | string | Delivery zone ID (integer cast to string) |
| `delivery_instructions` | string | Special delivery notes |
| `is_default` | boolean | Whether this is the default address |
| `created_at` | ISO string | Address creation date |
| `updated_at` | ISO string | Last modification date |

**Design notes**:
- Embedded inside `customers` (not a separate collection) for atomic reads
- `pos_address_id` and `zone_id` are stored as strings but may contain integer values from legacy POS writes
- First address added is automatically set as default
- Dedup on `address + pincode` — same address won't be duplicated

---

### 3. `orders` — Order History

**Role**: All orders synced from POS or received via webhook. One doc per order.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Primary key |
| `user_id` | string | FK to `users.id` |
| `customer_id` | string | FK to `customers.id` |
| `pos_id` | string | POS system ID |
| `pos_restaurant_id` | string | POS restaurant ID |
| `pos_order_id` | integer | Original POS order ID |
| `restaurant_order_id` | string | Restaurant's internal order number |
| `pos_customer_id` | integer | POS customer ID |
| `cust_mobile` | string | Customer phone (denormalized) |
| `cust_name` | string | Customer name (denormalized) |
| `cust_email` | string | Customer email (denormalized) |
| `order_amount` | float | Total order amount |
| `delivery_charge` | float | Delivery fee |
| `coupon_code` | string | Applied coupon code |
| `coupon_discount` | float | Coupon discount amount |
| `payment_method` | string | Payment method |
| `payment_status` | string | Payment status |
| `order_status` | string | Order status |
| `order_type` | string | Dine-in / Delivery / Takeaway |
| `table_id` | string | Table number (for dine-in) |
| `waiter_id` | string | Waiter ID |
| `employee_id` | string | Employee who created order |
| `employee_name` | string | Employee name |
| `print_kot` | string | KOT print status |
| `print_bill_status` | string | Bill print status |
| `order_notes` | string | Order-level notes |
| `restaurant_name` | string | Restaurant name (denormalized) |
| `items` | array | **Embedded items snapshot** |
| `points_earned` | integer | Loyalty points earned from this order |
| `off_peak_bonus` | integer | Off-peak bonus points |
| `mygenie_synced` | boolean | Synced from MyGenie migration |
| `last_synced_at` | ISO string | Last sync timestamp |
| `order_created_at` | string | Original order creation time in POS |
| `order_updated_at` | string | Original order update time in POS |
| `created_at` | ISO string | CRM record creation date |

**Document count**: ~30,577

**Embedded `items[]`**: Each item has `item_name`, `pos_food_id`, `item_category`, `item_qty`, `item_price`, `variation[]`, `add_ons[]`, `station`, `item_type`, `item_notes`, `is_veg`, `tax`, `tax_type`, `food_status`, `ready_at`, `serve_at`, `cancel_at`.

---

### 4. `order_items` — Denormalized Order Items

**Role**: Flattened order items for analytics queries (aggregation by item, category, customer). Mirrors `orders.items[]` but as separate documents with indexes.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Primary key |
| `order_id` | string | FK to `orders.id` |
| `customer_id` | string | FK to `customers.id` |
| `user_id` | string | FK to `users.id` |
| `item_name` | string | Item name |
| `pos_food_id` | integer | POS food item ID |
| `item_category` | integer | Category ID |
| `item_qty` | integer | Quantity ordered |
| `item_price` | float | Unit price |
| `variation` | array | Variations selected |
| `add_ons` | array | Add-ons selected |
| `station` | string | Kitchen station |
| `item_type` | string | Item type |
| `item_notes` | string | Item-level notes/customizations |
| `is_veg` | boolean | Vegetarian flag |
| `tax` | float | Tax amount |
| `tax_type` | string | Tax type |
| `food_status` | string | Food preparation status |
| `ready_at` | string | When food was ready |
| `serve_at` | string | When food was served |
| `cancel_at` | string | When food was cancelled |
| `created_at` | ISO string | Record creation date |

**Document count**: ~18,466
**Indexes**: `customer_id_1`, `item_name_1`, `order_id_1`

---

### 5. `points_transactions` — Points Ledger

**Role**: Append-only ledger of all point earn/redeem events.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Primary key |
| `user_id` | string | FK to `users.id` |
| `customer_id` | string | FK to `customers.id` |
| `transaction_type` | string | "earn" or "redeem" |
| `points` | integer | Points amount |
| `description` | string | Human-readable description |
| `created_at` | ISO string | Transaction date |
| `expired_at` | ISO string | When points expired (if applicable) |
| `points_expired` | integer | Points expired count |

**Document count**: 112

---

### 6. `wallet_transactions` — Wallet Ledger

**Role**: Append-only ledger of all wallet credit/debit events.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Primary key |
| `user_id` | string | FK to `users.id` |
| `customer_id` | string | FK to `customers.id` |
| `transaction_type` | string | "credit" or "debit" |
| `amount` | float | Transaction amount |
| `description` | string | Human-readable description |
| `created_at` | ISO string | Transaction date |

**Document count**: 23

---

### 7. `loyalty_settings` — Loyalty Program Config

**Role**: One document per restaurant. Defines earn rates, redemption rules, tier thresholds, and bonus programs.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Primary key |
| `user_id` | string | FK to `users.id` |
| `min_order_value` | float | Minimum order to earn points |
| `bronze_earn_percent` | float | Bronze tier earn rate % |
| `silver_earn_percent` | float | Silver tier earn rate % |
| `gold_earn_percent` | float | Gold tier earn rate % |
| `platinum_earn_percent` | float | Platinum tier earn rate % |
| `redemption_value` | float | Monetary value per point (e.g., 0.25) |
| `min_redemption_points` | integer | Minimum points to redeem |
| `max_redemption_percent` | float | Max % of order payable by points |
| `max_redemption_amount` | float | Max amount redeemable per order |
| `points_expiry_months` | integer | Points expire after N months |
| `expiry_reminder_days` | integer | Remind N days before expiry |
| `tier_silver_min` | integer | Points needed for Silver |
| `tier_gold_min` | integer | Points needed for Gold |
| `tier_platinum_min` | integer | Points needed for Platinum |
| `birthday_bonus_enabled` | boolean | Birthday bonus toggle |
| `birthday_bonus_points` | integer | Points awarded on birthday |
| `birthday_bonus_days_before` | integer | Days before birthday to award |
| `birthday_bonus_days_after` | integer | Days after birthday to award |
| `anniversary_bonus_enabled` | boolean | Anniversary bonus toggle |
| `anniversary_bonus_points` | integer | Points awarded on anniversary |
| `anniversary_bonus_days_before` | integer | Days before to award |
| `anniversary_bonus_days_after` | integer | Days after to award |
| `first_visit_bonus_enabled` | boolean | First visit bonus toggle |
| `first_visit_bonus_points` | integer | Points for first order |
| `off_peak_bonus_enabled` | boolean | Off-peak bonus toggle |
| `off_peak_start_time` | string | Off-peak window start (HH:MM) |
| `off_peak_end_time` | string | Off-peak window end (HH:MM) |
| `off_peak_bonus_type` | string | Bonus type (percentage/fixed) |
| `off_peak_bonus_value` | float | Bonus value |
| `feedback_bonus_enabled` | boolean | Feedback bonus toggle |
| `feedback_bonus_points` | integer | Points for submitting feedback |

**Document count**: 19

---

### 8. `coupons` — Coupon Definitions

**Role**: Coupon templates created by restaurant staff.

**Document count**: 0 (scaffolded, not yet used)

---

### 9. `segments` — Customer Segments

**Role**: Customer segmentation rules for targeted campaigns.

**Document count**: 0 (scaffolded, not yet used)

---

### 10. `customer_otps` — OTP Records

**Role**: Stores OTP codes for Scan & Order customer authentication.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Primary key |
| `phone` | string | Customer phone |
| `user_id` | string | Restaurant ID (scoped OTP) |
| `otp` | string | 6-digit OTP code |
| `customer_id` | string | FK to `customers.id` (null if new) |
| `expires_at` | ISO string | OTP expiry (10 minutes) |
| `verified` | boolean | Whether OTP was verified |
| `created_at` | ISO string | OTP creation time |

**Document count**: 33
**Rate limit**: Max 3 OTPs per phone per restaurant per 5 minutes
**Note**: The `skip-otp` flow (`POST /scan/auth/skip-otp`) does NOT create any OTP records — it directly issues a token by phone + restaurant_id.

---

### 11. `customer_app_config` — Scan & Order App Config

**Role**: Per-restaurant configuration for the customer-facing Scan & Order app. Controls UI theme, features, social links, and content.

| Field | Type | Description |
|-------|------|-------------|
| `restaurant_id` | string | Restaurant identifier (lookup key) |
| `primaryColor` | string | Primary theme color |
| `secondaryColor` | string | Secondary theme color |
| `backgroundColor` | string | App background color |
| `textColor` | string | Primary text color |
| `textSecondaryColor` | string | Secondary text color |
| `buttonTextColor` | string | Button text color |
| `borderRadius` | string | UI border radius |
| `fontHeading` | string | Heading font |
| `fontBody` | string | Body font |
| `logoUrl` | string | Restaurant logo URL |
| `banners` | array | Promotional banners |
| `tagline` | string | Restaurant tagline |
| `welcomeMessage` | string | Welcome text |
| `showLogo` | boolean | Show logo toggle |
| `showCategories` | boolean | Show menu categories |
| `showCallWaiter` | boolean | Enable call waiter button |
| `showPayBill` | boolean | Enable pay bill button |
| `showTableNumber` | boolean | Show table number |
| `showDescription` | boolean | Show item descriptions |
| `showPriceBreakdown` | boolean | Show price breakdown |
| `showSpecialInstructions` | boolean | Show special instructions |
| `showCookingInstructions` | boolean | Show cooking instructions |
| `showCustomerDetails` | boolean | Show customer details |
| `showFooter` | boolean | Show footer |
| `showPoweredBy` | boolean | Show powered by MyGenie |
| `showSocialIcons` | boolean | Show social media links |
| `showAboutUs` | boolean | Show about us section |
| `showPromotionsOnMenu` | boolean | Show promotions on menu |
| `showHamburgerMenu` | boolean | Show hamburger menu |
| `showWelcomeText` | boolean | Show welcome text |
| `showTableInfo` | boolean | Show table info |
| `showCustomerName` | boolean | Show customer name |
| `showCustomerPhone` | boolean | Show customer phone |
| `feedbackEnabled` | boolean | Enable feedback feature |
| `feedbackIntroText` | string | Feedback intro text |
| `aboutUsContent` | string | About us content |
| `aboutUsImage` | string | About us image URL |
| `address` | string | Restaurant address |
| `contactEmail` | string | Contact email |
| `phone` | string | Restaurant phone |
| `openingHours` | object | Opening hours config |
| `mapEmbedUrl` | string | Google Maps embed URL |
| `instagramUrl` | string | Instagram URL |
| `facebookUrl` | string | Facebook URL |
| `twitterUrl` | string | Twitter URL |
| `youtubeUrl` | string | YouTube URL |
| `whatsappNumber` | string | WhatsApp number |
| `customPages` | array | Custom page definitions |
| `footerLinks` | array | Footer link definitions |
| `footerText` | string | Footer text |
| `navMenuOrder` | array | Navigation menu ordering |
| `created_at` | ISO string | Config creation date |
| `updated_at` | ISO string | Last modification date |

**Document count**: 28

---

### 12. `dietary_tags_mapping` — Dietary Tag Config

**Role**: Per-restaurant mapping of dietary tags (veg, non-veg, vegan, etc.) for menu items.

| Field | Type | Description |
|-------|------|-------------|
| `restaurant_id` | string | Restaurant identifier |
| `mappings` | object | Tag definitions and mappings |
| `updated_at` | ISO string | Last modification date |
| `updated_by` | string | Staff user who updated |

**Document count**: 5

---

### 13. `feedback` — Customer Feedback

**Role**: Feedback submissions from customers via Scan & Order app.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Primary key |
| `user_id` | string | FK to `users.id` |
| `customer_id` | string | FK to `customers.id` |
| `customer_phone` | string | Customer phone |
| `rating` | integer | Rating (1-5) |
| `message` | string | Feedback text |
| `order_id` | string | FK to `orders.id` (optional) |
| `status` | string | Review status |
| `source` | string | Submission source |
| `created_at` | ISO string | Submission date |

**Document count**: 2

---

### 14. `whatsapp_templates` — WhatsApp Message Templates

**Role**: WhatsApp Business API message templates per restaurant.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Primary key |
| `user_id` | string | FK to `users.id` |
| `name` | string | Template name |
| `message` | string | Template body with variables |
| `media_type` | string | Attachment type |
| `media_url` | string | Attachment URL |
| `variables` | array | Variable definitions |
| `is_active` | boolean | Active flag |
| `created_at` | ISO string | Creation date |
| `updated_at` | ISO string | Last modification date |

**Document count**: 180

---

### 15. `automation_rules` — WhatsApp Automation Rules

**Role**: Event-triggered automation rules that send WhatsApp messages.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Primary key |
| `user_id` | string | FK to `users.id` |
| `event_type` | string | Trigger event (e.g., "order", "birthday") |
| `template_id` | string | FK to `whatsapp_templates.id` |
| `is_enabled` | boolean | Active flag |
| `delay_minutes` | integer | Delay before sending |
| `conditions` | array | Conditional rules |
| `created_at` | ISO string | Creation date |
| `updated_at` | ISO string | Last modification date |

**Document count**: 180

---

### 16. `whatsapp_event_template_map` — Event-to-Template Mapping

**Role**: Maps specific events to WhatsApp templates per restaurant.

| Field | Type | Description |
|-------|------|-------------|
| `user_id` | string | FK to `users.id` |
| `event_key` | string | Event identifier |
| `template_id` | string | FK to `whatsapp_templates.id` |
| `template_name` | string | Template name (denormalized) |
| `is_enabled` | boolean | Active flag |
| `created_at` | ISO string | Creation date |
| `updated_at` | ISO string | Last modification date |

**Document count**: 3

---

### 17. `whatsapp_template_variable_map` — Template Variable Mapping

**Role**: Maps template variables to data fields for dynamic message generation.

| Field | Type | Description |
|-------|------|-------------|
| `template_id` | string | FK to `whatsapp_templates.id` |
| `user_id` | string | FK to `users.id` |
| `template_name` | string | Template name |
| `mappings` | object | Variable-to-field mappings |
| `modes` | object | Variable mode config |
| `updated_at` | ISO string | Last modification date |

**Document count**: 3

---

### 18. `whatsapp_message_logs` — Message Delivery Logs

**Role**: Tracks WhatsApp message delivery status.

**Document count**: 0 (scaffolded, not yet used)

---

### 19. `pos_event_logs` — POS Event Logs

**Role**: Logs for real-time POS events like "call waiter" and "request bill".

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Primary key |
| `type` | string | Event type |
| `user_id` | string | FK to `users.id` |
| `customer_id` | string | FK to `customers.id` |
| `table_id` | string | Table number |
| `message` | string | Event message |
| `status` | string | Event status |
| `created_at` | ISO string | Event timestamp |

**Document count**: 4

---

### 20. `cron_job_logs` — Scheduled Job Logs

**Role**: Execution logs for daily loyalty cron jobs (birthday, anniversary, expiry).

| Field | Type | Description |
|-------|------|-------------|
| `job_name` | string | Job identifier |
| `status` | string | "completed" / "failed" |
| `started_at` | ISO string | Job start time |
| `finished_at` | ISO string | Job end time |
| `duration_seconds` | float | Execution duration |
| `users_processed` | integer | Restaurants processed |
| `birthday` | object | Birthday bonus stats |
| `anniversary` | object | Anniversary bonus stats |
| `expiry_reminders` | object | Expiry reminder stats |
| `expiry` | object | Points expiry stats |
| `errors` | array | Error details |

**Document count**: 34

---

## Key Design Patterns

| Pattern | Implementation |
|---------|---------------|
| **Multi-tenancy** | `user_id` on every collection isolates restaurant data |
| **Embedded arrays** | `addresses[]` inside `customers`, `items[]` inside `orders` — atomic reads, no joins |
| **Dual ID system** | CRM `id` (UUID) + POS `pos_customer_id` / `pos_address_id` (integer to string) |
| **Cross-restaurant lookup** | `phone` number used for address-lookup across tenants |
| **3 auth systems** | Staff JWT, API Key, Customer OTP Token (+ Skip-OTP) — all token-scoped differently |
| **Event sourcing (light)** | `points_transactions` and `wallet_transactions` as append-only ledgers |
| **Denormalization** | `order.items[]` embedded snapshot, `customer.total_*` pre-aggregated counters, `order_items` flattened for analytics |
| **Soft delete** | `is_blocked: true` on customers (data preserved) |

---

## Indexes

| Collection | Index | Purpose |
|------------|-------|---------|
| `order_items` | `customer_id_1` | Fast customer item history lookup |
| `order_items` | `item_name_1` | Item analytics aggregation |
| `order_items` | `order_id_1` | Join back to orders |

**Note**: Most lookups use `user_id` + another field (phone, id, pos_customer_id). Consider adding compound indexes for high-traffic queries:
- `customers`: `{user_id: 1, phone: 1}` (unique)
- `customers`: `{user_id: 1, pos_customer_id: 1}`
- `orders`: `{user_id: 1, customer_id: 1, created_at: -1}`
- `orders`: `{user_id: 1, pos_order_id: 1}` (dedup during sync)

---

## Data Volume Summary

| Collection | Documents | Growth Rate |
|------------|-----------|-------------|
| `orders` | 30,577 | High (every order from POS) |
| `order_items` | 18,466 | High (N items per order) |
| `customers` | 1,667 | Medium (new customer registrations) |
| `whatsapp_templates` | 180 | Low (manual creation) |
| `automation_rules` | 180 | Low (manual creation) |
| `points_transactions` | 112 | Medium (every earn/redeem) |
| `customer_otps` | 33 | Medium (can be TTL-cleaned) |
| `cron_job_logs` | 34 | Low (daily) |
| `customer_app_config` | 28 | Static (config changes) |
| `wallet_transactions` | 23 | Medium (every credit/debit) |
| `users` | 19 | Very low (new restaurants) |
| `loyalty_settings` | 19 | Very low (config changes) |

---

*Last updated: April 20, 2026*
