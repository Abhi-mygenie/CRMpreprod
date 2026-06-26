# CR-024: Segments & Marketing Campaigns — Full Implementation Report

## Change Request ID: CR-024
## Date: 2026-06-06 (Phase 1) + Phases 2-4 built across sessions
## Status: 🟢 ALL PHASES IMPLEMENTED — Gated by `CAMPAIGN_SCHEDULER_ENABLED`
## Retroactive documentation: 2026-06-18

---

## Summary

Full marketing campaign system: CRUD, execution engine (audience resolution → opt-out filter → 1000/day rate limit → variable resolution → bulk WhatsApp send → logging), scheduled one-time sends, recurring sends (daily/weekly/monthly with end conditions), pause/resume, clone, resend-failed, edit guards, and 4 frontend pages.

---

## Phase 1: Campaign CRUD + Execution Engine + Frontend

### Backend — `routers/campaigns.py` (872 LOC)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/campaigns` | Create campaign |
| `GET` | `/api/campaigns` | List campaigns for user |
| `GET` | `/api/campaigns/daily-limit` | Get daily send count vs 1000 limit |
| `GET` | `/api/campaigns/{id}` | Get single campaign |
| `PUT` | `/api/campaigns/{id}` | Update campaign |
| `DELETE` | `/api/campaigns/{id}` | Delete campaign |
| `POST` | `/api/campaigns/{id}/send` | Send campaign (immediate or schedule) |
| `POST` | `/api/campaigns/{id}/test-send` | Test send to single phone number |
| `POST` | `/api/campaigns/{id}/pause` | Pause scheduled/active campaign |
| `POST` | `/api/campaigns/{id}/resume` | Resume paused campaign |
| `POST` | `/api/campaigns/{id}/clone` | Clone campaign as new draft |
| `POST` | `/api/campaigns/{id}/resend-failed` | Resend to failed recipients |
| `GET` | `/api/campaigns/{id}/runs` | Get execution runs for campaign |
| `GET` | `/api/campaigns/runs/all` | Get all runs across campaigns |

### Execution Engine — `_execute_campaign_send()`
```
1. Load campaign + user
2. Resolve audience → get customers from segment
3. Filter: remove opted-out (whatsapp_opt_in=false OR promo_whatsapp_allowed=false)
4. Check daily limit (1000/day across all campaigns)
5. For each customer: resolve template variables
6. Bulk send via core/whatsapp.py send_bulk_messages()
7. Log results to campaign_runs collection
8. Update campaign stats (sent/delivered/read/failed counts, run_count, last_run_at)
9. Set status = completed (or failed if error)
```

### DB Collections
- `campaigns` — Campaign definitions + state machine (draft → scheduled → active → completed/failed/paused/missed)
- `campaign_runs` — Execution run logs with per-recipient results
- `campaign_test_sends` — Test send audit trail

### Frontend (4 pages, 1707 LOC total)

| Page | LOC | Features |
|---|---|---|
| `CampaignsPage.jsx` | 378 | 5 stat cards, filter tabs (All/Draft/Scheduled/Completed/Failed), campaign rows with delivery stats, dropdown menu (Edit/Clone/Pause/Resume/Delete) |
| `CampaignWizardPage.jsx` | 666 | 3-step wizard: (1) Name + Audience selector, (2) Template picker + variable mapping, (3) Schedule options + confirmation. Double-confirm modal for >500 recipients |
| `AudiencesPage.jsx` | 457 | 3-column grid of segment cards with customer counts + filter tags + "Create New Segment" card |
| `CampaignHistoryPage.jsx` | 206 | Table of execution runs with delivery percentage bars + timestamps |

### Sidebar Restructure
- `ResponsiveLayout.jsx` updated: WhatsApp group (Settings/Templates/Automation) + Marketing group (Campaigns/Audiences/History)

---

## Phase 2: Scheduled Campaigns (One-Time)

### Backend — `core/campaign_jobs.py` (291 LOC)

**`compute_next_run_at(campaign, now)`** — for `schedule_type="scheduled"`:
- Reads `scheduled_date` + `scheduled_time`
- Converts to UTC ISO8601
- Returns single future datetime

**`send_campaign()` in `routers/campaigns.py`**:
- `schedule_type="now"` → fires immediately via `background_tasks.add_task()`
- `schedule_type="scheduled"` → computes `next_run_at`, sets `status="scheduled"`, campaign waits for processor

---

## Phase 3: Recurring Campaigns

### Backend — `core/campaign_jobs.py`

**`compute_next_run_at(campaign, now)`** — for `schedule_type="recurring"`:

| Frequency | Logic |
|---|---|
| `daily` | Next day at configured time |
| `weekly` | Walk forward up to 7 days to find next matching weekday from `recurring_days` |
| `monthly` | Find next month with `recurring_day_of_month` (clamped to last day for short months) |

**End conditions:**
| Option | Logic |
|---|---|
| `never` | Runs indefinitely |
| `after_occurrences` | Stops after `run_count >= recurring_occurrences` |
| `after_date` | Stops if next candidate > `recurring_end_date` |

**`process_due_campaigns()`** — APScheduler job every 1 minute:
```
1. Check CAMPAIGN_SCHEDULER_ENABLED flag (skip if false)
2. Mark stale: campaigns with next_run_at > 24h ago → status="missed"
3. Find due: status="scheduled" AND next_run_at in [now-24h, now]
4. For each: atomic claim (update status→active, only winner proceeds)
5. Execute via _execute_campaign_send()
6. Recurring post-process: recompute next_run_at or terminate
7. Log to cron_job_logs
```

### Scheduler Registration — `core/scheduler.py`
```python
scheduler.add_job(
    process_due_campaigns,
    CronTrigger(minute="*"),  # every 1 minute
    id="process_due_campaigns",
    coalesce=True,
    max_instances=1,
)
```

### Startup Migration — `backfill_next_run_at()`
- Runs on server startup (lifespan)
- Finds scheduled/recurring campaigns with no `next_run_at`
- Computes and sets it (idempotent)

---

## Phase 4: Polish (Pause/Resume/Edit Guards/Clone/Resend)

### Pause — `POST /{id}/pause`
- Flips `status → "paused"`, records `paused_at`
- Only allowed from `scheduled` or `active` status
- In-flight asyncio tasks continue to completion

### Resume — `POST /{id}/resume`
- `schedule_type="now"` → returns to `draft`
- `schedule_type="scheduled"/"recurring"` → recomputes `next_run_at`, sets `status="scheduled"`
- If end conditions exhausted → sets `status="completed"`

### Edit Guard (P4.9)
- When campaign is `scheduled` or `active`: only `name` and template config fields can be changed
- `schedule_type`, `scheduled_date`, `recurring_*`, `audience_id` are locked
- Must pause first to change schedule/audience

### Clone — `POST /{id}/clone`
- Creates new campaign with `(Copy)` name suffix, resets stats, sets `status="draft"`

### Resend Failed — `POST /{id}/resend-failed`
- Reads failed recipients from latest campaign_run
- Re-executes send for those recipients only
- Creates new run linked to original campaign

---

## Tests — `tests/test_campaign_jobs.py` (168 LOC, 10 tests)

| Test | What it covers |
|---|---|
| `test_scheduled_one_time_future` | Scheduled date in future → returns correct UTC time |
| `test_scheduled_one_time_past` | Scheduled date in past → still returns (processor handles staleness) |
| `test_recurring_daily_before_time` | Daily recurring before configured time → same day |
| `test_recurring_daily_after_time` | Daily recurring after configured time → next day |
| `test_recurring_weekly_multiple_days` | Weekly with Mon+Thu → finds next matching weekday |
| `test_recurring_monthly_day_31_in_feb` | Monthly day 31 in February → clamps to 28/29 |
| `test_recurring_end_by_occurrences` | `run_count >= occurrences` → returns None (done) |
| `test_recurring_end_by_date_past` | End date in past → returns None (done) |
| `test_recurring_weekly_empty_days_defaults_monday` | Empty `recurring_days` → defaults to Monday |
| `test_unknown_schedule_type_returns_none` | Unknown type → None |

---

## Environment Gate

| Variable | Value | Effect |
|---|---|---|
| `CAMPAIGN_SCHEDULER_ENABLED` | `false` | `process_due_campaigns` is a no-op. All scheduled/recurring campaigns sit in `status="scheduled"` but never fire. |
| `CAMPAIGN_SCHEDULER_ENABLED` | `true` | Processor fires due campaigns every minute. |

**To activate**: Set `CAMPAIGN_SCHEDULER_ENABLED=true` in `.env` → `sudo supervisorctl restart backend`.

---

## QA Acceptance Criteria

| # | Criteria | How to Verify |
|---|---|---|
| AC1 | Create campaign | `POST /api/campaigns` → 200, campaign in DB with `status=draft` |
| AC2 | List campaigns | `GET /api/campaigns` → returns campaigns for user only |
| AC3 | Send Now (immediate) | `POST /api/campaigns/{id}/send` with `schedule_type=now` → fires immediately, run logged |
| AC4 | Daily limit enforcement | Send > 1000 in a day → 429 error |
| AC5 | Opt-out filtering | Customer with `whatsapp_opt_in=false` → excluded from send |
| AC6 | Test send | `POST /api/campaigns/{id}/test-send` → sends to single phone |
| AC7 | Scheduled one-time | `schedule_type=scheduled`, future date → `status=scheduled`, `next_run_at` set |
| AC8 | Recurring daily | `schedule_type=recurring`, `frequency=daily` → `next_run_at` computed for next day |
| AC9 | Recurring weekly | `frequency=weekly`, `days=["Mon","Thu"]` → next matching weekday |
| AC10 | Recurring monthly | `frequency=monthly`, `day_of_month=31` → clamps to last day of short months |
| AC11 | Recurring end by occurrences | After N runs → `compute_next_run_at` returns None |
| AC12 | Recurring end by date | Past end_date → returns None |
| AC13 | Processor fires due campaigns | (Requires `CAMPAIGN_SCHEDULER_ENABLED=true`) → due campaign executes |
| AC14 | Stale detection | Campaign > 24h overdue → marked `status=missed` |
| AC15 | Atomic claim (no double-fire) | Only one worker claims a campaign |
| AC16 | Pause campaign | `POST /{id}/pause` → `status=paused` |
| AC17 | Resume campaign | `POST /{id}/resume` → `status=scheduled`, `next_run_at` recomputed |
| AC18 | Edit guard | Edit `schedule_type` while `status=scheduled` → 409 error |
| AC19 | Clone campaign | `POST /{id}/clone` → new draft with reset stats |
| AC20 | Resend failed | `POST /{id}/resend-failed` → re-sends to failed recipients only |
| AC21 | Campaign history | `GET /api/campaigns/{id}/runs` → returns all runs with stats |
| AC22 | Frontend wizard (3 steps) | Navigate through Name → Template → Schedule, submit |
| AC23 | Frontend schedule UI | All 3 types (Now/Scheduled/Recurring) with correct form fields |
| AC24 | Frontend pause/resume | Dropdown actions work, status updates on page |
| AC25 | `test_campaign_jobs.py` | All 10 tests pass: `pytest tests/test_campaign_jobs.py -v` |

---

**End of CR-024 Implementation Report**
