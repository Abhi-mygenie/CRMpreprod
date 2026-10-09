# INTAKE DOC — BUG-2026-09-10-001

## Item Details

| Field | Value |
|-------|-------|
| **ID** | BUG-2026-09-10-001 |
| **Title** | Logo/image upload broken — replace Emergent object storage with local disk + StaticFiles |
| **Type** | BUG |
| **Severity** | P1 |
| **Risk** | MEDIUM |
| **Filed** | 2026-09-10 |
| **Filed by** | Owner (via investigation INV-2026-09-10-001) |
| **Status** | INTAKE COMPLETE — awaiting Planning |

---

## Owner Report (verbatim)

> "Storage upload failed: 400 Client Error: Bad Request for url: https://integrations.emergentagent.com/objstore/api/v1/storage/init"
>
> Previously uploaded logos show 404.
>
> "we don't want to use emergent for storing purpose"
>
> **Chosen fix: Option 2 — local disk + FastAPI StaticFiles**

---

## Classification

| Field | Value |
|-------|-------|
| **Type** | BUG |
| **Sub-type** | Environment config + architecture replacement |
| **Root cause** | `EMERGENT_LLM_KEY` not set → storage init sends `null` key → 400 Bad Request. Previously uploaded logo URLs point to dead deployment hosts. |
| **Root cause classification** | `ENVIRONMENT` (primary) + `DATA` (secondary — stale URLs in DB) |
| **Severity** | **P1** — Core admin feature broken (logo/banner/image upload does not work). Workaround exists: admin can manually paste an image URL. |
| **Blast radius** | SMALL — two functions in `server.py` only. No frontend changes. No auth/order/payment/cart impact. |
| **Duplicate check** | DISTINCT — no previous item covers this. INV-2026-09-10-001 covers the investigation only. |

---

## Severity Rationale

P1 (not P0): Upload is completely broken for all restaurants, but:
- Admins can paste a URL manually as a workaround.
- No customer-facing flows are impacted (landing page, menu, cart, order placement all unaffected).
- Data is not corrupted. No security or payment exposure.

Would be P0 if there were no workaround, or if it affected ordering.

---

## Risk Classification: MEDIUM

| Risk factor | Assessment |
|------------|-----------|
| Files changed | 1 file: `backend/server.py` |
| Scope of change | Remove 3 storage helper functions + 1 startup event call; replace 2 upload endpoint bodies; add StaticFiles mount |
| Auth / payment / order impact | **None** |
| Database schema change | None |
| Frontend change | **None required** — URL pattern `/api/upload/image/{filename}` retained for the GET endpoint; StaticFiles adds `/api/uploads/{filename}` |
| Downstream consumers | All admin pages that call `POST /api/upload/image` and store the returned URL |
| Known accepted risk | ⚠️ Local disk is **ephemeral** — files lost on container restart or redeploy. **Owner has been informed and accepted this trade-off.** |

No Fast Lane — `server.py` is a CRITICAL/HIGH-risk hotspot file per the agent prompt addendum (§6.5).

---

## Evidence

| Evidence item | Location |
|--------------|---------|
| Investigation report (root cause confirmed) | `/app/memory/change_requests/INV-2026-09-10-001-logo-upload-emergent-storage/INVESTIGATION_REPORT.md` |
| Backend log confirming 400 at every startup | `/var/log/supervisor/backend.out.log` |
| Live curl confirming null key → 400 | Captured in investigation |
| DB query showing 4 restaurants with broken logo URLs | Captured in investigation |
| `StaticFiles` import already present | `server.py` line 2: `from fastapi.staticfiles import StaticFiles  # kept for potential future use` |
| Placeholder in frontend already uses old URL pattern | `AdminSettingsPage.jsx` line 555: `placeholder="/api/uploads/promo.png or https://..."` |

---

## Chosen Fix: Option 2 — Local Disk + FastAPI StaticFiles

Owner explicitly chose Option 2 over:
- Option 1 (MongoDB GridFS)
- Option 3 (AWS S3 / Cloudflare R2)
- Option 4 (Cloudinary)

**What Option 2 does:**

| Step | Action |
|------|--------|
| 1 | Create `/app/backend/uploads/` directory |
| 2 | Mount `StaticFiles` at `/api/uploads/` — serves files directly |
| 3 | Replace `upload_image()` body: write file to disk instead of calling `_put_object()` |
| 4 | Replace `serve_upload()` body OR remove it (StaticFiles handles GET) |
| 5 | Remove `_init_storage()` call from startup event |
| 6 | Remove or deprecate `_init_storage`, `_put_object`, `_get_object` helpers (keep as dead code with comment, or delete) |

**URL returned to frontend after fix:**
```
{REACT_APP_BACKEND_URL}/api/uploads/{filename}
```
*(Note: matches the old URL pattern already stored in DB, but old files from `app.mygenie.online` are not migrated — those 4 restaurants must re-upload their logos.)*

**⚠️ Accepted limitation:** Files in `/app/backend/uploads/` are lost on container restart or redeploy. Owner accepted this at intake.

---

## Scope Declaration

### Files WILL change
| File | Change |
|------|--------|
| `/app/backend/server.py` | Remove Emergent storage helpers + startup call; add StaticFiles mount; rewrite `upload_image()` and `serve_upload()` |

### Files WILL NOT change
| File | Reason |
|------|--------|
| All frontend files | No frontend change needed — same endpoint, same URL pattern |
| `/app/frontend/.env` | No env change |
| `/app/backend/.env` | No env change (EMERGENT_LLM_KEY not needed) |
| `AuthContext.jsx` | Not touched |
| `CartContext.js` | Not touched |
| `ReviewOrder.jsx` | Not touched |
| All other backend routes | Not touched |

---

## Post-Fix Behaviour for Old Broken URLs

The 4 restaurants with `https://app.mygenie.online/api/uploads/…` logos in the DB will **still** 404 — those image files do not exist on this server and are not migrated. The fix only enables new uploads to succeed. Affected restaurant admins must re-upload their logos through the admin UI after the fix is deployed.

| Restaurant | Broken logo URL | Action needed |
|-----------|----------------|--------------|
| 364 | `https://app.mygenie.online//api/uploads/5ccda619…png` | Re-upload |
| 716 | `https://app.mygenie.online/api/uploads/9101952a…jpg` | Re-upload |
| 523 | `https://app.mygenie.online//api/uploads/b4957b46…png` | Re-upload |
| 672 | `https://app.mygenie.online//api/uploads/f98fe20c…png` | Re-upload |

---

## Next Steps

```
Intake complete: BUG-2026-09-10-001
Classification: BUG
Severity: P1
Risk: MEDIUM
Duplicate check: DISTINCT
Evidence: captured (investigation report + logs + curl + DB query)
Blast radius: SMALL (1 file — server.py)
Docs updated: this file + PRD.md (pending)
Next: Planning (Implementation Plan for local disk + StaticFiles fix)
```
