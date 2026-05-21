# CR-001 — POS Order Data Mapping & CRM Visibility — Plan

> **Status:** `cr001_order_data_mapping_plan_waiting_owner_answers`
> **Sprint:** CRM 1.0
> **Priority:** P0
> **Date:** 2026-05-22 (originally authored); **Continued/verified:** 2026-05-21 (continuation run)
> **Source Analysis:** `/app/memory/crm/crm_1_0/analysis/CR_001_ORDER_DATA_MAPPING_ANALYSIS.md`

> ### Continuation Verification Notes (read-only re-check on continuation run)
> Performed on the live shared MongoDB (`mygenie` on `52.66.232.149:27017`) and current `21-may` codebase — **no writes, no code changes**.
>
> 1. **ISSUE-05 (coupon stats collection) is still real.** `/app/backend/services/analytics_service.py` lines 217–233 still query `db.coupon_transactions` with field `discount_amount`. Live coupon write paths (`/app/backend/routers/coupons.py` line 188 and `/app/backend/routers/pos.py` line 2274) still write to `db.coupon_usage` with field `discount_applied`. Only the legacy migration code path (`/app/backend/routers/migration.py` line 226) writes to `coupon_transactions`. The B6 fix in §7 / §8.3 remains correct.
> 2. **No room/hotel orders exist.** DB-wide `order_type` distribution today: `pos: 15,678`, `take_away: 1,301`, `delivery: 272`, `dinein: 96`, `WalkIn: 15`, **room/hotel: 0**. Matches §5.1 exactly. The "Order Type Coverage Matrix" needs no revision.
> 3. **No real raw POS payload has been captured yet.** `pos_request_logs` currently contains only 7 entries, all of which are CR-002 synthetic test payloads (`order_id` like `cr002-*`, minimal field set: `pos_id, restaurant_id, order_id, cust_mobile, order_amount [, cust_name][, payment_status]`). None have `order_type`, `room_id`, `paid_room`, `address_id`, or item arrays. **ISSUE-07 remains a blocker** — Q8 (raw payload capture method) is still required before Phase 2.
> 4. **"BUG-090" reference search was repeated across `/app/memory`, `/app/backend`, `/app/frontend`** — still no occurrence anywhere outside this planning file. Treat BUG-090 as an external/upstream label until owner clarifies (see new Owner Question Q9 below).
> 5. **Baseline accepted as-is.** CRM token push, CR-002 logging, and POS order ingestion for dine-in (reference order 868855) are all confirmed validated upstream. Nothing in this continuation run touched code, env, DB data, or services.

---

## 1. Objective

Verify and fix whether POS order data is correctly mapped into CRM collections and visible correctly in CRM UI, covering all order types (dine-in, delivery, takeaway, walk-in, room/hotel).

---

## 2. Analysis Summary

CR-001 analysis confirmed:
- Base POS → CRM field mapping for the `POSOrderWebhook` schema fields is 1:1 correct
- Data scoping by `user_id` is correct across all read and write paths
- 6 issues found: 3 MEDIUM, 3 LOW — all in downstream visibility / derived stats, not in basic ingestion
- **Critical unknown:** Pydantic `BaseModel` with default `extra="ignore"` silently drops any POS fields not in the schema. Without a real raw payload capture, we cannot confirm what POS sends beyond the schema.

---

## 3. Accepted Baseline

| Baseline Item | Status | Evidence |
|---|---|---|
| CRM token push (pre-sprint CR-001) | Validated | `cr_001_validated_end_to_end` |
| POS request logging (pre-sprint CR-002) | Validated | `cr_002_pos_request_logging_validated_end_to_end` |
| Dine-in order ingestion (restaurant 478) | Validated | Reference orders 868855, 868858 |
| Customer auto-create + first visit bonus | Validated | Customer "abhi live" (50 pts), "A Hishek Jain" (89 pts) |
| Duplicate order rejection | Validated | CR-003 investigation |

---

## 4. Issues Accepted for Planning

| Issue | Severity | Accepted? | Scope | Reason |
|---|---|---|---|---|
| ISSUE-04 | MEDIUM | YES | Fix forward path (increment running totals on every future operation) | Customer running totals always 0 in UI |
| ISSUE-05 | MEDIUM | YES (read-side only) | Fix `analytics_service.py` to query correct collection | Dashboard coupon stats read wrong collection |
| ISSUE-06 | MEDIUM | YES | Add backend endpoint + frontend tab | No order history in customer detail |
| ISSUE-02 | LOW | YES | Add `updated_at` to customer stats $set | Trivial, safe |
| ISSUE-03 | LOW | YES | Add `last_interaction_date` to customer stats $set | Trivial, safe |
| ISSUE-01 | LOW | DEFERRED | Documentation only | `is_veg` not in `order_items` — no consumer |
| **NEW: ISSUE-07** | **BLOCKER** | **BLOCKED** | Capture raw POS payload, compare to schema, identify unmapped fields | Pydantic silently drops extra fields |

---

## 5. Order Type Coverage Matrix

### 5.1 Data from Production DB

| Order Type | Count | cust_mobile present | table_id present | room_id present | address_id present | delivery_charge > 0 | Sample Found |
|---|---|---|---|---|---|---|---|
| `pos` | 15,677 | 45% | YES (most) | 0 | 0 | some | YES |
| `dinein` | 96 | 21% | YES | 0 | 0 | 0 | YES |
| `take_away` | 1,301 | 37% | some (as 0) | 0 | 0 | 0 | YES |
| `delivery` | 272 | 94% | some (as 0) | 0 | 0 | 52% | YES |
| `WalkIn` | 15 | 93% | some (as 0) | 0 | 0 | 0 | YES |
| room/hotel | 0 | — | — | — | — | — | **NONE** |

### 5.2 Order Type → Field Mapping Matrix (from stored DB data)

| Order Type | Customer Fields Sent | Address/Room/Table Fields Sent | CRM Order Mapping | CRM Customer Mapping | UI Visibility | Gaps |
|---|---|---|---|---|---|---|
| **dinein** | cust_mobile (sometimes empty), cust_name (often empty) | table_id=real, waiter_id=real | All schema fields stored | Auto-create if phone present; skipped if phone empty (customer_id=None for old orders) | Dashboard counts it; no order history tab | **ISSUE-06** (no order history); empty-phone orders have customer_id=None |
| **delivery** | cust_mobile (usually present), cust_name | delivery_charge (present), address_id=always null, table_id=0, waiter_id=present | All schema fields stored | Auto-create/match by phone | Dashboard counts it; no order history tab | **ISSUE-06**; address_id always null — POS may send address data in fields not in schema (**ISSUE-07**) |
| **take_away** | cust_mobile (sometimes empty), cust_name (sometimes empty) | table_id=0, waiter_id=present | All schema fields stored | Auto-create if phone present | Dashboard counts it; no order history tab | **ISSUE-06**; 63% have empty phone |
| **WalkIn** | cust_mobile (usually present), cust_name | table_id=0, waiter_id=0 | All schema fields stored | Auto-create/match by phone | Dashboard counts it | **ISSUE-06** |
| **pos** (generic) | cust_mobile (45% empty), cust_name | table_id (usually present), waiter_id | All schema fields stored | customer_id=None for 55% (empty phone from legacy migration data) | Dashboard counts it | **ISSUE-06**; bulk of orders are legacy type="pos" with empty customer data |
| **room/hotel** | UNKNOWN — 0 orders exist | room_id, paid_room — schema accepts them, never received | Fields would be stored if sent | UNKNOWN | UNKNOWN | **ISSUE-07** — no runtime sample; cannot verify |

### 5.3 Key Observations

1. **55% of all orders (9,553/17,361) have empty `cust_mobile`** — these are mostly legacy `order_type=pos` orders from migration. They have `customer_id=None`. This is historical data, not a live bug.
2. **delivery orders never populate `address_id`** — POS may send address info under different field names or not at all.
3. **room orders: zero exist** — schema has `room_id` and `paid_room` fields but they've never been populated.
4. **`order_type` values are inconsistent**: `pos`, `dinein`, `delivery`, `take_away`, `WalkIn` — mixed casing and naming.

---

## 6. Proposed Implementation Scope

### 6.1 Backend Fixes (Safe to implement now)

| # | Fix | Issue | Files | Risk |
|---|---|---|---|---|
| B1 | Add `updated_at` and `last_interaction_date` to customer stats update in order webhook | ISSUE-02, ISSUE-03 | `pos.py:1129-1140` | NONE — additive $set fields |
| B2 | Increment `total_points_earned` in order webhook when `points_earned > 0` | ISSUE-04 | `pos.py:1129-1140` | LOW — additive $inc |
| B3 | Increment `total_wallet_used` in order webhook when `wallet_used > 0` | ISSUE-04 | `pos.py:1129-1140` | LOW — additive $inc |
| B4 | Increment `total_points_earned` / `total_points_redeemed` in CRM manual points endpoint | ISSUE-04 | `points.py` `create_points_transaction` | LOW — additive $inc |
| B5 | Increment `total_wallet_received` / `total_wallet_used` in CRM manual wallet endpoint | ISSUE-04 | `wallet.py` `create_wallet_transaction` | LOW — additive $inc |
| B6 | Fix dashboard coupon stats: query `coupon_usage` instead of `coupon_transactions` | ISSUE-05 | `services/analytics_service.py:get_coupon_stats()` | LOW — read-side only |
| B7 | Add CRM-auth order history endpoint: `GET /api/customers/{id}/orders` | ISSUE-06 | `routers/customers.py` (new endpoint) | NONE — new read-only endpoint |

### 6.2 Frontend Fixes (Safe to implement now)

| # | Fix | Issue | Files | Risk |
|---|---|---|---|---|
| F1 | Add "Orders" tab to customer detail page | ISSUE-06 | `CustomerDetailPage.jsx` | LOW — additive UI, no existing behavior changed |

### 6.3 Blocked Until Raw Payload Capture (ISSUE-07)

| # | Item | Blocked Reason |
|---|---|---|
| P1 | Identify fields POS sends that CRM silently drops | Need raw payload from pos_request_logs |
| P2 | Room/hotel order field mapping | No runtime sample exists |
| P3 | Delivery address mapping completeness | address_id always null — need raw payload to check if POS sends address data under other names |
| P4 | Customer name update policy on repeated orders | Need to observe real behavior patterns across order types |
| P5 | `order_type` normalization (pos vs dinein vs WalkIn casing) | Need to confirm POS-side values before CRM normalizes |

### 6.4 Deferred / Out of Scope

| Item | Reason |
|---|---|
| `is_veg` in `order_items` | No consumer — documentation only (ISSUE-01) |
| Customer running totals backfill for historical data | Requires owner approval for shared production DB script |
| Coupon write-side fixes (add `user_id` to `coupon_usage`) | CR-004 scope |
| WhatsApp automation fixes | CR-002 scope |
| Loyalty points earn/redeem logic changes | CR-003 scope |
| Wallet balance/transaction logic changes | CR-005 scope |
| Multi-restaurant employee support | Out of sprint |
| `order_type` normalization | Blocked on P5 (raw payload capture) |

---

## 7. File-Level Change Plan

| File | Change | Issue | Order Types Affected | Risk |
|---|---|---|---|---|
| `/app/backend/routers/pos.py` ~line 1129 | Add `updated_at`, `last_interaction_date` to `$set`; add `$inc` for `total_points_earned`, `total_wallet_used` | ISSUE-02/03/04 | All | NONE — additive fields |
| `/app/backend/routers/points.py` ~line 52 | Add `$inc` for `total_points_earned` (earn/bonus) or `total_points_redeemed` (redeem) | ISSUE-04 | N/A (CRM UI path) | LOW |
| `/app/backend/routers/wallet.py` ~line 29 | Add `$inc` for `total_wallet_received` (credit) or `total_wallet_used` (debit) | ISSUE-04 | N/A (CRM UI path) | LOW |
| `/app/backend/services/analytics_service.py` ~line 217 | Change `coupon_transactions` → `coupon_usage`; fix field name `discount_amount` → `discount_applied`; handle missing `user_id` via coupon join | ISSUE-05 | N/A (dashboard) | LOW — read-side only |
| `/app/backend/routers/customers.py` | Add new endpoint `GET /{customer_id}/orders` | ISSUE-06 | All | NONE — new read-only endpoint |
| `/app/frontend/src/pages/CustomerDetailPage.jsx` | Add "Orders" tab calling new endpoint, showing table of orders | ISSUE-06 | All | LOW — additive UI |

---

## 8. Detailed Fix Plan by Issue

### 8.1 ISSUE-02 + ISSUE-03 — Customer Timestamps (LOW)

**Current:** `pos_order_webhook` updates customer with `$set: {total_points, tier, wallet_balance, total_visits, total_spent, avg_order_value, last_visit}` — missing `updated_at` and `last_interaction_date`.

**Desired:** Include both fields in the `$set` operation.

**Proposed change** in `pos.py` ~line 1129:
```python
await db.customers.update_one(
    {"id": customer["id"]},
    {"$set": {
        "total_points": new_points,
        "tier": new_tier,
        "wallet_balance": new_wallet_balance,
        "total_visits": new_total_visits,
        "total_spent": new_total_spent,
        "avg_order_value": new_avg_order_value,
        "last_visit": now,
        "updated_at": now,                  # ADD
        "last_interaction_date": now,        # ADD
    }},
)
```

**Affected files:** `pos.py` only
**Order types affected:** All
**Data migration needed:** No
**QA check:** Place order → verify customer doc has `updated_at` and `last_interaction_date` set to order timestamp

### 8.2 ISSUE-04 — Customer Running Totals (MEDIUM)

**Current:** `total_points_earned`, `total_points_redeemed`, `total_wallet_received`, `total_wallet_used`, `total_coupon_used` are never incremented. Always 0 or None for non-migrated customers. Displayed in `CustomerDetailPage.jsx` as 0.

**Desired:** Increment these counters on every relevant operation going forward.

**Proposed changes:**

**(a) Order webhook** (`pos.py` ~line 1129) — change `$set` to mixed `$set` + `$inc`:
```python
update_ops = {
    "$set": {
        "total_points": new_points,
        "tier": new_tier,
        "wallet_balance": new_wallet_balance,
        "total_visits": new_total_visits,
        "total_spent": new_total_spent,
        "avg_order_value": new_avg_order_value,
        "last_visit": now,
        "updated_at": now,
        "last_interaction_date": now,
    }
}
# Conditionally add $inc for running totals
inc_ops = {}
if points_earned > 0:
    inc_ops["total_points_earned"] = points_earned
if wallet_used > 0:
    inc_ops["total_wallet_used"] = wallet_used
if inc_ops:
    update_ops["$inc"] = inc_ops

await db.customers.update_one({"id": customer["id"]}, update_ops)
```

**IMPORTANT:** Cannot mix `$set` on `total_points` and `$inc` on `total_points_earned` in one `update_one` — this is safe because they are different fields. MongoDB allows `$set` and `$inc` in the same update as long as they target different fields.

**(b) CRM manual points endpoint** (`points.py` `create_points_transaction` ~line 52):
After the existing `$set` for `total_points`, add `$inc` for running totals:
```python
inc_update = {}
if tx_data.transaction_type in ("earn", "bonus"):
    inc_update["total_points_earned"] = tx_data.points
elif tx_data.transaction_type == "redeem":
    inc_update["total_points_redeemed"] = tx_data.points
if inc_update:
    await db.customers.update_one({"id": tx_data.customer_id}, {"$inc": inc_update})
```

**(c) CRM manual wallet endpoint** (`wallet.py` `create_wallet_transaction` ~line 29):
After the existing `$set` for `wallet_balance`, add `$inc` for running totals:
```python
inc_update = {}
if tx_data.transaction_type == "credit":
    inc_update["total_wallet_received"] = tx_data.amount
elif tx_data.transaction_type == "debit":
    inc_update["total_wallet_used"] = tx_data.amount
if inc_update:
    await db.customers.update_one({"id": tx_data.customer_id}, {"$inc": inc_update})
```

**(d) `total_coupon_used`:** Deferred to CR-004 scope. The coupon apply endpoints (`coupons.py`, `pos.py /coupons/apply`) will be fixed in CR-004 to increment `total_coupon_used`.

**Affected files:** `pos.py`, `points.py`, `wallet.py`
**Order types affected:** All (for order webhook path)
**Data migration needed:** Not in CR-001. Backfill deferred (see Owner Question Q5).
**QA check:** Place order with amount >= 100 → verify `total_points_earned` incremented. Manual add points → verify increment. Manual wallet credit → verify increment.

### 8.3 ISSUE-05 — Dashboard Coupon Stats (MEDIUM, read-side)

**Current:** `analytics_service.py:get_coupon_stats()` queries `db.coupon_transactions` — a collection only written by migration code. Live coupon usage goes to `db.coupon_usage`.

**Desired:** Query `db.coupon_usage` for live stats.

**Problem:** `coupon_usage` docs have `{coupon_id, customer_id, order_value, discount_applied, channel, used_at}` — no `user_id` field. Dashboard needs user_id scoping.

**Proposed change** in `analytics_service.py:get_coupon_stats()`:
```python
async def get_coupon_stats(user_id: str):
    total_coupons = await db.coupons.count_documents({"user_id": user_id})

    # Get coupon IDs owned by this user
    user_coupon_ids = await db.coupons.distinct("id", {"user_id": user_id})

    if user_coupon_ids:
        coupons_used = await db.coupon_usage.count_documents(
            {"coupon_id": {"$in": user_coupon_ids}}
        )
        pipeline = [
            {"$match": {"coupon_id": {"$in": user_coupon_ids}}},
            {"$group": {"_id": None, "total_discount": {"$sum": "$discount_applied"}}}
        ]
        result = await db.coupon_usage.aggregate(pipeline).to_list(1)
        discount_availed = result[0].get("total_discount", 0) if result else 0.0
    else:
        coupons_used = 0
        discount_availed = 0.0

    return {
        "total_coupons": total_coupons,
        "coupons_used": coupons_used,
        "discount_availed": discount_availed
    }
```

**Affected files:** `services/analytics_service.py`
**Risk:** LOW — read-side only; if `coupon_usage` is empty (as it currently is for all restaurants), the result is still 0, same as today.
**QA check:** Dashboard loads without error; coupon stats show 0 when no usage exists; after a coupon is applied via `/pos/coupons/apply`, count and discount appear.

### 8.4 ISSUE-06 — Order History in Customer Detail (MEDIUM)

**Current:** No order history tab in `CustomerDetailPage.jsx`. No CRM-auth endpoint for customer orders (only POS-auth version at `GET /api/pos/customers/{id}/orders`).

**Desired:** Restaurant owner opens customer profile → sees "Orders" tab → sees list of past orders with date, type, amount, items count.

**Proposed changes:**

**(a) New backend endpoint** in `customers.py`:
```python
@router.get("/{customer_id}/orders")
async def get_customer_orders(
    customer_id: str,
    limit: int = 20,
    skip: int = 0,
    user: dict = Depends(get_current_user)
):
    customer = await db.customers.find_one(
        {"id": customer_id, "user_id": user["id"]}, {"_id": 0, "id": 1}
    )
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    orders = await db.orders.find(
        {"customer_id": customer_id, "user_id": user["id"]},
        {"_id": 0, "id": 1, "pos_order_id": 1, "order_amount": 1,
         "order_type": 1, "payment_method": 1, "payment_status": 1,
         "table_id": 1, "items": 1, "points_earned": 1,
         "created_at": 1, "order_created_at": 1}
    ).sort("created_at", -1).skip(skip).limit(min(limit, 50)).to_list(min(limit, 50))

    total = await db.orders.count_documents(
        {"customer_id": customer_id, "user_id": user["id"]}
    )

    return {"orders": orders, "total": total}
```

**(b) Frontend "Orders" tab** in `CustomerDetailPage.jsx`:
- New tab alongside existing Points/Wallet tabs
- Table columns: Date, Order ID, Type, Amount, Items, Points Earned
- Paginated (load 20 at a time)
- Each row is a summary (not item-detail expansion — that's option B from Q6)

**Affected files:** `customers.py`, `CustomerDetailPage.jsx`
**Risk:** NONE for backend (new read-only endpoint). LOW for frontend (additive tab).
**QA check:** Open customer detail → "Orders" tab visible → shows order list → orders match DB data → scoped by restaurant.

---

## 9. Room / Hotel Order Specific Plan

### 9.1 Current State

- `POSOrderWebhook` schema accepts: `room_id: Optional[str]`, `paid_room: Optional[str]`
- `orders` document stores both fields
- **0 room orders exist** in the production database
- No additional room info fields (guest name, check-in ID, room type, etc.) exist in the schema
- No "BUG-090" reference found in the codebase

### 9.2 What's Known

The schema accepts `room_id` and `paid_room` and would store them if POS sent them. However:
- We don't know if POS sends **additional** room fields that CRM's schema silently drops
- We don't know if room orders use a different customer identification method (e.g., guest name instead of phone)
- We don't know what `paid_room` values look like ("Yes"/"No"? or a room identifier?)

### 9.3 What's Blocked

| Item | Blocked Reason |
|---|---|
| Room info block mapping | **ISSUE-07** — no raw payload sample |
| Guest/customer data mapping | No runtime sample to verify |
| customer_id from room check-in | No evidence this exists |
| BUG-090 impact | No BUG-090 reference found in codebase or docs |

### 9.4 Recommendation

**Defer room-specific implementation until a real room order payload is captured** via CR-002 logging. Include room scenario in QA payload checklist.

---

## 10. Delivery Order Specific Plan

### 10.1 Current State

- 272 delivery orders exist in DB
- `delivery_charge` is populated for 141 of them (up to Rs.100)
- `address_id` is **always null** across all delivery orders
- Customer phone is present in 94% of delivery orders
- No delivery GST field exists in schema

### 10.2 What's Known

The schema accepts `address_id`, `delivery_charge`, and standard customer fields. POS sends `delivery_charge` but never `address_id`. This could mean:
- POS doesn't send address data at all (address is handled in POS only)
- POS sends address data under field names not in the schema (silently dropped by Pydantic)

### 10.3 What's Blocked

| Item | Blocked Reason |
|---|---|
| Delivery address completeness | **ISSUE-07** — address_id always null; raw payload needed |
| Delivery charge GST | Not in schema; may or may not be sent by POS |
| Changed delivery contact | Need raw payload to see if different name/phone is sent |

### 10.4 What Can Be Implemented Now

- `delivery_charge` is already stored correctly
- Customer mapping works (phone-based lookup)
- Order history will show `order_type=delivery` correctly (ISSUE-06 fix)

---

## 11. Customer Scoping and Dedup Rules

### 11.1 Customer Match Key

Primary: `{user_id, pos_customer_id}` → then `{user_id, phone}`

### 11.2 Restaurant Scope

All customer lookups use `user_id` from the authenticated POS user. Phone `8888777766` under restaurant 478 is a separate record from the same phone under restaurant 558.

### 11.3 Same Phone Across Order Types

Same phone from dine-in, delivery, and takeaway all map to the **same customer record** (within the same restaurant). This is correct — a customer is a customer regardless of order type.

### 11.4 Customer Name Update Policy

**Current behavior:** CRM does **not** update customer name on subsequent orders from the same phone. `_find_or_create_customer` only creates if not found; if found by phone, it returns as-is.

**Observation:** Some orders have empty `cust_name` while the customer has a real name — this is fine because the customer was created from an earlier order that had the name. But the reverse case is a problem: if the first order had empty name (creating "Customer 7766") and a later order sends the real name, CRM keeps the generic name forever.

**This is an owner decision — see Q3 in Owner Question Gate.**

### 11.5 Empty Phone Orders

55% of historical orders have empty `cust_mobile` with `customer_id=None`. These are legacy migration data. The current `pos_order_webhook` code requires `cust_mobile` as a string field (Pydantic) but doesn't validate it's non-empty before the customer lookup. If POS sends `cust_mobile: ""`:
- `_find_or_create_customer` searches for phone="" → may find a garbage customer (1 exists with empty phone)
- Or creates a new customer with phone="" → dedup issues

**This is a known edge case.** The order still creates successfully (customer_id may point to a garbage record). Not a blocker for CR-001 but should be documented.

---

## 12. Owner Question Gate

**All questions below must be answered before the plan can be marked final.**

| Q# | Topic | Question | Options | Recommended | Impact if Unanswered |
|---|---|---|---|---|---|
| **Q1** | Room/hotel storage | Should CR-001 handle room-specific mapping beyond current `room_id` + `paid_room`? | A) Yes, extend schema for room info block B) Keep existing fields only (no code change) C) Document only D) **Decide after runtime room payload sample** | **D** | Room mapping deferred; no real data to validate against |
| **Q2** | Delivery address | Where should delivery address data be stored? | A) Orders only (current — no change needed) B) Customers only C) Both orders and customer address book D) **Decide after delivery raw payload sample** | **A** (but recommend **D** to check if POS sends address fields we're dropping) | delivery_charge already works; address_id might have silently dropped data |
| **Q3** | Same phone, changed name | If existing customer has generic name ("Customer 7766") and POS sends real name, should CRM update? | A) Always update to latest POS name B) Never auto-update C) **Update only if existing name is blank/generic** D) Store aliases/history | **C** | Customer profiles may permanently show generic names even when real name is available |
| **Q4** | `is_veg` field | Should `is_veg` be added to `order_items` collection? | A) Yes B) **No, documentation-only** C) Defer to menu metadata CR | **B** | No impact — no consumer exists |
| **Q5** | Running totals backfill | Should we backfill existing customers' running totals from historical transactions? | A) Yes, one-time script on shared prod DB B) No, only fix future updates C) Both: backfill + future fix D) **Defer backfill; fix future updates now** | **D** | Historical customers stay at 0 for earned/redeemed totals; only new activity shows correctly |
| **Q6** | Order history UI | Should CR-001 add order history UI to customer detail? | A) **Yes, basic table** (date, type, amount, items count) B) Yes, table + item detail expansion C) Backend only; UI later D) Defer | **A** | Restaurant owners cannot see a customer's past orders |
| **Q7** | Runtime payload samples | Should implementation proceed without real room/delivery/POS raw payload? | A) Yes, plan from code B) No, block until samples captured C) **Allow confirmed fixes now, defer payload-dependent fixes until captured** | **C** | Confirmed issues (ISSUE-02/03/04/05/06) can ship; payload-dependent items (ISSUE-07, room, delivery address, unmapped fields) wait |
| **Q8** | **Raw payload capture method** | How will the real POS payload be captured? | A) Deploy CR-002 logging to production (captures all live traffic) B) **Point POS to send test order to preview URL** (captures one sample) C) Inspect MyGenie POS codebase directly D) Both A + B | **B** for immediate planning, **A** for ongoing visibility | **BLOCKER** — without this, ISSUE-07 cannot be resolved and we cannot confirm no fields are being silently dropped |
| **Q9** | **BUG-090 scope** | Task brief references "BUG-090 impact" for room/hotel orders, but no BUG-090 occurrence exists in `/app/memory`, `/app/backend`, or `/app/frontend`. How should it be handled? | A) Owner provides BUG-090 description/link → re-plan the room section accordingly B) **Treat BUG-090 as an external/POS-side ticket not in CRM scope** until owner shares it C) Skip BUG-090 references entirely | **B** | Cannot plan room-specific BUG-090 mitigation without the actual ticket text |

---

## 13. Out of Scope

- WhatsApp automation implementation (CR-002)
- Loyalty logic redesign (CR-003)
- Coupon validation/write-side redesign (CR-004)
- Wallet redesign (CR-005)
- Multi-restaurant employee support
- CR-002 logging changes
- CRM token push changes
- Production deployment
- Frontend redesign beyond required order history tab
- `order_type` normalization (blocked on Q7/payload capture)
- Database cleanup / historical data migration
- POS payload contract changes

---

## 14. Risk and Regression Controls

| Control | Description |
|---|---|
| Preserve `user_id` scoping | No changes to auth or scoping logic. All new queries include `user_id`. |
| Preserve existing order insertion | `_save_order_and_transactions` is NOT modified. Only the customer stats `update_one` is touched. |
| No duplicate points | `$inc` for running totals is separate from `$set` for `total_points`. No double-counting. |
| No auth changes | `verify_pos_auth` and `get_current_user` untouched. |
| No POS payload contract changes | `POSOrderWebhook` schema NOT modified in CR-001. |
| No CRM token push regression | `auth.py` `_register_crm_token_with_pos` untouched. |
| No CR-002 logging regression | `pos_request_logger.py` and server.py middleware untouched. |
| Additive-only changes | All fixes add fields to existing `$set`, add `$inc` operations, add new endpoint, add new UI tab. Nothing is removed or restructured. |

---

## 15. QA Plan

### 15.1 Issue-Level QA

| Test | Issue | Method | Expected Result |
|---|---|---|---|
| Place order (amount >= 100) → check customer `total_points_earned` | ISSUE-04 | curl + mongo query | `total_points_earned` incremented by points_earned amount |
| Place order with wallet_used > 0 → check `total_wallet_used` | ISSUE-04 | curl + mongo query | `total_wallet_used` incremented |
| Manual add points via CRM → check `total_points_earned` | ISSUE-04 | CRM UI + mongo query | Incremented |
| Manual redeem points via CRM → check `total_points_redeemed` | ISSUE-04 | CRM UI + mongo query | Incremented |
| Manual wallet credit via CRM → check `total_wallet_received` | ISSUE-04 | CRM UI + mongo query | Incremented |
| Manual wallet debit via CRM → check `total_wallet_used` | ISSUE-04 | CRM UI + mongo query | Incremented |
| Dashboard loads → coupon stats section | ISSUE-05 | CRM UI screenshot | No error; shows 0 when no usage |
| Customer detail → `updated_at` field after order | ISSUE-02 | mongo query | `updated_at` matches order timestamp |
| Customer detail → `last_interaction_date` after order | ISSUE-03 | mongo query | Set to order timestamp |
| Customer detail → "Orders" tab visible | ISSUE-06 | CRM UI screenshot | Tab present, shows order list |
| Customer detail → "Orders" tab data correct | ISSUE-06 | CRM UI + mongo comparison | Matches orders in DB for that customer |

### 15.2 Order Type QA

| Test | Order Type | Method | Checks |
|---|---|---|---|
| Dine-in order with phone + name + table + waiter | dinein | curl POST /api/pos/orders | Customer created/matched; table_id, waiter_id in order doc; order in "Orders" tab |
| Delivery order with phone + delivery_charge | delivery | curl POST /api/pos/orders | Customer created/matched; delivery_charge stored; order_type=delivery visible in Orders tab |
| Takeaway order with phone | take_away | curl POST /api/pos/orders | Customer created/matched; order_type=take_away visible |
| WalkIn order with phone | WalkIn | curl POST /api/pos/orders | Customer created/matched; order_type=WalkIn visible |
| Order with empty cust_mobile | any | curl POST /api/pos/orders | Order created (customer_id may be null or garbage); no crash |
| Room order with room_id + paid_room | room | **BLOCKED** — cannot test without runtime sample | Deferred |

### 15.3 Cross-Type Regression QA

| Test | Method | Expected Result |
|---|---|---|
| Same phone across dine-in + delivery → single customer | curl 2 orders | customer record reused, total_visits=2, total_spent=sum |
| Different restaurant same phone → separate customers | curl with different API keys | 2 separate customer records |
| Order history shows all order types | CRM UI | "Orders" tab lists dinein + delivery + takeaway |
| Dashboard order count correct after new orders | CRM UI | Total orders incremented |
| Dashboard revenue correct | CRM UI | Revenue includes all order types |

### 15.4 Baseline Regression QA

| Test | Method | Expected Result |
|---|---|---|
| POS order creates orders/order_items/customers | curl POST /api/pos/orders | All 3 collections updated |
| pos_request_logs captures request | curl + mongo query | Log entry in pos_request_logs |
| Bad API key returns 401 | curl with wrong key | 401 + logged as `auth_failed` |
| Duplicate order rejected | curl same order_id twice | Second call returns `success:false, "Duplicate order"` |
| CRM login still works | curl POST /api/auth/login | Token returned |

### 15.5 Runtime Payload Checklist (BLOCKED items)

When raw POS payload is captured, verify:

- [ ] All fields in raw payload have a corresponding field in `POSOrderWebhook` schema
- [ ] No silently dropped fields
- [ ] Room fields (if present): document shape, guest info, check-in ID
- [ ] Delivery fields (if present): address data, delivery GST
- [ ] `order_type` values: exact strings POS sends
- [ ] Item-level fields: any new fields not in `OrderItem` schema
- [ ] `pos_customer_id` / `user_id`: when is it populated vs null

---

## 16. Owner Approval Questions (Final Summary)

These questions must be answered before implementation begins:

| # | Question | Blocking? |
|---|---|---|
| **Q1** | Room/hotel storage scope | NO — D (defer) is safe default |
| **Q2** | Delivery address storage | NO — A (current) is safe default |
| **Q3** | Customer name update on repeat orders | **YES** — affects customer matching code |
| **Q4** | `is_veg` field | NO — B (doc-only) is safe default |
| **Q5** | Running totals backfill | NO — D (defer) is safe default |
| **Q6** | Order history UI scope | NO — A (basic table) is safe default |
| **Q7** | Proceed without raw payload? | **YES** — determines implementation slice |
| **Q8** | Raw payload capture method | **YES** — BLOCKER for ISSUE-07 resolution |
| **Q9** | BUG-090 scope | NO — B (out-of-scope until owner shares ticket) is safe default |

**Minimum required answers before implementation:** Q3, Q7, Q8.
**If owner approves recommended defaults:** Q1:D, Q2:A, Q3:C, Q4:B, Q5:D, Q6:A, Q7:C, Q8:B, Q9:B — implementation can start on confirmed fixes immediately while payload capture is arranged.

---

## 17. Final Recommendation

### Recommended Implementation Slice (Phase 1 — No Blockers)

Implement B1 through B7 + F1 immediately. These are:
- Customer timestamp fixes (ISSUE-02/03) — trivial, zero risk
- Customer running total increments (ISSUE-04) — medium, well-scoped
- Dashboard coupon stats read-side fix (ISSUE-05) — medium, read-only
- Order history endpoint + UI tab (ISSUE-06) — medium, additive

**Estimated effort:** 2–3 hours implementation + 1–2 hours QA.

### Phase 2 — After Payload Capture

Once raw POS payload is captured via pos_request_logs:
- Audit every field in the raw payload against `POSOrderWebhook` schema
- Identify any silently dropped fields
- Propose schema extensions if needed
- Test room/delivery/takeaway payload-specific mapping
- Implement customer name update policy per Q3 answer

**Estimated effort:** Depends on findings. Could be 0 (schema already covers everything) to 1–2 days (significant unmapped fields).

---

## 18. Final Status

```
cr001_order_data_mapping_plan_waiting_owner_answers
```

Minimum blocking questions: **Q3** (customer name policy), **Q7** (proceed without raw payload), **Q8** (capture method).

Plan is complete for the confirmed-fix implementation slice. Payload-dependent items are documented and will be addressed in Phase 2 after capture.

---

## 19. Owner Answers — Round 1 (locked) and Re-scoped CR-001

> **Date received:** 2026-05-21 (continuation run).
> Owner replied verbatim: `1 A`, `2 C` (with dedup + impact-on-POS-API/Scan-&-Order-API note), `3 C` (unique phone is main key), `4 A` (implement + verify in real-time payload log), `5 D`, `6 D` (defer to Phase 2), `7 C`, `8 B`, `9 ignore`.

### 19.1 Locked answers

| Q# | Topic | Answer | Effect on plan |
|---|---|---|---|
| Q1 | Room/hotel schema | **A — Extend schema for full room info block now** | NEW backend work: extend `POSOrderWebhook` + `orders` doc with room block. **But gated on Q10 below** (no room payload sample yet). |
| Q2 | Delivery address storage | **C — Store on both `orders` and customer address book, with dedup** | NEW backend work: write order's delivery address into `customers.addresses[]` using existing `address + pincode` dedup. **But this requires a POS payload contract change → gated on Q11 below.** |
| Q3 | Same phone, changed name | **C — Update name only if existing name is blank/generic** | Lock policy: customer match key = `{user_id, phone}` (unique). On match, if `customers.name` is empty, `null`, or matches the auto-generated `^Customer\s+\d+$` pattern, set name to POS `cust_name` (when POS sends a non-empty real name). Otherwise preserve existing name. |
| Q4 | `is_veg` in `order_items` | **A — Implement now and verify against real-time payload logs** | NEW backend work: copy `is_veg` from `OrderItem` model into `order_items` collection write. Verification step: after CR-002 captures a real POS order, confirm `is_veg` is present in the payload. If POS does not send it, downgrade to documentation-only and revert. |
| Q5 | Running totals backfill | **D — Defer backfill; only fix forward-path increments in CR-001** | Per existing §6.4 + §8.2. No script against shared prod DB. |
| Q6 | Order history UI | **D — Defer to Phase 2** | **Remove B7 (backend endpoint) and F1 (frontend tab) from CR-001 Phase 1 scope.** ISSUE-06 stays open and moves to Phase 2 backlog. |
| Q7 | Proceed without raw payload? | **C — Confirmed fixes now, payload-dependent items in Phase 2** | Standard slice; matches §17 Phase 1/Phase 2 split, now updated by Q1/Q2/Q4/Q6 above. |
| Q8 | Raw payload capture method | **B — Capture via real POS test order to preview URL (logs)** | CR-002 logging already deployed; awaiting owner/QA to trigger one real dine-in + one delivery + one room test order from MyGenie POS pointing at the preview URL. |
| Q9 | BUG-090 | **Ignore** | Removed from CR-001 entirely. No further mention required. |

### 19.2 Re-scoped Phase 1 (after Round 1 answers)

In CR-001 Phase 1 we implement the items below. None require a POS payload contract change.

| # | Fix | Issue | Files | Status |
|---|---|---|---|---|
| B1 | Add `updated_at` + `last_interaction_date` to customer stats update in order webhook | ISSUE-02 / ISSUE-03 | `pos.py` ~1129 | LOCKED IN |
| B2 | `$inc total_points_earned` on order webhook when `points_earned > 0` | ISSUE-04 | `pos.py` ~1129 | LOCKED IN |
| B3 | `$inc total_wallet_used` on order webhook when `wallet_used > 0` | ISSUE-04 | `pos.py` ~1129 | LOCKED IN |
| B4 | `$inc total_points_earned` / `total_points_redeemed` in CRM manual points endpoint | ISSUE-04 | `points.py` `create_points_transaction` | LOCKED IN |
| B5 | `$inc total_wallet_received` / `total_wallet_used` in CRM manual wallet endpoint | ISSUE-04 | `wallet.py` `create_wallet_transaction` | LOCKED IN |
| B6 | Dashboard coupon stats: query `coupon_usage` (join via `coupons.id` for `user_id` scope), use `discount_applied` | ISSUE-05 | `services/analytics_service.py:217-233` | LOCKED IN |
| B8 (NEW) | Customer name-update policy (Q3=C). In `_find_or_create_customer`, after lookup-by-phone, if `customer.name` is empty / null / matches `^Customer\s+\d+$` and POS sends a non-empty `cust_name`, `$set` the real name. Idempotent. | ISSUE-NEW from Q3 | `pos.py` `_find_or_create_customer` (~line 558) | LOCKED IN |
| B9 (NEW) | `is_veg` written to `order_items` (copied from `OrderItem.is_veg`) | ISSUE-01 (Q4=A) | `pos.py` `_save_order_and_transactions` (~line 871-915) | LOCKED IN, with post-deploy log verification |

**Removed from Phase 1 (per Q6=D):** ~~B7 (new `GET /api/customers/{id}/orders`)~~ and ~~F1 (Orders tab in `CustomerDetailPage.jsx`)~~ — moved to Phase 2 backlog (ISSUE-06).

### 19.3 Phase 2 / Backlog (after Round 1 answers)

| # | Item | Trigger | Reason it's not Phase 1 |
|---|---|---|---|
| P-R1 | Extend `POSOrderWebhook` schema with full room info block (room number, guest name/phone, check-in id, room type, paid_room semantics) | Q1=A **+** real room payload captured via Q8=B | We do not invent unmapped fields; planned implementation begins once one room order is in `pos_request_logs`. |
| P-D1 | Write delivery address from `/api/pos/orders` into `customers.addresses[]` with dedup by `address + pincode` | Q2=C **+** Q11 owner override (see §19.4) **+** real delivery payload showing address fields | Requires extending `POSOrderWebhook` with full address fields → POS-side change. Today `address_id` is always `null` (272/272 delivery orders). |
| P-D2 | Cross-API impact analysis: how delivery address ingestion interacts with existing POS API (`POST /api/pos/customers/{id}/addresses`, dedup by `address+pincode`) and Scan & Order API (`POST /api/scan/addresses`). Confirm single-source-of-truth on `customers.addresses[]` is preserved (already documented in `SCAN_ORDER_API.md` L662). | Q2=C | Must be designed before any code change to avoid double-dedup or default-address races. |
| P-O1 | Order history endpoint + Orders tab in customer detail | Q6=D → Phase 2 | Explicitly deferred by owner. |
| P-X1 | Raw-payload field gap audit (ISSUE-07). After CR-002 captures one real dine-in + one delivery + one room test order, diff payload keys vs `POSOrderWebhook`/`OrderItem` fields. List silently-dropped fields, propose schema extensions per owner approval. | Q7=C + Q8=B | Pydantic `extra="ignore"` silently drops unknown POS fields. |
| P-X2 | `total_coupon_used` increment | CR-004 scope (owner-confirmed) | Coupon write-side fixes live in CR-004. |
| P-X3 | Customer running-totals one-time backfill | Q5=D → explicitly out of scope | Owner confirmed migration already handles existing customers. |

### 19.4 Two follow-up questions surfaced by Round 1 (need owner answer before Phase 1 implementation begins)

| Q# | Topic | Question | Options | Recommended | Why this is asked |
|---|---|---|---|---|---|
| **Q10** | Room schema timing (resolves Q1↔Q7 conflict) | When should the room info block schema be added? | A) Add now even though no room payload exists yet — I'll provide field names from POS docs B) **Wait until one real room order is captured via Q8=B, then add exactly the fields POS sends** C) Add a placeholder `room_info: dict` blob to `POSOrderWebhook` so POS can start sending anytime, finalize schema in a follow-up CR | **B** | Plan rule §19.2 forbids inventing fields not in code or payload samples. Today there are 0 room orders and 0 room payloads. |
| **Q11** | POS payload contract change for delivery address | Q2=C requires POS to start sending address fields (`address`, `pincode`, `city`, `lat`, `lng`, etc.) on `/api/pos/orders`. `CRM_1_0_SCOPE_AND_RULES.md` line 21 lists *"Changing the POS → CRM order payload contract"* as **Out of Scope**. Confirm? | A) **Override the sprint rule for CR-001 only**, allow the contract change, coordinate POS-side push of new fields, plan implementation under P-D1/P-D2 in Phase 2 B) Keep the rule; CR-001 stores delivery address only when POS first calls `POST /api/pos/customers/{id}/addresses` (existing API), no order-webhook change C) Keep the rule for CR-001, open a separate CR for the contract change | **A** if you want delivery address autopopulated from orders. **C** is cleanest. | Without explicit override, Phase 2 P-D1 cannot start. |

### 19.5 Re-scoped Final Status

```
cr001_order_data_mapping_plan_waiting_owner_answers
```

Outstanding: **Q10**, **Q11**.

Once Q10 + Q11 are answered, plan moves to:

```
cr001_order_data_mapping_plan_ready_for_owner_approval
```

Phase 1 implementation (B1, B2, B3, B4, B5, B6, B8, B9) does **not** depend on Q10 or Q11 and could begin in parallel if the owner chooses to unblock it now. The Q10/Q11 answers gate only Phase 2 (room schema + delivery-address-from-order).

