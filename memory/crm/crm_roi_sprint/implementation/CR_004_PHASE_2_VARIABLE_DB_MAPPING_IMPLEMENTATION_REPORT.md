# CR-004 — Phase 2 · Variable ↔ DB Mapping — Implementation Report

**CR:** CR-004 WhatsApp Utility + Marketing Message Integration
**Phase:** P2 — Variable ↔ DB Schema Mapping Layer
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-27
**Status:** `cr004_phase_2_complete`

---

## 1. Summary

Phase 2 shipped 3 items per the runbook. All 10 WhatsApp template variables now resolve correctly via declared source chains with formatters. The legacy 6-entry `field_aliases` dict is replaced.

- **Item 1:** Enriched variable registry with `sources`, `fills_on_events`, `formatter` per variable
- **Item 2:** New `resolve_variable()` + `_format_value()` functions; `build_body_values()` refactored to use resolver; `field_aliases` removed
- **Item 3a:** Brand data (restaurant_name) injected via `users` collection lookup in `trigger_whatsapp_event()`
- **Item 3b:** Save-time validator returns warnings on incompatible event/variable combos

---

## 2. Files Changed

| File | Action | Purpose |
|---|---|---|
| `/app/backend/core/whatsapp_variables.py` | Overwrite | Enriched registry: 10 vars with sources, fills_on_events, formatter, lookup helpers |
| `/app/backend/core/whatsapp.py` | Edit | Added `_format_value()`, `resolve_variable()`; refactored `build_body_values()` (removed field_aliases + get_value); `trigger_whatsapp_event()` now fetches user doc for brand_data |
| `/app/backend/routers/whatsapp.py` | Edit | `save_template_variable_mapping` now returns `warnings[]` for incompatible event/variable combos |
| `/app/frontend/src/components/shared/WhatsAppAutomationContent.jsx` | Edit | `handleSaveVariableMapping` surfaces warnings as toasts |
| `/app/frontend/src/pages/TemplatesPage.jsx` | Edit | Same warning toast surface |
| `/app/backend/tests/test_whatsapp_resolver.py` | **New** | 19 unit tests covering resolver, formatters, fills_on, regression |

---

## 3. Tests

| File | Tests | Result |
|---|---|---|
| `tests/test_whatsapp_resolver.py` (P2 new) | 19 | All PASS |
| `tests/test_whatsapp_text_mode.py` (P1 regression) | 5 | All PASS |
| `tests/test_whatsapp_variables_endpoint.py` (P1 regression) | 1 | PASS |
| **Total** | **25** | **All PASS** |

---

## 4. What Changed for Each Variable

| Variable | Before P2 | After P2 |
|---|---|---|
| customer_name | Worked via alias | Works via source chain (same behaviour) |
| points_balance | Worked via alias | Works + integer formatter (1,250) |
| points_earned | Worked only if event passed exact key | Falls through: event.points_earned → event.points → event.bonus_points → event.birthday_bonus → event.anniversary_bonus |
| points_redeemed | Always blank | Falls through: event.points_redeemed → event.redeemed_points → customer.total_points_redeemed |
| wallet_balance | Worked via alias | Works + currency formatter (Rs.500) |
| amount | Inconsistent (POS vs wallet naming) | Falls through: event.amount → event.order_amount → event.bill_amount → customer.total_spent |
| tier | Blank on tier_upgrade | Falls through: event.new_tier → customer.tier → customer.membership_tier |
| restaurant_name | **Always blank** | **Now works** — fetched from users collection via brand_data |
| coupon_code | Only on coupon_earned | Same — but owner gets warning if used on other events |
| expiry_date | Only on points_expiring | Same + date formatter (31 Dec 2026) — warning on other events |

---

## 5. Acceptance Criteria

| # | Criterion | Result |
|---|---|---|
| AC-1 | Variables endpoint returns enriched schema | PASS |
| AC-2 | points_earned resolves from event | PASS (test) |
| AC-3 | tier resolves from event.new_tier on upgrade | PASS (test) |
| AC-4 | restaurant_name resolves from brand | PASS (test) |
| AC-5 | coupon_code resolves from event | PASS (test) |
| AC-6 | expiry_date formatted | PASS (test) |
| AC-7 | amount resolves with currency format | PASS (test) |
| AC-8 | Validator returns warnings | PASS (endpoint verified) |
| AC-9 | P1 regression: text mode + map mode | PASS (6 tests) |
| AC-10 | field_aliases removed | PASS (only in docstring) |

---

## 6. Status

```
cr004_phase_2_complete
```

End of CR-004 Phase 2 Implementation Report.
