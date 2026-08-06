# CR-075 — Endpoint Validation Findings
## Document Migration from POS Local Disk (Hotel Guests)

**Date**: 2026-08-06  
**Role**: Investigation Agent  
**Status**: VALIDATED — endpoint is viable. Ready for Intake in next session.

---

## Endpoint Proposed by POS Team

```
POST https://preprod.mygenie.online/api/v1/vendoremployee/whatsappcrm/customer-migration
Authorization: Bearer <mygenie_token>
```

This is the **existing customer migration endpoint** — the same one the CRM already uses in `routers/customers.py::background_customer_sync()`.

---

## What the Endpoint Returns (confirmed from live call)

**Top-level structure:**
```json
{
  "status": true,
  "restaurant_id": 478,
  "total_customers": 64,
  "customers": [...]
}
```

**Per-customer fields (all keys confirmed):**
`anniversary`, `booking_documents`, `country_code`, `created_time`, `customer_addresses`,
`customer_type`, `dob`, `email`, `gst_name`, `gst_number`, `id`, `loyalty_point`,
`name`, `phone`, `pos_id`, `restaurant_id`, `total_coupon_used`, `total_points_earned`,
`total_points_redeemed`, `total_wallet_received`, `total_wallet_used`, `updated_time`, `wallet_balance`

---

## Finding 1 — GST Backfill ✅ ALREADY WORKS

`gst_name` and `gst_number` **ARE present** in the response. The CRM migration code at
`routers/customers.py` lines 353-354 already reads both fields:

```python
"gst_name": mygenie_customer.get("gst_name"),
"gst_number": mygenie_customer.get("gst_number"),
```

And `customer_type` is read at line 486:
```python
customer_data["customer_type"] = mygenie_customer.get("customer_type") or "normal"
```

**Conclusion**: Running the existing MigrationPage sync (Sync Customers) already
backfills GST data for every customer. No new code needed for the GST part.

**Live evidence from call**: 9 customers in this tenant have GST data:
```
name=piyush Mygenie  gst_name=Harsh company  gst_number=ABCD345SML  type=corporate
name=saurav          gst_name=CAFE 103        gst_number=98765456787  type=corporate
```

---

## Finding 2 — Document Migration via `booking_documents` ✅ VIABLE

The response includes a `booking_documents` field per customer:

**Structure confirmed:**
```json
{
  "booking_documents": [
    {
      "name": "",
      "id_type": "Aadhar card",
      "front_image": "https://manage.mygenie.online/storage/IDFile/2025-08-16-689ff9c2ebbb1.png",
      "back_image":  "https://manage.mygenie.online/storage/IDFile/2025-08-16-689ff9c2ec0c7.png"
    }
  ]
}
```

**Real document example found:**
```
Customer: piyush Mygenie (phone: 9696759718)
  doc 1: id_type=Aadhar card
         front_image = https://manage.mygenie.online/storage/IDFile/2025-08-16-689ff9c2ebbb1.png
         back_image  = https://manage.mygenie.online/storage/IDFile/2025-08-16-689ff9c2ec0c7.png
Customer: parth (phone: 7602832329)
  doc 1: id_type=Other
         front_image = https://manage.mygenie.online/storage/IDFile/2025-12-12-693c2af624d4a.png
```

---

## Gaps / Things CR-075 Needs to Handle

### Gap 1 — Most `booking_documents` are empty stubs
The majority of customers have:
```json
{"name": "", "id_type": "Select document type", "front_image": "", "back_image": ""}
```
The migration script **must skip** rows where `id_type == "Select document type"` or
both `front_image` and `back_image` are empty.

### Gap 2 — `id_type` mapping required
POS values → CRM `doc_type` enum (`ALLOWED_DOC_TYPES`):

| POS `id_type` | CRM `doc_type` |
|---|---|
| `"Aadhar card"` | `"aadhaar"` |
| `"Pan card"` | `"pan_card"` |
| `"Passport"` | `"passport"` |
| `"Voter ID"` | `"voter_id"` |
| `"Driving License"` | `"license"` |
| `"Other"` or anything else | `"other"` |
| `"Select document type"` | **SKIP** |

### Gap 3 — Images are at `manage.mygenie.online`, not S3
Documents are hosted as public URLs at `manage.mygenie.online/storage/IDFile/`.
CR-075 migration script must:
1. `GET` the image from `manage.mygenie.online`
2. Upload it to S3 via `core/s3.py::put_public_object()`
3. Store the S3 URL in `customer_documents` collection

### Gap 4 — `back_image` is a separate upload
Each `booking_documents` entry may have both `front_image` and `back_image`.
These are 2 separate entries in `customer_documents` with the same `doc_type`.

### Gap 5 — Token scope
The token provided is for restaurant_id=478. For hotel tenants (palmhouse=558,
jehsnest=635), **the CRM must use per-tenant MyGenie tokens** (from `users.mygenie_token`
stored in DB after login) to call this endpoint for each hotel tenant.

### Gap 6 — Pagination unclear for large tenants
This call returned all 64 customers in one response (no `page`/`per_page` in response).
Existing migration code paginates with `?page=N`. Need to confirm if `booking_documents`
is included on every page or only with a special flag.

---

## CRM Implementation Sketch (for Planning Agent next session)

```
For each hotel tenant:
  1. Get mygenie_token from users collection
  2. GET /api/v1/vendoremployee/whatsappcrm/customer-migration (paginated)
  3. For each customer:
     a. Find matching CRM customer by phone / pos_customer_id
     b. For each booking_document where id_type != "Select document type":
        - Map id_type → doc_type
        - If front_image non-empty: download → S3 upload → insert customer_documents
        - If back_image non-empty: download → S3 upload → insert customer_documents (same doc_type)
     c. If gst_name/gst_number non-empty AND CRM customer has placeholder:
        - Update customers.gst_name, gst_number, is_b2b=True, customer_type="corporate"
```

**Files expected to change**: new migration endpoint in `routers/migration.py` or
a standalone script — no hotspot files. LOW risk.

---

## Summary for Next Session

| Item | Finding |
|---|---|
| Endpoint viable? | ✅ YES — same endpoint CRM already uses |
| GST backfill needed? | ❌ Already works via existing migration sync |
| `booking_documents` present? | ✅ YES — has `id_type`, `front_image`, `back_image` |
| Empty stubs to filter? | ✅ YES — skip where `id_type == "Select document type"` |
| Image host | `manage.mygenie.online/storage/IDFile/` → must download + re-upload to S3 |
| Token requirement | Per-tenant mygenie_token from DB |
| New endpoint or CRM route? | New migration route in `routers/migration.py` |

**Next agent should start**: INTAKE role → register CR-075 formally → write intake doc.
**Reference this file**: `memory/crm/crm_roi_sprint/discovery/CR_075_ENDPOINT_VALIDATION.md`
