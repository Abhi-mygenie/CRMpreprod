# CR-001 — POS Order Data Mapping & CRM Visibility — Analysis

> **Status:** `analysis_complete`
> **Sprint:** CRM 1.0
> **Priority:** P0
> **Depends On:** None
> **Date:** 2026-05-22
> **Source Investigation:** `/app/memory/crm/CR_003_POS_ORDER_DATA_MAPPING_AND_TRIGGER_FLOW_INVESTIGATION.md`

---

## 1. POS Payload → CRM DB Field Mapping Audit

### 1.1 `POSOrderWebhook` → `orders` Collection

**File:** `/app/backend/routers/pos.py` lines 995–1067 (schema), 789–866 (order doc build)

The mapping is **complete and correct**. All 50+ fields from the POS payload are mapped 1:1 into the `orders` document. Verified fields:

| Category | Fields | Mapping Status |
|---|---|---|
| POS Identification | pos_id, pos_restaurant_id, restaurant_name, pos_order_id, pos_customer_id | CORRECT |
| Customer Info | cust_mobile, cust_name, cust_email | CORRECT |
| Amounts | order_amount, order_sub_total, order_discount, self_discount, coupon_code, coupon_discount | CORRECT |
| Taxes | tax_amount, gst_tax, vat_tax, service_tax, service_gst_tax_amount | CORRECT |
| Tips & Charges | tip_amount, tip_tax_amount, delivery_charge, round_up | CORRECT |
| Payment | payment_method, payment_status, payment_type, transaction_id | CORRECT |
| Order Meta | order_type, order_status, table_id, waiter_id, employee_id, employee_name, print_kot, print_bill_status, restaurant_order_id | CORRECT |
| Items | items[] (embedded array via model_dump) | CORRECT |
| CRM-generated | id (UUID), user_id (from auth), customer_id (from lookup), points_earned, off_peak_bonus, wallet_used, created_at | CORRECT |

**No field mapping issues found in `orders`.**

### 1.2 `OrderItem` → `order_items` Collection

**File:** `/app/backend/routers/pos.py` lines 948–993 (schema), 871–915 (write)

18 of 22 `OrderItem` schema fields are copied to `order_items`. The following 6 fields are accepted by the schema but **NOT written** to the `order_items` collection:

| Missing Field | Used in Analytics? | Impact |
|---|---|---|
| `tax` | No | None |
| `tax_type` | No | None |
| `item_type` | No | None |
| `food_status` | No | None |
| `ready_at`, `serve_at`, `cancel_at` | No | None |
| `is_veg` | No (but could be useful for dietary insights) | LOW — not currently used |

**These 6 fields ARE stored** in the embedded `orders.items[]` array, just not in the normalized `order_items` collection. Since no current CRM feature queries these fields from `order_items`, this is a documentation-only gap.

**ISSUE-01:** `is_veg` field not in `order_items` — minor, no current consumer.

### 1.3 POS Payload → `customers` Collection (Auto-Create)

**File:** `/app/backend/routers/pos.py` lines 558–730 (`_find_or_create_customer`)

Customer auto-creation correctly maps:

| POS Field | Customer Field | Status |
|---|---|---|
| `cust_name` | `name` (fallback: `"Customer XXXX"`) | CORRECT |
| `cust_mobile` | `phone` | CORRECT |
| `cust_email` | `email` | CORRECT |
| `pos_id` | `pos_id` | CORRECT |
| `restaurant_id` | `pos_restaurant_id` | CORRECT |
| `user_id` (POS) | `pos_customer_id` | CORRECT |

All other customer fields are initialized with sensible defaults (tier=Bronze, total_points=first_visit_bonus, lead_source="POS", etc.).

**No field mapping issues found in customer auto-create.**

---

## 2. Customer Match/Auto-Create Logic Audit

**File:** `/app/backend/routers/pos.py` lines 558–730

### 2.1 Lookup Priority

```
1. By pos_customer_id → db.customers.find_one({user_id, pos_customer_id})
2. By phone → db.customers.find_one({user_id, phone: cust_mobile})
3. Neither found → auto-create
```

**Correct and robust.** Phone-based fallback handles the common case where POS doesn't send `user_id` (as observed in reference order 868855 where `pos_customer_id` was null).

### 2.2 pos_customer_id Backfill

When customer is found by phone but `pos_customer_id` is not set, and POS sends a `user_id`, CRM backfills it:
```python
if order_data.user_id and not customer.get("pos_customer_id"):
    await db.customers.update_one({"id": customer["id"]}, {"$set": {"pos_customer_id": order_data.user_id}})
```

**Correct.** This is an idempotent, additive operation.

### 2.3 First Visit Bonus

Auto-created customers receive first visit bonus if `loyalty_settings.first_visit_bonus_enabled = True`.
- Points added to `customers.total_points` at creation
- Bonus transaction written to `points_transactions` collection
- `customers.first_visit_bonus_awarded = True` flag set

**Correct.** Reference order confirmed: customer "abhi live" got 50 bonus points.

### 2.4 Identified Issue: `updated_at` Not Set on Customer Stats Update

When an existing customer receives a new order, the order webhook updates their stats (line 1129):
```python
await db.customers.update_one({"id": customer["id"]}, {"$set": {
    "total_points": new_points,
    "tier": new_tier,
    "wallet_balance": new_wallet_balance,
    "total_visits": new_total_visits,
    "total_spent": new_total_spent,
    "avg_order_value": new_avg_order_value,
    "last_visit": now,
}})
```

**ISSUE-02:** `updated_at` is NOT included in this `$set`. The customer's `updated_at` field retains its original value (from creation or last CRM UI edit). This means:
- CRM UI that checks "last modified" will show stale data
- The `Customer` Pydantic model (schema) expects `updated_at` to exist and be current
- Severity: **LOW** — `last_visit` is updated and serves as the primary recency indicator

### 2.5 Identified Issue: `last_interaction_date` Not Updated on Order

Auto-created customers get `last_interaction_date = now` at creation (line 641), but the stats update (line 1129) does NOT update `last_interaction_date`. For returning customers, this field goes stale.

**ISSUE-03:** `last_interaction_date` not updated when existing customer places an order.
- Severity: **LOW** — `last_visit` serves the same purpose and IS updated

---

## 3. Customer Running Totals Audit

### 3.1 Fields Updated by Order Webhook

| Customer Field | Updated By Order Webhook? | Correct? |
|---|---|---|
| `total_points` | YES (line 1132) | YES |
| `tier` | YES (line 1133) | YES |
| `wallet_balance` | YES (line 1134) | YES |
| `total_visits` | YES (line 1135) | YES — incremented by 1 |
| `total_spent` | YES (line 1136) | YES — incremented by order_amount |
| `avg_order_value` | YES (line 1137) | YES — recalculated |
| `last_visit` | YES (line 1138) | YES — set to now |

### 3.2 Fields NOT Updated by Order Webhook

| Customer Field | Present in Schema? | Updated Anywhere? | Impact |
|---|---|---|---|
| `total_points_earned` | YES (schemas.py:342) | Only during MyGenie migration sync (customers.py:95) | **ISSUE-04** |
| `total_points_redeemed` | YES (schemas.py:343) | Only during MyGenie migration sync (customers.py:96) | **ISSUE-04** |
| `total_wallet_received` | YES (schemas.py:345) | Only during MyGenie migration sync (customers.py:98) | **ISSUE-04** |
| `total_wallet_used` | YES (schemas.py:346) | Only during MyGenie migration sync (customers.py:99) | **ISSUE-04** |
| `total_coupon_used` | YES (schemas.py:347) | Only during MyGenie migration sync (customers.py:100) | **ISSUE-04** |
| `updated_at` | YES (schemas.py:317) | Only on CRM UI edit (customers.py:836) | ISSUE-02 (above) |
| `last_interaction_date` | YES (schemas.py:365) | Only at customer creation | ISSUE-03 (above) |

**ISSUE-04: Customer running-total fields never updated by order flow or CRM point/wallet operations.**

These 5 fields exist in the `Customer` Pydantic model and are **displayed in the CRM UI** (CustomerDetailPage.jsx lines 278, 285, 300, 304, 312). They are populated ONLY during MyGenie customer sync/migration and are never incremented during normal CRM operations (order webhook, manual point add/deduct, wallet credit/debit).

For customers auto-created by POS orders (not migrated from MyGenie), these fields are always 0.

**Consumers affected:**
- `CustomerDetailPage.jsx` lines 278, 285 → shows `total_points_earned` and `total_points_redeemed` as 0
- `CustomerDetailPage.jsx` lines 300, 304 → shows `total_wallet_received` and `total_wallet_used` as 0
- `CustomerDetailPage.jsx` line 312 → shows `total_coupon_used` as 0
- `GET /api/customers/{id}/loyalty-details` (customers.py:1308-1309) → returns `earned_money_value: 0`, `redeemed_money_value: 0`
- `GET /api/customers/{id}` sample data (customers.py:533-534) → returns 0s

**Severity: MEDIUM.** Restaurant owners see stale/zero values for earned/redeemed totals on customer profiles despite having real transactions in the system.

---

## 4. CRM UI Field → DB Field Mapping

### 4.1 Dashboard Page (`DashboardPage.jsx`)

**API:** `GET /api/analytics/dashboard` → `get_dashboard_stats()` in `feedback.py` → delegates to `services/analytics_service.py`

| Dashboard Card | Backend Source | DB Collection | Correct? |
|---|---|---|---|
| Total Customers | `count(customers)` where `user_id` | `customers` | YES |
| Active 30d | `count(customers)` where `last_visit >= 30d ago` | `customers` | YES |
| New 7d | `count(customers)` where `created_at >= 7d ago` | `customers` | YES |
| Repeat 2+/5+/10+ | `count(customers)` where `total_visits >= N` | `customers` | YES |
| Inactive 30/60/90d | `count(customers)` where `last_visit < Nd ago OR null` | `customers` | YES |
| Total Orders | `count(orders)` where `user_id` | `orders` | YES |
| Avg Order Value | `sum(order_amount) / count(orders)` | `orders` | YES |
| Orders/Day | `count(orders last 30d) / 30` | `orders` | YES |
| Total Revenue | `sum(order_amount)` | `orders` | YES |
| Revenue 30d/7d | `sum(order_amount)` with date filter | `orders` | YES |
| Pts Issued | `sum(points where type=earn|bonus)` | `points_transactions` | YES |
| Pts Redeemed | `sum(points where type=redeem)` | `points_transactions` | YES |
| Pts Balance | issued - redeemed | `points_transactions` | YES |
| Wallet In | `sum(amount where type=credit)` | `wallet_transactions` | YES |
| Wallet Out | `sum(amount where type=debit)` | `wallet_transactions` | YES |
| Wallet Bal | credit - debit | `wallet_transactions` | YES |
| Top Items 30d/7d/all | `group by item_name, sum item_qty` | `order_items` | YES |
| **Coupons** | `count(coupon_transactions)` | **`coupon_transactions`** | **ISSUE-05** |
| **Coupons Used** | `count(coupon_transactions)` | **`coupon_transactions`** | **ISSUE-05** |
| **Discount Availed** | `sum(coupon_transactions.discount_amount)` | **`coupon_transactions`** | **ISSUE-05** |
| Loyalty/Revenue splits | uses `customer_id IN repeat_ids` | `orders` + `customers` | YES |

**ISSUE-05: Dashboard coupon stats query wrong collection.**

`analytics_service.py` lines 220-226 query `db.coupon_transactions` for:
- `coupons_used = await db.coupon_transactions.count_documents({...})`
- `discount_availed = sum(coupon_transactions.discount_amount)`

But the live coupon application code in `coupons.py` and `pos.py` writes to `db.coupon_usage`, NOT `db.coupon_transactions`. The `coupon_transactions` collection exists only from the migration module (`migration.py:226`).

**Result:** Dashboard always shows 0 coupons used and 0 discount availed for any restaurant that didn't go through the migration path. Even if coupons ARE used, the dashboard reads from the wrong collection.

**Severity: MEDIUM.** Dashboard coupon stats are completely non-functional for the live coupon flow. The correct collection is `coupon_usage` and the correct field is `discount_applied` (not `discount_amount`).

### 4.2 Customer List Page (`CustomersPage.jsx`)

**API:** `GET /api/customers` → `list_customers()` in `customers.py:547`

| UI Column | DB Field | Correct? |
|---|---|---|
| Name | `customers.name` | YES |
| Phone | `customers.phone` | YES |
| Visits | `customers.total_visits` | YES |
| Spent | `customers.total_spent` | YES |
| Last Visit | `customers.last_visit` | YES |
| Points | `customers.total_points` | YES |
| Wallet | `customers.wallet_balance` | YES |
| Tier Badge | `customers.tier` | YES |

**All correct.** The `list_customers` endpoint queries with `{_id: 0}` projection and returns `Customer(**c)` Pydantic models, which correctly handle missing/extra fields via `model_config = ConfigDict(extra="ignore")`.

### 4.3 Customer Detail Page (`CustomerDetailPage.jsx`)

**APIs called in parallel:**

| API | Backend Handler | Correct? |
|---|---|---|
| `GET /api/customers/{id}` | `get_customer()` → returns `Customer(**doc)` | YES |
| `GET /api/points/transactions/{id}` | `get_customer_transactions()` → returns list of `PointsTransaction` | YES |
| `GET /api/wallet/transactions/{id}` | `get_wallet_transactions()` → returns list of `WalletTransaction` | YES |
| `GET /api/points/expiring/{id}` | `get_expiring_points()` → calculates expiring points | YES |
| `GET /api/customers/{id}/insights` | `get_customer_insights()` → aggregates from `orders` + `order_items` | YES |
| `GET /api/customers/{id}/loyalty-details` | `get_customer_loyalty_details()` → uses `total_points_earned` etc. | **ISSUE-04 impact** |

**Customer Profile Card displays:**
- Name, phone, email → from `customers` → CORRECT
- Tier badge → from `customers.tier` → CORRECT
- Total visits, total spent, avg order value → from `customers` → CORRECT
- Total points → from `customers.total_points` → CORRECT
- Wallet balance → from `customers.wallet_balance` → CORRECT
- Total points earned / redeemed → from `customers.total_points_earned` / `total_points_redeemed` → **ALWAYS 0** (ISSUE-04)
- Total wallet received / used → from `customers.total_wallet_received` / `total_wallet_used` → **ALWAYS 0** (ISSUE-04)
- Total coupon used → from `customers.total_coupon_used` → **ALWAYS 0** (ISSUE-04)

**Points Tab:** Shows `points_transactions` → CORRECT (transactions are written by order webhook)
**Wallet Tab:** Shows `wallet_transactions` → CORRECT (transactions are written when wallet_used > 0)

**No dedicated order history tab/section exists** in `CustomerDetailPage.jsx`. Customer order history is visible only via:
- AI Insights section (top items, frequency, preferred day/time) — uses `orders` + `order_items` aggregation
- Points transaction descriptions mention order IDs

**ISSUE-06:** No order history view in CRM customer detail page. Restaurant owners cannot see a customer's past orders (items, amounts, dates) from the customer profile. Orders data exists in the `orders` collection with `customer_id` linkage, but no frontend consumes it as a list.

**Severity: MEDIUM.** This is a CRM visibility gap — the data exists but isn't surfaced.

### 4.4 Item Analytics Page (`ItemAnalyticsPage.jsx`)

**API:** `GET /api/analytics/item-performance`

Aggregates from `order_items` collection. POS orders feed this correctly since `order_items` are written with `user_id` scoping.

**Correct.**

### 4.5 Customer Lifecycle Page (`CustomerLifecyclePage.jsx`)

**API:** `GET /api/analytics/customer-lifecycle`

Classifies customers using `customers.total_visits`, `customers.last_visit`, `customers.created_at`. All these fields are correctly updated by the order webhook.

**Correct.**

---

## 5. Data Scoping Audit

### 5.1 Write-Side Scoping (Order Webhook)

| Collection | Scoping Key Written | Source | Correct? |
|---|---|---|---|
| `orders` | `user_id = user["id"]` | From auth | YES |
| `order_items` | `user_id = user["id"]` | From auth | YES |
| `customers` | `user_id = user["id"]` | From auth | YES |
| `points_transactions` | `user_id = user["id"]` | From auth | YES |
| `wallet_transactions` | `user_id = user["id"]` | From auth | YES |

### 5.2 Read-Side Scoping (CRM UI APIs)

| API Endpoint | Scopes by user_id? | Correct? |
|---|---|---|
| `GET /api/customers` | YES — `query = {"user_id": user["id"]}` | YES |
| `GET /api/customers/{id}` | YES — `find_one({"id": id, "user_id": user["id"]})` | YES |
| `GET /api/analytics/dashboard` | YES — all sub-queries include `user_id` | YES |
| `GET /api/points/transactions/{id}` | YES — `find({"customer_id": id, "user_id": user["id"]})` | YES |
| `GET /api/wallet/transactions/{id}` | YES — `find({"customer_id": id, "user_id": user["id"]})` | YES |
| `GET /api/customers/{id}/insights` | YES — aggregations include `user_id` | YES |
| `GET /api/analytics/item-performance` | YES | YES |
| `GET /api/analytics/customer-lifecycle` | YES | YES |

### 5.3 Cross-Restaurant Data Leak Check

One endpoint performs cross-restaurant lookup:

**`POST /api/pos/address-lookup`** (pos.py:2110) — Searches `customers` by phone WITHOUT `user_id` filter to find addresses across restaurants. This is **by design** for delivery address reuse, and the response only returns address data (no customer PII beyond address).

**No data scoping issues found.** All CRM UI queries are correctly restaurant-isolated.

---

## 6. Identified Issues Summary

| Issue ID | Description | File(s) | Severity | CR Scope |
|---|---|---|---|---|
| **ISSUE-01** | `is_veg` field not copied to `order_items` collection | `pos.py:871-915` | LOW | CR-001 |
| **ISSUE-02** | `updated_at` not set when customer stats updated via order webhook | `pos.py:1129-1140` | LOW | CR-001 |
| **ISSUE-03** | `last_interaction_date` not updated when existing customer places order | `pos.py:1129-1140` | LOW | CR-001 |
| **ISSUE-04** | Customer running totals (`total_points_earned`, `total_points_redeemed`, `total_wallet_received`, `total_wallet_used`, `total_coupon_used`) never updated by order flow or CRM operations — always 0 for non-migrated customers. Displayed in CustomerDetailPage as 0. | `pos.py:1129`, `points.py`, `wallet.py`, `CustomerDetailPage.jsx:278-312` | **MEDIUM** | CR-001 |
| **ISSUE-05** | Dashboard coupon stats query `coupon_transactions` (migration-only collection) instead of `coupon_usage` (live collection). Dashboard always shows 0 coupons used. | `services/analytics_service.py:220-226` | **MEDIUM** | CR-001 (read-side fix) + CR-004 (write-side) |
| **ISSUE-06** | No order history view in CRM customer detail page. POS orders exist in DB with customer linkage but aren't displayed as a list. | `CustomerDetailPage.jsx` | **MEDIUM** | CR-001 |

---

## 7. Recommendations

### Priority 1 — MEDIUM Issues (Fix in CR-001)

#### REC-01: Fix customer running totals (ISSUE-04)

Update `pos_order_webhook` customer stats update (pos.py:1129) to also increment:
- `total_points_earned` when `points_earned > 0` (use `$inc`)
- `total_wallet_used` when `wallet_used > 0` (use `$inc`)

Update `create_points_transaction` (points.py:20) to also increment:
- `total_points_earned` for `type=earn|bonus`
- `total_points_redeemed` for `type=redeem`

Update `create_wallet_transaction` (wallet.py:15) to also increment:
- `total_wallet_received` for `type=credit`
- `total_wallet_used` for `type=debit`

Update coupon apply endpoints to also increment:
- `total_coupon_used` on `customers`

**Note:** For existing customers with historical data, a one-time backfill script may be needed to recalculate running totals from `points_transactions` and `wallet_transactions`. This should be planned but NOT run against production without explicit approval.

#### REC-02: Fix dashboard coupon stats collection (ISSUE-05, read-side only)

Change `analytics_service.py:get_coupon_stats()` to query `coupon_usage` instead of `coupon_transactions`:
```python
coupons_used = await db.coupon_usage.count_documents({"user_id": user_id})  # was coupon_transactions
# For discount sum: use discount_applied field (not discount_amount)
```

**Note:** The `coupon_usage` collection currently does NOT have a `user_id` field — it has `coupon_id` and `customer_id`. The query will need to join through `coupons` collection or add `user_id` to `coupon_usage` writes. This crosses into CR-004 territory. For CR-001, the minimal fix is to adjust the query path; CR-004 will handle write-side coupon_usage completeness.

#### REC-03: Add order history section to customer detail page (ISSUE-06)

Add a new tab or section to `CustomerDetailPage.jsx` that fetches and displays:
- `GET /api/customers/{id}/orders` (backend endpoint does NOT exist yet for CRM auth — only exists at `GET /api/pos/customers/{id}/orders` under POS auth)
- Need to create a CRM-auth order history endpoint OR reuse order data already available

**Backend option:** Add `GET /api/customers/{id}/orders` to `customers.py` router:
```python
orders = await db.orders.find(
    {"customer_id": customer_id, "user_id": user["id"]},
    {"_id": 0}
).sort("created_at", -1).limit(20).to_list(20)
```

**Frontend:** Add an "Orders" tab showing: date, order_id, order_amount, items count, payment_method, order_type.

### Priority 2 — LOW Issues (Fix in CR-001 alongside Priority 1)

#### REC-04: Set `updated_at` on customer stats update (ISSUE-02)

Add `"updated_at": now` to the `$set` dict at pos.py:1129.

#### REC-05: Set `last_interaction_date` on customer stats update (ISSUE-03)

Add `"last_interaction_date": now` to the `$set` dict at pos.py:1129.

### Priority 3 — Documentation Only (No code change needed)

#### REC-06: Document `is_veg` gap in order_items (ISSUE-01)

`is_veg` is stored in `orders.items[]` but not in `order_items`. If dietary analytics are needed in the future, this field should be added to the `order_items` write. No current consumer — defer to backlog.

---

## 8. Cross-CR Boundaries

| Issue | CR-001 Scope | Other CR Scope |
|---|---|---|
| ISSUE-04 (running totals) | Fix increments in order webhook + CRM points/wallet endpoints | CR-003 (points), CR-004 (coupons), CR-005 (wallet) will validate their own flows |
| ISSUE-05 (coupon stats) | Fix read-side query in analytics_service.py | CR-004 will fix write-side (`coupon_usage` completeness, adding `user_id`) |
| ISSUE-06 (order history) | Add CRM endpoint + frontend tab | N/A — fully within CR-001 |

---

## 9. What Does NOT Need Fixing in CR-001

| Area | Reason |
|---|---|
| POS payload → `orders` mapping | Verified complete and correct |
| POS payload → `order_items` mapping (18 of 22 fields) | All fields used by analytics are present |
| Customer auto-create logic | Verified correct — phone lookup, backfill, first visit bonus all work |
| Data scoping (user_id isolation) | Verified correct across all read and write paths |
| Dashboard order stats | Revenue, AOV, order count all correct |
| Dashboard customer health stats | Visit counts, active/inactive all correct |
| Dashboard points/wallet stats | Use `points_transactions`/`wallet_transactions` aggregation directly — correct |
| Customer list page | All displayed fields map correctly to customer doc |
| Item analytics | Correctly uses `order_items` with `user_id` scoping |
| Customer lifecycle | Correctly uses `customers` fields updated by order webhook |
| Duplicate order detection | Verified working |
| Tier recalculation | Verified working |

---

## 10. Final Status

```
cr001_order_data_mapping_analysis_complete
```

6 issues identified. 6 recommendations proposed. 3 at MEDIUM severity, 3 at LOW severity. No CRITICAL issues. No data scoping vulnerabilities. Base order mapping is correct — issues are in downstream running totals, dashboard read-side queries, and missing UI for order history.

Ready for planning phase upon owner approval.
