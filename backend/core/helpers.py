from datetime import datetime, timezone, timedelta
import qrcode
import io
import base64

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

def build_customer_query(user_id: str, filters: dict) -> dict:
    """Build MongoDB query from filter dictionary"""
    query = {"user_id": user_id}
    
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
    
    # Visits filter (string-based like "6-10", "10+", etc)
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
    
    # Total spent filter (string-based like "0-500", "10000+", etc)
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
    
    return query
