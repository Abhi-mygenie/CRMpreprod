from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid
import asyncio

from core.database import db
from core.auth import get_current_user, generate_api_key
from core.helpers import calculate_tier, get_earn_percent_for_tier, check_off_peak_bonus
from core.whatsapp import trigger_whatsapp_event
from models.schemas import (
    POSPaymentWebhook, POSCustomerLookup, POSResponse,
    MessageRequest, POS_EVENTS
)

router = APIRouter(prefix="/pos", tags=["POS Gateway"])
messaging_router = APIRouter(prefix="/messaging", tags=["Messaging"])


def _tier_rank_pos(tier: str) -> int:
    """Get tier rank for comparison"""
    ranks = {"Bronze": 1, "Silver": 2, "Gold": 3, "Platinum": 4}
    return ranks.get(tier, 0)


# API Key Authentication Dependency
async def verify_pos_api_key(x_api_key: str = Header(None, alias="X-API-Key")):
    print(f"DEBUG: Received API key: {x_api_key}")
    if not x_api_key:
        raise HTTPException(status_code=401, detail="API key required in X-API-Key header")
    
    user = await db.users.find_one({"api_key": x_api_key}, {"_id": 0})
    print(f"DEBUG: User found: {user is not None}")
    if not user:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return user


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
    
    # Address
    address: Optional[str] = None
    address_line_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: Optional[str] = None
    delivery_instructions: Optional[str] = None
    map_location: Optional[dict] = None
    
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
    
    # Address
    address: Optional[str] = None
    address_line_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: Optional[str] = None
    delivery_instructions: Optional[str] = None
    map_location: Optional[dict] = None
    
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
    user: dict = Depends(verify_pos_api_key)
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
    user: dict = Depends(verify_pos_api_key)
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
    
    if update_dict:
        update_dict["pos_synced"] = True
        update_dict["pos_synced_at"] = datetime.now(timezone.utc).isoformat()
        await db.customers.update_one({"id": customer_id}, {"$set": update_dict})
    
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
    """Request to check max redeemable loyalty points"""
    pos_id: str
    restaurant_id: str
    cust_mobile: str
    bill_amount: float


@router.post("/max-redeemable", response_model=POSResponse)
async def pos_max_redeemable(
    request: POSMaxRedeemableRequest,
    user: dict = Depends(verify_pos_api_key)
):
    """
    Check maximum loyalty points redeemable for a given bill.
    Returns max points and their monetary value.
    """
    # Find customer by phone
    customer = await db.customers.find_one({
        "user_id": user["id"],
        "phone": request.cust_mobile
    })
    
    if not customer:
        return POSResponse(
            success=False,
            message="Customer not found",
            data={"registered": False}
        )
    
    # Get loyalty settings
    settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    if not settings:
        settings = {
            "redemption_value": 0.25,
            "min_redemption_points": 100,
            "max_redemption_percent": 50.0,
            "max_redemption_amount": 500.0
        }
    
    available_points = customer.get("total_points", 0)
    redemption_value = settings.get("redemption_value", 0.25)
    min_redemption = settings.get("min_redemption_points", 100)
    max_percent = settings.get("max_redemption_percent", 50.0)
    max_amount = settings.get("max_redemption_amount", 500.0)
    
    # Check if customer has minimum points
    if available_points < min_redemption:
        return POSResponse(
            success=True,
            message="Customer does not have minimum points required for redemption",
            data={
                "max_points_redeemable": 0,
                "max_discount_value": 0.0,
                "available_points": available_points,
                "min_points_required": min_redemption
            }
        )
    
    # Calculate max discount by bill percentage
    max_by_percent = (request.bill_amount * max_percent) / 100
    
    # Calculate max discount by absolute cap
    max_by_cap = max_amount
    
    # Calculate max discount by available points
    max_by_points = available_points * redemption_value
    
    # Take the minimum of all limits
    max_discount = min(max_by_percent, max_by_cap, max_by_points)
    
    # Convert back to points
    max_points = int(max_discount / redemption_value)
    
    # Ensure we don't exceed available points
    max_points = min(max_points, available_points)
    
    # Recalculate exact discount value
    max_discount_value = round(max_points * redemption_value, 2)
    
    return POSResponse(
        success=True,
        message="Max redeemable calculated",
        data={
            "max_points_redeemable": max_points,
            "max_discount_value": max_discount_value
        }
    )


# ============================================
# Order Webhook helpers
# ============================================

async def _validate_order(order_data: "POSOrderWebhook", user: dict) -> Optional[POSResponse]:
    """Validate pos_id, restaurant_id, payment status, and duplicate order.
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
    if order_data.payment_status != "success":
        return POSResponse(
            success=False,
            message=f"Order not processed - payment status: {order_data.payment_status}",
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
    if settings.get("first_visit_bonus_enabled", False):
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


def _calculate_points(order_amount: float, customer: dict, settings: dict) -> dict:
    """Calculate points earned including off-peak bonus.
    Returns dict with base_points, off_peak_bonus, total_points, description."""
    min_order = settings.get("min_order_value", 100.0)
    if order_amount < min_order:
        return {"base_points": 0, "off_peak_bonus": 0, "total_points": 0, "description": ""}

    tier = customer.get("tier", "Bronze")
    earn_percent = get_earn_percent_for_tier(tier, settings)
    base_points = int(order_amount * earn_percent / 100)

    # Off-peak bonus
    is_off_peak, bonus_value, bonus_type, off_peak_msg = check_off_peak_bonus(settings)
    off_peak_bonus = 0

    if is_off_peak and base_points > 0:
        if bonus_type == "multiplier":
            off_peak_bonus = int(base_points * (bonus_value - 1))
        else:
            off_peak_bonus = int(bonus_value)

    total = base_points + off_peak_bonus
    desc = f"Earned {earn_percent}% on order of Rs.{order_amount}"
    if off_peak_bonus > 0:
        desc += f" (+{off_peak_bonus} off-peak bonus)"

    return {
        "base_points": base_points,
        "off_peak_bonus": off_peak_bonus,
        "total_points": total,
        "description": desc,
        "off_peak_message": off_peak_msg if off_peak_bonus > 0 else None,
    }


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
        "table_id": order_data.table_id,
        "waiter_id": order_data.waiter_id,
        "print_kot": order_data.print_kot,
        
        # Room/Address (for future use)
        "paid_room": order_data.paid_room,
        "room_id": order_data.room_id,
        "address_id": order_data.address_id,
        
        # Notes & Items
        "order_notes": order_data.order_notes,
        "items": items_embedded,
        
        # Loyalty Points
        "points_earned": points_earned,
        "off_peak_bonus": off_peak_bonus,
        
        # Timestamps
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
    """Individual item within an order - supports all MyGenie cart item fields"""
    # Item Identification
    item_name: str
    pos_food_id: Optional[int] = None  # food_id from POS
    item_category: Optional[str] = None
    
    # Quantity & Price
    item_qty: int = 1  # quantity
    item_price: float = 0.0  # food_amount
    
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
    
    # Kitchen
    station: Optional[str] = None  # "OTHER", "BAR", "KITCHEN"
    
    # Notes
    item_notes: Optional[str] = None  # food_level_notes


class POSOrderWebhook(BaseModel):
    """Schema for order data from MyGenie/POS systems - supports all fields"""
    # POS Identification
    pos_id: str = "mygenie"  # Default to mygenie if not provided
    restaurant_id: str
    restaurant_name: Optional[str] = None
    
    # Order Identification
    order_id: str
    
    # Customer Info
    cust_mobile: str
    cust_name: Optional[str] = None
    cust_email: Optional[str] = None
    user_id: Optional[str] = None  # Maps to pos_customer_id
    
    # Amounts
    order_amount: float
    order_sub_total_amount: Optional[float] = None
    
    # Discounts
    order_discount: float = 0.0
    self_discount: float = 0.0
    coupon_code: Optional[str] = None
    coupon_discount: float = 0.0
    
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
    payment_status: str = "success"
    payment_type: Optional[str] = None  # "prepaid", "postpaid"
    transaction_id: Optional[str] = None
    
    # Order Meta
    order_type: Optional[str] = "pos"  # pos, dine_in, takeaway, delivery
    table_id: Optional[str] = None
    waiter_id: Optional[str] = None
    print_kot: Optional[str] = None  # "Yes", "No"
    
    # Room/Address (for future use)
    paid_room: Optional[str] = None
    room_id: Optional[str] = None
    address_id: Optional[str] = None
    
    # Notes & Items
    order_notes: Optional[str] = None  # order_note
    items: Optional[List[OrderItem]] = None  # cart items


@router.post("/orders", response_model=POSResponse)
async def pos_order_webhook(
    order_data: POSOrderWebhook,
    user: dict = Depends(verify_pos_api_key)
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
            settings = {
                "min_order_value": 100.0,
                "bronze_earn_percent": 5.0, "silver_earn_percent": 7.0,
                "gold_earn_percent": 10.0, "platinum_earn_percent": 15.0,
                "redemption_value": 0.25,
                "tier_silver_min": 500, "tier_gold_min": 1500, "tier_platinum_min": 5000,
                "first_visit_bonus_enabled": False, "first_visit_bonus_points": 50,
            }

        # 3. Find or create customer
        customer, is_new, first_visit_bonus = await _find_or_create_customer(
            order_data, user, settings, now
        )

        # 4. Calculate points (includes off-peak bonus)
        pts = _calculate_points(order_data.order_amount, customer, settings)
        points_earned = pts["total_points"]

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
        new_tier = calculate_tier(new_points, settings)

        new_total_visits = customer.get("total_visits", 0) + 1
        new_total_spent = customer.get("total_spent", 0) + order_data.order_amount
        new_avg_order_value = round(new_total_spent / new_total_visits, 2)

        await db.customers.update_one(
            {"id": customer["id"]},
            {"$set": {
                "total_points": new_points,
                "tier": new_tier,
                "wallet_balance": new_wallet_balance,
                "total_visits": new_total_visits,
                "total_spent": new_total_spent,
                "avg_order_value": new_avg_order_value,
                "last_visit": now,
            }},
        )

        # 7. Save order + transactions
        order_id = await _save_order_and_transactions(
            order_data, user, customer, points_earned, new_points,
            wallet_used, new_wallet_balance, pts["off_peak_bonus"], now,
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

        # 8. Fire WhatsApp triggers
        # send_bill trigger - for every order
        asyncio.create_task(trigger_whatsapp_event(
            db, user["id"], "send_bill", updated_customer,
            {
                "order_id": order_id,
                "pos_order_id": order_data.order_id,
                "order_amount": order_data.order_amount,
                "points_earned": points_earned,
                "points_balance": new_points,
                "wallet_used": wallet_used,
                "wallet_balance": new_wallet_balance
            }
        ))

        # first_visit trigger - only for new customers
        if is_new:
            asyncio.create_task(trigger_whatsapp_event(
                db, user["id"], "first_visit", updated_customer,
                {
                    "first_visit_bonus": first_visit_bonus,
                    "order_amount": order_data.order_amount,
                    "points_balance": new_points
                }
            ))

        # tier_upgrade trigger - if tier changed
        old_tier = customer.get("tier", "Bronze")
        if new_tier != old_tier and _tier_rank_pos(new_tier) > _tier_rank_pos(old_tier):
            asyncio.create_task(trigger_whatsapp_event(
                db, user["id"], "tier_upgrade", updated_customer,
                {"old_tier": old_tier, "new_tier": new_tier, "points_balance": new_points}
            ))

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
            },
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Order processing failed: {str(e)}")


@router.post("/webhook/payment-received", response_model=POSResponse)
async def pos_payment_received(
    webhook_data: POSPaymentWebhook,
    user: dict = Depends(verify_pos_api_key)
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
            settings = {
                "min_order_value": 100.0,
                "bronze_earn_percent": 5.0,
                "silver_earn_percent": 7.0,
                "gold_earn_percent": 10.0,
                "platinum_earn_percent": 15.0,
                "redemption_value": 0.25,
                "min_redemption_points": 100,
                "max_redemption_percent": 50.0,
                "max_redemption_amount": 500.0,
                "tier_silver_min": 500,
                "tier_gold_min": 1500,
                "tier_platinum_min": 5000
            }
        
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
        points_redeemed = 0
        if webhook_data.redeem_points and webhook_data.redeem_points > 0:
            current_points = customer.get("total_points", 0)
            min_redemption = settings.get("min_redemption_points", 100)
            max_redemption_percent = settings.get("max_redemption_percent", 50.0)
            max_redemption_amount = settings.get("max_redemption_amount", 500.0)
            redemption_value = settings.get("redemption_value", 0.25)
            
            max_redemption_by_percent = (final_bill_amount * max_redemption_percent) / 100
            max_redemption = min(max_redemption_by_percent, max_redemption_amount)
            
            if current_points >= min_redemption:
                points_to_redeem = min(webhook_data.redeem_points, current_points)
                redemption_amount = points_to_redeem * redemption_value
                
                if redemption_amount > max_redemption:
                    redemption_amount = max_redemption
                    points_to_redeem = int(redemption_amount / redemption_value)
                
                if redemption_amount > final_bill_amount:
                    redemption_amount = final_bill_amount
                    points_to_redeem = int(redemption_amount / redemption_value)
                
                if points_to_redeem > 0:
                    new_points = current_points - points_to_redeem
                    await db.customers.update_one(
                        {"id": customer["id"]},
                        {"$set": {"total_points": new_points}}
                    )
                    
                    tx_doc = {
                        "id": str(uuid.uuid4()),
                        "user_id": user["id"],
                        "customer_id": customer["id"],
                        "points": points_to_redeem,
                        "transaction_type": "redeem",
                        "description": f"Redeemed at POS (Bill: Rs.{webhook_data.bill_amount})",
                        "bill_amount": webhook_data.bill_amount,
                        "balance_after": new_points,
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                    await db.points_transactions.insert_one(tx_doc)
                    
                    final_bill_amount -= redemption_amount
                    points_redeemed = points_to_redeem
                    response_data["points_redeemed"] = {
                        "points": points_to_redeem,
                        "value": round(redemption_amount, 2)
                    }
                    response_data["transactions"].append({
                        "type": "redeem",
                        "points": points_to_redeem,
                        "value": round(redemption_amount, 2),
                        "description": "Points redeemed"
                    })
        
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
    user: dict = Depends(verify_pos_api_key)
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
    redemption_value = settings.get("redemption_value", 0.25) if settings else 0.25
    
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
            "points_value": round(customer.get("total_points", 0) * redemption_value, 2),
            "wallet_balance": customer.get("wallet_balance", 0.0),
            "total_visits": customer.get("total_visits", 0),
            "total_spent": customer.get("total_spent", 0.0),
            "allergies": customer.get("allergies", []),
            "favorites": customer.get("favorites", []),
            "last_visit": customer.get("last_visit")
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
    """Regenerate API key for POS integration"""
    new_key = generate_api_key()
    await db.users.update_one({"id": user["id"]}, {"$set": {"api_key": new_key}})
    return {
        "message": "API key regenerated successfully",
        "api_key": new_key,
        "warning": "Make sure to update your POS system with the new key"
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
    user: dict = Depends(verify_pos_api_key)
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
