# QA Handover — CR-082: Per-Coupon `requires_customer` Flag
**Date**: 2026-10-09 · **From**: Implementation Agent · **To**: QA Agent
**IA**: `planning/CR_082_IMPACT_ANALYSIS.md` · **Plan**: `planning/CR_082_IMPLEMENTATION_PLAN.md` · **Risk**: HIGH (core/coupon.py CRITICAL hotspot) · **Backend + Frontend**
**Creds**: `owner@kunafamahal.com / Qplazm@10` · r689 api_key in DB (`users.find_one({id:"pos_0001_restaurant_689"}).api_key`) · URL from `/app/frontend/.env`

---

## What changed (4 files + 1 new test, markers `# CR-082`)

| File | Change |
|---|---|
| `models/schemas.py` | E1–E3: `requires_customer: bool = True` on `CouponCreate` (after applicable_channels), `requires_customer: Optional[bool] = None` on `CouponUpdate`, `requires_customer: bool = True` on `Coupon`. E4: `POSCouponValidateRequest.customer_id` → `Optional[str] = None` |
| `core/coupon.py` | E5a: `validate_coupon_for_customer` `customer_id: str` → `Optional[str] = None`. E5b: CUSTOMER_REQUIRED gate (8 lines, inserted after usage_limit block). E5c: specific_users latent bug fix at line 1827 (`and customer_id` guard). E6: `list_available_coupons` signature → Optional |
| `routers/pos.py` | E7: `pos_available_coupons` — `order_total: float` moved before `customer_id: Optional[str] = None` to preserve Python arg-ordering rules |
| `CouponsPage.jsx` | E8: EMPTY_FORM `requires_customer: true` · edit hydration · handleSubmit payload · `<Badge>Generic</Badge>` on card · `requires-customer-toggle` Switch in form |
| `tests/test_cr082_requires_customer.py` | E9: New — 8 tests V1–V11 (V7/V8/V9 covered by existing suites + UI) |

**Not touched**: `record_coupon_usage_for_order` · `routers/coupons.py` · `campaigns` · `analytics`

---

## Self-test — 8/8 PASS (`test_cr082_requires_customer.py`)

| V | Check | Result |
|---|---|---|
| V1 | Create coupon `requires_customer: false` → stored correctly | ✅ |
| V2 | Create without field → defaults to `true` (backward compat) | ✅ |
| V3 | Validate generic coupon, no `customer_id` → success, discount computed | ✅ |
| V4 | Validate standard coupon, no `customer_id` → `CUSTOMER_REQUIRED` error | ✅ |
| V5 | `GET /pos/coupons/available` (no customer) → generic appears, standard absent | ✅ |
| V6 | `GET /pos/coupons/available` (with customer) → both coupons appear | ✅ |
| V10 | Usage recorded for generic coupon on a real order | ✅ |
| V11 | Validate standard coupon WITH `customer_id` still works | ✅ |

**Key notes:**
- Generic coupon must include `"pos"` in `applicable_channels` to work at POS till (default channels are dine_in/delivery/takeaway; POS validate defaults to `channel="pos"`)
- Backward compat: existing coupons without `requires_customer` field default to `True` via Pydantic
- specific_users latent bug fixed (line 1827): `None not in [...]` was always `True` for anonymous orders

---

## QA asks
1. Run `pytest tests/test_cr082_requires_customer.py -v -n 0`
2. Run existing coupon regression: `pytest tests/test_cr001c_*.py tests/test_cr021_*.py -v -n 0` → must all PASS (default True, customer_id always present in those tests)
3. Frontend (Playwright desktop + mobile 390px): Open Coupons page → Create coupon → confirm `requires-customer-toggle` visible and checked. Uncheck → `Generic` badge appears on card.
4. Ad-hoc: `POST /coupons` without `requires_customer` → confirm stored as `true`. Edit existing coupon with `requires_customer: false` via PUT → confirm updated.
5. Report → `qa/CR_082_QA_REPORT.md` + `test_reports/iteration_11.json`.
