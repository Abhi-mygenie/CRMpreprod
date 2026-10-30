# CR-036 — Discovery: Media Header Upload for WhatsApp Template Builder

> **Type**: Discovery / Investigation finding from INV-004
> **Date**: 2026-07-01
> **Source**: INV-004 Issue 3
> **Status**: 📋 Registered — awaits planning approval

---

## Problem Statement

The Template Builder supports image/video/document header types in the UI, but templates with media headers are **rejected by Meta** because the current implementation sends the wrong data format for the `example` field.

---

## What Currently Happens

**User flow:**
1. User picks "Image" as header type
2. User pastes a direct URL (e.g. `https://example.com/promo.jpg`)
3. User clicks "Submit to Meta"

**What the CRM sends to Meta:**
```json
{
  "type": "HEADER",
  "format": "IMAGE",
  "example": {
    "header_handle": ["https://example.com/promo.jpg"]
  }
}
```

**What Meta actually requires:**
```json
{
  "type": "HEADER",
  "format": "IMAGE",
  "example": {
    "header_handle": ["4:abc123def456..."]   ← a pre-uploaded Media Handle ID, not a URL
  }
}
```

---

## Why Meta Rejects It

Meta deprecated direct URL support for template media headers in Graph API v17+. The `header_handle` field must contain an **opaque handle string** returned by Meta's own media upload endpoint, not a raw URL.

The full correct flow is a **two-step process**:

```
Step 1 — Upload media to Meta:
  POST https://graph.facebook.com/v21.0/{WABA_ID}/uploads
  Content-Type: multipart/form-data
  file: <binary image/video data>
  → Returns: {"h": "4:abc123def456xyz..."}    ← this is the "handle"

Step 2 — Create template using the handle:
  POST .../message_templates
  {
    "components": [{
      "type": "HEADER",
      "format": "IMAGE",
      "example": {"header_handle": ["4:abc123def456xyz..."]}
    }, ...]
  }
```

---

## Current Gaps

| Gap | Where | Impact |
|---|---|---|
| **G1** | No `POST /media` upload endpoint in CRM backend | Can't get a handle from Meta |
| **G2** | Frontend shows a URL input field for media headers | Wrong UX — URL is not what's needed |
| **G3** | CRM passes URL directly as `header_handle` | Templates always rejected by Meta |
| **G4** | No file upload UI component in Template Builder | User has no way to upload an image from their device |

---

## What Needs to Be Built

### Backend (new endpoint):
```
POST /api/whatsapp/upload-media-header
  Input: multipart file upload (image/video/PDF)
  Auth: JWT (get user's Meta credentials)
  Flow:
    1. Receive file from frontend
    2. Re-upload it to Meta: POST /v21.0/{WABA_ID}/uploads
    3. Return the handle string to frontend
  Output: {"handle": "4:abc123..."}
```

### Frontend (Template Builder changes):
- Replace the URL input (`media_url`) with a **file picker** (upload from device)
- On file select → call `POST /whatsapp/upload-media-header` → get handle
- Show a preview of the uploaded image
- Store the handle (not the URL) in the template state
- On submit → send handle in `header_examples` payload

---

## Scope Estimate

| Item | Effort | Risk |
|---|---|---|
| Backend media upload proxy endpoint | ~2 hours | LOW |
| Frontend file picker + preview in Template Builder | ~2 hours | LOW |
| Wire handle into template creation payload | ~30 min | LOW |
| Test with real Meta submission | ~1 hour | MEDIUM (depends on Meta credentials) |
| **Total** | **~5.5 hours** | LOW |

**Files affected:**
- `backend/routers/whatsapp.py` (new endpoint)
- `frontend/src/pages/TemplateBuilderPage.jsx` (file picker replaces URL input)

**Hotspot files touched:** 0

---

## Open Questions for Owner

| # | Question |
|---|---|
| Q1 | Which media types need support? Image only, or also Video + Document? |
| Q2 | Max file size limit? (Meta allows up to 16MB for images, 64MB for video) |
| Q3 | Should CRM store the uploaded file permanently, or just pass-through to Meta? |

---

*Discovery doc — CR-036, awaits owner Q1-Q3 + planning approval*
