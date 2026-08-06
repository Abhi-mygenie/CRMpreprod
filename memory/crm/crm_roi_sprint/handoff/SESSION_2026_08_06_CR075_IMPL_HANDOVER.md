# Session Handover — 2026-08-06 (CR-075 Implementation)

**Date**: 2026-08-06
**Role**: Implementation Agent
**Branch**: main (Abhi-mygenie/CRMpreprod)
**DB**: Remote MongoDB 52.66.232.149:27017/mygenie (live preprod data)

---

## What happened this session

### CR-075 — Hotel Guest Document Migration IMPLEMENTED

**6 edits applied to `routers/customers.py`** (+115 LOC, 0 modified):

| Edit | Line (approx) | What |
|---|---|---|
| E1 | 15 | `put_private_object` added to s3 import |
| E2 | 180 | `_CR075_ID_TYPE_MAP` + `_CR075_EXT_CONTENT_TYPE` module constants |
| E3 | 288 | `doc_summary` counter dict init inside `background_customer_sync` |
| E4 | 535 | `await _cr075_migrate_docs(client, user_id, customer_id, ...)` call |
| E5 | 595 | 5 new fields added to final `_cust_log_progress` call |
| E6 | 620 | New `_cr075_migrate_docs()` helper (80 LOC, all Q1-Q5 decisions embedded) |

**Self-test 3/3 PASS** (`tests/test_cr075_doc_migration.py`):
- RUN 1: counts correct (migrated=3, stubs=2, 404=1) ✅
- RUN 2: Q1 idempotency (0 new inserts on re-run) ✅
- RUN 3: Q2 skip+log on download failure ✅

**QA handover written**: `qa/CR_075_QA_HANDOVER.md`

---

## Pre-existing issue noted (NOT introduced by CR-075)

POS customer-migration endpoint (`preprod.mygenie.online`) timed out at `ReadTimeout`
at `customers.py:296` (the existing `httpx.AsyncClient.post` with `timeout=60.0`) during
test sync. This is in code that existed before CR-075. CR-075 code runs AFTER this
completes. Smaller hotel tenants (palmhouse, jehsnest) less likely to time out.

---

## Decisions locked (all from DECISIONS_LOG.md §2026-08-06 CR-075)

| Q | Decision |
|---|---|
| Q1 | Every sync — `source_url` dedup |
| Q2 | Skip + log on download failure |
| Q3 | All API URLs migrated regardless of host |
| Q4 | CR-072 naming: `{doc_type}_{side}.{ext}`, `put_private_object`, `uploaded_by="migration"`, `source_url` stored |
| Q5 | No 5-doc cap during migration |

---

## Test credentials

| Account | Password | Tenant |
|---|---|---|
| owner@kunafamahal.com | Qplazm@10 | Kunafa Mahal (food, 689) — regression |
| owner@palmhouse.com | Qplazm@10 | Palm House (hotel, 558) — primary QA target |
| owner@jehsnest.com | Qplazm@10 | Jeh's Nest (hotel, 635) — secondary QA |
| owner@hungry.com | Qplazm@10 | Hungry Keya (634) — WhatsApp templates |

---

## Open items for next session

### CR-075 QA (immediate)
Run `testing_agent_v3` against `qa/CR_075_QA_HANDOVER.md`. Use palmhouse or jehsnest
tenant. Verify migrated docs appear in `customer_documents` with correct schema.

### Owner smoke tests still pending (no code needed)
- CR-069: Templates → Map Variables on `final_bill` → button bubbles visible
- CR-076: Lifecycle → Churned → Re-engage CTA → Campaign Wizard pre-fills
- CR-077: Loyalty Settings threshold change → Lifecycle counts update
- CR-071+072: B2B hotel check-in + document upload on palmhouse/jehsnest

### Scheduler
- `CAMPAIGN_SCHEDULER_ENABLED=true` — when owner is ready for live auto-firing

---

## DO NOT
- Do NOT send live WhatsApp without owner approval
- Do NOT change coupon/loyalty/POS order math without owner approval
- Do NOT run destructive DB ops on live preprod data
- Do NOT re-introduce demo login (CR-015c)
- Do NOT flip `CAMPAIGN_SCHEDULER_ENABLED=true` without owner approval
