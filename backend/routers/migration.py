from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from datetime import datetime, timezone
from typing import Optional, List
import httpx
import os
import uuid
import asyncio

from core.database import db
from core.auth import get_current_user

router = APIRouter(prefix="/migration", tags=["Migration"])

# In-memory sync status tracking
sync_status = {}

async def background_order_sync(user_id: str, mygenie_token: str):
    """Background task to sync orders with pagination"""
    mygenie_api_url = os.getenv("MYGENIE_API_URL", "https://preprod.mygenie.online")
    order_list_endpoint = f"{mygenie_api_url}/api/v1/vendoremployee/whatsappcrm/customer-order-migration"
    
    now = datetime.now(timezone.utc).isoformat()
    synced_count = 0
    updated_count = 0
    total_orders = 0
    
    sync_status[user_id] = {
        "status": "running",
        "current_page": 0,
        "total_pages": 0,
        "synced": 0,
        "updated": 0,
        "total_orders": 0,
        "started_at": now,
        "error": None
    }
    
    try:
        async with httpx.AsyncClient() as client:
            page = 1
            last_page = 1
            
            while page <= last_page:
                resp = await client.post(
                    f"{order_list_endpoint}?page={page}",
                    headers={
                        "Authorization": f"Bearer {mygenie_token}",
                        "Content-Type": "application/json; charset=UTF-8",
                        "X-localization": "en"
                    },
                    json={},
                    timeout=60.0
                )
                
                if resp.status_code != 200:
                    sync_status[user_id]["status"] = "failed"
                    sync_status[user_id]["error"] = f"API error on page {page}: {resp.status_code}"
                    return
                
                data = resp.json()
                last_page = data.get("last_page", 1)
                total_orders = data.get("total_orders", 0)
                order_list = data.get("orders", [])
                
                # Update progress
                sync_status[user_id]["current_page"] = page
                sync_status[user_id]["total_pages"] = last_page
                sync_status[user_id]["total_orders"] = total_orders
                
                # Store total from POS in user record (only on first page)
                if page == 1:
                    await db.users.update_one(
                        {"id": user_id},
                        {"$set": {"total_orders_in_pos": total_orders}}
                    )
                
                for mygenie_order in order_list:
                    user_obj = mygenie_order.get("user") or {}
                    pos_customer_id = mygenie_order.get("user_id")
                    cust_mobile = user_obj.get("phone", "")
                    cust_name = f"{user_obj.get('f_name', '')} {user_obj.get('l_name', '')}".strip()
                    cust_email = user_obj.get("email", "")
                    
                    employee_obj = mygenie_order.get("vendorEmployee") or {}
                    employee_name = f"{employee_obj.get('f_name', '')} {employee_obj.get('l_name', '')}".strip()
                    
                    pos_order_id = mygenie_order.get("id")
                    existing_order = await db.orders.find_one({
                        "user_id": user_id,
                        "pos_order_id": pos_order_id
                    })
                    
                    customer = None
                    if pos_customer_id:
                        customer = await db.customers.find_one({
                            "user_id": user_id,
                            "pos_customer_id": pos_customer_id
                        })
                    
                    if not customer and cust_mobile:
                        customer = await db.customers.find_one({
                            "user_id": user_id,
                            "phone": cust_mobile
                        })
                    
                    order_doc = {
                        "user_id": user_id,
                        "customer_id": customer["id"] if customer else None,
                        "pos_id": "mygenie",
                        "pos_restaurant_id": mygenie_order.get("restaurant_id"),
                        "pos_order_id": pos_order_id,
                        "restaurant_order_id": mygenie_order.get("restaurant_order_id"),
                        "pos_customer_id": pos_customer_id,
                        "cust_mobile": cust_mobile,
                        "cust_name": cust_name,
                        "cust_email": cust_email,
                        "order_amount": float(mygenie_order.get("order_amount") or 0),
                        "delivery_charge": float(mygenie_order.get("delivery_charge") or 0),
                        "coupon_code": mygenie_order.get("coupon_code"),
                        "coupon_discount": float(mygenie_order.get("coupon_discount_amount") or mygenie_order.get("coupon_discount") or 0),
                        "payment_method": mygenie_order.get("payment_method"),
                        "payment_status": mygenie_order.get("payment_status"),
                        "order_status": mygenie_order.get("order_status"),
                        "order_type": mygenie_order.get("order_type"),
                        "table_id": mygenie_order.get("table_id"),
                        "waiter_id": mygenie_order.get("waiter_id"),
                        "employee_id": mygenie_order.get("employee_id"),
                        "employee_name": employee_name,
                        "print_kot": mygenie_order.get("print_kot"),
                        "print_bill_status": mygenie_order.get("print_bill_status"),
                        "order_notes": mygenie_order.get("order_note"),
                        "order_created_at": mygenie_order.get("created_at"),
                        "order_updated_at": mygenie_order.get("updated_at"),
                        "items": [],
                        "mygenie_synced": True,
                        "last_synced_at": now,
                        "points_earned": 0,
                        "off_peak_bonus": 0,
                    }
                    
                    order_details = mygenie_order.get("orderDetails", [])
                    for item in order_details:
                        food_details = item.get("food_details") or {}
                        order_doc["items"].append({
                            "item_name": food_details.get("name", f"Item {food_details.get('id')}"),
                            "pos_food_id": food_details.get("id"),
                            "item_category": food_details.get("category_id"),
                            "item_qty": item.get("quantity", 1),
                            "item_price": float(item.get("price") or item.get("unit_price") or 0),
                            "variation": item.get("variation", []),
                            "add_ons": item.get("add_ons", []),
                            "station": item.get("station"),
                            "item_type": item.get("item_type"),
                            "item_notes": item.get("food_level_notes"),
                            "is_veg": food_details.get("veg"),
                            "tax": food_details.get("tax"),
                            "tax_type": food_details.get("tax_type"),
                            "food_status": item.get("food_status"),
                            "ready_at": item.get("ready_at"),
                            "serve_at": item.get("serve_at"),
                            "cancel_at": item.get("cancel_at"),
                        })
                        
                        if not order_doc.get("restaurant_name") and food_details.get("restaurant_name"):
                            order_doc["restaurant_name"] = food_details.get("restaurant_name")
                    
                    if existing_order:
                        await db.orders.update_one(
                            {"id": existing_order["id"]},
                            {"$set": order_doc}
                        )
                        updated_count += 1
                    else:
                        order_doc["id"] = str(uuid.uuid4())
                        order_doc["created_at"] = mygenie_order.get("created_at", now)
                        await db.orders.insert_one(order_doc)
                        synced_count += 1
                        
                        if customer:
                            order_date = mygenie_order.get("created_at")
                            order_amount = float(mygenie_order.get("order_amount") or 0)
                            
                            # Get loyalty settings for points calculation
                            loyalty_settings = await db.loyalty_settings.find_one({"user_id": user_id})
                            earn_percent = 0
                            if loyalty_settings and loyalty_settings.get("loyalty_enabled"):
                                earn_percent = loyalty_settings.get("earn_percent", 0)
                            
                            # Calculate points earned
                            points_earned = int(order_amount * earn_percent / 100) if earn_percent > 0 else 0
                            
                            # Update order with points_earned
                            if points_earned > 0:
                                await db.orders.update_one(
                                    {"id": order_doc["id"]},
                                    {"$set": {"points_earned": points_earned}}
                                )
                                
                                # Create points_transaction record
                                points_tx_doc = {
                                    "id": str(uuid.uuid4()),
                                    "user_id": user_id,
                                    "customer_id": customer["id"],
                                    "order_id": order_doc["id"],
                                    "transaction_type": "earn",
                                    "points": points_earned,
                                    "description": f"Points earned from order (synced from MyGenie)",
                                    "created_at": order_date or now
                                }
                                await db.points_transactions.insert_one(points_tx_doc)
                            
                            # Create coupon_transaction if coupon was used
                            coupon_discount = order_doc.get("coupon_discount", 0)
                            coupon_code = order_doc.get("coupon_code")
                            if coupon_discount > 0 or coupon_code:
                                coupon_tx_doc = {
                                    "id": str(uuid.uuid4()),
                                    "user_id": user_id,
                                    "customer_id": customer["id"],
                                    "order_id": order_doc["id"],
                                    "coupon_code": coupon_code,
                                    "discount_amount": coupon_discount,
                                    "description": "Coupon used (synced from MyGenie)",
                                    "created_at": order_date or now
                                }
                                await db.coupon_transactions.insert_one(coupon_tx_doc)
                                
                                # Update customer total_coupon_used
                                await db.customers.update_one(
                                    {"id": customer["id"]},
                                    {"$inc": {"total_coupon_used": 1}}
                                )
                            
                            # Update customer stats including points
                            update_fields = {
                                "$inc": {"total_visits": 1, "total_spent": order_amount, "total_points": points_earned},
                                "$max": {"last_visit": order_date}
                            }
                            await db.customers.update_one(
                                {"id": customer["id"]},
                                update_fields
                            )
                        
                        if order_doc["items"] and customer:
                            order_items_docs = []
                            for item in order_doc["items"]:
                                order_items_docs.append({
                                    "id": str(uuid.uuid4()),
                                    "order_id": order_doc["id"],
                                    "customer_id": customer["id"],
                                    "user_id": user_id,
                                    **item,
                                    "created_at": now,
                                })
                            if order_items_docs:
                                await db.order_items.insert_many(order_items_docs)
                
                # Update progress after each page
                sync_status[user_id]["synced"] = synced_count
                sync_status[user_id]["updated"] = updated_count
                
                page += 1
            
            # Update last sync timestamp
            await db.users.update_one(
                {"id": user_id},
                {"$set": {"last_order_sync_at": now}}
            )
            
            sync_status[user_id]["status"] = "completed"
            sync_status[user_id]["completed_at"] = datetime.now(timezone.utc).isoformat()
            
    except Exception as e:
        sync_status[user_id]["status"] = "failed"
        sync_status[user_id]["error"] = str(e)


@router.get("/status")
async def get_migration_status(user: dict = Depends(get_current_user)):
    """
    Get the current migration status for the user
    Returns sync counts and confirmation status
    Auto-resets migration flags if all data is cleared
    """
    user_record = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    
    # Count synced data
    customers_count = await db.customers.count_documents({
        "user_id": user["id"],
        "mygenie_synced": True
    })
    
    orders_count = await db.orders.count_documents({
        "user_id": user["id"],
        "mygenie_synced": True
    })
    
    # Auto-reset migration flags if all data is cleared
    migration_confirmed = user_record.get("migration_confirmed", False)
    if migration_confirmed and customers_count == 0 and orders_count == 0:
        # Data was cleared, reset migration flags
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {
                "migration_confirmed": False,
                "migration_confirmed_at": None,
                "total_customers_in_pos": 0,
                "total_orders_in_pos": 0,
                "last_customer_sync_at": None,
                "last_order_sync_at": None
            }}
        )
        migration_confirmed = False
        user_record["total_customers_in_pos"] = 0
        user_record["total_orders_in_pos"] = 0
    
    return {
        "migration_confirmed": migration_confirmed,
        "migration_confirmed_at": user_record.get("migration_confirmed_at") if migration_confirmed else None,
        "migration_skipped_permanently": user_record.get("migration_skipped_permanently", False),
        "customers_synced": customers_count,
        "orders_synced": orders_count,
        "total_customers_in_pos": user_record.get("total_customers_in_pos", 0),
        "total_orders_in_pos": user_record.get("total_orders_in_pos", 0),
        "last_customer_sync": user_record.get("last_customer_sync_at"),
        "last_order_sync": user_record.get("last_order_sync_at")
    }


@router.post("/skip-permanently")
async def skip_migration_permanently(user: dict = Depends(get_current_user)):
    """
    User chooses to never show migration overlay again
    """
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"migration_skipped_permanently": True}}
    )
    
    return {
        "success": True,
        "message": "Migration skipped permanently"
    }


@router.post("/confirm")
async def confirm_migration(user: dict = Depends(get_current_user)):
    """
    Confirm the migration - marks sync as complete
    After confirmation, the migration section will be hidden
    """
    now = datetime.now(timezone.utc).isoformat()
    
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "migration_confirmed": True,
            "migration_confirmed_at": now
        }}
    )
    
    return {
        "success": True,
        "message": "Migration confirmed successfully",
        "confirmed_at": now
    }


@router.post("/revert")
async def revert_migration(user: dict = Depends(get_current_user)):
    """
    Revert the migration - deletes all synced customers and orders
    Allows user to sync again from scratch
    """
    # Delete synced customers (only those marked as mygenie_synced)
    customers_result = await db.customers.delete_many({
        "user_id": user["id"],
        "mygenie_synced": True
    })
    
    # Delete synced orders
    orders_result = await db.orders.delete_many({
        "user_id": user["id"],
        "mygenie_synced": True
    })
    
    # Delete related order_items
    await db.order_items.delete_many({
        "user_id": user["id"]
    })
    
    # Delete related points_transactions from synced orders
    await db.points_transactions.delete_many({
        "user_id": user["id"],
        "description": {"$regex": "synced from MyGenie", "$options": "i"}
    })
    
    # Reset migration status
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "migration_confirmed": False,
            "migration_confirmed_at": None,
            "last_customer_sync_at": None,
            "last_order_sync_at": None
        }}
    )
    
    return {
        "success": True,
        "message": "Migration reverted successfully",
        "customers_deleted": customers_result.deleted_count,
        "orders_deleted": orders_result.deleted_count
    }


@router.post("/revert-customers")
async def revert_customers(user: dict = Depends(get_current_user)):
    """
    Revert only synced customers - keeps orders intact
    Blocked if synced orders exist (must revert orders first)
    """
    # Check if synced orders exist - cannot revert customers while orders depend on them
    orders_count = await db.orders.count_documents({
        "user_id": user["id"],
        "mygenie_synced": True
    })
    
    if orders_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot revert customers while {orders_count} synced orders exist. Please revert orders first."
        )
    
    # Delete synced customers (only those marked as mygenie_synced)
    customers_result = await db.customers.delete_many({
        "user_id": user["id"],
        "mygenie_synced": True
    })
    
    # Reset customer sync timestamp
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"last_customer_sync_at": None}}
    )
    
    return {
        "success": True,
        "message": "Customers reverted successfully",
        "customers_deleted": customers_result.deleted_count
    }


@router.post("/revert-orders")
async def revert_orders(user: dict = Depends(get_current_user)):
    """
    Revert only synced orders - keeps customers intact
    """
    # Delete synced orders
    orders_result = await db.orders.delete_many({
        "user_id": user["id"],
        "mygenie_synced": True
    })
    
    # Delete related order_items
    await db.order_items.delete_many({
        "user_id": user["id"]
    })
    
    # Reset order sync timestamp
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"last_order_sync_at": None}}
    )
    
    return {
        "success": True,
        "message": "Orders reverted successfully",
        "orders_deleted": orders_result.deleted_count
    }


@router.post("/sync-orders")
async def sync_orders_from_mygenie(background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    """
    Start background order sync from MyGenie POS API.
    Returns immediately and syncs in background.
    Use /migration/sync-orders/status to check progress.
    """
    user_id = user["id"]
    
    # Check if sync is already running
    if user_id in sync_status and sync_status[user_id].get("status") == "running":
        return {
            "success": False,
            "message": "Sync already in progress",
            "status": sync_status[user_id]
        }
    
    # Get user's MyGenie token
    user_record = await db.users.find_one({"id": user_id})
    mygenie_token = user_record.get("mygenie_token") if user_record else None
    
    if not mygenie_token:
        return {
            "success": False,
            "message": "MyGenie token not found. Please login with MyGenie credentials first."
        }
    
    # Start background sync
    background_tasks.add_task(background_order_sync, user_id, mygenie_token)
    
    return {
        "success": True,
        "message": "Order sync started in background. Check /migration/sync-orders/status for progress.",
        "status": "started"
    }


@router.get("/sync-orders/status")
async def get_order_sync_status(user: dict = Depends(get_current_user)):
    """Get current order sync progress"""
    user_id = user["id"]
    
    if user_id not in sync_status:
        return {
            "status": "idle",
            "message": "No sync in progress"
        }
    
    return sync_status[user_id]


