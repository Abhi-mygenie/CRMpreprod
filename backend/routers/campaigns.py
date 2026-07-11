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


# CR-036 B.1: template media lookup for campaign sends
async def _get_template_send_media(user_id: str, template_id: str):
    """Return (send_media_url, send_media_filename, header_type) for a template."""
    tpl = await db.custom_templates.find_one(
        {"user_id": user_id, "authkey_wid": template_id},
        {"send_media_url": 1, "send_media_filename": 1, "header_type": 1, "needs_media_reupload": 1},
    )
    if not tpl:
        tpl = await db.custom_templates.find_one(
            {"user_id": user_id, "id": template_id},
            {"send_media_url": 1, "send_media_filename": 1, "header_type": 1, "needs_media_reupload": 1},
        )
    if not tpl:
        return None, None, None
    ht = tpl.get("header_type")
    if ht not in ("image", "video", "document"):
        return None, None, None
    url = tpl.get("send_media_url")
    fname = tpl.get("send_media_filename") or "file"
    return url, fname, ht


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
        query = await build_customer_query(user_id, segment.get("filters", {}))
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

    # CR-024 Phase 4 P4.9: Edit-while-scheduled guard.
    # Locked when campaign is in scheduled/active/paused state — only template
    # config and name may change; audience and schedule are immutable until pause.
    LOCKED_WHEN_SCHEDULED = {
        "audience_id", "audience_name", "audience_count",
        "schedule_type", "scheduled_date", "scheduled_time",
        "recurring_frequency", "recurring_days", "recurring_day_of_month",
        "recurring_end_option", "recurring_end_date", "recurring_occurrences",
    }
    if campaign.get("status") in ("scheduled", "active"):
        blocked = LOCKED_WHEN_SCHEDULED & set(updates.keys())
        # Only block if the value actually changes (allow no-op PUTs from wizard re-save)
        actually_changed = {k for k in blocked if updates.get(k) != campaign.get(k)}
        if actually_changed:
            raise HTTPException(
                409,
                f"Cannot change {sorted(actually_changed)} on a {campaign['status']} campaign. "
                f"Pause it first to edit audience or schedule."
            )

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

async def _execute_campaign_send(campaign_id: str, user_id: str):
    """Background task: send campaign messages.

    Accepts a user_id string (not a user dict) so it can be invoked from
    cron jobs that have no authenticated HTTP user context.
    """
    try:
        campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": user_id})
        if not campaign:
            logger.error(f"Campaign {campaign_id} not found for execution")
            return

        # 1. Get AuthKey API key
        api_key = await get_user_authkey(db, user_id)
        if not api_key:
            logger.error(f"No AuthKey API key for user {user_id}")
            await db.campaigns.update_one(
                {"id": campaign_id},
                {"$set": {"status": "failed", "updated_at": datetime.now(timezone.utc).isoformat()}},
            )
            return

        # 2. Get brand data for variable resolution
        user_doc = await db.users.find_one(
            {"id": user_id},
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
        customers = await _resolve_audience_customers(user_id, campaign["audience_id"])

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
            "user_id": user_id,
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

        # CR-036 B.1: fetch template media once before the loop
        _media_url, _media_fname, _media_ht = await _get_template_send_media(user_id, template_id)

        for cust in eligible:
            phone = (cust.get("phone") or "").replace(" ", "").replace("-", "")
            country_code = (cust.get("country_code") or "+91").replace("+", "")
            if not phone:
                continue

            # CR-036 B.1 G5: fail-loud for media templates missing send_media_url
            if _media_ht and not _media_url:
                await db.whatsapp_message_logs.insert_one({
                    "user_id": user_id,
                    "customer_id": cust.get("id"),
                    "customer_phone": phone,
                    "template_id": template_id,
                    "campaign_id": campaign_id,
                    "status": "failed",
                    "status_note": "media_missing",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "is_test": False,
                })
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
                media_url=_media_url,          # CR-036 B.1
                media_filename=_media_fname,   # CR-036 B.1
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
                    user_id,
                    cust.get("id"),
                    r["phone"],
                    "campaign_send",
                    template_id,
                    sr,
                    template_name=campaign.get("template_name"),
                    campaign_id=campaign_id,
                    country_code=cust.get("country_code", "91").replace("+", ""),
                    body_values=sr.response_data if not sr.success else None,
                    customer_name=cust.get("name"),
                    reference_type="campaign",
                    reference_id=run_id,
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

    sch_type = campaign.get("schedule_type", "now")

    # Common: load audience to compute target_count
    customers = await _resolve_audience_customers(user["id"], campaign["audience_id"])
    eligible = [c for c in customers if c.get("whatsapp_opt_in") is not False]
    target_count = len(eligible)
    now_iso = datetime.now(timezone.utc).isoformat()

    # ── Send Now: immediate fire ──────────────────────────────────────────
    if sch_type == "now":
        used_today = await _get_daily_send_count(user["id"])
        if used_today + target_count > DAILY_LIMIT:
            remaining = max(DAILY_LIMIT - used_today, 0)
            raise HTTPException(
                429,
                f"Daily limit exceeded. {remaining} of {DAILY_LIMIT} remaining today, need {target_count}.",
            )

        await db.campaigns.update_one(
            {"id": campaign_id},
            {"$set": {"status": "active", "updated_at": now_iso}},
        )
        background_tasks.add_task(_execute_campaign_send, campaign_id, user["id"])
        return {
            "campaign_id": campaign_id,
            "target_count": target_count,
            "opted_out_skipped": len(customers) - target_count,
            "schedule_type": "now",
            "message": f"Sending to {target_count} customers...",
        }

    # ── Scheduled / Recurring: compute next_run_at and persist ────────────
    from core.campaign_jobs import compute_next_run_at
    next_at = compute_next_run_at(campaign, datetime.now(timezone.utc))
    if not next_at:
        raise HTTPException(
            400,
            "Cannot compute next run time — verify schedule_type/date/recurring fields.",
        )

    await db.campaigns.update_one(
        {"id": campaign_id},
        {"$set": {
            "status": "scheduled",
            "next_run_at": next_at,
            "updated_at": now_iso,
        }},
    )
    return {
        "campaign_id": campaign_id,
        "target_count": target_count,
        "opted_out_skipped": len(customers) - target_count,
        "schedule_type": sch_type,
        "next_run_at": next_at,
        "message": f"Campaign scheduled — next run at {next_at}",
    }


# ── History ──────────────────────────────────────────────────────────────

@router.post("/{campaign_id}/test-send")
async def test_send_campaign(
    campaign_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
):
    """CR-024 Phase 4 P4.10: Send 1 test WhatsApp to a chosen phone before
    scheduling the full campaign. Uses a synthetic test customer (no DB row).
    Logged to campaign_test_sends collection (separate from campaign_runs).
    Does NOT count toward DAILY_LIMIT.
    """
    phone = (body.get("phone") or "").replace(" ", "").replace("-", "").lstrip("+")
    country_code = (body.get("country_code") or "91").replace("+", "")
    if not phone:
        raise HTTPException(400, "Phone is required")

    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": user["id"]})
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    if not campaign.get("template_id"):
        raise HTTPException(400, "Template not set on campaign")

    api_key = await get_user_authkey(db, user["id"])
    if not api_key:
        raise HTTPException(400, "AuthKey API key not configured for this tenant")

    # Brand data for variable resolution
    user_doc = await db.users.find_one(
        {"id": user["id"]},
        {"_id": 0, "restaurant_name": 1, "einvoice_link": 1,
         "instagram_link": 1, "google_review_link": 1, "feedback_link": 1},
    ) or {}
    brand_data = {
        "restaurant_name": user_doc.get("restaurant_name", ""),
        "einvoice_link": user_doc.get("einvoice_link", ""),
        "instagram_link": user_doc.get("instagram_link", ""),
        "google_review_link": user_doc.get("google_review_link", ""),
        "feedback_link": user_doc.get("feedback_link", ""),
    }

    # Synthetic test customer (won't be persisted, only used for variable resolution)
    test_customer = {
        "id": "test-recipient",
        "name": body.get("test_name") or "Test User",
        "phone": phone,
        "country_code": country_code,
        "tier": "Bronze",
        "total_points": 100,
        "total_visits": 1,
        "total_spent": 0,
        "email": "",
    }

    template_id = campaign.get("template_id", "")
    variable_mappings = campaign.get("variable_mappings", {})
    variable_modes = campaign.get("variable_modes", {})
    menu_pick_resolved = campaign.get("menu_pick_resolved", {})
    template_variables = list(variable_mappings.keys()) if variable_mappings else []

    body_values = build_body_values(
        template_variables,
        variable_mappings,
        test_customer,
        {},
        variable_modes=variable_modes,
        brand_data=brand_data,
        menu_pick_resolved=menu_pick_resolved,
    )

    # CR-036 B.1: attach media for test send
    _media_url, _media_fname, _media_ht = await _get_template_send_media(user["id"], template_id)
    if _media_ht and not _media_url:
        raise HTTPException(status_code=400, detail="Template media missing — re-upload header file before test send.")

    msg = WhatsAppMessage(
        phone=phone,
        country_code=country_code,
        template_id=template_id,
        body_values=body_values,
        customer_id="test-recipient",
        media_url=_media_url,          # CR-036 B.1
        media_filename=_media_fname,   # CR-036 B.1
    )
    bulk_result = await send_bulk_messages(api_key, [msg])
    result = (bulk_result.get("results") or [{}])[0]

    # Log to whatsapp_message_logs for Message Status dashboard visibility
    from core.whatsapp import SendResult as _SR
    _test_sr = _SR(
        success=bool(result.get("success")),
        phone=phone,
        message_id=result.get("message_id"),
        error=result.get("error"),
        http_status=result.get("http_status"),
        raw_response=result.get("raw_response"),
    )
    await log_message_attempt(
        db, user["id"], "test-recipient", phone,
        "campaign_test", template_id, _test_sr,
        template_name=campaign.get("template_name"),
        campaign_id=campaign_id,
        country_code=country_code,
        body_values=body_values,
        customer_name=test_customer.get("name"),
        is_test=True,
        channel="wp",
    )

    # Persist test send for audit (separate collection — no campaign_runs impact)
    await db.campaign_test_sends.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "campaign_id": campaign_id,
        "campaign_name": campaign.get("name", ""),
        "template_id": template_id,
        "template_name": campaign.get("template_name", ""),
        "phone": phone,
        "country_code": country_code,
        "success": bool(result.get("success")),
        "message_id": result.get("message_id"),
        "error": result.get("error"),
        "http_status": result.get("http_status"),
        "body_values": body_values,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    return {
        "success": bool(result.get("success")),
        "message_id": result.get("message_id"),
        "error": result.get("error"),
        "phone": f"+{country_code}{phone}",
    }


# ── CR-024 Phase 4 P4.6: Pause / Resume ──────────────────────────────────

@router.post("/{campaign_id}/pause")
async def pause_campaign(campaign_id: str, user: dict = Depends(get_current_user)):
    """Pause a scheduled/active campaign. In-flight asyncio tasks continue
    (Option A — see CR-024 Phase 4 plan Q4); future fires are skipped.
    """
    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": user["id"]})
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    if campaign.get("status") not in ("scheduled", "active"):
        raise HTTPException(
            409,
            f"Cannot pause — campaign is '{campaign.get('status')}'. "
            f"Only scheduled or active campaigns can be paused."
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.campaigns.update_one(
        {"id": campaign_id},
        {"$set": {
            "status": "paused",
            "previous_schedule_type": campaign.get("schedule_type"),
            "paused_at": now_iso,
            "updated_at": now_iso,
        }},
    )
    return {
        "campaign_id": campaign_id,
        "status": "paused",
        "message": "Campaign paused. Future fires will be skipped. Any in-flight send will complete.",
    }


@router.post("/{campaign_id}/resume")
async def resume_campaign(campaign_id: str, user: dict = Depends(get_current_user)):
    """Resume a paused campaign. Recomputes next_run_at from current time."""
    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": user["id"]})
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    if campaign.get("status") != "paused":
        raise HTTPException(409, f"Cannot resume — campaign is '{campaign.get('status')}', not paused.")

    sch_type = campaign.get("schedule_type", "now")
    now_iso = datetime.now(timezone.utc).isoformat()

    if sch_type == "now":
        # Immediate-send campaign that was paused before firing — re-mark as draft
        await db.campaigns.update_one(
            {"id": campaign_id},
            {"$set": {"status": "draft", "updated_at": now_iso},
             "$unset": {"paused_at": "", "previous_schedule_type": ""}},
        )
        return {"campaign_id": campaign_id, "status": "draft",
                "message": "Campaign returned to draft. Use Send Now to fire."}

    # Scheduled / recurring — recompute next_run_at
    from core.campaign_jobs import compute_next_run_at
    next_at = compute_next_run_at(campaign, datetime.now(timezone.utc))
    update = {"status": "scheduled", "updated_at": now_iso}
    if next_at:
        update["next_run_at"] = next_at

    await db.campaigns.update_one(
        {"id": campaign_id},
        {"$set": update, "$unset": {"paused_at": "", "previous_schedule_type": ""}},
    )

    if not next_at:
        # End conditions exhausted (e.g., recurring_occurrences already met)
        await db.campaigns.update_one(
            {"id": campaign_id},
            {"$set": {"status": "completed", "next_run_at": None}},
        )
        return {"campaign_id": campaign_id, "status": "completed",
                "message": "Campaign ended — no future occurrences."}

    return {
        "campaign_id": campaign_id,
        "status": "scheduled",
        "next_run_at": next_at,
        "message": f"Resumed. Next run at {next_at}",
    }


# ── CR-024 Phase 4 P4.7: Clone ──────────────────────────────────────────

@router.post("/{campaign_id}/clone")
async def clone_campaign(campaign_id: str, user: dict = Depends(get_current_user)):
    src = await db.campaigns.find_one({"id": campaign_id, "user_id": user["id"]}, {"_id": 0})
    if not src:
        raise HTTPException(404, "Campaign not found")
    now = datetime.now(timezone.utc).isoformat()
    clone = {
        **src,
        "id": str(uuid.uuid4()),
        "name": f"{src['name']} (copy)",
        "status": "draft",
        "schedule_type": "now",
        "scheduled_date": None, "scheduled_time": None,
        "recurring_frequency": None, "recurring_days": None,
        "recurring_day_of_month": None, "recurring_end_option": None,
        "recurring_end_date": None, "recurring_occurrences": None,
        "next_run_at": None, "claimed_at": None, "paused_at": None,
        "previous_schedule_type": None,
        "total_sent": 0, "total_delivered": 0, "total_read": 0, "total_failed": 0,
        "run_count": 0, "last_run_at": None, "error": None,
        "created_at": now, "updated_at": now,
    }
    await db.campaigns.insert_one(clone)
    clone.pop("_id", None)
    return clone


# ── CR-024 Phase 4 P4.8: Resend Failed ──────────────────────────────────

@router.post("/{campaign_id}/runs/{run_id}/resend-failed")
async def resend_failed(
    campaign_id: str,
    run_id: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    """Re-fire only the phones that failed in a given campaign_run.
    Creates a NEW campaign_run with parent_run_id linkage. Hard cap of 5
    retry chains to prevent infinite loops."""
    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": user["id"]})
    if not campaign:
        raise HTTPException(404, "Campaign not found")

    # Hard cap on retry depth
    retry_count = await db.campaign_runs.count_documents({"parent_run_id": run_id})
    if retry_count >= 5:
        raise HTTPException(429, "Maximum retry attempts (5) reached for this run")

    failed_logs = await db.whatsapp_message_logs.find({
        "user_id": user["id"],
        "campaign_id": run_id,  # campaign_id field in logs == campaign_run.id
        "status": {"$in": ["failed", "Failed", "FAILED"]},
    }, {"_id": 0, "phone": 1, "customer_id": 1, "country_code": 1}).to_list(2000)

    if not failed_logs:
        raise HTTPException(400, "No failed messages found in this run")

    # Dedupe by phone
    seen = set()
    targets = []
    for lg in failed_logs:
        p = lg.get("phone")
        if p and p not in seen:
            seen.add(p)
            targets.append(lg)

    background_tasks.add_task(_execute_resend_subset, campaign_id, run_id, targets, user["id"])
    return {"resending_count": len(targets), "parent_run_id": run_id}


async def _execute_resend_subset(campaign_id: str, parent_run_id: str, targets: list, user_id: str):
    """Re-fire campaign send for a phone subset. Mirrors _execute_campaign_send
    but operates on phones from a previous failed run (not the campaign audience)."""
    try:
        campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": user_id})
        if not campaign:
            return

        api_key = await get_user_authkey(db, user_id)
        if not api_key:
            logger.error(f"No AuthKey for resend on campaign {campaign_id}")
            return

        user_doc = await db.users.find_one(
            {"id": user_id},
            {"_id": 0, "restaurant_name": 1, "einvoice_link": 1,
             "instagram_link": 1, "google_review_link": 1, "feedback_link": 1},
        ) or {}
        brand_data = {k: user_doc.get(k, "") for k in
            ["restaurant_name", "einvoice_link", "instagram_link", "google_review_link", "feedback_link"]}

        # Load customers for variable resolution
        phones = [t["phone"] for t in targets]
        customers = await db.customers.find(
            {"user_id": user_id, "phone": {"$in": phones}},
            {"_id": 0},
        ).to_list(2000)
        cust_by_phone = {c.get("phone"): c for c in customers}

        now = datetime.now(timezone.utc).isoformat()
        new_run_id = str(uuid.uuid4())
        run_doc = {
            "id": new_run_id,
            "campaign_id": campaign_id,
            "parent_run_id": parent_run_id,  # P4.8 linkage
            "campaign_name": f"{campaign['name']} (resend failed)",
            "user_id": user_id,
            "audience_id": campaign["audience_id"],
            "audience_name": campaign.get("audience_name", ""),
            "template_name": campaign.get("template_name", ""),
            "audience_count": len(targets),
            "opted_out_skipped": 0,
            "target_count": len(targets),
            "total_sent": 0, "total_delivered": 0, "total_read": 0, "total_failed": 0,
            "status": "running",
            "started_at": now, "completed_at": None, "error": None,
            "is_resend": True,
        }
        await db.campaign_runs.insert_one(run_doc)

        template_id = campaign.get("template_id", "")
        variable_mappings = campaign.get("variable_mappings", {})
        variable_modes = campaign.get("variable_modes", {})
        menu_pick_resolved = campaign.get("menu_pick_resolved", {})
        template_variables = list(variable_mappings.keys()) if variable_mappings else []

        messages = []
        customer_map = {}

        # CR-036 B.1: fetch template media once before the loop
        _media_url, _media_fname, _media_ht = await _get_template_send_media(user["id"], template_id)

        for t in targets:
            phone = (t.get("phone") or "").replace(" ", "").replace("-", "")
            country_code = (t.get("country_code") or "91").replace("+", "")
            if not phone:
                continue

            # CR-036 B.1 G5: fail-loud for media templates missing send_media_url
            if _media_ht and not _media_url:
                await db.whatsapp_message_logs.insert_one({
                    "user_id": user["id"],
                    "customer_id": t.get("customer_id"),
                    "customer_phone": phone,
                    "template_id": template_id,
                    "campaign_id": campaign_id,
                    "status": "failed",
                    "status_note": "media_missing",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "is_test": False,
                })
                continue

            cust = cust_by_phone.get(phone, {"name": "", "phone": phone})
            body_values = build_body_values(
                template_variables, variable_mappings, cust, {},
                variable_modes=variable_modes, brand_data=brand_data,
                menu_pick_resolved=menu_pick_resolved,
            )
            messages.append(WhatsAppMessage(
                phone=phone, country_code=country_code,
                template_id=template_id, body_values=body_values,
                customer_id=cust.get("id"),
                media_url=_media_url,          # CR-036 B.1
                media_filename=_media_fname,   # CR-036 B.1
            ))
            customer_map[phone] = cust

        sent_count = 0
        failed_count = 0
        if messages:
            bulk_result = await send_bulk_messages(api_key, messages)
            for r in bulk_result.get("results", []):
                from core.whatsapp import SendResult
                sr = SendResult(
                    success=r["success"], phone=r["phone"],
                    message_id=r.get("message_id"), error=r.get("error"),
                    http_status=r.get("http_status"), raw_response=r.get("raw_response"),
                )
                cust = customer_map.get(r["phone"], {})
                await log_message_attempt(
                    db, user_id, cust.get("id"), r["phone"], "campaign_resend",
                    template_id, sr, template_name=campaign.get("template_name"),
                    campaign_id=campaign_id,
                    country_code=cust.get("country_code", "91").replace("+", ""),
                    body_values=sr.response_data if not sr.success else None,
                    customer_name=cust.get("name"),
                    reference_type="campaign_resend", reference_id=new_run_id,
                )
                if r["success"]:
                    sent_count += 1
                else:
                    failed_count += 1

        completed_at = datetime.now(timezone.utc).isoformat()
        await db.campaign_runs.update_one(
            {"id": new_run_id},
            {"$set": {"total_sent": sent_count, "total_failed": failed_count,
                      "status": "completed", "completed_at": completed_at}},
        )
        # Update parent campaign totals (resends add to lifetime totals)
        await db.campaigns.update_one(
            {"id": campaign_id},
            {"$inc": {"total_sent": sent_count, "total_failed": failed_count}},
        )
        logger.info(f"Resend campaign {campaign_id} run={new_run_id}: sent={sent_count} failed={failed_count}")
    except Exception as e:
        logger.exception(f"Resend failed for {campaign_id}/{parent_run_id}: {e}")


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
