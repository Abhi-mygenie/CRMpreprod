# POS ↔ CRM: API Contract — CR-071 (B2B Customer) + CR-072 (Document Capture)

**Version**: 2.0 FINAL  
**Date**: 2026-08-04  
**From**: CRM Team  
**To**: POS Team (Frontend + Backend)  
**Status**: ✅ LIVE — CRM implemented + QA passed (13/13). POS may integrate.  
**Auth**: Same `X-API-Key` as all existing `/api/pos/*` endpoints. Zero new keys needed.  
**Preview URL**: `https://preprod-crm-deploy.preview.emergentagent.com`

---

## Summary of Changes

| # | What | Type | Breaking? | CR | Audience |
|---|---|---|---|---|---|
| 1 | `POST /api/pos/orders` — 2 new optional fields | Existing | ❌ No | CR-071 | **POS Backend only** |
| 2 | `POST /api/pos/customer-lookup` — 5 new response fields | Existing | ❌ No | CR-071+072 | POS FE + Backend |
| 3 | `POST /api/pos/customers` — `gst_name`, `gst_number` (existing) + `is_b2b` (new) | Existing | ❌ No | CR-071 | POS FE |
| 4 | `PUT /api/pos/customers/{id}` — `gst_name`, `gst_number` (existing) + `is_b2b` (new) | Existing | ❌ No | CR-071 | POS FE |
| 5 | **NEW** `POST /api/pos/customers/{id}/documents` | New | N/A | CR-072 | POS FE |
| 6 | **NEW** `GET /api/pos/customers/{id}/documents` | New | N/A | CR-072 | POS FE |

**Backward compatibility**: All changes are additive. Existing POS payloads work unchanged. POS can adopt incrementally.

---

## String Constants

| Constant | Exact values | Used in |
|---|---|---|
| `customer_type` | `"normal"` (B2C, default) · `"corporate"` (B2B) | All customer endpoints |
| `doc_type` | `"license"` · `"passport"` · `"aadhaar"` · `"pan_card"` · `"voter_id"` · `"other"` | Document endpoints |

---

## Part 1 — CR-071: B2B Customer GST

### 1.1 Order Webhook — 2 New Optional Fields

> **Audience: POS Backend only.** POS FE does NOT call this endpoint. POS Backend remaps its internal fields (`custGST` / `custGSTName`) before forwarding to CRM.

**Endpoint**: `POST /api/pos/orders`

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `gst_name` | string \| null | Optional | `null` | Registered business name. Send when customer has GST billing. |
| `gst_number` | string \| null | Optional | `null` | GSTIN (15-char). Send when customer has GST billing. |

**Example** (new fields only — rest of payload unchanged):
```json
{
    "...existing order fields...": "...",
    "gst_name": "ABC Pvt Ltd",
    "gst_number": "27ABCDE1234F1Z5"
}
```

**CRM behaviour**:
- Present + non-empty → customer auto-updated: `gst_name`, `gst_number`, `is_b2b=true`, `customer_type="corporate"`. Invoice shows "Bill To: ABC Pvt Ltd" + GSTIN.
- Absent / null / empty → **no change** to existing B2B fields. Never downgrades `corporate` → `normal`.
- Only sent when cashier manually fills GST — not on every order.

---

### 1.2 Customer Create + Update — `gst_name`, `gst_number`, `is_b2b`

> **Audience: POS FE** (for check-in / profile edit flows).

**Endpoints**: `POST /api/pos/customers` · `PUT /api/pos/customers/{id}`

| Field | Type | Required | Default | Already existed? | Description |
|---|---|---|---|---|---|
| `gst_name` | string \| null | Optional | `null` | ✅ Yes | Business name |
| `gst_number` | string \| null | Optional | `null` | ✅ Yes | GSTIN |
| `is_b2b` | bool \| null | Optional | `null` | 🆕 New | Explicit flag. CRM auto-derives from `gst_number` so POS can omit. |

POS FE can add `gst_name` + `gst_number` to `updateCustomer()` immediately.

---

### 1.3 Customer Lookup — 4 New Response Fields

**Endpoint**: `POST /api/pos/customer-lookup`

**Full response** (all fields):
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
        "is_b2b": true,

        "documents": {
            "aadhaar": [
                {"id": "doc_f9b2d3a1", "file_name": "aadhaar_front_primary.jpg", "content_type": "image/jpeg", "url": "https://...presigned...", "uploaded_at": "2026-08-04T10:30:00Z"},
                {"id": "doc_e8c1b2a0", "file_name": "aadhaar_back_primary.jpg", "content_type": "image/jpeg", "url": "https://...presigned...", "uploaded_at": "2026-08-04T10:29:00Z"}
            ],
            "pan_card": [
                {"id": "doc_d7a0c9b8", "file_name": "pan_front_primary.jpg", "content_type": "image/jpeg", "url": "https://...presigned...", "uploaded_at": "2026-08-03T09:15:00Z"}
            ]
        }
    }
}
```

**New fields**:

| Field | Type | B2C value | B2B value | Description |
|---|---|---|---|---|
| `customer_type` | string | `"normal"` | `"corporate"` | Customer classification |
| `gst_name` | string \| null | `null` | `"ABC Pvt Ltd"` | Business name |
| `gst_number` | string \| null | `null` | `"27ABCDE1234F1Z5"` | GSTIN |
| `is_b2b` | boolean | `false` | `true` | B2B flag |
| `documents` | object | `{}` | `{...}` | Documents grouped by doc_type (see Part 2) |

---

## Part 2 — CR-072: Hotel Customer Document Capture

### 2.1 Upload Document (NEW)

```
POST /api/pos/customers/{customer_id}/documents
```

**Auth**: `X-API-Key`  
**Content-Type**: `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `doc_type` | string (form field) | ✅ | One of: `license`, `passport`, `aadhaar`, `pan_card`, `voter_id`, `other` |
| `file` | binary (file upload) | ✅ | Max 5MB. Allowed: `image/jpeg`, `image/png`, `image/webp`, `application/pdf` |

**cURL**:
```bash
curl -X POST \
  "https://<CRM_URL>/api/pos/customers/{customer_id}/documents" \
  -H "X-API-Key: <api_key>" \
  -F "doc_type=aadhaar" \
  -F "file=@aadhaar_front_primary.jpg"
```

**Success (200)**:
```json
{
    "success": true,
    "message": "Document uploaded successfully",
    "data": {
        "document_id": "doc_f9b2d3a1",
        "doc_type": "aadhaar",
        "file_name": "aadhaar_front_primary.jpg",
        "url": "https://...presigned-url-valid-15-min...",
        "uploaded_at": "2026-08-04T10:30:00Z"
    }
}
```

**Errors**:

| Code | When | Example |
|---|---|---|
| 400 | Invalid `doc_type` | `Invalid doc_type 'xyz'. Allowed: ['license', 'passport', 'aadhaar', 'pan_card', 'voter_id', 'other']` |
| 400 | File >5MB | `File too large (...). Max: 5242880 bytes (5MB)` |
| 400 | Bad MIME type | `Unsupported file type 'text/plain'. Allowed: [...]` |
| 404 | Customer not found | `Customer not found` |
| 503 | S3 unavailable | `AWS S3 not configured` |

**Rules**:
- **Max 5 files per doc_type per customer**. 6th upload auto-prunes the oldest.
- **No delete endpoint**. Upload-only. New upload appears first (newest-first).
- **Private S3 storage**. Access only via pre-signed URLs (15min expiry).
- **Upload timing**: Phase 1 = check-in only. Phase 2 = mid-stay (same endpoint, no CRM change).

---

### 2.2 Get Customer Documents (NEW)

```
GET /api/pos/customers/{customer_id}/documents
```

**Auth**: `X-API-Key`

**Success (200)**:
```json
{
    "success": true,
    "message": "Documents retrieved",
    "data": {
        "documents": {
            "aadhaar": [
                {
                    "id": "doc_f9b2d3a1",
                    "file_name": "aadhaar_front_primary.jpg",
                    "content_type": "image/jpeg",
                    "file_size": 245760,
                    "url": "https://...presigned...",
                    "uploaded_at": "2026-08-04T10:30:00Z"
                },
                {
                    "id": "doc_e8c1b2a0",
                    "file_name": "aadhaar_back_primary.jpg",
                    "content_type": "image/jpeg",
                    "file_size": 198000,
                    "url": "https://...presigned...",
                    "uploaded_at": "2026-08-04T10:29:00Z"
                }
            ],
            "pan_card": [
                {
                    "id": "doc_d7a0c9b8",
                    "file_name": "pan_front_primary.jpg",
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

- **Grouped by `doc_type`**, newest-first within each group
- Empty: `{"documents": {}}`
- Only doc_types with uploads appear as keys
- **Signed URL caching**: POS should call this endpoint every time the documents section is opened — never cache URLs beyond 15 minutes

---

## Part 3 — Doc Type Reference

| POS Dropdown | API value | Notes |
|---|---|---|
| License | `license` | Driving licence |
| Passport | `passport` | |
| Aadhar card | `aadhaar` | Front + back are separate uploads, same type |
| PAN card | `pan_card` | |
| Voter ID | `voter_id` | Added per POS P5 request |
| Other | `other` | Catch-all |

**File naming convention** (POS-side):  
`{doc_type}_{side}_{guest_slot}.{ext}`  
Examples: `aadhaar_front_primary.jpg`, `passport_front_adult2.pdf`, `voter_id_front_primary.jpg`  
CRM stores whatever filename POS sends.

---

## Part 4 — Backward Compatibility

1. **`POST /api/pos/orders`**: Existing payloads without `gst_name`/`gst_number` work exactly as before.
2. **`POST /api/pos/customer-lookup`**: New fields are additive. POS code reading only existing fields is unaffected.
3. **`POST/PUT /api/pos/customers`**: `gst_name` + `gst_number` already existed. `is_b2b` is new but optional with `null` default.
4. **New `/documents` endpoints**: Net-new routes, don't affect anything existing.

---

## Part 5 — POS Clarifications Answered

| # | Question | Answer |
|---|---|---|
| C1 | Is `"normal"` the exact B2C `customer_type` string? | ✅ Yes. Two values: `"normal"` (B2C) and `"corporate"` (B2B). POS FE can hardcode. |
| C2 | Is §1.1 (POST /api/pos/orders) for POS Backend? | ✅ Yes. POS Backend only. POS FE does NOT call this endpoint. |
| C3 | Are `gst_name` + `gst_number` accepted on PUT/POST customers today? | ✅ Yes. Both fields exist on both endpoints already. POS FE can add to `updateCustomer()` now. |
| C4 | Is hotel check-in visit recording (dates, room, amounts) in scope? | ❌ Deferred. Not in CR-071/072. Room/folio data exists in CR-014 (invoice). A dedicated hotel visit ledger would be a new CR if needed. |
| B1 | Add `voter_id` to allowed doc_type enum? | ✅ Done. Enum is: `license`, `passport`, `aadhaar`, `pan_card`, `voter_id`, `other`. |

---

## Part 6 — POS Integration Checklist

| Step | Owner | Status |
|---|---|---|
| CRM implementation | CRM | ✅ Done |
| CRM QA (13/13 pass) | CRM | ✅ Done |
| POS contract validation | POS | ✅ Done |
| POS clarifications C1–C4, B1 | Both | ✅ Done |
| POS FE: read B2B fields from customer-lookup | POS FE | ⬜ Ready |
| POS FE: add `gst_name`/`gst_number` to updateCustomer() | POS FE | ⬜ Ready |
| POS FE: integrate document upload at check-in | POS FE | ⬜ Ready |
| POS FE: display documents from customer-lookup | POS FE | ⬜ Ready |
| POS Backend: add `gst_name`/`gst_number` to order webhook | POS BE | ⬜ Ready |
| E2E test on preprod | Both | ⬜ Pending |

---

*Contract v2.0 FINAL — 2026-08-04 | CRM: implemented + QA passed | POS: validated + clarified*
