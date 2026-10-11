# QA Handover — CR-100: tolerant `phone_match` for legacy `country_code: null / ""`
**Date**: 2026-10-09 · **From**: Implementation Agent · **To**: QA Agent
**Plan**: `planning/CR_100_IMPLEMENTATION_PLAN.md` · **IA**: `planning/CR_100_IMPACT_ANALYSIS.md` · **Risk**: MEDIUM (§14 identity rule; 2 files, ~4 lines total; 63 dormant docs)
**Creds**: `owner@kunafamahal.com / Qplazm@10` · **URL**: `REACT_APP_BACKEND_URL` in `/app/frontend/.env` · **Fixture**: r689 Kunafa Mahal (4 real null-cc docs) · test phone `8700000001` (synthetic, verified absent)

---

## What changed (2 source files + 1 test file, markers `# CR-100`)

| File | Change |
|---|---|
| `backend/core/phone.py:36-43` | `phone_match()` now returns `country_code: {"$in": ["+91", None, ""]}` when `cc == "+91"`. Foreign cc stays exact. All 11 other channels that call `phone_match()` get the fix automatically. |
| `backend/routers/scan.py:324` | `lookup_customer` migrated from inline dict to `{**phone_match(...), "is_blocked": …, "phone_invalid": …}`. The only inline dict that bypassed the helper. |
| `backend/tests/test_cr100_tolerant_match.py` | New — 8 tests V1–VZZ |

**Not touched**: `routers/pos.py` · `routers/customers.py` · `routers/feedback.py` · `models/schemas.py` · `server.py` · frontend · stored data

---

## Why this matters
63 legacy customer docs (r635: 49, r689: 4, + 10 with `country_code: ""`) were written by the old importer without a `country_code`. Every time one of those diners logs in or orders, the old exact match found nothing and silently created a duplicate with zero history. This change stops the bleed without writing any data.

---

## Self-test — 8/8 PASS (`pytest tests/test_cr100_tolerant_match.py -v -n 0`)

| # | Test | Result |
|---|---|---|
| V1 | skip-otp with null-cc phone → `is_new_customer:false`, count unchanged | ✅ |
| V2 | POS `customer-lookup` same phone → `registered:true` | ✅ |
| V3 | Direct tolerant DB query `{$in: ["+91", null, ""]}` finds the null-cc doc | ✅ |
| V4 | CRM `POST /customers` same phone → no duplicate (count unchanged) | ✅ |
| V5 | `/scan/auth/lookup` same phone → `exists:true` | ✅ |
| V6 | Same phone with `country_code:"+61"` → `exists:false` (no false cross-cc match) | ✅ |
| V7 | `explain()` on tolerant query → IXSCAN on `idx_customers_user_phone` | ✅ |
| VZZ | Cleanup: test doc deleted; r689 null-cc count still 4 (no data written) | ✅ |

Regression note: `test_S4b_phone_key_normalisation` in `test_cr089_skip_otp.py` fails when run immediately after `test_cr085a_normalization.py` in the same pytest invocation — phone bucket for `9838777712` is pre-filled by cr085a's skip-otp calls. This is a **pre-existing test-ordering sensitivity**, not a CR-100 defect. Run `test_cr089_skip_otp.py` alone to confirm it passes (it did in iteration_9).

---

## QA asks
1. Re-run `tests/test_cr100_tolerant_match.py -n 0` independently. Command:
   `cd /app/backend && REACT_APP_BACKEND_URL=... CRM_TEST_OWNER_PASSWORD=Qplazm@10 pytest tests/test_cr100_tolerant_match.py -v -n 0`
2. Ad-hoc: (a) run `test_cr085a_normalization.py` — confirm it still passes (all call sites fixed) · (b) `GET /scan/auth/lookup` with `phone=8700000001 country_code=+91` on r689 before the test inserts the doc → `exists:false`; after insert → `exists:true`; after VZZ cleanup → `exists:false` again · (c) confirm r689 `country_code:null` count is still 4 after the run (no accidental data writes).
3. Severity scale per prompt §8 Role 4. Report → `qa/CR_100_QA_REPORT.md` + `test_reports/iteration_10.json`.
