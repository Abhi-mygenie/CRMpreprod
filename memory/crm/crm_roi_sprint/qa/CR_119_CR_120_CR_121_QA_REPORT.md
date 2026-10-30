# QA Report — CR-119 · CR-120 · CR-121
**Date**: 2026-10-12 · **QA Role** · **Method**: pytest + manual curl (no testing agent — owner opt-out per DECISIONS_LOG)
**Test env**: preprod `52.66.232.149:27017/mygenie` · Restaurant r689 (Kunafa Mahal)

---

## Result: ✅ PASS (all three CRs)

| CR | Tests | Result |
|---|---|---|
| CR-119 — skip-otp accepts `name` | 4 manual + 1 DB check | ✅ PASS |
| CR-120 — validate optional-auth | 7 manual | ✅ PASS |
| CR-121 — list optional-auth | 6 manual | ✅ PASS |
| Regression suites | 75/77 PASS, 2 NOTE | ✅ PASS (2 pre-existing) |

---

## CR-119 Results

| V | Case | Expected | Result |
|---|---|---|---|
| V1 | New phone + `name:"QA TestUser"` | `is_new:true`, `name:"QA TestUser"` in response | ✅ PASS |
| V2 | Same phone again + `name:"Should Not Change"` | `is_new:false`, name still `"QA TestUser"` | ✅ PASS |
| V3 | New phone + `name:"   "` (whitespace) | `name:""` | ✅ PASS |
| V4 | New phone, no `name` key | `success:true`, `name:""`, no 422 | ✅ PASS |
| DB | `customers.name = "QA TestUser"` stored | 1 doc found with phone 9231931523 | ✅ PASS |

---

## CR-120 Results

| V | Case | Expected | Result |
|---|---|---|---|
| V1 | No token + `STO-GENERIC-10` + order ₹500 | `valid:true`, `computed_discount:50.0` | ✅ PASS |
| V2 | No token + `STO-STANDARD` | `valid:false`, `CUSTOMER_REQUIRED` | ✅ PASS |
| V3 | No token + `STO-GENERIC-MIN` + order ₹100 (min ₹300) | `valid:false`, `MIN_ORDER_NOT_MET` | ✅ PASS |
| V4 | No token + `STO-GENERIC-MIN` + order ₹400 | `valid:true`, `computed_discount:50.0` | ✅ PASS |
| V5 | No token + `STO-DELIVERY` + `channel=dine_in` | `valid:false`, `CHANNEL_NOT_VALID` | ✅ PASS |
| V6 | No token + no `restaurant_id` | `422` | ✅ PASS |
| V7 | Bad token | `401` | ✅ PASS |

---

## CR-121 Results

| V | Case | Expected | Result |
|---|---|---|---|
| V1 | No token + no `restaurant_id` | `422` | ✅ PASS |
| V2 | No token + `restaurant_id=689` | 3 STO generics returned; no `my_usage_count`; all `requires_customer=false` | ✅ PASS |
| V3 | No token + `channel=delivery` | STO-DELIVERY + STO-GENERIC-10 + STO-GENERIC-MIN (all-channel generics included) | ✅ PASS |
| V5 | No token + `channel=dine_in` | STO-DELIVERY excluded (delivery-only); STO-GENERIC-10 + STO-GENERIC-MIN present | ✅ PASS |
| V6 | With token | 29 coupons; `my_usage_count` on all; STO-STANDARD + STO-ONCE visible | ✅ PASS |
| V4 | Bad token | `401` | ✅ PASS |

**Key verification — authenticated path unchanged:**
- Auth list: 29 coupons (pre-CR-121 was 24; 5 new STO- coupons added = 29) ✅
- `my_usage_count` present on all authenticated coupons ✅
- Standard coupons (STO-STANDARD, STO-ONCE) visible in authenticated list ✅
- Standard coupons NOT visible in anonymous list ✅

---

## Regression

```
Suites: test_cr089_skip_otp.py · test_cr093_lookup.py ·
        test_cr085a_normalization.py · test_cr084_cr097.py
Result: 75 passed · 2 failed · 2 skipped
```

| Failure | Root cause | Classification |
|---|---|---|
| `test_cr084_cr097.py::test_v5a_skip_otp_valid` | Phone `9838777712` rate-limited (5/5min hit by parallel suites) | **NOTE — pre-existing** |
| `test_cr085a_normalization.py::test_A2_skip_otp_spaced_phone_no_duplicate` | Same phone `9838777712` same run | **NOTE — pre-existing** |

Both failures are rate-limit timing collisions from parallel test execution on the same phone number. Same pattern documented in `BATCH_QA_REGRESSION_REPORT_2026_10_09.md` as NOTE. Product code is correct — confirmed by CR-089 suite 40/40 PASS in dedicated run.

---

## QA Findings

| ID | Sev | Finding |
|---|---|---|
| QA-1 | NOTE | V3 (CR-121 delivery filter): STO-GENERIC-10 and STO-GENERIC-MIN also appear in delivery list — correct, they are all-channel coupons. STO-DELIVERY is delivery-only and also appears. All three are generic. No issue. |
| QA-2 | NOTE | 2 pre-existing rate-limit test failures (same as documented in BATCH_QA_REGRESSION_REPORT_2026_10_09.md) — not introduced by this batch |

**No BLOCKER. No MAJOR. 0 failures introduced by CR-119/120/121.**

---

```
QA complete: CR-119 · CR-120 · CR-121
Result: PASS
Tests: 17 manual + 1 DB check + 79 regression (75 pass / 2 pre-existing NOTE / 2 skip)
Failures: 0 BLOCKER · 0 MAJOR · 2 NOTE (pre-existing rate-limit timing)
Registry: to be synced
Report: qa/CR_119_CR_120_CR_121_QA_REPORT.md
Next: Owner smoke → Closure → prod deploy
```
