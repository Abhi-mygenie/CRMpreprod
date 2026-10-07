"""Feedback and Analytics API routes - Refactored to use services"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List

from core.auth import get_current_user
from models.schemas import Feedback, FeedbackCreate, DashboardStats
from services import (
    create_feedback_entry,
    list_user_feedback,
    resolve_feedback_entry,
    get_customer_segments,
    get_loyalty_orders_stats,
    get_revenue_split,
    get_customer_health_stats,
    get_order_stats,
    get_points_stats,
    get_wallet_stats,
    get_coupon_stats,
    get_feedback_stats,
    get_top_selling_items,
    get_loyalty_settings
)

router = APIRouter(prefix="/feedback", tags=["Feedback"])
analytics_router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.post("", response_model=Feedback)
async def create_feedback(feedback_data: FeedbackCreate, user: dict = Depends(get_current_user)):
    """Create new feedback entry"""
    feedback_doc = await create_feedback_entry(
        user["id"],
        {
            "customer_id": feedback_data.customer_id,
            "customer_name": feedback_data.customer_name,
            "customer_phone": feedback_data.customer_phone,
            "rating": feedback_data.rating,
            "message": feedback_data.message
        }
    )
    return Feedback(**feedback_doc)


@router.get("", response_model=List[Feedback])
async def list_feedback(
    status: str = None,
    rating: int = None,
    limit: int = 100,
    user: dict = Depends(get_current_user)
):
    """List all feedback for user"""
    feedbacks = await list_user_feedback(user["id"], status, rating, limit)
    return [Feedback(**f) for f in feedbacks]


@router.put("/{feedback_id}/resolve")
async def resolve_feedback(feedback_id: str, user: dict = Depends(get_current_user)):
    """Mark feedback as resolved"""
    success = await resolve_feedback_entry(user["id"], feedback_id)
    if not success:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return {"message": "Feedback marked as resolved"}


@analytics_router.get("/dashboard", response_model=DashboardStats)
async def get_dashboard_stats(user: dict = Depends(get_current_user)):
    """Get comprehensive dashboard statistics"""
    user_id = user["id"]
    
    # Get customer segments
    repeat_customer_ids, new_customer_ids = await get_customer_segments(user_id)
    
    # Get all stats in parallel-friendly manner
    loyalty_stats = await get_loyalty_orders_stats(user_id, repeat_customer_ids)
    revenue_split = await get_revenue_split(user_id, repeat_customer_ids, new_customer_ids)
    customer_health = await get_customer_health_stats(user_id)
    order_stats = await get_order_stats(user_id)
    points_stats = await get_points_stats(user_id)
    wallet_stats = await get_wallet_stats(user_id)
    coupon_stats = await get_coupon_stats(user_id)
    feedback_stats = await get_feedback_stats(user_id)
    top_items = await get_top_selling_items(user_id)
    loyalty_settings = await get_loyalty_settings(user_id)
    
    return DashboardStats(
        # Loyalty orders
        loyalty_orders_percent=loyalty_stats[0],
        loyalty_orders_percent_30d=loyalty_stats[1],
        loyalty_orders_percent_7d=loyalty_stats[2],
        # Revenue split
        repeat_revenue_percent=revenue_split["repeat_percent"],
        new_revenue_percent=revenue_split["new_percent"],
        repeat_revenue_percent_30d=revenue_split["repeat_percent_30d"],
        new_revenue_percent_30d=revenue_split["new_percent_30d"],
        repeat_revenue_percent_7d=revenue_split["repeat_percent_7d"],
        new_revenue_percent_7d=revenue_split["new_percent_7d"],
        # Customer health
        total_customers=customer_health["total_customers"],
        active_customers_30d=customer_health["active_30d"],
        new_customers_7d=customer_health["new_7d"],
        repeat_2_plus=customer_health["repeat_2_plus"],
        repeat_5_plus=customer_health["repeat_5_plus"],
        repeat_10_plus=customer_health["repeat_10_plus"],
        inactive_30d=customer_health["inactive_30d"],
        inactive_60d=customer_health["inactive_60d"],
        inactive_90d=customer_health["inactive_90d"],
        # Orders
        total_orders=order_stats["total_orders"],
        avg_order_value=order_stats["avg_order_value"],
        avg_orders_per_day=order_stats["avg_orders_per_day"],
        # Points
        total_points_issued=points_stats["points_issued"],
        total_points_redeemed=points_stats["points_redeemed"],
        points_balance=points_stats["points_balance"],
        # Wallet
        wallet_issued=wallet_stats["wallet_issued"],
        wallet_used=wallet_stats["wallet_used"],
        wallet_balance=wallet_stats["wallet_balance"],
        # Coupons
        total_coupons=coupon_stats["total_coupons"],
        coupons_used=coupon_stats["coupons_used"],
        discount_availed=coupon_stats["discount_availed"],
        # Revenue
        total_revenue=order_stats["total_revenue"],
        revenue_30d=order_stats["revenue_30d"],
        revenue_7d=order_stats["revenue_7d"],
        # Top items
        top_items_30d=top_items["top_items_30d"],
        top_items_7d=top_items["top_items_7d"],
        top_items_all_time=top_items["top_items_all_time"],
        # Feedback
        avg_rating=feedback_stats["avg_rating"],
        total_feedback=feedback_stats["total_feedback"],
        # Settings
        loyalty_enabled=loyalty_settings["loyalty_enabled"],
        wallet_enabled=loyalty_settings["wallet_enabled"],
        coupon_enabled=loyalty_settings["coupon_enabled"]
    )
