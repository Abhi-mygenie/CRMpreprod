# CR-075 — QA Report
## Hotel Guest Document Migration: POS booking_documents → CRM customer_documents

**Date**: 2026-08-06  
**Role**: QA Agent  
**Tenant tested**: owner@18march.com / 18march (restaurant_id=478)  
**Result**: ✅ **QA PASS — 10/10 AC**

---

## Test execution summary

| Sync | trigger | docs_migrated | docs_already_present | docs_skipped_stubs | docs_skipped_404 | docs_failed |
|---|---|---|---|---|---|---|
| Run 1 | fresh | **39** | 0 | 87 | 9 | 0 |
| Run 2 (idempotency) | re-run | **0** | 39 | 87 | 9 | 0 |

---

## AC Results — 10/10 PASS

| AC | Test | Result | Evidence |
|---|---|---|---|
| AC-1 | Migration docs appear after sync | ✅ **39 rows** in `customer_documents` with `uploaded_by="migration"` | DB count = 39 |
| AC-2 | Stubs produce zero rows | ✅ **0 stub URLs in DB** | 87 stubs skipped in sync log, none in DB |
| AC-3 | `/storage/;/` URLs skipped | ✅ **9 skipped**, none in DB | Logs confirm `source_404_skipped` × 9 + DB count = 0 for those URLs |
| AC-4 | Idempotency — 2nd sync no new rows | ✅ **DB count stays 39** | Run 2: docs_migrated=0, docs_already_present=39 |
| AC-5 | `file_name` follows `{doc_type}_{side}.{ext}` | ✅ **All 39 correct** | e.g. `aadhaar_front.jpg`, `license_back.jpg`, `passport_front.png` |
| AC-6 | `uploaded_by="migration"` + `source_url` present | ✅ **All 39 rows** | 100% match on all rows |
| AC-7 | `back_image` = separate row with `_back` suffix | ✅ **16 back rows** | `_back` file_name confirmed across all customers with back_image |
| AC-8 | Existing customer sync unaffected | ✅ **synced=5, updated=67, failed=0** | Customer name/phone/GST untouched |
| AC-9 | Sync log has `docs_*` fields | ✅ **All 5 fields present** | `docs_migrated`, `docs_skipped_stubs`, `docs_skipped_404`, `docs_already_present`, `docs_failed` |
| AC-10 | Presigned URL generated for migrated doc | ✅ **HTTP-accessible URL** | `https://mygenie-prod.s3.amazonaws.com/customers/...` returned |

---

## Document breakdown (39 migrated rows)

| doc_type | rows | notes |
|---|---|---|
| aadhaar | 20 | front + back across multiple customers |
| license | 12 | front-only (older entries), front+back (newer) |
| passport | 6 | front + back |
| other | 1 | front only |

---

## Skip breakdown (confirmed correct behaviour)

| Category | Count | Why |
|---|---|---|
| Stubs (`Select document type`) | 87 | Most POS entries are empty placeholders — expected |
| Broken URL (`/storage/;/`) | 9 | POS URL-generation bug from May 2025 — permanently unrecoverable |
| Already present (run 2) | 39 | Q1 idempotency guard working correctly |
| Download failures | 0 | All reachable images downloaded successfully |

---

## Decisions verified against live run

| Decision | Verified |
|---|---|
| Q1 — every sync, source_url dedup | ✅ Run 2: 0 new inserts, 39 already_present |
| Q2 — skip+log on failure | ✅ 0 failures on real images; logs show source_404_skipped for bad URLs |
| Q3 — all hosts migrated | ✅ manage.mygenie.online + dev.mygenie.online both downloaded |
| Q4 — CR-072 naming convention | ✅ s3_key, file_name, uploaded_by, source_url all correct |
| Q5 — no per-doc-type cap | ✅ aadhaar has 10+ rows for one customer — no pruning |

---

## Regression check

| Check | Result |
|---|---|
| Existing customer sync (synced_count, updated_count) | ✅ Unaffected |
| CR-072 `uploaded_by="pos"` rows untouched | ✅ pos=0 (no live POS uploads on this tenant) |
| `pos.py:2198` prune block untouched | ✅ File not modified |

---

## Tenant note

Welcome Resort (restaurant_474) was tried first — 0 real documents, QA blocked as instructed.  
QA executed on owner@18march.com (restaurant_478) — 32 POS entries → 39 DB rows (23 reachable × front/back split).

---

## Findings

**NONE** — 0 BLOCKERS, 0 MAJOR, 0 MINOR

---

## QA complete

```
QA complete: CR-075
Result: PASS
Tests: 10/10 AC PASS
Failures: none
Coverage: 10/10 ACs
Registry: update to ✅ QA PASS
Report: qa/CR_075_QA_REPORT.md
Next: Owner smoke (optional — can view migrated docs in Customer Detail page)
```
