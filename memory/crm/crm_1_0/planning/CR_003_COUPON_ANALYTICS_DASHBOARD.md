# CR-003 — Coupon Analytics Dashboard

**Date:** 2026-05-25
**Status:** `cr003_coupon_analytics_dashboard_proposed_awaiting_owner_scope`
**Priority:** P3 (backlog)

> **ROI Measurement Sprint note (added 2026-02-26):** CR-003 remains a **separate** CR and must not be merged with `CR-002B Customer CRM Benefits Data Visibility Fix` or `POS-CRM Customer Cross-Sell Upsell Suggestions API`. CR-003 implementation should follow **after** CR-002B discovery / decision, since the global dashboard inherits any wrongness in customer-level coupon/loyalty/wallet data. Phase 1 owner decisions are already locked (see Section 4 below): separate `/coupon-analytics` page · Recharts · defer Top Coupons table · all-time only · refresh on page load only. See register: `./ROI_MEASUREMENT_CR_REGISTER.md`.
**Prerequisite:** All 7 coupon types live at `/coupons` (V1 flat, V1 %, V2 item, V2 category, V3-A Happy Hour, V3-B BOGO/BXGY, V3-C Every Nth) — **DONE**

---

## 1. Problem Statement

The CRM has a fully functional coupon engine (211/211 QA) and admin UI for creating/managing coupons, but **no visibility into how coupons are performing**. Restaurant owners cannot answer:

- Which coupons are being used the most?
- How much discount is being given away?
- Are BOGO offers driving more orders than flat discounts?
- Is the Happy Hour window actually attracting usage?
- Which items get the most coupon-driven traffic?

---

## 2. Backend Readiness

The backend **already computes** rich analytics via `services/analytics_service.py → get_coupon_stats()`. This data is available but has **no frontend consumer**.

### Existing aggregation output (verified in code):

```json
{
  "total_coupons": 25,
  "coupons_used": 12,
  "discount_availed": 4580.0,

  "breakdown_by_scope": {
    "order": { "used": 8, "discount": 2100.0 },
    "item": { "used": 3, "discount": 1200.0 },
    "category": { "used": 1, "discount": 280.0 },
    "unknown": { "used": 0, "discount": 0 }
  },

  "breakdown_by_offer_type": {
    "simple": { "used": 6, "discount": 1500.0 },
    "bogo": { "used": 2, "discount": 800.0 },
    "bxg": { "used": 1, "discount": 400.0 },
    "nth_item": { "used": 1, "discount": 100.0 },
    "free_item": { "used": 0, "discount": 0 },
    "combo": { "used": 0, "discount": 0 },
    "unknown": { "used": 2, "discount": 780.0 }
  },

  "time_window_usage": {
    "coupons_with_window": 4,
    "used_within_window": 2,
    "used_outside_window_attempts": 0
  },

  "bxgy_usage": {
    "bogo_orders": 2,
    "bxg_orders": 1,
    "total_applications": 5,
    "discount_amount": 1200.0,
    "free_units_given": 4,
    "discounted_units_given": 1
  },

  "nth_item_usage": {
    "orders": 1,
    "total_applications": 2,
    "discount_amount": 100.0,
    "benefit_units_given": 2,
    "by_nth_number": { "5": 1, "3": 1 }
  }
}
```

### Backend API endpoint

| Endpoint | Exists? | Auth |
|---|---|---|
| `GET /api/analytics/coupons` | YES — `routers/analytics.py` | JWT (restaurant owner) |

**No backend work needed** — the endpoint is live and returns the full payload above.

---

## 3. Proposed Dashboard Sections

### Section A — Summary Cards (top row)
| Card | Data Source | Visual |
|---|---|---|
| Total Coupons | `total_coupons` | Number |
| Coupons Used | `coupons_used` | Number + % of total |
| Total Discount Given | `discount_availed` | Rs. amount |
| Avg Discount per Use | `discount_availed / coupons_used` | Rs. amount |

### Section B — Usage by Offer Type (pie/donut chart)
| Slice | Data Source |
|---|---|
| Flat/Percentage (V1) | `breakdown_by_offer_type.simple` |
| BOGO | `breakdown_by_offer_type.bogo` |
| Buy X Get Y | `breakdown_by_offer_type.bxg` |
| Every Nth | `breakdown_by_offer_type.nth_item` |
| Legacy/Unknown | `breakdown_by_offer_type.unknown` |

### Section C — Usage by Scope (bar chart)
| Bar | Data Source |
|---|---|
| Order Level | `breakdown_by_scope.order` |
| Item Level | `breakdown_by_scope.item` |
| Category Level | `breakdown_by_scope.category` |

### Section D — Happy Hour Effectiveness
| Metric | Data Source |
|---|---|
| Coupons with time window | `time_window_usage.coupons_with_window` |
| Used within window | `time_window_usage.used_within_window` |
| Window utilisation rate | `used_within_window / coupons_with_window` |

### Section E — BOGO / BXGY Performance
| Metric | Data Source |
|---|---|
| BOGO orders | `bxgy_usage.bogo_orders` |
| BXGY orders | `bxgy_usage.bxg_orders` |
| Total applications | `bxgy_usage.total_applications` |
| Free units given | `bxgy_usage.free_units_given` |
| Discount amount | `bxgy_usage.discount_amount` |

### Section F — Every Nth Performance
| Metric | Data Source |
|---|---|
| Orders | `nth_item_usage.orders` |
| Benefit units given | `nth_item_usage.benefit_units_given` |
| By Nth number | `nth_item_usage.by_nth_number` (e.g. "Every 3rd: 5 uses, Every 5th: 3 uses") |

### Section G — Top Coupons Table (optional — needs new backend query)
| Column | Notes |
|---|---|
| Code | Coupon code |
| Title | Display title |
| Type | V1/V2/V3-A/V3-B/V3-C badge |
| Times Used | `total_used` from coupon doc |
| Total Discount | Sum from `coupon_usage` |
| Last Used | Latest `coupon_usage.created_at` |

**Note:** Section G requires a new backend aggregation (top N coupons by usage). Not in `get_coupon_stats` today.

---

## 4. Open Questions for Owner

### Q1 — Where should the analytics live?
- **A.** New tab/section within the existing `/coupons` page (inline, always visible)
- **B.** Separate page at `/coupon-analytics` (dedicated view)
- **C.** Expandable panel at the top of `/coupons` (collapsible summary)

### Q2 — Chart library?
- **A.** Recharts (already in package.json — used by DashboardPage)
- **B.** Simple stat cards only (no charts — faster, lighter)

### Q3 — Top Coupons table (Section G)?
- **A.** Include — requires new backend aggregation (~30 min backend work)
- **B.** Defer — ship Sections A-F first with existing data

### Q4 — Date range filter?
- **A.** All-time only (simplest — matches current backend)
- **B.** Add date range picker (requires backend `get_coupon_stats` to accept date params — new work)

### Q5 — Auto-refresh?
- **A.** Manual refresh button
- **B.** Auto-refresh every 60s
- **C.** Refresh on page load only

---

## 5. Estimated Effort

| Scope | Backend | Frontend | Total |
|---|---|---|---|
| Sections A-F (existing data) | 0 hours | ~3-4 hours | ~3-4 hours |
| Section G (top coupons query) | ~0.5 hours | ~1 hour | ~1.5 hours |
| Date range filter | ~1 hour | ~1 hour | ~2 hours |
| **Full dashboard** | **~1.5 hours** | **~5-6 hours** | **~7 hours** |

### Recommended phasing:
1. **Phase 1:** Sections A-F with existing backend data (zero backend work)
2. **Phase 2:** Section G (top coupons table) + date range filter

---

## 6. Dependencies

| Dependency | Status |
|---|---|
| `GET /api/analytics/coupons` endpoint | LIVE |
| `services/analytics_service.py` aggregation | LIVE (verified in code) |
| Recharts library | Already installed (`package.json`) |
| Coupon usage data in DB | Exists (SEED coupons + any real POS usage) |
| All coupon types wired | DONE (V1-V3C all live) |

---

## 7. Risks

| Risk | Level | Mitigation |
|---|---|---|
| Low coupon usage data for R689 (mostly test/seed) | Low | Dashboard will show accurate numbers even if small; value grows with real POS usage |
| `used_outside_window_attempts` returns 0 (deferred to V3-A2) | Low | Show "Coming soon" for that metric |
| Section G needs new backend query | Low | Defer to Phase 2 if needed |

---

## 8. Final Status

```
cr003_coupon_analytics_dashboard_proposed_awaiting_owner_scope
```

No code, DB, env, or deployment changes. Awaiting owner decisions on Q1-Q5 before implementation.
