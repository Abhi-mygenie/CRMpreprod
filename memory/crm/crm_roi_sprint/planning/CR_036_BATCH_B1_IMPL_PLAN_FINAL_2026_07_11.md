# CR-036 Batch B.1 — Consolidated Implementation Plan (FINAL)

> **Document**: `CR_036_BATCH_B1_IMPL_PLAN_FINAL_2026_07_11.md`
> **Date**: 2026-07-11
> **Role**: PLANNING
> **Status**: READY FOR IMPLEMENTATION GATE
> **Supersedes**:
>   - `CR_036_MEDIA_TEMPLATE_APPROVAL_AND_DELIVERY_IMPL_PLAN.md` (2026-07-03) — §3.4-3.11 consumed, resolver section overridden by §q14-revert
>   - `CR_036_SCOPE_AMENDMENT_2026_07_04.md` — Parts 3+4 already shipped in Batch A; Batch B.1 scope isolated here
>   - `CR_036_BATCH_B1_IMPACT_ANALYSIS_2026_07_11.md` — all 13 gaps resolved, Q15-Q19 locked, V15-V26 matrix carried forward
> **Decisions consumed**: `DECISIONS_LOG.md` — §scope, §q1-q8, §q9-q12, §g2, §g5, §g6, §g10, §batch-a-gap, §q13, §q14-revert, §q15-through-q19
> **Risk**: MEDIUM-HIGH (hotspot files `routers/whatsapp.py`, `routers/campaigns.py`, `core/whatsapp.py` — all owner-approved Q8/Q19)

---

## 0. Session start

```text
Project: MyGenie CRM
Role selected: PLANNING
Reason: Registered item CR-036 Batch B.1 has approved plan fragments across 3 documents + 1 impact analysis + 19 owner decisions. Owner requested a single consolidated edit-by-edit implementation plan before opening the Implementation gate.
Risk level: MEDIUM-HIGH
Docs read: CR_036_MEDIA_HEADER_UPLOAD_DISCOVERY.md, CR_036_MEDIA_TEMPLATE_APPROVAL_AND_DELIVERY_IMPL_PLAN.md, CR_036_PLANNING_RCA_2026_07_04.md, CR_036_SCOPE_AMENDMENT_2026_07_04.md, CR_036_BATCH_B1_IMPACT_ANALYSIS_2026_07_11.md, DECISIONS_LOG.md §CR-036 (all entries)
Blocked by unknowns: NONE — all 19 owner decisions locked, AWS creds live, META_APP_ID live
Next action: Author this consolidated plan → hand to Implementation
```

---

## 1. Objective (single sentence)

Ship Batch B.1 so that WhatsApp media-header templates work end-to-end: file upload → Meta approval handle → S3 delivery URL → campaign/event/test send with media → fail-loud on legacy templates missing media.

---

## 2. Pre-conditions (verified)

| Item | Status |
|---|---|
| `core/s3.py` module exists with `S3_CONFIGURED`, `put_public_object()`, `get_public_url()`, `delete_object()` | ✅ Shipped Batch A |
| AWS creds in `.env` (`mygenie-prod` bucket, `ap-south-1`) | ✅ Live |
| `META_APP_ID=874516431301713` in `.env` | ✅ Live (Q14-revert) |
| `boto3` in `requirements.txt` | ✅ Present |
| `httpx` importable in backend | ✅ Already used in `routers/whatsapp.py` |
| Batch A.1 `_resolve_logo_url` patch shipped | ✅ |
| B.0.1 `GET/PUT /whatsapp/api-key` supports `meta_app_id` | ✅ |
| Hotspot approvals: Q8 (whatsapp.py, campaigns.py), Q12 (auth.py, invoice_generator.py, invoices.py), Q19 (core/whatsapp.py) | ✅ All locked |

---

## 3. Files-will-change (definitive lock)

| # | File | Type | Summary | ~LOC delta |
|---|---|---|---|---|
| F1 | `backend/core/meta_media.py` | **NEW** | `resolve_meta_app_id(user)` resolver + `upload_to_meta_uploads(user, file_bytes, mime, filename)` 2-step resumable upload helper | +95 |
| F2 | `backend/routers/whatsapp.py` | EDIT | 7 discrete edits (E1-E7 below) | +160 / -15 |
| F3 | `backend/routers/campaigns.py` | EDIT | 2 discrete edits (E8-E9 below) | +55 |
| F4 | `backend/core/whatsapp.py` | EDIT | 1 discrete edit (E10) — event send media fallback | +8 |
| F5 | `backend/models/schemas.py` | EDIT | 1 discrete edit (E11) — additive fields | +6 |
| F6 | `backend/migrations/cr036_flag_legacy_media_templates.py` | **NEW** | One-shot idempotent migration script | +25 |
| F7 | `frontend/src/components/templates/MediaHeaderUpload.jsx` | **NEW** | File picker + upload + preview + creds guard component | +110 |
| F8 | `frontend/src/pages/TemplateBuilderPage.jsx` | EDIT | 3 discrete edits (E14-E16) — wire MediaHeaderUpload, remove audio, block `{{n}}` | +25 / -10 |
| F9 | `frontend/src/pages/TemplatesPage.jsx` | EDIT | 2 discrete edits (E17-E18) — banner + re-upload button | +60 |
| F10 | `frontend/src/pages/CampaignWizardPage.jsx` | EDIT | 1 discrete edit (E19) — tooltip warning for stale media templates | +8 |

**Total**: ~550 net-new LOC across 10 files (6 modified + 4 new).

### Files WILL NOT touch

- `core/whatsapp.py::send_single_message` / `send_bulk_messages` — AuthKey payload construction already supports `media_url` via WhatsAppMessage dataclass. Zero change.
- `core/campaign_jobs.py` — scheduler; consumes campaign records, delegates to `_execute_campaign_send`. Zero change.
- `WhatsAppMessage` dataclass (lines 19-29) — already has `media_url` + `media_filename` fields.
- `core/coupon.py`, `core/loyalty.py`, `routers/pos.py`, `routers/auth.py` — unrelated.
- `core/s3.py` — already has all helpers needed. Zero change.
- `whatsapp_message_logs` existing field semantics (BUG-006 lock preserved).
- AuthKey callback/webhook code path (lines 1300-1835 of whatsapp.py) — unrelated.

---

## 4. Ordered build sequence

Implementation MUST follow this exact order. Each step is self-contained and can be smoke-tested before proceeding.

```text
Step 1: F1  — core/meta_media.py (NEW)
Step 2: F5  — models/schemas.py (E11 — additive fields)
Step 3: F2  — routers/whatsapp.py (E1-E7, in order)
Step 4: F3  — routers/campaigns.py (E8-E9)
Step 5: F4  — core/whatsapp.py (E10)
Step 6: F6  — migration script (NEW, run once)
Step 7: F7  — MediaHeaderUpload.jsx (NEW)
Step 8: F8  — TemplateBuilderPage.jsx (E14-E16)
Step 9: F9  — TemplatesPage.jsx (E17-E18)
Step 10: F10 — CampaignWizardPage.jsx (E19)
Step 11: Verification — V15-V26
```

---

## 5. Edit-by-edit specification

---

### Step 1 · F1 · `backend/core/meta_media.py` (NEW FILE)

**Purpose**: Isolate all Meta `/uploads` API interaction + APP_ID resolution.

```python
"""
CR-036 Batch B.1 · Meta media upload helper
============================================

Two responsibilities:
1. resolve_meta_app_id(user) — env-first with per-tenant override (Q14-revert).
2. upload_to_meta_uploads(user, file_bytes, mime, filename) — 2-step resumable
   upload to Meta Graph API /uploads → returns opaque handle string.

References:
  - DECISIONS_LOG § 2026-07-11 [CR-036] §q14-revert
  - Meta WhatsApp Business Cloud API: Resumable Upload
"""

import logging
import os
from typing import Optional

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

META_GRAPH_BASE = os.environ.get("META_GRAPH_API_URL", "https://graph.facebook.com/v18.0")


def resolve_meta_app_id(user: dict) -> str:
    """
    Env-first Meta APP_ID resolver.
    Per DECISIONS_LOG § 2026-07-11 [CR-036] §q14-revert.

    Order:
      1. user['meta_app_id'] → per-tenant override (dormant for all 6 current tenants)
      2. os.environ['META_APP_ID'] → AuthKey's shared Meta Business App id
      3. neither → HTTPException(503)
    """
    override = (user.get("meta_app_id") or "").strip()
    if override:
        return override
    env_val = (os.environ.get("META_APP_ID") or "").strip()
    if env_val:
        return env_val
    raise HTTPException(
        status_code=503,
        detail="Meta App ID not configured. Contact admin or set override in Settings > WhatsApp.",
    )


async def upload_to_meta_uploads(
    user: dict,
    file_bytes: bytes,
    mime: str,
    filename: str,
) -> str:
    """
    Two-step Meta resumable upload → returns opaque handle string.

    Step A: POST /{app_id}/uploads → creates upload session → returns {id: "upload:..."}
    Step B: POST /{session_id} with file_offset=0 + binary body → returns {h: "4:abc..."}

    Requires user to have meta_access_token set (fetched from DB before call).
    """
    app_id = resolve_meta_app_id(user)
    access_token = (user.get("meta_access_token") or "").strip()
    if not access_token:
        raise HTTPException(
            status_code=400,
            detail="Meta Access Token missing — configure in Settings > WhatsApp > Meta API.",
        )

    async with httpx.AsyncClient(timeout=60.0) as client:
        # Step A — create upload session
        step_a_url = f"{META_GRAPH_BASE}/{app_id}/uploads"
        step_a_resp = await client.post(
            step_a_url,
            headers={"Authorization": f"OAuth {access_token}"},
            data={
                "file_length": str(len(file_bytes)),
                "file_type": mime,
                "file_name": filename,
            },
        )
        if step_a_resp.status_code != 200:
            logger.error("CR-036 Meta upload Step A failed: %s %s", step_a_resp.status_code, step_a_resp.text)
            raise HTTPException(status_code=502, detail=f"Meta upload session creation failed: {step_a_resp.text[:200]}")

        session_id = step_a_resp.json().get("id")
        if not session_id:
            raise HTTPException(status_code=502, detail="Meta upload Step A: missing session ID in response")

        # Step B — upload binary
        step_b_url = f"{META_GRAPH_BASE}/{session_id}"
        step_b_resp = await client.post(
            step_b_url,
            headers={
                "Authorization": f"OAuth {access_token}",
                "file_offset": "0",
            },
            content=file_bytes,
        )
        if step_b_resp.status_code != 200:
            logger.error("CR-036 Meta upload Step B failed: %s %s", step_b_resp.status_code, step_b_resp.text)
            raise HTTPException(status_code=502, detail=f"Meta upload binary failed: {step_b_resp.text[:200]}")

        handle = step_b_resp.json().get("h")
        if not handle:
            raise HTTPException(status_code=502, detail="Meta upload Step B: missing handle in response")

        logger.info("CR-036 Meta upload success: handle=%s (app_id=%s)", handle[:20], app_id)
        return handle
```

**~95 LOC. Self-contained. No imports from routers.**

---

### Step 2 · F5 · E11 · `backend/models/schemas.py` — additive fields

**Location**: Find the section with message-log or template-related models. Add:

**Edit E11**: Grep for existing model definitions. Since these are MongoDB documents (not strict Pydantic validation on every field), the critical additions are:

1. If a `MessageLog` / message-log writer exists that references a strict field set → add `status_note: Optional[str] = None`
2. If a `CustomTemplate` model exists → add `header_handle`, `send_media_url`, `send_media_filename`, `header_media_mime`, `needs_media_reupload`

**Action**: Search `schemas.py` for `class.*Template` or `class.*Message` to find insertion points. If no strict models exist for these collections (Mongo flexible schema), this step reduces to a documentation-only note and the fields are handled directly in router code (which they are — the current template create/update uses raw `dict`, not a Pydantic model).

**Verdict**: Based on code inspection, `custom_templates` are handled as raw dicts (line 161-190 in `routers/whatsapp.py`). No Pydantic model to edit. `whatsapp_message_logs` writes happen in `core/whatsapp.py::log_message_attempt` which accepts `**kwargs`. **E11 is a NO-OP for code** — the fields are added directly in the router edits (E1, E3, E4, E8). Add a comment block in `schemas.py` for documentation:

```python
# CR-036 Batch B.1 — Additive fields on existing collections:
#   custom_templates: header_handle (str|None), send_media_url (str|None),
#                     send_media_filename (str|None), header_media_mime (str|None),
#                     needs_media_reupload (bool, default False)
#   whatsapp_message_logs: status_note (str|None) — e.g. "media_missing"
```

---

### Step 3 · F2 · `backend/routers/whatsapp.py` — 7 edits

---

#### E1 · NEW endpoint `POST /whatsapp/upload-media-header` (~90 LOC)

**Location**: Insert after the `create_custom_template` endpoint (after line ~195, before `list_custom_templates`).

**Imports needed** (add at top of file if not present):
```python
from fastapi import UploadFile, File, Form
from core.meta_media import upload_to_meta_uploads
from core.s3 import put_public_object, get_public_url, S3_CONFIGURED
from io import BytesIO
import time
```

**Endpoint code**:
```python
# CR-036 Batch B.1: Dual upload (Meta /uploads + S3) for media header files
_MEDIA_CAPS = {
    "image":    {"max_bytes": 5 * 1024 * 1024,   "mimes": {"image/jpeg", "image/png"}},
    "video":    {"max_bytes": 16 * 1024 * 1024,   "mimes": {"video/mp4", "video/3gpp"}},
    "document": {"max_bytes": 100 * 1024 * 1024,  "mimes": {"application/pdf"}},
}

def _classify_mime(mime: str) -> Optional[str]:
    for kind, cfg in _MEDIA_CAPS.items():
        if mime in cfg["mimes"]:
            return kind
    return None


@router.post("/upload-media-header")
async def upload_media_header(
    file: UploadFile = File(...),
    template_slug: str = Form("template"),
    user: dict = Depends(get_current_user),
):
    """CR-036 B.1: Upload a media file to both Meta /uploads (for approval handle)
    and S3 (for send-time delivery URL). Returns both artifacts."""

    # 1. Fetch user's Meta creds
    user_doc = await db.users.find_one(
        {"id": user["id"]},
        {"meta_waba_id": 1, "meta_access_token": 1, "meta_app_id": 1},
    )
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    waba_id = (user_doc.get("meta_waba_id") or "").strip()
    access_token = (user_doc.get("meta_access_token") or "").strip()
    if not waba_id or not access_token:
        raise HTTPException(
            status_code=400,
            detail="Meta credentials missing — configure Settings > WhatsApp > Meta API.",
        )

    # 2. Validate MIME + size
    mime = file.content_type or ""
    kind = _classify_mime(mime)
    if not kind:
        raise HTTPException(status_code=400, detail=f"Unsupported media type: {mime}")
    cap = _MEDIA_CAPS[kind]["max_bytes"]

    contents = await file.read()
    if len(contents) > cap:
        max_mb = cap // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"File too large. Max for {kind}: {max_mb} MB.")

    # 3. Upload to Meta /uploads (Part 1 — approval handle)
    user_for_meta = {**user_doc, "meta_access_token": access_token}
    handle = await upload_to_meta_uploads(user_for_meta, contents, mime, file.filename or "media")

    # 4. Upload to S3 (Part 2 — delivery URL)
    if not S3_CONFIGURED:
        raise HTTPException(status_code=503, detail="S3 not configured — cannot store delivery media.")
    import re
    def _slug(s, mx=40):
        return re.sub(r"[^A-Za-z0-9._-]+", "_", (s or ""))[:mx]
    ts = int(time.time())
    s3_key = f"media-headers/{_slug(user['id'])}/{_slug(template_slug)}/{ts}_{_slug(file.filename or 'media')}"
    put_public_object(s3_key, contents, mime)
    send_media_url = get_public_url(s3_key)

    return {
        "handle": handle,
        "send_media_url": send_media_url,
        "mime": mime,
        "filename": file.filename or "media",
        "kind": kind,
    }
```

---

#### E2 · MODIFY `build_meta_template_payload` — send handle not URL

**Location**: Lines 488-492 (current code).

**Before** (exact match):
```python
        elif header_type in ("image", "video", "document"):
            # G4 fix: media headers need example handle for Meta approval
            media_url = payload.get("media_url", "")
            if media_url:
                header_component["example"] = {"header_handle": [media_url]}
```

**After**:
```python
        # CR-036 B.1: send Meta's opaque handle, NOT the URL (Q3, Q13 — no audio)
        elif header_type in ("image", "video", "document"):
            handle = payload.get("header_handle")
            if handle:
                header_component["example"] = {"header_handle": [handle]}
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Media header template missing header_handle. Re-upload the header file first.",
                )
```

---

#### E3 · MODIFY `create_custom_template` — persist new fields

**Location**: Lines 176-189 (the `doc = {…}` dict in `create_custom_template`).

**Before** — find the line:
```python
        "media_url": payload.get("media_url", ""),
```

**After** — replace that single line with:
```python
        "media_url": payload.get("media_url", ""),
        # CR-036 B.1: Meta opaque handle for approval submission
        "header_handle": payload.get("header_handle") or None,
        # CR-036 B.1: public S3 URL for send-time delivery
        "send_media_url": payload.get("send_media_url") or None,
        "send_media_filename": payload.get("send_media_filename") or None,
        "header_media_mime": payload.get("header_media_mime") or None,
        "needs_media_reupload": False,
```

---

#### E4 · MODIFY `update_custom_template` — persist new fields + Q16 block

**Location**: Lines 209-237 (the `update_custom_template` function).

**Insert BEFORE the `update_fields = {…}` dict** (after the existing `variables` extraction):
```python
    # CR-036 B.1 Q16: block edits on approved templates
    existing = await db.custom_templates.find_one(
        {"id": template_id, "user_id": user["id"]}, {"status": 1}
    )
    if existing and existing.get("status") == "approved":
        raise HTTPException(
            status_code=400,
            detail="Cannot edit an approved template. Meta approvals are immutable — clone and create a new version instead.",
        )
```

**Within the `update_fields = {…}` dict**, find:
```python
        "media_url": payload.get("media_url", ""),
```
**After** — replace that single line with:
```python
        "media_url": payload.get("media_url", ""),
        # CR-036 B.1: persist media fields on update
        "header_handle": payload.get("header_handle") or None,
        "send_media_url": payload.get("send_media_url") or None,
        "send_media_filename": payload.get("send_media_filename") or None,
        "header_media_mime": payload.get("header_media_mime") or None,
        "needs_media_reupload": False,
```

---

#### E5 · MODIFY `test_template` — Q17 auto-inject send_media_url

**Location**: Line 999-1030 (`test_template` endpoint).

**Insert AFTER the phone validation block** (after `if not phone or len(phone) < 10:` block, before the `message = WhatsAppMessage(…)` construction):

```python
    # CR-036 B.1 Q17: auto-inject stored send_media_url for media templates
    effective_media_url = request.media_url
    effective_media_filename = request.media_filename
    if not effective_media_url and request.template_id:
        tpl = await db.custom_templates.find_one(
            {"user_id": user["id"], "authkey_wid": request.template_id},
            {"header_type": 1, "send_media_url": 1, "send_media_filename": 1},
        )
        if not tpl:
            # Fallback: try by template id field
            tpl = await db.custom_templates.find_one(
                {"user_id": user["id"], "id": request.template_id},
                {"header_type": 1, "send_media_url": 1, "send_media_filename": 1},
            )
        if tpl and tpl.get("header_type") in ("image", "video", "document"):
            if tpl.get("send_media_url"):
                effective_media_url = tpl["send_media_url"]
                effective_media_filename = tpl.get("send_media_filename") or "file"
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Media template missing send_media_url — re-upload the header file first.",
                )
```

**Then modify the `WhatsAppMessage(…)` construction** to use `effective_media_url` and `effective_media_filename` instead of `request.media_url` and `request.media_filename`.

---

#### E6 · MODIFY header_type validation — Q18 block `{{n}}` in media headers

**Location**: Inside the validation block of the submit-to-Meta flow (the `submit_custom_template_to_meta` endpoint). Find the section that validates header content. Add:

```python
    # CR-036 B.1 Q18: reject {{n}} variables in media header content
    import re as _re
    if header_type_raw in ("image", "video", "document"):
        hc = payload.get("header_content", "")
        if _re.search(r'\{\{\d+\}\}', hc):
            raise HTTPException(
                status_code=400,
                detail="Dynamic variables {{n}} are not supported in media header content. Only static media headers are supported.",
            )
```

---

#### E7 · MODIFY `list_custom_templates` response — include new fields

**No code change needed.** The `find({"user_id": user["id"]}, {"_id": 0})` query returns all fields from MongoDB, so `send_media_url`, `header_handle`, `needs_media_reupload` etc. are automatically included when present. Self-verifying.

---

### Step 4 · F3 · `backend/routers/campaigns.py` — 2 edits

---

#### E8 · NEW helper `_get_template_send_media` + G5 gate

**Location**: Insert near the top of the file (after imports, before the first endpoint), around line 25.

```python
# CR-036 B.1: template media lookup for campaign sends
async def _get_template_send_media(user_id: str, template_id: str):
    """Return (send_media_url, send_media_filename, header_type) for a template.
    Returns (None, None, None) if template has no media header or is text-only."""
    tpl = await db.custom_templates.find_one(
        {"user_id": user_id, "authkey_wid": template_id},
        {"send_media_url": 1, "send_media_filename": 1, "header_type": 1, "needs_media_reupload": 1},
    )
    if not tpl:
        # Fallback: lookup by "id" field (for templates not yet submitted to Meta)
        tpl = await db.custom_templates.find_one(
            {"user_id": user_id, "id": template_id},
            {"send_media_url": 1, "send_media_filename": 1, "header_type": 1, "needs_media_reupload": 1},
        )
    if not tpl:
        return None, None, None
    ht = tpl.get("header_type")
    if ht not in ("image", "video", "document"):
        return None, None, None
    url = tpl.get("send_media_url")
    fname = tpl.get("send_media_filename") or "file"
    return url, fname, ht
```

---

#### E9 · MODIFY all 3 WhatsAppMessage construction sites

**For each of the 3 sites** (line ~274, ~512, ~796), apply this pattern:

**Before each `WhatsAppMessage(…)` construction**, insert:
```python
            # CR-036 B.1: attach media if template has a header
            _media_url, _media_fname, _media_ht = await _get_template_send_media(user_id_or_user["id"], template_id)
```

**If this is inside a per-recipient loop**, hoist the lookup OUTSIDE the loop (fetch once, reuse per recipient).

**G5 gate** — inside the per-recipient loop, BEFORE appending the message:
```python
            # CR-036 B.1 G5: fail-loud for media templates missing send_media_url
            if _media_ht and not _media_url:
                # Skip this recipient — mark as failed with status_note
                await db.whatsapp_message_logs.insert_one({
                    "user_id": user_id,
                    "customer_id": cust.get("id"),
                    "customer_phone": phone,
                    "template_id": template_id,
                    "campaign_id": campaign_id,
                    "status": "failed",
                    "status_note": "media_missing",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "is_test": is_test_flag,
                })
                failed_count += 1
                continue
```

**Modify the `WhatsAppMessage(…)` call itself** to add:
```python
            msg = WhatsAppMessage(
                phone=phone,
                country_code=country_code,
                template_id=template_id,
                body_values=body_values,
                customer_id=cust.get("id"),
                media_url=_media_url,          # CR-036 B.1
                media_filename=_media_fname,   # CR-036 B.1
            )
```

**Apply to all 3 sites:**
1. **Normal send** (`_execute_campaign_send`, ~line 274) — hoist lookup before the recipient loop (~line 255).
2. **Test send** (`test_campaign_send`, ~line 512) — single recipient, lookup before message construction.
3. **Resend-failed** (`resend_failed_campaign_messages`, ~line 796) — hoist lookup before the loop (~line 780).

---

### Step 5 · F4 · E10 · `backend/core/whatsapp.py` — event send fallback

**Location**: Line ~807 (inside `send_event_message`, the `WhatsAppMessage(…)` construction).

**Before** (exact match):
```python
        message = WhatsAppMessage(
            phone=phone,
            country_code=country_code,
            template_id=template_id,
            body_values=body_values,
            customer_id=customer.get("id")
        )
```

**After**:
```python
        # CR-036 B.1 Q19: fallback media_url from template if event_data doesn't carry one
        _evt_media = (event_data or {}).get("media_url")
        _evt_fname = (event_data or {}).get("media_filename")
        if not _evt_media:
            _tpl = await db.custom_templates.find_one(
                {"user_id": user_id, "authkey_wid": template_id},
                {"send_media_url": 1, "send_media_filename": 1, "header_type": 1},
            )
            if _tpl and _tpl.get("header_type") in ("image", "video", "document") and _tpl.get("send_media_url"):
                _evt_media = _tpl["send_media_url"]
                _evt_fname = _tpl.get("send_media_filename") or "file"

        message = WhatsAppMessage(
            phone=phone,
            country_code=country_code,
            template_id=template_id,
            body_values=body_values,
            customer_id=customer.get("id"),
            media_url=_evt_media,          # CR-036 B.1 Q19
            media_filename=_evt_fname,     # CR-036 B.1 Q19
        )
```

**Add import at top of file** (if not present): `from core.database import db`

---

### Step 6 · F6 · `backend/migrations/cr036_flag_legacy_media_templates.py` (NEW FILE)

```python
"""
CR-036 B.1 · Migration — Flag legacy media templates for re-upload.

Marks custom_templates docs that have a media header_type but no
header_handle and no send_media_url with needs_media_reupload=true.

Safe to run multiple times (idempotent).
Reverse: db.custom_templates.updateMany({needs_media_reupload:true},{$unset:{needs_media_reupload:""}})
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / ".env")


async def run():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    result = await db.custom_templates.update_many(
        {
            "header_type": {"$in": ["image", "video", "document"]},
            "header_handle": {"$in": [None, ""]},
            "send_media_url": {"$in": [None, ""]},
            "needs_media_reupload": {"$ne": True},
        },
        {"$set": {"needs_media_reupload": True}},
    )
    print(f"CR-036 MIG: flagged {result.modified_count} templates for re-upload.")
    client.close()


if __name__ == "__main__":
    asyncio.run(run())
```

**Run**: `cd /app/backend && python migrations/cr036_flag_legacy_media_templates.py`
**Verify**: re-run → prints `flagged 0`.

---

### Step 7 · F7 · `frontend/src/components/templates/MediaHeaderUpload.jsx` (NEW FILE)

```jsx
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, CheckCircle, AlertTriangle, FileText, Film, Image } from "lucide-react";

const CAP_MB = { image: 5, video: 16, document: 100 };
const ACCEPT = {
  image: "image/jpeg,image/png",
  video: "video/mp4,video/3gpp",
  document: "application/pdf",
};

export function MediaHeaderUpload({
  headerType,
  currentHandle,
  currentSendMediaUrl,
  currentFilename,
  onUploaded,
}) {
  const { user, api } = useAuth();
  const hasMetaCreds = user?.meta_waba_id && user?.meta_access_token;
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(currentSendMediaUrl || null);
  const [fname, setFname] = useState(currentFilename || null);

  const maxMb = CAP_MB[headerType] || 5;

  if (!hasMetaCreds) {
    return (
      <div
        className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 flex items-center gap-2"
        data-testid="meta-creds-missing-banner"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Configure Meta API first (Settings &gt; WhatsApp &gt; Meta API) before uploading header media.
      </div>
    );
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`File too large. Max ${maxMb} MB for ${headerType}.`);
      return;
    }
    setUploading(true);
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    setFname(file.name);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("template_slug", "header");
    try {
      const resp = await api.post("/whatsapp/upload-media-header", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onUploaded(resp.data);
      setPreviewUrl(resp.data.send_media_url);
      setFname(resp.data.filename);
      toast.success("Header uploaded — Meta handle + delivery URL ready.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
      setPreviewUrl(currentSendMediaUrl || null);
      setFname(currentFilename || null);
    } finally {
      setUploading(false);
    }
  };

  const Icon = headerType === "image" ? Image : headerType === "video" ? Film : FileText;

  return (
    <div className="space-y-3" data-testid="media-header-upload">
      <div className="flex items-center gap-3">
        <label
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed cursor-pointer transition-colors
            ${uploading ? "opacity-50 pointer-events-none border-gray-300 bg-gray-50" : "border-[#F26B33] hover:bg-orange-50"}`}
        >
          <Upload className="h-4 w-4" />
          <span className="text-sm font-medium">{uploading ? "Uploading..." : "Choose file"}</span>
          <input
            type="file"
            accept={ACCEPT[headerType] || "*/*"}
            onChange={handleFile}
            disabled={uploading}
            className="hidden"
            data-testid="header-media-file-input"
          />
        </label>
        <span className="text-xs text-muted-foreground">Max {maxMb} MB ({headerType})</span>
      </div>

      {previewUrl && headerType === "image" && (
        <img src={previewUrl} alt="preview" className="max-h-40 rounded border" data-testid="header-media-preview" />
      )}
      {previewUrl && headerType !== "image" && fname && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="header-media-filename">
          <Icon className="h-4 w-4" /> {fname}
        </div>
      )}
      {currentHandle && (
        <div className="flex items-center gap-1 text-xs text-emerald-600" data-testid="header-handle-ok">
          <CheckCircle className="h-3 w-3" /> Meta handle ready
        </div>
      )}
    </div>
  );
}
```

---

### Step 8 · F8 · `frontend/src/pages/TemplateBuilderPage.jsx` — 3 edits

---

#### E14 · Replace URL input with MediaHeaderUpload component

**Location**: Lines 476-484 (current URL input block).

**Before**:
```jsx
            {["image", "video", "document"].includes(tpl.header_type) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Media URL</label>
                <Input value={tpl.media_url} onChange={e => updateField("media_url", e.target.value)}
```

**After** — replace the entire block with:
```jsx
            {["image", "video", "document"].includes(tpl.header_type) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Header Media</label>
                <MediaHeaderUpload
                  headerType={tpl.header_type}
                  currentHandle={tpl.header_handle}
                  currentSendMediaUrl={tpl.send_media_url}
                  currentFilename={tpl.send_media_filename}
                  onUploaded={({ handle, send_media_url, filename, mime, kind }) =>
                    setTpl(p => ({
                      ...p,
                      header_handle: handle,
                      send_media_url,
                      send_media_filename: filename,
                      header_media_mime: mime,
                      media_url: send_media_url,
                    }))
                  }
                />
              </div>
            )}
```

**Add import** at top:
```jsx
import { MediaHeaderUpload } from "@/components/templates/MediaHeaderUpload";
```

---

#### E15 · Remove audio from header_type options (Q13)

**Location**: Find the header type buttons/options. If current code has `"audio"` in the header type list, remove it. Current code at line 448 shows:
```jsx
const HEADER_TYPES = [
```
Ensure only: `none, text, image, video, document` are present. If audio isn't listed (current code only shows `image, video, document` in the validation at line 81), this is already correct.

---

#### E16 · Block `{{n}}` in media header content (Q18 — client-side)

**Location**: In the validation function (around line 78-84). Add after existing media URL validation:

```jsx
  if (["image", "video", "document"].includes(tpl.header_type) && /\{\{\d+\}\}/.test(tpl.header_content || "")) {
    errors.push("Dynamic variables {{n}} are not supported in media header content.");
  }
```

**Also update the existing media_url validation** (line 81-82) to use `send_media_url` check instead:
```jsx
  if (["image", "video", "document"].includes(tpl.header_type) && !tpl.header_handle && !tpl.send_media_url) {
    errors.push(`Please upload a media file for the ${tpl.header_type} header.`);
  }
```

---

#### Also: update submit payload

**Location**: The submit function that sends data to `POST /whatsapp/custom-templates`. Ensure the payload includes:
```javascript
header_handle: tpl.header_handle,
send_media_url: tpl.send_media_url,
send_media_filename: tpl.send_media_filename,
header_media_mime: tpl.header_media_mime,
```

---

### Step 9 · F9 · `frontend/src/pages/TemplatesPage.jsx` — 2 edits

---

#### E17 · Summary banner for templates needing re-upload (Q15-c)

**Location**: At the top of the templates list, after the page header.

```jsx
{/* CR-036 B.1: media re-upload banner */}
{templates.filter(t => t.needs_media_reupload).length > 0 && (
  <div
    className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 flex items-center gap-2 text-sm text-amber-900"
    data-testid="media-reupload-banner"
  >
    <AlertTriangle className="h-4 w-4 shrink-0" />
    <span>
      <strong>{templates.filter(t => t.needs_media_reupload).length}</strong> template(s) need media re-upload before they can send with media headers.
    </span>
  </div>
)}
```

---

#### E18 · Per-row re-upload button

**Location**: Inside each template row/card rendering.

```jsx
{tpl.needs_media_reupload && (
  <Button
    variant="outline"
    size="sm"
    onClick={() => navigate(`/template-builder/${tpl.id}`)}
    data-testid={`media-reupload-btn-${tpl.id}`}
    className="text-amber-700 border-amber-300 hover:bg-amber-50"
  >
    Re-upload Media
  </Button>
)}
```

**Add imports**: `AlertTriangle` from `lucide-react`, `useNavigate` from `react-router-dom` (likely already imported).

---

### Step 10 · F10 · E19 · `frontend/src/pages/CampaignWizardPage.jsx` — tooltip

**Location**: In the template selection step, when a selected template has `needs_media_reupload === true`:

```jsx
{selectedTemplate?.needs_media_reupload && (
  <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded mt-1" data-testid="campaign-media-warning">
    This template needs media re-upload before it can send with a media header. Messages will be marked as failed.
  </div>
)}
```

---

## 6. Verification matrix (V15–V26)

| # | Verification | Method | Maps to edit |
|---|---|---|---|
| V15 | `resolve_meta_app_id` env-fallback (empty per-tenant override) | Unit: call with `{'meta_app_id': ''}` → assert returns `os.environ['META_APP_ID']` | F1 |
| V16 | `resolve_meta_app_id` per-tenant override | Unit: call with `{'meta_app_id': '999'}` → assert returns `'999'` | F1 |
| V17 | `resolve_meta_app_id` 503 when both empty | Unit: empty user + unset env → assert `HTTPException(503)` | F1 |
| V18 | Path B/C send-time fail-loud (G5) | Integration: insert template with `header_type=IMAGE`, `send_media_url=None`; trigger campaign send; assert `whatsapp_message_logs` has `status='failed', status_note='media_missing'` | E9 |
| V19 | TemplatesPage banner + Re-upload button visible | Playwright: login, seed template without media, load `/templates`, assert `[data-testid=media-reupload-banner]` and `[data-testid=media-reupload-btn-{id}]` visible | E17, E18 |
| V20 | AuthKey sync does NOT populate `send_media_url` | Integration: `POST /whatsapp/authkey/sync-templates`; assert DB rows have `authkey_wid` but `send_media_url` is NULL | N/A (existing behavior — no code change) |
| V21 | PUT media on approved template → 400 (Q16) | curl: `PUT /custom-templates/{id}` with `status=approved`; expect 400 | E4 |
| V22 | Test-send auto-injects `send_media_url` (Q17) | Integration: `POST /whatsapp/test-template` on media template; verify AuthKey outbound includes `headerValues.headerData == template.send_media_url` | E5 |
| V23 | Audio NOT in Template Builder header options | Playwright: open Template Builder; assert header_type options are `[none, text, image, video, document]` only | E15 |
| V24 | 3 campaign send paths propagate `media_url` | Static grep: confirm `WhatsAppMessage(..., media_url=_media_url` at each of 3 sites | E9 |
| V25 | Event send falls back to `template.send_media_url` (Q19) | Integration: trigger event where mapping has empty `media_url`; assert AuthKey payload has `headerData` = template's `send_media_url` | E10 |
| V26 | Clone across tenants — S3 copy + fresh Meta handle | Integration: clone template as tenant B; assert new S3 key under `media-headers/{tenant_b.id}/...` and new `header_handle` from fresh `/uploads` call | Future (clone logic is in-scope per G10 but deferred if no clone endpoint exists today) |

---

## 7. Migration & deployment checklist

| # | Action | When |
|---|---|---|
| 1 | Verify `META_APP_ID=874516431301713` in `/app/backend/.env` | ✅ Already done |
| 2 | Verify AWS creds live in `.env` | ✅ Already done |
| 3 | Create `backend/migrations/` directory if missing | At Step 6 |
| 4 | Implement Steps 1-10 in order | Implementation session |
| 5 | `sudo supervisorctl restart backend` | After Step 5 |
| 6 | Run migration: `cd /app/backend && python migrations/cr036_flag_legacy_media_templates.py` | After Step 6 |
| 7 | `sudo supervisorctl restart frontend` | After Step 10 |
| 8 | Execute V15-V26 | After Step 11 |
| 9 | Manual E2E: upload image → submit template → send to owner phone → verify image received | Final smoke |

---

## 8. Rollback plan

- **Code**: Emergent platform rollback to pre-B.1 checkpoint. `sudo supervisorctl restart backend frontend`.
- **Migration**: `db.custom_templates.updateMany({needs_media_reupload: true}, {$unset: {needs_media_reupload: ""}})` — harmless to leave in place if code reverted.
- **S3 objects**: Leave in place. Harmless (pennies/month). Set lifecycle policy to expire >90d if cleanup desired.
- **Env vars**: Leave `META_APP_ID` and AWS creds in `.env` — harmless if code reverted.

---

## 9. B.2–B.4 sequencing (out-of-scope for this plan)

Batches B.2 (WhatsApp Reports `media_missing` filter chip + campaign wizard stale-template-block), B.3 (upload progress UX with chunked progress bar for large files, re-upload modal on TemplatesPage as lightweight alternative to navigating to Template Builder), and B.4 (pytest V15-V26 + Playwright V19/V23 + live E2E with real WhatsApp send to owner phone) can be sequenced in any order after B.1 ships, as they are purely additive polish and test-hardening on top of the B.1 functional foundation. Recommended sequence is B.2 → B.3 → B.4 to ship the most user-visible improvements first before investing in test infrastructure. Combined effort: ~6–8 hrs.

---

## Planning complete

```text
Planning complete: CR-036 Batch B.1
Stage: Consolidated Implementation Plan (single source document)
Code reality: PARTIAL (Batch A/A.1/B.0/B.0.1 shipped; B.1 = this plan)
Risk: MEDIUM-HIGH
Files WILL change: 10 (listed in §3)
Files WILL NOT touch: listed in §3
Owner decisions: ALL 19 LOCKED (Q1-Q19 + G2/G5/G6/G10)
Docs: This file
Next: Owner approval → Implementation gate open
```

---

*End of CR-036 Batch B.1 Consolidated Implementation Plan · 2026-07-11*
