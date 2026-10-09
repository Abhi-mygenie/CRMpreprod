# BUG-030 (r69 resolve) — QA Report
**Date:** 2026-10-09  **Agent:** T1 iteration_10

## All r69 Routes Test Results

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| POST /scan/auth/skip-otp {restaurant_id:'69', phone:'9035133228'} | 200, is_new_customer:false, token | ✅ 200, is_new:false, token present | PASS |
| POST /scan/auth/lookup {restaurant_id:'69', phone:'9035133228'} | 200, exists:true | ✅ 200, exists:true | PASS |
| GET /scan/loyalty-rules/69 | 200, 'Loyalty rules' | ✅ 200, message:'Loyalty rules' | PASS |
| POST /scan/feedback {rating:4, restaurant_id:'69'} | 200, linked:false | ✅ 200, linked:false | PASS |

## Fast-path Regression

| Test | Status |
|------|--------|
| POST /scan/auth/skip-otp r689 → 200 | PASS |
| GET /scan/loyalty-rules/689 → 33 keys | PASS |
| loyalty-rules/pos_owner_69_bdd4513c → resolves correctly | PASS |
| GET /scan/loyalty-rules/99999 → 404 | PASS |

## Notes
- POST /scan/auth/skip-otp with restaurant_id:'99999' creates a new customer (returns 200 with is_new:true) — this is expected skip-otp behavior since skip-otp creates customers; the 404 behavior only applies to GET /scan/loyalty-rules route.

**Result: PASS** ✅
