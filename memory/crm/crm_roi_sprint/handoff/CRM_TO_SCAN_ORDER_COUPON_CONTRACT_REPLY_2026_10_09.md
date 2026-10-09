# CRM → Scan & Order — Coupon API contract + 500 fix
**Date:** 2026-10-09
**Owner sends; agents never send.**
**Re:** Your coupon API contract request · `GET /scan/coupons` 500 root cause + fix

---

## Q2 first — the 500 is fixed

**Root cause confirmed:**
`GET /scan/coupons` stores `per_user_limit: null` on some coupon docs in the database. Python's `dict.get("per_user_limit", 1)` returns the stored `None` — not the default `1` — when the key exists with a null value. The comparison `usage < None` then throws `TypeError: '<' not supported between instances of 'int' and 'NoneType'`.

**Fix applied:** `c.get("per_user_limit") or 1` — treats null the same as missing (unlimited per-user).

**Verified on preview now:** `GET /api/scan/coupons` with a valid customer token → **200**, 16 eligible coupons for r689. The endpoint is live and working.

---

## Q1 — Coupon API contract

### What exists today

#### `GET /api/scan/coupons`
**Authentication:** Customer Bearer token required.
**What it returns:** All active coupons for the diner's restaurant that:
- Are within their `start_date`–`end_date` window
- Are not excluded by `specific_users`
- The diner has not hit their personal `per_user_limit`

```json
200 {
  "success": true,
  "message": "N coupons available",
  "data": {
    "coupons": [
      {
        "id": "<uuid>",
        "code": "SAVE10",
        "discount_type": "percentage",
        "discount_value": 10.0,
        "min_order_value": 200.0,
        "max_discount": 100.0,
        "description": "10% off on orders above ₹200",
        "title": "Weekend Offer",
        "start_date": "2026-10-01",
        "end_date": "2026-12-31",
        "per_user_limit": 2,
        "my_usage_count": 0,
        "stackable_with_loyalty": false,
        "coupon_type": "order",
        "applicable_channels": ["delivery", "takeaway", "dine_in"]
      }
    ]
  }
}
```

Use this to show the diner a list of available coupons they can pick from **before** they type a code.

---

### What does NOT exist yet for Customer App

**There is no `POST /scan/coupons/validate` endpoint.** The coupon validation endpoint (`POST /api/pos/coupons/validate`) exists but requires a **POS API key** (`X-API-Key` header) — it is not accessible with a customer token.

This means the flow "diner types a code → tap Apply → see discount" does **not have a CRM-side endpoint today**. It needs to be built.

---

### What CRM will build — proposed contract for `POST /scan/coupons/validate`

**Authentication:** Customer Bearer token required.

**Request:**
```json
POST /api/scan/coupons/validate
Authorization: Bearer <customer_token>

{
  "code": "SAVE10",
  "order_total": 450.0,
  "items": [                      // optional — required only for item/category-scoped coupons
    { "food_id": "...", "item_id": "...", "price": 150.0, "quantity": 2 }
  ]
}
```

- `code` — required, case-insensitive
- `order_total` — required, the cart subtotal before discount
- `items` — optional, needed for BOGO/item-scope coupons; send if you have cart data

**Success response (200):**
```json
{
  "success": true,
  "message": "Coupon valid",
  "data": {
    "valid": true,
    "code": "SAVE10",
    "title": "Weekend Offer",
    "discount_type": "percentage",
    "discount_value": 10.0,
    "computed_discount": 45.0,
    "final_amount_preview": 405.0,
    "stackable_with_loyalty": false,
    "coupon_type": "order"
  }
}
```

**Error responses:**
```json
// Invalid / not found
{ "success": false, "message": "Coupon not found", "data": { "valid": false, "error": { "code": "not_found", "detail": "Coupon not found" } } }

// Expired
{ "success": false, "message": "Coupon expired", "data": { "valid": false, "error": { "code": "expired" } } }

// Below minimum order
{ "success": false, "message": "Minimum order ₹200 required", "data": { "valid": false, "error": { "code": "min_order", "detail": "Minimum order ₹200 required" } } }

// Per-user limit reached
{ "success": false, "message": "Coupon usage limit reached", "data": { "valid": false, "error": { "code": "per_user_limit", "detail": "You have already used this coupon 2 times" } } }

// Not applicable to this restaurant
{ "success": false, "message": "Coupon not found", "data": { "valid": false, "error": { "code": "not_found" } } }
```

**Authentication:** Token required. Pre-login coupon preview (without token) is **not supported** — the `coupon_enabled` flag from `loyalty-rules` tells you whether to show the coupon entry field; the actual validate call waits until after skip-otp.

**Rate limits:** None planned for now (logged-in customer, rate already covered by the token gate).

**Important:** This endpoint is **validate-only, read-only** — it does not record usage. Usage is recorded when the diner's order goes through the POS (`POST /api/pos/orders` with `coupon_code` in the payload). Do not show a "coupon applied" confirmation until the order is actually placed.

---

### Timeline

This is **not built yet**. CRM will register it as a new CR (**CR-097** range, next available — will be confirmed when registered). It reuses the existing `validate_coupon_for_customer` service function that powers the POS endpoint, so the implementation is straightforward.

**Proposed sequence:**
1. You register the CR on your side now
2. CRM opens the planning gate — ~1 h implementation, same session
3. CRM sends you the confirm-live note when it ships
4. Your Apply button wires to `POST /scan/coupons/validate` + includes `coupon_code` in your order payload to POS

---

## Summary

| Question | Answer |
|---|---|
| `GET /scan/coupons` 500 | **Fixed.** Returns 200 + eligible coupon list. |
| Validate-by-code endpoint | **Does not exist yet.** Proposed contract above. CRM to build as next registered CR. |
| Auth requirement | Customer Bearer token for both endpoints. |
| "Apply" records usage? | No — usage is recorded when the POS order is placed, not at validate time. |
| Pre-login coupon preview | Not supported. Call after `skip-otp`. |

---

*CRM internal: bug fix in `routers/scan.py:477` · proposed new CR: `POST /scan/coupons/validate` · `routers/pos.py:2948` validate_coupon_for_customer (service to reuse)*
