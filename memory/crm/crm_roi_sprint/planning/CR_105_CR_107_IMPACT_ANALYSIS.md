# CR-105 + CR-107 — Combined Impact Analysis
**Date**: 2026-10-09 · **Role**: Planning Agent · **Source**: `discovery/SESSION_2026_10_09_INTAKE_BUG034_CR105_CR106_CR107.md` §2 + §4 · **Status**: 🟡 IA in progress — owner decisions Q1/Q2 (CR-105) · Q1 (CR-107) pending · **No code changed.**

---

## CR-105 — `POST /scan/coupons/validate`

### 1. Code reality

| Component | Location | Status |
|---|---|---|
| `validate_coupon_for_customer(db, *, user_id, code, customer_id, order_total, channel, loyalty_points_used, items, ...)` | `core/coupon.py:1643` | ✅ EXISTS — powers `POST /pos/coupons/validate` today |
| `POST /scan/coupons/validate` | `routers/scan.py` | ❌ MISSING |
| Rate-limit helper `_lookup_rate_limited` | `scan.py:63` | ✅ EXISTS — reused as-is |
| `validate_coupon_for_customer` imported in `scan.py` | `scan.py:1–23` | ❌ NOT imported — E1 adds it |

**Function confirms:**
- Returns `{"ok": True, "coupon": <doc>, "computed_discount": float|None, "discount_scope": str, "eligible_subtotal": float|None, "matched_*_ids": [...]}` on success
- Returns `{"ok": False, "error": {"code": str, "field": str|None, "detail": str}}` on failure
- Error codes present in function: `INVALID_CODE`, `INACTIVE`, `EXPIRED`, `MIN_ORDER`, `PER_USER_LIMIT`, `NOT_APPLICABLE` (channel/day/time-window), `ITEM_SCOPE_NEEDS_CART`
- **Read-only** — no `coupon_usage` doc written; that happens in `POST /pos/orders`
- `channel` param defaults to `"pos"` today — scan route should default to `"dine_in"` or accept from body (Q2)

### 2. Proposed route

```python
class ScanCouponValidateRequest(BaseModel):
    code: str
    order_total: float
    channel: Optional[str] = "dine_in"     # CR-105 Q2
    items: Optional[List[dict]] = None      # needed for item/category-scope coupons

@router.post("/coupons/validate")
async def scan_validate_coupon(
    data: ScanCouponValidateRequest,
    request: Request,
    auth: dict = Depends(verify_customer_token),
):
```

**Rate limit (Q1):** IP bucket `vc-ip:{ip}` via `_lookup_rate_limited` — no phone bucket needed (token already identifies the diner).

**Successful 200 response (subset of POS validate — display fields only):**
```json
{
  "valid": true,
  "code": "SAVE10",
  "title": "Weekend Offer",
  "discount_type": "percentage",
  "discount_value": 10.0,
  "computed_discount": 45.0,
  "final_amount_preview": 405.0,
  "stackable_with_loyalty": false,
  "coupon_type": "order",
  "min_order_value": 200.0
}
```

**Error 200 response:**
```json
{
  "valid": false,
  "error": { "code": "MIN_ORDER", "detail": "Minimum order ₹200 required" }
}
```

**Important**: HTTP status is always **200** for both valid and invalid — mirrors the POS pattern. The `valid` flag tells the app what happened.

### 3. Blast radius

- **Files WILL change**: `routers/scan.py` (~30 lines: 1 schema + 1 route + 1 import)
- **Files WILL NOT touch**: `core/coupon.py` · `routers/pos.py` · `models/schemas.py` · stored data
- **Risk**: LOW–MEDIUM — calls a heavily tested service; scan route is thin wrapper; no write

### 4. Owner questions

| Q | Question | Recommendation |
|---|---|---|
| **Q1** | Rate limit: (a) 10/min per IP · (b) 5/min per IP · (c) no limit (token-gated) | **(a) 10/min per IP** — consistent with lookup/feedback |
| **Q2** | Include `channel` in request body (default `"dine_in"`)? | **Yes** — additive, free, future-proofs V3-A time-window validation |

---

## CR-107 — `POST /scan/max-redeemable`

### 1. Code reality

| Component | Location | Status |
|---|---|---|
| `compute_max_redeemable(customer, settings, bill_amount) -> dict` | `core/loyalty.py:160` | ✅ EXISTS — pure function, no DB writes |
| `POST /pos/max-redeemable` | `routers/pos.py:471` | ✅ EXISTS (POS auth — not usable by Customer App) |
| `compute_max_redeemable` imported in `scan.py` | `scan.py:22` | ❌ NOT imported — E1 adds it |
| `POST /scan/max-redeemable` | `routers/scan.py` | ❌ MISSING |

**Function confirms:**
- Pure (no DB writes), tier-aware
- Returns: `{ok, code, message, max_points_redeemable, max_discount_value, ratio_per_point, tier, available_points, min_redemption_points, loyalty_enabled}`
- Error codes: `LOYALTY_DISABLED`, `SETTINGS_MISSING`, `BELOW_MIN_REDEMPTION`
- All caps are applied server-side: `min_redemption_points`, `max_redemption_percent × bill_amount`, `max_redemption_amount` flat cap, customer's `total_points` ceiling

**What the POS route adds on top** (lines 523–568): `projected_points_earned`, `tier_upgrade`, `earn_ratio_display` — useful for checkout preview. The scan route will include `projected_points_earned` (useful) but skip `tier_upgrade_message` (staff-facing copy).

### 2. Proposed route

```python
class ScanMaxRedeemableRequest(BaseModel):
    bill_amount: float

@router.post("/max-redeemable")
async def scan_max_redeemable(
    data: ScanMaxRedeemableRequest,
    auth: dict = Depends(verify_customer_token),
):
```

**Fetches:** customer from `db.customers` (by `auth["customer_id"]` + `auth["restaurant_id"]`) + `loyalty_settings` (by `auth["restaurant_id"]`). Calls `compute_max_redeemable`. Optionally adds `projected_points_earned` via `calculate_points`.

**Response (200 always):**
```json
{
  "ok": true,
  "max_points_redeemable": 150,
  "max_discount_value": 150.0,
  "ratio_per_point": 1.0,
  "available_points": 400,
  "min_redemption_points": 50,
  "loyalty_enabled": true,
  "projected_points_earned": 23
}
```

**Not-ok (loyalty disabled / below minimum):**
```json
{
  "ok": false,
  "code": "BELOW_MIN_REDEMPTION",
  "message": "Minimum 50 points required to redeem.",
  "max_points_redeemable": 0,
  "max_discount_value": 0.0,
  "available_points": 30,
  "loyalty_enabled": true
}
```

No rate limit needed — token-gated, read-only, trivial DB reads.

### 3. Imports to add in scan.py

```python
from core.coupon import validate_coupon_for_customer          # CR-105
from core.loyalty import default_loyalty_settings, compute_max_redeemable  # CR-094 + CR-107
from core.helpers import calculate_tier, get_earn_percent_for_tier, get_redemption_value_for_tier, calculate_points  # CR-094 + CR-107
```

### 4. Blast radius

- **Files WILL change**: `routers/scan.py` (~25 lines: 1 schema + 1 route + import additions)
- **Files WILL NOT touch**: `core/loyalty.py` · `core/coupon.py` · `routers/pos.py` · `models/schemas.py` · stored data
- **Risk**: LOW — pure read, wraps a tested function, no write

### 5. Owner questions

| Q | Question | Recommendation |
|---|---|---|
| **Q1** | Build scan endpoint (A) vs document formula for S&O client-side (B)? | **(A)** — confirmed needed; `compute_max_redeemable` has 5 cap rules; client-side drift risk is real |

---

## Shared notes (both CRs)

**Edit order when implemented:** E1 (imports for both) → E2 (CR-107 schema + route — simpler) → E3 (CR-105 schema + route) → self-test V1–V6.

**No conflicts** with any open CR — both are additive scan routes; no overlap with BUG-034 (list route), CR-096 (feedback), CR-088 (pagination), CR-100 (phone match).

---

**Q1 = (a) 10/min per IP · Q2 = YES (channel in body, default "dine_in") · CR-107 Q1 = A (endpoint). IA CLOSED. Implementation Plan gate NOT opened.**
