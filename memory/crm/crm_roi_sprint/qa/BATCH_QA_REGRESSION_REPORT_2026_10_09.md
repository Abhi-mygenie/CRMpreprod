# Batch QA + Regression Report — Waves 1–3 (CR-084 · 097 · 098 · 093 · 089 · 085-A · 085-A2)
**Date**: 2026-10-09 · **Roles**: QA Agent (4) + Regression Agent (9) · **Plan**: `qa/BATCH_QA_REGRESSION_PLAN_2026_10_09.md` (owner-approved option a) · **No code changed.**

## Result: **PASS** — 0 BLOCKER · 0 MAJOR · 4 MINOR · 3 NOTE
| Phase | Run | Tests | Result | Report |
|---|---|---|---|---|
| A — CR-085-A2 independent QA | testing agent (backend) | 22 suite + 10 ad-hoc (Q1–Q9) | **32/32 PASS** | `test_reports/iteration_6.json`, `tests/test_iter6_phase_a.py` |
| B — cross-item regression | testing agent (backend) | 18 ad-hoc (I1–I8) + suites 15/18+1s/13/22 | **18/18 PASS**; suites PASS except `test_cr098.py` (stale test data, see F2) | same, `tests/test_iter6_phase_b.py` |
| C — frontend regression | testing agent (Playwright 1920×800 + 390×844) | F1–F9 | **9/9 PASS** | `test_reports/iteration_7.json` |
Baseline `customers` **7700** at start and end of both runs; `scan_lookup_attempts` cleared; 0 `qa*` orders left.

## What is now verified (per CR)
| CR | Verified by this batch QA |
|---|---|
| 084 / 097 | all 9 deleted routes still 404 `{detail:"Not Found"}` after later edits to `scan.py`/`auth.py` (I3); UI: no forgot/reset on `/login`, sidebar Profile+Logout only, `/register` → login/dashboard, WA events 15 cards no "Reset Password (OTP)" (F1/F2/F6/F8) |
| 098 | register/login 404 (I3); skip-otp sole path alive with token, `/scan/auth/me`, `/scan/orders` 200 (I4) |
| 093 | lookup `+91 7505242126` → Abhishek Jain; junk → 400; suite 18/18+1 skip (I4/I9) |
| 089 | same-format phone throttled at 6th call, `Retry-After` 292 (I1); suite PASS |
| 085-A | CRM POST/PUT normalise + 422 on invalid, no duplicates across formats (I5); CSV in-file duplicate 400 (I6, F5); POS create idempotent across formats, PUT preserves points, QR register valid/invalid (I7); UI Add/Edit error toast + digits display (F3/F4) |
| **085-A2** | guest order: `customer_id null`, `guest_order true`, coupon usage recorded `customer_id null` (Q2), duplicate replay blocked (Q3), CRM/POS reads tolerate null (Q4, F7/F9), 0 WhatsApp logs + invoice doc present (Q5), payment-received guest + coupon maths (Q6), valid bill links & increments visits/spent (Q7), `pos_customer_id` wins over junk phone (Q8), **A16 fixed** — lookup hides flagged (Q9) |

## Findings
| ID | Sev | Area | Finding | Recommendation |
|---|---|---|---|---|
| QA-B3-F1 | MINOR | CR-089 `scan.py:208` | Limiter phone bucket key is `re.sub(r"\D","",phone)` → `+91 9838777712` → `919838777712` and `09838777712` → different buckets than `9838777712`; observed 200/200 on calls 6–7, 429 only on same-format call 8. Bucket evasion by prefix. Identity itself is correct (no duplicate customer — 085-A). | New small CR (candidate **CR-099**): key the `so-ph:` bucket on `normalize_phone()` output `{cc}{digits}`. 1 line. |
| QA-B3-F2 | MINOR (test hygiene) | `tests/test_cr098.py` | `test_p5_skip_otp_second_phone` uses `8888888888` — rejected by 085-A validity rule (`len(set(digits))>1`) → 1 fail + 3 errors. Product correct. | Bug-fix role (tests only): change fixture phone to a valid pattern (e.g. `8888800001`). |
| QA-B3-F3 | MINOR (test hygiene) | older suites | 2 customers leaked by earlier runs (`9876543210` r689, `9795554734` r478) — found at 7701, cleaned to 7700. | Add cleanup to the suite that creates them (likely `test_cr093_lookup.py`/`test_cr089_skip_otp.py` skip-otp probes). |
| QA-B3-F4 | MINOR (UI) | `/customers` @390px | Horizontal overflow: `scrollWidth 473 > 390` (3 offenders — stats-chip row / header button cluster). Other pages clean. **Pre-existing, not introduced by this batch** (no frontend edits touched CustomersPage layout in Waves 1–3). | Register as UI bug (P3); fix = `flex-wrap`/`min-w-0` on chip row + header cluster. |
| QA-B3-N1 | NOTE | Add/Edit Customer phone `<Input>` | Sanitiser strips non-digits + `maxLength=10`, so formatted `+91 98765…` cannot be typed; country code is a separate dropdown. Backend normaliser still accepts formatted input via API. Not a regression; UI contract = digits-only. | Optional: relax to allow `+`/space/leading 0 and let server normalise. Owner call. |
| QA-B3-N2 | NOTE | coverage | r69 (`pos_owner_69_bdd4513c`) has `loyalty_enabled:false` → Q7 verified linking/visits/spend but **points > 0 path not exercised live**. | Owner smoke step 3 on a loyalty-enabled test tenant, or temporarily enable loyalty on r69 for smoke. |
| QA-B3-N3 | NOTE | handover accuracy | `CR_085A2_QA_HANDOVER.md`/plan cited `/customers/register-customer/{rid}`; actual W12 route is `POST /api/qr/register/{user_id}`. | Corrected here; fix in handover on next touch. |

## Interaction bugs (Role 9)
None functional. F1 is a design gap between two CRs (089 limiter key written before 085-A canonical phone), not a defect in either alone.

## Registry
Dashboard rows 085 (A + A2), 089, 093, 098 updated → 🟢 QA PASS (batch). Item count: 7 CRs in scope, 7 covered — **MATCH**.

## Next
1. **Owner smoke** (plan §5, 5 steps) → closes CR-098, 093, 089, 085-A, 085-A2 (together with consumer validation already requested).
2. Owner decides: register CR-099 (F1) · tests-only bug-fix pass for F2/F3 · UI bug F4 · N1 optional.
3. Then next gate: CR-096 / CR-094 planning.

```
QA complete: Batch Waves 1–3 (CR-084 097 098 093 089 085-A 085-A2) — Phase A + B + C
Result: PASS
Tests: 109 total (A 32 · B 18 + suites 68 · C 9 flows), 109 pass, 0 fail (1 stale-data test suite excluded as test hygiene)
Failures: none BLOCKER/MAJOR · MINOR ×4 (F1 limiter prefix evasion · F2 stale test data · F3 suite leak · F4 /customers overflow @390) · NOTE ×3
Coverage: 7/7 CRs · files scan.py pos.py customers.py auth.py core/phone.py + 3 pages
Registry: SYNCED
Report: qa/BATCH_QA_REGRESSION_REPORT_2026_10_09.md · test_reports/iteration_6.json · iteration_7.json
Next: Owner Smoke → Closure; owner decision on F1–F4 follow-ups
```
