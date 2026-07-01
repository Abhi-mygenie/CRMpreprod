from fastapi import HTTPException, Depends, Header, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import os
import secrets
from .database import db

# JWT Config
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "type": "staff",
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_customer_token(customer_id: str, restaurant_id: str, phone: str) -> str:
    """Create JWT for scan-and-order customer. Includes type=customer claim."""
    payload = {
        "customer_id": customer_id,
        "restaurant_id": restaurant_id,
        "phone": phone,
        "type": "customer",
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def generate_api_key() -> str:
    """Generate a secure API key for POS integration"""
    return f"dp_live_{secrets.token_urlsafe(32)}"

async def verify_api_key(api_key: str):
    """Verify API key and return user"""
    user = await db.users.find_one({"api_key": api_key}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return user

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        # Reject customer tokens on staff endpoints
        if payload.get("type") == "customer":
            raise HTTPException(status_code=401, detail="Invalid token. Customer tokens cannot access staff endpoints.")
        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def verify_customer_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify customer JWT token. Returns {customer_id, restaurant_id, phone}."""
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "customer":
            raise HTTPException(status_code=401, detail="Invalid customer token")
        customer_id = payload.get("customer_id")
        restaurant_id = payload.get("restaurant_id")
        phone = payload.get("phone")
        if not customer_id or not restaurant_id:
            raise HTTPException(status_code=401, detail="Invalid customer token")
        return {"customer_id": customer_id, "restaurant_id": restaurant_id, "phone": phone}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid customer token")


async def verify_pos_auth(
    x_api_key: str = Header(None, alias="X-API-Key"),
    credentials: HTTPAuthorizationCredentials = Depends(optional_security)
):
    """
    Dual auth for POS endpoints: accepts API Key OR JWT Bearer token.
    API Key checked first (primary POS auth), then JWT fallback.
    Both resolve to the same restaurant user.
    """
    # Try API Key first
    if x_api_key:
        user = await db.users.find_one({"api_key": x_api_key}, {"_id": 0})
        if user:
            return user
        raise HTTPException(status_code=401, detail="Invalid API key")

    # Try JWT Bearer token
    if credentials:
        try:
            payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            if payload.get("type") == "customer":
                raise HTTPException(status_code=401, detail="Customer tokens cannot access POS endpoints")
            user_id = payload.get("user_id")
            if not user_id:
                raise HTTPException(status_code=401, detail="Invalid token")
            user = await db.users.find_one({"id": user_id}, {"_id": 0})
            if not user:
                raise HTTPException(status_code=401, detail="User not found")
            return user
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid token")

    raise HTTPException(status_code=401, detail="Authentication required. Provide X-API-Key header or Bearer token.")



# CR-001 / BUG-008: Push CRM API key to MyGenie POS as crm_token.
# Shared function — used by routers/auth.py (login) and routers/pos.py (regenerate).
import logging as _logging
_cr001_logger = _logging.getLogger("cr001")

async def register_crm_token_with_pos(
    client,
    mygenie_api_url: str,
    restaurant_id: str,
    api_key: str,
    mygenie_token: str,
    user_id: str
):
    """
    CR-001: Push CRM API key to MyGenie POS as crm_token.
    Fire-and-forget — never raises, never blocks login.
    Treats 2xx and 409 as success.
    Persists registration status on users doc.
    """
    if not restaurant_id or not api_key:
        _cr001_logger.warning(
            f"CR-001 skip: missing restaurant_id={restaurant_id} or api_key for user={user_id}"
        )
        return

    crm_token_endpoint = os.environ['MYGENIE_CRM_TOKEN_ENDPOINT']
    now = datetime.now(timezone.utc).isoformat()

    try:
        headers = {"Content-Type": "application/json"}
        if mygenie_token:
            headers["Authorization"] = f"Bearer {mygenie_token}"

        resp = await client.post(
            f"{mygenie_api_url}{crm_token_endpoint}",
            json={
                "restaurant_id": restaurant_id,
                "crm_token": api_key
            },
            headers=headers,
            timeout=10.0
        )

        success = 200 <= resp.status_code < 300 or resp.status_code == 409

        await db.users.update_one(
            {"id": user_id},
            {"$set": {
                "crm_token_registered_with_pos": success,
                "crm_token_registered_at": now,
                "pos_crm_token_response": {
                    "status_code": resp.status_code,
                    "body": resp.text[:500],
                    "timestamp": now
                }
            }}
        )

        if success:
            _cr001_logger.info(
                f"CR-001 OK: crm_token pushed for user={user_id} restaurant={restaurant_id} status={resp.status_code}"
            )
        else:
            _cr001_logger.warning(
                f"CR-001 FAIL: status={resp.status_code} body={resp.text[:200]} user={user_id}"
            )

    except Exception as e:
        _cr001_logger.error(f"CR-001 ERROR: {type(e).__name__}: {e} user={user_id}")
        try:
            await db.users.update_one(
                {"id": user_id},
                {"$set": {
                    "crm_token_registered_with_pos": False,
                    "crm_token_registered_at": now,
                    "pos_crm_token_response": {
                        "error": f"{type(e).__name__}: {str(e)[:300]}",
                        "timestamp": now
                    }
                }}
            )
        except Exception:
            pass  # Absolute last resort — never crash login
