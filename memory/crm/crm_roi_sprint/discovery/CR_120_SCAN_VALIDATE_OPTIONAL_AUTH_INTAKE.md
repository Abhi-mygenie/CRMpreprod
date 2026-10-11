# CR-120 — Intake: `POST /scan/coupons/validate` optional-auth (anonymous coupon validation)
**Date**: 2026-10-11 · **Role**: Intake Agent · **Source**: INV-024 · S&O contract frozen 2026-10-11 · **No code changed. No data written.**

---

## 1. Owner / Contract Request

Contract frozen 2026-10-11 between CRM and Scan & Order teams. S&O requires anonymous diners (no phone, no CRM record) to be able to validate a coupon code before identifying themselves.

**Owner decisions (locked):**
- D2: Phone re-auth fail at Place Order = silent fail + logged (no toast)
- Q4: Anonymous list shows generic coupons only — standard coupons hidden entirely

---

## 2. Problem

`POST /scan/coupons/validate` currently requires a Bearer customer token (`Depends(verify_customer_token)`). An anonymous diner — one who has not given their phone number and may never register — cannot validate any coupon code. This blocks three scenarios:

1. Walk-in diner sees a promo code on a table tent, wants to check the discount before deciding to register
2. New diner on Scan & Order first screen — wants to see the saving before giving their phone
3. Returning diner on a new device — phone not yet re-entered

---

## 3. Code reality (confirmed from live scan.py + core/coupon.py)

### What already exists

| Component | Location | Status |
|---|---|---|
| `optional_customer_token` helper | `scan.py:100–116` | ✅ EXISTS — built for CR-096 (feedback). Returns `None` when no token; raises 401 on bad/expired token |
| `validate_coupon_for_customer(customer_id=None)` | `core/coupon.py:1643` | ✅ EXISTS — `customer_id` is `Optional[str] = None` (added by CR-082) |
| `requires_customer` guard | `core/coupon.py:1767–1776` | ✅ EXISTS — when `customer_id=None` and `requires_customer=True` → returns `CUSTOMER_REQUIRED` error |
| `per_user_limit` skipped when no customer | `core/coupon.py:1781` | ✅ `if customer_id and per_user_limit...` — skipped automatically |
| `specific_users` skipped when no customer | `core/coupon.py:1827` | ✅ `if specific and customer_id...` — skipped automatically |
| `_resolve_restaurant_id` helper | `scan.py:42–55` | ✅ EXISTS — accepts short `"689"` or full `"pos_0001_restaurant_689"` |

### What does NOT exist

| Gap | Detail |
|---|---|
| Optional token on the route | `Depends(verify_customer_token)` → must change to `Depends(optional_customer_token)` |
| `restaurant_id` in request body | Currently taken from JWT. Without a token, must come from the caller |

**The engine requires zero changes.** Gap is route-layer only.

---

## 4. Contracted behaviour (frozen)

### Request — no token
```
POST /scan/coupons/validate
// No Authorization header

{
  "restaurant_id": "689",       ← NEW required field when no token
  "code": "SAVE10",
  "order_total": 450.0,
  "channel": "dine_in",
  "items": []                   ← optional; needed for item/category-scope coupons
}
```

### Request — with token (existing, unchanged)
```
POST /scan/coupons/validate
Authorization: Bearer <customer token>

{
  "code": "SAVE10",
  "order_total": 450.0,
  "channel": "dine_in",
  "items": []
}
```

`restaurant_id` in the body is **ignored when a token is present** (restaurant comes from the JWT claim, as today).

### Response — generic coupon (`requires_customer = false`), no token
```json
{
  "success": true,
  "data": {
    "valid": true,
    "code": "SAVE10",
    "title": "Weekend Offer",
    "discount_type": "percentage",
    "discount_value": 10.0,
    "computed_discount": 45.0,
    "final_amount_preview": 405.0,
    "min_order_value": 200.0,
    "stackable_with_loyalty": false,
    "coupon_type": "order"
  }
}
```

### Response — standard coupon (`requires_customer = true`), no token
```json
{
  "success": true,
  "data": {
    "valid": false,
    "error": {
      "code": "CUSTOMER_REQUIRED",
      "field": "customer_id",
      "detail": "This coupon requires a customer to be selected before applying"
    }
  }
}
```
S&O uses `CUSTOMER_REQUIRED` to display "Enter your phone number to use this coupon."

### Error codes (full set — unchanged from CR-105)

| Code | Trigger | Auth needed? |
|---|---|---|
| `INVALID_CODE` | Code doesn't exist | No |
| `INACTIVE` / `EXPIRED` | Coupon inactive or expired | No |
| `MIN_ORDER_NOT_MET` | Order total below minimum | No |
| `CHANNEL_NOT_VALID` | Wrong channel | No |
| `OUTSIDE_TIME_WINDOW` | Happy-hour coupon, wrong time | No |
| `CUSTOMER_REQUIRED` | Standard coupon, no token | No-token only |
| `CUSTOMER_USAGE_LIMIT_REACHED` | Diner exceeded per-user limit | Token only |
| `CUSTOMER_NOT_ELIGIBLE` | Targeted coupon, diner not in list | Token only |

### Rate limit: unchanged — 10 requests/min per IP (`_COUPON_VALIDATE_IP_LIMIT`)

---

## 5. Classification

| Field | Value |
|---|---|
| **Type** | CR — route contract extension (additive) |
| **Severity** | **P1** — blocks S&O anonymous coupon UX; contract frozen, S&O waiting on CRM deploy |
| **Risk** | **LOW** — additive; `optional_customer_token` pattern already exists (CR-096); engine untouched |
| **Duplicate check** | **DISTINCT** — CR-105 added the validate route (token-required). This makes the token optional. No overlap with any open CR. |
| **Blast radius** | **SMALL** — 1 file (`routers/scan.py`), ~10 lines: model adds `restaurant_id` field + route changes auth dep |
| **Owner decisions** | ALL LOCKED — contract frozen 2026-10-11 |
| **Related** | INV-024 · CR-105 (original validate route) · CR-096 (optional_customer_token pattern) · CR-121 (sister CR — same session) |

---

## 6. Fix sketch (for Planning — do not implement now)

```python
# Edit 1: ScanCouponValidateRequest — add restaurant_id
class ScanCouponValidateRequest(BaseModel):
    code: str
    order_total: float
    channel: Optional[str] = "dine_in"
    items: Optional[List[dict]] = None
    restaurant_id: Optional[str] = None  # CR-120: required when no token

# Edit 2: Route — optional token
@router.post("/coupons/validate")
async def scan_validate_coupon(
    data: ScanCouponValidateRequest,
    request: Request,
    auth: Optional[dict] = Depends(optional_customer_token),  # CR-120
):
    # Resolve restaurant_id: from token if authenticated, from body if anonymous
    if auth:
        rid = auth["restaurant_id"]
        customer_id = auth["customer_id"]
    else:
        if not data.restaurant_id:
            raise HTTPException(status_code=422, detail="restaurant_id required when not authenticated")
        rid = await _resolve_restaurant_id(data.restaurant_id)
        customer_id = None  # anonymous — engine handles this
    # ... rest of route uses rid + customer_id
```

---

## 7. Verification sketch

| V | Check | Expected |
|---|---|---|
| V1 | No token + generic coupon + valid order | `valid:true`, `computed_discount` returned |
| V2 | No token + standard coupon | `valid:false`, `CUSTOMER_REQUIRED` |
| V3 | No token + no `restaurant_id` in body | `422` |
| V4 | No token + expired coupon | `valid:false`, `EXPIRED` |
| V5 | No token + min_order not met | `valid:false`, `MIN_ORDER_NOT_MET` |
| V6 | With token (existing) — all CR-105 cases | 5/5 PASS — no regression |
| V7 | Bad/expired token | `401` |

---

## 8. Owner questions

**None.** Contract fully frozen. All decisions locked.

---

```
Intake complete: CR-120
Classification: CR — route contract extension, additive (scan.py, ~10 lines)
Severity: P1 (S&O contract frozen, waiting on CRM deploy)
Risk: LOW
Duplicate check: DISTINCT (CR-105 is the authenticated version; this makes token optional)
Evidence: scan.py:539–582 (current route), core/coupon.py:1643/1767 (engine supports None customer_id), scan.py:100–116 (optional_customer_token exists)
Blast radius: SMALL (1 file, ~10 lines; no engine/schema/DB change)
Owner decisions: ALL LOCKED — contract frozen 2026-10-11
Docs: discovery/CR_120_SCAN_VALIDATE_OPTIONAL_AUTH_INTAKE.md
Next: Planning gate opens on "choose planning role for CR-120 and CR-121"
```
