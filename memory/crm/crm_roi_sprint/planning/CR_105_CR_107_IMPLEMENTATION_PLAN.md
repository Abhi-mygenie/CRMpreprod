# CR-107 + CR-105 — Implementation Plan (combined, in this order)
**Date**: 2026-10-09 · **Role**: Planning Agent · **IA**: `planning/CR_105_CR_107_IMPACT_ANALYSIS.md` (all Qs locked) · **Risk**: LOW (CR-107) · LOW–MEDIUM (CR-105) · **Status**: ✅ OWNER APPROVED — gate opens on "choose implementation role" · **No code changed.**

---

## 0. Decisions locked

| CR | Q | Decision |
|---|---|---|
| CR-105 | Q1 rate-limit | **(a) 10/min per IP** — bucket `vc-ip:{ip}` |
| CR-105 | Q2 channel | **YES** — `channel: Optional[str] = "dine_in"` in request schema |
| CR-107 | Q1 endpoint | **A — build scan endpoint** |

---

## 1. Implementation order and rationale

**CR-107 first, then CR-105.**

| Why | |
|---|---|
| CR-107 is simpler | 2 DB fetches + 1 pure-function call, no rate-limiting |
| Validates the import pattern | Both share `from core.loyalty import compute_max_redeemable` and `calculate_points` — confirm imports clean before CR-105 |
| Independent | A failure in CR-107 doesn't affect CR-105 |
| CR-105 is slightly more involved | Rate-limit bucket + error-code mapping |

---

## 2. Edits

**E1 — `scan.py` imports (both CRs together)**

```python
# Before
from core.helpers import calculate_tier, get_earn_percent_for_tier, get_redemption_value_for_tier  # CR-094
from core.loyalty import default_loyalty_settings  # CR-094

# After
from core.helpers import calculate_tier, get_earn_percent_for_tier, get_redemption_value_for_tier, calculate_points  # CR-094 + CR-107
from core.loyalty import default_loyalty_settings, compute_max_redeemable  # CR-094 + CR-107
from core.coupon import validate_coupon_for_customer  # CR-105
```

**E2 — `scan.py` rate-limit constant (CR-105)**

Add after `_FEEDBACK_PHONE_LIMIT`:
```python
_COUPON_VALIDATE_IP_LIMIT = (10, 60)   # CR-105 Q1=a: 10/min per IP
```

**E3 — `scan.py` CR-107: schema + route** (insert after `GET /scan/coupons`, before `# C3 - Customer Addresses`)

```python
class ScanMaxRedeemableRequest(BaseModel):  # CR-107
    bill_amount: float


@router.post("/max-redeemable")
async def scan_max_redeemable(
    data: ScanMaxRedeemableRequest,
    auth: dict = Depends(verify_customer_token),
):  # CR-107
    """CR-107: compute max loyalty points redeemable for a given bill amount. Read-only."""
    rid = auth["restaurant_id"]
    customer = await db.customers.find_one(
        {"id": auth["customer_id"], "user_id": rid}, {"_id": 0}
    )
    if not customer:
        return _resp(False, "Customer not found")
    settings = await db.loyalty_settings.find_one({"user_id": rid}, {"_id": 0})
    cap = compute_max_redeemable(customer, settings, data.bill_amount)
    # Add projected earn for this bill (useful at checkout)
    projected_earned = 0
    if cap["loyalty_enabled"] and settings:
        pts = calculate_points(data.bill_amount, customer, settings)
        projected_earned = pts.get("total_points", 0)
    return _resp(True, "Max redeemable computed", {
        "ok":                    cap["ok"],
        "code":                  cap.get("code"),
        "max_points_redeemable": cap["max_points_redeemable"],
        "max_discount_value":    cap["max_discount_value"],
        "ratio_per_point":       cap["ratio_per_point"],
        "available_points":      cap["available_points"],
        "min_redemption_points": cap["min_redemption_points"],
        "loyalty_enabled":       cap["loyalty_enabled"],
        "projected_points_earned": projected_earned,
    })
```

**E4 — `scan.py` CR-105: schema + route** (insert immediately after E3 block, still before `# C3`)

```python
class ScanCouponValidateRequest(BaseModel):  # CR-105
    code: str
    order_total: float
    channel: Optional[str] = "dine_in"    # CR-105 Q2
    items: Optional[List[dict]] = None    # required for item/category-scope (V2/V3-B) coupons


@router.post("/coupons/validate")
async def scan_validate_coupon(
    data: ScanCouponValidateRequest,
    request: Request,
    auth: dict = Depends(verify_customer_token),
):  # CR-105
    """CR-105: validate coupon code against order total. Read-only — no usage recorded."""
    retry = await _lookup_rate_limited(
        f"vc-ip:{_client_ip(request)}", *_COUPON_VALIDATE_IP_LIMIT
    )
    if retry:
        raise HTTPException(
            status_code=429, detail="Too many requests",
            headers={"Retry-After": str(retry)}
        )
    result = await validate_coupon_for_customer(
        db,
        user_id=auth["restaurant_id"],
        code=data.code,
        customer_id=auth["customer_id"],
        order_total=data.order_total,
        channel=data.channel or "dine_in",
        items=data.items,
    )
    if not result["ok"]:
        return _resp(True, "Coupon not valid", {"valid": False, "error": result["error"]})
    coupon = result["coupon"]
    discount = result["computed_discount"]
    final_preview = (
        round(float(data.order_total) - float(discount or 0.0), 2)
        if discount is not None else None
    )
    return _resp(True, "Coupon valid", {
        "valid":                True,
        "code":                 coupon["code"],
        "title":                coupon.get("title") or coupon.get("description"),
        "discount_type":        coupon["discount_type"],
        "discount_value":       coupon["discount_value"],
        "computed_discount":    discount,
        "final_amount_preview": final_preview,
        "min_order_value":      coupon.get("min_order_value", 0),
        "stackable_with_loyalty": bool(coupon.get("stackable_with_loyalty", False)),
        "coupon_type":          coupon.get("coupon_type", "order"),
    })
```

---

## 3. Edit order

```
E1 (imports, both CRs) → E2 (rate-limit constant) → E3 (CR-107 schema+route) → E4 (CR-105 schema+route)
→ backend hot-reload → V1–V6 self-test
```

---

## 4. Verification matrix

| V | Check | Expected |
|---|---|---|
| V1 | POST `/scan/max-redeemable` `{bill_amount:500}` — r689 diner with points > 0 | 200, `ok:true`, `max_points_redeemable ≥ 0`, `projected_points_earned > 0` |
| V2 | POST `/scan/max-redeemable` — diner with loyalty disabled tenant | 200, `ok:false`, `code:"LOYALTY_DISABLED"` |
| V3 | POST `/scan/coupons/validate` `{code:"<active r689 code>", order_total:500}` | 200, `valid:true`, `computed_discount > 0`, `final_amount_preview < 500` |
| V4 | POST `/scan/coupons/validate` `{code:"BADCODE999", order_total:500}` | 200, `valid:false`, `error.code:"INVALID_CODE"` |
| V5 | POST `/scan/coupons/validate` 11 times same IP | 11th → 429 + `Retry-After` |
| V6 | GET `/scan/coupons` still 200 (no regression) | 200, `coupons: [...]` |

---

## 5. Files

**WILL change**: `backend/routers/scan.py` — E1 (3 import lines) + E2 (1 constant) + E3 (~20 lines) + E4 (~30 lines) = **~54 lines total**

**WILL NOT touch**: `core/coupon.py` · `core/loyalty.py` · `routers/pos.py` · `models/schemas.py` · `server.py` · frontend · stored data

---

## 6. Rollback

`git revert` — no data written, no indexes created, no schema changes.

---

```
Planning complete: CR-107 + CR-105 (combined plan)
Stage: Implementation Plan
Risk: LOW (CR-107) · LOW–MEDIUM (CR-105)
Files WILL change: routers/scan.py (~54 lines: 4 edit blocks)
Files WILL NOT touch: core/ · pos.py · schemas.py · frontend · data
Owner decisions: all locked
Implementation order: CR-107 first (E3) → CR-105 (E4)
Next: "choose implementation role for CR-105 + CR-107" → implement
```
