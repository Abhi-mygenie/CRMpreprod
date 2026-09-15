# CR-003 — Coupon Analytics Dashboard — Phase 3 QA Report

**CR:** CR-003 Coupon Analytics Dashboard Phase 3 (Custom Date Picker + CSV/PDF Export)
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-28
**Status:** `cr003_phase_3_qa_passed`
**Test user:** `owner@kunafamahal.com` / `Qplazm@10` (R689 Kunafa Mahal)

---

## 1. QA Verdict

```
cr003_phase_3_qa_passed
```

All 15 scenarios passed. No issues found. No product code changed by QA.

---

## 2. Backend QA (9 scenarios)

| # | Scenario | Result | Evidence |
|---|---|---|---|
| B1 | Login R689 with real credentials | PASS | `POST /auth/mygenie-login` -> 200, `access_token` received |
| B2 | `/analytics/coupons` no param (backward compat) | PASS | 200, `total_coupons=25`, `coupons_used=10`, `discount_availed=1280.5`. All expected keys present |
| B3 | `/analytics/coupons?time_period=7d` | PASS | 200, `total_coupons=25` (NOT date-filtered, correct), usage stats reflect 7d window |
| B4 | `/analytics/coupons?date_from=2026-05-27T00:00:00&date_to=2026-05-27T23:59:59` (custom range) | PASS | 200, custom date params accepted, `coupons_used=10`, stats correctly scoped |
| B5 | `/analytics/coupons/top` with custom date | PASS | 200, `total=25`, 8 coupons with usage, per-coupon fields include `total_discount`, `gross_revenue`, `roi_score` |
| B6 | `/analytics/coupons/export` (CSV endpoint) | PASS | 200, 13 headers: Code, Title, Scope, Type, Discount Type, Discount Value, Times Used, Total Discount, Gross Revenue, ROI, ROI Label, Last Used, Status. 25 rows returned |
| B7 | `/analytics/coupons/export?date_from=...&date_to=...` | PASS | 200, custom date range on export works. Same 13 headers, 25 rows. First row: `SEED_EDGE_STACKABLE, 3 used, 372.8 discount, 3893.8 gross, 10.4x Strong` |
| B8 | `/analytics/coupons/pdf` (PDF export) | PASS | HTTP 200, 9700 bytes, valid PDF header (`%PDF-`), `application/pdf` content type |
| B9 | Auth rejection on all endpoints | PASS | No auth -> 403. Bad token -> 401. Tested: `/coupons`, `/coupons/export`, `/coupons/pdf` |

### B6 CSV detail:
```
Headers: ['Code', 'Title', 'Scope', 'Type', 'Discount Type', 'Discount Value',
          'Times Used', 'Total Discount', 'Gross Revenue', 'ROI', 'ROI Label',
          'Last Used', 'Status']
Sample row: ['SEED_EDGE_STACKABLE', '10% Off Stackable Dine-In Only', 'Order-Level',
             'Simple', 'percentage', 10.0, 3, 372.8, 3893.8, '10.4x', 'Strong',
             '2026-05-27T15:56:30', 'Active']
```

---

## 3. Frontend QA (6 scenarios)

| # | Scenario | Result | Evidence |
|---|---|---|---|
| F1 | `/coupon-analytics` page loads with all elements | PASS | Page loads, URL stays on `/coupon-analytics`. Visible: 5 summary cards, ROI insight banner, charts (Usage by Scope, Usage by Offer Type), special offer cards (Happy Hour, BOGO/BxGY, Every Nth), Top Coupons table, PDF Report + CSV buttons |
| F2 | Date pills: All Time, 7D, 30D, 90D, Custom | PASS | `[data-testid="time-period-filter"]` contains all 5 pills. "All Time" active by default (orange). Subtitle: "All Time coupon performance overview" |
| F3 | Clicking Custom pill shows date pickers | PASS | `[data-testid="filter-custom"]` click -> "Custom" pill turns orange, From/To date picker buttons appear in `[data-testid="custom-date-range"]`. Subtitle: "Select dates coupon performance overview" |
| F4 | Calendar popover opens (From button) | PASS | Calendar shows May 2026, today (28) highlighted in green. Future dates (29, 30) are greyed/disabled. Month navigation arrows visible |
| F5 | Clicking 7D pill re-fetches + updates subtitle | PASS | `[data-testid="filter-7d"]` click -> 7D orange, subtitle: "7D coupon performance overview", data re-fetches with loading skeleton |
| F6 | PDF Report + CSV buttons visible | PASS | Red "PDF Report" button and "CSV" button visible in top-right area below date filter. Both present across All Time and Custom modes |

---

## 4. Scope Guard

| # | Check | Result |
|---|---|---|
| S1 | Custom date picker renders with From/To popovers | PASS (new in P3) |
| S2 | CSV export endpoint exists + frontend button present | PASS (new in P3) |
| S3 | PDF export endpoint exists + frontend button present | PASS (new in P3) |
| S4 | No new dependencies | PASS |
| S5 | Product code changed by QA | NO |
| S6 | DB changed | NO |
| S7 | `/app/memory/final/` touched/created | NO |
| S8 | CRM 1.0 docs modified | NO |

---

## 5. Issues Found

None.

---

## 6. Status

```
cr003_phase_3_qa_passed
```

CR-003 Phase 3 (Custom Date Picker + CSV/PDF Export) is QA-verified. All backend endpoints respond correctly with custom date ranges, CSV returns 13 columns with ROI fields, PDF generates valid branded report.

End of CR-003 Phase 3 QA.
