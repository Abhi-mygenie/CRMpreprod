# CR-038 — Discovery: Campaign Scheduler Scale-Out (Sequential Outer Loop)

> **Type**: Discovery / Investigation finding from INV-2026-07-03-02
> **Date**: 2026-07-03
> **Source**: Owner concern — "CR-024 scheduler is firing in prod, could it hang the server?"
> **Status**: 📋 Registered — awaits owner decision
> **Severity**: P3 (backlog; not a live defect)
> **Risk**: MEDIUM (user-visible campaign delay under scale; NOT a server hang)

---

## Problem Statement

The CR-024 minute-cron (`core/campaign_jobs.py::process_due_campaigns`) processes due
scheduled/recurring campaigns **sequentially inside a `for camp in due:` loop**.

Each campaign runs to completion (including its internal batched WhatsApp sends and
per-recipient DB logging) before the next campaign in the same tick begins.

This is safe by construction — it cannot hang the server, cannot double-send, and
cannot pile up ticks. But under scale it produces **user-visible campaign delivery
delays** that erode owner trust in the "scheduled for HH:MM" promise.

---

## What Currently Happens

Every minute, APScheduler fires `process_due_campaigns()`:

```
1. DB query: due = campaigns where next_run_at <= now  (limit 100)
2. for camp in due:                     ◄── SEQUENTIAL OUTER LOOP
     - atomic claim (scheduled → active)
     - await _execute_campaign_send(camp.id, camp.user_id)
         ├─ load campaign + brand + audience    (~5 DB queries)
         ├─ create campaign_run row              (1 DB insert)
         ├─ send_bulk_messages(messages)         ◄── batches of 50 concurrent
         │     for i in range(0, N, 50):
         │        await asyncio.gather(*batch)   (✅ 50 msgs in parallel)
         │        await asyncio.sleep(1.0)       (rate-limit spacing)
         └─ log each result → whatsapp_message_logs (N inserts, sequential)
     - update next_run_at / mark completed
```

**Two levels of concurrency exist:**

| Level | Behavior |
|---|---|
| Messages within one batch of 50 | ✅ Parallel via `asyncio.gather` |
| Batches within one campaign | ❌ Sequential (1s gap — respects AuthKey rate limits) |
| Campaigns within one tick | ❌ **Sequential — this is the scale-out ceiling** |

---

## Runtime Model (evidence-based)

Assumes AuthKey healthy response ≈ 500 ms per call. `send_single_message` timeout = 15 s
(`core/whatsapp.py:46`). Batch size = 50 with 1 s inter-batch delay
(`core/whatsapp.py:164-165`).

| Recipients | Batches | Wall-clock per campaign | Tick outcome |
|---|---|---|---|
| 50 | 1 | ~0.5 s | 1 s total; next tick fires normally |
| 500 | 10 | ~15 s | Tick done well under 1 min |
| 5 000 | 100 | ~150 s (~2.5 min) | 2 subsequent minute-ticks coalesced/skipped |
| 5 000 × 3 campaigns same minute | — | ~7.5 min | Owner of campaign #3 sees a **7-minute delay** from scheduled time |
| 5 000 × 100 campaigns same minute | — | ~4 hours | All ticks in that window coalesced; new due campaigns delayed hours |

Worst case if AuthKey times out on every call (15 s each): scenarios above scale **30 ×**
(e.g., 5 000 × 3 campaigns → ~3.75 hours).

---

## What Is NOT Broken (Safety Controls Already In Place)

These controls are correctly configured — no defect exists.

| Control | Where | Effect |
|---|---|---|
| `max_instances=1` | `core/scheduler.py:138` | No two instances of the job run concurrently |
| `coalesce=True` | `core/scheduler.py:137` | Missed ticks are merged, not queued |
| `httpx.AsyncClient(timeout=15)` | `core/whatsapp.py:46,78` | Every AuthKey call bounded to 15 s |
| Atomic claim (`{status: "scheduled"} → "active"`) | `core/campaign_jobs.py:220-232` | Prevents double-fire |
| Per-tick cap = 100 | `core/campaign_jobs.py:210` | Bounded work per tick |
| Try/except per campaign | `core/campaign_jobs.py:234-276` | One failure doesn't kill tick |
| Try/except outer in `_execute_campaign_send` | `routers/campaigns.py:186,360-370` | Sets `status=failed` on exception |
| Stale detection (`> 24 h` old) | `core/campaign_jobs.py:191-204` | Auto-marks abandoned rows as `missed` |
| Fully async I/O (motor + httpx) | Throughout | Event loop never blocks; HTTP requests still served during tick |
| Early return on empty due list | `core/campaign_jobs.py:212-213` | Zero-cost idle ticks; no `cron_job_logs` bloat |

**Production evidence (e2.txt, 2026-07-02 21:17–21:49 IST)**: 33 consecutive ticks
completed in ~1 ms each — either scheduler disabled or no due campaigns. No overlap,
no error, no memory growth observed.

---

## Why This Is MEDIUM (not LOW, not HIGH)

**Not LOW because:**
- Sequential outer loop is architectural, not tunable via config
- Growth risk is real — as tenants and audience sizes grow, clock-minute collisions become certain (10 am / 12 pm / 6 pm are natural send times)
- Combines badly with any AuthKey/Meta latency spike or with the MongoDB Atlas
  no-PRIMARY condition observed for the customer app on 2026-07-02 (see INV-2026-07-03-01)
- Owner-facing feature ("send at 10:00 AM") loses trust if delivery routinely slips by
  minutes

**Not HIGH because:**
- Server does NOT hang — event loop remains responsive; other HTTP APIs are served during every `await`
- No data loss — every campaign eventually fires exactly once
- Bounded per tick (100 max)
- Realistic current scale is small — one active real tenant, few concurrent large
  campaigns

---

## Options (Sized, Not Selected)

| # | Option | Effort | Impact | Risk |
|---|---|---|---|---|
| **A** | **Parallelise outer loop** with `asyncio.gather` + `asyncio.Semaphore(N)` around `_execute_campaign_send` calls (N = 3-5) | ~40 LOC | 3-5 × wall-clock reduction; independent campaigns fire in parallel | LOW — event loop already handles concurrent motor/httpx well; small DB pool pressure |
| **B** | **Per-tick time budget** — break out of `for camp in due:` if elapsed > 45 s; defer overflow to next minute tick | ~10 LOC | Guarantees no single tick > 1 min. Overflow campaigns delay 1 minute per skip | LOWEST — pure safety net, no behaviour change until threshold hit |
| **C** | **Fire-and-forget dispatch** — scheduler only claims + spawns `_execute_campaign_send` as a fire-and-forget task; returns immediately | ~30 LOC | Tick always completes in seconds; execution runs off-scheduler | MEDIUM — need supervision (orphan-task detection) and DB-pool sizing review |
| **D** | Reduce `delay_between_batches` from 1.0 → 0.3 s | 1 LOC | ~3 × faster per campaign | MEDIUM — could trigger AuthKey rate-limiting; requires AuthKey confirmation |
| **E** | Increase per-tick campaign limit from 100 → higher | 1 LOC | Only helps when combined with (A) or (C) | LOW alone; MEDIUM combined |
| **F** | Motor `serverSelectionTimeoutMS=5000` (from default 30 000) in `core/database.py:11` | 1 LOC | Fail fast if Atlas loses PRIMARY (INV-2026-07-03-01) — prevents multi-hour stalls | LOW — only affects error path |

**Recommended combination if scaled**: **B + A + F** (safety net first, then parallelism, then DB timeout).

---

## Files That Would Change (any option)

| File | Reason |
|---|---|
| `backend/core/campaign_jobs.py` | Outer loop parallelism / time budget |
| `backend/core/database.py` | Motor timeout tuning (Option F) |
| `backend/core/whatsapp.py` | Only if Option D chosen (delay_between_batches) |

**Hotspot files touched**: `core/campaign_jobs.py` is not in the HIGH-RISK list per the
Project Addendum §7, but the campaigns router (`routers/campaigns.py`) is HIGH risk.
No change to `routers/campaigns.py` is required for Options A/B/E/F.

---

## Open Questions for Owner

| # | Question | Why It Matters |
|---|---|---|
| Q1 | Is there an SLA / owner promise on "campaign fires within N minutes of scheduled time"? | Sets the target for whether MEDIUM latency is acceptable |
| Q2 | Realistic peak concurrency expected (how many tenants × how many campaigns at the same clock minute)? | Determines whether current 100-per-tick cap is enough for the next 12 months |
| Q3 | Is Option F (motor `serverSelectionTimeoutMS=5000`) approved as a pre-emptive hardening independent of scale-out? | INV-2026-07-03-01 showed Atlas primary loss is not hypothetical |
| Q4 | Priority: schedule this for the current sprint or park until first real-world delay is reported? | Determines P2 vs P3 |

---

## Verification Matrix (When/If Implemented)

| Test | Expected |
|---|---|
| Cron tick with 0 due campaigns | Returns in < 5 ms, no DB write |
| Cron tick with 1 large campaign (5 000 recipients) | Under Option A: ~2.5 min for that one campaign; other ticks coalesced |
| Cron tick with 3 large campaigns due same minute | Under Option A: ~2.5 min total (parallel), not 7.5 min |
| Two workers racing on same due campaign | Atomic claim → exactly one fires, other logs "skipped — claimed elsewhere" |
| AuthKey returns 15 s timeout for every message | Tick still ends in bounded time; failed_count = total; campaign status → `failed` |
| Motor Atlas no-PRIMARY | Under Option F: fail-fast in 5 s; without F: 30 s per call, compounds |
| Cron running for > 24 h with N campaigns having missed windows | Auto-marked `missed` (line 191-204) |

---

## Related Docs

- `memory/crm/crm_roi_sprint/planning/CR_024_PHASE_3_SCHEDULED_RECURRING_CAMPAIGNS_PLAN.md` (original CR-024 phase 3 plan)
- `memory/crm/crm_roi_sprint/investigations/INV-2026-07-03-01_MONGODB_ATLAS_NO_PRIMARY.md` (Atlas primary-loss finding — customer app)
- `memory/crm/crm_roi_sprint/investigations/INV-2026-07-03-02_CR024_HANG_RISK_ANALYSIS.md` (this discovery's source investigation)

---

*Discovery doc — CR-038, awaits owner Q1-Q4 + planning approval. No implementation until approved.*
