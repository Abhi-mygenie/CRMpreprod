# CR-078 — QA Handover
## POS Customer Intelligence Report API — Phase 1

**Date**: 2026-08-06
**Role**: Implementation Agent
**Status**: Code complete — ready for QA

---

## What was implemented

### Edit 1 — `routers/pos_reports.py` (NEW file, ~230 LOC)

| Section | What |
|---|---|
| `_get_stage_cutoffs()` | Inline copy of analytics.py helper (CR-077 thresholds). Module-private. |
| `_days_ago()` | ISO string → days elapsed. Returns None if unparseable. |
| `GET /summary` (E1) | 3 DB calls: loyalty_settings + customers `$facet` + orders `$facet`. |
| `GET /top-customers` (E2) | 1 DB call: `.find().sort().limit()`. Whitelist sort: total_spent/total_visits/total_points. |
| `GET /churn-risk` (E3) | 3 DB calls: loyalty_settings + count + find. Bands: high (at_risk) / medium (dormant). |

### Edit 2 — `backend/server.py` (3 additive changes)

| Change | Line | What |
|---|---|---|
| 2a | 16 | `pos_reports` added to import line |
| 2b | 167 | `api_router.include_router(pos_reports.router)` after `pos.messaging_router` |
| 2c | 79 | `db.customers.create_index("user_id")` in lifespan startup |

---

## Self-test results

| Check | Result |
|---|---|
| `python3 -c "from routers.pos_reports import router; print([r.path for r in router.routes])"` | ✅ `/pos/reports/summary`, `/pos/reports/top-customers`, `/pos/reports/churn-risk` |
| `python3 -c "ast.parse(open('server.py').read())"` | ✅ server.py syntax OK |
| Backend startup | ✅ Application startup complete |
| E1 `/summary` curl | ✅ `success=True`, all 5 top-level keys present |
| E2 `/top-customers` curl | ✅ `success=True`, list returned |
| E3 `/churn-risk?band=high` curl | ✅ `success=True`, count returned |
| E3 invalid band curl | ✅ `success=False`, "band must be 'high' or 'medium'" |
| Auth guard (no key) | ✅ `success=False` |

---

## Test credentials

| Account | Password | Use for |
|---|---|---|
| owner@kunafamahal.com | Qplazm@10 | Primary — largest dataset for all 3 endpoints |
| owner@hungry.com | Qplazm@10 | Secondary verification |

Auth: `X-API-Key: {api_key}` from `db.users.find_one({"email": "..."}, {"api_key": 1})`

---

## Acceptance criteria — 14 checks (V1–V14)

| # | Test | Command | Expected |
|---|---|---|---|
| V1 | Auth guard — no key | `curl $API/api/pos/reports/summary` | `{"success": false}` |
| V2 | Auth guard — bad key | `curl -H "X-API-Key: badkey" $API/api/pos/reports/summary` | `{"success": false}` |
| V3 | E1 structure | `curl -H "X-API-Key: $KEY" $API/api/pos/reports/summary` | `success=true`, all 5 keys: `customers`, `lifecycle`, `tiers`, `revenue`, `loyalty` |
| V4 | E1 customers.total sanity | Python: `data.customers.total` > 0 | Matches `db.customers.count_documents({"user_id": uid})` |
| V5 | E1 lifecycle sum | `new + active + at_risk + dormant + churned` | ≈ `customers.total` (small delta for null last_visit) |
| V6 | E1 tiers sum | `bronze + silver + gold + platinum` | = `customers.total` exactly |
| V7 | E2 sort=total_spent | `?sort_by=total_spent&limit=3` | First customer has highest `total_spent` |
| V8 | E2 sort=total_visits | `?sort_by=total_visits&limit=3` | First customer has highest `total_visits` |
| V9 | E2 invalid sort fallback | `?sort_by=value_score` | 200 OK, `sort_by="total_spent"` in response |
| V10 | E2 limit enforced | `?limit=5` | Exactly 5 records |
| V11 | E3 band=high | `?band=high` | All returned customers have `last_visit_days_ago` 31–60 |
| V12 | E3 band=medium | `?band=medium` | All returned customers have `last_visit_days_ago` 61–90 |
| V13 | E3 invalid band | `?band=critical` | `success=false`, "band must be 'high' or 'medium'" |
| V14 | Regression | `POST $API/api/pos/orders` with valid payload | Existing POS order webhook still responds correctly |

---

## Files changed

| File | Type | Change |
|---|---|---|
| `routers/pos_reports.py` | NEW | ~230 LOC, 3 endpoints |
| `backend/server.py` | EDIT | +3 lines |

## Files NOT changed

All other files — `routers/pos.py`, `routers/analytics.py`, `core/customer_intelligence.py`, `models/schemas.py`, all frontend files.
