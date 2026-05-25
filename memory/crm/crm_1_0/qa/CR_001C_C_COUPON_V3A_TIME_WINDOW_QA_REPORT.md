# CR-001C-C — Coupon V3-A Time-Window / Happy-Hour QA Report

**Status:** `cr001c_coupon_v3a_time_window_implementation_qa_passed_in_preview`
**Date:** 2026-02 (preview)
**Plan:** `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V3A_TIME_WINDOW_IMPLEMENTATION_PLAN.md`
**Implementation report:** `/app/memory/crm/crm_1_0/implementation/CR_001C_C_COUPON_V3A_TIME_WINDOW_IMPLEMENTATION_REPORT.md`

---

## 1. QA harnesses run

| Harness | Total | Passed | Failed |
|---|---:|---:|---:|
| `qa_cr001c_c_coupon_v1.py` | 45 | **45** | 0 |
| `qa_cr001c_c_coupon_v2_item_category.py` | 45 | **45** | 0 |
| `qa_cr001c_c_coupon_v3_a_time_window.py` | 31 | **31** | 0 |
| **Combined** | **121** | **121** | **0** |

All three harnesses run on the same MongoDB instance against synthetic `QA_*_USER_<run-id>` users (no production data touched). Each harness self-cleans its fixtures.

---

## 2. V3-A assertion-by-assertion outcome (31/31)

### Window evaluation (6)
- ✅ V3A-01 within window Wed 16:00 IST
- ✅ V3A-02 before window Wed 12:00 IST → OUTSIDE_TIME_WINDOW
- ✅ V3A-03 boundary end_time 18:00 is OUTSIDE (exclusive end)
- ✅ V3A-04 Saturday not in valid_days → OUTSIDE_TIME_WINDOW
- ✅ V3A-05 zero-width window defensive behavior
- ✅ V3A-06 no window → status emitted with configured=False

### Overnight wrap (2)
- ✅ V3A-07 overnight wrap Saturday 01:00 IST is within Friday window
- ✅ V3A-08 Saturday 23:00 IST is OUTSIDE (Saturday not in valid_days)

### Timezone resolution (3)
- ✅ V3A-09 coupon.timezone wins (NY window outside at IST 16:00)
- ✅ V3A-10 users.settings.timezone resolves Asia/Kolkata (within window)
- ✅ V3A-11 falls back to product default Asia/Kolkata

### Server-clock vs POS-supplied order_time (2)
- ✅ V3A-12 POS supplied time ignored for decision (within)
- ✅ V3A-13 POS time ignored when outside (still OUTSIDE)

### `/available` shape (3)
- ✅ V3A-14 within-window coupon listed with within_window_now=true
- ✅ V3A-15 outside-window coupon still returned for greyed-out UX
- ✅ V3A-16 no-window coupon has time_window.configured=false

### V1+V2 cross-cutting happy-hour (2)
- ✅ V3A-17 V1 ORDER_PERCENTAGE within window computes V1 discount
- ✅ V3A-18 V2 ITEM_PERCENTAGE within window computes V2 discount

### Final-order non-blocking + idempotency (5)
- ✅ V3A-19 within-window final order records usage
- ✅ V3A-19b persisted coupon_usage carries offer_type + time_window_status
- ✅ V3A-20 outside-window final order non-blocking (not recorded)
- ✅ V3A-20b outside-window final order did not insert coupon_usage row
- ✅ V3A-21 idempotent replay (recorded=false, idempotent_replay=true)

### Analytics (2)
- ✅ V3A-22 breakdown_by_offer_type present with simple bucket counting V3-A row
- ✅ V3A-23 time_window_usage block populated (with `used_outside_window_attempts=0` per OQ-V3A-2)

### Admin CRUD Pydantic validators (4)
- ✅ V3A-24a valid_days dedup+sort works
- ✅ V3A-24b invalid HH:MM raises
- ✅ V3A-24c invalid timezone raises
- ✅ V3A-24d valid_days out of range raises

### Loyalty + Wallet untouched (2)
- ✅ V3A-25 wallet collection untouched after V3-A flow
- ✅ V3A-25b core.loyalty importable (regression smoke)

---

## 3. Regression verification

**V1 (45/45 PASS)** — confirmed V3-A pre-check Step 4 inserted before usage_limit / min_order checks does NOT alter the V1 validation pipeline when the coupon has no window configured. Status block `configured:false` is emitted but does not affect success/failure outcomes.

**V2 (45/45 PASS)** — confirmed V3-A pre-check runs before V2 cart-aware compute. V2 item/category coupons without windows behave identically. V3-A's `breakdown_by_offer_type` addition is additive and does NOT alter V2's `breakdown_by_scope`.

**Loyalty + Wallet** — `core.loyalty` importable; `wallet_transactions` collection unchanged across V3-A operations.

---

## 4. Live HTTP smoke

| Check | Result |
|---|---|
| Backend supervisor restart (post-schema change) | Clean — `backend: stopped` then `backend: started` |
| `GET /api/health` | 200 `{"status":"healthy"}` |
| `POST /api/pos/coupons/validate` with new optional `order_time` field | Request body parsed successfully (request rejected at API-key auth layer, not Pydantic 422 — confirms `order_time` field accepted) |

Full restaurant-user happy-hour smoke is a POS-integration concern handled in the joint V1+V2+V3-A POS handoff.

---

## 5. Owner decisions verified

| OQ | Decision | Verified by |
|---|---|---|
| OQ-V3-5 (restaurant local tz; server clock decides) | V3A-09, V3A-10, V3A-11, V3A-12, V3A-13 |
| OQ-V3-7 (one coupon per order) | V3A-21 (idempotent replay) |
| OQ-V3-8 (final-order non-blocking) | V3A-20, V3A-20b |
| OQ-V3A-1 (uniform status block) | V3A-06 (configured=false block emitted), V3A-17/18 (configured=true block emitted) |
| OQ-V3A-2 (defer `used_outside_window_attempts` to V3-A2) | V3A-23 (counter returns 0) |

---

## 6. Compatibility verified

- V1 harness 45/45 — V1 ORDER_FLAT / ORDER_PERCENTAGE behavior unchanged
- V2 harness 45/45 — V2 ITEM_*/CATEGORY_* behavior unchanged
- Idempotency key `(user_id, order_id)` unchanged
- Variance tolerance unchanged
- Stacking with loyalty unchanged
- `coupon_transactions` legacy collection untouched (analytics union preserved)
- Admin CRUD 9 endpoints untouched (`routers/coupons.py` unchanged)
- `core/loyalty.py` untouched
- Wallet code untouched
- Migration code untouched
- `/app/memory/final/` untouched

---

## 7. Final status

`cr001c_coupon_v3a_time_window_implementation_qa_passed_in_preview`

V3-A is ready for owner sign-off. POS-side integration of V1 + V2 + V3-A jointly remains the next downstream task (separate handoff doc).
