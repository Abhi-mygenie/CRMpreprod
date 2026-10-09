# Implementation Plan — BUG-2026-09-10-001
## Logo/image upload: replace Emergent object storage with local disk

**ID:** BUG-2026-09-10-001  
**Role:** PLANNING  
**Date:** 2026-09-10  
**Status:** PLAN WRITTEN — awaiting owner approval to implement  
**Risk:** MEDIUM  
**Refs:** INTAKE_DOC.md, INV-2026-09-10-001 INVESTIGATION_REPORT.md

---

## Impact Analysis

### What is broken today
The backend image upload system routes all file I/O through Emergent object storage (`integrations.emergentagent.com`). This requires `EMERGENT_LLM_KEY` which is not set in `.env`. Every upload attempt triggers a `400 Bad Request` from the storage init call. Every backend restart logs the same warning. The `serve_upload` endpoint is equally broken — it tries to fetch from the same empty storage.

### What this plan changes
Replace the Emergent storage layer with local disk I/O. Files are written to and read from `/app/backend/uploads/`. The `requests` network calls are removed entirely from the upload path. No external service dependency remains.

### What this plan does NOT change
- Upload endpoint URL: `POST /api/upload/image` — unchanged
- Serve endpoint URL: `GET /api/upload/image/{filename}` — unchanged
- URL returned to frontend: `/api/upload/image/{filename}` — unchanged
- Frontend code: zero changes
- Auth: zero changes
- All other backend routes: zero changes
- `.env` files: zero changes
- MongoDB: zero changes

### Accepted limitation (recorded at intake)
Local disk files are ephemeral — lost on container restart or redeploy. Owner accepted this at intake.

### Old broken logos (4 restaurants)
Stored DB records pointing to `https://app.mygenie.online/api/uploads/…` will still 404 after this fix. Those files are on a dead external server. Affected restaurant admins (IDs: 364, 716, 523, 672) must re-upload via admin UI after this fix is deployed.

---

## Code Reality Check

| Item | Finding |
|------|---------|
| `StaticFiles` | Already imported line 2 — `from fastapi.staticfiles import StaticFiles  # kept for potential future use`. Not needed for this plan (kept as-is). |
| `Path` | Already imported line 9 |
| `ROOT_DIR` | Already defined line 20 — `ROOT_DIR = Path(__file__).parent` |
| `import requests as _requests` | Line 48 — ONLY used in Emergent storage block. Safe to remove. |
| `STORAGE_BASE`, `STORAGE_URL`, `EMERGENT_LLM_KEY`, `_storage_key` | Lines 49–52 — ONLY used in storage helpers. Safe to remove. |
| `_init_storage()` | Lines 54–61 — called only by `_put_object`, `_get_object`, `startup_event`. Safe to remove. |
| `_put_object()` | Lines 63–70 — called only by `upload_image`. Safe to remove. |
| `_get_object()` | Lines 73–85 — called only by `serve_upload`. Safe to remove. |
| `APP_NAME` | Line 1423 — only used in `storage_path` building (lines 1440, 1455). Both removed by this plan. `APP_NAME` itself also removed. |
| `ALLOWED_EXTENSIONS`, `MIME_MAP`, `MAX_FILE_SIZE` | Lines 1419–1422 — still used in new upload/serve code. **Keep.** |
| `content_type` local var in `upload_image` | Line 1441 — only passed to `_put_object`. Not needed for disk write. Removed. |

---

## Files WILL Change

| File | Lines touched | Nature of change |
|------|-------------|-----------------|
| `/app/backend/server.py` | 48–85, 1423, 1425–1462, 1866–1871 | Remove Emergent storage block; replace upload + serve bodies; fix startup event |

## Files WILL NOT Change

| File | Reason |
|------|--------|
| All frontend files | URL pattern unchanged — no frontend update needed |
| `/app/backend/.env` | No new env vars required |
| `/app/frontend/.env` | Not touched |
| `AuthContext.jsx` | Not touched |
| `CartContext.js` | Not touched |
| `ReviewOrder.jsx` | Not touched |
| All other backend routes | Not touched |

---

## Implementation Steps (4 targeted edits, all in `server.py`)

### Edit 1 — Remove Emergent storage block (lines 48–85)

**Remove** the entire block:
```python
# Object storage (Emergent)
import requests as _requests
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
_storage_key = None

def _init_storage(force: bool = False):
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    resp = _requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key

def _put_object(path: str, data: bytes, content_type: str) -> dict:
    key = _init_storage()
    resp = _requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120
    )
    resp.raise_for_status()
    return resp.json()

def _get_object(path: str):
    key = _init_storage()
    resp = _requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60
    )
    if resp.status_code == 404:
        try:
            _init_storage(force=True)
            key = _storage_key
            resp = _requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
        except Exception:
            pass
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
```

**Replace with** a single comment line:
```python
# BUG-2026-09-10-001: Emergent object storage removed — local disk used instead.
```

**Lines removed:** 38  
**Lines added:** 1  

---

### Edit 2 — Replace `upload_image()` body

**Remove** (lines 1425–1449):
```python
@upload_router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    user: dict = Depends(get_restaurant_user)
):
    """Upload an image file (restaurant admin only). Max 5MB."""
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type {ext} not allowed. Use: {', '.join(ALLOWED_EXTENSIONS)}")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Max 5MB.")

    filename = f"{uuid.uuid4().hex}{ext}"
    storage_path = f"{APP_NAME}/uploads/{filename}"
    content_type = MIME_MAP.get(ext.lstrip("."), "application/octet-stream")

    try:
        result = _put_object(storage_path, contents, content_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {e}")

    url = f"/api/upload/image/{filename}"
    return {"success": True, "url": url, "filename": filename}
```

**Replace with:**
```python
@upload_router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    user: dict = Depends(get_restaurant_user)
):
    """Upload an image file to local disk (restaurant admin only). Max 5MB."""
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type {ext} not allowed. Use: {', '.join(ALLOWED_EXTENSIONS)}")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Max 5MB.")

    filename = f"{uuid.uuid4().hex}{ext}"
    uploads_dir = ROOT_DIR / "uploads"
    uploads_dir.mkdir(exist_ok=True)

    try:
        (uploads_dir / filename).write_bytes(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")

    url = f"/api/upload/image/{filename}"
    return {"success": True, "url": url, "filename": filename}
```

**What changed:** removed `storage_path`, `content_type`, `APP_NAME` ref, `_put_object()` call. Added `uploads_dir` path + `mkdir` + `write_bytes`. URL unchanged.  
**Lines removed:** 4 | **Lines added:** 4 | **Net:** 0

---

### Edit 3 — Replace `serve_upload()` body

**Remove** (lines 1451–1462):
```python
@upload_router.get("/image/{filename}")
async def serve_upload(filename: str):
    """Serve an uploaded image from object storage."""
    ext = Path(filename).suffix.lower().lstrip(".")
    storage_path = f"{APP_NAME}/uploads/{filename}"
    try:
        data, content_type = _get_object(storage_path)
    except Exception:
        raise HTTPException(status_code=404, detail="Image not found")
    from fastapi.responses import Response
    return Response(content=data, media_type=content_type)
```

**Replace with:**
```python
@upload_router.get("/image/{filename}")
async def serve_upload(filename: str):
    """Serve an uploaded image from local disk."""
    file_path = ROOT_DIR / "uploads" / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    ext = Path(filename).suffix.lower().lstrip(".")
    content_type = MIME_MAP.get(ext, "application/octet-stream")
    from fastapi.responses import Response
    return Response(content=file_path.read_bytes(), media_type=content_type)
```

**What changed:** removed `storage_path`, `_get_object()` call. Added `file_path`, `.exists()` check, `read_bytes()`. URL unchanged.  
**Lines removed:** 3 | **Lines added:** 4 | **Net:** +1

---

### Edit 4 — Fix `startup_event()`

**Remove** (lines 1866–1871):
```python
@app.on_event("startup")
async def startup_event():
    try:
        _init_storage()
        logger.info("Object storage initialized successfully")
    except Exception as e:
        logger.warning(f"Object storage init failed at startup (will retry on first use): {e}")
```

**Replace with:**
```python
@app.on_event("startup")
async def startup_event():
    # BUG-2026-09-10-001: ensure uploads dir exists on startup
    (ROOT_DIR / "uploads").mkdir(exist_ok=True)
    logger.info("Uploads directory ready")
```

**What changed:** removed `_init_storage()` try/except block. Added `mkdir` + info log.  
**Lines removed:** 5 | **Lines added:** 3 | **Net:** -2

---

### Edit 5 — Remove `APP_NAME` constant (line 1423)

**Remove:**
```python
APP_NAME = "customer-app"
```

`APP_NAME` is referenced only in `storage_path` lines, both of which are removed in Edits 2 and 3.

**Lines removed:** 1

---

## Net Change Summary

| Edit | Description | Lines removed | Lines added |
|------|------------|:-------------:|:-----------:|
| 1 | Remove Emergent storage block | 38 | 1 |
| 2 | Replace `upload_image()` body | 4 | 4 |
| 3 | Replace `serve_upload()` body | 3 | 4 |
| 4 | Replace `startup_event()` body | 5 | 3 |
| 5 | Remove `APP_NAME` constant | 1 | 0 |
| **Total** | | **51** | **12** |

**server.py shrinks by ~39 lines.**

---

## Verification Matrix

| # | Test | Method | Expected |
|---|------|--------|---------|
| V1 | Backend starts without error | `supervisorctl status` | `RUNNING` |
| V2 | No storage warning in startup log | `tail backend.out.log` | `"Uploads directory ready"` — no `_init_storage` warning |
| V3 | `/app/backend/uploads/` exists | `ls /app/backend/uploads/` | Directory present |
| V4 | Upload a logo via admin UI | POST `/api/upload/image` with auth | HTTP 200, `{"success": true, "url": "/api/upload/image/<filename>"}` |
| V5 | File lands on disk | `ls /app/backend/uploads/` after upload | File with matching name present |
| V6 | Image served back correctly | GET `/api/upload/image/<filename>` | HTTP 200, correct image bytes |
| V7 | Frontend shows uploaded logo | Admin Settings page | Logo preview renders |
| V8 | Non-image file rejected | POST with `.exe` file | HTTP 400 |
| V9 | File too large rejected | POST with >5MB file | HTTP 400 |
| V10 | No frontend file was changed | `git diff frontend/` | Empty diff |

---

## Code Marker

All edited lines to carry:
```python
# BUG-2026-09-10-001: local disk replaces Emergent object storage
```

---

```
Planning complete: BUG-2026-09-10-001
Stage: Implementation Plan
Code reality: FULL — all lines verified, all call sites confirmed
Risk: MEDIUM
Files WILL change: /app/backend/server.py only
Files WILL NOT touch: all frontend files, all .env files, all other backend routes
Owner decisions: none outstanding — fix approach confirmed at intake
Docs: /app/memory/change_requests/BUG-2026-09-10-001-image-upload-local-disk/IMPLEMENTATION_PLAN.md
Next: Owner approval → Implementation
```
