# CR-072 — Hotel Customer Document Capture (Aadhaar / ID Proof) + POS Auto-Recall

**CR ID**: CR-072  
**Reported**: 2026-08-04  
**Reporter**: Owner (Abhishek)  
**Role**: Intake Agent  
**Status**: 📋 REGISTERED  

---

## Owner Report

> "Every customer who is checking in at the hotel POS will have docs like Aadhaar card  
> front and back side and likewise will provide complete details. Basically these documents  
> will be uploaded on S3. When customer returns some other time to same hotel (note) then  
> automatically docs and details should be visible in POS."
>
> "For existing customers we will have this later."

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
| **Q1** | What document types should be supported at launch? | (a) Aadhaar only (front + back) (b) Aadhaar + Passport + Driving Licence (c) Custom free-form type |
| **Q2** | Should documents be publicly accessible (open S3 URL) or private (signed URLs that expire)? | (a) Public — anyone with URL can view (b) Private — signed URLs, expire after N minutes (c) Private — serve through CRM backend only |
| **Q3** | Which upload format does POS send? | (a) Base64 encoded image in JSON body (b) Multipart form data (file upload) (c) POS uploads to S3 directly and sends URL to CRM |
| **Q4** | Document visibility in POS lookup — should ALL documents show, or only the latest per type? | (a) All documents (full history) (b) Latest per document type only |
| **Q5** | Is this for ALL hotels using the CRM, or specific tenants? Should there be a feature flag? | (a) All tenants (b) Hotel tenants only (c) Feature flag per tenant |

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
Owner decisions: Q1–Q5 must be answered before planning can begin
Docs: discovery/CR_072_HOTEL_CUSTOMER_DOCUMENT_CAPTURE_INTAKE.md
Next: Owner answers Q1–Q5 → Planning Agent
```
