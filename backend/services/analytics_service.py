"""Analytics service for dashboard statistics"""
from datetime import datetime, timezone, timedelta
from core.database import db


async def get_customer_segments(user_id: str):
    """Get repeat and new customer IDs"""
    repeat_customers = await db.customers.find(
        {"user_id": user_id, "total_visits": {"$gte": 2}},
        {"id": 1}
    ).to_list(None)
    repeat_customer_ids = [c["id"] for c in repeat_customers]
    
    new_customers = await db.customers.find(
        {"user_id": user_id, "total_visits": 1},
        {"id": 1}
    ).to_list(None)
    new_customer_ids = [c["id"] for c in new_customers]
    
    return repeat_customer_ids, new_customer_ids


async def get_loyalty_orders_stats(user_id: str, repeat_customer_ids: list):
    """Calculate loyalty orders percentages for total, 30D, and 7D"""
    now = datetime.now(timezone.utc)
    thirty_days_ago = (now - timedelta(days=30)).isoformat()
    seven_days_ago = (now - timedelta(days=7)).isoformat()
    
    # Total
    total_orders_count = await db.orders.count_documents({"user_id": user_id})
    loyalty_orders_count = await db.orders.count_documents({
        "user_id": user_id,
        "customer_id": {"$in": repeat_customer_ids}
    }) if repeat_customer_ids else 0
    loyalty_percent = round((loyalty_orders_count / total_orders_count * 100), 1) if total_orders_count > 0 else 0.0
    
    # 30D
    total_orders_30d = await db.orders.count_documents({"user_id": user_id, "created_at": {"$gte": thirty_days_ago}})
    loyalty_orders_30d = await db.orders.count_documents({
        "user_id": user_id,
        "customer_id": {"$in": repeat_customer_ids},
        "created_at": {"$gte": thirty_days_ago}
    }) if repeat_customer_ids else 0
    loyalty_percent_30d = round((loyalty_orders_30d / total_orders_30d * 100), 1) if total_orders_30d > 0 else 0.0
    
    # 7D
    total_orders_7d = await db.orders.count_documents({"user_id": user_id, "created_at": {"$gte": seven_days_ago}})
    loyalty_orders_7d = await db.orders.count_documents({
        "user_id": user_id,
        "customer_id": {"$in": repeat_customer_ids},
        "created_at": {"$gte": seven_days_ago}
    }) if repeat_customer_ids else 0
    loyalty_percent_7d = round((loyalty_orders_7d / total_orders_7d * 100), 1) if total_orders_7d > 0 else 0.0
    
    return loyalty_percent, loyalty_percent_30d, loyalty_percent_7d


async def get_revenue_split(user_id: str, repeat_customer_ids: list, new_customer_ids: list):
    """Calculate revenue split between repeat and new customers"""
    now = datetime.now(timezone.utc)
    thirty_days_ago = (now - timedelta(days=30)).isoformat()
    seven_days_ago = (now - timedelta(days=7)).isoformat()
    
    async def calculate_revenue(customer_ids: list, date_filter: dict = None):
        if not customer_ids:
            return 0
        match = {"user_id": user_id, "customer_id": {"$in": customer_ids}}
        if date_filter:
            match["created_at"] = date_filter
        pipeline = [{"$match": match}, {"$group": {"_id": None, "total": {"$sum": "$order_amount"}}}]
        result = await db.orders.aggregate(pipeline).to_list(1)
        return result[0].get("total", 0) if result else 0
    
    # Total
    repeat_revenue = await calculate_revenue(repeat_customer_ids)
    new_revenue = await calculate_revenue(new_customer_ids)
    total = repeat_revenue + new_revenue
    repeat_percent = round((repeat_revenue / total * 100), 1) if total > 0 else 0.0
    new_percent = round((new_revenue / total * 100), 1) if total > 0 else 0.0
    
    # 30D
    repeat_revenue_30d = await calculate_revenue(repeat_customer_ids, {"$gte": thirty_days_ago})
    new_revenue_30d = await calculate_revenue(new_customer_ids, {"$gte": thirty_days_ago})
    total_30d = repeat_revenue_30d + new_revenue_30d
    repeat_percent_30d = round((repeat_revenue_30d / total_30d * 100), 1) if total_30d > 0 else 0.0
    new_percent_30d = round((new_revenue_30d / total_30d * 100), 1) if total_30d > 0 else 0.0
    
    # 7D
    repeat_revenue_7d = await calculate_revenue(repeat_customer_ids, {"$gte": seven_days_ago})
    new_revenue_7d = await calculate_revenue(new_customer_ids, {"$gte": seven_days_ago})
    total_7d = repeat_revenue_7d + new_revenue_7d
    repeat_percent_7d = round((repeat_revenue_7d / total_7d * 100), 1) if total_7d > 0 else 0.0
    new_percent_7d = round((new_revenue_7d / total_7d * 100), 1) if total_7d > 0 else 0.0
    
    return {
        "repeat_percent": repeat_percent, "new_percent": new_percent,
        "repeat_percent_30d": repeat_percent_30d, "new_percent_30d": new_percent_30d,
        "repeat_percent_7d": repeat_percent_7d, "new_percent_7d": new_percent_7d
    }


async def get_customer_health_stats(user_id: str):
    """Get customer health metrics"""
    now = datetime.now(timezone.utc)
    thirty_days_ago = (now - timedelta(days=30)).isoformat()
    seven_days_ago = (now - timedelta(days=7)).isoformat()
    sixty_days_ago = (now - timedelta(days=60)).isoformat()
    ninety_days_ago = (now - timedelta(days=90)).isoformat()
    
    total_customers = await db.customers.count_documents({"user_id": user_id})
    active_30d = await db.customers.count_documents({"user_id": user_id, "last_visit": {"$gte": thirty_days_ago}})
    new_7d = await db.customers.count_documents({"user_id": user_id, "created_at": {"$gte": seven_days_ago}})
    
    # Repeat customers
    repeat_2_plus = await db.customers.count_documents({"user_id": user_id, "total_visits": {"$gte": 2}})
    repeat_5_plus = await db.customers.count_documents({"user_id": user_id, "total_visits": {"$gte": 5}})
    repeat_10_plus = await db.customers.count_documents({"user_id": user_id, "total_visits": {"$gte": 10}})
    
    # Inactive customers
    inactive_query = lambda days_ago: {"user_id": user_id, "$or": [{"last_visit": {"$lt": days_ago}}, {"last_visit": None}]}
    inactive_30d = await db.customers.count_documents(inactive_query(thirty_days_ago))
    inactive_60d = await db.customers.count_documents(inactive_query(sixty_days_ago))
    inactive_90d = await db.customers.count_documents(inactive_query(ninety_days_ago))
    
    return {
        "total_customers": total_customers,
        "active_30d": active_30d,
        "new_7d": new_7d,
        "repeat_2_plus": repeat_2_plus,
        "repeat_5_plus": repeat_5_plus,
        "repeat_10_plus": repeat_10_plus,
        "inactive_30d": inactive_30d,
        "inactive_60d": inactive_60d,
        "inactive_90d": inactive_90d
    }


async def get_order_stats(user_id: str):
    """Get order and revenue statistics"""
    now = datetime.now(timezone.utc)
    thirty_days_ago = (now - timedelta(days=30)).isoformat()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_iso = today.isoformat()
    thirty_one_days_ago = (today - timedelta(days=31)).isoformat()
    eight_days_ago = (today - timedelta(days=8)).isoformat()
    
    total_orders = await db.orders.count_documents({"user_id": user_id})
    
    # Order value stats
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": None, "total_revenue": {"$sum": "$order_amount"}, "count": {"$sum": 1}}}
    ]
    result = await db.orders.aggregate(pipeline).to_list(1)
    total_revenue = result[0].get("total_revenue", 0) if result else 0
    avg_order_value = round(total_revenue / total_orders, 2) if total_orders > 0 else 0.0
    
    # Avg orders per day
    orders_30d = await db.orders.count_documents({"user_id": user_id, "created_at": {"$gte": thirty_days_ago}})
    avg_orders_per_day = round(orders_30d / 30, 1)
    
    # Revenue periods
    async def get_revenue(date_filter):
        pipeline = [{"$match": {"user_id": user_id, **date_filter}}, {"$group": {"_id": None, "total": {"$sum": "$order_amount"}}}]
        result = await db.orders.aggregate(pipeline).to_list(1)
        return result[0].get("total", 0) if result else 0.0
    
    revenue_30d = await get_revenue({"created_at": {"$gte": thirty_one_days_ago, "$lt": today_iso}})
    revenue_7d = await get_revenue({"created_at": {"$gte": eight_days_ago, "$lt": today_iso}})
    
    return {
        "total_orders": total_orders,
        "avg_order_value": avg_order_value,
        "avg_orders_per_day": avg_orders_per_day,
        "total_revenue": total_revenue,
        "revenue_30d": revenue_30d,
        "revenue_7d": revenue_7d
    }


async def get_points_stats(user_id: str):
    """Get points statistics"""
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": "$transaction_type", "total": {"$sum": "$points"}}}
    ]
    stats = await db.points_transactions.aggregate(pipeline).to_list(10)
    
    points_issued = sum(s["total"] for s in stats if s["_id"] in ["earn", "bonus"])
    points_redeemed = sum(s["total"] for s in stats if s["_id"] == "redeem")
    
    return {
        "points_issued": points_issued,
        "points_redeemed": points_redeemed,
        "points_balance": points_issued - points_redeemed
    }


async def get_wallet_stats(user_id: str):
    """Get wallet statistics"""
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": "$transaction_type", "total": {"$sum": "$amount"}}}
    ]
    stats = await db.wallet_transactions.aggregate(pipeline).to_list(10)
    
    wallet_issued = sum(s["total"] for s in stats if s["_id"] == "credit")
    wallet_used = sum(s["total"] for s in stats if s["_id"] == "debit")
    
    return {
        "wallet_issued": wallet_issued,
        "wallet_used": wallet_used,
        "wallet_balance": wallet_issued - wallet_used
    }


async def get_coupon_stats(user_id: str):
    """Get coupon statistics"""
    total_coupons = await db.coupons.count_documents({"user_id": user_id})
    coupons_used = await db.coupon_transactions.count_documents({"user_id": user_id})
    
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": None, "total_discount": {"$sum": "$discount_amount"}}}
    ]
    result = await db.coupon_transactions.aggregate(pipeline).to_list(1)
    discount_availed = result[0].get("total_discount", 0) if result else 0.0
    
    return {
        "total_coupons": total_coupons,
        "coupons_used": coupons_used,
        "discount_availed": discount_availed
    }


async def get_feedback_stats(user_id: str):
    """Get feedback and rating statistics"""
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": None, "avg_rating": {"$avg": "$rating"}, "count": {"$sum": 1}}}
    ]
    result = await db.feedback.aggregate(pipeline).to_list(1)
    
    return {
        "avg_rating": round(result[0].get("avg_rating", 0) or 0, 1) if result else 0.0,
        "total_feedback": result[0].get("count", 0) if result else 0
    }


async def get_top_selling_items(user_id: str):
    """Get top selling items for different time periods"""
    now = datetime.now(timezone.utc)
    thirty_days_ago = (now - timedelta(days=30)).isoformat()
    seven_days_ago = (now - timedelta(days=7)).isoformat()
    
    async def get_top_items(date_filter: dict = None):
        match = {"user_id": user_id}
        if date_filter:
            match["created_at"] = date_filter
        pipeline = [
            {"$match": match},
            {"$group": {"_id": "$item_name", "qty": {"$sum": "$item_qty"}}},
            {"$sort": {"qty": -1}},
            {"$limit": 3},
            {"$project": {"name": "$_id", "qty": 1, "_id": 0}}
        ]
        return await db.order_items.aggregate(pipeline).to_list(3)
    
    return {
        "top_items_30d": await get_top_items({"$gte": thirty_days_ago}),
        "top_items_7d": await get_top_items({"$gte": seven_days_ago}),
        "top_items_all_time": await get_top_items()
    }


async def get_loyalty_settings(user_id: str):
    """Get loyalty settings for conditional display"""
    settings = await db.loyalty_settings.find_one({"user_id": user_id})
    return {
        "loyalty_enabled": settings.get("loyalty_enabled", True) if settings else True,
        "wallet_enabled": settings.get("wallet_enabled", False) if settings else False,
        "coupon_enabled": settings.get("coupon_enabled", False) if settings else False
    }
