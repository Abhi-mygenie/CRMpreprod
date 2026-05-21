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


@router.get("/item-customers/{item_name}")
async def get_item_customers(
    item_name: str,
    time_period: str = Query("all", description="Time period: 7d, 30d, 90d, all"),
    user: dict = Depends(get_current_user)
):
    """
    Get list of customers who ordered a specific item.
    Used for sending targeted campaigns.
    """
    user_id = user["id"]
    
    # Build match filter
    match_filter = {"user_id": user_id, "item_name": item_name}
    
    # Time period filter
    if time_period != "all":
        days_map = {"7d": 7, "30d": 30, "90d": 90}
        days = days_map.get(time_period, 30)
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        match_filter["created_at"] = {"$gte": cutoff}
    
    # Get distinct customer IDs who ordered this item
    pipeline = [
        {"$match": match_filter},
        {"$group": {
            "_id": "$customer_id",
            "order_count": {"$sum": 1},
            "last_ordered": {"$max": "$created_at"}
        }},
        {"$sort": {"order_count": -1}}
    ]
    
    customer_ids_data = await db.order_items.aggregate(pipeline).to_list(1000)
    customer_ids = [c["_id"] for c in customer_ids_data]
    
    # Get customer details
    customers = await db.customers.find(
        {"id": {"$in": customer_ids}, "user_id": user_id},
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "whatsapp_opt_in": 1}
    ).to_list(1000)
    
    # Create lookup for order data
    order_lookup = {c["_id"]: c for c in customer_ids_data}
    
    # Merge customer data with order data
    result = []
    for customer in customers:
        order_data = order_lookup.get(customer["id"], {})
        result.append({
            "id": customer["id"],
            "name": customer.get("name", ""),
            "phone": customer.get("phone", ""),
            "whatsapp_opt_in": customer.get("whatsapp_opt_in", False),
            "order_count": order_data.get("order_count", 0),
            "last_ordered": order_data.get("last_ordered", "")
        })
    
    # Filter only customers with WhatsApp opt-in for campaign
    whatsapp_enabled = [c for c in result if c.get("whatsapp_opt_in")]
    
    return {
        "item_name": item_name,
        "total_customers": len(result),
        "whatsapp_enabled": len(whatsapp_enabled),
        "customers": result
    }


# =============================================================================
# CUSTOMER LIFECYCLE ANALYTICS
# =============================================================================

def get_stage_cutoffs():
    """Get date cutoffs for lifecycle stages"""
    now = datetime.now(timezone.utc)
    return {
        "thirty_days_ago": (now - timedelta(days=30)).isoformat(),
        "sixty_days_ago": (now - timedelta(days=60)).isoformat(),
        "ninety_days_ago": (now - timedelta(days=90)).isoformat(),
    }


def classify_customer_stage(customer: dict, cutoffs: dict) -> str:
    """
    Classify customer into lifecycle stage.
    - New: 1 visit only, last visit within 30 days
    - Active: 2+ visits, last visit within 30 days
    - At Risk: last visit 31-60 days ago
    - Dormant: last visit 61-90 days ago
    - Churned: last visit > 90 days ago or never visited
    """
    total_visits = customer.get("total_visits", 0)
    last_visit = customer.get("last_visit")
    
    if not last_visit:
        return "churned"
    
    if last_visit >= cutoffs["thirty_days_ago"]:
        if total_visits <= 1:
            return "new"
        else:
            return "active"
    elif last_visit >= cutoffs["sixty_days_ago"]:
        return "at_risk"
    elif last_visit >= cutoffs["ninety_days_ago"]:
        return "dormant"
    else:
        return "churned"


@router.get("/customer-lifecycle")
async def get_customer_lifecycle_summary(
    user: dict = Depends(get_current_user)
):
    """
    Get customer lifecycle summary with counts per stage.
    
    Stages:
    - New: First-time customers (1 visit), active within 30 days
    - Active: Returning customers (2+ visits), active within 30 days
    - At Risk: Last visit 31-60 days ago
    - Dormant: Last visit 61-90 days ago
    - Churned: Last visit > 90 days ago
    """
    user_id = user["id"]
    cutoffs = get_stage_cutoffs()
    
    # Build aggregation pipeline to classify and count customers
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$addFields": {
            "stage": {
                "$switch": {
                    "branches": [
                        # New: 1 visit, last visit within 30 days
                        {
                            "case": {
                                "$and": [
                                    {"$lte": [{"$ifNull": ["$total_visits", 0]}, 1]},
                                    {"$gte": [{"$ifNull": ["$last_visit", ""]}, cutoffs["thirty_days_ago"]]}
                                ]
                            },
                            "then": "new"
                        },
                        # Active: 2+ visits, last visit within 30 days
                        {
                            "case": {
                                "$and": [
                                    {"$gte": [{"$ifNull": ["$total_visits", 0]}, 2]},
                                    {"$gte": [{"$ifNull": ["$last_visit", ""]}, cutoffs["thirty_days_ago"]]}
                                ]
                            },
                            "then": "active"
                        },
                        # At Risk: last visit 31-60 days ago
                        {
                            "case": {
                                "$and": [
                                    {"$lt": [{"$ifNull": ["$last_visit", ""]}, cutoffs["thirty_days_ago"]]},
                                    {"$gte": [{"$ifNull": ["$last_visit", ""]}, cutoffs["sixty_days_ago"]]}
                                ]
                            },
                            "then": "at_risk"
                        },
                        # Dormant: last visit 61-90 days ago
                        {
                            "case": {
                                "$and": [
                                    {"$lt": [{"$ifNull": ["$last_visit", ""]}, cutoffs["sixty_days_ago"]]},
                                    {"$gte": [{"$ifNull": ["$last_visit", ""]}, cutoffs["ninety_days_ago"]]}
                                ]
                            },
                            "then": "dormant"
                        }
                    ],
                    "default": "churned"
                }
            }
        }},
        {"$group": {
            "_id": "$stage",
            "count": {"$sum": 1}
        }}
    ]
    
    results = await db.customers.aggregate(pipeline).to_list(10)
    
    # Convert to dict
    stage_counts = {r["_id"]: r["count"] for r in results}
    
    # Calculate previous period for comparison (compare to 30 days ago snapshot)
    # For simplicity, we'll use a rough estimate based on created_at
    prev_cutoffs = {
        "thirty_days_ago": (datetime.now(timezone.utc) - timedelta(days=60)).isoformat(),
        "sixty_days_ago": (datetime.now(timezone.utc) - timedelta(days=90)).isoformat(),
        "ninety_days_ago": (datetime.now(timezone.utc) - timedelta(days=120)).isoformat(),
    }
    
    # Get total
    total = sum(stage_counts.values())
    
    # Build response with percentages
    stages = ["new", "active", "at_risk", "dormant", "churned"]
    summary = {}
    for stage in stages:
        count = stage_counts.get(stage, 0)
        percent = round((count / total * 100), 1) if total > 0 else 0
        summary[stage] = {
            "count": count,
            "percent": percent
        }
    
    return {
        "summary": summary,
        "total_customers": total
    }


@router.get("/customer-lifecycle/trend")
async def get_customer_lifecycle_trend(
    time_period: str = Query("90d", description="Time period: 30d, 90d, 180d, 365d"),
    granularity: str = Query("weekly", description="Granularity: daily, weekly, monthly"),
    user: dict = Depends(get_current_user)
):
    """
    Get customer lifecycle trend over time.
    Shows how many customers were in each stage at different points in time.
    """
    user_id = user["id"]
    now = datetime.now(timezone.utc)
    
    # Determine time range
    days_map = {"30d": 30, "90d": 90, "180d": 180, "365d": 365}
    days = days_map.get(time_period, 90)
    start_date = now - timedelta(days=days)
    
    # Determine interval
    if granularity == "daily":
        interval_days = 1
    elif granularity == "weekly":
        interval_days = 7
    else:  # monthly
        interval_days = 30
    
    # Generate date points
    date_points = []
    current = start_date
    while current <= now:
        date_points.append(current)
        current += timedelta(days=interval_days)
    
    # For each date point, calculate stage counts
    # This is a simplified approach - we estimate based on created_at and last_visit
    trend_data = []
    
    for date_point in date_points:
        date_str = date_point.strftime("%Y-%m-%d")
        
        # Cutoffs relative to this date point
        thirty_days = (date_point - timedelta(days=30)).isoformat()
        sixty_days = (date_point - timedelta(days=60)).isoformat()
        ninety_days = (date_point - timedelta(days=90)).isoformat()
        date_point_iso = date_point.isoformat()
        
        # Count customers who existed at this point (created_at <= date_point)
        pipeline = [
            {"$match": {
                "user_id": user_id,
                "created_at": {"$lte": date_point_iso}
            }},
            {"$addFields": {
                "stage": {
                    "$switch": {
                        "branches": [
                            {
                                "case": {
                                    "$and": [
                                        {"$lte": [{"$ifNull": ["$total_visits", 0]}, 1]},
                                        {"$gte": [{"$ifNull": ["$last_visit", ""]}, thirty_days]},
                                        {"$lte": [{"$ifNull": ["$last_visit", ""]}, date_point_iso]}
                                    ]
                                },
                                "then": "new"
                            },
                            {
                                "case": {
                                    "$and": [
                                        {"$gte": [{"$ifNull": ["$total_visits", 0]}, 2]},
                                        {"$gte": [{"$ifNull": ["$last_visit", ""]}, thirty_days]},
                                        {"$lte": [{"$ifNull": ["$last_visit", ""]}, date_point_iso]}
                                    ]
                                },
                                "then": "active"
                            },
                            {
                                "case": {
                                    "$and": [
                                        {"$lt": [{"$ifNull": ["$last_visit", ""]}, thirty_days]},
                                        {"$gte": [{"$ifNull": ["$last_visit", ""]}, sixty_days]}
                                    ]
                                },
                                "then": "at_risk"
                            },
                            {
                                "case": {
                                    "$and": [
                                        {"$lt": [{"$ifNull": ["$last_visit", ""]}, sixty_days]},
                                        {"$gte": [{"$ifNull": ["$last_visit", ""]}, ninety_days]}
                                    ]
                                },
                                "then": "dormant"
                            }
                        ],
                        "default": "churned"
                    }
                }
            }},
            {"$group": {
                "_id": "$stage",
                "count": {"$sum": 1}
            }}
        ]
        
        results = await db.customers.aggregate(pipeline).to_list(10)
        stage_counts = {r["_id"]: r["count"] for r in results}
        
        trend_data.append({
            "date": date_str,
            "new": stage_counts.get("new", 0),
            "active": stage_counts.get("active", 0),
            "at_risk": stage_counts.get("at_risk", 0),
            "dormant": stage_counts.get("dormant", 0),
            "churned": stage_counts.get("churned", 0)
        })
    
    return {"trend": trend_data}


@router.get("/customer-lifecycle/customers")
async def get_lifecycle_customers(
    stage: str = Query("all", description="Stage: all, new, active, at_risk, dormant, churned"),
    sort_by: str = Query("last_visit", description="Sort by: last_visit, total_spent, total_visits, name"),
    sort_order: str = Query("asc", description="Sort order: asc, desc"),
    search: Optional[str] = Query(None, description="Search by name or phone"),
    limit: int = Query(50, description="Limit"),
    skip: int = Query(0, description="Skip"),
    user: dict = Depends(get_current_user)
):
    """
    Get customers filtered by lifecycle stage.
    """
    user_id = user["id"]
    cutoffs = get_stage_cutoffs()
    
    # Build query based on stage
    query = {"user_id": user_id}
    
    if stage == "new":
        query["total_visits"] = {"$lte": 1}
        query["last_visit"] = {"$gte": cutoffs["thirty_days_ago"]}
    elif stage == "active":
        query["total_visits"] = {"$gte": 2}
        query["last_visit"] = {"$gte": cutoffs["thirty_days_ago"]}
    elif stage == "at_risk":
        query["last_visit"] = {
            "$lt": cutoffs["thirty_days_ago"],
            "$gte": cutoffs["sixty_days_ago"]
        }
    elif stage == "dormant":
        query["last_visit"] = {
            "$lt": cutoffs["sixty_days_ago"],
            "$gte": cutoffs["ninety_days_ago"]
        }
    elif stage == "churned":
        query["$or"] = [
            {"last_visit": {"$lt": cutoffs["ninety_days_ago"]}},
            {"last_visit": None}
        ]
    
    # Search filter
    if search:
        query["$and"] = query.get("$and", [])
        query["$and"].append({
            "$or": [
                {"name": {"$regex": search, "$options": "i"}},
                {"phone": {"$regex": search, "$options": "i"}}
            ]
        })
    
    # Sort
    sort_direction = 1 if sort_order == "asc" else -1
    sort_field_map = {
        "last_visit": "last_visit",
        "total_spent": "total_spent",
        "total_visits": "total_visits",
        "name": "name"
    }
    sort_field = sort_field_map.get(sort_by, "last_visit")
    
    # Get customers
    customers_cursor = db.customers.find(
        query,
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "last_visit": 1, 
         "total_visits": 1, "total_spent": 1, "tier": 1, "created_at": 1}
    ).sort(sort_field, sort_direction).skip(skip).limit(limit)
    
    customers = await customers_cursor.to_list(limit)
    
    # Calculate days since visit and add stage
    now = datetime.now(timezone.utc)
    for c in customers:
        if c.get("last_visit"):
            try:
                last_visit_dt = datetime.fromisoformat(c["last_visit"].replace("Z", "+00:00"))
                if last_visit_dt.tzinfo is None:
                    last_visit_dt = last_visit_dt.replace(tzinfo=timezone.utc)
                c["days_since_visit"] = (now - last_visit_dt).days
            except:
                c["days_since_visit"] = None
        else:
            c["days_since_visit"] = None
        
        # Add stage
        c["stage"] = classify_customer_stage(c, cutoffs)
    
    # Get total count
    total = await db.customers.count_documents(query)
    
    return {
        "customers": customers,
        "total": total
    }


@router.get("/customer-lifecycle/export")
async def export_lifecycle_customers(
    stage: str = Query("all"),
    user: dict = Depends(get_current_user)
):
    """Export lifecycle customers as CSV-ready format"""
    result = await get_lifecycle_customers(
        stage=stage,
        sort_by="last_visit",
        sort_order="asc",
        search=None,
        limit=5000,
        skip=0,
        user=user
    )
    
    return {
        "headers": ["Name", "Phone", "Stage", "Last Visit", "Days Since Visit", "Total Visits", "Total Spent", "Tier"],
        "rows": [
            [
                c.get("name", ""),
                c.get("phone", ""),
                c.get("stage", ""),
                c.get("last_visit", "")[:10] if c.get("last_visit") else "",
                c.get("days_since_visit", ""),
                c.get("total_visits", 0),
                c.get("total_spent", 0),
                c.get("tier", "")
            ]
            for c in result["customers"]
        ]
    }
