# CR-005 + CR-002B — Implementation Report

**Date:** 2026-05-26
**Status:** `cr005_cr002b_implementation_complete`
**Sprint:** ROI Measurement for CRM
**Plan doc:** `../planning/CR_005_CR_002B_IMPLEMENTATION_PLAN.md`

---

## 1. Changes Shipped

| # | Fix | File | Change | Bug |
|---|---|---|---|---|
| 1 | Increment `total_coupon_used` on customer | `backend/core/coupon.py` L2216 | +1 line: `await db.customers.update_one(...)` | B2 + B3 + B6 |
| 2 | New `GET /customers/{id}/coupon-history` endpoint | `backend/routers/customers.py` after L1521 | +18 lines: new endpoint querying `coupon_usage` | CR-002B Gap 2 |
| 3 | Coupon description in list | `frontend/src/pages/CouponsPage.jsx` after L522 | +1 line: render `coupon.description` | B1 |
| 4 | Discount type toggle for Happy Hour | `frontend/src/pages/CouponsPage.jsx` L623 | `isV2` → `(isV2 \|\| selectedType === "time_window")` | B7 |
| 5 | Menu fetch error handling + retry | `frontend/src/pages/CouponsPage.jsx` L245-263 | +state, +error catch, +toast, +3 error banners | B5 |
| 6 | Coupon History tab on customer detail | `frontend/src/pages/CustomerDetailPage.jsx` | +state, +fetch, +tab (3-col), +tab content | CR-002B Gap 2 |

**Total: ~74 new lines across 4 files.**

---

## 2. Verification

| Check | Result |
|---|---|
| Backend compiles | PASS |
| Backend restarts cleanly | PASS — supervisor logs show clean startup |
| `GET /customers/{id}/coupon-history` endpoint | PASS — returns `{"customer_id": "...", "coupon_usages": [], "total": 0}` |
| Frontend compiles | PASS — 1 pre-existing warning only |
| Login page loads | PASS — screenshot verified |
| Python lint (coupon.py) | PASS |
| Python lint (customers.py) | PASS (1 pre-existing F841 unused var, not our change) |
| `/api/health` | PASS |

---

## 3. What's Left for Full QA

| Test | Status | Notes |
|---|---|---|
| B2: POS order with coupon → customer counter increments | NEEDS POS ORDER | R689 has zero coupon_usage records — needs POS to send coupon_code + coupon_discount > 0 |
| B3/B6: Per-user / total limit enforcement | NEEDS POS ORDER | Same dependency — needs coupon_usage records to exist |
| B1: Description visible in coupon list | NEEDS LOGIN | Verify via authenticated screenshot of /coupons page |
| B7: Happy Hour discount type toggle | NEEDS LOGIN | Verify via coupon create form screenshot |
| B5: Menu error + retry banner | NEEDS LOGIN + MENU FAILURE | Verify error state in BOGO/V3-C forms |
| CR-002B: Coupon History tab | NEEDS LOGIN | Verify 3-tab layout on customer detail page |

---

## 4. Status

```
cr005_cr002b_implementation_complete
```

All code changes shipped. Backend + frontend compile and run. Ready for QA.
