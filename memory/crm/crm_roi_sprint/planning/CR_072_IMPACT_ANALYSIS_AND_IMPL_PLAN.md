# CR-072 — Impact Analysis: Hotel Customer Document Capture + POS Auto-Recall

**CR ID**: CR-072  
**Date**: 2026-08-04  
**Role**: Planning Agent  
**Status**: Impact Analysis Complete — ALL QUESTIONS LOCKED (Q1–Q7)  
**Risk**: HIGH (PII document storage + new S3 surface + POS API contract)

---

## Code Reality Check — FULL (all 6 surfaces verified)

### S1 — New `customer_documents` collection: ❌ DOES NOT EXIST

**Verified**: `grep -rn "customer_documents" /app/backend/` → 0 results  
**Action**: Create new collection with schema:

```python
{
    "_id": ObjectId,
    "id": str (uuid),
    "user_id": str,           # restaurant tenant (multi-tenant isolation)
    "customer_id": str,       # links to customers.id
    "doc_type": str,          # "license", "passport", "aadhaar", "pan_card", "other"
    "s3_key": str,            # S3 object key for private access
    "file_name": str,         # original file name
    "content_type": str,      # MIME type (image/jpeg, image/png, application/pdf)
    "file_size": int,         # bytes
    "uploaded_at": datetime,
    "uploaded_by": str,       # "pos" or staff user_id
}
```

**Indexes needed**:
- `(user_id, customer_id, doc_type)` — for latest-per-type lookup (Q4 decision)
- `(customer_id)` — for fetching all docs for a customer

### S2 — S3 upload path: ✅ PARTIAL INFRASTRUCTURE EXISTS

**File**: `core/s3.py` (CR-036 module)  
**Current capabilities**:
- `put_public_object(key, body, content_type)` — uploads with `ACL=public-read` ✅
- `get_public_url(key)` — returns public URL ✅
- `object_exists(key)` — HEAD check ✅
- `get_object_bytes(key)` — download ✅
- `delete_object(key)` — delete ✅
- `S3_CONFIGURED` — env check ✅

**MISSING**: `generate_presigned_url(key, expires_in)` — needed per Q2 decision (private/signed URLs for PII)

Per Q2 decision: Documents are **PRIVATE** (no `ACL=public-read`). Access via pre-signed URLs with expiry (e.g., 15 minutes). This requires a new function in `core/s3.py`:

```python
def put_private_object(key, body, content_type):
    """Upload without public-read ACL."""
    ...

def generate_presigned_url(key, expires_in=900):
    """Return a pre-signed GET URL valid for `expires_in` seconds."""
    ...
```

**S3 path pattern** (locked):
```
customers/{customer_id}/docs/{doc_type}/{uuid}.{ext}
```

### S3 — New endpoint `POST /api/pos/customers/{id}/documents`: ❌ DOES NOT EXIST

**Verified**: No document upload endpoints in any router.  
**Auth**: `X-API-Key` (POS auth pattern per §8 — `verify_pos_auth`)  
**Q3 decision**: Multipart form upload to CRM API. CRM accepts `file` + `doc_type`, validates, uploads to S3.

**Validation rules**:
- File size: max 5MB (Aadhaar images are typically <2MB)
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`
- `doc_type`: validated against allowed enum: `license`, `passport`, `aadhaar`, `pan_card`, `other` (Q1 locked)
- Customer must exist and belong to the tenant (`user_id` check)
- Max 5 files per doc_type per customer (Q6). On 6th upload, oldest is auto-dropped from DB (S3 object retained for audit).
- Upload-only, no delete endpoint (Q7).

### S4 — New endpoint `GET /api/pos/customers/{id}/documents`: ❌ DOES NOT EXIST

**Auth**: `X-API-Key` (POS auth)  
**Q4 decision (REVISED)**: Return **all documents per doc_type, newest first**. Max 5 per type (Q6). No delete (Q7).

**Response shape**:
```json
{
    "success": true,
    "data": {
        "documents": {
            "aadhaar": [
                {
                    "id": "doc_uuid",
                    "url": "https://...presigned...",
                    "file_name": "aadhaar_front.jpg",
                    "uploaded_at": "2026-08-05T10:00:00Z"
                },
                {
                    "url": "https://...presigned...",
                    "file_name": "aadhaar_back.jpg",
                    "uploaded_at": "2026-08-04T09:00:00Z"
                }
            ],
            "pan_card": [
                { "url": "...", "file_name": "pan.jpg", "uploaded_at": "..." }
            ]
        }
    }
}
```

### S5 — `POST /api/pos/customer-lookup` response extension: ✅ EXISTS, NEEDS EXTENSION

**File**: `routers/pos.py` line 2049–2067  
**Current**: Returns customer profile data (name, phone, tier, points, etc.)  
**Change**: Add `documents` array to response — latest per doc_type with signed URLs

This is the same endpoint being extended for CR-071 (adding B2B fields). Both changes are additive and non-conflicting.

### S6 — CRM `CustomerDetailPage.jsx` Documents section: ❌ DOES NOT EXIST

**File**: `frontend/src/pages/CustomerDetailPage.jsx`  
**Current**: Profile card → Insights card → Stats cards. No documents section.  
**Change**: Add "Documents" card section below existing cards. Shows thumbnails of uploaded documents with download links. Read-only in CRM (upload is POS-only per Q3).

---

## S3 Module Extension Required

**File**: `core/s3.py`

New functions needed for CR-072 (private document storage):

| Function | Purpose |
|---|---|
| `put_private_object(key, body, content_type)` | Upload WITHOUT `ACL=public-read` |
| `generate_presigned_url(key, expires_in=900)` | Generate time-limited GET URL |

**Why not reuse `put_public_object`**: Aadhaar/PII documents must NOT be publicly accessible. `put_public_object` sets `ACL=public-read` — unsuitable for sensitive identity documents. New function omits the ACL (bucket default = private).

---

## Edit-by-Edit Implementation Plan

### E-A: Add `put_private_object` + `generate_presigned_url` to S3 module

**File**: `core/s3.py`  
**Risk**: MEDIUM (new functions, no change to existing)

### E-B: Create document upload endpoint

**File**: `routers/pos.py` (new endpoint)  
**Risk**: HIGH (new POS API surface + S3 + file validation)

```
POST /api/pos/customers/{customer_id}/documents
Auth: X-API-Key
Body: multipart/form-data (file + doc_type)
Response: { success, data: { document_id, doc_type, url } }
```

### E-C: Create document list endpoint

**File**: `routers/pos.py` (new endpoint)  
**Risk**: MEDIUM (read-only, signed URL generation)

```
GET /api/pos/customers/{customer_id}/documents
Auth: X-API-Key
Response: { success, data: { documents: [...] } }
```

### E-D: Extend `customer-lookup` response with documents

**File**: `routers/pos.py` line 2049–2067  
**Risk**: HIGH (POS API response contract change — same function as CR-071 E-D)

Add `documents` field to response dict — calls same latest-per-type query.

### E-E: Add CRM document view endpoint (for frontend)

**File**: `routers/customers.py` (new endpoint)  
**Risk**: MEDIUM (JWT auth, read-only)

```
GET /api/customers/{customer_id}/documents
Auth: Bearer JWT
Response: { documents: [...] with signed URLs }
```

### E-F: Add Documents section to CustomerDetailPage

**File**: `frontend/src/pages/CustomerDetailPage.jsx`  
**Risk**: MEDIUM (additive UI section, no existing logic changes)

New "Documents" card below existing cards. Grid of document thumbnails with:
- Doc type label
- Thumbnail preview (images) or file icon (PDFs)
- Upload date
- Download button (opens signed URL)

### E-G: Create indexes on `customer_documents` collection

**File**: `backend/server.py` (lifespan startup) or migration script  
**Risk**: LOW (additive index creation)

---

## Files WILL Change

| File | Edits | Risk |
|---|---|---|
| `core/s3.py` | E-A (2 new functions) | MEDIUM |
| `routers/pos.py` | E-B, E-C, E-D (2 new endpoints + lookup extension) | HIGH |
| `routers/customers.py` | E-E (1 new endpoint) | MEDIUM |
| `frontend/src/pages/CustomerDetailPage.jsx` | E-F (Documents card) | MEDIUM |
| `backend/server.py` | E-G (index creation in lifespan) | LOW |

## Files WILL NOT Change

`core/whatsapp.py`, `core/loyalty.py`, `core/coupon.py`, `core/campaign_jobs.py`, `routers/campaigns.py`, `routers/auth.py`, `routers/whatsapp.py`, `routers/analytics.py`, `models/schemas.py` (documents are separate collection, not embedded in customer schema), `services/invoice_generator.py`, `services/analytics_service.py`, invoice templates, WhatsApp variable registry.

---

## Verification Matrix

| # | Test | Acceptance Criteria | Edits |
|---|---|---|---|
| V1 | Upload Aadhaar front via POS endpoint → S3 object created (private) | S3 upload works | E-A, E-B |
| V2 | Upload returns document ID + signed URL | Upload response correct | E-B |
| V3 | Signed URL expires after configured time | PII protection | E-A |
| V4 | GET documents endpoint returns all docs per type, newest first | Q4 revised | E-C |
| V5 | customer-lookup includes documents grouped by type | Auto-recall on return | E-D |
| V6 | CRM CustomerDetailPage shows uploaded documents | CRM visibility | E-F |
| V7 | Upload rejects files >5MB | File validation | E-B |
| V8 | Upload rejects non-image/PDF MIME types | File validation | E-B |
| V9 | Upload requires valid customer + tenant isolation | Security | E-B |
| V10 | S3 not configured → 503 "S3 not configured" | Fail-fast per CR-036 pattern | E-B |
| V11 | 6th upload same doc_type → oldest auto-dropped, 5 remain | Q6 cap | E-B |
| V12 | No delete endpoint exists | Q7 upload-only | — |
| V13 | doc_type validated against enum (license/passport/aadhaar/pan_card/other) | Q1 | E-B |
| V14 | Existing customer flows unaffected | Zero regression | ALL |

## Regression Checklist

| # | Check | Why |
|---|---|---|
| R1 | POS customer-lookup existing fields unchanged | E-D extends response |
| R2 | S3 existing upload flows (media headers, bill logos, invoices) | E-A adds new functions |
| R3 | Customer detail page existing sections (profile, insights, stats) | E-F adds new card |
| R4 | POS auth (X-API-Key) works for new endpoints | E-B, E-C use `verify_pos_auth` |

---

## ✅ All Questions Locked (Q1–Q7)

| Q | Decision | Source |
|---|---|---|
| **Q1** | 5 types: `license`, `passport`, `aadhaar`, `pan_card`, `other` (from POS dropdown) | Owner screenshot 2026-08-04 |
| **Q2** | Private S3, pre-signed URLs with expiry | Owner 2026-08-04 |
| **Q3** | Multipart upload to CRM API | Owner 2026-08-04 |
| **Q4 (revised)** | All documents per doc_type, newest first. NOT latest-only. | Owner 2026-08-04 |
| **Q5** | All tenants, no feature flag | Owner 2026-08-04 |
| **Q6** | Max 5 files per doc_type per customer. Oldest auto-dropped on 6th upload. | Owner 2026-08-04 |
| **Q7** | Upload-only. No delete. | Owner 2026-08-04 |

```python
ALLOWED_DOC_TYPES = ["license", "passport", "aadhaar", "pan_card", "other"]
```

---

## Dependency on CR-071

Both CR-071 and CR-072 extend `pos_customer_lookup` (E-D in both plans). Changes are additive and non-conflicting:
- CR-071 adds: `customer_type`, `gst_name`, `gst_number`, `is_b2b` (4 flat fields)
- CR-072 adds: `documents` (1 array field with signed URLs)

**Recommendation**: Implement CR-071 first (schema change required), then CR-072 (net-new surface).

---

## Estimated Effort: ~1.5–2 days (7 edits across 5 files + QA)

---

```
Planning complete: CR-072
Stage: Impact Analysis + Implementation Plan
Code reality: FULL (all 6 surfaces verified)
Risk: HIGH (PII storage + S3 upload + POS API contract)
Files WILL change: core/s3.py, routers/pos.py, routers/customers.py, CustomerDetailPage.jsx, server.py
Files WILL NOT touch: core/whatsapp.py, core/loyalty.py, core/coupon.py, models/schemas.py, invoice templates
Owner decisions: ALL LOCKED (Q1–Q7)
Docs: planning/CR_072_IMPACT_ANALYSIS_AND_IMPL_PLAN.md
Next: Owner answers Q1 (optional) → Owner approval → Implementation
```
