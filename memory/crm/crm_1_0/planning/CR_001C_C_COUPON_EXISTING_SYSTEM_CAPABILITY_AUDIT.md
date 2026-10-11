# CR-001C-C — Coupon Existing-System Capability Audit

**Module:** CR-001C-C (Coupon) — pre-implementation discovery
**Date:** 2026-05-24
**Status:** `cr001c_coupon_existing_system_capability_audit_complete_waiting_owner_decisions`
**Author:** CRM Team

---

## 1. Executive Summary

The existing CRM coupon system provides a **basic but functional foundation** for order-level flat and percentage coupons. It has CRUD, validation, usage tracking, per-customer limits, and two POS endpoints (`/pos/coupons/validate`, `/pos/coupons/apply`).

**What exists:**
- `coupons` collection with `discount_type` (flat/percentage), `min_order_value`, `max_discount`, `usage_limit`, `per_user_limit`, `specific_users` targeting, date range, channel eligibility
- `coupon_usage` collection for per-customer tracking
- CRM admin CRUD (`/api/coupons/*`)
- POS validate + apply endpoints (`/api/pos/coupons/validate`, `/api/pos/coupons/apply`)
- Customer-facing available-coupons endpoint (`/api/scan/coupons`)
- Final order webhook accepts `coupon_code` + `coupon_discount` passthrough fields
- Payment webhook has inline coupon validation + discount computation

**What is missing (blocks POS BUG-108):**
- `GET /pos/coupons/available` does NOT exist on POS router (only on scan router)
- Validate uses **query params** not JSON body (BUG-108 expects JSON body)
- Validate returns **message strings** not structured `error.code` values
- No item-level, category-level, BOGO, Buy-X-Get-Y, every-Nth-free, happy-hour, or free-item coupon types
- No coupon-type field in data model — only `discount_type: "flat"|"percentage"`
- Final order webhook does NOT re-validate coupon — just stores the POS-sent `coupon_code`/`coupon_discount` fields passthrough
- No coupon usage recording at final order time (only at `/coupons/apply` call)
- No tier-based or birthday/anniversary coupon entitlement logic
- Analytics reads `coupon_transactions` (from migration) but coupon system writes to `coupon_usage` — schema mismatch

**Verdict:** ORDER_FLAT and ORDER_PERCENTAGE coupons are **partially ready** — POS can validate and apply them with the existing endpoints, but the contract doesn't match BUG-108 expectations. All advanced coupon types require new implementation.

---

## 2. Inputs Reviewed

| # | Source | Status |
|---|---|---|
| 1 | `/app/memory/PRD.md` | Read |
| 2 | `/app/memory/crm/crm_1_0/planning/CR_001_INDEX.md` | Read |
| 3 | `backend/routers/coupons.py` (238 lines) | Full read |
| 4 | `backend/routers/pos.py` — coupon sections | Inspected (lines 1145-1149, 1440-1454, 1625-1657, 2400-2476) |
| 5 | `backend/routers/scan.py` — coupons endpoint (lines 545-566) | Full read |
| 6 | `backend/models/schemas.py` — Coupon models (lines 460-518) | Full read |
| 7 | `backend/services/analytics_service.py` — coupon stats (lines 217-231) | Inspected |
| 8 | `backend/routers/migration.py` — coupon migration (lines 236-237, 463-483) | Inspected |
| 9 | MongoDB collections: `coupons`, `coupon_usage`, `coupon_transactions` | Queried (all empty in current preprod) |
| 10 | `backend/server.py` — router registration | Confirmed `coupons.router` included |

---

## 3. Coupon Collections Found

| Collection | Count | Purpose | Key Fields | Restaurant Scoped | Customer Scoped | Notes |
|---|---:|---|---|---|---|---|
| `coupons` | 0 | Coupon definitions | `id, user_id, code, discount_type, discount_value, start_date, end_date, usage_limit, per_user_limit, min_order_value, max_discount, specific_users, applicable_channels, description, is_active, total_used, created_at` | YES (`user_id`) | Optional (`specific_users` list) | Core coupon table |
| `coupon_usage` | 0 | Per-customer usage tracking | `id, coupon_id, customer_id, order_value, discount_applied, channel, used_at` | Implicit via `coupon_id` | YES (`customer_id`) | Written by `/coupons/apply` and `/pos/coupons/apply` |
| `coupon_transactions` | 0 | Migration-synced historical coupon data | `id, user_id, customer_id, order_id, coupon_code, discount_amount, created_at` | YES (`user_id`) | YES (`customer_id`) | Written ONLY by migration code. Analytics reads this collection but real-time coupon flow writes to `coupon_usage`. Schema mismatch. |

---

## 4. Coupon API Endpoints Found

| Method | Path | Router | Current Behavior | Auth | POS Contract Match | Gap |
|---|---|---|---|---|---|---|
| POST | `/api/coupons` | coupons.py | Create coupon | JWT (admin) | N/A | Admin-only |
| GET | `/api/coupons` | coupons.py | List all coupons | JWT (admin) | N/A | Admin-only |
| GET | `/api/coupons/{id}` | coupons.py | Get single coupon | JWT (admin) | N/A | Admin-only |
| PUT | `/api/coupons/{id}` | coupons.py | Update coupon | JWT (admin) | N/A | Admin-only |
| DELETE | `/api/coupons/{id}` | coupons.py | Delete coupon + usage | JWT (admin) | N/A | Admin-only |
| POST | `/api/coupons/{id}/toggle` | coupons.py | Toggle active/inactive | JWT (admin) | N/A | Admin-only |
| POST | `/api/coupons/validate` | coupons.py | Validate code (query params) | JWT (admin) | NO | Uses query params, not JSON body. Returns HTTPException, not structured error.code. |
| POST | `/api/coupons/apply` | coupons.py | Validate + record usage | JWT (admin) | NO | Admin-only |
| GET | `/api/coupons/{id}/usage` | coupons.py | Usage history | JWT (admin) | N/A | Admin-only |
| POST | `/api/pos/coupons/validate` | pos.py | POS validate (query params) | X-API-Key | **PARTIAL** | Exists but uses query params, message strings not error.code. |
| POST | `/api/pos/coupons/apply` | pos.py | POS validate + record usage | X-API-Key | **PARTIAL** | Records usage but not linked to order_id. |
| GET | `/api/scan/coupons` | scan.py | Customer-facing available coupons | Customer token | NO (wrong router) | On scan router, not POS router. POS needs `/pos/coupons/available`. |

**Missing from POS router:**
- `GET /api/pos/coupons/available` — does not exist
- JSON body contract for validate — currently query params only

---

## 5. Current Coupon Data Model

### `coupons` document schema

```
{
  "id": "uuid",
  "user_id": "pos_0001_restaurant_689",       // restaurant scope
  "code": "FLAT50",                            // uppercase, unique per user_id
  "discount_type": "flat" | "percentage",      // ONLY two types
  "discount_value": 50.0,                      // Rs for flat, % for percentage
  "start_date": "2026-01-01T00:00:00+00:00",  // ISO string
  "end_date": "2026-12-31T23:59:59+00:00",    // ISO string
  "usage_limit": 100,                          // global limit (null = unlimited)
  "per_user_limit": 1,                         // per-customer limit
  "min_order_value": 500.0,                    // minimum order to use
  "max_discount": 200.0,                       // cap for percentage type
  "specific_users": ["cust_id_1"],             // null = all customers eligible
  "applicable_channels": ["delivery","takeaway","dine_in"],
  "description": "Flat Rs.50 off",
  "is_active": true,
  "total_used": 0,                             // running counter
  "created_at": "2026-05-24T..."
}
```

### Key observations

- **No `coupon_type` field** — only `discount_type: flat|percentage`. Cannot distinguish between order-level, item-level, category-level, BOGO, etc.
- **No `applicable_items` or `applicable_categories`** — discount applies to entire order only.
- **No `free_item_id` / `buy_qty` / `get_qty`** — no BOGO/BXG data.
- **No `time_window_start` / `time_window_end`** — no happy-hour rules.
- **No `tier_required`** — no loyalty tier entitlement.
- **No `first_order_only` / `birthday_only` / `win_back_days`** — no lifecycle triggers.
- **No `campaign_id`** — no campaign linkage.

---

## 6. Coupon Type Support Matrix

| # | Coupon Type | Status | Evidence | Current Limitation | Required Work |
|---|---|---|---|---|---|
| 1 | ORDER_FLAT | **partially_supported** | `discount_type="flat"` exists. Validate computes `min(discount_value, order_value)`. | No structured error codes. Validate uses query params not JSON body. Final order does not re-validate. | Contract alignment for BUG-108 |
| 2 | ORDER_PERCENTAGE | **partially_supported** | `discount_type="percentage"` exists. Validate computes `order_value * discount_value / 100` capped at `max_discount`. | Same gaps as ORDER_FLAT. | Contract alignment for BUG-108 |
| 3 | ITEM_FLAT | **not_supported** | No `applicable_items` field. No item-level discount calculation. | Data model and logic missing entirely. | New fields + item-aware validation engine |
| 4 | ITEM_PERCENTAGE | **not_supported** | Same as ITEM_FLAT. | Same. | Same |
| 5 | CATEGORY_FLAT | **not_supported** | No `applicable_categories` field. | Data model and logic missing. | New fields + category-aware engine |
| 6 | CATEGORY_PERCENTAGE | **not_supported** | Same as CATEGORY_FLAT. | Same. | Same |
| 7 | FREE_ITEM | **not_supported** | No `free_item_id` or `free_item_name` field. | No mechanism to specify which item is free or how POS adds it. | New coupon subtype + POS cart integration |
| 8 | BOGO | **not_supported** | No buy/get quantity fields. | Requires item-level awareness, cart manipulation. | New coupon subtype + POS cart logic |
| 9 | BUY_X_GET_Y | **not_supported** | Same as BOGO. | More complex variant (X and Y may differ). | Same + more fields |
| 10 | EVERY_NTH_ITEM_FREE | **not_supported** | No frequency tracking (e.g., customer's 5th coffee). | Requires per-customer-per-item purchase history counter. | New tracking + counter engine |
| 11 | COMBO_FIXED_PRICE | **not_supported** | No combo definition fields. | Requires item set + fixed price logic. | New coupon subtype |
| 12 | COMBO_FREE_ITEM | **not_supported** | Same as combo + free item. | Same. | Same |
| 13 | HAPPY_HOUR / TIME_WINDOW | **not_supported** | No `time_window_start`/`time_window_end` or day-of-week fields. `applicable_channels` exists but no time dimension. | Time-window eligibility logic missing. | New fields + time-aware validation |
| 14 | FIRST_ORDER | **not_supported** | No `first_order_only` flag. `specific_users` could target manually but requires manual customer ID list. | No automatic first-order detection. | New flag + customer order-count check |
| 15 | BIRTHDAY | **not_supported** | No `birthday_only` flag. Birthday bonus is in loyalty (points), not coupons. | Coupon-as-birthday-gift not supported. | New flag + DOB window check |
| 16 | ANNIVERSARY | **not_supported** | Same as BIRTHDAY. | Same. | Same |
| 17 | WIN_BACK / INACTIVE_CUSTOMER | **not_supported** | No `inactive_days` field. | No automatic inactive detection for coupon eligibility. | New field + last_visit check |
| 18 | LOYALTY_TIER_BASED | **not_supported** | No `tier_required` field. | Cannot restrict coupon to Gold/Platinum customers. | New field + tier check |
| 19 | DELIVERY_CHARGE_DISCOUNT | **not_supported** | No `applies_to: delivery_charge` field. | Discount only applies to order total. | New application target |
| 20 | PAYMENT_METHOD_DISCOUNT | **not_supported** | No `payment_method_required` field. | No payment-method awareness at validation time. | New field |
| 21 | WALLET_CASHBACK | **not_supported** | No cashback-to-wallet mechanism. | Coupon and wallet are separate systems. | CR-001C-W dependency |
| 22 | REFERRAL_COUPON | **not_supported** | No referral tracking. | Requires referral engine. | Out of coupon scope |
| 23 | CAMPAIGN_COUPON | **not_supported** | No `campaign_id` field. | Coupons are standalone, not linked to WhatsApp campaigns. | New field + campaign linkage |

---

## 7. Validation Logic Audit

| # | Rule | Supported Now | Evidence | Gap |
|---|---|---|---|---|
| 1 | Invalid code | YES | `find_one(code=..., is_active=True)` -> 404/false | Returns message string, not error.code |
| 2 | Expired coupon | YES | `end_date < now` check | String comparison (same fragility as expiry, but works) |
| 3 | Inactive coupon | YES | `is_active=True` in query | OK |
| 4 | Min-order not met | YES | `order_value < min_order_value` check | OK |
| 5 | Customer not entitled | YES | `specific_users` check | Only list-based; no tier/lifecycle targeting |
| 6 | Already used (per-customer) | YES | `coupon_usage.count_documents(customer_id)` vs `per_user_limit` | OK |
| 7 | Usage limit reached (global) | YES | `total_used >= usage_limit` | OK |
| 8 | Max discount cap | YES | `min(discount, max_discount)` for percentage | OK |
| 9 | Percentage calculation | YES | `order_value * discount_value / 100` | OK for order-level |
| 10 | Flat calculation | YES | `min(discount_value, order_value)` | OK |
| 11 | Item/category eligibility | **NO** | No fields or logic | Not supported |
| 12 | Time-window eligibility | **NO** | No fields or logic | Not supported |
| 13 | Restaurant scoping | YES | `user_id` filter | OK |
| 14 | Customer scoping | PARTIAL | `specific_users` list | No tier/lifecycle/segment scoping |

---

## 8. Final Order / Redemption Integration Audit

### `/api/pos/orders` (primary POS order webhook)

- `coupon_code: Optional[str]` accepted in `POSOrderWebhook` schema (line 1148)
- `coupon_discount: float = 0.0` accepted (line 1149)
- Both are **stored passthrough** on the order document (line 864-865)
- Response echoes `coupon_applied: order_data.coupon_code` (line 1453)
- **NO re-validation** of coupon at order time — CRM trusts POS-sent values
- **NO `coupon_usage` recording** at order time — usage is only written by `/coupons/apply`
- **NO duplicate check** — if POS retries order with same coupon, no dedup guard

### `/api/pos/webhook/payment-received` (legacy payment webhook)

- Has inline coupon validation (lines 1630-1657)
- Looks up coupon by code, checks dates, computes discount
- Subtracts discount from `final_bill_amount` before points calculation
- **NO `coupon_usage` recording** — just computes and reports in response
- **NO per-customer usage check** in this path

### Analytics mismatch

- `services/analytics_service.py` reads `coupon_transactions` (migration-sourced collection)
- Real-time coupon flow writes to `coupon_usage` (different collection)
- This means analytics won't reflect real-time coupon usage unless migration has run

---

## 9. POS BUG-108 Coupon Readiness

| Capability | Status | Detail |
|---|---|---|
| Available coupons API (`GET /pos/coupons/available`) | **NOT READY** | Endpoint does not exist on POS router. Similar logic exists on scan router but requires customer token auth, not POS API key. |
| Validate coupon API (`POST /pos/coupons/validate`) | **PARTIALLY READY** | Endpoint exists but uses query params (not JSON body per BUG-108 spec). Returns message strings, not structured `error.code`. Does not accept `items[]` for item-level validation. |
| Order-level flat coupon | **PARTIALLY READY** | Validation logic works. Contract mismatch (query params + message strings). |
| Order-level percentage coupon | **PARTIALLY READY** | Same as flat. |
| Item-level coupons | **NOT READY** | No data model, no validation logic, no item-aware computation. |
| BOGO | **NOT READY** | No data model, no logic, requires POS cart integration. |
| Every Nth item free | **NOT READY** | No purchase-history counter, no frequency tracking. |
| Happy hour | **NOT READY** | No time-window fields or logic. |
| Free item | **NOT READY** | No mechanism for POS to know which item to add free. |

---

## 10. Immediate Safe Coupon Types (V1 candidates)

These can be supported with **minimal implementation** — the core validation engine exists, just needs contract alignment:

1. **ORDER_FLAT** — `discount_type="flat"` already works. Need: JSON body contract, structured error codes, `/pos/coupons/available` endpoint.
2. **ORDER_PERCENTAGE** — same as flat. Already works with `max_discount` cap.
3. **FIRST_ORDER** — add `first_order_only: bool` flag + check `customer.total_visits == 0` in validation.
4. **LOYALTY_TIER_BASED** — add `tier_required: str` field + check `customer.tier` in validation.
5. **CAMPAIGN_COUPON** — add `campaign_id` field for linkage; validation logic same as order-level.

---

## 11. Advanced Coupon Types Requiring New Engine Work

These require **significant new data model, validation logic, and POS cart integration:**

| Coupon Type | Key Requirement | Complexity |
|---|---|---|
| ITEM_FLAT / ITEM_PERCENTAGE | `applicable_items[]` field, item-level discount calc, POS must send `items[]` to validate | MEDIUM |
| CATEGORY_FLAT / CATEGORY_PERCENTAGE | `applicable_categories[]` field, category resolution at validation time | MEDIUM |
| FREE_ITEM | `free_item_id` / `free_item_name`, POS must auto-add or display instruction | MEDIUM-HIGH |
| BOGO | Buy/get qty fields, item matching in cart, POS auto-adds free item | HIGH |
| BUY_X_GET_Y | Same as BOGO plus different buy/get items | HIGH |
| EVERY_NTH_ITEM_FREE | Per-customer-per-item purchase counter, history tracking across orders | HIGH |
| HAPPY_HOUR | `time_window_start/end`, `applicable_days[]`, time-aware validation | MEDIUM |
| COMBO_FIXED_PRICE | Combo item set definition, fixed-price override logic | HIGH |
| WIN_BACK | `inactive_days` field, `customer.last_visit` comparison | LOW-MEDIUM |
| BIRTHDAY / ANNIVERSARY | Date-window check (similar to loyalty bonus logic) | LOW-MEDIUM |

---

## 12. Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 1 | **Incorrect discount calculation for item-level** | Customer overcharged or undercharged | Item-level engine must receive `items[]` from POS and compute per-item discount |
| 2 | **Duplicate coupon usage** | Customer uses same coupon on multiple orders if `/apply` and final order are disconnected | Usage should be recorded atomically at final order time, not at validate/apply time |
| 3 | **Customer entitlement gaps** | `specific_users` is a static list; no dynamic tier/lifecycle/segment targeting | Add tier_required, first_order_only, segment_id fields |
| 4 | **Analytics mismatch** | Dashboard shows migration-sourced `coupon_transactions`, not real-time `coupon_usage` | Unify to single collection or read both |
| 5 | **Tax/subtotal impact** | Coupon discount may apply before or after tax — current system doesn't distinguish | Owner must decide: discount on subtotal vs total |
| 6 | **POS cart automation for free items** | BOGO/free-item requires POS to auto-add an item with Rs.0 price | Requires POS UI work, not just CRM API |
| 7 | **Conflict with loyalty redemption** | Should customer use coupon AND loyalty points on same order? Current system allows both (no mutual exclusion). | Owner must decide stacking rules |
| 8 | **Conflict with wallet** | Same stacking question for wallet + coupon | Owner must decide |
| 9 | **Final order does not re-validate** | POS sends `coupon_code` + `coupon_discount` passthrough — CRM trusts it | Should CRM re-validate at final order? Or trust POS? |

---

## 13. Owner Questions Before Coupon Design

### Coupon Scope

1. **Which coupon types should be V1?**
   - a. ORDER_FLAT + ORDER_PERCENTAGE only (minimal, POS contract alignment)
   - b. Above + FIRST_ORDER + TIER_BASED + CAMPAIGN (low-effort additions)
   - c. Above + ITEM_LEVEL + CATEGORY_LEVEL (medium effort, needs POS items[])
   - d. All of the above + BOGO + FREE_ITEM + HAPPY_HOUR (full engine)

2. **Should item-level coupons be V1?**
   - Requires POS to send `items[]` in validate call. POS must map items.

3. **Should BOGO be V1 or V2?**
   - Requires POS cart manipulation (auto-add free item at Rs.0).

4. **Should every Nth item free be V1 or V2?**
   - Requires per-customer purchase history counter across orders.

5. **Should happy-hour be V1 or V2?**
   - Relatively simple (time-window check) but needs restaurant timezone handling.

### Stacking & Ordering

6. **Should coupon combine with loyalty points on the same order?**
   - Current: both are accepted in the order payload. No mutual exclusion.

7. **Should coupon combine with wallet on the same order?**
   - Same question.

8. **What is the discount application order?**
   - Coupon first, then loyalty, then wallet? Or configurable?

### Final Order Integration

9. **Should coupon usage be recorded ONLY at final order payload?**
   - Current: usage recorded at `/coupons/apply` time (before final order).
   - Risk: customer applies coupon, then cancels order — usage already recorded.
   - Recommended: record at final order only.

10. **Should CRM re-validate coupon at final order time?**
    - Current: CRM trusts POS-sent `coupon_code`/`coupon_discount` passthrough.
    - Recommended: at minimum validate code is active + not over-limit.

### POS UI

11. **Should POS auto-add free items (BOGO/free-item) or only display an instruction?**
    - Auto-add requires POS cart manipulation (complex).
    - Display instruction: "Add [item] to cart — it will be free" (simpler).

### Tax

12. **Should coupon discount apply before or after tax?**
    - Before tax: discount reduces taxable amount.
    - After tax: discount is on final total.

---

## 14. Recommended Coupon CR Roadmap

### CR-001C-C1: POS Contract Alignment (ORDER_FLAT + ORDER_PERCENTAGE)

- Add `GET /api/pos/coupons/available` (POS auth, returns eligible coupons for customer+order)
- Reshape `POST /api/pos/coupons/validate` to accept JSON body (not query params)
- Add structured `error.code` values to validate response
- Add `coupon_type` field to data model (forward-only, default `"order"`)
- Align contract with BUG-108 spec

### CR-001C-C2: Item / Category Coupon Support

- Add `applicable_items[]`, `applicable_categories[]` fields
- Add `coupon_type: "item"|"category"` discriminator
- Validate must accept `items[]` from POS to compute item-level discount
- New item-aware discount computation engine

### CR-001C-C3: BOGO / Buy X Get Y / Every Nth Item

- Add `buy_qty`, `get_qty`, `buy_item_id`, `get_item_id` fields
- Add frequency tracking for every-Nth
- POS integration for cart manipulation or instruction display

### CR-001C-C4: Happy-Hour / Time-Window Rules

- Add `time_window_start`, `time_window_end`, `applicable_days[]` fields
- Time-aware validation (restaurant timezone)
- Auto-apply logic for POS-facing available endpoint

### CR-001C-C5: Final Usage Tracking + Analytics Alignment

- Record `coupon_usage` at final order time (not at validate/apply)
- Unify `coupon_transactions` and `coupon_usage` or read both in analytics
- Add `order_id` to `coupon_usage` for order linkage
- Duplicate prevention (same coupon + same order = one usage)

### CR-001C-C6: POS Handoff + QA

- Full POS handoff doc (same pattern as LR/LX-A handoff)
- QA harness covering all supported coupon types
- Regression against loyalty (stacking) and wallet

---

## 15. Final Status

`cr001c_coupon_existing_system_capability_audit_complete_waiting_owner_decisions`

Audit is complete. Coupon CR implementation should not start until owner answers the 12 questions in section 13. The roadmap in section 14 provides a phased approach from minimal (C1) to full (C6).
