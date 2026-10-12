# CR-121 — Implementation Plan: `GET /scan/coupons` optional-auth (anonymous coupon list)
**Date**: 2026-10-11 · **Role**: Planning Agent · **Risk**: LOW–MEDIUM · **No code changed. No data written.**
**Impact Analysis**: `planning/CR_120_CR_121_IMPACT_ANALYSIS.md`

---

## 1. Scope lock

**File that WILL change:** `routers/scan.py` — 3 targeted edits, ~25 lines net.

**Everything else is out of scope.** If any edit requires touching a second file, stop and raise to owner.

**Implement after CR-120** — CR-120 is already done. This CR touches a different hunk in the same file. Rebase check: CR-120 edited lines 532–594; this CR edits lines 95–97 and 467–494. No overlap.

---

## 2. Pre-implementation checklist

- [ ] Confirm backend running: `GET /api/health` → 200
- [ ] Confirm `backend/.env` points at **preprod**
- [ ] Read `scan.py` lines 95–98 and 467–494 before touching (code is truth — already confirmed above)
- [ ] CR-120 already implemented — read lines 532–594 to confirm no conflict
- [ ] Have `tests/test_cr089_skip_otp.py` and `tests/test_cr093_lookup.py` ready for regression

---

## 3. Edits — in order

### Edit 1 — Add `_COUPON_LIST_IP_LIMIT` constant

**File:** `routers/scan.py`
**Location:** line 97 (after `_COUPON_VALIDATE_IP_LIMIT`)

**Before:**
```python
_COUPON_VALIDATE_IP_LIMIT = (10, 60)  # CR-105 Q1=a: 10/min per IP
```

**After:**
```python
_COUPON_VALIDATE_IP_LIMIT = (10, 60)  # CR-105 Q1=a: 10/min per IP
_COUPON_LIST_IP_LIMIT     = (10, 60)  # CR-121: 10/min per IP for anonymous list
```

**Why:** Anonymous callers (no token) must be rate-limited. Authenticated callers are already gated by JWT — no rate limit needed on the authenticated path.

---

### Edit 2 — Route signature: optional token + `restaurant_id` + `request`

**File:** `routers/scan.py`
**Location:** lines 467–471

**Before:**
```python
@router.get("/coupons")
async def get_available_coupons(
    channel: Optional[str] = None,  # CR-106: "dine_in" | "delivery" | "takeaway"
    auth: dict = Depends(verify_customer_token),
):
    """List active coupons the customer is eligible for."""
```

**After:**
```python
@router.get("/coupons")
async def get_available_coupons(
    channel: Optional[str] = None,          # CR-106: "dine_in" | "delivery" | "takeaway"
    restaurant_id: Optional[str] = None,    # CR-121: required when no token; ignored when token present
    request: Request = None,                # CR-121: needed for anonymous rate limit
    auth: Optional[dict] = Depends(optional_customer_token),  # CR-121: was verify_customer_token
):  # CR-121
    """List active coupons eligible for this customer or restaurant.
    Token optional: anonymous callers pass restaurant_id as query param instead."""
```

**Why:**
- `optional_customer_token` (already in file, line 100) returns `None` when no token; raises 401 on bad/expired token.
- `restaurant_id: Optional[str] = None` — existing authenticated callers don't send it; ignored when token present.
- `request: Request` — FastAPI injects it automatically (no default needed in practice; `= None` is defensive).

---

### Edit 3 — Full route body rewrite

**File:** `routers/scan.py`
**Location:** lines 472–494 (the entire body)

**Before:**
```python
    """List active coupons the customer is eligible for."""
    now = datetime.now(timezone.utc).isoformat()
    # CR-106: always exclude pos-only coupons; optionally filter to a specific channel
    ch_filter = {"$in": [channel]} if channel else {"$in": ["dine_in", "delivery", "takeaway"]}
    coupons = await db.coupons.find({
        "user_id": auth["restaurant_id"],
        "is_active": True,
        "start_date": {"$lte": now},
        "end_date": {"$gte": now},
        "applicable_channels": ch_filter,  # CR-106
    }, {"_id": 0}).to_list(50)

    # Filter by per_user_limit
    eligible = []
    for c in coupons:
        if c.get("specific_users") and auth["customer_id"] not in c["specific_users"]:
            continue
        usage = await db.coupon_usage.count_documents({"coupon_id": c["id"], "customer_id": auth["customer_id"]})
        if usage < (c.get("per_user_limit") or 1):  # handle per_user_limit:null stored in DB (None != default)
            c["my_usage_count"] = usage
            eligible.append(c)

    return _resp(True, f"{len(eligible)} coupons available", {"coupons": eligible})
```

**After:**
```python
    # CR-121: rate-limit anonymous callers only (token-holders are already gated by JWT)
    if not auth:
        retry = await _lookup_rate_limited(
            f"cl-ip:{_client_ip(request)}", *_COUPON_LIST_IP_LIMIT
        )
        if retry:
            raise HTTPException(
                status_code=429, detail="Too many requests",
                headers={"Retry-After": str(retry)}
            )

    # CR-121: resolve restaurant + customer from token or query param
    if auth:
        rid = auth["restaurant_id"]
        customer_id = auth["customer_id"]
    else:
        if not restaurant_id:
            raise HTTPException(status_code=422, detail="restaurant_id required when not authenticated")
        rid = await _resolve_restaurant_id(restaurant_id)
        customer_id = None

    now = datetime.now(timezone.utc).isoformat()
    # CR-106: always exclude pos-only coupons; optionally filter to a specific channel
    ch_filter = {"$in": [channel]} if channel else {"$in": ["dine_in", "delivery", "takeaway"]}
    coupons = await db.coupons.find({
        "user_id": rid,          # CR-121: was auth["restaurant_id"]
        "is_active": True,
        "start_date": {"$lte": now},
        "end_date": {"$gte": now},
        "applicable_channels": ch_filter,  # CR-106
    }, {"_id": 0}).to_list(50)

    eligible = []
    for c in coupons:
        # CR-121 (owner Q4): hide requires_customer=true coupons from anonymous callers
        if not customer_id and c.get("requires_customer", True):
            continue

        # specific_users: only meaningful when we know the diner
        if c.get("specific_users") and customer_id and customer_id not in c["specific_users"]:
            continue

        # per_user_limit: skip DB hit for anonymous — no customer to check against
        if customer_id:
            usage = await db.coupon_usage.count_documents(
                {"coupon_id": c["id"], "customer_id": customer_id}
            )
            if usage >= (c.get("per_user_limit") or 1):  # BUG-034 null-handling preserved
                continue
            c["my_usage_count"] = usage  # only present in authenticated response

        eligible.append(c)

    return _resp(True, f"{len(eligible)} coupons available", {"coupons": eligible})
```

**Line-by-line rationale:**

| Change | Reason |
|---|---|
| Anonymous rate limit block | New — contract spec: 10/min/IP for no-token callers |
| `rid` / `customer_id` resolve block | New — `restaurant_id` no longer guaranteed from JWT |
| `"user_id": rid` in DB query | Replaces `auth["restaurant_id"]` |
| `if not customer_id and c.get("requires_customer", True): continue` | **Owner Q4** — hides standard coupons from anonymous. Default `True` means coupons without the field behave as standard (correct) |
| `specific_users` guard: `and customer_id and` added | Without this guard, `None not in c["specific_users"]` would be `True` → anonymous would incorrectly pass targeted-coupon check |
| `if customer_id:` wrapping the per_user DB query | Avoids querying `coupon_usage` with `customer_id: None` (would match null-customer records incorrectly) |
| `usage >= (c.get("per_user_limit") or 1): continue` | Inverted form of original `usage < limit: include`. Semantically identical. **BUG-034 null-handling (`or 1`) explicitly preserved.** |
| `c["my_usage_count"] = usage` inside `if customer_id:` | `my_usage_count` only emitted when authenticated — anonymous response omits it |

---

## 4. Complete route after all 3 edits

```python
@router.get("/coupons")
async def get_available_coupons(
    channel: Optional[str] = None,
    restaurant_id: Optional[str] = None,    # CR-121
    request: Request = None,                # CR-121
    auth: Optional[dict] = Depends(optional_customer_token),  # CR-121
):  # CR-121
    """List active coupons eligible for this customer or restaurant.
    Token optional: anonymous callers pass restaurant_id as query param instead."""
    if not auth:
        retry = await _lookup_rate_limited(
            f"cl-ip:{_client_ip(request)}", *_COUPON_LIST_IP_LIMIT
        )
        if retry:
            raise HTTPException(status_code=429, detail="Too many requests",
                headers={"Retry-After": str(retry)})

    if auth:
        rid = auth["restaurant_id"]
        customer_id = auth["customer_id"]
    else:
        if not restaurant_id:
            raise HTTPException(status_code=422, detail="restaurant_id required when not authenticated")
        rid = await _resolve_restaurant_id(restaurant_id)
        customer_id = None

    now = datetime.now(timezone.utc).isoformat()
    ch_filter = {"$in": [channel]} if channel else {"$in": ["dine_in", "delivery", "takeaway"]}
    coupons = await db.coupons.find({
        "user_id": rid,
        "is_active": True,
        "start_date": {"$lte": now},
        "end_date": {"$gte": now},
        "applicable_channels": ch_filter,
    }, {"_id": 0}).to_list(50)

    eligible = []
    for c in coupons:
        if not customer_id and c.get("requires_customer", True):
            continue
        if c.get("specific_users") and customer_id and customer_id not in c["specific_users"]:
            continue
        if customer_id:
            usage = await db.coupon_usage.count_documents(
                {"coupon_id": c["id"], "customer_id": customer_id}
            )
            if usage >= (c.get("per_user_limit") or 1):
                continue
            c["my_usage_count"] = usage
        eligible.append(c)

    return _resp(True, f"{len(eligible)} coupons available", {"coupons": eligible})
```

---

## 5. Self-test sequence (run after all 3 edits)

```bash
API_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)

# T1 — anonymous + no restaurant_id → 422
curl -s "$API_URL/api/scan/coupons" | python3 -c "import sys,json; print(json.load(sys.stdin))"
# Expected: 422

# T2 — anonymous + restaurant_id=689 → returns only generic coupons (requires_customer=false)
curl -s "$API_URL/api/scan/coupons?restaurant_id=689" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('count:', len(d['data']['coupons'])); [print(c['code'], c.get('requires_customer','(default=True)')) for c in d['data']['coupons']]"
# Expected: only coupons with requires_customer=false; standard coupons absent

# T3 — anonymous + channel filter
curl -s "$API_URL/api/scan/coupons?restaurant_id=689&channel=dine_in" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('dine_in count:', len(d['data']['coupons']))"

# T4 — authenticated → existing behaviour (my_usage_count present, standard coupons included)
TOKEN=$(curl -s -X POST "$API_URL/api/scan/auth/skip-otp" \
  -H "Content-Type: application/json" \
  -d '{"phone":"9830291686","restaurant_id":"689"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
curl -s "$API_URL/api/scan/coupons" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); coupons=d['data']['coupons']; print('auth count:', len(coupons)); print('has my_usage_count:', all('my_usage_count' in c for c in coupons))"
# Expected: my_usage_count present on all coupons

# T5 — anonymous + bad token → 401
curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/scan/coupons" \
  -H "Authorization: Bearer bad.token.here"
# Expected: 401

# T6 — anonymous rate limit: 11th call
for i in {1..11}; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/scan/coupons?restaurant_id=689" \
    -H "X-Forwarded-For: 192.0.2.99")
  echo "Call $i: $CODE"
done
# Expected: calls 1-10 → 200; call 11 → 429
```

---

## 6. Verification matrix

| V | Case | Expected |
|---|---|---|
| V1 | Anonymous + no `restaurant_id` | `422` |
| V2 | Anonymous + `restaurant_id=689` | Returns only `requires_customer=false` coupons; no `my_usage_count` field on any coupon |
| V3 | Anonymous + `channel=dine_in` | Filtered to dine_in channel |
| V4 | Anonymous + full `restaurant_id=pos_0001_restaurant_689` | Same result as short form |
| V5 | Anonymous rate limit: 11th call/60s same IP | `429` with `Retry-After` |
| V6 | Authenticated — `my_usage_count` present | `my_usage_count` on every returned coupon |
| V7 | Authenticated — standard coupons included | Coupons with `requires_customer=true` appear (not filtered for auth path) |
| V8 | Authenticated — coupon where per_user_limit exhausted | Excluded from list |
| V9 | Bad/expired token | `401` |
| V10 | Authenticated regression: CR-106 channel filter | Same count as today |

---

## 7. Critical correctness checks — authenticated path must be byte-identical to today

The loop rewrite must preserve **exactly** the same behaviour for authenticated callers:

| Behaviour | Original | After rewrite |
|---|---|---|
| `specific_users` check | `if c.get("specific_users") and auth["customer_id"] not in c["specific_users"]` | `if c.get("specific_users") and customer_id and customer_id not in c["specific_users"]` — identical when `customer_id` is not None |
| `per_user_limit` DB query | Always runs | Runs only when `customer_id` — same for auth path |
| Null-limit handling | `(c.get("per_user_limit") or 1)` | Preserved verbatim |
| `my_usage_count` | Set on every included coupon | Set only when `customer_id` — same for auth path |
| Coupon count logic | `usage < limit → include` | `usage >= limit → continue` (logically equivalent) |

---

## 8. QA handover criteria

- [ ] All 6 self-test commands pass
- [ ] V2: anonymous list contains ONLY `requires_customer=false` coupons
- [ ] V6: authenticated list includes `my_usage_count` on every coupon
- [ ] V7: authenticated list includes standard coupons (regression: they must not be filtered)
- [ ] V9: bad token → 401
- [ ] Code markers `# CR-121` present on all 3 edit locations

---

## 9. Rollback

Revert the 3 edits in `scan.py`. No DB change, no schema change, no index change. Nothing to undo outside the file.

---

## 10. Files changed / not changed

**WILL change:**
- `routers/scan.py` — Edit 1 (~line 97), Edit 2 (~lines 467–471), Edit 3 (~lines 472–494)

**WILL NOT change:**
- `core/coupon.py`, `models/schemas.py`, `routers/pos.py`, `routers/customers.py`
- All frontend files, MongoDB collections/indexes, `.env` files

---

```
Planning complete: CR-121
Stage: Impact Analysis (done in combined doc) + Implementation Plan
Code reality: FULL (scan.py:467–494 confirmed)
Risk: LOW–MEDIUM
Edits: 3 edits in routers/scan.py (~25 lines net)
Files WILL change: routers/scan.py only
Files WILL NOT touch: everything else
Owner decisions required: NONE
Self-test: T1–T6 + regression suites
Docs: planning/CR_121_IMPLEMENTATION_PLAN.md
Next: "choose implementation role for CR-121" when owner approves
```
