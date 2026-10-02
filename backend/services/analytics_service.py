"""Analytics service for dashboard statistics"""
from datetime import datetime, timezone, timedelta
from core.database import db


def _usage_match(user_id: str, date_from: str = None, date_to: str = None, **extra) -> dict:
    """DRY helper: build $match dict for coupon_usage queries with optional date filter."""
    m = {"user_id": user_id, **extra}
    if date_from or date_to:
        used_at_filter = {}
        if date_from:
            used_at_filter["$gte"] = date_from
        if date_to:
            used_at_filter["$lte"] = date_to
        m["used_at"] = used_at_filter
    return m


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


async def get_coupon_stats(user_id: str, date_from: str = None, date_to: str = None):
    """
    Get coupon statistics.
    CR-001C-C V1: union of `coupon_usage` (realtime canonical) and
    `coupon_transactions` (legacy migration). Realtime path writes only
    `coupon_usage`; migration writes only `coupon_transactions`; no overlap.
    CR-001C-C V2: adds `breakdown_by_scope` for order/item/category/unknown.
    CR-003 Phase 2: optional date_from filter on usage data.
    """
    # total_coupons is NEVER date-filtered (total created).
    total_coupons = await db.coupons.count_documents({"user_id": user_id})

    # Legacy migration source (coupon_transactions).
    legacy_match = {"user_id": user_id}
    if date_from or date_to:
        created_at_filter = {}
        if date_from:
            created_at_filter["$gte"] = date_from
        if date_to:
            created_at_filter["$lte"] = date_to
        legacy_match["created_at"] = created_at_filter
    legacy_used = await db.coupon_transactions.count_documents(legacy_match)
    pipeline_legacy = [
        {"$match": legacy_match},
        {"$group": {"_id": None, "total_discount": {"$sum": "$discount_amount"}}},
    ]
    result_legacy = await db.coupon_transactions.aggregate(pipeline_legacy).to_list(1)
    legacy_discount = result_legacy[0].get("total_discount", 0) if result_legacy else 0.0

    # Realtime canonical source (coupon_usage).
    rt_match = _usage_match(user_id, date_from, date_to)
    realtime_used = await db.coupon_usage.count_documents(rt_match)
    pipeline_realtime = [
        {"$match": rt_match},
        {"$group": {"_id": None, "total_discount": {"$sum": "$coupon_discount"}}},
    ]
    result_realtime = await db.coupon_usage.aggregate(pipeline_realtime).to_list(1)
    realtime_discount = result_realtime[0].get("total_discount", 0) if result_realtime else 0.0

    # CR-001C-C V2: breakdown by discount_scope.
    breakdown_pipeline = [
        {"$match": rt_match},
        {"$group": {
            "_id": {"$ifNull": ["$discount_scope", "unknown"]},
            "used": {"$sum": 1},
            "discount": {"$sum": "$coupon_discount"},
        }},
    ]
    breakdown_rows = await db.coupon_usage.aggregate(breakdown_pipeline).to_list(20)
    breakdown_by_scope = {
        "order": {"used": 0, "discount": 0.0},
        "item": {"used": 0, "discount": 0.0},
        "category": {"used": 0, "discount": 0.0},
        "unknown": {"used": 0, "discount": 0.0},
    }
    for row in breakdown_rows:
        key = row.get("_id") or "unknown"
        if key not in breakdown_by_scope:
            key = "unknown"
        breakdown_by_scope[key] = {
            "used": int(row.get("used") or 0),
            "discount": round(float(row.get("discount") or 0.0), 2),
        }

    # CR-003 Phase 4: ROI — gross revenue from coupon orders.
    # order_total in coupon_usage is NET (post-discount). Gross = order_total + coupon_discount.
    roi_pipeline = [
        {"$match": {**rt_match, "order_total": {"$gt": 0}}},
        {"$group": {
            "_id": None,
            "net_revenue": {"$sum": "$order_total"},
            "discount_sum": {"$sum": "$coupon_discount"},
            "uses": {"$sum": 1},
        }},
    ]
    roi_agg = await db.coupon_usage.aggregate(roi_pipeline).to_list(1)
    roi_data = roi_agg[0] if roi_agg else {}
    roi_net = float(roi_data.get("net_revenue") or 0.0)
    roi_disc = float(roi_data.get("discount_sum") or 0.0)
    roi_gross = round(roi_net + roi_disc, 2)
    roi_uses = int(roi_data.get("uses") or 0)
    roi_score = round(roi_gross / roi_disc, 1) if roi_disc > 0 else None

    # Basket lift: avg coupon order vs avg all orders
    avg_all_pipeline = [
        {"$match": {"user_id": user_id, "order_amount": {"$gt": 0}}},
        {"$group": {"_id": None, "avg": {"$avg": "$order_amount"}}},
    ]
    avg_coupon_pipeline = [
        {"$match": {"user_id": user_id, "coupon_discount": {"$gt": 0}}},
        {"$group": {"_id": None, "avg": {"$avg": "$order_amount"}}},
    ]
    avg_all_res = await db.orders.aggregate(avg_all_pipeline).to_list(1)
    avg_coupon_res = await db.orders.aggregate(avg_coupon_pipeline).to_list(1)
    avg_all_order = round(float((avg_all_res[0] if avg_all_res else {}).get("avg") or 0.0), 2)
    avg_coupon_order = round(float((avg_coupon_res[0] if avg_coupon_res else {}).get("avg") or 0.0), 2)
    basket_lift = round(avg_coupon_order / avg_all_order, 1) if avg_all_order > 0 else None

    return {
        "total_coupons": total_coupons,
        "coupons_used": legacy_used + realtime_used,
        "discount_availed": round(float(legacy_discount or 0.0) + float(realtime_discount or 0.0), 2),
        "breakdown_by_scope": breakdown_by_scope,
        "breakdown_by_offer_type": await _get_breakdown_by_offer_type(user_id, date_from, date_to),
        "time_window_usage": await _get_time_window_usage(user_id, date_from, date_to),
        "bxgy_usage": await _get_bxgy_usage(user_id, date_from, date_to),
        "nth_item_usage": await _get_nth_item_usage(user_id, date_from, date_to),
        "roi": {
            "score": roi_score,
            "gross_revenue": roi_gross,
            "net_revenue": round(roi_net, 2),
            "total_discount": round(roi_disc, 2),
            "discount_cost_pct": round(roi_disc / roi_gross * 100, 1) if roi_gross > 0 else None,
            "uses_with_order_data": roi_uses,
            "avg_coupon_order": avg_coupon_order,
            "avg_all_order": avg_all_order,
            "basket_lift": basket_lift,
        },
    }


async def _get_breakdown_by_offer_type(user_id: str, date_from: str = None, date_to: str = None):
    """CR-001C-C V3-A — additive offer_type breakdown."""
    pipeline = [
        {"$match": _usage_match(user_id, date_from, date_to)},
        {"$group": {
            "_id": {"$ifNull": ["$offer_type", "unknown"]},
            "used": {"$sum": 1},
            "discount": {"$sum": "$coupon_discount"},
        }},
    ]
    rows = await db.coupon_usage.aggregate(pipeline).to_list(20)
    buckets = {
        "simple": {"used": 0, "discount": 0.0},
        "bogo": {"used": 0, "discount": 0.0},
        "bxg": {"used": 0, "discount": 0.0},
        "nth_item": {"used": 0, "discount": 0.0},
        "free_item": {"used": 0, "discount": 0.0},
        "combo": {"used": 0, "discount": 0.0},
        "unknown": {"used": 0, "discount": 0.0},
    }
    for r in rows:
        key = r.get("_id") or "unknown"
        if key not in buckets:
            key = "unknown"
        buckets[key] = {
            "used": int(r.get("used") or 0),
            "discount": round(float(r.get("discount") or 0.0), 2),
        }
    return buckets


async def _get_time_window_usage(user_id: str, date_from: str = None, date_to: str = None):
    """CR-001C-C V3-A — analytics for time-window adoption."""
    # coupons_with_window is NOT date-filtered (coupon definition).
    coupons_with_window = await db.coupons.count_documents({
        "user_id": user_id,
        "$or": [
            {"valid_days": {"$exists": True, "$ne": None, "$not": {"$size": 0}}},
            {"start_time": {"$exists": True, "$ne": None}},
            {"end_time": {"$exists": True, "$ne": None}},
        ],
    })
    used_within_match = _usage_match(user_id, date_from, date_to, **{
        "time_window_status.configured": True,
        "time_window_status.within_window": True,
    })
    used_within_window = await db.coupon_usage.count_documents(used_within_match)
    # OQ-V3A-2 — outside-window attempts deferred to V3-A2 (returns 0 placeholder).
    return {
        "coupons_with_window": int(coupons_with_window),
        "used_within_window": int(used_within_window),
        "used_outside_window_attempts": 0,
    }


async def _get_bxgy_usage(user_id: str, date_from: str = None, date_to: str = None):
    """CR-001C-C V3-B — additive analytics for BOGO / Buy-X-Get-Y adoption."""
    bogo_match = _usage_match(user_id, date_from, date_to, offer_type="bogo")
    bxg_match = _usage_match(user_id, date_from, date_to, offer_type="bxg")
    bogo_orders = await db.coupon_usage.count_documents(bogo_match)
    bxg_orders = await db.coupon_usage.count_documents(bxg_match)
    # Aggregate applied_applications + benefit-unit counts.
    combined_match = _usage_match(user_id, date_from, date_to, offer_type={"$in": ["bogo", "bxg"]})
    pipeline = [
        {"$match": combined_match},
        {"$group": {
            "_id": None,
            "total_applications": {"$sum": {"$ifNull": ["$applied_applications", 0]}},
            "discount_amount": {"$sum": {"$ifNull": ["$coupon_discount", 0]}},
        }},
    ]
    agg = await db.coupon_usage.aggregate(pipeline).to_list(1)
    total_applications = int((agg[0] if agg else {}).get("total_applications") or 0)
    discount_amount = round(float((agg[0] if agg else {}).get("discount_amount") or 0.0), 2)

    # Count free vs discounted units across benefit_items[].
    # Free units = sum of quantity where unit_price == line_discount.
    # Discounted units = sum of quantity where 0 < line_discount < unit_price.
    free_units = 0
    discounted_units = 0
    cursor = db.coupon_usage.find(
        combined_match,
        {"_id": 0, "benefit_items": 1},
    )
    async for row in cursor:
        for bi in (row.get("benefit_items") or []):
            try:
                q = int(bi.get("quantity") or 0)
                up = float(bi.get("unit_price") or 0.0)
                ld = float(bi.get("line_discount") or 0.0)
            except (TypeError, ValueError):
                continue
            if q <= 0:
                continue
            per_unit_disc = ld / q if q else 0.0
            if abs(per_unit_disc - up) < 0.01:
                free_units += q
            elif per_unit_disc > 0:
                discounted_units += q

    return {
        "bogo_orders": int(bogo_orders),
        "bxg_orders": int(bxg_orders),
        "total_applications": total_applications,
        "discount_amount": discount_amount,
        "free_units_given": int(free_units),
        "discounted_units_given": int(discounted_units),
    }


async def _get_nth_item_usage(user_id: str, date_from: str = None, date_to: str = None):
    """CR-001C-C V3-C — additive analytics for Every-Nth adoption."""
    nth_match = _usage_match(user_id, date_from, date_to, offer_type="nth_item")
    orders = await db.coupon_usage.count_documents(nth_match)
    pipeline = [
        {"$match": nth_match},
        {"$group": {
            "_id": None,
            "total_applications": {"$sum": {"$ifNull": ["$applied_applications", 0]}},
            "discount_amount": {"$sum": {"$ifNull": ["$coupon_discount", 0]}},
        }},
    ]
    agg = await db.coupon_usage.aggregate(pipeline).to_list(1)
    total_applications = int((agg[0] if agg else {}).get("total_applications") or 0)
    discount_amount = round(float((agg[0] if agg else {}).get("discount_amount") or 0.0), 2)

    # benefit_units_given + by_nth_number distribution.
    benefit_units_given = 0
    by_nth_number: dict = {}
    cursor = db.coupon_usage.find(
        nth_match,
        {"_id": 0, "benefit_items": 1, "nth_item_number": 1},
    )
    async for row in cursor:
        for bi in (row.get("benefit_items") or []):
            try:
                benefit_units_given += int(bi.get("quantity") or 0)
            except (TypeError, ValueError):
                pass
        n = row.get("nth_item_number")
        if n is not None:
            key = str(int(n))
            by_nth_number[key] = by_nth_number.get(key, 0) + 1

    return {
        "orders": int(orders),
        "total_applications": total_applications,
        "discount_amount": discount_amount,
        "benefit_units_given": int(benefit_units_given),
        "by_nth_number": by_nth_number,
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
