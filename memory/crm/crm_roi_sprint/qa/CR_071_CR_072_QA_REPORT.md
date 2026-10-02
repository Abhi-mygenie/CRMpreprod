# CR-071 + CR-072 — QA Report

**Date**: 2026-08-04  
**Role**: QA Agent  
**Scope**: CR-071 (B2B Customer Capture) + CR-072 (Hotel Document Capture)  
**Test agent**: testing_agent iteration_2  
**Report file**: `/app/test_reports/iteration_2.json`  
**Test file**: `/app/backend/tests/test_cr071_cr072.py`

---

## Result: ✅ PASS (13/13 tests)

### Backend: 12/12 PASS (100%)

| # | Test | Result | Notes |
|---|---|---|---|
| T1 | POS order with gst_name + gst_number → customer updated B2B | ✅ PASS | is_b2b=true, customer_type=corporate, gst_name, gst_number all persisted |
| T2 | POS order WITHOUT gst → no B2B clobber | ✅ PASS | Never-downgrade guard working correctly |
| T3 | customer-lookup returns B2B + documents fields | ✅ PASS | All 4 B2B fields + documents dict present |
| T4 | WhatsApp variables include customer_gst_name + customer_gst_number | ✅ PASS | 43+ variables total |
| T5 | is_b2b in customer list + detail responses | ✅ PASS | Present in both endpoints |
| T6 | Document upload (multipart, aadhaar, JPEG) | ✅ PASS | 200, signed URL returned, S3 upload confirmed |
| T7a | Invalid doc_type → 400 | ✅ PASS | Correct error message |
| T7b | Non-image MIME type → 400 | ✅ PASS | Correct error message |
| T8 | GET documents → grouped by type, newest first | ✅ PASS | Signed URLs generated |
| T9 | CRM documents endpoint (JWT auth) | ✅ PASS | Same grouped structure |
| T10 | customer-lookup includes uploaded documents | ✅ PASS | documents dict populated |
| T12 | Upload 6 same type → 5 remain (oldest pruned) | ✅ PASS | Max-5 cap enforced |
| T13 | customer-lookup existing fields regression | ✅ PASS | All original fields still present |

### Frontend: 1/1 PASS (100%)

| # | Test | Result | Notes |
|---|---|---|---|
| T11 | Documents section on CustomerDetailPage | ✅ PASS | data-testid='documents-section' renders, empty state shows "No documents uploaded yet", populated state shows doc-card-{type} + doc-download-{id} |

---

## Issues Found

### BUG (self-introduced, fixed during QA)

| Severity | Issue | Fix |
|---|---|---|
| MAJOR | E-A.1 edit accidentally removed `billing_address`, `credit_limit`, `payment_terms` from `CustomerBase` — caused POST /api/customers to 500 | **FIXED**: Fields restored to CustomerBase in schemas.py |

### Notes (not blocking)

| Severity | Note |
|---|---|
| NOTE | S3_CONFIGURED check runs before doc_type/MIME validation — means if S3 is down, invalid doc_type returns 503 not 400. Acceptable ordering. |
| NOTE | CRM get_customer_documents capped at 100 docs total. With max 5 per type × 6 types = 30 max, so fine. |

---

## Registry Status: SYNCED

- CR-071: Implementation complete + QA pass
- CR-072: Implementation complete + QA pass

---

```
QA complete: CR-071 + CR-072
Result: PASS
Tests: 13 total, 13 pass, 0 fail
Failures: none
Coverage: 11/11 files
Registry: SYNCED
Report: qa/CR_071_CR_072_QA_REPORT.md
Next: Owner Smoke / Acceptance
```
