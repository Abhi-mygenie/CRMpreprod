"""
Scan & Order Customer-Facing API
All /scan/* endpoints for the customer mobile/web app
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid
import random
import logging

from core.database import db
from core.auth import (
    verify_customer_token, create_customer_token,
    get_current_user, hash_password, verify_password
)
from core.helpers import calculate_tier, get_earn_percent_for_tier
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


def _short_restaurant_id(restaurant_id: str) -> str:
    """Extract short ID from full format."""
    if restaurant_id.startswith("pos_0001_restaurant_"):
        return restaurant_id.replace("pos_0001_restaurant_", "")
    return restaurant_id


def _generate_addr_id() -> str:
    return f"addr_{uuid.uuid4().hex[:12]}"


# ============================================
# Request Schemas
# ============================================

class OTPRequest(BaseModel):
    phone: str
    restaurant_id: str


class OTPVerify(BaseModel):
    phone: str
    otp: str
    restaurant_id: str


class CustomerRegister(BaseModel):
    phone: str
    name: str
    password: str
    restaurant_id: str
    email: Optional[str] = None


class CustomerLogin(BaseModel):
    phone: str
    password: str
    restaurant_id: str


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
    message: Optional[str] = None
    order_id: Optional[str] = None


class TableAction(BaseModel):
    table_id: str
    message: Optional[str] = None


class AppConfigUpdate(BaseModel):
    primaryColor: Optional[str] = None
    secondaryColor: Optional[str] = None
    backgroundColor: Optional[str] = None
    buttonTextColor: Optional[str] = None
    textColor: Optional[str] = None
    textSecondaryColor: Optional[str] = None
    fontHeading: Optional[str] = None
    fontBody: Optional[str] = None
    logoUrl: Optional[str] = None
    tagline: Optional[str] = None
    welcomeMessage: Optional[str] = None
    banners: Optional[List[dict]] = None
    showCallWaiter: Optional[bool] = None
    showPayBill: Optional[bool] = None
    showCategories: Optional[bool] = None
    showPriceBreakdown: Optional[bool] = None
    showPromotionsOnMenu: Optional[bool] = None
    showTableInfo: Optional[bool] = None
    showLoyaltyPoints: Optional[bool] = None
    showWallet: Optional[bool] = None
    showLoginButton: Optional[bool] = None
    feedbackEnabled: Optional[bool] = None
    feedbackIntroText: Optional[str] = None
    aboutUsContent: Optional[str] = None
    aboutUsImage: Optional[str] = None
    openingHours: Optional[str] = None
    address: Optional[str] = None
    contactEmail: Optional[str] = None
    phone: Optional[str] = None
    instagramUrl: Optional[str] = None
    facebookUrl: Optional[str] = None
    twitterUrl: Optional[str] = None
    whatsappNumber: Optional[str] = None
    youtubeUrl: Optional[str] = None
    navMenuOrder: Optional[List[dict]] = None
    footerLinks: Optional[List[dict]] = None
    footerText: Optional[str] = None
    mapEmbedUrl: Optional[str] = None
    borderRadius: Optional[str] = None
    showHamburgerMenu: Optional[bool] = None
    showCookingInstructions: Optional[bool] = None
    showSpecialInstructions: Optional[bool] = None
    showDescription: Optional[bool] = None
    showFoodStatus: Optional[bool] = None
    showOrderStatusTracker: Optional[bool] = None
    showEstimatedTimes: Optional[bool] = None
    showCouponCode: Optional[bool] = None
    showCustomerDetails: Optional[bool] = None
    showCustomerName: Optional[bool] = None
    showCustomerPhone: Optional[bool] = None
    showExtraInfo: Optional[bool] = None
    showFooter: Optional[bool] = None
    showLogo: Optional[bool] = None
    showMenuFab: Optional[bool] = None
    showPoweredBy: Optional[bool] = None
    showSocialIcons: Optional[bool] = None
    showTableNumber: Optional[bool] = None
    showWelcomeText: Optional[bool] = None
    showLandingCallWaiter: Optional[bool] = None
    showLandingCustomerCapture: Optional[bool] = None
    showLandingPayBill: Optional[bool] = None
    browseMenuButtonText: Optional[str] = None
    backgroundImageUrl: Optional[str] = None
    mobileBackgroundImageUrl: Optional[str] = None
    restaurantOpeningTime: Optional[str] = None
    restaurantClosingTime: Optional[str] = None
    extraInfoItems: Optional[List[str]] = None
    customPages: Optional[List[dict]] = None


class DietaryTagsUpdate(BaseModel):
    mappings: dict


# Standard response
def _resp(success: bool, message: str, data=None):
    return {"success": success, "message": message, "data": data}


# ============================================
# C1 - Customer Authentication
# ============================================

@router.post("/auth/request-otp")
async def request_otp(req: OTPRequest):
    """Send OTP to customer phone (per restaurant context)."""
    full_restaurant_id = _normalize_restaurant_id(req.restaurant_id)

    # Rate limit: max 3 OTPs per phone per 5 minutes
    five_min_ago = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    recent_count = await db.customer_otps.count_documents({
        "phone": req.phone,
        "user_id": full_restaurant_id,
        "created_at": {"$gte": five_min_ago}
    })
    if recent_count >= 3:
        raise HTTPException(status_code=429, detail="Too many OTP requests. Try again in a few minutes.")

    otp = str(random.randint(100000, 999999))
    now = datetime.now(timezone.utc).isoformat()
    expires = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()

    # Find or prepare customer_id
    customer = await db.customers.find_one(
        {"phone": req.phone, "user_id": full_restaurant_id},
        {"_id": 0, "id": 1}
    )
    customer_id = customer["id"] if customer else None

    otp_doc = {
        "id": str(uuid.uuid4()),
        "phone": req.phone,
        "user_id": full_restaurant_id,
        "otp": otp,
        "customer_id": customer_id,
        "expires_at": expires,
        "verified": False,
        "created_at": now
    }
    await db.customer_otps.insert_one(otp_doc)

    # DEV MODE: log OTP (production would send via WhatsApp/SMS)
    logger.info(f"[DEV] OTP for {req.phone} at {req.restaurant_id}: {otp}")

    return _resp(True, "OTP sent", {"phone": req.phone, "expires_in_seconds": 600, "dev_otp": otp})


@router.post("/auth/verify-otp")
async def verify_otp(req: OTPVerify):
    """Verify OTP and return customer token. Auto-creates customer if new."""
    full_restaurant_id = _normalize_restaurant_id(req.restaurant_id)
    now = datetime.now(timezone.utc).isoformat()

    otp_doc = await db.customer_otps.find_one({
        "phone": req.phone,
        "user_id": full_restaurant_id,
        "otp": req.otp,
        "verified": False
    }, sort=[("created_at", -1)])

    if not otp_doc:
        return _resp(False, "Invalid OTP")

    if otp_doc.get("expires_at", "") < now:
        return _resp(False, "OTP expired")

    # Mark verified
    await db.customer_otps.update_one({"id": otp_doc["id"]}, {"$set": {"verified": True}})

    # Find or create customer
    customer = await db.customers.find_one(
        {"phone": req.phone, "user_id": full_restaurant_id},
        {"_id": 0, "id": 1, "name": 1}
    )

    is_new = False
    if not customer:
        customer_id = str(uuid.uuid4())
        customer_doc = {
            "id": customer_id,
            "user_id": full_restaurant_id,
            "name": "",
            "phone": req.phone,
            "country_code": "+91",
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
        await db.customers.insert_one(customer_doc)
        is_new = True
    else:
        customer_id = customer["id"]

    # Update OTP doc with customer_id
    await db.customer_otps.update_one({"id": otp_doc["id"]}, {"$set": {"customer_id": customer_id}})

    token = create_customer_token(customer_id, full_restaurant_id, req.phone)
    return _resp(True, "OTP verified", {
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


@router.post("/auth/register")
async def register_customer(req: CustomerRegister):
    """Register customer with password (alternative to OTP)."""
    full_restaurant_id = _normalize_restaurant_id(req.restaurant_id)

    existing = await db.customers.find_one(
        {"phone": req.phone, "user_id": full_restaurant_id},
        {"_id": 0, "id": 1, "password_hash": 1}
    )
    if existing and existing.get("password_hash"):
        return _resp(False, "Phone already registered")

    now = datetime.now(timezone.utc).isoformat()
    pwd_hash = hash_password(req.password)

    if existing:
        # Customer exists (from OTP or POS) but no password — add password
        await db.customers.update_one(
            {"id": existing["id"]},
            {"$set": {"password_hash": pwd_hash, "name": req.name, "email": req.email, "updated_at": now}}
        )
        customer_id = existing["id"]
    else:
        customer_id = str(uuid.uuid4())
        customer_doc = {
            "id": customer_id,
            "user_id": full_restaurant_id,
            "name": req.name,
            "phone": req.phone,
            "country_code": "+91",
            "email": req.email,
            "password_hash": pwd_hash,
            "tier": "Bronze",
            "total_points": 0,
            "wallet_balance": 0.0,
            "total_visits": 0,
            "total_spent": 0.0,
            "allergies": [],
            "favorites": [],
            "customer_type": "normal",
            "is_blocked": False,
            "created_at": now,
            "updated_at": now
        }
        await db.customers.insert_one(customer_doc)

    token = create_customer_token(customer_id, full_restaurant_id, req.phone)
    return _resp(True, "Registration successful", {"token": token, "customer_id": customer_id})


@router.post("/auth/login")
async def login_customer(req: CustomerLogin):
    """Login with phone + password."""
    full_restaurant_id = _normalize_restaurant_id(req.restaurant_id)

    customer = await db.customers.find_one(
        {"phone": req.phone, "user_id": full_restaurant_id},
        {"_id": 0, "id": 1, "password_hash": 1}
    )
    if not customer or not customer.get("password_hash"):
        return _resp(False, "Invalid credentials")

    if not verify_password(req.password, customer["password_hash"]):
        return _resp(False, "Invalid credentials")

    token = create_customer_token(customer["id"], full_restaurant_id, req.phone)
    return _resp(True, "Login successful", {"token": token, "customer_id": customer["id"]})


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
        "redemption_value_per_point": redemption_value
    })


@router.get("/points/history")
async def get_points_history(limit: int = 20, auth: dict = Depends(verify_customer_token)):
    """My points transaction history."""
    txns = await db.points_transactions.find(
        {"customer_id": auth["customer_id"], "user_id": auth["restaurant_id"]},
        {"_id": 0}
    ).sort("created_at", -1).limit(min(limit, 50)).to_list(min(limit, 50))
    return _resp(True, f"{len(txns)} transactions", {"transactions": txns, "total": len(txns)})


@router.get("/wallet/history")
async def get_wallet_history(limit: int = 20, auth: dict = Depends(verify_customer_token)):
    """My wallet transaction history."""
    txns = await db.wallet_transactions.find(
        {"customer_id": auth["customer_id"], "user_id": auth["restaurant_id"]},
        {"_id": 0}
    ).sort("created_at", -1).limit(min(limit, 50)).to_list(min(limit, 50))
    return _resp(True, f"{len(txns)} transactions", {"transactions": txns, "total": len(txns)})


@router.get("/orders")
async def get_orders(limit: int = 20, auth: dict = Depends(verify_customer_token)):
    """My order history."""
    orders = await db.orders.find(
        {"customer_id": auth["customer_id"], "user_id": auth["restaurant_id"]},
        {"_id": 0}
    ).sort("created_at", -1).limit(min(limit, 50)).to_list(min(limit, 50))
    total = await db.orders.count_documents({"customer_id": auth["customer_id"], "user_id": auth["restaurant_id"]})
    return _resp(True, f"{len(orders)} orders", {"orders": orders, "total": total})


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
        if usage < c.get("per_user_limit", 1):
            c["my_usage_count"] = usage
            eligible.append(c)

    return _resp(True, f"{len(eligible)} coupons available", {"coupons": eligible})


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
# C4 - Restaurant App Configuration
# ============================================

@router.get("/config/{restaurant_id}")
async def get_app_config(restaurant_id: str):
    """Get restaurant app config (public — no auth)."""
    # Dual lookup: try short ID first, then full
    config = await db.customer_app_config.find_one(
        {"restaurant_id": restaurant_id}, {"_id": 0}
    )
    if not config:
        full_id = _normalize_restaurant_id(restaurant_id)
        config = await db.customer_app_config.find_one(
            {"restaurant_id": full_id}, {"_id": 0}
        )
    if not config:
        short_id = _short_restaurant_id(restaurant_id)
        config = await db.customer_app_config.find_one(
            {"restaurant_id": short_id}, {"_id": 0}
        )
    if not config:
        return _resp(False, "Config not found")

    return _resp(True, "Config loaded", config)


@router.put("/config/{restaurant_id}")
async def update_app_config(restaurant_id: str, updates: AppConfigUpdate, user: dict = Depends(get_current_user)):
    """Update restaurant app config (CRM admin only — JWT auth)."""
    update_dict = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not update_dict:
        return _resp(False, "No fields to update")

    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()

    # Try to find existing config
    config = await db.customer_app_config.find_one({"restaurant_id": restaurant_id})
    if not config:
        full_id = _normalize_restaurant_id(restaurant_id)
        config = await db.customer_app_config.find_one({"restaurant_id": full_id})
    if not config:
        short_id = _short_restaurant_id(restaurant_id)
        config = await db.customer_app_config.find_one({"restaurant_id": short_id})

    if config:
        await db.customer_app_config.update_one({"_id": config["_id"]}, {"$set": update_dict})
    else:
        update_dict["restaurant_id"] = restaurant_id
        update_dict["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.customer_app_config.insert_one(update_dict)

    return _resp(True, "Config updated")


# ============================================
# C5 - Dietary Tags
# ============================================

@router.get("/menu/dietary-tags/{restaurant_id}")
async def get_dietary_tags(restaurant_id: str):
    """Get dietary tag mappings for menu items (public)."""
    short_id = _short_restaurant_id(restaurant_id)
    doc = await db.dietary_tags_mapping.find_one({"restaurant_id": short_id}, {"_id": 0})
    if not doc:
        doc = await db.dietary_tags_mapping.find_one({"restaurant_id": restaurant_id}, {"_id": 0})
    if not doc:
        return _resp(True, "No dietary tags configured", {"restaurant_id": restaurant_id, "mappings": {}})

    return _resp(True, "Dietary tags loaded", doc)


@router.put("/menu/dietary-tags/{restaurant_id}")
async def update_dietary_tags(restaurant_id: str, data: DietaryTagsUpdate, user: dict = Depends(get_current_user)):
    """Update dietary tag mappings (CRM admin only)."""
    short_id = _short_restaurant_id(restaurant_id)
    now = datetime.now(timezone.utc).isoformat()

    existing = await db.dietary_tags_mapping.find_one({"restaurant_id": short_id})
    if not existing:
        existing = await db.dietary_tags_mapping.find_one({"restaurant_id": restaurant_id})

    if existing:
        await db.dietary_tags_mapping.update_one(
            {"_id": existing["_id"]},
            {"$set": {"mappings": data.mappings, "updated_at": now, "updated_by": user.get("id")}}
        )
    else:
        await db.dietary_tags_mapping.insert_one({
            "restaurant_id": short_id,
            "mappings": data.mappings,
            "updated_at": now,
            "updated_by": user.get("id")
        })

    return _resp(True, "Dietary tags updated")


# ============================================
# C6 - Customer Actions
# ============================================

@router.post("/feedback")
async def submit_feedback(data: FeedbackSubmit, auth: dict = Depends(verify_customer_token)):
    """Submit feedback."""
    if data.rating < 1 or data.rating > 5:
        return _resp(False, "Rating must be between 1 and 5")

    now = datetime.now(timezone.utc).isoformat()
    feedback_doc = {
        "id": str(uuid.uuid4()),
        "user_id": auth["restaurant_id"],
        "customer_id": auth["customer_id"],
        "customer_phone": auth["phone"],
        "rating": data.rating,
        "message": data.message or "",
        "order_id": data.order_id,
        "status": "pending",
        "source": "scan_and_order",
        "created_at": now
    }
    await db.feedback.insert_one(feedback_doc)

    # Update customer feedback stats
    await db.customers.update_one(
        {"id": auth["customer_id"]},
        {"$set": {"last_rating": data.rating}, "$inc": {"feedback_count": 1}}
    )

    return _resp(True, "Feedback submitted", {"feedback_id": feedback_doc["id"]})


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
