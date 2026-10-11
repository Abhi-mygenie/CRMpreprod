# QA Handover + Report — BUG-025 · BUG-026 · BUG-027 · BUG-029 · CR-102 (bundled, `scan.py`)
**Date**: 2026-10-09 · **Implementation Agent** · Plans: `planning/BUG_025_BUG_026_IMPACT_AND_IMPL_PLAN.md`, `BUG_029_IMPACT_AND_IMPL_PLAN.md`, `CR_102_IMPACT_AND_IMPL_PLAN.md` (owner-approved; Q1 A, Q2 yes, Q3 yes, Q-A yes, Q-B yes, CR-102 Option A)

## Changes
`routers/scan.py` (one file):
- **CR-102** `SkipOTPRequest.country_code: Optional[str] = "+91"`; `normalize_phone(req.phone, req.country_code)`.
- **BUG-025** skip-otp order: `so-ip` bucket → normalise → 400 → `so-ph:{rid}:{cc}{digits}` bucket (canonical). `re` call removed (import kept, `noqa`).
- **BUG-029** lookup order: `ip` bucket → normalise → 400 → `ph` bucket (key already canonical). Limits/messages/`Retry-After` unchanged on both.
Tests: `test_cr089_skip_otp.py` +S4c/S4d/C102a/C102b/C102d, S6 regex canonical; `test_cr093_lookup.py` +L11a/L11b; **BUG-026/027** `test_cr098.py` (fixtures → `9838777712`@689, +p5b password-holders 400 by design, +zz count) and `test_cr084_cr097.py` (v5a phone swap).

## Self-test (suites one at a time, limiter cleared between)
089 **20+1s** · 098 **15** · 084/097 **15** · 093 **20+1s** · 085a **22** · phone **13** — all PASS. Baseline 7705 → 7705.

## Independent QA — `test_reports/iteration_8.json` — **PASS**
| Q | Check | Result |
|---|---|---|
| Q1 | 5 plain → 200; `+91 …`, `0…`, spaced → **429/429/429**; Mongo key `so-ph:pos_0001_restaurant_689:+917897180051` ×5, no digits-only key | ✅ |
| Q2 | invalid phone → 400, `so-ip` row written, no `so-ph` row | ✅ |
| Q3 | 30 valid from one IP → 200; 31st **invalid** → 429 (IP bucket precedes validation) | ✅ |
| Q4 | cc omitted / `+91` explicit → same customer, no create | ✅ |
| Q5 | `+61 412345678` → created with `+61`, idempotent, `/me` phone correct, `+91` same digits → 400, `abc` cc → 400; doc cleaned | ✅ |
| Q6 | lookup invalid → 400 + `ip` row; 11th invalid from same IP → 429 | ✅ |
| Q7 | lookup `MYGENieT` regression, never creates, phone bucket 429 on 6th | ✅ |
| Q8 | spaced skip-otp, `/me`, `/orders`, 422 empty, 4 deleted routes 404 | ✅ |
| Q9 | all 6 suites: **105 pass / 2 skip** | ✅ |
| Q10 | baseline 7705 start = end; no stray `+61` doc; limiter cleared | ✅ |
Findings: none. QA artefacts: `tests/test_iter8_bug025_cr102_bug029.py`, `/app/run_iter8_q9.sh`.

## Consumer note (Customer App) — informational, no change required
skip-otp now **honours** `country_code` (default `+91`) — keep sending it. Prefixed phone variants now share one rate-limit bucket. Lookup counts invalid-phone requests against the IP limit. Contract **v1.1 additive note**: `POST /scan/auth/skip-otp` request `{phone, restaurant_id, country_code?="+91"}`.

## Rollback
Single commit, code + tests only, `git revert`; limiter keys age out via TTL (≤5 min).

```
Code complete: BUG-025 · BUG-026 · BUG-027 · BUG-029 · CR-102
Risk: LOW
Self-test: 6 suites PASS (105+2s)
Independent QA: iteration_8 PASS (10/10 + 105/105)
Build/compile: PASS (ruff clean, /api/health 200)
Registry sync: YES
Exit Gate: 7/7 PASS
Next: owner smoke (prefixed-phone 429; +91 explicit login) → Closure
```
