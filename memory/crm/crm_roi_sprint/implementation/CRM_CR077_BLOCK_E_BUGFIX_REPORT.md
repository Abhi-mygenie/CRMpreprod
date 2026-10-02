# Bug Fix Report — CR-077 Block E: high_spender_threshold Wiring

**Date**: 2026-08-05  
**Role**: Bug Fix Agent  
**Source**: QA finding — MAJOR — PLAN_GAP  
**Filed by**: QA Agent (same session)

---

## Finding Reproduced

`GET /api/customers?audience_type=high_spender` returned all 100 customers regardless
of `high_spender_threshold` value (5,000, 50,000 or 100) — confirmed before fix.

Segment creation with `filters: {"audience_type": "high_spender"}` also returned
full customer count regardless of threshold — root cause confirmed.

---

## Root Cause

`PLAN_GAP` — `core/helpers.py::build_customer_query()` had no `audience_type` filter
block. The CR-077 intake doc listed `helpers.py` under "Files WILL Change" with
Block E description, but the implementation plan (E-A through E-I) omitted the edit.
The `high_spender_threshold` field was stored in DB and returned by API but had zero
query effect anywhere.

---

## Fix Applied

**File**: `backend/core/helpers.py`  
**Location**: After CR-034 tags block, before `return query` (lines 487–488)  
**Change**: Added `audience_type == "high_spender"` filter block (~6 LOC)

```python
# ── CR-077 Block E: High Spender audience type ───────────────────────────
# audience_type="high_spender" → total_spent >= per-tenant high_spender_threshold
# Default 5000 matches previous hardcoded behaviour (zero behaviour change on upgrade).
if filters.get("audience_type") == "high_spender":
    _ls = await _db.loyalty_settings.find_one({"user_id": user_id}, {"_id": 0}) or {}
    threshold = _ls.get("high_spender_threshold", 5000)
    query["total_spent"] = {"$gte": threshold}
```

Pattern follows existing `_db` lookups already in the function (lines 458–475).  
`_db` already imported at line 5 — no new imports needed.

---

## Self-Test Results

Tested via `POST /api/segments` (calls `count_customers_by_filters` → `build_customer_query`):

| Threshold | Segment count | Result |
|---|---|---|
| 5,000 (default) | 11 | baseline |
| 50,000 (raised) | 2 | dropped ✅ |
| 100 (lowered) | 2,118 | rose ✅ |
| Regression (total_spent bucket) | 7 | no crash ✅ |

Threshold restored to 5,000. Test segments deleted.

---

## Scope

| | |
|---|---|
| Files changed | `backend/core/helpers.py` (+6 LOC) |
| Files NOT changed | Everything else |
| Scope expansion | NONE |
| Hotspot files touched | NO (`helpers.py` not in addendum hotspot table) |

---

## Open Items (not fixed — out of scope)

| Finding | Classification | Action |
|---|---|---|
| AudiencesPage/CustomersPage spend labels hardcoded | MINOR — Phase 2 optional | Separate CR or Phase 2 of CR-077 |
| churn_risk thresholds 0.7/0.4 hardcoded (F5) | NOTE — not in plan | Intake doc finding, not in implementation plan scope |

---

## Registry Update Required

`CR_STATUS_DASHBOARD.md` — CR-077 row: update from 🔵 PLANNING COMPLETE
to 🟡 IN FLIGHT (implementation done, Block E fix now applied, QA re-test needed).
