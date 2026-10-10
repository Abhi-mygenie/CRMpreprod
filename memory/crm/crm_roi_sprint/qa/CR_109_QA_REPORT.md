# QA Report — CR-109: .strip().upper() at Coupon Write Time
**Date**: 2026-10-10 · **QA Agent**: T1 · **Iteration**: 11 · **Risk**: LOW (preventive)

## Result: ✅ PASS (6/6)

## Test Results

| V | Check | Result |
|---|---|---|
| V1 | POST /api/coupons {code:' TESTCR109STRIP{suffix} '} → stored as 'TESTCR109STRIP{suffix}' (no spaces) | ✅ PASS |
| V2 | PUT /api/coupons/:id {code:' UPDATED109STRIP{suffix} '} → stored as 'UPDATED109STRIP{suffix}' | ✅ PASS |
| V3 | POST /api/pos/coupons {code:' POSCR109STRIP{suffix} '} → stored as 'POSCR109STRIP{suffix}' | ✅ PASS |
| V4 | Create duplicate with same padded code → 400/409 dup error | ✅ PASS |
| V5 | DB count of codes with leading/trailing spaces = 0 | ✅ PASS |
| Internal spaces | 'FLAT TODAY' code preserved with internal space | ✅ PASS |

## Notes
- All test coupons cleaned up by module teardown fixture
- 'FLAT TODAY' and '10 PERCENT DISCOUNT' codes preserved correctly (internal spaces valid)
- DB query `{"code": {"$regex": r"^\s|\s$"}}` returned 0 documents — production DB is clean

## Severity: PASS — No blockers
