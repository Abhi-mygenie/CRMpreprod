from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime, timezone
import uuid
import asyncio

from core.database import db
from core.auth import get_current_user
from core.whatsapp import trigger_whatsapp_event, trigger_points_earned_event
from models.schemas import Coupon, CouponCreate, CouponUpdate

router = APIRouter(prefix="/coupons", tags=["Coupons"])

@router.post("", response_model=Coupon)
async def create_coupon(coupon_data: CouponCreate, user: dict = Depends(get_current_user)):
    existing = await db.coupons.find_one({"user_id": user["id"], "code": coupon_data.code.upper()})
    if existing:
        raise HTTPException(status_code=400, detail="Coupon code already exists")
    
    coupon_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    coupon_doc = {
        "id": coupon_id,
        "user_id": user["id"],
        "code": coupon_data.code.upper(),
        "discount_type": coupon_data.discount_type,
        "discount_value": coupon_data.discount_value,
        "start_date": coupon_data.start_date,
        "end_date": coupon_data.end_date,
        "usage_limit": coupon_data.usage_limit,
        "per_user_limit": coupon_data.per_user_limit,
        "min_order_value": coupon_data.min_order_value,
        "max_discount": coupon_data.max_discount,
        "specific_users": coupon_data.specific_users,
        "applicable_channels": coupon_data.applicable_channels,
        "description": coupon_data.description,
        "is_active": True,
        "total_used": 0,
        "created_at": now
    }
    
    await db.coupons.insert_one(coupon_doc)
    return Coupon(**coupon_doc)

@router.get("", response_model=List[Coupon])
async def list_coupons(active_only: bool = False, user: dict = Depends(get_current_user)):
    query = {"user_id": user["id"]}
    if active_only:
        query["is_active"] = True
    
    coupons = await db.coupons.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [Coupon(**c) for c in coupons]

@router.get("/{coupon_id}", response_model=Coupon)
async def get_coupon(coupon_id: str, user: dict = Depends(get_current_user)):
    coupon = await db.coupons.find_one({"id": coupon_id, "user_id": user["id"]}, {"_id": 0})
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found")
    return Coupon(**coupon)

@router.put("/{coupon_id}", response_model=Coupon)
async def update_coupon(coupon_id: str, coupon_data: CouponUpdate, user: dict = Depends(get_current_user)):
    coupon = await db.coupons.find_one({"id": coupon_id, "user_id": user["id"]})
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found")
    
    update_data = {k: v for k, v in coupon_data.model_dump().items() if v is not None}
    if "code" in update_data:
        update_data["code"] = update_data["code"].upper()
        existing = await db.coupons.find_one({
            "user_id": user["id"], 
            "code": update_data["code"],
            "id": {"$ne": coupon_id}
        })
        if existing:
            raise HTTPException(status_code=400, detail="Coupon code already exists")
    
    if update_data:
        await db.coupons.update_one({"id": coupon_id}, {"$set": update_data})
    
    updated = await db.coupons.find_one({"id": coupon_id}, {"_id": 0})
    return Coupon(**updated)

@router.delete("/{coupon_id}")
async def delete_coupon(coupon_id: str, user: dict = Depends(get_current_user)):
    result = await db.coupons.delete_one({"id": coupon_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Coupon not found")
    await db.coupon_usage.delete_many({"coupon_id": coupon_id})
    return {"message": "Coupon deleted"}

@router.post("/{coupon_id}/toggle")
async def toggle_coupon(coupon_id: str, user: dict = Depends(get_current_user)):
    coupon = await db.coupons.find_one({"id": coupon_id, "user_id": user["id"]})
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found")
    
    new_status = not coupon.get("is_active", True)
    await db.coupons.update_one({"id": coupon_id}, {"$set": {"is_active": new_status}})
    return {"is_active": new_status}

@router.post("/validate")
async def validate_coupon(
    code: str,
    customer_id: str,
    order_value: float,
    channel: str,
    user: dict = Depends(get_current_user)
):
    coupon = await db.coupons.find_one({
        "user_id": user["id"],
        "code": code.upper(),
        "is_active": True
    }, {"_id": 0})
    
    if not coupon:
        raise HTTPException(status_code=404, detail="Invalid coupon code")
    
    now = datetime.now(timezone.utc).isoformat()
    
    if coupon["start_date"] > now:
        raise HTTPException(status_code=400, detail="Coupon not yet active")
    if coupon["end_date"] < now:
        raise HTTPException(status_code=400, detail="Coupon has expired")
    
    if coupon.get("usage_limit") and coupon.get("total_used", 0) >= coupon["usage_limit"]:
        raise HTTPException(status_code=400, detail="Coupon usage limit reached")
    
    user_usage = await db.coupon_usage.count_documents({
        "coupon_id": coupon["id"],
        "customer_id": customer_id
    })
    if user_usage >= coupon.get("per_user_limit", 1):
        raise HTTPException(status_code=400, detail="You have already used this coupon")
    
    if order_value < coupon.get("min_order_value", 0):
        raise HTTPException(
            status_code=400, 
            detail=f"Minimum order value is Rs.{coupon['min_order_value']}"
        )
    
    if channel not in coupon.get("applicable_channels", []):
        raise HTTPException(status_code=400, detail="Coupon not valid for this order type")
    
    if coupon.get("specific_users") and customer_id not in coupon["specific_users"]:
        raise HTTPException(status_code=400, detail="Coupon not valid for this customer")
    
    if coupon["discount_type"] == "percentage":
        discount = (order_value * coupon["discount_value"]) / 100
        if coupon.get("max_discount"):
            discount = min(discount, coupon["max_discount"])
    else:
        discount = min(coupon["discount_value"], order_value)
    
    return {
        "valid": True,
        "coupon": Coupon(**coupon),
        "discount": round(discount, 2),
        "final_amount": round(order_value - discount, 2)
    }

@router.post("/apply")
async def apply_coupon(
    code: str,
    customer_id: str,
    order_value: float,
    channel: str,
    user: dict = Depends(get_current_user)
):
    validation = await validate_coupon(code, customer_id, order_value, channel, user)
    
    coupon = await db.coupons.find_one({"user_id": user["id"], "code": code.upper()})
    
    usage_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    usage_doc = {
        "id": usage_id,
        "coupon_id": coupon["id"],
        "customer_id": customer_id,
        "order_value": order_value,
        "discount_applied": validation["discount"],
        "channel": channel,
        "used_at": now
    }
    
    await db.coupon_usage.insert_one(usage_doc)
    
    await db.coupons.update_one(
        {"id": coupon["id"]},
        {"$inc": {"total_used": 1}}
    )
    
    # Fire coupon_earned WhatsApp trigger
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]})
    if customer:
        asyncio.create_task(trigger_whatsapp_event(
            db, user["id"], "coupon_earned", customer,
            {
                "coupon_code": code.upper(),
                "discount": validation["discount"],
                "discount_type": coupon.get("discount_type"),
                "discount_value": coupon.get("discount_value")
            }
        ))
        # Also fires points_earned for coupon
        asyncio.create_task(trigger_points_earned_event(
            db, user["id"], customer, 0, "coupon_earned", customer.get("total_points", 0)
        ))
    
    return {
        "success": True,
        "discount": validation["discount"],
        "final_amount": validation["final_amount"],
        "usage_id": usage_id
    }

@router.get("/{coupon_id}/usage")
async def get_coupon_usage(coupon_id: str, user: dict = Depends(get_current_user)):
    coupon = await db.coupons.find_one({"id": coupon_id, "user_id": user["id"]})
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found")
    
    usage = await db.coupon_usage.find({"coupon_id": coupon_id}, {"_id": 0}).sort("used_at", -1).to_list(100)
    
    for u in usage:
        customer = await db.customers.find_one({"id": u["customer_id"]}, {"_id": 0, "name": 1, "phone": 1})
        if customer:
            u["customer_name"] = customer.get("name")
            u["customer_phone"] = customer.get("phone")
    
    return {
        "coupon": Coupon(**coupon),
        "usage": usage,
        "total_discount_given": sum(u["discount_applied"] for u in usage)
    }
