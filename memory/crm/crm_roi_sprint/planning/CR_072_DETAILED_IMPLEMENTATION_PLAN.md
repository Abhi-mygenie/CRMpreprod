# CR-072 — Detailed Implementation Plan: Hotel Customer Document Capture + POS Auto-Recall

**CR ID**: CR-072  
**Date**: 2026-08-04  
**Role**: Planning Agent  
**Stage**: Implementation Plan (edit-by-edit with exact line numbers)  
**Risk**: HIGH (PII document storage + S3 upload + POS API contract)  
**Prerequisite**: Owner approval for implementation gate

---

## Pre-Implementation Checklist

- [x] Item registered (CR-072 in CR_STATUS_DASHBOARD.md)
- [x] Intake complete (discovery/CR_072_HOTEL_CUSTOMER_DOCUMENT_CAPTURE_INTAKE.md)
- [x] Impact analysis complete (planning/CR_072_IMPACT_ANALYSIS_AND_IMPL_PLAN.md)
- [x] All owner decisions locked (Q1–Q7)
- [ ] Owner approval to begin implementation

---

## Constants

```python
ALLOWED_DOC_TYPES = ["license", "passport", "aadhaar", "pan_card", "other"]
MAX_DOCS_PER_TYPE = 5
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5MB
ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
PRESIGNED_URL_EXPIRY_SECONDS = 900  # 15 minutes
```

---

## Edit E-A: Add `put_private_object` + `generate_presigned_url` to S3 Module

**File**: `core/s3.py`  
**Risk**: MEDIUM (new functions, no change to existing)  
**Code marker**: `# CR-072: private document storage`

### E-A.1 — Add `put_private_object` (after `put_public_object` function, ~line 144)

**Location**: After the `put_public_object` function ends (line ~144), before `# --- Existence check ---` (line ~149)

**Insert**:
```python
# --- CR-072: Private upload (no public ACL) ---------------------------------


def put_private_object(
    key: str,
    body: bytes,
    content_type: str,
) -> bool:
    """Upload `body` to `s3://<bucket>/<key>` WITHOUT public-read ACL.

    Used for PII documents (Aadhaar, PAN, etc.) that must only be
    accessed via pre-signed URLs. Returns True on success.
    """
    s3 = get_s3_client()
    if s3 is None:
        logger.debug("put_private_object skipped (S3 not configured) key=%s", key)
        return False
    try:
        s3.put_object(
            Bucket=AWS_S3_BUCKET,
            Key=key,
            Body=body,
            ContentType=content_type,
        )
        return True
    except (ClientError, BotoCoreError) as e:
        _log_client_error("put_object(private)", key, e)
        return False


def generate_presigned_url(key: str, expires_in: int = 900) -> Optional[str]:
    """Return a pre-signed GET URL for `key`, valid for `expires_in` seconds.

    Returns None if S3 is not configured or signing fails.
    Used for PII document access (CR-072).
    """
    s3 = get_s3_client()
    if s3 is None:
        return None
    try:
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": AWS_S3_BUCKET, "Key": key},
            ExpiresIn=expires_in,
        )
        return url
    except (ClientError, BotoCoreError) as e:
        _log_client_error("generate_presigned_url", key, e)
        return None
```

**Self-test**: Import `from core.s3 import put_private_object, generate_presigned_url` in a scratch test → no ImportError. Call with S3 configured → returns True / signed URL.

---

## Edit E-B: Create Document Upload Endpoint

**File**: `routers/pos.py`  
**Risk**: HIGH (new POS API surface + S3 + file validation)  
**Code marker**: `# CR-072: Document upload endpoint`

### E-B.1 — Add imports at top of file

**Location**: Top of `routers/pos.py`, add to existing imports.

**Add**:
```python
from fastapi import UploadFile, File, Form
from core.s3 import S3_CONFIGURED, put_private_object, generate_presigned_url
```

Note: `UploadFile`, `File`, `Form` may already be partially imported — check and add only missing ones.

### E-B.2 — Add endpoint after `pos_customer_lookup` (~line 2068)

**Location**: After the `pos_customer_lookup` endpoint ends (line ~2068), before `@router.get("/api-key")` (line 2070).

**Insert**:
```python

# ── CR-072 · Customer Document Capture ──────────────────────────────────

_CR072_ALLOWED_DOC_TYPES = ["license", "passport", "aadhaar", "pan_card", "other"]
_CR072_MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
_CR072_ALLOWED_MIMES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
_CR072_MAX_DOCS_PER_TYPE = 5


@router.post("/customers/{customer_id}/documents", response_model=POSResponse)
async def pos_upload_document(
    customer_id: str,
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    user: dict = Depends(verify_pos_auth),
):
    """CR-072: POS uploads a customer identity document (Aadhaar, PAN, etc.) to S3.

    - Validates doc_type against allowed enum
    - Validates file size (max 5MB) and MIME type (image/jpeg, png, webp, pdf)
    - Uploads to S3 as private object (no public ACL)
    - Stores metadata in customer_documents collection
    - Enforces max 5 docs per type per customer (Q6); oldest auto-pruned
    """
    # 1. S3 availability check
    if not S3_CONFIGURED:
        raise HTTPException(status_code=503, detail="AWS S3 not configured")

    # 2. Validate doc_type
    if doc_type not in _CR072_ALLOWED_DOC_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid doc_type '{doc_type}'. Allowed: {_CR072_ALLOWED_DOC_TYPES}",
        )

    # 3. Validate MIME type
    if file.content_type not in _CR072_ALLOWED_MIMES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{file.content_type}'. Allowed: {sorted(_CR072_ALLOWED_MIMES)}",
        )

    # 4. Verify customer exists + tenant isolation
    customer = await db.customers.find_one(
        {"id": customer_id, "user_id": user["id"]}, {"_id": 0, "id": 1}
    )
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # 5. Read + validate file size
    file_bytes = await file.read()
    if len(file_bytes) > _CR072_MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large ({len(file_bytes)} bytes). Max: {_CR072_MAX_FILE_SIZE} bytes (5MB)",
        )

    # 6. Build S3 key
    import uuid as _uuid
    ext = (file.filename or "").rsplit(".", 1)[-1] if file.filename and "." in file.filename else "bin"
    s3_key = f"customers/{customer_id}/docs/{doc_type}/{_uuid.uuid4().hex}.{ext}"

    # 7. Upload to S3 (private — no public ACL)
    ok = put_private_object(s3_key, file_bytes, file.content_type)
    if not ok:
        raise HTTPException(status_code=502, detail="S3 upload failed")

    # 8. Store metadata
    now = datetime.now(timezone.utc).isoformat()
    doc_record = {
        "id": str(_uuid.uuid4()),
        "user_id": user["id"],
        "customer_id": customer_id,
        "doc_type": doc_type,
        "s3_key": s3_key,
        "file_name": file.filename or f"{doc_type}.{ext}",
        "content_type": file.content_type,
        "file_size": len(file_bytes),
        "uploaded_at": now,
        "uploaded_by": "pos",
    }
    await db.customer_documents.insert_one(doc_record)

    # 9. Enforce max docs per type (Q6: max 5, prune oldest)
    existing = await db.customer_documents.count_documents(
        {"user_id": user["id"], "customer_id": customer_id, "doc_type": doc_type}
    )
    if existing > _CR072_MAX_DOCS_PER_TYPE:
        # Find oldest beyond cap and remove from DB (S3 object retained for audit)
        oldest_cursor = db.customer_documents.find(
            {"user_id": user["id"], "customer_id": customer_id, "doc_type": doc_type},
            sort=[("uploaded_at", 1)],
        ).limit(existing - _CR072_MAX_DOCS_PER_TYPE)
        async for old_doc in oldest_cursor:
            await db.customer_documents.delete_one({"id": old_doc["id"]})

    # 10. Return signed URL for immediate use
    signed_url = generate_presigned_url(s3_key)

    return POSResponse(
        success=True,
        message="Document uploaded successfully",
        data={
            "document_id": doc_record["id"],
            "doc_type": doc_type,
            "file_name": doc_record["file_name"],
            "url": signed_url,
            "uploaded_at": now,
        },
    )


@router.get("/customers/{customer_id}/documents", response_model=POSResponse)
async def pos_get_documents(
    customer_id: str,
    user: dict = Depends(verify_pos_auth),
):
    """CR-072: Fetch all documents for a customer, grouped by doc_type, newest first.

    Returns signed URLs (15min expiry) for each document.
    Q4 (revised): all documents per type, newest first. Q7: no delete.
    """
    # Verify customer exists + tenant isolation
    customer = await db.customers.find_one(
        {"id": customer_id, "user_id": user["id"]}, {"_id": 0, "id": 1}
    )
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Fetch all docs sorted newest-first
    cursor = db.customer_documents.find(
        {"user_id": user["id"], "customer_id": customer_id},
        {"_id": 0, "id": 1, "doc_type": 1, "s3_key": 1, "file_name": 1,
         "content_type": 1, "file_size": 1, "uploaded_at": 1},
        sort=[("uploaded_at", -1)],
    )
    docs = await cursor.to_list(length=100)

    # Group by doc_type
    grouped = {}
    for d in docs:
        dt = d["doc_type"]
        if dt not in grouped:
            grouped[dt] = []
        grouped[dt].append({
            "id": d["id"],
            "file_name": d["file_name"],
            "content_type": d.get("content_type", ""),
            "file_size": d.get("file_size", 0),
            "url": generate_presigned_url(d["s3_key"]) or "",
            "uploaded_at": d["uploaded_at"],
        })

    return POSResponse(
        success=True,
        message="Documents retrieved",
        data={"documents": grouped},
    )
```

**Self-test**:
1. Upload a JPEG via `POST /api/pos/customers/{id}/documents` with multipart form → 200, returns signed URL
2. Upload 6 of same type → 6th succeeds, oldest pruned, count = 5
3. `GET /api/pos/customers/{id}/documents` → grouped by type, newest first
4. Invalid doc_type → 400
5. File >5MB → 400
6. Non-image file → 400
7. Wrong customer → 404
8. S3 not configured → 503

---

## Edit E-C: (same endpoint GET already included in E-B)

Covered by E-B.2 second endpoint `pos_get_documents`.

---

## Edit E-D: Extend `customer-lookup` with Documents

**File**: `routers/pos.py`  
**Risk**: HIGH (POS API response contract)  
**Code marker**: `# CR-072: include documents in lookup`

### E-D.1 — Inside `pos_customer_lookup` (line 2033–2067)

**Location**: After fetching `customer` and `settings` (lines 2033–2047), before building the response (line 2049).

**Insert** (after `blob = build_pos_loyalty_blob(customer, settings)` at line 2047):
```python
    # CR-072: include documents in lookup (all per type, newest first)
    doc_cursor = db.customer_documents.find(
        {"user_id": user["id"], "customer_id": customer["id"]},
        {"_id": 0, "id": 1, "doc_type": 1, "s3_key": 1, "file_name": 1,
         "content_type": 1, "uploaded_at": 1},
        sort=[("uploaded_at", -1)],
    )
    raw_docs = await doc_cursor.to_list(length=100)
    doc_grouped = {}
    for d in raw_docs:
        dt = d["doc_type"]
        if dt not in doc_grouped:
            doc_grouped[dt] = []
        doc_grouped[dt].append({
            "id": d["id"],
            "file_name": d["file_name"],
            "content_type": d.get("content_type", ""),
            "url": generate_presigned_url(d["s3_key"]) or "",
            "uploaded_at": d["uploaded_at"],
        })
```

Then add `"documents": doc_grouped,` to the response data dict (after `"addresses"` field, inside the dict added by CR-071 E-D).

**Note**: This edit depends on CR-071 E-D already being applied (the expanded data dict). If CR-071 is implemented first, add `"documents": doc_grouped,` after the `"is_b2b"` line. If CR-072 is implemented standalone, add after `"addresses"`.

**Self-test**: `POST /api/pos/customer-lookup` for customer with uploaded docs → response includes `"documents": {"aadhaar": [...], "pan_card": [...]}`. For customer without docs → `"documents": {}`.

---

## Edit E-E: CRM Document View Endpoint

**File**: `routers/customers.py`  
**Risk**: MEDIUM (JWT auth, read-only)  
**Code marker**: `# CR-072: CRM document view endpoint`

### E-E.1 — Add import at top

**Add** to imports:
```python
from core.s3 import generate_presigned_url
```

### E-E.2 — Add endpoint after existing customer endpoints (~end of file)

**Location**: After the last endpoint in `routers/customers.py` (after `get_customer_insights`).

**Insert**:
```python

# ── CR-072 · Customer Documents (CRM view) ─────────────────────────────

@router.get("/{customer_id}/documents")
async def get_customer_documents(customer_id: str, user: dict = Depends(get_current_user)):
    """CR-072: Fetch all documents for a customer (CRM staff view).
    Returns signed URLs grouped by doc_type, newest first.
    """
    customer = await db.customers.find_one(
        {"id": customer_id, "user_id": user["id"]}, {"_id": 0, "id": 1}
    )
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    cursor = db.customer_documents.find(
        {"user_id": user["id"], "customer_id": customer_id},
        {"_id": 0, "id": 1, "doc_type": 1, "s3_key": 1, "file_name": 1,
         "content_type": 1, "file_size": 1, "uploaded_at": 1},
        sort=[("uploaded_at", -1)],
    )
    docs = await cursor.to_list(length=100)

    grouped = {}
    for d in docs:
        dt = d["doc_type"]
        if dt not in grouped:
            grouped[dt] = []
        grouped[dt].append({
            "id": d["id"],
            "file_name": d["file_name"],
            "content_type": d.get("content_type", ""),
            "file_size": d.get("file_size", 0),
            "url": generate_presigned_url(d["s3_key"]) or "",
            "uploaded_at": d["uploaded_at"],
        })

    return {"documents": grouped}
```

**Self-test**: `GET /api/customers/{id}/documents` with JWT auth → returns grouped documents.

---

## Edit E-F: CRM CustomerDetailPage — Documents Section

**File**: `frontend/src/pages/CustomerDetailPage.jsx`  
**Risk**: MEDIUM (additive UI section)  
**Code marker**: `{/* CR-072: Documents Section */}`

### E-F.1 — Add Documents card section

**Location**: After the last `Card` section in the customer detail page (after insights/stats cards).

**Insert** a new `Card` component:
- Title: "Documents"
- Fetches `GET /api/customers/{id}/documents` on mount
- Groups by doc_type label (License, Passport, Aadhaar, PAN Card, Other)
- Shows grid of document thumbnails (images) or file icons (PDFs)
- Each has: file_name, uploaded_at (relative time), download link (opens signed URL in new tab)
- Empty state: "No documents uploaded yet"

**Data-testid**: `documents-section`, `doc-card-{type}`, `doc-download-{id}`

**Doc type labels mapping**:
```js
const DOC_TYPE_LABELS = {
    license: "License",
    passport: "Passport",
    aadhaar: "Aadhaar Card",
    pan_card: "PAN Card",
    other: "Other",
};
```

**(Exact JSX to be authored by Implementation Agent per existing page conventions — imports, Card/CardContent pattern, axios call pattern from AuthContext.)**

**Self-test**: Navigate to customer detail page → "Documents" section visible. Upload doc via POS endpoint → refresh → doc appears with thumbnail and download link.

---

## Edit E-G: Create Indexes on `customer_documents`

**File**: `backend/server.py`  
**Risk**: LOW (additive index, no existing logic)  
**Code marker**: `# CR-072: customer_documents indexes`

### E-G.1 — Add index creation in lifespan (after CR-024 indexes block, ~line 107)

**Location**: After the CR-024 campaign indexes `except` block (line 107), before `# CR-030` (line 109).

**Insert**:
```python
    # CR-072: customer_documents indexes (document capture)
    try:
        await db.customer_documents.create_index(
            [("user_id", 1), ("customer_id", 1), ("doc_type", 1), ("uploaded_at", -1)],
            name="idx_custdocs_user_cust_type_date",
        )
        await db.customer_documents.create_index(
            "customer_id", name="idx_custdocs_customer",
        )
    except Exception:
        pass
```

**Self-test**: Backend starts → logs show no index errors. `db.customer_documents.index_information()` shows both indexes.

---

## Implementation Sequence

| Order | Edit | File | Risk | Est. time |
|---|---|---|---|---|
| 1 | **E-A** (2 functions) | `core/s3.py` | MEDIUM | 15 min |
| 2 | **E-G** | `server.py` (indexes) | LOW | 5 min |
| 3 | **E-B** (2 endpoints + imports) | `routers/pos.py` | HIGH | 45 min |
| 4 | **E-D** (lookup extension) | `routers/pos.py` | HIGH | 20 min |
| 5 | **E-E** (CRM endpoint + import) | `routers/customers.py` | MEDIUM | 20 min |
| 6 | **E-F** (Documents card) | `CustomerDetailPage.jsx` | MEDIUM | 45 min |
| — | Self-test + compile | — | — | 30 min |
| **Total** | | | | **~3 hrs** |

---

## Verification Matrix

| # | Test | AC | Edits | Method |
|---|---|---|---|---|
| V1 | Upload Aadhaar JPEG → S3 private object created | S3 upload | E-A, E-B | curl multipart |
| V2 | Upload returns doc ID + signed URL | Response shape | E-B | curl |
| V3 | Signed URL expires after 15min | PII protection | E-A | manual wait |
| V4 | GET docs → all per type, newest first | Q4 | E-B | curl |
| V5 | customer-lookup includes documents grouped | Auto-recall | E-D | curl |
| V6 | CRM detail page shows docs | CRM view | E-F | screenshot |
| V7 | Upload >5MB → 400 | Validation | E-B | curl |
| V8 | Upload .exe → 400 | Validation | E-B | curl |
| V9 | Invalid doc_type → 400 | Q1 enum | E-B | curl |
| V10 | Wrong customer → 404 | Tenant isolation | E-B | curl |
| V11 | S3 not configured → 503 | Fail-fast | E-B | env check |
| V12 | 6th upload same type → oldest pruned, 5 remain | Q6 cap | E-B | curl + count |
| V13 | No delete endpoint | Q7 | — | verify no DELETE route |
| V14 | Existing customer flows unaffected | Regression | ALL | curl |

---

## Regression Checklist

| # | Check | Why | Method |
|---|---|---|---|
| R1 | POS customer-lookup existing fields unchanged | E-D extends response | curl diff |
| R2 | S3 media header upload (CR-036) still works | E-A adds functions to s3.py | curl |
| R3 | Customer detail page existing sections | E-F adds new card | screenshot |
| R4 | POS auth (X-API-Key) pattern | E-B new endpoints use verify_pos_auth | curl |
| R5 | CRM auth (JWT) pattern | E-E new endpoint uses get_current_user | curl |

---

## Files WILL Change

| File | Edits |
|---|---|
| `core/s3.py` | E-A (2 new functions) |
| `routers/pos.py` | E-B (2 new endpoints + imports), E-D (lookup extension) |
| `routers/customers.py` | E-E (1 new endpoint + import) |
| `frontend/src/pages/CustomerDetailPage.jsx` | E-F (Documents card section) |
| `backend/server.py` | E-G (index creation) |

## Files WILL NOT Change

`core/whatsapp.py`, `core/loyalty.py`, `core/coupon.py`, `core/campaign_jobs.py`, `routers/campaigns.py`, `routers/auth.py`, `routers/whatsapp.py`, `routers/analytics.py`, `models/schemas.py`, `services/invoice_generator.py`, `services/analytics_service.py`, invoice templates, WhatsApp variable registry.

---

## Dependency on CR-071

CR-071 E-D and CR-072 E-D both modify the `pos_customer_lookup` response dict. Changes are **additive and non-conflicting**:
- CR-071 adds: `customer_type`, `gst_name`, `gst_number`, `is_b2b` (4 scalar fields)
- CR-072 adds: `documents` (1 grouped dict field)

**Recommended**: Implement CR-071 first, then CR-072. CR-072 E-D adds `"documents": doc_grouped,` line after CR-071's `"is_b2b"` line.

---

```
Planning complete: CR-072
Stage: Implementation Plan (detailed, edit-by-edit)
Code reality: FULL (all line numbers verified against current code)
Risk: HIGH (E-B, E-D: POS API + S3 + PII) / MEDIUM (E-A, E-E, E-F, E-G)
Files WILL change: core/s3.py, routers/pos.py, routers/customers.py, CustomerDetailPage.jsx, server.py
Files WILL NOT touch: core/whatsapp.py, core/loyalty.py, core/coupon.py, models/schemas.py, invoice templates
Owner decisions: ALL LOCKED (Q1–Q7)
Docs: planning/CR_072_DETAILED_IMPLEMENTATION_PLAN.md
Next: Owner approval → Implementation Agent
```
