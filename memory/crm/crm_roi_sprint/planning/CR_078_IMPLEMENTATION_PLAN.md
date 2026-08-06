# CR-078 — POS Customer Intelligence Report API — Implementation Plan

**Date**: 2026-08-06
**Role**: Planning Agent
**Phase**: Implementation Plan
**Risk**: MEDIUM
**Effort**: ~2 hrs
**Gate**: Owner approval required before any code is written (§7 of agent system prompt)

---

## 0. Pre-Flight Checks (before first edit)

- [ ] Confirm `routers/pos_reports.py` does not exist: `ls /app/backend/routers/pos_reports.py`
- [ ] Confirm `verify_pos_auth` is importable: `grep -n "verify_pos_auth" /app/backend/core/auth.py`
- [ ] Confirm `POSResponse` is in schemas: `grep -n "class POSResponse" /app/backend/models/schemas.py`
- [ ] Confirm `get_stage_cutoffs` signature in analytics.py hasn't changed since planning

---

## 1. Files WILL Change

| File | Type | Change |
|---|---|---|
| `routers/pos_reports.py` | NEW | 3 endpoints + 2 private helpers (~200 LOC) |
| `backend/server.py` | EDIT | +1 import, +1 include_router, +1 index line |

## 2. Files WILL NOT Change

`routers/pos.py`, `routers/analytics.py`, `core/customer_intelligence.py`, `core/loyalty.py`,
`core/coupon.py`, `core/whatsapp.py`, `models/schemas.py`, all frontend files.

---

## 3. Edit-by-Edit Plan

---

### EDIT 1 — Create `routers/pos_reports.py` (new file)

**File**: `/app/backend/routers/pos_reports.py`
**Type**: New file
**LOC**: ~200

Create the file with:

```
Section A: Module docstring (CR-078 note, Phase 1 scope, Phase 2 deferred items)
Section B: Imports
Section C: Router definition  router = APIRouter(prefix="/pos/reports", ...)
Section D: _get_stage_cutoffs() — inline copy from analytics.py (R1 decision)
Section E: _days_ago()          — shared datetime helper
Section F: E1 /summary          — $facet aggregation, 3 DB calls
Section G: E2 /top-customers    — .find().sort().limit(), 1 DB call
Section H: E3 /churn-risk       — $match by band, 3 DB calls
```

**Critical constraints:**
- `_VALID_SORTS = {"total_spent", "total_visits", "total_points"}` — whitelist enforced, not `value_score` (Q3=a)
- No caching layer (Q2=c)
- No calls to `compute_customer_value()` or any bulk per-customer loop
- `_get_stage_cutoffs()` is a module-private copy — NOT imported from analytics.py (R1)
- All endpoints use `Depends(verify_pos_auth)` — NOT `get_current_user`
- All endpoints return `POSResponse`

**E1 `/summary` pipeline structure:**

```
loyalty_settings.find_one(user_id)        → stage cutoffs
customers.aggregate([
  $match: {user_id},
  $facet: {
    total:         [$count]
    active_30d:    [$match last_visit >= 30d_ago, $count]
    new_7d:        [$match created_at >= 7d_ago, $count]
    tiers:         [$group _id=$tier, count=$sum(1)]
    lifecycle:     [$addFields _stage=$switch(cutoffs), $group _id=$stage, count=$sum(1)]
    points_total:  [$group _id=null, total=$sum($total_points)]
  }
])
orders.aggregate([
  $match: {user_id},
  $facet: {
    all_time:        [$group _id=null, total_revenue=$sum, total_orders=$sum(1), avg=$avg]
    last_30d:        [$match created_at>=30d_ago, $group ...]
    with_redemption: [$match loyalty_points_used>0, $count]
  }
])
```

**Response shape (data field):**
```json
{
  "as_of": "<ISO>",
  "customers": { "total": int, "active_30d": int, "new_7d": int },
  "lifecycle":  { "new": int, "active": int, "at_risk": int, "dormant": int, "churned": int },
  "tiers":      { "bronze": int, "silver": int, "gold": int, "platinum": int },
  "revenue":    { "total": float, "total_orders": int, "avg_order_value": float,
                  "revenue_30d": float, "avg_order_value_30d": float },
  "loyalty":    { "orders_with_redemption_pct": float, "points_outstanding": int }
}
```

**E2 `/top-customers` structure:**

```
sort_field = sort_by if sort_by in {"total_spent","total_visits","total_points"} else "total_spent"
customers.find(user_id, projection).sort(sort_field, -1).limit(limit)
Python loop: compute last_visit_days_ago via _days_ago()
```

**Response shape (data field):**
```json
{
  "customers": [
    { "customer_id": str, "name": str, "phone": str, "tier": str,
      "total_visits": int, "total_spent": float, "avg_order_value": float,
      "last_visit_days_ago": int|null }
  ],
  "total": int,
  "sort_by": str
}
```

**E3 `/churn-risk` structure:**

```
if band not in ("high","medium") → return POSResponse(success=False, ...)
loyalty_settings.find_one(user_id) → cutoffs
band="high"   → last_visit_filter = {$lt: thirty_days_ago, $gte: sixty_days_ago}
band="medium" → last_visit_filter = {$lt: sixty_days_ago,  $gte: ninety_days_ago}
customers.count_documents(query)
customers.find(query).sort("last_visit", 1).limit(limit)
Python loop: compute last_visit_days_ago
```

**Response shape (data field):**
```json
{
  "band": "high"|"medium",
  "count": int,
  "customers": [
    { "customer_id": str, "name": str, "phone": str, "tier": str,
      "last_visit_days_ago": int|null, "total_spent": float, "total_visits": int }
  ]
}
```

**Self-test for Edit 1** (after file is created, before Edit 2):
```bash
cd /app/backend && python3 -c "from routers.pos_reports import router; print('import OK, routes:', [r.path for r in router.routes])"
```
Expected: `import OK, routes: ['/pos/reports/summary', '/pos/reports/top-customers', '/pos/reports/churn-risk']`

---

### EDIT 2 — Update `backend/server.py`

**File**: `/app/backend/server.py`
**3 surgical changes:**

**Change 2a** — Extend import line (line 16):
```python
# BEFORE:
from routers import auth, customers, points, wallet, coupons, feedback, whatsapp, pos, migration, analytics, scan, menu, suggestions, invoices, campaigns

# AFTER:
from routers import auth, customers, points, wallet, coupons, feedback, whatsapp, pos, pos_reports, migration, analytics, scan, menu, suggestions, invoices, campaigns
```

**Change 2b** — Register router (after line 166 `api_router.include_router(pos.messaging_router)`):
```python
# BEFORE (lines 165-166):
api_router.include_router(pos.router)
api_router.include_router(pos.messaging_router)

# AFTER:
api_router.include_router(pos.router)
api_router.include_router(pos.messaging_router)
api_router.include_router(pos_reports.router)  # CR-078
```

**Change 2c** — Add `user_id` index on customers (inside lifespan try block, after existing customers.create_index for tags, around line 77):
```python
# Add after the CR-043-A tags index block:
try:
    await db.customers.create_index("user_id", name="idx_customers_user_id")  # CR-078
except Exception as e:
    logging.getLogger(__name__).warning(f"CR-078 customers.user_id index skipped: {e}")
```

**Self-test for Edit 2** (after applying):
```bash
sudo supervisorctl restart backend && sleep 4
tail -5 /var/log/supervisor/backend.err.log
# Must show "Application startup complete" with no import errors
```

---

## 4. Verification Matrix

After both edits are applied and backend is running:

| # | Test | Command | Expected |
|---|---|---|---|
| V1 | Auth guard — missing key | `curl -s "$API/api/pos/reports/summary"` | `401` or error response |
| V2 | Auth guard — invalid key | `curl -s -H "X-API-Key: badkey" "$API/api/pos/reports/summary"` | `{"success":false}` |
| V3 | E1 summary — structure | `curl -s -H "X-API-Key: $KEY" "$API/api/pos/reports/summary"` | `success=true`, all top-level keys present: `customers`, `lifecycle`, `tiers`, `revenue`, `loyalty` |
| V4 | E1 customers.total sanity | Python check: `data.customers.total` > 0 for Kunafa | Matches `db.customers.count_documents({user_id: X})` |
| V5 | E1 lifecycle sum | `lifecycle.new + active + at_risk + dormant + churned` | Approximately equal to `customers.total` (small delta allowed for missing last_visit) |
| V6 | E1 tiers sum | `tiers.bronze + silver + gold + platinum` | = `customers.total` exactly |
| V7 | E2 sort=total_spent | `curl "$API/api/pos/reports/top-customers?sort_by=total_spent&limit=3"` | First customer has highest `total_spent` in tenant |
| V8 | E2 sort=total_visits | `curl "$API/api/pos/reports/top-customers?sort_by=total_visits&limit=3"` | First customer has highest `total_visits` |
| V9 | E2 invalid sort fallback | `curl "$API/api/pos/reports/top-customers?sort_by=value_score"` | Returns 200, `sort_by` = `"total_spent"` in response |
| V10 | E2 limit enforced | `curl "$API/api/pos/reports/top-customers?limit=5"` | Exactly 5 records returned |
| V11 | E3 band=high | `curl "$API/api/pos/reports/churn-risk?band=high"` | Returns customers with `last_visit_days_ago` between 31–60 |
| V12 | E3 band=medium | `curl "$API/api/pos/reports/churn-risk?band=medium"` | Returns customers with `last_visit_days_ago` between 61–90 |
| V13 | E3 invalid band | `curl "$API/api/pos/reports/churn-risk?band=critical"` | `success=false`, error message |
| V14 | Regression — existing POS | `curl -X POST "$API/api/pos/orders" ...` | Existing order webhook still responds correctly |

**Minimum pass for QA gate**: V1–V13 all PASS, V14 PASS.

---

## 5. Code Markers

Every new function and the server.py lines must carry the `# CR-078` comment marker, per §10 of agent system prompt.

---

## 6. QA Handover Notes (for QA agent)

- Auth: use `owner@kunafamahal.com / Qplazm@10` to get JWT, then extract `api_key` from `GET /api/auth/me` or `GET /api/settings`
- Alternatively use direct DB lookup: `db.users.find_one({"email": "owner@kunafamahal.com"}, {"api_key": 1})`
- All 3 endpoints are GET with no request body
- E3 band values are lowercase: `high` / `medium`
- `last_visit_days_ago` can be null for customers with no last_visit — this is correct
- V5 (lifecycle sum ≠ total) is expected for customers with `last_visit = null` — they go to "churned" correctly, but if `created_at` is also weird, delta can appear

---

## 7. Implementation Plan Output

```
Planning complete: CR-078
Stage: Impact Analysis + Implementation Plan (both)
Code reality: NONE
Risk: MEDIUM
Files WILL change: routers/pos_reports.py (new ~200 LOC), backend/server.py (+3 changes)
Files WILL NOT touch: all other files
Owner decisions: none open
Verification matrix: 14 checks (V1–V14)
Docs: planning/CR_078_IMPACT_ANALYSIS.md, planning/CR_078_IMPLEMENTATION_PLAN.md
Next: OWNER APPROVAL REQUIRED → Implementation → Self-test → QA
```

---

## OWNER APPROVAL GATE

```
OWNER APPROVAL REQUIRED
Items: CR-078 Phase 1
Risk: MEDIUM
Proposed: Implement 3 POS report endpoints in new file routers/pos_reports.py.
          server.py gets 3 additive lines only.
          No existing files modified beyond server.py.
I will not proceed until owner approves.
```
