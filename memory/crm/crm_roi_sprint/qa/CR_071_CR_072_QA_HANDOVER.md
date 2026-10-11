# CR-071 + CR-072 — QA Handover

**Date**: 2026-08-04  
**From**: Implementation Agent  
**CRs**: CR-071 (B2B Customer Capture) + CR-072 (Hotel Document Capture)  
**Self-test**: PASS (backend running, frontend compiled, API endpoints responding)

---

## Test Credentials

| Account | Password | Tenant |
|---|---|---|
| owner@kunafamahal.com | Qplazm@10 | Kunafa Mahal (restaurant_689) |
| owner@hungry.com | Qplazm@10 | Hungry Keya (restaurant_634) |
| owner@palmhouse.com | Qplazm@10 | Palm House (hotel, restaurant_558) |

---

## CR-071 — What to Test

### T1: POS order with B2B fields
- `POST /api/pos/orders` with `gst_name="Test Corp"` + `gst_number="27TESTGST1234Z5"` + normal order payload
- Verify: customer record has `is_b2b: true`, `customer_type: "corporate"`, `gst_name`, `gst_number`

### T2: POS order without B2B fields (regression)
- `POST /api/pos/orders` without `gst_name`/`gst_number`
- Verify: no B2B fields clobbered on existing customer

### T3: Customer-lookup B2B response
- `POST /api/pos/customer-lookup` for a B2B customer
- Verify: response includes `customer_type`, `gst_name`, `gst_number`, `is_b2b`

### T4: WhatsApp variables
- `GET /api/whatsapp/variables`
- Verify: `customer_gst_name` and `customer_gst_number` present (43 total)

### T5: Invoice Bill To (food)
- Generate invoice for B2B customer → verify "Bill To: {gst_name}" + "Contact: {name}" + GSTIN
- Generate invoice for B2C customer → verify "Name: {name}" (no Bill To)

### T6: `is_b2b` in customer API
- `GET /api/customers` and `GET /api/customers/{id}`
- Verify: `is_b2b` field present (null for existing B2C)

---

## CR-072 — What to Test

### T7: Document upload
- `POST /api/pos/customers/{id}/documents` with multipart form (doc_type=aadhaar, file=image.jpg)
- Verify: 200, returns signed URL, document stored in DB

### T8: Document validation
- Invalid doc_type → 400
- File >5MB → 400
- Non-image file → 400
- Wrong customer_id → 404
- S3 not configured → 503 (if S3 env vars cleared)

### T9: Document listing
- `GET /api/pos/customers/{id}/documents`
- Verify: grouped by doc_type, newest first, signed URLs

### T10: Max docs per type (Q6)
- Upload 6 docs with same doc_type → verify oldest pruned, 5 remain

### T11: Customer-lookup includes documents
- `POST /api/pos/customer-lookup` for customer with docs
- Verify: `documents` field present, grouped

### T12: CRM documents endpoint
- `GET /api/customers/{id}/documents` with JWT auth
- Verify: same grouped format as POS endpoint

### T13: CustomerDetailPage Documents section
- Navigate to customer detail → verify "Documents" card visible
- "No documents uploaded yet" for customers without docs
- With docs: grouped by type, download links work

---

## Files Changed

| File | CR | Change |
|---|---|---|
| `models/schemas.py` | CR-071 | `is_b2b` added to 3 models (CustomerBase, CustomerUpdate, Customer) |
| `routers/pos.py` | CR-071+072 | B2B on webhook + update_set + lookup; 2 new doc endpoints; imports |
| `core/whatsapp_variables.py` | CR-071 | 2 new variables |
| `services/invoice_generator.py` | CR-071 | `gst_name` read + context pass (food + hotel common) |
| `templates/invoice_food.html` | CR-071 | Bill To layout |
| `templates/invoice_hotel_room.html` | CR-071 | Bill To + GSTIN |
| `templates/invoice_hotel_folio.html` | CR-071 | Bill To + GSTIN |
| `core/s3.py` | CR-072 | `put_private_object` + `generate_presigned_url` |
| `routers/customers.py` | CR-072 | Documents view endpoint + import |
| `server.py` | CR-072 | `customer_documents` indexes |
| `CustomerDetailPage.jsx` | CR-072 | Documents card section |
