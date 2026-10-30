# INV-2026-07-03-01 — MongoDB Atlas No-PRIMARY (Customer App error)

> **Type**: Investigation report
> **Date**: 2026-07-03
> **Role**: Investigation Agent (read-only, no code changes)
> **Source**: Owner-uploaded production logs `e1.txt` + `e2.txt`
> **Status**: 📋 Reported
> **Confidence**: HIGH
> **Steps used**: 5 / 10

---

## Question Investigated

> Owner: "I am getting these errors in production. Confirm what is related to this app (CRM) and what is from the customer app since both share same DB."

---

## Hypotheses

| # | Hypothesis | Verdict |
|---|---|---|
| H1 | Error in `e1.txt` is from the CRM backend | ❌ REJECTED |
| H2 | Error in `e1.txt` is from the Customer App (separate codebase) | ✅ CONFIRMED |
| H3 | MongoDB Atlas replica set has no PRIMARY (infrastructure issue) | ✅ CONFIRMED |

---

## Evidence

### `e1.txt` — ERROR log (99 lines)

| Field | Value |
|---|---|
| Process tag | `5\|app-myge` (`app-mygenie`) |
| Failing file | `/var/www/customer-app5th-march/backend/server.py`, **line 987**, `get_app_config` |
| Failing call | `db.customer_app_config.find_one(...)` |
| Driver | **pymongo (SYNC)** — wrapped in `concurrent/futures/thread.py` |
| MongoDB error | `pymongo.errors.ServerSelectionTimeoutError: No replica set members match selector "Primary()", Timeout: 30s` |
| Cluster | `ac-g2irjm2-shard-00-XX.xdqqdpi.mongodb.net` (MongoDB Atlas) |
| Topology | shard-00-00: **SECONDARY**, shard-00-01: **SECONDARY**, shard-00-02: **UNKNOWN** (rtt = None). **NO PRIMARY.** |
| Topology-ID | `6a35e40469b73e1c065156a6` |

### `e2.txt` — INFO log (67 lines)

| Field | Value |
|---|---|
| Process tag | `3\|crm-back` (CRM backend) |
| Content | APScheduler running `CR-024 Process Due Campaigns (Scheduled + Recurring)` every minute |
| Result | 33 consecutive ticks (21:17–21:49 IST 2026-07-02) all "executed successfully" |
| Errors | None |
| Tick duration | ~1 ms each (either scheduler disabled or no due campaigns) |

### CRM codebase verification

| Check | Result |
|---|---|
| CRM `server.py` line count | **195 lines** — cannot contain `line 987` |
| CRM Mongo driver | `motor` async only — `core/database.py:1: from motor.motor_asyncio import AsyncIOMotorClient` |
| CRM references to `customer_app_config` | `routers/scan.py` (8 async calls) |
| CRM references to `customer_otps` | `routers/scan.py` (5 async calls) |
| CRM `MongoClient` (sync pymongo) usage | **None found** |

---

## Ownership Split (CRM vs Customer App)

Both apps share the same MongoDB database (`mygenie`). Collections:

| Collection | CRM writes | Customer App writes | Shared? |
|---|---|---|---|
| `customer_app_config` | ✅ (`routers/scan.py` async) | ✅ (customer-app5th-march sync) | **YES** |
| `customer_otps` | ✅ | ✅ | **YES** |
| `feedback` | ✅ | Possibly ✅ | Likely shared |
| `dietary_tags_mapping` | ✅ | Possibly ✅ | Possibly (flagged in Project Addendum §15 Q6) |
| `customers`, `orders`, `points_transactions`, `coupons`, `whatsapp_message_logs`, `campaigns`, `invoices`, `segments`, ... (28 more) | ✅ | ❌ | CRM-only |

**Verdict**: `e1.txt` error is 100 % Customer App code path. CRM impact today: **none observed** (e2.txt healthy).

---

## Root Cause

**MongoDB Atlas replica set has no PRIMARY.** 2 nodes are SECONDARY, 1 is UNKNOWN
(unreachable). Election either failed or is in progress. All writes and default-read-preference
reads block for `serverSelectionTimeoutMS` (30 000 ms default) then raise
`ServerSelectionTimeoutError`.

The Customer App is the visible victim because:
1. It calls `db.customer_app_config.find_one` on a public endpoint on every page load
2. It uses sync pymongo with default `read_preference=Primary()` → hard-fails when no primary
3. It runs on PM2 (not supervisor) so the traceback surfaces to logs directly

CRM would exhibit the same failure if the primary loss lasted long enough — CRM's
motor client also defaults to `readPreference=primary` and `serverSelectionTimeoutMS=30000`.

**Classification**: `DATA / CONFIG (infrastructure — MongoDB Atlas)`
**Confidence**: HIGH

---

## Side Observation — CR-024 Scheduler Firing in Prod

`e2.txt` shows the CR-024 minute-cron running every 60 s, contradicting the
prior handoff which listed D1 ("Scheduled campaigns not firing /
`CAMPAIGN_SCHEDULER_ENABLED=false`") as a blocker. In production, the flag must
already be `true`.

The ~1 ms tick duration suggests either the flag is still `false` OR no campaigns
match the "due" query. If specific campaigns still aren't being delivered from an
owner perspective, the cause is not the scheduler infrastructure — likely no due
rows, audience empty, or AuthKey/Meta upstream issue.

Follow-up owner-facing observation from this session led to a separate risk audit:
see `INV-2026-07-03-02_CR024_HANG_RISK_ANALYSIS.md` and `CR-038`.

---

## Recommendation

This is **infrastructure**, not a CRM code defect. No CRM change required.

| # | Action | Owner |
|---|---|---|
| 1 | Check MongoDB Atlas UI for cluster `ac-g2irjm2` (`xdqqdpi.mongodb.net`) → verify primary-election status. Common causes: node maintenance, network partition, disk-full, memory pressure, recent replica-set config change | DevOps |
| 2 | If persistent, contact MongoDB Atlas support with topology snapshot from e1.txt line 25 (topology-ID `6a35e40469b73e1c065156a6`) | DevOps |
| 3 | Customer-App team: consider `readPreference=secondaryPreferred` on non-critical reads like `get_app_config` so requests survive a temporary no-primary state | Customer-App team (separate repo) |
| 4 | Optional CRM hardening: reduce motor `serverSelectionTimeoutMS` from 30 000 → 5 000 in `core/database.py:11` so CRM fails fast (instead of stalling 30 s per call) if the same condition affects CRM | CRM (needs owner approval) |
| 5 | CRM impact today: **NONE OBSERVED** — e2.txt healthy | — |

---

## Output (per system-prompt Role 6)

```text
Investigation complete: INV-2026-07-03-01
Root cause: Customer App sync pymongo call fails because MongoDB Atlas replica set has no PRIMARY (2 SECONDARY + 1 UNKNOWN node)
Classification: DATA / CONFIG (infrastructure — MongoDB Atlas)
Confidence: HIGH
Steps used: 5 / 10
Evidence:
  - /tmp/e1.txt (customer-app error stack + Mongo topology snapshot)
  - /tmp/e2.txt (CRM scheduler healthy logs)
  - /app/backend/server.py (195 lines — not CRM)
  - /app/backend/core/database.py (motor async — not pymongo)
  - /app/backend/routers/scan.py (shared collection usage)
Recommendation: Owner / DevOps investigates Atlas primary-election. No CRM code change required. Route to Customer-App team for readPreference hardening. Optional CRM pre-emptive motor timeout tuning.
```

---

## Related

- Follow-up investigation: `INV-2026-07-03-02_CR024_HANG_RISK_ANALYSIS.md`
- Downstream backlog: `discovery/CR_038_CAMPAIGN_SCHEDULER_SCALE_OUT_DISCOVERY.md`
- Project Addendum §15 Q10: "Is 52.66.232.149 the production database or preprod?" — answered by this investigation: **production is a separate MongoDB Atlas cluster `xdqqdpi.mongodb.net`, not the IP 52.66.232.149**
