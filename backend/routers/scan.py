"""
Scan & Order Customer-Facing API
All /scan/* endpoints for the customer mobile/web app
"""
from fastapi import APIRouter, HTTPException, Depends, Request, Response  # CR-094: Response
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid
import logging
import re  # noqa: F401  (kept: used by other helpers' future edits; BUG-025 removed the only call)

from core.database import db
from core.phone import normalize_phone, phone_match
from core.auth import (
    verify_customer_token, create_customer_token,
    get_current_user, optional_security,  # CR-096
    JWT_SECRET, JWT_ALGORITHM,            # CR-096
)
import jwt  # CR-096
from core.helpers import calculate_tier, get_earn_percent_for_tier, get_redemption_value_for_tier  # CR-094
from core.loyalty import default_loyalty_settings, compute_max_redeemable, calculate_points  # CR-094 + CR-107
from core.coupon import validate_coupon_for_customer  # CR-105
from models.schemas import CustomerAddressCreate, CustomerAddressUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/scan", tags=["Scan & Order"])


# ============================================
# Helpers
# ============================================

def _normalize_restaurant_id(restaurant_id: str) -> str:
    """Normalize short restaurant ID to full format."""
    if restaurant_id.startswith("pos_"):
        return restaurant_id
    return f"pos_0001_restaurant_{restaurant_id}"


async def _resolve_restaurant_id(restaurant_id: str) -> str:  # BUG-030
    """Like _normalize_restaurant_id but falls back to users.restaurant_id lookup.
    Fast path: standard format (pos_0001_restaurant_N) — zero extra DB query (covers all tenants).
    Slow path: non-standard id (r69 only today) — one extra users.find_one by restaurant_id field.
    """
    if restaurant_id.startswith("pos_"):
        return restaurant_id
    standard = f"pos_0001_restaurant_{restaurant_id}"
    if await db.users.find_one({"id": standard}, {"_id": 0, "id": 1}):
        return standard
    fallback = await db.users.find_one({"restaurant_id": restaurant_id}, {"_id": 0, "id": 1})
    return fallback["id"] if fallback else standard  # unknown rid → standard; route 404s naturally


def _short_restaurant_id(restaurant_id: str) -> str:
    """Extract short ID from full format."""
    if restaurant_id.startswith("pos_0001_restaurant_"):
        return restaurant_id.replace("pos_0001_restaurant_", "")
    return restaurant_id


def _generate_addr_id() -> str:
    return f"addr_{uuid.uuid4().hex[:12]}"


_LOOKUP_IP_LIMIT = (10, 60)      # CR-093 Q1: 10 per 60 s per IP
_LOOKUP_PHONE_LIMIT = (5, 300)   # CR-093 Q1: 5 per 300 s per phone+restaurant
_SKIP_OTP_IP_LIMIT = (30, 60)      # CR-089 D-1: 30 per 60 s per IP (restaurant shared Wi-Fi)
_SKIP_OTP_PHONE_LIMIT = (5, 300)   # CR-089 D-1: 5 per 300 s per phone+restaurant


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    return xff.split(",")[0].strip() or (request.client.host if request.client else "unknown")


async def _lookup_rate_limited(key: str, limit: int, window_s: int) -> Optional[int]:
    """CR-093 Q5: Mongo-backed sliding window. Returns Retry-After seconds when over limit, else None."""
    now = datetime.now(timezone.utc)
    since = (now - timedelta(seconds=window_s)).isoformat()
    n = await db.scan_lookup_attempts.count_documents({"key": key, "created_at": {"$gte": since}})
    if n >= limit:
        oldest = await db.scan_lookup_attempts.find_one(
            {"key": key, "created_at": {"$gte": since}}, {"_id": 0, "created_at": 1}, sort=[("created_at", 1)]
        )
        elapsed = (now - datetime.fromisoformat(oldest["created_at"])).total_seconds()
        return max(1, window_s - int(elapsed))
    await db.scan_lookup_attempts.insert_one(
        {"key": key, "created_at": now.isoformat(), "expires_at": now + timedelta(seconds=window_s)}
    )
    return None


_FEEDBACK_IP_LIMIT    = (10, 60)   # CR-096: 10/min per IP
_FEEDBACK_PHONE_LIMIT = (3, 600)   # CR-096: 3/10 min per phone+restaurant
_COUPON_VALIDATE_IP_LIMIT = (10, 60)  # CR-105 Q1=a: 10/min per IP


async def optional_customer_token(credentials=Depends(optional_security)) -> Optional[dict]:
    """CR-096: returns None when no token; raises 401 on expired/invalid (Q1)."""
    if credentials is None:
        return None
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "customer":
            raise HTTPException(status_code=401, detail="Invalid customer token")
        customer_id  = payload.get("customer_id")
        restaurant_id = payload.get("restaurant_id")
        if not customer_id or not restaurant_id:
            raise HTTPException(status_code=401, detail="Invalid customer token")
        return {"customer_id": customer_id, "restaurant_id": restaurant_id, "phone": payload.get("phone")}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid customer token")


# ============================================
# Request Schemas
# ============================================

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    dob: Optional[str] = None
    anniversary: Optional[str] = None
    gender: Optional[str] = None
    preferred_language: Optional[str] = None
    allergies: Optional[List[str]] = None
    favorites: Optional[List[str]] = None
    diet_preference: Optional[str] = None
    spice_level: Optional[str] = None
    cuisine_preference: Optional[str] = None


class FeedbackSubmit(BaseModel):
    rating: int
    message: Optional[str] = None            # CR-096: cap 500 chars in route
    order_id: Optional[str] = None
    restaurant_id: Optional[str] = None      # CR-096: required when no token
    phone: Optional[str] = None              # CR-096: optional; canonical digits
    country_code: Optional[str] = "+91"      # CR-096 (CR-102 lesson)


class TableAction(BaseModel):
    table_id: str
    message: Optional[str] = None



# Standard response
def _resp(success: bool, message: str, data=None):
    return {"success": success, "message": message, "data": data}


# ============================================
# C1 - Customer Authentication
# ============================================

# CR-084: customer OTP routes (request-otp / verify-otp) removed 2026-10. Login = skip-otp (CR-089) → lookup (CR-093).

class SkipOTPRequest(BaseModel):
    phone: str
    restaurant_id: str
    country_code: Optional[str] = "+91"  # CR-102: mirror LookupRequest (Customer App sends it)


class LookupRequest(BaseModel):  # CR-093
    phone: str
    restaurant_id: str
    country_code: Optional[str] = "+91"


@router.post("/auth/skip-otp")
async def skip_otp_login(req: SkipOTPRequest, request: Request):
    """Silent login without OTP. Finds or creates customer by phone, returns full token."""
    full_restaurant_id = await _resolve_restaurant_id(req.restaurant_id)  # BUG-030
    # CR-089 + BUG-025 (Q1=A): IP bucket first so invalid phones still count; phone bucket keyed on canonical {cc}{digits}.
    retry = await _lookup_rate_limited(f"so-ip:{_client_ip(request)}", *_SKIP_OTP_IP_LIMIT)
    if retry:
        raise HTTPException(status_code=429, detail="Too many login attempts", headers={"Retry-After": str(retry)})

    # CR-085 W13: canonical phone; diner is present → reject invalid (Option A). CR-102: honour country_code.
    phone, cc, pstatus = normalize_phone(req.phone, req.country_code)
    if pstatus == "invalid":
        raise HTTPException(status_code=400, detail="Enter a valid mobile number")

    retry = await _lookup_rate_limited(f"so-ph:{full_restaurant_id}:{cc}{phone}", *_SKIP_OTP_PHONE_LIMIT)  # BUG-025
    if retry:
        raise HTTPException(status_code=429, detail="Too many login attempts", headers={"Retry-After": str(retry)})
    now = datetime.now(timezone.utc).isoformat()

    customer = await db.customers.find_one(
        phone_match(full_restaurant_id, phone, cc),
        {"_id": 0, "id": 1, "name": 1}
    )

    is_new = False
    if not customer:
        customer_id = str(uuid.uuid4())
        customer_doc = {
            "id": customer_id,
            "user_id": full_restaurant_id,
            "name": "",
            "phone": phone,
            "country_code": cc,
            "email": None,
            "tier": "Bronze",
            "total_points": 0,
            "wallet_balance": 0.0,
            "total_visits": 0,
            "total_spent": 0.0,
            "allergies": [],
            "favorites": [],
            "customer_type": "normal",
            "whatsapp_opt_in": False,
            "is_blocked": False,
            "created_at": now,
            "updated_at": now
        }
        if pstatus == "fixed":
            customer_doc["phone_raw"] = req.phone
        await db.customers.insert_one(customer_doc)
        is_new = True
    else:
        customer_id = customer["id"]

    token = create_customer_token(customer_id, full_restaurant_id, phone)
    return _resp(True, "Login successful", {
        "token": token,
        "customer_id": customer_id,
        "is_new_customer": is_new,
        "phone": req.phone
    })


@router.get("/auth/me")
async def get_me(auth: dict = Depends(verify_customer_token)):
    """Get authenticated customer profile."""
    customer = await db.customers.find_one(
        {"id": auth["customer_id"], "user_id": auth["restaurant_id"]},
        {"_id": 0, "password_hash": 0}
    )
    if not customer:
        return _resp(False, "Customer not found")

    return _resp(True, "Profile loaded", customer)


@router.post("/auth/lookup")
async def lookup_customer(req: LookupRequest, request: Request):
    """CR-093: public, read-only existence check. Never creates, never returns a token."""
    full_restaurant_id = await _resolve_restaurant_id(req.restaurant_id)  # BUG-030
    # BUG-029: IP bucket before validation so invalid phones still count (same order as skip-otp).
    retry = await _lookup_rate_limited(f"ip:{_client_ip(request)}", *_LOOKUP_IP_LIMIT)
    if retry:
        raise HTTPException(status_code=429, detail="Too many lookups", headers={"Retry-After": str(retry)})
    phone, cc, pstatus = normalize_phone(req.phone, req.country_code)  # CR-085 W14: shared helper
    if pstatus == "invalid":
        raise HTTPException(status_code=400, detail="Invalid phone or country_code")
    retry = await _lookup_rate_limited(f"ph:{full_restaurant_id}:{cc}{phone}", *_LOOKUP_PHONE_LIMIT)
    if retry:
        raise HTTPException(status_code=429, detail="Too many lookups", headers={"Retry-After": str(retry)})
    customer = await db.customers.find_one(
        {**phone_match(full_restaurant_id, phone, cc), "is_blocked": {"$ne": True}, "phone_invalid": {"$ne": True}},  # CR-100
        {"_id": 0, "name": 1},
        sort=[("created_at", 1)],  # Q4: oldest record
    )
    if not customer:
        return _resp(True, "Not found", {"exists": False, "name": None})
    name = (customer.get("name") or "").strip() or None  # Q3: blank → null
    return _resp(True, "Found", {"exists": True, "name": name})


_LOYALTY_RULES_IP_LIMIT = (60, 60)  # CR-094: 60/min per IP (no identity data)
_LOYALTY_RULES_TIERS = ("bronze", "silver", "gold", "platinum")
_LOYALTY_RULES_FIELDS = (  # CR-094 whitelist = POS L-1 (pos_loyalty.py:44) + Q1/Q2/Q6 additions; flat names (Q3). 33 keys.
    "loyalty_enabled", "wallet_enabled", "coupon_enabled",
    "bronze_earn_percent", "silver_earn_percent", "gold_earn_percent", "platinum_earn_percent",
    "tier_silver_min", "tier_gold_min", "tier_platinum_min",
    "redemption_value", "bronze_redemption_value", "silver_redemption_value", "gold_redemption_value", "platinum_redemption_value",
    "min_redemption_points", "max_redemption_percent", "max_redemption_amount", "min_order_value",
    "first_visit_bonus_enabled", "first_visit_bonus_points",
    "birthday_bonus_enabled", "birthday_bonus_points",          # Q6 — informational; award scheduler not enabled
    "anniversary_bonus_enabled", "anniversary_bonus_points",    # Q6 — informational; award scheduler not enabled
    "feedback_bonus_enabled", "feedback_bonus_points",          # Q2 — informational; nothing awards it (CR-104 deferred)
    "off_peak_bonus_enabled", "off_peak_bonus_type", "off_peak_bonus_value", "off_peak_start_time", "off_peak_end_time",
    "points_expiry_months",
)


@router.get("/loyalty-rules/{restaurant_id}")
async def loyalty_rules(restaurant_id: str, request: Request, response: Response):
    """CR-094: public, read-only, whitelisted loyalty rules for the Customer App pre-login preview."""
    retry = await _lookup_rate_limited(f"lr-ip:{_client_ip(request)}", *_LOYALTY_RULES_IP_LIMIT)
    if retry:
        raise HTTPException(status_code=429, detail="Too many requests", headers={"Retry-After": str(retry)})
    rid = await _resolve_restaurant_id(restaurant_id)  # BUG-030
    if not await db.users.find_one({"id": rid}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=404, detail="Restaurant not found")
    defaults = default_loyalty_settings(rid)
    settings = {**defaults, **(await db.loyalty_settings.find_one({"user_id": rid}, {"_id": 0}) or {})}
    data = {k: settings.get(k) for k in _LOYALTY_RULES_FIELDS}
    for tier in _LOYALTY_RULES_TIERS:  # CR-094 Q4 (b): effective ₹/point per tier, never null
        data[f"{tier}_redemption_value"] = get_redemption_value_for_tier(tier.capitalize(), settings)
    response.headers["Cache-Control"] = "public, max-age=60"
    return _resp(True, "Loyalty rules", data)


# CR-098: customer password register removed 2026-10 (could set a password on any existing customer by phone).

# CR-098: customer password login removed 2026-10 — skip-otp is the only diner identity path.

# ============================================
# C2 - Customer Profile
# ============================================

@router.get("/profile")
async def get_profile(auth: dict = Depends(verify_customer_token)):
    """Get my profile."""
    customer = await db.customers.find_one(
        {"id": auth["customer_id"], "user_id": auth["restaurant_id"]},
        {"_id": 0, "password_hash": 0}
    )
    if not customer:
        return _resp(False, "Customer not found")
    return _resp(True, "Profile loaded", customer)


@router.put("/profile")
async def update_profile(updates: ProfileUpdate, auth: dict = Depends(verify_customer_token)):
    """Update my profile. Cannot change phone."""
    update_dict = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not update_dict:
        return _resp(False, "No fields to update")

    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.customers.update_one(
        {"id": auth["customer_id"], "user_id": auth["restaurant_id"]},
        {"$set": update_dict}
    )
    return _resp(True, "Profile updated")


@router.get("/loyalty")
async def get_loyalty(auth: dict = Depends(verify_customer_token)):
    """My loyalty summary."""
    customer = await db.customers.find_one(
        {"id": auth["customer_id"], "user_id": auth["restaurant_id"]},
        {"_id": 0, "tier": 1, "total_points": 1, "wallet_balance": 1, "total_visits": 1, "total_spent": 1}
    )
    if not customer:
        return _resp(False, "Customer not found")

    settings = await db.loyalty_settings.find_one({"user_id": auth["restaurant_id"]}, {"_id": 0})
    redemption_value = settings.get("redemption_value", 0.25) if settings else 0.25
    tier = customer.get("tier", "Bronze")
    total_points = customer.get("total_points", 0)
    earn_percent = get_earn_percent_for_tier(tier, settings or {})

    tier_thresholds = {
        "Bronze": ("Silver", settings.get("tier_silver_min", 500) if settings else 500),
        "Silver": ("Gold", settings.get("tier_gold_min", 1500) if settings else 1500),
        "Gold": ("Platinum", settings.get("tier_platinum_min", 5000) if settings else 5000),
        "Platinum": (None, 0)
    }
    next_tier, next_min = tier_thresholds.get(tier, (None, 0))

    # CR-088: expiring_soon — inline staff expiring logic (points.py:218-265)
    expiry_months = settings.get("points_expiry_months", 6) if settings else 6
    expiring_soon_pts, expiring_date = 0, None
    if expiry_months > 0:
        reminder_days = settings.get("expiry_reminder_days", 30) if settings else 30
        now_dt = datetime.now(timezone.utc)
        expiry_cutoff   = now_dt - timedelta(days=expiry_months * 30)
        reminder_cutoff = now_dt - timedelta(days=(expiry_months * 30) - reminder_days)
        earn_txns = await db.points_transactions.find(
            {"customer_id": auth["customer_id"], "user_id": auth["restaurant_id"],
             "transaction_type": {"$in": ["earn", "bonus"]}},
            {"_id": 0, "points": 1, "created_at": 1}
        ).to_list(1000)
        for tx in earn_txns:
            tx_date = datetime.fromisoformat(tx["created_at"].replace("Z", "+00:00")) \
                      if isinstance(tx["created_at"], str) else tx["created_at"]
            if tx_date.tzinfo is None:
                tx_date = tx_date.replace(tzinfo=timezone.utc)
            if expiry_cutoff <= tx_date < reminder_cutoff:
                expiring_soon_pts += tx["points"]
                exp_d = tx_date + timedelta(days=expiry_months * 30)
                if expiring_date is None or exp_d < expiring_date:
                    expiring_date = exp_d

    return _resp(True, "Loyalty summary", {
        "total_points": total_points,
        "points_monetary_value": round(total_points * redemption_value, 2),
        "tier": tier,
        "next_tier": next_tier,
        "points_to_next_tier": max(0, next_min - total_points) if next_tier else 0,
        "wallet_balance": customer.get("wallet_balance", 0.0),
        "total_visits": customer.get("total_visits", 0),
        "total_spent": customer.get("total_spent", 0.0),
        "earn_rate_percent": earn_percent,
        "redemption_value_per_point": redemption_value,
        "expiring_soon": max(0, expiring_soon_pts),                          # CR-088
        "expiring_date": expiring_date.isoformat() if expiring_date else None,  # CR-088
    })


@router.get("/points/history")
async def get_points_history(limit: int = 20, skip: int = 0, auth: dict = Depends(verify_customer_token)):  # CR-088: +skip, true total
    """My points transaction history."""
    _limit, _skip = min(limit, 50), max(skip, 0)
    txns = await db.points_transactions.find(
        {"customer_id": auth["customer_id"], "user_id": auth["restaurant_id"]},
        {"_id": 0}
    ).sort("created_at", -1).skip(_skip).limit(_limit).to_list(_limit)
    total = await db.points_transactions.count_documents(
        {"customer_id": auth["customer_id"], "user_id": auth["restaurant_id"]}
    )  # CR-088: true DB count, not len(rows)
    return _resp(True, f"{total} transactions", {"transactions": txns, "total": total, "skip": _skip, "limit": _limit})


@router.get("/wallet/history")
async def get_wallet_history(limit: int = 20, skip: int = 0, auth: dict = Depends(verify_customer_token)):  # CR-088: +skip, true total
    """My wallet transaction history."""
    _limit, _skip = min(limit, 50), max(skip, 0)
    txns = await db.wallet_transactions.find(
        {"customer_id": auth["customer_id"], "user_id": auth["restaurant_id"]},
        {"_id": 0}
    ).sort("created_at", -1).skip(_skip).limit(_limit).to_list(_limit)
    total = await db.wallet_transactions.count_documents(
        {"customer_id": auth["customer_id"], "user_id": auth["restaurant_id"]}
    )  # CR-088: true DB count
    return _resp(True, f"{total} transactions", {"transactions": txns, "total": total, "skip": _skip, "limit": _limit})


@router.get("/orders")
async def get_orders(limit: int = 20, skip: int = 0, auth: dict = Depends(verify_customer_token)):  # CR-088: +skip
    """My order history."""
    _limit, _skip = min(limit, 50), max(skip, 0)
    orders = await db.orders.find(
        {"customer_id": auth["customer_id"], "user_id": auth["restaurant_id"]},
        {"_id": 0}
    ).sort("created_at", -1).skip(_skip).limit(_limit).to_list(_limit)
    total = await db.orders.count_documents({"customer_id": auth["customer_id"], "user_id": auth["restaurant_id"]})
    return _resp(True, f"{total} orders", {"orders": orders, "total": total, "skip": _skip, "limit": _limit})


@router.get("/orders/{order_id}")
async def get_order_detail(order_id: str, auth: dict = Depends(verify_customer_token)):
    """Single order detail — only my own orders."""
    order = await db.orders.find_one(
        {"id": order_id, "customer_id": auth["customer_id"], "user_id": auth["restaurant_id"]},
        {"_id": 0}
    )
    if not order:
        return _resp(False, "Order not found")
    return _resp(True, "Order detail", order)


@router.get("/coupons")
async def get_available_coupons(auth: dict = Depends(verify_customer_token)):
    """List active coupons the customer is eligible for."""
    now = datetime.now(timezone.utc).isoformat()
    coupons = await db.coupons.find({
        "user_id": auth["restaurant_id"],
        "is_active": True,
        "start_date": {"$lte": now},
        "end_date": {"$gte": now}
    }, {"_id": 0}).to_list(50)

    # Filter by per_user_limit
    eligible = []
    for c in coupons:
        if c.get("specific_users") and auth["customer_id"] not in c["specific_users"]:
            continue
        usage = await db.coupon_usage.count_documents({"coupon_id": c["id"], "customer_id": auth["customer_id"]})
        if usage < (c.get("per_user_limit") or 1):  # handle per_user_limit:null stored in DB (None != default)
            c["my_usage_count"] = usage
            eligible.append(c)

    return _resp(True, f"{len(eligible)} coupons available", {"coupons": eligible})


class ScanMaxRedeemableRequest(BaseModel):  # CR-107
    bill_amount: float


@router.post("/max-redeemable")
async def scan_max_redeemable(
    data: ScanMaxRedeemableRequest,
    auth: dict = Depends(verify_customer_token),
):  # CR-107
    """CR-107: max loyalty points redeemable for a given bill amount. Read-only."""
    rid = auth["restaurant_id"]
    customer = await db.customers.find_one(
        {"id": auth["customer_id"], "user_id": rid}, {"_id": 0}
    )
    if not customer:
        return _resp(False, "Customer not found")
    settings = await db.loyalty_settings.find_one({"user_id": rid}, {"_id": 0})
    cap = compute_max_redeemable(customer, settings, data.bill_amount)
    projected_earned = 0
    if cap["loyalty_enabled"] and settings:
        pts = calculate_points(data.bill_amount, customer, settings)
        projected_earned = pts.get("total_points", 0)
    return _resp(True, "Max redeemable computed", {
        "ok":                      cap["ok"],
        "code":                    cap.get("code"),
        "max_points_redeemable":   cap["max_points_redeemable"],
        "max_discount_value":      cap["max_discount_value"],
        "ratio_per_point":         cap["ratio_per_point"],
        "available_points":        cap["available_points"],
        "min_redemption_points":   cap["min_redemption_points"],
        "loyalty_enabled":         cap["loyalty_enabled"],
        "projected_points_earned": projected_earned,
    })  # CR-107


class ScanCouponValidateRequest(BaseModel):  # CR-105
    code: str
    order_total: float
    channel: Optional[str] = "dine_in"   # CR-105 Q2
    items: Optional[List[dict]] = None   # needed for item/category-scope (V2/V3-B) coupons


@router.post("/coupons/validate")
async def scan_validate_coupon(
    data: ScanCouponValidateRequest,
    request: Request,
    auth: dict = Depends(verify_customer_token),
):  # CR-105
    """CR-105: validate coupon code against order total. Read-only — no usage recorded."""
    retry = await _lookup_rate_limited(
        f"vc-ip:{_client_ip(request)}", *_COUPON_VALIDATE_IP_LIMIT
    )
    if retry:
        raise HTTPException(
            status_code=429, detail="Too many requests",
            headers={"Retry-After": str(retry)}
        )
    result = await validate_coupon_for_customer(
        db,
        user_id=auth["restaurant_id"],
        code=data.code,
        customer_id=auth["customer_id"],
        order_total=data.order_total,
        channel=data.channel or "dine_in",
        items=data.items,
    )
    if not result["ok"]:
        return _resp(True, "Coupon not valid", {"valid": False, "error": result["error"]})
    coupon = result["coupon"]
    discount = result["computed_discount"]
    final_preview = (
        round(float(data.order_total) - float(discount or 0.0), 2)
        if discount is not None else None
    )
    return _resp(True, "Coupon valid", {
        "valid":                  True,
        "code":                   coupon["code"],
        "title":                  coupon.get("title") or coupon.get("description"),
        "discount_type":          coupon["discount_type"],
        "discount_value":         coupon["discount_value"],
        "computed_discount":      discount,
        "final_amount_preview":   final_preview,
        "min_order_value":        coupon.get("min_order_value", 0),
        "stackable_with_loyalty": bool(coupon.get("stackable_with_loyalty", False)),
        "coupon_type":            coupon.get("coupon_type", "order"),
    })  # CR-105


# ============================================
# C3 - Customer Addresses
# ============================================

@router.get("/addresses")
async def list_my_addresses(auth: dict = Depends(verify_customer_token)):
    """List my addresses."""
    customer = await db.customers.find_one(
        {"id": auth["customer_id"], "user_id": auth["restaurant_id"]},
        {"_id": 0, "addresses": 1}
    )
    if customer is None:
        return _resp(False, "Customer not found")

    addresses = customer.get("addresses", [])
    addresses.sort(key=lambda a: not a.get("is_default", False))
    return _resp(True, f"{len(addresses)} addresses", {"addresses": addresses, "total": len(addresses)})


@router.post("/addresses")
async def add_my_address(addr_data: CustomerAddressCreate, auth: dict = Depends(verify_customer_token)):
    """Add address to my account. Dedup by address+pincode."""
    customer = await db.customers.find_one(
        {"id": auth["customer_id"], "user_id": auth["restaurant_id"]}
    )
    if not customer:
        return _resp(False, "Customer not found")

    now = datetime.now(timezone.utc).isoformat()
    existing_addresses = customer.get("addresses", [])

    # Dedup
    for existing in existing_addresses:
        if (existing.get("address", "").strip().lower() == (addr_data.address or "").strip().lower()
                and existing.get("pincode", "").strip() == (addr_data.pincode or "").strip()
                and (addr_data.pincode or "").strip()):
            await db.customers.update_one(
                {"id": auth["customer_id"], "addresses.id": existing["id"]},
                {"$set": {"addresses.$.updated_at": now}}
            )
            return _resp(True, "Address already exists, updated timestamp",
                         {"address_id": existing["id"], "deduplicated": True})

    addr_doc = addr_data.model_dump()
    addr_doc["id"] = _generate_addr_id()
    addr_doc["created_at"] = now
    addr_doc["updated_at"] = now

    if addr_doc.get("is_default"):
        if existing_addresses:
            await db.customers.update_one(
                {"id": auth["customer_id"]},
                {"$set": {"addresses.$[].is_default": False}}
            )
    elif not existing_addresses:
        addr_doc["is_default"] = True

    await db.customers.update_one({"id": auth["customer_id"]}, {"$push": {"addresses": addr_doc}})
    return _resp(True, "Address added", {"address_id": addr_doc["id"], "address": addr_doc})


@router.put("/addresses/{addr_id}")
async def update_my_address(addr_id: str, addr_data: CustomerAddressUpdate, auth: dict = Depends(verify_customer_token)):
    """Update my address."""
    customer = await db.customers.find_one(
        {"id": auth["customer_id"], "user_id": auth["restaurant_id"]}
    )
    if not customer:
        return _resp(False, "Customer not found")

    addresses = customer.get("addresses", [])
    if not any(a.get("id") == addr_id for a in addresses):
        return _resp(False, "Address not found")

    now = datetime.now(timezone.utc).isoformat()
    update_fields = {k: v for k, v in addr_data.model_dump().items() if v is not None}
    update_fields["updated_at"] = now

    if update_fields.get("is_default"):
        await db.customers.update_one(
            {"id": auth["customer_id"]},
            {"$set": {"addresses.$[].is_default": False}}
        )

    set_ops = {f"addresses.$.{k}": v for k, v in update_fields.items()}
    await db.customers.update_one(
        {"id": auth["customer_id"], "addresses.id": addr_id},
        {"$set": set_ops}
    )
    return _resp(True, "Address updated", {"address_id": addr_id})


@router.delete("/addresses/{addr_id}")
async def delete_my_address(addr_id: str, auth: dict = Depends(verify_customer_token)):
    """Delete my address."""
    customer = await db.customers.find_one(
        {"id": auth["customer_id"], "user_id": auth["restaurant_id"]}
    )
    if not customer:
        return _resp(False, "Customer not found")

    addresses = customer.get("addresses", [])
    addr = next((a for a in addresses if a.get("id") == addr_id), None)
    if not addr:
        return _resp(False, "Address not found")

    was_default = addr.get("is_default", False)
    await db.customers.update_one({"id": auth["customer_id"]}, {"$pull": {"addresses": {"id": addr_id}}})

    if was_default:
        remaining = [a for a in addresses if a.get("id") != addr_id]
        if remaining:
            remaining.sort(key=lambda a: a.get("updated_at", a.get("created_at", "")), reverse=True)
            await db.customers.update_one(
                {"id": auth["customer_id"], "addresses.id": remaining[0]["id"]},
                {"$set": {"addresses.$.is_default": True}}
            )

    return _resp(True, "Address deleted", {"address_id": addr_id})


@router.put("/addresses/{addr_id}/default")
async def set_my_default_address(addr_id: str, auth: dict = Depends(verify_customer_token)):
    """Set default address."""
    customer = await db.customers.find_one(
        {"id": auth["customer_id"], "user_id": auth["restaurant_id"]}
    )
    if not customer:
        return _resp(False, "Customer not found")

    if not any(a.get("id") == addr_id for a in customer.get("addresses", [])):
        return _resp(False, "Address not found")

    await db.customers.update_one(
        {"id": auth["customer_id"]},
        {"$set": {"addresses.$[].is_default": False}}
    )
    await db.customers.update_one(
        {"id": auth["customer_id"], "addresses.id": addr_id},
        {"$set": {"addresses.$.is_default": True}}
    )
    return _resp(True, "Default address set", {"address_id": addr_id})






# ============================================
# C6 - Customer Actions
# ============================================

@router.post("/feedback")
async def submit_feedback(
    data: FeedbackSubmit,
    request: Request,
    auth: Optional[dict] = Depends(optional_customer_token),  # CR-096
):
    """CR-096: hybrid feedback intake — token, phone, or anonymous; never creates a customer."""
    if data.rating < 1 or data.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    message = (data.message or "")[:500]  # CR-096: 500-char cap
    now = datetime.now(timezone.utc).isoformat()

    # ── Auth branch (Case A) ─────────────────────────────────────────────────
    if auth:
        rid            = auth["restaurant_id"]
        customer_id    = auth["customer_id"]
        phone          = auth.get("phone")
        cc             = None
        customer_name  = None
        identity_source = "token"
    else:
        # ── No-token branch ──────────────────────────────────────────────────
        if not data.restaurant_id:
            raise HTTPException(status_code=422, detail="restaurant_id required when not logged in")
        rid = await _resolve_restaurant_id(data.restaurant_id)  # BUG-030
        if not await db.users.find_one({"id": rid}, {"_id": 0, "id": 1}):
            raise HTTPException(status_code=404, detail="Restaurant not found")

        # IP bucket first (BUG-025 order) — CR-096
        retry = await _lookup_rate_limited(f"fb-ip:{_client_ip(request)}", *_FEEDBACK_IP_LIMIT)
        if retry:
            raise HTTPException(status_code=429, detail="Too many requests", headers={"Retry-After": str(retry)})

        customer_id = None; customer_name = None; phone = None; cc = None

        if data.phone:
            # Cases C / D / F / G
            phone, cc, pstatus = normalize_phone(data.phone, data.country_code)
            if pstatus == "invalid":
                raise HTTPException(status_code=400, detail="Enter a valid mobile number")
            retry = await _lookup_rate_limited(f"fb-ph:{rid}:{cc}{phone}", *_FEEDBACK_PHONE_LIMIT)
            if retry:
                raise HTTPException(status_code=429, detail="Too many requests", headers={"Retry-After": str(retry)})
            cust = await db.customers.find_one(
                {**phone_match(rid, phone, cc), "is_blocked": {"$ne": True}},
                {"_id": 0, "id": 1, "name": 1},
            )
            customer_id   = cust["id"] if cust else None  # CR-096
            customer_name = (cust.get("name") or None) if cust else None  # CR-096
            identity_source = "phone"
        else:
            # Case E: anonymous
            identity_source = "none"

    # ── order_id: store null + raw on mismatch (Q3) ──────────────────────────
    order_id = data.order_id; order_id_raw = None
    if order_id:
        if not await db.orders.find_one({"id": order_id, "user_id": rid}):
            order_id_raw = order_id; order_id = None

    feedback_doc = {
        "id": str(uuid.uuid4()),
        "user_id": rid,
        "customer_id": customer_id,
        "customer_name": customer_name,
        "customer_phone": phone,
        "country_code": cc,
        "rating": data.rating,
        "message": message,
        "order_id": order_id,
        "order_id_raw": order_id_raw,
        "status": "pending",
        "source": "scan_and_order",
        "identity_source": identity_source,
        "linked": customer_id is not None,
        "created_at": now,
    }  # CR-096
    await db.feedback.insert_one(feedback_doc)

    if customer_id:
        await db.customers.update_one(
            {"id": customer_id},
            {"$set": {"last_rating": data.rating}, "$inc": {"feedback_count": 1}},
        )

    return _resp(True, "Feedback submitted", {
        "feedback_id": feedback_doc["id"],
        "linked": feedback_doc["linked"],
    })  # CR-096


@router.post("/call-waiter")
async def call_waiter(data: TableAction, auth: dict = Depends(verify_customer_token)):
    """Call waiter (dine-in)."""
    now = datetime.now(timezone.utc).isoformat()
    event = {
        "id": str(uuid.uuid4()),
        "type": "call_waiter",
        "user_id": auth["restaurant_id"],
        "customer_id": auth["customer_id"],
        "table_id": data.table_id,
        "message": data.message,
        "status": "pending",
        "created_at": now
    }
    await db.pos_event_logs.insert_one(event)
    return _resp(True, "Waiter notified", {"event_id": event["id"], "table_id": data.table_id})


@router.post("/request-bill")
async def request_bill(data: TableAction, auth: dict = Depends(verify_customer_token)):
    """Request bill (dine-in)."""
    now = datetime.now(timezone.utc).isoformat()
    event = {
        "id": str(uuid.uuid4()),
        "type": "request_bill",
        "user_id": auth["restaurant_id"],
        "customer_id": auth["customer_id"],
        "table_id": data.table_id,
        "message": data.message,
        "status": "pending",
        "created_at": now
    }
    await db.pos_event_logs.insert_one(event)
    return _resp(True, "Bill requested", {"event_id": event["id"], "table_id": data.table_id})
