"""
CR-078: POS Customer Intelligence Report API — Phase 1
Three read-only aggregated endpoints for POS reporting system.
Auth: verify_pos_auth (X-API-Key) — same as all existing POS endpoints.

Phase 1 endpoints (Q1=b):
  GET /api/pos/reports/summary          — restaurant-wide intelligence snapshot
  GET /api/pos/reports/top-customers    — ranked customer list (stored-field sort)
  GET /api/pos/reports/churn-risk       — win-back target list by band

Phase 2 (deferred per Q3=a):
  GET /api/pos/reports/revenue-intelligence
  GET /api/pos/reports/customer-intelligence/{customer_id}
  sort_by=value_score on top-customers (requires pre-computed crm_value_score field)

Q2=c: Always-fresh — no caching. Add TTL only if performance is measured as a problem.
"""

from fastapi import APIRouter, Depends, Query
from datetime import datetime, timezone, timedelta
from typing import Optional

from core.database import db
from core.auth import verify_pos_auth
from models.schemas import POSResponse

router = APIRouter(prefix="/pos/reports", tags=["POS Reports"])


# ── Inline stage-cutoff helper (mirrors analytics.py:get_stage_cutoffs) ──────
# Inlined here to keep router modules independent (R1 decision from impact analysis).
# Keep in sync with analytics.py if CR-077 threshold logic changes.
def _get_stage_cutoffs(settings: dict = None) -> dict:  # CR-078
    s = settings or {}
    now = datetime.now(timezone.utc)
    active_days = s.get("at_risk_days_start", 31) - 1
    risk_end    = s.get("at_risk_days_end", 60)
    dormant_end = s.get("dormant_days_end", 90)
    new_max_v   = s.get("new_customer_max_visits", 1)
    return {
        "thirty_days_ago": (now - timedelta(days=active_days)).isoformat(),
        "sixty_days_ago":  (now - timedelta(days=risk_end)).isoformat(),
        "ninety_days_ago": (now - timedelta(days=dormant_end)).isoformat(),
        "new_max_visits":  new_max_v,
    }


def _days_ago(iso_str: Optional[str], now: datetime) -> Optional[int]:
    """Parse ISO datetime string and return days elapsed. None if unparseable."""
    if not iso_str:
        return None
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        if not dt.tzinfo:
            dt = dt.replace(tzinfo=timezone.utc)
        return (now - dt).days
    except (ValueError, TypeError):
        return None


# ─────────────────────────────────────────────────────────────────────────────
# E1: GET /api/pos/reports/summary
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/summary", response_model=POSResponse)
async def pos_reports_summary(user: dict = Depends(verify_pos_auth)):  # CR-078 E1
    """
    Restaurant-wide customer intelligence snapshot for POS report screens.
    Covers: customer counts, lifecycle breakdown, tier distribution,
    revenue KPIs, loyalty redemption stats.
    Always-fresh (Q2=c). 3 DB calls (loyalty_settings + customers $facet + orders $facet).
    """
    user_id = user["id"]
    now = datetime.now(timezone.utc)
    thirty_days_ago = (now - timedelta(days=30)).isoformat()
    seven_days_ago  = (now - timedelta(days=7)).isoformat()

    # Stage cutoffs — reads CR-077 per-tenant thresholds from loyalty_settings
    settings = await db.loyalty_settings.find_one({"user_id": user_id}, {"_id": 0}) or {}
    cutoffs  = _get_stage_cutoffs(settings)

    # $switch expression for lifecycle stage classification (mirrors analytics.py pipeline)
    lifecycle_switch = {
        "$switch": {
            "branches": [
                {
                    "case": {
                        "$and": [
                            {"$lte": [{"$ifNull": ["$total_visits", 0]}, cutoffs["new_max_visits"]]},
                            {"$gte": [{"$ifNull": ["$last_visit", ""]}, cutoffs["thirty_days_ago"]]}
                        ]
                    },
                    "then": "new"
                },
                {
                    "case": {
                        "$and": [
                            {"$gte": [{"$ifNull": ["$total_visits", 0]}, cutoffs["new_max_visits"] + 1]},
                            {"$gte": [{"$ifNull": ["$last_visit", ""]}, cutoffs["thirty_days_ago"]]}
                        ]
                    },
                    "then": "active"
                },
                {
                    "case": {
                        "$and": [
                            {"$lt":  [{"$ifNull": ["$last_visit", ""]}, cutoffs["thirty_days_ago"]]},
                            {"$gte": [{"$ifNull": ["$last_visit", ""]}, cutoffs["sixty_days_ago"]]}
                        ]
                    },
                    "then": "at_risk"
                },
                {
                    "case": {
                        "$and": [
                            {"$lt":  [{"$ifNull": ["$last_visit", ""]}, cutoffs["sixty_days_ago"]]},
                            {"$gte": [{"$ifNull": ["$last_visit", ""]}, cutoffs["ninety_days_ago"]]}
                        ]
                    },
                    "then": "dormant"
                },
            ],
            "default": "churned"
        }
    }

    # One $facet pipeline — all customer stats in 1 DB call
    cust_agg = await db.customers.aggregate([
        {"$match": {"user_id": user_id}},
        {"$facet": {
            "total":      [{"$count": "n"}],
            "active_30d": [{"$match": {"last_visit":  {"$gte": thirty_days_ago}}}, {"$count": "n"}],
            "new_7d":     [{"$match": {"created_at":  {"$gte": seven_days_ago}}},  {"$count": "n"}],
            "tiers":      [{"$group": {"_id": "$tier", "count": {"$sum": 1}}}],
            "lifecycle":  [
                {"$addFields": {"_stage": lifecycle_switch}},
                {"$group": {"_id": "$_stage", "count": {"$sum": 1}}}
            ],
            "pts_total":  [{"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$total_points", 0]}}}}],
        }}
    ]).to_list(1)
    cr = cust_agg[0] if cust_agg else {}

    total_customers = cr["total"][0]["n"]        if cr.get("total")     else 0
    active_30d      = cr["active_30d"][0]["n"]   if cr.get("active_30d") else 0
    new_7d          = cr["new_7d"][0]["n"]       if cr.get("new_7d")    else 0
    points_total    = cr["pts_total"][0]["total"] if cr.get("pts_total") else 0

    tiers: dict = {"bronze": 0, "silver": 0, "gold": 0, "platinum": 0}
    for row in cr.get("tiers", []):
        key = (row["_id"] or "bronze").lower()
        tiers[key] = tiers.get(key, 0) + row["count"]

    lifecycle: dict = {"new": 0, "active": 0, "at_risk": 0, "dormant": 0, "churned": 0}
    for row in cr.get("lifecycle", []):
        stage = row["_id"] or "churned"
        lifecycle[stage] = lifecycle.get(stage, 0) + row["count"]

    # One $facet pipeline — all order stats in 1 DB call
    ord_agg = await db.orders.aggregate([
        {"$match": {"user_id": user_id}},
        {"$facet": {
            "all_time": [{"$group": {
                "_id":     None,
                "revenue": {"$sum": {"$ifNull": ["$order_amount", 0]}},
                "orders":  {"$sum": 1},
                "avg":     {"$avg": {"$ifNull": ["$order_amount", 0]}},
            }}],
            "last_30d": [
                {"$match": {"created_at": {"$gte": thirty_days_ago}}},
                {"$group": {
                    "_id":     None,
                    "revenue": {"$sum": {"$ifNull": ["$order_amount", 0]}},
                    "orders":  {"$sum": 1},
                    "avg":     {"$avg": {"$ifNull": ["$order_amount", 0]}},
                }}
            ],
            "with_redemption": [
                {"$match": {"loyalty_points_used": {"$gt": 0}}},
                {"$count": "n"}
            ],
        }}
    ]).to_list(1)
    orr = ord_agg[0] if ord_agg else {}

    at  = orr["all_time"][0] if orr.get("all_time") else {}
    l30 = orr["last_30d"][0] if orr.get("last_30d") else {}
    total_orders        = int(at.get("orders",  0) or 0)
    total_revenue       = round(float(at.get("revenue", 0) or 0), 2)
    avg_order_value     = round(float(at.get("avg",     0) or 0), 2)
    revenue_30d         = round(float(l30.get("revenue", 0) or 0), 2)
    avg_order_value_30d = round(float(l30.get("avg",     0) or 0), 2)
    with_redemption     = orr["with_redemption"][0]["n"] if orr.get("with_redemption") else 0
    redemption_pct      = round(with_redemption / total_orders * 100, 1) if total_orders > 0 else 0.0

    return POSResponse(
        success=True,
        message="Summary retrieved",
        data={
            "as_of": now.isoformat(),
            "customers": {
                "total":      total_customers,
                "active_30d": active_30d,
                "new_7d":     new_7d,
            },
            "lifecycle": lifecycle,
            "tiers":     tiers,
            "revenue": {
                "total":               total_revenue,
                "total_orders":        total_orders,
                "avg_order_value":     avg_order_value,
                "revenue_30d":         revenue_30d,
                "avg_order_value_30d": avg_order_value_30d,
            },
            "loyalty": {
                "orders_with_redemption_pct": redemption_pct,
                "points_outstanding":         int(points_total),
            },
        }
    )


# ─────────────────────────────────────────────────────────────────────────────
# E2: GET /api/pos/reports/top-customers
# ─────────────────────────────────────────────────────────────────────────────

_VALID_SORTS = {"total_spent", "total_visits", "total_points"}  # CR-078 Q3=a: no value_score


@router.get("/top-customers", response_model=POSResponse)
async def pos_reports_top_customers(  # CR-078 E2
    limit:   int  = Query(default=20, ge=1, le=100),
    sort_by: str  = Query(default="total_spent"),
    user:    dict = Depends(verify_pos_auth),
):
    """
    Ranked customer list sorted by a stored field.
    sort_by options: total_spent (default), total_visits, total_points.
    sort_by=value_score is NOT supported in Phase 1 (Q3=a — deferred to Phase 2).
    Invalid sort_by silently falls back to total_spent (no 422 error).
    Always-fresh (Q2=c). 1 DB call.
    """
    user_id    = user["id"]
    sort_field = sort_by if sort_by in _VALID_SORTS else "total_spent"
    now        = datetime.now(timezone.utc)

    raw = await db.customers.find(
        {"user_id": user_id},
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "tier": 1,
         "total_visits": 1, "total_spent": 1, "avg_order_value": 1, "last_visit": 1}
    ).sort(sort_field, -1).limit(limit).to_list(limit)

    customers = [
        {
            "customer_id":         c["id"],
            "name":                c.get("name", ""),
            "phone":               c.get("phone", ""),
            "tier":                c.get("tier", "Bronze"),
            "total_visits":        int(c.get("total_visits", 0)     or 0),
            "total_spent":         round(float(c.get("total_spent", 0)     or 0), 2),
            "avg_order_value":     round(float(c.get("avg_order_value", 0) or 0), 2),
            "last_visit_days_ago": _days_ago(c.get("last_visit"), now),
        }
        for c in raw
    ]

    return POSResponse(
        success=True,
        message=f"Top {len(customers)} customers by {sort_field}",
        data={"customers": customers, "total": len(customers), "sort_by": sort_field},
    )


# ─────────────────────────────────────────────────────────────────────────────
# E3: GET /api/pos/reports/churn-risk
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/churn-risk", response_model=POSResponse)
async def pos_reports_churn_risk(  # CR-078 E3
    band:  str = Query(default="high"),
    limit: int = Query(default=50, ge=1, le=200),
    user:  dict = Depends(verify_pos_auth),
):
    """
    Win-back target list by churn-risk band.
      high   = at_risk stage  (31–60 days since last visit, CR-077 configurable)
      medium = dormant stage  (61–90 days since last visit, CR-077 configurable)
    Uses per-tenant lifecycle thresholds from loyalty_settings (CR-077).
    Sorted oldest-first (most urgent win-back first).
    Always-fresh (Q2=c). 3 DB calls (loyalty_settings + count + find).
    """
    if band not in ("high", "medium"):
        return POSResponse(success=False, message="band must be 'high' or 'medium'", data=None)

    user_id = user["id"]
    now     = datetime.now(timezone.utc)

    settings = await db.loyalty_settings.find_one({"user_id": user_id}, {"_id": 0}) or {}
    cutoffs  = _get_stage_cutoffs(settings)

    if band == "high":
        last_visit_filter = {"$lt": cutoffs["thirty_days_ago"], "$gte": cutoffs["sixty_days_ago"]}
    else:  # medium
        last_visit_filter = {"$lt": cutoffs["sixty_days_ago"],  "$gte": cutoffs["ninety_days_ago"]}

    query = {"user_id": user_id, "last_visit": last_visit_filter}
    total = await db.customers.count_documents(query)

    raw = await db.customers.find(
        query,
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "tier": 1,
         "last_visit": 1, "total_spent": 1, "total_visits": 1}
    ).sort("last_visit", 1).limit(limit).to_list(limit)

    customers = [
        {
            "customer_id":         c["id"],
            "name":                c.get("name", ""),
            "phone":               c.get("phone", ""),
            "tier":                c.get("tier", "Bronze"),
            "last_visit_days_ago": _days_ago(c.get("last_visit"), now),
            "total_spent":         round(float(c.get("total_spent",  0) or 0), 2),
            "total_visits":        int(c.get("total_visits", 0) or 0),
        }
        for c in raw
    ]

    return POSResponse(
        success=True,
        message=f"Churn risk {band} — {total} customers",
        data={"band": band, "count": total, "customers": customers},
    )
