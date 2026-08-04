# POS ↔ CRM: API Contract — CR-071 (B2B Customer) + CR-072 (Document Capture)

**Date**: 2026-08-04  
**From**: CRM Team  
**To**: POS Team  
**Status**: 🟡 PENDING POS VALIDATION — No CRM code changes until POS confirms  
**Auth**: Same `X-API-Key` as all existing `/api/pos/*` endpoints. No new key needed.

---

## Summary of Changes

| # | What | Type | Breaking? | CR |
|---|---|---|---|---|
| 1 | `POST /api/pos/orders` accepts 2 new optional fields | Existing endpoint — additive | ❌ No | CR-071 |
| 2 | `POST /api/pos/customer-lookup` returns 5 new fields | Existing endpoint — additive | ❌ No | CR-071 + CR-072 |
| 3 | `POST /api/pos/customers` accepts 1 new optional field | Existing endpoint — additive | ❌ No | CR-071 |
| 4 | `PUT /api/pos/customers/{id}` accepts 1 new optional field | Existing endpoint — additive | ❌ No | CR-071 |
| 5 | **NEW** `POST /api/pos/customers/{id}/documents` | New endpoint | N/A (new) | CR-072 |
| 6 | **NEW** `GET /api/pos/customers/{id}/documents` | New endpoint | N/A (new) | CR-072 |

**Backward compatibility**: All changes to existing endpoints are additive (new optional fields). POS can adopt incrementally — existing payloads continue to work unchanged.

---

## Part 1 — CR-071: B2B Customer GST Pass-Through

### 1.1 Order Webhook — New Optional Fields

**Endpoint**: `POST /api/pos/orders`  
**Change**: 2 new optional fields in the order payload

#### Current payload (unchanged fields omitted for brevity):
```json
{
    "restaurant_id": "restaurant_689",
    "order_id": "870001",
    "cust_mobile": "9999999999",
    "cust_name": "Rahul Kumar",
    "cust_email": "rahul@example.com",
    "order_amount": 1500.00,
    "items": [...]
}
```

#### New fields (add when customer is B2B):
```json
{
    "restaurant_id": "restaurant_689",
    "order_id": "870001",
    "cust_mobile": "9999999999",
    "cust_name": "Rahul Kumar",
    "cust_email": "rahul@example.com",
    "order_amount": 1500.00,

    "gst_name": "ABC Pvt Ltd",
    "gst_number": "27ABCDE1234F1Z5",

    "items": [...]
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `gst_name` | string or null | Optional | `null` | Registered business name. Send when customer has GST billing. |
| `gst_number` | string or null | Optional | `null` | GSTIN (15-char alphanumeric). Send when customer has GST billing. |

**CRM behaviour when these fields are present**:
- Customer record auto-updated: `gst_name`, `gst_number` stored
- `is_b2b` auto-set to `true`
- `customer_type` auto-set to `"corporate"`
- Invoice shows "Bill To: ABC Pvt Ltd" + GSTIN line

**CRM behaviour when these fields are absent/null**:
- No change to existing customer B2B fields (never downgrades)
- Invoice shows normal "Name: Rahul Kumar" layout

---

### 1.2 Customer Create — New Optional Field

**Endpoint**: `POST /api/pos/customers`  
**Change**: 1 new optional field

Already supported: `gst_name`, `gst_number`, `customer_type` (these already exist on this endpoint).

**New field**:

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `is_b2b` | boolean or null | Optional | `null` | Explicit B2B flag. Auto-derived by CRM if `gst_number` is non-empty, so POS can omit this. |

---

### 1.3 Customer Update — New Optional Field

**Endpoint**: `PUT /api/pos/customers/{id}`  
**Change**: 1 new optional field (same as 1.2)

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `is_b2b` | boolean or null | Optional | `null` | Same as above. |

---

### 1.4 Customer Lookup — New Response Fields

**Endpoint**: `POST /api/pos/customer-lookup`  
**Change**: 4 new fields in the response `data` object

#### Current response (fields shown):
```json
{
    "success": true,
    "message": "Customer found",
    "data": {
        "registered": true,
        "customer_id": "cust_abc123",
        "name": "Rahul Kumar",
        "phone": "9999999999",
        "tier": "Gold",
        "total_points": 450,
        "points_value": 45.0,
        "wallet_balance": 200.0,
        "total_visits": 12,
        "total_spent": 18500.0,
        "allergies": [],
        "favorites": ["Butter Chicken"],
        "last_visit": "2026-08-01T14:30:00Z",
        "addresses": []
    }
}
```

#### New response (4 new fields added):
```json
{
    "success": true,
    "message": "Customer found",
    "data": {
        "registered": true,
        "customer_id": "cust_abc123",
        "name": "Rahul Kumar",
        "phone": "9999999999",
        "tier": "Gold",
        "total_points": 450,
        "points_value": 45.0,
        "wallet_balance": 200.0,
        "total_visits": 12,
        "total_spent": 18500.0,
        "allergies": [],
        "favorites": ["Butter Chicken"],
        "last_visit": "2026-08-01T14:30:00Z",
        "addresses": [],

        "customer_type": "corporate",
        "gst_name": "ABC Pvt Ltd",
        "gst_number": "27ABCDE1234F1Z5",
        "is_b2b": true
    }
}
```

| Field | Type | When | Description |
|---|---|---|---|
| `customer_type` | `"normal"` or `"corporate"` | Always | Customer classification. Default `"normal"`. |
| `gst_name` | string or null | Always | Business name. `null` for B2C customers. |
| `gst_number` | string or null | Always | GSTIN. `null` for B2C customers. |
| `is_b2b` | boolean | Always | `true` if customer has GSTIN, `false` otherwise. |

**POS usage**: When `is_b2b: true`, POS billing screen can show a B2B badge, pre-fill GST fields, and address the invoice to the business name.

---

## Part 2 — CR-072: Hotel Customer Document Capture

### 2.1 Upload Document (NEW ENDPOINT)

```
POST /api/pos/customers/{customer_id}/documents
```

**Auth**: `X-API-Key` header (same as all POS endpoints)  
**Content-Type**: `multipart/form-data`

#### Request

| Field | Type | Required | Description |
|---|---|---|---|
| `doc_type` | string (form field) | ✅ Yes | One of: `license`, `passport`, `aadhaar`, `pan_card`, `other` |
| `file` | binary (file upload) | ✅ Yes | Image or PDF. Max 5MB. |

**Allowed file types**: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`

#### cURL Example

```bash
curl -X POST \
  "https://<CRM_URL>/api/pos/customers/cust_abc123/documents" \
  -H "X-API-Key: <restaurant_api_key>" \
  -F "doc_type=aadhaar" \
  -F "file=@/path/to/aadhaar_front.jpg"
```

#### Success Response (200)

```json
{
    "success": true,
    "message": "Document uploaded successfully",
    "data": {
        "document_id": "doc_f9b2d3a1",
        "doc_type": "aadhaar",
        "file_name": "aadhaar_front.jpg",
        "url": "https://mygenie-prod.s3.ap-south-1.amazonaws.com/customers/cust_abc123/docs/aadhaar/a1b2c3.jpg?X-Amz-Signature=...",
        "uploaded_at": "2026-08-04T10:30:00Z"
    }
}
```

The `url` is a **pre-signed URL valid for 15 minutes**. After expiry, fetch a fresh URL via the GET endpoint.

#### Error Responses

| Code | When | Response |
|---|---|---|
| 400 | Invalid `doc_type` | `{"detail": "Invalid doc_type 'xyz'. Allowed: ['license', 'passport', 'aadhaar', 'pan_card', 'other']"}` |
| 400 | File too large | `{"detail": "File too large (6291456 bytes). Max: 5242880 bytes (5MB)"}` |
| 400 | Unsupported file type | `{"detail": "Unsupported file type 'text/plain'. Allowed: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']"}` |
| 404 | Customer not found | `{"detail": "Customer not found"}` |
| 503 | S3 not configured | `{"detail": "AWS S3 not configured"}` |

#### Storage Rules

- **Max 5 files per doc_type per customer**. When a 6th file is uploaded for the same type, the oldest is auto-removed from the database (S3 object retained for audit).
- **No delete endpoint**. Upload-only. To "replace" a document, upload a new one — it appears first (newest-first sort).
- Documents are stored **privately** on S3 (no public URL). Access only via pre-signed URLs.

---

### 2.2 Get Customer Documents (NEW ENDPOINT)

```
GET /api/pos/customers/{customer_id}/documents
```

**Auth**: `X-API-Key` header

#### Success Response (200)

```json
{
    "success": true,
    "message": "Documents retrieved",
    "data": {
        "documents": {
            "aadhaar": [
                {
                    "id": "doc_f9b2d3a1",
                    "file_name": "aadhaar_front.jpg",
                    "content_type": "image/jpeg",
                    "file_size": 245760,
                    "url": "https://...presigned...",
                    "uploaded_at": "2026-08-04T10:30:00Z"
                },
                {
                    "id": "doc_e8c1b2a0",
                    "file_name": "aadhaar_back.jpg",
                    "content_type": "image/jpeg",
                    "file_size": 198000,
                    "url": "https://...presigned...",
                    "uploaded_at": "2026-08-04T10:29:00Z"
                }
            ],
            "pan_card": [
                {
                    "id": "doc_d7a0c9b8",
                    "file_name": "pan.jpg",
                    "content_type": "image/jpeg",
                    "file_size": 312000,
                    "url": "https://...presigned...",
                    "uploaded_at": "2026-08-03T09:15:00Z"
                }
            ]
        }
    }
}
```

**Key points**:
- **Grouped by `doc_type`** — each key is a doc_type, value is array of documents
- **Sorted newest-first** within each type
- **Pre-signed URLs** expire after 15 minutes — POS should fetch fresh URLs before displaying if cached
- **Empty response**: `{"documents": {}}` when no documents exist
- Only doc_types that have uploads appear as keys

---

### 2.3 Customer Lookup — Documents in Response

**Endpoint**: `POST /api/pos/customer-lookup`  
**Change**: 1 new field `documents` in the response `data` object

```json
{
    "success": true,
    "data": {
        "registered": true,
        "customer_id": "cust_abc123",
        "name": "Rahul Kumar",
        "phone": "9999999999",
        "tier": "Gold",
        "...existing fields...": "...",

        "customer_type": "corporate",
        "gst_name": "ABC Pvt Ltd",
        "gst_number": "27ABCDE1234F1Z5",
        "is_b2b": true,

        "documents": {
            "aadhaar": [
                {
                    "id": "doc_f9b2d3a1",
                    "file_name": "aadhaar_front.jpg",
                    "content_type": "image/jpeg",
                    "url": "https://...presigned...",
                    "uploaded_at": "2026-08-04T10:30:00Z"
                }
            ]
        }
    }
}
```

| Field | Type | When | Description |
|---|---|---|---|
| `documents` | object (grouped) | Always | Documents grouped by doc_type, newest first. Empty `{}` if no documents. |

**POS usage**: When a returning hotel guest is looked up by phone, POS immediately gets their identity documents (Aadhaar, PAN, etc.) — no separate API call needed. Front desk can verify identity without asking the guest to re-submit documents.

---

## Part 3 — Doc Type Reference

| POS Dropdown Label | API `doc_type` Value | Description |
|---|---|---|
| License | `license` | Driving licence |
| Passport | `passport` | Passport |
| Aadhar card | `aadhaar` | Aadhaar card (front or back — separate uploads) |
| PAN card | `pan_card` | PAN card |
| Other | `other` | Any other identity document |

---

## Part 4 — Integration Timeline

| Step | Who | What |
|---|---|---|
| 1 | **POS** | ✅ Validate this contract — confirm field names, types, response shape |
| 2 | **CRM** | Implement CR-071 + CR-072 per approved plans |
| 3 | **CRM** | QA + self-test against contract |
| 4 | **POS** | Start integration (can begin with lookup response changes + upload endpoint) |
| 5 | **Both** | E2E test on preprod (CRM uploads via POS curl → POS reads via lookup) |

**POS can start their integration work after Step 1** (this contract validation). CRM implementation and POS integration can proceed in parallel.

---

## Part 5 — Backward Compatibility Guarantees

1. **`POST /api/pos/orders`**: Existing payloads without `gst_name`/`gst_number` continue to work exactly as today. No B2B fields are set unless POS explicitly sends them.
2. **`POST /api/pos/customer-lookup`**: New fields are additive. POS code that reads only existing fields is unaffected. New fields (`customer_type`, `gst_name`, `gst_number`, `is_b2b`, `documents`) can be safely ignored by older POS versions.
3. **`POST/PUT /api/pos/customers`**: New `is_b2b` field is optional with `null` default. Existing create/update payloads unchanged.
4. **New endpoints** (`/documents`): These are net-new routes. They don't affect any existing endpoint.

---

## Part 6 — Questions for POS Team

| # | Question | Context |
|---|---|---|
| P1 | **Confirm field names**: Are `gst_name` and `gst_number` the exact field names POS will send on orders? Or does POS use different names (e.g., `gst_customer_name`, `gstin`)? CRM can add `AliasChoices` for backward compat. | CR-071 |
| P2 | **Order webhook timing**: Will POS send `gst_name`/`gst_number` on every order for a B2B customer, or only on the first order? CRM guards against blank-overwrite either way. | CR-071 |
| P3 | **Document upload trigger**: When does POS upload documents — at check-in only, or can hotel staff upload later during the stay? | CR-072 |
| P4 | **Signed URL caching**: POS should NOT cache signed URLs beyond 15 minutes. Does POS have a mechanism to refresh URLs when displaying documents? | CR-072 |
| P5 | **File naming**: Does POS send a meaningful `filename` in the multipart upload (e.g., `aadhaar_front.jpg`), or a generic name (e.g., `upload.jpg`)? CRM stores whatever POS sends. | CR-072 |

---

**Please validate this contract and respond with:**
1. ✅ Approved as-is, OR
2. 🔄 Changes needed (list field name changes, type changes, or missing fields)
3. Answers to P1–P5

CRM will not begin implementation until POS confirms.

---

*Contract authored: 2026-08-04 | CRM Planning Agent | CR-071 + CR-072*
