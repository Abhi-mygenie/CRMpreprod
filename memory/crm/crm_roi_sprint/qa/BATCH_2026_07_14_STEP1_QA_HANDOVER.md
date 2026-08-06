# QA HANDOVER — BATCH 2026-07-14 · Step 1 (BUG-013 + BUG-014)

**Implemented:** 2026-07-14 · **Exit gate:** 7/7 (registry ✓, markers ✓, tests ✓, self-test ✓, QA handover ✓)
**Files changed:** `/app/backend/routers/customers.py` (import section only) · NEW `/app/backend/tests/test_bug013_014_import.py`
**Files NOT touched:** everything else (per plan scope-lock). Frontend unchanged.

## What shipped
1. **BUG-013**: single `bulk_write` replaces 345 sequential writes → 300-row import measured **2.18 s** (was 83-167 s / proxy timeout). In-file duplicate phones → HTTP 400 with row list at `/import-preview` AND `/import` (Q-A=c).
2. **BUG-014**: "WhatsApp Opt-in" column honoured (both header styles, Q-B=a): Yes/True/1 → opt-in, No/False/0 → opt-out, blank/junk → unchanged (D1). New imports default **True** (D2). Sample template now has `whatsapp_opt_in` 8th column (Q-C=a).

## Verification already executed
- Main-agent pytest: 21/21 PASS (`tests/test_bug013_014_import.py`)
- Independent testing_agent (iteration_18): 12/12 PASS, backend 100%, report `/app/test_reports/iteration_18.json`, suite `tests/test_bug013_014_iteration18.py`
- All synthetic data (9000001/9000002 phones + test import_logs) cleaned — 0 residuals on preprod DB.

## Owner smoke steps (blocking Step 2 per owner instruction)
1. Customers → Import → upload your real `testcustomer.xlsx` (345 rows) → should reach Step 3 result screen in seconds, NO Cloudflare error.
2. Export customers → change one customer's "WhatsApp Opt-in" from Yes to No in Excel → re-import → open that customer → opt-in toggle should be OFF.
3. Import → "Download sample template" → confirm `whatsapp_opt_in` column present.
4. (Optional) Duplicate check: put the same phone in 2 rows → import should be blocked with a clear duplicate message.

## Non-blocking hardening notes from QA review (register later if owner wants)
- `bulk_write` partial Mongo failures (unique-index conflicts) wouldn't increment the `failed` counter.
- Duplicate-phone 400 message caps at 10 listed phones.
- Header precedence: "WhatsApp Opt-in" wins over "whatsapp_opt_in" if a file has both.

## Next
Owner smoke PASS → proceed Step 2 (CR-063 detail-page opt-in toggle + badge) → owner smoke → Step 3 (CR-065 resend time).
