# BUG-034 + CR-105 + CR-107 — QA Report
**Date:** 2026-10-09  **Agent:** T1 iteration_10

## BUG-034: GET /scan/coupons 500 fix
- Fix: scan.py:477 `(c.get('per_user_limit') or 1)` handles per_user_limit:null
- GET /scan/coupons with valid r689 token → **200**, 17 coupons returned ✅
- Previously returned 500, now 200 confirmed.

## CR-105: POST /scan/coupons/validate

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| FLAT100TEST, order_total:1000 | valid:true, discount:100, final:900 | valid:true, 100.0, 900.0 | PASS |
| FLAT100TEST, order_total:200 | valid:false, MIN_ORDER_NOT_MET | valid:false, MIN_ORDER_NOT_MET | PASS |
| BADCODE999, order_total:500 | valid:false, INVALID_CODE | valid:false, INVALID_CODE | PASS |
| 11 calls same IP | 10×200 then 429 | 10×200 then 429 | PASS |
| GET /scan/coupons regression | 200 | 200 | PASS |
| No coupon_usage docs written by validate | 0 new docs | 2 pre-existing from POS orders (May/Jun 2026), 0 new from validate | PASS |

## CR-107: POST /scan/max-redeemable

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| r689 diner (0 pts, min=100) | ok:false, BELOW_MIN_REDEMPTION, projected_points_earned>0 | ok:false, BELOW_MIN_REDEMPTION, projected:75 | PASS |
| r719 loyalty-disabled | ok:false, LOYALTY_DISABLED | ok:false, LOYALTY_DISABLED | PASS |
| r689 diner with 2000 pts (9035133228) | ok:true, max_points_redeemable>0 | ok:true, max_pts:36 | PASS |

**Result: All PASS** ✅
