"""
APScheduler-based cron scheduler for automated loyalty jobs.
Runs daily for all users: birthday bonus, anniversary bonus, expiry reminders, points expiry.
"""
import asyncio
import logging
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from core.database import db
from core.loyalty_jobs import (
    run_birthday_bonus,
    run_anniversary_bonus,
    run_expiry_reminders,
    run_points_expiry,
)

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

# Store last run results for status endpoint
last_run_results = {}


async def _get_all_users_with_settings():
    """Fetch all users and their loyalty settings."""
    users = await db.users.find({}, {"_id": 0, "id": 1}).to_list(10000)
    result = []
    for user in users:
        settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
        if settings:
            result.append((user["id"], settings))
    return result


async def daily_loyalty_jobs():
    """Master job that runs all loyalty tasks for every user."""
    start = datetime.now(timezone.utc)
    logger.info("=== Starting daily loyalty cron jobs ===")

    users_settings = await _get_all_users_with_settings()
    logger.info(f"Processing {len(users_settings)} users")

    summary = {
        "started_at": start.isoformat(),
        "users_processed": len(users_settings),
        "birthday": {"total_awarded": 0, "total_points": 0},
        "anniversary": {"total_awarded": 0, "total_points": 0},
        "expiry_reminders": {"total_reminded": 0},
        "expiry": {"total_expired": 0, "customers_affected": 0},
        "errors": [],
    }

    for user_id, settings in users_settings:
        try:
            # Birthday bonus
            bday = await run_birthday_bonus(user_id, settings)
            summary["birthday"]["total_awarded"] += bday["customers_awarded"]
            summary["birthday"]["total_points"] += bday["total_points_awarded"]

            # Anniversary bonus
            anniv = await run_anniversary_bonus(user_id, settings)
            summary["anniversary"]["total_awarded"] += anniv["customers_awarded"]
            summary["anniversary"]["total_points"] += anniv["total_points_awarded"]

            # Expiry reminders
            reminders = await run_expiry_reminders(user_id, settings)
            summary["expiry_reminders"]["total_reminded"] += reminders["customers_to_remind"]

            # Points expiry
            expiry = await run_points_expiry(user_id, settings)
            summary["expiry"]["total_expired"] += expiry["total_expired"]
            summary["expiry"]["customers_affected"] += expiry["customers_affected"]

        except Exception as e:
            logger.error(f"Error processing user {user_id}: {e}")
            summary["errors"].append({"user_id": user_id, "error": str(e)})

    end = datetime.now(timezone.utc)
    summary["finished_at"] = end.isoformat()
    summary["duration_seconds"] = (end - start).total_seconds()

    # Persist run log to DB
    await db.cron_job_logs.insert_one({
        "job_name": "daily_loyalty_jobs",
        "status": "completed",
        **summary
    })

    last_run_results["daily_loyalty_jobs"] = summary
    logger.info(f"=== Daily loyalty cron jobs finished in {summary['duration_seconds']:.1f}s ===")
    logger.info(f"  Birthday: {summary['birthday']['total_awarded']} awarded")
    logger.info(f"  Anniversary: {summary['anniversary']['total_awarded']} awarded")
    logger.info(f"  Expiry reminders: {summary['expiry_reminders']['total_reminded']} reminded")
    logger.info(f"  Expired: {summary['expiry']['total_expired']} points from {summary['expiry']['customers_affected']} customers")

    return summary


def start_scheduler():
    """Start the APScheduler with daily cron triggers."""
    # Run daily at 00:00 UTC (midnight) for birthday/anniversary/expiry
    scheduler.add_job(
        daily_loyalty_jobs,
        CronTrigger(hour=0, minute=0),
        id="daily_loyalty_jobs",
        name="Daily Loyalty Jobs (Birthday, Anniversary, Expiry)",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Loyalty cron scheduler started — daily jobs at 00:00 UTC (midnight)")


def stop_scheduler():
    """Gracefully shut down the scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Loyalty cron scheduler stopped")
