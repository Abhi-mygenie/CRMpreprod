# CR-003 — Coupon Analytics Dashboard — Phase 1 Implementation Plan

**CR:** CR-003 Coupon Analytics Dashboard
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-27
**Status:** `cr003_phase_1_planning_complete_ready_for_implementation`
**Depends on:** Discovery report `../discovery/CR_003_COUPON_ANALYTICS_DASHBOARD_DISCOVERY_ANALYSIS_REPORT.md`

---

## 1. Locked Owner Scope (Phase 1 Only)

| Decision | Value |
|---|---|
| Page location | Separate route `/coupon-analytics` |
| Sidebar placement | Under **Analytics** dropdown, 3rd child after Lifecycle + Item Analytics |
| Chart library | Recharts (v3.6, already installed) |
| Time range | All-time only — no date picker |
| Refresh | On page load only — no auto-refresh |
| Top Coupons table | NOT included (Phase 2) |
| Date range picker | NOT included (Phase 2) |

---

## 2. Files to Touch

| File | New / Edit | Purpose | Lines (est.) |
|---|---|---|---|
| `/app/backend/routers/analytics.py` | **Edit** | Add `GET /analytics/coupons` endpoint | ~12 |
| `/app/frontend/src/pages/CouponAnalyticsPage.jsx` | **New** | Full coupon analytics dashboard page | ~350 |
| `/app/frontend/src/App.js` | **Edit** | Add route + import (2 lines) | 2 |
| `/app/frontend/src/components/ResponsiveLayout.jsx` | **Edit** | Add sidebar child item under Analytics group (1 line) | 1 |

**Total:** 1 new file + 3 small edits. No schema changes. No DB changes. No new dependencies. No env changes.

---

## 3. Backend Plan

### 3.1 New Endpoint: `GET /api/analytics/coupons`

**File:** `/app/backend/routers/analytics.py` (append after the last `@router.get` block, before the customer-lifecycle section comment block at line 222)

**Spec:**

```python
@router.get("/coupons")
async def get_coupon_analytics(user: dict = Depends(get_current_user)):
    """
    CR-003: Coupon analytics dashboard — full breakdown.
    Returns all-time coupon stats for the authenticated restaurant owner.
    """
    from services.analytics_service import get_coupon_stats
    user_id = user["id"]
    return await get_coupon_stats(user_id)
```

**Auth:** Uses `get_current_user` (JWT) exactly like every other analytics endpoint in this file. `user["id"]` scoping ensures restaurant isolation.

**Response shape:** Exact output of `get_coupon_stats()` — see data contract in section 6.

**No new imports needed** beyond the inline `from services.analytics_service import get_coupon_stats`.

### 3.2 Route Collision Check

Two routers share the `/analytics` prefix:
- `routers/analytics.py` → `prefix="/analytics"` (item-performance, customer-lifecycle)
- `routers/feedback.py` → `feedback.analytics_router` with `prefix="/analytics"` (dashboard)

New endpoint path `/analytics/coupons` is unique — no collision with any existing path:
- `/analytics/item-performance` (analytics.py)
- `/analytics/item-performance/export` (analytics.py)
- `/analytics/item-customers/{item_name}` (analytics.py)
- `/analytics/customer-lifecycle` (analytics.py)
- `/analytics/customer-lifecycle/trend` (analytics.py)
- `/analytics/customer-lifecycle/customers` (analytics.py)
- `/analytics/customer-lifecycle/export` (analytics.py)
- `/analytics/dashboard` (feedback.py)

**Confirmed: no collision.**

---

## 4. Frontend Plan

### 4.1 Route Registration (`App.js`)

Add import at line ~24 (after CustomerLifecyclePage import):
```js
import CouponAnalyticsPage from "@/pages/CouponAnalyticsPage";
```

Add route at line ~57 (after `/customer-lifecycle` route):
```jsx
<Route path="/coupon-analytics" element={<ProtectedRoute><CouponAnalyticsPage /></ProtectedRoute>} />
```

### 4.2 Sidebar Registration (`ResponsiveLayout.jsx`)

Add to the `analytics` group children array (line 46, after Item Analytics):
```js
{ path: "/coupon-analytics", icon: Gift, label: "Coupon Analytics" },
```

Also add `Gift` to the lucide-react import at line 5 (already imported — verify).

Update `analyticsChildPaths` at line 19 to include `/coupon-analytics`:
```js
const analyticsChildPaths = ["/customer-lifecycle", "/item-analytics", "/coupon-analytics"];
```

### 4.3 Page Structure (`CouponAnalyticsPage.jsx`)

Follow the exact pattern from `CustomerLifecyclePage.jsx` and `ItemAnalyticsPage.jsx`:

```
CouponAnalyticsPage
├── useAuth() → api
├── useState: data (null), loading (true), error (false)
├── useEffect → fetchData() on mount
├── fetchData: api.get("/analytics/coupons") → setData
├── Loading state: pulse skeleton cards + chart placeholders
├── Error state: toast.error + "Failed to load" message
├── ResponsiveLayout wrapper
│
├── Page header: "Coupon Analytics" title
│
├── Section 1: Summary Cards (4-card grid)
│   ├── Total Coupons (Ticket icon, color: #8B5CF6)
│   ├── Times Used (Ticket icon, color: #F26B33)
│   ├── Total Discount (Ticket icon, prefix: "₹", color: #329937)
│   └── Avg Discount Per Use (Ticket icon, prefix: "₹", color: #62B5E5)
│       └── Derived: discount_availed / coupons_used (show "—" if coupons_used = 0)
│
├── Section 2: Charts Row (2-column grid on desktop, stacked on mobile)
│   ├── Usage by Scope — PieChart (donut)
│   │   ├── data: breakdown_by_scope → filter out zero-used buckets
│   │   ├── segments: Order (#F26B33), Item (#8B5CF6), Category (#329937), Unknown (#9CA3AF)
│   │   ├── inner label: total used count
│   │   └── empty state: "No usage data yet" centered text
│   │
│   └── Usage by Offer Type — BarChart (horizontal)
│       ├── data: breakdown_by_offer_type → filter out zero-used buckets
│       ├── display labels: simple→"Simple", bogo→"BOGO", bxg→"Buy X Get Y", nth_item→"Every Nth", free_item→"Free Item", combo→"Combo"
│       ├── bar color: #F26B33
│       ├── Y-axis: offer type labels
│       ├── X-axis: used count
│       └── empty state: "No usage data yet" centered text
│
├── Section 3: Special Offer Cards (3-column grid on desktop, stacked on mobile)
│   ├── Happy Hour Card
│   │   ├── icon: Clock
│   │   ├── rows:
│   │   │   ├── "Coupons with time window" → time_window_usage.coupons_with_window
│   │   │   └── "Used within window" → time_window_usage.used_within_window
│   │   └── show "0" for zero values (not hidden)
│   │
│   ├── BOGO / Buy-X-Get-Y Card
│   │   ├── icon: Gift
│   │   ├── rows:
│   │   │   ├── "BOGO orders" → bxgy_usage.bogo_orders
│   │   │   ├── "BXG orders" → bxgy_usage.bxg_orders
│   │   │   ├── "Free items given" → bxgy_usage.free_units_given
│   │   │   ├── "Discounted items" → bxgy_usage.discounted_units_given
│   │   │   └── "Discount amount" → ₹ bxgy_usage.discount_amount
│   │   └── show "0" for zero values (not hidden)
│   │
│   └── Every-Nth Card
│       ├── icon: Repeat
│       ├── rows:
│       │   ├── "Orders" → nth_item_usage.orders
│       │   ├── "Benefit items given" → nth_item_usage.benefit_units_given
│       │   ├── "Discount amount" → ₹ nth_item_usage.discount_amount
│       │   └── "By Nth number" → mini inline list from by_nth_number (e.g. "Every 3rd: 5x, Every 5th: 2x")
│       │       └── hide this row if by_nth_number is empty {}
│       └── show "0" for zero values (not hidden)
```

### 4.4 Component Reuse

| Component | Source | Usage |
|---|---|---|
| `Card`, `CardContent`, `CardHeader`, `CardTitle` | `@/components/ui/card` | All cards |
| `ResponsiveLayout` | `@/components/ResponsiveLayout` | Page wrapper |
| `useAuth` → `api` | `@/contexts/AuthContext` | API calls |
| `toast` | `sonner` | Error notifications |
| `ResponsiveContainer`, `PieChart`, `Pie`, `Cell`, `BarChart`, `Bar`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `Legend` | `recharts` | Charts |
| Icons: `Ticket`, `Gift`, `Clock`, `Repeat`, `RefreshCw` | `lucide-react` | Card icons + loading spinner |

**No new dependencies to install.**

### 4.5 Recharts Specifics

**PieChart (Usage by Scope):**
```jsx
<PieChart>
  <Pie data={scopeData} dataKey="used" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2}>
    {scopeData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
  </Pie>
  <Tooltip />
  <Legend />
</PieChart>
```

**BarChart (Usage by Offer Type):**
```jsx
<BarChart data={offerData} layout="vertical" margin={{ left: 80 }}>
  <CartesianGrid strokeDasharray="3 3" />
  <XAxis type="number" />
  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} />
  <Tooltip />
  <Bar dataKey="used" fill="#F26B33" radius={[0, 4, 4, 0]} />
</BarChart>
```

---

## 5. State Handling Plan

| State | Trigger | UI |
|---|---|---|
| **Loading** | `loading === true` (initial fetch) | Pulse-animated skeleton: 4 card placeholders (top row) + 2 chart placeholders (middle row) + 3 card placeholders (bottom row). Match `DashboardPage` skeleton style. |
| **Error** | API call fails | `toast.error("Failed to load coupon analytics")` + centered "Unable to load data. Please try again." message with retry button |
| **Empty (no coupons)** | `total_coupons === 0` | Summary cards show "0". Charts show centered "No coupons created yet" text. Special offer cards show "0" for all rows. |
| **Partial data (has coupons, no usage)** | `coupons_used === 0` | Summary cards show 0 for Used/Discount/Avg. Charts show "No usage data yet". Special offer cards show "0". |
| **Zero in specific sections** | e.g. `bxgy_usage.bogo_orders === 0` | Show "0" — never hide a card. Owner needs to see that these features exist but aren't being used. |
| **Chart zero-filter** | All buckets have `used === 0` | Don't render chart at all — show "No usage data yet" text in chart area. If at least 1 bucket has `used > 0`, render chart with only non-zero buckets. |

---

## 6. Data Contract (Backend → Frontend)

The endpoint returns the exact output of `get_coupon_stats(user_id)`:

```json
{
  "total_coupons": 25,
  "coupons_used": 4,
  "discount_availed": 427.5,
  "breakdown_by_scope": {
    "order": {"used": 3, "discount": 397.6},
    "item": {"used": 0, "discount": 0.0},
    "category": {"used": 1, "discount": 29.9},
    "unknown": {"used": 0, "discount": 0.0}
  },
  "breakdown_by_offer_type": {
    "simple": {"used": 4, "discount": 427.5},
    "bogo": {"used": 0, "discount": 0.0},
    "bxg": {"used": 0, "discount": 0.0},
    "nth_item": {"used": 0, "discount": 0.0},
    "free_item": {"used": 0, "discount": 0.0},
    "combo": {"used": 0, "discount": 0.0},
    "unknown": {"used": 0, "discount": 0.0}
  },
  "time_window_usage": {
    "coupons_with_window": 5,
    "used_within_window": 1,
    "used_outside_window_attempts": 0
  },
  "bxgy_usage": {
    "bogo_orders": 0,
    "bxg_orders": 0,
    "total_applications": 0,
    "discount_amount": 0.0,
    "free_units_given": 0,
    "discounted_units_given": 0
  },
  "nth_item_usage": {
    "orders": 0,
    "total_applications": 0,
    "discount_amount": 0.0,
    "benefit_units_given": 0,
    "by_nth_number": {}
  }
}
```

Frontend derives:
- `avg_discount = discount_availed / coupons_used` (guard: if `coupons_used === 0`, show "—")

---

## 7. Display Label Maps

### Scope labels
| API key | Display label | Color |
|---|---|---|
| `order` | Order-Level | `#F26B33` |
| `item` | Item-Level | `#8B5CF6` |
| `category` | Category-Level | `#329937` |
| `unknown` | Other | `#9CA3AF` |

### Offer type labels
| API key | Display label |
|---|---|
| `simple` | Simple |
| `bogo` | BOGO |
| `bxg` | Buy X Get Y |
| `nth_item` | Every Nth |
| `free_item` | Free Item |
| `combo` | Combo |
| `unknown` | Other |

---

## 8. Data-Testid Plan

| Element | data-testid |
|---|---|
| Page container | `coupon-analytics-page` |
| Summary card: Total Coupons | `stat-total-coupons` |
| Summary card: Times Used | `stat-times-used` |
| Summary card: Total Discount | `stat-total-discount` |
| Summary card: Avg Discount | `stat-avg-discount` |
| Scope chart container | `chart-usage-by-scope` |
| Offer type chart container | `chart-usage-by-offer-type` |
| Happy Hour card | `card-happy-hour` |
| BOGO/BXGY card | `card-bogo-bxgy` |
| Every-Nth card | `card-every-nth` |
| Loading skeleton | `coupon-analytics-loading` |
| Error state | `coupon-analytics-error` |

---

## 9. Implementation Order

| Step | Task | Depends on |
|---|---|---|
| 1 | Add `GET /analytics/coupons` endpoint in `routers/analytics.py` | — |
| 2 | Test endpoint via curl (R689 user) | Step 1 |
| 3 | Create `CouponAnalyticsPage.jsx` with all sections | Step 1 |
| 4 | Add route in `App.js` | Step 3 |
| 5 | Add sidebar item in `ResponsiveLayout.jsx` | Step 3 |
| 6 | Visual QA — screenshot page with R689 data | Steps 3-5 |
| 7 | Test zero-data states (if applicable) | Steps 3-5 |

Steps 3-5 can be done in parallel (one create + two edits).

---

## 10. QA Checklist

### Backend
- [ ] `GET /api/analytics/coupons` returns 200 with expected JSON shape
- [ ] Response includes all 8 top-level fields (`total_coupons`, `coupons_used`, `discount_availed`, `breakdown_by_scope`, `breakdown_by_offer_type`, `time_window_usage`, `bxgy_usage`, `nth_item_usage`)
- [ ] Auth: returns 401 without token
- [ ] Scoping: returns data only for the authenticated restaurant's `user_id`

### Frontend — Page loads
- [ ] `/coupon-analytics` route loads `CouponAnalyticsPage`
- [ ] Sidebar → Analytics → "Coupon Analytics" link navigates to `/coupon-analytics`
- [ ] Sidebar highlights correctly when on `/coupon-analytics`
- [ ] Page shows loading skeleton then renders data

### Frontend — R689 data renders
- [ ] Summary cards show: Total Coupons = 25, Times Used = 4, Total Discount = ₹427.50, Avg Discount = ₹106.88
- [ ] Scope chart shows 2 segments: Order (3) + Category (1). Item and Unknown hidden (0 uses).
- [ ] Offer type chart shows 1 bar: Simple (4). Others hidden (0 uses).
- [ ] Happy Hour card shows: Coupons with window = 5, Used within window = 1
- [ ] BOGO/BXGY card shows all zeros
- [ ] Every-Nth card shows all zeros, no by_nth_number sub-list (empty {})

### Frontend — Zero-data handling
- [ ] Zero-used chart buckets are not rendered in chart (filtered out)
- [ ] All-zero charts show "No usage data yet" text instead of empty chart
- [ ] Zero values in special offer cards display "0" (not hidden)
- [ ] Avg discount shows "—" when coupons_used = 0

### Phase 1 scope enforcement
- [ ] No Top Coupons table on the page
- [ ] No date range picker or filter
- [ ] No auto-refresh / polling / interval
- [ ] No new npm dependencies added

---

## 11. NOT in Scope (deferred to Phase 2+)

| Feature | Why deferred |
|---|---|
| Top Coupons table (coupon-level breakdown with code, uses, discount) | Owner decision: Phase 2 |
| Date range picker (7d / 30d / 90d / custom) | Owner decision: Phase 2 |
| Auto-refresh / real-time updates | Owner decision: not needed |
| Export CSV | Not discussed in Phase 1 scope |
| Per-coupon click-through detail page | Not scoped |
| Discount mismatch alerts | Not scoped |

---

## 12. Risk Assessment

| Risk | Level | Mitigation |
|---|---|---|
| `get_coupon_stats()` performance on large datasets | Low | R689 has 25 coupons / 4 usage rows. Largest real restaurant (R523) has 8 usage rows. Aggregation pipelines are already indexed. |
| Two routers sharing `/analytics` prefix | None | Path collision checked — `/analytics/coupons` is unique. |
| Recharts version compatibility | None | v3.6 already in use on `CustomerLifecyclePage.jsx` with same chart types. |
| Empty BOGO/Nth data on R689 | None | Plan explicitly handles zero states. |

---

## 13. References

- Discovery + Analysis: `../discovery/CR_003_COUPON_ANALYTICS_DASHBOARD_DISCOVERY_ANALYSIS_REPORT.md`
- Legacy CR-003 doc: `/app/memory/crm/crm_1_0/planning/CR_003_COUPON_ANALYTICS_DASHBOARD.md`
- Analytics service: `/app/backend/services/analytics_service.py:217-279`
- Existing analytics router: `/app/backend/routers/analytics.py`
- Frontend patterns: `/app/frontend/src/pages/CustomerLifecyclePage.jsx`, `/app/frontend/src/pages/ItemAnalyticsPage.jsx`
- Sidebar: `/app/frontend/src/components/ResponsiveLayout.jsx:40-48`
- Routes: `/app/frontend/src/App.js:37-63`

---

## 14. Status

```
cr003_phase_1_planning_complete_ready_for_implementation
```

End of CR-003 Phase 1 planning.
