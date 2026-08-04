# CR-072 — Hotel Customer Document Capture (Aadhaar / ID Proof) + POS Auto-Recall

**CR ID**: CR-072  
**Reported**: 2026-08-04  
**Reporter**: Owner (Abhishek)  
**Role**: Intake Agent  
**Status**: 🔵 ALL DECISIONS LOCKED (Q1–Q7) — Ready for Implementation

---

## Owner Report

> "Every customer who is checking in at the hotel POS will have docs like Aadhaar card  
> front and back side and likewise will provide complete details. Basically these documents  
> will be uploaded on S3. When customer returns some other time to same hotel (note) then  
> automatically docs and details should be visible in POS."
>
> "For existing customers we will have this later."

---

## Owner Decisions — Q2–Q5 LOCKED (2026-08-04)

| Q | Decision | Status |
|---|---|---|
| **Q1 — Document types** | **5 types from POS dropdown**: `license`, `passport`, `aadhaar`, `pan_card`, `other`. No front/back split — each upload is a single file tagged with one type. Source: POS screenshot 2026-08-04. | ✅ Locked |
| **Q2 — S3 access** | **Signed URL** — private S3, pre-signed URLs with expiry. Appropriate for Aadhaar/PII. | ✅ Locked |
| **Q3 — Upload format** | **Multipart upload to CRM API** (option b). CRM accepts file + doc_type, uploads to S3. Currently POS stores on local filesystem — this CR is the integration. | ✅ Locked |
| **Q4 — POS lookup** | **REVISED (2026-08-04)**: All documents per doc type, newest first. NOT latest-only. When customer returns, POS sees full document history grouped by type, most recent upload shown first. | ✅ Locked (revised) |
| **Q5 — Scope** | **No CRM feature flag** — API available to all tenants. POS team decides which properties use it. | ✅ Locked |
| **Q6 — Max files per doc_type** | **5** — max 5 files stored per doc_type per customer. Oldest auto-dropped when 6th is uploaded. | ✅ Locked |
| **Q7 — Delete capability** | **Upload-only, no delete**. POS and CRM staff cannot delete documents. New upload replaces visibility (sorted newest-first). | ✅ Locked |

---

## S3 Path (locked)

```
customers/{customer_id}/docs/{doc_type}/{uuid}.{ext}
e.g. customers/abc123/docs/aadhaar_front/d3f9b2.jpg
```

## API endpoints to build (locked)

```
POST /api/pos/customers/{id}/documents     ← POS uploads file (multipart, doc_type field)
GET  /api/pos/customers/{id}/documents     ← returns latest per doc_type with signed URLs
POST /api/pos/customer-lookup              ← extend response to include documents[] (signed URLs)
CRM  CustomerDetailPage                    ← Documents section (view + download)
```

---

## Classification

| Field | Value |
|---|---|
| **Type** | CR — New feature (net-new, no existing infrastructure) |
| **Severity** | P1 — Core hotel operations (check-in identity verification + return guest recognition) |
| **Risk** | HIGH — New collection + S3 uploads + POS API contract change + customer schema change |
| **Duplicate check** | DISTINCT — No existing document storage anywhere in CRM |
| **Blast radius** | MEDIUM — Hotel tenants only (non-hotel restaurants unaffected) |

---

## Scope

### Phase 1 — New customer check-in (THIS CR)

1. **Document upload**: POS captures Aadhaar front + back (and other ID types) at check-in → uploaded to S3
2. **Customer record**: Document metadata stored in CRM (`customer_documents` or embedded in `customers`)
3. **POS recall on return**: When same customer is looked up by phone → `POST /api/pos/customer-lookup` returns stored document URLs + details
4. **CRM view**: Customer detail page shows uploaded documents (view + download)

### Phase 2 — Existing customers (DEFERRED)

> Owner: "For existing customers we will have this later."
> Registered for tracking. No planning until owner promotes.

---

## What Currently Exists

| Layer | Current state |
|---|---|
| Document collections | ❌ NONE |
| Document fields on customer schema | ❌ NONE |
| Document upload endpoints | ❌ NONE |
| S3 module (`core/s3.py`) | ✅ CR-036 — `put_public_object` available |
| S3 credentials in env | ✅ `AWS_S3_BUCKET=mygenie-prod`, `AWS_S3_REGION=ap-south-1` |
| POS customer-lookup | ✅ Exists — needs to return doc URLs |
| Customer detail page (CRM) | ✅ Exists — needs document section |

---

## 6 Surfaces to Build

| # | Surface | What |
|---|---|---|
| S1 | New collection `customer_documents` | Stores doc metadata: customer_id, doc_type, front_url, back_url, uploaded_at, uploaded_by |
| S2 | S3 upload path | `customers/{customer_id}/docs/{doc_type}/{uuid}.jpg` — private or public-read |
| S3 | New endpoint `POST /api/pos/customers/{id}/documents` | POS uploads a document (multipart form, doc_type + file) |
| S4 | New endpoint `GET /api/pos/customers/{id}/documents` | POS fetches stored documents for a customer |
| S5 | `POST /api/pos/customer-lookup` — extend response | Return `documents` array when customer found |
| S6 | CRM `CustomerDetailPage.jsx` — Documents section | View uploaded docs (thumbnails + download links) |

---

## Owner Questions (must answer before planning)

| # | Question | Options |
|---|---|---|
| **Q1** | What document types should be supported at launch? | **ANSWERED**: 5 types from POS: `license`, `passport`, `aadhaar`, `pan_card`, `other` |
| **Q2** | Should documents be publicly accessible (open S3 URL) or private (signed URLs that expire)? | **ANSWERED**: Private — signed URLs with expiry |
| **Q3** | Which upload format does POS send? | **ANSWERED**: Multipart form data (file upload) |
| **Q4** | Document visibility in POS lookup — should ALL documents show, or only the latest per type? | **ANSWERED (revised)**: All documents per type, newest first |
| **Q5** | Is this for ALL hotels using the CRM, or specific tenants? Should there be a feature flag? | **ANSWERED**: All tenants, no feature flag |
| **Q6** | Max files per doc_type per customer? | **ANSWERED**: 5 max. Oldest auto-dropped on 6th upload. |
| **Q7** | Can POS/CRM staff delete documents? | **ANSWERED**: No. Upload-only, no delete. |

---

## Risk Assessment

| Area | Risk | Reason |
|---|---|---|
| S3 upload path | MEDIUM | New upload surface — file size limits, type validation needed |
| POS API contract | HIGH — | New endpoint + `customer-lookup` response change |
| Customer schema | MEDIUM | New `documents` array or new collection |
| POS auth | MEDIUM | Upload endpoint must use `X-API-Key` (POS auth pattern) |
| Data privacy | HIGH | Aadhaar is PII / sensitive identity document — access control critical |
| Phase 2 (existing customers) | DEFERRED | Owner explicitly said "handle later" |

---

## Estimated Effort

| Phase | Effort |
|---|---|
| Phase 1 (new customers) | ~1.5–2 days: 2 new endpoints + S3 upload + customer-lookup extension + CRM UI doc section |
| Phase 2 (existing customers) | ~½ day: migration/backfill tooling (scoped when promoted) |

---

## No Code Changed

Zero code changes in this intake. All findings are investigation + registration only.

---

```
Intake complete: CR-072
Classification: CR — New feature (net-new, no existing infrastructure)
Severity: P1
Risk: HIGH (POS API contract + PII document storage)
Duplicate check: DISTINCT
Evidence: Code audit — 0 existing document endpoints, 0 doc collections, S3 available
Blast radius: MEDIUM (hotel tenants; non-hotel unaffected)
Owner decisions: ALL LOCKED (Q1–Q7, 2026-08-04)
Docs: discovery/CR_072_HOTEL_CUSTOMER_DOCUMENT_CAPTURE_INTAKE.md
Next: Owner approval → Implementation Agent
```
