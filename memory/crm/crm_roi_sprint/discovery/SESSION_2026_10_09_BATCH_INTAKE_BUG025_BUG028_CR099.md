# Batch Intake — Bugs from Batch QA + Regression 2026-10-09 (BUG-025 → BUG-028 · CR-099 · ENV-001)
**Date**: 2026-10-09 · **Role**: Intake Agent (Role 1) · **Source**: `qa/BATCH_QA_REGRESSION_REPORT_2026_10_09.md` (findings QA-B3-F1…F4, N1…N3), `test_reports/iteration_6.json`, `iteration_7.json` · **No code changed.**

| ID | Class | Severity | Risk | Dup check | Evidence | Blast radius | Status |
|---|---|---|---|---|---|---|---|
| **BUG-025** | BUG (security / abuse gap in CR-089) | **P2** | LOW | DISTINCT (not in CR-089 IA; 085-A IA mentions limiter only for identity) | captured | SMALL | 📋 REGISTERED |
| **BUG-026** | BUG (test hygiene) | P3 | LOW | DISTINCT | captured | SMALL | 📋 REGISTERED |
| **BUG-027** | BUG (test hygiene) | P3 | LOW | RELATED to BUG-026 (same suites) | captured | SMALL | 📋 REGISTERED |
| **BUG-028** | BUG (UI, pre-existing) | P3 | LOW | DISTINCT (no prior UI-overflow item on `/customers`) | captured | SMALL | 📋 REGISTERED |
| **CR-099** | CR (UX) | P3 | LOW | RELATED to CR-085 (UI side of canonical phone) | captured | SMALL | 📋 REGISTERED — **owner decision pending** (do / don't) |
| **ENV-001** | ENVIRONMENT (test coverage) | P3 | — | DISTINCT | captured | — | 📋 REGISTERED |
| N3 | doc correction | — | — | — | — | — | ✅ fixed in this intake (handover text) |

---

## BUG-025 — skip-otp rate-limit phone bucket can be evaded with `+91` / leading-`0` prefixes
**Where**: `routers/scan.py:208` (`phone_key = re.sub(r"\D", "", req.phone)`), CR-089.
**Symptom**: 5× `9838777712` → 200; 6th `+91 9838777712` → **200** (expected 429); 7th `09838777712` → **200**; 8th plain → 429 `Retry-After 292`. Bucket keys become `so-ph:…:919838777712` / `…:09838777712` / `…:9838777712` — three buckets for one diner.
**Root cause**: CR-089 keyed the bucket on digits-only *before* CR-085-A introduced `normalize_phone()`; the identity match was later canonicalised but the limiter key was not.
**Impact**: a caller can exceed the 5-per-5-min per-phone limit ~3× by rotating prefixes (IP bucket 30/min still applies). No data impact — identity match is canonical, no duplicate customer created (verified).
**Fix sketch (Planning)**: key on canonical output: `_ph, _cc, _ = normalize_phone(req.phone, req.country_code)`; `phone_key = f"{_cc}{_ph}"`. 1 line + 1 test. Not a §14 file.
**Severity**: P2 (workaround: IP limit still caps; limited abuse value) · **Risk** LOW · **Blast** SMALL (skip-otp only).
**Owner Q**: none — approve Planning.

## BUG-026 — `tests/test_cr098.py` uses phone `8888888888`, now invalid under canonical rule
**Where**: `tests/test_cr098.py:79` (`test_p5_skip_otp_second_phone`, `restaurant_id: test_restaurant`).
**Symptom**: 1 FAIL + 3 ERRORS when the suite runs; skip-otp returns 400 "Enter a valid mobile number" because `len(set(digits)) > 1` rule (CR-085-A) rejects all-same-digit numbers.
**Root cause**: stale fixture, product correct.
**Fix sketch**: use a valid pattern (`8888800001`) and add cleanup of the created customer. Tests only.
**Severity** P3 · **Risk** LOW · **Blast** SMALL (CI noise only).

## BUG-027 — QA suites create customers via skip-otp without cleanup
**Where**: `tests/test_cr098.py:122` and `tests/test_cr084_cr097.py:64` call skip-otp `9876543210` r689 (find-or-**create**) and never delete; `9795554734` r478 origin unknown (ad-hoc probe).
**Symptom**: baseline drifted 7700 → 7701 between iteration_6 start and the previous run; QA deleted 2 leaked docs.
**Fix sketch**: use an existing r689 phone (`9838777712`) or delete created doc in teardown; add `ZZ_cleanup` asserting count unchanged (pattern from `test_cr085a_normalization.py`). Tests only.
**Severity** P3 · **Risk** LOW · **Blast** SMALL.

## BUG-028 — `/customers` horizontal overflow at 390 px
**Where**: `frontend/src/pages/CustomersPage.jsx` — header stats chips (`Total: …` ~L919, Bronze/Silver/Gold) and Sync/Export/Import/Add button cluster.
**Symptom**: `document.body.scrollWidth 473 > clientWidth 390`, 3 offending elements; `/coupons`, `/profile`, `/dashboard` clean.
**Root cause**: fixed-width / non-wrapping flex rows on mobile. **Pre-existing** — no Wave 1–3 edit touched this layout.
**Fix sketch**: `flex-wrap` + `min-w-0` / `overflow-x-hidden` on the two rows; verify at 390×844.
**Severity** P3 · **Risk** LOW · **Blast** SMALL (mobile CRM users).

## CR-099 — Allow formatted phone input in CRM Add/Edit Customer (let server normalise)
**Where**: `CustomersPage.jsx:1910` (Add) and `:2447` (Edit): `onChange … replace(/\D/g,'')` + `maxLength=10`; country code separate dropdown.
**Today**: user cannot paste `+91 98765 43955` or `0 98765 43955`; digits-only + dropdown works and stores correctly. Backend (`core/phone.py`) already accepts formatted input via API.
**Proposal**: (a) relax sanitiser to allow `+`, space, `-`, leading 0 and raise `maxLength`, show the server-normalised value after save; or (b) keep digits-only contract and close as WONTFIX.
**Severity** P3 · **Risk** LOW · **Blast** SMALL. **Owner decision required: (a) or (b).**

## ENV-001 — Test tenant r69 has `loyalty_enabled:false` → points>0 path not exercised live
**Where**: `loyalty_settings` for `pos_owner_69_bdd4513c`.
**Impact**: addendum §6.1 minimum regression "points calculated correctly" was verified only structurally (visits/spend/link) in iteration_6 Q7.
**Action**: owner smoke step 3 on a loyalty-enabled test tenant, **or** enable loyalty on r69 for QA (owner decision; no production tenant touched).

## N3 — handover path corrected
`qa/CR_085A2_QA_HANDOVER.md` / plan cited `/customers/register-customer/{rid}`; actual W12 route is `POST /api/qr/register/{user_id}`. Corrected in the handover.

---

## Also recorded (not new items)
- Legacy ghost `Customer ` with `phone:""` (id `388c4f46…`, 34 visits, r69, 2026-08-13) → row for the **CR-085-B** per-restaurant correction report (G3 evidence).

## Recommended sequence
BUG-025 (P2, 1 line) → BUG-026 + BUG-027 together (tests-only pass) → BUG-028 (UI) → CR-099 after owner decision → ENV-001 before owner smoke.

```
Intake complete: BUG-025 · BUG-026 · BUG-027 · BUG-028 · CR-099 · ENV-001
Classification: BUG ×4 · CR ×1 · ENVIRONMENT ×1
Severity: P2 ×1 (BUG-025) · P3 ×5
Risk: LOW (all)
Duplicate check: DISTINCT ×4 · RELATED ×2 (027↔026, 099↔085)
Evidence: captured (iteration_6/7 + report)
Blast radius: SMALL (all)
Docs updated: discovery/SESSION_2026_10_09_BATCH_INTAKE_BUG025_BUG028_CR099.md · BUG_REGISTRY_CAMPAIGNS.md · 00_register/ROI_MEASUREMENT_CR_REGISTER.md · CR_STATUS_DASHBOARD.md · PRD.md · qa/CR_085A2_QA_HANDOVER.md (N3)
Next: Planning (BUG-025 first) · owner decision CR-099 (a/b) + ENV-001
```
