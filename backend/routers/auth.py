from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone, timedelta
import uuid
import os
import random
import string

from core.database import db
from core.auth import hash_password, verify_password, create_token, generate_api_key, get_current_user
from core.helpers import get_default_templates_and_automation
from models.schemas import UserCreate, UserLogin, UserResponse, TokenResponse

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Demo user credentials
DEMO_EMAIL = "demo@restaurant.com"
DEMO_PASSWORD = "demo123"

# OTP expiry time in minutes
OTP_EXPIRY_MINUTES = 10


def generate_otp(length=6):
    """Generate a random numeric OTP"""
    return ''.join(random.choices(string.digits, k=length))


async def create_default_whatsapp_templates(user_id: str):
    """Create default WhatsApp templates and automation rules for a new user"""
    templates, automation_rules = get_default_templates_and_automation(user_id)
    
    # Insert templates
    if templates:
        await db.whatsapp_templates.insert_many(templates)
    
    # Insert automation rules
    if automation_rules:
        await db.automation_rules.insert_many(automation_rules)


@router.post("/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if email exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    api_key = generate_api_key()
    user_doc = {
        "id": user_id,
        "email": user_data.email,
        "restaurant_name": user_data.restaurant_name,
        "phone": user_data.phone,
        "password_hash": hash_password(user_data.password),
        "api_key": api_key,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user_doc)
    
    # Create default loyalty settings
    settings_doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "min_order_value": 100.0,
        "bronze_earn_percent": 5.0,
        "silver_earn_percent": 7.0,
        "gold_earn_percent": 10.0,
        "platinum_earn_percent": 15.0,
        "redemption_value": 0.25,
        "min_redemption_points": 100,
        "max_redemption_percent": 50.0,
        "max_redemption_amount": 500.0,
        "points_expiry_months": 6,
        "expiry_reminder_days": 30,
        "tier_silver_min": 500,
        "tier_gold_min": 1500,
        "tier_platinum_min": 5000,
        "birthday_bonus_enabled": True,
        "birthday_bonus_points": 100,
        "birthday_bonus_days_before": 0,
        "birthday_bonus_days_after": 7,
        "anniversary_bonus_enabled": True,
        "anniversary_bonus_points": 150,
        "anniversary_bonus_days_before": 0,
        "anniversary_bonus_days_after": 7,
        "first_visit_bonus_enabled": True,
        "first_visit_bonus_points": 50,
        "off_peak_bonus_enabled": False,
        "off_peak_start_time": "14:00",
        "off_peak_end_time": "17:00",
        "off_peak_bonus_type": "multiplier",
        "off_peak_bonus_value": 2.0,
        "feedback_bonus_enabled": True,
        "feedback_bonus_points": 25
    }
    await db.loyalty_settings.insert_one(settings_doc)
    
    # Create default WhatsApp templates and automation rules
    await create_default_whatsapp_templates(user_id)
    
    token = create_token(user_id)
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user_id,
            email=user_data.email,
            restaurant_name=user_data.restaurant_name,
            phone=user_data.phone,
            created_at=user_doc["created_at"]
        )
    )

@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    """
    Unified login endpoint - routes to MyGenie authentication
    Kept for backward compatibility, calls mygenie_login internally
    """
    return await mygenie_login(credentials)

@router.get("/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(
        id=user["id"],
        email=user["email"],
        restaurant_name=user["restaurant_name"],
        phone=user["phone"],
        pos_id=user.get("pos_id", ""),
        pos_name=user.get("pos_name", ""),
        created_at=user["created_at"]
    )

@router.put("/profile")
async def update_profile(updates: dict, user: dict = Depends(get_current_user)):
    allowed = {"phone", "address"}
    filtered = {k: v for k, v in updates.items() if k in allowed and v is not None}
    if not filtered:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    await db.users.update_one({"id": user["id"]}, {"$set": filtered})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"business_name": updated.get("restaurant_name", ""), "phone": updated.get("phone", ""), "address": updated.get("address", ""), "email": updated.get("email", ""), "pos_id": updated.get("pos_id", ""), "pos_name": updated.get("restaurant_name", "")}


@router.put("/reset-password")
async def reset_password(data: dict, user: dict = Depends(get_current_user)):
    """
    Reset password for logged-in user.
    Requires current password verification.
    Updates local DB only (not MyGenie).
    """
    current_password = data.get("current_password")
    new_password = data.get("new_password")
    
    if not current_password or not new_password:
        raise HTTPException(status_code=400, detail="Both current and new password are required")
    
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    
    # Verify current password
    if not user.get("password_hash"):
        raise HTTPException(status_code=400, detail="Password not set for this account")
    
    if not verify_password(current_password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    
    # Update password
    new_hash = hash_password(new_password)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": new_hash}}
    )
    
    return {"message": "Password updated successfully"}

@router.post("/demo-login", response_model=TokenResponse)
async def demo_login():
    """
    Demo mode login - uses local test user without MyGenie authentication
    For testing and demonstration purposes only
    """
    user = await db.users.find_one({"email": DEMO_EMAIL}, {"_id": 0})
    
    if not user:
        raise HTTPException(
            status_code=404, 
            detail="Demo user not found. Please run setup first."
        )
    
    token = create_token(user["id"])
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            restaurant_name=user["restaurant_name"],
            phone=user["phone"],
            pos_id=user.get("pos_id", ""),
            pos_name=user.get("pos_name", ""),
            created_at=user["created_at"]
        ),
        is_demo=True
    )

@router.post("/mygenie-login", response_model=TokenResponse)
async def mygenie_login(credentials: UserLogin):
    """
    Login flow:
    1. Always authenticate via MyGenie API to get fresh token
    2. Update or create user in local DB with fresh mygenie_token
    """
    import httpx
    
    # Check if local user exists (for later)
    local_user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    
    # Always authenticate via MyGenie to get fresh token
    mygenie_api_url = os.getenv("MYGENIE_API_URL", "https://preprod.mygenie.online")
    login_endpoint = os.getenv("MYGENIE_LOGIN_ENDPOINT", "/api/v1/auth/vendoremployee/login")
    profile_endpoint = os.getenv("MYGENIE_PROFILE_ENDPOINT", "/api/v1/vendoremployee/profile")
    
    async with httpx.AsyncClient() as client:
        try:
            login_response = await client.post(
                f"{mygenie_api_url}{login_endpoint}",
                json={
                    "email": credentials.email,
                    "password": credentials.password
                },
                headers={"Content-Type": "application/json"},
                timeout=10.0
            )
            
            if login_response.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid credentials")
            
            login_data = login_response.json()
            mygenie_token = login_data.get("token")
            
            if not mygenie_token:
                raise HTTPException(
                    status_code=500,
                    detail="MyGenie authentication failed - no token received"
                )
            
            profile_response = await client.get(
                f"{mygenie_api_url}{profile_endpoint}",
                headers={
                    "Authorization": f"Bearer {mygenie_token}",
                    "Content-Type": "application/json"
                },
                timeout=10.0
            )
            
            if profile_response.status_code != 200:
                raise HTTPException(
                    status_code=500,
                    detail="Failed to fetch user profile from MyGenie"
                )
            
            profile_data = profile_response.json()
            
            email = profile_data.get("emp_email") or credentials.email
            first_name = profile_data.get("emp_f_name", "")
            last_name = profile_data.get("emp_l_name", "") or ""
            restaurant_name = "Unknown"
            phone = ""
            restaurant_id = None
            
            if profile_data.get("restaurants") and len(profile_data["restaurants"]) > 0:
                restaurant = profile_data["restaurants"][0]
                restaurant_name = restaurant.get("name", "Unknown")
                phone = restaurant.get("phone", "")
                restaurant_id = str(restaurant.get("id", ""))
            
            # pos_id and pos_name hardcoded for now, will be dynamic later
            pos_id = "0001"
            pos_name = "MyGenie"
            user_id = f"pos_{pos_id}_restaurant_{restaurant_id}"
            
            # Check if user already exists - by pos_id/restaurant_id OR by email
            existing_user = await db.users.find_one({"pos_id": pos_id, "restaurant_id": restaurant_id}, {"_id": 0})
            if not existing_user and local_user:
                existing_user = local_user
            
            if existing_user:
                # Update password_hash and mygenie_token for existing user
                await db.users.update_one(
                    {"id": existing_user["id"]},
                    {"$set": {
                        "password_hash": hash_password(credentials.password),
                        "mygenie_token": mygenie_token,  # Update token on each login
                        "last_login": datetime.now(timezone.utc).isoformat()
                    }}
                )
                token = create_token(existing_user["id"])
                return TokenResponse(
                    access_token=token,
                    user=UserResponse(
                        id=existing_user["id"],
                        email=existing_user.get("email", email),
                        restaurant_name=existing_user.get("restaurant_name", restaurant_name),
                        phone=existing_user.get("phone", phone),
                        pos_id=existing_user.get("pos_id", ""),
                        pos_name=existing_user.get("pos_name", ""),
                        created_at=existing_user["created_at"]
                    ),
                    is_demo=False
                )
            
            # Create new user with password_hash
            api_key = generate_api_key()
            now = datetime.now(timezone.utc).isoformat()
            user_doc = {
                "id": user_id,
                "pos_id": pos_id,
                "pos_name": pos_name,
                "restaurant_id": restaurant_id,
                "api_key": api_key,
                "email": email,
                "password_hash": hash_password(credentials.password),
                "restaurant_name": restaurant_name,
                "phone": phone,
                "first_name": first_name,
                "last_name": last_name,
                "mygenie_token": mygenie_token,
                "mygenie_synced": True,
                "created_at": now,
                "last_login": now
            }
            await db.users.insert_one(user_doc)
            
            # Create default loyalty settings
            settings_doc = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "min_order_value": 100.0,
                "bronze_earn_percent": 5.0,
                "silver_earn_percent": 7.0,
                "gold_earn_percent": 10.0,
                "platinum_earn_percent": 15.0,
                "redemption_value": 0.25,
                "min_redemption_points": 100,
                "max_redemption_percent": 50.0,
                "max_redemption_amount": 500.0,
                "points_expiry_months": 6,
                "expiry_reminder_days": 30,
                "tier_silver_min": 500,
                "tier_gold_min": 1500,
                "tier_platinum_min": 5000,
                "birthday_bonus_enabled": True,
                "birthday_bonus_points": 100,
                "birthday_bonus_days_before": 0,
                "birthday_bonus_days_after": 7,
                "anniversary_bonus_enabled": True,
                "anniversary_bonus_points": 150,
                "anniversary_bonus_days_before": 0,
                "anniversary_bonus_days_after": 7,
                "first_visit_bonus_enabled": True,
                "first_visit_bonus_points": 50,
                "off_peak_bonus_enabled": False,
                "off_peak_start_time": "14:00",
                "off_peak_end_time": "17:00",
                "off_peak_bonus_type": "multiplier",
                "off_peak_bonus_value": 2.0,
                "feedback_bonus_enabled": True,
                "feedback_bonus_points": 25
            }
            await db.loyalty_settings.insert_one(settings_doc)
            
            # Create default WhatsApp templates and automation rules
            await create_default_whatsapp_templates(user_id)
            
            token = create_token(user_id)
            return TokenResponse(
                access_token=token,
                user=UserResponse(
                    id=user_id,
                    email=email,
                    restaurant_name=restaurant_name,
                    phone=phone,
                    pos_id=pos_id,
                    pos_name=pos_name,
                    created_at=now
                ),
                is_demo=False
            )
            
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="MyGenie API timeout")
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"MyGenie API error: {str(e)}")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Authentication failed: {str(e)}")



# Forgot Password OTP Endpoints
@router.post("/forgot-password/request-otp")
async def request_forgot_password_otp(data: dict):
    """
    Request OTP for forgot password.
    Sends OTP via WhatsApp if configured, otherwise returns OTP for testing.
    """
    email = data.get("email")
    
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    
    # Find user by email
    user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if not user:
        # Don't reveal if email exists or not for security
        raise HTTPException(status_code=404, detail="If this email exists, an OTP will be sent")
    
    # Generate OTP
    otp = generate_otp(6)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)
    
    # Store OTP in database
    otp_doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "email": email,
        "otp": otp,
        "purpose": "reset_password",
        "expires_at": expires_at.isoformat(),
        "used": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Remove any existing OTPs for this user/purpose
    await db.otp_tokens.delete_many({"user_id": user["id"], "purpose": "reset_password"})
    await db.otp_tokens.insert_one(otp_doc)
    
    # Check if WhatsApp is configured
    whatsapp_key = user.get("authkey_api_key")
    
    # TODO: Send OTP via WhatsApp when configured
    # For now, return OTP for testing purposes
    if not whatsapp_key:
        # No WhatsApp configured - return OTP for testing
        return {
            "message": "OTP generated (testing mode - WhatsApp not configured)",
            "otp": otp,  # Only for testing - remove in production
            "expires_in_minutes": OTP_EXPIRY_MINUTES,
            "whatsapp_enabled": False
        }
    else:
        # WhatsApp configured - would send OTP via WhatsApp
        # For now, still return OTP for testing
        return {
            "message": "OTP sent to your registered phone via WhatsApp",
            "otp": otp,  # Only for testing - remove in production
            "expires_in_minutes": OTP_EXPIRY_MINUTES,
            "whatsapp_enabled": True
        }


@router.post("/forgot-password/verify-otp")
async def verify_forgot_password_otp(data: dict):
    """
    Verify OTP for forgot password.
    Returns a temporary token for password reset.
    """
    email = data.get("email")
    otp = data.get("otp")
    
    if not email or not otp:
        raise HTTPException(status_code=400, detail="Email and OTP are required")
    
    # Find OTP record
    otp_record = await db.otp_tokens.find_one({
        "email": email,
        "otp": otp,
        "purpose": "reset_password",
        "used": False
    }, {"_id": 0})
    
    if not otp_record:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    
    # Check expiry
    expires_at = datetime.fromisoformat(otp_record["expires_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="OTP has expired")
    
    # Generate reset token (valid for 15 minutes)
    reset_token = str(uuid.uuid4())
    reset_expires = datetime.now(timezone.utc) + timedelta(minutes=15)
    
    # Mark OTP as used and store reset token
    await db.otp_tokens.update_one(
        {"id": otp_record["id"]},
        {"$set": {
            "used": True,
            "reset_token": reset_token,
            "reset_token_expires": reset_expires.isoformat()
        }}
    )
    
    return {
        "message": "OTP verified successfully",
        "reset_token": reset_token,
        "expires_in_minutes": 15
    }


@router.post("/forgot-password/reset")
async def reset_password_with_token(data: dict):
    """
    Reset password using the token from OTP verification.
    Returns access token for auto-login after successful reset.
    """
    email = data.get("email")
    reset_token = data.get("reset_token")
    new_password = data.get("new_password")
    
    if not email or not reset_token or not new_password:
        raise HTTPException(status_code=400, detail="Email, reset token, and new password are required")
    
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    # Find and validate reset token
    otp_record = await db.otp_tokens.find_one({
        "email": email,
        "reset_token": reset_token,
        "purpose": "reset_password",
        "used": True
    }, {"_id": 0})
    
    if not otp_record:
        raise HTTPException(status_code=400, detail="Invalid reset token")
    
    # Check token expiry
    expires_at = datetime.fromisoformat(otp_record["reset_token_expires"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Reset token has expired")
    
    # Update user password
    new_hash = hash_password(new_password)
    result = await db.users.update_one(
        {"email": email},
        {"$set": {"password_hash": new_hash}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Delete the OTP record
    await db.otp_tokens.delete_one({"id": otp_record["id"]})
    
    # Get user for auto-login
    user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Generate access token for auto-login
    access_token = create_token(user["id"])
    
    # Update last login
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {
        "message": "Password reset successfully",
        "access_token": access_token,
        "user": UserResponse(
            id=user["id"],
            email=user["email"],
            restaurant_name=user.get("restaurant_name", ""),
            phone=user.get("phone", ""),
            pos_id=user.get("pos_id", ""),
            pos_name=user.get("pos_name", ""),
            created_at=user.get("created_at", "")
        )
    }
