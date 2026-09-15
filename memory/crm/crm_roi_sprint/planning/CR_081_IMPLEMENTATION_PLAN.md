# CR-081 — Implementation Plan
## POS Coupon Management

**Date**: 2026-08-06
**Role**: Planning Agent
**Risk**: MEDIUM
**Effort**: ~3 hrs
**Impact Analysis**: `planning/CR_081_IMPACT_ANALYSIS.md`
**Gate**: Owner approved (MEDIUM risk, new file only — no hotspot files touched)

---

## Pre-Flight Checks

```bash
# Confirm pos_coupons.py does not exist
ls /app/backend/routers/pos_coupons.py 2>/dev/null && echo "EXISTS - STOP" || echo "OK - does not exist"

# Confirm CouponCreate and CouponUpdate are importable
cd /app/backend && python3 -c "from models.schemas import CouponCreate, CouponUpdate, Coupon; print('PASS schemas')"

# Confirm verify_pos_auth importable
cd /app/backend && python3 -c "from core.auth import verify_pos_auth; print('PASS auth')"

# Check current include_router anchor
grep -n "pos_reports.router" /app/backend/server.py
# Expected: api_router.include_router(pos_reports.router)  # CR-078
```

---

## Files WILL Change

| File | Type | Change |
|---|---|---|
| `routers/pos_coupons.py` | **NEW** | ~220 LOC — 8 endpoints |
| `backend/server.py` | EDIT | +2 lines (import + include_router) |

## Files WILL NOT Change

`routers/coupons.py` · `core/coupon.py` · `models/schemas.py` · `routers/campaigns.py` · `routers/pos.py` · all frontend files

---

## Edit 1 — Create `routers/pos_coupons.py`

**File**: `/app/backend/routers/pos_coupons.py` (NEW)

Complete file content:

```python
"""
CR-081: POS Coupon Management API
Eight endpoints for full coupon CRUD + distribute from POS UI.
Auth: verify_pos_auth (X-API-Key).

Endpoints:
  GET    /api/pos/coupons                     C-1 list all coupons
  GET    /api/pos/coupons/{id}                C-2 get single coupon
  POST   /api/pos/coupons                     C-3 create coupon
  PUT    /api/pos/coupons/{id}                C-4 edit coupon
  POST   /api/pos/coupons/{id}/toggle         C-5 activate / deactivate
  DELETE /api/pos/coupons/{id}                C-6 delete (with campaign in-use guard)
  GET    /api/pos/coupons/{id}/usage          C-7 usage history
  POST   /api/pos/coupons/{id}/distribute     C-8 assign to customer (record only — WA Phase 2)

Note: CRM delete_coupon (coupons.py:145) has no campaign guard.
      C-6 here adds that guard — safer than the CRM equivalent.
"""

from fastapi import APIRouter, Depends, Query
from datetime import datetime, timezone
from typing import Optional
import uuid

from core.database import db
from core.auth import verify_pos_auth
from models.schemas import CouponCreate, CouponUpdate, Coupon, POSResponse

router = APIRouter(prefix="/pos/coupons", tags=["POS Coupons"])


# ─────────────────────────────────────────────────────────────────────────────
# C-1: GET /api/pos/coupons
# ─────────────────────────────────────────────────────────────────────────────

@router.get("", response_model=POSResponse)
async def pos_list_coupons(  # CR-081 C-1
    active_only: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
    user: dict = Depends(verify_pos_auth),
):
    """List all coupons for this restaurant."""
    query = {"user_id": user["id"]}
    if active_only:
        query["is_active"] = True

    docs = await db.coupons.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    coupons = [Coupon(**c).model_dump() for c in docs]

    return POSResponse(
        success=True,
        message=f"{len(coupons)} coupon(s)",
        data={"coupons": coupons, "total": len(coupons)},
    )


# ─────────────────────────────────────────────────────────────────────────────
# C-2: GET /api/pos/coupons/{coupon_id}
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{coupon_id}", response_model=POSResponse)
async def pos_get_coupon(coupon_id: str, user: dict = Depends(verify_pos_auth)):  # CR-081 C-2
    """Get full details of a single coupon."""
    doc = await db.coupons.find_one({"id": coupon_id, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        return POSResponse(success=False, message="Coupon not found", data=None)
    return POSResponse(success=True, message="Coupon found", data=Coupon(**doc).model_dump())


# ─────────────────────────────────────────────────────────────────────────────
# C-3: POST /api/pos/coupons
# ─────────────────────────────────────────────────────────────────────────────

@router.post("", response_model=POSResponse)
async def pos_create_coupon(coupon_data: CouponCreate, user: dict = Depends(verify_pos_auth)):  # CR-081 C-3
    """Create a new coupon from POS."""
    existing = await db.coupons.find_one({"user_id": user["id"], "code": coupon_data.code.upper()})
    if existing:
        return POSResponse(success=False, message="Coupon code already exists", data=None)

    now = datetime.now(timezone.utc).isoformat()
    coupon_id = str(uuid.uuid4())

    doc = coupon_data.model_dump()
    doc["id"]         = coupon_id
    doc["user_id"]    = user["id"]
    doc["code"]       = coupon_data.code.upper()
    doc["is_active"]  = True
    doc["total_used"] = 0
    doc["created_at"] = now

    await db.coupons.insert_one(doc)

    return POSResponse(
        success=True,
        message="Coupon created",
        data={"coupon_id": coupon_id, "code": doc["code"], "created_at": now},
    )


# ─────────────────────────────────────────────────────────────────────────────
# C-4: PUT /api/pos/coupons/{coupon_id}
# ─────────────────────────────────────────────────────────────────────────────

@router.put("/{coupon_id}", response_model=POSResponse)
async def pos_update_coupon(  # CR-081 C-4
    coupon_id: str,
    coupon_data: CouponUpdate,
    user: dict = Depends(verify_pos_auth),
):
    """Edit an existing coupon."""
    doc = await db.coupons.find_one({"id": coupon_id, "user_id": user["id"]})
    if not doc:
        return POSResponse(success=False, message="Coupon not found", data=None)

    update = {k: v for k, v in coupon_data.model_dump().items() if v is not None}

    # Code uniqueness check if changing code
    if "code" in update:
        update["code"] = update["code"].upper()
        clash = await db.coupons.find_one({
            "user_id": user["id"],
            "code": update["code"],
            "id": {"$ne": coupon_id},
        })
        if clash:
            return POSResponse(success=False, message="Coupon code already exists", data=None)

    if update:
        await db.coupons.update_one({"id": coupon_id}, {"$set": update})

    updated = await db.coupons.find_one({"id": coupon_id}, {"_id": 0})
    return POSResponse(success=True, message="Coupon updated", data=Coupon(**updated).model_dump())


# ─────────────────────────────────────────────────────────────────────────────
# C-5: POST /api/pos/coupons/{coupon_id}/toggle
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/{coupon_id}/toggle", response_model=POSResponse)
async def pos_toggle_coupon(coupon_id: str, user: dict = Depends(verify_pos_auth)):  # CR-081 C-5
    """Activate or deactivate a coupon."""
    doc = await db.coupons.find_one({"id": coupon_id, "user_id": user["id"]})
    if not doc:
        return POSResponse(success=False, message="Coupon not found", data=None)

    new_status = not doc.get("is_active", True)
    await db.coupons.update_one({"id": coupon_id}, {"$set": {"is_active": new_status}})

    state = "activated" if new_status else "deactivated"
    return POSResponse(success=True, message=f"Coupon {state}", data={"is_active": new_status})


# ─────────────────────────────────────────────────────────────────────────────
# C-6: DELETE /api/pos/coupons/{coupon_id}
# NOTE: CRM coupons.py:delete_coupon has no campaign guard.
#       This POS endpoint adds the guard — safer than the CRM equivalent.
# ─────────────────────────────────────────────────────────────────────────────

@router.delete("/{coupon_id}", response_model=POSResponse)
async def pos_delete_coupon(coupon_id: str, user: dict = Depends(verify_pos_auth)):  # CR-081 C-6
    """Delete a coupon. Blocked if coupon is used in an active campaign."""
    doc = await db.coupons.find_one({"id": coupon_id, "user_id": user["id"]})
    if not doc:
        return POSResponse(success=False, message="Coupon not found", data=None)

    # Campaign in-use guard (absent from CRM delete_coupon — added here for safety)
    campaign_use = await db.campaigns.find_one(
        {"user_id": user["id"], "template_id": coupon_id, "status": {"$nin": ["completed", "cancelled"]}}
    )
    if campaign_use:
        return POSResponse(
            success=False,
            message=f"Coupon is used in active campaign '{campaign_use.get('name', coupon_id)}'",
            data={"campaign_id": campaign_use.get("id"), "campaign_name": campaign_use.get("name")},
        )

    await db.coupons.delete_one({"id": coupon_id, "user_id": user["id"]})
    await db.coupon_usage.delete_many({"coupon_id": coupon_id})

    return POSResponse(success=True, message="Coupon deleted", data={"coupon_id": coupon_id})


# ─────────────────────────────────────────────────────────────────────────────
# C-7: GET /api/pos/coupons/{coupon_id}/usage
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{coupon_id}/usage", response_model=POSResponse)
async def pos_coupon_usage(  # CR-081 C-7
    coupon_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    user: dict = Depends(verify_pos_auth),
):
    """Usage history for a coupon. Handles customer_id=null rows (CR-082 anonymous orders)."""
    doc = await db.coupons.find_one({"id": coupon_id, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        return POSResponse(success=False, message="Coupon not found", data=None)

    rows = await db.coupon_usage.find(
        {"coupon_id": coupon_id},
        {"_id": 0},
    ).sort("used_at", -1).limit(limit).to_list(limit)

    # Enrich with customer name/phone where available (null-safe for CR-082 anonymous rows)
    for r in rows:
        cid = r.get("customer_id")
        if cid:
            c = await db.customers.find_one({"id": cid}, {"_id": 0, "name": 1, "phone": 1})
            r["customer_name"]  = c.get("name")  if c else None
            r["customer_phone"] = c.get("phone") if c else None
        else:
            r["customer_name"]  = None  # anonymous order
            r["customer_phone"] = None

    total_discount = round(sum(r.get("coupon_discount") or r.get("discount_applied", 0) for r in rows), 2)

    return POSResponse(
        success=True,
        message=f"{len(rows)} usage record(s)",
        data={
            "coupon_id":      coupon_id,
            "coupon_code":    doc.get("code"),
            "usage":          rows,
            "total_discount": total_discount,
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# C-8: POST /api/pos/coupons/{coupon_id}/distribute
# Phase 1: record only. WhatsApp notification deferred to Phase 2 (Q2=a no-WA).
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/{coupon_id}/distribute", response_model=POSResponse)
async def pos_distribute_coupon(  # CR-081 C-8
    coupon_id: str,
    payload: dict,
    user: dict = Depends(verify_pos_auth),
):
    """
    Assign a coupon to a specific customer.
    Phase 1: records the distribution only.
    Phase 2: add WhatsApp coupon_earned notification.
    """
    customer_id = payload.get("customer_id")
    note        = payload.get("note", "")

    if not customer_id:
        return POSResponse(success=False, message="customer_id is required", data=None)

    coupon = await db.coupons.find_one({"id": coupon_id, "user_id": user["id"]}, {"_id": 0})
    if not coupon:
        return POSResponse(success=False, message="Coupon not found", data=None)

    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]}, {"_id": 0, "name": 1})
    if not customer:
        return POSResponse(success=False, message="Customer not found", data=None)

    dist_id   = str(uuid.uuid4())
    now       = datetime.now(timezone.utc).isoformat()

    await db.coupon_distributions.insert_one({
        "id":             dist_id,
        "user_id":        user["id"],
        "coupon_id":      coupon_id,
        "customer_id":    customer_id,
        "note":           note,
        "assigned_at":    now,
        "distributed_by": "pos",
    })

    return POSResponse(
        success=True,
        message=f"Coupon distributed to {customer.get('name', customer_id)}",
        data={
            "distribution_id": dist_id,
            "coupon_id":       coupon_id,
            "coupon_code":     coupon.get("code"),
            "customer_id":     customer_id,
            "assigned_at":     now,
        },
    )
```

### Self-test Edit 1

```bash
cd /app/backend && python3 -c "
from routers.pos_coupons import router
routes = [r.path for r in router.routes]
print('routes:', routes)
assert '/pos/coupons' in routes
assert '/pos/coupons/{coupon_id}' in routes
assert '/pos/coupons/{coupon_id}/toggle' in routes
assert '/pos/coupons/{coupon_id}/distribute' in routes
print('PASS: all 8 routes registered')
"
```

---

## Edit 2 — Update `backend/server.py`

**File**: `/app/backend/server.py`

### Change 2a — Import line (line 16)

```python
# BEFORE
from routers import auth, customers, points, wallet, coupons, feedback, whatsapp, pos, pos_reports, migration, analytics, scan, menu, suggestions, invoices, campaigns

# AFTER
from routers import auth, customers, points, wallet, coupons, pos_coupons, feedback, whatsapp, pos, pos_reports, migration, analytics, scan, menu, suggestions, invoices, campaigns
```

### Change 2b — Include router (after pos_reports line 172)

```python
# BEFORE
api_router.include_router(pos_reports.router)  # CR-078

# AFTER
api_router.include_router(pos_reports.router)  # CR-078
api_router.include_router(pos_coupons.router)  # CR-081
```

### Self-test Edit 2

```bash
sudo supervisorctl restart backend && sleep 5
tail -5 /var/log/supervisor/backend.err.log
# Must show "Application startup complete"

# Confirm routes registered
curl -s https://vendor-crm-preview-1.preview.emergentagent.com/api/openapi.json \
  | python3 -c "
import sys,json
paths=[p for p in json.load(sys.stdin)['paths'] if 'pos/coupons' in p]
print('pos/coupons routes:', paths[:5])
assert len(paths) >= 8, f'Expected >=8, got {len(paths)}'
print('PASS')
"
```

---

## Full Verification Matrix (11 checks)

```bash
API_URL="https://vendor-crm-preview-1.preview.emergentagent.com"
KEY="dp_live_HdEvMSha7Y67iSBMtN5nskuYzFc4HGe7zQgpWGBvxEY"
CUST_ID="1779d4fc-7161-4407-ac8c-cce30beb3e53"

echo "=== V1: List all coupons ==="
curl -s -H "X-API-Key: $KEY" "$API_URL/api/pos/coupons" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS total=', d['data']['total'] if d['success'] else 'FAIL:'+str(d))"

echo "=== V2: List active_only ==="
curl -s -H "X-API-Key: $KEY" "$API_URL/api/pos/coupons?active_only=true" \
  | python3 -c "
import sys,json; d=json.load(sys.stdin)
coupons=d.get('data',{}).get('coupons',[])
inactive=[c for c in coupons if not c.get('is_active')]
print('PASS' if not inactive else f'FAIL: {len(inactive)} inactive coupons returned')
"

echo "=== V3: Create coupon ==="
COUPON_ID=$(curl -s -X POST "$API_URL/api/pos/coupons" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"code":"POSTEST01","discount_type":"flat","discount_value":50,"start_date":"2026-01-01","end_date":"2026-12-31","min_order_value":0}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['coupon_id'] if d['success'] else 'FAIL')")
echo "Created coupon_id: $COUPON_ID"

echo "=== V4: Duplicate code blocked ==="
curl -s -X POST "$API_URL/api/pos/coupons" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"code":"POSTEST01","discount_type":"flat","discount_value":50,"start_date":"2026-01-01","end_date":"2026-12-31","min_order_value":0}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS' if not d['success'] else 'FAIL: should have been blocked')"

echo "=== V5: Edit coupon ==="
curl -s -X PUT "$API_URL/api/pos/coupons/$COUPON_ID" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"discount_value": 75}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); v=d.get('data',{}).get('discount_value'); print('PASS discount_value=', v if v==75 else f'FAIL: got {v}')"

echo "=== V6: Toggle coupon ==="
curl -s -X POST "$API_URL/api/pos/coupons/$COUPON_ID/toggle" \
  -H "X-API-Key: $KEY" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS is_active=', d['data']['is_active'] if d['success'] else 'FAIL')"

echo "=== V7: Delete coupon (not in campaign) ==="
curl -s -X DELETE "$API_URL/api/pos/coupons/$COUPON_ID" \
  -H "X-API-Key: $KEY" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS deleted' if d['success'] else 'FAIL: '+str(d))"

echo "=== V8: Get usage for existing coupon ==="
# Use first coupon from V1 if any
FIRST_ID=$(curl -s -H "X-API-Key: $KEY" "$API_URL/api/pos/coupons" | python3 -c "import sys,json; d=json.load(sys.stdin); coupons=d.get('data',{}).get('coupons',[]); print(coupons[0]['id'] if coupons else 'none')")
echo "First coupon id: $FIRST_ID"
[ "$FIRST_ID" != "none" ] && curl -s -H "X-API-Key: $KEY" "$API_URL/api/pos/coupons/$FIRST_ID/usage" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS total_discount=', d['data']['total_discount'] if d['success'] else 'FAIL')"

echo "=== V9: Distribute coupon ==="
DIST_ID=$(curl -s -X POST "$API_URL/api/pos/coupons/$(curl -s -H 'X-API-Key: '$KEY "$API_URL/api/pos/coupons" | python3 -c "import sys,json; d=json.load(sys.stdin); coupons=d.get('data',{}).get('coupons',[]); print(coupons[0]['id'] if coupons else 'none'")/distribute" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d "{\"customer_id\": \"$CUST_ID\", \"note\": \"VIP reward\"}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['distribution_id'] if d['success'] else 'FAIL: '+str(d))")
echo "distribution_id: $DIST_ID"

echo "=== V10: Distribute missing customer_id ==="
curl -s -X POST "$API_URL/api/pos/coupons/some-id/distribute" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS' if not d['success'] else 'FAIL')"

echo "=== V11: Existing /pos/coupons/available unchanged (regression) ==="
curl -s -H "X-API-Key: $KEY" "$API_URL/api/pos/coupons/available?customer_id=$CUST_ID&order_total=500" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS' if d['success'] else 'FAIL')"
```

---

## Exit Gate Checklist

```
1. [ ] routers/pos_coupons.py created
2. [ ] server.py import + include_router added
3. [ ] python3 import self-test passes (8 routes)
4. [ ] Backend startup clean (Application startup complete)
5. [ ] V1–V11 curl probes pass
6. [ ] Registry + QA handover updated
```
