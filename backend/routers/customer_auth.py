"""
Customer Self-Service API - OTP based authentication for customers
"""
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
import uuid
import random
import jwt
import os

from core.database import db
from core.address_utils import (
    create_new_address,
    update_address,
    set_default_address,
    find_address_by_id,
    remove_address_by_id,
    validate_address
)
from models.schemas import Address, AddressCreate, AddressUpdate

router = APIRouter(prefix="/customer", tags=["Customer Self-Service"])

# JWT Secret for customer tokens (separate from admin tokens)
CUSTOMER_JWT_SECRET = os.environ.get("CUSTOMER_JWT_SECRET", "customer-secret-key-change-in-production")
CUSTOMER_TOKEN_EXPIRE_HOURS = 24

# OTP expiry in minutes
OTP_EXPIRY_MINUTES = 10


class SendOTPRequest(BaseModel):
    phone: str
    user_id: str  # Restaurant ID - REQUIRED
    country_code: str = "91"


class VerifyOTPRequest(BaseModel):
    phone: str
    otp: str
    user_id: str  # Restaurant ID - REQUIRED
    country_code: str = "91"


def generate_otp() -> str:
    """Generate 6-digit OTP"""
    return str(random.randint(100000, 999999))


def create_customer_token(customer_id: str, phone: str, user_id: str) -> str:
    """Create JWT token for customer"""
    expire = datetime.now(timezone.utc) + timedelta(hours=CUSTOMER_TOKEN_EXPIRE_HOURS)
    payload = {
        "customer_id": customer_id,
        "phone": phone,
        "user_id": user_id,  # Restaurant context
        "exp": expire,
        "type": "customer"
    }
    return jwt.encode(payload, CUSTOMER_JWT_SECRET, algorithm="HS256")


async def get_current_customer(authorization: str = Header(None)):
    """Dependency to get current customer from token"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")
    
    try:
        # Remove "Bearer " prefix if present
        token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
        
        payload = jwt.decode(token, CUSTOMER_JWT_SECRET, algorithms=["HS256"])
        
        if payload.get("type") != "customer":
            raise HTTPException(status_code=401, detail="Invalid token type")
        
        customer_id = payload.get("customer_id")
        user_id = payload.get("user_id")
        
        if not customer_id or not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Get customer from database - scoped by restaurant
        customer = await db.customers.find_one(
            {"id": customer_id, "user_id": user_id}, 
            {"_id": 0}
        )
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        return customer
    
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


@router.post("/send-otp")
async def send_otp(request: SendOTPRequest):
    """
    Send OTP to customer phone number.
    Customer must exist in database for the specified restaurant.
    """
    phone = request.phone.strip().replace(" ", "")
    user_id = request.user_id.strip()
    
    # Validate restaurant exists
    restaurant = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "restaurant_name": 1})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    
    # Find customer by phone - SCOPED BY RESTAURANT
    customer = await db.customers.find_one(
        {"phone": phone, "user_id": user_id}, 
        {"_id": 0, "id": 1, "name": 1, "phone": 1}
    )
    
    if not customer:
        raise HTTPException(
            status_code=404, 
            detail="Customer not found. Please contact the restaurant to register."
        )
    
    # Generate OTP
    otp = generate_otp()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)
    
    # Store OTP in database - include restaurant context
    otp_doc = {
        "id": str(uuid.uuid4()),
        "phone": phone,
        "user_id": user_id,  # Restaurant ID
        "otp": otp,
        "customer_id": customer["id"],
        "expires_at": expires_at.isoformat(),
        "verified": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Remove old OTPs for this phone + restaurant combination
    await db.customer_otps.delete_many({"phone": phone, "user_id": user_id})
    
    # Insert new OTP
    await db.customer_otps.insert_one(otp_doc)
    
    # TODO: Send OTP via WhatsApp/SMS using AuthKey or other provider
    # For now, return OTP in response (REMOVE IN PRODUCTION)
    
    return {
        "success": True,
        "message": f"OTP sent to +{request.country_code} {phone}",
        "expires_in_minutes": OTP_EXPIRY_MINUTES,
        "restaurant_name": restaurant.get("restaurant_name"),
        # REMOVE IN PRODUCTION - only for testing
        "debug_otp": otp
    }


@router.post("/verify-otp")
async def verify_otp(request: VerifyOTPRequest):
    """
    Verify OTP and return customer token.
    """
    phone = request.phone.strip().replace(" ", "")
    user_id = request.user_id.strip()
    
    # Find OTP record - SCOPED BY RESTAURANT
    otp_record = await db.customer_otps.find_one({
        "phone": phone,
        "user_id": user_id,
        "otp": request.otp,
        "verified": False
    })
    
    if not otp_record:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    
    # Check expiry
    expires_at = datetime.fromisoformat(otp_record["expires_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new one.")
    
    # Mark OTP as verified
    await db.customer_otps.update_one(
        {"id": otp_record["id"]},
        {"$set": {"verified": True}}
    )
    
    # Get customer - SCOPED BY RESTAURANT
    customer = await db.customers.find_one(
        {"id": otp_record["customer_id"], "user_id": user_id}, 
        {"_id": 0}
    )
    
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Generate token with restaurant context
    token = create_customer_token(customer["id"], phone, user_id)
    
    # Get loyalty settings for points value calculation
    loyalty_settings = await db.loyalty_settings.find_one(
        {"user_id": customer.get("user_id")}, 
        {"_id": 0, "redemption_value": 1}
    )
    redemption_value = loyalty_settings.get("redemption_value", 0.25) if loyalty_settings else 0.25
    
    # Calculate points value
    total_points = customer.get("total_points", 0)
    points_value = round(total_points * redemption_value, 2)
    
    return {
        "success": True,
        "message": "OTP verified successfully",
        "token": token,
        "token_type": "bearer",
        "expires_in_hours": CUSTOMER_TOKEN_EXPIRE_HOURS,
        "customer": {
            "id": customer.get("id"),
            "name": customer.get("name"),
            "phone": customer.get("phone"),
            "email": customer.get("email"),
            "country_code": customer.get("country_code", "+91"),
            
            # Personal
            "dob": customer.get("dob"),
            "anniversary": customer.get("anniversary"),
            "gender": customer.get("gender"),
            
            # Loyalty
            "tier": customer.get("tier", "Bronze"),
            "total_points": total_points,
            "points_value": points_value,
            "wallet_balance": customer.get("wallet_balance", 0.0),
            
            # Stats
            "total_visits": customer.get("total_visits", 0),
            "total_spent": customer.get("total_spent", 0.0),
            "last_visit": customer.get("last_visit"),
            
            # Address (single - legacy)
            "address": customer.get("address"),
            "city": customer.get("city"),
            "state": customer.get("state"),
            "pincode": customer.get("pincode"),
            
            # Multiple Addresses (new)
            "addresses": customer.get("addresses", []),
            
            # Preferences
            "allergies": customer.get("allergies", []),
            "favorites": customer.get("favorites", []),
            
            # Restaurant info
            "restaurant_id": customer.get("user_id")
        }
    }


@router.get("/me")
async def get_customer_details(customer: dict = Depends(get_current_customer)):
    """
    Get current customer details.
    Requires valid customer token from OTP verification.
    """
    # Get loyalty settings for the restaurant
    loyalty_settings = await db.loyalty_settings.find_one(
        {"user_id": customer.get("user_id")}, 
        {"_id": 0, "redemption_value": 1}
    )
    redemption_value = loyalty_settings.get("redemption_value", 0.25) if loyalty_settings else 0.25
    
    # Calculate points value
    total_points = customer.get("total_points", 0)
    points_value = round(total_points * redemption_value, 2)
    
    # Return customer details (excluding sensitive/internal fields)
    return {
        "id": customer.get("id"),
        "name": customer.get("name"),
        "phone": customer.get("phone"),
        "email": customer.get("email"),
        "country_code": customer.get("country_code", "+91"),
        
        # Personal
        "dob": customer.get("dob"),
        "anniversary": customer.get("anniversary"),
        "gender": customer.get("gender"),
        
        # Loyalty
        "tier": customer.get("tier", "Bronze"),
        "total_points": total_points,
        "points_value": points_value,
        "wallet_balance": customer.get("wallet_balance", 0.0),
        
        # Stats
        "total_visits": customer.get("total_visits", 0),
        "total_spent": customer.get("total_spent", 0.0),
        "last_visit": customer.get("last_visit"),
        
        # Address (single - legacy)
        "address": customer.get("address"),
        "city": customer.get("city"),
        "state": customer.get("state"),
        "pincode": customer.get("pincode"),
        
        # Multiple Addresses (new)
        "addresses": customer.get("addresses", []),
        
        # Preferences
        "allergies": customer.get("allergies", []),
        "favorites": customer.get("favorites", []),
        
        # Restaurant info
        "restaurant_id": customer.get("user_id")
    }


@router.get("/me/addresses")
async def get_customer_addresses(customer: dict = Depends(get_current_customer)):
    """
    Get current customer's addresses.
    Requires valid customer token from OTP verification.
    """
    addresses = customer.get("addresses", [])
    return {
        "customer_id": customer.get("id"),
        "addresses": addresses,
        "total": len(addresses)
    }


@router.post("/me/addresses", response_model=Address)
async def add_customer_address(address_data: AddressCreate, customer: dict = Depends(get_current_customer)):
    """
    Add a new delivery address for the logged-in customer.
    First address is automatically set as default.
    """
    is_valid, error_msg = validate_address(address_data.model_dump())
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    addresses = customer.get("addresses") or []
    is_first = len(addresses) == 0

    new_addr = create_new_address(address_data.model_dump(), is_first=is_first)
    addresses.append(new_addr)

    await db.customers.update_one(
        {"id": customer["id"]},
        {"$set": {"addresses": addresses, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    return Address(**new_addr)


@router.put("/me/addresses/{address_id}", response_model=Address)
async def update_customer_address(address_id: str, address_data: AddressUpdate, customer: dict = Depends(get_current_customer)):
    """
    Update an existing address for the logged-in customer.
    """
    addresses = customer.get("addresses") or []
    existing = find_address_by_id(addresses, address_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Address not found")

    update_dict = {k: v for k, v in address_data.model_dump().items() if v is not None}
    updated_addr = update_address(existing, update_dict)

    addresses = [updated_addr if a.get("id") == address_id else a for a in addresses]

    await db.customers.update_one(
        {"id": customer["id"]},
        {"$set": {"addresses": addresses, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    return Address(**updated_addr)


@router.delete("/me/addresses/{address_id}")
async def delete_customer_address(address_id: str, customer: dict = Depends(get_current_customer)):
    """
    Delete an address for the logged-in customer.
    If deleting the default, next address becomes default.
    """
    addresses = customer.get("addresses") or []
    existing = find_address_by_id(addresses, address_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Address not found")

    addresses = remove_address_by_id(addresses, address_id)

    await db.customers.update_one(
        {"id": customer["id"]},
        {"$set": {"addresses": addresses, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    return {"message": "Address deleted", "remaining_addresses": len(addresses)}


@router.post("/me/addresses/{address_id}/set-default", response_model=Address)
async def set_default_customer_address(address_id: str, customer: dict = Depends(get_current_customer)):
    """
    Set an address as the default delivery address.
    """
    addresses = customer.get("addresses") or []
    existing = find_address_by_id(addresses, address_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Address not found")

    addresses = set_default_address(addresses, address_id)

    await db.customers.update_one(
        {"id": customer["id"]},
        {"$set": {"addresses": addresses, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    updated = find_address_by_id(addresses, address_id)
    return Address(**updated)
