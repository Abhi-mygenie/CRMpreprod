# CR-075 — Intake Document
## Hotel Guest Document Migration from POS to CRM

**ID**: CR-075  
**Date registered**: 2026-08-06  
**Role**: Intake Agent  
**Source**: SESSION_2026_08_06_HANDOVER.md (endpoint validation) + 2026-08-06 live curl validation session  
**Status**: ✅ INTAKE CLOSED — Q1-Q5 all locked · Impact Analysis complete · Ready for implementation plan  

---

## 1. Problem Statement

When hotel guests check in via the MyGenie POS, staff collect and upload ID documents
(Aadhaar card, Passport, Driving Licence, etc.) against the guest's profile. These
documents are stored as image files on the POS server (`manage.mygenie.online/storage/IDFile/`).

The CRM currently has **no visibility** into these documents. Hotel staff using the CRM
to review a guest's profile (e.g. Palm House, Jeh's Nest tenants) cannot see any
uploaded ID document. The `customer_documents` collection (built in CR-072) exists in
the CRM and is ready to receive records — it is just never populated from the POS side.

---

## 2. Classification

| Field | Value |
|---|---|
| Type | CR (Change Request / Feature) |
| Severity | P2 — important, workaround exists (documents visible in POS app directly) |
| Risk | LOW — additive only; no hotspot files; new code inside existing sync function only |
| Blast radius | SMALL — `routers/migration.py` (extend one function), `customer_documents` collection (new writes only), S3 |
| Duplicate check | DISTINCT — no other CR covers document migration from POS booking_documents |

---

## 3. Evidence — Two Live Validation Sessions

### Session 1 (2026-08-06 endpoint validation — see `CR_075_ENDPOINT_VALIDATION.md`)
- Confirmed endpoint returns `booking_documents` field per customer
- Confirmed `gst_name` / `gst_number` already read by existing sync (no new code needed for GST)
- Token for restaurant_id=478 used; hotel tokens must come from `users.mygenie_token` per tenant

### Session 2 (2026-08-06 live curl — this session, token restaurant_id=478)
Full curl run against live preprod endpoint. Results:

**Response structure confirmed:**
```
status: true | restaurant_id: 478 | total_customers: 64
```

**Pagination: NOT required.** All 64 customers returned in a single response. No `page`/`per_page`/`has_more` keys in response. Existing sync code paginates defensively — this is fine (extra pages will simply return empty `customers: []`).

**Real documents found: 32 entries across 5 customers**

| id_type (POS) | Count | CRM doc_type |
|---|---|---|
| License | 16 | `license` |
| Aadhar card | 10 | `aadhaar` |
| Passport | 5 | `passport` |
| Other | 1 | `other` |

**back_image presence:**
- 16 of 32 docs have both `front_image` + `back_image`
- 16 of 32 have `front_image` only (no back) — each is a single `customer_documents` row

**Image host breakdown (front_image):**

| Host | Count | HTTP status |
|---|---|---|
| `manage.mygenie.online` | 17 | ✅ 200 — real images, 500KB–1MB |
| `dev.mygenie.online` | 6 | ✅ 200 — real images |
| `preprod.mygenie.online` | 9 | ❌ 404 — permanently lost (see Gap 1) |

**GST data confirmed:** 9 customers have `gst_name` + `gst_number`, all `customer_type: corporate`.
GST backfill already works via existing sync — no new code needed.

---

## 4. Gap Analysis (Updated from Endpoint Validation)

### Gap 1 — 🔴 `preprod.mygenie.online` images are 404 (POS historical bug)
9 of 32 real document images have URLs like:
```
https://preprod.mygenie.online/storage/;/IDFile/2025-05-13-xxx.jpg
```
The `/storage/;/` semicolon is a POS-side URL generation bug from May 2025.
Even without the semicolon these files are 404 — the files no longer exist on the preprod server.

**CRM handling**: skip any URL where `"/storage/;/"` is in the path. Log as `source_404_skipped`.
**Action for POS team**: these 9 documents are permanently unrecoverable. Flag to POS team.

### Gap 2 — Image host is not always `manage.mygenie.online`
3 distinct hosts found in live data. All except `preprod` are reachable HTTP 200.
Migration script must download from whichever host the URL points to — no host filtering.

### Gap 3 — `id_type` mapping (corrected from live data)
The old validation doc listed "Driving License" but live data shows **"License"**:

| POS `id_type` | CRM `doc_type` |
|---|---|
| `"Aadhar card"` | `"aadhaar"` |
| `"Passport"` | `"passport"` |
| `"License"` | `"license"` |
| `"Pan card"` | `"pan_card"` (not seen in live data but keep) |
| `"Voter ID"` | `"voter_id"` (not seen in live data but keep) |
| `"Other"` | `"other"` |
| `"Select document type"` | **SKIP** |
| anything else | `"other"` |

### Gap 4 — Customer match must use phone, not name
9 of 64 customers have `name = null` or blank. The CRM match must use `phone` as the
primary lookup key (same as existing sync). Never match on name alone.

### Gap 5 — Stubs dominate (must filter aggressively)
Most customers have multiple `booking_documents` entries with:
```json
{"id_type": "Select document type", "front_image": "", "back_image": ""}
```
One customer had 55 booking_document entries — 40 were stubs. Skip logic is mandatory
and must run first before any S3/download work.

### Gap 6 — Token scope (per-tenant, hotel only)
This token was for restaurant_id=478 (a dev/test tenant).
Hotel tenants that need migration: **palmhouse (558)**, **jehsnest (635)**.
Token must be fetched from `users.mygenie_token` for each hotel tenant in DB.

---

## 5. Architecture Decision (Owner confirmed 2026-08-06)

**No new button, no new API route.**

The existing "Sync Customers" button on MigrationPage already calls the same POS endpoint.
The response already contains `booking_documents` — it is just never read.

**Change**: extend the existing `background_customer_sync()` function in `routers/migration.py`
to also process `booking_documents` after each customer is upserted.

This is the owner's preferred approach: same endpoint, same sync, one button, zero new UI.

---

## 6. Files That Will Change

⚠️ **FILE CORRECTION (Planning Agent 2026-08-06)**: Intake doc incorrectly named `routers/migration.py`. Code reality confirms `background_customer_sync()` is at `routers/customers.py:182`. See `planning/CR_075_IMPACT_ANALYSIS.md` §2.

| File | Change |
|---|---|
| `backend/routers/customers.py` | Extend `background_customer_sync()` (line 182): add `put_private_object` import, add helper call after `customer_id` resolved (~line 513), add new `_migrate_booking_documents()` helper function |

**Files that will NOT change:**
- `routers/migration.py` — handles order sync only; `background_customer_sync` is NOT here
- `frontend/src/pages/MigrationPage.jsx` — no UI change
- `core/coupon.py`, `core/loyalty.py`, `routers/pos.py` — no hotspot files touched
- `models/schemas.py` — no schema change (customer_documents schema exists from CR-072)
- `core/s3.py` — used as-is (adding `put_private_object` to import in customers.py only)

---

## 7. Implementation Sketch

```python
# Inside background_customer_sync(), after existing customer upsert loop:

ID_TYPE_MAP = {
    "Aadhar card": "aadhaar",
    "Passport": "passport",
    "License": "license",
    "Pan card": "pan_card",
    "Voter ID": "voter_id",
    "Other": "other",
}

for doc in mygenie_customer.get("booking_documents", []):
    id_type = doc.get("id_type", "")
    if id_type == "Select document type":
        continue
    doc_type = ID_TYPE_MAP.get(id_type, "other")

    for side, url in [("front", doc.get("front_image","")), ("back", doc.get("back_image",""))]:
        if not url:
            continue
        if "/storage/;/" in url:
            log("source_404_skipped", url); continue

        # Check duplicate before downloading
        existing = await db.customer_documents.find_one({
            "user_id": user_id, "customer_id": customer_id,
            "doc_type": doc_type, "side": side, "source_url": url
        })
        if existing:
            continue

        # Download + S3 upload
        img_bytes = requests.get(url, timeout=15).content
        s3_url = await put_public_object(img_bytes, ...)
        await db.customer_documents.insert_one({
            "user_id": user_id, "customer_id": customer_id,
            "doc_type": doc_type, "side": side,
            "source_url": url, "s3_url": s3_url,
            "uploaded_at": datetime.now(timezone.utc)
        })
```

---

## 8. Owner Decisions — LOCKED (2026-08-06)

**Q1 — LOCKED: Every sync** ✅
Document migration runs on every Sync Customers call. Idempotency guard (`source_url` dedup check) ensures re-running never creates duplicate rows. New POS documents uploaded after the first sync will automatically appear in CRM on next sync.

**Q2 — LOCKED: Skip + log** ✅
If an individual image download fails, skip that document and log the failure. Continue processing all remaining documents. Failures surface in the sync summary (`skipped_docs_count`, `failed_doc_urls[]`). Migration never aborts due to a single image error.

**Q3 — LOCKED: Whatever comes in API gets migrated** ✅
No host filtering. All reachable URLs are downloaded regardless of host (manage ✅, dev ✅). Single skip rule: URLs containing `/storage/;/` → `source_404_skipped` (do not attempt download).

**Q5 — LOCKED: Skip 5-doc cap during migration** ✅
All historical POS documents imported regardless of count per doc_type. Cap applies to future live POS uploads only. DECISIONS_LOG: 2026-08-06 §CR-075 Q5.

**Q4 — LOCKED: Follow CR-072 naming convention exactly** ✅ *(answered from code — no owner decision needed)*
Owner asked: *"after migration how crm will change the document name to follow convention we made so store it"*

Answer from `routers/pos.py:2175,2190` (CR-072 live implementation):
- **S3 key**: `customers/{customer_id}/docs/{doc_type}/{uuid}.{ext}` — same as live upload
- **file_name**: `{doc_type}_{side}.{ext}` — e.g. `aadhaar_front.jpg`, `aadhaar_back.jpg`
- **Storage**: `put_private_object` (private S3 + presigned URL — same as CR-072)
- **uploaded_by**: `"migration"` (distinguishes from `"pos"` live uploads)
- **source_url**: original POS URL stored for audit trail

The POS filename (e.g. `2025-08-16-689ff9c2ebbb1.png`) is **discarded**. CRM generates its own UUID key and assigns a clean `{doc_type}_{side}.{ext}` filename. This matches exactly what happens when a staff member uploads a document manually through POS today.

---

## 9. Acceptance Criteria (draft — for Planning Agent to finalise)

| AC | Verification |
|---|---|
| AC-1 | After sync, `customer_documents` has new rows for hotel tenant customers with real POS booking_documents |
| AC-2 | `id_type="Select document type"` stubs produce zero new rows |
| AC-3 | `/storage/;/` URLs are skipped and logged — no 404 download attempt |
| AC-4 | Running sync twice does not produce duplicate `customer_documents` rows |
| AC-5 | Customers with `name=null` are still matched and processed (phone-based match) |
| AC-6 | `back_image` produces a separate `customer_documents` row with `side="back"` |
| AC-7 | `manage.mygenie.online` and `dev.mygenie.online` images are downloadable and uploaded to S3 |
| AC-8 | Existing customer sync (name/phone/GST) continues to work — zero regression |

---

## 10. References

- Discovery + endpoint validation: `discovery/CR_075_ENDPOINT_VALIDATION.md`
- Session handover: `handoff/SESSION_2026_08_06_HANDOVER.md`
- customer_documents collection built in: CR-072
- S3 upload utility: `core/s3.py::put_public_object()`
- Existing sync function: `routers/migration.py::background_customer_sync()`
