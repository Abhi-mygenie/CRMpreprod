"""Feedback service for feedback operations"""
from datetime import datetime, timezone
import uuid
import asyncio

from core.database import db
from core.whatsapp import trigger_whatsapp_event


async def create_feedback_entry(user_id: str, feedback_data: dict):
    """Create a new feedback entry and award bonus points if enabled"""
    feedback_id = str(uuid.uuid4())
    
    feedback_doc = {
        "id": feedback_id,
        "user_id": user_id,
        "customer_id": feedback_data.get("customer_id"),
        "customer_name": feedback_data.get("customer_name"),
        "customer_phone": feedback_data.get("customer_phone"),
        "rating": feedback_data.get("rating"),
        "message": feedback_data.get("message"),
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.feedback.insert_one(feedback_doc)
    
    customer = None
    
    # Award feedback bonus points if enabled
    if feedback_data.get("customer_id"):
        settings = await db.loyalty_settings.find_one({"user_id": user_id}, {"_id": 0})
        customer = await db.customers.find_one({"id": feedback_data.get("customer_id")})
        
        if settings and settings.get("feedback_bonus_enabled", False) and customer:
            bonus_points = settings.get("feedback_bonus_points", 25)
            new_balance = customer.get("total_points", 0) + bonus_points
            await db.customers.update_one(
                {"id": feedback_data.get("customer_id")},
                {"$set": {"total_points": new_balance}}
            )
            
            tx_doc = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "customer_id": feedback_data.get("customer_id"),
                "points": bonus_points,
                "transaction_type": "bonus",
                "description": "Feedback bonus",
                "bill_amount": None,
                "balance_after": new_balance,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.points_transactions.insert_one(tx_doc)
            customer["total_points"] = new_balance
    
    # Fire feedback_received WhatsApp trigger
    if customer:
        asyncio.create_task(trigger_whatsapp_event(
            db, user_id, "feedback_received", customer,
            {
                "rating": feedback_data.get("rating"),
                "feedback_message": feedback_data.get("message") or "",
                "feedback_id": feedback_id
            }
        ))
    
    return feedback_doc


async def list_user_feedback(user_id: str, status: str = None, rating: int = None, limit: int = 100):
    """List feedback for a user with optional filters"""
    query = {"user_id": user_id}
    if status:
        query["status"] = status
    if rating:
        query["rating"] = rating
    
    feedbacks = await db.feedback.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return feedbacks


async def resolve_feedback_entry(user_id: str, feedback_id: str):
    """Mark feedback as resolved"""
    result = await db.feedback.update_one(
        {"id": feedback_id, "user_id": user_id},
        {"$set": {"status": "resolved"}}
    )
    return result.matched_count > 0
