# CR-036 — Implementation Plan: Media Header Fix (Approval + Delivery via S3)

> **CR**: CR-036 (Part 1 + Part 2 bundled)
> **Priority**: P2 (blocks all media-template functionality end-to-end)
> **Type**: Bug fix + Feature (approval fix + delivery pipeline)
> **Owner approval status**: ✅ Q1-Q8 answered · hotspot APPROVED for `routers/whatsapp.py` + `routers/campaigns.py` (2026-07-03)
> **Effort**: ~10-12 hr (see §11)
> **Files touched**: 6 (backend: 3 modified + 1 new · frontend: 2 modified) + 1 env addition
> **Migration required**: **YES** — one-shot flag-legacy-templates migration (~10 LOC)
> **Schema changes**: Additive fields on `custom_templates` (`header_handle`, `send_media_url`, `needs_media_reupload`) — no destructive migration
> **New dependencies**: `boto3` (already in `requirements.txt` — verify)
> **Discovery**: `discovery/CR_036_MEDIA_HEADER_UPLOAD_DISCOVERY.md`
> **Investigation**: `discovery/INV_005_CAMPAIGN_MEDIA_SEND_GAP.md`
> **Impact analysis**: `crm_roi_sprint/planning/BATCH_2026_07_03_IMPACT.md` §4
> **Decisions**: `DECISIONS_LOG.md § 2026-07-03 [CR-036] Q1-Q8`

---

## 🔥 HOTSPOT DECLARATION (per §CRM-SPECIFIC OWNER APPROVAL)

This plan requires modifying **two HIGH-risk files**:

| File | Scope of change | Send semantics impact |
|---|---|---|
| `backend/routers/whatsapp.py` | (a) Fix `build_meta_template_payload` to send `header_handle` (opaque Meta handle) instead of URL. (b) Add new `POST /whatsapp/upload-media-header` endpoint. | NONE — send path untouched. Only template creation payload changes. |
| `backend/routers/campaigns.py` | Add `media_url=` + `media_filename=` arguments to `WhatsAppMessage()` constructor in all 3 send paths (normal ~line 274, test ~line 512, resend ~line 796). | **ADDITIVE ONLY**. Text-only templates: no change (media_url None). Media templates: gain the previously-missing `headerValues` block. |

Owner explicit approval on file: **"q8 approved"** (2026-07-03, DECISIONS_LOG). Formal hotspot flag raised in this plan.

**Rollback plan**: git revert → both files restored to prior state. No DB migration reversal needed (additive schema).

---

## 1. Objective

Fix WhatsApp media-header templates end-to-end so that:

- **Part 1 (approval)** — Template Builder uploads the media file to Meta, receives an opaque `header_handle` string, submits it in the template payload → Meta approves.
- **Part 2 (delivery)** — Same uploaded file is also stored on Amazon S3 with a public URL; the URL is stored on the template record as `send_media_url`; at campaign send time, this URL is attached to the AuthKey payload as `headerValues.headerData` → customer receives the media.

Both parts must ship together; either alone leaves media templates non-functional.

---

## 2. Scope

### 2.1 In-scope
- New backend endpoint `POST /api/whatsapp/upload-media-header` (multipart in → dual upload to Meta + S3 → return handle + URL).
- New backend module `core/s3.py` (thin wrapper around `boto3` for public-read uploads).
- Fix `build_meta_template_payload` at `routers/whatsapp.py:483-488` — send `header_handle` (from stored template record) instead of raw `media_url`.
- Persist `header_handle`, `send_media_url`, `needs_media_reupload` fields on `custom_templates` at creation time.
- Extend `WhatsAppMessage` usage in 3 send paths of `routers/campaigns.py` — look up template's `send_media_url` and pass to constructor.
- Frontend: replace URL text input in TemplateBuilderPage with file picker + progress + preview.
- Frontend: block file picker with clear banner if tenant lacks `meta_waba_id` / `meta_access_token`.
- Add audio to header_type options.
- Frontend: on TemplatesPage, show "Media re-upload required" banner on templates flagged `needs_media_reupload=true`.
- Migration script (one-shot): flag existing draft/rejected templates with media header type as `needs_media_reupload=true`.
- New env vars: `AWS_S3_BUCKET`, `AWS_S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.

### 2.2 Out-of-scope
- Any change to `core/whatsapp.py::send_single_message` (the AuthKey payload construction already supports `headerValues` when `media_url` is provided — no change needed).
- Event-triggered send path (`core/whatsapp.py::send_event_message` ~line 833) — already accepts `media_url` from event mapping; only augment IF the event has an approved template AND no explicit event-level media_url → then fallback to template's `send_media_url` (small companion change, ~5 LOC — included in scope).
- Meta-media-download-at-send-time alternative (rejected in Q6).
- CDN edge caching (out of scope; direct S3 URL is fine for current scale).
- Image resizing / thumbnails.
- Signed URLs (owner chose public-read bucket via `we will use amazon s3`).
- Bulk backfill of legacy approved templates (owner chose Q7 silent-degrade + banner rather than auto-fetch-from-Meta).
- Tag catalog admin panel.

### 2.3 Non-goals
- Auto-retry on S3 upload failure (fail loud, let user retry).
- Per-tenant S3 bucket (single shared bucket, folder-partitioned by tenant `user_id`).

---

## 3. Design

### 3.1 Data model changes (`custom_templates` collection)

**Additive fields** (no migration script for schema, defaults treated as missing):
- `header_handle: str | None` — Meta opaque handle, ~30d validity, valid only for template submission.
- `send_media_url: str | None` — public S3 URL, permanent, used at send time.
- `send_media_filename: str | None` — original filename, passed to AuthKey `headerValues.headerFileName`.
- `header_media_mime: str | None` — MIME type stored for validation.
- `needs_media_reupload: bool` — True for legacy drafts (via one-shot migration) and any submitted-but-rejected media templates. Cleared to False on successful re-upload.

**Legacy field `media_url`**: keep as-is on the document (used to be the raw URL). New logic reads `send_media_url` in preference. Do not delete legacy field — leave for forensic value.

### 3.2 One-shot migration script — flag legacy drafts

**File**: `backend/migrations/MIG_CR_036_flag_legacy_media_templates.py` (new)

```python
"""
CR-036 · Migration MIG-036 — Flag legacy media templates for re-upload.

Marks any custom_templates document that:
  - has header_type in {"image", "video", "document", "audio"}
  - AND has no header_handle
  - AND has no send_media_url

...with `needs_media_reupload: true`, so the Templates page shows a banner
prompting the tenant to re-upload the header file.

Safe to run multiple times (idempotent).
Reverse: `db.custom_templates.updateMany({needs_media_reupload:true}, {$unset:{needs_media_reupload:""}})`
"""
import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient

async def run():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    result = await db.custom_templates.update_many(
        {
            "header_type": {"$in": ["image", "video", "document", "audio"]},
            "header_handle": {"$in": [None, ""]},
            "send_media_url": {"$in": [None, ""]},
            "needs_media_reupload": {"$ne": True},
        },
        {"$set": {"needs_media_reupload": True}},
    )
    print(f"MIG-036: flagged {result.modified_count} templates for re-upload.")

if __name__ == "__main__":
    asyncio.run(run())
```

**Execution**: manual run at Implementation gate — `python /app/backend/migrations/MIG_CR_036_flag_legacy_media_templates.py`. Log the count. Idempotent.

### 3.3 Environment variables

**File**: `backend/.env`
**Additions** (owner supplies real values at Implementation gate):
```
AWS_S3_BUCKET="PLACEHOLDER_BUCKET_NAME"
AWS_S3_REGION="PLACEHOLDER_REGION"       # e.g. ap-south-1
AWS_ACCESS_KEY_ID="PLACEHOLDER_ACCESS_KEY_ID"
AWS_SECRET_ACCESS_KEY="PLACEHOLDER_SECRET_ACCESS_KEY"
```

**File**: `backend/requirements.txt` — verify `boto3` is present (was flagged in §15 Q8 as installed-but-unused). If missing, `pip install boto3 && pip freeze > requirements.txt`.

### 3.4 New backend module — `core/s3.py`

**File**: `backend/core/s3.py` (new)

```python
"""
CR-036 · S3 upload helper for WhatsApp header media assets.

Thin wrapper around boto3. Uploads a file object to the configured public-read
bucket under key `whatsapp_media/{user_id}/{template_slug}/{timestamp}_{filename}`
and returns the public HTTPS URL.

Configured entirely via environment variables:
  AWS_S3_BUCKET, AWS_S3_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
"""
import os
import re
import time
from typing import BinaryIO, Tuple

import boto3
from botocore.exceptions import ClientError

_BUCKET = os.environ.get("AWS_S3_BUCKET")
_REGION = os.environ.get("AWS_S3_REGION")

_client = None

def _get_client():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            region_name=_REGION,
            aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
        )
    return _client

def _slugify(s: str, max_len: int = 40) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", (s or ""))[:max_len]

def upload_header_media(
    user_id: str,
    template_slug: str,
    filename: str,
    content_type: str,
    file_obj: BinaryIO,
) -> Tuple[str, str]:
    """Upload a header media file to S3 and return (public_url, s3_key).

    Bucket must be configured with public-read on the whatsapp_media/ prefix
    (or the entire bucket) so Meta can fetch at send time.
    """
    if not _BUCKET or not _REGION:
        raise RuntimeError("S3 not configured — AWS_S3_BUCKET / AWS_S3_REGION missing")
    ts = int(time.time())
    key = f"whatsapp_media/{_slugify(user_id)}/{_slugify(template_slug)}/{ts}_{_slugify(filename)}"
    try:
        _get_client().upload_fileobj(
            file_obj,
            _BUCKET,
            key,
            ExtraArgs={
                "ContentType": content_type,
                "ACL": "public-read",
            },
        )
    except ClientError as e:
        raise RuntimeError(f"S3 upload failed: {e}") from e
    # Standard virtual-hosted-style URL. Works for all AWS regions with the
    # dot-region format (bucket.s3.<region>.amazonaws.com).
    public_url = f"https://{_BUCKET}.s3.{_REGION}.amazonaws.com/{key}"
    return public_url, key
```

### 3.5 New backend endpoint — `POST /whatsapp/upload-media-header`

**File**: `backend/routers/whatsapp.py`
**Location**: Add new endpoint near the existing template-builder endpoints (~line 200, right after `create_custom_template`).

**Contract**:
- Multipart form-data input: `file: UploadFile`, `template_slug: str` (form field, used for S3 key structure)
- Response: `{"handle": "4:abc123...", "send_media_url": "https://...s3.../key", "mime": "image/jpeg", "filename": "promo.jpg"}`

**Body**:
```python
# CR-036 Part 1 + Part 2: dual upload (Meta /uploads + S3) for header media

_MEDIA_CAPS = {
    "image": {"max_bytes": 5 * 1024 * 1024, "mimes": {"image/jpeg", "image/png"}},
    "video": {"max_bytes": 16 * 1024 * 1024, "mimes": {"video/mp4", "video/3gpp"}},
    "document": {"max_bytes": 100 * 1024 * 1024, "mimes": {"application/pdf"}},
    "audio": {"max_bytes": 16 * 1024 * 1024, "mimes": {"audio/aac", "audio/mp4", "audio/amr", "audio/mpeg", "audio/ogg"}},
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
    # (1) Validate tenant Meta creds present (Q5 — block early)
    user_doc = await db.users.find_one({"id": user["id"]}, {"meta_waba_id": 1, "meta_access_token": 1})
    waba_id = (user_doc or {}).get("meta_waba_id")
    access_token = (user_doc or {}).get("meta_access_token")
    if not waba_id or not access_token:
        raise HTTPException(
            status_code=400,
            detail="Meta credentials missing — configure Settings > WhatsApp > Meta API before uploading media."
        )

    # (2) Validate MIME + size
    mime = file.content_type or ""
    kind = _classify_mime(mime)
    if not kind:
        raise HTTPException(status_code=400, detail=f"Unsupported media type: {mime}")
    cap = _MEDIA_CAPS[kind]["max_bytes"]

    # Read into memory (streaming would be nicer but Meta uploads endpoint needs
    # Content-Length; largest file is 100MB PDF — acceptable in-memory footprint
    # for a single upload request)
    contents = await file.read()
    if len(contents) > cap:
        max_mb = cap // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max for {kind}: {max_mb} MB."
        )

    # (3) Upload to Meta /v21.0/{WABA_ID}/uploads (Part 1 — approval handle)
    meta_url = f"{os.environ['META_GRAPH_API_URL']}/v21.0/{waba_id}/uploads"
    async with httpx.AsyncClient(timeout=60.0) as client:
        meta_resp = await client.post(
            meta_url,
            headers={"Authorization": f"OAuth {access_token}"},
            files={"file": (file.filename, contents, mime)},
        )
    if meta_resp.status_code != 200:
        logger.error("CR-036 Meta upload failed: %s %s", meta_resp.status_code, meta_resp.text)
        raise HTTPException(status_code=502, detail=f"Meta upload rejected: {meta_resp.text[:200]}")
    handle = meta_resp.json().get("h")
    if not handle:
        raise HTTPException(status_code=502, detail="Meta upload response missing handle")

    # (4) Upload to S3 (Part 2 — delivery URL)
    from io import BytesIO
    try:
        send_media_url, s3_key = s3_upload_header_media(
            user_id=user["id"],
            template_slug=template_slug,
            filename=file.filename or "media",
            content_type=mime,
            file_obj=BytesIO(contents),
        )
    except RuntimeError as e:
        logger.error("CR-036 S3 upload failed: %s", e)
        raise HTTPException(status_code=502, detail=f"S3 upload failed: {e}")

    return {
        "handle": handle,
        "send_media_url": send_media_url,
        "mime": mime,
        "filename": file.filename or "media",
        "kind": kind,
    }
```

**Imports needed**:
```python
from fastapi import UploadFile, File, Form
import httpx
from core.s3 import upload_header_media as s3_upload_header_media
```
(`httpx` already used at line 382; verify no re-import needed.)

### 3.6 Modify `build_meta_template_payload` — send handle instead of URL

**File**: `backend/routers/whatsapp.py`
**Location**: Lines 483-488 (existing block that puts URL into `header_handle`).

**Before**:
```python
elif header_type in ("image", "video", "document"):
    header_component["format"] = header_type.upper()
    media_url = payload.get("media_url")
    if media_url:
        header_component["example"] = {"header_handle": [media_url]}
```

**After**:
```python
# CR-036 Part 1: send Meta's opaque handle in header_handle, NOT the URL.
# The handle is obtained via POST /whatsapp/upload-media-header and stored
# on the template record as header_handle.
elif header_type in ("image", "video", "document", "audio"):
    header_component["format"] = header_type.upper()
    handle = payload.get("header_handle")
    if handle:
        header_component["example"] = {"header_handle": [handle]}
    else:
        # Backward-compat: if template was drafted before CR-036 with only media_url,
        # surface a clear error rather than sending the wrong data type to Meta.
        raise ValueError(
            "Media header template missing header_handle. Please re-upload the header file."
        )
```

**Add "audio" to header_type validators** (upstream in the same file — grep for other places that check header_type against the tuple).

### 3.7 Persist new fields on template creation

**File**: `backend/routers/whatsapp.py`
**Location**: `create_custom_template` (~line 170-190).

**Before** (~ line 179-186):
```python
doc = {
    "id": str(uuid.uuid4()),
    "user_id": user["id"],
    "template_name": template_name,
    "header_type": payload.get("header_type", "none"),
    "media_url": payload.get("media_url", ""),
    # ... etc
}
```

**After** — persist the new fields when creating (payload will carry them from frontend after successful upload):
```python
doc = {
    "id": str(uuid.uuid4()),
    "user_id": user["id"],
    "template_name": template_name,
    "header_type": payload.get("header_type", "none"),
    # Legacy field — keep for forensic value, but no longer authoritative for media
    "media_url": payload.get("media_url", ""),
    # CR-036 Part 1: Meta opaque handle for approval submission
    "header_handle": payload.get("header_handle") or None,
    # CR-036 Part 2: public S3 URL for send-time delivery
    "send_media_url": payload.get("send_media_url") or None,
    "send_media_filename": payload.get("send_media_filename") or None,
    "header_media_mime": payload.get("header_media_mime") or None,
    # Cleared on successful media header creation
    "needs_media_reupload": False,
    # ... rest of existing fields ...
}
```

Also mirror on any template UPDATE endpoint (grep for `find_one_and_update` on `custom_templates`).

### 3.8 Extend campaign send paths with `media_url` (Part 2)

**File**: `backend/routers/campaigns.py`
**Location**: Lines 274-280, 512-518, 796-800.

**Helper** — add near top of file:
```python
# CR-036 Part 2: look up template's send_media_url for campaign sends
async def _get_template_send_media(user_id: str, template_id: str) -> Tuple[Optional[str], Optional[str]]:
    """Return (send_media_url, send_media_filename) for a template, or (None, None)
    if the template has no media header or hasn't been re-uploaded yet.
    Silent-degrade to text-only send when either is missing (per Q7 decision)."""
    tpl = await db.custom_templates.find_one(
        {"user_id": user_id, "id": template_id},
        {"send_media_url": 1, "send_media_filename": 1, "header_type": 1, "template_name": 1},
    )
    if not tpl:
        return None, None
    if tpl.get("header_type") not in ("image", "video", "document", "audio"):
        return None, None
    url = tpl.get("send_media_url")
    if not url:
        logger.warning(
            "CR-036: campaign send missing media_url for template %s (user=%s) — "
            "silent-degrade to text-only",
            tpl.get("template_name"), user_id,
        )
        return None, None
    return url, tpl.get("send_media_filename") or "file"
```

**Path 1 — normal send** (line 274-280). Before:
```python
msg = WhatsAppMessage(
    phone=phone, country_code=country_code,
    template_id=template_id, body_values=body_values,
    customer_id=cust.get("id"),
)
```
After:
```python
# CR-036 Part 2: attach media if template has a header
media_url, media_filename = await _get_template_send_media(user["id"], template_id)
msg = WhatsAppMessage(
    phone=phone, country_code=country_code,
    template_id=template_id, body_values=body_values,
    customer_id=cust.get("id"),
    media_url=media_url,
    media_filename=media_filename,
)
```

**Path 2 — test send** (line 512-518): apply the same pattern.

**Path 3 — resend-failed** (line 796-800): apply the same pattern.

**Optimization note**: fetching the same template 100 times per send batch would be wasteful. Fetch ONCE before the loop, cache the (url, filename) tuple, apply per-recipient. Verify actual code structure — the fetch may already be per-batch; if per-recipient, hoist it.

### 3.9 Event-triggered send path augmentation

**File**: `backend/core/whatsapp.py`
**Location**: `send_event_message` (~line 820-840).

Add a fallback: if `ed.get("media_url")` is None BUT the event's template has a `send_media_url`, use that. ~5 LOC. Not strictly required for scope but avoids event sends silently degrading when the event mapping didn't set media.

### 3.10 Frontend edit 1 — TemplateBuilderPage file picker

**File**: `frontend/src/pages/TemplateBuilderPage.jsx`
**Location**: Lines 476-479 (existing URL input) + line 81-82 (validation) + line 448-451 (header_type options).

**Add audio option** to header type buttons (~line 448):
```jsx
{["none", "text", "image", "video", "document", "audio"].map((type) => (
    <Button
        key={type}
        variant={tpl.header_type === type ? "default" : "outline"}
        onClick={() => setTpl({ ...tpl, header_type: type })}
        data-testid={`header-type-${type}`}
    >
        {type}
    </Button>
))}
```

**Replace URL input with file picker** (line 476-479):
```jsx
{/* CR-036: file picker replaces URL input for media headers */}
{["image", "video", "document", "audio"].includes(tpl.header_type) && (
    <MediaHeaderUpload
        headerType={tpl.header_type}
        currentHandle={tpl.header_handle}
        currentSendMediaUrl={tpl.send_media_url}
        currentFilename={tpl.send_media_filename}
        onUploaded={({ handle, send_media_url, filename, mime, kind }) =>
            setTpl({
                ...tpl,
                header_handle: handle,
                send_media_url,
                send_media_filename: filename,
                header_media_mime: mime,
                media_url: send_media_url,  // legacy field kept for backward compat
            })
        }
    />
)}
```

**New sub-component** `MediaHeaderUpload` (inline or in a new file `frontend/src/components/MediaHeaderUpload.jsx`):
```jsx
export const MediaHeaderUpload = ({
    headerType, currentHandle, currentSendMediaUrl, currentFilename, onUploaded,
}) => {
    const { user } = useAuth();
    const hasMetaCreds = user?.meta_waba_id && user?.meta_access_token;
    const [uploading, setUploading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState(currentSendMediaUrl || null);

    const CAP_MB = {image: 5, video: 16, document: 100, audio: 16}[headerType];

    if (!hasMetaCreds) {
        return (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" data-testid="meta-creds-missing-banner">
                ⚠️ Configure Meta API first (Settings &gt; WhatsApp &gt; Meta API) before uploading header media.
            </div>
        );
    }

    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > CAP_MB * 1024 * 1024) {
            toast.error(`File too large. Max ${CAP_MB} MB for ${headerType}.`);
            return;
        }
        setUploading(true);
        const localPreview = URL.createObjectURL(file);
        setPreviewUrl(localPreview);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("template_slug", "header");
        try {
            const resp = await api.post("/whatsapp/upload-media-header", formData, {
                headers: {"Content-Type": "multipart/form-data"},
            });
            onUploaded(resp.data);
            setPreviewUrl(resp.data.send_media_url);
            toast.success("Header uploaded — approval + delivery URLs ready.");
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Upload failed");
            setPreviewUrl(currentSendMediaUrl || null);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="space-y-2">
            <input
                type="file"
                accept={{
                    image: "image/jpeg,image/png",
                    video: "video/mp4,video/3gpp",
                    document: "application/pdf",
                    audio: "audio/aac,audio/mp4,audio/amr,audio/mpeg,audio/ogg",
                }[headerType]}
                onChange={handleFile}
                disabled={uploading}
                data-testid="header-media-file-input"
            />
            <div className="text-xs text-slate-500">Max {CAP_MB} MB for {headerType}</div>
            {uploading && <div className="text-sm text-slate-600">Uploading…</div>}
            {previewUrl && headerType === "image" && (
                <img src={previewUrl} alt="preview" className="max-h-40 rounded" data-testid="header-media-preview" />
            )}
            {previewUrl && headerType !== "image" && (
                <div className="text-sm text-slate-600" data-testid="header-media-filename">
                    📎 {currentFilename || "uploaded"}
                </div>
            )}
            {currentHandle && (
                <div className="text-xs text-emerald-600" data-testid="header-handle-ok">
                    ✓ Meta handle ready
                </div>
            )}
        </div>
    );
};
```

**Update template submit** (existing submit flow ~line 200+): ensure `header_handle`, `send_media_url`, `send_media_filename`, `header_media_mime` are included in the POST body to `/whatsapp/custom-templates`.

### 3.11 Frontend edit 2 — Legacy-templates banner on TemplatesPage

**File**: `frontend/src/pages/TemplatesPage.jsx` (verify path — grep first)
**Location**: Inside each template row rendering.

**Insert**:
```jsx
{tpl.needs_media_reupload && (
    <div
        className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
        data-testid={`needs-reupload-badge-${tpl.id}`}
    >
        ⚠️ Header media re-upload required
    </div>
)}
```

**"Fix" action button** — a small button that opens TemplateBuilderPage for this template so the tenant can re-upload:
```jsx
{tpl.needs_media_reupload && (
    <Button
        variant="outline" size="sm"
        onClick={() => navigate(`/templates/edit/${tpl.id}`)}
        data-testid={`fix-media-${tpl.id}`}
    >
        Fix
    </Button>
)}
```

---

## 4. Files touched

| File | Change type | ~LOC |
|---|---|---|
| `backend/routers/whatsapp.py` | (a) NEW `POST /upload-media-header` endpoint + `_MEDIA_CAPS` + `_classify_mime` helper (~90 LOC), (b) MODIFY `build_meta_template_payload` (~+10 LOC net), (c) MODIFY `create_custom_template` doc dict + any UPDATE endpoint (~+10 LOC) | +110 |
| `backend/routers/campaigns.py` | (a) NEW `_get_template_send_media` helper (~20 LOC), (b) MODIFY 3 send paths to fetch + pass media_url + media_filename (~15 LOC each = 45 LOC) | +65 |
| `backend/core/whatsapp.py` | Event send path fallback to template's send_media_url when event mapping absent | +8 |
| `backend/core/s3.py` | NEW module — S3 upload helper | +55 |
| `backend/migrations/MIG_CR_036_flag_legacy_media_templates.py` | NEW one-shot migration | +25 |
| `frontend/src/pages/TemplateBuilderPage.jsx` | (a) Add audio to header type buttons (~2 LOC), (b) Replace URL input with `MediaHeaderUpload` component + wire onUploaded (~15 LOC in-place), (c) Submit body includes new fields (~5 LOC) | +25 |
| `frontend/src/components/MediaHeaderUpload.jsx` | NEW inline sub-component (file picker + preview + creds guard) | +100 |
| `frontend/src/pages/TemplatesPage.jsx` | Banner + Fix button on rows with `needs_media_reupload=true` | +15 |
| `backend/.env` | +4 new keys (owner supplies values) | +4 |
| `backend/requirements.txt` | Verify `boto3` present | 0-1 |

**Total: ~407 net-new LOC across 8 files (6 modified + 3 new) + 1 env addition + 1 migration.**

## 5. Files NOT touched

- `core/whatsapp.py::send_single_message` — send payload construction already supports media_url via WhatsAppMessage dataclass. NO change needed.
- `core/campaign_jobs.py` — scheduler; consumes campaign records, doesn't touch send payload assembly. NO change.
- `WhatsAppMessage` dataclass — already has `media_url` and `media_filename` fields (verified at `core/whatsapp.py:26-27`).
- `models/schemas.py` — no new typed models needed.
- `whatsapp_message_logs` schema — no send-side telemetry additions.
- `routers/pos.py`, `routers/auth.py`, `routers/customers.py` — unrelated.
- CR-041 webhook code path (lines 1300-1500 of whatsapp.py) — unrelated.
- AuthKey callback code — unrelated.
- Existing tests — should continue to pass.

---

## 6. Code markers

- `# CR-036 Part 1:` for approval-fix changes
- `# CR-036 Part 2:` for delivery-fix changes
- `// CR-036:` for frontend (Part 1 + Part 2 as needed)

---

## 7. Migrations / config

### 7.1 One-shot migration
Run **once** at deploy time:
```
cd /app/backend && python migrations/MIG_CR_036_flag_legacy_media_templates.py
```
Expected output: `MIG-036: flagged N templates for re-upload.`

### 7.2 Env vars
Add 4 keys to `backend/.env` (§3.3). Owner supplies values at Implementation gate. Restart backend: `sudo supervisorctl restart backend`.

### 7.3 S3 bucket setup (owner-side, one-time)
- Create bucket in AWS console.
- Enable public-read on the `whatsapp_media/` prefix (or enable Public Access + Block Public ACLs = OFF).
- CORS: allow GET from Meta's crawlers (Meta uses standard fetchers — no special CORS needed for their pull).
- Give IAM user `s3:PutObject`, `s3:PutObjectAcl` on the bucket.

Document these in a follow-up `runbook.md` if not already covered.

---

## 8. Verification matrix

### 8.1 Backend (curl / manual)

| # | Item | Command / step | Expected |
|---|---|---|---|
| B1 | Upload endpoint | `curl -F "file=@sample.jpg" -F "template_slug=welcome" -H "Authorization: Bearer $TOK" $API/api/whatsapp/upload-media-header` | 200 JSON `{"handle":"4:...", "send_media_url":"https://...s3....", "mime":"image/jpeg", "filename":"sample.jpg", "kind":"image"}` |
| B2 | Missing Meta creds | Same call on a tenant with no `meta_access_token` | 400 with "Meta credentials missing" |
| B3 | Oversize | 6MB JPEG upload | 413 with "File too large. Max for image: 5 MB" |
| B4 | Wrong MIME | Upload .txt as image | 400 "Unsupported media type" |
| B5 | Meta rejects | Simulate by using an invalid token | 502 with Meta's error text |
| B6 | Full submit | Upload + POST /whatsapp/custom-templates with returned handle | Template creates with status=PENDING; DB row has `header_handle`, `send_media_url` populated |
| B7 | Campaign send with media template | Trigger a campaign using a `needs_media_reupload=false` media template on Jeh's Nest | Manual QA — send to owner phone, verify image received |
| B8 | Campaign send with legacy template (needs re-upload) | Trigger same on a template with `send_media_url=null` | Send proceeds (silent-degrade); customer receives text-only; backend log has "CR-036: campaign send missing media_url" warning |
| B9 | Existing text-only templates | Trigger campaign on a text template | Unchanged behavior (regression) |
| B10 | Existing pytest | `pytest tests/` | 11/11 PASS |

### 8.2 Frontend (browser)

| # | Item | Steps | Expected |
|---|---|---|---|
| F1 | Audio option | Open Template Builder → header type row | 6 buttons: none, text, image, video, document, audio |
| F2 | Creds guard | Log in as tenant WITHOUT Meta creds → Template Builder → set header=image | Amber banner "Configure Meta API first" instead of file picker |
| F3 | Upload happy path | Log in as Jeh's Nest → Template Builder → header=image → pick 2MB JPEG | Preview thumbnail appears; "✓ Meta handle ready" chip visible; Submit button enabled |
| F4 | Client-side cap | Try 6MB JPEG | Toast "File too large. Max 5 MB" before hitting backend |
| F5 | Submit approval | Complete template, click Submit | Template appears in list with status=PENDING; on refresh gets status from Meta |
| F6 | Legacy banner | Log in as tenant with pre-migration draft (needs_media_reupload=true) → Templates page | Amber "Header media re-upload required" badge + "Fix" button on affected rows |
| F7 | Fix flow | Click Fix on banner row | Template Builder opens in edit mode; file picker present; upload → clears banner on refresh |
| F8 | Regression — text template creation | Create a text-only template | Unchanged UX; no file picker shown |
| F9 | E2E media delivery | Manual send campaign with media template to owner's phone | Image arrives on WhatsApp within seconds |

### 8.3 Migration verification

| # | Step | Expected |
|---|---|---|
| M1 | Run `MIG_CR_036_flag_legacy_media_templates.py` | Prints count of flagged templates |
| M2 | Re-run same script | Prints `flagged: 0` (idempotent) |
| M3 | Query `db.custom_templates.count({needs_media_reupload:true})` | Matches M1 count |
| M4 | Reverse (if needed): `db.custom_templates.updateMany({needs_media_reupload:true}, {$unset:{needs_media_reupload:""}})` | Rollback path documented |

---

## 9. Rollout / rollback

### Rollout order
1. Owner provides AWS credentials + bucket name.
2. Update `backend/.env` with the 4 new keys.
3. Verify `boto3` present in requirements.txt.
4. Deploy backend code (whatsapp.py + campaigns.py + s3.py).
5. Restart backend: `sudo supervisorctl restart backend`.
6. Run migration: `python backend/migrations/MIG_CR_036_flag_legacy_media_templates.py`.
7. Deploy frontend code (TemplateBuilderPage + MediaHeaderUpload + TemplatesPage).
8. Smoke test: upload a header (B1) → submit template (B6) → verify Meta approval → send to owner phone (B7).

### Rollback
- **Code**: git revert commit; supervisor restart.
- **Migration**: idempotent, can either leave flags in place (harmless — banners just don't show if code is reverted) or run reverse Mongo update (§7.1 note).
- **S3 objects**: leave in place; ~cents per month; useful forensic trail. Set bucket lifecycle policy to expire objects >90 days if cleanup desired.
- **Env vars**: leave in `.env` if code reverted — harmless.

---

## 10. Owner approval status

| Ask | Status |
|---|---|
| Q1 media types (image + video + document + audio) | ✅ 2026-07-03 |
| Q2 file size caps (Meta defaults) | ✅ 2026-07-03 |
| Q3 Meta pass-through handle | ✅ 2026-07-03 |
| Q5 block-early UX for missing creds | ✅ 2026-07-03 |
| Q6 delivery URL storage = S3 | ✅ 2026-07-03 "we will use amazon s3" |
| Q7 fallback = silent-degrade + log | ✅ 2026-07-03 "q7 a" |
| Q8 hotspot approval (whatsapp.py + campaigns.py) | ✅ 2026-07-03 "q8 approved" |
| INV-005 scope expansion (Part 1 + Part 2 bundled) | ✅ Implicit (owner directed to include delivery fix) |

**Missing at Implementation gate (must be provided before code runs)**:
- `AWS_S3_BUCKET`
- `AWS_S3_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- Confirmation bucket is publicly-readable (or IAM policy on the prefix)

---

## 11. Estimated calendar time

| Phase | Time |
|---|---|
| Backend Part 1 — upload endpoint + payload fix | ~2 hr |
| Backend Part 2 — s3.py + campaign path media wiring | ~2 hr |
| Migration script | ~30 min |
| Frontend — MediaHeaderUpload component | ~2 hr |
| Frontend — Template Builder integration + Templates banner | ~1.5 hr |
| Manual verification (backend curl + browser + E2E send) | ~2 hr |
| Buffer / debugging Meta API responses | ~1-2 hr |
| **Total** | **~10-12 hr** |

---

## 12. Risk & mitigation recap (from Impact Analysis §4.5 + updated per INV-005)

| Risk | Mitigation |
|---|---|
| Send-path regression on text templates | `_get_template_send_media` returns (None, None) unless template is media type — text sends unaffected |
| S3 upload flaky | Retry on client side; user sees toast; can retry immediately |
| Meta rate-limit on uploads | Not an issue at expected volume (< 50 uploads/day/tenant) |
| Public S3 URL leak (customer data via URL) | Media header assets are marketing content — designed to be public. No PII in URL structure. |
| Bucket misconfigured (not public) | Meta fetch fails silently at customer's phone — surfaced via delivery reports; owner rechecks bucket ACL |
| Legacy templates flooded with "needs re-upload" badge | Non-destructive; owner-triggered fix flow per template |
| Handle expiry mid-approval | Meta docs say handles valid ~30 days for template review; users unlikely to draft-and-hold that long |
| `boto3` missing from environment | Verify at Implementation gate; pip install + freeze if needed |

---

*End of Implementation Plan for CR-036. No code changes yet. Awaits owner gate to open Role 3 (Implementation). Awaits AWS credentials for `.env` before backend restart.*
