# CR-001C-C — Coupon V3-B BOGO / Buy-X-Get-Y QA Report

**Status:** `cr001c_coupon_v3b_bogo_bxgy_implementation_qa_passed_in_preview`
**Date:** 2026-02 (preview)
**Plan:** `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V3B_BOGO_BXGY_PLANNING_AND_OWNER_GATE.md`
**Implementation report:** `/app/memory/crm/crm_1_0/implementation/CR_001C_C_COUPON_V3B_BOGO_BXGY_IMPLEMENTATION_REPORT.md`

---

## 1. QA harnesses run

| Harness | Total | Passed | Failed |
|---|---:|---:|---:|
| `qa_cr001c_c_coupon_v1.py` | 45 | **45** | 0 |
| `qa_cr001c_c_coupon_v2_item_category.py` | 45 | **45** | 0 |
| `qa_cr001c_c_coupon_v3_a_time_window.py` | 31 | **31** | 0 |
| `qa_cr001c_c_coupon_v3_b_bogo_bxgy.py` | **49** | **49** | 0 |
| **Combined** | **170** | **170** | **0** |

All four harnesses run against synthetic `QA_C{1,2,3A,3B}_USER_<run-id>` users (no production data touched). Each harness self-cleans its fixtures.

The V3-B harness expanded the planned ~32 assertions to **49** to cover line_total fallback, `max_discount` ceiling, response-shape gates, and runtime config errors not enumerated in the plan but required for safe rollout.

---

## 2. V3-B assertion-by-assertion outcome (49/49)

### Available API (4)
- ✅ V3B-A1 Available returns BOGO with `requires_cart_validation=true`
- ✅ V3B-A2 Available returns `offer_type=bogo`
- ✅ V3B-A3 Available `expected_discount=None` for BOGO (no cart)
- ✅ V3B-A4 Available `eligible_match_hint` carries `{kind, buy_quantity, buy:{...}, get:{...}}`

### Missing items (1)
- ✅ V3B-M1 Missing `items[]` returns `MISSING_ITEMS_FOR_BXGY_COUPON`

### Same-item BOGO (5)
- ✅ V3B-S1 qty 1 not eligible → `BUY_REQUIREMENT_NOT_MET`
- ✅ V3B-S2 qty 2 → 1 free (discount = unit_price)
- ✅ V3B-S3 qty 3 → 1 free (odd qty)
- ✅ V3B-S4 qty 4 → 2 free
- ✅ V3B-S5 Mixed-price lines → cheapest unit selected

### BXG same-item buy-2-get-1 (3)
- ✅ V3B-B1 qty 2 not eligible (need 3)
- ✅ V3B-B2 qty 3 → 1 free
- ✅ V3B-B3 qty 6 → 2 free

### BXG different-item (5)
- ✅ V3B-D1 2 pizza + 1 garlic → 1 free garlic
- ✅ V3B-D2 1 pizza + 1 garlic → `BUY_REQUIREMENT_NOT_MET`
- ✅ V3B-D3 2 pizza + 0 garlic → `NO_ELIGIBLE_GET_ITEMS_IN_CART`
- ✅ V3B-D4 4 pizza + 1 garlic → 1 app (capped by get)
- ✅ V3B-D5 4 pizza + 2 garlic → 2 apps

### Benefit types (3)
- ✅ V3B-T1 `free` → discount = unit_price
- ✅ V3B-T2 `percentage` 50% on ₹100 → ₹50
- ✅ V3B-T3 `flat` ₹150 capped by unit_price ₹100

### Caps (2)
- ✅ V3B-C1 `max_applications=2` caps free units to 2 (natural would have been 4)
- ✅ V3B-C2 `allow_repeat=False` caps at 1 application

### Selection: cheapest default, highest override (2)
- ✅ V3B-Sel1 Default picks ₹80 unit (cheapest)
- ✅ V3B-Sel2 `apply_to_highest_item=True` picks ₹500 unit

### Edge cases (2)
- ✅ V3B-E1 `line_total` fallback computes `unit_price = lt/qty`
- ✅ V3B-E2 Invalid (negative) price line ignored

### Response shape + pos_instruction (Q11=B) (3)
- ✅ V3B-R1 Success response carries `benefit_items` + `applied_applications`
- ✅ V3B-R2 `pos_instruction` surfaced on missing-requirement failure (BOGO qty 1 case)
- ✅ V3B-R3 `pos_instruction` NOT surfaced on success (happy path)

### Time-window + BOGO composition (Q10=A) (2)
- ✅ V3B-W1 Outside window → `OUTSIDE_TIME_WINDOW` (V3-A pre-check fires before V3-B compute)
- ✅ V3B-W2 Inside window → V3-B BOGO compute runs

### Loyalty stacking regression (1)
- ✅ V3B-L1 `stackable_with_loyalty=False` + `loyalty_points_used>0` → `STACKING_NOT_ALLOWED`

### `max_discount` ceiling (1)
- ✅ V3B-Cap Coupon-level `max_discount=75` caps total even when free units would yield more

### Final order + idempotency + non-blocking (5)
- ✅ V3B-F1 Final-order success records `coupon_usage` with V3-B snapshot
- ✅ V3B-F1b Persisted row carries `offer_type=bogo` + `applied_applications=1` + `benefit_items[]`
- ✅ V3B-F2 Idempotent replay returns `recorded=false, idempotent_replay=true`
- ✅ V3B-F3 Failure path returns `ok=false, recorded=false, error.code=NO_ELIGIBLE_GET_ITEMS_IN_CART`
- ✅ V3B-F3b Failure path inserts NO `coupon_usage` row

### Analytics (2)
- ✅ V3B-AN1 `breakdown_by_offer_type.bogo` populated by V3-B row (`used>=1`, `discount>=100`)
- ✅ V3B-AN2 `bxgy_usage` block populated (`total_applications>=1`, `free_units_given>=1`, `bogo_orders>=1`)

### Admin Pydantic validators (4)
- ✅ V3B-V1 Valid V3-B `CouponCreate` round-trips
- ✅ V3B-V2 `offer_type="buy_x_get_y"` normalizes to `"bxg"`
- ✅ V3B-V3 Invalid `get_discount_type` raises
- ✅ V3B-V4 `buy_quantity<1` raises

### Runtime config error codes (2)
- ✅ V3B-RT1 `BXGY_CONFIG_INVALID` raised when `get_discount_value` missing for percentage
- ✅ V3B-RT2 `UNSUPPORTED_BENEFIT_TYPE` raised when `get_discount_type="cashback"`

### Loyalty + Wallet untouched (2)
- ✅ V3B-LW1 Wallet collection untouched after V3-B flow
- ✅ V3B-LW2 `core.loyalty` importable (regression smoke)

---

## 3. Regression verification

**V1 (45/45 PASS)** — confirmed V3-B early branch inserted between V3-A pre-check and V1/V2 scope dispatch does NOT alter the V1 validation pipeline when `offer_type ∉ {bogo, bxg}`. V1 path skipped only when V3-B engine fires.

**V2 (45/45 PASS)** — confirmed V3-B branch does not interfere with V2 cart-aware item/category compute. V2 coupons retain their `discount_scope` dispatch.

**V3-A (31/31 PASS)** — confirmed V3-A Step-4 pre-check still fires BEFORE V3-B compute (verified by V3B-W1). `time_window_status` block still emitted uniformly for V3-B coupons.

**Loyalty + Wallet** — `core.loyalty` importable; `wallet_transactions` collection unchanged across V3-B operations (V3B-LW1, V3B-LW2).

---

## 4. Live HTTP smoke

| Check | Result |
|---|---|
| Backend supervisor restart (post-schema change) | Clean — `backend: stopped` then `backend: started`, no traceback in `/var/log/supervisor/backend.err.log` |
| `GET /api/health` | `200 {"status":"healthy"}` |
| `POST /api/pos/coupons/validate` with cart `items[]` payload (no API key) | `401` "Authentication required" — request body parsed cleanly; no Pydantic 422 on the V3-B cart shape, confirming model additions accepted |

Full restaurant-user BOGO/BXGY end-to-end smoke is a POS-integration concern handled in the joint V1+V2+V3-A+V3-B POS handoff.

---

## 5. Owner decisions verified

| OQ | Decision | Verified by |
|---|---|---|
| Q1=D Full BOGO + BXGY | All assertions exercise the unified V3-B engine (49/49). |
| Q2=A Get item in cart | V3B-D3 (`NO_ELIGIBLE_GET_ITEMS_IN_CART` on missing get); V3B-D4 (cart caps applications). |
| Q3=A Free cheapest | V3B-S5, V3B-Sel1 (default cheapest); V3B-Sel2 (override). |
| Q4=A Different-item BXGY | V3B-D1..D5. |
| Q5=C free / percentage / flat | V3B-T1..T3. |
| Q6=C `allow_repeat` default `True` | V3B-C2 (False caps at 1), V3B-S4 (default True allows repeat). |
| Q7=A `max_applications` cap | V3B-C1. |
| Q8=B Total + `benefit_items` summary | V3B-R1. |
| Q9=A Non-blocking final-order failure | V3B-F3, V3B-F3b. |
| Q10=A Time-window + BOGO composition | V3B-W1, V3B-W2. |
| Q11=B `pos_instruction` failure-only | V3B-R2 (surfaced on failure), V3B-R3 (not on success). |
| Q12=A Kickoff after defaults | This entire harness running green. |

---

## 6. Compatibility verified

- V1 harness 45/45 — V1 behavior unchanged.
- V2 harness 45/45 — V2 behavior unchanged.
- V3-A harness 31/31 — V3-A pre-check still fires; composition with BOGO/BXGY works.
- `coupon_transactions` legacy collection untouched (analytics union preserved).
- Admin CRUD 9 endpoints untouched (`routers/coupons.py` unchanged); extended models accept V3-B fields with safe defaults.
- `core/loyalty.py` untouched (importable verified).
- Wallet code untouched (counts unchanged verified).
- Migration code untouched.
- `/app/memory/final/` untouched.

---

## 7. Limitations / known followups

- Full live POS-handoff smoke is deferred to the joint V1+V2+V3-A+V3-B integration handoff (separate doc).
- Admin UI exposure of V3-B fields in `CouponsPage.jsx` is deferred to follow-up CR-001C-C-UI.
- `coupons.recommended_offer_type` (existing legacy hint field) is not consumed by the V3-B engine; recommendations from the segmentation flow will surface BOGO/BXG when added separately.
- `discount_mismatch` is recorded on the `coupon_usage` row but not surfaced as a new analytics counter; can be added in a follow-up if owner wants mismatch tracking.

---

## 8. Final status

`cr001c_coupon_v3b_bogo_bxgy_implementation_qa_passed_in_preview`

V3-B Path Alpha is ready for owner sign-off. POS-side integration of V1 + V2 + V3-A + V3-B jointly remains the next downstream task.
