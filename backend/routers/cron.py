"""
Admin endpoints for monitoring and manually triggering cron jobs.
"""
from fastapi import APIRouter, Depends
from datetime import datetime, timezone

from core.auth import get_current_user
from core.database import db
from core.scheduler import daily_loyalty_jobs, last_run_results, scheduler
from core.loyalty_jobs import (
    run_birthday_bonus,
    run_anniversary_bonus,
    run_expiry_reminders,
    run_points_expiry,
)

router = APIRouter(prefix="/cron", tags=["Cron Jobs"])


@router.get("/status")
async def get_scheduler_status(user: dict = Depends(get_current_user)):
    """Get the current status of the cron scheduler and last run results."""
    jobs = []
    for job in scheduler.get_jobs():
        jobs.append({
            "id": job.id,
            "name": job.name,
            "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
        })

    # Get last 5 cron job logs from DB
    recent_logs = await db.cron_job_logs.find(
        {}, {"_id": 0}
    ).sort("started_at", -1).limit(5).to_list(5)

    return {
        "scheduler_running": scheduler.running,
        "scheduled_jobs": jobs,
        "last_run_summary": last_run_results.get("daily_loyalty_jobs"),
        "recent_logs": recent_logs,
    }


@router.post("/trigger")
async def trigger_all_jobs(user: dict = Depends(get_current_user)):
    """Manually trigger all daily loyalty jobs for the current user."""
    settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    if not settings:
        return {"message": "No loyalty settings found for this user"}

    bday = await run_birthday_bonus(user["id"], settings)
    anniv = await run_anniversary_bonus(user["id"], settings)
    reminders = await run_expiry_reminders(user["id"], settings)
    expiry = await run_points_expiry(user["id"], settings)

    return {
        "message": "All loyalty jobs executed for your account",
        "triggered_at": datetime.now(timezone.utc).isoformat(),
        "birthday_bonus": bday,
        "anniversary_bonus": anniv,
        "expiry_reminders": reminders,
        "points_expiry": expiry,
    }


@router.post("/trigger-all-users")
async def trigger_all_users_jobs(user: dict = Depends(get_current_user)):
    """Manually trigger the full daily cron job for ALL users (admin-level)."""
    result = await daily_loyalty_jobs()
    return {"message": "Daily loyalty jobs executed for all users", "result": result}
