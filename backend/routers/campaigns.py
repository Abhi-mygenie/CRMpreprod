"""
CR-024: Marketing Campaigns Router
Campaign CRUD + execution engine + history endpoints
"""

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from datetime import datetime, timezone
from typing import Optional
import uuid
import asyncio
import logging

from core.database import db
from core.auth import get_current_user
from core.helpers import build_customer_query
from core.whatsapp import (
    WhatsAppMessage,
    send_bulk_messages,
    build_body_values,
    log_message_attempt,
    get_user_authkey,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/campaigns", tags=["Campaigns"])

DAILY_LIMIT = 1000


# ── helpers ──────────────────────────────────────────────────────────────

async def _get_daily_send_count(user_id: str) -> int:
    """Count messages sent today via campaigns for this tenant."""
    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    ).isoformat()
    pipeline = [
        {"$match": {"user_id": user_id, "started_at": {"$gte": today_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_sent"}}},
    ]
    result = await db.campaign_runs.aggregate(pipeline).to_list(1)
    return result[0]["total"] if result else 0


async def _resolve_audience_customers(user_id: str, audience_id: str):
    """Load customers for an audience (segment or all)."""
    if audience_id == "all-customers":
        query = {"user_id": user_id}
    else:
        segment = await db.segments.find_one({"id": audience_id, "user_id": user_id})
        if not segment:
            raise HTTPException(404, "Audience segment not found")
        query = build_customer_query(user_id, segment.get("filters", {}))
    return await db.customers.find(query, {"_id": 0}).to_list(10000)


# ── CRUD ─────────────────────────────────────────────────────────────────

@router.post("")
async def create_campaign(body: dict, user: dict = Depends(get_current_user)):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Campaign name is required")

    now = datetime.now(timezone.utc).isoformat()
    campaign = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "name": name,
        "audience_id": body.get("audience_id", "all-customers"),
        "audience_name": body.get("audience_name", "All Customers"),
        "audience_count": body.get("audience_count", 0),
        "template_id": body.get("template_id", ""),
        "template_name": body.get("template_name", ""),
        "variable_mappings": body.get("variable_mappings", {}),
        "variable_modes": body.get("variable_modes", {}),
        "menu_pick_resolved": body.get("menu_pick_resolved", {}),
        "schedule_type": body.get("schedule_type", "now"),
        "scheduled_date": body.get("scheduled_date"),
        "scheduled_time": body.get("scheduled_time"),
        "recurring_frequency": body.get("recurring_frequency"),
        "recurring_days": body.get("recurring_days"),
        "recurring_day_of_month": body.get("recurring_day_of_month"),
        "recurring_end_option": body.get("recurring_end_option"),
        "recurring_end_date": body.get("recurring_end_date"),
        "recurring_occurrences": body.get("recurring_occurrences"),
        "status": "draft",
        "total_sent": 0,
        "total_delivered": 0,
        "total_read": 0,
        "total_failed": 0,
        "last_run_at": None,
        "run_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    await db.campaigns.insert_one(campaign)
    campaign.pop("_id", None)
    return campaign


@router.get("")
async def list_campaigns(user: dict = Depends(get_current_user)):
    campaigns = (
        await db.campaigns.find({"user_id": user["id"]}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(500)
    )
    return campaigns


@router.get("/daily-limit")
async def get_daily_limit(user: dict = Depends(get_current_user)):
    used = await _get_daily_send_count(user["id"])
    return {"limit": DAILY_LIMIT, "used": used, "remaining": max(DAILY_LIMIT - used, 0)}


@router.get("/{campaign_id}")
async def get_campaign(campaign_id: str, user: dict = Depends(get_current_user)):
    campaign = await db.campaigns.find_one(
        {"id": campaign_id, "user_id": user["id"]}, {"_id": 0}
    )
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    return campaign


@router.put("/{campaign_id}")
async def update_campaign(campaign_id: str, body: dict, user: dict = Depends(get_current_user)):
    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": user["id"]})
    if not campaign:
        raise HTTPException(404, "Campaign not found")

    allowed = {
        "name", "audience_id", "audience_name", "audience_count",
        "template_id", "template_name", "variable_mappings", "variable_modes",
        "menu_pick_resolved", "schedule_type", "scheduled_date", "scheduled_time",
        "recurring_frequency", "recurring_days", "recurring_day_of_month",
        "recurring_end_option", "recurring_end_date", "recurring_occurrences",
    }
    updates = {k: v for k, v in body.items() if k in allowed}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.campaigns.update_one({"id": campaign_id}, {"$set": updates})
    updated = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    return updated


@router.delete("/{campaign_id}")
async def delete_campaign(campaign_id: str, user: dict = Depends(get_current_user)):
    result = await db.campaigns.delete_one({"id": campaign_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(404, "Campaign not found")
    return {"message": "Campaign deleted"}


# ── Execution engine ─────────────────────────────────────────────────────

async def _execute_campaign_send(campaign_id: str, user: dict):
    """Background task: send campaign messages."""
    try:
        campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": user["id"]})
        if not campaign:
            logger.error(f"Campaign {campaign_id} not found for execution")
            return

        # 1. Get AuthKey API key
        api_key = await get_user_authkey(db, user["id"])
        if not api_key:
            logger.error(f"No AuthKey API key for user {user['id']}")
            await db.campaigns.update_one(
                {"id": campaign_id},
                {"$set": {"status": "failed", "updated_at": datetime.now(timezone.utc).isoformat()}},
            )
            return

        # 2. Get brand data for variable resolution
        user_doc = await db.users.find_one(
            {"id": user["id"]},
            {"_id": 0, "restaurant_name": 1, "einvoice_link": 1,
             "instagram_link": 1, "google_review_link": 1, "feedback_link": 1},
        )
        brand_data = {
            "restaurant_name": (user_doc or {}).get("restaurant_name", ""),
            "einvoice_link": (user_doc or {}).get("einvoice_link", ""),
            "instagram_link": (user_doc or {}).get("instagram_link", ""),
            "google_review_link": (user_doc or {}).get("google_review_link", ""),
            "feedback_link": (user_doc or {}).get("feedback_link", ""),
        }

        # 3. Load audience customers
        customers = await _resolve_audience_customers(user["id"], campaign["audience_id"])

        # 4. Filter opted-out
        eligible = [c for c in customers if c.get("whatsapp_opt_in") is not False]
        opted_out = len(customers) - len(eligible)

        # 5. Create campaign_run
        now = datetime.now(timezone.utc).isoformat()
        run_id = str(uuid.uuid4())
        run_doc = {
            "id": run_id,
            "campaign_id": campaign_id,
            "campaign_name": campaign["name"],
            "user_id": user["id"],
            "audience_id": campaign["audience_id"],
            "audience_name": campaign.get("audience_name", ""),
            "template_name": campaign.get("template_name", ""),
            "audience_count": len(customers),
            "opted_out_skipped": opted_out,
            "target_count": len(eligible),
            "total_sent": 0,
            "total_delivered": 0,
            "total_read": 0,
            "total_failed": 0,
            "status": "running",
            "started_at": now,
            "completed_at": None,
            "error": None,
        }
        await db.campaign_runs.insert_one(run_doc)

        # 6. Resolve variables + build messages
        template_id = campaign.get("template_id", "")
        variable_mappings = campaign.get("variable_mappings", {})
        variable_modes = campaign.get("variable_modes", {})
        menu_pick_resolved = campaign.get("menu_pick_resolved", {})
        template_variables = list(variable_mappings.keys()) if variable_mappings else []

        messages = []
        customer_map = {}  # phone -> customer for logging

        for cust in eligible:
            phone = (cust.get("phone") or "").replace(" ", "").replace("-", "")
            country_code = (cust.get("country_code") or "+91").replace("+", "")
            if not phone:
                continue

            body_values = build_body_values(
                template_variables,
                variable_mappings,
                cust,
                {},  # no event_data for campaigns
                variable_modes=variable_modes,
                brand_data=brand_data,
                menu_pick_resolved=menu_pick_resolved,
            )

            msg = WhatsAppMessage(
                phone=phone,
                country_code=country_code,
                template_id=template_id,
                body_values=body_values,
                customer_id=cust.get("id"),
            )
            messages.append(msg)
            customer_map[phone] = cust

        # 7. Send bulk
        if messages:
            bulk_result = await send_bulk_messages(api_key, messages)

            # 8. Log each message
            sent_count = 0
            failed_count = 0
            for r in bulk_result.get("results", []):
                from core.whatsapp import SendResult
                sr = SendResult(
                    success=r["success"],
                    phone=r["phone"],
                    message_id=r.get("message_id"),
                    error=r.get("error"),
                    http_status=r.get("http_status"),
                    raw_response=r.get("raw_response"),
                )
                cust = customer_map.get(r["phone"], {})
                await log_message_attempt(
                    db,
                    user["id"],
                    cust.get("id"),
                    r["phone"],
                    "campaign_send",
                    template_id,
                    sr,
                    template_name=campaign.get("template_name"),
                    campaign_id=run_id,
                    country_code=cust.get("country_code", "91").replace("+", ""),
                    body_values=sr.response_data if not sr.success else None,
                    customer_name=cust.get("name"),
                    reference_type="campaign",
                    reference_id=campaign_id,
                )
                if r["success"]:
                    sent_count += 1
                else:
                    failed_count += 1
        else:
            sent_count = 0
            failed_count = 0

        # 9. Update campaign_run
        completed_at = datetime.now(timezone.utc).isoformat()
        await db.campaign_runs.update_one(
            {"id": run_id},
            {"$set": {
                "total_sent": sent_count,
                "total_failed": failed_count,
                "status": "completed",
                "completed_at": completed_at,
            }},
        )

        # 10. Update campaign totals
        await db.campaigns.update_one(
            {"id": campaign_id},
            {
                "$inc": {
                    "total_sent": sent_count,
                    "total_failed": failed_count,
                    "run_count": 1,
                },
                "$set": {
                    "status": "completed",
                    "last_run_at": completed_at,
                    "updated_at": completed_at,
                },
            },
        )

        logger.info(
            f"Campaign {campaign_id} execution complete: "
            f"sent={sent_count} failed={failed_count} opted_out={opted_out}"
        )

    except Exception as exc:
        logger.exception(f"Campaign {campaign_id} execution failed: {exc}")
        now_err = datetime.now(timezone.utc).isoformat()
        await db.campaign_runs.update_one(
            {"campaign_id": campaign_id, "status": "running"},
            {"$set": {"status": "failed", "error": str(exc), "completed_at": now_err}},
        )
        await db.campaigns.update_one(
            {"id": campaign_id},
            {"$set": {"status": "failed", "updated_at": now_err}},
        )


@router.post("/{campaign_id}/send")
async def send_campaign(
    campaign_id: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": user["id"]})
    if not campaign:
        raise HTTPException(404, "Campaign not found")

    # Rate limit check
    used_today = await _get_daily_send_count(user["id"])

    # Estimate audience size
    customers = await _resolve_audience_customers(user["id"], campaign["audience_id"])
    eligible = [c for c in customers if c.get("whatsapp_opt_in") is not False]
    target_count = len(eligible)

    if used_today + target_count > DAILY_LIMIT:
        remaining = max(DAILY_LIMIT - used_today, 0)
        raise HTTPException(
            429,
            f"Daily limit exceeded. {remaining} of {DAILY_LIMIT} remaining today, need {target_count}.",
        )

    # Mark campaign as active
    await db.campaigns.update_one(
        {"id": campaign_id},
        {"$set": {"status": "active", "updated_at": datetime.now(timezone.utc).isoformat()}},
    )

    # Execute in background
    background_tasks.add_task(_execute_campaign_send, campaign_id, user)

    return {
        "campaign_id": campaign_id,
        "target_count": target_count,
        "opted_out_skipped": len(customers) - target_count,
        "message": f"Sending to {target_count} customers...",
    }


# ── History ──────────────────────────────────────────────────────────────

@router.get("/{campaign_id}/runs")
async def get_campaign_runs(campaign_id: str, user: dict = Depends(get_current_user)):
    runs = (
        await db.campaign_runs.find(
            {"campaign_id": campaign_id, "user_id": user["id"]}, {"_id": 0}
        )
        .sort("started_at", -1)
        .to_list(100)
    )
    return runs


@router.get("/history/all")
async def get_all_campaign_runs(
    days: int = 30,
    user: dict = Depends(get_current_user),
):
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    runs = (
        await db.campaign_runs.find(
            {"user_id": user["id"], "started_at": {"$gte": cutoff}}, {"_id": 0}
        )
        .sort("started_at", -1)
        .to_list(500)
    )
    return runs
