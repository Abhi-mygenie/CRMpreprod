# CR-082 — Impact Analysis
## Per-Coupon "Requires Customer" Flag

**Date**: 2026-08-06
**Role**: Planning Agent
**Risk**: HIGH — `core/coupon.py` (2,458 LOC) is CRITICAL hotspot
**Intake doc**: `discovery/CR_082_ANONYMOUS_COUPON_INTAKE.md`

---

## 1. Registration + Owner Approval Verified

CR-082 registered. Status: `cr082_intake_closed_owner_approved_planning_gate_open`.
All 8 owner decisions locked. Owner approved HIGH risk by closing intake session.

---

## 2. Full Code Read — Completed

All 2,458 lines of `core/coupon.py` traced. All callers of the three affected functions mapped.

---

## 3. Code Reality — What Exists vs What Changes

### `validate_coupon_for_customer` (coupon.py:1643)

**Current signature**: `customer_id: str` — REQUIRED, no default.

**5 call sites confirmed**:

| Caller | Location | customer_id value | Needs change? |
|---|---|---|---|
| `list_available_coupons` | coupon.py:2025 | passed from list function | ✅ Yes — make Optional |
| `record_coupon_usage_for_order` | coupon.py:2202 | always real UUID (from `_find_or_create_customer`) | ❌ No |
| `pos_validate_coupon` | pos.py:2897 | `request.customer_id` | ✅ Yes — make Optional in request |
| `validate_coupon` | coupons.py:170 | CRM frontend, still required | ❌ No |
| `apply_coupon` | coupons.py:226 | CRM frontend, still required | ❌ No |

**Customer-specific checks inside the function**:

| Check | Line | Current | After CR-082 |
|---|---|---|---|
| `per_user_limit` | 1769 | `if customer_id and per_user_limit...` | ✅ Already guarded — no change |
| `specific_users` | 1815 | `if specific and customer_id not in specific:` | ⚠️ **BUG** when customer_id=None: `None not in [...]` → True → blocks anonymous. Must add `and customer_id` guard |

**New check to add** — after `usage_limit` check (line 1764), before `per_user_limit` (line 1766):
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

**This is the ONLY new branch.** All existing code paths untouched.

---

### `list_available_coupons` (coupon.py:1969)

**Current signature**: `customer_id: str` — REQUIRED.

**Body is already anonymous-safe** (confirmed by code read):
- Line 2010: `if customer_id:` — usage_map fetch guarded ✅
- Line 2036: `... if customer_id else None` — _precomputed_usage_count guarded ✅

When `customer_id=None`:
- `validate_coupon_for_customer` returns `CUSTOMER_REQUIRED` error for `requires_customer=True` coupons → filtered out at line 2043 ✅
- `requires_customer=False` coupons pass the new check → appear in available list ✅

**Change**: `customer_id: str` → `customer_id: Optional[str] = None` — signature only, zero body changes.

---

### `record_coupon_usage_for_order` (coupon.py:2132)

**Does NOT need to change.** At order commit time (`POST /api/pos/orders`), `_find_or_create_customer` always produces a real `customer_id` UUID. Anonymous validate ≠ anonymous order — the order always has a customer (even auto-created from phone).

Line 2368: `await db.customers.update_one({"id": customer_id, "user_id": user_id}, ...)` — always safe because customer_id is always set at commit time.

---

### `pos_available_coupons` (pos.py:2851)

**Current**: `customer_id: str` — required query param. POS must always provide it.

**Change**: `customer_id: Optional[str] = None` — optional. When omitted, only `requires_customer=False` coupons returned (handled automatically by `validate_coupon_for_customer` changes above).

---

### `POSCouponValidateRequest` (schemas.py:923)

**Current**: `customer_id: str` — required in body.
**Change**: `customer_id: Optional[str] = None`

---

### `models/schemas.py` — 3 model changes

| Model | Change | Backward compat? |
|---|---|---|
| `CouponCreate` (line 603) | Add `requires_customer: bool = True` | ✅ default True = existing behaviour |
| `CouponUpdate` (line 688) | Add `requires_customer: Optional[bool] = None` | ✅ optional, None skipped on patch |
| `Coupon` (line 773) | Add `requires_customer: bool = True` | ✅ `extra="ignore"` already set |

Existing `coupons` documents without `requires_customer` field: Pydantic reads missing field as default `True` — identical to current behaviour. **Zero migration needed.**

---

### `CouponsPage.jsx`

5 additive changes (0 modifications to existing logic):

| # | Location | Change |
|---|---|---|
| 1 | `EMPTY_FORM` (line 73) | Add `requires_customer: true` |
| 2 | Edit hydration (line 288) | Add `requires_customer: coupon.requires_customer !== false` |
| 3 | `handleSubmit` payload (line 353) | Add `requires_customer: form.requires_customer` |
| 4 | Form UI (after "Coupon Details" section) | Toggle switch "Require customer to apply this coupon" (checked=true by default). `data-testid="requires-customer-toggle"` |
| 5 | Coupon card render (line 534) | Show `<Badge>Generic</Badge>` when `coupon.requires_customer === false` |

---

## 4. Data Flow Traces

### Flow A — Validate with `requires_customer=false`, no customer (NEW PATH)

```
POS cashier applies coupon, no customer selected

POST /api/pos/coupons/validate
  body: { code: "ANON20", order_total: 500.0 }   ← no customer_id

→ pos_validate_coupon (pos.py:2883)
    request.customer_id = None  (Optional now)
→ validate_coupon_for_customer(customer_id=None, code="ANON20", ...)
    coupon fetched → is_active ✅ → date range ✅ → time_window ✅ → usage_limit ✅
    requires_customer check: coupon.requires_customer=False → NOT customer_id=None → skip ✅
    per_user_limit check: `if customer_id and ...` → `if None and ...` → False → skip ✅
    min_order_value ✅ → channel ✅
    specific_users: `if specific and customer_id and ...` → `if None and ...` → False → skip ✅
    stackable ✅
    → {"ok": True, "computed_discount": 100.0, ...}
→ Returns: {"success": true, "data": {"valid": true, "computed_discount": 100.0}}

POST /api/pos/orders  (coupon_code="ANON20", cust_mobile="9876543210")
→ _find_or_create_customer → customer_id="abc-xyz"  (real UUID, always)
→ record_coupon_usage_for_order(customer_id="abc-xyz", ...)
    validate_coupon_for_customer(customer_id="abc-xyz", code="ANON20")
      requires_customer=False, customer_id="abc-xyz" → not customer_id is False → skip ✅
    → usage recorded with customer_id="abc-xyz" ✅
```

### Flow B — Validate with `requires_customer=true`, no customer (BLOCKED)

```
POST /api/pos/coupons/validate
  body: { code: "VIP50", order_total: 500.0 }   ← no customer_id

→ validate_coupon_for_customer(customer_id=None, code="VIP50", ...)
    requires_customer check: coupon.requires_customer=True AND not customer_id=None → BLOCK
    → {"ok": False, "error": {"code": "CUSTOMER_REQUIRED", ...}}

→ Returns: {"success": false, "message": "This coupon requires a customer to be selected"}
```

### Flow C — `GET /pos/coupons/available` without customer

```
GET /api/pos/coupons/available?order_total=500

→ list_available_coupons(customer_id=None, order_total=500)
    usage_map fetch: skipped (if customer_id guard at line 2010) ✅
    Loop over all active coupons:
      coupon A (requires_customer=True)  → validate → CUSTOMER_REQUIRED → filtered out
      coupon B (requires_customer=False) → validate → ok=True → appears in list ✅
      coupon C (requires_customer=True)  → validate → CUSTOMER_REQUIRED → filtered out
    → returns [coupon_B]
```

---

## 5. Conflict Check

- **Existing coupon tests** (`test_cr001c_*`, `test_cr021_*`, etc.): all use coupons without `requires_customer` field. Pydantic default=True. The new `requires_customer` check fires only when `not customer_id` — all existing tests pass `customer_id` → check never fires. **Zero test breakage expected.**
- **CR-081 (pos_coupons.py)**: C-1 list endpoint returns `Coupon(**doc).model_dump()` — after schema change, `requires_customer` is included in the list response. Additive, no breaking change.
- **CR-081 C-3 create**: `CouponCreate` schema now includes `requires_customer`. POS can optionally send it; defaults to True if absent.
- **`record_coupon_usage_for_order`**: called with always-real `customer_id` — new requires_customer check never triggers.

---

## 6. Files WILL Change

| File | Edits | Risk |
|---|---|---|
| `models/schemas.py` | E1: `requires_customer` on `CouponCreate`. E2: on `CouponUpdate`. E3: on `Coupon`. E4: `customer_id` Optional on `POSCouponValidateRequest` | LOW |
| `core/coupon.py` | E5: `validate_coupon_for_customer` signature + requires_customer gate + specific_users guard. E6: `list_available_coupons` signature | **HIGH** |
| `routers/pos.py` | E7: `pos_available_coupons` `customer_id` query param Optional | LOW |
| `frontend/src/pages/CouponsPage.jsx` | E8: EMPTY_FORM + hydration + handleSubmit + toggle UI + Generic badge | LOW |

**Total: 8 edits across 4 files.**

## 7. Files WILL NOT Change

| File | Reason |
|---|---|
| `record_coupon_usage_for_order` | Always called with real customer_id at order commit |
| `routers/coupons.py` | CRM frontend endpoints — customer_id stays required there |
| `core/campaign_jobs.py` | Campaign sends always have a customer_id |
| `routers/campaigns.py` | Unchanged |
| `services/analytics_service.py` | Coupon analytics already groups by coupon_id — null customer_id rows count correctly |
| `routers/pos_coupons.py` (CR-081) | C-7 usage endpoint already handles null customer_id rows |

---

## 8. Downstream Consumers

| Consumer | Impact |
|---|---|
| Coupon analytics (`GET /api/analytics/coupons`) | ✅ None — counts by coupon_id, not customer_id |
| Campaign coupon targeting | ✅ None — campaigns target customers directly |
| WhatsApp `coupon_earned` event | ✅ None — only fires when customer exists (at order commit, customer always exists) |
| CRM Coupons page | ✅ Additive — new toggle, new badge. No existing UI broken |
| POS `/pos/coupons/available` callers | ⚠️ customer_id becomes optional. Existing callers sending customer_id continue to work. New callers can omit. |

---

## 9. Risk Items

### R1 — specific_users check BUG (HIGH priority fix)

Line 1815: `if specific and customer_id not in specific:` — when `customer_id=None`, `None not in [...]` is always `True`. Without this fix, any coupon with `specific_users` set AND `requires_customer=False` would incorrectly block anonymous orders.

**Fix (1 line)**: `if specific and customer_id and customer_id not in specific:`

This is an **existing latent bug** — it only matters now because `customer_id` can be None.

---

### R2 — validate_coupon_for_customer signature change cascades

Changing `customer_id: str` → `customer_id: Optional[str] = None` affects all 5 call sites. Only 3 need updating (the others always pass a real string). All confirmed safe.

---

### R3 — Pydantic `extra="ignore"` on Coupon model

`Coupon` model has `model_config = ConfigDict(extra="ignore")`. Adding `requires_customer: bool = True` to it is safe — existing docs without this field will use the default.

---

### R4 — `pos_available_coupons` signature change

Making `customer_id` an optional query param changes the API contract. Existing POS callers that pass `customer_id` still work. New callers can omit it. No breaking change.

---

## 10. Verification Matrix

| # | Test | How | Expected |
|---|---|---|---|
| V1 | Create coupon with `requires_customer=false` | `POST /api/coupons` with `requires_customer: false` | Coupon created, `requires_customer: false` in response |
| V2 | Create without `requires_customer` | `POST /api/coupons` (no field) | Defaults to `true` (backward compat) |
| V3 | Validate `requires_customer=false`, no customer_id | `POST /pos/coupons/validate` with code but no customer_id | `success=true`, discount computed |
| V4 | Validate `requires_customer=true`, no customer_id | Same, but coupon has `requires_customer=true` | `success=false`, `error.code=CUSTOMER_REQUIRED` |
| V5 | Available coupons without customer_id | `GET /pos/coupons/available?order_total=500` | Only `requires_customer=false` coupons returned |
| V6 | Available coupons with customer_id | `GET /pos/coupons/available?customer_id=X&order_total=500` | All eligible coupons (including `requires_customer=true`) returned |
| V7 | Existing coupon test suites | Run `pytest tests/test_cr001c_*.py tests/test_cr021_*.py` | 100% PASS — `requires_customer` default True, no customer_id=None in existing tests |
| V8 | Toggle in CRM UI | Open Coupons page → Create coupon → checkbox "Require customer" visible, checked by default | Toggle renders, `data-testid="requires-customer-toggle"` present |
| V9 | "Generic" badge on card | Create coupon with toggle unchecked | Coupon card shows "Generic" badge |
| V10 | Usage recorded for anonymous | `POST /pos/orders` with `requires_customer=false` coupon, no CRM customer pre-selected | `coupon_usage` doc created with real customer_id (from `_find_or_create_customer`) |
| V11 | Regression: validate with customer_id | `POST /pos/coupons/validate` with valid customer_id | Still works as before |

---

## 11. Owner Decisions Confirmed

All 8 decisions locked in intake. No open questions:
- `requires_customer: bool = True` (default True — backward compat)
- Global caps enforced for anonymous ✅
- per_user_limit skipped for anonymous ✅ (already guarded by existing `if customer_id` at line 1769)
- Usage always recorded at order time ✅ (record function unchanged)
- WhatsApp skipped for anonymous ✅ (no phone at validate time)
- CRM UI: toggle checkbox ✅

---

## 12. Impact Analysis Output

```
Planning complete: CR-082
Stage: Impact Analysis
Code reality: NONE (requires_customer field does not exist anywhere — confirmed)
Risk: HIGH (core/coupon.py CRITICAL hotspot)
Files WILL change: models/schemas.py (4 edits), core/coupon.py (2 edits), routers/pos.py (1 edit), CouponsPage.jsx (1 multi-part edit)
Files WILL NOT touch: record_coupon_usage_for_order, routers/coupons.py, campaigns, analytics
Owner decisions: all 8 locked
Key finding: specific_users check at line 1815 has latent bug with None customer_id — fix required as part of E5
Next: Implementation Plan → Owner Approval → Implementation
```
