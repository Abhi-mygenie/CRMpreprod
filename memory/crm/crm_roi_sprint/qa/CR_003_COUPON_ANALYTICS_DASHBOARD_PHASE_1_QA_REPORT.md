# CR-003 — Coupon Analytics Dashboard — Phase 1 QA Report

**CR:** CR-003 Coupon Analytics Dashboard
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-27
**Status:** `cr003_phase_1_qa_passed`

---

## 1. QA Verdict

```
cr003_phase_1_qa_passed
```

All 13 scenarios passed. No issues found. No product code changed by QA.

---

## 2. Backend QA (4 scenarios)

| # | Scenario | Result | Evidence |
|---|---|---|---|
| B1 | 403 without auth | PASS | `curl` → HTTP 403 |
| B2 | 401 with bad token | PASS | `curl -H "Authorization: Bearer invalid"` → HTTP 401 |
| B3 | 200 with valid R689 JWT | PASS | Returns `total_coupons=25, coupons_used=4, discount_availed=427.5`. All 8 top-level fields present. |
| B4 | Data scoped to user | PASS | R689 returns 25 coupons / 4 used / ₹427.5. R523 returns 8 coupons / 11 used / ₹1712.9. Different data confirms scoping. |

### Field completeness (B3 detail)

| Field | Present | Value (R689) |
|---|---|---|
| `total_coupons` | ✅ | 25 |
| `coupons_used` | ✅ | 4 |
| `discount_availed` | ✅ | 427.5 |
| `breakdown_by_scope` | ✅ | 4 keys: order/item/category/unknown |
| `breakdown_by_offer_type` | ✅ | 7 keys: simple/bogo/bxg/nth_item/free_item/combo/unknown |
| `time_window_usage` | ✅ | 3 keys: coupons_with_window/used_within_window/used_outside_window_attempts |
| `bxgy_usage` | ✅ | 6 keys: bogo_orders/bxg_orders/total_applications/discount_amount/free_units_given/discounted_units_given |
| `nth_item_usage` | ✅ | 5 keys: orders/total_applications/discount_amount/benefit_units_given/by_nth_number |

---

## 3. Frontend QA (9 scenarios)

| # | Scenario | Result | Evidence |
|---|---|---|---|
| F1 | Route `/coupon-analytics` loads | PASS | URL confirmed: `/coupon-analytics` (no redirect) |
| F2 | Sidebar item visible + highlighted | PASS | Screenshot: "Coupon Analytics" under Analytics dropdown, highlighted orange. `data-testid="sidebar-coupon-analytics"` present. |
| F3 | Summary cards render correct values | PASS | Total Coupons=25, Times Used=4, Total Discount=₹427.50, Avg Discount=₹106.88 |
| F4 | Scope donut chart: renders + hides zero buckets | PASS | Category-Level ✅, Order-Level ✅, Item-Level hidden ✅, Other hidden ✅ |
| F5 | Offer type bar chart: renders + hides zero buckets | PASS | Simple ✅, BOGO hidden ✅, BXG hidden ✅, Every Nth hidden ✅ |
| F6 | Happy Hour card | PASS | Coupons with window=5, Used within window=1 |
| F7 | BOGO/BXGY card: zero values clean | PASS | BOGO orders=0, BXG orders=0, Free items=0, Discounted items=0, Discount amount=₹0.00 |
| F8 | Every-Nth card: zero values clean | PASS | Orders=0, Benefit items=0, Discount amount=₹0.00 |
| F9 | `by_nth_number` sub-list hidden when empty | PASS | No "By Nth number" text present, no "th:" badges visible |

---

## 4. Scope Guard (4 scenarios)

| # | Scenario | Result | Evidence |
|---|---|---|---|
| S1 | No Top Coupons table | PASS | `page.get_by_text("Top Coupons").count() = 0`. Page text search: "Top Coupons" not found. |
| S2 | No date picker | PASS | `input[type='date']` count = 0. "Date Range" not in page text. |
| S3 | No auto-refresh | PASS | `page.get_by_text("Auto Refresh").count() = 0`. "auto-refresh" not in page text. |
| S4 | No unrelated code changes | PASS | Only 4 files changed (per implementation report). No DB/env/deploy changes. |

---

## 5. Issues Found

None.

---

## 6. Scope Guard Confirmation

- Top Coupons table present: **no**
- Date picker present: **no**
- Auto-refresh present: **no**
- Product code changed by QA: **no**
- DB changed: **no**
- `/app/memory/final/` touched/created: **no**
- CRM 1.0 docs modified: **no**

---

## 7. Test Data Reference

| Metric | R689 Expected | R689 Actual | Match |
|---|---|---|---|
| Total Coupons | 25 | 25 | ✅ |
| Times Used | ≥4 | 4 | ✅ |
| Total Discount | ≥₹427.50 | ₹427.50 | ✅ |
| Avg Discount | ₹106.88 | ₹106.88 | ✅ |
| Scope: Order used | 3 | 3 (visible in chart) | ✅ |
| Scope: Category used | 1 | 1 (visible in chart) | ✅ |
| Scope: Item used | 0 | hidden (correct) | ✅ |
| Happy Hour: with window | 5 | 5 | ✅ |
| Happy Hour: within window | 1 | 1 | ✅ |
| BOGO/Nth | all 0 | all 0 | ✅ |

---

## 8. Status

```
cr003_phase_1_qa_passed
```

End of CR-003 Phase 1 QA.
