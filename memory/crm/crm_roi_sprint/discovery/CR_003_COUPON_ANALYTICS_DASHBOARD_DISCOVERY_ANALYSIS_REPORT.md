# CR-003 Coupon Analytics Dashboard — Discovery + Analysis Report

**CR:** CR-003 Coupon Analytics Dashboard
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-26
**Status:** `cr003_discovery_passed_ready_for_phase_1_planning`

---

## 1. Overall Verdict

**`cr003_discovery_passed_ready_for_phase_1_planning`**

All data required for Phase 1 is already computed by the existing `get_coupon_stats()` service. The rich breakdown data (`breakdown_by_scope`, `breakdown_by_offer_type`, `time_window_usage`, `bxgy_usage`, `nth_item_usage`) exists in the analytics service but is NOT exposed through any API endpoint the frontend can reach. Phase 1 requires ONE backend change: a new dedicated `/api/analytics/coupons` endpoint that returns the full `get_coupon_stats()` response. The rest is frontend-only.

---

## 2. Baseline and Gate Confirmation

| Gate | Status | Evidence |
|---|---|---|
| CR-006 coupon correctness gate | Cleared | `cr006_b11_fixed_real_data_reproduction_complete`, 27/27 POS validate tests pass |
| CRM 1.0 read-only respected | Yes | No files under `/app/memory/crm/crm_1_0/` touched |
| `/app/memory/final/` not touched | Yes | Does not exist, not created |
| Current sprint docs used | Yes | All docs under `/app/memory/crm/crm_roi_sprint/` |

---

## 3. Backend Endpoint Findings

| Item | Finding | Evidence |
|---|---|---|
| Dedicated `/api/analytics/coupons` endpoint | **DOES NOT EXIST** | Searched `analytics.py` (only has item-performance + customer-lifecycle), `feedback.py` (has `/analytics/dashboard` but only 3 coupon fields), `coupons.py` (CRUD + validate/apply, no analytics). No coupon-specific analytics route. |
| Existing coupon data in dashboard | Only 3 fields: `total_coupons`, `coupons_used`, `discount_availed` | `DashboardStats` model lines 1126-1128. Rich breakdown data is computed but NOT passed through. |
| Analytics service `get_coupon_stats()` | **EXISTS and is RICH** | `services/analytics_service.py` lines 217-279. Returns 8 fields including all breakdowns. |
| Route file for analytics | `routers/analytics.py` (item/lifecycle only) + `routers/feedback.py` (dashboard) | server.py includes both: `analytics.router` (prefix `/analytics`) and `feedback.analytics_router` (prefix `/analytics`) |
| Auth/scoping | `get_current_user` (JWT) → `user["id"]` scoping | All analytics endpoints use `user_id` scoping. Consistent pattern. |
| Backend gap | **YES — one new endpoint needed** | Need `GET /api/analytics/coupons` that calls `get_coupon_stats(user_id)` and returns the full response. ~15 lines of code. |

---

## 4. Analytics Service Findings

| Field / Function | Exists? | Notes |
|---|---|---|
| `get_coupon_stats(user_id)` | Yes | `services/analytics_service.py:217` |
| `total_coupons` | Yes | `db.coupons.count_documents` |
| `coupons_used` | Yes | Union of `coupon_usage` (realtime) + `coupon_transactions` (legacy) |
| `discount_availed` | Yes | Sum of `coupon_discount` from both sources |
| `breakdown_by_scope` | Yes | Groups by `discount_scope`: order/item/category/unknown with `used` + `discount` per bucket |
| `breakdown_by_offer_type` | Yes | Groups by `offer_type`: simple/bogo/bxg/nth_item/free_item/combo/unknown with `used` + `discount` per bucket |
| `time_window_usage` | Yes | `coupons_with_window`, `used_within_window`, `used_outside_window_attempts` (placeholder 0) |
| `bxgy_usage` | Yes | `bogo_orders`, `bxg_orders`, `total_applications`, `discount_amount`, `free_units_given`, `discounted_units_given` |
| `nth_item_usage` | Yes | `orders`, `total_applications`, `discount_amount`, `benefit_units_given`, `by_nth_number` breakdown |
| Average discount per use | **NOT computed but trivially derivable** | `discount_availed / coupons_used` on frontend |
| Active coupon count | **NOT computed** | Can be derived: `db.coupons.count_documents(user_id, is_active=True)` — optional for Phase 1, `total_coupons` suffices |

---

## 5. Frontend Structure Findings

| Area | File / Pattern | Notes |
|---|---|---|
| Routes | `/app/frontend/src/App.js` lines 37-63 | Standard `<Route path="..." element={<ProtectedRoute><Page /></ProtectedRoute>} />`. No `/coupon-analytics` route yet. |
| Sidebar/menu | `/app/frontend/src/components/ResponsiveLayout.jsx` lines 23-52 | `navItems` array with objects for paths and grouped children (Analytics group has Lifecycle + Item Analytics). New route can be added as a child of Analytics or a standalone nav item. |
| API service pattern | `useAuth()` returns `api` (axios instance with baseURL + JWT) | All pages use `const { api } = useAuth()` then `api.get("/analytics/...")` |
| Existing dashboard | `DashboardPage.jsx` | Uses `api.get("/analytics/dashboard")`, loading skeleton, `toast.error` on failure |
| Existing analytics pages | `CustomerLifecyclePage.jsx`, `ItemAnalyticsPage.jsx` | Both use `useAuth()` + `api.get()` + loading/error states + `ResponsiveLayout` wrapper |
| Card pattern | `Card`, `CardContent` from `@/components/ui/card` | Used throughout. DashboardPage has `StatCard` component. |
| Empty state | Pulse skeleton for loading; `toast.error` for failures | Consistent across all pages |
| Chart pattern | Recharts `<ResponsiveContainer>` + `<AreaChart>` | Used in `CustomerLifecyclePage.jsx` lines 383-403 |

---

## 6. Recharts / Dependency Findings

| Item | Result | Notes |
|---|---|---|
| Recharts installed | Yes | `package.json`: `"recharts": "^3.6.0"` |
| Recharts already used | Yes | `CustomerLifecyclePage.jsx` imports `AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend` from `"recharts"` |
| Available chart types | All standard Recharts charts | `BarChart`, `PieChart`, `AreaChart`, `LineChart`, `RadialBarChart` etc. — all available from the installed v3.6 package |
| Chart implementation risk | **Low** | Pattern already established, no SSR/build issues |

---

## 7. Phase 1 Feasibility by Section

| Section | Data Available? | Frontend Complexity | Backend Needed? | Notes |
|---|---|---|---|---|
| **Summary cards** (total/used/discount/avg) | Yes — `total_coupons`, `coupons_used`, `discount_availed` | Low — reuse Card pattern | Yes — new endpoint to return full stats | Avg discount = `discount_availed / coupons_used` (frontend division) |
| **Usage by offer type chart** | Yes — `breakdown_by_offer_type` has simple/bogo/bxg/nth_item/free_item/combo/unknown | Medium — Recharts BarChart or PieChart | Same endpoint | Map `bxg` → "Buy X Get Y" display label. Merge `free_item`/`combo`/`unknown` into "Other" if zero |
| **Usage by scope chart** | Yes — `breakdown_by_scope` has order/item/category/unknown | Medium — Recharts PieChart | Same endpoint | Map keys to display labels |
| **Happy Hour card** | Yes — `time_window_usage` has `coupons_with_window`, `used_within_window` | Low — simple stat card | Same endpoint | `used_outside_window_attempts` is placeholder 0 (V3-A2 deferred) |
| **BOGO/BXGY card** | Yes — `bxgy_usage` has orders/applications/discount/free_units/discounted_units | Low-Medium — stat card with 2 sub-rows (BOGO vs BXG) | Same endpoint | Rich data available |
| **Every-Nth card** | Yes — `nth_item_usage` has orders/applications/discount/benefit_units + `by_nth_number` breakdown | Low-Medium — stat card + optional mini-table for by_nth_number | Same endpoint | `by_nth_number` breakdown available for mini-distribution view |

---

## 8. Data Contract for Phase 1

The new `/api/analytics/coupons` endpoint should return the EXACT output of `get_coupon_stats(user_id)`:

```json
{
  "total_coupons": int,
  "coupons_used": int,
  "discount_availed": float,
  "breakdown_by_scope": {
    "order": {"used": int, "discount": float},
    "item": {"used": int, "discount": float},
    "category": {"used": int, "discount": float},
    "unknown": {"used": int, "discount": float}
  },
  "breakdown_by_offer_type": {
    "simple": {"used": int, "discount": float},
    "bogo": {"used": int, "discount": float},
    "bxg": {"used": int, "discount": float},
    "nth_item": {"used": int, "discount": float},
    "free_item": {"used": int, "discount": float},
    "combo": {"used": int, "discount": float},
    "unknown": {"used": int, "discount": float}
  },
  "time_window_usage": {
    "coupons_with_window": int,
    "used_within_window": int,
    "used_outside_window_attempts": int
  },
  "bxgy_usage": {
    "bogo_orders": int,
    "bxg_orders": int,
    "total_applications": int,
    "discount_amount": float,
    "free_units_given": int,
    "discounted_units_given": int
  },
  "nth_item_usage": {
    "orders": int,
    "total_applications": int,
    "discount_amount": float,
    "benefit_units_given": int,
    "by_nth_number": {"3": int, "5": int, ...}
  }
}
```

### Fallback handling for null/empty/zero:
- `total_coupons=0` → show "0" in card, show "No coupons created yet" empty state
- `coupons_used=0` → show "0" in card, charts show empty state with "No usage data yet"
- All breakdown buckets with `used=0` → hide from chart or show as 0-width bar
- `by_nth_number={}` → hide the Every-Nth sub-table
- Average discount when `coupons_used=0` → show "—" or "₹0"

---

## 9. Proposed Phase 1 Implementation File Touch Map

| File | New/Edit | Purpose | Risk |
|---|---|---|---|
| `/app/backend/routers/analytics.py` | Edit | Add `GET /analytics/coupons` endpoint (~15 lines) | Very low — reuses existing `get_coupon_stats()` |
| `/app/frontend/src/pages/CouponAnalyticsPage.jsx` | **New** | Entire coupon analytics dashboard page | Medium — new page but patterns well-established |
| `/app/frontend/src/App.js` | Edit | Add `<Route path="/coupon-analytics" ...>` + import | Very low — 2 lines |
| `/app/frontend/src/components/ResponsiveLayout.jsx` | Edit | Add `/coupon-analytics` to Analytics group children in sidebar | Very low — 1 line in navItems array |

Total: **1 new file + 3 small edits**. No schema changes. No DB changes. No new dependencies.

---

## 10. Risks / Blockers

| Risk | Severity | Evidence | Recommendation |
|---|---|---|---|
| R689 has `coupon_enabled=False` in settings | Low | `loyalty_settings.coupon_enabled=False` — existing dashboard hides coupon section. New analytics page is separate route so unaffected. | New page should load independently of `coupon_enabled` flag — it's an analytics view, not the coupon admin. |
| R689 has 0 coupon_usage rows | Low | All 86 `coupon_usage` docs belong to QA test users, not R689. R689 has 25 coupons but 0 actual usage records. | Page must handle zero-data gracefully. Show empty states. When POS starts using coupons on R689, data will populate automatically. |
| `DashboardStats` model doesn't have breakdown fields | Non-issue | New endpoint bypasses `DashboardStats` — returns raw dict from `get_coupon_stats()` | No model change needed. Endpoint returns dict directly. |
| Two routers share `/analytics` prefix | Low | `analytics.router` (from `routers/analytics.py`) and `feedback.analytics_router` (from `routers/feedback.py`) both use `/analytics`. FastAPI merges them. | Add the new coupon endpoint to `routers/analytics.py` to keep coupon analytics co-located with other analytics (not in feedback router). Verify no path collision. |

---

## 11. Planning Recommendations

1. **Phase 1 requires ONE minimal backend change**: a new `GET /api/analytics/coupons` endpoint in `routers/analytics.py` that calls the existing `get_coupon_stats(user_id)` and returns the full dict. ~15 lines. No schema change, no DB change, no new aggregation logic.

2. **Phase 1 is otherwise frontend-only**: one new page (`CouponAnalyticsPage.jsx`) + route registration + sidebar link.

3. **Owner decisions are sufficient**: Phase 1 scope is locked (separate page, Recharts, all-time, load-on-page-load, no top coupons table, no date picker, no auto-refresh).

4. **Implementation can proceed after planning**: no blockers, no missing data, no external dependencies.

5. **Recommended chart selections**:
   - Usage by offer type → horizontal BarChart (best for categorical comparison with labels)
   - Usage by scope → PieChart or donut (3-4 segments, good for proportion view)
   - Summary cards → simple stat cards matching DashboardPage pattern
   - Happy Hour / BOGO / Nth cards → grouped stat cards with icon + number pairs

---

## 12. Docs Created/Updated

| Path | Action |
|---|---|
| `/app/memory/crm/crm_roi_sprint/discovery/CR_003_COUPON_ANALYTICS_DASHBOARD_DISCOVERY_ANALYSIS_REPORT.md` | Created (this file) |

---

## 13. Confirmed Non-Changes

- Product code changed: **no**
- DB backfill/migration run: **no**
- Env changed: **no**
- Deploy run: **no**
- `/app/memory/final/` touched/created: **no**
- `/app/memory/crm/crm_1_0/` modified: **no**
- CR-004 WhatsApp started: **no**

---

## 14. Recommended Next Agent

**`CR-003 Coupon Analytics Dashboard Phase 1 Planning Agent`**

Input for planning:
- This discovery report
- Locked Phase 1 scope (separate page, Recharts, all-time, no date picker, no auto-refresh, no top coupons table)
- File touch map from section 9
- Data contract from section 8
- Existing patterns from CustomerLifecyclePage + DashboardPage

Output expected:
- Detailed implementation plan with exact UI layout spec
- Chart type decisions per section
- Empty state copy
- Component breakdown
- Implementation order (backend endpoint first, then frontend page, then route + sidebar)
