# CR-001C-C — Coupon V1 Implementation Report

**Status:** `cr001c_coupon_v1_implementation_qa_passed_in_preview`
**Date:** 2026-05-24
**Plan:** `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V1_IMPLEMENTATION_PLAN.md` (incl. Addendum A.1–A.7 owner clarifications)
**Branch:** `24-may` (working in `/app`)

---

## 1. Summary

Coupon V1 implemented end-to-end per the approved plan + 7 owner clarifications.
All 32 planned QA cases pass (expanded into **45 assertions / 45 PASS / 0 FAIL**).
Live HTTP smoke confirmed for `/api/pos/coupons/available` and `/api/pos/coupons/validate`.
DB indexes created on backend startup. No prod data polluted.

---

## 2. Files changed / created

| File | Change | Highlights |
|---|---|---|
| `backend/core/coupon.py` | **NEW** | 5 service functions: `normalize_coupon_type`, `compute_coupon_discount`, `validate_coupon_for_customer`, `list_available_coupons`, `record_coupon_usage_for_order`. Also exports `ensure_coupon_indexes`. Tolerance constants `COUPON_VARIANCE_ABS_TOLERANCE=1.00` / `COUPON_VARIANCE_REL_TOLERANCE=0.01` (Addendum A.4). |
| `backend/models/schemas.py` | EXTEND | `Coupon` / `CouponCreate` / `CouponUpdate` gained `title`, `coupon_type`, `stackable_with_loyalty` (all optional, defaults safe). `CouponUsage` extended with new canonical fields, all `Optional` for backward compat with legacy rows. New model `POSCouponValidateRequest`. |
| `backend/routers/pos.py` | EXTEND + REBUILD | Imports new service. `POSOrderWebhook` gained `AliasChoices` for `coupon_code`, `coupon_discount`, `coupon_title`, `coupon_type`, `order_amount` (Addendum A.2). `GET /pos/coupons/available` added. `POST /pos/coupons/validate` rebuilt with JSON body + structured `error.code`. `POST /pos/coupons/apply` marked deprecated, routed through service. `pos_order_webhook` extended with final-commit coupon recording block (Q4=B). |
| `backend/services/analytics_service.py` | EXTEND | `get_coupon_stats` unions `coupon_usage` (realtime) + `coupon_transactions` (legacy migration). |
| `backend/server.py` | EXTEND | Imports `ensure_coupon_indexes` and calls it from FastAPI lifespan. |
| `backend/tests/seed_coupon_v1_fixtures.py` | **NEW** | Idempotent fixture seeder (Addendum A.1). 6 `QA_C1_*` coupons + `cleanup` action. CLI + programmatic API. |
| `backend/tests/qa_cr001c_c_coupon_v1.py` | **NEW** | 45-assertion QA harness covering all 32 planned cases. |
| `backend/routers/coupons.py` | **UNTOUCHED** | All 9 admin CRUD endpoints intact. Frontend compatibility preserved. |
| `backend/core/loyalty.py`, wallet code, migration code | **UNTOUCHED** | Out-of-scope per plan. |
| `/app/memory/final/` | **UNTOUCHED** | Out-of-scope per plan. |

---

## 3. Owner clarifications applied

| # | Clarification | Implementation |
|---|---|---|
| A.1 | Seed/test coupon fixture plan | `seed_coupon_v1_fixtures.py` creates 6 deterministic coupons (`QA_C1_FLAT50`, `QA_C1_PCT10`, `QA_C1_EXPIRED`, `QA_C1_INACTIVE`, `QA_C1_PERUSER`, `QA_C1_VIPONLY`). Idempotent. Scoped to a single `user_id`. CLI supports `seed` and `cleanup`. |
| A.2 | Canonical POS payload fields + aliases | `POSOrderWebhook` accepts canonical names + aliases via `validation_alias=AliasChoices(...)`: `coupon_code` ← `couponCode`/`coupon`; `coupon_discount` ← `couponDiscount`/`coupon_amount`/`coupon_discount_amount`; `coupon_title` ← `couponTitle`/`coupon_name`; `coupon_type` ← `couponType`; `order_amount` ← `orderAmount`/`order_total`/`orderTotal`. Verified via Pydantic round-trip. |
| A.3 | Final-order validation failure behavior | `record_coupon_usage_for_order` never raises. When server-side validation fails, returns `{ok: False, recorded: False, error: {code, field, detail}}`. `pos_order_webhook` does NOT roll back the order; instead surfaces `data.coupon_usage = {recorded: false, error: {...}}` in the response and emits `logger.warning("coupon_validation_failed_at_final_order ...")`. |
| A.4 | Mismatch tolerance | `_within_tolerance(pos_sent, crm_computed)` → `abs(diff) <= max(₹1.00, 1% * crm_computed)`. Outside tolerance: `logger.warning("coupon_amount_variance ...")`. POS amount is still recorded (Q5=C). |
| A.5 | Idempotency uniqueness | Compound unique partial index `{user_id:1, order_id:1}` on `coupon_usage` with `partialFilterExpression={"order_id":{"$type":"string"}}`. One coupon per order in V1. Future V2 upgrade path documented (swap to `(user_id, order_id, coupon_code)` — non-destructive). |
| A.6 | Admin CRUD smoke | All 9 endpoints in `routers/coupons.py` unchanged. QA-26 family asserts the new optional fields (`title`, `coupon_type`, `stackable_with_loyalty`) are visible without breaking existing payloads. |
| A.7 | Analytics double-count guard QA | QA-29 documents the overlap-case invariant: today realtime writes only to `coupon_usage`, migration writes only to `coupon_transactions`. QA-30 / QA-31 explicitly assert each path's exclusivity. |

---

## 4. New API endpoints

### `GET /api/pos/coupons/available`
Auth: `X-API-Key`. Query: `customer_id`, `order_total`, `channel="pos"`. Returns POSResponse with list. Read-only. Live-smoked.

### `POST /api/pos/coupons/validate` (JSON body)
Auth: `X-API-Key`. Body: `POSCouponValidateRequest(code, customer_id, order_total, channel="pos", loyalty_points_used=0.0)`. Returns success or structured `error.code`. Read-only. Live-smoked.

### Error codes implemented
`INVALID_CODE`, `EXPIRED`, `INACTIVE`, `MIN_ORDER_NOT_MET`, `USAGE_LIMIT_REACHED`, `CUSTOMER_USAGE_LIMIT_REACHED`, `CUSTOMER_NOT_ELIGIBLE`, `CHANNEL_NOT_VALID`, `STACKING_NOT_ALLOWED` — all asserted by QA-09..QA-17.

---

## 5. Final POS order integration

In `pos_order_webhook` (`POST /api/pos/orders`) after WhatsApp triggers:

1. If `coupon_code` present AND `coupon_discount > 0` → call `record_coupon_usage_for_order(...)`.
2. If `coupon_code` present AND `coupon_discount == 0` → log `coupon_zero_discount_skipped`, no recording.
3. If `coupon_discount > 0` but `coupon_code` missing → log `coupon_discount_without_code`, no recording.
4. Outcome surfaced under `data.coupon_usage` in the response. Order persistence never blocked. Idempotency-on-`order_id` enforced by the unique partial index.

`pos_payment_received` (legacy `/webhook/payment-received`) inline coupon block left in place for backward compatibility; will be retired in L5 alongside `pos_apply_coupon` deprecation.

---

## 6. Indexes created (verified live)

```
coupon_usage:
  uniq_user_order_id: (user_id:1, order_id:1) unique, partial(order_id:string)
  idx_user_coupon_customer: (user_id:1, coupon_id:1, customer_id:1)
  idx_user_created_at: (user_id:1, created_at:-1)

coupons:
  uniq_user_code: (user_id:1, code:1) unique
  (existing: _id_, uniq_coupon_id, idx_coupon_user_active)
```

---

## 7. QA results — `python -m tests.qa_cr001c_c_coupon_v1`

```
{
  "total": 45,
  "passed": 45,
  "failed": 0,
  "run_id": "4ac0bfe4"
}
```

Coverage:
- **MATH** ×6 — pure helpers
- **QA-01..QA-05** ×6 — `available` endpoint filters
- **QA-06..QA-18** ×13 — `validate` happy path + 9 error codes + stacking
- **QA-19..QA-23** ×7 — final-order recording, idempotency, edge cases
- **QA-24..QA-25, QA-29..QA-31** ×6 — analytics alignment + double-count guard
- **QA-26 family** ×4 — admin CRUD smoke
- **QA-27, QA-28** ×3 — Loyalty + Wallet regression

All 45 assertions PASS. No state left in DB after teardown (verified `coupons=0`, `coupon_usage=0`, `coupon_transactions=0` post-cleanup).

---

## 8. Live HTTP smoke (against the actual POS user `pos_0001_restaurant_478`)

| Endpoint | Result |
|---|---|
| `GET /api/pos/coupons/available?customer_id=...&order_total=600&channel=pos` | 200, returned 4 eligible coupons with `expected_discount` + `final_amount_preview` |
| `POST /api/pos/coupons/validate` happy path | 200, `success=true`, `computed_discount=50.0` |
| `POST /api/pos/coupons/validate` for `QA_C1_EXPIRED` | 200, `success=false`, `data.error={code:"EXPIRED", field:"end_date", detail:"..."}` |

Smoke fixtures cleaned up post-run.

---

## 9. Out-of-V1 reaffirmed

Not implemented (per plan + owner decisions): item-level coupons, category-level coupons, BOGO, Buy X Get Y, every Nth item free, happy-hour, free-item, wallet cashback, referral coupons, POS cart auto-add free item, coupon reversal/refund lifecycle, Wallet CR, Loyalty changes, L5 cleanup, production deployment.

---

## 10. Rollback

V1 is feature-isolated. To disable:
- Remove the coupon-record block in `pos_order_webhook` (single contiguous block, ~50 LOC).
- Revert `pos.py` import and the `/coupons/available`, `/coupons/validate` route definitions.
- Optional: drop indexes `db.coupon_usage.drop_index("uniq_user_order_id")`.
- No DB migration to undo. All new fields on existing models are optional.

---

## 11. Final status

`cr001c_coupon_v1_implementation_qa_passed_in_preview`

Ready for owner sign-off and POS-side integration handoff.
