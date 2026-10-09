from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, UploadFile, File, Request
from fastapi.staticfiles import StaticFiles  # kept for potential future use
from fastapi.responses import FileResponse, PlainTextResponse, JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import hashlib
import secrets
import jwt
import shutil
import asyncio
# CR-2026-09-12-004: rate-limit + security-header imports
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import re

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
# CR-2026-07-03-003 — explicit timeouts.
# Defaults were: serverSelectionTimeoutMS=30000 (caused 21:30 IST freeze),
# socketTimeoutMS=None (∞), waitQueueTimeoutMS=None (∞).
# retryReads/retryWrites are default-True on motor 3.x; set explicitly for clarity.
client = AsyncIOMotorClient(
    mongo_url,
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=5000,
    socketTimeoutMS=10000,
    waitQueueTimeoutMS=5000,
    retryReads=True,
    retryWrites=True,
    appname="customer-app-backend",
)
db = client[os.environ['DB_NAME']]

# JWT Config (CA-002 fix - removed weak fallback)
JWT_SECRET = os.environ.get('JWT_SECRET')
if not JWT_SECRET:
    raise ValueError("CRITICAL: JWT_SECRET environment variable must be set")
JWT_ALGORITHM = "HS256"

# BUG-2026-09-10-001: Emergent object storage removed — local disk used instead.

# MyGenie POS API base URL (DFA-002 fix: no fallback, fail fast)
MYGENIE_API_URL = os.environ.get("MYGENIE_API_URL")
if not MYGENIE_API_URL:
    raise ValueError("CRITICAL: MYGENIE_API_URL environment variable must be set")

# CR-2026-07-03-000: POS service credentials for token-issuance proxy.
# Server-side only — never bundled into the frontend.
POS_LOGIN_PHONE = os.environ.get("MYGENIE_POS_LOGIN_PHONE")
if not POS_LOGIN_PHONE:
    raise ValueError("CRITICAL: MYGENIE_POS_LOGIN_PHONE environment variable must be set")

POS_LOGIN_PASSWORD = os.environ.get("MYGENIE_POS_LOGIN_PASSWORD")
if not POS_LOGIN_PASSWORD:
    raise ValueError("CRITICAL: MYGENIE_POS_LOGIN_PASSWORD environment variable must be set")

# CR-2026-09-12-004: CORS fail-fast — refuse to start if wildcard+credentials combo
_cors_origins_raw = os.environ.get('CORS_ORIGINS', '*')
if '*' in _cors_origins_raw.split(',') and True:  # allow_credentials is always True below
    raise ValueError(
        "CRITICAL: CORS_ORIGINS='*' is not allowed when allow_credentials=True. "
        "Set CORS_ORIGINS to explicit origin(s) in backend/.env."
    )

# CR-2026-09-12-004: rate limiter (in-memory, single-worker)
limiter = Limiter(key_func=get_remote_address)

# Create the main app
app = FastAPI(title="Customer App API")
# CR-2026-09-12-004: attach limiter state and rate-limit exception handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Create routers
api_router = APIRouter(prefix="/api")
auth_router = APIRouter(prefix="/auth", tags=["Authentication"])
config_router = APIRouter(prefix="/config", tags=["Configuration"])
upload_router = APIRouter(prefix="/upload", tags=["Upload"])
dietary_router = APIRouter(prefix="/dietary-tags", tags=["Dietary Tags"])
diagnostics_router = APIRouter(prefix="/diagnostics", tags=["Diagnostics"])

# ============================================
# Models
# ============================================

class LoginRequest(BaseModel):
    phone_or_email: str
    password: Optional[str] = None

class LoginResponse(BaseModel):
    success: bool
    user_type: str  # "restaurant"
    token: str
    pos_token: Optional[str] = None  # POS API token for admin operations (QR, etc.)
    user: dict

class AppConfigUpdate(BaseModel):
    # Landing Page Visibility
    showLogo: Optional[bool] = None
    showWelcomeText: Optional[bool] = None
    showDescription: Optional[bool] = None
    showSocialIcons: Optional[bool] = None
    showTableNumber: Optional[bool] = None
    showPromotions: Optional[bool] = None
    showPoweredBy: Optional[bool] = None
    showCallWaiter: Optional[bool] = None
    showPayBill: Optional[bool] = None
    showLandingCallWaiter: Optional[bool] = None
    showLandingPayBill: Optional[bool] = None
    showAboutUs: Optional[bool] = None
    showFooter: Optional[bool] = None
    showLandingCustomerCapture: Optional[bool] = None  # Capture name/phone on landing
    # Menu Page Visibility
    showPromotionsOnMenu: Optional[bool] = None
    showCategories: Optional[bool] = None
    showMenuFab: Optional[bool] = None  # Menu FAB button on menu page
    # Order Page Visibility
    showCustomerDetails: Optional[bool] = None
    showCustomerName: Optional[bool] = None
    showCustomerPhone: Optional[bool] = None
    showCookingInstructions: Optional[bool] = None
    showSpecialInstructions: Optional[bool] = None
    showPriceBreakdown: Optional[bool] = None
    showTableInfo: Optional[bool] = None
    # Visibility toggles (missing from original model)
    showHamburgerMenu: Optional[bool] = None
    showLoginButton: Optional[bool] = None
    showEstimatedTimes: Optional[bool] = None
    showFoodStatus: Optional[bool] = None  # Food Item Status (Preparing/Ready/Served)
    # Branding - Colors
    logoUrl: Optional[str] = None
    backgroundImageUrl: Optional[str] = None
    mobileBackgroundImageUrl: Optional[str] = None
    primaryColor: Optional[str] = None
    secondaryColor: Optional[str] = None
    buttonTextColor: Optional[str] = None
    backgroundColor: Optional[str] = None
    textColor: Optional[str] = None
    textSecondaryColor: Optional[str] = None
    # Branding - Typography
    fontHeading: Optional[str] = None
    fontBody: Optional[str] = None
    # Branding - Style
    borderRadius: Optional[str] = None  # sharp, rounded, pill
    # Branding - Text
    welcomeMessage: Optional[str] = None
    tagline: Optional[str] = None
    # Order Success Page (admin-configurable; UI falls back to defaults when None/empty)
    successTitle: Optional[str] = None
    successMessage: Optional[str] = None
    instagramUrl: Optional[str] = None
    facebookUrl: Optional[str] = None
    twitterUrl: Optional[str] = None
    youtubeUrl: Optional[str] = None
    whatsappNumber: Optional[str] = None
    # Contact
    phone: Optional[str] = None
    # Content - About Us
    aboutUsContent: Optional[str] = None
    aboutUsImage: Optional[str] = None
    openingHours: Optional[str] = None
    # Content - Footer
    footerText: Optional[str] = None
    footerLinks: Optional[List[dict]] = None
    # Content - Contact
    address: Optional[str] = None
    contactEmail: Optional[str] = None
    mapEmbedUrl: Optional[str] = None
    # Content - Feedback
    feedbackEnabled: Optional[bool] = True
    feedbackIntroText: Optional[str] = None
    # Content - Custom Pages
    customPages: Optional[List[dict]] = None
    # Content - Nav Menu
    navMenuOrder: Optional[List[dict]] = None
    menuOrder: Optional[dict] = None
    # CR-2026-06-17-001 APP-4: Station timing admin overrides
    stationTimings: Optional[dict] = None  # { "stationId": { "start": "HH:MM", "end": "HH:MM" } }
    # CR-2026-06-17-001 APP-3: Channel override (dinein/takeaway/delivery) per category and item
    channelOverrides: Optional[dict] = None  # { "category": { "catId": { "dinein": bool } }, "item": { "itemId": { "dinein": bool } } }
    # Extra Info Section (Footer)
    showExtraInfo: Optional[bool] = None
    extraInfoItems: Optional[List[str]] = None  # Up to 5 bullet points
    # Order Page - Loyalty/Coupon/Wallet visibility
    showLoyaltyPoints: Optional[bool] = None
    showCouponCode: Optional[bool] = None
    showWallet: Optional[bool] = None
    # Custom Text
    browseMenuButtonText: Optional[str] = None
    # Customer Capture - Mandatory fields
    mandatoryCustomerName: Optional[bool] = None
    mandatoryCustomerPhone: Optional[bool] = None
    # Skip OTP / Password-Setup screen (CR-2026-05-30-001 Item 1)
    skipOtpDineIn: Optional[bool] = None
    skipOtpTakeaway: Optional[bool] = None
    skipOtpDelivery: Optional[bool] = None
    skipOtpDineInWithTable: Optional[bool] = None
    skipOtpWalkIn: Optional[bool] = None
    skipOtpRoomOrders: Optional[bool] = None
    # Non-QR order access policy (CR-2026-05-30-002)
    allowNonQrOrders: Optional[bool] = None
    # Restaurant Operating Shifts (up to 4)
    restaurantShifts: Optional[List[dict]] = None  # [{ "start": "07:00", "end": "11:00" }, ...]
    # Restaurant Open master toggle
    restaurantOpen: Optional[bool] = None
    # CR-2026-08-06-001: Per-channel shifts. None = fall back to restaurantShifts.
    deliveryShifts: Optional[List[dict]] = None
    takeawayShifts: Optional[List[dict]] = None
    dineInShifts: Optional[List[dict]] = None
    roomShifts: Optional[List[dict]] = None
    walkinShifts: Optional[List[dict]] = None
    # Category & Item Timings (admin overrides)
    categoryTimings: Optional[dict] = None  # { "catId": { "start": "07:00", "end": "11:00" } }
    itemTimings: Optional[dict] = None  # { "itemId": { "start": "08:00", "end": "10:00" } }
    # Payment Options Configuration (FEAT-001)
    codEnabled: Optional[bool] = None  # Show COD/Pay at Counter option
    onlinePaymentDinein: Optional[bool] = None  # Enable online payment for dine-in
    onlinePaymentTakeaway: Optional[bool] = None  # Enable online payment for takeaway
    onlinePaymentDelivery: Optional[bool] = None  # Enable online payment for delivery
    payOnlineLabel: Optional[str] = None  # Custom label for online payment (default: "Pay Online")
    payAtCounterLabel: Optional[str] = None  # Custom label for COD (default: "Pay at Counter")
    # Powered By Configuration (DFA-004)
    poweredByText: Optional[str] = None  # Custom "Powered by" text
    poweredByLogoUrl: Optional[str] = None  # Custom logo URL for powered-by footer
    # Notification Popups (FEAT-003)
    notificationPopups: Optional[List[dict]] = None  # [{enabled, showOn, delaySeconds, content:{title,message,...}, style:{position,type}}]

class BannerCreate(BaseModel):
    bannerImage: str
    bannerTitle: str
    bannerLink: Optional[str] = None
    bannerOrder: int = 0
    bannerEnabled: bool = True
    displayOn: str = "both"  # "both", "landing", "menu"

class BannerUpdate(BaseModel):
    bannerImage: Optional[str] = None
    bannerTitle: Optional[str] = None
    bannerLink: Optional[str] = None
    bannerOrder: Optional[int] = None
    bannerEnabled: Optional[bool] = None
    displayOn: Optional[str] = None

# ============================================
# Auth Helpers
# ============================================

def create_token(user_id: str, user_type: str) -> str:
    payload = {
        "user_id": user_id,
        "user_type": user_type,
        "exp": datetime.now(timezone.utc).timestamp() + (24 * 60 * 60)  # 24 hours
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# CR-2026-10-03-002: `users` is CRM-owned and its documents carry CRM's own integration
# secrets (`api_key`, `authkey_api_key`). Project to the fields we actually consume so
# they never enter our process memory or the /api/auth/me response.
# `mygenie_token` IS consumed (see get_table_config legacy fallback) so it stays —
# removing it is a behaviour change, tracked separately.
USERS_AUTH_PROJECTION = {
    "_id": 0, "id": 1, "email": 1, "phone": 1, "restaurant_id": 1,
    "pos_id": 1, "restaurant_name": 1, "pos_name": 1, "mygenie_token": 1,
}
USERS_LOGIN_PROJECTION = {**USERS_AUTH_PROJECTION, "password_hash": 1}


async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization header required")
    
    token = authorization.replace("Bearer ", "")
    payload = verify_token(token)
    
    user_id = payload.get("user_id")
    user_type = payload.get("user_type")
    
    user = await db.users.find_one({"id": user_id}, USERS_AUTH_PROJECTION)  # CR-2026-10-03-002
    
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    user["user_type"] = user_type
    return user

async def get_restaurant_user(authorization: str = Header(None)):
    user = await get_current_user(authorization)
    if user.get("user_type") != "restaurant":
        raise HTTPException(status_code=403, detail="Restaurant admin access required")
    return user

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Simple password verification"""
    import bcrypt
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

# ============================================
# POS Token Refresh Helper
# ============================================

async def refresh_pos_token(email: str, password: str) -> Optional[str]:
    """
    Call POS API vendoremployee login to get fresh POS token.
    Returns new token on success, None on failure.
    
    NOTE: Token is NOT stored in database - it's returned to frontend
    and stored in localStorage for admin operations (QR, etc.)
    """
    import httpx
    
    # DFA-002 fix: Use module-level MYGENIE_API_URL (no fallback)
    pos_api_url = MYGENIE_API_URL
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            # Use vendoremployee login endpoint with email field
            response = await http_client.post(
                f"{pos_api_url}/auth/vendoremployee/login",
                json={
                    "email": email,
                    "password": password
                },
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                # POS API returns token directly in response.token
                new_token = data.get("token")
                
                if new_token:
                    logging.info(f"[Auth] Got fresh POS token for {email}")
                    return new_token
            else:
                logging.warning(f"[Auth] POS vendoremployee login failed with status {response.status_code}: {response.text[:200]}")
                
    except Exception as e:
        logging.warning(f"[Auth] Failed to get POS token: {str(e)}")
    
    return None

# ============================================
# Auth Routes
# ============================================

@auth_router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")  # CR-2026-09-12-004: rate-limit
async def unified_login(request: Request, body: LoginRequest):
    """Restaurant admin login (password)."""
    identifier = body.phone_or_email.strip().lower()
    # Step 1: Check users collection (restaurant admins)
    user = await db.users.find_one({
        "$or": [
            {"email": identifier},
            {"phone": identifier}
        ]
    }, USERS_LOGIN_PROJECTION)  # CR-2026-10-03-002
    
    if user:
        # Restaurant user found - verify password
        if not body.password:
            raise HTTPException(status_code=400, detail="Password required for restaurant login")
        
        password_hash = user.get("password_hash")
        if not password_hash:
            raise HTTPException(status_code=401, detail="Password not set for this account")
        
        if not verify_password(body.password, password_hash):
            raise HTTPException(status_code=401, detail="Invalid password")
        
        # Refresh POS token on every login
        # This ensures pos_token is always fresh for POS API calls (QR, etc.)
        user_email = user.get("email", identifier)
        pos_token = await refresh_pos_token(user_email, body.password)
        if not pos_token:
            logging.warning(f"[Auth] Could not get POS token for {user_email}")
        
        token = create_token(user["id"], "restaurant")
        return LoginResponse(
            success=True,
            user_type="restaurant",
            token=token,
            pos_token=pos_token,  # Return POS token to frontend for localStorage
            user={
                "id": user["id"],
                "restaurant_id": user.get("restaurant_id", ""),
                "email": user.get("email", ""),
                "restaurant_name": user.get("restaurant_name", ""),
                "phone": user.get("phone", ""),
                "pos_id": user.get("pos_id", ""),
                "pos_name": user.get("pos_name", "")
            }
        )
    
    # Step 2: Not found
    raise HTTPException(status_code=404, detail="Account not found. Please contact restaurant.")

@auth_router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Get current user profile based on user type"""
    return {
        "user_type": user.get("user_type"),
        "user": user
    }

# CR-2026-07-03-000: Proxy endpoint so the frontend does not need to bundle POS creds.
# The frontend calls this instead of the POS /auth/login directly.
@api_router.post("/pos/auth-token")
@limiter.limit("5/minute")  # CR-2026-09-12-004: rate-limit
async def get_pos_auth_token(request: Request):
    """Issue a short-lived POS auth token.

    Server-side credentials (MYGENIE_POS_LOGIN_PHONE / _PASSWORD) log into the MyGenie
    POS /auth/login endpoint and the resulting token is returned to the caller.
    """
    import httpx

    # D-04(b): log count + IP only (no PII / no User-Agent)
    client_ip = request.client.host if request.client else "unknown"
    logger.info(f"[pos-auth-token] issuance requested from {client_ip}")

    try:
        async with httpx.AsyncClient(timeout=15.0) as http_client:
            resp = await http_client.post(
                f"{MYGENIE_API_URL}/auth/login",
                json={"phone": POS_LOGIN_PHONE, "password": POS_LOGIN_PASSWORD},
            )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("token"):
            raise HTTPException(status_code=502, detail="POS returned no token")
        return data
    except httpx.RequestError as exc:
        logger.error(f"[pos-auth-token] POS unreachable: {exc}")
        raise HTTPException(status_code=502, detail="POS auth service unreachable")
    except httpx.HTTPStatusError as exc:
        logger.error(f"[pos-auth-token] POS rejected login: {exc.response.status_code}")
        raise HTTPException(status_code=502, detail="POS auth service rejected credentials")


# Air BnB router for order details (Edit Order feature)
air_bnb_router = APIRouter(prefix="/air-bnb", tags=["Air BnB"])

@air_bnb_router.get("/get-order-details/{order_id}")
async def get_order_details(order_id: str):
    """Get order details from MyGenie API"""
    import httpx
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{MYGENIE_API_URL}/air-bnb/get-order-details/{order_id}",
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                return response.json()
            elif response.status_code == 404:
                raise HTTPException(status_code=404, detail=f"Order {order_id} not found")
            else:
                raise HTTPException(status_code=response.status_code, detail="Failed to fetch order details from MyGenie")
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"MyGenie API unavailable: {str(e)}")

@api_router.get("/table-config")
async def get_table_config(
    user: dict = Depends(get_restaurant_user),
    x_pos_token: Optional[str] = Header(None, alias="X-POS-Token")
):
    """Fetch table/room config from POS API using POS token from header"""
    import httpx
    from urllib.parse import unquote, urlparse

    # Use token from header (preferred) or fallback to db.users (legacy)
    mygenie_token = x_pos_token or user.get("mygenie_token")
    if not mygenie_token:
        raise HTTPException(status_code=400, detail="No POS token provided. Please logout and login again.")

    # Derive v2 base URL from MYGENIE_API_URL (replace /api/v1 with /api/v2)
    base_url = MYGENIE_API_URL.replace("/api/v1", "")
    url = f"{base_url}/api/v2/vendoremployee/restaurant-settings/table-config"

    try:
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            response = await http_client.get(
                url,
                headers={
                    "accept": "application/json",
                    "authorization": f"Bearer {mygenie_token}",
                },
            )

            if response.status_code == 401:
                raise HTTPException(
                    status_code=401, 
                    detail="POS session expired. Please logout and login again to refresh your session."
                )
            elif response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="POS API error")

            data = response.json()
            if not data.get("success"):
                raise HTTPException(status_code=502, detail="POS API returned an error")

            pos_data = data.get("data", {})
            all_items = pos_data.get("tables", [])

            # Extract subdomain from the first table's Normal QR URL
            subdomain = ""
            for item in all_items:
                normal_url = (item.get("qr_code_urls") or {}).get("Normal", "")
                if normal_url:
                    decoded = unquote(normal_url)
                    # Pattern: ...data=https://subdomain/rid?...
                    if "data=" in decoded:
                        target = decoded.split("data=")[1].split("?")[0]
                        parsed = urlparse(target)
                        subdomain = parsed.hostname or ""
                    break

            tables = [t for t in all_items if t.get("rtype") == "TB"]
            rooms = [t for t in all_items if t.get("rtype") == "RM"]

            return {
                "tables": tables,
                "rooms": rooms,
                "subdomain": subdomain,
                "restaurant_id": pos_data.get("restaurant_id"),
                "restaurant_name": pos_data.get("restaurant_name"),
            }

    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"POS API unavailable: {str(e)}")

# ============================================
# Config Routes (Admin)
# ============================================

@config_router.get("/{restaurant_id}")
async def get_app_config(restaurant_id: str):
    """Get app configuration for a restaurant (public endpoint)"""
    config = await db.customer_app_config.find_one(
        {"restaurant_id": restaurant_id},
        {"_id": 0}
    )
    
    if not config:
        # Return defaults - everything visible
        return {
            "restaurant_id": restaurant_id,
            # Landing Page
            "showLogo": True,
            "showWelcomeText": False,
            "showDescription": False,
            "showSocialIcons": False,
            "showTableNumber": True,
            "showPromotions": True,
            "showPoweredBy": True,
            "showCallWaiter": False,
            "showPayBill": False,
            "showLandingCallWaiter": False,
            "showLandingPayBill": False,
            "showAboutUs": True,
            "showFooter": True,
            "showLandingCustomerCapture": False,  # Default OFF - restaurant opts in
            "showHamburgerMenu": True,
            "showLoginButton": False,
            "showEstimatedTimes": False,  # Default OFF
            "showFoodStatus": True,  # Default ON - show Preparing/Ready/Served
            "showOrderStatusTracker": False,  # Order Status Progress Bar
            # Menu Page
            "showPromotionsOnMenu": False,
            "showCategories": True,
            "showMenuFab": True,  # Menu FAB button
            # Order Page
            "showCustomerDetails": False,
            "showCustomerName": False,
            "showCustomerPhone": True,
            "showCookingInstructions": True,
            "showSpecialInstructions": True,
            "showPriceBreakdown": True,
            "showTableInfo": True,
            "showLoyaltyPoints": True,
            "showCouponCode": False,
            "showWallet": False,
            # Branding - Colors
            "logoUrl": None,
            "primaryColor": "#E8531E",
            "secondaryColor": "#2E7D32",
            "buttonTextColor": "#FFFFFF",
            "backgroundColor": "#FFFFFF",
            "textColor": "#333333",
            "textSecondaryColor": "#666666",
            # Branding - Typography
            "fontHeading": "Montserrat",
            "fontBody": "Montserrat",
            # Branding - Style
            "borderRadius": "rounded",
            # Branding - Text
            "welcomeMessage": "Welcome!",
            "tagline": None,
            "instagramUrl": None,
            "facebookUrl": None,
            "twitterUrl": None,
            "youtubeUrl": None,
            "whatsappNumber": None,
            "phone": None,
            "aboutUsContent": None,
            "aboutUsImage": None,
            "openingHours": None,
            "footerText": None,
            "footerLinks": [],
            "address": None,
            "contactEmail": None,
            "mapEmbedUrl": None,
            "feedbackEnabled": False,
            "feedbackIntroText": None,
            "customPages": [],
            "navMenuOrder": [
                {"id": "home", "label": "Home", "type": "builtin", "visible": True},
                {"id": "menu", "label": "Menu", "type": "builtin", "visible": True},
                {"id": "about", "label": "About Us", "type": "builtin", "visible": False},
                {"id": "contact", "label": "Contact", "type": "builtin", "visible": False},
                {"id": "feedback", "label": "Feedback", "type": "builtin", "visible": False},
                {"id": "login", "label": "Login", "type": "builtin", "visible": False}
            ],
            "banners": [],
            # Extra Info Section
            "showExtraInfo": True,
            "extraInfoItems": [],
            # Customer Capture - Mandatory fields
            "mandatoryCustomerName": False,
            "mandatoryCustomerPhone": False,
            # Restaurant Operating Shifts
            "restaurantShifts": [{"start": "06:00", "end": "03:00"}],
            # Restaurant Open master toggle (default open)
            "restaurantOpen": True,
            # CR-2026-08-06-001: Per-channel shifts — None = use global fallback
            "deliveryShifts": None,
            "takeawayShifts": None,
            "dineInShifts": None,
            "roomShifts": None,
            "walkinShifts": None,
            # Category & Item Timings
            "categoryTimings": {},
            "itemTimings": {},
            # Payment Options Configuration (FEAT-001)
            "codEnabled": False,  # Default OFF - restaurant opts in
            "onlinePaymentDinein": True,  # Default ON if Razorpay configured
            "onlinePaymentTakeaway": True,
            "onlinePaymentDelivery": True,
            "payOnlineLabel": "Pay Online",
            "payAtCounterLabel": "Pay at Counter",
            # Powered By Configuration (DFA-004)
            "poweredByText": "Powered by",
            "poweredByLogoUrl": "/assets/images/mygenie_logo.svg",
            # Notification Popups (FEAT-003)
            "notificationPopups": [],
        }
    
    return config

@config_router.put("/")
async def update_app_config(
    config_update: AppConfigUpdate,
    user: dict = Depends(get_restaurant_user)
):
    """Update app configuration (restaurant admin only)"""
    # Use restaurant_id as the primary key for config
    # This matches what the frontend uses to fetch config (from URL)
    config_key = user.get("restaurant_id") or user["id"]
    
    # CR-2026-08-06-001: channel shift fields must be allowed through even when null
    # (null = admin clearing the field, reverting to global shifts fallback).
    # All other fields keep the existing `if v is not None` guard.
    NULLABLE_CHANNEL_FIELDS = {'deliveryShifts', 'takeawayShifts', 'dineInShifts', 'roomShifts', 'walkinShifts'}
    update_dict = {
        k: v for k, v in config_update.model_dump().items()
        if v is not None or k in NULLABLE_CHANNEL_FIELDS
    }
    
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.customer_app_config.update_one(
        {"restaurant_id": config_key},
        {"$set": update_dict, "$setOnInsert": {"restaurant_id": config_key, "banners": []}},
        upsert=True
    )
    
    config = await db.customer_app_config.find_one({"restaurant_id": config_key}, {"_id": 0})
    return {"success": True, "config": config}

@config_router.post("/banners")
async def create_banner(
    banner: BannerCreate,
    user: dict = Depends(get_restaurant_user)
):
    """Add a new banner (restaurant admin only)"""
    restaurant_id = user.get("restaurant_id") or user["id"]
    
    banner_doc = {
        "id": str(uuid.uuid4()),
        **banner.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.customer_app_config.update_one(
        {"restaurant_id": restaurant_id},
        {
            "$push": {"banners": banner_doc},
            "$setOnInsert": {"restaurant_id": restaurant_id}
        },
        upsert=True
    )
    
    return {"success": True, "banner": banner_doc}

@config_router.put("/banners/{banner_id}")
async def update_banner(
    banner_id: str,
    banner_update: BannerUpdate,
    user: dict = Depends(get_restaurant_user)
):
    """Update a banner (restaurant admin only)"""
    restaurant_id = user.get("restaurant_id") or user["id"]
    
    update_dict = {f"banners.$.{k}": v for k, v in banner_update.model_dump().items() if v is not None}
    
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    result = await db.customer_app_config.update_one(
        {"restaurant_id": restaurant_id, "banners.id": banner_id},
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Banner not found")
    
    return {"success": True, "message": "Banner updated"}

@config_router.delete("/banners/{banner_id}")
async def delete_banner(
    banner_id: str,
    user: dict = Depends(get_restaurant_user)
):
    """Delete a banner (restaurant admin only)"""
    restaurant_id = user.get("restaurant_id") or user["id"]
    
    result = await db.customer_app_config.update_one(
        {"restaurant_id": restaurant_id},
        {"$pull": {"banners": {"id": banner_id}}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Banner not found")
    
    return {"success": True, "message": "Banner deleted"}

# ============================================
# Feedback Routes — removed
# ============================================
# CR-2026-10-03-003: feedback moved to CRM POST /scan/feedback (contract §4c, CRM CR-096).
# Feedback model + POST /config/feedback + GET /config/feedback/{rid} deleted — zero callers.

# ============================================
# Custom Pages Routes
# ============================================

class CustomPageCreate(BaseModel):
    title: str
    slug: str
    content: str
    published: bool = False

class CustomPageUpdate(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    content: Optional[str] = None
    published: Optional[bool] = None

@config_router.post("/pages")
async def create_custom_page(
    page_data: CustomPageCreate,
    user: dict = Depends(get_restaurant_user)
):
    restaurant_id = user.get("restaurant_id") or user["id"]
    page_doc = {
        "id": str(uuid.uuid4()),
        "title": page_data.title,
        "slug": page_data.slug,
        "content": page_data.content,
        "published": page_data.published,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.customer_app_config.update_one(
        {"restaurant_id": restaurant_id},
        {"$push": {"customPages": page_doc}, "$setOnInsert": {"restaurant_id": restaurant_id}},
        upsert=True
    )
    return {"success": True, "page": page_doc}

@config_router.put("/pages/{page_id}")
async def update_custom_page(
    page_id: str,
    page_update: CustomPageUpdate,
    user: dict = Depends(get_restaurant_user)
):
    restaurant_id = user.get("restaurant_id") or user["id"]
    update_dict = {f"customPages.$.{k}": v for k, v in page_update.model_dump().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.customer_app_config.update_one(
        {"restaurant_id": restaurant_id, "customPages.id": page_id},
        {"$set": update_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Page not found")
    return {"success": True}

@config_router.delete("/pages/{page_id}")
async def delete_custom_page(
    page_id: str,
    user: dict = Depends(get_restaurant_user)
):
    restaurant_id = user.get("restaurant_id") or user["id"]
    result = await db.customer_app_config.update_one(
        {"restaurant_id": restaurant_id},
        {"$pull": {"customPages": {"id": page_id}}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Page not found")
    return {"success": True}

# ============================================
# Upload Routes
# ============================================

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
MIME_MAP = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
            "gif": "image/gif", "webp": "image/webp", "svg": "image/svg+xml"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB

@upload_router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    user: dict = Depends(get_restaurant_user)
):
    """Upload an image file to local disk (restaurant admin only). Max 5MB."""
    # BUG-2026-09-10-001: local disk replaces Emergent object storage
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type {ext} not allowed. Use: {', '.join(ALLOWED_EXTENSIONS)}")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Max 5MB.")

    filename = f"{uuid.uuid4().hex}{ext}"
    uploads_dir = ROOT_DIR / "uploads"
    uploads_dir.mkdir(exist_ok=True)

    try:
        (uploads_dir / filename).write_bytes(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")

    url = f"/api/upload/image/{filename}"
    return {"success": True, "url": url, "filename": filename}

@upload_router.get("/image/{filename}")
async def serve_upload(filename: str):
    """Serve an uploaded image from local disk."""
    # BUG-2026-09-10-001: local disk replaces Emergent object storage
    file_path = ROOT_DIR / "uploads" / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    ext = Path(filename).suffix.lower().lstrip(".")
    content_type = MIME_MAP.get(ext, "application/octet-stream")
    from fastapi.responses import Response
    return Response(content=file_path.read_bytes(), media_type=content_type)

# ============================================
# Legacy Routes (Keep existing functionality)
# ============================================

class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

@api_router.get("/")
async def root():
    return {"message": "Customer App API"}

@api_router.get("/healthz")
async def healthz():
    """
    Liveness + Mongo reachability probe.
    CR-2026-07-03-003 — used by LB / uptime monitoring to detect DB outages
    (like the 2026-07-02 21:30 IST incident) and stop shipping traffic to
    unhealthy pods before the connection pool tips over. Never blocks
    longer than ~2 s regardless of client config.
    """
    try:
        await asyncio.wait_for(db.command("ping"), timeout=2.0)
        return {"ok": True, "mongo": "up"}
    except asyncio.TimeoutError:
        return JSONResponse(
            status_code=503,
            content={"ok": False, "mongo": "timeout"},
        )
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"ok": False, "mongo": "error", "detail": str(e)[:200]},
        )

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks

# ============================================
# CR-2026-10-03-004 Part B: loyalty-settings route deleted — loyalty_settings collection boundary closed.
# CR-2026-10-03-004 Part C: customer-lookup route deleted — F2=(a), customers collection boundary closed.

# ============================================
# Dietary Tags Routes
# ============================================

# Available dietary tags (global configuration)
AVAILABLE_DIETARY_TAGS = [
    {"id": "jain", "label": "Jain", "icon": "🙏"},
    {"id": "vegan", "label": "Vegan", "icon": "🌱"},
    {"id": "gluten-free", "label": "Gluten-Free", "icon": "🌾"},
    {"id": "lactose-free", "label": "Lactose-Free", "icon": "🥛"},
    {"id": "nut-free", "label": "Nut-Free", "icon": "🥜"},
    {"id": "halal", "label": "Halal", "icon": "☪️"},
    {"id": "sugar-free", "label": "Sugar-Free", "icon": "🍬"},
    {"id": "high-protein", "label": "High Protein", "icon": "💪"},
]

class DietaryTagsMapping(BaseModel):
    mappings: dict  # {item_id: [tag_ids]}

@dietary_router.get("/available")
async def get_available_dietary_tags():
    """Get list of all available dietary tags"""
    return {"tags": AVAILABLE_DIETARY_TAGS}

@dietary_router.get("/{restaurant_id}")
async def get_dietary_tags(restaurant_id: str):
    """Get dietary tag mappings for a restaurant"""
    doc = await db.dietary_tags_mapping.find_one(
        {"restaurant_id": restaurant_id},
        {"_id": 0}
    )
    
    if doc:
        return {
            "restaurant_id": restaurant_id,
            "mappings": doc.get("mappings", {}),
            "updated_at": doc.get("updated_at")
        }
    
    return {
        "restaurant_id": restaurant_id,
        "mappings": {},
        "updated_at": None
    }

@dietary_router.put("/{restaurant_id}")
async def update_dietary_tags(
    restaurant_id: str,
    data: DietaryTagsMapping,
    authorization: str = Header(None)
):
    """Update dietary tag mappings for a restaurant (admin only)"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization required")
    
    try:
        token = authorization.replace("Bearer ", "")
        payload = verify_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # Update or insert the mapping
    await db.dietary_tags_mapping.update_one(
        {"restaurant_id": restaurant_id},
        {
            "$set": {
                "restaurant_id": restaurant_id,
                "mappings": data.mappings,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": payload.get("sub")
            }
        },
        upsert=True
    )
    
    return {"success": True, "message": "Dietary tags updated successfully"}

# ============================================
# CR-2026-05-30-002 — Non-QR block diagnostics
# ============================================

class NonQrBlockEvent(BaseModel):
    """Client-side diagnostic event for a non-QR policy decision (block or allow)."""
    restaurant_id: str
    checkpoint: str  # 'landing' | 'add_to_cart' | 'place_order'
    scanned_room_or_table: Optional[str] = None  # 'table' | 'room' | 'walkin' | None
    final_table_id: Optional[str] = "0"
    is_edit_mode: bool = False
    is_authenticated: bool = False
    # BUG-2026-10-06-001: allow-path events carry the policy reason
    decision: Optional[str] = Field(default=None, max_length=40)
    allowed: bool = False


NON_QR_BLOCKS_COLLECTION = "non_qr_blocks"
NON_QR_BLOCKS_PER_RID_LIMIT = 200   # allowed == False (incl. legacy docs without the field)
NON_QR_ALLOWS_PER_RID_LIMIT = 1000  # BUG-2026-10-06-001 D4(b): separate bucket for allow events
_NON_QR_INDEX_READY = False


async def _ensure_non_qr_indexes():
    """Idempotent. Creates the indexes we rely on for the rolling cap."""
    global _NON_QR_INDEX_READY
    if _NON_QR_INDEX_READY:
        return
    try:
        await db[NON_QR_BLOCKS_COLLECTION].create_index(
            [("restaurant_id", 1), ("ts", -1)],
            name="rid_ts_desc",
        )
        _NON_QR_INDEX_READY = True
    except Exception as exc:
        logging.getLogger(__name__).warning("non_qr_blocks index creation skipped: %s", exc)


@diagnostics_router.post("/non-qr-block", status_code=204)
async def non_qr_block(event: NonQrBlockEvent, request: Request):
    """Record a non-QR block event. Fire-and-forget; returns 204 always."""
    await _ensure_non_qr_indexes()

    xff = request.headers.get("x-forwarded-for") or ""
    client_ip = xff.split(",")[0].strip() if xff else (
        request.client.host if request.client else None
    )

    doc = {
        "_id": str(uuid.uuid4()),
        "restaurant_id": str(event.restaurant_id),
        "checkpoint": event.checkpoint,
        "scanned_room_or_table": event.scanned_room_or_table,
        "final_table_id": event.final_table_id or "0",
        "is_edit_mode": bool(event.is_edit_mode),
        "is_authenticated": bool(event.is_authenticated),
        "decision": event.decision,
        "allowed": bool(event.allowed),  # BUG-2026-10-06-001
        "client_ip": client_ip,
        "user_agent": request.headers.get("user-agent"),
        "referer": request.headers.get("referer"),
        "ts": datetime.now(timezone.utc).isoformat(),
    }

    try:
        await db[NON_QR_BLOCKS_COLLECTION].insert_one(doc)

        # BUG-2026-10-06-001 D4(b): cap each bucket separately so allow events
        # cannot evict block history. Legacy docs (no `allowed`) count as blocks.
        bucket_filter = (
            {"restaurant_id": doc["restaurant_id"], "allowed": True}
            if doc["allowed"]
            else {"restaurant_id": doc["restaurant_id"], "allowed": {"$ne": True}}
        )
        limit = NON_QR_ALLOWS_PER_RID_LIMIT if doc["allowed"] else NON_QR_BLOCKS_PER_RID_LIMIT
        count = await db[NON_QR_BLOCKS_COLLECTION].count_documents(bucket_filter)
        if count > limit:
            excess = count - limit
            cursor = (
                db[NON_QR_BLOCKS_COLLECTION]
                .find(bucket_filter, {"_id": 1})
                .sort("ts", 1)
                .limit(excess)
            )
            stale_ids = [d["_id"] async for d in cursor]
            if stale_ids:
                await db[NON_QR_BLOCKS_COLLECTION].delete_many({"_id": {"$in": stale_ids}})
    except Exception as exc:
        logging.getLogger(__name__).warning("non_qr_block insert failed: %s", exc)
        # Still return 204 — diagnostics must never break the FE.

    return None

# ============================================
# Include all routers
# ============================================

api_router.include_router(auth_router)
api_router.include_router(config_router)
api_router.include_router(upload_router)
api_router.include_router(air_bnb_router)  # Add air-bnb router
api_router.include_router(dietary_router)  # Add dietary tags router
api_router.include_router(diagnostics_router)  # CR-2026-05-30-002

# ============================================
# Documentation Endpoints (must be before app.include_router)
# ============================================

@api_router.get("/docs/bug-tracker")
async def get_bug_tracker():
    """View the BUG_TRACKER.md file in browser"""
    file_path = Path("/app/memory/BUG_TRACKER.md")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Bug tracker file not found")
    content = file_path.read_text()
    return PlainTextResponse(content, media_type="text/plain; charset=utf-8")

@api_router.get("/docs/api-mapping")
async def get_api_mapping():
    """View the API_MAPPING.md file in browser"""
    file_path = Path("/app/memory/API_MAPPING.md")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="API mapping file not found")
    content = file_path.read_text()
    return PlainTextResponse(content, media_type="text/plain; charset=utf-8")

@api_router.get("/docs/code-audit")
async def get_code_audit():
    """View the CODE_AUDIT.md file in browser"""
    file_path = Path("/app/memory/CODE_AUDIT.md")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Code audit file not found")
    content = file_path.read_text()
    return PlainTextResponse(content, media_type="text/plain; charset=utf-8")

@api_router.get("/docs/prd")
async def get_prd():
    """View the PRD.md file in browser"""
    file_path = Path("/app/memory/PRD.md")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="PRD file not found")
    content = file_path.read_text()
    return PlainTextResponse(content, media_type="text/plain; charset=utf-8")

@api_router.get("/docs/roadmap")
async def get_roadmap():
    """View the ROADMAP.md file in browser"""
    file_path = Path("/app/memory/ROADMAP.md")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="ROADMAP file not found")
    content = file_path.read_text()
    return PlainTextResponse(content, media_type="text/plain; charset=utf-8")

@api_router.get("/docs/architecture")
async def get_architecture():
    """View the ARCHITECTURE.md file in browser"""
    file_path = Path("/app/memory/ARCHITECTURE.md")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="ARCHITECTURE file not found")
    content = file_path.read_text()
    return PlainTextResponse(content, media_type="text/plain; charset=utf-8")

@api_router.get("/docs/changelog")
async def get_changelog():
    """View the CHANGELOG_TRANSFORM_V1.md file in browser"""
    file_path = Path("/app/memory/CHANGELOG_TRANSFORM_V1.md")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="CHANGELOG file not found")
    content = file_path.read_text()
    return PlainTextResponse(content, media_type="text/plain; charset=utf-8")

@api_router.get("/docs/ownership-board")
async def get_ownership_board():
    """INV-2026-09-15-002: interactive shared-DB ownership board (HTML)"""
    file_path = Path("/app/memory/change_requests/INV-2026-09-15-002-shared-db-collection-ownership-map/OWNERSHIP_BOARD.html")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Ownership board file not found")
    return FileResponse(file_path, media_type="text/html")

@api_router.get("/docs/test-cases")
async def get_test_cases():
    """View the TEST_CASES.md file in browser"""
    file_path = Path("/app/memory/TEST_CASES.md")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="TEST_CASES file not found")
    content = file_path.read_text()
    return PlainTextResponse(content, media_type="text/plain; charset=utf-8")

# CR-2026-09-12-004: security headers + request-id middleware
@app.middleware("http")
async def security_and_request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    response = await call_next(request)
    # Security headers (D-004-5)
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(self), microphone=(), camera=()"
    response.headers["X-Request-ID"] = request_id
    return response

# CR-2026-09-12-004: global 500 handler (D-004-6)
@app.exception_handler(Exception)
async def global_500_handler(request: Request, exc: Exception):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    logger.error(f"Unhandled exception [request_id={request_id}]: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "type": type(exc).__name__,
                "message": "An unexpected error occurred."
            },
            "request_id": request_id
        }
    )

app.include_router(api_router)

# CR-2026-09-12-004: CORS hybrid allow-list (D-004-1 — static list + optional regex)
_cors_origins = [o.strip() for o in os.environ.get('CORS_ORIGINS', '').split(',') if o.strip()]
_cors_origin_regex = os.environ.get('CORS_ORIGIN_REGEX', None) or None
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_origin_regex,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

@app.on_event("startup")
async def startup_event():
    # BUG-2026-09-10-001: ensure uploads dir exists on startup
    (ROOT_DIR / "uploads").mkdir(exist_ok=True)
    logger.info("Uploads directory ready")
