# CR-122 — QA Report: `GET /scan/coupons` order_total + engine switch + recommendation
**Date**: 2026-06 (fork) · **Role**: QA Agent · **Result**: ✅ **PASS** · **Risk**: LOW–MEDIUM
**Plan**: `planning/CR_122_IMPLEMENTATION_PLAN.md` · **IA**: `planning/CR_122_IMPACT_ANALYSIS.md` · **Intake**: `discovery/CR_122_SCAN_COUPONS_ORDER_TOTAL_ENGINE_SWITCH_INTAKE.md`

---

## 1. Scope verified
`routers/scan.py` — 3 edits: (E1) import `list_available_coupons`; (E2) `order_total: Optional[float]=None` param; (E3) engine path when `order_total` present → `my_usage_count` aggregation + `recommended_code`/`recommended_discount`, legacy path otherwise. Code markers `# CR-122` present at all 3 locations (`scan.py:23, 472, 501-541`). `core/coupon.py` untouched (engine used as-is). Implementation includes a refinement beyond plan: recommendation also requires `time_window.within_window_now` (line 533) — correct, prevents recommending an outside-hours coupon.

## 2. Test environment
Preview backend `https://mygenie-crm-preprod.preview.emergentagent.com`. Tenant r689 (`pos_0001_restaurant_689`). Diner token via `skip-otp` phone `9830291686`. Live r689 coupon set (STO-GENERIC-10 min0 pct10, STO-GENERIC-MIN min300 flat50, STO-STANDARD/STO-ONCE requires_customer=true, SEED_V3B_*/V3C_* BXGY, SEED_V3A_* time-window).

## 3. Verification matrix — V1–V11 (+ cross-check)

| V | Case | Expected | Result |
|---|---|---|---|
| V1 | `order_total=96` | STO-GENERIC-MIN (min 300) excluded | ✅ |
| V2 | `order_total=96` | STO-GENERIC-10 included, `expected_discount=9.6` | ✅ (9.6) |
| V3 | authed `order_total=960` | BXGY/BOGO/nth → `requires_cart_validation=true`, `expected_discount=null` | ✅ (n=8) |
| V4 | `order_total=960` | time-window coupon outside hours included w/ `within_window_now=false` | ✅ (3 V3-A coupons) |
| V5 | `order_total=960` | `recommended_code` = max `expected_discount` among simple in-window | ✅ |
| V6 | authed, no `order_total` | no `recommended_code` key; `my_usage_count` present | ✅ |
| V7 | anon, no `order_total` | no `recommended_code` key | ✅ |
| V8 | `order_total=0` | no **in-window** coupon with min>0 returned | ✅ (leak=[]) |
| V9 | authed `order_total=960` | `my_usage_count` on all (n=30) | ✅ |
| V10 | anon `order_total=960` | no `my_usage_count` on any | ✅ |
| V11 | `order_total=1` | recommendation = simple-set rule | ✅ (STO-GENERIC-10) |
| XCHK | anon `order_total=960` | engine path still hides `requires_customer=true` (CR-121 rule) | ✅ (STO-STANDARD/STO-ONCE not leaked) |

**12/12 PASS.**

## 4. Findings & classifications
- **No BLOCKER. No MAJOR. No MINOR against CR-122.**
- Two items that superficially looked like failures were confirmed **non-defects**:
  1. **V3 on the anonymous response showed 0 BXGY** — because the pre-existing engine (`validate_coupon_for_customer`) returns most BXGY coupons as not-eligible for anonymous callers; they appear correctly for authenticated callers (n=8, all `requires_cart_validation=true`/`expected_discount=null`). Test-assumption artifact, not CR-122.
  2. **V8 `order_total=0` returned SEED_V3A_EVERYDAY (min 200) & SEED_V3A_WEEKEND (min 600)** — these are **outside-time-window V3-A informational coupons** (`within_window_now=false`, `expected_discount=0.0`). The CR-001C-C engine surfaces outside-window coupons by design (so the app can show "available 5–7 PM") and bypasses the min_order hard-exclude only for that informational case. They are **never recommended** (confirmed `recommended_code=None`). Pre-existing engine behavior, not CR-122. The plan's V8 wording ("all min>0 excluded") did not anticipate the V3-A informational path; refined assertion (no **in-window** min>0 leak) PASSES.

## 5. Regression
`pytest tests/test_cr106_cr109_phaseD.py -k B_ -n 0` → **5 passed, 1 failed**. The single fail is `B_V4_takeaway_same_as_delivery` (`takeaway 28 != delivery 29`) — the documented **STO-DELIVERY** delivery-only test-data coupon seeded 2026-10-12 for S&O validation; correct product behaviour, stale test expectation. **Not CR-122.** B_V1/V2/V3/V5 (scan coupon list) PASS. Broader batch regression covered in `qa/CR_123_QA_HANDOVER.md §5.2` (83/86, no CR-122 impact).

## 6. QA output
```
QA complete: CR-122 (scan/coupons order_total + engine switch + recommendation)
Result: PASS
Tests: 12 verification items — 12 pass; regression scan-list 5/6 (1 known test-data)
Failures: none against CR-122
Coverage: routers/scan.py get_available_coupons (engine path + legacy path)
Registry: SYNCED
Next: Owner smoke + Scan & Order validation → close with Oct batch
```

**Closure gated on:** owner smoke + Scan & Order consumer validation (already briefed in `handoff/CRM_TO_SCAN_ORDER_CR119_TO_CR123_LIVE_PLEASE_VALIDATE_2026_10_12.md`).
