# CR-004 — Phase 2 · Variable ↔ DB Schema Mapping Layer — Implementation Report

**CR:** CR-004 WhatsApp Utility + Marketing Message Integration
**Phase:** P2 — Variable ↔ DB Schema Mapping Layer
**Sprint:** ROI Measurement Sprint
**Planned:** 2026-05-27 (Planning doc drafted)
**Implemented:** 2026-05-27 (code committed, report written retroactively)
**Status:** `cr004_phase_2_complete`

---

## 1. Summary

P2 bound each variable to its **source of truth** in the DB / event payload with a single resolver that replaced the brittle 6-entry `field_aliases` table. After P2, the answer to "where does `{{customer_name}}` come from?" is one lookup in a declarative registry.

---

## 2. Items Delivered

### Item 1 — Enriched Variable Registry

**File:** `backend/core/whatsapp_variables.py`

The P1 flat list (10 simple `{key, label, example, description}` dicts) was replaced with an enriched registry. Each variable now declares:

| New Field | Purpose | Example |
|---|---|---|
| `sources` | Ordered fallback resolution chain | `[{"from": "customer", "field": "name"}, {"from": "customer", "field": "customer_name"}]` |
| `fills_on_events` | Events that reliably populate this variable | `"*"` (always) or `["coupon_earned"]` (specific) |
| `formatter` | Output formatter | `None`, `"currency"`, `"integer"`, `"date"` |
| `category` | Variable grouping for UI | `"general"`, `"loyalty"`, `"wallet"`, `"coupon"`, etc. |

**Scopes supported in `sources`:**
- `"customer"` — from customer document (always available)
- `"event"` — from `event_data` dict (available only on specific events)
- `"brand"` — from `users` collection (always available via brand_data injection)

**Helper constants for DRY event coverage:**
```python
ALL_EVENTS = "*"
COUPON_EVENTS = ["coupon_earned"]
EXPIRY_EVENTS = ["points_expiring"]
ORDER_EVENTS = ["send_bill", "send_bill_auto", "send_bill_manual", "new_order_customer"]
FEEDBACK_EVENTS = ["feedback_received"]
```

**Utility functions added:**
- `VARIABLES_BY_KEY` — O(1) lookup dict built at import time
- `get_variable(key)` — returns registry entry or None
- `fills_on(var_key, event_key)` — returns True if variable reliably fills on the given event

### Item 2 — Resolver Function (replaces `field_aliases`)

**File:** `backend/core/whatsapp.py`

**New functions:**

| Function | Lines | Purpose |
|---|---|---|
| `_format_value(value, formatter)` | 205-229 | Applies `currency` (→ `Rs.1,500`), `integer` (→ `1,250`), or `date` (→ `31 Dec 2026`) formatting |
| `resolve_variable(var_key, customer, event_data, brand)` | 232-264 | Walks the `sources` chain for a variable; returns first non-empty value with formatting applied; handles `0` as valid for integer/currency |

**`build_body_values()` refactored (line 267-300):**
- Removed the inline `field_aliases` dict and `get_value()` inner function
- Now calls `resolve_variable()` per variable in `map` mode
- Accepts `brand_data` parameter (new)
- `text` mode (P1) still works — literal string returned

**`field_aliases` removal verified:**
```
grep -n "field_aliases" core/whatsapp.py → only in docstring "Replaces the legacy field_aliases dict"
```

### Item 3 — Brand (User) Data Injection + Validator Warnings

**3a — Brand data injection in `trigger_whatsapp_event()` (line 397-500):**

The trigger function now fetches the `users` document once per trigger call with expanded projection:
```python
user_doc = await db.users.find_one(
    {"id": user_id},
    {"_id": 0, "authkey_api_key": 1, "restaurant_name": 1,
     "einvoice_link": 1, "instagram_link": 1,
     "google_review_link": 1, "feedback_link": 1},
)
brand_data = {
    "restaurant_name": user_doc.get("restaurant_name", ""),
    "einvoice_link": user_doc.get("einvoice_link", ""),
    ...
}
```

This `brand_data` is passed to `build_body_values()` → `resolve_variable()`, so `restaurant_name` and link variables now resolve correctly (were always blank pre-P2).

**3b — Validator at `PUT /whatsapp/template-variable-map/{template_id}` (line 581-634):**

After saving the mapping, the endpoint cross-checks against existing event-template mappings:
```python
for em in event_mappings:
    event_key = em.get("event_key")
    for placeholder, var_key in clean_mappings.items():
        if modes.get(placeholder) == "text":
            continue  # text mode is always valid
        if not fills_on(var_key, event_key):
            warnings.append({...})
```

Response includes `"warnings": [...]` array. Non-blocking — save succeeds regardless.

Frontend in `WhatsAppAutomationContent.jsx:handleSaveVariableMapping` displays warnings as `toast.warning()`.

---

## 3. Variable Resolution — Before vs After

| Variable | Pre-P2 (field_aliases) | Post-P2 (registry resolver) |
|---|---|---|
| `customer_name` | ✅ `["name", "customer_name"]` | ✅ `customer.name → customer.customer_name` |
| `points_balance` | ✅ `["total_points", "points_balance", "points"]` | ✅ `event.points_balance → event.balance_after → customer.total_points` |
| `points_earned` | 🔴 No alias | ✅ `event.points_earned → event.points → event.bonus_points → event.birthday_bonus → event.anniversary_bonus → event.first_visit_bonus` |
| `points_redeemed` | 🔴 No alias | ✅ `event.points_redeemed → event.redeemed_points → customer.total_points_redeemed` |
| `wallet_balance` | ✅ `["wallet_balance", "wallet"]` | ✅ `event.wallet_balance → customer.wallet_balance` (currency formatted) |
| `amount` | 🔴 No alias | ✅ `event.amount → event.order_amount → event.bill_amount → event.discount → customer.total_spent` (currency formatted) |
| `tier` | ✅ `["tier", "membership_tier"]` | ✅ `event.new_tier → customer.tier → customer.membership_tier` (fixes tier_upgrade blank) |
| `restaurant_name` | 🔴 Never resolved | ✅ `brand.restaurant_name` (via brand_data injection) |
| `coupon_code` | 🔴 No alias | ✅ `event.coupon_code` |
| `expiry_date` | 🔴 No alias | ✅ `event.expiry_date` (date formatted) |

---

## 4. Files Changed

| File | Change Type | Details |
|---|---|---|
| `backend/core/whatsapp_variables.py` | REWRITTEN | P1 flat list → enriched registry with sources, fills_on_events, formatter, category |
| `backend/core/whatsapp.py` | MODIFIED | Added `_format_value`, `resolve_variable`; refactored `build_body_values` to use resolver + accept `brand_data`; enriched `trigger_whatsapp_event` with brand query |
| `backend/routers/whatsapp.py` | MODIFIED | `save_template_variable_mapping` now computes and returns `warnings` array; imports `fills_on` |
| `backend/routers/customers.py` | MODIFIED | `get_sample_customer_data` response aligned with enriched variable list (includes `restaurant_name` inside `sample` dict) |
| `frontend/src/components/shared/WhatsAppAutomationContent.jsx` | MODIFIED | `handleSaveVariableMapping` reads `res.data.warnings` and shows toasts |

---

## 5. Tests Added

| File | Tests | Status |
|---|---|---|
| `backend/tests/test_whatsapp_resolver.py` | 13 tests: resolve_variable for all 10 P2 vars, build_body_values with resolver+brand, text mode regression, fills_on coverage | ✅ All pass |

---

## 6. Acceptance Criteria Results

| # | Criterion | Result |
|---|---|---|
| AC-1 | Variables endpoint includes `sources`, `fills_on_events`, `formatter` | ✅ Pass |
| AC-2 | `points_earned` trigger fills from `event_data.points_earned` | ✅ Pass (unit test) |
| AC-3 | `tier_upgrade` trigger fills `tier` from `event_data.new_tier` | ✅ Pass (unit test) |
| AC-4 | `birthday` trigger fills `restaurant_name` from brand | ✅ Pass (unit test) |
| AC-5 | `coupon_earned` trigger fills `coupon_code` | ✅ Pass (unit test) |
| AC-6 | `points_expiring` fills `expiry_date` formatted | ✅ Pass (unit test) |
| AC-7 | `amount` resolves from `event_data.amount` | ✅ Pass (unit test) |
| AC-8 | Validator returns warnings for incompatible event/variable | ✅ Pass (code verified) |
| AC-9 | P1 regression: `customer_name` + `points_balance` still work | ✅ Pass (unit test) |
| AC-10 | `field_aliases` dict removed | ✅ Pass (`grep` → 0 matches, only docstring reference) |

---

## 7. Status

`cr004_phase_2_complete`
