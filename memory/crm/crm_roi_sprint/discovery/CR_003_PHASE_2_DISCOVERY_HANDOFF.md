# CR-003 — Coupon Analytics Dashboard — Phase 2 Discovery + Handoff

**CR:** CR-003 Coupon Analytics Dashboard Phase 2
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-27
**Status:** `cr003_phase_2_discovery_complete_ready_for_planning`
**Depends on:** Phase 1 QA passed (`cr003_phase_1_qa_passed`)
**Test credentials:** `owner@kunafamahal.com` / `Qplazm@10` (R689 Kunafa Mahal)

---

## 1. Phase 1 Recap (What Already Exists)

Phase 1 shipped and QA-passed on 2026-05-27. Live at `/coupon-analytics`.

| Section | Status |
|---|---|
| Summary cards (Total/Used/Discount/Avg) | ✅ Live |
| Usage by Scope donut chart | ✅ Live |
| Usage by Offer Type bar chart | ✅ Live |
| Happy Hour card | ✅ Live |
| BOGO/BXGY card | ✅ Live |
| Every-Nth card | ✅ Live |
| Backend `GET /api/analytics/coupons` | ✅ Live |

**Screenshot of Phase 1 (R689 live data):** Owner confirmed working — 25 coupons, 4 used, ₹427.50 total discount, ₹106.88 avg.

---

## 2. Phase 2 Scope — Two Features

### Feature P2-A: Top Coupons Table
A per-coupon breakdown table showing which individual coupons are performing.

### Feature P2-B: Date Range Filter
Let the owner filter the entire dashboard by time period.

---

## 3. Feature P2-A — Top Coupons Table

### 3.1 What it shows (plain English)

A sortable table below the Phase 1 charts. Each row = one coupon. Answers: *"Which of my 25 coupons are actually being used, and which are sitting idle?"*

### 3.2 Column spec

| Column | Source | Type | Notes |
|---|---|---|---|
| Code | `coupons.code` | string | e.g. `SEED_V2_CATMULTI` |
| Title | `coupons.title` | string | e.g. "10% off on authentic kunafa" |
| Scope | `coupons.discount_scope` | badge | order / item / category |
| Offer Type | `coupons.offer_type` | badge | simple / bogo / bxg / nth_item |
| Times Used | `coupon_usage` count per code | int | 0 for unused |
| Total Discount | `coupon_usage` sum of `coupon_discount` per code | ₹ float | ₹0.00 for unused |
| Last Used | `coupon_usage` max `used_at` per code | datetime | "Never" for unused |
| Status | `coupons.is_active` | badge | Active / Inactive |

### 3.3 Default sort
By `times_used` descending (most-used coupons first). Owner can click column headers to re-sort.

### 3.4 Backend change needed

**New endpoint:** `GET /api/analytics/coupons/top`

```
Parameters: none (all-time; date filter added in P2-B)
Auth: get_current_user (same as /analytics/coupons)
```

**Aggregation logic:**
1. Fetch all `coupons` for `user_id` → dict keyed by `code`
2. Aggregate `coupon_usage` grouped by `coupon_code` → `times_used`, `total_discount`, `last_used`
3. Also aggregate `coupon_transactions` (legacy) grouped by `coupon_code` → merge counts
4. Left-join: every coupon gets a row, even if 0 usage
5. Return sorted list

**Response shape:**
```json
{
  "coupons": [
    {
      "code": "SEED_V2_CATMULTI",
      "title": "10% off on authentic kunafa",
      "discount_scope": "category",
      "offer_type": "simple",
      "discount_type": "percentage",
      "discount_value": 10.0,
      "is_active": true,
      "times_used": 1,
      "total_discount": 29.9,
      "last_used": "2026-05-27T11:31:55",
      "usage_limit": null,
      "per_user_limit": null
    }
  ],
  "total": 25
}
```

### 3.5 R689 live data preview

Top 4 used coupons (rest are 0):

| Code | Title | Scope | Used | Discount | Last Used |
|---|---|---|---|---|---|
| SEED_EDGE_STACKABLE | 10% Off Stackable Dine-In | order | 1 | ₹150.00 | 2026-05-27 |
| SEED_V3A_LUNCH | Lunch Happy Hour 20% | order | 1 | ₹147.60 | 2026-05-27 |
| FLAT100TEST | Flat 100 Off Test | order | 1 | ₹100.00 | 2026-05-27 |
| SEED_V2_CATMULTI | 10% off authentic kunafa | category | 1 | ₹29.90 | 2026-05-27 |

Remaining 21 coupons: 0 used, ₹0.00, "Never".

### 3.6 Frontend

- New section at bottom of `CouponAnalyticsPage.jsx` (below Every-Nth card)
- Sortable table (reuse pattern from `ItemAnalyticsPage.jsx` which has sortable columns)
- Scope + Offer Type shown as colored badges
- Status shown as Active (green) / Inactive (red) badge
- "Never" for last_used when null
- Loads from new endpoint `api.get("/analytics/coupons/top")` on page load (alongside existing call)

### 3.7 `total_used` consistency check
All 25 R689 coupons have `coupons.total_used` matching actual `coupon_usage` count (**25/25 ✅**). This field can be used as a fast shortcut but the authoritative source is the `coupon_usage` aggregation.

---

## 4. Feature P2-B — Date Range Filter

### 4.1 What it does (plain English)

A filter control at the top of the page. Owner picks a time period → all dashboard sections re-fetch with that date range applied. *"How did my coupons perform this week vs last month?"*

### 4.2 Filter options

| Option | Filter value |
|---|---|
| All Time | no date filter (current default) |
| Last 7 Days | `used_at >= now - 7d` |
| Last 30 Days | `used_at >= now - 30d` |
| Last 90 Days | `used_at >= now - 90d` |

No custom date picker in Phase 2 — just preset buttons (matches the pattern in ItemAnalyticsPage which uses `time_period` query param with `7d/30d/90d/all`).

### 4.3 Backend changes needed

**Modify existing** `GET /api/analytics/coupons`:
- Add query param: `time_period: str = Query("all", description="7d, 30d, 90d, all")`
- Pass date cutoff into `get_coupon_stats(user_id, date_from=...)`
- Modify `get_coupon_stats()` to accept optional `date_from` parameter
- Apply `{"used_at": {"$gte": date_from}}` filter to all `coupon_usage` aggregation pipelines
- `total_coupons` count should NOT be date-filtered (it's total created, not total used)
- `coupon_transactions` (legacy) filter on `created_at` if `date_from` provided

**Modify** `GET /api/analytics/coupons/top`:
- Same `time_period` query param
- Filter `coupon_usage` aggregation by date
- Coupon list itself not date-filtered (show all coupons, but usage counts within window)

### 4.4 Index check
`idx_user_created_at` exists on `coupon_usage`: `[("user_id", 1), ("created_at", -1)]` ✅
However, the date field used in aggregations is `used_at`, not `created_at`. They're typically identical (both set at recording time), but for correctness the filter should use `used_at`.

**Recommendation:** Add index `[("user_id", 1), ("used_at", -1)]` on `coupon_usage` if not already present.

### 4.5 Frontend changes

- Add a `Select` dropdown (or pill buttons) at top-right of page header: "All Time | 7D | 30D | 90D"
- On change: re-fetch both endpoints with `?time_period=7d` etc.
- Summary cards, charts, special offer cards, and top coupons table all update
- Loading state during re-fetch (skeleton or spinner overlay)
- Match pattern from `ItemAnalyticsPage.jsx` which already has time period selector

### 4.6 Date range on R689 data
All 4 usage records are from 2026-05-27 (today). So 7D/30D/90D will all show the same data. But this is correct — the filter is ready for when data accumulates over time.

---

## 5. Files to Touch (Phase 2)

| File | Action | Feature |
|---|---|---|
| `/app/backend/services/analytics_service.py` | Edit — add `date_from` param to `get_coupon_stats()` and its 5 sub-functions | P2-B |
| `/app/backend/routers/analytics.py` | Edit — add `time_period` param to `GET /analytics/coupons`, add new `GET /analytics/coupons/top` | P2-A + P2-B |
| `/app/frontend/src/pages/CouponAnalyticsPage.jsx` | Edit — add Top Coupons table section + date filter control + re-fetch logic | P2-A + P2-B |

**Total: 3 files edited. No new files. No new dependencies. No DB schema changes.**

---

## 6. Implementation Order (Recommended)

| Step | Task | Depends on |
|---|---|---|
| 1 | Add `date_from` param to `get_coupon_stats()` + sub-functions | — |
| 2 | Add `time_period` query param to `GET /analytics/coupons` | Step 1 |
| 3 | Add `GET /analytics/coupons/top` endpoint | — |
| 4 | Add date filter UI to `CouponAnalyticsPage.jsx` | Step 2 |
| 5 | Add Top Coupons table to `CouponAnalyticsPage.jsx` | Step 3 |
| 6 | Visual QA | Steps 4-5 |

Steps 1-3 are backend (can be done together). Steps 4-5 are frontend (can be done together).

---

## 7. R689 Expected Test Data (Phase 2)

### Top Coupons Table (all-time)
- 25 rows total
- 4 with usage (FLAT100TEST, SEED_EDGE_STACKABLE, SEED_V2_CATMULTI, SEED_V3A_LUNCH)
- 21 with 0 usage
- All active

### Date filter
- All Time: 4 used, ₹427.50
- 7D: 4 used, ₹427.50 (all usage is from today)
- 30D: 4 used, ₹427.50
- 90D: 4 used, ₹427.50

### R523 (richer for visual testing if needed)
- 8 coupons, 11 usage records, ₹1712.90
- Has FLAT (5 uses), %OFF (2), HAPPYHOUR (2), ITEM (1), BOGO (1)

---

## 8. Risk Assessment

| Risk | Level | Mitigation |
|---|---|---|
| `get_coupon_stats()` has 5 sub-functions to modify | Medium | All follow same pattern — add `$gte` filter to `$match` stage. Mechanical. |
| `used_at` vs `created_at` inconsistency | Low | Both set at same time. Filter on `used_at` for correctness. Add index if needed. |
| All R689 usage is same day — date filter looks useless | None | Correct for test. Value emerges as real orders flow in. |
| Top Coupons table with 25 rows | None | Small dataset. No pagination needed Phase 2. |

---

## 9. Scope Guard (Phase 2)

| Feature | In scope? |
|---|---|
| Top Coupons table | ✅ Yes |
| Date range filter (preset: 7d/30d/90d/all) | ✅ Yes |
| Custom date picker (calendar) | ❌ No (Phase 3) |
| Export CSV | ❌ No (Phase 3) |
| Auto-refresh | ❌ No |
| Per-coupon detail click-through | ❌ No |
| Discount mismatch alerts | ❌ No |

---

## 10. References

- Phase 1 plan: `../planning/CR_003_COUPON_ANALYTICS_DASHBOARD_PHASE_1_PLAN.md`
- Phase 1 implementation: `../implementation/CR_003_COUPON_ANALYTICS_DASHBOARD_PHASE_1_IMPLEMENTATION_REPORT.md`
- Phase 1 QA: `../qa/CR_003_COUPON_ANALYTICS_DASHBOARD_PHASE_1_QA_REPORT.md`
- Original CR-003 doc: `/app/memory/crm/crm_1_0/planning/CR_003_COUPON_ANALYTICS_DASHBOARD.md` (Section G = Top Coupons, Q4 = date filter)
- Analytics service: `/app/backend/services/analytics_service.py:217-437`
- Existing endpoint: `/app/backend/routers/analytics.py` → `GET /analytics/coupons`
- Frontend: `/app/frontend/src/pages/CouponAnalyticsPage.jsx`
- ItemAnalyticsPage pattern (time_period + sortable table): `/app/frontend/src/pages/ItemAnalyticsPage.jsx`

---

## 11. Status

```
cr003_phase_2_discovery_complete_ready_for_planning
```

**Handoff to:** `CR-003 Coupon Analytics Dashboard Phase 2 Planning Agent`

End of Phase 2 discovery.
