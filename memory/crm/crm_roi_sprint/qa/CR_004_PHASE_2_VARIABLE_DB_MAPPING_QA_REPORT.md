# CR-004 — Phase 2 · Variable DB Mapping Layer — QA Report

**CR:** CR-004 WhatsApp Utility + Marketing Message Integration
**Phase:** P2 — Variable ↔ DB Schema Mapping Layer
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-28
**Status:** `cr004_phase_2_qa_passed`
**Test user:** `owner@kunafamahal.com` / `Qplazm@10` (R689 Kunafa Mahal)

---

## 1. QA Verdict

```
cr004_phase_2_qa_passed
```

All 14 scenarios passed. 19 unit tests all green. No product code changed by QA.

---

## 2. Backend QA (7 scenarios)

| # | Scenario | Result | Evidence |
|---|---|---|---|
| B1 | Variables endpoint includes `sources`, `fills_on_events`, `formatter` | PASS | All 8 required fields present per variable: `key, label, example, description, sources, fills_on_events, formatter, category`. No missing fields. |
| B2 | `resolve_variable("customer_name")` from customer doc | PASS | Unit test: `customer.name` → "John" (first in source chain) |
| B3 | `resolve_variable("points_earned")` from event | PASS | Unit test: `event.points_earned` resolves; falls back through `points → bonus_points → birthday_bonus` chain |
| B4 | `resolve_variable("tier")` from event `new_tier` | PASS | Unit test: `event.new_tier` takes priority over `customer.tier` |
| B5 | `resolve_variable("restaurant_name")` from brand | PASS | Unit test: `brand.restaurant_name` resolves. Without brand → empty string |
| B6 | `resolve_variable("amount")` currency formatted | PASS | Unit test: `event.amount=1500` → `"Rs.1,500"` |
| B7 | `field_aliases` removed | PASS | `grep field_aliases whatsapp.py` → only docstring reference ("Replaces the legacy field_aliases dict"). No functional code. |

### Variable Resolution Chain (verified via unit tests)

| Variable | Source Chain | Test Result |
|---|---|---|
| `customer_name` | `customer.name → customer.customer_name` | PASS |
| `points_balance` | `event.points_balance → event.balance_after → customer.total_points` | PASS |
| `points_earned` | `event.points_earned → event.points → event.bonus_points → ...` | PASS |
| `tier` | `event.new_tier → customer.tier → customer.membership_tier` | PASS |
| `restaurant_name` | `brand.restaurant_name` | PASS |
| `coupon_code` | `event.coupon_code` | PASS |
| `expiry_date` | `event.expiry_date` (date formatted → "31 Dec 2026") | PASS |
| `wallet_balance` | `event.wallet_balance → customer.wallet_balance` (currency) | PASS |
| `amount` | `event.amount → event.order_amount → ...` (currency) | PASS |

---

## 3. Frontend QA (3 scenarios)

| # | Scenario | Result | Evidence |
|---|---|---|---|
| F1 | Variable mapping shows enriched variables | PASS | Templates page shows mappings like `{{1}} → Customer Name`, `{{2}} → Previous Tier` — these are from the API-driven enriched list |
| F2 | Validator warnings on save (code verified) | PASS | `handleSaveVariableMapping` reads `res.data.warnings` and displays via `toast.warning()` |
| F3 | Brand data visible in preview | PASS | `restaurant_name` appears in sample data endpoint (`Kunafa Mahal`) |

---

## 4. Unit Test Suite

| File | Tests | Result |
|---|---|---|
| `test_whatsapp_resolver.py` | 19 | PASS (all 19) |

Tests cover: `resolve_variable` for all 10 original vars, `build_body_values` with resolver+brand, text mode regression, `fills_on` coverage for universal/coupon/expiry events, unknown variable handling.

---

## 5. Formatter Verification

| Formatter | Input | Expected Output | Result |
|---|---|---|---|
| `currency` | `1500` | `Rs.1,500` | PASS |
| `integer` | `1250` | `1,250` | PASS |
| `date` | `2026-12-31` | `31 Dec 2026` | PASS |
| `None` | `"John"` | `"John"` (passthrough) | PASS |

---

## 6. Scope Guard

| # | Check | Result |
|---|---|---|
| S1 | Enriched registry with sources/fills_on/formatter | PASS |
| S2 | Resolver replaces field_aliases | PASS |
| S3 | Brand data injection works | PASS |
| S4 | Validator warnings functional | PASS |
| S5 | P1 regression (text mode, legacy removal) | PASS |
| S6 | Product code changed by QA | NO |

---

## 7. Issues Found

None.

---

## 8. Status

```
cr004_phase_2_qa_passed
```

End of CR-004 Phase 2 QA.
