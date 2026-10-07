# Closure — CR-084 + CR-097 (Wave 1 — Security cleanup)
**Date**: 2026-10-08 · **Role**: Closure Agent · **Owner smoke**: ✅ PASS ("its working" — login, profile menu shows only Logout)

## Gate trail
| Gate | Date | Evidence |
|---|---|---|
| Intake | 2026-09-15 (084) / 2026-10-08 (097) | `discovery/SESSION_2026_09_15_BATCH_INTAKE_CR084_CR090.md` · dashboard row 097 |
| Impact Analysis | 2026-10-08 | `planning/CR_084_CR_097_IMPACT_ANALYSIS.md` (incl. live probe §2.4) |
| Implementation Plan | 2026-10-08 | `planning/CR_084_CR_097_IMPLEMENTATION_PLAN.md` |
| Owner approval | 2026-10-08 | "go , follow gate" |
| Implementation + self-test | 2026-10-08 | 12/12 PASS · `handoff/SESSION_2026_10_08_HANDOVER_WAVE1_CR084_CR097_IMPL.md` |
| QA | 2026-10-08 | 15/15 BE · 18/18 FE · `/app/test_reports/iteration_1.json` · `backend/tests/test_cr084_cr097.py` |
| Owner smoke | 2026-10-08 | PASS |
| Regression | 2026-10-08 | Covered in QA V12/V12b (customers, coupons, profile, WA automation, POS customer-lookup) — no separate pass needed; HIGH-risk checklist satisfied |
| Closure | 2026-10-08 | this doc |

## Outcome
- 7 live routes → 404; two plaintext-OTP leaks closed (customer `dev_otp`, staff `otp`).
- CRM has no local password path left — MyGenie POS is the single credential owner.
- `CRM_EVENTS` 16 → 15 (`reset_password` gone).
- CR-029 "re-enable later" note retired. CR-090 closed OBSOLETE.

## Residuals (tracked, not blocking)
| Item | Where |
|---|---|
| Drop `customer_otps` (5 docs) / `otp_tokens` (0) | D-3 deferred → future hygiene CR |
| Tenant password rotation + secret scanning | SEC-P2-08 (pre-existing) |
| Change notice to Customer App / POS agents | `handoff/WAVE_CHANGE_LOG_FOR_SCAN_ORDER_AND_POS_AGENTS.md` rows CONFIRMED; send as part of consolidated contract after all waves (owner ruling) |

## Release
Not yet released to production — sits on preprod. Goes with the next release batch (RELEASE role, owner approval).
