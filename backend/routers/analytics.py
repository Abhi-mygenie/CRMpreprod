"""Analytics router for item performance and other analytics"""
from fastapi import APIRouter, Depends, Query
from typing import Optional
from datetime import datetime, timezone, timedelta

from core.database import db
from core.auth import get_current_user

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/item-performance")
async def get_item_performance(
    time_period: str = Query("all", description="Time period: 7d, 30d, 90d, all"),
    sort_by: str = Query("repeat_rate", description="Sort by: total_orders, repeat_orders, repeat_rate, unique_customers, return_visits"),
    sort_order: str = Query("desc", description="Sort order: asc, desc"),
    search: Optional[str] = Query(None, description="Search item name"),
    category: Optional[str] = Query(None, description="Filter by category"),
    limit: int = Query(100, description="Limit results"),
    user: dict = Depends(get_current_user)
):
    """
    Get item performance analytics with repeat rate metrics.
    
    Metrics calculated:
    - Total Orders: Number of orders containing this item
    - Repeat Orders: Orders from customers who bought this item 2+ times
    - Repeat Rate (%): (Repeat Orders / Total Orders) × 100
    - Unique Customers: Distinct customers who bought this item
    - Return Visits: Total revisits from customers who reordered this item
    """
    user_id = user["id"]
    
    # Build match filter
    match_filter = {"user_id": user_id}
    
    # Time period filter
    if time_period != "all":
        days_map = {"7d": 7, "30d": 30, "90d": 90}
        days = days_map.get(time_period, 30)
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        match_filter["created_at"] = {"$gte": cutoff}
    
    # Category filter
    if category and category != "all":
        match_filter["item_category"] = category
    
    # Search filter
    if search:
        match_filter["item_name"] = {"$regex": search, "$options": "i"}
    
    # Aggregation pipeline
    pipeline = [
        {"$match": match_filter},
        # Group by item + customer to count orders per customer per item
        {"$group": {
            "_id": {"item": "$item_name", "customer": "$customer_id"},
            "order_count": {"$sum": 1},
            "orders": {"$addToSet": "$order_id"},
            "total_qty": {"$sum": "$quantity"}
        }},
        # Group by item to get aggregated metrics
        {"$group": {
            "_id": "$_id.item",
            "total_orders": {"$sum": {"$size": "$orders"}},
            "unique_customers": {"$sum": 1},
            "repeat_customers": {"$sum": {"$cond": [{"$gte": ["$order_count", 2]}, 1, 0]}},
            "repeat_orders": {"$sum": {"$cond": [{"$gte": ["$order_count", 2]}, {"$size": "$orders"}, 0]}},
            "return_visits": {"$sum": {"$cond": [{"$gt": ["$order_count", 1]}, {"$subtract": ["$order_count", 1]}, 0]}},
            "total_qty_sold": {"$sum": "$total_qty"}
        }},
        # Calculate repeat rate
        {"$addFields": {
            "item_name": "$_id",
            "repeat_rate": {
                "$cond": [
                    {"$gt": ["$total_orders", 0]},
                    {"$round": [{"$multiply": [{"$divide": ["$repeat_orders", "$total_orders"]}, 100]}, 0]},
                    0
                ]
            }
        }},
        {"$project": {"_id": 0}}
    ]
    
    # Sort
    sort_direction = -1 if sort_order == "desc" else 1
    valid_sort_fields = ["total_orders", "repeat_orders", "repeat_rate", "unique_customers", "return_visits", "total_qty_sold", "item_name"]
    sort_field = sort_by if sort_by in valid_sort_fields else "repeat_rate"
    pipeline.append({"$sort": {sort_field: sort_direction}})
    
    # Limit
    pipeline.append({"$limit": limit})
    
    items = await db.order_items.aggregate(pipeline).to_list(limit)
    
    # Get categories for filter dropdown
    categories_pipeline = [
        {"$match": {"user_id": user_id, "item_category": {"$ne": None}}},
        {"$group": {"_id": "$item_category"}},
        {"$sort": {"_id": 1}}
    ]
    categories = await db.order_items.aggregate(categories_pipeline).to_list(50)
    category_list = [c["_id"] for c in categories if c["_id"]]
    
    # Summary stats
    total_items = len(items)
    avg_repeat_rate = round(sum(i["repeat_rate"] for i in items) / total_items, 1) if total_items > 0 else 0
    
    return {
        "items": items,
        "categories": category_list,
        "summary": {
            "total_items": total_items,
            "avg_repeat_rate": avg_repeat_rate
        }
    }


@router.get("/item-performance/export")
async def export_item_performance(
    time_period: str = Query("all"),
    user: dict = Depends(get_current_user)
):
    """Export item performance data as CSV-ready format"""
    # Reuse the main endpoint logic
    result = await get_item_performance(
        time_period=time_period,
        sort_by="repeat_rate",
        sort_order="desc",
        search=None,
        category=None,
        limit=1000,
        user=user
    )
    
    return {
        "headers": ["Item", "Total Orders", "Repeat Orders", "Repeat Rate (%)", "Unique Customers", "Return Visits"],
        "rows": [
            [
                item["item_name"],
                item["total_orders"],
                item["repeat_orders"],
                item["repeat_rate"],
                item["unique_customers"],
                item["return_visits"]
            ]
            for item in result["items"]
        ]
    }
