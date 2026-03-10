from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import uuid
import os
import httpx

from core.database import db
from core.auth import get_current_user
from core.helpers import generate_qr_code, build_customer_query
from models.schemas import (
    Customer, CustomerCreate, CustomerUpdate,
    Segment, SegmentCreate, SegmentUpdate
)

router = APIRouter(prefix="/customers", tags=["Customers"])

# In-memory customer sync status tracking
customer_sync_status = {}

async def background_customer_sync(user_id: str, mygenie_token: str):
    """Background task to sync customers"""
    mygenie_api_url = os.getenv("MYGENIE_API_URL", "https://preprod.mygenie.online")
    
    now = datetime.now(timezone.utc).isoformat()
    synced_count = 0
    updated_count = 0
    total_customers = 0
    
    customer_sync_status[user_id] = {
        "status": "running",
        "synced": 0,
        "updated": 0,
        "total_customers": 0,
        "started_at": now,
        "error": None
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{mygenie_api_url}/api/v1/vendoremployee/whatsappcrm/customer-migration",
                headers={
                    "Authorization": f"Bearer {mygenie_token}",
                    "Content-Type": "application/json; charset=UTF-8",
                    "X-localization": "en"
                },
                json={},
                timeout=60.0
            )
            
            if response.status_code != 200:
                customer_sync_status[user_id]["status"] = "failed"
                customer_sync_status[user_id]["error"] = f"API error: {response.status_code}"
                return
            
            data = response.json()
            customer_list = data.get("customers", [])
            total_customers = data.get("total_customers", len(customer_list))
            customer_sync_status[user_id]["total_customers"] = total_customers
            
            # Store total from POS in user record
            await db.users.update_one(
                {"id": user_id},
                {"$set": {"total_customers_in_pos": total_customers}}
            )
            
            for i, mygenie_customer in enumerate(customer_list):
                customer_data = {
                    "user_id": user_id,
                    "name": mygenie_customer.get("name") or "Unknown",
                    "phone": mygenie_customer.get("phone") or "",
                    "country_code": mygenie_customer.get("country_code") or "+91",
                    "email": mygenie_customer.get("email") or f"customer{mygenie_customer['id']}@mygenie.local",
                    "dob": mygenie_customer.get("dob"),
                    "anniversary": mygenie_customer.get("anniversary"),
                    "gst_name": mygenie_customer.get("gst_name"),
                    "gst_number": mygenie_customer.get("gst_number"),
                    # Points - loyalty_point is int, others are strings
                    "total_points": mygenie_customer.get("loyalty_point", 0),
                    "total_points_earned": int(mygenie_customer.get("total_points_earned") or 0),
                    "total_points_redeemed": int(mygenie_customer.get("total_points_redeemed") or 0),
                    # Wallet - wallet_balance is int, others are strings
                    "wallet_balance": float(mygenie_customer.get("wallet_balance") or 0),
                    "total_wallet_received": float(mygenie_customer.get("total_wallet_received") or 0),
                    "total_wallet_used": float(mygenie_customer.get("total_wallet_used") or 0),
                    # Coupons
                    "total_coupon_used": mygenie_customer.get("total_coupon_used", 0),
                    # POS IDs
                    "pos_customer_id": mygenie_customer["id"],
                    "pos_id": mygenie_customer.get("pos_id"),
                    "pos_restaurant_id": mygenie_customer.get("restaurant_id"),
                    # Sync metadata
                    "mygenie_synced": True,
                    "last_synced_at": now,
                    "last_updated_at": mygenie_customer.get("updated_time"),
                }
                
                # Determine tier
                points = customer_data["total_points"]
                if points >= 5000:
                    tier = "Platinum"
                elif points >= 1500:
                    tier = "Gold"
                elif points >= 500:
                    tier = "Silver"
                else:
                    tier = "Bronze"
                customer_data["tier"] = tier
                
                # Check if exists
                existing = await db.customers.find_one({
                    "user_id": user_id,
                    "pos_customer_id": mygenie_customer["id"]
                })
                
                if existing:
                    await db.customers.update_one(
                        {"id": existing["id"]},
                        {"$set": customer_data}
                    )
                    updated_count += 1
                    customer_id = existing["id"]
                else:
                    customer_data["id"] = str(uuid.uuid4())
                    customer_data["created_at"] = mygenie_customer.get("created_time") or now
                    customer_data["customer_type"] = mygenie_customer.get("customer_type") or "normal"
                    customer_data["notes"] = None
                    customer_data["address"] = mygenie_customer.get("address")
                    customer_data["city"] = mygenie_customer.get("city")
                    customer_data["pincode"] = mygenie_customer.get("pincode")
                    customer_data["allergies"] = []
                    customer_data["custom_field_1"] = None
                    customer_data["custom_field_2"] = None
                    customer_data["custom_field_3"] = None
                    customer_data["favorites"] = []
                    # These will be calculated from orders sync
                    customer_data["total_visits"] = 0
                    customer_data["total_spent"] = 0.0  # Calculated from orders
                    customer_data["last_visit"] = None  # Updated from orders
                    
                    await db.customers.insert_one(customer_data)
                    synced_count += 1
                    customer_id = customer_data["id"]
                
                # Create transaction records from customer totals (only for new customers)
                if not existing:
                    customer_created_at = customer_data.get("created_at", now)
                    
                    # Points earned transaction
                    if customer_data.get("total_points_earned", 0) > 0:
                        await db.points_transactions.insert_one({
                            "id": str(uuid.uuid4()),
                            "user_id": user_id,
                            "customer_id": customer_id,
                            "transaction_type": "earn",
                            "points": customer_data["total_points_earned"],
                            "description": "Historical points (synced from MyGenie)",
                            "created_at": customer_created_at
                        })
                    
                    # Points redeemed transaction
                    if customer_data.get("total_points_redeemed", 0) > 0:
                        await db.points_transactions.insert_one({
                            "id": str(uuid.uuid4()),
                            "user_id": user_id,
                            "customer_id": customer_id,
                            "transaction_type": "redeem",
                            "points": customer_data["total_points_redeemed"],
                            "description": "Historical redemption (synced from MyGenie)",
                            "created_at": customer_created_at
                        })
                    
                    # Wallet credit transaction
                    if customer_data.get("total_wallet_received", 0) > 0:
                        await db.wallet_transactions.insert_one({
                            "id": str(uuid.uuid4()),
                            "user_id": user_id,
                            "customer_id": customer_id,
                            "transaction_type": "credit",
                            "amount": customer_data["total_wallet_received"],
                            "description": "Historical wallet credit (synced from MyGenie)",
                            "created_at": customer_created_at
                        })
                    
                    # Wallet debit transaction
                    if customer_data.get("total_wallet_used", 0) > 0:
                        await db.wallet_transactions.insert_one({
                            "id": str(uuid.uuid4()),
                            "user_id": user_id,
                            "customer_id": customer_id,
                            "transaction_type": "debit",
                            "amount": customer_data["total_wallet_used"],
                            "description": "Historical wallet usage (synced from MyGenie)",
                            "created_at": customer_created_at
                        })
                
                # Update progress every 10 customers
                if (i + 1) % 10 == 0:
                    customer_sync_status[user_id]["synced"] = synced_count
                    customer_sync_status[user_id]["updated"] = updated_count
            
            # Final update
            await db.users.update_one(
                {"id": user_id},
                {"$set": {"last_customer_sync_at": now}}
            )
            
            customer_sync_status[user_id]["status"] = "completed"
            customer_sync_status[user_id]["synced"] = synced_count
            customer_sync_status[user_id]["updated"] = updated_count
            customer_sync_status[user_id]["completed_at"] = datetime.now(timezone.utc).isoformat()
            
    except Exception as e:
        customer_sync_status[user_id]["status"] = "failed"
        customer_sync_status[user_id]["error"] = str(e)


@router.post("/sync-from-mygenie")
async def sync_customers_from_mygenie(background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    """
    Start background customer sync from MyGenie API.
    Returns immediately and syncs in background.
    Use /customers/sync-status to check progress.
    """
    user_id = user["id"]
    
    # Check if sync is already running
    if user_id in customer_sync_status and customer_sync_status[user_id].get("status") == "running":
        return {
            "success": False,
            "message": "Sync already in progress",
            "status": customer_sync_status[user_id]
        }
    
    # Get MyGenie token
    user_record = await db.users.find_one({"id": user_id})
    mygenie_token = user_record.get("mygenie_token") if user_record else None
    
    if not mygenie_token:
        return {
            "success": False,
            "message": "MyGenie token not found. Please login again."
        }
    
    # Start background sync
    background_tasks.add_task(background_customer_sync, user_id, mygenie_token)
    
    return {
        "success": True,
        "message": "Customer sync started in background.",
        "status": "started"
    }


@router.get("/sync-status")
async def get_customer_sync_status(user: dict = Depends(get_current_user)):
    """Get current customer sync progress"""
    user_id = user["id"]
    
    if user_id not in customer_sync_status:
        return {
            "status": "idle",
            "message": "No sync in progress"
        }
    
    return customer_sync_status[user_id]


@router.post("", response_model=Customer)
async def create_customer(customer_data: CustomerCreate, user: dict = Depends(get_current_user)):
    # Check if phone exists for this user
    existing = await db.customers.find_one({"user_id": user["id"], "phone": customer_data.phone})
    if existing:
        raise HTTPException(status_code=400, detail="Customer with this phone already exists")
    
    customer_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    # Get user's MyGenie token for API sync
    user_record = await db.users.find_one({"id": user["id"]})
    mygenie_token = user_record.get("mygenie_token") if user_record else None
    pos_customer_id = None
    
    # Sync to MyGenie if token available
    if mygenie_token:
        mygenie_api_url = os.getenv("MYGENIE_API_URL", "https://preprod.mygenie.online")
        
        # Split name into first and last name
        name_parts = (customer_data.name or "").split(" ", 1)
        f_name = name_parts[0] if name_parts else ""
        l_name = name_parts[1] if len(name_parts) > 1 else ""
        
        mygenie_payload = {
            "phone": customer_data.phone or "",
            "f_name": f_name,
            "l_name": l_name,
            "email": customer_data.email or "",
            "gst_number": customer_data.gst_number or "",
            "gst_name": customer_data.gst_name or "",
            "date_of_birth": customer_data.dob or "",
            "date_of_anniversary": customer_data.anniversary or "",
            "membership_id": ""
        }
        
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{mygenie_api_url}/api/v1/vendoremployee/pos/user-check-create",
                    headers={
                        "Authorization": f"Bearer {mygenie_token}",
                        "Content-Type": "application/json; charset=UTF-8",
                        "X-localization": "en"
                    },
                    json=mygenie_payload,
                    timeout=15.0
                )
                
                if resp.status_code == 200:
                    mygenie_resp = resp.json()
                    pos_customer_id = mygenie_resp.get("user_id")
                    print(f"✅ Customer synced to MyGenie: {pos_customer_id}")
                else:
                    print(f"⚠️ MyGenie sync failed: {resp.status_code} - {resp.text}")
        except Exception as e:
            print(f"⚠️ MyGenie sync error (non-critical): {str(e)}")
    
    # Check for first visit bonus
    settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    first_visit_bonus = 0
    if settings and settings.get("first_visit_bonus_enabled", False):
        first_visit_bonus = settings.get("first_visit_bonus_points", 50)
    
    customer_doc = {
        "id": customer_id,
        "user_id": user["id"],
        "created_at": now,
        "updated_at": now,
        
        # Basic Information
        "name": customer_data.name,
        "phone": customer_data.phone,
        "country_code": customer_data.country_code,
        "email": customer_data.email,
        "gender": customer_data.gender,
        "dob": customer_data.dob,
        "anniversary": customer_data.anniversary,
        "preferred_language": customer_data.preferred_language,
        "customer_type": customer_data.customer_type,
        "segment_tags": customer_data.segment_tags or [],
        
        # Contact & Marketing Permissions
        "whatsapp_opt_in": customer_data.whatsapp_opt_in,
        "whatsapp_opt_in_date": customer_data.whatsapp_opt_in_date,
        "promo_whatsapp_allowed": customer_data.promo_whatsapp_allowed,
        "promo_sms_allowed": customer_data.promo_sms_allowed,
        "email_marketing_allowed": customer_data.email_marketing_allowed,
        "call_allowed": customer_data.call_allowed,
        "is_blocked": customer_data.is_blocked,
        
        # Loyalty Information
        "total_points": first_visit_bonus,
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
        "first_visit_date": now,
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
        
        # Corporate Information
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
        
        # Dining Preferences
        "preferred_dining_type": customer_data.preferred_dining_type,
        "preferred_time_slot": customer_data.preferred_time_slot,
        "favorite_table": customer_data.favorite_table,
        "avg_party_size": customer_data.avg_party_size,
        "diet_preference": customer_data.diet_preference,
        "spice_level": customer_data.spice_level,
        "cuisine_preference": customer_data.cuisine_preference,
        
        # Special Occasions
        "kids_birthday": customer_data.kids_birthday or [],
        "spouse_name": customer_data.spouse_name,
        "festival_preference": customer_data.festival_preference or [],
        "special_dates": customer_data.special_dates or [],
        
        # Feedback & Flags
        "last_rating": customer_data.last_rating,
        "nps_score": customer_data.nps_score,
        "complaint_flag": customer_data.complaint_flag,
        "vip_flag": customer_data.vip_flag,
        "blacklist_flag": customer_data.blacklist_flag,
        
        # AI/Advanced
        "predicted_next_visit": customer_data.predicted_next_visit,
        "churn_risk_score": customer_data.churn_risk_score,
        "recommended_offer_type": customer_data.recommended_offer_type,
        "price_sensitivity_score": customer_data.price_sensitivity_score,
        
        # Custom Fields
        "custom_field_1": customer_data.custom_field_1,
        "custom_field_2": customer_data.custom_field_2,
        "custom_field_3": customer_data.custom_field_3,
        
        # Notes
        "notes": customer_data.notes,
        
        # POS Sync
        "pos_customer_id": pos_customer_id,
        "mygenie_synced": pos_customer_id is not None,
        "first_visit_bonus_awarded": first_visit_bonus > 0
    }
    
    await db.customers.insert_one(customer_doc)
    
    # Record first visit bonus transaction if awarded
    if first_visit_bonus > 0:
        tx_doc = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "customer_id": customer_id,
            "points": first_visit_bonus,
            "transaction_type": "bonus",
            "description": "First visit bonus - Welcome reward",
            "bill_amount": None,
            "balance_after": first_visit_bonus,
            "created_at": now
        }
        await db.points_transactions.insert_one(tx_doc)
    
    return Customer(**customer_doc)

@router.get("/sample-data")
async def get_sample_customer_data(user: dict = Depends(get_current_user)):
    """Get the first customer's data as sample for template previews."""
    customer = await db.customers.find_one(
        {"user_id": user["id"]}, {"_id": 0}
    )
    user_doc = await db.users.find_one({"id": user["id"]}, {"_id": 0, "restaurant_name": 1})
    restaurant_name = user_doc.get("restaurant_name", "") if user_doc else ""
    
    if not customer:
        return {"sample": {}, "restaurant_name": restaurant_name}
    
    return {
        "sample": {
            "customer_name": customer.get("name", ""),
            "phone": customer.get("phone", ""),
            "points_balance": str(customer.get("total_points", 0)),
            "points_earned": str(customer.get("total_points_earned", 0)),
            "points_redeemed": str(customer.get("total_points_redeemed", 0)),
            "wallet_balance": f"₹{customer.get('wallet_balance', 0)}",
            "amount": f"₹{customer.get('total_spent', 0)}",
            "tier": customer.get("tier", ""),
            "coupon_code": "",
            "expiry_date": "",
            "order_id": "",
            "visit_count": str(customer.get("total_visits", 0))
        },
        "restaurant_name": restaurant_name
    }

@router.get("", response_model=List[Customer])
async def list_customers(
    search: Optional[str] = None,
    tier: Optional[str] = None,
    customer_type: Optional[str] = None,
    has_allergies: Optional[bool] = None,
    last_visit_days: Optional[int] = None,
    favorite: Optional[str] = None,
    city: Optional[str] = None,
    # New filters
    whatsapp_opt_in: Optional[str] = None,
    vip_flag: Optional[str] = None,
    diet_preference: Optional[str] = None,
    lead_source: Optional[str] = None,
    preferred_time_slot: Optional[str] = None,
    preferred_dining_type: Optional[str] = None,
    has_birthday_this_month: Optional[bool] = None,
    has_anniversary_this_month: Optional[bool] = None,
    total_visits: Optional[str] = None,
    blacklist_flag: Optional[str] = None,
    complaint_flag: Optional[str] = None,
    # Phase 3 filters
    gender: Optional[str] = None,
    total_spent: Optional[str] = None,
    is_blocked: Optional[str] = None,
    # Quick filter chips
    inactive_days: Optional[int] = None,
    most_loyal: Optional[bool] = None,
    # Feedback filter
    has_feedback: Optional[str] = None,
    # Sort options
    sort_by: str = "created_at",
    sort_order: str = "desc",
    limit: int = 100,
    skip: int = 0,
    user: dict = Depends(get_current_user)
):
    query = {"user_id": user["id"]}
    and_conditions = []
    
    if search:
        and_conditions.append({
            "$or": [
                {"name": {"$regex": search, "$options": "i"}},
                {"phone": {"$regex": search, "$options": "i"}}
            ]
        })
    
    if tier:
        query["tier"] = tier
    
    if customer_type:
        query["customer_type"] = customer_type
    
    if has_allergies:
        query["allergies"] = {"$exists": True, "$ne": []}
    
    if last_visit_days:
        cutoff_date = (datetime.now(timezone.utc) - timedelta(days=last_visit_days)).isoformat()
        and_conditions.append({
            "$or": [
                {"last_visit": {"$lt": cutoff_date}},
                {"last_visit": None}
            ]
        })
    
    if favorite:
        query["favorites"] = {"$in": [favorite]}
    
    if city:
        query["city"] = {"$regex": city, "$options": "i"}
    
    # New filter implementations
    if whatsapp_opt_in and whatsapp_opt_in != "all":
        query["whatsapp_opt_in"] = whatsapp_opt_in == "true"
    
    if vip_flag and vip_flag != "all":
        query["vip_flag"] = vip_flag == "true"
    
    if diet_preference and diet_preference != "all":
        query["diet_preference"] = diet_preference
    
    if lead_source and lead_source != "all":
        query["lead_source"] = lead_source
    
    if preferred_time_slot and preferred_time_slot != "all":
        query["preferred_time_slot"] = preferred_time_slot
    
    if preferred_dining_type and preferred_dining_type != "all":
        query["preferred_dining_type"] = preferred_dining_type
    
    if blacklist_flag and blacklist_flag != "all":
        query["blacklist_flag"] = blacklist_flag == "true"
    
    if complaint_flag and complaint_flag != "all":
        query["complaint_flag"] = complaint_flag == "true"
    
    # Birthday this month filter
    if has_birthday_this_month:
        current_month = datetime.now(timezone.utc).month
        month_str = f"-{current_month:02d}-"
        and_conditions.append({
            "dob": {"$regex": month_str}
        })
    
    # Anniversary this month filter
    if has_anniversary_this_month:
        current_month = datetime.now(timezone.utc).month
        month_str = f"-{current_month:02d}-"
        and_conditions.append({
            "anniversary": {"$regex": month_str}
        })
    
    # Total visits filter
    if total_visits and total_visits != "all":
        if total_visits == "0":
            query["total_visits"] = 0
        elif total_visits == "1-5":
            query["total_visits"] = {"$gte": 1, "$lte": 5}
        elif total_visits == "6-10":
            query["total_visits"] = {"$gte": 6, "$lte": 10}
        elif total_visits == "10+":
            query["total_visits"] = {"$gt": 10}
    
    # Phase 3 filters
    if gender and gender != "all":
        query["gender"] = gender
    
    if total_spent and total_spent != "all":
        if total_spent == "0-500":
            query["total_spent"] = {"$gte": 0, "$lte": 500}
        elif total_spent == "500-2000":
            query["total_spent"] = {"$gt": 500, "$lte": 2000}
        elif total_spent == "2000-5000":
            query["total_spent"] = {"$gt": 2000, "$lte": 5000}
        elif total_spent == "5000-10000":
            query["total_spent"] = {"$gt": 5000, "$lte": 10000}
        elif total_spent == "10000+":
            query["total_spent"] = {"$gt": 10000}
    
    if is_blocked and is_blocked != "all":
        query["is_blocked"] = is_blocked == "true"
    
    # Quick filter: Inactive days
    if inactive_days:
        cutoff_date = (datetime.now(timezone.utc) - timedelta(days=inactive_days)).isoformat()
        and_conditions.append({
            "$or": [
                {"last_visit": {"$lt": cutoff_date}},
                {"last_visit": None}
            ]
        })
    
    # Quick filter: Most loyal (avg visits > 5 per month since registration)
    if most_loyal:
        # Use aggregation to calculate avg visits per month
        # For now, filter customers with high visit frequency
        # Customers who registered and have visits > 5 * months_since_registration
        and_conditions.append({
            "$expr": {
                "$gte": [
                    {"$divide": [
                        "$total_visits",
                        {"$max": [
                            {"$divide": [
                                {"$subtract": [{"$toDate": datetime.now(timezone.utc).isoformat()}, {"$toDate": "$created_at"}]},
                                2592000000  # milliseconds in 30 days
                            ]},
                            1
                        ]}
                    ]},
                    5
                ]
            }
        })
    
    # Feedback filter - check if customer has given feedback
    if has_feedback and has_feedback != "all":
        if has_feedback == "true":
            query["feedback_count"] = {"$gt": 0}
        else:
            query["$or"] = [{"feedback_count": {"$exists": False}}, {"feedback_count": 0}]
    
    if and_conditions:
        query["$and"] = and_conditions
    
    sort_direction = -1 if sort_order == "desc" else 1
    allowed_sort_fields = [
        "created_at", "last_visit", "total_spent", "total_points", "total_visits", 
        "name", "avg_visits_per_month", "points_balance", "wallet_balance", "tier"
    ]
    sort_field = sort_by if sort_by in allowed_sort_fields else "created_at"
    
    # For avg_visits_per_month, use total_visits as proxy (higher visits = more loyal)
    if sort_field == "avg_visits_per_month":
        sort_field = "total_visits"
    
    customers = await db.customers.find(query, {"_id": 0}).sort(sort_field, sort_direction).skip(skip).limit(limit).to_list(limit)
    return [Customer(**c) for c in customers]

@router.get("/segments/stats")
async def get_customer_segments(user: dict = Depends(get_current_user)):
    """Get customer segment statistics for campaign targeting"""
    user_id = user["id"]
    
    total = await db.customers.count_documents({"user_id": user_id})
    
    tier_stats = {}
    for tier in ["Bronze", "Silver", "Gold", "Platinum"]:
        tier_stats[tier.lower()] = await db.customers.count_documents({"user_id": user_id, "tier": tier})
    
    normal_count = await db.customers.count_documents({"user_id": user_id, "customer_type": "normal"})
    corporate_count = await db.customers.count_documents({"user_id": user_id, "customer_type": "corporate"})
    
    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    inactive_30d = await db.customers.count_documents({
        "user_id": user_id,
        "$or": [
            {"last_visit": {"$lt": thirty_days_ago}},
            {"last_visit": None}
        ]
    })
    
    sixty_days_ago = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
    inactive_60d = await db.customers.count_documents({
        "user_id": user_id,
        "$or": [
            {"last_visit": {"$lt": sixty_days_ago}},
            {"last_visit": None}
        ]
    })
    
    with_allergies = await db.customers.count_documents({
        "user_id": user_id,
        "allergies": {"$exists": True, "$ne": []}
    })
    
    cities_pipeline = [
        {"$match": {"user_id": user_id, "city": {"$exists": True, "$nin": [None, ""]}}},
        {"$group": {"_id": "$city", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    cities = await db.customers.aggregate(cities_pipeline).to_list(10)
    
    favorites_pipeline = [
        {"$match": {"user_id": user_id, "favorites": {"$exists": True, "$ne": []}}},
        {"$unwind": "$favorites"},
        {"$group": {"_id": "$favorites", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    top_favorites = await db.customers.aggregate(favorites_pipeline).to_list(10)
    
    return {
        "total": total,
        "by_tier": tier_stats,
        "by_type": {"normal": normal_count, "corporate": corporate_count},
        "inactive_30_days": inactive_30d,
        "inactive_60_days": inactive_60d,
        "with_allergies": with_allergies,
        "top_cities": [{"city": c["_id"], "count": c["count"]} for c in cities],
        "top_favorites": [{"item": f["_id"], "count": f["count"]} for f in top_favorites]
    }

@router.get("/{customer_id}", response_model=Customer)
async def get_customer(customer_id: str, user: dict = Depends(get_current_user)):
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return Customer(**customer)

@router.put("/{customer_id}", response_model=Customer)
async def update_customer(customer_id: str, update_data: CustomerUpdate, user: dict = Depends(get_current_user)):
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    if "phone" in update_dict and update_dict["phone"] != customer.get("phone"):
        existing = await db.customers.find_one({
            "user_id": user["id"], 
            "phone": update_dict["phone"],
            "id": {"$ne": customer_id}
        })
        if existing:
            raise HTTPException(status_code=400, detail="Another customer with this phone already exists")
    
    if update_dict:
        update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.customers.update_one({"id": customer_id}, {"$set": update_dict})
    
    # Sync to MyGenie if user has token
    user_record = await db.users.find_one({"id": user["id"]})
    mygenie_token = user_record.get("mygenie_token") if user_record else None
    
    if mygenie_token:
        # Get updated customer data
        updated_customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
        
        mygenie_api_url = os.getenv("MYGENIE_API_URL", "https://preprod.mygenie.online")
        
        # Split name into first and last name
        name_parts = (updated_customer.get("name") or "").split(" ", 1)
        f_name = name_parts[0] if name_parts else ""
        l_name = name_parts[1] if len(name_parts) > 1 else ""
        
        mygenie_payload = {
            "phone": updated_customer.get("phone") or "",
            "f_name": f_name,
            "l_name": l_name,
            "email": updated_customer.get("email") or "",
            "gst_number": updated_customer.get("gst_number") or "",
            "gst_name": updated_customer.get("gst_name") or "",
            "date_of_birth": updated_customer.get("dob") or "",
            "date_of_anniversary": updated_customer.get("anniversary") or "",
            "membership_id": ""
        }
        
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{mygenie_api_url}/api/v1/vendoremployee/pos/user-check-create",
                    headers={
                        "Authorization": f"Bearer {mygenie_token}",
                        "Content-Type": "application/json; charset=UTF-8",
                        "X-localization": "en"
                    },
                    json=mygenie_payload,
                    timeout=15.0
                )
                
                if resp.status_code == 200:
                    mygenie_resp = resp.json()
                    pos_customer_id = mygenie_resp.get("user_id")
                    # Update pos_customer_id if not already set
                    if not customer.get("pos_customer_id"):
                        await db.customers.update_one(
                            {"id": customer_id},
                            {"$set": {"pos_customer_id": pos_customer_id, "mygenie_synced": True}}
                        )
                    print(f"✅ Customer updated in MyGenie: {pos_customer_id}")
                else:
                    print(f"⚠️ MyGenie update failed: {resp.status_code} - {resp.text}")
        except Exception as e:
            print(f"⚠️ MyGenie update error (non-critical): {str(e)}")
    
    updated = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    return Customer(**updated)

@router.delete("/{customer_id}")
async def delete_customer(customer_id: str, user: dict = Depends(get_current_user)):
    result = await db.customers.delete_one({"id": customer_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    await db.points_transactions.delete_many({"customer_id": customer_id})
    return {"message": "Customer deleted"}


# QR Code endpoints
qr_router = APIRouter(prefix="/qr", tags=["QR Code"])

@qr_router.get("/generate")
async def generate_customer_qr(user: dict = Depends(get_current_user)):
    """Generate QR code for customer registration"""
    frontend_url = os.environ.get('FRONTEND_URL', 'https://crm-preview-19.preview.emergentagent.com')
    registration_url = f"{frontend_url}/register-customer/{user['id']}"
    
    qr_base64 = generate_qr_code(registration_url)
    
    return {
        "qr_code": f"data:image/png;base64,{qr_base64}",
        "registration_url": registration_url,
        "restaurant_name": user["restaurant_name"]
    }

@qr_router.post("/register/{restaurant_id}")
async def register_via_qr(restaurant_id: str, customer_data: CustomerCreate):
    """Register customer via QR code (no auth required)"""
    user = await db.users.find_one({"id": restaurant_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    
    existing = await db.customers.find_one({"user_id": restaurant_id, "phone": customer_data.phone})
    if existing:
        raise HTTPException(status_code=400, detail="Customer already registered")
    
    customer_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    # Check for first visit bonus
    settings = await db.loyalty_settings.find_one({"user_id": restaurant_id}, {"_id": 0})
    first_visit_bonus = 0
    if settings and settings.get("first_visit_bonus_enabled", False):
        first_visit_bonus = settings.get("first_visit_bonus_points", 50)
    
    customer_doc = {
        "id": customer_id,
        "user_id": restaurant_id,
        "created_at": now,
        "updated_at": now,
        
        # Basic Information
        "name": customer_data.name,
        "phone": customer_data.phone,
        "country_code": customer_data.country_code,
        "email": customer_data.email,
        "gender": customer_data.gender,
        "dob": customer_data.dob,
        "anniversary": customer_data.anniversary,
        "preferred_language": customer_data.preferred_language,
        "customer_type": customer_data.customer_type,
        "segment_tags": customer_data.segment_tags or [],
        
        # Contact & Marketing Permissions
        "whatsapp_opt_in": customer_data.whatsapp_opt_in,
        "whatsapp_opt_in_date": customer_data.whatsapp_opt_in_date,
        "promo_whatsapp_allowed": customer_data.promo_whatsapp_allowed,
        "promo_sms_allowed": customer_data.promo_sms_allowed,
        "email_marketing_allowed": customer_data.email_marketing_allowed,
        "call_allowed": customer_data.call_allowed,
        "is_blocked": customer_data.is_blocked,
        
        # Loyalty Information
        "total_points": first_visit_bonus,
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
        "first_visit_date": now,
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
        
        # Corporate Information
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
        
        # Dining Preferences
        "preferred_dining_type": customer_data.preferred_dining_type,
        "preferred_time_slot": customer_data.preferred_time_slot,
        "favorite_table": customer_data.favorite_table,
        "avg_party_size": customer_data.avg_party_size,
        "diet_preference": customer_data.diet_preference,
        "spice_level": customer_data.spice_level,
        "cuisine_preference": customer_data.cuisine_preference,
        
        # Special Occasions
        "kids_birthday": customer_data.kids_birthday or [],
        "spouse_name": customer_data.spouse_name,
        "festival_preference": customer_data.festival_preference or [],
        "special_dates": customer_data.special_dates or [],
        
        # Feedback & Flags
        "last_rating": customer_data.last_rating,
        "nps_score": customer_data.nps_score,
        "complaint_flag": customer_data.complaint_flag,
        "vip_flag": customer_data.vip_flag,
        "blacklist_flag": customer_data.blacklist_flag,
        
        # AI/Advanced
        "predicted_next_visit": customer_data.predicted_next_visit,
        "churn_risk_score": customer_data.churn_risk_score,
        "recommended_offer_type": customer_data.recommended_offer_type,
        "price_sensitivity_score": customer_data.price_sensitivity_score,
        
        # Custom Fields
        "custom_field_1": customer_data.custom_field_1,
        "custom_field_2": customer_data.custom_field_2,
        "custom_field_3": customer_data.custom_field_3,
        
        # Notes
        "notes": customer_data.notes,
        
        # Bonus
        "first_visit_bonus_awarded": first_visit_bonus > 0
    }
    
    await db.customers.insert_one(customer_doc)
    
    # Record first visit bonus transaction if awarded
    if first_visit_bonus > 0:
        tx_doc = {
            "id": str(uuid.uuid4()),
            "user_id": restaurant_id,
            "customer_id": customer_id,
            "points": first_visit_bonus,
            "transaction_type": "bonus",
            "description": "First visit bonus - Welcome reward",
            "bill_amount": None,
            "balance_after": first_visit_bonus,
            "created_at": now
        }
        await db.points_transactions.insert_one(tx_doc)
    
    return {
        "message": "Registration successful",
        "customer_id": customer_id,
        "first_visit_bonus_awarded": first_visit_bonus
    }


# Segments router
segments_router = APIRouter(prefix="/segments", tags=["Segments"])

async def count_customers_by_filters(user_id: str, filters: dict) -> int:
    query = build_customer_query(user_id, filters)
    return await db.customers.count_documents(query)

@segments_router.post("", response_model=Segment)
async def create_segment(segment_data: SegmentCreate, user: dict = Depends(get_current_user)):
    segment_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    # Use frontend-provided count if available, otherwise calculate
    if segment_data.customer_count is not None:
        customer_count = segment_data.customer_count
    else:
        customer_count = await count_customers_by_filters(user["id"], segment_data.filters)
    
    segment_doc = {
        "id": segment_id,
        "user_id": user["id"],
        "name": segment_data.name,
        "filters": segment_data.filters,
        "customer_count": customer_count,
        "created_at": now,
        "updated_at": now
    }
    
    await db.segments.insert_one(segment_doc)
    return Segment(**segment_doc)

@segments_router.get("", response_model=List[Segment])
async def list_segments(user: dict = Depends(get_current_user)):
    segments = await db.segments.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    
    for segment in segments:
        count = await count_customers_by_filters(user["id"], segment["filters"])
        segment["customer_count"] = count
        await db.segments.update_one(
            {"id": segment["id"]},
            {"$set": {"customer_count": count}}
        )
    
    return [Segment(**s) for s in segments]

@segments_router.post("/preview-count")
async def preview_segment_count(data: dict, user: dict = Depends(get_current_user)):
    """Preview customer count for a set of filters before creating a segment"""
    filters = data.get("filters", {})
    count = await count_customers_by_filters(user["id"], filters)
    return {"count": count}

@segments_router.get("/{segment_id}", response_model=Segment)
async def get_segment(segment_id: str, user: dict = Depends(get_current_user)):
    segment = await db.segments.find_one({"id": segment_id, "user_id": user["id"]}, {"_id": 0})
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    
    count = await count_customers_by_filters(user["id"], segment["filters"])
    segment["customer_count"] = count
    
    return Segment(**segment)

@segments_router.get("/{segment_id}/customers", response_model=List[Customer])
async def get_segment_customers(segment_id: str, user: dict = Depends(get_current_user)):
    segment = await db.segments.find_one({"id": segment_id, "user_id": user["id"]}, {"_id": 0})
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    
    query = build_customer_query(user["id"], segment["filters"])
    customers = await db.customers.find(query, {"_id": 0}).to_list(1000)
    
    return [Customer(**c) for c in customers]

@segments_router.put("/{segment_id}", response_model=Segment)
async def update_segment(segment_id: str, update_data: SegmentUpdate, user: dict = Depends(get_current_user)):
    segment = await db.segments.find_one({"id": segment_id, "user_id": user["id"]})
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    if update_dict:
        update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        if "filters" in update_dict:
            count = await count_customers_by_filters(user["id"], update_dict["filters"])
            update_dict["customer_count"] = count
        
        await db.segments.update_one({"id": segment_id}, {"$set": update_dict})
    
    updated_segment = await db.segments.find_one({"id": segment_id}, {"_id": 0})
    return Segment(**updated_segment)

@segments_router.delete("/{segment_id}")
async def delete_segment(segment_id: str, user: dict = Depends(get_current_user)):
    result = await db.segments.delete_one({"id": segment_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Segment not found")
    # Also delete any WhatsApp config for this segment
    await db.segment_whatsapp_config.delete_one({"segment_id": segment_id, "user_id": user["id"]})
    return {"message": "Segment deleted"}

# WhatsApp Configuration for Segments
@segments_router.get("/{segment_id}/whatsapp-config")
async def get_segment_whatsapp_config(segment_id: str, user: dict = Depends(get_current_user)):
    """Get WhatsApp automation config for a segment"""
    config = await db.segment_whatsapp_config.find_one(
        {"segment_id": segment_id, "user_id": user["id"]},
        {"_id": 0}
    )
    if not config:
        return {"configured": False}
    return {"configured": True, "config": config}

@segments_router.post("/{segment_id}/whatsapp-config")
async def save_segment_whatsapp_config(segment_id: str, config: dict, user: dict = Depends(get_current_user)):
    """Save WhatsApp automation config for a segment"""
    from datetime import datetime, timezone
    
    # Verify segment exists
    segment = await db.segments.find_one({"id": segment_id, "user_id": user["id"]})
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    
    now = datetime.now(timezone.utc).isoformat()
    config_doc = {
        "segment_id": segment_id,
        "user_id": user["id"],
        "template_id": config.get("template_id"),
        "template_name": config.get("template_name"),
        "variable_mappings": config.get("variable_mappings", {}),
        "variable_modes": config.get("variable_modes", {}),
        "schedule_type": config.get("schedule_type", "now"),  # now, scheduled, recurring
        "scheduled_date": config.get("scheduled_date"),
        "scheduled_time": config.get("scheduled_time", "10:00"),
        "recurring_frequency": config.get("recurring_frequency"),  # daily, weekly, monthly
        "recurring_days": config.get("recurring_days", []),
        "recurring_day_of_month": config.get("recurring_day_of_month"),
        "recurring_end_option": config.get("recurring_end_option", "never"),
        "recurring_end_date": config.get("recurring_end_date"),
        "recurring_occurrences": config.get("recurring_occurrences"),
        "is_active": True,
        "created_at": now,
        "updated_at": now
    }
    
    # Upsert the config
    await db.segment_whatsapp_config.update_one(
        {"segment_id": segment_id, "user_id": user["id"]},
        {"$set": config_doc},
        upsert=True
    )
    
    return {"message": "WhatsApp config saved", "config": config_doc}

@segments_router.delete("/{segment_id}/whatsapp-config")
async def delete_segment_whatsapp_config(segment_id: str, user: dict = Depends(get_current_user)):
    """Remove WhatsApp automation config for a segment"""
    result = await db.segment_whatsapp_config.delete_one(
        {"segment_id": segment_id, "user_id": user["id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="WhatsApp config not found")
    return {"message": "WhatsApp config removed"}

@segments_router.patch("/{segment_id}/whatsapp-config/toggle")
async def toggle_segment_whatsapp_config(segment_id: str, user: dict = Depends(get_current_user)):
    """Pause or resume WhatsApp automation for a segment"""
    from datetime import datetime, timezone
    
    config = await db.segment_whatsapp_config.find_one(
        {"segment_id": segment_id, "user_id": user["id"]}
    )
    if not config:
        raise HTTPException(status_code=404, detail="WhatsApp config not found")
    
    new_status = not config.get("is_active", True)
    now = datetime.now(timezone.utc).isoformat()
    
    await db.segment_whatsapp_config.update_one(
        {"segment_id": segment_id, "user_id": user["id"]},
        {"$set": {"is_active": new_status, "updated_at": now}}
    )
    
    return {
        "message": f"WhatsApp automation {'resumed' if new_status else 'paused'}",
        "is_active": new_status
    }

@segments_router.get("/whatsapp-configs/all")
async def get_all_segment_whatsapp_configs(user: dict = Depends(get_current_user)):
    """Get all WhatsApp configs for user's segments"""
    configs = await db.segment_whatsapp_config.find(
        {"user_id": user["id"]},
        {"_id": 0}
    ).to_list(100)
    return {"configs": configs}


@router.get("/{customer_id}/loyalty-details")
async def get_customer_loyalty_details(customer_id: str, user: dict = Depends(get_current_user)):
    """Get loyalty conversion rate and coupon summary for a customer"""
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Get loyalty settings for conversion rate
    loyalty_settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    redemption_value = 0.25  # default: 1 point = ₹0.25
    if loyalty_settings:
        redemption_value = loyalty_settings.get("redemption_value", 0.25)

    # Get active coupons for the restaurant
    now = datetime.now(timezone.utc).isoformat()
    active_coupons = await db.coupons.find(
        {"user_id": user["id"], "is_active": True},
        {"_id": 0, "id": 1, "code": 1, "description": 1, "discount_type": 1, "discount_value": 1, "max_discount": 1, "valid_until": 1, "end_date": 1, "usage_limit": 1, "used_count": 1, "total_used": 1}
    ).to_list(50)

    # Calculate monetary values
    total_points = customer.get("total_points", 0)
    total_earned = customer.get("total_points_earned", 0)
    total_redeemed = customer.get("total_points_redeemed", 0)

    return {
        "redemption_value": redemption_value,
        "points_money_value": round(total_points * redemption_value, 2),
        "earned_money_value": round(total_earned * redemption_value, 2),
        "redeemed_money_value": round(total_redeemed * redemption_value, 2),
        "total_coupon_used": customer.get("total_coupon_used", 0),
        "active_coupons": active_coupons
    }


@router.get("/{customer_id}/insights")
async def get_customer_insights(customer_id: str, user: dict = Depends(get_current_user)):
    """P0 AI Insights - aggregation-based, no ML required"""
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    insights = {}

    # 1. Top Items (from order_items)
    top_items_pipeline = [
        {"$match": {"customer_id": customer_id, "user_id": user["id"]}},
        {"$group": {"_id": "$item_name", "count": {"$sum": "$item_qty"}}},
        {"$sort": {"count": -1}},
        {"$limit": 5}
    ]
    top_items = await db.order_items.aggregate(top_items_pipeline).to_list(5)
    insights["top_items"] = [{"name": i["_id"], "count": i["count"]} for i in top_items]

    # 2. Preferred Category (from order_items)
    category_pipeline = [
        {"$match": {"customer_id": customer_id, "user_id": user["id"], "item_category": {"$ne": None}}},
        {"$group": {"_id": "$item_category", "count": {"$sum": "$item_qty"}}},
        {"$sort": {"count": -1}},
        {"$limit": 3}
    ]
    categories = await db.order_items.aggregate(category_pipeline).to_list(3)
    total_cat = sum(c["count"] for c in categories) if categories else 0
    insights["top_categories"] = [
        {"name": c["_id"], "count": c["count"], "percent": round(c["count"] / total_cat * 100) if total_cat > 0 else 0}
        for c in categories
    ]

    # 3. Order Frequency & Preferred Day/Time (from orders)
    orders = await db.orders.find(
        {"customer_id": customer_id, "user_id": user["id"]},
        {"_id": 0, "created_at": 1, "order_amount": 1}
    ).sort("created_at", 1).to_list(1000)

    if len(orders) >= 2:
        dates = []
        for o in orders:
            try:
                dt = datetime.fromisoformat(o["created_at"].replace("Z", "+00:00")) if isinstance(o["created_at"], str) else o["created_at"]
                dates.append(dt)
            except Exception:
                pass

        if len(dates) >= 2:
            gaps = [(dates[i+1] - dates[i]).days for i in range(len(dates)-1) if (dates[i+1] - dates[i]).days > 0]
            insights["avg_frequency_days"] = round(sum(gaps) / len(gaps)) if gaps else None

            # Preferred day of week
            day_counts = {}
            for dt in dates:
                day_name = dt.strftime("%A")
                day_counts[day_name] = day_counts.get(day_name, 0) + 1
            if day_counts:
                preferred_day = max(day_counts, key=day_counts.get)
                insights["preferred_day"] = preferred_day

            # Preferred time slot
            hour_slots = {"Breakfast (8-11 AM)": 0, "Lunch (12-3 PM)": 0, "Evening (4-7 PM)": 0, "Dinner (7-11 PM)": 0, "Late Night (11 PM+)": 0}
            for dt in dates:
                h = dt.hour
                if 8 <= h < 11:
                    hour_slots["Breakfast (8-11 AM)"] += 1
                elif 12 <= h < 15:
                    hour_slots["Lunch (12-3 PM)"] += 1
                elif 16 <= h < 19:
                    hour_slots["Evening (4-7 PM)"] += 1
                elif 19 <= h < 23:
                    hour_slots["Dinner (7-11 PM)"] += 1
                else:
                    hour_slots["Late Night (11 PM+)"] += 1
            active_slots = {k: v for k, v in hour_slots.items() if v > 0}
            if active_slots:
                insights["preferred_time"] = max(active_slots, key=active_slots.get)
        else:
            insights["avg_frequency_days"] = None
    else:
        insights["avg_frequency_days"] = None

    # 4. Spending Trend (last 3 months vs previous 3 months)
    if len(orders) >= 3:
        now = datetime.now(timezone.utc)
        recent = []
        older = []
        for o in orders:
            try:
                dt = datetime.fromisoformat(o["created_at"].replace("Z", "+00:00")) if isinstance(o["created_at"], str) else o["created_at"]
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                days_ago = (now - dt).days
                if days_ago <= 90:
                    recent.append(o["order_amount"])
                elif days_ago <= 180:
                    older.append(o["order_amount"])
            except Exception:
                pass

        if recent and older:
            recent_avg = sum(recent) / len(recent)
            older_avg = sum(older) / len(older)
            if older_avg > 0:
                change = round((recent_avg - older_avg) / older_avg * 100)
                insights["spending_trend"] = {"change_percent": change, "direction": "up" if change > 0 else "down"}

    # 5. Common Customizations (from item_notes)
    notes_pipeline = [
        {"$match": {"customer_id": customer_id, "user_id": user["id"], "item_notes": {"$ne": None}}},
        {"$group": {"_id": "$item_notes", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5}
    ]
    notes = await db.order_items.aggregate(notes_pipeline).to_list(5)
    insights["common_notes"] = [{"note": n["_id"], "count": n["count"]} for n in notes]

    # 6. Avg order value
    insights["avg_order_value"] = customer.get("avg_order_value", 0)

    return insights


