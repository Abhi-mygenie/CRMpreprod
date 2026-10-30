# CR-120 + CR-121 — Combined Impact Analysis: Optional-auth on scan coupon routes
**Date**: 2026-10-11 · **Role**: Planning Agent · **Risk**: LOW (CR-120) · LOW–MEDIUM (CR-121)
**Intakes**: `discovery/CR_120_SCAN_VALIDATE_OPTIONAL_AUTH_INTAKE.md` · `discovery/CR_121_SCAN_COUPON_LIST_OPTIONAL_AUTH_INTAKE.md`
**Source**: INV-024 · S&O contract frozen 2026-10-11 · **No code changed.**

---

## 1. Code reality (confirmed from live `routers/scan.py`)

### Shared helpers — already exist, no change needed

| Helper | Location | Used by |
|---|---|---|
| `optional_customer_token` | `scan.py:100–116` | CR-096 (feedback). Returns `None` (no token) or `dict` (valid token). Raises 401 on bad/expired token. | 
| `_resolve_restaurant_id(rid)` | `scan.py:42–55` | Accepts short `"689"` or full `"pos_0001_restaurant_689"`. Async DB lookup for non-standard ids. |
| `_lookup_rate_limited(key, limit, window_s)` | `scan.py:78–92` | Mongo-backed sliding window. Already used by validate (line 546). |
| `_COUPON_VALIDATE_IP_LIMIT = (10, 60)` | `scan.py:97` | Already applied to `POST /scan/coupons/validate`. |
| `_client_ip(request)` | `scan.py:73–75` | Extracts real IP from `X-Forwarded-For`. |

**No new imports required.** All helpers are already in scope.

---

### CR-120 — `POST /scan/coupons/validate` current state (lines 532–582)

```python
class ScanCouponValidateRequest(BaseModel):  # CR-105
    code: str
    order_total: float
    channel: Optional[str] = "dine_in"
    items: Optional[List[dict]] = None
    # ← no restaurant_id — currently comes from JWT

@router.post("/coupons/validate")
async def scan_validate_coupon(
    data: ScanCouponValidateRequest,
    request: Request,
    auth: dict = Depends(verify_customer_token),   # ← hard required
):
    ...
    result = await validate_coupon_for_customer(
        db,
        user_id=auth["restaurant_id"],             # ← from token only
        code=data.code,
        customer_id=auth["customer_id"],            # ← from token only
        ...
    )
```

**Gaps:**
1. `auth: dict` (not Optional) — 401 if no token
2. `restaurant_id` not in request body — anonymous caller has no way to supply it
3. `customer_id` hardwired from token — anonymous pass (`None`) not reached

---

### CR-121 — `GET /scan/coupons` current state (lines 467–494)

```python
@router.get("/coupons")
async def get_available_coupons(
    channel: Optional[str] = None,
    auth: dict = Depends(verify_customer_token),   # ← hard required
):
    ...
    coupons = await db.coupons.find({
        "user_id": auth["restaurant_id"],           # ← from token only
        ...
    }).to_list(50)

    eligible = []
    for c in coupons:
        if c.get("specific_users") and auth["customer_id"] not in c["specific_users"]:
            continue                                # ← customer_id used — breaks if None
        usage = await db.coupon_usage.count_documents(
            {"coupon_id": c["id"], "customer_id": auth["customer_id"]}
        )                                           # ← DB hit per coupon — breaks if None
        if usage < (c.get("per_user_limit") or 1):
            c["my_usage_count"] = usage
            eligible.append(c)
```

**Gaps:**
1. `auth: dict` (not Optional) — 401 if no token
2. `restaurant_id` not as query param — anonymous caller has no way to supply it
3. `specific_users` check uses `auth["customer_id"]` — TypeError if `customer_id` is None
4. `coupon_usage.count_documents` uses `auth["customer_id"]` — wrong query if None
5. No `requires_customer` filter — anonymous would see standard coupons (violates Q4 decision)
6. `my_usage_count` appended unconditionally — should be omitted for anonymous
7. No rate limit on the list endpoint for anonymous callers

---

## 2. Proposed changes

### CR-120 — three edits

**Edit 1 — `ScanCouponValidateRequest` model: add `restaurant_id`**

```python
class ScanCouponValidateRequest(BaseModel):  # CR-105
    code: str
    order_total: float
    channel: Optional[str] = "dine_in"
    items: Optional[List[dict]] = None
    restaurant_id: Optional[str] = None  # CR-120: required when no token; ignored when token present
```

**Edit 2 — Route signature: optional token**

```python
@router.post("/coupons/validate")
async def scan_validate_coupon(
    data: ScanCouponValidateRequest,
    request: Request,
    auth: Optional[dict] = Depends(optional_customer_token),  # CR-120: was verify_customer_token
):
```

**Edit 3 — Route body: resolve rid + customer_id**

Replace the two hard `auth["..."]` usages with:

```python
    # CR-120: resolve restaurant + customer from token or body
    if auth:
        rid = auth["restaurant_id"]
        customer_id = auth["customer_id"]
    else:
        if not data.restaurant_id:
            raise HTTPException(status_code=422, detail="restaurant_id required when not authenticated")
        rid = await _resolve_restaurant_id(data.restaurant_id)
        customer_id = None  # anonymous — engine handles CUSTOMER_REQUIRED internally

    result = await validate_coupon_for_customer(
        db,
        user_id=rid,           # was auth["restaurant_id"]
        code=data.code,
        customer_id=customer_id,  # was auth["customer_id"]
        ...
    )
```

Rate limit: **unchanged** — `_COUPON_VALIDATE_IP_LIMIT (10, 60)` already applies to both auth states at line 546.

**Response shape: identical for both auth states.** No field added or removed.

---

### CR-121 — five edits

**Edit 1 — Route signature: optional token + `restaurant_id` query param**

```python
@router.get("/coupons")
async def get_available_coupons(
    channel: Optional[str] = None,
    restaurant_id: Optional[str] = None,           # CR-121: required when no token
    request: Request = None,                       # CR-121: needed for anonymous rate limit
    auth: Optional[dict] = Depends(optional_customer_token),  # CR-121: was verify_customer_token
):
```

**Edit 2 — Anonymous rate limit (new — applies only when no token)**

```python
    # CR-121: rate-limit anonymous callers (token-holders are already gated by JWT)
    if not auth:
        retry = await _lookup_rate_limited(
            f"cl-ip:{_client_ip(request)}", *_COUPON_LIST_IP_LIMIT
        )
        if retry:
            raise HTTPException(
                status_code=429, detail="Too many requests",
                headers={"Retry-After": str(retry)}
            )
```

New constant (1 line, beside `_COUPON_VALIDATE_IP_LIMIT`):
```python
_COUPON_LIST_IP_LIMIT = (10, 60)   # CR-121: 10/min per IP for anonymous list
```

**Edit 3 — Resolve rid from token or query param**

```python
    # CR-121: resolve restaurant from token or query param
    if auth:
        rid = auth["restaurant_id"]
        customer_id = auth["customer_id"]
    else:
        if not restaurant_id:
            raise HTTPException(status_code=422, detail="restaurant_id required when not authenticated")
        rid = await _resolve_restaurant_id(restaurant_id)
        customer_id = None
```

Replace `auth["restaurant_id"]` in the DB query with `rid`.

**Edit 4 — Loop: anonymous filtering (requires_customer + conditional checks)**

Replace the entire eligible loop:

```python
    eligible = []
    for c in coupons:
        # CR-121: hide requires_customer=true coupons from anonymous callers (owner Q4)
        if not customer_id and c.get("requires_customer", True):
            continue

        # specific_users check: only meaningful when we know who the diner is
        if c.get("specific_users") and customer_id and customer_id not in c["specific_users"]:
            continue

        # per_user_limit: skip DB hit for anonymous (no customer to check against)
        if customer_id:
            usage = await db.coupon_usage.count_documents(
                {"coupon_id": c["id"], "customer_id": customer_id}
            )
            if usage >= (c.get("per_user_limit") or 1):  # CR-120: handle null (BUG-034 pattern)
                continue
            c["my_usage_count"] = usage  # only present in authenticated response
        
        eligible.append(c)
```

**Edit 5 — DB query: use `rid` not `auth["restaurant_id"]`**

```python
    coupons = await db.coupons.find({
        "user_id": rid,       # CR-121: was auth["restaurant_id"]
        ...
    }).to_list(50)
```

---

## 3. Data-flow trace

### CR-120 — validate (anonymous path)
```
POST /scan/coupons/validate  (no token, restaurant_id="689" in body)
  → optional_customer_token → None
  → rate-limit check (existing, 10/min/IP) → pass
  → rid = _resolve_restaurant_id("689") → "pos_0001_restaurant_689"
  → customer_id = None
  → validate_coupon_for_customer(user_id=rid, customer_id=None, ...)
      → requires_customer=false: computes discount → ok:True
      → requires_customer=true:  returns CUSTOMER_REQUIRED → ok:False
  → response: {valid, code, discount_type, computed_discount, ...}  ← identical shape
```

### CR-121 — list (anonymous path)
```
GET /scan/coupons?restaurant_id=689  (no token)
  → optional_customer_token → None
  → anonymous rate-limit check (new, 10/min/IP) → pass
  → rid = _resolve_restaurant_id("689")
  → customer_id = None
  → DB query: coupons for rid, active, within dates, channel filter
  → loop:
      requires_customer=true  → skip  (owner Q4)
      specific_users present  → skip (no customer to check)
      per_user_limit check    → skipped (no customer)
      my_usage_count          → NOT added
  → returns only requires_customer=false coupons
```

---

## 4. Affected files

### Files WILL change

| File | Lines touched | Nature |
|---|---|---|
| `routers/scan.py` | ~532–537 (model) · ~539–582 (validate route) | CR-120: +1 model field, optional dep, 5-line resolve block |
| `routers/scan.py` | ~97 (constants) · ~467–494 (list route) | CR-121: +1 constant, optional dep, +restaurant_id param, loop rewrite (~15 lines) |

**Total: ~25 lines net across both CRs in one file.**

### Files WILL NOT change

| File | Reason |
|---|---|
| `core/coupon.py` | Engine already supports `customer_id=None` — zero change |
| `models/schemas.py` | `ScanCouponValidateRequest` is inline in `scan.py`, not in schemas |
| `routers/pos.py` | Untouched |
| `routers/customers.py` | Untouched |
| All frontend files | Untouched — S&O consumes these endpoints |
| `core/auth.py` | Untouched |
| MongoDB collections / indexes | Untouched — `scan_lookup_attempts` already indexed for rate limit |

---

## 5. Risk assessment

| CR | Label | Reasoning |
|---|---|---|
| CR-120 | **LOW** | 3 edits: model field (additive), dep swap, 5-line resolve block. `validate_coupon_for_customer` with `customer_id=None` fully proven (CR-082, in production). No write path. Rate limit already in place. |
| CR-121 | **LOW–MEDIUM** | Loop rewrite introduces conditional logic. Authenticated path must behave identically to today — risk is regressions in the `auth` branch. Additive for anonymous. BUG-034 fix pattern (handle `per_user_limit:null`) must be preserved in the rewritten loop. |

**§14 hotspot check:** `routers/scan.py` is not on the addendum hotspot list. No financial/auth/coupon-engine logic changes.

---

## 6. Backward compatibility

| Caller | Impact |
|---|---|
| S&O authenticated calls to `POST /scan/coupons/validate` (existing) | **Zero change** — token present → same code path as today |
| S&O authenticated calls to `GET /scan/coupons` (existing) | **Zero change** — `customer_id` present → `requires_customer=true` coupons NOT skipped (only skipped when anonymous) |
| CRM staff / other callers | Neither endpoint is used by CRM staff UI |

The `restaurant_id` field in the validate body is `Optional[str] = None` — existing callers that do not send it are unaffected (Pydantic ignores missing Optional fields, does not return 422).

---

## 7. Conflict check

| With | Overlap | Resolution |
|---|---|---|
| **CR-119** (already implemented) | `scan.py` lines 163–240 | No overlap with lines 467–582. Zero conflict. |
| **CR-106** (channel filter on list) | `scan.py` lines 475, 481 | CR-121 preserves the `ch_filter` logic exactly. No conflict. |
| **BUG-034** (list 500 fix) | `scan.py` line 490: `(c.get("per_user_limit") or 1)` | CR-121 loop rewrite must preserve this null-handling pattern. Declared in edit 4. |
| **CR-105** (validate with token) | `scan.py` lines 532–582 | CR-120 is a superset — authenticated path unchanged. |
| Wave A CRs (CR-111/113/114/115) | `routers/customers.py`, `routers/migration.py`, `routers/pos.py` | Different files. Zero conflict. |

**Both CRs must be implemented in the same session** — they share the same file and the same 15-minute checkout scan.py before writing.

---

## 8. Owner questions

**None.** All decisions locked — contract frozen 2026-10-11.

---

## 9. Verification matrix

### CR-120

| V | Case | Expected |
|---|---|---|
| V1 | No token + `restaurant_id=689` + generic coupon + valid order | `valid:true`, `computed_discount` returned |
| V2 | No token + `restaurant_id=689` + standard coupon | `valid:false`, `error.code:CUSTOMER_REQUIRED` |
| V3 | No token + no `restaurant_id` in body | `422 Unprocessable Entity` |
| V4 | No token + expired coupon | `valid:false`, `error.code:EXPIRED` |
| V5 | No token + `min_order` not met | `valid:false`, `error.code:MIN_ORDER_NOT_MET` |
| V6 | With token — 5/5 existing CR-105 cases | **PASS** (no regression) |
| V7 | Bad token (invalid signature) | `401` |
| V8 | Expired token | `401` |

### CR-121

| V | Case | Expected |
|---|---|---|
| V1 | No token + `restaurant_id=689` | Returns only `requires_customer=false` coupons; no `my_usage_count` field |
| V2 | No token + no `restaurant_id` | `422` |
| V3 | No token + standard coupon in DB | Not returned |
| V4 | No token + `channel=dine_in` | Filtered to dine_in channel |
| V5 | No token — 11th request in 60s (same IP) | `429` with `Retry-After` |
| V6 | With token — existing behaviour | `my_usage_count` present; `requires_customer=true` coupons returned if eligible; `specific_users` checked |
| V7 | With token — coupon exhausted (per_user_limit reached) | Coupon excluded (same as today) |
| V8 | With token — `specific_users` coupon, diner not in list | Excluded (same as today) |

---

```
Planning complete: CR-120 + CR-121
Stage: Impact Analysis
Code reality: FULL — both routes confirmed from live scan.py:467–582; all helpers present
Risk: LOW (CR-120) · LOW–MEDIUM (CR-121)
Files WILL change: routers/scan.py only (~25 lines net across both CRs)
Files WILL NOT touch: core/coupon.py · models/schemas.py · routers/pos.py · routers/customers.py · frontend · DB/indexes
Owner decisions: ALL LOCKED — contract frozen 2026-10-11
Conflict: NONE with any open CR
Docs: planning/CR_120_CR_121_IMPACT_ANALYSIS.md
Next: Implementation Plan gate opens on "choose planning role for implementation planning of CR-120 and CR-121"
```
