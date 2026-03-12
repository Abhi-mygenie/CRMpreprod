from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from typing import List
from datetime import datetime, timezone, timedelta
import uuid
import asyncio

from core.database import db
from core.auth import get_current_user
from core.helpers import calculate_tier, get_earn_percent_for_tier
from core.whatsapp import trigger_whatsapp_event, trigger_points_earned_event
from models.schemas import (
    PointsTransaction, PointsTransactionCreate,
    LoyaltySettings, LoyaltySettingsUpdate
)

router = APIRouter(prefix="/points", tags=["Points"])
loyalty_router = APIRouter(prefix="/loyalty", tags=["Loyalty Settings"])

@router.post("/transaction", response_model=PointsTransaction)
async def create_points_transaction(tx_data: PointsTransactionCreate, user: dict = Depends(get_current_user), background_tasks: BackgroundTasks = None):
    customer = await db.customers.find_one({"id": tx_data.customer_id, "user_id": user["id"]})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    if not settings:
        settings = {"tier_bronze_min": 0, "tier_silver_min": 500, "tier_gold_min": 1500, "tier_platinum_min": 5000}
    
    current_points = customer.get("total_points", 0)
    old_tier = customer.get("tier", "Bronze")
    
    if tx_data.transaction_type == "redeem":
        if current_points < tx_data.points:
            raise HTTPException(status_code=400, detail="Insufficient points")
        new_balance = current_points - tx_data.points
    else:
        new_balance = current_points + tx_data.points
    
    new_tier = calculate_tier(new_balance, settings)
    
    update_data = {
        "total_points": new_balance,
        "tier": new_tier,
        "last_visit": datetime.now(timezone.utc).isoformat()
    }
    
    if tx_data.transaction_type == "earn" and tx_data.bill_amount:
        update_data["total_spent"] = customer.get("total_spent", 0) + tx_data.bill_amount
        update_data["total_visits"] = customer.get("total_visits", 0) + 1
    
    await db.customers.update_one({"id": tx_data.customer_id}, {"$set": update_data})
    
    tx_id = str(uuid.uuid4())
    tx_doc = {
        "id": tx_id,
        "user_id": user["id"],
        "customer_id": tx_data.customer_id,
        "points": tx_data.points,
        "transaction_type": tx_data.transaction_type,
        "description": tx_data.description,
        "bill_amount": tx_data.bill_amount,
        "balance_after": new_balance,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.points_transactions.insert_one(tx_doc)
    
    # Update customer with new balance for trigger
    updated_customer = {**customer, "total_points": new_balance, "tier": new_tier}
    
    # Fire WhatsApp triggers based on transaction type
    if tx_data.transaction_type == "redeem":
        # points_redeemed trigger
        asyncio.create_task(trigger_whatsapp_event(
            db, user["id"], "points_redeemed", updated_customer,
            {"points_redeemed": tx_data.points, "points_balance": new_balance}
        ))
    elif tx_data.transaction_type == "bonus":
        # bonus_points trigger (also fires points_earned)
        asyncio.create_task(trigger_whatsapp_event(
            db, user["id"], "bonus_points", updated_customer,
            {"bonus_points": tx_data.points, "points_balance": new_balance}
        ))
        asyncio.create_task(trigger_points_earned_event(
            db, user["id"], updated_customer, tx_data.points, "bonus", new_balance
        ))
    
    # Check for tier upgrade
    if new_tier != old_tier and _tier_rank(new_tier) > _tier_rank(old_tier):
        asyncio.create_task(trigger_whatsapp_event(
            db, user["id"], "tier_upgrade", updated_customer,
            {"old_tier": old_tier, "new_tier": new_tier, "points_balance": new_balance}
        ))
    
    return PointsTransaction(**tx_doc)


def _tier_rank(tier: str) -> int:
    """Get tier rank for comparison"""
    ranks = {"Bronze": 1, "Silver": 2, "Gold": 3, "Platinum": 4}
    return ranks.get(tier, 0)

@router.get("/transactions/{customer_id}", response_model=List[PointsTransaction])
async def get_customer_transactions(customer_id: str, limit: int = 50, user: dict = Depends(get_current_user)):
    transactions = await db.points_transactions.find(
        {"customer_id": customer_id, "user_id": user["id"]},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return [PointsTransaction(**t) for t in transactions]

@router.post("/earn")
async def earn_points(customer_id: str, bill_amount: float, user: dict = Depends(get_current_user)):
    """Quick endpoint to earn points based on bill amount and tier"""
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    if not settings:
        settings = {
            "min_order_value": 100.0,
            "bronze_earn_percent": 5.0,
            "silver_earn_percent": 7.0,
            "gold_earn_percent": 10.0,
            "platinum_earn_percent": 15.0
        }
    
    min_order = settings.get("min_order_value", 100.0)
    if bill_amount < min_order:
        raise HTTPException(status_code=400, detail=f"Minimum order value is Rs.{min_order}")
    
    customer_tier = customer.get("tier", "Bronze")
    earn_percent = get_earn_percent_for_tier(customer_tier, settings)
    
    points_earned = int(bill_amount * earn_percent / 100)
    
    tx_data = PointsTransactionCreate(
        customer_id=customer_id,
        points=points_earned,
        transaction_type="earn",
        description=f"Earned {earn_percent}% on bill of Rs.{bill_amount}",
        bill_amount=bill_amount
    )
    
    return await create_points_transaction(tx_data, user)

@router.get("/expiring/{customer_id}")
async def get_expiring_points(customer_id: str, user: dict = Depends(get_current_user)):
    """Get points that are expiring soon for a customer"""
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    expiry_months = settings.get("points_expiry_months", 6) if settings else 6
    reminder_days = settings.get("expiry_reminder_days", 30) if settings else 30
    
    if expiry_months == 0:
        return {"expiring_soon": 0, "expiring_date": None, "already_expired": 0}
    
    now = datetime.now(timezone.utc)
    expiry_cutoff = now - timedelta(days=expiry_months * 30)
    reminder_cutoff = now - timedelta(days=(expiry_months * 30) - reminder_days)
    
    transactions = await db.points_transactions.find({
        "customer_id": customer_id,
        "user_id": user["id"],
        "transaction_type": {"$in": ["earn", "bonus"]}
    }, {"_id": 0}).to_list(1000)
    
    expiring_soon = 0
    already_expired = 0
    earliest_expiry = None
    
    for tx in transactions:
        tx_date = datetime.fromisoformat(tx["created_at"].replace("Z", "+00:00")) if isinstance(tx["created_at"], str) else tx["created_at"]
        # Ensure tx_date is timezone-aware for comparison
        if tx_date.tzinfo is None:
            tx_date = tx_date.replace(tzinfo=timezone.utc)
        
        if tx_date < expiry_cutoff:
            already_expired += tx["points"]
        elif tx_date < reminder_cutoff:
            expiring_soon += tx["points"]
            expiry_date = tx_date + timedelta(days=expiry_months * 30)
            if earliest_expiry is None or expiry_date < earliest_expiry:
                earliest_expiry = expiry_date
    
    return {
        "expiring_soon": max(0, expiring_soon),
        "expiring_date": earliest_expiry.isoformat() if earliest_expiry else None,
        "already_expired": max(0, already_expired),
        "expiry_months": expiry_months
    }


@router.post("/process-expiry-reminders")
async def process_expiry_reminders(user: dict = Depends(get_current_user)):
    """
    Process points expiry reminders for all customers.
    Now delegates to shared core logic (also used by cron scheduler).
    """
    from core.loyalty_jobs import run_expiry_reminders
    settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    if not settings:
        settings = {"points_expiry_months": 6, "expiry_reminder_days": 30}
    result = await run_expiry_reminders(user["id"], settings)
    return {
        "message": f"Found {result['customers_to_remind']} customers with expiring points",
        "customers_to_remind": result["customers_to_remind"],
        "reminders": result["reminders"]
    }

@router.post("/expire")
async def expire_old_points(user: dict = Depends(get_current_user)):
    """
    Expire old points for all customers.
    Now delegates to shared core logic (also used by cron scheduler).
    """
    from core.loyalty_jobs import run_points_expiry
    settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    if not settings:
        settings = {"points_expiry_months": 6}
    result = await run_points_expiry(user["id"], settings)
    return {
        "message": f"Expired {result['total_expired']} points from {result['customers_affected']} customers",
        **result
    }


# Loyalty Settings routes
@loyalty_router.get("/settings", response_model=LoyaltySettings)
async def get_loyalty_settings(user: dict = Depends(get_current_user)):
    settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    if not settings:
        settings = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "loyalty_enabled": False,
            "coupon_enabled": False,
            "wallet_enabled": False,
            "min_order_value": 100.0,
            "bronze_earn_percent": 5.0,
            "silver_earn_percent": 7.0,
            "gold_earn_percent": 10.0,
            "platinum_earn_percent": 15.0,
            "redemption_value": 1.0,
            "min_redemption_points": 50,
            "max_redemption_percent": 50.0,
            "max_redemption_amount": 500.0,
            "points_expiry_months": 6,
            "expiry_reminder_days": 30,
            "tier_silver_min": 500,
            "tier_gold_min": 1500,
            "tier_platinum_min": 5000,
            "custom_field_1_label": "Custom Field 1",
            "custom_field_2_label": "Custom Field 2",
            "custom_field_3_label": "Custom Field 3",
            "custom_field_1_enabled": False,
            "custom_field_2_enabled": False,
            "custom_field_3_enabled": False
        }
        await db.loyalty_settings.insert_one(settings)
    return LoyaltySettings(**settings)

@loyalty_router.put("/settings", response_model=LoyaltySettings)
async def update_loyalty_settings(update_data: LoyaltySettingsUpdate, user: dict = Depends(get_current_user)):
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    if update_dict:
        await db.loyalty_settings.update_one({"user_id": user["id"]}, {"$set": update_dict})
    
    settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    return LoyaltySettings(**settings)


@router.post("/process-birthday-bonus")
async def process_birthday_bonus(user: dict = Depends(get_current_user)):
    """
    Process birthday bonus for all eligible customers.
    Now delegates to shared core logic (also used by cron scheduler).
    """
    from core.loyalty_jobs import run_birthday_bonus
    settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    if not settings:
        return {"message": "Birthday bonus is disabled", "customers_awarded": 0, "total_points_awarded": 0}
    result = await run_birthday_bonus(user["id"], settings)
    return {"message": f"Birthday bonus processed for {result['customers_awarded']} customers", **result}


@router.post("/process-anniversary-bonus")
async def process_anniversary_bonus(user: dict = Depends(get_current_user)):
    """
    Process anniversary bonus for all eligible customers.
    Now delegates to shared core logic (also used by cron scheduler).
    """
    from core.loyalty_jobs import run_anniversary_bonus
    settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    if not settings:
        return {"message": "Anniversary bonus is disabled", "customers_awarded": 0, "total_points_awarded": 0}
    result = await run_anniversary_bonus(user["id"], settings)
    return {"message": f"Anniversary bonus processed for {result['customers_awarded']} customers", **result}
