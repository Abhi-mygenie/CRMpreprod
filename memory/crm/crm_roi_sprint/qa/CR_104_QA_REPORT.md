# CR-104 QA Report — Feedback Bonus Award

**Date:** 2026-02-  
**Iteration:** 12  
**Severity Scale:** BLOCKER / MAJOR / MINOR / NOTE

---

## Summary

CR-104 adds a feedback bonus award on the token path only (Q1=a), awarded once per customer per restaurant (Q2=c). Implementation: ~20 lines in `scan.py:817-849`.

**Overall result: ALL PASS (6/6 CR-104 + 15/15 CR-096 regression)**

---

## Test Matrix

| ID | Description | Expected | Result |
|----|-------------|----------|--------|
| V1 | Fresh token feedback → +50 pts bonus, txn created | PASS | ✅ PASS |
| V2 | Second token feedback → no re-award, txn count stays 1 | PASS | ✅ PASS |
| V3 | Anonymous (no token) → no bonus | PASS | ✅ PASS |
| V4 | Phone-path (no token) → no bonus | PASS | ✅ PASS |
| V5 | r719 loyalty_enabled=False → no bonus | PASS | ✅ PASS |
| V6 | feedback_bonus_enabled guard → no bonus for r719 | PASS | ✅ PASS |
| V7 | CR-096 regression (15 tests) | 15/15 PASS | ✅ 15/15 PASS |

---

## Implementation Review

Guards verified in order (scan.py:817-849):
1. `identity_source == "token"` — phone/anonymous paths excluded ✅
2. `settings.get("loyalty_enabled")` — r719 excluded ✅  
3. `settings.get("feedback_bonus_enabled")` — guard present ✅
4. `(settings.get("feedback_bonus_points") or 0) > 0` — zero-point guard ✅
5. `already_awarded` idempotency check (user_id + customer_id + description) ✅

---

## Issues

None. No BLOCKER, MAJOR, or MINOR issues found.

---

## Notes

- Customer `9838777712` (r689) now has 1 Feedback bonus txn (50 pts). Use a different phone for fresh V1 tests in future.
- Combined suite run: V1 predictably fails on second run (bonus already awarded — by design). FK2 rate-limit bucket pollution when phone paths run in quick succession — run suites independently.
- r689 loyalty settings confirmed: `loyalty_enabled=True`, `feedback_bonus_enabled=True`, `feedback_bonus_points=50`.
- r719 loyalty settings confirmed: `loyalty_enabled=False`.
