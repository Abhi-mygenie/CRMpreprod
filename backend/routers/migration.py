from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from datetime import datetime, timezone, timedelta
from typing import Optional, List
import httpx
import os
import uuid
import asyncio
import logging

from core.database import db
from core.auth import get_current_user
from core.helpers import _coerce_pos_id, _pos_id_query_variants
from core.loyalty import calculate_points as _calc_points, calculate_tier as _calc_tier

logger = logging.getLogger("order_sync")

router = APIRouter(prefix="/migration", tags=["Migration"])

# In-memory sync status tracking (kept as fast-read cache; F9 persists to DB)
sync_status = {}


# CR-001B-fix Phase 2A F9 helpers — persistent migration_sync_logs
async def _log_sync_progress(log_id: str, fields: dict):
    """Persist progress fields to migration_sync_logs. Best-effort, never raises."""
    try:
        await db.migration_sync_logs.update_one({"id": log_id}, {"$set": fields})
    except Exception:
        logger.exception("migration_sync_logs update_failed log_id=%s", log_id)


async def _push_failed_record(log_id: str, record: dict):
    """Append a failed_records entry, capped at 100 entries. Best-effort, never raises."""
    try:
        await db.migration_sync_logs.update_one(
            {"id": log_id, "failed_records.99": {"$exists": False}},
            {"$push": {"failed_records": record}},
        )
    except Exception:
        logger.exception("migration_sync_logs push_failed_record_error log_id=%s", log_id)


async def background_order_sync(user_id: str, mygenie_token: str):
    """Background task to sync orders with pagination"""
    mygenie_api_url = os.getenv("MYGENIE_API_URL", "https://preprod.mygenie.online")
    order_list_endpoint = f"{mygenie_api_url}/api/v1/vendoremployee/whatsappcrm/customer-order-migration"
    
    now = datetime.now(timezone.utc).isoformat()
    synced_count = 0
    updated_count = 0
    failed_count = 0  # CR-001B-fix Phase 2A F8: per-record failure counter
    total_orders = 0
    
    # CR-001B-fix Phase 2A F9: insert persistent log row at sync start
    log_id = str(uuid.uuid4())
    log_doc = {
        "id": log_id,
        "user_id": user_id,
        "sync_type": "order_sync",
        "status": "running",
        "started_at": now,
        "completed_at": None,
        "total_records": 0,
        "synced_count": 0,
        "updated_count": 0,
        "failed_count": 0,
        "current_page": 0,
        "total_pages": 0,
        "error": None,
        "failed_records": [],
        "created_at": now,
    }
    try:
        await db.migration_sync_logs.insert_one(log_doc)
    except Exception:
        logger.exception("migration_sync_logs insert_failed user_id=%s sync_type=order_sync", user_id)
    
    sync_status[user_id] = {
        "status": "running",
        "current_page": 0,
        "total_pages": 0,
        "synced": 0,
        "updated": 0,
        "failed_count": 0,
        "total_orders": 0,
        "started_at": now,
        "error": None,
        "log_id": log_id,
        "sync_type": "order_sync",
    }

    # ============================================================
    # CR-001C-L Phase L3 (D2 + Q-LB1 Option C, 2026-05-22)
    # ============================================================
    # D2: Block order-sync if loyalty_settings doc is missing. Owner must
    #     configure Loyalty Settings (master toggle + tier thresholds +
    #     expiry_months) BEFORE migration runs.
    # Q-LB1 Option C (REVISED 2026-05-23 — CR-001C-L LF-MERGE):
    #   The "Loyalty Program" master toggle (`loyalty_enabled`) now drives
    #   BOTH realtime POS earning AND migration clean-slate recompute.
    #   The previous hidden flag `loyalty_clean_slate_recalc` is deprecated
    #   and no longer read (it remains in the schema for backward compat;
    #   any value sitting on existing Mongo docs is ignored).
    #   When loyalty_enabled=True  → use shared `core.loyalty.calculate_points`
    #                                 per order, $inc total_points +
    #                                 total_points_earned, recompute tier
    #                                 inline, pre-mark expired rows,
    #                                 dedup on re-sync.
    #   When loyalty_enabled=False → legacy behavior preserved verbatim
    #                                 (no points written by migration;
    #                                 visits + spend grow only).
    loyalty_settings = await db.loyalty_settings.find_one(
        {"user_id": user_id}, {"_id": 0}
    )
    if not loyalty_settings:
        err_msg = (
            "Migration blocked: loyalty_settings doc not found for this "
            "restaurant. Configure Loyalty Settings (master toggle + earn "
            "percents + tier thresholds + expiry_months) before triggering "
            "order sync. See CR-001C-L blueprint D2."
        )
        sync_status[user_id]["status"] = "failed"
        sync_status[user_id]["error"] = err_msg
        await _log_sync_progress(log_id, {
            "status": "failed",
            "error": err_msg,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        })
        return

    loyalty_enabled_flag = bool(loyalty_settings.get("loyalty_enabled", False))
    # CR-001C-L LF-MERGE (2026-05-23): clean_slate now derives from loyalty_enabled.
    clean_slate = loyalty_enabled_flag
    expiry_months = int(loyalty_settings.get("points_expiry_months", 6) or 0)
    
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
                    # F9: persist failure
                    await _log_sync_progress(log_id, {
                        "status": "failed",
                        "error": f"API error on page {page}: {resp.status_code}",
                        "completed_at": datetime.now(timezone.utc).isoformat(),
                        "synced_count": synced_count,
                        "updated_count": updated_count,
                        "failed_count": failed_count,
                    })
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
                
                for i, mygenie_order in enumerate(order_list):
                    # CR-001B-fix Phase 2A F8: per-record try/except so one bad order doesn't kill the loop
                    try:
                        user_obj = mygenie_order.get("user") or {}
                        # CR-001B-fix Phase 2B F5: normalise pos_customer_id to str
                        pos_customer_id = _coerce_pos_id(mygenie_order.get("user_id"))
                        cust_mobile = user_obj.get("phone", "")
                        cust_name = f"{user_obj.get('f_name', '')} {user_obj.get('l_name', '')}".strip()
                        cust_email = user_obj.get("email", "")
                        
                        employee_obj = mygenie_order.get("vendorEmployee") or {}
                        employee_name = f"{employee_obj.get('f_name', '')} {employee_obj.get('l_name', '')}".strip()
                        
                        # CR-001B-fix Phase 2B F3: normalise pos_order_id to str; lookup with $in to match legacy int rows
                        pos_order_id = _coerce_pos_id(mygenie_order.get("id"))
                        pos_order_id_variants = _pos_id_query_variants(mygenie_order.get("id"))
                        if pos_order_id_variants:
                            existing_order = await db.orders.find_one({
                                "user_id": user_id,
                                "pos_order_id": {"$in": pos_order_id_variants},
                            })
                        else:
                            existing_order = None
                        
                        customer = None
                        # CR-001B-fix Phase 2B F5: customer lookup uses $in to match legacy int rows
                        if pos_customer_id:
                            pos_customer_variants = _pos_id_query_variants(pos_customer_id)
                            customer = await db.customers.find_one({
                                "user_id": user_id,
                                "pos_customer_id": {"$in": pos_customer_variants},
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
                                # CR-001B-fix Phase 2B F4: normalise pos_food_id to str
                                "pos_food_id": _coerce_pos_id(food_details.get("id")),
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
                            
                            # CR-001B-fix F12: Refresh order_items on re-sync (dedup)
                            await db.order_items.delete_many({"order_id": existing_order["id"]})
                            if order_doc["items"]:
                                order_items_docs = []
                                for item in order_doc["items"]:
                                    order_items_docs.append({
                                        "id": str(uuid.uuid4()),
                                        "order_id": existing_order["id"],
                                        "customer_id": customer["id"] if customer else None,
                                        "user_id": user_id,
                                        **item,
                                        "created_at": now,
                                    })
                                if order_items_docs:
                                    await db.order_items.insert_many(order_items_docs)
                        else:
                            order_doc["id"] = str(uuid.uuid4())
                            order_doc["created_at"] = mygenie_order.get("created_at", now)
                            await db.orders.insert_one(order_doc)
                            synced_count += 1
                            
                            if customer:
                                order_date = mygenie_order.get("created_at") or now
                                order_amount = float(mygenie_order.get("order_amount") or 0)

                                # ============================================================
                                # CR-001C-L Phase L3 (C1-mig + C2 + C3 + D1 + dedup, 2026-05-22)
                                # ============================================================
                                # Gated entirely on `clean_slate`. When False, legacy behavior
                                # preserved: no points written by migration; visits + spend grow.
                                # When True AND loyalty_enabled=True: per-order recalc using
                                # the shared helper; running tier evolution; expiry pre-mark.
                                if clean_slate and loyalty_enabled_flag:
                                    # Re-sync dedup guard: skip if an `earn` row for this order
                                    # already exists (idempotency / Q19).
                                    existing_tx = await db.points_transactions.find_one({
                                        "user_id": user_id,
                                        "order_id": order_doc["id"],
                                        "transaction_type": "earn",
                                    })
                                    if not existing_tx:
                                        pts = _calc_points(order_amount, customer, loyalty_settings)
                                        points_earned = pts["total_points"]

                                        if points_earned > 0:
                                            # D1: pre-mark expired if order_date older than expiry_months.
                                            points_expired = False
                                            expired_at = None
                                            if expiry_months and order_date:
                                                try:
                                                    od_dt = datetime.fromisoformat(
                                                        order_date.replace("Z", "+00:00")
                                                    )
                                                    # CR-001C-L BUG-L3-001 fix (2026-05-23):
                                                    # MyGenie returns naive ISO strings (e.g.
                                                    # "2025-10-04 15:31:22"). Comparing a naive
                                                    # datetime with `cutoff` (tz-aware UTC) raises
                                                    # TypeError, which was previously swallowed by
                                                    # an over-broad except, leaving rows that should
                                                    # have been pre-marked silently un-marked.
                                                    # Coerce to UTC if no tzinfo, then compare.
                                                    if od_dt.tzinfo is None:
                                                        od_dt = od_dt.replace(tzinfo=timezone.utc)
                                                    cutoff = datetime.now(timezone.utc) - timedelta(
                                                        days=expiry_months * 30
                                                    )
                                                    if od_dt < cutoff:
                                                        points_expired = True
                                                        expired_at = od_dt.isoformat()
                                                except ValueError:
                                                    # CR-001C-L BUG-L3-001 fix (2026-05-23):
                                                    # narrowed from (ValueError, TypeError) so that
                                                    # future tz/comparison bugs surface instead of
                                                    # being silently swallowed.
                                                    pass

                                            # Persist points_earned + off_peak_bonus on the order doc.
                                            await db.orders.update_one(
                                                {"id": order_doc["id"]},
                                                {"$set": {
                                                    "points_earned": points_earned,
                                                    "off_peak_bonus": pts.get("off_peak_bonus", 0),
                                                }},
                                            )

                                            # Per-order earn tx with ORIGINAL date + expiry pre-mark.
                                            points_tx_doc = {
                                                "id": str(uuid.uuid4()),
                                                "user_id": user_id,
                                                "customer_id": customer["id"],
                                                "order_id": order_doc["id"],
                                                "transaction_type": "earn",
                                                "points": points_earned,
                                                "description": f"Earned on order {pos_order_id} (migration recalc)",
                                                "balance_after": None,
                                                "created_at": order_date,
                                                "points_expired": points_expired,
                                                "expired_at": expired_at,
                                            }
                                            await db.points_transactions.insert_one(points_tx_doc)

                                            # Customer counter $inc + tier recompute (running evolution).
                                            new_total_visits = (customer.get("total_visits", 0) or 0) + 1
                                            new_total_spent = (customer.get("total_spent", 0) or 0) + order_amount
                                            new_total_points = (customer.get("total_points", 0) or 0) + (
                                                points_earned if not points_expired else 0
                                            )
                                            new_total_points_earned = (
                                                customer.get("total_points_earned", 0) or 0
                                            ) + points_earned
                                            new_tier = _calc_tier(new_total_points, loyalty_settings)
                                            new_avg = (
                                                round(new_total_spent / new_total_visits, 2)
                                                if new_total_visits else 0
                                            )

                                            await db.customers.update_one(
                                                {"id": customer["id"]},
                                                {
                                                    "$set": {
                                                        "total_points": new_total_points,
                                                        "total_points_earned": new_total_points_earned,
                                                        "tier": new_tier,
                                                        "total_visits": new_total_visits,
                                                        "total_spent": new_total_spent,
                                                        "avg_order_value": new_avg,
                                                    },
                                                    "$max": {"last_visit": order_date},
                                                },
                                            )

                                            # Mutate in-memory `customer` so subsequent orders for the
                                            # same customer in the same batch see the evolved tier.
                                            customer["total_points"] = new_total_points
                                            customer["total_points_earned"] = new_total_points_earned
                                            customer["total_visits"] = new_total_visits
                                            customer["total_spent"] = new_total_spent
                                            customer["tier"] = new_tier
                                        else:
                                            # points_earned == 0 (e.g. order_amount < min_order_value)
                                            # — still grow visits + spend.
                                            await db.customers.update_one(
                                                {"id": customer["id"]},
                                                {
                                                    "$inc": {
                                                        "total_visits": 1,
                                                        "total_spent": order_amount,
                                                    },
                                                    "$max": {"last_visit": order_date},
                                                },
                                            )
                                            customer["total_visits"] = (customer.get("total_visits", 0) or 0) + 1
                                            customer["total_spent"] = (customer.get("total_spent", 0) or 0) + order_amount
                                    # else: existing tx found -> re-sync; skip silently.
                                else:
                                    # clean_slate=False (legacy) OR clean_slate=True but
                                    # loyalty_enabled=False (kill-switch). Either way: no
                                    # points writes. Still grow visits + spend.
                                    await db.customers.update_one(
                                        {"id": customer["id"]},
                                        {
                                            "$inc": {
                                                "total_visits": 1,
                                                "total_spent": order_amount,
                                            },
                                            "$max": {"last_visit": order_date},
                                        },
                                    )

                                # ============================================================
                                # Coupon migration writes — preserved under LEGACY only.
                                # Q-LOYALTY-5: coupon historical data not migrated under
                                # clean-slate; deferred to CR-001C-C.
                                # ============================================================
                                if not clean_slate:
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
                                            "created_at": order_date or now,
                                        }
                                        await db.coupon_transactions.insert_one(coupon_tx_doc)
                                        await db.customers.update_one(
                                            {"id": customer["id"]},
                                            {"$inc": {"total_coupon_used": 1}},
                                        )
                            
                            # CR-001B-fix F2: Always write order_items (no customer gate)
                            if order_doc["items"]:
                                order_items_docs = []
                                for item in order_doc["items"]:
                                    order_items_docs.append({
                                        "id": str(uuid.uuid4()),
                                        "order_id": order_doc["id"],
                                        "customer_id": customer["id"] if customer else None,
                                        "user_id": user_id,
                                        **item,
                                        "created_at": now,
                                    })
                                if order_items_docs:
                                    await db.order_items.insert_many(order_items_docs)
                    except Exception as record_err:
                        # CR-001B-fix Phase 2A F8: isolate record failure, continue loop
                        failed_count += 1
                        logger.exception(
                            "order_sync record_failed user_id=%s page=%s idx=%s pos_order_id=%s",
                            user_id, page, i, mygenie_order.get("id"),
                        )
                        await _push_failed_record(log_id, {
                            "pos_id": str(mygenie_order.get("id")) if mygenie_order.get("id") is not None else None,
                            "page": page,
                            "index": i,
                            "error": str(record_err)[:500],
                            "ts": datetime.now(timezone.utc).isoformat(),
                        })
                        continue
                
                # Update progress after each page (in-memory + persistent F9)
                sync_status[user_id]["synced"] = synced_count
                sync_status[user_id]["updated"] = updated_count
                sync_status[user_id]["failed_count"] = failed_count
                await _log_sync_progress(log_id, {
                    "current_page": page,
                    "total_pages": last_page,
                    "total_records": total_orders,
                    "synced_count": synced_count,
                    "updated_count": updated_count,
                    "failed_count": failed_count,
                })
                
                page += 1
            
            # Update last sync timestamp
            await db.users.update_one(
                {"id": user_id},
                {"$set": {"last_order_sync_at": now}}
            )
            
            completed_at = datetime.now(timezone.utc).isoformat()
            sync_status[user_id]["status"] = "completed"
            sync_status[user_id]["completed_at"] = completed_at
            # CR-001B-fix Phase 2A F9: persist final completed state
            await _log_sync_progress(log_id, {
                "status": "completed",
                "completed_at": completed_at,
                "synced_count": synced_count,
                "updated_count": updated_count,
                "failed_count": failed_count,
            })
            
    except Exception as e:
        logger.exception(
            "order_sync background_task_failed user_id=%s synced=%s updated=%s failed=%s",
            user_id, synced_count, updated_count, failed_count,
        )
        sync_status[user_id]["status"] = "failed"
        sync_status[user_id]["error"] = str(e)
        # CR-001B-fix Phase 2A F9: persist failure to DB
        await _log_sync_progress(log_id, {
            "status": "failed",
            "error": str(e)[:1000],
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "synced_count": synced_count,
            "updated_count": updated_count,
            "failed_count": failed_count,
        })


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
    
    # CR-001B-fix Phase 2A/3 — surface latest sync log breakdown so the UI can
    # explain the "X / Y synced" gap (POS duplicates merged via F11 dedup vs failed records).
    async def _latest_breakdown(sync_type: str):
        log = await db.migration_sync_logs.find_one(
            {"user_id": user["id"], "sync_type": sync_type, "status": {"$in": ["completed", "interrupted"]}},
            {"_id": 0, "failed_records": 0},
            sort=[("started_at", -1)],
        )
        if not log:
            return None
        return {
            "status": log.get("status"),
            "total_from_pos": log.get("total_records", 0),
            "new_synced": log.get("synced_count", 0),
            "duplicates_merged": log.get("updated_count", 0),
            "failed": log.get("failed_count", 0),
            "completed_at": log.get("completed_at"),
        }

    customer_breakdown = await _latest_breakdown("customer_sync")
    order_breakdown = await _latest_breakdown("order_sync")

    return {
        "migration_confirmed": migration_confirmed,
        "migration_confirmed_at": user_record.get("migration_confirmed_at") if migration_confirmed else None,
        "migration_skipped_permanently": user_record.get("migration_skipped_permanently", False),
        "customers_synced": customers_count,
        "orders_synced": orders_count,
        "total_customers_in_pos": user_record.get("total_customers_in_pos", 0),
        "total_orders_in_pos": user_record.get("total_orders_in_pos", 0),
        "last_customer_sync": user_record.get("last_customer_sync_at"),
        "last_order_sync": user_record.get("last_order_sync_at"),
        "customer_sync_breakdown": customer_breakdown,
        "order_sync_breakdown": order_breakdown,
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
    
    # CR-001B-fix F1: Block order sync until customer sync has completed at least once
    if not user_record.get("last_customer_sync_at"):
        return {
            "success": False,
            "message": "Customer sync must complete before order sync. Please sync customers first."
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
    """Get current order sync progress.

    CR-001B-fix Phase 2A F9: in-memory dict is the primary fast-read; if it is empty
    (e.g. after backend restart), fall back to the latest persisted entry in
    `migration_sync_logs` so the owner still sees the last known sync state.
    """
    user_id = user["id"]

    if user_id in sync_status:
        return sync_status[user_id]

    latest = await db.migration_sync_logs.find_one(
        {"user_id": user_id, "sync_type": "order_sync"},
        {"_id": 0},
        sort=[("started_at", -1)],
    )
    if latest:
        return latest

    return {
        "status": "idle",
        "message": "No sync in progress"
    }


