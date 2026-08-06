# CR-078 — POS Customer Intelligence Report API — Impact Analysis

**Date**: 2026-08-06
**Role**: Planning Agent
**Phase**: Impact Analysis
**Branch**: main (Abhi-mygenie/CRMpreprod)

---

## 1. Item Verified Registered

CR-078 registered 2026-08-06. Status: `cr078_intake_closed_q1b_q2c_q3a_ready_for_planning`.
Intake doc: `discovery/CR_078_POS_CUSTOMER_INTELLIGENCE_REPORT_INTAKE.md`
All Q1–Q3 locked. Planning gate open.

---

## 2. Code Reality Check (confirmed by direct file read)

### What exists

| File | Relevant existing code | Used by CR-078? |
|---|---|---|
| `routers/pos.py:1` | `verify_pos_auth` dependency imported from `core.auth` | ✅ Reuse same import pattern |
| `models/schemas.py:POSResponse` | `POSResponse(success, message, data)` — used by all POS endpoints | ✅ Import and reuse |
| `routers/analytics.py:481` | `get_stage_cutoffs(settings)` — 12-line pure function, reads CR-077 loyalty_settings fields | ✅ Logic copied inline (see §4 Risk Item R1) |
| `routers/analytics.py:525` | `get_customer_lifecycle_summary()` — full lifecycle pipeline using `$switch` + `$group` | ✅ Pipeline pattern reused verbatim for E1 lifecycle facet |
| `core/database.py` | `db` Motor async client | ✅ Standard import |
| `core/auth.py` | `verify_pos_auth` — validates `X-API-Key` header against `users.api_key` | ✅ Standard POS auth |
| `core/customer_intelligence.py:22` | `compute_customer_summary()`, `compute_customer_value()`, `compute_cross_sell()` | ❌ NOT used in Phase 1 (Q3=a defers value_score; E5 deferred to Phase 2) |
| `services/analytics_service.py` | `get_order_stats()`, `get_customer_health_stats()` etc. | ❌ NOT used — CRM-JWT only service; Phase 1 re-implements as POS-auth pipelines |
| `server.py:16` | Router import line + `api_router.include_router(...)` block | ✅ Extend both (Edit 2) |

### What does NOT exist

- Zero aggregate endpoints under `/api/pos/reports/*`
- No POS-auth report endpoint of any kind
- No `routers/pos_reports.py` file

**Code reality: NONE for Phase 1 endpoints. All new.**

---

## 3. Data Flow Traces

### E1 — `GET /api/pos/reports/summary`

```
POS system
  → X-API-Key header
  → verify_pos_auth(db) → users collection → user doc with id
  → loyalty_settings.find_one(user_id)          [1 DB call]
      → _get_stage_cutoffs(settings)             [pure Python, 0 DB calls]
  → customers.aggregate($facet)                  [1 DB call — all customer stats]
      facet "total"        → $count
      facet "active_30d"   → $match last_visit >= 30d + $count
      facet "new_7d"       → $match created_at >= 7d + $count
      facet "tiers"        → $group by tier
      facet "lifecycle"    → $addFields($switch) + $group by stage
      facet "points_total" → $group sum(total_points)
  → orders.aggregate($facet)                     [1 DB call — all order stats]
      facet "all_time"        → $group sum/avg(order_amount)
      facet "last_30d"        → $match + $group sum/avg
      facet "with_redemption" → $match loyalty_points_used > 0 + $count
  → build response dict
  → POSResponse(success=True, data={...})
Total: 3 DB calls (loyalty_settings + customers + orders)
```

### E2 — `GET /api/pos/reports/top-customers`

```
POS system
  → X-API-Key header
  → verify_pos_auth(db) → user doc
  → validate sort_by param (whitelist: total_spent, total_visits, total_points)
  → customers.find(user_id).sort(sort_field, -1).limit(limit)  [1 DB call]
  → Python: compute last_visit_days_ago per record (datetime arithmetic)
  → POSResponse(success=True, data={customers: [...], total: N, sort_by: field})
Total: 1 DB call
```

### E3 — `GET /api/pos/reports/churn-risk`

```
POS system
  → X-API-Key header + band query param (high|medium)
  → verify_pos_auth(db) → user doc
  → validate band — if not in (high, medium) → return 400 POSResponse
  → loyalty_settings.find_one(user_id)          [1 DB call]
      → _get_stage_cutoffs(settings)             [pure Python]
      → derive last_visit_filter from band:
          high   → {$lt: thirty_days_ago, $gte: sixty_days_ago}   (at_risk stage)
          medium → {$lt: sixty_days_ago,  $gte: ninety_days_ago}  (dormant stage)
  → customers.count_documents(query)             [1 DB call — total count]
  → customers.find(query).sort(last_visit, 1).limit(limit)  [1 DB call]
  → Python: compute last_visit_days_ago per record
  → POSResponse(success=True, data={band, count, customers: [...]})
Total: 3 DB calls (loyalty_settings + count + find)
```

---

## 4. Risk Items

### R1 — `get_stage_cutoffs` inlining vs import

**Issue**: `get_stage_cutoffs()` lives in `routers/analytics.py`. Importing from one router module into another creates cross-router coupling. If `analytics.py` is later refactored, `pos_reports.py` silently breaks.

**Decision**: Copy the 12-line pure function into `pos_reports.py` as `_get_stage_cutoffs()` (module-private). No changes to `analytics.py`. Both implementations must be kept in sync when CR-077 threshold logic is updated.

**Risk after mitigation**: LOW. Pure function, no state, no DB calls. Any drift is immediately visible in test failures.

---

### R2 — `$facet` on large `customers` collection

**Issue**: `$facet` in E1 runs 6 sub-pipelines concurrently on the `customers` collection. On large tenants (e.g., Kunafa Mahal with 10k+ customers), this could be slow without proper indexes.

**Existing indexes confirmed (from server.py lifespan)**:
- `customers.user_id` — not explicitly created as index but used in every $match
- `customers.tags` — `idx_customers_user_tags` (CR-043-A)

**`user_id` index is NOT explicitly created** on `customers`. All queries start with `$match: {user_id: X}` which relies on a collection scan if no single-field index exists.

**Mitigation**: Add `customers.create_index("user_id")` to the lifespan startup block in `server.py` (safe, idempotent). This is a minor addition to Edit 2 and is a performance win for all existing customer queries too.

**Risk after mitigation**: LOW.

---

### R3 — ISO string datetime comparison in `$switch` / `$match`

**Issue**: `last_visit` and `created_at` are stored as ISO strings (confirmed by code read). String comparison works correctly for ISO 8601 timestamps (`2026-07-15T...` > `2026-06-15T...`) because lexicographic order matches chronological order.

**Risk**: LOW. This is the same pattern already used in all existing lifecycle queries in `analytics.py`. No change needed.

---

### R4 — `loyalty_points_used` field presence in orders

**Issue**: E1 counts `orders_with_redemption_pct` by matching `loyalty_points_used > 0`. Older orders (pre-CR-001C-LR) may not have this field.

**Mitigation**: The pipeline uses `{"loyalty_points_used": {"$gt": 0}}` — documents without the field will return False for this condition (MongoDB treats missing field as null, which is not > 0). This is correct behavior: old orders without redemption data are correctly excluded. No code change needed.

**Risk**: LOW.

---

### R5 — `sort_by` injection

**Issue**: `sort_by` is a query parameter. If passed directly to `.sort()` without validation, a malicious input could sort on any field or cause unexpected behavior.

**Mitigation**: Whitelist enforced — `sort_field = sort_by if sort_by in _VALID_SORTS else "total_spent"`. Any invalid value silently falls back to `total_spent`. No exception, no 422.

**Risk**: LOW.

---

## 5. Affected Files

### Files WILL change

| File | Change | Risk |
|---|---|---|
| `routers/pos_reports.py` | **NEW FILE** — ~200 LOC, 3 endpoints + 2 helpers | MEDIUM (new logic) |
| `backend/server.py` | **+3 lines** — import `pos_reports`, `include_router(pos_reports.router)`, add `customers.create_index("user_id")` to lifespan | LOW |

### Files WILL NOT change

| File | Reason |
|---|---|
| `routers/pos.py` | All new endpoints in separate file |
| `routers/analytics.py` | `get_stage_cutoffs()` copied, not imported |
| `core/customer_intelligence.py` | Not used in Phase 1 |
| `core/loyalty.py` | Not touched |
| `core/coupon.py` | Not touched |
| `core/whatsapp.py` | Not touched |
| `models/schemas.py` | `POSResponse` imported as-is |
| All frontend files | POS-only endpoints |

---

## 6. Downstream Consumers

| Consumer | Impact |
|---|---|
| Existing POS endpoints (`/pos/orders`, `/pos/max-redeemable`, etc.) | None — separate router, separate file |
| CRM frontend (Dashboard, Lifecycle, Analytics pages) | None — different auth, different endpoints |
| `analytics.py` `get_stage_cutoffs()` | None — not modified |
| MyGenie POS reporting system | New capability — can now call `/api/pos/reports/*` with existing X-API-Key |

---

## 7. Owner Decisions — All Locked

| Q | Decision | Status |
|---|---|---|
| Q1 | Phase 1 = E1 + E2 + E3 only | ✅ Locked |
| Q2 | Always-fresh, no caching | ✅ Locked |
| Q3 | `sort_by=value_score` deferred to Phase 2 | ✅ Locked |

No open owner decisions. Implementation gate is open subject to owner approval per §7 of the agent system prompt.

---

## 8. Impact Analysis Output

```
Planning complete: CR-078
Stage: Impact Analysis
Code reality: NONE (zero existing POS aggregate endpoints)
Risk: MEDIUM
Files WILL change: routers/pos_reports.py (new), backend/server.py (+3 lines)
Files WILL NOT touch: all other files
Owner decisions: none open (Q1–Q3 locked)
Docs: planning/CR_078_IMPACT_ANALYSIS.md (this file)
Next: Implementation Plan → Owner Approval → Implementation
```
