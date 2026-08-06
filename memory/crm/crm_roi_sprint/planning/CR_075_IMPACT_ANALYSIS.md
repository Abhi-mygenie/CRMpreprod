# CR-075 — Impact Analysis
## Hotel Guest Document Migration: POS booking_documents → CRM customer_documents

**ID**: CR-075  
**Date**: 2026-08-06  
**Role**: Planning Agent  
**Stage**: Impact Analysis  
**Source docs**: `discovery/CR_075_HOTEL_DOCUMENT_MIGRATION_INTAKE.md` · `discovery/CR_075_ENDPOINT_VALIDATION.md`  
**Risk**: LOW  

---

## 1. Registration Verified

CR-075 is registered in `CR_STATUS_DASHBOARD.md` (line 225, status: 🔵 INTAKE CLOSED).
Intake doc: `discovery/CR_075_HOTEL_DOCUMENT_MIGRATION_INTAKE.md` — Q1-Q4 all locked.

---

## 2. Code Reality Check — CORRECTION TO INTAKE DOC

**The intake doc named the wrong file.**

| Intake doc claim | Code reality |
|---|---|
| File: `routers/migration.py` | **WRONG** — `background_customer_sync()` is at `routers/customers.py:182` |
| Called from `migration.py` | **WRONG** — triggered by `POST /api/customers/sync-from-mygenie` in `customers.py:617` |

**Evidence**: `grep -rn "background_customer_sync" /app/backend/` → only hit in `routers/customers.py`.

`routers/migration.py` handles **order sync** only (`background_order_sync` + 8 endpoints).  
`routers/customers.py` handles **customer sync** (`background_customer_sync` + all customer CRUD).

**Impact on scope**: the implementation touches `routers/customers.py`, not `routers/migration.py`. Risk is unchanged (LOW) since customers.py is not in the hotspot list.

---

## 3. Data Flow Trace

### Current flow (Sync Customers button)

```
MigrationPage.jsx
  → POST /api/customers/sync-from-mygenie        (customers.py:617)
  → background_tasks.add_task(background_customer_sync, user_id, mygenie_token)
  → background_customer_sync(user_id, mygenie_token)   (customers.py:182)
      → httpx POST customer-migration?page=N      (POS API)
      → for each mygenie_customer:
          → upsert customer into db.customers
          → [booking_documents field is received but NEVER read ← CR-075 gap]
```

### Target flow after CR-075

```
background_customer_sync(user_id, mygenie_token)   (customers.py:182)
    → httpx POST customer-migration?page=N          (POS API — no change)
    → for each mygenie_customer:
        → upsert customer into db.customers         (no change)
        → customer_id resolved                      (no change)
        → [NEW] _migrate_booking_documents(         (new inner helper)
              client, user_id, customer_id,
              mygenie_customer.get("booking_documents", []),
              doc_summary
          )
```

---

## 4. Affected Code — Precise Line Locations

### File: `routers/customers.py`

| Location | What | Why |
|---|---|---|
| Line 15 | `from core.s3 import generate_presigned_url` | Add `put_private_object` to this import |
| Lines 182–568 | `background_customer_sync()` | Add call to document migration helper after `customer_id` is resolved (after line 502 for new, line 482 for existing — both branch to same `customer_id` var) |
| After line 568 (new function) | `async def _migrate_booking_documents(...)` | New private async helper — ~55 lines |

**Insertion point** (inside per-customer `try/except`, after both branches resolve `customer_id`):

```
line 482: customer_id = existing["id"]    ← existing customer branch
line 502: customer_id = customer_data["id"] ← new customer branch
line 513: # Update progress every 10 customers
                                             ↑ INSERT HERE (before progress update)
```

Both branches converge at line 513. One insertion point handles both cases.

### New helper function signature

```python
async def _migrate_booking_documents(
    client: httpx.AsyncClient,
    user_id: str,
    customer_id: str,
    booking_documents: list,
    doc_summary: dict,          # mutated in-place: skipped_stubs, migrated, failed
) -> None:
```

Uses the **existing** `httpx.AsyncClient` instance already open in the outer `async with` block — no new client creation.

---

## 5. Logic Map — `_migrate_booking_documents`

```
ID_TYPE_MAP = {
    "Aadhar card": "aadhaar",  "Passport": "passport",
    "License": "license",      "Pan card": "pan_card",
    "Voter ID": "voter_id",    "Other": "other",
}

for doc in booking_documents:
    id_type = doc.get("id_type", "")

    # Skip stubs
    if id_type == "Select document type":
        doc_summary["skipped_stubs"] += 1; continue
    if not doc.get("front_image") and not doc.get("back_image"):
        doc_summary["skipped_stubs"] += 1; continue

    doc_type = ID_TYPE_MAP.get(id_type, "other")

    for side, url in [("front", doc.get("front_image","")),
                      ("back",  doc.get("back_image",""))]:
        if not url:
            continue

        # Skip known-broken preprod URLs
        if "/storage/;/" in url:
            doc_summary["skipped_404"] += 1
            logger.info("CR-075 source_404_skipped url=%s", url)
            continue

        # Idempotency: skip if already migrated (source_url dedup — Q1)
        existing = await db.customer_documents.find_one({
            "user_id": user_id,
            "customer_id": customer_id,
            "source_url": url,
        })
        if existing:
            doc_summary["already_present"] += 1; continue

        # Download (Q2: skip+log on failure)
        try:
            resp = await client.get(url, timeout=15.0, follow_redirects=True)
            resp.raise_for_status()
            img_bytes = resp.content
        except Exception as e:
            doc_summary["failed"] += 1
            logger.warning("CR-075 download_failed url=%s err=%s", url, e)
            continue

        # Infer content_type and extension from URL
        ext = url.rsplit(".", 1)[-1].lower() if "." in url.split("/")[-1] else "jpg"
        ext = ext if ext in ("jpg","jpeg","png","webp","pdf") else "jpg"
        content_type_map = {
            "jpg": "image/jpeg", "jpeg": "image/jpeg",
            "png": "image/png",  "webp": "image/webp",
            "pdf": "application/pdf",
        }
        content_type = content_type_map.get(ext, "image/jpeg")

        # Build S3 key — CR-072 naming convention (Q4)
        s3_key = f"customers/{customer_id}/docs/{doc_type}/{uuid.uuid4().hex}.{ext}"
        file_name = f"{doc_type}_{side}.{ext}"

        # Upload private (Q4: put_private_object, same as CR-072)
        ok = put_private_object(s3_key, img_bytes, content_type)
        if not ok:
            doc_summary["failed"] += 1
            logger.warning("CR-075 s3_upload_failed url=%s s3_key=%s", url, s3_key)
            continue

        # Insert customer_documents record
        now = datetime.now(timezone.utc).isoformat()
        await db.customer_documents.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "customer_id": customer_id,
            "doc_type": doc_type,
            "s3_key": s3_key,
            "file_name": file_name,
            "content_type": content_type,
            "file_size": len(img_bytes),
            "uploaded_at": now,
            "uploaded_by": "migration",       # Q4: distinguishes from "pos"
            "source_url": url,                # Q4: audit trail + idempotency key
        })
        doc_summary["migrated"] += 1
```

---

## 6. Sync Summary — Surface to Existing Log

The existing sync log (`migration_sync_logs`) gains 5 new fields in its final `$set`:

```python
"docs_migrated":      doc_summary["migrated"],
"docs_skipped_stubs": doc_summary["skipped_stubs"],
"docs_skipped_404":   doc_summary["skipped_404"],
"docs_already_present": doc_summary["already_present"],
"docs_failed":        doc_summary["failed"],
```

These appear in the existing MigrationPage sync breakdown (surfaced via `GET /migration/status`) — no frontend change needed.

---

## 7. Files WILL Change

| File | Lines estimate | Change type |
|---|---|---|
| `routers/customers.py` | +~65 lines | (1) add `put_private_object` to s3 import · (2) add `doc_summary` dict init before per-customer loop · (3) add helper call after customer_id resolved · (4) add `doc_summary` fields to final sync_log $set · (5) new `_migrate_booking_documents()` helper function |

**Total: 1 file, ~65 lines added, 0 lines modified.**

---

## 8. Files WILL NOT Change

| File | Reason |
|---|---|
| `routers/migration.py` | No function here — order sync only. Not touched. |
| `frontend/src/pages/MigrationPage.jsx` | No UI change — same button, same flow |
| `core/s3.py` | Used as-is. Only adding `put_private_object` to the import in customers.py |
| `models/schemas.py` | `customer_documents` schema already exists from CR-072. No change. |
| `core/coupon.py` | Not touched |
| `core/loyalty.py` | Not touched |
| `routers/pos.py` | Not touched |
| `core/whatsapp.py` | Not touched |
| All other files | Not touched |

---

## 9. Downstream Consumer Check

Who reads `customer_documents`?

| Consumer | Location | Impact |
|---|---|---|
| POS document viewer | `routers/pos.py:2071` and `2231` | Reads all docs — migrated docs will appear ✅ expected |
| CRM customer detail | `routers/pos.py:2238` (same endpoint) | Same — migrated docs visible in CRM ✅ |

No other consumers found. No downstream risk.

---

## 10. Conflict Check

Open CRs touching `routers/customers.py`:

| CR | Status | Overlap? |
|---|---|---|
| CR-034 (tag system) | 🟢 CLOSED | None — tags endpoints, not sync function |
| CR-035 (export/import) | 🟢 CLOSED | None — export/import endpoints |
| CR-043 (tag filter) | 🟢 CLOSED | None — list endpoint |
| BUG-013/014 (import) | 🟢 CLOSED | None — import flow |

**No conflicts with any open CR.** `background_customer_sync()` has not been touched since BUG-022 (name preserve guard, line 466). Safe to extend.

---

## 11. New Open Question — Q5 (OWNER DECISION REQUIRED)

**Discovered during code reality check.**

CR-072 enforces a **max 5 documents per `doc_type` per customer** (pos.py:2198-2208). When the 6th is uploaded, the oldest is pruned.

Live data from restaurant_id=478 shows customer "avi" (phone 9823905120) has **15 real License documents** and **1 Aadhar card** = 16 real docs total.

If migration enforces the same cap:
- Only the 5 most-recent License docs would be kept
- 10+ historical License docs would be permanently dropped

**Q5**: Should the 5-docs-per-type cap be enforced during migration?

| Option | Effect |
|---|---|
| **(a) Enforce cap** | Migrates only 5 most-recent per doc_type. Consistent with live-upload behavior. Simple. |
| **(b) Skip cap for migration** | All historical docs migrated (up to whatever POS has). More complete historical record. Guest with 16 docs retains all 16. |
| **Recommendation**: **(b)** | Migration is a one-time historical import. POS had no cap — all docs were kept there. Capping at migration would silently discard real documents. The cap can apply to future live uploads only. |

**This is a data retention decision. Owner approval required before implementation plan is written.**

---

## 12. Verification Matrix (draft — for implementation plan)

| # | Verification | Method |
|---|---|---|
| V1 | After sync, `customer_documents` has new rows for hotel tenant customers with real POS docs | DB query: `count_documents({user_id, uploaded_by: "migration"})` > 0 |
| V2 | `id_type = "Select document type"` stubs produce zero rows | DB query: no rows with `source_url` from known stub customer |
| V3 | `/storage/;/` URLs skipped — no download attempted | Log check: `source_404_skipped` entries; no S3 keys containing `storage/;` |
| V4 | Re-running sync twice does not duplicate rows | Run sync twice; count rows before/after second run — same count |
| V5 | `back_image` produces separate row with same `doc_type`, `uploaded_by="migration"`, `source_url=back_url` | DB query: find rows where `file_name` ends with `_back.*` |
| V6 | `manage.mygenie.online` and `dev.mygenie.online` images are downloadable and in S3 | Curl signed URL from DB row → HTTP 200 |
| V7 | `file_name` format is `{doc_type}_{side}.{ext}` — original POS filename discarded | DB query: all migrated rows have `file_name` matching regex |
| V8 | `uploaded_by = "migration"`, `source_url` present on all migrated rows | DB query: `find({uploaded_by:"migration"})` — check both fields |
| V9 | Existing customer sync (name/phone/GST upsert) unaffected — no regression | Existing customer fields unchanged after sync with docs |
| V10 | `migration_sync_logs` final record includes `docs_migrated` count | Check latest log doc for new fields |

---

## 13. Risk Assessment

| Dimension | Assessment |
|---|---|
| Financial impact | None — no loyalty/coupon/wallet logic touched |
| Live data corruption risk | None — additive only (`customer_documents` inserts only) |
| POS order flow impact | None — `routers/pos.py` untouched |
| WhatsApp send impact | None |
| Customer data overwrite | None — existing customer upsert logic unchanged |
| S3 cost | ~32 images × ~500KB avg = ~16MB per hotel tenant. Negligible. |
| Sync latency | Image downloads add latency per customer with real docs. Q2-locked: failures skip+log. Worst case: 32 images × 2s/image = ~64s added to sync. Acceptable. |

**Final risk: LOW — unchanged from intake.**

---

## 14. Owner Decisions Required Before Implementation Plan

| Q | Question | Status |
|---|---|---|
| Q1 | Every sync? | ✅ LOCKED: every sync |
| Q2 | Download fail = skip+log? | ✅ LOCKED: skip+log |
| Q3 | All API URLs migrated? | ✅ LOCKED: all reachable |
| Q4 | CR-072 naming convention? | ✅ LOCKED: `{doc_type}_{side}.{ext}`, private S3, `source_url` stored |
| **Q5** | **Enforce 5-doc cap during migration?** | **🔴 OPEN — owner decision required** |

---

## 15. Correction to Intake Doc

The following field in `discovery/CR_075_HOTEL_DOCUMENT_MIGRATION_INTAKE.md` Section 6 is incorrect and must be updated:

| Field | Was | Should be |
|---|---|---|
| File that will change | `backend/routers/migration.py` | `backend/routers/customers.py` |

Updated below. The correction does not change risk level, blast radius, or any locked decisions.
