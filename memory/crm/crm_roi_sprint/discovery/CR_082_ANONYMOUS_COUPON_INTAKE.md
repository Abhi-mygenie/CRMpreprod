# CR-082 — Per-Coupon "Requires Customer" Flag — Intake Doc (REVISED)

**Date**: 2026-08-06
**Role**: Intake Agent
**Sprint**: crm_roi_sprint
**Source**: Owner clarification 2026-08-06

---

## 1. Owner Request (verbatim)

> "Currently coupons can be applied only if customer is there. We need coupon can be applied even if customer is not captured."
> "We should be able to choose tick if this particular coupon will be generic or only with customer name."
> "Usage has to be recorded for ROI, coupon analytics."

---

## 2. Design — Revised Understanding

**Not** a global change making `customer_id` optional everywhere.
**Instead**: a per-coupon toggle field on each coupon.

```
requires_customer: bool  (default: true)
```

| Value | Meaning | Who can use it |
|---|---|---|
| `true` (default) | Customer must be captured before coupon applies | Only orders with a CRM customer_id |
| `false` | Generic coupon — applies to any walk-in order | Any order, with or without customer |

**Where the toggle appears:**
- CRM frontend: Coupons page → create/edit form — a checkbox "Require customer to apply this coupon" (ticked by default)
- POS: when no customer is selected, only `requires_customer = false` coupons are offered

---

## 3. Classification

| Field | Value |
|---|---|
| **Type** | CR — new flag on coupon + validation engine change |
| **Severity** | P1 — walk-in customers (no CRM profile) cannot use any coupon today |
| **Risk** | **HIGH** — `core/coupon.py` (2,457 LOC) is a **CRITICAL hotspot** |
| **Effort estimate** | ~2.5 hrs |

---

## 4. Duplicate Check

| Candidate | Verdict | Reason |
|---|---|---|
| CR-081 (POS Coupon Management) | RELATED, DISTINCT | CR-081 adds management CRUD. CR-082 changes the validation engine. |
| CR-001C-C (Coupon Engine V1–V3) | RELATED, DISTINCT | Previous CRs added discount types. CR-082 adds eligibility mode. |

**Result: DISTINCT.**

---

## 5. Code Reality — Nothing Exists

`requires_customer` field does **not exist** anywhere:
- `grep -n "requires_customer" models/schemas.py` → 0 results ✅ confirmed
- `grep -n "requires_customer" core/coupon.py` → 0 results ✅ confirmed
- Not in `CouponsPage.jsx` ✅ confirmed

Everything is net-new.

---

## 6. Affected Surfaces (all 5 confirmed by code read)

| Surface | File | Change |
|---|---|---|
| **A — Schema** | `models/schemas.py` | Add `requires_customer: bool = True` to `CouponCreate`, `CouponUpdate`, `Coupon` |
| **B — Validation engine** | `core/coupon.py` | `validate_coupon_for_customer`: when `coupon.requires_customer == False` + `customer_id is None` → skip per_user_limit check, proceed with order-level checks only |
| **C — Usage recording** | `core/coupon.py` | `record_coupon_usage_for_order`: when `customer_id is None` + coupon is generic → persist `customer_id = None` (for global analytics) |
| **D — POS available coupons** | `routers/pos.py` | `pos_available_coupons`: if `customer_id` is absent or empty → return only coupons where `requires_customer = false`; include `requires_customer` in each coupon's response |
| **E — CRM Frontend toggle** | `CouponsPage.jsx` | Add checkbox "Require customer capture" (default checked) on create/edit form. Sends `requires_customer` in payload. |

---

## 7. Behaviour Spec (all locked by owner)

### Validation (Surface B)

```
validate_coupon_for_customer(customer_id, coupon, ...):
  if coupon.requires_customer == True:
    if not customer_id → REJECT with "This coupon requires a customer to be selected"
    run per_user_limit check as today
  
  if coupon.requires_customer == False:
    if not customer_id → SKIP per_user_limit (no user to track)
    continue with order-level checks: min_order_value, max_applications, usage_limit, time_window
```

### Usage recording (Surface C)

```
record_coupon_usage_for_order(customer_id=None, ...):
  if coupon.requires_customer == False and customer_id is None:
    persist usage doc with customer_id = None
    still increments coupon.total_used, coupon_usage count (global analytics)
    idempotency key: f"order_{order_id}" (existing fallback — no change needed)
    skip WhatsApp coupon_earned event (no phone number)
```

### POS available coupons (Surface D)

```
GET /api/pos/coupons/available?order_total=500   (no customer_id)
  → returns only coupons where requires_customer = false
  → each coupon includes "requires_customer": false in response

GET /api/pos/coupons/available?customer_id=abc&order_total=500
  → existing behaviour (all eligible coupons for customer, including requires_customer=true)
```

### CRM Frontend (Surface E)

On the coupon create/edit form, below the "Discount Type" section:

```
[☑] Require customer to apply this coupon  (checked by default)
```

When unchecked → `requires_customer = false` → this coupon is generic / walk-in friendly.
A label/badge "Generic" shown on the coupon card when `requires_customer = false`.

---

## 8. Owner Decisions — All Locked

| Decision | Lock |
|---|---|
| Mechanism | Per-coupon flag `requires_customer` (not global) |
| Default value | `true` — all existing coupons unaffected (backward compatible) |
| Record usage when no customer? | **Yes** — `customer_id = null` in usage doc |
| Global caps enforced for anonymous? | **Yes** — `usage_limit` + `max_applications` enforced |
| per_user_limit for anonymous? | **Skipped** — no user to track |
| WhatsApp notify for anonymous? | **No** — silently skipped (no phone) |
| Where toggle appears | CRM coupon create/edit form (checkbox) |
| POS available coupons without customer | Only `requires_customer = false` coupons returned |

---

## 9. Blast Radius

| Area | Impact |
|---|---|
| **Files WILL change** | `models/schemas.py` (+1 field), `core/coupon.py` (2 edits), `routers/pos.py` (1 edit), `CouponsPage.jsx` (1 toggle + badge) |
| **Files WILL NOT change** | `routers/coupons.py`, `core/campaign_jobs.py`, `routers/campaigns.py`, `TemplatesPage.jsx` |
| **DB** | `coupons` collection: new field `requires_customer` (schemaless — no migration; missing = treated as `true`) |
| **DB** | `coupon_usage`: `customer_id` field becomes nullable for generic coupons |
| **Backward compatibility** | ✅ All existing coupons work unchanged — `requires_customer` defaults to `true` |
| **Blast radius** | **HIGH** (core/coupon.py CRITICAL hotspot) |

---

## 10. Risk Mitigation

1. Planning agent **must read full `core/coupon.py`** before writing plan — all callers of `validate_coupon_for_customer` and `record_coupon_usage_for_order` must be traced.
2. Change is **additive** — new `if coupon.requires_customer == False` branch. Existing `True` path untouched.
3. All existing coupon tests (`test_cr001c_*`, `test_cr021_*`) must pass unchanged — they all use coupons with `requires_customer = True` (default).
4. Owner approval required before implementation (HIGH risk per §7 of agent system prompt).

---

## 11. Intake Output

```
Intake complete: CR-082 (REVISED)
Classification: CR — per-coupon flag + validation engine change + frontend toggle
Severity: P1
Risk: HIGH (core/coupon.py CRITICAL hotspot)
Duplicate check: DISTINCT
Evidence: grep confirmed requires_customer does not exist in any file
Blast radius: HIGH
All decisions locked — no open owner questions
Docs: discovery/CR_082_ANONYMOUS_COUPON_INTAKE.md (this), register row 32, dashboard, DECISIONS_LOG
Next: Planning BLOCKED on owner approval (HIGH risk gate)
```

*Zero production files modified during Intake.*
