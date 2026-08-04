# CR-014: E-Invoice PDF + Mobile HTML Link — QA Report

## CR: CR-014 | Date: 2026-06-18 | Agent: testing_agent_v3 Run 2

### Result: ✅ PASS (18/18)

| # | AC | Test | Result |
|---|---|---|---|
| 1 | AC1 | Profile fields persist (GSTIN/PAN/FSSAI) — PUT /profile → GET /me | ✅ PASS |
| 2 | AC2 | GSTIN regex rejects invalid — `gstin: "INVALID"` → 400 | ✅ PASS |
| 3 | AC2b | Blank GSTIN allowed (C2=a decision) | ✅ PASS |
| 4 | AC3 | Bill settings merge — set header_color, then footer_message, both persist | ✅ PASS |
| 5 | AC4 | Logo upload — POST /profile/logo with PNG → 200 | ✅ PASS |
| 6 | AC4b | Logo serve — GET /profile/logo/{id} → returns image | ✅ PASS |
| 7 | AC5 | Food invoice HTML — GET /api/invoices/{token} → HTML content | ✅ PASS |
| 8 | AC6 | Invoice PDF — GET /api/invoices/{token}/pdf → PDF download | ✅ PASS |
| 9 | AC9 | Invoice deduplication — existing token reused | ✅ PASS |
| 10 | — | 404 for nonexistent token | ✅ PASS |
| 11 | — | Profile page loads (200) with 35 data-testid | ✅ PASS |
| 12-18 | — | Additional profile field validation, bill settings keys | ✅ PASS |

### Notes
- Invoice token tested: `67ddd6833bee4f33af2aaa941ee146c9`
- Profile values restored to originals after test (no permanent data modification)
- Hotel folio modes (Pattern A/B) not tested via API — require specific order data with `room_info`. Manually verified during implementation with real DB data.
- Meta WABA credentials not configured for test user — template submission to Meta returns `credentials_missing` (expected)

### Test Reports
- `/app/test_reports/iteration_2.json`
- `/app/backend/tests/test_cr014_cr023_qa.py` (created by testing agent)
