"""
CR-024 Phase 3: Background processor for scheduled and recurring campaigns.

This module wires into the existing AsyncIOScheduler (core/scheduler.py) and
processes due rows from db.campaigns every 1 minute.

Safety: gated by CAMPAIGN_SCHEDULER_ENABLED env flag (default OFF).
Timezone: campaign schedule fields are interpreted in CAMPAIGN_TIMEZONE
(default Asia/Kolkata) and stored as UTC ISO8601 in next_run_at.
"""
import os
import logging
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

from core.database import db

logger = logging.getLogger(__name__)

DEFAULT_TZ = ZoneInfo(os.environ['CAMPAIGN_TIMEZONE'])
MAX_SCHEDULE_LAG_HOURS = 24

WEEKDAY_TO_INT = {"Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6}


def _is_enabled() -> bool:
    """Read env flag every tick so owner can flip without restart (since
    .env values are loaded into os.environ once at process start, this
    effectively requires restart — but the function form keeps tests
    flexible)."""
    return os.environ.get("CAMPAIGN_SCHEDULER_ENABLED", "false").lower() == "true"


def _parse_time_hhmm(s):
    if not s:
        return (10, 0)
    try:
        parts = str(s).split(":")
        return (int(parts[0]), int(parts[1]))
    except (ValueError, IndexError):
        return (10, 0)


def _last_day_of_month(year: int, month: int) -> int:
    if month == 12:
        next_m = datetime(year + 1, 1, 1)
    else:
        next_m = datetime(year, month + 1, 1)
    return (next_m - timedelta(days=1)).day


def compute_next_run_at(campaign: dict, now: datetime):
    """Compute the next run datetime for a campaign.

    Returns a UTC ISO8601 string, or None if the end condition has been met
    or the campaign has no schedule.

    `now` must be a timezone-aware UTC datetime.
    """
    tz = DEFAULT_TZ
    now_local = now.astimezone(tz)
    sch = campaign.get("schedule_type")

    # ── One-time scheduled ────────────────────────────────────────────────
    if sch == "scheduled":
        date_str = campaign.get("scheduled_date")
        if not date_str:
            return None
        h, m = _parse_time_hhmm(campaign.get("scheduled_time"))
        try:
            d = datetime.fromisoformat(str(date_str)[:10])
        except ValueError:
            return None
        dt_local = d.replace(hour=h, minute=m, second=0, microsecond=0, tzinfo=tz)
        return dt_local.astimezone(timezone.utc).isoformat()

    # ── Recurring ─────────────────────────────────────────────────────────
    if sch == "recurring":
        # End condition: occurrences
        end_opt = campaign.get("recurring_end_option")
        occ_limit = campaign.get("recurring_occurrences")
        if end_opt == "after_occurrences" and occ_limit is not None:
            try:
                if int(campaign.get("run_count") or 0) >= int(occ_limit):
                    return None
            except (TypeError, ValueError):
                pass

        # End condition: end_date
        end_date_str = campaign.get("recurring_end_date")
        end_date_utc = None
        if end_opt == "after_date" and end_date_str:
            try:
                ed = datetime.fromisoformat(str(end_date_str)[:10])
                end_date_utc = ed.replace(
                    hour=23, minute=59, second=59, tzinfo=tz
                ).astimezone(timezone.utc)
            except ValueError:
                end_date_utc = None

        h, m = _parse_time_hhmm(campaign.get("scheduled_time"))
        freq = (campaign.get("recurring_frequency") or "daily").lower()

        # Build today's candidate at the configured time-of-day (local)
        candidate = now_local.replace(hour=h, minute=m, second=0, microsecond=0)
        if candidate <= now_local:
            candidate += timedelta(days=1)

        if freq == "daily":
            pass  # candidate already next occurrence

        elif freq == "weekly":
            days = campaign.get("recurring_days") or ["Mon"]
            target_dows = {WEEKDAY_TO_INT[d] for d in days if d in WEEKDAY_TO_INT}
            if not target_dows:
                target_dows = {0}
            # walk forward up to 7 days to find next matching weekday
            for _ in range(8):
                if candidate.weekday() in target_dows:
                    break
                candidate += timedelta(days=1)

        elif freq == "monthly":
            try:
                dom = int(campaign.get("recurring_day_of_month") or 1)
            except (TypeError, ValueError):
                dom = 1
            dom = max(1, min(dom, 31))
            # find next month-instance > now_local (handle short months by clamping)
            year, month = now_local.year, now_local.month
            for shift in range(0, 14):
                yy = year + (month - 1 + shift) // 12
                mm = (month - 1 + shift) % 12 + 1
                last_day = _last_day_of_month(yy, mm)
                day = min(dom, last_day)
                attempt = now_local.replace(
                    year=yy, month=mm, day=day, hour=h, minute=m, second=0, microsecond=0
                )
                if attempt > now_local:
                    candidate = attempt
                    break
        else:
            # unknown frequency — treat as daily
            pass

        candidate_utc = candidate.astimezone(timezone.utc)
        if end_date_utc and candidate_utc > end_date_utc:
            return None
        return candidate_utc.isoformat()

    return None


async def backfill_next_run_at():
    """One-time idempotent migration: populate next_run_at for any existing
    scheduled/recurring campaigns that don't have it set yet.

    Called from server.py lifespan startup once. Safe to call repeatedly.
    """
    now = datetime.now(timezone.utc)
    rows = await db.campaigns.find({
        "schedule_type": {"$in": ["scheduled", "recurring"]},
        "$or": [{"next_run_at": None}, {"next_run_at": {"$exists": False}}],
        "status": {"$in": ["draft", "scheduled", "active"]},
    }, {"_id": 0}).to_list(1000)

    updated = 0
    for camp in rows:
        next_at = compute_next_run_at(camp, now)
        if next_at:
            await db.campaigns.update_one(
                {"id": camp["id"]},
                {"$set": {"next_run_at": next_at}},
            )
            updated += 1
    if updated:
        logger.info(f"backfill_next_run_at: populated next_run_at on {updated} campaigns")
    return updated


async def process_due_campaigns():
    """Cron tick — fires due scheduled/recurring campaigns. Runs every 1 minute."""
    if not _is_enabled():
        logger.debug("campaign scheduler disabled via CAMPAIGN_SCHEDULER_ENABLED=false")
        return

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    lag_cutoff = (now - timedelta(hours=MAX_SCHEDULE_LAG_HOURS)).isoformat()

    # Mark stale (missed > MAX_SCHEDULE_LAG_HOURS)
    stale = await db.campaigns.update_many(
        {
            "status": "scheduled",
            "next_run_at": {"$lt": lag_cutoff},
        },
        {"$set": {
            "status": "missed",
            "updated_at": now_iso,
            "error": f"Missed window: more than {MAX_SCHEDULE_LAG_HOURS}h overdue",
        }},
    )
    if stale.modified_count:
        logger.warning(f"process_due_campaigns: marked {stale.modified_count} stale campaign(s) as missed")

    # Find due rows
    due = await db.campaigns.find({
        "status": "scheduled",
        "next_run_at": {"$gte": lag_cutoff, "$lte": now_iso},
    }, {"_id": 0}).to_list(100)

    if not due:
        return

    fired = 0
    skipped = 0
    failed = 0

    for camp in due:
        # Atomic claim — only the worker that flips status wins
        claim = await db.campaigns.update_one(
            {"id": camp["id"], "status": "scheduled"},
            {"$set": {
                "status": "active",
                "claimed_at": now_iso,
                "updated_at": now_iso,
            }},
        )
        if claim.modified_count == 0:
            skipped += 1
            logger.info(f"process_due_campaigns: skipped {camp['id']} — claimed elsewhere")
            continue

        try:
            # Reuse existing execution engine
            from routers.campaigns import _execute_campaign_send
            await _execute_campaign_send(camp["id"], camp["user_id"])
            # _execute_campaign_send sets status=completed, increments run_count, sets last_run_at

            # Recurring post-process — compute next or terminate
            if camp.get("schedule_type") == "recurring":
                fresh = await db.campaigns.find_one({"id": camp["id"]}, {"_id": 0})
                next_at = compute_next_run_at(fresh, datetime.now(timezone.utc))
                if next_at:
                    await db.campaigns.update_one(
                        {"id": camp["id"]},
                        {"$set": {
                            "status": "scheduled",
                            "next_run_at": next_at,
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                        }},
                    )
                else:
                    # End condition met — keep status=completed (set by _execute_campaign_send)
                    await db.campaigns.update_one(
                        {"id": camp["id"]},
                        {"$set": {"next_run_at": None}},
                    )
            else:
                # One-time scheduled — clear next_run_at
                await db.campaigns.update_one(
                    {"id": camp["id"]},
                    {"$set": {"next_run_at": None}},
                )
            fired += 1
        except Exception as e:
            failed += 1
            logger.exception(f"Campaign {camp['id']} fire failed: {e}")
            await db.campaigns.update_one(
                {"id": camp["id"]},
                {"$set": {
                    "status": "failed",
                    "error": str(e),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }},
            )

    summary = {
        "job_name": "process_due_campaigns",
        "started_at": now_iso,
        "due_count": len(due),
        "fired_count": fired,
        "skipped_count": skipped,
        "failed_count": failed,
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.cron_job_logs.insert_one(summary)
    logger.info(
        f"process_due_campaigns: due={len(due)} fired={fired} skipped={skipped} failed={failed}"
    )
