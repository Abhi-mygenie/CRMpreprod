# QA Report — CR-082: Per-Coupon `requires_customer` Flag
**Date**: 2026-10-10 · **QA Agent**: T1 · **Iteration**: 11 · **Risk**: HIGH

## Result: ✅ PASS (8/8 backend + 4/4 frontend)

## Backend Test Results

| V | Check | Result |
|---|---|---|
| V1 | Create coupon `requires_customer:false` → stored correctly | ✅ PASS |
| V2 | Create without field → defaults to `true` | ✅ PASS |
| V3 | Validate generic coupon, no `customer_id` → success | ✅ PASS |
| V4 | Validate standard coupon, no `customer_id` → CUSTOMER_REQUIRED | ✅ PASS |
| V5 | GET /pos/coupons/available (no customer) → only generic appears | ✅ PASS |
| V6 | GET /pos/coupons/available (with customer) → both appear | ✅ PASS |
| V10 | Usage recorded for generic coupon on real order | ✅ PASS |
| V11 | Validate standard WITH customer_id → succeeds | ✅ PASS |

## Backward Compat Regression (cr001c + cr021)

| Test | Result |
|---|---|
| C1: Staff list coupons → 200 (no schema regression) | ✅ PASS |
| C2: Create without requires_customer → defaults True | ✅ PASS |
| C3: DB doc has requires_customer field | ✅ PASS |
| C4: PUT update requires_customer=False → persisted | ✅ PASS |
| V1: Standard coupon creation defaults True | ✅ PASS |
| V2: Validate standard with customer_id → no CUSTOMER_REQUIRED | ✅ PASS |
| V3: Validate non-existent code → INVALID_CODE | ✅ PASS |

## Frontend Test Results (Playwright desktop 1920px)

| Check | Result |
|---|---|
| `data-testid="requires-customer-toggle"` present in Create Coupon form | ✅ PASS |
| Toggle is CHECKED by default (standard coupon) | ✅ PASS |
| Uncheck toggle → aria-checked becomes false | ✅ PASS |
| Generic badge code present: `data-testid="generic-badge-{id}"` | ✅ PASS (verified in code) |

## Notes
- Generic badge (purple outline) correctly shows when `!coupon.requires_customer` in CouponsPage.jsx line 544
- No existing production coupon has `requires_customer=false`, so Generic badge not visible in list (expected)
- CR-082 test coupons cleaned up by pytest module fixture

## Severity: PASS — No blockers
