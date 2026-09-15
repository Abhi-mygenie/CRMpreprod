# CR-024 Phase 3 — Scheduled & Recurring Campaign Execution

> **Status**: `cr024_phase3_planning_draft`
> **Date**: 2026-06-07
> **Author**: E1 (session 6)
> **Depends on**: CR-024 Phase 1 (closed 2026-06-06) — execution engine, campaign+run schema, wizard UI all in place
> **Closes gaps**: G3 (no scheduled execution), G4 (no recurring execution) from CR-024 discovery
> **Effort estimate**: 1–1.5 days
> **Risk**: Medium — scheduler reliability, timezone handling, duplicate-fire prevention

---

## 1. Problem (What's broken today)

The "Schedule for Later" and "Recurring" radios in the Campaign Wizard are **visible and saveable** but **non-functional**:

| Path | Today's behaviour |
|------|-------------------|
| User picks "Send Now" → clicks Send | ✅ Works. `POST /campaigns/{id}/send` → `_execute_campaign_send()` fires immediately via FastAPI BackgroundTasks. |
| User picks "Schedule for Later" with date/time → clicks Send | ❌ **Bug**. Wizard still calls the same `/send` endpoint → fires NOW regardless of `scheduled_date`. The `scheduled_date` / `scheduled_time` are saved to DB but ignored. |
| User picks "Recurring" → clicks Send | ❌ **Bug**. Same as above — fires once now, no future runs. |
| Wizard payload | ❌ **Gap**. Only `scheduled_date` + `scheduled_time` are POSTed; recurring fields (`recurring_frequency`, `recurring_days`, `recurring_end_option` …) are saved as UI state but never sent to backend (see `CampaignWizardPage.jsx` lines 172-198). |

There is currently no background process that scans `db.campaigns` for due rows.

## 2. Existing infrastructure (what we can REUSE)

We do **NOT** need to build new scheduler infrastructure. Everything is in place:

| Component | Where | What it does |
|-----------|-------|--------------|
| `AsyncIOScheduler` instance | `core/scheduler.py:24` (`scheduler`) | Module-level singleton, lifecycle bound to FastAPI lifespan via `start_scheduler()` / `stop_scheduler()` |
| Lifespan wiring | `server.py:25, 92` | Already calls `start_scheduler()` on startup, `stop_scheduler()` on shutdown |
| Existing cron job | `daily_loyalty_jobs` @ `CronTrigger(hour=0, minute=0)` | Pattern we mirror exactly |
| Run log collection | `db.cron_job_logs` | We append rows here with `job_name="process_due_campaigns"` |
| Status endpoint | `GET /api/cron/status` | Auto-lists ALL registered jobs (no code change needed — it iterates `scheduler.get_jobs()`) |
| Manual trigger endpoint | `POST /api/cron/trigger` | Per-user manual fire (loyalty only today — we add per-campaign manual fire separately) |
| Campaign execution function | `routers/campaigns.py:159` (`_execute_campaign_send(campaign_id, user)`) | **Fully reusable as-is** — does AuthKey lookup, audience load, opted-out filter, send_bulk, log_message_attempt, campaign_runs insert, totals update |
| Schema fields | `routers/campaigns.py:60-100` | All 11 schedule fields already persisted on every campaign row (`schedule_type`, `scheduled_date`, `scheduled_time`, `recurring_frequency`, `recurring_days`, `recurring_day_of_month`, `recurring_end_option`, `recurring_end_date`, `recurring_occurrences`, `last_run_at`, `run_count`) |
| `db.campaigns` rows | 5 today | 1 scheduled draft ("June Loyalty Boost" 2026-06-08 10:00), 2 recurring (status=completed from seed data — recurring fields are NULL because seed predates wizard) |

## 3. Scope

### IN scope (this phase)

1. **Backend: new cron job** `process_due_campaigns()` that wakes every 1 minute, finds due scheduled+recurring campaigns, fires `_execute_campaign_send` for each, computes next occurrence for recurring or marks `status=completed` for one-time scheduled.
2. **Backend: helper** `compute_next_run_at()` — pure function that takes a campaign row + current time and returns the next `datetime` (or None if end conditions met) for daily / weekly / monthly recurrences.
3. **Backend: refactor `_execute_campaign_send` signature** — currently takes `user: dict`; cron job has no HTTP user. Change to `user_id: str` (load `user` doc inside if needed). All call sites updated (1 call site in `send_campaign` endpoint).
4. **Backend: refactor `/campaigns/{id}/send` semantics** — when `schedule_type ∈ {scheduled, recurring}`, do NOT fire immediately. Instead, validate, set `status=scheduled`/`active`, compute `next_run_at`, persist, return preview. Only `schedule_type=now` keeps current fire-immediately path.
5. **Backend: new field** `next_run_at` (ISO8601 UTC) on campaign rows — indexed for fast `$lte now` query. Backfill once for the 1 existing scheduled campaign.
6. **Backend: env safety flag** `CAMPAIGN_SCHEDULER_ENABLED` (default `false`). When false, job registers but `process_due_campaigns()` early-returns. Allows owner to flip on after smoke test.
7. **Backend: indexes** — `campaigns.next_run_at` (sparse, asc), `campaigns.(status, next_run_at)` compound.
8. **Frontend: wizard payload fix** — include all 7 recurring fields in `handleSave` and `handleSend` payloads. They already live in component state.
9. **Frontend: wizard send-button text + post-send toast** — when `schedule_type != "now"`, button reads "Schedule Campaign" (not "Send to N Customers") and success toast reads "Scheduled for {date} {time}" or "Recurring {freq} starting {date}".
10. **Frontend: campaign list status badges** — already supports `scheduled`/`active`/`completed`/`draft`/`failed`. No new code, just verify rendering for `scheduled`.
11. **Manual verification** — curl + Mongo + screenshot. No `testing_agent_v3` per owner handover.

### OUT of scope (Phase 4 or later)

- Cancel/pause scheduled campaign UI button (works via PUT today — UI surface can wait)
- Editing a campaign after it's `active`/`scheduled` (data model allows; UI guard rails later)
- Timezone-per-tenant (single global timezone for now — see §6 Q3)
- Catch-up logic for missed runs (e.g., server down for 1 hour) — we deliberately SKIP missed scheduled-one-time runs older than 24h to avoid spam; recurring just moves to next occurrence
- Webhook delivery status reconciliation on recurring runs (existing AuthKey delivery webhook continues to update `whatsapp_message_logs` rows tagged with `campaign_id`)
- A/B testing, campaign clone, resend-failed (Phase 4)

### Explicit non-goals

- ❌ No new scheduler library
- ❌ No new lifespan handler
- ❌ No new admin status endpoint (existing `/cron/status` already exposes new job)
- ❌ No re-architecture of `_execute_campaign_send` body — only signature change

## 4. Design

### 4.1 Tick frequency

`CronTrigger(minute='*')` — every minute. Justification:
- Owner UX expectation: "scheduled at 10:00" should fire by 10:00:59 latest
- 1-minute scan over `db.campaigns` with `status ∈ {scheduled, active}` is negligible (5 rows today, projected ≤ 1000 in 12 months)
- Loyalty job (00:00 daily) co-exists fine — different cron expression, both share the same `AsyncIOScheduler`

### 4.2 Data flow — one-time scheduled

```
Wizard
  POST /campaigns                     → status=draft, schedule_type=scheduled,
                                        scheduled_date/time, next_run_at=computed UTC ISO
  POST /campaigns/{id}/send           → validates audience/template/limit,
                                        sets status=scheduled (NOT active, NOT firing)
                                        toast: "Scheduled for ..."

(time passes)

Cron job process_due_campaigns (every 1 min)
  Query: { status: "scheduled", next_run_at: { $lte: now_iso } }
  For each:
    1. atomic claim: updateOne with current status → status=active (prevents double-fire)
       if matchedCount==0 → another worker grabbed it, skip
    2. call _execute_campaign_send(campaign_id, user_id)
       (existing logic creates campaign_run, sends bulk, logs, updates totals)
    3. _execute_campaign_send already sets status=completed at end
    4. update next_run_at = None (one-time, no next)
```

### 4.3 Data flow — recurring

```
Wizard
  POST /campaigns                     → status=draft, schedule_type=recurring,
                                        recurring_frequency=weekly,
                                        recurring_days=[Mon, Wed],
                                        scheduled_time=10:00,
                                        recurring_end_option=after_occurrences,
                                        recurring_occurrences=10,
                                        next_run_at=compute_next_run_at(...)
  POST /campaigns/{id}/send           → sets status=scheduled, next_run_at persisted
                                        toast: "Recurring weekly starting Mon 10:00"

Cron job process_due_campaigns (every 1 min)
  Query: { status: "scheduled", next_run_at: { $lte: now_iso } }
  For each recurring row:
    1. atomic claim: status=active (so within-tick double-fire blocked)
    2. call _execute_campaign_send(campaign_id, user_id)
       → creates campaign_run #N, sends, logs, sets campaign status=completed,
          increments run_count, sets last_run_at
    3. RECURRING POST-PROCESS:
       a. if run_count >= recurring_occurrences (after_occurrences end)
          OR datetime.now() > recurring_end_date (after_date end)
          → set status=completed (final), next_run_at=None — DONE
       b. else
          → compute next_run_at via compute_next_run_at()
          → set status=scheduled (back to waiting), next_run_at=new_value
```

> **Why atomic claim**: APScheduler shouldn't double-fire on a single instance, but defence-in-depth — if we ever scale to 2 backend pods, only one wins the claim.

### 4.4 `compute_next_run_at()` — pure function

```python
def compute_next_run_at(campaign: dict, now: datetime, tz: ZoneInfo) -> str | None:
    """
    Returns the next run datetime as UTC ISO8601 string, or None if end condition met.
    `now` should be timezone-aware UTC. `tz` is the campaign-local timezone (default Asia/Kolkata).

    Logic:
    - schedule_type="scheduled" (one-time):
        → datetime(scheduled_date + scheduled_time) localised to tz, converted to UTC.
          If already past, still return that exact time (will fire on next tick unless > 24h old).

    - schedule_type="recurring":
        time_of_day = parse(scheduled_time or "10:00")
        - daily:     next occurrence = today at time_of_day if not past, else +1 day
        - weekly:    iterate weekdays in recurring_days (["Mon","Tue"...]) → next matching
                     weekday at time_of_day not in past
        - monthly:   day_of_month from recurring_day_of_month → next month if past
                     (handle 31→last-day-of-month gracefully)

    - End conditions (return None):
        - after_date:        candidate > recurring_end_date
        - after_occurrences: campaign["run_count"] >= recurring_occurrences
        - never:             always returns next
    """
```

Edge cases:
- Empty `recurring_days` for weekly → treat as `["Mon"]` (sensible default)
- Feb 29 / day 31 monthly → roll back to month's last valid day
- DST is irrelevant for Asia/Kolkata (IST has no DST); helper uses `zoneinfo` to remain correct elsewhere.

### 4.5 Atomic claim pattern

```python
result = await db.campaigns.update_one(
    {"id": campaign_id, "status": "scheduled", "next_run_at": {"$lte": now_iso}},
    {"$set": {"status": "active", "claimed_at": now_iso}},
)
if result.modified_count == 0:
    continue  # someone else claimed it (or status changed)
```

### 4.6 Catch-up policy

| Scenario | Decision |
|----------|----------|
| Server down for 5 min, scheduled campaign was due | Fire on next tick (within 1 min of server up) — acceptable lag |
| Server down for 24h+, scheduled campaign was due | Skip — set `status=missed`, `error="stale: due more than 24h ago"`. Owner sees in UI. |
| Recurring, server down across N runs | Skip missed ones (do NOT batch-fire 7 runs), compute next future occurrence |

Threshold (24h) is a constant `MAX_SCHEDULE_LAG_HOURS = 24` in `core/campaign_jobs.py`.

### 4.7 Safety flag

```python
# core/campaign_jobs.py
SCHEDULER_ENABLED = os.getenv("CAMPAIGN_SCHEDULER_ENABLED", "false").lower() == "true"

async def process_due_campaigns():
    if not SCHEDULER_ENABLED:
        logger.debug("campaign scheduler disabled via env flag")
        return
    ...
```

Job still registers (visible in `/cron/status`) but body no-ops. Flip env + supervisor restart to enable.

## 5. File-by-file changes

### NEW: `backend/core/campaign_jobs.py` (~180 LoC)

```python
"""
CR-024 Phase 3: Background processor for scheduled and recurring campaigns.
"""
import os, logging
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

from core.database import db

logger = logging.getLogger(__name__)

DEFAULT_TZ = ZoneInfo(os.getenv("CAMPAIGN_TIMEZONE", "Asia/Kolkata"))
SCHEDULER_ENABLED = os.getenv("CAMPAIGN_SCHEDULER_ENABLED", "false").lower() == "true"
MAX_SCHEDULE_LAG_HOURS = 24

WEEKDAY_TO_INT = {"Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6}


def _parse_time_hhmm(s: str | None) -> tuple[int, int]:
    if not s: return (10, 0)
    h, m = s.split(":")[:2]
    return (int(h), int(m))


def compute_next_run_at(campaign: dict, now: datetime) -> str | None:
    """Returns next run UTC ISO, or None if end condition met."""
    tz = DEFAULT_TZ
    now_local = now.astimezone(tz)
    sch = campaign.get("schedule_type")

    if sch == "scheduled":
        date_str = campaign.get("scheduled_date")
        if not date_str: return None
        h, m = _parse_time_hhmm(campaign.get("scheduled_time"))
        dt_local = datetime.fromisoformat(date_str).replace(hour=h, minute=m, tzinfo=tz)
        return dt_local.astimezone(timezone.utc).isoformat()

    if sch == "recurring":
        # End condition: occurrences
        occ_limit = campaign.get("recurring_occurrences")
        if campaign.get("recurring_end_option") == "after_occurrences" and occ_limit:
            if campaign.get("run_count", 0) >= int(occ_limit):
                return None
        # End condition: date
        end_date_str = campaign.get("recurring_end_date")
        end_date_utc = None
        if campaign.get("recurring_end_option") == "after_date" and end_date_str:
            end_date_utc = datetime.fromisoformat(end_date_str).replace(
                hour=23, minute=59, tzinfo=tz
            ).astimezone(timezone.utc)

        h, m = _parse_time_hhmm(campaign.get("scheduled_time"))
        freq = campaign.get("recurring_frequency", "daily")

        candidate = now_local.replace(hour=h, minute=m, second=0, microsecond=0)
        if candidate <= now_local:
            candidate += timedelta(days=1)

        if freq == "daily":
            pass  # candidate already correct

        elif freq == "weekly":
            days = campaign.get("recurring_days") or ["Mon"]
            target_dows = {WEEKDAY_TO_INT[d] for d in days if d in WEEKDAY_TO_INT}
            if not target_dows:
                target_dows = {0}
            for _ in range(8):
                if candidate.weekday() in target_dows:
                    break
                candidate += timedelta(days=1)

        elif freq == "monthly":
            dom = int(campaign.get("recurring_day_of_month") or 1)
            # find next month's instance >= now_local
            candidate = now_local.replace(day=1, hour=h, minute=m, second=0, microsecond=0)
            for shift in range(0, 13):
                year = candidate.year + (candidate.month - 1 + shift) // 12
                month = (candidate.month - 1 + shift) % 12 + 1
                last_day = _last_day_of_month(year, month)
                day = min(dom, last_day)
                attempt = candidate.replace(year=year, month=month, day=day)
                if attempt > now_local:
                    candidate = attempt
                    break

        candidate_utc = candidate.astimezone(timezone.utc)
        if end_date_utc and candidate_utc > end_date_utc:
            return None
        return candidate_utc.isoformat()

    return None


def _last_day_of_month(year: int, month: int) -> int:
    if month == 12:
        next_m = datetime(year + 1, 1, 1)
    else:
        next_m = datetime(year, month + 1, 1)
    return (next_m - timedelta(days=1)).day


async def process_due_campaigns():
    """Cron tick — fires due scheduled/recurring campaigns. Runs every 1 minute."""
    if not SCHEDULER_ENABLED:
        return

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    lag_cutoff = (now - timedelta(hours=MAX_SCHEDULE_LAG_HOURS)).isoformat()

    due = await db.campaigns.find({
        "status": "scheduled",
        "next_run_at": {"$lte": now_iso, "$gte": lag_cutoff},
    }, {"_id": 0}).to_list(100)

    # Mark stale (missed >24h)
    await db.campaigns.update_many(
        {"status": "scheduled", "next_run_at": {"$lt": lag_cutoff}},
        {"$set": {"status": "missed", "updated_at": now_iso,
                  "error": f"Missed window: >{MAX_SCHEDULE_LAG_HOURS}h overdue"}},
    )

    fired = 0
    for camp in due:
        # Atomic claim
        claim = await db.campaigns.update_one(
            {"id": camp["id"], "status": "scheduled"},
            {"$set": {"status": "active", "claimed_at": now_iso}},
        )
        if claim.modified_count == 0:
            continue
        try:
            from routers.campaigns import _execute_campaign_send
            await _execute_campaign_send(camp["id"], camp["user_id"])
            # _execute_campaign_send sets status=completed, increments run_count, sets last_run_at

            # Recurring post-process
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
            logger.exception(f"Campaign {camp['id']} fire failed: {e}")
            await db.campaigns.update_one(
                {"id": camp["id"]},
                {"$set": {"status": "failed", "error": str(e),
                          "updated_at": datetime.now(timezone.utc).isoformat()}},
            )

    if fired:
        await db.cron_job_logs.insert_one({
            "job_name": "process_due_campaigns",
            "started_at": now_iso,
            "fired_count": fired,
            "due_count": len(due),
            "finished_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"process_due_campaigns: fired {fired}/{len(due)} due campaigns")
```

### EDIT: `backend/core/scheduler.py`

Insert after existing `daily_loyalty_jobs` registration (line 127):

```python
from core.campaign_jobs import process_due_campaigns

scheduler.add_job(
    process_due_campaigns,
    CronTrigger(minute='*'),  # every 1 min
    id="process_due_campaigns",
    name="CR-024 Process Due Campaigns (Scheduled + Recurring)",
    replace_existing=True,
)
logger.info("Campaign scheduler registered — every 1 min")
```

### EDIT: `backend/routers/campaigns.py`

**A. Refactor `_execute_campaign_send` signature** (line 159):

```python
# Before
async def _execute_campaign_send(campaign_id: str, user: dict):

# After
async def _execute_campaign_send(campaign_id: str, user_id: str):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "restaurant_name": 1,
        "einvoice_link": 1, "instagram_link": 1, "google_review_link": 1, "feedback_link": 1})
    if not user:
        logger.error(f"User {user_id} not found for campaign {campaign_id}")
        return
    # rest unchanged, replace user["id"] with user_id where used
```

Update single call site (line 380):
```python
background_tasks.add_task(_execute_campaign_send, campaign_id, user["id"])
```

**B. Modify `/campaigns/{id}/send` to branch on `schedule_type`**:

```python
@router.post("/{campaign_id}/send")
async def send_campaign(campaign_id: str, background_tasks: BackgroundTasks,
                        user: dict = Depends(get_current_user)):
    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": user["id"]})
    if not campaign: raise HTTPException(404, "Campaign not found")

    sch_type = campaign.get("schedule_type", "now")

    # Common validation: audience + rate limit
    customers = await _resolve_audience_customers(user["id"], campaign["audience_id"])
    eligible = [c for c in customers if c.get("whatsapp_opt_in") is not False]
    target_count = len(eligible)
    used_today = await _get_daily_send_count(user["id"])
    if sch_type == "now" and used_today + target_count > DAILY_LIMIT:
        raise HTTPException(429, f"Daily limit exceeded ...")

    now_iso = datetime.now(timezone.utc).isoformat()

    if sch_type == "now":
        await db.campaigns.update_one({"id": campaign_id},
            {"$set": {"status": "active", "updated_at": now_iso}})
        background_tasks.add_task(_execute_campaign_send, campaign_id, user["id"])
        return {"campaign_id": campaign_id, "target_count": target_count,
                "opted_out_skipped": len(customers) - target_count,
                "schedule_type": "now", "message": f"Sending to {target_count} customers..."}

    # Scheduled or recurring path
    from core.campaign_jobs import compute_next_run_at
    next_at = compute_next_run_at(campaign, datetime.now(timezone.utc))
    if not next_at:
        raise HTTPException(400, "Cannot compute next run time — check schedule settings")
    await db.campaigns.update_one({"id": campaign_id},
        {"$set": {"status": "scheduled", "next_run_at": next_at, "updated_at": now_iso}})
    return {"campaign_id": campaign_id, "target_count": target_count,
            "opted_out_skipped": len(customers) - target_count,
            "schedule_type": sch_type, "next_run_at": next_at,
            "message": f"Campaign scheduled for {next_at}"}
```

**C. Add `next_run_at` index in `server.py` lifespan** (existing campaign index section ~line 84):

```python
await db.campaigns.create_index([("status", 1), ("next_run_at", 1)],
                                 name="idx_campaigns_status_next_run", sparse=True)
```

### EDIT: `frontend/src/pages/CampaignWizardPage.jsx`

**A. Include all recurring fields in payloads** (lines 172-198):

```jsx
const buildPayload = () => ({
    name: name.trim(),
    audience_id: audienceId, audience_name: audienceName, audience_count: audienceCount,
    template_id: templateId, template_name: templateName,
    variable_mappings: variableMappings, variable_modes: variableModes,
    menu_pick_resolved: menuPickResolved,
    schedule_type: scheduleType,
    scheduled_date: scheduledDate || null,
    scheduled_time: scheduledTime || null,
    recurring_frequency: scheduleType === "recurring" ? recurringFrequency : null,
    recurring_days: scheduleType === "recurring" ? recurringDays : null,
    recurring_day_of_month: scheduleType === "recurring" ? recurringDayOfMonth : null,
    recurring_end_option: scheduleType === "recurring" ? recurringEndOption : null,
    recurring_end_date: scheduleType === "recurring" ? recurringEndDate : null,
    recurring_occurrences: scheduleType === "recurring" ? recurringOccurrences : null,
});
// use buildPayload() in handleSave + handleSend
```

**B. Wizard state additions** — if missing in current code: `recurringDays`, `recurringDayOfMonth`, `recurringEndOption`, `recurringEndDate`, `recurringOccurrences`. (Audit shows wizard already has `recurringFrequency` and `scheduledTime`; will add the rest with sensible defaults `["Mon"]` / `1` / `"never"` / `null` / `null`.)

**C. Send-button label + toast** (~line 207-209):

```jsx
const labelText = scheduleType === "now"
    ? `Send to ${targetCount} Customers`
    : scheduleType === "scheduled"
    ? `Schedule Campaign`
    : `Start Recurring Campaign`;

// in handleSend's success toast:
toast.success(scheduleType === "now"
    ? `Sending to ${res.data.target_count} customers...`
    : scheduleType === "scheduled"
    ? `Scheduled for ${scheduledDate} at ${scheduledTime}`
    : `Recurring ${recurringFrequency} campaign started`);
```

### EDIT: `backend/.env`

Append (default OFF — owner flips on after smoke test):

```
CAMPAIGN_SCHEDULER_ENABLED=false
CAMPAIGN_TIMEZONE=Asia/Kolkata
```

## 6. Open questions for owner

| # | Question | Default if no answer |
|---|----------|----------------------|
| Q1 | Tick frequency — 1 min (precise) / 5 min / 15 min? | **1 min** |
| Q2 | Timezone — Asia/Kolkata (IST) for all tenants / per-tenant from profile / UTC? | **Asia/Kolkata** (single timezone, multi-tenant TZ deferred) |
| Q3 | Safety flag `CAMPAIGN_SCHEDULER_ENABLED` default OFF for cold-start safety, flip ON after smoke test — OK? | **OK** |
| Q4 | Catch-up policy — `MAX_SCHEDULE_LAG_HOURS=24` then mark `status=missed`, owner re-runs manually. OK? | **OK** |
| Q5 | Recurring "weekly" with empty `recurring_days` array → default to ["Mon"]? Or fail validation? | **Default to ["Mon"]** |
| Q6 | Recurring rate limit — should 1000/day enforce per-tick or per-campaign? E.g., recurring weekly with 2000-target audience — does it skip-with-warning or fire 1000 today + 1000 next tick? | **Per-tick check** — if `used_today + target_count > 1000`, skip this run, retry next day, log warning |
| Q7 | Manual "fire now" button on a scheduled campaign — needed in this phase or Phase 4? | **Phase 4** — owner can PUT `schedule_type=now` + POST `/send` manually if urgent |

## 7. Acceptance criteria

| # | Behaviour | Verify |
|---|-----------|--------|
| AC-1 | New `process_due_campaigns` job visible in `GET /api/cron/status` with `next_run` populated | curl |
| AC-2 | Scheduled campaign created with `scheduled_date=today`, `scheduled_time=now+2min` → fires within 1 min of due time | Mongo + WhatsApp log |
| AC-3 | One-time scheduled fires once → `status=completed`, `next_run_at=null`, `run_count=1`, `campaign_runs` has 1 row | Mongo |
| AC-4 | Recurring daily campaign with `recurring_occurrences=3` → fires 3 times on 3 successive ticks (testable by setting `scheduled_time` to "now" 3 times with 1-min interval), then `status=completed`, `next_run_at=null`, `run_count=3` | Mongo |
| AC-5 | Recurring weekly campaign with `recurring_days=["Mon","Wed"]` → `next_run_at` advances correctly across days | Unit test on `compute_next_run_at` |
| AC-6 | Stale scheduled (>24h old `next_run_at`) → `status=missed`, no fire, `error` populated | Mongo |
| AC-7 | `CAMPAIGN_SCHEDULER_ENABLED=false` → job present but no fires (verify via Mongo `last_run_at` unchanged for 5+ min) | env toggle + restart |
| AC-8 | Wizard "Schedule for Later" → toast "Scheduled for ..." (not "Sending to N customers") | screenshot |
| AC-9 | Existing "Send Now" path unchanged — 1 msg sent to abhishek jain still works (regression) | curl + WhatsApp log |
| AC-10 | Atomic claim — if 2 ticks fire simultaneously on same row, only 1 wins (mock with `update_one` returning modified_count=0) | unit test or skipped (single-pod) |
| AC-11 | `/cron/status` shows `last_run_summary` reflecting new job runs | curl |
| AC-12 | Existing 1 scheduled draft "June Loyalty Boost" 2026-06-08 10:00 — verify `next_run_at` backfilled on first server start | one-off migration check |

## 8. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Live WhatsApp sends fire by accident during dev | Env flag `CAMPAIGN_SCHEDULER_ENABLED=false` default; owner enables manually |
| Cron tick stacks under high load (slow `_execute_campaign_send`) | APScheduler default `coalesce=True, max_instances=1` — only 1 instance of `process_due_campaigns` runs at a time. We rely on this default. |
| Recurring campaign fires forever if compute returns same `next_run_at` | `compute_next_run_at` always adds at least 1 day or 1 week from `now`, never reuses past time |
| Timezone bug — IST scheduled "10:00" fires at 04:30 UTC ✓; bug would be firing at 10:00 UTC (5.5h late) | Unit test on `compute_next_run_at` with explicit `Asia/Kolkata` |
| Atomic claim race when status changed by user (e.g., delete) | Claim query includes `status="scheduled"` → if user deletes, modified_count=0, skip silently |
| Recurring campaign with end_date in past at creation time | `compute_next_run_at` returns None at validation → `/send` returns 400 |
| Backfill of `next_run_at` for existing 1 scheduled draft | One-time migration: on first server start, find all `schedule_type="scheduled"` with `next_run_at=null` and compute. Idempotent. |

## 9. Test plan (manual — no testing_agent per owner)

### Curl flow
```bash
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2)

# 1. Login
TOKEN=$(curl -s -X POST "$API/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"owner@kunafamahal.com","password":"Qplazm@10"}' | jq -r .access_token)

# 2. Cron status — confirm new job
curl -s "$API/api/cron/status" -H "Authorization: Bearer $TOKEN" | jq

# 3. Create scheduled campaign for 2 min from now
NOW_PLUS_2=$(date -u -d "+2 minutes" +%H:%M)
TODAY=$(date -u +%Y-%m-%d)
curl -s -X POST "$API/api/campaigns" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{
    "name":"AC-2 smoke test", "audience_id":"all-customers",
    "template_id":"35820", "template_name":"birthday_test",
    "schedule_type":"scheduled",
    "scheduled_date":"'$TODAY'", "scheduled_time":"'$NOW_PLUS_2'",
    "variable_mappings":{"1":"customer.name"} }' | jq -r .id > /tmp/cid

# 4. Confirm send (sets status=scheduled, next_run_at)
curl -s -X POST "$API/api/campaigns/$(cat /tmp/cid)/send" -H "Authorization: Bearer $TOKEN" | jq

# 5. Wait 3 minutes
sleep 180

# 6. Verify it fired
curl -s "$API/api/campaigns/$(cat /tmp/cid)" -H "Authorization: Bearer $TOKEN" | \
  jq '{status, run_count, last_run_at, next_run_at}'

# 7. Verify campaign_run row
curl -s "$API/api/campaigns/$(cat /tmp/cid)/runs" -H "Authorization: Bearer $TOKEN" | jq

# 8. Cleanup
curl -s -X DELETE "$API/api/campaigns/$(cat /tmp/cid)" -H "Authorization: Bearer $TOKEN"
```

### Unit test for `compute_next_run_at`

Create `backend/tests/test_campaign_jobs.py` with 8 cases:
1. Scheduled one-time future → returns that UTC ISO
2. Scheduled one-time past → returns that UTC ISO (will fire next tick)
3. Recurring daily 10:00 IST when now=12:00 IST → tomorrow 10:00 IST in UTC
4. Recurring weekly ["Mon","Wed"] when today=Tue → tomorrow Wed
5. Recurring monthly day=31 when next month=Feb → Feb 28/29
6. Recurring end_option=after_occurrences, run_count=N → returns None
7. Recurring end_option=after_date, candidate>end_date → returns None
8. Empty recurring_days for weekly → defaults to ["Mon"]

Run: `pytest backend/tests/test_campaign_jobs.py -v`

### Frontend smoke

1. Wizard → "Schedule for Later" → date today, time +5 min → save → see Draft badge with "Scheduled" sub-status
2. Click "Schedule Campaign" → toast "Scheduled for YYYY-MM-DD at HH:MM"
3. Wait → CampaignsPage refresh → status changes to "active" then "completed"
4. CampaignHistoryPage → new row appears

## 10. Rollback plan

If anything goes wrong post-deploy:

```bash
# 1. Disable
echo "CAMPAIGN_SCHEDULER_ENABLED=false" >> /app/backend/.env
sudo supervisorctl restart backend

# 2. (optional) Reset any auto-scheduled rows back to draft
mongosh "$MONGO_URL" --eval '
  db.campaigns.updateMany(
    { status: { $in: ["scheduled","active","missed"] }, schedule_type: { $ne: "now" } },
    { $set: { status: "draft" }, $unset: { next_run_at:"", claimed_at:"" } }
  )'
```

No data destruction — `campaign_runs` history preserved either way.

## 11. Deliverables checklist

- [ ] `backend/core/campaign_jobs.py` (new, ~180 LoC)
- [ ] `backend/core/scheduler.py` (+6 lines)
- [ ] `backend/routers/campaigns.py` (signature + send branch + ~50 net lines changed)
- [ ] `backend/server.py` (+1 index line)
- [ ] `backend/.env` (+2 lines)
- [ ] `backend/tests/test_campaign_jobs.py` (new, ~80 LoC, 8 unit tests)
- [ ] `frontend/src/pages/CampaignWizardPage.jsx` (~30 net lines: payload + button label + toast + 4 state vars)
- [ ] Mongo migration: backfill `next_run_at` for 1 existing scheduled draft + index
- [ ] Manual curl + Mongo verification per §9
- [ ] Update `/app/memory/PRD.md` + `CR_STATUS_DASHBOARD.md` (CR-024 → Phase 3 IMPLEMENTED + verified)

## 12. Effort & sequence

| Step | Time | Sequence |
|------|------|----------|
| `compute_next_run_at` + 8 unit tests | 30 min | 1 |
| `process_due_campaigns` + scheduler wiring | 30 min | 2 |
| `_execute_campaign_send` signature refactor | 15 min | 3 |
| `/send` endpoint branch | 20 min | 4 |
| Index + backfill | 10 min | 5 |
| Frontend payload + button + toast | 25 min | 6 |
| Manual curl smoke (AC-2 / AC-9) | 30 min | 7 |
| Doc updates | 10 min | 8 |
| **Total** | **~2.5 hours** | |

---

**End of planning doc. Awaiting owner Q1-Q7 answers or "go with defaults".**
