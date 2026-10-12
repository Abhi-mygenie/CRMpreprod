# CR-120 — Implementation Plan: `POST /scan/coupons/validate` optional-auth
**Date**: 2026-10-11 · **Role**: Planning Agent · **Risk**: LOW · **No code changed. No data written.**
**Impact Analysis**: `planning/CR_120_CR_121_IMPACT_ANALYSIS.md`

---

## 1. Scope lock

**File that WILL change:** `routers/scan.py` — 3 targeted edits, ~10 lines net.

**Everything else is out of scope.** If any edit requires touching a second file, stop and raise to owner.

---

## 2. Pre-implementation checklist

- [ ] Confirm backend running: `GET /api/health` → 200
- [ ] Confirm `backend/.env` points at **preprod** (`52.66.232.149:27017/mygenie`)
- [ ] Read `scan.py` lines 532–582 before touching anything (code is truth)
- [ ] Have `tests/test_cr089_skip_otp.py` and `tests/test_cr093_lookup.py` ready to run after edits (existing scan suite regression)
- [ ] No conflict with CR-121 (different hunks in the same file) — implement CR-120 first, CR-121 after

---

## 3. Edits — in order

### Edit 1 — `ScanCouponValidateRequest` model: add `restaurant_id`

**File:** `routers/scan.py`
**Location:** lines 532–536

**Before:**
```python
class ScanCouponValidateRequest(BaseModel):  # CR-105
    code: str
    order_total: float
    channel: Optional[str] = "dine_in"   # CR-105 Q2
    items: Optional[List[dict]] = None   # needed for item/category-scope (V2/V3-B) coupons
```

**After:**
```python
class ScanCouponValidateRequest(BaseModel):  # CR-105
    code: str
    order_total: float
    channel: Optional[str] = "dine_in"   # CR-105 Q2
    items: Optional[List[dict]] = None   # needed for item/category-scope (V2/V3-B) coupons
    restaurant_id: Optional[str] = None  # CR-120: required when no token; ignored when token present
```

**Why:** `restaurant_id` is taken from the JWT today. Anonymous callers have no JWT — they must supply it in the body. `Optional` with default `None` means existing callers that don't send it are unaffected (no 422).

---

### Edit 2 — Route signature: make token optional

**File:** `routers/scan.py`
**Location:** lines 540–544

**Before:**
```python
async def scan_validate_coupon(
    data: ScanCouponValidateRequest,
    request: Request,
    auth: dict = Depends(verify_customer_token),
):  # CR-105
    """CR-105: validate coupon code against order total. Read-only — no usage recorded."""
```

**After:**
```python
async def scan_validate_coupon(
    data: ScanCouponValidateRequest,
    request: Request,
    auth: Optional[dict] = Depends(optional_customer_token),  # CR-120: was verify_customer_token
):  # CR-105 · CR-120
    """CR-105/CR-120: validate coupon code. Read-only — no usage recorded.
    Token optional: anonymous callers pass restaurant_id in body instead."""
```

**Why:** `optional_customer_token` (line 100–116) already exists, built for CR-096. Returns `None` when no token present; raises `401` on bad or expired token. Swapping the dependency is the only change to the signature.

---

### Edit 3 — Route body: resolve `rid` and `customer_id`

**File:** `routers/scan.py`
**Location:** lines 554–562 (the `validate_coupon_for_customer` call)

**Before:**
```python
    result = await validate_coupon_for_customer(
        db,
        user_id=auth["restaurant_id"],
        code=data.code,
        customer_id=auth["customer_id"],
        order_total=data.order_total,
        channel=data.channel or "dine_in",
        items=data.items,
    )
```

**After:**
```python
    # CR-120: resolve restaurant + customer from token or request body
    if auth:
        rid = auth["restaurant_id"]
        customer_id = auth["customer_id"]
    else:
        if not data.restaurant_id:
            raise HTTPException(status_code=422, detail="restaurant_id required when not authenticated")
        rid = await _resolve_restaurant_id(data.restaurant_id)
        customer_id = None  # anonymous — engine returns CUSTOMER_REQUIRED for standard coupons

    result = await validate_coupon_for_customer(
        db,
        user_id=rid,
        code=data.code,
        customer_id=customer_id,
        order_total=data.order_total,
        channel=data.channel or "dine_in",
        items=data.items,
    )
```

**Why:**
- With token → identical to today. `auth["restaurant_id"]` and `auth["customer_id"]` used as before.
- Without token → `restaurant_id` from body resolved via `_resolve_restaurant_id` (handles `"689"` and `"pos_0001_restaurant_689"`). `customer_id = None` → engine skips `per_user_limit` and `specific_users` checks; returns `CUSTOMER_REQUIRED` for `requires_customer=true` coupons.
- `_resolve_restaurant_id` is already imported and used elsewhere in `scan.py` — no new import.
- The rest of the route (rate limit check, response building) is **unchanged** — no further edits needed.

---

## 4. Complete picture — what the route looks like after all 3 edits

```python
class ScanCouponValidateRequest(BaseModel):  # CR-105
    code: str
    order_total: float
    channel: Optional[str] = "dine_in"
    items: Optional[List[dict]] = None
    restaurant_id: Optional[str] = None  # CR-120


@router.post("/coupons/validate")
async def scan_validate_coupon(
    data: ScanCouponValidateRequest,
    request: Request,
    auth: Optional[dict] = Depends(optional_customer_token),  # CR-120
):  # CR-105 · CR-120
    """CR-105/CR-120: validate coupon code. Read-only — no usage recorded."""
    retry = await _lookup_rate_limited(           # UNCHANGED
        f"vc-ip:{_client_ip(request)}", *_COUPON_VALIDATE_IP_LIMIT
    )
    if retry:
        raise HTTPException(
            status_code=429, detail="Too many requests",
            headers={"Retry-After": str(retry)}
        )

    # CR-120: resolve restaurant + customer from token or request body
    if auth:
        rid = auth["restaurant_id"]
        customer_id = auth["customer_id"]
    else:
        if not data.restaurant_id:
            raise HTTPException(status_code=422, detail="restaurant_id required when not authenticated")
        rid = await _resolve_restaurant_id(data.restaurant_id)
        customer_id = None

    result = await validate_coupon_for_customer(
        db,
        user_id=rid,
        code=data.code,
        customer_id=customer_id,
        order_total=data.order_total,
        channel=data.channel or "dine_in",
        items=data.items,
    )
    if not result["ok"]:                          # UNCHANGED from here
        return _resp(True, "Coupon not valid", {"valid": False, "error": result["error"]})
    coupon = result["coupon"]
    discount = result["computed_discount"]
    final_preview = (
        round(float(data.order_total) - float(discount or 0.0), 2)
        if discount is not None else None
    )
    return _resp(True, "Coupon valid", {
        "valid":                  True,
        "code":                   coupon["code"],
        "title":                  coupon.get("title") or coupon.get("description"),
        "discount_type":          coupon["discount_type"],
        "discount_value":         coupon["discount_value"],
        "computed_discount":      discount,
        "final_amount_preview":   final_preview,
        "min_order_value":        coupon.get("min_order_value", 0),
        "stackable_with_loyalty": bool(coupon.get("stackable_with_loyalty", False)),
        "coupon_type":            coupon.get("coupon_type", "order"),
    })  # CR-105 · CR-120
```

---

## 5. Self-test sequence (run after all 3 edits)

```bash
API_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)

# T1 — anonymous + generic coupon (requires_customer=false must exist in r689)
# First check what generic coupons exist
curl -s "$API_URL/api/scan/coupons?restaurant_id=689" | python3 -c "
import sys,json; d=json.load(sys.stdin)
coupons = d.get('data',{}).get('coupons',[])
generic = [c['code'] for c in coupons if not c.get('requires_customer',True)]
print('Generic coupons:', generic[:3])
"

# T2 — anonymous + no restaurant_id → expect 422
R=$(curl -s -X POST "$API_URL/api/scan/coupons/validate" \
  -H "Content-Type: application/json" \
  -d '{"code":"TEST","order_total":500}')
echo "T2 no-restaurant_id: $R"
# Expected: 422

# T3 — anonymous + generic coupon → expect valid:true with computed_discount
# Replace GENERIC_CODE with an actual generic coupon code from T1
R=$(curl -s -X POST "$API_URL/api/scan/coupons/validate" \
  -H "Content-Type: application/json" \
  -d '{"code":"GENERIC_CODE","restaurant_id":"689","order_total":500}')
echo "T3 anonymous generic: $R"
# Expected: valid:true, computed_discount present

# T4 — anonymous + standard coupon → expect CUSTOMER_REQUIRED
# Replace STANDARD_CODE with a requires_customer=true coupon code
R=$(curl -s -X POST "$API_URL/api/scan/coupons/validate" \
  -H "Content-Type: application/json" \
  -d '{"code":"STANDARD_CODE","restaurant_id":"689","order_total":500}')
echo "T4 anonymous standard: $R"
# Expected: valid:false, error.code:CUSTOMER_REQUIRED

# T5 — anonymous + expired/invalid code
R=$(curl -s -X POST "$API_URL/api/scan/coupons/validate" \
  -H "Content-Type: application/json" \
  -d '{"code":"NOTEXIST99","restaurant_id":"689","order_total":500}')
echo "T5 anonymous invalid: $R"
# Expected: valid:false, error.code:INVALID_CODE

# T6 — authenticated (existing behaviour must be unchanged)
TOKEN=$(curl -s -X POST "$API_URL/api/scan/auth/skip-otp" \
  -H "Content-Type: application/json" \
  -d '{"phone":"9876543210","restaurant_id":"689"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
R=$(curl -s -X POST "$API_URL/api/scan/coupons/validate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"code":"ANYCODE","order_total":500}')
echo "T6 authenticated: $R"
# Expected: same behaviour as before CR-120
```

**Pytest regression (run after T1–T6 pass):**
```bash
cd /app/backend && \
  REACT_APP_BACKEND_URL=https://mygenie-crm-preprod.preview.emergentagent.com \
  CRM_TEST_OWNER_PASSWORD=Qplazm@10 \
  python -m pytest tests/test_cr089_skip_otp.py tests/test_cr093_lookup.py \
  tests/test_cr084_cr097.py -v --override-ini="addopts=" 2>&1 | tail -15
```
Expected: all pass. No existing scan route should regress.

---

## 6. Verification matrix

| V# | Input | Expected |
|---|---|---|
| V1 | No token + `restaurant_id:"689"` + generic coupon + valid order | `valid:true`, `computed_discount` present, `final_amount_preview` present |
| V2 | No token + `restaurant_id:"689"` + standard coupon | `valid:false`, `error.code:"CUSTOMER_REQUIRED"` |
| V3 | No token + no `restaurant_id` field in body | `422 Unprocessable Entity` |
| V4 | No token + expired coupon | `valid:false`, `error.code:"EXPIRED"` |
| V5 | No token + `min_order` not met | `valid:false`, `error.code:"MIN_ORDER_NOT_MET"` |
| V6 | No token + invalid/nonexistent code | `valid:false`, `error.code:"INVALID_CODE"` |
| V7 | Valid token (existing) — all 5 CR-105 original cases | **PASS** — no regression |
| V8 | Bad token (invalid signature) | `401` |
| V9 | Expired token | `401` |
| V10 | Rate limit: 11th call in 60s (same IP) | `429` with `Retry-After` header |

---

## 7. QA handover criteria

Ready for QA when:
- [ ] All 6 self-test curls pass (T1–T6)
- [ ] Pytest regression: existing scan suites all PASS
- [ ] Code markers `# CR-120` present on all 3 edit lines
- [ ] Authenticated path (V7): behaviour identical to pre-CR-120

---

## 8. Rollback

Revert the 3 edits in `scan.py`. No DB migration, no schema change, no index change. Nothing to undo outside the file.

---

## 9. Files changed / not changed (final declaration)

**WILL change:**
- `routers/scan.py` — Edit 1 (~line 536), Edit 2 (~line 543), Edit 3 (~lines 554–562)

**WILL NOT change:**
- `core/coupon.py` — engine unchanged
- `models/schemas.py` — model is inline in scan.py
- `routers/pos.py`, `routers/customers.py`, `routers/auth.py`
- All frontend files
- MongoDB collections / indexes
- `.env` files

---

```
Planning complete: CR-120
Stage: Impact Analysis (done) + Implementation Plan
Code reality: FULL (scan.py:532–582 confirmed)
Risk: LOW
Edits: 3 edits in routers/scan.py (~10 lines net)
Files WILL change: routers/scan.py only
Files WILL NOT touch: everything else
Owner decisions required: NONE
Self-test: T1–T6 curl + existing scan pytest suites
Docs: planning/CR_120_IMPLEMENTATION_PLAN.md
Next: "choose implementation role for CR-120" when owner approves
```
