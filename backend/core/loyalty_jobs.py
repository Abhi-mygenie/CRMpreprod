"""
Core loyalty job functions that can be called from both API endpoints and scheduled cron jobs.
These functions take user_id as a parameter and don't depend on HTTP authentication.
"""
from datetime import datetime, timezone, timedelta
import uuid
import logging
import asyncio

from core.database import db
from core.helpers import calculate_tier

logger = logging.getLogger(__name__)


async def run_birthday_bonus(user_id: str, settings: dict) -> dict:
    """Award birthday bonus to eligible customers for a given user."""
    from core.whatsapp import trigger_whatsapp_event
    
    if not settings.get("birthday_bonus_enabled", False):
        return {"customers_awarded": 0, "total_points_awarded": 0, "awarded_customers": []}

    bonus_points = settings.get("birthday_bonus_points", 100)
    days_before = settings.get("birthday_bonus_days_before", 0)
    days_after = settings.get("birthday_bonus_days_after", 7)
    today = datetime.now(timezone.utc).date()
    current_year = today.year

    customers = await db.customers.find({
        "user_id": user_id,
        "dob": {"$exists": True, "$nin": [None, ""]}
    }, {"_id": 0}).to_list(10000)

    customers_awarded = 0
    total_points_awarded = 0
    awarded_list = []

    for customer in customers:
        try:
            dob_str = customer.get("dob")
            if not dob_str:
                continue
            dob = datetime.strptime(dob_str[:10], "%Y-%m-%d").date()
            try:
                birthday_this_year = dob.replace(year=current_year)
            except ValueError:
                birthday_this_year = dob.replace(year=current_year, day=28)

            window_start = birthday_this_year - timedelta(days=days_before)
            window_end = birthday_this_year + timedelta(days=days_after)

            if window_start <= today <= window_end:
                if customer.get("last_birthday_bonus_year") == current_year:
                    continue
                current_points = customer.get("total_points", 0)
                new_points = current_points + bonus_points

                await db.customers.update_one(
                    {"id": customer["id"]},
                    {"$set": {"total_points": new_points, "last_birthday_bonus_year": current_year}}
                )
                tx_doc = {
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "customer_id": customer["id"],
                    "points": bonus_points,
                    "transaction_type": "bonus",
                    "description": f"Birthday bonus ({current_year})",
                    "bill_amount": None,
                    "balance_after": new_points,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.points_transactions.insert_one(tx_doc)
                customers_awarded += 1
                total_points_awarded += bonus_points
                awarded_list.append({
                    "customer_id": customer["id"],
                    "name": customer.get("name"),
                    "phone": customer.get("phone"),
                    "points_awarded": bonus_points
                })
                
                # Fire birthday WhatsApp trigger
                updated_customer = {**customer, "total_points": new_points}
                asyncio.create_task(trigger_whatsapp_event(
                    db, user_id, "birthday", updated_customer,
                    {"birthday_bonus": bonus_points, "points_balance": new_points}
                ))
                
        except Exception as e:
            logger.warning(f"Birthday bonus error for customer {customer.get('id')}: {e}")
            continue

    return {
        "customers_awarded": customers_awarded,
        "total_points_awarded": total_points_awarded,
        "awarded_customers": awarded_list
    }


async def run_anniversary_bonus(user_id: str, settings: dict) -> dict:
    """Award anniversary bonus to eligible customers for a given user."""
    from core.whatsapp import trigger_whatsapp_event
    
    if not settings.get("anniversary_bonus_enabled", False):
        return {"customers_awarded": 0, "total_points_awarded": 0, "awarded_customers": []}

    bonus_points = settings.get("anniversary_bonus_points", 150)
    days_before = settings.get("anniversary_bonus_days_before", 0)
    days_after = settings.get("anniversary_bonus_days_after", 7)
    today = datetime.now(timezone.utc).date()
    current_year = today.year

    customers = await db.customers.find({
        "user_id": user_id,
        "anniversary": {"$exists": True, "$nin": [None, ""]}
    }, {"_id": 0}).to_list(10000)

    customers_awarded = 0
    total_points_awarded = 0
    awarded_list = []

    for customer in customers:
        try:
            anniversary_str = customer.get("anniversary")
            if not anniversary_str:
                continue
            anniversary = datetime.strptime(anniversary_str[:10], "%Y-%m-%d").date()
            try:
                anniversary_this_year = anniversary.replace(year=current_year)
            except ValueError:
                anniversary_this_year = anniversary.replace(year=current_year, day=28)

            window_start = anniversary_this_year - timedelta(days=days_before)
            window_end = anniversary_this_year + timedelta(days=days_after)

            if window_start <= today <= window_end:
                if customer.get("last_anniversary_bonus_year") == current_year:
                    continue
                current_points = customer.get("total_points", 0)
                new_points = current_points + bonus_points

                await db.customers.update_one(
                    {"id": customer["id"]},
                    {"$set": {"total_points": new_points, "last_anniversary_bonus_year": current_year}}
                )
                tx_doc = {
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "customer_id": customer["id"],
                    "points": bonus_points,
                    "transaction_type": "bonus",
                    "description": f"Anniversary bonus ({current_year})",
                    "bill_amount": None,
                    "balance_after": new_points,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.points_transactions.insert_one(tx_doc)
                customers_awarded += 1
                total_points_awarded += bonus_points
                awarded_list.append({
                    "customer_id": customer["id"],
                    "name": customer.get("name"),
                    "phone": customer.get("phone"),
                    "points_awarded": bonus_points
                })
                
                # Fire anniversary WhatsApp trigger
                updated_customer = {**customer, "total_points": new_points}
                asyncio.create_task(trigger_whatsapp_event(
                    db, user_id, "anniversary", updated_customer,
                    {"anniversary_bonus": bonus_points, "points_balance": new_points}
                ))
                
        except Exception as e:
            logger.warning(f"Anniversary bonus error for customer {customer.get('id')}: {e}")
            continue

    return {
        "customers_awarded": customers_awarded,
        "total_points_awarded": total_points_awarded,
        "awarded_customers": awarded_list
    }


async def run_expiry_reminders(user_id: str, settings: dict) -> dict:
    """Find customers with expiring points and mark them as reminded."""
    from core.whatsapp import trigger_whatsapp_event
    
    expiry_months = settings.get("points_expiry_months", 6)
    reminder_days = settings.get("expiry_reminder_days", 30)

    if expiry_months == 0:
        return {"customers_to_remind": 0, "reminders": []}

    now = datetime.now(timezone.utc)
    current_year = now.year
    current_month = now.month

    customers = await db.customers.find({
        "user_id": user_id,
        "total_points": {"$gt": 0}
    }, {"_id": 0}).to_list(10000)

    customers_to_remind = 0
    reminders = []

    for customer in customers:
        last_reminder = customer.get("last_expiry_reminder")
        if last_reminder:
            lr_date = datetime.fromisoformat(last_reminder.replace("Z", "+00:00")) if isinstance(last_reminder, str) else last_reminder
            if lr_date.year == current_year and lr_date.month == current_month:
                continue

        expiry_cutoff = now - timedelta(days=expiry_months * 30)
        reminder_cutoff = now - timedelta(days=(expiry_months * 30) - reminder_days)

        transactions = await db.points_transactions.find({
            "customer_id": customer["id"],
            "user_id": user_id,
            "transaction_type": {"$in": ["earn", "bonus"]}
        }, {"_id": 0}).to_list(1000)

        expiring_points = 0
        earliest_expiry = None

        for tx in transactions:
            try:
                tx_date = datetime.fromisoformat(tx["created_at"].replace("Z", "+00:00")) if isinstance(tx["created_at"], str) else tx["created_at"]
                if expiry_cutoff <= tx_date <= reminder_cutoff:
                    expiring_points += tx["points"]
                    expiry_date = tx_date + timedelta(days=expiry_months * 30)
                    if earliest_expiry is None or expiry_date < earliest_expiry:
                        earliest_expiry = expiry_date
            except Exception:
                continue

        if expiring_points > 0:
            await db.customers.update_one(
                {"id": customer["id"]},
                {"$set": {"last_expiry_reminder": now.isoformat()}}
            )
            customers_to_remind += 1
            reminders.append({
                "customer_id": customer["id"],
                "name": customer.get("name"),
                "phone": customer.get("phone"),
                "expiring_points": expiring_points,
                "expiry_date": earliest_expiry.isoformat() if earliest_expiry else None
            })
            
            # Fire points_expiring WhatsApp trigger
            asyncio.create_task(trigger_whatsapp_event(
                db, user_id, "points_expiring", customer,
                {
                    "expiring_points": expiring_points,
                    "expiry_date": earliest_expiry.strftime("%d %b %Y") if earliest_expiry else "",
                    "points_balance": customer.get("total_points", 0)
                }
            ))

    return {"customers_to_remind": customers_to_remind, "reminders": reminders}


async def run_points_expiry(user_id: str, settings: dict) -> dict:
    """Expire old points for all customers of a given user."""
    expiry_months = settings.get("points_expiry_months", 6)

    if expiry_months == 0:
        return {"total_expired": 0, "customers_affected": 0, "expired_details": []}

    now = datetime.now(timezone.utc)
    expiry_cutoff_str = (now - timedelta(days=expiry_months * 30)).isoformat()

    customers = await db.customers.find({
        "user_id": user_id,
        "total_points": {"$gt": 0}
    }, {"_id": 0}).to_list(10000)

    total_expired = 0
    customers_affected = 0
    expired_details = []

    for customer in customers:
        old_transactions = await db.points_transactions.find({
            "customer_id": customer["id"],
            "user_id": user_id,
            "transaction_type": {"$in": ["earn", "bonus"]},
            "created_at": {"$lt": expiry_cutoff_str},
            "points_expired": {"$ne": True}
        }, {"_id": 0}).to_list(1000)

        if not old_transactions:
            continue

        points_to_expire = sum(tx["points"] for tx in old_transactions)
        current_points = customer.get("total_points", 0)
        points_to_expire = min(points_to_expire, current_points)

        if points_to_expire > 0:
            tx_ids = [tx["id"] for tx in old_transactions]
            await db.points_transactions.update_many(
                {"id": {"$in": tx_ids}},
                {"$set": {"points_expired": True, "expired_at": now.isoformat()}}
            )
            new_points = current_points - points_to_expire
            new_tier = calculate_tier(new_points, settings)
            tx_doc = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "customer_id": customer["id"],
                "points": points_to_expire,
                "transaction_type": "expired",
                "description": f"Points expired (older than {expiry_months} months)",
                "bill_amount": None,
                "balance_after": new_points,
                "source_transaction_ids": tx_ids,
                "created_at": now.isoformat()
            }
            await db.points_transactions.insert_one(tx_doc)
            await db.customers.update_one(
                {"id": customer["id"]},
                {"$set": {"total_points": new_points, "tier": new_tier, "last_points_expiry": now.isoformat()}}
            )
            total_expired += points_to_expire
            customers_affected += 1
            expired_details.append({
                "customer_id": customer["id"],
                "name": customer.get("name"),
                "points_expired": points_to_expire,
                "points_remaining": new_points,
                "new_tier": new_tier
            })

    return {
        "total_expired": total_expired,
        "customers_affected": customers_affected,
        "expired_details": expired_details
    }
