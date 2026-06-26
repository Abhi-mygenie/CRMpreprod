from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.aliases import AliasChoices
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid
import asyncio
import logging
import os

from core.database import db
from core.auth import get_current_user, generate_api_key, verify_pos_auth
from core.helpers import calculate_tier, get_earn_percent_for_tier, check_off_peak_bonus, get_redemption_value_for_tier
from core.loyalty import build_pos_loyalty_blob, redeem_loyalty_points, compute_max_redeemable, calculate_points, default_loyalty_settings
from core.whatsapp import trigger_whatsapp_event, build_order_event_context
from models.schemas import (
    POSPaymentWebhook, POSCustomerLookup, POSResponse,
    MessageRequest, POS_EVENTS,
    CustomerAddress, CustomerAddressCreate, CustomerAddressUpdate,
    POSCouponValidateRequest, POSCartItem,
)
from core.coupon import (
    validate_coupon_for_customer,
    list_available_coupons,
    record_coupon_usage_for_order,
    build_display_title,
)

router = APIRouter(prefix="/pos", tags=["POS Gateway"])
messaging_router = APIRouter(prefix="/messaging", tags=["Messaging"])


def _tier_rank_pos(tier: str) -> int:
    """Get tier rank for comparison"""
    ranks = {"Bronze": 1, "Silver": 2, "Gold": 3, "Platinum": 4}
    return ranks.get(tier, 0)


def _generate_addr_id() -> str:
    """Generate address ID with addr_ prefix"""
    return f"addr_{uuid.uuid4().hex[:12]}"


# ============================================
# POS Customer Management APIs (for MyGenie/other POS to call)
# ============================================

class POSCustomerCreate(BaseModel):
    """Schema for POS to create a customer - includes all customer fields"""
    # POS Identification (Required)
    pos_id: str  # POS system identifier (mygenie, petpooja, ezzo)
    restaurant_id: str  # Restaurant ID in that POS system
    
    # Basic Info
    name: str
    phone: str
    country_code: str = "+91"
    email: Optional[str] = None
    gender: Optional[str] = None  # male, female, other, prefer_not_to_say
    
    # Personal Details
    dob: Optional[str] = None  # Date of birth (YYYY-MM-DD)
    anniversary: Optional[str] = None  # Anniversary date (YYYY-MM-DD)
    preferred_language: Optional[str] = None  # en, hi, etc.
    
    # Customer Type
    customer_type: str = "normal"  # "normal" or "corporate"
    segment_tags: Optional[List[str]] = None
    
    # Contact & Marketing Permissions
    whatsapp_opt_in: bool = False
    promo_whatsapp_allowed: bool = True
    promo_sms_allowed: bool = True
    email_marketing_allowed: bool = True
    call_allowed: bool = True
    
    # Loyalty Information
    referral_code: Optional[str] = None
    referred_by: Optional[str] = None
    membership_id: Optional[str] = None
    membership_expiry: Optional[str] = None
    
    # Behavior & Preferences
    favorite_category: Optional[str] = None
    preferred_payment_mode: Optional[str] = None
    
    # Customer Source & Journey
    lead_source: Optional[str] = None
    campaign_source: Optional[str] = None
    assigned_salesperson: Optional[str] = None
    
    # GST Details
    gst_name: Optional[str] = None
    gst_number: Optional[str] = None
    billing_address: Optional[str] = None
    credit_limit: Optional[float] = None
    payment_terms: Optional[str] = None
    
    # Address (flat - legacy)
    address: Optional[str] = None
    address_line_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: Optional[str] = None
    delivery_instructions: Optional[str] = None
    map_location: Optional[dict] = None
    
    # Addresses (array - new)
    addresses: Optional[List[CustomerAddressCreate]] = None
    
    # Preferences
    allergies: Optional[List[str]] = None  # List of allergies
    favorites: Optional[List[str]] = None  # List of favorite items
    
    # Custom Fields
    custom_field_1: Optional[str] = None
    custom_field_2: Optional[str] = None
    custom_field_3: Optional[str] = None
    
    # Notes
    notes: Optional[str] = None


class POSCustomerUpdate(BaseModel):
    """Schema for POS to update a customer - phone is required as unique key"""
    # POS Identification (Required)
    pos_id: str  # POS system identifier (mygenie, petpooja, ezzo)
    restaurant_id: str  # Restaurant ID in that POS system
    
    # Basic Info (phone is required - unique key)
    phone: str  # Required - unique identifier
    name: Optional[str] = None
    country_code: Optional[str] = None
    email: Optional[str] = None
    gender: Optional[str] = None
    
    # Personal Details
    dob: Optional[str] = None
    anniversary: Optional[str] = None
    preferred_language: Optional[str] = None
    
    # Customer Type
    customer_type: Optional[str] = None
    segment_tags: Optional[List[str]] = None
    
    # Contact & Marketing Permissions
    whatsapp_opt_in: Optional[bool] = None
    promo_whatsapp_allowed: Optional[bool] = None
    promo_sms_allowed: Optional[bool] = None
    email_marketing_allowed: Optional[bool] = None
    call_allowed: Optional[bool] = None
    is_blocked: Optional[bool] = None
    
    # Loyalty Information
    referral_code: Optional[str] = None
    referred_by: Optional[str] = None
    membership_id: Optional[str] = None
    membership_expiry: Optional[str] = None
    
    # Behavior & Preferences
    favorite_category: Optional[str] = None
    preferred_payment_mode: Optional[str] = None
    
    # Customer Source & Journey
    lead_source: Optional[str] = None
    campaign_source: Optional[str] = None
    last_interaction_date: Optional[str] = None
    assigned_salesperson: Optional[str] = None
    
    # WhatsApp CRM Tracking
    last_whatsapp_sent: Optional[str] = None
    last_whatsapp_response: Optional[str] = None
    last_campaign_clicked: Optional[str] = None
    last_coupon_used: Optional[str] = None
    automation_status_tag: Optional[str] = None
    
    # GST Details
    gst_name: Optional[str] = None
    gst_number: Optional[str] = None
    billing_address: Optional[str] = None
    credit_limit: Optional[float] = None
    payment_terms: Optional[str] = None
    
    # Address (flat - legacy)
    address: Optional[str] = None
    address_line_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: Optional[str] = None
    delivery_instructions: Optional[str] = None
    map_location: Optional[dict] = None
    
    # Addresses (array - new, only set if explicitly provided)
    addresses: Optional[List[CustomerAddressCreate]] = None
    
    # Preferences
    allergies: Optional[List[str]] = None
    favorites: Optional[List[str]] = None
    
    # Custom Fields
    custom_field_1: Optional[str] = None
    custom_field_2: Optional[str] = None
    custom_field_3: Optional[str] = None
    
    # Notes
    notes: Optional[str] = None


@router.post("/customers", response_model=POSResponse)
async def pos_create_customer(
    customer_data: POSCustomerCreate,
    user: dict = Depends(verify_pos_auth)
):
    """
    API for POS (MyGenie/others) to create a customer in our database.
    Requires X-API-Key header for authentication.
    """
    # Check if phone exists for this user
    existing = await db.customers.find_one({"user_id": user["id"], "phone": customer_data.phone})
    if existing:
        return POSResponse(
            success=False,
            message="Customer with this phone already exists",
            data={"customer_id": existing["id"], "existing": True}
        )
    
    customer_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    customer_doc = {
        "id": customer_id,
        "user_id": user["id"],
        "created_at": now,
        "updated_at": now,
        
        # POS Identification
        "pos_id": customer_data.pos_id,
        "pos_restaurant_id": customer_data.restaurant_id,
        
        # Basic Info
        "name": customer_data.name,
        "phone": customer_data.phone,
        "country_code": customer_data.country_code,
        "email": customer_data.email,
        "gender": customer_data.gender,
        
        # Personal Details
        "dob": customer_data.dob,
        "anniversary": customer_data.anniversary,
        "preferred_language": customer_data.preferred_language,
        
        # Customer Type
        "customer_type": customer_data.customer_type,
        "segment_tags": customer_data.segment_tags or [],
        
        # Contact & Marketing Permissions
        "whatsapp_opt_in": customer_data.whatsapp_opt_in,
        "whatsapp_opt_in_date": None,
        "promo_whatsapp_allowed": customer_data.promo_whatsapp_allowed,
        "promo_sms_allowed": customer_data.promo_sms_allowed,
        "email_marketing_allowed": customer_data.email_marketing_allowed,
        "call_allowed": customer_data.call_allowed,
        "is_blocked": False,
        
        # Loyalty Information
        "total_points": 0,
        # CR-001C-L Phase L2 (C10, 2026-05-22): defensive init of
        # lifetime earned/redeemed counters on POS-create path.
        "total_points_earned": 0,
        "total_points_redeemed": 0,
        "wallet_balance": 0.0,
        "tier": "Bronze",
        "referral_code": customer_data.referral_code,
        "referred_by": customer_data.referred_by,
        "membership_id": customer_data.membership_id,
        "membership_expiry": customer_data.membership_expiry,
        
        # Spending & Visit Behavior
        "total_visits": 0,
        "total_spent": 0.0,
        "avg_order_value": 0.0,
        "last_visit": None,
        "favorite_category": customer_data.favorite_category,
        "preferred_payment_mode": customer_data.preferred_payment_mode,
        
        # Customer Source & Journey
        "lead_source": customer_data.lead_source,
        "campaign_source": customer_data.campaign_source,
        "last_interaction_date": now,
        "assigned_salesperson": customer_data.assigned_salesperson,
        
        # WhatsApp CRM Tracking
        "last_whatsapp_sent": None,
        "last_whatsapp_response": None,
        "last_campaign_clicked": None,
        "last_coupon_used": None,
        "automation_status_tag": None,
        
        # GST Details
        "gst_name": customer_data.gst_name,
        "gst_number": customer_data.gst_number,
        "billing_address": customer_data.billing_address,
        "credit_limit": customer_data.credit_limit,
        "payment_terms": customer_data.payment_terms,
        
        # Address
        "address": customer_data.address,
        "address_line_2": customer_data.address_line_2,
        "city": customer_data.city,
        "state": customer_data.state,
        "pincode": customer_data.pincode,
        "country": customer_data.country,
        "delivery_instructions": customer_data.delivery_instructions,
        "map_location": customer_data.map_location,
        
        # Preferences
        "allergies": customer_data.allergies or [],
        "favorites": customer_data.favorites or [],
        
        # Custom Fields
        "custom_field_1": customer_data.custom_field_1,
        "custom_field_2": customer_data.custom_field_2,
        "custom_field_3": customer_data.custom_field_3,
        
        # Notes
        "notes": customer_data.notes,
        
        # Sync Status
        "pos_synced": True,
        "pos_synced_at": now
    }
    
    # Add addresses array if provided
    if customer_data.addresses:
        addr_list = []
        for addr in customer_data.addresses:
            addr_doc = addr.model_dump()
            addr_doc["id"] = _generate_addr_id()
            addr_doc["created_at"] = now
            addr_doc["updated_at"] = now
            addr_list.append(addr_doc)
        # Ensure only one default
        defaults = [a for a in addr_list if a.get("is_default")]
        if len(defaults) > 1:
            for a in addr_list:
                a["is_default"] = False
            addr_list[0]["is_default"] = True
        elif not defaults and addr_list:
            addr_list[0]["is_default"] = True
        customer_doc["addresses"] = addr_list
    
    await db.customers.insert_one(customer_doc)
    
    return POSResponse(
        success=True,
        message="Customer created successfully",
        data={
            "customer_id": customer_id,
            "name": customer_data.name,
            "phone": customer_data.phone,
            "created_at": now
        }
    )


@router.put("/customers/{customer_id}", response_model=POSResponse)
async def pos_update_customer(
    customer_id: str,
    update_data: POSCustomerUpdate,
    user: dict = Depends(verify_pos_auth)
):
    """
    API for POS (MyGenie/others) to update a customer in our database.
    Requires X-API-Key header for authentication.
    """
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]})
    if not customer:
        return POSResponse(
            success=False,
            message="Customer not found",
            data=None
        )
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    # Handle addresses separately — only write if explicitly provided
    addresses_update = update_dict.pop("addresses", None)
    
    # Map restaurant_id to pos_restaurant_id for storage
    if "restaurant_id" in update_dict:
        update_dict["pos_restaurant_id"] = update_dict.pop("restaurant_id")
    
    # Check phone uniqueness if phone is being updated
    if "phone" in update_dict and update_dict["phone"] != customer.get("phone"):
        existing = await db.customers.find_one({
            "user_id": user["id"],
            "phone": update_dict["phone"],
            "id": {"$ne": customer_id}
        })
        if existing:
            return POSResponse(
                success=False,
                message="Another customer with this phone already exists",
                data=None
            )
    
    now = datetime.now(timezone.utc).isoformat()
    
    if update_dict:
        update_dict["pos_synced"] = True
        update_dict["pos_synced_at"] = now
        await db.customers.update_one({"id": customer_id}, {"$set": update_dict})
    
    # Process addresses if explicitly provided
    if addresses_update is not None:
        addr_list = []
        for addr_data in addresses_update:
            addr_doc = addr_data if isinstance(addr_data, dict) else addr_data
            addr_doc["id"] = addr_doc.get("id") or _generate_addr_id()
            addr_doc["created_at"] = addr_doc.get("created_at") or now
            addr_doc["updated_at"] = now
            addr_list.append(addr_doc)
        await db.customers.update_one({"id": customer_id}, {"$set": {"addresses": addr_list}})
    
    updated = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    
    return POSResponse(
        success=True,
        message="Customer updated successfully",
        data={
            "customer_id": customer_id,
            "name": updated.get("name"),
            "phone": updated.get("phone"),
            "updated_at": update_dict.get("pos_synced_at")
        }
    )

# ============================================
# Loyalty Points - Max Redeemable Check
# ============================================

class POSMaxRedeemableRequest(BaseModel):
    """Request to check max redeemable loyalty points.

    CR-001C-LR correction (2026-05-23): accepts either `customer_id` or
    `cust_mobile` (at least one required). Prefers `customer_id` when both
    are provided. `cust_mobile` retained for backward compatibility.
    """
    pos_id: Optional[str] = None
    restaurant_id: Optional[str] = None
    customer_id: Optional[str] = None
    cust_mobile: Optional[str] = None
    bill_amount: float


@router.post("/max-redeemable", response_model=POSResponse)
async def pos_max_redeemable(
    request: POSMaxRedeemableRequest,
    user: dict = Depends(verify_pos_auth)
):
    """
    CR-001C-LR correction (2026-05-23): Thin wrapper over shared
    `core.loyalty.compute_max_redeemable` helper. The calculator side and
    the commit-side auto-cap step share the same function, so the cap
    shown to the cashier always matches what CRM actually applies.

    Accepts EITHER `customer_id` OR `cust_mobile` (at least one).
    `customer_id` preferred when both present.
    """
    user_id = user["id"]

    # Resolve customer — customer_id wins; fall back to cust_mobile.
    if not request.customer_id and not request.cust_mobile:
        return POSResponse(
            success=False,
            message="Customer identifier required.",
            data={"error": {
                "code": "INVALID_REQUEST",
                "message": "At least one of customer_id or cust_mobile is required.",
            }},
        )

    customer = None
    if request.customer_id:
        customer = await db.customers.find_one(
            {"id": request.customer_id, "user_id": user_id}
        )
    if not customer and request.cust_mobile:
        customer = await db.customers.find_one(
            {"user_id": user_id, "phone": request.cust_mobile}
        )

    if not customer:
        return POSResponse(
            success=False,
            message="Customer not found.",
            data={"registered": False, "error": {
                "code": "CUSTOMER_NOT_FOUND",
                "message": "Customer not found for this restaurant.",
            }},
        )

    settings = await db.loyalty_settings.find_one({"user_id": user_id}, {"_id": 0})

    # Shared calculator — same function the commit-side auto-cap uses.
    cap = compute_max_redeemable(customer, settings, request.bill_amount)

    # CR-017 (2026-05-29): Project points the customer will earn on this bill.
    # Uses the same calculate_points() function as the order flow.
    loyalty_enabled = bool((settings or {}).get("loyalty_enabled", False))
    if loyalty_enabled and settings:
        pts = calculate_points(request.bill_amount, customer, settings)
        earn_percent = get_earn_percent_for_tier(customer.get("tier", "Bronze"), settings)
        projected_earned = pts["total_points"]
    else:
        earn_percent = 0.0
        projected_earned = 0

    # Human-readable earn ratio: e.g. 5% → "₹1 per ₹20 spent"
    if earn_percent > 0:
        spend_per_point = round(100 / earn_percent)
        earn_ratio_display = f"₹1 per ₹{spend_per_point} spent"
    else:
        earn_ratio_display = ""

    # CR-018 (2026-05-29): Project tier after this order.
    current_tier = customer.get("tier", "Bronze")
    if loyalty_enabled and settings:
        current_points = customer.get("total_points", 0)
        projected_total = current_points + projected_earned
        projected_tier = calculate_tier(projected_total, settings)
        tier_upgrade = projected_tier != current_tier
        tier_upgrade_message = f"Complete this order and you'll upgrade to {projected_tier}!" if tier_upgrade else ""
    else:
        projected_tier = current_tier
        tier_upgrade = False
        tier_upgrade_message = ""

    data = {
        "max_points_redeemable": cap["max_points_redeemable"],
        "max_discount_value": cap["max_discount_value"],
        "ratio_per_point": cap["ratio_per_point"],
        "tier": cap["tier"],
        "available_points": cap["available_points"],
        "min_redemption_points": cap["min_redemption_points"],
        "loyalty_enabled": cap["loyalty_enabled"],
        "projected_points_earned": projected_earned,
        "projected_earn_percent": earn_percent,
        "earn_ratio_display": earn_ratio_display,
        "projected_tier_after": projected_tier,
        "tier_upgrade": tier_upgrade,
        "tier_upgrade_message": tier_upgrade_message,
    }
    if cap["code"]:
        data["error"] = {"code": cap["code"], "message": cap["message"]}

    return POSResponse(
        success=True,  # always 200 success=true; POS branches on data.error.code
        message=cap["message"] or "Max redeemable calculated",
        data=data,
    )



# ============================================
# CR-001C-LR: POS Loyalty Redeem API (2026-05-23)
# ============================================

class POSLoyaltyRedeemRequest(BaseModel):
    """Request to redeem loyalty points during POS billing."""
    customer_id: str
    points_to_redeem: int
    order_id: str
    order_total: float
    idempotency_key: str


@router.post("/loyalty/redeem", response_model=POSResponse)
async def pos_loyalty_redeem(
    request: POSLoyaltyRedeemRequest,
    user: dict = Depends(verify_pos_auth)
):
    """
    CR-001C-LR (corrected 2026-05-23): Thin wrapper over shared
    `core.loyalty.redeem_loyalty_points` helper. Kept for direct testing
    and admin tooling.

    NOTE: This endpoint is NOT the primary POS flow. POS should embed
    `loyalty_points_used` in the final `/api/pos/orders` (or legacy
    `/api/pos/webhook/payment-received`) payload — CRM commits redemption
    there.

    Auth: X-API-Key (verify_pos_auth).
    """
    user_id = user["id"]

    # Load customer + settings; helper does ALL validation + idempotency.
    customer = await db.customers.find_one({"id": request.customer_id, "user_id": user_id})
    settings = await db.loyalty_settings.find_one({"user_id": user_id}, {"_id": 0})

    result = await redeem_loyalty_points(
        db=db,
        user_id=user_id,
        customer=customer,
        settings=settings,
        points_to_redeem=request.points_to_redeem,
        order_id=request.order_id,
        order_total=request.order_total,
        idempotency_key=request.idempotency_key,
    )

    return POSResponse(
        success=bool(result["ok"]),
        message=result["message"] or ("Points redeemed successfully" if result["ok"] else "Redeem failed"),
        data=result["data"],
    )


# ============================================
# Order Webhook helpers
# ============================================

async def _validate_order(order_data: "POSOrderWebhook", user: dict) -> Optional[POSResponse]:
    """Validate pos_id, restaurant_id, and duplicate order.
    Returns a POSResponse on failure, or None if valid."""
    if user.get("pos_id") and order_data.pos_id != user["pos_id"]:
        return POSResponse(
            success=False,
            message=f"Invalid pos_id. Expected: {user['pos_id']}, Received: {order_data.pos_id}",
            data=None,
        )
    if user.get("restaurant_id") and order_data.restaurant_id != user["restaurant_id"]:
        return POSResponse(
            success=False,
            message=f"Invalid restaurant_id. Expected: {user['restaurant_id']}, Received: {order_data.restaurant_id}",
            data=None,
        )
    existing = await db.orders.find_one({
        "pos_id": order_data.pos_id,
        "pos_restaurant_id": order_data.restaurant_id,
        "pos_order_id": order_data.order_id,
    })
    if existing:
        return POSResponse(
            success=False,
            message="Duplicate order - already processed",
            data={"order_id": existing["id"], "duplicate": True},
        )
    return None


async def _find_or_create_customer(
    order_data: "POSOrderWebhook", user: dict, settings: dict, now: str
) -> tuple:
    """Lookup customer by phone or pos_customer_id; auto-create if missing.
    Returns (customer_doc, is_new, first_visit_bonus_points)."""
    
    # First try to find by pos_customer_id if provided
    if order_data.user_id:
        customer = await db.customers.find_one({
            "user_id": user["id"], 
            "pos_customer_id": order_data.user_id
        })
        if customer:
            return customer, False, 0
    
    # Then try to find by phone
    customer = await db.customers.find_one({
        "user_id": user["id"], "phone": order_data.cust_mobile
    })

    if customer:
        # Update pos_customer_id if not set and we have it now
        if order_data.user_id and not customer.get("pos_customer_id"):
            await db.customers.update_one(
                {"id": customer["id"]},
                {"$set": {"pos_customer_id": order_data.user_id}}
            )
            customer["pos_customer_id"] = order_data.user_id
        return customer, False, 0

    first_visit_bonus = 0
    # CR-001C-L Phase L2 (C1, C6, 2026-05-22): loyalty_enabled is a hard
    # kill-switch for ALL realtime loyalty writes including the
    # first-visit bonus. When OFF, first-visit bonus is suppressed even
    # if first_visit_bonus_enabled=True.
    if settings.get("loyalty_enabled") and settings.get("first_visit_bonus_enabled", False):
        first_visit_bonus = settings.get("first_visit_bonus_points", 50)

    customer_id = str(uuid.uuid4())
    customer = {
        "id": customer_id,
        "user_id": user["id"],
        "created_at": now,
        "updated_at": now,
        
        # Basic Info
        "name": order_data.cust_name or f"Customer {order_data.cust_mobile[-4:]}",
        "phone": order_data.cust_mobile,
        "country_code": "+91",
        "email": order_data.cust_email,  # Store customer email from order
        "gender": None,
        "dob": None,
        "anniversary": None,
        "preferred_language": None,
        "customer_type": "normal",
        "segment_tags": [],
        
        # Contact & Marketing Permissions (defaults)
        "whatsapp_opt_in": False,
        "whatsapp_opt_in_date": None,
        "promo_whatsapp_allowed": True,
        "promo_sms_allowed": True,
        "email_marketing_allowed": True,
        "call_allowed": True,
        "is_blocked": False,
        
        # Loyalty Information
        "total_points": first_visit_bonus,
        # CR-001C-L Phase L2 (C6, C10, 2026-05-22): defensive init of
        # lifetime earned/redeemed counters on POS-create path so future
        # $inc operations grow them correctly. first-visit bonus counts
        # toward total_points_earned per Q-LOYALTY-3.
        "total_points_earned": first_visit_bonus,
        "total_points_redeemed": 0,
        "wallet_balance": 0.0,
        "tier": "Bronze",
        "referral_code": None,
        "referred_by": None,
        "membership_id": None,
        "membership_expiry": None,
        
        # Spending & Visit Behavior
        "total_visits": 0,
        "total_spent": 0.0,
        "avg_order_value": 0.0,
        "last_visit": None,
        "first_visit_date": now,
        "favorite_category": None,
        "preferred_payment_mode": None,
        
        # Customer Source & Journey
        "lead_source": "POS",
        "campaign_source": None,
        "last_interaction_date": now,
        "assigned_salesperson": None,
        
        # WhatsApp CRM Tracking
        "last_whatsapp_sent": None,
        "last_whatsapp_response": None,
        "last_campaign_clicked": None,
        "last_coupon_used": None,
        "automation_status_tag": None,
        
        # Corporate Information
        "gst_name": None,
        "gst_number": None,
        "billing_address": None,
        "credit_limit": None,
        "payment_terms": None,
        
        # Address
        "address": None,
        "address_line_2": None,
        "city": None,
        "state": None,
        "pincode": None,
        "country": None,
        "delivery_instructions": None,
        "map_location": None,
        
        # Preferences
        "allergies": [],
        "favorites": [],
        
        # Dining Preferences
        "preferred_dining_type": None,
        "preferred_time_slot": None,
        "favorite_table": None,
        "avg_party_size": None,
        "diet_preference": None,
        "spice_level": None,
        "cuisine_preference": None,
        
        # Special Occasions
        "kids_birthday": [],
        "spouse_name": None,
        "festival_preference": [],
        "special_dates": [],
        
        # Feedback & Flags
        "last_rating": None,
        "nps_score": None,
        "complaint_flag": False,
        "vip_flag": False,
        "blacklist_flag": False,
        
        # AI/Advanced
        "predicted_next_visit": None,
        "churn_risk_score": None,
        "recommended_offer_type": None,
        "price_sensitivity_score": None,
        
        # Custom Fields
        "custom_field_1": None,
        "custom_field_2": None,
        "custom_field_3": None,
        
        # Notes
        "notes": "Auto-created via POS order",
        
        # POS Info
        "pos_id": order_data.pos_id,
        "pos_restaurant_id": order_data.restaurant_id,
        "pos_customer_id": order_data.user_id,  # Store POS customer ID
        "mygenie_synced": True if order_data.user_id else False,
        "first_visit_bonus_awarded": first_visit_bonus > 0,
    }
    await db.customers.insert_one(customer)

    if first_visit_bonus > 0:
        await db.points_transactions.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "customer_id": customer_id,
            "points": first_visit_bonus,
            "transaction_type": "bonus",
            "description": "First visit bonus - Welcome reward",
            "bill_amount": None,
            "balance_after": first_visit_bonus,
            "created_at": now,
        })

    return customer, True, first_visit_bonus


def _calculate_points(*args, **kwargs):
    """REMOVED in CR-001C-L Phase L5 (2026-05-25).

    The wrapper has been deleted. Use `core.loyalty.calculate_points`
    directly. This stub exists only to surface a clear error if any
    out-of-tree caller still references the old symbol; will be removed
    entirely in the next cleanup cycle.
    """
    raise RuntimeError(
        "_calculate_points was removed in L5 cleanup. "
        "Use core.loyalty.calculate_points directly."
    )


async def _save_order_and_transactions(
    order_data: "POSOrderWebhook",
    user: dict,
    customer: dict,
    points_earned: int,
    new_points: int,
    wallet_used: float,
    new_wallet_balance: float,
    off_peak_bonus: int,
    now: str,
    crm_loyalty_points_redeemed: int = 0,
    crm_loyalty_discount: float = 0.0,
) -> str:
    """Persist order, points transaction, and wallet transaction. Returns order id."""
    order_id = str(uuid.uuid4())
    
    # Prepare embedded items array with all fields
    items_embedded = []
    if order_data.items:
        for item in order_data.items:
            items_embedded.append(item.model_dump())
    
    # Build complete order document with ALL MyGenie fields
    order_doc = {
        "id": order_id,
        "user_id": user["id"],
        "customer_id": customer["id"],
        
        # POS Identification
        "pos_id": order_data.pos_id,
        "pos_restaurant_id": order_data.restaurant_id,
        # CR-001D (2026-05-22 forward-only): also persist canonical
        # `restaurant_id` so restaurant-level filtering / analytics on `orders`
        # no longer relies on user_id → users.restaurant_id lookup.
        # Preserves `pos_restaurant_id` above for backwards compatibility.
        "restaurant_id": order_data.restaurant_id,
        "restaurant_name": order_data.restaurant_name,
        "pos_order_id": order_data.order_id,
        "pos_customer_id": order_data.user_id,  # user_id from MyGenie = pos_customer_id
        
        # Customer Info
        "cust_mobile": order_data.cust_mobile,
        "cust_name": order_data.cust_name,
        "cust_email": order_data.cust_email,
        
        # Amounts
        "order_amount": order_data.order_amount,
        "order_sub_total": order_data.order_sub_total_amount,
        
        # Discounts
        "order_discount": order_data.order_discount,
        "self_discount": order_data.self_discount,
        "coupon_code": order_data.coupon_code,
        "coupon_discount": order_data.coupon_discount,
        
        # Loyalty redemption
        "loyalty_points_used": order_data.loyalty_points_used or 0,
        "loyalty_discount": order_data.loyalty_discount or 0.0,
        "loyalty_idempotency_key": order_data.loyalty_idempotency_key,
        "crm_loyalty_points_redeemed": crm_loyalty_points_redeemed,
        "crm_loyalty_discount": crm_loyalty_discount,
        
        # Wallet
        "wallet_used": wallet_used,
        
        # Taxes
        "tax_amount": order_data.tax_amount,
        "gst_tax": order_data.gst_tax,
        "vat_tax": order_data.vat_tax,
        "service_tax": order_data.service_tax,
        "service_gst_tax_amount": order_data.service_gst_tax_amount,
        
        # Tips & Charges
        "tip_amount": order_data.tip_amount,
        "tip_tax_amount": order_data.tip_tax_amount,
        "delivery_charge": order_data.delivery_charge,
        "round_up": order_data.round_up,
        
        # Payment Info
        "payment_method": order_data.payment_method,
        "payment_status": order_data.payment_status,
        "payment_type": order_data.payment_type,
        "transaction_id": order_data.transaction_id,
        
        # Order Meta
        "order_type": order_data.order_type,
        "order_status": order_data.order_status,
        "table_id": order_data.table_id,
        "waiter_id": order_data.waiter_id,
        "employee_id": order_data.employee_id,
        "employee_name": order_data.employee_name,
        "print_kot": order_data.print_kot,
        "print_bill_status": order_data.print_bill_status,
        "restaurant_order_id": order_data.restaurant_order_id,
        
        # Room/Address (for future use)
        "paid_room": order_data.paid_room,
        "room_id": order_data.room_id,
        "address_id": order_data.address_id,
        
        # Notes & Items
        "order_notes": order_data.order_notes,
        "items": items_embedded,

        # CR-001A Phase 2 (2026-05-22 forward-only) — room/hotel billing
        # breakdown. Empty `{}` payload → all sub-fields None → persist as
        # None to keep non-room orders compact.
        "room_info": (
            order_data.room_info.model_dump()
            if order_data.room_info
            and any(
                v is not None
                for v in (
                    order_data.room_info.room_price,
                    order_data.room_info.advance_payment,
                    order_data.room_info.balance_payment,
                )
            )
            else None
        ),

        # CR-001A Phase 2 (2026-05-22 forward-only) — parent/linked order ids
        # from POS. Already coerced to List[str] by validator.
        "associated_order_ids": order_data.associated_order_ids,
        
        # Loyalty Points
        "points_earned": points_earned,
        "off_peak_bonus": off_peak_bonus,
        
        # Timestamps
        "order_created_at": order_data.order_created_at,
        "order_updated_at": order_data.order_updated_at,
        "created_at": now,
    }
    
    await db.orders.insert_one(order_doc)
    
    # Write to order_items collection for AI queries with ALL fields
    if order_data.items:
        order_items_docs = []
        for item in order_data.items:
            order_items_docs.append({
                "id": str(uuid.uuid4()),
                "order_id": order_id,
                "customer_id": customer["id"],
                "user_id": user["id"],
                
                # Item Identification
                "item_name": item.item_name,
                "pos_food_id": item.pos_food_id,
                "item_category": item.item_category,
                
                # Quantity & Price
                "item_qty": item.item_qty,
                "item_price": item.item_price,
                
                # Variants & Add-ons
                "variant": item.variant,
                "variations": item.variations,
                "add_on_ids": item.add_on_ids,
                "add_on_qtys": item.add_on_qtys,
                "add_ons": item.add_ons,
                
                # Amounts
                "variation_amount": item.variation_amount,
                "addon_amount": item.addon_amount,
                "discount_amount": item.discount_amount,
                "service_charge": item.service_charge,
                
                # Taxes
                "gst_amount": item.gst_amount,
                "vat_amount": item.vat_amount,
                
                # Kitchen
                "station": item.station,
                
                # Notes
                "item_notes": item.item_notes,
                
                # Timestamps
                "created_at": now,
            })
        await db.order_items.insert_many(order_items_docs)

    if points_earned > 0:
        desc = f"Earned on order {order_data.order_id} (Rs.{order_data.order_amount})"
        if off_peak_bonus > 0:
            desc += f" [includes {off_peak_bonus} off-peak bonus]"
        await db.points_transactions.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "customer_id": customer["id"],
            "points": points_earned,
            "transaction_type": "earn",
            "description": desc,
            "order_id": order_id,
            "balance_after": new_points,
            "created_at": now,
        })

    if wallet_used > 0:
        await db.wallet_transactions.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "customer_id": customer["id"],
            "amount": wallet_used,
            "transaction_type": "debit",
            "description": f"Used on order {order_data.order_id}",
            "order_id": order_id,
            "balance_after": new_wallet_balance,
            "created_at": now,
        })

    return order_id

class OrderItem(BaseModel):
    """Individual item within an order - supports all MyGenie cart item fields.

    CR-001A Phase 1 (ISSUE-09 forward-only alias fix, 2026-05-22):
      • `pos_food_id` accepts incoming `item_id` (POS realtime field name) via AliasChoices
        and is widened from Optional[int] → Optional[str] to match what POS actually sends
        (e.g. "2248345") and to align with CR-001B-fix Phase 2B `_coerce_pos_id` convention.
      • `item_qty` accepts incoming `qty`.
      • `item_price` accepts incoming `price`.
      • `populate_by_name=True` keeps legacy CRM-name payloads working (backwards compatible).
      • `coerce_numbers_to_str=True` accepts both `"2248345"` (live POS contract) and
        `2248345` (defensive for any future POS variant) — same string-only convention as
        Phase 2B `_coerce_pos_id`.
    """
    model_config = ConfigDict(populate_by_name=True, coerce_numbers_to_str=True)

    # Item Identification
    item_name: str
    pos_food_id: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("pos_food_id", "item_id"),
    )  # food_id from POS (realtime sends `item_id`)
    item_category: Optional[str] = None

    # Quantity & Price
    item_qty: int = Field(
        default=1,
        validation_alias=AliasChoices("item_qty", "qty"),
    )  # quantity (realtime sends `qty`)
    item_price: float = Field(
        default=0.0,
        validation_alias=AliasChoices("item_price", "price"),
    )  # food_amount (realtime sends `price`)
    
    # Variants & Add-ons
    variant: Optional[str] = None
    variations: Optional[List] = None  # Full variation objects
    add_on_ids: Optional[List[int]] = None
    add_on_qtys: Optional[List[int]] = None
    add_ons: Optional[List] = None  # Full add-on objects
    
    # Amounts
    variation_amount: float = 0.0
    addon_amount: float = 0.0
    discount_amount: float = 0.0
    service_charge: float = 0.0
    
    # Taxes
    gst_amount: float = 0.0
    vat_amount: float = 0.0
    tax: Optional[float] = None  # food_details.tax (migration field)
    tax_type: Optional[str] = None  # "GST", "VAT" (migration field)
    
    # Kitchen
    station: Optional[str] = None  # "OTHER", "BAR", "KITCHEN"
    item_type: Optional[str] = None  # "OTHER", etc. (migration field)
    
    # Status & Timestamps
    food_status: Optional[int] = None  # Kitchen status code (migration field)
    ready_at: Optional[str] = None  # When item was ready
    serve_at: Optional[str] = None  # When item was served
    cancel_at: Optional[str] = None  # When item was cancelled
    
    # Flags
    is_veg: Optional[object] = None  # bool or int (0/1) from POS
    
    # Notes
    item_notes: Optional[str] = None  # food_level_notes


class RoomInfo(BaseModel):
    """Hotel / room billing breakdown attached to a POS order.

    CR-001A Phase 2 (forward-only, 2026-05-22):
      Source: realtime POS payload `room_info`. Fields arrive as STRING
      decimals (e.g. "7888.00"); Pydantic 2.x coerces them to float.
      All sub-fields are Optional so non-room orders sending empty {} still
      parse (we then persist None at order_doc build time to keep
      non-room rows compact).
    """
    model_config = ConfigDict(populate_by_name=True)

    room_price: Optional[float] = None
    advance_payment: Optional[float] = None
    balance_payment: Optional[float] = None


class POSOrderWebhook(BaseModel):
    """Schema for order data from MyGenie/POS systems - supports all fields.

    CR-001A Phase 1 (ISSUE-09 forward-only alias fix, 2026-05-22):
      • `order_created_at` accepts incoming `created_at` (POS realtime field name) via
        AliasChoices.
      • `populate_by_name=True` keeps legacy CRM-name payloads working (backwards compatible).

    CR-001A Phase 2 (forward-only, 2026-05-22):
      • `room_info` added — captures hotel/room billing breakdown
        ({room_price, advance_payment, balance_payment}). Previously silently
        dropped (real revenue loss observed on order 868899, ₹7888).
      • `associated_order_ids` added — captures parent/linked order ids from
        POS (e.g. food order linked to room order). Coerced element-wise from
        List[int] (POS contract) to List[str] for consistency with the
        `pos_food_id` string-only convention.
    """
    model_config = ConfigDict(populate_by_name=True)

    # POS Identification
    pos_id: str = "mygenie"  # Default to mygenie if not provided
    restaurant_id: str
    restaurant_name: Optional[str] = None
    
    # Order Identification
    order_id: str
    restaurant_order_id: Optional[str] = None  # Restaurant's internal order number
    
    # Customer Info
    cust_mobile: str
    cust_name: Optional[str] = None
    cust_email: Optional[str] = None
    user_id: Optional[str] = None  # Maps to pos_customer_id
    
    # Amounts
    order_amount: float = Field(
        ...,
        validation_alias=AliasChoices(
            "order_amount", "orderAmount", "order_total", "orderTotal"
        ),
    )
    order_sub_total_amount: Optional[float] = None
    
    # Discounts
    order_discount: float = 0.0
    self_discount: float = 0.0
    # CR-001C-C V1 (Addendum A.2): canonical coupon fields with alias acceptance.
    coupon_code: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("coupon_code", "couponCode", "coupon"),
    )
    coupon_discount: float = Field(
        default=0.0,
        validation_alias=AliasChoices(
            "coupon_discount", "couponDiscount", "coupon_amount", "coupon_discount_amount"
        ),
    )
    coupon_title: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("coupon_title", "couponTitle", "coupon_name"),
    )
    coupon_type: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("coupon_type", "couponType"),
    )
    
    # Wallet
    wallet_used: float = 0.0
    
    # Taxes
    tax_amount: float = 0.0
    gst_tax: float = 0.0
    vat_tax: float = 0.0
    service_tax: float = 0.0
    service_gst_tax_amount: float = 0.0
    
    # Tips & Charges
    tip_amount: float = 0.0
    tip_tax_amount: float = 0.0
    delivery_charge: float = 0.0
    round_up: float = 0.0
    
    # Payment Info
    payment_method: Optional[str] = None
    payment_status: Optional[str] = None
    payment_type: Optional[str] = None  # "prepaid", "postpaid"
    transaction_id: Optional[str] = None
    
    # Order Status
    order_status: Optional[str] = None  # "queue", "confirmed", "completed", etc.
    
    # Order Meta
    order_type: Optional[str] = "pos"  # pos, dine_in, takeaway, delivery
    table_id: Optional[str] = None
    waiter_id: Optional[str] = None
    employee_id: Optional[str] = None  # Employee who created order
    employee_name: Optional[str] = None  # Employee name
    print_kot: Optional[str] = None  # "Yes", "No"
    print_bill_status: Optional[str] = None  # "Yes", "No"
    
    # Room/Address (for future use)
    paid_room: Optional[str] = None
    room_id: Optional[str] = None
    address_id: Optional[str] = None
    
    # Timestamps (POS original timestamps)
    order_created_at: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("order_created_at", "created_at"),
    )  # Original order creation time in POS (realtime sends `created_at`)
    order_updated_at: Optional[str] = None  # Original order update time in POS
    
    # Notes & Items
    order_notes: Optional[str] = None  # order_note
    items: Optional[List[OrderItem]] = None  # cart items

    # CR-001A Phase 2 — room/hotel billing breakdown (forward-only, 2026-05-22)
    room_info: Optional[RoomInfo] = None

    # CR-001A Phase 2 — parent/linked order ids from POS (forward-only)
    # POS sends List[int] (e.g. [868891]); we coerce to List[str] to align
    # with the pos_food_id string-only convention.
    associated_order_ids: Optional[List[str]] = None

    # CR-001C-LR correction (2026-05-23, forward-only):
    # Loyalty redemption fields embedded in the final order payload.
    # POS calculates the redemption locally (using ratio_per_point + balance
    # from the loyalty blob), adjusts the displayed bill, and sends the
    # decision here. CRM commits via core.loyalty.redeem_loyalty_points.
    #
    # CR-001C-LR alias addendum (2026-05-24, forward-only):
    #   `loyalty_points_used` accepts POS-side legacy aliases
    #   `used_loyalty_point` / `used_loyalty_points` to unblock POS rollout
    #   while their outbound mapper is being migrated to the canonical
    #   name. Same precedent as CR-001A Phase 1 `created_at` → `order_created_at`.
    #   POS still SHOULD migrate to `loyalty_points_used`; aliases will be
    #   retired in L5 cleanup once POS adoption is complete.
    loyalty_points_used: Optional[int] = Field(
        default=None,
        validation_alias=AliasChoices(
            "loyalty_points_used",
            "used_loyalty_point",
            "used_loyalty_points",
        ),
    )
    loyalty_discount: Optional[float] = None          # POS-displayed ₹ discount (server recomputes for source of truth)
    loyalty_idempotency_key: Optional[str] = None     # explicit key; server falls back to f"order_{order_id}" if absent

    @field_validator("associated_order_ids", mode="before")
    @classmethod
    def _coerce_associated_order_ids(cls, v):
        if v is None:
            return None
        if isinstance(v, list):
            return [str(x) for x in v if x is not None]
        return v


@router.post("/orders", response_model=POSResponse)
async def pos_order_webhook(
    order_data: POSOrderWebhook,
    user: dict = Depends(verify_pos_auth)
):
    """
    Webhook for MyGenie/POS to send order data.
    Validates, finds/creates customer, calculates points (with off-peak bonus),
    records order and transactions.
    """
    try:
        # 1. Validate
        error = await _validate_order(order_data, user)
        if error:
            return error

        now = datetime.now(timezone.utc).isoformat()

        # 2. Loyalty settings
        settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
        if not settings:
            # CR-001C-L-FIX: use canonical helper instead of hardcoded OLD defaults
            settings = default_loyalty_settings(user["id"])

        # 3. Find or create customer
        customer, is_new, first_visit_bonus = await _find_or_create_customer(
            order_data, user, settings, now
        )

        # 3b. CR-007 (2026-05-27): Loyalty redemption — ORDER IS NEVER REJECTED.
        # If POS embedded a loyalty redemption, CRM back-calculates points from
        # POS's loyalty_discount using CRM's ratio_per_point (CRM is source of
        # truth). Mismatches are logged to loyalty_mismatch_logs. If redemption
        # fails, the order still proceeds — only the redemption is skipped.
        loyalty_redeem_result = None
        loyalty_redeemed_value = 0.0
        crm_loyalty_points_redeemed = 0
        crm_loyalty_discount = 0.0
        if order_data.loyalty_points_used and order_data.loyalty_points_used > 0:
            idem_key = (
                order_data.loyalty_idempotency_key
                or f"order_{order_data.order_id}"
            )
            # CR-007 Fix B: back-calculate points from POS loyalty_discount
            tier = customer.get("tier", "Bronze")
            ratio_per_point = float(get_redemption_value_for_tier(tier, settings))
            pos_points = int(order_data.loyalty_points_used)
            pos_discount = float(order_data.loyalty_discount or 0)
            crm_calculated_points = int(pos_discount / ratio_per_point) if ratio_per_point > 0 and pos_discount > 0 else pos_points

            # Log mismatch if POS points != CRM back-calculated points
            if crm_calculated_points != pos_points:
                await db.loyalty_mismatch_logs.insert_one({
                    "id": str(uuid.uuid4()),
                    "pos_order_id": order_data.order_id,
                    "customer_id": customer["id"],
                    "user_id": user["id"],
                    "pos_loyalty_points_used": pos_points,
                    "pos_loyalty_discount": pos_discount,
                    "crm_calculated_points": crm_calculated_points,
                    "ratio_per_point": ratio_per_point,
                    "tier": tier,
                    "mismatch_type": "points_vs_discount",
                    "action_taken": "used_crm_calculation",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
                logging.getLogger(__name__).warning(
                    "loyalty_mismatch pos_order=%s pos_pts=%s pos_disc=%s crm_pts=%s ratio=%s",
                    order_data.order_id, pos_points, pos_discount, crm_calculated_points, ratio_per_point,
                )

            # Attempt redemption with CRM-calculated points
            loyalty_redeem_result = await redeem_loyalty_points(
                db=db,
                user_id=user["id"],
                customer=customer,
                settings=settings,
                points_to_redeem=crm_calculated_points,
                order_id=order_data.order_id,
                order_total=order_data.order_sub_total_amount or order_data.order_amount,
                idempotency_key=idem_key,
            )
            if not loyalty_redeem_result["ok"]:
                # CR-007 Fix A: DO NOT reject the order. Log and continue.
                logging.getLogger(__name__).warning(
                    "loyalty_redeem_failed pos_order=%s reason=%s — order will proceed",
                    order_data.order_id, loyalty_redeem_result["message"],
                )
            else:
                loyalty_redeemed_value = float(loyalty_redeem_result["data"].get("redeemed_value", 0))
                crm_loyalty_points_redeemed = int(loyalty_redeem_result["data"].get("points_redeemed", 0))
                crm_loyalty_discount = loyalty_redeemed_value
                # Refresh customer doc with post-redeem balances
                refreshed = await db.customers.find_one({"id": customer["id"]})
                if refreshed:
                    customer = refreshed

        # 4. Calculate points (includes off-peak bonus)
        # CR-001C-L Phase L2 (C1, 2026-05-22): loyalty_enabled is a hard
        # kill-switch. When OFF, skip points math and points writes; the
        # order is still persisted and visits/spend/wallet still update.
        # CR-001C-LR correction (2026-05-23): earn base is the NET amount
        # (order_amount − loyalty_redeemed_value) per Q-CORR-3 Option B.
        # CR-001C-L Phase L5 (2026-05-25): inlined direct call to shared
        # helper. Old `_calculate_points` wrapper removed.
        loyalty_enabled = bool(settings.get("loyalty_enabled", False))
        earn_base_amount = max(0.0, order_data.order_amount - loyalty_redeemed_value)
        if loyalty_enabled:
            pts = calculate_points(earn_base_amount, customer, settings)
            points_earned = pts["total_points"]
        else:
            pts = {
                "base_points": 0,
                "off_peak_bonus": 0,
                "total_points": 0,
                "description": "",
                "off_peak_message": None,
            }
            points_earned = 0

        # 5. Wallet validation
        wallet_used = order_data.wallet_used or 0.0
        current_wallet = customer.get("wallet_balance", 0.0)
        if wallet_used > current_wallet:
            return POSResponse(
                success=False,
                message=f"Insufficient wallet balance. Available: {current_wallet}, Requested: {wallet_used}",
                data={"available_balance": current_wallet},
            )
        new_wallet_balance = current_wallet - wallet_used

        # 6. Update customer stats
        current_points = customer.get("total_points", 0)
        new_points = current_points + points_earned
        # CR-001C-L Phase L2 (C1, 2026-05-22): tier is only recomputed
        # when loyalty is enabled. When OFF, preserve the customer's
        # existing tier verbatim (no implicit downgrade/upgrade).
        if loyalty_enabled:
            new_tier = calculate_tier(new_points, settings)
        else:
            new_tier = customer.get("tier", "Bronze")

        new_total_visits = customer.get("total_visits", 0) + 1
        new_total_spent = customer.get("total_spent", 0) + order_data.order_amount
        new_avg_order_value = round(new_total_spent / new_total_visits, 2)

        # CR-001C-L Phase L2 (C4, 2026-05-22): grow lifetime
        # total_points_earned via $inc so it is independent of the
        # spendable total_points (which can be reduced by redemption).
        # When loyalty is OFF or no points were earned this order, the
        # $inc is skipped entirely (kill-switch + zero-noise).
        customer_update_set = {
            "total_points": new_points,
            "tier": new_tier,
            "wallet_balance": new_wallet_balance,
            "total_visits": new_total_visits,
            "total_spent": new_total_spent,
            "avg_order_value": new_avg_order_value,
            "last_visit": now,
        }
        customer_update_doc: Dict[str, Any] = {"$set": customer_update_set}
        if loyalty_enabled and points_earned > 0:
            customer_update_doc["$inc"] = {"total_points_earned": points_earned}

        await db.customers.update_one(
            {"id": customer["id"]},
            customer_update_doc,
        )

        # 7. Save order + transactions
        order_id = await _save_order_and_transactions(
            order_data, user, customer, points_earned, new_points,
            wallet_used, new_wallet_balance, pts["off_peak_bonus"], now,
            crm_loyalty_points_redeemed, crm_loyalty_discount,
        )

        # Update customer with latest data for triggers
        updated_customer = {
            **customer,
            "total_points": new_points,
            "tier": new_tier,
            "wallet_balance": new_wallet_balance,
            "total_visits": new_total_visits,
            "total_spent": new_total_spent
        }

        # CR-015 T3 (2026-05-29): build a single event_data context shared by all
        # POS order-triggered events. See core.whatsapp.build_order_event_context.
        order_ctx = build_order_event_context(
            order_data, updated_customer,
            points_earned=points_earned,
            new_points=new_points,
            wallet_used=wallet_used,
            new_wallet_balance=new_wallet_balance,
            crm_loyalty_points_redeemed=crm_loyalty_points_redeemed,
            crm_loyalty_discount=crm_loyalty_discount,
        )

        # 8. Fire WhatsApp triggers
        # CR-014 Bucket 4: Generate invoice before WhatsApp triggers
        einvoice_link = ""
        einvoice_token = ""
        try:
            from services.invoice_generator import create_invoice
            saved_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
            if saved_order:
                base_url = os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("CRM_EXTERNAL_URL")
                inv = await create_invoice(db, saved_order, user, updated_customer, order_ctx, base_url)
                einvoice_link = inv.get("invoice_url", "")
                einvoice_token = inv.get("token", "")
        except Exception as _inv_err:
            logging.getLogger(__name__).warning(f"CR-014: Invoice generation failed for order {order_id}: {_inv_err}")

        # send_bill trigger - for every order
        asyncio.create_task(trigger_whatsapp_event(
            db, user["id"], "send_bill", updated_customer,
            {
                **order_ctx,
                "einvoice_link": einvoice_link,
                "einvoice_token": einvoice_token,
                # CR-004 P3.5: idempotency + reference enrichment (per-event override)
                "idempotency_key": f"{order_data.order_id}_send_bill",
                "reference_type": "order",
                "reference_id": order_id,
            }
        ))

        # welcome_message trigger - only for new customers
        if is_new:
            asyncio.create_task(trigger_whatsapp_event(
                db, user["id"], "welcome_message", updated_customer,
                {
                    **order_ctx,
                    "first_visit_bonus": first_visit_bonus,
                    "idempotency_key": f"{updated_customer.get('id')}_welcome",
                    "reference_type": "customer",
                    "reference_id": updated_customer.get("id"),
                }
            ))

        # tier_upgrade trigger - if tier changed
        old_tier = customer.get("tier", "Bronze")
        if new_tier != old_tier and _tier_rank_pos(new_tier) > _tier_rank_pos(old_tier):
            asyncio.create_task(trigger_whatsapp_event(
                db, user["id"], "tier_upgrade", updated_customer,
                {
                    **order_ctx,
                    "old_tier": old_tier,
                    "new_tier": new_tier,
                    "idempotency_key": f"{updated_customer.get('id')}_tier_{new_tier}",
                    "reference_type": "customer",
                    "reference_id": updated_customer.get("id"),
                }
            ))

        # CR-001C-C V1: final-commit coupon usage recording (Q4=B, Q5=C).
        # CR-001C-C V2: pass `items` so item/category-scope coupons can revalidate.
        # CR-021 D3: gate relaxed — recorder now handles POS=0 case universally.
        # If POS sent a code, run the recorder. The recorder validates the
        # coupon, computes CRM-side discount, and decides whether to record
        # or skip (skip only when CRM also computes 0 — genuine no-benefit).
        # Idempotent on (user_id, order_id). Failure does NOT roll back the order.
        coupon_usage_result: Optional[dict] = None
        if order_data.coupon_code:
            # Convert OrderItem -> dicts the coupon service understands.
            cart_dicts: list[dict] = []
            for oi in (order_data.items or []):
                try:
                    cart_dicts.append({
                        "item_id": oi.pos_food_id or None,
                        "food_id": oi.pos_food_id or None,
                        "category_id": oi.item_category or None,
                        "category_name": None,
                        "item_category": oi.item_category,
                        "name": oi.item_name,
                        "quantity": int(oi.item_qty or 1),
                        "unit_price": float(oi.item_price or 0.0),
                        "line_total": (
                            float(oi.item_price or 0.0) * int(oi.item_qty or 1)
                            if (oi.item_price is not None and oi.item_qty is not None)
                            else None
                        ),
                    })
                except Exception:  # noqa: BLE001 — never block order on conversion error
                    continue
            try:
                coupon_usage_result = await record_coupon_usage_for_order(
                    db,
                    user_id=user["id"],
                    restaurant_id=order_data.restaurant_id,
                    customer_id=customer["id"],
                    code=order_data.coupon_code,
                    order_id=order_id,
                    pos_order_id=order_data.order_id,
                    order_total=order_data.order_amount,
                    coupon_discount_from_pos=order_data.coupon_discount,
                    channel=order_data.order_type or "pos",
                    source="pos_orders",
                    loyalty_points_used=float(order_data.loyalty_points_used or 0),
                    coupon_title=order_data.coupon_title,
                    coupon_type=order_data.coupon_type,
                    items=cart_dicts if cart_dicts else None,
                )
            except Exception as exc:  # noqa: BLE001 — never block order on coupon failure
                import logging as _lg
                _lg.getLogger(__name__).warning(
                    "coupon_recording_unexpected_failure user_id=%s order_id=%s err=%s",
                    user["id"], order_id, exc,
                )
                coupon_usage_result = {
                    "ok": False, "recorded": False,
                    "error": {"code": "INACTIVE", "field": None, "detail": str(exc)},
                }
        elif (order_data.coupon_discount or 0.0) > 0 and not order_data.coupon_code:
            import logging as _lg
            _lg.getLogger(__name__).warning(
                "coupon_discount_without_code user_id=%s order_id=%s pos_order_id=%s discount=%s",
                user["id"], order_id, order_data.order_id, order_data.coupon_discount,
            )

        # Build coupon_usage response block.
        coupon_usage_block: Optional[Dict[str, Any]] = None
        if coupon_usage_result is not None:
            if coupon_usage_result.get("ok"):
                coupon_usage_block = {
                    "recorded": coupon_usage_result.get("recorded", False),
                    "usage_id": coupon_usage_result.get("usage_id"),
                    "coupon_code": coupon_usage_result.get("coupon_code"),
                    "coupon_discount": coupon_usage_result.get("coupon_discount"),
                    "crm_computed_discount": coupon_usage_result.get("crm_computed_discount"),
                    "discount_scope": coupon_usage_result.get("discount_scope"),
                    "eligible_subtotal": coupon_usage_result.get("eligible_subtotal"),
                    "idempotent_replay": coupon_usage_result.get("idempotent_replay", False),
                    # CR-001C-C V3-A — additive
                    "offer_type": coupon_usage_result.get("offer_type"),
                    "time_window_status": coupon_usage_result.get("time_window_status"),
                    # CR-001C-C V3-B — additive (None when not a V3-B coupon)
                    "applied_applications": coupon_usage_result.get("applied_applications"),
                    "benefit_items": coupon_usage_result.get("benefit_items") or [],
                    "buy_match_summary": coupon_usage_result.get("buy_match_summary") or [],
                    "get_match_summary": coupon_usage_result.get("get_match_summary") or [],
                    "same_item_required": coupon_usage_result.get("same_item_required"),
                    "get_discount_type": coupon_usage_result.get("get_discount_type"),
                    "discount_mismatch": coupon_usage_result.get("discount_mismatch"),
                    # CR-001C-C V3-C — additive
                    "nth_item_number": coupon_usage_result.get("nth_item_number"),
                    "nth_discount_type": coupon_usage_result.get("nth_discount_type"),
                    "nth_discount_value": coupon_usage_result.get("nth_discount_value"),
                    "eligible_match_summary": coupon_usage_result.get("eligible_match_summary") or [],
                }
            else:
                coupon_usage_block = {
                    "recorded": False,
                    "coupon_code": (order_data.coupon_code or "").upper() or None,
                    "error": coupon_usage_result.get("error"),
                }
                # CR-001C-C V3-A — surface time_window_status on outside-window failure too.
                if coupon_usage_result.get("time_window_status") is not None:
                    coupon_usage_block["time_window_status"] = coupon_usage_result["time_window_status"]
                # CR-001C-C V3-B — surface pos_instruction on V3-B failures (Q11=B).
                if coupon_usage_result.get("pos_instruction"):
                    coupon_usage_block["pos_instruction"] = coupon_usage_result["pos_instruction"]

        return POSResponse(
            success=True,
            message="Order processed successfully",
            data={
                "order_id": order_id,
                "pos_order_id": order_data.order_id,
                "customer_id": customer["id"],
                "customer_name": customer.get("name"),
                "is_new_customer": is_new,
                "first_visit_bonus_awarded": first_visit_bonus if is_new else 0,
                "order_amount": order_data.order_amount,
                "points_earned": points_earned,
                "off_peak_bonus": pts["off_peak_bonus"],
                "off_peak_message": pts.get("off_peak_message"),
                "total_points": new_points,
                "tier": new_tier,
                "wallet_used": wallet_used,
                "wallet_balance_after": new_wallet_balance,
                "coupon_applied": order_data.coupon_code,
                "coupon_discount": order_data.coupon_discount or 0.0,
                # CR-001C-C V1: structured coupon_usage outcome (Q4=B, Q5=C).
                "coupon_usage": coupon_usage_block,
                # CR-001C-LR correction: surface redemption info if applied.
                "loyalty_redeem": loyalty_redeem_result["data"] if loyalty_redeem_result else None,
            },
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Order processing failed: {str(e)}")


@router.post("/webhook/payment-received", response_model=POSResponse)
async def pos_payment_received(
    webhook_data: POSPaymentWebhook,
    user: dict = Depends(verify_pos_auth)
):
    """
    Main POS webhook endpoint - processes payments and manages loyalty points
    """
    try:
        # Find customer by phone
        customer = await db.customers.find_one({
            "user_id": user["id"],
            "phone": webhook_data.customer_phone
        })
        
        if not customer:
            # Auto-create customer if not exists
            customer_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc).isoformat()
            
            customer = {
                "id": customer_id,
                "user_id": user["id"],
                "created_at": now,
                "updated_at": now,
                
                # Basic Info
                "name": f"Customer {webhook_data.customer_phone[-4:]}",
                "phone": webhook_data.customer_phone,
                "country_code": "+91",
                "email": None,
                "gender": None,
                "dob": None,
                "anniversary": None,
                "preferred_language": None,
                "customer_type": "normal",
                "segment_tags": [],
                
                # Contact & Marketing Permissions
                "whatsapp_opt_in": False,
                "whatsapp_opt_in_date": None,
                "promo_whatsapp_allowed": True,
                "promo_sms_allowed": True,
                "email_marketing_allowed": True,
                "call_allowed": True,
                "is_blocked": False,
                
                # Loyalty Information
                "total_points": 0,
                "wallet_balance": 0.0,
                "tier": "Bronze",
                "referral_code": None,
                "referred_by": None,
                "membership_id": None,
                "membership_expiry": None,
                
                # Spending & Visit Behavior
                "total_visits": 0,
                "total_spent": 0.0,
                "avg_order_value": 0.0,
                "last_visit": None,
                "first_visit_date": now,
                "favorite_category": None,
                "preferred_payment_mode": None,
                
                # Customer Source & Journey
                "lead_source": "POS",
                "campaign_source": None,
                "last_interaction_date": now,
                "assigned_salesperson": None,
                
                # WhatsApp CRM Tracking
                "last_whatsapp_sent": None,
                "last_whatsapp_response": None,
                "last_campaign_clicked": None,
                "last_coupon_used": None,
                "automation_status_tag": None,
                
                # Corporate Information
                "gst_name": None,
                "gst_number": None,
                "billing_address": None,
                "credit_limit": None,
                "payment_terms": None,
                
                # Address
                "address": None,
                "address_line_2": None,
                "city": None,
                "state": None,
                "pincode": None,
                "country": None,
                "delivery_instructions": None,
                "map_location": None,
                
                # Preferences
                "allergies": [],
                "favorites": [],
                
                # Dining Preferences
                "preferred_dining_type": None,
                "preferred_time_slot": None,
                "favorite_table": None,
                "avg_party_size": None,
                "diet_preference": None,
                "spice_level": None,
                "cuisine_preference": None,
                
                # Special Occasions
                "kids_birthday": [],
                "spouse_name": None,
                "festival_preference": [],
                "special_dates": [],
                
                # Feedback & Flags
                "last_rating": None,
                "nps_score": None,
                "complaint_flag": False,
                "vip_flag": False,
                "blacklist_flag": False,
                
                # AI/Advanced
                "predicted_next_visit": None,
                "churn_risk_score": None,
                "recommended_offer_type": None,
                "price_sensitivity_score": None,
                
                # Custom Fields
                "custom_field_1": None,
                "custom_field_2": None,
                "custom_field_3": None,
                
                # Notes
                "notes": "Auto-created via POS"
            }
            await db.customers.insert_one(customer)
        
        # Get loyalty settings
        settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
        if not settings:
            # CR-001C-L-FIX: use canonical helper instead of hardcoded OLD defaults
            settings = default_loyalty_settings(user["id"])
        
        response_data = {
            "customer_id": customer["id"],
            "customer_name": customer["name"],
            "current_points": customer.get("total_points", 0),
            "current_tier": customer.get("tier", "Bronze"),
            "wallet_balance": customer.get("wallet_balance", 0.0),
            "transactions": []
        }
        
        final_bill_amount = webhook_data.bill_amount
        
        # Process coupon if provided
        if webhook_data.coupon_code:
            coupon = await db.coupons.find_one({
                "user_id": user["id"],
                "code": webhook_data.coupon_code.upper(),
                "is_active": True
            })
            
            if coupon:
                now = datetime.now(timezone.utc).isoformat()
                if coupon["start_date"] <= now <= coupon["end_date"]:
                    if coupon["discount_type"] == "percentage":
                        discount = (final_bill_amount * coupon["discount_value"]) / 100
                        if coupon.get("max_discount"):
                            discount = min(discount, coupon["max_discount"])
                    else:
                        discount = min(coupon["discount_value"], final_bill_amount)
                    
                    final_bill_amount -= discount
                    response_data["coupon_applied"] = {
                        "code": webhook_data.coupon_code,
                        "discount": round(discount, 2)
                    }
                    response_data["transactions"].append({
                        "type": "coupon",
                        "amount": round(discount, 2),
                        "description": f"Coupon {webhook_data.coupon_code} applied"
                    })
        
        # Process points redemption if requested
        # CR-001C-LR correction (2026-05-23): legacy embedded redeem block
        # replaced by a call to the shared `redeem_loyalty_points` helper.
        # Idempotency key falls back to bill_id → order/customer hash so
        # POS replays of this webhook are safe (Q-CORR-4/Q-CORR-5 frozen).
        points_redeemed = 0
        if webhook_data.redeem_points and webhook_data.redeem_points > 0:
            legacy_order_id = webhook_data.bill_id or f"bill_{webhook_data.customer_phone}_{int(webhook_data.bill_amount)}"
            legacy_idem_key = (webhook_data.metadata or {}).get("loyalty_idempotency_key") or f"payrec_{legacy_order_id}"

            legacy_result = await redeem_loyalty_points(
                db=db,
                user_id=user["id"],
                customer=customer,
                settings=settings,
                points_to_redeem=int(webhook_data.redeem_points),
                order_id=legacy_order_id,
                order_total=final_bill_amount,
                idempotency_key=legacy_idem_key,
            )

            if legacy_result["ok"]:
                rd = legacy_result["data"]
                pts_actually_redeemed = int(rd.get("points_redeemed", 0))
                redemption_amount = float(rd.get("redeemed_value", 0.0))
                final_bill_amount -= redemption_amount
                points_redeemed = pts_actually_redeemed
                response_data["points_redeemed"] = {
                    "points": pts_actually_redeemed,
                    "value": round(redemption_amount, 2),
                }
                response_data["transactions"].append({
                    "type": "redeem",
                    "points": pts_actually_redeemed,
                    "value": round(redemption_amount, 2),
                    "description": "Points redeemed",
                })
                # Refresh customer doc so the subsequent earn step uses post-redeem state.
                refreshed = await db.customers.find_one({"id": customer["id"]})
                if refreshed:
                    customer = refreshed
            else:
                # Surface the structured failure without aborting the payment
                # webhook. Legacy callers depend on this endpoint being
                # forgiving; the order/earn portion still proceeds.
                response_data["points_redeemed_error"] = legacy_result["data"].get("error")
        
        # Calculate points earned
        min_order = settings.get("min_order_value", 100.0)
        points_earned = 0
        
        if webhook_data.bill_amount >= min_order:
            customer_tier = customer.get("tier", "Bronze")
            earn_percent = get_earn_percent_for_tier(customer_tier, settings)
            points_earned = int(webhook_data.bill_amount * earn_percent / 100)
            
            if points_earned > 0:
                current_points = customer.get("total_points", 0)
                if points_redeemed > 0:
                    current_points = current_points - points_redeemed
                new_points = current_points + points_earned
                new_tier = calculate_tier(new_points, settings)
                
                new_total_visits = customer.get("total_visits", 0) + 1
                new_total_spent = customer.get("total_spent", 0) + webhook_data.bill_amount
                new_avg_order_value = round(new_total_spent / new_total_visits, 2)
                
                await db.customers.update_one(
                    {"id": customer["id"]},
                    {"$set": {
                        "total_points": new_points,
                        "tier": new_tier,
                        "total_visits": new_total_visits,
                        "total_spent": new_total_spent,
                        "avg_order_value": new_avg_order_value,
                        "last_visit": datetime.now(timezone.utc).isoformat()
                    }}
                )
                
                tx_doc = {
                    "id": str(uuid.uuid4()),
                    "user_id": user["id"],
                    "customer_id": customer["id"],
                    "points": points_earned,
                    "transaction_type": "earn",
                    "description": f"Earned {earn_percent}% on bill of Rs.{webhook_data.bill_amount}",
                    "bill_amount": webhook_data.bill_amount,
                    "balance_after": new_points,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.points_transactions.insert_one(tx_doc)
                
                response_data["points_earned"] = {
                    "points": points_earned,
                    "percentage": earn_percent
                }
                response_data["new_points"] = new_points
                response_data["new_tier"] = new_tier
                response_data["transactions"].append({
                    "type": "earn",
                    "points": points_earned,
                    "description": f"Earned {earn_percent}% on purchase"
                })
        else:
            new_total_visits = customer.get("total_visits", 0) + 1
            new_total_spent = customer.get("total_spent", 0) + webhook_data.bill_amount
            new_avg_order_value = round(new_total_spent / new_total_visits, 2)
            
            await db.customers.update_one(
                {"id": customer["id"]},
                {"$set": {
                    "total_visits": new_total_visits,
                    "total_spent": new_total_spent,
                    "avg_order_value": new_avg_order_value,
                    "last_visit": datetime.now(timezone.utc).isoformat()
                }}
            )
        
        response_data["final_bill_amount"] = round(final_bill_amount, 2)
        response_data["original_bill_amount"] = webhook_data.bill_amount
        
        return POSResponse(
            success=True,
            message="Payment processed successfully",
            data=response_data
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/customer-lookup", response_model=POSResponse)
async def pos_customer_lookup(
    lookup_data: POSCustomerLookup,
    user: dict = Depends(verify_pos_auth)
):
    """
    Look up customer by phone number for POS display
    """
    customer = await db.customers.find_one({
        "user_id": user["id"],
        "phone": lookup_data.phone
    }, {"_id": 0})
    
    if not customer:
        return POSResponse(
            success=False,
            message="Customer not found",
            data={"registered": False}
        )
    
    settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    # CR-001C-LX-A: tier-aware points_value via shared helper.
    blob = build_pos_loyalty_blob(customer, settings)
    
    return POSResponse(
        success=True,
        message="Customer found",
        data={
            "registered": True,
            "customer_id": customer["id"],
            "name": customer["name"],
            "phone": customer["phone"],
            "tier": customer.get("tier", "Bronze"),
            "total_points": customer.get("total_points", 0),
            "points_value": blob["points_value"],
            "wallet_balance": customer.get("wallet_balance", 0.0),
            "total_visits": customer.get("total_visits", 0),
            "total_spent": customer.get("total_spent", 0.0),
            "allergies": customer.get("allergies", []),
            "favorites": customer.get("favorites", []),
            "last_visit": customer.get("last_visit"),
            "addresses": customer.get("addresses", [])
        }
    )

@router.get("/api-key")
async def get_api_key(user: dict = Depends(get_current_user)):
    """Get the current API key for POS integration"""
    user_doc = await db.users.find_one({"id": user["id"]}, {"_id": 0, "api_key": 1})
    if not user_doc or not user_doc.get("api_key"):
        new_key = generate_api_key()
        await db.users.update_one({"id": user["id"]}, {"$set": {"api_key": new_key}})
        return {"api_key": new_key}
    
    return {"api_key": user_doc["api_key"]}

@router.post("/api-key/regenerate")
async def regenerate_api_key(user: dict = Depends(get_current_user)):
    """Regenerate API key for POS integration. Pushes new key to POS automatically."""
    import httpx
    from core.auth import register_crm_token_with_pos

    new_key = generate_api_key()
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"api_key": new_key, "crm_token_registered_with_pos": False}}
    )
    # Push new key to POS (fire-and-forget — same pattern as login)
    mygenie_api_url = os.environ['MYGENIE_API_URL']
    async with httpx.AsyncClient() as client:
        await register_crm_token_with_pos(
            client, mygenie_api_url,
            user.get("restaurant_id"), new_key,
            user.get("mygenie_token"), user["id"]
        )
    # Re-read flag to confirm push result
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "crm_token_registered_with_pos": 1})
    return {
        "message": "API key regenerated successfully",
        "api_key": new_key,
        "pushed_to_pos": (updated or {}).get("crm_token_registered_with_pos", False),
    }


# ============================================
# POS Events Webhook (Single endpoint for all events)
# ============================================

class POSEventWebhook(BaseModel):
    """Schema for POS to trigger WhatsApp events"""
    pos_id: str  # POS system identifier (e.g., "mygenie")
    restaurant_id: str  # Restaurant ID in POS system
    event_type: str  # Event type from POS_EVENTS
    order_id: str  # POS order reference
    customer_phone: str  # Customer phone to notify
    
    # Optional event-specific data for template variables
    event_data: Optional[Dict[str, Any]] = None


@router.post("/events", response_model=POSResponse)
async def pos_event_webhook(
    event_data: POSEventWebhook,
    user: dict = Depends(verify_pos_auth)
):
    """
    Single webhook for POS to trigger WhatsApp messages for various events.
    
    Supported events:
    - new_order_customer: Notify customer when order is placed
    - new_order_outlet: Alert outlet when order is received
    - order_confirmed: Confirm order to customer
    - order_ready_customer: Notify customer order is ready
    - item_ready: Notify customer specific item is ready
    - order_served: Notify customer order is served
    - item_served: Notify customer item is served
    - order_ready_delivery: Alert delivery boy order is ready
    - order_dispatched: Notify customer order is out for delivery
    - send_bill_manual: Manually send bill to customer
    - send_bill_auto: Auto send bill (same as send_bill)
    
    Requires X-API-Key header for authentication.
    """
    try:
        # 1. Validate event type
        if event_data.event_type not in POS_EVENTS:
            return POSResponse(
                success=False,
                message=f"Invalid event_type. Must be one of: {POS_EVENTS}",
                data=None
            )
        
        # 2. Validate pos_id and restaurant_id if user has them configured
        if user.get("pos_id") and event_data.pos_id != user["pos_id"]:
            return POSResponse(
                success=False,
                message=f"Invalid pos_id. Expected: {user['pos_id']}, Received: {event_data.pos_id}",
                data=None
            )
        
        now = datetime.now(timezone.utc).isoformat()
        
        # 3. Map event_type to internal event key FIRST
        # send_bill_manual and send_bill_auto both use "send_bill" internally
        internal_event = event_data.event_type
        if event_data.event_type in ["send_bill_manual", "send_bill_auto"]:
            internal_event = "send_bill"
        
        # 4. CHECK IF EVENT TRIGGER IS ACTIVE (early exit if paused)
        event_config = await db.whatsapp_event_template_map.find_one(
            {"user_id": user["id"], "event_key": internal_event},
            {"_id": 0}
        )
        
        if not event_config:
            # No config means event not configured at all
            return POSResponse(
                success=True,
                message=f"Event '{event_data.event_type}' not configured",
                data={
                    "event_type": event_data.event_type,
                    "whatsapp_sent": False,
                    "reason": "Event trigger not configured"
                }
            )
        
        if not event_config.get("is_enabled", True):
            # Event is paused/disabled
            return POSResponse(
                success=True,
                message=f"Event '{event_data.event_type}' is paused",
                data={
                    "event_type": event_data.event_type,
                    "whatsapp_sent": False,
                    "reason": "Event trigger is paused"
                }
            )
        
        # 5. Determine recipient based on event type
        recipient_phone = event_data.customer_phone
        recipient_type = "customer"
        
        # Special handling for outlet and delivery boy notifications
        if event_data.event_type == "new_order_outlet":
            # Send to outlet phone (from user settings or event_data)
            outlet_phone = (event_data.event_data or {}).get("outlet_phone") or user.get("phone")
            if outlet_phone:
                recipient_phone = outlet_phone
                recipient_type = "outlet"
            else:
                return POSResponse(
                    success=False,
                    message="Outlet phone not configured",
                    data=None
                )
        
        elif event_data.event_type == "order_ready_delivery":
            # Send to delivery boy phone from event_data
            delivery_phone = (event_data.event_data or {}).get("delivery_boy_phone")
            if delivery_phone:
                recipient_phone = delivery_phone
                recipient_type = "delivery_boy"
            else:
                return POSResponse(
                    success=False,
                    message="Delivery boy phone required in event_data.delivery_boy_phone",
                    data=None
                )
        
        # 6. Find customer by phone (for customer data in templates)
        customer = await db.customers.find_one({
            "user_id": user["id"],
            "phone": event_data.customer_phone
        })
        
        # 7. Build customer data for template (use found customer or minimal data)
        if customer:
            customer_data = {
                **customer,
                "phone": recipient_phone,  # Override with actual recipient
            }
        else:
            # Minimal customer data if not found
            customer_data = {
                "id": None,
                "name": (event_data.event_data or {}).get("customer_name", "Customer"),
                "phone": recipient_phone,
                "country_code": "+91",
                "total_points": 0,
                "wallet_balance": 0,
                "tier": "Bronze"
            }
        
        # 8. Build event context data
        context_data = {
            "order_id": event_data.order_id,
            "pos_order_id": event_data.order_id,
            "restaurant_name": user.get("restaurant_name", ""),
            # CR-004 P3.5: idempotency + reference enrichment
            "idempotency_key": f"{event_data.order_id}_{internal_event}",
            "reference_type": "order",
            "reference_id": event_data.order_id,
            **(event_data.event_data or {})
        }
        
        # 9. Trigger WhatsApp event
        result = await trigger_whatsapp_event(
            db, user["id"], internal_event, customer_data, context_data
        )
        
        # 10. Log the event
        event_log = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "pos_id": event_data.pos_id,
            "restaurant_id": event_data.restaurant_id,
            "event_type": event_data.event_type,
            "order_id": event_data.order_id,
            "customer_phone": event_data.customer_phone,
            "recipient_phone": recipient_phone,
            "recipient_type": recipient_type,
            "customer_id": customer["id"] if customer else None,
            "whatsapp_sent": result.success if result else False,
            "whatsapp_error": result.error if result and not result.success else None,
            "event_data": event_data.event_data,
            "created_at": now
        }
        await db.pos_event_logs.insert_one(event_log)
        
        # 11. Return response
        if result is None:
            return POSResponse(
                success=True,
                message=f"Event '{event_data.event_type}' received but no WhatsApp template configured",
                data={
                    "event_id": event_log["id"],
                    "event_type": event_data.event_type,
                    "whatsapp_sent": False,
                    "reason": "No template configured or event disabled"
                }
            )
        
        if result.success:
            return POSResponse(
                success=True,
                message=f"Event '{event_data.event_type}' processed and WhatsApp sent",
                data={
                    "event_id": event_log["id"],
                    "event_type": event_data.event_type,
                    "whatsapp_sent": True,
                    "message_id": result.message_id,
                    "recipient": recipient_phone,
                    "recipient_type": recipient_type
                }
            )
        else:
            return POSResponse(
                success=True,
                message=f"Event '{event_data.event_type}' received but WhatsApp failed",
                data={
                    "event_id": event_log["id"],
                    "event_type": event_data.event_type,
                    "whatsapp_sent": False,
                    "error": result.error
                }
            )
    
    except Exception as e:
        return POSResponse(
            success=False,
            message=f"Event processing failed: {str(e)}",
            data=None
        )


# ============================================
# B2.2 - Customer Search (Lightweight)
# ============================================

@router.get("/customers", response_model=POSResponse)
async def pos_search_customers(
    search: str = "",
    limit: int = 10,
    user: dict = Depends(verify_pos_auth)
):
    """
    Search customers by name or phone (partial match).
    Lightweight response for POS cashier typeahead.
    """
    if not search or len(search) < 2:
        return POSResponse(success=True, message="Provide at least 2 characters", data={"customers": [], "total": 0})

    query = {
        "user_id": user["id"],
        "is_blocked": {"$ne": True},
        "$or": [
            {"name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}}
        ]
    }
    customers = await db.customers.find(
        query,
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "tier": 1, "total_points": 1, "wallet_balance": 1, "last_visit": 1}
    ).sort("last_visit", -1).limit(min(limit, 50)).to_list(min(limit, 50))

    return POSResponse(
        success=True,
        message=f"{len(customers)} customers found",
        data={"customers": customers, "total": len(customers)}
    )


# ============================================
# B2.3 - Customer Full Details
# ============================================

@router.get("/customers/{customer_id}", response_model=POSResponse)
async def pos_get_customer_full(
    customer_id: str,
    user: dict = Depends(verify_pos_auth)
):
    """
    Get full customer details including addresses, loyalty, and recent orders.
    """
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]}, {"_id": 0})
    if not customer:
        return POSResponse(success=False, message="Customer not found", data=None)

    # CR-001C-LX-A: strict 6-key loyalty blob via shared helper.
    settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})

    # Recent orders
    recent_orders = await db.orders.find(
        {"customer_id": customer_id, "user_id": user["id"]},
        {"_id": 0, "id": 1, "pos_order_id": 1, "order_amount": 1, "order_type": 1, "items": 1, "points_earned": 1, "created_at": 1}
    ).sort("created_at", -1).limit(5).to_list(5)

    customer["loyalty"] = build_pos_loyalty_blob(customer, settings)
    customer["recent_orders"] = recent_orders
    customer["addresses"] = customer.get("addresses", [])

    return POSResponse(success=True, message="Customer found", data=customer)


# ============================================
# B3.3 - Soft Delete Customer
# ============================================

@router.delete("/customers/{customer_id}", response_model=POSResponse)
async def pos_soft_delete_customer(
    customer_id: str,
    user: dict = Depends(verify_pos_auth)
):
    """Soft-delete: sets is_blocked=true, preserves data."""
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]})
    if not customer:
        return POSResponse(success=False, message="Customer not found", data=None)

    await db.customers.update_one({"id": customer_id}, {"$set": {"is_blocked": True}})
    return POSResponse(success=True, message="Customer deactivated", data={"customer_id": customer_id})


# ============================================
# B4 - Customer Address CRUD
# ============================================

@router.get("/customers/{customer_id}/addresses", response_model=POSResponse)
async def pos_list_addresses(customer_id: str, user: dict = Depends(verify_pos_auth)):
    """List all addresses for a customer."""
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]}, {"_id": 0, "addresses": 1})
    if customer is None:
        return POSResponse(success=False, message="Customer not found", data=None)

    addresses = customer.get("addresses", [])
    # Sort: default first, then most recent
    addresses.sort(key=lambda a: (not a.get("is_default", False), a.get("created_at", "")), reverse=False)
    # Put default first (is_default=True sorts before False when negated)
    addresses.sort(key=lambda a: not a.get("is_default", False))

    return POSResponse(success=True, message=f"{len(addresses)} addresses found", data={"customer_id": customer_id, "addresses": addresses, "total": len(addresses)})


@router.post("/customers/{customer_id}/addresses", response_model=POSResponse)
async def pos_add_address(customer_id: str, addr_data: CustomerAddressCreate, user: dict = Depends(verify_pos_auth)):
    """Add a new address. Dedup by address+pincode."""
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]})
    if not customer:
        return POSResponse(success=False, message="Customer not found", data=None)

    now = datetime.now(timezone.utc).isoformat()
    existing_addresses = customer.get("addresses", [])

    # Dedup check: same address + pincode = update instead of duplicate
    for existing in existing_addresses:
        if (existing.get("address", "").strip().lower() == (addr_data.address or "").strip().lower()
                and existing.get("pincode", "").strip() == (addr_data.pincode or "").strip()
                and (addr_data.pincode or "").strip()):
            # Update existing address's last_used timestamp
            await db.customers.update_one(
                {"id": customer_id, "addresses.id": existing["id"]},
                {"$set": {"addresses.$.updated_at": now}}
            )
            return POSResponse(success=True, message="Address already exists, updated timestamp",
                               data={"address_id": existing["id"], "deduplicated": True})

    addr_doc = addr_data.model_dump()
    addr_doc["id"] = _generate_addr_id()
    addr_doc["created_at"] = now
    addr_doc["updated_at"] = now

    # If this is default, unset others
    if addr_doc.get("is_default"):
        if existing_addresses:
            await db.customers.update_one(
                {"id": customer_id},
                {"$set": {"addresses.$[].is_default": False}}
            )
    elif not existing_addresses:
        # First address is always default
        addr_doc["is_default"] = True

    await db.customers.update_one({"id": customer_id}, {"$push": {"addresses": addr_doc}})

    return POSResponse(success=True, message="Address added", data={"address_id": addr_doc["id"], "address": addr_doc})


@router.put("/customers/{customer_id}/addresses/{addr_id}", response_model=POSResponse)
async def pos_update_address(customer_id: str, addr_id: str, addr_data: CustomerAddressUpdate, user: dict = Depends(verify_pos_auth)):
    """Update a specific address."""
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]})
    if not customer:
        return POSResponse(success=False, message="Customer not found", data=None)

    addresses = customer.get("addresses", [])
    addr_found = any(a.get("id") == addr_id for a in addresses)
    if not addr_found:
        return POSResponse(success=False, message="Address not found", data=None)

    now = datetime.now(timezone.utc).isoformat()
    update_fields = {k: v for k, v in addr_data.model_dump().items() if v is not None}
    update_fields["updated_at"] = now

    # If setting as default, unset others first
    if update_fields.get("is_default"):
        await db.customers.update_one(
            {"id": customer_id},
            {"$set": {"addresses.$[].is_default": False}}
        )

    # Build positional update
    set_ops = {f"addresses.$.{k}": v for k, v in update_fields.items()}
    await db.customers.update_one(
        {"id": customer_id, "addresses.id": addr_id},
        {"$set": set_ops}
    )

    return POSResponse(success=True, message="Address updated", data={"address_id": addr_id})


@router.delete("/customers/{customer_id}/addresses/{addr_id}", response_model=POSResponse)
async def pos_delete_address(customer_id: str, addr_id: str, user: dict = Depends(verify_pos_auth)):
    """Delete a specific address."""
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]})
    if not customer:
        return POSResponse(success=False, message="Customer not found", data=None)

    addresses = customer.get("addresses", [])
    addr = next((a for a in addresses if a.get("id") == addr_id), None)
    if not addr:
        return POSResponse(success=False, message="Address not found", data=None)

    was_default = addr.get("is_default", False)

    await db.customers.update_one({"id": customer_id}, {"$pull": {"addresses": {"id": addr_id}}})

    # If deleted was default, make the most recent remaining one default
    if was_default:
        remaining = [a for a in addresses if a.get("id") != addr_id]
        if remaining:
            remaining.sort(key=lambda a: a.get("updated_at", a.get("created_at", "")), reverse=True)
            await db.customers.update_one(
                {"id": customer_id, "addresses.id": remaining[0]["id"]},
                {"$set": {"addresses.$.is_default": True}}
            )

    return POSResponse(success=True, message="Address deleted", data={"address_id": addr_id})


@router.put("/customers/{customer_id}/addresses/{addr_id}/default", response_model=POSResponse)
async def pos_set_default_address(customer_id: str, addr_id: str, user: dict = Depends(verify_pos_auth)):
    """Set an address as default."""
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]})
    if not customer:
        return POSResponse(success=False, message="Customer not found", data=None)

    addresses = customer.get("addresses", [])
    if not any(a.get("id") == addr_id for a in addresses):
        return POSResponse(success=False, message="Address not found", data=None)

    # Unset all defaults, then set target
    await db.customers.update_one({"id": customer_id}, {"$set": {"addresses.$[].is_default": False}})
    await db.customers.update_one(
        {"id": customer_id, "addresses.id": addr_id},
        {"$set": {"addresses.$.is_default": True}}
    )

    return POSResponse(success=True, message="Default address set", data={"address_id": addr_id})


# ============================================
# B5.1 - Cross-Restaurant Address Lookup
# ============================================

class CrossRestaurantAddressLookup(BaseModel):
    phone: str
    country_code: str = "+91"


@router.post("/address-lookup", response_model=POSResponse)
async def pos_cross_restaurant_address_lookup(lookup: CrossRestaurantAddressLookup, user: dict = Depends(verify_pos_auth)):
    """Lookup addresses by phone across all restaurants. Deduped, sorted by recency."""
    pipeline = [
        {"$match": {"phone": lookup.phone, "addresses": {"$exists": True, "$ne": []}}},
        {"$project": {"_id": 0, "addresses": 1, "user_id": 1}},
    ]
    results = await db.customers.aggregate(pipeline).to_list(50)

    # Collect all addresses with source, dedup by address+pincode
    seen = {}
    for doc in results:
        # Get restaurant name for source
        restaurant = await db.users.find_one({"id": doc["user_id"]}, {"_id": 0, "restaurant_name": 1})
        source_name = restaurant.get("restaurant_name", "Unknown") if restaurant else "Unknown"

        for addr in doc.get("addresses", []):
            dedup_key = f"{(addr.get('address', '') or '').strip().lower()}|{(addr.get('pincode', '') or '').strip()}"
            existing = seen.get(dedup_key)
            addr_time = addr.get("updated_at") or addr.get("created_at") or ""
            if not existing or addr_time > existing.get("_time", ""):
                addr_copy = {k: v for k, v in addr.items()}
                addr_copy["source_restaurant"] = source_name
                addr_copy["_time"] = addr_time
                seen[dedup_key] = addr_copy

    addresses = sorted(seen.values(), key=lambda a: a.get("_time", ""), reverse=True)
    for a in addresses:
        a.pop("_time", None)

    return POSResponse(success=True, message=f"{len(addresses)} addresses found", data={"phone": lookup.phone, "addresses": addresses})


# ============================================
# B6.3 - Customer Order History
# ============================================

@router.get("/customers/{customer_id}/orders", response_model=POSResponse)
async def pos_customer_orders(customer_id: str, limit: int = 10, user: dict = Depends(verify_pos_auth)):
    """Get order history for a customer."""
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]}, {"_id": 0, "id": 1})
    if not customer:
        return POSResponse(success=False, message="Customer not found", data=None)

    orders = await db.orders.find(
        {"customer_id": customer_id, "user_id": user["id"]},
        {"_id": 0}
    ).sort("created_at", -1).limit(min(limit, 50)).to_list(min(limit, 50))

    total = await db.orders.count_documents({"customer_id": customer_id, "user_id": user["id"]})

    return POSResponse(success=True, message=f"{len(orders)} orders found", data={"orders": orders, "total": total})


# ============================================
# B7.2 - Loyalty Summary
# ============================================

@router.get("/customers/{customer_id}/loyalty", response_model=POSResponse)
async def pos_customer_loyalty(customer_id: str, user: dict = Depends(verify_pos_auth)):
    """Get loyalty summary for a customer."""
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]}, {"_id": 0})
    if not customer:
        return POSResponse(success=False, message="Customer not found", data=None)

    # CR-001C-LX-A: strict 6-key payload via shared helper.
    settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    blob = build_pos_loyalty_blob(customer, settings)
    return POSResponse(success=True, message="Loyalty summary", data=blob)


# ============================================
# B8 - Coupon Operations (POS auth) — CR-001C-C V1 rebuild
# ============================================

@router.get("/coupons/available", response_model=POSResponse)
async def pos_available_coupons(
    customer_id: str,
    order_total: float,
    channel: str = "pos",
    user: dict = Depends(verify_pos_auth),
):
    """
    CR-001C-C V1: list coupons eligible for `customer_id` + `order_total`.
    Read-only. Returns `count=0` + empty list when nothing applies.
    """
    coupons_list = await list_available_coupons(
        db,
        user_id=user["id"],
        customer_id=customer_id,
        order_total=order_total,
        channel=channel,
    )
    return POSResponse(
        success=True,
        message="Available coupons" if coupons_list else "No coupons available",
        data={
            "customer_id": customer_id,
            "order_total": order_total,
            "channel": channel,
            "count": len(coupons_list),
            "coupons": coupons_list,
        },
    )


@router.post("/coupons/validate", response_model=POSResponse)
async def pos_validate_coupon(
    request: POSCouponValidateRequest,
    user: dict = Depends(verify_pos_auth),
):
    """
    CR-001C-C V1 rebuild + V2 extension: JSON-body validate with structured error.code.
    Read-only — no usage recorded. Final commit happens on `/api/pos/orders`.

    CR-001C-C V2: `items[]` accepted in the body. Required for item/category-scope coupons.
    """
    items_payload: Optional[List[dict]] = None
    if request.items is not None:
        items_payload = [it.model_dump() for it in request.items]

    result = await validate_coupon_for_customer(
        db,
        user_id=user["id"],
        code=request.code,
        customer_id=request.customer_id,
        order_total=request.order_total,
        channel=request.channel,
        loyalty_points_used=request.loyalty_points_used,
        items=items_payload,
        pos_supplied_order_time=request.order_time,
    )
    if not result["ok"]:
        err_data = {"valid": False, "error": result["error"]}
        if result.get("time_window_status") is not None:
            err_data["time_window_status"] = result["time_window_status"]
        # CR-001C-C V3-B — surface pos_instruction on missing-requirement failures (Q11=B).
        if result.get("pos_instruction"):
            err_data["pos_instruction"] = result["pos_instruction"]
        return POSResponse(
            success=False,
            message=result["error"].get("detail", "Coupon not valid"),
            data=err_data,
        )

    coupon = result["coupon"]
    discount = result["computed_discount"]
    scope = result.get("discount_scope", "order")
    eligible_subtotal = result.get("eligible_subtotal")
    final_preview = (
        round(float(request.order_total or 0.0) - float(discount or 0.0), 2)
        if discount is not None
        else None
    )
    return POSResponse(
        success=True,
        message="Coupon valid",
        data={
            "valid": True,
            "code": coupon["code"],
            "coupon_id": coupon["id"],
            "title": coupon.get("title") or coupon.get("description"),
            "display_title": build_display_title(coupon),
            "coupon_type": coupon.get("coupon_type", "order"),
            "discount_scope": scope,
            "discount_type": coupon["discount_type"],
            "discount_value": coupon["discount_value"],
            "computed_discount": discount,
            "eligible_subtotal": eligible_subtotal,
            "final_amount_preview": final_preview,
            "requires_cart_validation": False,
            "matched_food_ids": result.get("matched_food_ids", []),
            "matched_item_ids": result.get("matched_item_ids", []),
            "matched_category_ids": result.get("matched_category_ids", []),
            "matched_category_names": result.get("matched_category_names", []),
            "stackable_with_loyalty": bool(coupon.get("stackable_with_loyalty", False)),
            # CR-001C-C V3-A — additive
            "offer_type": result.get("offer_type", "simple"),
            "time_window_status": result.get("time_window_status"),
            # CR-001C-C V3-B — additive (None / empty when not a V3-B coupon)
            "applied_applications": result.get("applied_applications"),
            "benefit_items": result.get("benefit_items") or [],
            "buy_match_summary": result.get("buy_match_summary") or [],
            "get_match_summary": result.get("get_match_summary") or [],
            "same_item_required": result.get("same_item_required"),
            "get_discount_type": result.get("get_discount_type"),
            "max_applications": result.get("max_applications"),
            "allow_repeat": result.get("allow_repeat"),
            # CR-001C-C V3-C — additive
            "nth_item_number": result.get("nth_item_number"),
            "nth_discount_type": result.get("nth_discount_type"),
            "nth_discount_value": result.get("nth_discount_value"),
            "eligible_match_summary": result.get("eligible_match_summary") or [],
        },
    )


@router.post("/coupons/apply", response_model=POSResponse, deprecated=True)
async def pos_apply_coupon(
    code: str, customer_id: str, order_value: float, channel: str = "pos",
    user: dict = Depends(verify_pos_auth)
):
    """
    DEPRECATED for POS. Final commit must go through `POST /api/pos/orders`.
    Retained for backwards compatibility with pre-V1 POS builds.

    Routes through the central service so behavior matches `/pos/orders`,
    using a synthetic `order_id` derived from (customer_id, order_value, now)
    so idempotency still applies if POS replays this call.
    """
    synthetic_order_id = f"legacy_apply_{customer_id}_{int(order_value*100)}_{uuid.uuid4().hex[:8]}"
    res = await record_coupon_usage_for_order(
        db,
        user_id=user["id"],
        restaurant_id=None,
        customer_id=customer_id,
        code=code,
        order_id=synthetic_order_id,
        pos_order_id=None,
        order_total=order_value,
        coupon_discount_from_pos=0.0,  # legacy callers don't send POS-computed amount
        channel=channel,
        source="pos_apply_legacy",
    )
    # Legacy behavior: if POS didn't provide coupon_discount, recompute from coupon
    # using the central calculator. (Backward compat — V1 path requires non-zero.)
    if not res.get("recorded"):
        from core.coupon import validate_coupon_for_customer as _v, compute_coupon_discount as _calc
        v = await _v(
            db, user_id=user["id"], code=code, customer_id=customer_id,
            order_total=order_value, channel=channel, loyalty_points_used=0.0,
        )
        if not v["ok"]:
            return POSResponse(success=False, message=v["error"].get("detail", "Invalid"),
                               data={"valid": False, "error": v["error"]})
        discount = _calc(v["coupon"], order_value)
        res = await record_coupon_usage_for_order(
            db,
            user_id=user["id"],
            restaurant_id=None,
            customer_id=customer_id,
            code=code,
            order_id=synthetic_order_id,
            pos_order_id=None,
            order_total=order_value,
            coupon_discount_from_pos=discount,
            channel=channel,
            source="pos_apply_legacy",
        )

    if not res.get("ok"):
        return POSResponse(success=False, message=res.get("error", {}).get("detail", "Apply failed"),
                           data={"valid": False, "error": res.get("error")})

    return POSResponse(success=True, message="Coupon applied", data={
        "usage_id": res.get("usage_id"),
        "discount": res.get("coupon_discount"),
        "final_amount": round(float(order_value) - float(res.get("coupon_discount") or 0.0), 2),
        "idempotent_replay": res.get("idempotent_replay", False),
    })


# ============================================
# B10 - Customer Notes (Historical Pattern Lookup)
# ============================================

@router.get("/customers/{customer_id}/notes/items", response_model=POSResponse)
async def pos_customer_item_notes(customer_id: str, user: dict = Depends(verify_pos_auth)):
    """
    Aggregate item-level notes across all orders for a customer.
    Groups by item_name and note (case-insensitive), sorted by frequency.
    """
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]}, {"_id": 0, "id": 1, "name": 1})
    if not customer:
        return POSResponse(success=False, message="Customer not found", data=None)

    pipeline = [
        {"$match": {"customer_id": customer_id, "user_id": user["id"], "item_notes": {"$nin": [None, ""]}}},
        {"$addFields": {"note_lower": {"$toLower": "$item_notes"}}},
        {"$group": {
            "_id": {"item_name": "$item_name", "note": "$note_lower"},
            "count": {"$sum": 1},
            "last_ordered": {"$max": "$created_at"},
            "original_note": {"$first": "$item_notes"}
        }},
        {"$group": {
            "_id": "$_id.item_name",
            "notes": {"$push": {"note": "$original_note", "count": "$count", "last_ordered": "$last_ordered"}},
            "total_notes": {"$sum": "$count"}
        }},
        {"$sort": {"total_notes": -1}},
        {"$project": {"_id": 0, "item_name": "$_id", "notes": 1, "total_notes": 1}}
    ]

    results = await db.order_items.aggregate(pipeline).to_list(100)
    # Sort notes within each item by count desc
    for item in results:
        item["notes"].sort(key=lambda n: n["count"], reverse=True)

    return POSResponse(success=True, message=f"{len(results)} items with notes", data={
        "customer_id": customer_id,
        "customer_name": customer.get("name", ""),
        "item_notes": results,
        "total_unique_items_with_notes": len(results)
    })


@router.get("/customers/{customer_id}/notes/orders", response_model=POSResponse)
async def pos_customer_order_notes(customer_id: str, user: dict = Depends(verify_pos_auth)):
    """
    Aggregate order-level notes across all orders for a customer.
    Groups by note text (case-insensitive), sorted by frequency.
    """
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]}, {"_id": 0, "id": 1, "name": 1})
    if not customer:
        return POSResponse(success=False, message="Customer not found", data=None)

    pipeline = [
        {"$match": {"customer_id": customer_id, "user_id": user["id"],
                     "order_notes": {"$exists": True, "$nin": [None, ""]}}},
        {"$addFields": {"note_lower": {"$toLower": "$order_notes"}}},
        {"$group": {
            "_id": "$note_lower",
            "count": {"$sum": 1},
            "last_used": {"$max": "$created_at"},
            "original_note": {"$first": "$order_notes"}
        }},
        {"$sort": {"count": -1}},
        {"$project": {"_id": 0, "note": "$original_note", "count": 1, "last_used": 1}}
    ]

    results = await db.orders.aggregate(pipeline).to_list(100)
    total_orders_with_notes = sum(r["count"] for r in results)

    return POSResponse(success=True, message=f"{len(results)} unique order notes", data={
        "customer_id": customer_id,
        "customer_name": customer.get("name", ""),
        "order_notes": results,
        "total_orders_with_notes": total_orders_with_notes
    })


# Messaging routes
@messaging_router.post("/send")
async def send_message(msg_data: MessageRequest, user: dict = Depends(get_current_user)):
    """Mock messaging endpoint - ready for real provider integration"""
    customer = await db.customers.find_one({"id": msg_data.customer_id, "user_id": user["id"]})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    message_log = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "customer_id": msg_data.customer_id,
        "customer_phone": customer["phone"],
        "message": msg_data.message,
        "channel": msg_data.channel,
        "status": "sent",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.message_logs.insert_one(message_log)
    
    return {
        "message": "Message sent successfully (MOCK)",
        "log_id": message_log["id"],
        "note": "Real messaging provider integration pending"
    }
