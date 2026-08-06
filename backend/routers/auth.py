from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone, timedelta
import asyncio
import uuid
import os
import random
import string

from core.database import db
from core.auth import hash_password, verify_password, create_token, generate_api_key, get_current_user, register_crm_token_with_pos
from core.loyalty import default_loyalty_settings
from models.schemas import UserCreate, UserLogin, UserResponse, TokenResponse
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])

# POS webhook endpoints list (for handshake)
POS_WEBHOOK_ENDPOINTS = {
    "orders": "/pos/orders",
    "customer_lookup": "/pos/customer-lookup",
    "events": "/pos/events",
    "max_redeemable": "/pos/max-redeemable",
    "customers_create": "/pos/customers",
    "customers_search": "/pos/customers?search=",
    "customers_detail": "/pos/customers/{customer_id}",
    "addresses": "/pos/customers/{customer_id}/addresses",
    "address_lookup": "/pos/address-lookup",
    "coupon_validate": "/pos/coupons/validate",
    "coupon_apply": "/pos/coupons/apply",
    "loyalty": "/pos/customers/{customer_id}/loyalty",
    "order_history": "/pos/customers/{customer_id}/orders",
    "notes_items": "/pos/customers/{customer_id}/notes/items",
    "notes_orders": "/pos/customers/{customer_id}/notes/orders"
}


def _build_pos_config(api_key: str) -> dict:
    """Build pos_config for login response handshake."""
    base_url = os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("CRM_EXTERNAL_URL")
    return {
        "api_key": api_key,
        "api_base_url": f"{base_url}/api/pos" if base_url else "/api/pos",
        "webhook_endpoints": POS_WEBHOOK_ENDPOINTS
    }


# CR-014: GSTIN state code lookup
_GSTIN_STATE_MAP = {
    "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
    "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
    "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
    "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
    "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
    "16": "Tripura", "17": "Meghalaya", "18": "Assam",
    "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
    "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
    "25": "Daman & Diu", "26": "Dadra & Nagar Haveli & Daman & Diu",
    "27": "Maharashtra", "28": "Andhra Pradesh (old)",
    "29": "Karnataka", "30": "Goa", "31": "Lakshadweep",
    "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
    "35": "Andaman & Nicobar", "36": "Telangana",
    "37": "Andhra Pradesh", "38": "Ladakh",
}

async def _sync_mygenie_profile_fields(user_id: str, existing_user: dict, profile_data: dict):
    """
    CR-014: On login, extract tax/address fields from MyGenie profile and store
    on users doc — ONLY if our field is currently empty (don't overwrite manual edits).
    """
    restaurant = {}
    if profile_data.get("restaurants") and len(profile_data["restaurants"]) > 0:
        restaurant = profile_data["restaurants"][0]

    vat_info = profile_data.get("vat_info") or {}
    updates = {}

    # gst_code → gstin
    gst_code = (restaurant.get("gst_code") or "").strip()
    if gst_code and not existing_user.get("gstin"):
        updates["gstin"] = gst_code
        # Auto-derive state from GSTIN
        if len(gst_code) >= 2 and not existing_user.get("state"):
            state_name = _GSTIN_STATE_MAP.get(gst_code[:2])
            if state_name:
                updates["state"] = state_name

    # address → address_line1
    address = (restaurant.get("address") or "").strip()
    if address and not existing_user.get("address_line1"):
        updates["address_line1"] = address

    # fssai → fssai_license
    fssai = (restaurant.get("fssai") or "").strip()
    if fssai and not existing_user.get("fssai_license"):
        updates["fssai_license"] = fssai

    # vat_info.code → vat_number
    vat_code = (vat_info.get("code") or "").strip()
    if vat_code and not existing_user.get("vat_number"):
        updates["vat_number"] = vat_code

    if updates:
        await db.users.update_one({"id": user_id}, {"$set": updates})


# OTP expiry time in minutes
OTP_EXPIRY_MINUTES = 10


def generate_otp(length=6):
    """Generate a random numeric OTP"""
    return ''.join(random.choices(string.digits, k=length))


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
    
    # Create default loyalty settings (CR-001C-L-FIX: single helper)
    settings_doc = default_loyalty_settings(user_id)
    await db.loyalty_settings.insert_one(settings_doc)
    
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
        created_at=user["created_at"],
        # CR-014 Phase 1: profile expansion fields
        gstin=user.get("gstin", ""),
        legal_name=user.get("legal_name", ""),
        state=user.get("state", ""),
        address_line1=user.get("address_line1", ""),
        address_line2=user.get("address_line2", ""),
        city=user.get("city", ""),
        pincode=user.get("pincode", ""),
        fssai_license=user.get("fssai_license", ""),
        pan=user.get("pan", ""),
        vat_number=user.get("vat_number", ""),
        bill_settings=user.get("bill_settings"),
        # CR-036 B.1: Meta creds for frontend media upload check
        meta_waba_id=user.get("meta_waba_id"),
        meta_access_token=user.get("meta_access_token"),
        meta_app_id=user.get("meta_app_id"),
    )

import re as _re_auth

# CR-014 Phase 1: regex validators for profile fields (only applied when value is non-empty)
_PROFILE_VALIDATORS = {
    "gstin": (_re_auth.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"), "Invalid GSTIN format (expected 15-char, e.g. 29ABCDE1234F1Z5)"),
    "pincode": (_re_auth.compile(r"^[1-9][0-9]{5}$"), "Pincode must be 6 digits (e.g. 560001)"),
    "fssai_license": (_re_auth.compile(r"^[0-9]{14}$"), "FSSAI license must be 14 digits"),
    "pan": (_re_auth.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$"), "Invalid PAN format (e.g. ABCDE1234F)"),
}

# CR-014 Phase 2: allowed keys inside bill_settings sub-doc
_BILL_SETTINGS_KEYS = {
    "invoice_prefix", "header_color", "accent_color", "bill_logo_url",
    "show_gstin", "show_fssai", "show_sac_code", "sac_code",
    "show_loyalty_section", "show_veg_dots", "show_amount_in_words",
    "currency_symbol", "footer_message", "footer_contact", "tagline",
    "terms_and_conditions", "date_format", "show_customer_gstin",
    "social_instagram", "social_google_review",
}

@router.put("/profile")
async def update_profile(updates: dict, user: dict = Depends(get_current_user)):
    allowed = {
        "phone",
        "gstin", "legal_name", "state",
        "address_line1", "address_line2", "city", "pincode",
        "fssai_license", "pan", "vat_number",
    }
    filtered = {k: (v if v is not None else "") for k, v in updates.items() if k in allowed}

    # CR-014 Phase 2: handle bill_settings sub-doc
    if "bill_settings" in updates and isinstance(updates["bill_settings"], dict):
        incoming_bs = updates["bill_settings"]
        # Merge with existing bill_settings (don't wipe unset keys)
        existing_bs = user.get("bill_settings") or {}
        merged_bs = {**existing_bs}
        for k, v in incoming_bs.items():
            if k in _BILL_SETTINGS_KEYS:
                merged_bs[k] = v
        filtered["bill_settings"] = merged_bs

    if not filtered:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    # Validate regex fields (only when non-empty; C2=a: blank is always OK)
    for field_key, (regex, error_msg) in _PROFILE_VALIDATORS.items():
        value = filtered.get(field_key, "")
        if value and not regex.match(value):
            raise HTTPException(status_code=400, detail=f"{field_key}: {error_msg}")

    await db.users.update_one({"id": user["id"]}, {"$set": filtered})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {
        "business_name": updated.get("restaurant_name", ""),
        "email": updated.get("email", ""),
        "phone": updated.get("phone", ""),
        "pos_id": updated.get("pos_id", ""),
        "pos_name": updated.get("restaurant_name", ""),
        "gstin": updated.get("gstin", ""),
        "legal_name": updated.get("legal_name", ""),
        "state": updated.get("state", ""),
        "address_line1": updated.get("address_line1", ""),
        "address_line2": updated.get("address_line2", ""),
        "city": updated.get("city", ""),
        "pincode": updated.get("pincode", ""),
        "fssai_license": updated.get("fssai_license", ""),
        "pan": updated.get("pan", ""),
        "vat_number": updated.get("vat_number", ""),
        "bill_settings": updated.get("bill_settings"),
    }


# CR-014 Phase 2: Logo upload endpoint
from fastapi import UploadFile, File
from pathlib import Path as _Path

# CR-036 Part 3 — S3 migration with dual-mode fallback per Q9 (no backfill).
# New uploads → S3 (bill-logos/<user_id>.<ext>). Legacy files stay served from
# _LOGO_DIR via /profile/logo/{user_id} until owner re-uploads.
from core import s3 as _s3

_LOGO_DIR = _Path("/app/data/logos")
_LOGO_DIR.mkdir(parents=True, exist_ok=True)

@router.post("/profile/logo")
async def upload_profile_logo(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """Upload a bill logo image (PNG/JPG/WEBP, max 500KB).

    CR-036 Part 3: new uploads go to S3 when configured; falls back to local
    disk if S3 is not configured OR the S3 put fails (defensive dual-mode).
    """
    if file.content_type not in ("image/png", "image/jpeg", "image/webp"):
        raise HTTPException(status_code=400, detail="Only PNG, JPG, WEBP images are accepted")
    content = await file.read()
    if len(content) > 512_000:
        raise HTTPException(status_code=400, detail="Image must be under 500KB")
    ext = file.content_type.split("/")[-1].replace("jpeg", "jpg")

    # CR-036 Part 3 · S3 path (preferred)
    logo_url = None
    if _s3.S3_CONFIGURED:
        s3_key = f"bill-logos/{user['id']}.{ext}"
        logo_url = _s3.put_public_object(
            key=s3_key,
            body=content,
            content_type=file.content_type,
            cache_control="public, max-age=86400",
        )
        if logo_url:
            logger.info("CR-036/logo → S3 OK user=%s key=%s", user["id"], s3_key)
        else:
            logger.warning("CR-036/logo → S3 FAILED, falling back to local disk user=%s", user["id"])

    # Local-disk write (fallback OR when S3 not configured)
    if not logo_url:
        logo_path = _LOGO_DIR / f"{user['id']}.{ext}"
        logo_path.write_bytes(content)
        logo_url = f"/api/auth/profile/logo/{user['id']}"

    # Store in bill_settings — value is either full HTTPS S3 URL (new) or
    # relative /api/... path (legacy fallback). Consumers must handle both.
    bs = user.get("bill_settings") or {}
    bs["bill_logo_url"] = logo_url
    await db.users.update_one({"id": user["id"]}, {"$set": {"bill_settings": bs}})
    return {"logo_url": logo_url}

@router.get("/profile/logo/{user_id}")
async def serve_profile_logo(user_id: str):
    """Serve uploaded logo image (public — used on customer-facing invoices).

    CR-036 Part 3 (Q9): this endpoint STAYS as a dual-mode fallback for tenants
    whose bill_logo_url still points to /api/auth/profile/logo/... . Tenants who
    re-upload after CR-036 ship get an S3 URL and bypass this endpoint entirely.
    """
    from fastapi.responses import FileResponse
    for ext in ("png", "jpg", "webp"):
        path = _LOGO_DIR / f"{user_id}.{ext}"
        if path.exists():
            ct = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}[ext]
            return FileResponse(path, media_type=ct)
    raise HTTPException(status_code=404, detail="Logo not found")


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
    mygenie_api_url = os.environ['MYGENIE_API_URL']
    login_endpoint = os.environ['MYGENIE_LOGIN_ENDPOINT']
    profile_endpoint = os.environ['MYGENIE_PROFILE_ENDPOINT']
    
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

                # CR-001: Backfill api_key if missing (legacy users)
                api_key = existing_user.get("api_key")
                if not api_key:
                    api_key = generate_api_key()
                    await db.users.update_one(
                        {"id": existing_user["id"]},
                        {"$set": {"api_key": api_key}}
                    )

                # CR-001 / BUG-008: Push CRM token to MyGenie POS (only if not already registered)
                if not existing_user.get("crm_token_registered_with_pos"):
                    await register_crm_token_with_pos(
                        client, mygenie_api_url, restaurant_id,
                        api_key, mygenie_token, existing_user["id"]
                    )

                # CR-014: Sync tax/address fields from MyGenie profile (only fills empty fields)
                await _sync_mygenie_profile_fields(existing_user["id"], existing_user, profile_data)
                # Re-read user doc after sync to get fresh field values
                refreshed_user = await db.users.find_one({"id": existing_user["id"]}, {"_id": 0}) or existing_user

                token = create_token(existing_user["id"])
                return TokenResponse(
                    access_token=token,
                    user=UserResponse(
                        id=refreshed_user["id"],
                        email=refreshed_user.get("email", email),
                        restaurant_name=refreshed_user.get("restaurant_name", restaurant_name),
                        phone=refreshed_user.get("phone", phone),
                        pos_id=refreshed_user.get("pos_id", ""),
                        pos_name=refreshed_user.get("pos_name", ""),
                        created_at=refreshed_user["created_at"],
                        gstin=refreshed_user.get("gstin", ""),
                        legal_name=refreshed_user.get("legal_name", ""),
                        state=refreshed_user.get("state", ""),
                        address_line1=refreshed_user.get("address_line1", ""),
                        address_line2=refreshed_user.get("address_line2", ""),
                        city=refreshed_user.get("city", ""),
                        pincode=refreshed_user.get("pincode", ""),
                        fssai_license=refreshed_user.get("fssai_license", ""),
                        pan=refreshed_user.get("pan", ""),
                        vat_number=refreshed_user.get("vat_number", ""),
                    ),
                    pos_config=_build_pos_config(api_key),
                    mygenie_token=mygenie_token
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
            
            # CR-001: Push CRM token to MyGenie POS (first-time user)
            await register_crm_token_with_pos(
                client, mygenie_api_url, restaurant_id,
                api_key, mygenie_token, user_id
            )
            
            # CR-014: Sync tax/address fields from MyGenie profile (first-time user)
            await _sync_mygenie_profile_fields(user_id, user_doc, profile_data)
            refreshed_user = await db.users.find_one({"id": user_id}, {"_id": 0}) or user_doc

            # Create default loyalty settings (CR-001C-L-FIX: single helper)
            settings_doc = default_loyalty_settings(user_id)
            await db.loyalty_settings.insert_one(settings_doc)
            
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
                    created_at=now,
                    gstin=refreshed_user.get("gstin", ""),
                    legal_name=refreshed_user.get("legal_name", ""),
                    state=refreshed_user.get("state", ""),
                    address_line1=refreshed_user.get("address_line1", ""),
                    address_line2=refreshed_user.get("address_line2", ""),
                    city=refreshed_user.get("city", ""),
                    pincode=refreshed_user.get("pincode", ""),
                    fssai_license=refreshed_user.get("fssai_license", ""),
                    pan=refreshed_user.get("pan", ""),
                    vat_number=refreshed_user.get("vat_number", ""),
                ),
                pos_config=_build_pos_config(api_key),
                mygenie_token=mygenie_token
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
    
    # Fire reset_password WhatsApp trigger if configured
    if whatsapp_key:
        # Find customer by phone to get customer doc for template
        customer_phone = user.get("phone")
        if customer_phone:
            from core.whatsapp import trigger_whatsapp_event
            customer = await db.customers.find_one(
                {"user_id": user["id"], "phone": customer_phone}, {"_id": 0}
            )
            if not customer:
                customer = {
                    "name": user.get("restaurant_name", "User"),
                    "phone": customer_phone,
                    "country_code": "+91",
                }
            asyncio.create_task(trigger_whatsapp_event(
                db, user["id"], "reset_password", customer,
                {
                    "otp": otp,
                    "restaurant_name": user.get("restaurant_name", ""),
                    # CR-004 P3.5: no idempotency_key — owner can re-request OTPs freely
                    "reference_type": "customer",
                    "reference_id": customer.get("id"),
                }
            ))
    
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
