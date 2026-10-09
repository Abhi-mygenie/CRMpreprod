# QA Handover — CR-107 `POST /scan/max-redeemable` + CR-105 `POST /scan/coupons/validate`
**Date**: 2026-10-09 · **From**: Implementation Agent · **To**: QA Agent
**Plan**: `planning/CR_105_CR_107_IMPLEMENTATION_PLAN.md` · **Risk**: LOW (CR-107) · LOW–MEDIUM (CR-105) · **Backend only — no frontend changes.**
**Creds**: customer token via `POST /api/scan/auth/skip-otp` `{phone:"9838777712", restaurant_id:"689"}` · `REACT_APP_BACKEND_URL` from `/app/frontend/.env`
**Active coupon for r689**: `FLAT100TEST` (flat ₹100 off, min order ₹500, end_date 2026-12-31)

---

## What changed (1 file, markers `# CR-107` / `# CR-105`)

| File | Change |
|---|---|
| `backend/routers/scan.py` | E1: imports — `calculate_points` + `compute_max_redeemable` (core.loyalty) + `validate_coupon_for_customer` (core.coupon) · E2: `_COUPON_VALIDATE_IP_LIMIT = (10, 60)` · E3: `ScanMaxRedeemableRequest` + `POST /scan/max-redeemable` (~20 lines) · E4: `ScanCouponValidateRequest` + `POST /scan/coupons/validate` (~30 lines) |

**Not touched**: `core/coupon.py` · `core/loyalty.py` · `routers/pos.py` · `models/schemas.py` · frontend · stored data

---

## Self-test — 6/6 PASS

| V | Check | Result |
|---|---|---|
| V1 | POST `/scan/max-redeemable` `{bill_amount:500}` r689 diner (63 pts, min=100) | ✅ `ok:false, code:"BELOW_MIN_REDEMPTION", available_pts:63, min_redemption:100, proj_earn:75` |
| V2 | POST `/scan/max-redeemable` loyalty-disabled tenant (r719) | ✅ `ok:false, code:"LOYALTY_DISABLED"` |
| V3 | POST `/scan/coupons/validate` `{code:"FLAT100TEST", order_total:1000}` | ✅ `valid:true, computed_discount:100, final:900` |
| V3b | POST `/scan/coupons/validate` below min order (`order_total:200`, min=500) | ✅ `valid:false, error.code:"MIN_ORDER_NOT_MET"` |
| V4 | POST `/scan/coupons/validate` `{code:"BADCODE999", order_total:500}` | ✅ `valid:false, error.code:"INVALID_CODE"` |
| V5 | POST `/scan/coupons/validate` 11 times same IP (valid token) | ✅ 10×200 then 429 |
| V6 | GET `/scan/coupons` (regression) | ✅ 200 |

**Note — trailing-space coupon codes**: Many existing r689 coupons have trailing spaces in their `code` field (e.g. `"FLAT TODAY "`). `validate_coupon_for_customer` strips the INPUT but DB lookup is exact match → codes with trailing spaces will return `INVALID_CODE`. This is a pre-existing data quality issue, not introduced by CR-105. V3 uses `FLAT100TEST` which has no trailing space and works correctly.

---

## QA asks
1. Re-run V1–V6 independently with fresh IPs (rate-bucket isolation from test runs).
2. Ad-hoc: (a) `POST /scan/max-redeemable` with a diner who HAS enough points → `ok:true, max_points_redeemable > 0` · (b) expired coupon code → `valid:false, error.code:"EXPIRED"` · (c) `channel:"delivery"` on a delivery-restricted coupon → `valid:false` · (d) `items` populated for item-scope coupon → correct `matched_item_ids` in response.
3. Confirm no `coupon_usage` docs written during the test run.
4. Confirm no `loyalty_settings` docs modified.
5. Report → `qa/CR_105_CR_107_QA_REPORT.md` + `test_reports/iteration_10.json`.
