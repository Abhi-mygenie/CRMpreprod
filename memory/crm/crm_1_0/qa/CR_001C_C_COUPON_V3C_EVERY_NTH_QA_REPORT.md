# CR-001C-C — Coupon V3-C Every-Nth Item QA Report

**Status:** `cr001c_coupon_v3c_every_nth_implementation_qa_passed_in_preview`
**Date:** 2026-05-25
**Run environment:** Emergent preview (external MongoDB `52.66.232.149:27017/mygenie`)

---

## 1. V1 Regression Result

```
cd /app/backend && python -m tests.qa_cr001c_c_coupon_v1
```

**Result: 45/45 PASS** (0 FAIL)

All V1 ORDER_FLAT / ORDER_PERCENTAGE paths, available API, validate, final-order recording, idempotency, analytics, admin CRUD, stacking — green.

---

## 2. V2 Regression Result

```
cd /app/backend && python -m tests.qa_cr001c_c_coupon_v2_item_category
```

**Result: 45/45 PASS** (0 FAIL)

All V2 ITEM/CATEGORY scope paths — green.

---

## 3. V3-A Regression Result

```
cd /app/backend && python -m tests.qa_cr001c_c_coupon_v3_a_time_window
```

**Result: 31/31 PASS** (0 FAIL)

All V3-A time-window, overnight wrap, timezone resolution, server-clock, within/outside window — green.

---

## 4. V3-B Regression Result

```
cd /app/backend && python -m tests.qa_cr001c_c_coupon_v3_b_bogo_bxgy
```

**Result: 49/49 PASS** (0 FAIL)

All V3-B BOGO/BXGY same-item, different-item, benefit types, caps, selection, time-window composition, final-order, analytics — green.

---

## 5. V3-C QA Result

```
cd /app/backend && python -m tests.qa_cr001c_c_coupon_v3_c_every_nth
```

**Result: 41/41 PASS** (0 FAIL)

### V3-C Assertion Detail (41 assertions):

| # | Case | Status |
|---|---|---|
| 1 | V3C-A1 Available returns Every-Nth with requires_cart_validation=true | OK |
| 2 | V3C-A2 Available returns offer_type=nth_item | OK |
| 3 | V3C-A3 Available returns nth_item_number=5 | OK |
| 4 | V3C-M1 No items[] → MISSING_ITEMS_FOR_EVERY_NTH_COUPON | OK |
| 5 | V3C-S1 qty 4 → NTH_REQUIREMENT_NOT_MET | OK |
| 6 | V3C-S2 qty 5 → 1 application, discount=100 | OK |
| 7 | V3C-S3 qty 9 → 1 application | OK |
| 8 | V3C-S4 qty 10 → 2 applications, discount=200 | OK |
| 9 | V3C-S5 Mixed-price cheapest unit selected (discount=80) | OK |
| 10 | V3C-P1 Every 3rd dessert 50% off qty=3 → discount=50 | OK |
| 11 | V3C-P2 Every 3rd dessert 50% off qty=6 → 2 apps, discount=100 | OK |
| 12 | V3C-F1 Flat 150 capped by unit_price 100 → discount=100 | OK |
| 13 | V3C-F2 Flat 150 on unit_price 200 → discount=150 | OK |
| 14 | V3C-C1 Category 5 beverages → 1 free (cheapest=80) | OK |
| 15 | V3C-C2 7 beverages → 1 application | OK |
| 16 | V3C-C3 10 beverages → 2 applications | OK |
| 17 | V3C-X1 Mixed cart: 3 desserts eligible, mains untouched | OK |
| 18 | V3C-X2 Excluded items honored | OK |
| 19 | V3C-K1 max_applications=2 caps at 2 (natural=3) | OK |
| 20 | V3C-K2 allow_repeat=false caps at 1 (natural=2) | OK |
| 21 | V3C-Sel1 apply_to_highest_item=true picks highest (300, not 80) | OK |
| 22 | V3C-E1 line_total fallback works | OK |
| 23 | V3C-E2 Negative unit_price line ignored | OK |
| 24 | V3C-R1 Success carries benefit_items, applied_applications, nth_item_number | OK |
| 25 | V3C-R2 pos_instruction surfaced on NTH_REQUIREMENT_NOT_MET | OK |
| 26 | V3C-R3 pos_instruction NOT on success response | OK |
| 27 | V3C-W1 Outside window → OUTSIDE_TIME_WINDOW (V3-A short-circuits) | OK |
| 28 | V3C-W2 Inside window → V3-C computes | OK |
| 29 | V3C-L1 STACKING_NOT_ALLOWED when stackable_with_loyalty=false + loyalty used | OK |
| 30 | V3C-F1o Final-order success: recorded=true, offer_type=nth_item | OK |
| 31 | V3C-F2o Idempotent replay: recorded=false, idempotent_replay=true | OK |
| 32 | V3C-F3o Failure: recorded=false, error code present | OK |
| 33 | V3C-AN1 breakdown_by_offer_type.nth_item.used >= 1 | OK |
| 34 | V3C-AN2 nth_item_usage block populated | OK |
| 35 | V3C-V1 Valid V3-C CouponCreate round-trips | OK |
| 36 | V3C-V2 nth_item_number<2 raises Pydantic error | OK |
| 37 | V3C-V3 Invalid nth_discount_type rejected | OK |
| 38 | V3C-RT1 EVERY_NTH_CONFIG_INVALID raised on missing nth_discount_value | OK |
| 39 | V3C-RT2 UNSUPPORTED_NTH_BENEFIT_TYPE raised on cashback | OK |
| 40 | V3C-LW1 wallet collection untouched | OK |
| 41 | V3C-LW2 core.loyalty importable (regression smoke) | OK |

---

## 6. Combined QA Result

| Suite | Expected | Actual | Status |
|---|---|---|---|
| V1 | 45/45 | **45/45** | PASS |
| V2 | 45/45 | **45/45** | PASS |
| V3-A | 31/31 | **31/31** | PASS |
| V3-B | 49/49 | **49/49** | PASS |
| V3-C | ≥33 | **41/41** | PASS |
| **Combined** | **≥203** | **211/211** | **PASS** |

---

## 7. Compile Result

```
cd /app/backend && python -m py_compile core/coupon.py models/schemas.py routers/pos.py services/analytics_service.py tests/qa_cr001c_c_coupon_v3_c_every_nth.py
```

**All 5 files compile clean.** No syntax errors.

---

## 8. Live HTTP Smoke

```
curl -s https://coupon-roi-preview.preview.emergentagent.com/api/health
→ {"status":"healthy","timestamp":"2026-05-25T03:09:27.585941+00:00"}
```

Backend running clean on Emergent preview. No 500s, no startup errors.

---

## 9. Cleanup Result

All QA harnesses self-clean via per-run unique USER_ID + `cleanup()` in finally blocks. No synthetic data persists in the external MongoDB after test runs.

---

## 10. Untouched Areas Confirmation

- `routers/coupons.py` (9 admin CRUD endpoints): **UNTOUCHED**
- `core/loyalty.py`: **UNTOUCHED** (confirmed importable in V3C-LW2)
- `core/loyalty_jobs.py`: **UNTOUCHED**
- Wallet code: **UNTOUCHED** (confirmed via V3C-LW1 count check)
- Migration code (`routers/migration.py`): **UNTOUCHED**
- `coupon_transactions` legacy collection: **UNTOUCHED**
- `/app/memory/final/`: **UNTOUCHED**
- No DB migration, no new indexes, no new dependencies, no env changes

---

## 11. Final Status

`cr001c_coupon_v3c_every_nth_implementation_qa_passed_in_preview`
