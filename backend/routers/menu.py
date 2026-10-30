"""Menu proxy endpoints — fetches items and categories from MyGenie API.

Uses the restaurant owner's stored `mygenie_token` for authentication.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
import httpx
import os
import logging

from core.database import db
from core.auth import get_current_user

router = APIRouter(prefix="/menu", tags=["Menu Proxy"])
logger = logging.getLogger(__name__)

MYGENIE_API_URL = os.environ['MYGENIE_API_URL']


async def _get_mygenie_token(user: dict, request: Request = None) -> str:
    # CR-008: Try session header first (freshest), fall back to DB.
    if request is not None:
        header_token = request.headers.get("X-MyGenie-Token")
        if header_token:
            return header_token
    user_record = await db.users.find_one({"id": user["id"]}, {"mygenie_token": 1})
    token = (user_record or {}).get("mygenie_token")
    if not token:
        raise HTTPException(status_code=401, detail="MyGenie token not found. Please re-login.")
    return token


@router.get("/items")
async def get_menu_items(request: Request, user: dict = Depends(get_current_user)):
    token = await _get_mygenie_token(user, request)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{MYGENIE_API_URL}/api/v1/vendoremployee/get-products-list",
                params={"limit": 500, "offset": 1, "type": "all"},
                headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()
            products = data.get("products", [])
            return {
                "total": data.get("total_size", len(products)),
                "items": [
                    {
                        "food_id": str(p["id"]),
                        "name": p.get("name", ""),
                        "price": p.get("price", 0),
                        "category_id": str(p.get("category_id", "")),
                        "veg": bool(p.get("veg")),
                        "status": p.get("status", 0),
                        "item_code": p.get("item_code"),
                        "image": p.get("image"),
                    }
                    for p in products
                ],
            }
    except httpx.HTTPStatusError as e:
        logger.warning("Menu items fetch failed: %s", e)
        raise HTTPException(status_code=e.response.status_code, detail="Failed to fetch menu items from MyGenie")
    except Exception as e:
        logger.warning("Menu items fetch error: %s", e)
        raise HTTPException(status_code=502, detail="Menu service unavailable")


@router.get("/categories")
async def get_menu_categories(request: Request, user: dict = Depends(get_current_user)):
    token = await _get_mygenie_token(user, request)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{MYGENIE_API_URL}/api/v1/vendoremployee/get-categories",
                headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            )
            resp.raise_for_status()
            cats = resp.json()
            return {
                "total": len(cats),
                "categories": [
                    {
                        "id": str(c["id"]),
                        "name": c.get("name", ""),
                        "status": c.get("status", 0),
                    }
                    for c in cats
                    if c.get("status") == 1
                ],
            }
    except httpx.HTTPStatusError as e:
        logger.warning("Categories fetch failed: %s", e)
        raise HTTPException(status_code=e.response.status_code, detail="Failed to fetch categories from MyGenie")
    except Exception as e:
        logger.warning("Categories fetch error: %s", e)
        raise HTTPException(status_code=502, detail="Category service unavailable")
