# QA Handover — BUG-2026-09-10-001
## Logo/image upload: Emergent storage → local disk

**Date:** 2026-09-10  
**Implementation status:** COMPLETE  
**Self-test result:** 13/13 PASS  
**File changed:** `/app/backend/server.py` only  
**Frontend changes:** none  

---

## What Was Done

Replaced the Emergent object storage layer in `server.py` with local disk I/O:

| Edit | Lines | What changed |
|------|-------|-------------|
| 1 | 48–85 | Removed entire Emergent storage block (`_init_storage`, `_put_object`, `_get_object`, `import requests as _requests`, env vars) |
| 2 | upload_image() | Writes file bytes to `ROOT_DIR / "uploads" / filename` instead of `_put_object()` |
| 3 | serve_upload() | Reads file bytes from disk instead of `_get_object()` |
| 4 | startup_event() | Calls `mkdir(exist_ok=True)` instead of `_init_storage()` |
| 5 | APP_NAME | Constant removed (was only used for `storage_path` which no longer exists) |

**Code marker:** `# BUG-2026-09-10-001` on all 4 edit sites.

**URL pattern:** UNCHANGED — `POST /api/upload/image` returns `/api/upload/image/{filename}`. No frontend changes required.

---

## Important: Ephemeral Risk Removed

At intake, local disk was flagged as ephemeral (files lost on restart). This was written before confirming the persistence model.

`/app/backend/uploads/` is under `/app` which is a **persistent directory** — confirmed by platform system prompt. Uploaded files survive pod restarts. The intake-recorded limitation no longer applies.

---

## Self-Test Evidence (13/13 PASS)

| # | Test | Result |
|---|------|--------|
| ST-1 | No Emergent storage references remain in server.py | ✅ PASS — grep returns empty |
| ST-2 | New disk-based code present with BUG markers | ✅ PASS — 4 markers found |
| ST-3 | URL pattern unchanged `/api/upload/image/` | ✅ PASS |
| ST-4 | Python syntax check | ✅ PASS — `py_compile` clean |
| ST-5 | Backend restarts and reaches RUNNING | ✅ PASS — pid 4564 RUNNING |
| ST-6 | Startup log shows `"Uploads directory ready"` not old storage warning | ✅ PASS |
| ST-7 | `/app/backend/uploads/` directory created by startup event | ✅ PASS |
| ST-8 | `POST /api/upload/image` with valid PNG → HTTP 200, `{"success":true,"url":"/api/upload/image/<filename>"}` | ✅ PASS |
| ST-9 | File physically present on disk after upload | ✅ PASS — 70-byte file confirmed |
| ST-10 | `GET /api/upload/image/<filename>` → HTTP 200, `Content-Type: image/png`, correct bytes | ✅ PASS |
| ST-10b | Byte integrity: served bytes === uploaded bytes | ✅ PASS — exact match |
| ST-11 | `.exe` extension rejected → HTTP 400 | ✅ PASS |
| ST-12 | Upload without auth → HTTP 401 | ✅ PASS |
| ST-13 | GET non-existent file → HTTP 404 | ✅ PASS |

---

## Test Cases for QA

### TC-1 — Upload logo via Admin UI (primary flow)
1. Log in as restaurant admin at `/admin/settings`
2. Click **Upload** next to "Restaurant Logo"
3. Select any `.png`, `.jpg`, or `.webp` image ≤ 5MB
4. **Expected:** No error toast. Logo URL field populates with `{BACKEND_URL}/api/upload/image/{uuid}.ext`. Logo preview renders.
5. **Verify file on disk:** `ls /app/backend/uploads/` shows the file.

### TC-2 — Save config and reload
1. After TC-1, click **Save**
2. Refresh the page / open a different browser
3. **Expected:** Logo URL is persisted. Logo image loads correctly from `/api/upload/image/{filename}`.

### TC-3 — Upload via AdminBrandingPage (new admin layout)
1. Navigate to `/admin/branding`
2. Upload a background image
3. **Expected:** Same behaviour as TC-1

### TC-4 — Large file rejection
1. Attempt to upload a file > 5MB
2. **Expected:** Toast error "File too large. Max 5MB."

### TC-5 — Invalid extension rejection
1. Attempt to upload a `.pdf` or `.txt` file
2. **Expected:** Toast error mentioning allowed extensions

### TC-6 — Old logo URLs (4 restaurants — known 404, not a regression)
- Restaurants 364, 716, 523, 672 have logos pointing to `https://app.mygenie.online/api/uploads/…`
- These will still return 404 — this is **pre-existing**, not caused by this fix
- **Expected for QA:** Confirm these URLs 404 but the upload button now works to replace them

---

## Files Changed

| File | Change type | Code marker |
|------|------------|------------|
| `/app/backend/server.py` | Modified — 51 lines removed, 12 lines added | `# BUG-2026-09-10-001` |

## Files NOT Changed

All frontend files, all `.env` files, all other backend routes — confirmed by grep.

---

## Known Limitations

| Item | Status |
|------|--------|
| Old logos at `app.mygenie.online` | Pre-existing 404 — not fixed by this CR. Affected admins must re-upload. |
| Files in `/app/backend/uploads/` | **Persistent** — `/app` is a persistent directory. Files survive restarts. |

---

```
QA Handover complete: BUG-2026-09-10-001
Self-test: 13/13 PASS
Backend: RUNNING
Primary flow verified: upload → disk → serve → HTTP 200 → bytes match
Next: QA validation (TC-1 through TC-6)
```
