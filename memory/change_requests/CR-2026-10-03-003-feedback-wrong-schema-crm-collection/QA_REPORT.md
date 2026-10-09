# QA REPORT — CR-2026-10-03-003

**Role 4 (QA) · 2026-10-07 · executed by testing agent on Role 3 handover** · raw: `/app/test_reports/iteration_2.json`

## Result: **PASS** — 11/11 QA cases, 0 failures (Q11 acknowledged as known note)

| QA case | Result | Evidence |
|---|---|---|
| Q1 token happy path | PASS | 1 POST → `{CRM}/api/scan/feedback`, Bearer header, body `{rating:4, restaurant_id:"478", message}`; success panel |
| Q2 hard reload with token | PASS | `feedback-loading` flashes, then form (no sign-in card) |
| Q3 no token | PASS | sign-in card; 0 requests to feedback/orders; CTA → `/478` |
| Q4 CRM 500 | PASS | error toast; form stays; no success panel |
| Q5 validation | PASS | toast; 0 POSTs |
| Q6 double submit | PASS | 1 POST; button "Submitting…" + disabled |
| Q7 `feedbackEnabled:false` | PASS | Feedback entry hidden in hamburger (unchanged) |
| Q8 old routes gone | PASS | POST → 405, GET → 404 |
| Q9 adjacent route | PASS | `GET /api/config/478` → 200 |
| Q10 pytest | PASS | smoke 19/19 · contract 14/14 (11 snapshots) |
| Q11 orders 404 | NOTE | tracked CR-2026-09-15-001; page unaffected |
| Q12 regression | PASS | no console errors mentioning FeedbackPage/crmSubmitFeedback |

**Findings:** BLOCKER 0 · MAJOR 0 · MINOR 0 · NOTE 2 — (1) `order_id` never attached until CR-2026-09-15-001 (see SELF_TEST Deviation 1); (2) pre-existing `/review-order` console errors (`REACT_APP_BACKEND_URL is not set` in POS-auth path, loyalty JSON parse) — unrelated, candidate for a separate intake.

**Registry:** SYNCED (`QA → SMOKE`, artefacts += QA_REPORT, SMOKE_BRIEF).

```text
QA complete: CR-2026-10-03-003
Result: PASS
Tests: 11 total, 11 pass, 0 fail (+1 known note)
Coverage: 6/6 changed files
Report: this file · /app/test_reports/iteration_2.json
Next: Owner smoke (SMOKE_BRIEF.pdf) → send CRM_NOTE_FEEDBACK_PURGE.md → CLOSED
```
