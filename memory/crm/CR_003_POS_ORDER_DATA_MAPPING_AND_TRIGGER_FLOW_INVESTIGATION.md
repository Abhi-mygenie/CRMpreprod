# CR-003 — POS Order Data Mapping & Trigger Flow Investigation

> **Date:** 2026-05-22
> **Status:** INVESTIGATION COMPLETE — No code changes made
> **Reference Order:** POS order_id `868855`, CRM id `2e490cb8-8cfd-4fed-955a-7d30f505763e`, restaurant 478 / 18march

---

## 1. Endpoint That Receives the Order

**Endpoint:** `POST /api/pos/orders`
**File:** `/app/backend/routers/pos.py` line 1070
**Auth:** `verify_pos_auth` (dual: `X-API-Key` header OR JWT Bearer — API key checked first)
**Schema:** `POSOrderWebhook` (defined inline at pos.py line 995)

There is also a **legacy endpoint** `POST /api/pos/webhook/payment-received` (line 1219) that uses a different, simpler schema (`POSPaymentWebhook`). The new `/orders` endpoint is the canonical path for MyGenie POS. The legacy endpoint does NOT create an `orders` document — it only processes loyalty (points earn/redeem, coupon apply, customer stats update).

### Auth Resolution (pos.py → auth.py line 93)

1. `X-API-Key` header → `db.users.find_one({api_key: <key>})` → returns full user doc
2. JWT Bearer fallback → decode → reject `type=customer` tokens → `db.users.find_one({id: <user_id>})`
3. Neither → 401

The resolved `user` dict carries: `id`, `pos_id`, `restaurant_id`, `restaurant_name`, `api_key`, etc.
For restaurant 478: `user.id = "pos_0001_restaurant_478"`, `user.pos_id = "0001"`, `user.restaurant_id = "478"`.

---

## 2. Step-by-Step Processing Inside `pos_order_webhook`

### Step 1 — Validation (`_validate_order`, line 523)

| Check | Rejection Condition | Response |
|---|---|---|
| pos_id match | `order.pos_id != user.pos_id` (if user has one) | `success:false, "Invalid pos_id"` |
| restaurant_id match | `order.restaurant_id != user.restaurant_id` (if user has one) | `success:false, "Invalid restaurant_id"` |
| payment_status | `!= "success"` | `success:false, "Order not processed - payment status: ..."` |
| Duplicate | existing order with same `(pos_id, pos_restaurant_id, pos_order_id)` | `success:false, "Duplicate order"` |

### Step 2 — Load Loyalty Settings (line 1089)

Query: `db.loyalty_settings.find_one({user_id})`. If none, uses hardcoded defaults:
```
min_order_value: 100.0
bronze_earn_percent: 5.0, silver: 7.0, gold: 10.0, platinum: 15.0
redemption_value: 0.25
tier thresholds: 500/1500/5000
first_visit_bonus_enabled: False
```
For restaurant 478 actual DB values: `first_visit_bonus_enabled: True`, `first_visit_bonus_points: 50`, `min_order_value: 100.0`.

### Step 3 — Find or Create Customer (`_find_or_create_customer`, line 558)

Lookup priority:
1. By `pos_customer_id` (from `order_data.user_id`) → `db.customers.find_one({user_id, pos_customer_id})`
2. By phone → `db.customers.find_one({user_id, phone: order_data.cust_mobile})`

If found:
- Updates `pos_customer_id` on customer if not already set
- Returns `(customer, is_new=False, first_visit_bonus=0)`

If NOT found:
- **Auto-creates customer** with ~60 fields initialized
- Key defaults: `tier="Bronze"`, `total_points=first_visit_bonus`, `wallet_balance=0`, `total_visits=0`, `total_spent=0`, `lead_source="POS"`, `notes="Auto-created via POS order"`
- First visit bonus: If `settings.first_visit_bonus_enabled`, awards `first_visit_bonus_points` (default 50) at creation time
- Also creates a `points_transactions` entry: `type=bonus, description="First visit bonus - Welcome reward"`
- Returns `(customer, is_new=True, first_visit_bonus=50)`

**Reference order trace:** Customer "abhi live" / 8888777766 was auto-created → `is_new=True`, `first_visit_bonus=50`.

### Step 4 — Calculate Points Earned (`_calculate_points`, line 733)

```
IF order_amount < min_order_value THEN points_earned = 0
ELSE:
  earn_percent = tier-based % (Bronze=5%, Silver=7%, Gold=10%, Platinum=15%)
  base_points = floor(order_amount * earn_percent / 100)
  off_peak_bonus = calculated if off_peak window active
  total_points = base_points + off_peak_bonus
```

**Reference order trace:** order_amount=35 < min_order_value=100 → `points_earned=0`, `off_peak_bonus=0`.

### Step 5 — Wallet Validation (line 1110)

```
wallet_used = order_data.wallet_used or 0
IF wallet_used > customer.wallet_balance → reject "Insufficient wallet balance"
new_wallet_balance = current - wallet_used
```

**Reference order trace:** wallet_used=0, no wallet deduction.

### Step 6 — Update Customer Stats (line 1121)

```python
new_points = current_points + points_earned
new_tier = calculate_tier(new_points, settings)
new_total_visits = total_visits + 1
new_total_spent = total_spent + order_amount
new_avg_order_value = round(new_total_spent / new_total_visits, 2)

db.customers.update_one({id}, {$set: {
  total_points, tier, wallet_balance,
  total_visits, total_spent, avg_order_value, last_visit
}})
```

**Reference order trace:** total_points=50 (unchanged, 0 earned), tier=Bronze, visits=1, spent=35, avg=35, last_visit=2026-05-21T07:39:29.

### Step 7 — Save Order & Transactions (`_save_order_and_transactions`, line 768)

#### 7a. `orders` collection insert (line 868)

Full order document with ~50 fields. Key mappings:

| POS Payload Field | CRM `orders` Field | Notes |
|---|---|---|
| `pos_id` | `pos_id` | POS system identifier (e.g., "0001") |
| `restaurant_id` | `pos_restaurant_id` | POS restaurant ID |
| `restaurant_name` | `restaurant_name` | Optional |
| `order_id` | `pos_order_id` | **POS order ID stored as string** |
| `user_id` (POS) | `pos_customer_id` | POS customer ID (not CRM user_id!) |
| `cust_mobile` | `cust_mobile` | Phone |
| `cust_name` | `cust_name` | Customer name |
| `cust_email` | `cust_email` | Optional |
| `order_amount` | `order_amount` | Total amount |
| `order_sub_total_amount` | `order_sub_total` | Sub-total before tax/discounts |
| `order_discount` | `order_discount` | |
| `self_discount` | `self_discount` | |
| `coupon_code` | `coupon_code` | |
| `coupon_discount` | `coupon_discount` | |
| (calculated) | `wallet_used` | Wallet amount used |
| `tax_amount` | `tax_amount` | |
| `gst_tax` | `gst_tax` | |
| `vat_tax` | `vat_tax` | |
| `service_tax` | `service_tax` | |
| `service_gst_tax_amount` | `service_gst_tax_amount` | |
| `tip_amount` | `tip_amount` | |
| `tip_tax_amount` | `tip_tax_amount` | |
| `delivery_charge` | `delivery_charge` | |
| `round_up` | `round_up` | |
| `payment_method` | `payment_method` | |
| `payment_status` | `payment_status` | |
| `payment_type` | `payment_type` | prepaid/postpaid |
| `transaction_id` | `transaction_id` | |
| `order_type` | `order_type` | dinein/takeaway/delivery |
| `order_status` | `order_status` | |
| `table_id` | `table_id` | |
| `waiter_id` | `waiter_id` | |
| `employee_id` | `employee_id` | |
| `employee_name` | `employee_name` | |
| `print_kot` | `print_kot` | |
| `print_bill_status` | `print_bill_status` | |
| `restaurant_order_id` | `restaurant_order_id` | |
| `paid_room` | `paid_room` | |
| `room_id` | `room_id` | |
| `address_id` | `address_id` | |
| `order_notes` | `order_notes` | |
| `items[]` | `items[]` | Embedded array (model_dump) |
| `order_created_at` | `order_created_at` | Original POS timestamp |
| `order_updated_at` | `order_updated_at` | Original POS timestamp |
| (generated) | `id` | CRM UUID |
| (from auth) | `user_id` | CRM restaurant user ID |
| (from step 3) | `customer_id` | CRM customer UUID |
| (from step 4) | `points_earned` | |
| (from step 4) | `off_peak_bonus` | |
| (now) | `created_at` | CRM timestamp |

#### 7b. `order_items` collection (line 871)

One document per item. Each has:
```
id (UUID), order_id, customer_id, user_id,
item_name, pos_food_id, item_category,
item_qty, item_price,
variant, variations, add_on_ids, add_on_qtys, add_ons,
variation_amount, addon_amount, discount_amount, service_charge,
gst_amount, vat_amount,
station, item_notes,
created_at
```

**Reference order trace:** 2 order_items created: "South West Chipotle" (qty=1, price=0) and "hokage" (qty=1, price=0).

#### 7c. `points_transactions` entry (line 917, conditional)

Only created if `points_earned > 0`. Type `"earn"`, with `order_id`, `balance_after`.

**Reference order trace:** points_earned=0 → **NO earn transaction created**. The only points_transaction for this customer is the first_visit bonus.

#### 7d. `wallet_transactions` entry (line 933, conditional)

Only created if `wallet_used > 0`. Type `"debit"`, with `order_id`, `balance_after`.

**Reference order trace:** wallet_used=0 → **NO wallet transaction**.

### Step 8 — Fire WhatsApp Triggers (line 1159)

Three trigger points, all fire-and-forget (`asyncio.create_task`):

| Trigger | Condition | Event Key | Data Passed |
|---|---|---|---|
| **send_bill** | Every order | `"send_bill"` | order_id, pos_order_id, order_amount, points_earned, points_balance, wallet_used, wallet_balance |
| **first_visit** | `is_new == True` | `"first_visit"` | first_visit_bonus, order_amount, points_balance |
| **tier_upgrade** | `new_tier != old_tier AND new rank > old rank` | `"tier_upgrade"` | old_tier, new_tier, points_balance |

#### WhatsApp trigger resolution (`core/whatsapp.py:trigger_whatsapp_event`)

1. `get_user_authkey(db, user_id)` → `db.users.find_one({id}, {authkey_api_key})`
   - If no `authkey_api_key` → **silently skips** (returns None)
2. `get_event_template_config(db, user_id, event_key)`:
   - `db.whatsapp_event_template_map.find_one({user_id, event_key})` → checks `is_enabled`
   - `db.whatsapp_template_variable_map.find_one({user_id, template_id})` → gets variable mappings
   - If no config or disabled → **silently skips**
3. Build `body_values` from template variable mappings + customer data + event data
4. Send via AuthKey.io API
5. Log to `db.whatsapp_message_logs`

**Reference order trace:**
- User "pos_0001_restaurant_478" has `authkey_api_key: null` → **ALL WhatsApp triggers silently skipped**
- `whatsapp_event_template_map`: 0 rows for this user → would also skip at step 2
- `whatsapp_message_logs`: 0 entries for this customer → confirms no messages sent

---

## 3. Customer Match/Auto-Create Logic

### Match Strategy

```
1. IF order_data.user_id (pos_customer_id) is provided:
     → lookup by {user_id, pos_customer_id: order_data.user_id}
     → if found: return existing

2. ALWAYS also try:
     → lookup by {user_id, phone: order_data.cust_mobile}
     → if found:
        - backfill pos_customer_id if not set
        - return existing

3. IF neither found:
     → auto-create new customer
```

### Auto-Create Customer Profile

Key fields set:
- `name`: `cust_name` or fallback `"Customer XXXX"` (last 4 digits of phone)
- `phone`: `cust_mobile`
- `email`: `cust_email` (if provided)
- `lead_source`: `"POS"` (hardcoded)
- `tier`: `"Bronze"`
- `total_points`: first_visit_bonus if enabled, else 0
- `wallet_balance`: 0
- `first_visit_bonus_awarded`: True/False
- `pos_id`, `pos_restaurant_id`, `pos_customer_id`: from order payload

### Scoping

ALL customer lookups are scoped by `user_id` (restaurant user). A customer with phone 8888777766 under restaurant 478 is a **different record** than the same phone under restaurant 739.

---

## 4. Order Items Mapping

Items are handled in two places:

### 4a. Embedded in `orders.items[]`
Raw `model_dump()` of each `OrderItem` — includes all 22 fields (item_name, qty, price, variant, variations, add-ons, taxes, station, notes, etc.)

### 4b. Separate `order_items` collection
Normalized: one doc per item with `order_id`, `customer_id`, `user_id` foreign keys. Used for:
- AI insights (`top_items` aggregation in `customers.py:1331`)
- Item analytics dashboard (`analytics.py:get_item_performance`)
- Item-level note history (`pos.py:pos_customer_item_notes`)

### Item Field Mapping

| POS `OrderItem` Field | `order_items` DB Field | Notes |
|---|---|---|
| `item_name` | `item_name` | Required |
| `pos_food_id` | `pos_food_id` | MyGenie food ID |
| `item_category` | `item_category` | Used for category insights |
| `item_qty` | `item_qty` | |
| `item_price` | `item_price` | food_amount |
| `variant` | `variant` | |
| `variations` | `variations` | Full objects |
| `add_on_ids` | `add_on_ids` | |
| `add_on_qtys` | `add_on_qtys` | |
| `add_ons` | `add_ons` | Full objects |
| `variation_amount` | `variation_amount` | |
| `addon_amount` | `addon_amount` | |
| `discount_amount` | `discount_amount` | |
| `service_charge` | `service_charge` | |
| `gst_amount` | `gst_amount` | |
| `vat_amount` | `vat_amount` | |
| `station` | `station` | Kitchen station |
| `item_notes` | `item_notes` | food_level_notes |

**Not in `order_items` but in `OrderItem` schema:** `tax`, `tax_type`, `item_type`, `food_status`, `ready_at`, `serve_at`, `cancel_at`, `is_veg`. These are accepted by the schema and stored in `orders.items[]` embedded array, but are NOT copied to the `order_items` collection.

---

## 5. Loyalty Points / Wallet / Coupon Effects

### 5a. Points Earned on Order

| Condition | Points Earned |
|---|---|
| `order_amount < min_order_value` (default 100) | **0** — below minimum |
| `order_amount >= min_order_value` | `floor(amount * tier_earn_percent / 100)` |
| Off-peak bonus active | Additional multiplier or flat bonus on base |

Written to `points_transactions` with `type=earn`.

**Reference order:** 35 < 100 → **0 points earned**. This is a gap worth noting (see section 10).

### 5b. First Visit Bonus

Triggered only for **new customers** during `_find_or_create_customer`:
- If `loyalty_settings.first_visit_bonus_enabled = True`
- Awards `first_visit_bonus_points` (default 50)
- Written as `points_transactions.type=bonus, description="First visit bonus - Welcome reward"`
- Customer starts with these points in `total_points`

### 5c. Wallet

- POS sends `wallet_used` in the order payload
- CRM validates `wallet_used <= customer.wallet_balance`
- If valid: deducts from `customers.wallet_balance`, creates `wallet_transactions.type=debit`
- Wallet credits (top-ups) are done via CRM UI only (`/api/wallet/transaction`)

### 5d. Coupons

The `/api/pos/orders` endpoint does **NOT process coupons**. It merely records `coupon_code` and `coupon_discount` as-is from the POS payload. No coupon validation, usage recording, or `coupon_usage` document is created.

The legacy `/api/pos/webhook/payment-received` endpoint DOES process coupons (validates, records usage in `coupon_usage`, decrements bill amount).

The POS-auth coupon flow is separate: `POST /api/pos/coupons/validate` and `POST /api/pos/coupons/apply`.

### 5e. Tier Recalculation

After every order: `new_tier = calculate_tier(new_points, settings)` using thresholds:
```
Platinum: >= 5000
Gold:     >= 1500
Silver:   >= 500
Bronze:   < 500
```

### 5f. Scheduled Loyalty Jobs (Cron, `core/scheduler.py`)

Run daily at 00:00 UTC via APScheduler:

| Job | Effect | Collections Touched |
|---|---|---|
| `run_birthday_bonus` | Awards bonus points if customer DOB in window | `customers`, `points_transactions` |
| `run_anniversary_bonus` | Awards bonus points if anniversary in window | `customers`, `points_transactions` |
| `run_expiry_reminders` | Identifies customers with soon-to-expire points | `customers` |
| `run_points_expiry` | Expires old points, creates `type=expired` transaction | `customers`, `points_transactions` |

Each job fires WhatsApp triggers (`birthday`, `anniversary`, `points_expiring`) if configured.

---

## 6. WhatsApp / Message / Automation Triggers

### Trigger Points from Order Flow

| # | Trigger | When | Event Key | Fire-and-forget? |
|---|---|---|---|---|
| 1 | **send_bill** | Every successful order | `"send_bill"` | Yes (`asyncio.create_task`) |
| 2 | **first_visit** | New customer auto-created | `"first_visit"` | Yes |
| 3 | **tier_upgrade** | Tier increased after points | `"tier_upgrade"` | Yes |

### Trigger Resolution Chain

```
trigger_whatsapp_event(db, user_id, event_key, customer, event_data)
  → get_user_authkey(db, user_id) → users.authkey_api_key
    → NULL? SKIP
  → get_event_template_config(db, user_id, event_key)
    → whatsapp_event_template_map.find_one({user_id, event_key})
      → NOT FOUND or is_enabled=false? SKIP
    → whatsapp_template_variable_map.find_one({user_id, template_id})
  → build_body_values(template_variables, mappings, customer_data, event_data)
  → send_single_message(authkey_api_key, message) via AuthKey.io
  → log_message_attempt → whatsapp_message_logs.insert_one
```

### Automation Rules vs Event Template Map

Two separate systems exist:

1. **`automation_rules`** (10 rows for restaurant 478): Legacy system. Has `event_type` + `template_id` mapping. Referenced by `helpers.py:get_default_templates_and_automation()` during user creation. **NOT used by `trigger_whatsapp_event`** — this function reads `whatsapp_event_template_map` instead.

2. **`whatsapp_event_template_map`** (0 rows for restaurant 478): New system. This is what `trigger_whatsapp_event` actually queries. Since there are 0 rows, **no WhatsApp triggers will fire** even if `authkey_api_key` were set.

### POS Events Webhook (`POST /api/pos/events`, line 1637)

Separate endpoint for POS to trigger event-based WhatsApp messages (order_confirmed, order_ready, etc.). This uses the same `trigger_whatsapp_event` function and the same `whatsapp_event_template_map` lookup. It also logs to `pos_event_logs`.

### Reference Order WhatsApp Status

- `authkey_api_key` = null → All 3 triggers (`send_bill`, `first_visit`, tier_upgrade) silently returned None
- `whatsapp_event_template_map` = empty → Would have also skipped at config check
- `whatsapp_message_logs` = 0 entries → Confirmed: no messages sent
- `automation_rules` = 10 rows exist but are **not consulted** by the active trigger code

---

## 7. How Data Becomes Visible in CRM Frontend

### 7a. Dashboard Page (`DashboardPage.jsx`)

| UI Section | API Endpoint | Backend Query Source |
|---|---|---|
| Customer Health (total, active 30d, new 7d) | `GET /api/analytics/dashboard` | `db.customers` aggregation |
| Repeat Customers (2+, 5+, 10+) | same | `db.customers.total_visits` |
| Inactive (30d, 60d, 90d) | same | `db.customers.last_visit` |
| Orders (total, AOV, per day) | same | `db.orders` aggregation |
| Points (issued, redeemed, balance) | same | `db.points_transactions` aggregation |
| Wallet (issued, used, balance) | same | `db.wallet_transactions` aggregation |
| Coupons (total, used, discount) | same | `db.coupons` + `db.coupon_usage` |
| Revenue (total, 30d, 7d) | same | `db.orders.order_amount` sum |
| Top Selling Items | same | `db.order_items` aggregation |
| Recent Customers | `GET /api/customers?limit=5` | `db.customers` sorted by `created_at` desc |

### 7b. Customers List Page (`CustomersPage.jsx`)

| UI Field | DB Field | Collection |
|---|---|---|
| Name | `customers.name` | customers |
| Phone | `customers.phone` | customers |
| Tier | `customers.tier` | customers |
| Total Points | `customers.total_points` | customers |
| Wallet Balance | `customers.wallet_balance` | customers |
| Total Visits | `customers.total_visits` | customers |
| Total Spent | `customers.total_spent` | customers |
| Last Visit | `customers.last_visit` | customers |
| Lead Source | `customers.lead_source` | customers |

API: `GET /api/customers` with sort/filter/search params.

### 7c. Customer Detail Page (`CustomerDetailPage.jsx`)

Fetches 4 APIs in parallel:

| API | What it provides |
|---|---|
| `GET /api/customers/{id}` | Full customer doc |
| `GET /api/points/transactions/{id}` | Points transaction history |
| `GET /api/wallet/transactions/{id}` | Wallet transaction history |
| `GET /api/points/expiring/{id}` | Expiring points info |

Plus 2 additional:
| `GET /api/customers/{id}/insights` | AI insights (top items, frequency, preferred day/time, spend trend) |
| `GET /api/customers/{id}/loyalty-details` | Redemption value, points money value, active coupons |

**Customer Profile fields:**
- Basic: name, phone, email, gender, DOB, anniversary, customer_type
- Loyalty: total_points, tier, wallet_balance, total_visits, total_spent, avg_order_value
- Source: lead_source, campaign_source
- Permissions: whatsapp_opt_in, promo flags
- Dining: preferred_dining_type, diet_preference, spice_level
- Flags: vip_flag, complaint_flag, blacklist_flag

**Points Tab:**
- Shows all `points_transactions` (earn, redeem, bonus, expired)
- Allows manual: Add Points (bonus), Deduct Points (redeem)

**Wallet Tab:**
- Shows all `wallet_transactions` (credit, debit)
- Allows manual: Credit Wallet, Debit Wallet

### 7d. Wallet Page (`WalletPage.jsx`)

Minimal — just 58 lines. Likely a placeholder or redirect.

### 7e. Coupons Page (`CouponsPage.jsx`)

Manages coupon CRUD. Shows active coupons, usage count. Not directly related to POS order flow since `/api/pos/orders` doesn't process coupons.

### 7f. Loyalty Settings Page (`LoyaltySettingsPage.jsx`)

Configure all loyalty parameters: earn percentages, tier thresholds, min order value, redemption value, off-peak bonus, birthday/anniversary bonuses, first visit bonus.

### 7g. Templates Page (`TemplatesPage.jsx`)

WhatsApp template management. Maps events to templates. This is where `whatsapp_event_template_map` gets populated.

### 7h. Message Status Page (`MessageStatusPage.jsx`)

Shows `whatsapp_message_logs` — delivery status of sent messages.

### 7i. Item Analytics Page (`ItemAnalyticsPage.jsx`)

Shows top-selling items from `order_items` aggregation. POS orders feed this directly.

### 7j. Customer Lifecycle Page (`CustomerLifecyclePage.jsx`)

Classifies customers into lifecycle stages (New, Active, At Risk, Churned, Dormant) based on visit recency and frequency. Uses `orders` + `customers` data.

---

## 8. Data Scoping Rules

### Primary Scoping Key: `user_id`

Every major collection filters by `user_id`, which represents the restaurant user (e.g., `pos_0001_restaurant_478`). This means:

| Collection | Scoping Fields |
|---|---|
| `orders` | `user_id` (mandatory), `customer_id` |
| `order_items` | `user_id`, `customer_id`, `order_id` |
| `customers` | `user_id` (mandatory), `phone` (unique per user_id) |
| `points_transactions` | `user_id`, `customer_id` |
| `wallet_transactions` | `user_id`, `customer_id` |
| `coupons` | `user_id` |
| `coupon_usage` | `coupon_id`, `customer_id` |
| `loyalty_settings` | `user_id` (one per restaurant) |
| `feedback` | `user_id`, `customer_id` |
| `whatsapp_event_template_map` | `user_id`, `event_key` |
| `whatsapp_message_logs` | `user_id`, `customer_id` |
| `automation_rules` | `user_id` |
| `pos_event_logs` | `user_id` |

### Cross-Restaurant Isolation

- Same phone number can have different customer records under different `user_id`s
- One exception: `POST /api/pos/address-lookup` does a cross-restaurant address lookup by phone (no `user_id` filter on the match — collects from all restaurants, dedupes)

### POS Identification

Orders carry: `pos_id` (system like "0001"), `pos_restaurant_id` (restaurant in that system), `pos_order_id` (order in that system). Duplicate detection is per `(pos_id, pos_restaurant_id, pos_order_id)`.

---

## 9. What UI Fields Read Which DB Fields (Quick Reference)

### Customer List → `customers` collection
```
Name         → customers.name
Phone        → customers.phone
Tier Badge   → customers.tier
Points       → customers.total_points
Wallet       → customers.wallet_balance
Visits       → customers.total_visits
Spent        → customers.total_spent
Last Visit   → customers.last_visit
Source        → customers.lead_source
```

### Customer Detail → `customers` + `points_transactions` + `wallet_transactions` + `orders` + `order_items`
```
Profile Card  → customers.{name, phone, email, tier, total_points, wallet_balance, total_visits, total_spent, avg_order_value}
Points History → points_transactions.{transaction_type, points, description, balance_after, created_at}
Wallet History → wallet_transactions.{transaction_type, amount, description, balance_after, created_at}
AI Insights   → order_items aggregation (top items, categories) + orders aggregation (frequency, preferred day/time, spend trend)
Loyalty Details → loyalty_settings.redemption_value * customers.total_points, active coupons
```

### Dashboard → `orders` + `customers` + `points_transactions` + `wallet_transactions` + `coupons` + `coupon_usage` + `order_items` + `feedback`
```
Total Revenue      → sum(orders.order_amount)
Total Orders       → count(orders)
AOV                → avg(orders.order_amount)
Total Customers    → count(customers)
Active 30d         → customers where last_visit > 30d ago
Points Issued      → sum(points_transactions where type=earn|bonus)
Points Redeemed    → sum(points_transactions where type=redeem)
Wallet Issued      → sum(wallet_transactions where type=credit)
Wallet Used        → sum(wallet_transactions where type=debit)
Top Items          → order_items.item_name group + count
```

---

## 10. Gaps and Risks in Current Mapping

### GAP-1: No Points Earned for Small Orders (by design, but notable)

Orders below `min_order_value` (default Rs.100) earn 0 points. The reference order (Rs.35) earned 0 points. This is **by design** per loyalty settings, but restaurant owners may not realize their POS test orders won't generate points.

**Risk:** None (working as intended). Just an awareness point for operators.

### GAP-2: Coupon Not Processed by `/api/pos/orders`

If POS sends `coupon_code` and `coupon_discount`, the order endpoint merely **stores** them in the order document. It does NOT:
- Validate the coupon exists/is active
- Check per-user usage limits
- Create a `coupon_usage` document
- Increment `coupons.total_used`

The legacy endpoint `/webhook/payment-received` DOES process coupons, and there are separate `/pos/coupons/validate` and `/pos/coupons/apply` endpoints.

**Risk: MEDIUM.** If POS relies on `/api/pos/orders` to validate coupons, the coupon system is bypassed. Coupon usage stats in the CRM dashboard will be understated. The separate `/pos/coupons/apply` endpoint exists but requires POS to make a separate API call.

### GAP-3: `total_points_earned` / `total_points_redeemed` / `total_wallet_received` / `total_wallet_used` / `total_coupon_used` Not Updated

The `Customer` Pydantic schema (schemas.py:342-347) defines fields:
```
total_points_earned, total_points_redeemed,
total_wallet_received, total_wallet_used, total_coupon_used
```

But the order webhook ONLY updates:
```
total_points, tier, wallet_balance, total_visits, total_spent, avg_order_value, last_visit
```

The running-total fields (`total_points_earned`, `total_points_redeemed`, etc.) are **never updated** by the order flow. They exist in the schema but are always 0 or missing in the DB.

**Risk: LOW.** The customer detail page reads these via `loyalty-details` endpoint, which reports 0s. Dashboard uses `points_transactions` aggregation directly, which is correct. But the **Customer model may mislead** anyone querying the DB directly.

### GAP-4: `automation_rules` vs `whatsapp_event_template_map` Mismatch

`automation_rules` has 10 rows for restaurant 478 (created during onboarding), but `whatsapp_event_template_map` has 0 rows. The active trigger code reads `whatsapp_event_template_map`, NOT `automation_rules`. This means:

- All WhatsApp triggers are effectively **disabled** for restaurant 478
- The `automation_rules` data is orphaned/unused by the trigger flow
- The Templates page likely writes to `whatsapp_event_template_map`
- Until the restaurant configures templates via the UI, no messages will send

**Risk: LOW-MEDIUM.** Operators may think automation is "set up" (10 rules exist) but no messages actually fire because the template map is empty. The `authkey_api_key` also being null for this user is a separate blocker.

### GAP-5: No `authkey_api_key` for Restaurant 478

`users.authkey_api_key` is null. Even if `whatsapp_event_template_map` were configured, no messages would send. This needs to be set via user profile or settings.

**Risk: LOW.** Just a configuration gap — user needs to enter their AuthKey.io API key.

### GAP-6: `order_items` Missing Some `OrderItem` Fields

The `order_items` collection does NOT store: `tax`, `tax_type`, `item_type`, `food_status`, `ready_at`, `serve_at`, `cancel_at`, `is_veg`. These are only in the embedded `orders.items[]` array.

**Risk: LOW.** The missing fields are mostly migration/status fields. `is_veg` could be useful for dietary analytics but isn't used currently.

### GAP-7: `pos_customer_id` Always Null in Reference Order

The POS sent `user_id: null` in the payload, so `orders.pos_customer_id` is null and the customer's `pos_customer_id` is also null. If POS later sends an order with a `user_id` for the same phone, the customer record will be found by phone and `pos_customer_id` backfilled.

**Risk: LOW.** Works correctly — phone-based lookup is the primary fallback.

### GAP-8: Item Prices = 0 in Reference Order

Both items have `item_price: 0`. This may be how MyGenie POS sends data (prices at order level, not item level), but it means item-level revenue analytics will show Rs.0 per item.

**Risk: LOW.** Item analytics aggregate by quantity (`item_qty`), not price. Revenue comes from `orders.order_amount`.

### GAP-9: No Feedback Loop from Order

The order flow does NOT:
- Create a feedback request
- Schedule a feedback WhatsApp message
- Set any automation tag on the customer

Feedback is a separate manual/scheduled process.

**Risk: LOW.** The `feedback_request` event exists in `CRM_EVENTS` and `automation_rules`, but it's triggered by the cron scheduler or manual CRM action, not by the order webhook.

### GAP-10: `order_created_at` / `order_updated_at` Are Null

POS did not send timestamps for when the order was created/updated in the POS system. CRM stores `created_at` as its own timestamp. If POS timestamps are important for time-zone-accurate reporting, they need to be sent in the payload.

**Risk: LOW.** CRM's own `created_at` serves as the timestamp for all analytics.

---

## 11. Collections Touched by a Single Order (Summary)

| # | Collection | Operation | Condition |
|---|---|---|---|
| 1 | `users` | READ | Auth resolution |
| 2 | `loyalty_settings` | READ | Points calculation |
| 3 | `customers` | READ/UPSERT | Find or create + stats update |
| 4 | `orders` | INSERT | Always (one doc) |
| 5 | `order_items` | INSERT MANY | If items[] provided |
| 6 | `points_transactions` | INSERT | If first_visit_bonus > 0 (new customer) |
| 7 | `points_transactions` | INSERT | If points_earned > 0 |
| 8 | `wallet_transactions` | INSERT | If wallet_used > 0 |
| 9 | `whatsapp_event_template_map` | READ | For each trigger event |
| 10 | `whatsapp_template_variable_map` | READ | If event config found |
| 11 | `whatsapp_message_logs` | INSERT | If message actually sent |
| 12 | `pos_request_logs` | INSERT | If CR-002 middleware enabled |

**NOT touched by order flow:** `coupons`, `coupon_usage`, `feedback`, `pos_event_logs`, `automation_rules`, `segments`, `cron_job_logs`.

---

## 12. Reference Order Complete Trace Summary

```
POS → POST /api/pos/orders (X-API-Key: dp_live_U_q...ip2M)
  ↓
Auth: users.find_one({api_key}) → user "pos_0001_restaurant_478"
  ↓
Validate: pos_id="0001" ✓, restaurant_id="478" ✓, payment_status="success" ✓, no duplicate ✓
  ↓
Load loyalty_settings → first_visit_bonus_enabled=True, min_order_value=100
  ↓
Customer lookup: phone "8888777766" NOT found → AUTO-CREATE
  → customers.insert_one (id=2bc49f69, name="abhi live", points=50, tier=Bronze)
  → points_transactions.insert_one (type=bonus, +50, "First visit bonus")
  ↓
Calculate points: 35 < 100 → points_earned=0
  ↓
Wallet: wallet_used=0 → no deduction
  ↓
Update customer: visits=1, spent=35, avg=35, last_visit=now
  ↓
Save order: orders.insert_one (id=2e490cb8, pos_order_id="868855")
  → order_items.insert_many (2 items)
  → points_transactions: SKIP (0 earned)
  → wallet_transactions: SKIP (0 used)
  ↓
WhatsApp triggers:
  → send_bill: users.authkey_api_key=null → SKIP
  → first_visit: users.authkey_api_key=null → SKIP
  → tier_upgrade: tier unchanged (Bronze→Bronze) → SKIP
  ↓
Response: {success:true, order_id, customer_id, is_new=true, first_visit_bonus=50, points_earned=0}
```

---

*End of Investigation. No code, env, DB, or deployment changes were made.*
