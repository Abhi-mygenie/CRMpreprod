# CR-082 — Implementation Plan: Per-Coupon `requires_customer` Flag
**Date**: 2026-10-09 · **Role**: Planning Agent · **IA**: `planning/CR_082_IMPACT_ANALYSIS.md` (all 8 decisions locked since 2026-08-06, verified 2026-10-09) · **Risk**: HIGH (`core/coupon.py` CRITICAL hotspot) · **Status**: ✅ OWNER APPROVED — gate opens on "choose implementation role for CR-082" · **No code changed.**

---

## 0. Decisions locked (all 8, since 2026-08-06)

| Decision | Lock |
|---|---|
| Mechanism | Per-coupon `requires_customer: bool = True` |
| Default | `True` — all existing coupons unaffected |
| Anonymous usage recorded? | Yes — `customer_id = null` in usage doc |
| Global caps for anonymous? | Yes — `usage_limit` + `max_applications` enforced |
| `per_user_limit` for anonymous? | Skipped — already guarded by `if customer_id` at line 1769 |
| WhatsApp for anonymous? | Skipped — no phone at validate time |
| CRM UI toggle | Checkbox "Require customer to apply this coupon" (checked default) |
| POS without customer | Only `requires_customer=False` coupons returned |

---

## 1. Edit order

```
E9 (tests, red-first) → E1 → E2 → E3 (schemas) → E4 (POSCouponValidateRequest)
→ E6 (list_available_coupons signature) → E5 (validate_coupon_for_customer)
→ E7 (pos_available_coupons) → E8 (CouponsPage.jsx)
→ pytest CR-082 suite → existing coupon regression → V1–V11 self-test
```

E5 last among backend changes — it touches the CRITICAL `core/coupon.py` logic block.
E8 last overall — frontend; requires backend to be green first.

---

## 2. Edits

### E1 — `models/schemas.py:614` — `CouponCreate` (LOW risk)

Add after `applicable_channels: List[str] = ["delivery", "takeaway", "dine_in"]`:

```python
    requires_customer: bool = True   # CR-082: False = generic/walk-in coupon
```

### E2 — `models/schemas.py:699` — `CouponUpdate` (LOW risk)

Add after `applicable_channels: Optional[List[str]] = None`:

```python
    requires_customer: Optional[bool] = None  # CR-082
```

### E3 — `models/schemas.py:787` — `Coupon` response model (LOW risk)

Add after `applicable_channels: List[str] = ["delivery", "takeaway", "dine_in"]`:

```python
    requires_customer: bool = True   # CR-082: False = generic/walk-in coupon
```

### E4 — `models/schemas.py:925` — `POSCouponValidateRequest` (LOW risk)

```python
# Before
    customer_id: str

# After
    customer_id: Optional[str] = None   # CR-082: optional for generic coupons
```

### E5 — `core/coupon.py` — `validate_coupon_for_customer` (HIGH risk — 3 sub-edits)

**E5a — signature** (line 1648):
```python
# Before
    customer_id: str,

# After
    customer_id: Optional[str] = None,   # CR-082: optional for generic coupons
```

**E5b — CUSTOMER_REQUIRED gate** — insert after the `usage_limit` block (after line 1764), before the `per_user_limit` block (line 1766):
```python
    # CR-082: block anonymous order if coupon requires customer capture
    requires_customer = bool(coupon.get("requires_customer", True))
    if requires_customer and not customer_id:
        return {
            "ok": False,
            "error": {
                "code": "CUSTOMER_REQUIRED",
                "field": "customer_id",
                "detail": "This coupon requires a customer to be selected before applying",
            },
        }
```

**E5c — specific_users latent bug fix** (line 1815):
```python
# Before
    if specific and customer_id not in specific:

# After
    if specific and customer_id and customer_id not in specific:   # CR-082: guard None
```

### E6 — `core/coupon.py:1973` — `list_available_coupons` signature (LOW risk)

```python
# Before
    customer_id: str,

# After
    customer_id: Optional[str] = None,   # CR-082: optional for anonymous available-list
```

### E7 — `routers/pos.py:2918` — `pos_available_coupons` query param (LOW risk)

```python
# Before
    customer_id: str,

# After
    customer_id: Optional[str] = None,   # CR-082: optional; no customer → generic only
```

### E8 — `frontend/src/pages/CouponsPage.jsx` — 4 locations (LOW risk)

**E8a — `EMPTY_FORM` (line 78):** Add `requires_customer: true` to the object:
```javascript
  specific_users: [], stackable_with_loyalty: false, requires_customer: true,   // CR-082
```

**E8b — Edit hydration (line 298):** Add after `stackable_with_loyalty`:
```javascript
      requires_customer: coupon.requires_customer !== false,   // CR-082: default true if missing
```

**E8c — `handleSubmit` payload (after line 367):** Add:
```javascript
        requires_customer: form.requires_customer,   // CR-082
```

**E8d — Coupon card (line 540):** Add "Generic" badge after the existing scope Badge:
```jsx
          {coupon.requires_customer === false && (
            <Badge variant="outline" className="text-[10px] text-purple-600 border-purple-300"
              data-testid={`generic-badge-${coupon.id}`}>Generic</Badge>
          )}
```

**E8e — Form UI** — Add toggle section in the form, after the "Stackable with Loyalty" section:
```jsx
{/* CR-082: Requires Customer toggle */}
<div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
  <div>
    <p className="text-sm font-medium text-gray-900">Require customer to apply this coupon</p>
    <p className="text-xs text-gray-500 mt-0.5">
      Uncheck to allow walk-in orders without a CRM customer profile
    </p>
  </div>
  <Switch
    checked={form.requires_customer}
    onCheckedChange={v => setForm({ ...form, requires_customer: v })}
    data-testid="requires-customer-toggle"
  />
</div>
```

### E9 — `tests/test_cr082_requires_customer.py` (new, red-first, before E1–E8)

Test cases: V1–V11 from the IA verification matrix.
Pattern: `test_cr093_lookup.py` (sync requests + pymongo + dotenv_values).
Fixture: r689 Kunafa Mahal. Create test coupon with `requires_customer: false` + one with `requires_customer: true`.
Cleanup: delete test coupons in teardown.

---

## 3. Verification matrix

| V | Check | Expected |
|---|---|---|
| V1 | Create coupon `requires_customer: false` | Created, `requires_customer: false` in response |
| V2 | Create without field | Defaults to `true` |
| V3 | Validate generic coupon, no customer_id | `success:true`, discount computed |
| V4 | Validate `requires_customer:true` coupon, no customer_id | `success:false`, `CUSTOMER_REQUIRED` |
| V5 | `/pos/coupons/available` without customer_id | Only generic coupons returned |
| V6 | `/pos/coupons/available` with customer_id | All eligible coupons (including requires_customer:true) |
| V7 | Existing coupon test suites (`test_cr001c_*`, `test_cr021_*`) | 100% PASS — default True, no regression |
| V8 | CRM UI: "Require customer" toggle visible, checked by default | Toggle renders, `data-testid="requires-customer-toggle"` |
| V9 | "Generic" badge on card when unchecked | Badge appears, `data-testid="generic-badge-{id}"` |
| V10 | Usage recorded for generic coupon + anonymous order | `coupon_usage` doc with real customer_id (from `_find_or_create_customer`) |
| V11 | Regression: validate with customer_id | Still works as before |

---

## 4. Files

**WILL change**:
- `models/schemas.py` — E1 E2 E3 E4 (4 additions, all 1-liners)
- `core/coupon.py` — E5 (signature change + 8-line gate + 1-line bug fix) + E6 (signature change)
- `routers/pos.py` — E7 (1-line signature change)
- `frontend/src/pages/CouponsPage.jsx` — E8 (5 locations: EMPTY_FORM + hydration + payload + badge + toggle)
- `backend/tests/test_cr082_requires_customer.py` — E9 (new)

**WILL NOT touch**: `record_coupon_usage_for_order` · `routers/coupons.py` · `core/campaign_jobs.py` · `routers/campaigns.py` · `analytics`

---

## 5. Rollback

`git revert` — no data written; existing coupons unchanged (`requires_customer` defaults to `True`).

---

```
Planning complete: CR-082
Stage: Implementation Plan
Code reality: NONE (requires_customer does not exist anywhere — confirmed 2026-10-09)
Risk: HIGH (core/coupon.py CRITICAL hotspot — E5 is the critical edit)
Files WILL change: schemas.py (4) · core/coupon.py (2 functions, 3 sub-edits) · pos.py (1) · CouponsPage.jsx (5) · new test file
Owner decisions: all 8 locked
Edit order: E9 (tests) → E1–E4 (schemas) → E6 → E5 → E7 → E8
Next: "choose implementation role for CR-082" → implement
```
