# Investigation Report — INV-2026-09-10-001
## Logo Upload: 400 Error from integrations.emergentagent.com + Previously-uploaded logos returning 404

**Date:** 2026-09-10  
**Role:** INVESTIGATION  
**Status:** ROOT CAUSE CONFIRMED (two distinct root causes)  
**Risk:** MEDIUM (admin branding only; no order/payment/auth impact)

---

## Observed Symptoms (from owner screenshot)

| # | Symptom | Observed At |
|---|---------|-------------|
| 1 | Toast error: `"Storage upload failed: 400 Client Error: Bad Request for url: https://integrations.emergentagent.com/objstore/api/v1/storage/init"` | `fivestar.mygenie.online/admin/settings` → "Upload" button |
| 2 | Logo URL input shows `https://socket.mygenie.online/api/uploads/7b30f049ba…` — broken / 404 | Pre-populated from database |

---

## Hypotheses Formed

| # | Hypothesis | Result |
|---|-----------|--------|
| H1 | `EMERGENT_LLM_KEY` is not set → `_init_storage()` sends `null` key → 400 from storage API | **CONFIRMED ✅** |
| H2 | Stored logo URLs point to a dead previous deployment host | **CONFIRMED ✅** |
| H3 | Frontend is calling the storage API directly (bypassing backend) | **ELIMINATED ✅** — frontend only calls `/api/upload/image` on backend |

---

## Evidence Steps Used (6/10)

### Step 1 — Trace backend upload code path

File: `/app/backend/server.py` lines 47–86, 1425–1450

**Upload flow:**
```
POST /api/upload/image
  → upload_image() [line 1425]
  → _put_object(storage_path, contents, content_type) [line 1444]
  → _init_storage() [line 54]
  → POST https://integrations.emergentagent.com/objstore/api/v1/storage/init
         body: {"emergent_key": EMERGENT_LLM_KEY}   ← EMERGENT_LLM_KEY is None
  → 400 Bad Request
  → HTTPException(500, f"Storage upload failed: {e}") [line 1446]
```

The error toast message in the screenshot exactly matches the string built by line 1446.

---

### Step 2 — Confirm EMERGENT_LLM_KEY is missing from the running process

```bash
# grep /app/backend/.env for EMERGENT_LLM_KEY → empty (not present)
# Read /proc/<backend_pid>/environ for EMERGENT_LLM_KEY → NOT FOUND
```

Process environment shows:
```
INTEGRATION_PROXY_URL=https://integrations.emergentagent.com  ← SET (via supervisor)
EMERGENT_LLM_KEY=<NOT PRESENT>                                 ← MISSING
```

Backend code at startup (line 1865-1871):
```python
@app.on_event("startup")
async def startup_event():
    try:
        _init_storage()                    # ← fails immediately at every restart
        logger.info("Object storage initialized successfully")
    except Exception as e:
        logger.warning(f"Object storage init failed at startup (will retry on first use): {e}")
```

**Confirmed in logs:**
```
2026-09-10 03:59:09,463 - WARNING - Object storage init failed at startup (will retry on first use):
  400 Client Error: Bad Request for url: https://integrations.emergentagent.com/objstore/api/v1/storage/init
2026-09-10 04:20:39,525 - WARNING - (same)
```

---

### Step 3 — Live confirm: storage API rejects null key

```bash
curl -X POST https://integrations.emergentagent.com/objstore/api/v1/storage/init \
  -d '{"emergent_key": null}'
# → HTTP 400
# → {"error":"Bad request","message":"bad request: emergent_key is required","code":"bad_request"}
```

**Confirmed: the storage API requires a valid (non-null) emergent_key.**

---

### Step 4 — Trace frontend upload call path

File: `AdminSettingsPage.jsx` line 36, 174–195  
File: `AdminConfigContext.jsx` line 9, 365–390  

Both pages define `uploadImage` identically:
```js
const API_URL = process.env.REACT_APP_BACKEND_URL || '';

// inside uploadImage():
const response = await fetch(`${API_URL}/api/upload/image`, { ... });
// on success:
return `${API_URL}${data.url}`;
// where data.url = "/api/upload/image/{filename}" (returned by backend)
```

**No direct frontend call to `integrations.emergentagent.com`.** The frontend only calls the backend. The backend is what calls the storage API.

The error message shown in the toast (`Storage upload failed: 400 Client Error…`) is the `detail` string from the backend's HTTPException, re-surfaced by the frontend's `err.detail` field.

---

### Step 5 — Investigate previously-uploaded logos (404 root cause)

**Database evidence** (collection: `customer_app_config`):
```
[364] logo = https://app.mygenie.online//api/uploads/5ccda619d6d448bc94a937226082a700.png
[716] logo = https://app.mygenie.online/api/uploads/9101952a06744cbba67fe66096a46e6a.jpg
[523] logo = https://app.mygenie.online//api/uploads/b4957b4661b1490fac9d4fd1e6c960….png
[672] logo = https://app.mygenie.online//api/uploads/f98fe20c1e1447aeb4ae8d54a1673b….png
```

These are **absolute URLs pointing to `app.mygenie.online`** — a PREVIOUS (older) deployment of this same codebase.

**Confirmed 404:**
```bash
curl -sI "https://app.mygenie.online/api/uploads/9101952a06744cbba67fe66096a46e6a.jpg"
# → HTTP/2 404
```

---

### Step 6 — Understand the architecture change between old and new upload

| Item | OLD architecture | NEW architecture |
|------|-----------------|-----------------|
| Storage backend | Local disk: `/app/backend/uploads/` | Emergent object storage via `integrations.emergentagent.com` |
| Serving mechanism | `StaticFiles` mount (now commented out) | `/api/upload/image/{filename}` fetches from object store |
| URL pattern stored | `https://<old-host>/api/uploads/{filename}` | `https://<this-host>/api/upload/image/{filename}` |
| Files present on new server | **None** — local disk was not migrated | N/A — object store empty (never successfully uploaded) |

Evidence from `server.py` line 2:
```python
from fastapi.staticfiles import StaticFiles  # kept for potential future use
```

The `StaticFiles` import exists but is **unused** — the old `/api/uploads/` static file mount was removed when the architecture switched to Emergent object storage.

The URL `https://socket.mygenie.online/api/uploads/…` in the owner screenshot (different from `app.mygenie.online` in the DB) suggests even earlier deployments — the `socket.mygenie.online` domain was yet another previous instance's `REACT_APP_BACKEND_URL`.

---

## Root Cause Summary

### Root Cause A — Upload fails (400 Bad Request)

| Field | Value |
|-------|-------|
| **Root cause** | `EMERGENT_LLM_KEY` is not set in `/app/backend/.env` |
| **Classification** | `ENVIRONMENT` — missing env variable |
| **Mechanism** | `_init_storage()` sends `{"emergent_key": null}` → storage API returns 400 |
| **Confirmed** | YES — startup log, curl test, process environment all agree |
| **Fix direction** | Set `EMERGENT_LLM_KEY` in `/app/backend/.env`. The Emergent platform issues this key; it should be available via the `emergent_integrations_manager` tool or the platform admin UI. |

### Root Cause B — Previously uploaded logos are 404

| Field | Value |
|-------|-------|
| **Root cause** | Stored logo URLs are absolute references to previous (dead) deployment hosts (`app.mygenie.online`, `socket.mygenie.online`) |
| **Classification** | `DATA` + `ENVIRONMENT` — data was created against an old host; architecture changed |
| **Mechanism** | Old backend stored files on local disk, served via StaticFiles. New backend uses Emergent object storage. Old hosts/files are gone. Database still has old URLs. |
| **Confirmed** | YES — DB query shows 4 affected restaurants; curl confirms 404 on old host |
| **Fix direction** | Two options (owner decision required): |
| | **Option A:** Re-upload images through admin UI once upload is fixed (Option A above). Admin pastes new URL or re-uploads. |
| | **Option B:** Write a migration script to re-fetch each `app.mygenie.online/api/uploads/…` image and push it to Emergent object storage, updating the DB record. Only if the old host can be temporarily reached. |

---

## Data: Affected Restaurants with Broken Logo URLs

| Restaurant ID | Stored logoUrl (broken) |
|--------------|------------------------|
| 364 | `https://app.mygenie.online//api/uploads/5ccda619d6d448bc94a937226082a700.png` |
| 716 | `https://app.mygenie.online/api/uploads/9101952a06744cbba67fe66096a46e6a.jpg` |
| 523 | `https://app.mygenie.online//api/uploads/b4957b4661b1490fac9d4fd1e6c9607f.png` |
| 672 | `https://app.mygenie.online//api/uploads/f98fe20c1e1447aeb4ae8d54a167…png` |

4 of 12 configured restaurants are affected. Restaurants 618, 698, 478, 675, 541, 391, 834 have no logoUrl set (not affected).

---

## What Is NOT the root cause

- The frontend is **not** calling `integrations.emergentagent.com` directly. The error originates entirely in the backend.
- `INTEGRATION_PROXY_URL` **is** set correctly in the supervisor environment.
- The MongoDB connection is healthy; the DB is reachable and config records exist.
- The React admin UI is correctly calling `REACT_APP_BACKEND_URL/api/upload/image` (correct endpoint).

---

## Recommendation

| Priority | Action | Owner decision needed? |
|----------|--------|----------------------|
| P1 | Set `EMERGENT_LLM_KEY` in `/app/backend/.env` and restart backend | No — environment config |
| P2 | Decide on logo URL migration strategy (re-upload vs. script migration) | **Yes — owner decides** |

Next role recommended: **PLANNING** (to handle env variable update) or direct **DEPLOYMENT** role if owner approves adding the key immediately.

---

```
Investigation complete: INV-2026-09-10-001
Root cause: (A) EMERGENT_LLM_KEY missing → storage init 400; (B) Logo URLs point to dead previous-deployment hosts
Classification: (A) ENVIRONMENT / (B) DATA+ENVIRONMENT
Confidence: HIGH
Steps used: 6/10
Evidence: This report + backend logs + curl test + DB query + code trace
Recommendation: PLANNING or DEPLOYMENT to add EMERGENT_LLM_KEY; Owner decision on logo migration strategy
Report: /app/memory/change_requests/INV-2026-09-10-001-logo-upload-emergent-storage/INVESTIGATION_REPORT.md
```
