from datetime import datetime, timezone, timedelta
import qrcode
import io
import base64
from core.database import db as _db  # CR-033: needed for P2 cross-collection lookups

def calculate_tier(total_points: int, settings: dict) -> str:
    """CR-001C-L Phase L1 (F1, 2026-05-22): re-export shim.

    Authoritative implementation lives in `core.loyalty.calculate_tier`.
    Kept here so existing callers (`routers/points.py`, `routers/pos.py`,
    `routers/scan.py`, `core/loyalty_jobs.py`) continue to import from
    `core.helpers` without churn. Behavior is byte-identical.
    """
    # Local import to avoid circular dependency
    # (core.loyalty imports from core.helpers for check_off_peak_bonus
    # and get_earn_percent_for_tier).
    from core.loyalty import calculate_tier as _calculate_tier
    return _calculate_tier(total_points, settings)

def get_earn_percent_for_tier(tier: str, settings: dict) -> float:
    """Get earning percentage based on customer tier"""
    tier_percents = {
        "Bronze": settings.get('bronze_earn_percent', 5.0),
        "Silver": settings.get('silver_earn_percent', 7.0),
        "Gold": settings.get('gold_earn_percent', 10.0),
        "Platinum": settings.get('platinum_earn_percent', 15.0)
    }
    return tier_percents.get(tier, 5.0)


def get_redemption_value_for_tier(tier: str, settings: dict) -> float:
    """CR-001C-LX Phase LX-A (2026-05-22): resolve rupees-per-point for a tier.

    Resolution order:
      1. settings.{tier.lower()}_redemption_value  (per-tier override)
      2. settings.redemption_value                 (restaurant-level)
      3. 0.25                                      (legacy hardcoded fallback)
    """
    if not settings:
        return 0.25
    per_tier = settings.get(f"{tier.lower()}_redemption_value")
    if per_tier is not None:
        return float(per_tier)
    rest = settings.get("redemption_value")
    if rest is not None:
        return float(rest)
    return 0.25

def _safe_int(val, default=0):
    """Safely cast to int. Returns default on None, non-numeric strings, etc."""
    if val is None:
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default

def _safe_float(val, default=0.0):
    """Safely cast to float. Returns default on None, non-numeric strings, etc."""
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _coerce_pos_id(val):
    """
    CR-001B-fix Phase 2B F3/F4/F5: Coerce a POS ID (pos_order_id, pos_food_id, pos_customer_id)
    to a string for consistent storage.

    Returns:
        str  — string form of the value
        None — if input is None or empty string (caller must decide how to handle)
    """
    if val is None:
        return None
    if isinstance(val, str) and val == "":
        return None
    return str(val)


def _pos_id_query_variants(val):
    """
    CR-001B-fix Phase 2B F3/F4/F5: Build a list of both string and original numeric
    variants for a POS ID, so a MongoDB lookup using `{"$in": variants}` matches both
    legacy int-typed rows and new str-typed rows during the transition window.

    Returns:
        list — e.g. ["538530", 538530] for numeric inputs, or ["abc123"] for non-numeric.
        None — if input is None / empty (caller must guard).
    """
    if val is None:
        return None
    if isinstance(val, str) and val == "":
        return None
    s = str(val)
    variants = [s]
    # If the string form is purely an int, also include the int form for legacy rows.
    try:
        i = int(s)
        if i not in variants:
            variants.append(i)
    except (ValueError, TypeError):
        pass
    return variants

def generate_qr_code(data: str) -> str:
    """Generate QR code as base64 string"""
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    return base64.b64encode(buffer.getvalue()).decode()

def check_birthday_bonus(customer: dict, settings: dict) -> tuple:
    """Check if customer is eligible for birthday bonus"""
    if not settings.get('birthday_bonus_enabled', False):
        return False, 0, ""
    
    if not customer.get('dob'):
        return False, 0, ""
    
    try:
        dob_str = customer['dob']
        dob = datetime.fromisoformat(dob_str.replace('Z', '+00:00'))
        today = datetime.now(timezone.utc)
        
        # Create birthday for this year
        birthday_this_year = dob.replace(year=today.year)
        
        # Check if within bonus window
        days_before = settings.get('birthday_bonus_days_before', 0)
        days_after = settings.get('birthday_bonus_days_after', 7)
        
        start_date = birthday_this_year - timedelta(days=days_before)
        end_date = birthday_this_year + timedelta(days=days_after)
        
        if start_date <= today <= end_date:
            bonus_points = settings.get('birthday_bonus_points', 100)
            return True, bonus_points, "Birthday bonus! Happy Birthday"
    except Exception:
        pass
    
    return False, 0, ""

def check_anniversary_bonus(customer: dict, settings: dict) -> tuple:
    """Check if customer is eligible for anniversary bonus"""
    if not settings.get('anniversary_bonus_enabled', False):
        return False, 0, ""
    
    if not customer.get('anniversary'):
        return False, 0, ""
    
    try:
        anniversary = datetime.fromisoformat(customer['anniversary'].replace('Z', '+00:00'))
        today = datetime.now(timezone.utc)
        
        # Create anniversary for this year
        anniversary_this_year = anniversary.replace(year=today.year)
        
        # Check if within bonus window
        days_before = settings.get('anniversary_bonus_days_before', 0)
        days_after = settings.get('anniversary_bonus_days_after', 7)
        
        start_date = anniversary_this_year - timedelta(days=days_before)
        end_date = anniversary_this_year + timedelta(days=days_after)
        
        if start_date <= today <= end_date:
            bonus_points = settings.get('anniversary_bonus_points', 150)
            return True, bonus_points, "Anniversary bonus! Happy Anniversary"
    except Exception:
        pass
    
    return False, 0, ""

def check_first_visit_bonus(customer: dict, settings: dict) -> tuple:
    """Check if customer is eligible for first visit bonus"""
    if not settings.get('first_visit_bonus_enabled', False):
        return False, 0, ""
    
    if customer.get('total_visits', 0) == 0:
        bonus_points = settings.get('first_visit_bonus_points', 50)
        return True, bonus_points, "Welcome bonus! Thanks for your first visit"
    
    return False, 0, ""

def check_off_peak_bonus(settings: dict) -> tuple:
    """Check if current time is in off-peak hours and return bonus multiplier or flat amount"""
    if not settings.get('off_peak_bonus_enabled', False):
        return False, 1.0, "multiplier", ""
    
    try:
        now = datetime.now(timezone.utc)
        # Convert to local time (assuming IST for Indian restaurants)
        local_time = now + timedelta(hours=5, minutes=30)  # IST offset
        current_time = local_time.strftime("%H:%M")
        
        start_time = settings.get('off_peak_start_time', '14:00')
        end_time = settings.get('off_peak_end_time', '17:00')
        
        if start_time <= current_time <= end_time:
            bonus_type = settings.get('off_peak_bonus_type', 'multiplier')
            bonus_value = settings.get('off_peak_bonus_value', 2.0)
            
            if bonus_type == 'multiplier':
                message = f"Off-peak hours bonus! {bonus_value}x points"
            else:
                message = f"Off-peak hours bonus! +{int(bonus_value)} points"
            
            return True, bonus_value, bonus_type, message
    except Exception:
        pass
    
    return False, 1.0, "multiplier", ""

async def build_customer_query(user_id: str, filters: dict) -> dict:
    """Build MongoDB query from filter dictionary.
    CR-033: extended to 20 filter dimensions (P0 bug-A fixes + P1 + cheap P2).
    Made async for P2 cross-collection lookups against whatsapp_message_logs.
    CR-034 tags block will be added in the next phase.
    """
    query = {"user_id": user_id}

    # ── EXISTING 14 DIMENSIONS (unchanged) ─────────────────────────────────
    # Tier filter
    if filters.get("tier") and filters["tier"] != "all":
        query["tier"] = {"$in": filters["tier"]} if isinstance(filters["tier"], list) else filters["tier"]

    # City filter
    if filters.get("city") and filters["city"] != "all":
        query["city"] = {"$in": filters["city"]} if isinstance(filters["city"], list) else filters["city"]

    # Customer type filter
    if filters.get("customer_type") and filters["customer_type"] != "all":
        query["customer_type"] = filters["customer_type"]

    # Last visit days (inactive filter)
    if filters.get("last_visit_days") and filters["last_visit_days"] != "all":
        try:
            days = int(filters["last_visit_days"])
            cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
            query["last_visit"] = {"$lt": cutoff_date}
        except (ValueError, TypeError):
            pass

    # Points range
    if filters.get("points_min") is not None:
        query["total_points"] = query.get("total_points", {})
        query["total_points"]["$gte"] = filters["points_min"]
    if filters.get("points_max") is not None:
        query["total_points"] = query.get("total_points", {})
        query["total_points"]["$lte"] = filters["points_max"]

    # Visits range (numeric)
    if filters.get("visits_min") is not None:
        query["total_visits"] = query.get("total_visits", {})
        query["total_visits"]["$gte"] = filters["visits_min"]
    if filters.get("visits_max") is not None:
        query["total_visits"] = query.get("total_visits", {})
        query["total_visits"]["$lte"] = filters["visits_max"]

    # Visits filter (string-based bucket)
    total_visits = filters.get("total_visits")
    if total_visits and total_visits != "all":
        if total_visits == "0":
            query["total_visits"] = 0
        elif total_visits == "1-5":
            query["total_visits"] = {"$gte": 1, "$lte": 5}
        elif total_visits == "6-10":
            query["total_visits"] = {"$gte": 6, "$lte": 10}
        elif total_visits == "10+":
            query["total_visits"] = {"$gt": 10}

    # Total spent filter (string-based bucket)
    total_spent_filter = filters.get("total_spent")
    if total_spent_filter and total_spent_filter != "all":
        if total_spent_filter == "0-500":
            query["total_spent"] = {"$lt": 500}
        elif total_spent_filter == "500-2000":
            query["total_spent"] = {"$gte": 500, "$lte": 2000}
        elif total_spent_filter == "2000-5000":
            query["total_spent"] = {"$gte": 2000, "$lte": 5000}
        elif total_spent_filter == "5000-10000":
            query["total_spent"] = {"$gte": 5000, "$lte": 10000}
        elif total_spent_filter == "10000+":
            query["total_spent"] = {"$gte": 10000}

    # Spent range (numeric)
    if filters.get("spent_min") is not None:
        query["total_spent"] = query.get("total_spent", {})
        query["total_spent"]["$gte"] = filters["spent_min"]
    if filters.get("spent_max") is not None:
        query["total_spent"] = query.get("total_spent", {})
        query["total_spent"]["$lte"] = filters["spent_max"]

    # Dietary preference
    if filters.get("dietary"):
        query["dietary"] = {"$in": filters["dietary"]} if isinstance(filters["dietary"], list) else filters["dietary"]

    # Allergies
    if filters.get("allergies"):
        query["allergies"] = {"$in": filters["allergies"]} if isinstance(filters["allergies"], list) else filters["allergies"]

    # Favorite food
    if filters.get("favorite_food"):
        query["favorite_food"] = {"$regex": filters["favorite_food"], "$options": "i"}

    # Search by name or phone
    if filters.get("search"):
        search_regex = {"$regex": filters["search"], "$options": "i"}
        query["$or"] = [
            {"name": search_regex},
            {"phone": search_regex},
            {"email": search_regex}
        ]

    # ── CR-033 P0: BUG-A FIXES (6 filters) ────────────────────────────────
    # vip_flag
    if filters.get("vip_flag") and filters["vip_flag"] != "all":
        val = filters["vip_flag"]
        query["vip_flag"] = (val is True or val == "true")

    # whatsapp_opt_in
    if filters.get("whatsapp_opt_in") and filters["whatsapp_opt_in"] != "all":
        val = filters["whatsapp_opt_in"]
        query["whatsapp_opt_in"] = (val is True or val == "true")

    # has_birthday_this_month
    if filters.get("has_birthday_this_month"):
        current_month = datetime.now(timezone.utc).month
        month_str = f"-{current_month:02d}-"
        query["dob"] = {"$regex": month_str}

    # is_blocked
    if filters.get("is_blocked") and filters["is_blocked"] != "all":
        val = filters["is_blocked"]
        query["is_blocked"] = (val is True or val == "true")

    # blacklist_flag
    if filters.get("blacklist_flag") and filters["blacklist_flag"] != "all":
        val = filters["blacklist_flag"]
        query["blacklist_flag"] = (val is True or val == "true")

    # complaint_flag
    if filters.get("complaint_flag") and filters["complaint_flag"] != "all":
        val = filters["complaint_flag"]
        query["complaint_flag"] = (val is True or val == "true")

    # ── CR-033 P1: NEW FILTERS (11 filters) ────────────────────────────────
    # has_anniversary_this_month
    if filters.get("has_anniversary_this_month"):
        current_month = datetime.now(timezone.utc).month
        month_str = f"-{current_month:02d}-"
        query["anniversary"] = {"$regex": month_str}

    # birthday_month (specific month 1-12)
    if filters.get("birthday_month") and filters["birthday_month"] != "all":
        try:
            m = int(filters["birthday_month"])
            query["dob"] = {"$regex": f"-{m:02d}-"}
        except (ValueError, TypeError):
            pass

    # age_bracket (derived from dob year prefix)
    if filters.get("age_bracket") and filters["age_bracket"] != "all":
        today = datetime.now(timezone.utc)
        bracket = filters["age_bracket"]
        if bracket == "18-25":
            start_year, end_year = today.year - 25, today.year - 18
        elif bracket == "26-35":
            start_year, end_year = today.year - 35, today.year - 26
        elif bracket == "36-50":
            start_year, end_year = today.year - 50, today.year - 36
        elif bracket == "50+":
            start_year, end_year = today.year - 120, today.year - 50
        else:
            start_year, end_year = None, None
        if start_year is not None:
            query["dob"] = {"$gte": str(start_year), "$lte": str(end_year + 1)}

    # gender
    if filters.get("gender") and filters["gender"] != "all":
        query["gender"] = filters["gender"]

    # created_at_days (signed up in last N days)
    if filters.get("created_at_days") and filters["created_at_days"] != "all":
        try:
            days = int(filters["created_at_days"])
            cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
            query["created_at"] = {"$gte": cutoff}
        except (ValueError, TypeError):
            pass

    # lead_source (single or multi-select)
    if filters.get("lead_source") and filters["lead_source"] != "all":
        val = filters["lead_source"]
        query["lead_source"] = {"$in": val} if isinstance(val, list) else val

    # has_gst
    if filters.get("has_gst") is not None and filters["has_gst"] != "all":
        val = filters["has_gst"]
        if val is True or val == "true":
            query["gst_number"] = {"$exists": True, "$nin": [None, ""]}
        else:
            query["gst_number"] = {"$in": [None, ""]}

    # has_notes
    if filters.get("has_notes") is not None and filters["has_notes"] != "all":
        val = filters["has_notes"]
        if val is True or val == "true":
            query["notes"] = {"$exists": True, "$nin": [None, ""]}
        else:
            query["notes"] = {"$in": [None, ""]}

    # wallet_balance (bucket: "zero", "low", "mid", "high")
    if filters.get("wallet_balance") and filters["wallet_balance"] != "all":
        wb = filters["wallet_balance"]
        if wb == "zero":
            query["wallet_balance"] = {"$lte": 0}
        elif wb == "low":
            query["wallet_balance"] = {"$gt": 0, "$lte": 500}
        elif wb == "mid":
            query["wallet_balance"] = {"$gt": 500, "$lte": 2000}
        elif wb == "high":
            query["wallet_balance"] = {"$gt": 2000}

    # total_coupon_used (bucket: "0", "1-5", "6+")
    if filters.get("total_coupon_used") and filters["total_coupon_used"] != "all":
        tcu = filters["total_coupon_used"]
        if tcu == "0":
            query["total_coupon_used"] = 0
        elif tcu == "1-5":
            query["total_coupon_used"] = {"$gte": 1, "$lte": 5}
        elif tcu == "6+":
            query["total_coupon_used"] = {"$gt": 5}

    # total_points_earned (bucket: "low", "mid", "high", "very_high")
    if filters.get("total_points_earned") and filters["total_points_earned"] != "all":
        tpe = filters["total_points_earned"]
        if tpe == "low":
            query["total_points_earned"] = {"$lte": 100}
        elif tpe == "mid":
            query["total_points_earned"] = {"$gt": 100, "$lte": 500}
        elif tpe == "high":
            query["total_points_earned"] = {"$gt": 500, "$lte": 2000}
        elif tpe == "very_high":
            query["total_points_earned"] = {"$gt": 2000}

    # ── CR-033 P2: CROSS-COLLECTION JOINS (3 filters, need async DB) ───────
    # received_campaign_id: customers who received a specific campaign
    if filters.get("received_campaign_id") and filters["received_campaign_id"] != "all":
        cid = filters["received_campaign_id"]
        matched_ids = await _db.whatsapp_message_logs.distinct(
            "customer_id",
            {"user_id": user_id, "$or": [{"campaign_id": cid}, {"reference_id": cid}]}
        )
        query["id"] = {"$in": matched_ids}

    # whatsapp_status_failed: customers whose WA message failed/rejected
    if filters.get("whatsapp_status_failed"):
        failed_ids = await _db.whatsapp_message_logs.distinct(
            "customer_id",
            {"user_id": user_id, "status": {"$in": ["failed", "rejected"]}}
        )
        query["id"] = {"$in": failed_ids}

    # never_messaged: customers who have never received a WA message
    if filters.get("never_messaged"):
        messaged_ids = await _db.whatsapp_message_logs.distinct(
            "customer_id", {"user_id": user_id}
        )
        query["id"] = {"$nin": messaged_ids}

    # ── CR-034: USER-DEFINED TAGS FILTER ────────────────────────────────────
    # tags: list of tag strings; mode "any" (OR/$in) or "all" (AND/$all)
    if filters.get("tags") and isinstance(filters["tags"], list) and len(filters["tags"]) > 0:
        mode = filters.get("tags_mode", "any")
        if mode == "all":
            query["tags"] = {"$all": filters["tags"]}
        else:
            query["tags"] = {"$in": filters["tags"]}

    # ── CR-077 Block E: High Spender audience type ───────────────────────────
    # audience_type="high_spender" → total_spent >= per-tenant high_spender_threshold
    # Default 5000 matches previous hardcoded behaviour (zero behaviour change on upgrade).
    if filters.get("audience_type") == "high_spender":
        _ls = await _db.loyalty_settings.find_one({"user_id": user_id}, {"_id": 0}) or {}
        threshold = _ls.get("high_spender_threshold", 5000)
        query["total_spent"] = {"$gte": threshold}

    # ── CR-076 E-A: Lifecycle Stage filter ───────────────────────────────────
    # Translates stage enum into date-range + visit-count MongoDB conditions.
    # Reads CR-077 configurable boundaries from loyalty_settings; falls back to
    # hardcoded defaults (30/60/90 days) if CR-077 is not yet deployed.
    if filters.get("lifecycle_stage") and filters["lifecycle_stage"] != "all":
        _ls = await _db.loyalty_settings.find_one({"user_id": user_id}, {"_id": 0}) or {}
        now = datetime.now(timezone.utc)
        _active_days = (_ls.get("at_risk_days_start", 31) - 1)   # default 30
        _risk_end    = _ls.get("at_risk_days_end", 60)
        _dormant_end = _ls.get("dormant_days_end", 90)
        _new_max_v   = _ls.get("new_customer_max_visits", 1)
        _t30 = (now - timedelta(days=_active_days)).isoformat()
        _t60 = (now - timedelta(days=_risk_end)).isoformat()
        _t90 = (now - timedelta(days=_dormant_end)).isoformat()
        stage_val = filters["lifecycle_stage"]
        if stage_val == "new":
            query["total_visits"] = {"$lte": _new_max_v}
            query["last_visit"]   = {"$gte": _t30}
        elif stage_val == "active":
            query["total_visits"] = {"$gte": _new_max_v + 1}
            query["last_visit"]   = {"$gte": _t30}
        elif stage_val == "at_risk":
            query["last_visit"] = {"$lt": _t30, "$gte": _t60}
        elif stage_val == "dormant":
            query["last_visit"] = {"$lt": _t60, "$gte": _t90}
        elif stage_val == "churned":
            query["$and"] = query.get("$and", []) + [
                {"$or": [{"last_visit": {"$lt": _t90}}, {"last_visit": None}]}
            ]
        elif stage_val == "lapsing":   # At Risk + Dormant combined
            query["last_visit"] = {"$lt": _t30, "$gte": _t90}
        elif stage_val == "winback":   # Dormant + Churned combined
            query["$and"] = query.get("$and", []) + [
                {"$or": [{"last_visit": {"$lt": _t60}}, {"last_visit": None}]}
            ]

    return query


async def resolve_audience(db, user_id: str, audience_id: str):
    """CR-024 Phase 4 P4.3: Resolve an audience_id (real segment OR the synthetic
    'all-customers' token) into a (mongo_query, audience_name, audience_count) tuple.

    Raises HTTPException(404) if audience_id is not 'all-customers' and the
    segment is not found.
    """
    from fastapi import HTTPException
    if audience_id == "all-customers":
        count = await db.customers.count_documents({"user_id": user_id})
        return ({"user_id": user_id}, "All Customers", count)

    segment = await db.segments.find_one({"id": audience_id, "user_id": user_id})
    if not segment:
        raise HTTPException(status_code=404, detail="Audience not found")
    query = await build_customer_query(user_id, segment.get("filters", {}))
    return (query, segment.get("name", ""), segment.get("customer_count", 0))
