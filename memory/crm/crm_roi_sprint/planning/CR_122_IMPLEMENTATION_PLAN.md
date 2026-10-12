# CR-122 — Implementation Plan: `GET /scan/coupons` order_total + engine switch + recommendation
**Date**: 2026-10-12 · **Role**: Planning Agent · **Risk**: LOW–MEDIUM · **No code changed. No data written.**
**Impact Analysis**: `planning/CR_122_IMPACT_ANALYSIS.md`

---

## 1. Scope lock

**File that WILL change:** `routers/scan.py` — 3 targeted edits, ~28 lines net.
**Everything else is out of scope.** `core/coupon.py` is NOT touched.

**Implement AFTER CR-121** — CR-121 is the base (optional auth, resolve block). This CR adds `order_total` on top of it. No rebasing needed — CR-121 is already implemented.

---

## 2. Pre-implementation checklist

- [ ] Backend running: `GET /api/health` → 200
- [ ] `backend/.env` points at **preprod**
- [ ] Read `scan.py` lines 22–25 and 468–530 before any edit (already confirmed above)
- [ ] STO- test coupons exist in r689 (created earlier this session) — needed for self-test
- [ ] Pytest suites ready: `tests/test_cr089_skip_otp.py`, `tests/test_cr093_lookup.py`

---

## 3. Edits — in order

### Edit 1 — Import `list_available_coupons`

**File:** `routers/scan.py`
**Location:** line 23

**Before:**
```python
from core.coupon import validate_coupon_for_customer  # CR-105
```

**After:**
```python
from core.coupon import validate_coupon_for_customer, list_available_coupons  # CR-105 · CR-122
```

**Why:** `list_available_coupons` is in `core/coupon.py` (already imported from). Adding to the existing import line — one character change.

---

### Edit 2 — Route signature: add `order_total` param

**File:** `routers/scan.py`
**Location:** lines 468–474

**Before:**
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

**After:**
```python
@router.get("/coupons")
async def get_available_coupons(
    channel: Optional[str] = None,          # CR-106: "dine_in" | "delivery" | "takeaway"
    restaurant_id: Optional[str] = None,    # CR-121: required when no token; ignored when token present
    order_total: Optional[float] = None,    # CR-122: enables server-side applicability filtering + recommendation
    request: Request = None,                # CR-121: needed for anonymous rate limit
    auth: Optional[dict] = Depends(optional_customer_token),  # CR-121: was verify_customer_token
):  # CR-121 · CR-122
    """List active coupons eligible for this customer or restaurant.
    Token optional: anonymous callers pass restaurant_id as query param instead.
    order_total optional: when present, uses list_available_coupons engine for min_order
    filtering, time-window awareness, requires_cart_validation, and recommendation signal."""
```

**Why:** `Optional[float] = None` — existing callers without `order_total` are unaffected (no 422).

---

### Edit 3 — Route body: add engine path

**File:** `routers/scan.py`
**Location:** lines 498–530 (the entire section after the auth/resolve block)

**Before:**
```python
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

**After:**
```python
    # CR-122: engine path — when order_total is provided, use list_available_coupons
    # which handles min_order filtering, time-window awareness, requires_cart_validation,
    # and expected_discount computation. Backward compatible: no order_total → legacy path.
    if order_total is not None:
        eligible = await list_available_coupons(
            db,
            user_id=rid,
            customer_id=customer_id,
            order_total=order_total,
            channel=channel or "dine_in",
        )

        # CR-122: restore my_usage_count for authenticated callers (engine does not include it)
        if customer_id and eligible:
            coupon_ids = [c["id"] for c in eligible]
            usage_pipeline = [
                {"$match": {"customer_id": customer_id, "coupon_id": {"$in": coupon_ids}}},
                {"$group": {"_id": "$coupon_id", "count": {"$sum": 1}}},
            ]
            usage_by_id = {
                row["_id"]: row["count"]
                async for row in db.coupon_usage.aggregate(usage_pipeline)
            }
            for c in eligible:
                c["my_usage_count"] = usage_by_id.get(c["id"], 0)

        # CR-122: pick best simple coupon as recommendation
        simple = [
            c for c in eligible
            if not c.get("requires_cart_validation")
            and (c.get("expected_discount") or 0) > 0
        ]
        best = max(simple, key=lambda c: c["expected_discount"], default=None)

        return _resp(True, f"{len(eligible)} coupons available", {
            "coupons":              eligible,
            "recommended_code":     best["code"] if best else None,
            "recommended_discount": best["expected_discount"] if best else None,
        })

    # Legacy path (no order_total) — unchanged from CR-121, backward compatible
    now = datetime.now(timezone.utc).isoformat()
    # CR-106: always exclude pos-only coupons; optionally filter to a specific channel
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

**Why:**
- `if order_total is not None:` — explicit check; `0.0` is a valid cart total (would filter out all coupons with min_order > 0, which is correct)
- `channel or "dine_in"` — Scan & Order default channel; engine uses it for channel validation inside `validate_coupon_for_customer`
- `my_usage_count` aggregation: one pipeline call vs N `count_documents` per coupon in legacy path — same or better performance
- `recommended_code`: only from non-cart coupons with `expected_discount > 0` — BXGY excluded (their `expected_discount` is `null`)
- Legacy path: copy-pasted verbatim, unchanged (CR-121 comments kept)

---

## 4. Complete route after all 3 edits

```python
from core.coupon import validate_coupon_for_customer, list_available_coupons  # E1

@router.get("/coupons")
async def get_available_coupons(
    channel: Optional[str] = None,
    restaurant_id: Optional[str] = None,    # CR-121
    order_total: Optional[float] = None,    # CR-122
    request: Request = None,               # CR-121
    auth: Optional[dict] = Depends(optional_customer_token),
):  # CR-121 · CR-122
    # rate-limit + resolve (CR-121 — unchanged) ...

    if order_total is not None:            # E3 — engine path
        eligible = await list_available_coupons(
            db, user_id=rid, customer_id=customer_id,
            order_total=order_total, channel=channel or "dine_in",
        )
        if customer_id and eligible:       # my_usage_count aggregation
            ...
        best = max([c for c in eligible   # recommendation
                    if not c.get("requires_cart_validation")
                    and (c.get("expected_discount") or 0) > 0],
                   key=lambda c: c["expected_discount"], default=None)
        return _resp(..., {
            "coupons": eligible,
            "recommended_code": best["code"] if best else None,
            "recommended_discount": best["expected_discount"] if best else None,
        })

    # Legacy path (no order_total) — CR-121 unchanged
    ...
    return _resp(..., {"coupons": eligible})
```

---

## 5. Self-test sequence

```bash
API_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)

# T1 — order_total=96: STO-GENERIC-MIN (min ₹300) must be excluded; STO-GENERIC-10 included
R=$(curl -s "$API_URL/api/scan/coupons?restaurant_id=689&order_total=96")
python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
codes=[c['code'] for c in d['coupons']]
print('T1 order_total=96:')
print('  STO-GENERIC-MIN present:', 'STO-GENERIC-MIN' in codes, '(must be False)')
print('  STO-GENERIC-10 present:', 'STO-GENERIC-10' in codes, '(must be True)')
print('  recommended_code:', d.get('recommended_code'))
" <<< "$R"

# T2 — order_total=960: BXGY requires_cart_validation=true, expected_discount=null
R2=$(curl -s "$API_URL/api/scan/coupons?restaurant_id=689&order_total=960")
python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
bxgy=[c for c in d['coupons'] if c.get('offer_type') in ('bxg','bogo','nth_item')]
print('T2 order_total=960:')
for c in bxgy[:3]:
    print(f'  {c[\"code\"]}: requires_cart={c.get(\"requires_cart_validation\")} expected_disc={c.get(\"expected_discount\")}')
print('  recommended_code:', d.get('recommended_code'))
print('  recommended_discount:', d.get('recommended_discount'))
" <<< "$R2"

# T3 — no order_total: backward compat; no recommended_code in response
R3=$(curl -s "$API_URL/api/scan/coupons?restaurant_id=689")
python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
has_rec='recommended_code' in d
print('T3 no order_total: has recommended_code='+str(has_rec)+' (must be False)')
print('  coupon count:', len(d['coupons']))
" <<< "$R3"

# T4 — authenticated + order_total: my_usage_count present on all coupons
TOKEN=$(curl -s -X POST "$API_URL/api/scan/auth/skip-otp" \
  -H "Content-Type: application/json" \
  -d '{"phone":"9830291686","restaurant_id":"689"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
R4=$(curl -s "$API_URL/api/scan/coupons?order_total=960" -H "Authorization: Bearer $TOKEN")
python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
all_usage=all('my_usage_count' in c for c in d['coupons'])
print('T4 auth+order_total: my_usage_count on all='+str(all_usage)+' count='+str(len(d['coupons'])))
print('  recommended_code:', d.get('recommended_code'))
" <<< "$R4"

# T5 — order_total=0: all min_order coupons excluded
R5=$(curl -s "$API_URL/api/scan/coupons?restaurant_id=689&order_total=0")
python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
# all returned coupons must have min_order_value=0
bad=[c['code'] for c in d['coupons'] if (c.get('min_order_value') or 0) > 0]
print('T5 order_total=0: coupons with min_order>0 remaining:', bad, '(must be empty)')
" <<< "$R5"
```

---

## 6. Verification matrix

| V | Case | Expected |
|---|---|---|
| V1 | `?order_total=96` — `STO-GENERIC-MIN` (min ₹300) | Excluded |
| V2 | `?order_total=96` — `STO-GENERIC-10` (min ₹0) | Included, `expected_discount: 9.6` |
| V3 | `?order_total=960` — any BXGY/BOGO coupon | `requires_cart_validation: true`, `expected_discount: null` |
| V4 | `?order_total=960` — time-window coupon outside hours | Included with `time_window.within_window_now: false` |
| V5 | `?order_total=960` — `recommended_code` | Code with highest `expected_discount` among simple coupons |
| V6 | No `order_total` (authenticated) | Response identical to pre-CR-122; no `recommended_code` key; `my_usage_count` present |
| V7 | No `order_total` (anonymous) | Response identical to pre-CR-122; no `recommended_code` key |
| V8 | `?order_total=0` | All coupons with `min_order_value > 0` excluded |
| V9 | `?order_total=960` + authenticated | `my_usage_count` present on all coupons |
| V10 | `?order_total=960` + anonymous | No `my_usage_count` field on any coupon |
| V11 | `?order_total=960` — no applicable simple coupon | `recommended_code: null`, `recommended_discount: null` |

---

## 7. QA handover criteria

- [ ] V1–V5 self-test curls PASS
- [ ] V6–V7 backward compat confirmed (no `recommended_code` key when no `order_total`)
- [ ] V9: `my_usage_count` present on all authenticated coupons
- [ ] V10: no `my_usage_count` when anonymous
- [ ] Pytest regression suites PASS
- [ ] Code markers `# CR-122` present on all 3 edit locations

---

## 8. Rollback

Revert 3 edits in `scan.py`. No DB change, no schema change, no index change.

---

## 9. Files changed / not changed

**WILL change:**
- `routers/scan.py` — Edit 1 (line 23), Edit 2 (lines 468–474), Edit 3 (lines 498–530)

**WILL NOT change:**
- `core/coupon.py` — used as-is, zero change
- `models/schemas.py`, `routers/pos.py`, `routers/customers.py`
- All frontend files, MongoDB collections/indexes, `.env` files

---

```
Planning complete: CR-122
Stage: Impact Analysis (done) + Implementation Plan
Code reality: FULL (scan.py:22–530 confirmed)
Risk: LOW–MEDIUM
Edits: 3 edits in routers/scan.py (~28 lines net)
Files WILL change: routers/scan.py only
Files WILL NOT touch: everything else (especially core/coupon.py)
Owner decisions: ALL LOCKED
Self-test: T1–T5 curl
Docs: planning/CR_122_IMPLEMENTATION_PLAN.md
Next: "choose implementation role for CR-122" when owner approves
```
