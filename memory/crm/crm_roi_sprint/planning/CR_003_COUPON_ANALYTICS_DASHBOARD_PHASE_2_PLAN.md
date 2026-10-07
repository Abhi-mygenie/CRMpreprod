# CR-003 — Coupon Analytics Dashboard — Phase 2 Implementation Plan

**CR:** CR-003 Coupon Analytics Dashboard Phase 2
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-27
**Status:** `cr003_phase_2_planning_complete_ready_for_implementation`
**Depends on:** Phase 1 QA passed, Phase 2 discovery complete
**Test credentials:** `owner@kunafamahal.com` / `Qplazm@10` (R689 Kunafa Mahal)

---

## 1. Objective

Add two features to the live `/coupon-analytics` dashboard:
- **P2-A:** Top Coupons Table — per-coupon performance breakdown
- **P2-B:** Date Range Filter — preset time period filter across all sections

---

## 2. Locked Scope

| Decision | Value |
|---|---|
| Date filter options | `All Time` / `7D` / `30D` / `90D` — preset pills, no calendar |
| Table sort | Client-side sortable column headers, default by times_used desc |
| Table pagination | Not needed (R689 has 25 coupons — fits in one view) |
| `total_coupons` count | NOT date-filtered (always shows total created) |
| Legacy `coupon_transactions` | Date-filtered on `created_at` when applicable |

---

## 3. Out of Scope

- Custom date picker (calendar) — Phase 3
- Export CSV — Phase 3
- Auto-refresh — not needed
- Per-coupon detail click-through page
- Discount mismatch alerts
- New npm dependencies
- DB schema/migration changes
- CRM 1.0 docs
- `/app/memory/final/`

---

## 4. Bucket-Based Implementation Plan

### Bucket A — Backend: date filter on `get_coupon_stats()`

**File:** `/app/backend/services/analytics_service.py`

**Changes:**

1. Modify `get_coupon_stats(user_id: str)` → `get_coupon_stats(user_id: str, date_from: str = None)`

2. When `date_from` is provided, inject `{"used_at": {"$gte": date_from}}` into every `coupon_usage` query's `$match` stage. Specifically:
   - `realtime_used` count_documents (line 237) — add `used_at` filter
   - `pipeline_realtime` $match (line 239) — add `used_at` filter
   - `breakdown_pipeline` $match (line 247) — add `used_at` filter
   - `_get_breakdown_by_offer_type` — pass `date_from`, add to $match
   - `_get_time_window_usage` — pass `date_from`, add to `used_within_window` count
   - `_get_bxgy_usage` — pass `date_from`, add to all 3 queries + cursor
   - `_get_nth_item_usage` — pass `date_from`, add to all 3 queries + cursor

3. `legacy_used` / `pipeline_legacy` (coupon_transactions) — filter on `created_at` instead of `used_at`

4. `total_coupons` — **NO date filter** (always total created)

5. `coupons_with_window` in `_get_time_window_usage` — **NO date filter** (coupon definition, not usage)

**Pattern for injection (DRY helper):**
```python
def _usage_match(user_id: str, date_from: str = None, **extra) -> dict:
    m = {"user_id": user_id, **extra}
    if date_from:
        m["used_at"] = {"$gte": date_from}
    return m
```

Place helper at top of the service file. All sub-functions call it instead of constructing `$match` dicts manually.

**Signature changes for sub-functions:**
```python
async def _get_breakdown_by_offer_type(user_id: str, date_from: str = None)
async def _get_time_window_usage(user_id: str, date_from: str = None)
async def _get_bxgy_usage(user_id: str, date_from: str = None)
async def _get_nth_item_usage(user_id: str, date_from: str = None)
```

**Owner validation:**
- `curl /api/analytics/coupons` (no param) → same response as Phase 1 (backward compat)
- `curl /api/analytics/coupons?time_period=7d` → same data (all R689 usage is from today)

---

### Bucket B — Backend: `GET /analytics/coupons` date param + `GET /analytics/coupons/top`

**File:** `/app/backend/routers/analytics.py`

**Change 1 — Add `time_period` to existing endpoint:**
```python
@router.get("/coupons")
async def get_coupon_analytics(
    time_period: str = Query("all", description="7d, 30d, 90d, all"),
    user: dict = Depends(get_current_user),
):
    from services.analytics_service import get_coupon_stats
    date_from = _time_period_to_date(time_period)  # helper
    return await get_coupon_stats(user["id"], date_from=date_from)
```

**Change 2 — New endpoint:**
```python
@router.get("/coupons/top")
async def get_top_coupons(
    time_period: str = Query("all", description="7d, 30d, 90d, all"),
    user: dict = Depends(get_current_user),
):
```

Aggregation logic:
1. `db.coupons.find({"user_id": user_id})` → all coupons (no date filter)
2. `db.coupon_usage.aggregate(group by coupon_code, with optional date filter)` → times_used, total_discount, last_used
3. `db.coupon_transactions.aggregate(group by coupon_code, with optional date filter)` → legacy merge
4. Left-join all coupons with usage data
5. Sort by `times_used` desc, then `code` asc
6. Return `{ "coupons": [...], "total": N }`

**Shared helper** (used by both endpoints):
```python
def _time_period_to_date(time_period: str) -> Optional[str]:
    if time_period == "all":
        return None
    days_map = {"7d": 7, "30d": 30, "90d": 90}
    days = days_map.get(time_period)
    if days is None:
        return None
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
```

**IMPORTANT:** Place `/coupons/top` route BEFORE the customer-lifecycle section but AFTER `/coupons` to avoid FastAPI path collision. `/coupons/top` must come before any `/{param}` style routes (there are none currently, but defensive ordering).

**Owner validation:**
- `curl /api/analytics/coupons/top` → 25 coupons, 4 with usage
- `curl /api/analytics/coupons/top?time_period=7d` → same (all data is today)
- Backward compat: `curl /api/analytics/coupons` → unchanged response shape

---

### Bucket C — Frontend: Date filter UI

**File:** `/app/frontend/src/pages/CouponAnalyticsPage.jsx`

**Changes:**

1. Add state: `const [timePeriod, setTimePeriod] = useState("all")`

2. Modify `fetchData` to pass `time_period` param to both API calls:
   ```js
   api.get(`/analytics/coupons?time_period=${timePeriod}`)
   api.get(`/analytics/coupons/top?time_period=${timePeriod}`)
   ```

3. Re-fetch on `timePeriod` change: add `timePeriod` to `useEffect` dependency array.

4. Add pill button group in page header (top-right), matching `ItemAnalyticsPage.jsx` pattern:
   ```
   [All Time] [7D] [30D] [90D]
   ```
   Active pill highlighted in brand color (#F26B33).

5. Show loading overlay during re-fetch (not full skeleton — just a subtle spinner/opacity overlay so the owner sees the layout stays stable).

**Owner validation:**
- Pill buttons visible in header
- Clicking "7D" triggers re-fetch
- Data stays the same for R689 (all usage is today)
- "All Time" is default selected

---

### Bucket D — Frontend: Top Coupons Table

**File:** `/app/frontend/src/pages/CouponAnalyticsPage.jsx`

**Changes:**

1. Add state: `const [topCoupons, setTopCoupons] = useState([])`

2. Fetch in same `useEffect` as existing data: `api.get(\`/analytics/coupons/top?time_period=${timePeriod}\`)`

3. New section below the special offer cards row:

   **Section title:** "Coupon Performance" (Card wrapper)

   **Table columns (sortable):**
   | Column | Key | Format |
   |---|---|---|
   | Code | `code` | monospace text |
   | Title | `title` | truncated to ~30 chars |
   | Scope | `discount_scope` | colored badge (order=#F26B33, item=#8B5CF6, category=#329937) |
   | Type | `offer_type` | colored badge |
   | Used | `times_used` | number |
   | Discount | `total_discount` | ₹ formatted |
   | Last Used | `last_used` | date or "Never" |
   | Status | `is_active` | green "Active" / red "Inactive" badge |

4. Client-side sorting (reuse `SortableHeader` pattern from `ItemAnalyticsPage.jsx`):
   - Default: `times_used` desc
   - Click column header → toggle asc/desc

5. **data-testid** plan:
   | Element | data-testid |
   |---|---|
   | Table container | `table-top-coupons` |
   | Sort header: code | `sort-code` |
   | Sort header: times_used | `sort-times-used` |

6. **Edge states:**
   - 0 coupons: show "No coupons created yet" inside card
   - All coupons 0 usage: table renders normally (rows show 0, "Never")
   - `last_used` null → display "Never"
   - `title` null/empty → display "—"

**Owner validation:**
- 25 rows visible for R689
- Top 4 rows show usage data
- Remaining 21 show "0" and "Never"
- Column sort works (click "Discount" → reorders)
- Scope/Type badges colored correctly

---

### Bucket E — Final validation + docs

- Backend lint
- Frontend lint
- Screenshot of full page with table + filter
- Confirm backward compat (`?time_period` not required)
- Create implementation report
- Update register

---

## 5. Planned File Changes

| File | New/Edit | Purpose |
|---|---|---|
| `/app/backend/services/analytics_service.py` | **Edit** | Add `date_from` param to `get_coupon_stats` + 4 sub-functions + DRY `_usage_match` helper |
| `/app/backend/routers/analytics.py` | **Edit** | Add `time_period` param to `GET /coupons`, add `GET /coupons/top` endpoint, add `_time_period_to_date` helper |
| `/app/frontend/src/pages/CouponAnalyticsPage.jsx` | **Edit** | Add date filter pills, Top Coupons table section, sortable columns, re-fetch logic |

**Total: 3 files edited. 0 new files. 0 new dependencies. 0 DB schema changes.**

---

## 6. QA Checklist

### Backend
- [ ] `GET /api/analytics/coupons` without `time_period` → same response as Phase 1 (backward compat)
- [ ] `GET /api/analytics/coupons?time_period=7d` → 200, `total_coupons` unchanged, usage stats filtered
- [ ] `GET /api/analytics/coupons?time_period=all` → identical to no-param call
- [ ] `GET /api/analytics/coupons/top` → 200, `total=25`, 4 coupons with `times_used > 0`
- [ ] `GET /api/analytics/coupons/top?time_period=7d` → same data (all R689 is today)
- [ ] Auth: both endpoints 403/401 without token
- [ ] Scoping: R689 ≠ R523 data

### Frontend — Date filter
- [ ] Pill buttons visible: All Time / 7D / 30D / 90D
- [ ] "All Time" is default selected
- [ ] Clicking a pill re-fetches both endpoints
- [ ] Summary cards + charts + special offer cards update
- [ ] Loading indicator during re-fetch

### Frontend — Top Coupons Table
- [ ] Table renders below special offer cards
- [ ] 25 rows for R689
- [ ] Column headers: Code, Title, Scope, Type, Used, Discount, Last Used, Status
- [ ] Default sort: times_used desc
- [ ] Click column header → toggles sort
- [ ] Scope badges colored (order/item/category)
- [ ] Status badges: Active (green) / Inactive (red)
- [ ] Last Used shows "Never" for unused coupons
- [ ] 0-value rows render cleanly

### Scope guard
- [ ] No custom date picker / calendar
- [ ] No CSV export
- [ ] No auto-refresh
- [ ] No per-coupon click-through
- [ ] No new npm dependencies

---

## 7. R689 Expected Test Data

### Summary cards (All Time)
| Card | Value |
|---|---|
| Total Coupons | 25 |
| Times Used | 4 |
| Total Discount | ₹427.50 |
| Avg Discount | ₹106.88 |

### Top Coupons (first 4 rows, sorted by used desc)
| Code | Used | Discount | Last Used |
|---|---|---|---|
| SEED_EDGE_STACKABLE | 1 | ₹150.00 | 2026-05-27 |
| SEED_V3A_LUNCH | 1 | ₹147.60 | 2026-05-27 |
| FLAT100TEST | 1 | ₹100.00 | 2026-05-27 |
| SEED_V2_CATMULTI | 1 | ₹29.90 | 2026-05-27 |

All 4 tied at `times_used=1`, secondary sort by `code` asc determines order.

---

## 8. Rollback / Safety

- Both endpoints default to `time_period=all` → Phase 1 behavior preserved
- `get_coupon_stats(user_id)` signature still works without `date_from` → no caller breakage
- `/coupons/top` is a new additive endpoint — cannot break existing flows
- Frontend re-fetch is triggered by state change — no polling / interval

---

## 9. References

- Phase 2 discovery: `../discovery/CR_003_PHASE_2_DISCOVERY_HANDOFF.md`
- Phase 1 plan: `../planning/CR_003_COUPON_ANALYTICS_DASHBOARD_PHASE_1_PLAN.md`
- Analytics service (current): `/app/backend/services/analytics_service.py:217-437`
- Analytics router (current): `/app/backend/routers/analytics.py:222-232`
- Frontend page (current): `/app/frontend/src/pages/CouponAnalyticsPage.jsx`
- ItemAnalyticsPage sort/filter pattern: `/app/frontend/src/pages/ItemAnalyticsPage.jsx:59-105`

---

## 10. Status

```
cr003_phase_2_planning_complete_ready_for_implementation
```

End of CR-003 Phase 2 planning.
