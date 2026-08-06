# CR-015 Day 3 — Implementation Report

**Date**: 2026-05-29
**Spec**: `planning/CR_015_DAY_3_FROZEN_SPEC.md`
**Status**: `cr015_day_3_partial_t7_waiting_owner_commit_approval`

---

## Summary

All Day 3 code work (T4, T6 backend, T6 frontend) is landed and validated. T7 scripts are created and dry-run is complete. T7 commit requires owner approval — not yet executed.

---

## Track Results

| Track | Status | Files changed | Validation |
|---|---|---|---|
| T4 | ✅ Complete | `routers/wallet.py`, `routers/points.py`, `core/loyalty.py` | 119/119 tests, lint clean |
| T6 backend | ✅ Complete | `routers/whatsapp.py` | 119/119 tests, lint clean, 5/5 curl smoke probes pass |
| T6 frontend | ✅ Complete | `WhatsAppAutomationContent.jsx` | Frontend compiles (1 pre-existing warning only) |
| T7 dry-run | ✅ Complete | `scripts/cr015_t7_cleanup_r689_template_25140.py`, `scripts/cr015_audit_unknown_var_keys.py` | Dry-run output matches expected; audit finds exactly 2 known issues |

---

## T4 Changes (4 callsite enrichments)

| Callsite | File | Keys added |
|---|---|---|
| wallet_credit | `routers/wallet.py:55` | `payment_method`, `transaction_id`, `description` |
| wallet_debit | `routers/wallet.py:77` | `payment_method`, `transaction_id`, `description`, `wallet_used` |
| bonus_points | `routers/points.py:133` | `bill_amount`, `description` |
| points_redeemed | `core/loyalty.py:455` | `order_id`, `order_total` |

All idempotency keys byte-identical to pre-T4.

---

## T6 Backend Changes

| Change | Location |
|---|---|
| Added `VARIABLES_BY_KEY` import | `routers/whatsapp.py:608` |
| Map-mode validation block (422 on unknown var_key) | Between coupon_pick validation and DB write |
| Text-mode suspicious value warnings | In warnings computation block, before `fills_on` check |

### Smoke probe results

| # | Test | Result |
|---|---|---|
| 1 | Invalid var_key → 422 | ✅ PASS |
| 2 | Valid var_key → 200 | ✅ PASS |
| 3 | Text-mode suspicious → 200 with warning | ✅ PASS |
| 4 | Multiple invalid → 422 with 2 errors | ✅ PASS |
| 5 | Text mode bypasses validation → 200 | ✅ PASS |

---

## T6 Frontend Changes

| Change | Location |
|---|---|
| Added `variableMappingErrors` state | After line 269 |
| 422 error parsing in save handler catch | Lines 700-708 |
| Clear errors on modal open | `openVariableMappingModal` |
| Clear errors on modal close/cancel | Cancel button handler |
| Per-row error display in mapping modal | Inside variable `.map()` loop |
| "Sent literally" hint below Custom Text input | Below text `<Input>` component |

---

## T7 Status

### Audit script output
```
Documents scanned: 4
Unknown map-mode var_keys: 0
Suspicious text-mode values: 2
  [pos_0001_restaurant_689] template 25140 {{4}} = 'payment method missing '
  [pos_0001_restaurant_689] template 25140 {{5}} = 'order dare missing '
```

### Dry-run output
```
DIFF:
  {{4}}: 'payment method missing ' -> 'payment_method'  mode: text -> map
  {{5}}: 'order dare missing ' -> 'order_date'  mode: text -> map
  {{7}}: 'points_earned' -> 'points_balance'
```

**Owner action required**: Review dry-run output above. Say "commit" to apply T7 cleanup.

---

## Files Changed

| File | Track | Change type |
|---|---|---|
| `/app/backend/routers/wallet.py` | T4 | Edit (+7 LoC) |
| `/app/backend/routers/points.py` | T4 | Edit (+3 LoC) |
| `/app/backend/core/loyalty.py` | T4 | Edit (+3 LoC) |
| `/app/backend/routers/whatsapp.py` | T6 | Edit (+30 LoC) |
| `/app/frontend/src/components/shared/WhatsAppAutomationContent.jsx` | T6 | Edit (+25 LoC) |
| `/app/backend/scripts/cr015_t7_cleanup_r689_template_25140.py` | T7 | NEW (+115 LoC) |
| `/app/backend/scripts/cr015_audit_unknown_var_keys.py` | T7 | NEW (+95 LoC) |

---

## Scope Guard

- Day 4 started: **NO**
- T2 DB normalization started: **NO**
- Live integration closure started: **NO**
- Out-of-spec files changed: **NO**

---

**End of Day 3 implementation report.**
