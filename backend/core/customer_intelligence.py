"""
POS-CRM Customer Intelligence Module
CR: POS-CRM Customer Cross-Sell / Order Suggestions API
Sprint: ROI Measurement for CRM
Status: pos_crm_cross_sell_phase_1_v1_1

Phase 1 v1.1 changes (POS feedback):
  P-03: Added currency field to customer_summary
  Q-02: available_coupons_count now per-customer (filters per_user_limit + max_applications)
  P-04: cross_sell_items[].title → name
  Q-04: Added compute_item_notes_batch for all cart items in one call

Pure computation — all functions take db + user_id + customer_id, return dicts.
No HTTP, no Pydantic, no auth. Read-only against all collections.
"""

from datetime import datetime, timezone, timedelta
from typing import Optional
import math


async def compute_customer_summary(db, user_id: str, customer_id: str, customer: dict) -> dict:
    """Build the customer_summary block from the pre-fetched customer doc + coupon count.
    Q-02 fix: available_coupons_count is now per-customer (filters per_user_limit + max_applications)."""
    now = datetime.now(timezone.utc)

    # Fetch all active, non-expired coupons for this restaurant
    coupon_filter = {
        "user_id": user_id,
        "is_active": True,
        "$or": [
            {"end_date": {"$exists": False}},
            {"end_date": None},
            {"end_date": {"$gte": now.isoformat()}},
        ],
    }
    all_coupons = await db.coupons.find(coupon_filter, {"_id": 0, "id": 1, "per_user_limit": 1, "max_applications": 1}).to_list(length=None)

    # Bulk fetch this customer's usage counts grouped by coupon_id
    usage_pipeline = [
        {"$match": {"customer_id": customer_id, "user_id": user_id}},
        {"$group": {"_id": "$coupon_id", "count": {"$sum": 1}}},
    ]
    usage_rows = await db.coupon_usage.aggregate(usage_pipeline).to_list(length=None)
    usage_by_coupon = {r["_id"]: r["count"] for r in usage_rows}

    # Bulk fetch total usage counts for coupons that have max_applications
    coupons_with_cap = [c["id"] for c in all_coupons if c.get("max_applications")]
    total_usage_by_coupon = {}
    if coupons_with_cap:
        total_pipeline = [
            {"$match": {"coupon_id": {"$in": coupons_with_cap}, "user_id": user_id}},
            {"$group": {"_id": "$coupon_id", "count": {"$sum": 1}}},
        ]
        total_rows = await db.coupon_usage.aggregate(total_pipeline).to_list(length=None)
        total_usage_by_coupon = {r["_id"]: r["count"] for r in total_rows}

    # Filter: exclude coupons where per_user_limit or max_applications is hit
    available_count = 0
    for c in all_coupons:
        cid = c.get("id")
        per_user = c.get("per_user_limit")
        if per_user and per_user > 0:
            if usage_by_coupon.get(cid, 0) >= per_user:
                continue
        max_app = c.get("max_applications")
        if max_app and max_app > 0:
            if total_usage_by_coupon.get(cid, 0) >= max_app:
                continue
        available_count += 1

    return {
        "name": customer.get("name", ""),
        "phone": customer.get("phone", ""),
        "tier": customer.get("tier", "Bronze"),
        "visits": customer.get("total_visits", 0) or 0,
        "gross_spend": round(float(customer.get("total_spent", 0) or 0), 2),
        "net_spend": round(float(customer.get("total_spent", 0) or 0), 2),
        "last_visit_at": customer.get("last_visit"),
        "loyalty_points": customer.get("total_points", 0) or 0,
        "wallet_balance": round(float(customer.get("wallet_balance", 0) or 0), 2),
        "available_coupons_count": available_count,
        "currency": "INR",
    }


async def _get_restaurant_stats(db, user_id: str) -> dict:
    """Compute restaurant-wide benchmarks. Lightweight: uses customers collection only."""
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {
            "_id": None,
            "max_spend": {"$max": {"$ifNull": ["$total_spent", 0]}},
            "total_customers": {"$sum": 1},
            "avg_spend": {"$avg": {"$ifNull": ["$total_spent", 0]}},
            "avg_visits": {"$avg": {"$ifNull": ["$total_visits", 0]}},
            "max_visits": {"$max": {"$ifNull": ["$total_visits", 0]}},
        }},
    ]
    stats = await db.customers.aggregate(pipeline).to_list(1)
    s = stats[0] if stats else {}

    total_custs = max(int(s.get("total_customers", 1) or 1), 1)
    max_spend = max(float(s.get("max_spend", 1) or 1), 1)
    avg_spend = max(float(s.get("avg_spend", 1) or 1), 0.01)
    avg_visits = max(float(s.get("avg_visits", 1) or 1), 0.01)
    max_visits = max(int(s.get("max_visits", 1) or 1), 1)
    avg_aov = avg_spend / avg_visits if avg_visits > 0 else 1

    return {
        "max_spend": max_spend,
        "total_customers": total_custs,
        "avg_visits": avg_visits,
        "avg_aov": max(avg_aov, 0.01),
        "max_order_count": max_visits,
    }


def _parse_datetime(val) -> Optional[datetime]:
    """Parse a datetime value from various formats."""
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    if isinstance(val, str):
        for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S.%f%z",
                    "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S.%f"):
            try:
                d = datetime.strptime(val, fmt)
                return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
            except ValueError:
                continue
    return None


async def compute_customer_value(
    db, user_id: str, customer_id: str, customer: dict,
    settings: dict = None   # CR-077: per-tenant band thresholds
) -> Optional[dict]:
    """5-factor composite value score (0-100) + churn risk. None for <=1 visit."""
    visits = int(customer.get("total_visits", 0) or 0)
    if visits <= 1:
        return None

    total_spent = float(customer.get("total_spent", 0) or 0)
    now = datetime.now(timezone.utc)

    lv = _parse_datetime(customer.get("last_visit"))
    days_since_last = max((now - lv).days, 0) if lv else 365

    stats = await _get_restaurant_stats(db, user_id)

    customer_aov = total_spent / max(visits, 1)

    ca = _parse_datetime(customer.get("created_at"))
    months_active = max((now - ca).days / 30.0, 1) if ca else 6

    freq_per_month = visits / max(months_active, 1)
    max_freq = stats["max_order_count"] / max(months_active, 1)

    spend_score = min((total_spent / stats["max_spend"]) * 100, 100)
    freq_score = min((freq_per_month / max(max_freq, 0.01)) * 100, 100)
    recency_score = max(0, 100 - (days_since_last / 180) * 100)
    aov_score = min((customer_aov / stats["avg_aov"]) * 100, 100)

    # Consistency
    consistency_score = 50
    if visits >= 3:
        recent_orders = await db.orders.find(
            {"customer_id": customer_id, "user_id": user_id},
            {"_id": 0, "created_at": 1},
        ).sort("created_at", -1).limit(20).to_list(20)

        dates = [d for o in recent_orders if (d := _parse_datetime(o.get("created_at")))]
        if len(dates) >= 3:
            dates.sort()
            gaps = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
            mean_gap = sum(gaps) / len(gaps) if gaps else 1
            if mean_gap > 0:
                variance = sum((g - mean_gap) ** 2 for g in gaps) / len(gaps)
                cv = math.sqrt(variance) / mean_gap
                consistency_score = max(0, min(100, (1 - cv) * 100))

    composite = (
        0.30 * spend_score + 0.25 * freq_score + 0.20 * recency_score
        + 0.15 * aov_score + 0.10 * consistency_score
    )
    composite = max(0, min(100, round(composite, 1)))

    # CR-077: configurable band thresholds (defaults = previous hardcoded values)
    _s = settings or {}
    _vip_min = _s.get("vip_score_min", 80)
    _hi_min  = _s.get("high_score_min", 60)
    _med_min = _s.get("medium_score_min", 35)
    band = ("vip"    if composite >= _vip_min else
            "high"   if composite >= _hi_min  else
            "medium" if composite >= _med_min else "low")

    churn_score = await _compute_churn_risk(db, user_id, customer_id, customer, days_since_last, freq_per_month, settings)
    churn_risk = "high" if churn_score > 0.7 else "medium" if churn_score >= 0.4 else "low"

    return {
        "score": composite,
        "band": band,
        "avg_order_value": round(customer_aov, 2),
        "frequency_per_month": round(freq_per_month, 2),
        "recency_days": days_since_last,
        "churn_risk": churn_risk,
        "win_back_recommendation": churn_score > 0.7,
    }


async def _compute_churn_risk(db, user_id: str, customer_id: str, customer: dict,
                               days_since_last: int, freq_per_month: float,
                               settings: dict = None) -> float:  # CR-077: settings param
    """4-factor churn risk model. Returns 0-1."""
    now = datetime.now(timezone.utc)
    visits = int(customer.get("total_visits", 0) or 0)

    avg_gap_days = 30.0 / max(freq_per_month, 0.01)
    recency_factor = min(max((days_since_last - avg_gap_days) / max(avg_gap_days, 1), 0), 1) if avg_gap_days > 0 else 0

    freq_factor = 0
    if visits >= 3:
        d30 = (now - timedelta(days=30)).isoformat()
        d60 = (now - timedelta(days=60)).isoformat()
        recent_count = await db.orders.count_documents(
            {"customer_id": customer_id, "user_id": user_id, "created_at": {"$gte": d30}})
        prior_count = await db.orders.count_documents(
            {"customer_id": customer_id, "user_id": user_id,
             "created_at": {"$gte": d60, "$lt": d30}})
        if prior_count > 0:
            freq_factor = min(max((prior_count - recent_count) / prior_count, 0), 1)
        elif recent_count == 0:
            freq_factor = 1.0

    spend_factor = 0
    if visits >= 6:
        recent_orders = await db.orders.find(
            {"customer_id": customer_id, "user_id": user_id},
            {"_id": 0, "order_amount": 1},
        ).sort("created_at", -1).limit(6).to_list(6)
        if len(recent_orders) >= 6:
            recent_aov = sum(float(o.get("order_amount", 0) or 0) for o in recent_orders[:3]) / 3
            prior_aov = sum(float(o.get("order_amount", 0) or 0) for o in recent_orders[3:6]) / 3
            if prior_aov > 0:
                spend_factor = min(max((prior_aov - recent_aov) / prior_aov, 0), 1)

    # CR-077: use configurable dormant_days_end instead of hardcoded 90 (hidden dependency fix)
    _dormant_end = float((settings or {}).get("dormant_days_end", 90))
    absolute_factor = min(days_since_last / _dormant_end, 1.0)

    return min(max(0.40 * recency_factor + 0.30 * freq_factor + 0.20 * spend_factor + 0.10 * absolute_factor, 0), 1)


async def compute_order_patterns(db, user_id: str, customer_id: str) -> dict:
    """Top items, top categories, avg items/order, usual channel, usual time of day."""
    item_pipeline = [
        {"$match": {"customer_id": customer_id, "user_id": user_id}},
        {"$group": {
            "_id": {"item_name": "$item_name", "pos_food_id": "$pos_food_id"},
            "order_count": {"$sum": "$item_qty"},
            "last_ordered_at": {"$max": "$created_at"},
        }},
        {"$sort": {"order_count": -1}},
        {"$limit": 5},
        {"$project": {"_id": 0, "item_id": "$_id.pos_food_id", "name": "$_id.item_name",
                       "order_count": 1, "last_ordered_at": 1}},
    ]
    top_items = await db.order_items.aggregate(item_pipeline).to_list(5)

    cat_pipeline = [
        {"$match": {"customer_id": customer_id, "user_id": user_id}},
        {"$group": {"_id": "$item_category", "order_count": {"$sum": "$item_qty"}}},
        {"$sort": {"order_count": -1}},
        {"$limit": 5},
        {"$project": {"_id": 0, "category": {"$toString": "$_id"}, "order_count": 1}},
    ]
    top_categories = await db.order_items.aggregate(cat_pipeline).to_list(5)

    order_agg = await db.orders.aggregate([
        {"$match": {"customer_id": customer_id, "user_id": user_id}},
        {"$group": {
            "_id": None,
            "total_orders": {"$sum": 1},
            "channels": {"$push": "$order_type"},
            "times": {"$push": "$order_created_at"},
        }},
    ]).to_list(1)

    avg_items = 0
    usual_channel = None
    usual_time = None

    if order_agg:
        agg = order_agg[0]
        total_orders = max(agg.get("total_orders", 1) or 1, 1)
        item_count = await db.order_items.count_documents({"customer_id": customer_id, "user_id": user_id})
        avg_items = round(item_count / total_orders, 1)

        channels = [c for c in agg.get("channels", []) if c]
        if channels:
            usual_channel = max(set(channels), key=channels.count)

        times = agg.get("times", [])
        buckets = []
        for t in times:
            if isinstance(t, str):
                try:
                    hour = int(t.split(" ")[1].split(":")[0]) if " " in t else None
                    if hour is not None:
                        buckets.append("late_night" if hour < 6 else "morning" if hour < 12
                                       else "afternoon" if hour < 17 else "evening" if hour < 21 else "night")
                except (ValueError, IndexError):
                    pass
        if buckets:
            usual_time = max(set(buckets), key=buckets.count)

    return {
        "top_items": top_items,
        "top_categories": top_categories,
        "avg_items_per_order": avg_items,
        "usual_channel": usual_channel,
        "usual_time_of_day": usual_time,
    }


async def compute_customer_notes(db, user_id: str, customer_id: str, limit: int = 5) -> list:
    """Top N order-level notes. Mirrors pos.py L2765-L2776 with $limit."""
    pipeline = [
        {"$match": {"customer_id": customer_id, "user_id": user_id,
                     "order_notes": {"$exists": True, "$nin": [None, ""]}}},
        {"$addFields": {"note_lower": {"$toLower": "$order_notes"}}},
        {"$group": {
            "_id": "$note_lower",
            "count": {"$sum": 1},
            "last_used": {"$max": "$created_at"},
            "original_note": {"$first": "$order_notes"},
        }},
        {"$sort": {"count": -1}},
        {"$limit": limit},
        {"$project": {"_id": 0, "text": "$original_note", "used_count": "$count",
                       "last_used_at": "$last_used", "source": {"$literal": "history"}}},
    ]
    return await db.orders.aggregate(pipeline).to_list(limit)


async def compute_item_notes(db, user_id: str, customer_id: str, selected_item_id: str, limit: int = 5) -> list:
    """Item-level notes for a specific item. Mirrors pos.py L2724-L2739."""
    pipeline = [
        {"$match": {"customer_id": customer_id, "user_id": user_id,
                     "pos_food_id": selected_item_id,
                     "item_notes": {"$nin": [None, ""]}}},
        {"$addFields": {"note_lower": {"$toLower": "$item_notes"}}},
        {"$group": {
            "_id": "$note_lower",
            "count": {"$sum": 1},
            "last_used": {"$max": "$created_at"},
            "original_note": {"$first": "$item_notes"},
        }},
        {"$sort": {"count": -1}},
        {"$limit": limit},
        {"$project": {"_id": 0, "item_id": {"$literal": selected_item_id},
                       "text": "$original_note", "used_count": "$count",
                       "last_used_at": "$last_used", "source": {"$literal": "history"}}},
    ]
    return await db.order_items.aggregate(pipeline).to_list(limit)


async def compute_item_notes_batch(db, user_id: str, customer_id: str,
                                    item_ids: list, limit_per_item: int = 5) -> dict:
    """Q-04: Item-level notes for ALL cart items in one DB call. Returns {item_id: [notes]}."""
    if not item_ids:
        return {}
    pipeline = [
        {"$match": {"customer_id": customer_id, "user_id": user_id,
                     "pos_food_id": {"$in": item_ids},
                     "item_notes": {"$nin": [None, ""]}}},
        {"$addFields": {"note_lower": {"$toLower": "$item_notes"}}},
        {"$group": {
            "_id": {"item": "$pos_food_id", "note": "$note_lower"},
            "count": {"$sum": 1},
            "last_used": {"$max": "$created_at"},
            "original_note": {"$first": "$item_notes"},
        }},
        {"$sort": {"count": -1}},
        {"$group": {
            "_id": "$_id.item",
            "notes": {"$push": {
                "text": "$original_note", "used_count": "$count",
                "last_used_at": "$last_used", "source": {"$literal": "history"},
            }},
        }},
        {"$project": {"_id": 0, "item_id": "$_id",
                       "notes": {"$slice": ["$notes", limit_per_item]}}},
    ]
    rows = await db.order_items.aggregate(pipeline).to_list(len(item_ids))
    result = {iid: [] for iid in item_ids}
    for row in rows:
        result[row["item_id"]] = row["notes"]
    return result


async def compute_cross_sell(db, user_id: str, customer_id: str,
                              cart_item_ids: list, limit: int = 3) -> list:
    """Hybrid cross-sell: 60% personal + 40% restaurant-wide. Excludes cart items."""
    cart_set = set(cart_item_ids or [])
    suggestions = {}

    # Customer's recent orders
    customer_orders = await db.orders.find(
        {"customer_id": customer_id, "user_id": user_id}, {"_id": 0, "id": 1},
    ).sort("created_at", -1).limit(100).to_list(100)
    customer_order_ids = [o["id"] for o in customer_orders]

    if customer_order_ids:
        baskets = await db.order_items.aggregate([
            {"$match": {"order_id": {"$in": customer_order_ids}, "user_id": user_id}},
            {"$group": {"_id": "$order_id",
                        "items": {"$push": {"id": "$pos_food_id", "name": "$item_name"}}}},
        ]).to_list(100)

        total_cust_orders = len(baskets)
        item_freq = {}
        for basket in baskets:
            seen = set()
            for item in basket.get("items", []):
                iid = item.get("id")
                if iid and iid not in seen:
                    seen.add(iid)
                    if iid not in item_freq:
                        item_freq[iid] = {"count": 0, "name": item.get("name", "")}
                    item_freq[iid]["count"] += 1

        for iid, info in item_freq.items():
            if iid and iid not in cart_set:
                conf = info["count"] / max(total_cust_orders, 1)
                suggestions[iid] = {"name": info["name"], "personal": conf, "restaurant": 0,
                                    "p_reason": f"Ordered in {info['count']} of {total_cust_orders} visits",
                                    "r_reason": ""}

    # Restaurant-wide co-occurrence for cart items (optimized: no $lookup)
    if cart_set:
        # Find order_ids that contain cart items, then find sibling items
        cart_order_ids_cursor = db.order_items.find(
            {"user_id": user_id, "pos_food_id": {"$in": list(cart_set)}},
            {"_id": 0, "order_id": 1},
        ).limit(500)
        cart_oids = list({doc["order_id"] async for doc in cart_order_ids_cursor})

        if cart_oids:
            siblings = await db.order_items.aggregate([
                {"$match": {"order_id": {"$in": cart_oids}, "user_id": user_id,
                            "pos_food_id": {"$nin": list(cart_set)}}},
                {"$group": {"_id": "$pos_food_id", "count": {"$sum": 1},
                            "name": {"$first": "$item_name"}}},
                {"$sort": {"count": -1}},
                {"$limit": 10},
            ]).to_list(10)

            total_with_cart = max(len(cart_oids), 1)
            for item in siblings:
                iid = item.get("_id")
                if iid and iid not in cart_set:
                    conf = item["count"] / total_with_cart
                    if iid not in suggestions:
                        suggestions[iid] = {"name": item.get("name", ""), "personal": 0, "restaurant": 0,
                                            "p_reason": "", "r_reason": ""}
                    suggestions[iid]["restaurant"] = conf
                    suggestions[iid]["r_reason"] = f"Popular combo across restaurant ({item['count']} co-orders)"

    results = []
    for iid, info in suggestions.items():
        blended = 0.6 * info["personal"] + 0.4 * info["restaurant"]
        if blended < 0.05:
            continue
        source = "history" if info["personal"] > info["restaurant"] else "restaurant"
        reason = info["p_reason"] if info["personal"] >= info["restaurant"] else info["r_reason"]
        results.append({"item_id": iid, "name": info["name"], "reason": reason or "Frequently ordered",
                         "source": source, "confidence": round(blended, 2)})

    results.sort(key=lambda x: x["confidence"], reverse=True)
    return results[:limit]
