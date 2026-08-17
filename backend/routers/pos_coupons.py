"""
CR-081: POS Coupon Management API
Eight endpoints for full coupon CRUD + distribute from POS UI.
Auth: verify_pos_auth (X-API-Key).

Endpoints:
  GET    /api/pos/coupons                  C-1 list all coupons
  GET    /api/pos/coupons/{id}             C-2 get single coupon
  POST   /api/pos/coupons                  C-3 create coupon
  PUT    /api/pos/coupons/{id}             C-4 edit coupon
  POST   /api/pos/coupons/{id}/toggle      C-5 activate / deactivate
  DELETE /api/pos/coupons/{id}             C-6 delete (with campaign in-use guard)
  GET    /api/pos/coupons/{id}/usage       C-7 usage history
  POST   /api/pos/coupons/{id}/distribute  C-8 assign to customer (record only — WA Phase 2)

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

    for r in rows:
        cid = r.get("customer_id")
        if cid:
            c = await db.customers.find_one({"id": cid}, {"_id": 0, "name": 1, "phone": 1})
            r["customer_name"]  = c.get("name")  if c else None
            r["customer_phone"] = c.get("phone") if c else None
        else:
            r["customer_name"]  = None
            r["customer_phone"] = None

    total_discount = round(sum(
        float(r.get("coupon_discount") or r.get("discount_applied") or 0) for r in rows
    ), 2)

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
    Assign a coupon to a specific customer. Phase 1: records only.
    Phase 2: WhatsApp coupon_earned notification.
    """
    customer_id = payload.get("customer_id")
    note        = payload.get("note", "")

    if not customer_id:
        return POSResponse(success=False, message="customer_id is required", data=None)

    coupon = await db.coupons.find_one({"id": coupon_id, "user_id": user["id"]}, {"_id": 0})
    if not coupon:
        return POSResponse(success=False, message="Coupon not found", data=None)

    customer = await db.customers.find_one(
        {"id": customer_id, "user_id": user["id"]}, {"_id": 0, "name": 1}
    )
    if not customer:
        return POSResponse(success=False, message="Customer not found", data=None)

    dist_id = str(uuid.uuid4())
    now     = datetime.now(timezone.utc).isoformat()

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
