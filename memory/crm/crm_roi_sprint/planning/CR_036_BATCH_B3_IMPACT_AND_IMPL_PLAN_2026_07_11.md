# CR-036 Batch B.3 — Impact Analysis + Implementation Plan

> **Session**: 2026-07-11 · PLANNING role
> **Scope source**: `CR_036_BATCH_B1_IMPL_PLAN_FINAL_2026_07_11.md` §9 — "B.3: upload progress UX with chunked progress bar for large files, re-upload modal on TemplatesPage as lightweight alternative to navigating to Template Builder"
> **Carried-in scope candidate**: B.2 D-B2-4 deferred item — "Resend of `failed` (media_missing) rows" (owner must opt in/out, see Q20)
> **Governing decisions**: Q15-c (inline Re-upload on TemplatesPage) · Q16 (approved templates allow media-only PUT) · G5 fail-loud contract
> **Status**: AWAITING OWNER APPROVAL

---

## 1 · Impact Analysis

### 1.1 Code reality (verified 2026-07-11 against current /app)

| Surface | File · Line | Reality |
|---|---|---|
| Upload endpoint | `routers/whatsapp.py:221-277` (`upload_media_header`) | **Single-shot** multipart POST. `await file.read()` loads entire file into memory, validates MIME+cap, then Meta `/uploads` (one-shot, `file_offset=0`) + S3 put. Caps: image 5 MB, video 16 MB, document **100 MB** |
| Meta upload helper | `core/meta_media.py:48-100` (`upload_to_meta_uploads`) | 2-step: create session → POST full binary at `file_offset=0`. Accepts a `bytes` blob — **agnostic to how the blob arrived** (chunk-safe for reuse) |
| Upload UI | `components/templates/MediaHeaderUpload.jsx:41-71` | axios POST with NO `onUploadProgress` — only a static "Uploading..." label. A 100 MB PDF gives zero feedback for minutes |
| Proxy risk | K8s ingress in front of :8001 | Single 100 MB POST is at the mercy of ingress body-size/timeout limits — **413/504 risk for large documents**; platform guidance is chunked uploads for large files |
| Re-upload button | `TemplatesPage.jsx:549-557` | `navigate(/template-builder/{id})` — full page hop; user must scroll to header section, re-upload, re-save. Heavy for a 1-field fix |
| Approved-template media PUT | `routers/whatsapp.py:295-315` | Q16 bypass exists: `PUT /custom-templates/{id}` with `header_handle`/`send_media_url` on an approved template updates ONLY media fields + clears `needs_media_reupload` — **exact backend the modal needs, zero backend change** |
| Re-upload banner | `TemplatesPage.jsx:487-494` | Counts `needs_media_reupload` templates — count auto-decrements once list refetches after PUT |
| Resend endpoint | `routers/whatsapp.py:1873-1986` | Eligibility `status ∈ {pending, rejected}` (line 1886). Rebuilds `WhatsAppMessage` **without** `media_url`/`media_filename` (lines 1927-1932) — even if `failed` were allowed, media would not attach |
| G5 `failed` rows | `campaigns.py` G5 sites | Carry `template_id`, `campaign_id`, `status_note="media_missing"` — enough to re-check template media at resend time |

### 1.2 Gaps this batch must close

| ID | Gap | Severity |
|---|---|---|
| GAP-B3-1 | No upload progress feedback — large video/document uploads look frozen; users retry and double-upload | MAJOR (UX) |
| GAP-B3-2 | Single 100 MB POST can exceed ingress body/timeout limits → opaque 413/504 that the app cannot explain | MAJOR (reliability) |
| GAP-B3-3 | Re-upload requires a full Template Builder round-trip; Q15-c intent was an *inline* fix-it path | MINOR (UX) |
| GAP-B3-4 | (Opt-in, Q20) `failed`/`media_missing` rows are dead ends — after re-upload the only recovery is a brand-new campaign | MINOR (deferred from B.2) |

### 1.3 UX/engineering decisions (taken under delegated authority — owner may veto)

| ID | Decision | Rationale |
|---|---|---|
| D-B3-1 | **Hybrid upload**: files ≤ 4 MB keep the existing single POST (now with axios `onUploadProgress`); files > 4 MB use a new 3-endpoint chunk flow (init → chunk×N → complete) with **4 MB chunks, sequential** | Every chunk stays far below any sane ingress limit; small images (the common case) keep the fast 1-request path; sequential keeps ordering trivial (no offset bookkeeping races) |
| D-B3-2 | Chunk staging on **local disk** `/tmp/media_uploads/{user_id}/{upload_id}/` with a 2 h TTL sweep at init-time | Meta+S3 need the full blob anyway; tmp disk is the simplest assembly point; TTL sweep prevents orphan buildup from abandoned uploads |
| D-B3-3 | `complete` re-runs the **same** validation + Meta + S3 code as today via a shared helper `_process_media_upload()` extracted from the existing endpoint — response shape byte-identical to the single-shot endpoint | One code path for Meta/S3 semantics; `MediaHeaderUpload.onUploaded` consumers untouched |
| D-B3-4 | Progress UI inside `MediaHeaderUpload`: Shadcn `Progress` bar + `%` + phase label ("Uploading… 62%" → "Finalizing — sending to Meta & S3…") | Meta+S3 finalization takes seconds after bytes arrive; an indeterminate "Finalizing" phase avoids a bar stuck at 100% |
| D-B3-5 | **Re-upload modal** on TemplatesPage: `Dialog` embedding the existing `MediaHeaderUpload` (headerType from `ct.header_type`); on upload success → `PUT /custom-templates/{id}` with the 4 media fields (Q16 bypass) → refetch list → toast. Button label unchanged; `navigate()` replaced by `setReuploadTemplate(ct)` | Reuses both the component and the already-shipped Q16 backend path — zero new backend surface for this part |
| D-B3-6 | Resend of `media_missing` rows (**only if Q20 = include**): extend resend eligibility to `status="failed"`, and for such rows re-fetch the template — if it now has `send_media_url`, attach `media_url`/`media_filename` to the rebuilt `WhatsAppMessage`; if still missing, skip with `error="media_still_missing"` | Recovery becomes: re-upload in modal → select rows on Message Status (B.2 chip) → Resend. The media re-check keeps G5's guarantee: no media template ever sends without media |

### 1.4 Files WILL change

| File | Risk | Change type |
|---|---|---|
| `backend/routers/whatsapp.py` | HIGH (hotspot) | Extract `_process_media_upload()` helper (pure refactor of existing endpoint body) + 3 new additive endpoints (`/init`, `/chunk`, `/complete`) · (Q20) resend eligibility + media re-attach |
| `frontend/src/components/templates/MediaHeaderUpload.jsx` | MEDIUM | Progress state, `onUploadProgress`, chunked path for > 4 MB, phase label |
| `frontend/src/pages/TemplatesPage.jsx` | MEDIUM | Re-upload Dialog state + JSX; button onClick swap |
| `frontend/src/pages/MessageStatusPage.jsx` | LOW (only if Q20 = include) | Allow row-select/Resend on `failed` rows |

### 1.5 Files WILL NOT change

`core/meta_media.py` (blob-agnostic already) · `core/whatsapp.py::send_bulk_messages` · `routers/campaigns.py` · `TemplateBuilderPage.jsx` (keeps using the same `MediaHeaderUpload`, gains progress for free) · `models/schemas.py` · `.env` · S3 helpers

### 1.6 Blast radius

- `_process_media_upload()` extraction: existing `POST /upload-media-header` behaviour must stay byte-identical (V-B3-1 regression check). Template Builder is the second consumer of `MediaHeaderUpload` — it inherits progress UI with no prop changes (`onUploaded` contract unchanged).
- New chunk endpoints are additive routes — no existing consumer.
- Chunk staging dir is per-`user_id` + random `upload_id` — no cross-tenant path collision; `upload_id` ownership checked on every chunk/complete call.
- (Q20) Resend change touches a shipped endpoint: `pending`/`rejected` semantics preserved exactly (grace window, history push untouched); `failed` is a new branch appended to the eligibility set only.

### 1.7 Open questions for owner

| Q | Question | Options |
|---|---|---|
| **Q20** | Include "Resend `media_missing` rows" (D-B3-6) in B.3? | (a) include (+~1 h) · (b) keep deferred |
| **Q21** | 4 MB chunk threshold/size OK? | (a) yes · (b) different value |

---

## 2 · Implementation Plan (edit-by-edit)

### Backend — `routers/whatsapp.py`

**E-B3-1 · Extract helper.** Move lines ~230-277 (creds fetch → validate → Meta → S3 → response dict) into:
```python
async def _process_media_upload(user: dict, contents: bytes, mime: str, filename: str, template_slug: str) -> dict:
```
Existing `POST /upload-media-header` becomes: read file → call helper. Response unchanged.

**E-B3-2 · `POST /upload-media-header/init`** — body `{filename, mime, total_size, total_chunks, template_slug}`. Validates MIME (`_classify_mime`) + `total_size` against `_MEDIA_CAPS` **upfront** (fail before any bytes move). Sweeps staging dirs older than 2 h. Creates `/tmp/media_uploads/{user_id}/{upload_id}/manifest.json` (`upload_id = uuid4`). Returns `{upload_id, chunk_size: 4*1024*1024}`.

**E-B3-3 · `POST /upload-media-header/chunk/{upload_id}`** — multipart `chunk_index` + `file`. Verifies manifest exists and belongs to `user_id` (404 otherwise); writes `part_{index:05d}`; returns `{received: n_parts, total: total_chunks}`.

**E-B3-4 · `POST /upload-media-header/complete/{upload_id}`** — asserts all parts present (400 listing missing indices); concatenates in index order; re-validates assembled size == `total_size` and ≤ cap; calls `_process_media_upload(...)`; deletes staging dir (also on failure). Returns the same `{handle, send_media_url, mime, filename, kind}` shape.

**E-B3-5 (Q20=a only) · `resend_messages`** —
- Line 1886: eligibility set → `{"pending", "rejected", "failed"}`.
- Inside the loop, before building `wa_msg`: if `msg["status"] == "failed"` and `msg.get("status_note") == "media_missing"` → fetch template (`custom_templates` by `template_id`+`user_id`, fallback `templates`, projection `send_media_url/send_media_filename`); if no `send_media_url` → append `{skipped: True, error: "media_still_missing"}` + `continue`; else pass `media_url=`/`media_filename=` into `WhatsAppMessage(...)`. Cache template lookups per `template_id` across the loop (one fetch per template, not per row). On successful send also `$set: {"status_note": None}`.

### Frontend — `MediaHeaderUpload.jsx`

**E-B3-6 · Progress state** — `const [progress, setProgress] = useState(null); // {pct, phase: "upload"|"finalize"}`.

**E-B3-7 · Small-file path** — existing `api.post(...)` gains `onUploadProgress: (e) => setProgress({pct: Math.round(e.loaded/e.total*100), phase: e.loaded===e.total ? "finalize" : "upload"})`.

**E-B3-8 · Chunked path** — in `handleFile`, when `file.size > 4*1024*1024`:
```
init → for i in chunks: POST chunk (file.slice(i*CS,(i+1)*CS)); setProgress pct=(i+1)/total*100
     → setProgress phase:"finalize" → POST complete → onUploaded(resp.data)
```
Failure at any step: toast the `detail`, reset progress/preview (mirrors current catch block).

**E-B3-9 · Progress JSX** — under the file-picker row, when `progress`:
```jsx
<div className="space-y-1" data-testid="media-upload-progress">
  <Progress value={progress.pct} className="h-2" />
  <p className="text-xs text-muted-foreground">
    {progress.phase === "finalize" ? "Finalizing — sending to Meta & S3…" : `Uploading… ${progress.pct}%`}
  </p>
</div>
```
(`Progress` from `@/components/ui/progress`.) Picker disabled while `uploading` — already the case.

### Frontend — `TemplatesPage.jsx`

**E-B3-10 · Modal state** — `const [reuploadTemplate, setReuploadTemplate] = useState(null);`

**E-B3-11 · Button swap (line 553)** — `onClick={() => setReuploadTemplate(ct)}` (testid unchanged → V19 still passes).

**E-B3-12 · Dialog JSX** (page bottom, near existing modals):
```jsx
<Dialog open={!!reuploadTemplate} onOpenChange={(o) => !o && setReuploadTemplate(null)}>
  <DialogContent data-testid="media-reupload-modal">
    <DialogHeader><DialogTitle>Re-upload media — {reuploadTemplate?.template_name}</DialogTitle></DialogHeader>
    <MediaHeaderUpload
      headerType={reuploadTemplate?.header_type}
      currentSendMediaUrl={reuploadTemplate?.send_media_url}
      currentFilename={reuploadTemplate?.send_media_filename}
      onUploaded={handleReuploadComplete}
    />
  </DialogContent>
</Dialog>
```

**E-B3-13 · `handleReuploadComplete(data)`** — `PUT /whatsapp/custom-templates/{reuploadTemplate.id}` with `{header_handle: data.handle, send_media_url: data.send_media_url, send_media_filename: data.filename, header_media_mime: data.mime}` → toast → close modal → refetch custom templates (banner count self-corrects).

### Frontend — `MessageStatusPage.jsx` (Q20=a only)

**E-B3-14** — include `failed` in row-checkbox/Resend-button eligibility; surface `media_still_missing` skip reason in the resend result toast.

---

## 3 · Verification matrix

| V | Case | Method |
|---|---|---|
| V-B3-1 | Regression: single-shot `POST /upload-media-header` byte-identical response after helper extraction (small PNG) | curl vs pre-change capture |
| V-B3-2 | init rejects wrong MIME (400) and oversize `total_size` (413) before any chunk | pytest/curl |
| V-B3-3 | chunk with foreign/unknown `upload_id` → 404 | pytest/curl |
| V-B3-4 | complete with a missing chunk → 400 listing missing indices; staging dir NOT deleted | pytest |
| V-B3-5 | 6 MB JPEG via chunked path → assembled, Meta handle + S3 URL returned; staging dir deleted | pytest (needs Meta creds tenant) |
| V-B3-6 | UI: >4 MB file shows progress bar advancing then "Finalizing…"; ≤4 MB shows single-POST progress | Playwright/manual (`media-upload-progress`) |
| V-B3-7 | Re-upload button opens modal (no navigation); upload → PUT → banner count decrements, `needs_media_reupload` cleared in DB | Playwright/manual (`media-reupload-modal`) |
| V-B3-8 | Template Builder upload still works (second `MediaHeaderUpload` consumer) | manual |
| V-B3-9 (Q20) | `failed` row + template WITH media → resend succeeds, AuthKey payload carries media, `status_note` cleared | integration (test tenant only) |
| V-B3-10 (Q20) | `failed` row + template STILL without media → skipped `media_still_missing`, row unchanged | pytest |
| V-B3-11 (Q20) | Regression: pending grace-window skip + rejected resend behaviour unchanged | pytest |

Automation of V-B3-* lands in **B.4**.

---

## 4 · Effort

| Step | Effort |
|---|---|
| E-B3-1…4 backend chunk flow | ~1.5 h |
| E-B3-6…9 progress UI | ~45 min |
| E-B3-10…13 modal | ~45 min |
| E-B3-5 + E-B3-14 resend (Q20=a) | ~1 h |
| Self-test | ~30 min |
| **Total** | **~3.5 h** (4.5 h with Q20=a) |

## 5 · DO NOT (this batch)

- Do NOT touch `core/meta_media.py` or S3 helper internals
- Do NOT change `MediaHeaderUpload`'s `onUploaded` contract (Template Builder depends on it)
- Do NOT parallelize chunk uploads (sequential only — ordering simplicity)
- Do NOT auto-resend after re-upload (explicit user action stays required)
- Do NOT send live WhatsApp messages during self-test except V-B3-9 on the owner-approved test tenant

---

*End of CR-036 Batch B.3 plan — awaiting owner approval (Q20, Q21) to open the Implementation gate.*
