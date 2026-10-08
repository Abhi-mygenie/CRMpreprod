# CR-075 — Implementation Plan
## Hotel Guest Document Migration: POS booking_documents → CRM customer_documents

**ID**: CR-075  
**Date**: 2026-08-06  
**Role**: Planning Agent  
**Stage**: Implementation Plan  
**Depends on**: Impact Analysis `planning/CR_075_IMPACT_ANALYSIS.md`  
**Risk**: LOW  
**Decisions**: Q1-Q5 all locked (see `DECISIONS_LOG.md` §2026-08-06 CR-075)

---

## Files WILL Change

| File | Edits |
|---|---|
| `backend/routers/customers.py` | 6 edits — details below |

## Files WILL NOT Change

`routers/migration.py` · `MigrationPage.jsx` · `core/s3.py` · `models/schemas.py` ·
`core/coupon.py` · `core/loyalty.py` · `routers/pos.py` · `core/whatsapp.py`

---

## Pre-Implementation Checklist

- [ ] Read this plan end-to-end before touching any file
- [ ] Confirm `S3_CONFIGURED` is True in running backend (`grep AWS /app/backend/.env` — all 4 vars set ✅)
- [ ] Confirm `customer_documents` collection exists (`db.customer_documents.count_documents({})` — created by CR-072)
- [ ] No other agent is editing `routers/customers.py` concurrently

---

## Edit 1 — `customers.py:15` — Add `put_private_object` to S3 import

**Why**: `_cr075_migrate_docs` uploads images using private S3 (Q4 — same convention as CR-072).

```
Line 15 (current):
from core.s3 import generate_presigned_url  # CR-072

Line 15 (after):
from core.s3 import generate_presigned_url, put_private_object  # CR-072 / CR-075
```

**Self-test**: `python3 -c "from routers.customers import *"` — no ImportError.

---

## Edit 2 — `customers.py:179` — Add module-level constants before `background_customer_sync`

**Why**: `_cr075_migrate_docs` needs the id_type→doc_type map and ext→content_type map.
Placed at module level (not inside the function) so they are defined once and reusable.

**Insert after line 179** (end of `_cust_push_failed_record`), before line 181 (blank) / line 182 (`async def background_customer_sync`):

```python

# CR-075: POS id_type → CRM doc_type (confirmed from live API 2026-08-06)
_CR075_ID_TYPE_MAP = {
    "Aadhar card": "aadhaar",
    "Passport":    "passport",
    "License":     "license",
    "Pan card":    "pan_card",
    "Voter ID":    "voter_id",
    "Other":       "other",
    # "Select document type" → SKIP (handled in helper)
}

_CR075_EXT_CONTENT_TYPE = {
    "jpg":  "image/jpeg",
    "jpeg": "image/jpeg",
    "png":  "image/png",
    "webp": "image/webp",
    "pdf":  "application/pdf",
}
```

**Self-test**: `python3 -c "import sys; sys.path.insert(0,'.'); from routers.customers import _CR075_ID_TYPE_MAP; print(_CR075_ID_TYPE_MAP)"` — prints dict.

---

## Edit 3 — `customers.py:268` — Init `doc_summary` counter alongside `customer_index`

**Why**: `doc_summary` accumulates migration stats across all pages and all customers in one sync run.
Must be initialised at the same level as `customer_index` (inside `async with` block, outside the `while` loop).

**Current (line 268)**:
```python
            customer_index = 0
```

**After**:
```python
            customer_index = 0
            # CR-075: document migration counters (reset per sync run)
            doc_summary = {
                "migrated": 0, "skipped_stubs": 0,
                "skipped_404": 0, "already_present": 0, "failed": 0,
            }
```

**Self-test**: No runtime effect yet; just variable init.

---

## Edit 4 — `customers.py:512` — Call helper after `customer_id` resolves

**Why**: Both the "existing customer" (line 482) and "new customer" (line 502) branches write to
`customer_id`. Line 512 is the blank line after the Phase-L5 comment block and before the progress
update — the earliest point where `customer_id` is guaranteed to be set for every customer.

**Current (lines 511–513)**:
```python
                    # has no need for synthetic loyalty history.

                    # Update progress every 10 customers
```

**After**:
```python
                    # has no need for synthetic loyalty history.

                    # CR-075: migrate booking_documents for this customer
                    await _cr075_migrate_docs(
                        client,
                        user_id,
                        customer_id,
                        mygenie_customer.get("booking_documents", []),
                        doc_summary,
                    )

                    # Update progress every 10 customers
```

**Important**: This call is INSIDE the per-customer `try/except` block (line 315–532).
If `_cr075_migrate_docs` raises unexpectedly, it is caught by the existing `except Exception as record_err`
handler at line 518 — the customer record is marked failed and the loop continues. This is safe.

**Self-test**: Verify indentation — must be at the same level as `customer_id = existing["id"]` (4 leading spaces + 20 spaces = column 24). Count spaces against existing code.

---

## Edit 5 — `customers.py:561–567` — Add doc_summary to final sync log

**Why**: Surfaces migration stats in `migration_sync_logs` collection and in the
`GET /customers/sync-status` response so the MigrationPage can show doc counts.

**Current (lines 561–567)**:
```python
            await _cust_log_progress(log_id, {
                "status": "completed",
                "completed_at": completed_at,
                "synced_count": synced_count,
                "updated_count": updated_count,
                "failed_count": failed_count,
            })
```

**After**:
```python
            await _cust_log_progress(log_id, {
                "status": "completed",
                "completed_at": completed_at,
                "synced_count": synced_count,
                "updated_count": updated_count,
                "failed_count": failed_count,
                "docs_migrated":        doc_summary["migrated"],
                "docs_skipped_stubs":   doc_summary["skipped_stubs"],
                "docs_skipped_404":     doc_summary["skipped_404"],
                "docs_already_present": doc_summary["already_present"],
                "docs_failed":          doc_summary["failed"],
            })
```

**Self-test**: After a sync run, `db.migration_sync_logs.find_one({"user_id": ..., "sync_type": "customer_sync"}, sort=[("started_at", -1)])` — must contain `docs_migrated` key.

---

## Edit 6 — `customers.py:585` — Insert new helper function `_cr075_migrate_docs`

**Why**: Keeps `background_customer_sync` clean. All document migration logic lives in one isolated helper.
Placed between line 584 (end of `background_customer_sync`) and line 587 (`@router.post("/sync-from-mygenie")`).

**Insert after line 584** (end of outer `except` block of `background_customer_sync`):

```python

async def _cr075_migrate_docs(
    client: "httpx.AsyncClient",
    user_id: str,
    customer_id: str,
    booking_documents: list,
    doc_summary: dict,
) -> None:
    """CR-075: For one customer, migrate booking_documents from POS → customer_documents (S3 private).

    Decisions locked:
      Q1 — runs every sync; source_url idempotency guard prevents duplicates
      Q2 — skip+log on download/upload failure; never raises
      Q3 — all reachable hosts migrated (manage / dev); /storage/;/ skipped
      Q4 — CR-072 naming: s3_key=customers/{id}/docs/{type}/{uuid}.{ext},
           file_name={type}_{side}.{ext}, put_private_object, uploaded_by="migration"
      Q5 — no per-doc-type cap enforced (historical import; cap stays for live POS uploads)
    """
    for doc in booking_documents:
        id_type = doc.get("id_type", "")

        # Skip empty stubs (majority of entries)
        if id_type == "Select document type":
            doc_summary["skipped_stubs"] += 1
            continue
        front = doc.get("front_image", "") or ""
        back  = doc.get("back_image",  "") or ""
        if not front and not back:
            doc_summary["skipped_stubs"] += 1
            continue

        doc_type = _CR075_ID_TYPE_MAP.get(id_type, "other")

        for side, url in (("front", front), ("back", back)):
            if not url:
                continue

            # Skip known-broken preprod URLs with semicolon path bug (Q3)
            if "/storage/;/" in url:
                doc_summary["skipped_404"] += 1
                logger.info(
                    "CR-075 source_404_skipped customer_id=%s url=%s",
                    customer_id, url,
                )
                continue

            # Idempotency guard — source_url is the dedup key (Q1)
            already = await db.customer_documents.find_one(
                {"user_id": user_id, "customer_id": customer_id, "source_url": url},
                {"_id": 1},
            )
            if already:
                doc_summary["already_present"] += 1
                continue

            # Download image (Q2: skip+log on any failure; Q3: no host filtering)
            try:
                resp = await client.get(url, timeout=15.0, follow_redirects=True)
                resp.raise_for_status()
                img_bytes = resp.content
            except Exception as dl_err:
                doc_summary["failed"] += 1
                logger.warning(
                    "CR-075 download_failed customer_id=%s url=%s err=%s",
                    customer_id, url, dl_err,
                )
                continue

            # Derive extension from URL filename; fallback to jpg
            url_filename = url.rsplit("/", 1)[-1].split("?")[0]
            raw_ext = url_filename.rsplit(".", 1)[-1].lower() if "." in url_filename else "jpg"
            ext = raw_ext if raw_ext in _CR075_EXT_CONTENT_TYPE else "jpg"
            content_type = _CR075_EXT_CONTENT_TYPE[ext]

            # S3 key and file_name — CR-072 naming convention (Q4)
            s3_key    = f"customers/{customer_id}/docs/{doc_type}/{uuid.uuid4().hex}.{ext}"
            file_name = f"{doc_type}_{side}.{ext}"

            # Upload private (Q4 — no public ACL; access via presigned URL)
            ok = put_private_object(s3_key, img_bytes, content_type)
            if not ok:
                doc_summary["failed"] += 1
                logger.warning(
                    "CR-075 s3_upload_failed customer_id=%s s3_key=%s",
                    customer_id, s3_key,
                )
                continue

            # Persist metadata — mirrors CR-072 schema exactly, plus source_url
            await db.customer_documents.insert_one({
                "id":           str(uuid.uuid4()),
                "user_id":      user_id,
                "customer_id":  customer_id,
                "doc_type":     doc_type,
                "s3_key":       s3_key,
                "file_name":    file_name,
                "content_type": content_type,
                "file_size":    len(img_bytes),
                "uploaded_at":  datetime.now(timezone.utc).isoformat(),
                "uploaded_by":  "migration",   # Q4 — distinguishes from "pos" live uploads
                "source_url":   url,           # Q4 — audit trail + idempotency key
            })
            doc_summary["migrated"] += 1
```

**Self-test**: Function is visible and callable — `python3 -c "from routers.customers import _cr075_migrate_docs; print('OK')"`.

---

## Edit Summary

| Edit | File | Line | Type | LOC added |
|---|---|---|---|---|
| E1 | `customers.py` | 15 | Import change | 0 (replace) |
| E2 | `customers.py` | 179 | Module-level constants | +19 |
| E3 | `customers.py` | 268 | Counter init | +4 |
| E4 | `customers.py` | 512 | Helper call | +7 |
| E5 | `customers.py` | 561–567 | Log fields | +5 |
| E6 | `customers.py` | 585 | New helper function | +80 |
| **Total** | 1 file | — | 0 modified, +115 added | — |

---

## Verification Matrix (10 items)

Implementation is complete when ALL 10 pass.

| # | Test | How to verify | Pass condition |
|---|---|---|---|
| V1 | Backend starts clean | `tail -n 30 /var/log/supervisor/backend.err.log` | No import errors, no syntax errors |
| V2 | S3 configured | `grep AWS /app/backend/.env` | All 4 AWS vars present |
| V3 | customer_documents collection exists | `curl .../api/pos/customers/{id}/documents` (GET) | Returns grouped docs (not 500) |
| V4 | Sync runs without error | Trigger sync from MigrationPage, wait for completion | `GET /customers/sync-status` → `status: completed` |
| V5 | Migrated rows present | `db.customer_documents.count_documents({"uploaded_by": "migration"})` | > 0 for hotel tenant (palmhouse/jehsnest) |
| V6 | `file_name` follows convention | `db.customer_documents.find_one({"uploaded_by": "migration"})` | `file_name` matches `{doc_type}_{side}.{ext}` pattern |
| V7 | `source_url` stored | Same row | `source_url` field present, contains original POS URL |
| V8 | Idempotency — no duplicates on re-sync | Run sync twice; count rows before/after 2nd run | Count unchanged after 2nd run |
| V9 | `/storage/;/` URLs skipped | Check `migration_sync_logs` final doc | `docs_skipped_404` > 0 for restaurant_id=478 tenant; no S3 keys containing `storage/;` |
| V10 | Existing customer sync unaffected | Check `synced_count` + `updated_count` after sync | Same values as before this CR; customer name/phone/GST unchanged |

---

## Regression Checklist

| Risk | Check |
|---|---|
| CR-072 live POS upload still works | `POST /api/pos/customers/{id}/documents` with real file → 200, s3_key present in DB |
| Customer sync loop doesn't abort on doc failure | Introduce a bad URL in test — loop must continue to next customer |
| 5-doc cap in CR-072 (`pos.py:2198`) still applies to live uploads | NOT modified — confirm `routers/pos.py` is untouched |

---

## Implementation Order

Apply edits in this exact order. Do not skip or reorder.

```
E1 → E2 → E3 → E4 → E5 → E6
```

E1 must come before E6 (helper needs `put_private_object` imported).
E2 must come before E6 (helper uses `_CR075_ID_TYPE_MAP` and `_CR075_EXT_CONTENT_TYPE`).
E3 must come before E4 (helper call uses `doc_summary` which must be initialized first).

---

## Code Markers

Every inserted block carries `# CR-075` marker for auditability.
The helper function docstring references all 5 locked decisions (Q1-Q5).

---

## Owner Approval Gate

```
OWNER APPROVAL REQUIRED
Reason: Implementation plan complete — gate check before any code is written
Risk: LOW
Proposed next step: Implementation Agent applies E1→E6 to routers/customers.py
                    followed by self-test V1–V10
I will not proceed until owner approves.
```
