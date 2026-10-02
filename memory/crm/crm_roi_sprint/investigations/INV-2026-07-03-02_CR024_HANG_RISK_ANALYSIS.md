# INV-2026-07-03-02 — CR-024 Scheduler Hang Risk Analysis

> **Type**: Investigation report
> **Date**: 2026-07-03
> **Role**: Investigation Agent (read-only, no code changes)
> **Source**: Owner concern — "CR-024 scheduler IS firing in production; issue raised it can hang server or any issue coz of this can come"
> **Status**: 📋 Reported
> **Confidence**: HIGH
> **Steps used**: 8 / 10

---

## Question Investigated

> Owner: "Can the CR-024 per-minute campaign scheduler hang the server, or cause any other issue?"

---

## Hypotheses

| # | Hypothesis | Verdict |
|---|---|---|
| H1 | Scheduler tick can pile up if a run exceeds 1 minute → memory/thread growth → server hang | ❌ REJECTED (`max_instances=1` + `coalesce=True`) |
| H2 | Scheduler holds an unclosed httpx / motor client → connection pool exhaustion | ❌ REJECTED (`async with httpx.AsyncClient()` context-manager; motor shares one global client) |
| H3 | An unhandled exception in one campaign can kill the tick / crash APScheduler | ❌ REJECTED (per-campaign try/except + outer try/except in `_execute_campaign_send`) |
| H4 | Sequential outer loop `for camp in due:` blocks other campaigns when one is large | ✅ CONFIRMED (delay, not hang — reported as CR-038) |
| H5 | If AuthKey / Meta stalls, entire cron tick stalls | ⚠️ PARTIAL — bounded by `httpx.AsyncClient(timeout=15)` per call, so worst case is 15 s × total-messages, not infinite |
| H6 | If MongoDB Atlas loses PRIMARY, motor default 30s timeout compounds across many DB calls per tick | ⚠️ CONFIRMED as latent risk (see INV-2026-07-03-01) |

---

## Evidence Reviewed

| File | Lines | Purpose |
|---|---|---|
| `backend/core/scheduler.py` | 122-140 | Job registration flags (`max_instances=1`, `coalesce=True`) |
| `backend/core/campaign_jobs.py` | 181-291 | `process_due_campaigns()` full body |
| `backend/routers/campaigns.py` | 180-370 | `_execute_campaign_send()` full body |
| `backend/core/whatsapp.py` | 43-158 | `send_single_message()` with `timeout: int = 15` |
| `backend/core/whatsapp.py` | 161-222 | `send_bulk_messages()` batching + rate-limit |
| `/tmp/e2.txt` (prod log) | 1-67 | 33 consecutive successful ticks in 2026-07-02 21:17–21:49 IST, each ~1 ms |

---

## Safety Controls Confirmed Present

| Control | Where | Effect |
|---|---|---|
| `max_instances=1` | `core/scheduler.py:138` | One instance at a time — no overlap |
| `coalesce=True` | `core/scheduler.py:137` | Missed ticks merged, not queued |
| `httpx.AsyncClient(timeout=15)` | `core/whatsapp.py:46,78` | Every AuthKey call bounded to 15 s |
| Atomic claim | `core/campaign_jobs.py:220-232` | Prevents double-fire |
| Per-tick cap = 100 | `core/campaign_jobs.py:210` | Bounded work per tick |
| Try/except per campaign | `core/campaign_jobs.py:234-276` | One failure doesn't kill tick |
| Outer try/except | `routers/campaigns.py:186,360-370` | Sets `status=failed` on exception |
| Stale detection > 24 h | `core/campaign_jobs.py:191-204` | Auto-marks abandoned rows as `missed` |
| Fully async I/O | Throughout | Event loop remains responsive to HTTP requests |
| Early return on empty due | `core/campaign_jobs.py:212-213` | Zero-cost idle ticks; no `cron_job_logs` bloat |

---

## Findings

### ✅ Cannot hang the server

- Event loop remains alive under all observed conditions
- Every I/O is `await`-ed on async clients (motor + httpx)
- `httpx.AsyncClient(timeout=15)` bounds every AuthKey call
- `max_instances=1` prevents concurrent job instances
- `coalesce=True` prevents queue growth
- e2.txt confirms 33 consecutive ticks completed in ~1 ms each

### ⚠️ MEDIUM latency risk under scale — sequential outer loop

`for camp in due:` in `core/campaign_jobs.py:219` runs campaigns one at a time.
Under realistic load (500 ms AuthKey response), one 5 000-recipient campaign takes
~2.5 minutes. Three such campaigns due at the same minute → 7.5 min wall-clock →
campaign #3's owner sees a 7-minute delivery delay from scheduled time.

**Registered as CR-038** for backlog decision.

### ⚠️ LOW: Brittle startup — `os.environ['CAMPAIGN_TIMEZONE']` at module import

`core/campaign_jobs.py:20`:
```python
DEFAULT_TZ = ZoneInfo(os.environ['CAMPAIGN_TIMEZONE'])
```
Import-time read with no fallback. If env var is missing, the entire backend fails
to boot with a `KeyError`. Recommended (owner approval to change):
```python
DEFAULT_TZ = ZoneInfo(os.environ.get('CAMPAIGN_TIMEZONE', 'Asia/Kolkata'))
```

### ⚠️ LOW: Motor `serverSelectionTimeoutMS` default of 30 000 ms

If MongoDB Atlas loses PRIMARY (observed for customer app in
INV-2026-07-03-01), each motor call in `_execute_campaign_send` can stall 30 s.
Compounds to hours per tick. Recommend tuning to `5000` in `core/database.py:11`
as a pre-emptive hardening.

### ✅ e2.txt production ticks are healthy no-ops

Every tick in the log completed in ~1 ms. This means either:
- `CAMPAIGN_SCHEDULER_ENABLED=false` (early return at line 183), or
- No due campaigns match the query (early return at line 213)

Either way, no work is being done and no memory / DB pressure is accumulating.

---

## Root Cause

**No defect.** The scheduler is defensively designed; observed production behaviour
is healthy. Owner concern is valid as a scale-out consideration, not a live issue.

**Classification**: `CODE QUALITY / SCALE (advisory)`
**Confidence**: HIGH

---

## Recommendation

| # | Action | Priority | Owner approval needed? |
|---|---|---|---|
| 1 | No urgent code change required | — | — |
| 2 | Register CR-038 for outer-loop scale-out options | P3 | Prioritisation only |
| 3 | Add default fallback for `CAMPAIGN_TIMEZONE` env var | P3 | Yes (1-line change) |
| 4 | Consider motor `serverSelectionTimeoutMS=5000` in `core/database.py` | P3 | Yes (1-line change, safety net for Atlas primary loss) |
| 5 | Monitor MongoDB Atlas cluster `ac-g2irjm2` primary status (INV-2026-07-03-01) | P1 | DevOps action, not code |

---

## Output (per system-prompt Role 6)

```text
Investigation complete: INV-2026-07-03-02
Root cause: N/A — no defect. Scheduler is defensively designed with proper timeouts, single-instance lock, coalescing, atomic claims, and early exits.
Classification: CODE QUALITY / SCALE (advisory)
Confidence: HIGH
Steps used: 8 / 10
Evidence: this file + /tmp/e2.txt + code files listed above
Recommendation:
  1. No urgent code fix
  2. CR-038 registered for outer-loop scale ceiling
  3. Advisory hardening: CAMPAIGN_TIMEZONE default + motor timeout tuning (owner approval required)
  4. DevOps: monitor Atlas primary election
```

---

## Related

- Source concern: owner message 2026-07-03
- Preceding investigation: `INV-2026-07-03-01_MONGODB_ATLAS_NO_PRIMARY.md`
- Downstream backlog: `discovery/CR_038_CAMPAIGN_SCHEDULER_SCALE_OUT_DISCOVERY.md`
