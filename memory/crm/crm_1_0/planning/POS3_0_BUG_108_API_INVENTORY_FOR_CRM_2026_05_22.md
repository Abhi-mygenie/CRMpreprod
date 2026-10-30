# POS 3.0 BUG-108 — API Inventory for CRM Team

**Date:** 2026-05-22
**From:** POS 3.0 Frontend Team
**To:** CRM Team
**Re:** Clean API inventory — what we have, what we need, what CRM must build
**Scope:** BUG-108 (Coupon / Loyalty / Wallet — read + validate only; redemption deferred to separate CR)

---

## 1. Quick Reference

| Bucket | Count | Action |
|--------|-------|--------|
| ✅ **APIs we have (live, no change)** | 6 | None |
| 🆕 **APIs CRM must build** | 3 | Build |
| ⏸️ **APIs explicitly NOT needed (yet)** | 6 | Do not build — future CR |

---

## 2. ✅ APIs WE HAVE (Live Today — No Change Needed)

These are already in production and consumed by the POS frontend. **CRM team: no action.**

### 2.1 Customer Search
| Field | Value |
|-------|-------|
| **Method + Path** | `GET /pos/customers?search={query}` |
| **Auth** | `X-API-Key: <crm_token>` |
| **Returns** | `wallet_balance`, `total_points`, `tier`, `name`, `phone`, `last_visit` |
| **Used by** | Customer search dropdown |

### 2.2 Customer Lookup (by phone)
| Field | Value |
|-------|-------|
| **Method + Path** | `POST /pos/customer-lookup` |
| **Body** | `{ phone: "9876543210" }` |
| **Returns** | `wallet_balance`, `total_points`, `points_value`, `tier`, `total_visits`, `total_spent`, `addresses[]` |
| **Used by** | Order entry — phone-based customer selection |

### 2.3 Customer Detail (by id)
| Field | Value |
|-------|-------|
| **Method + Path** | `GET /pos/customers/{id}` |
| **Returns** | `wallet_balance`, `total_points`, `loyalty` blob, `addresses[]`, `recent_orders[]` |
| **Used by** | Order entry — full profile load |

### 2.4 Customer Create
| Field | Value |
|-------|-------|
| **Method + Path** | `POST /pos/customers` |
| **Used by** | "Add new customer" flow |

### 2.5 Customer Update
| Field | Value |
|-------|-------|
| **Method + Path** | `PUT /pos/customers/{id}` |
| **Used by** | Edit customer profile |

### 2.6 Address Lookup
| Field | Value |
|-------|-------|
| **Method + Path** | `POST /pos/address-lookup` |
| **Body** | `{ phone: "9876543210" }` |
| **Used by** | Delivery flows |

---

## 3. 🆕 APIs CRM TEAM MUST BUILD (BUG-108)

These are required to complete BUG-108. **CRM team: please confirm shape, then build.**

### 3.1 [NEW] List Customer's Available Coupons

**Why:** Replace the hardcoded coupon list in the POS frontend with a real CRM-driven catalog filtered by customer entitlement and current order total.

| Field | Value |
|-------|-------|
| **Method + Path** | `GET /pos/coupons/available` |
| **Auth** | `X-API-Key: <crm_token>` |
| **Query Params** | `customer_id` (required, string) <br> `order_total` (required, number ₹) <br> `restaurant_id` (optional, string) |
| **Used in frontend** | `CollectPaymentPanel.jsx` — "Apply Coupon" section + suggested-coupons chips |

**Request example:**
```
GET /pos/coupons/available?customer_id=cust_abc123&order_total=850&restaurant_id=rest_42
```

**Success response (proposed shape):**
```json
{
  "success": true,
  "data": {
    "coupons": [
      {
        "code": "FLAT50",
        "title": "₹50 off",
        "type": "flat",
        "discount": 50,
        "min_order": 500,
        "max_discount": null,
        "expires_at": "2026-06-30T23:59:59Z",
        "source": "global",
        "roi_campaign_id": "camp_summer_2026"
      },
      {
        "code": "VIP10",
        "title": "10% off (max ₹100)",
        "type": "percent",
        "discount": 10,
        "min_order": 300,
        "max_discount": 100,
        "expires_at": "2026-12-31T23:59:59Z",
        "source": "customer-targeted",
        "roi_campaign_id": "camp_vip_2026"
      }
    ]
  }
}
```

**Empty response (no coupons available):**
```json
{ "success": true, "data": { "coupons": [] } }
```

**Server-side filtering rules (CRM must apply):**
- Customer is entitled to the coupon (either global or customer-targeted)
- `order_total >= min_order`
- `now() < expires_at`
- `is_active == true`

---

### 3.2 [NEW] Validate Coupon Code

**Why:** When cashier types a coupon code and clicks "Apply", we need server-side validation (not local matching) to honor expiry, entitlement, single-use rules, etc.

| Field | Value |
|-------|-------|
| **Method + Path** | `POST /pos/coupons/validate` |
| **Auth** | `X-API-Key: <crm_token>` |
| **Body** | `{ customer_id, coupon_code, order_total, restaurant_id }` |
| **Used in frontend** | `CollectPaymentPanel.jsx → handleApplyCoupon` + final server-side check at PLACE_ORDER / BILL_PAYMENT |

**Request body example:**
```json
{
  "customer_id": "cust_abc123",
  "coupon_code": "FLAT50",
  "order_total": 850,
  "restaurant_id": "rest_42"
}
```

**Success response (proposed):**
```json
{
  "success": true,
  "data": {
    "code": "FLAT50",
    "title": "₹50 off",
    "type": "flat",
    "discount": 50,
    "max_discount": null,
    "computed_discount_amount": 50
  }
}
```

**Failure response (proposed):**
```json
{
  "success": false,
  "error": {
    "code": "EXPIRED",
    "message": "This coupon expired on 2026-05-01."
  }
}
```

**Required error codes:**
| `error.code` | `error.message` (shown to cashier) |
|--------------|-----------------------------------|
| `INVALID_CODE` | "Invalid coupon code." |
| `EXPIRED` | "This coupon has expired." |
| `MIN_ORDER_NOT_MET` | "Minimum order ₹X required." |
| `NOT_ENTITLED` | "This coupon is not available for this customer." |
| `ALREADY_USED` | "This coupon has already been used." |
| `INACTIVE` | "This coupon is no longer active." |

---

### 3.3 [NEW] Loyalty Tier → Ratio Configuration

**Why:** Owner has confirmed the redemption ratio is **per-tier** (Bronze/Silver/Gold/etc.) and is defined on the Loyalty page screen (CRM admin). We need the frontend to consume this instead of the hardcoded 1:1 ratio.

| Field | Value |
|-------|-------|
| **Method + Path (Option A — preferred)** | Extend existing `GET /pos/customers/{id}` to include ratio in `loyalty` blob |
| **Method + Path (Option B — alternative)** | New endpoint `GET /pos/loyalty/config?restaurant_id={id}` |
| **Auth** | `X-API-Key: <crm_token>` |
| **Used in frontend** | `CollectPaymentPanel.jsx:502-503` — replaces hardcoded 1:1 |

**Option A (preferred) — extend customer detail:**

Today's `GET /pos/customers/{id}` returns `loyalty: null` or a blob (frontend doesn't use it yet). We propose CRM populates it as:

```json
{
  "id": "cust_abc123",
  "name": "John Doe",
  "tier": "Gold",
  "total_points": 480,
  "wallet_balance": 1200,
  "loyalty": {
    "tier": "Gold",
    "ratio_per_point": 1.5,
    "tier_label": "Gold Member",
    "points_value": 720
  }
}
```

Frontend interprets `points_value` as the rupee value of the customer's total points (`total_points * ratio_per_point`).

**Option B (alternative) — full tier table:**

```
GET /pos/loyalty/config?restaurant_id=rest_42
```
```json
{
  "success": true,
  "data": {
    "tiers": [
      { "name": "Bronze", "ratio_per_point": 1.0, "min_visits": 0 },
      { "name": "Silver", "ratio_per_point": 1.2, "min_visits": 10 },
      { "name": "Gold",   "ratio_per_point": 1.5, "min_visits": 30 }
    ]
  }
}
```

**CRM team: please pick Option A or B (or propose a third).** Option A is preferred because it avoids an extra round-trip.

---

## 4. ⏸️ APIs NOT NEEDED for BUG-108 (Do Not Build Yet)

Per owner sign-off, the entire **redemption / debit / reversal** lifecycle is deferred to a separate Change Request. These endpoints are **explicitly out of scope** for BUG-108. Please do **not** build them yet:

| Deferred endpoint | Reason |
|-------------------|--------|
| `POST /pos/wallet/debit` | Q4 deferred to future CR |
| `POST /pos/wallet/credit` (refund) | Q5 — no reversal needed (CRM only sees fully-settled orders) |
| `POST /pos/loyalty/redeem` | Q4/Q5 deferred |
| `POST /pos/coupons/redeem` | Q4/Q5 deferred |
| `POST /pos/coupons/reverse` | Q5 — not needed |
| `POST /pos/loyalty/reverse` | Q5 — not needed |
| `POST /pos/wallet/reverse` | Q5 — not needed |

When the future CR is approved, we will draft a similar API inventory document for the redemption phase.

---

## 5. Out-of-Band Asks (Not Endpoints, But Needed)

| # | Ask | Why |
|---|-----|-----|
| 1 | **Share a real sample `customer.loyalty` blob** from preprod (one Bronze, one Silver, one Gold customer if possible) | So frontend can verify Option A schema works before implementation |
| 2 | **Confirm whether "customer-coupon entitlement" model exists today on CRM side** | If yes, §3.1 can use it. If no, CRM needs to design an entitlement table first. |
| 3 | **Owner's Loyalty-page screenshot** (tier→ratio mapping) | To verify our ratio interpretation matches the CRM admin UI |

---

## 6. Summary Checklist for CRM Team

Please reply with status against each line:

- [ ] §3.1 `GET /pos/coupons/available` — exists / will build (ETA: ___) / won't build
- [ ] §3.2 `POST /pos/coupons/validate` — exists / will build (ETA: ___) / won't build / owned by POS backend
- [ ] §3.3 Loyalty ratio — Option A picked / Option B picked / other proposal
- [ ] §5.1 Sample `loyalty` blob shared — yes / not yet
- [ ] §5.2 Customer-coupon entitlement model — exists / needs design

---

## 7. Sequence

1. CRM team replies with statuses (§6).
2. Owner provides Loyalty-page screenshot (§5.3).
3. Frontend team produces detailed API contract + file-level implementation plan for 108-P1 + 108-P2.
4. Implementation begins.

**No BUG-108 frontend work starts until §6 statuses are received.**

---

**End of API Inventory for CRM Team.**
