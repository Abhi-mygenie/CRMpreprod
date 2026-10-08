# CR-036 Scope Amendment — 2026-07-04

> **Amendment type**: Scope expansion (bundle-in)
> **Trigger**: INV-006 file-upload surface audit revealed 2 additional local-disk surfaces (bill logo + invoice HTML/PDF) that would benefit from the same S3 migration.
> **Owner decision**: "Ship as one big CR" + "keep CR-036 number" (2026-07-04).
> **Governs**: `planning/CR_036_MEDIA_TEMPLATE_APPROVAL_AND_DELIVERY_IMPL_PLAN.md` — that plan is now Part 1 of 3. This addendum defines Parts 2 and 3.
> **Q-locks driving amendment**: Q9 (dual-mode logo, no backfill), Q10 (no invoice backfill), Q11 (HTTPS WeasyPrint base_url), Q12 (3 new hotspot files approved).

---

## 1 · Amended CR scope

CR-036 now covers migration of **3 local-disk / non-persistent surfaces** to Amazon S3:

| Part | Surface | Was | Becomes |
|---|---|---|---|
| **Part 1** (unchanged, per existing impl plan) | WhatsApp media header for templates | Owner pastes URL, template approved but broken at send-time (INV-005) | `POST /api/whatsapp/upload-media-header` → S3 + Meta `/uploads`. `send_media_url` persisted on `custom_templates` for campaigns to look up. |
| **Part 2** (NEW in this amendment) | Bill logo upload | `POST /api/auth/profile/logo` writes to `/app/data/logos/{user_id}.{ext}` | New uploads → S3 `bill-logos/{user_id}.{ext}`. `bill_logo_url` field on `users` becomes dual-format (legacy backend URL OR S3 HTTPS URL). Existing files STAY on local disk (Q9). |
| **Part 3** (NEW in this amendment) | Invoice HTML + PDF | `services/invoice_generator.py` writes HTML to disk; `_generate_pdf` renders PDF to disk on-the-fly; `routers/invoices.py` serves via `FileResponse` | New invoices write to S3 `invoices/{token}/{invoice.html,invoice.pdf}`. Serve endpoints do 302-redirect to S3 URL for new tokens. Legacy tokens still served from local disk (Q10). WeasyPrint `base_url` becomes HTTPS S3 URL (Q11). |

**Out of scope for CR-036** (not migrating to S3):
- Customer CSV/XLSX import — transient in-memory only, no persistence needed (INV-006 §2.B).
- Any menu / product images — none exist in current codebase (grep for `photo_url`, `image_url`, `banner_url` returned nothing).

---

## 2 · Hotspot approval status (per DECISIONS_LOG Q8 + Q12)

| File | Line range affected | Q-approval | Risk |
|---|---|---|---|
| `routers/whatsapp.py` | ~460-540 (template creation) + NEW upload endpoint block | Q8 (2026-07-03) | MEDIUM-HIGH |
| `routers/campaigns.py` | 274, 512, 796 (3 send paths) + `WhatsAppMessage()` sites | Q8 (2026-07-03) | MEDIUM-HIGH |
| `routers/auth.py` | 262-278 (upload_profile_logo — REWRITE), 280-292 (serve_profile_logo — UNCHANGED fallback) | Q12 (2026-07-04) | LOW (dual-mode preserves legacy) |
| `services/invoice_generator.py` | 12 (DATA_DIR kept for read-fallback), 380 · 564 · 633 (write points → S3), 648-662 (`_generate_pdf` + WeasyPrint `base_url`) | Q12 (2026-07-04) | MEDIUM (3 write sites, PDF gen) |
| `routers/invoices.py` | 18 (HTML serve), 38 (PDF serve) — both get dual-mode S3-first-then-local logic | Q12 (2026-07-04) | LOW (302 redirect on hit, existing behavior on miss) |
| **NEW** `core/s3.py` | Whole file (~120 LOC) | N/A (new file, no owner approval needed) | Isolated |

Total: 5 hotspot files touched, ~295 LOC added, ~35 LOC removed. Effort revised **~10-12 hrs → ~16-20 hrs**.

---

## 3 · Part 2 · Bill Logo Migration — Implementation

### 3.1 · Upload path (rewrite)

`routers/auth.py:262-278` — `upload_profile_logo`:

**Before** (unchanged today):
```python
logo_path = _LOGO_DIR / f"{user['id']}.{ext}"
logo_path.write_bytes(content)
logo_url = f"/api/auth/profile/logo/{user['id']}"
```

**After**:
```python
from core.s3 import get_s3_client, S3_CONFIGURED, get_public_url
if not S3_CONFIGURED:
    raise HTTPException(status_code=503, detail="Object storage not configured. See admin.")
key = f"bill-logos/{user['id']}.{ext}"
s3 = get_s3_client()
s3.put_object(Bucket=BUCKET, Key=key, Body=content,
              ContentType=file.content_type, ACL="public-read")
logo_url = get_public_url(key)   # https://{bucket}.s3.{region}.amazonaws.com/bill-logos/{user_id}.{ext}
```

**Persistence**: `users.bill_settings.bill_logo_url` = full HTTPS S3 URL for new uploads.

### 3.2 · Serve fallback (KEEP AS-IS)

`routers/auth.py:280-292` — `serve_profile_logo`: **do NOT touch this function**. Existing tenants whose `bill_logo_url` field is `"/api/auth/profile/logo/xxx"` continue to hit this endpoint which reads from `/app/data/logos/`. This is Q9 dual-mode.

### 3.3 · Consumer rendering

Any place that renders `bill_logo_url` (invoice HTML template, ProfilePage preview) must accept either format transparently:
- If starts with `https://` → use as-is.
- If starts with `/api/` → prepend `REACT_APP_BACKEND_URL` (frontend) or use raw for server-side rendering (backend).

**Grep for consumers of `bill_logo_url`**: check `invoice_generator.py` (HTML template) and `ProfilePage.jsx` (preview). Both currently already handle relative URLs; no change needed except confirming HTTPS URLs also render.

### 3.4 · Frontend

`ProfilePage.jsx:165` FormData upload — no change needed. Backend response contract (`{logo_url: string}`) unchanged. Preview `<img src={logo_url}>` accepts both URL formats natively.

### 3.5 · Verification (Part 2)

- V-P2-1: Fresh tenant uploads logo → S3 object exists at `bill-logos/{user_id}.png` → `users.bill_settings.bill_logo_url` = full HTTPS S3 URL → `<img>` on ProfilePage renders.
- V-P2-2: Legacy tenant (no re-upload) → `bill_logo_url = "/api/auth/profile/logo/xxx"` → `<img>` on ProfilePage still renders from backend → no regression.
- V-P2-3: Legacy tenant re-uploads → S3 object created → DB field flipped to S3 URL → old `/app/data/logos/xxx.png` file becomes orphaned but no cleanup done (accepted, Q9 no backfill).
- V-P2-4: S3 unreachable during upload → 503 returned to client with clear error message.

---

## 4 · Part 3 · Invoice HTML + PDF Migration — Implementation

### 4.1 · Write paths (all 3 sites)

`services/invoice_generator.py`:

**Line 380 (food invoice)**, **Line 564 (folio Mode C initial)**, **Line 633 (folio Mode C update)** — all currently:
```python
html_path.write_text(html, encoding="utf-8")
```

**After** (all 3 sites, same treatment):
```python
from core.s3 import get_s3_client, S3_CONFIGURED, get_public_url
if S3_CONFIGURED:
    key = f"invoices/{token}/invoice.html"
    get_s3_client().put_object(Bucket=BUCKET, Key=key,
                               Body=html.encode("utf-8"),
                               ContentType="text/html", ACL="public-read")
    # Local disk fallback ALSO happens for now — safer during rollout.
    # Once confidence built (owner call), local write can be removed in a follow-up CR.
    html_path.write_text(html, encoding="utf-8")
else:
    html_path.write_text(html, encoding="utf-8")
```

**Rationale for dual-write during rollout**: If S3 is misconfigured or intermittent, invoice generation still succeeds via local disk. Once owner is confident, dual-write can be removed.

### 4.2 · PDF generation (`_generate_pdf` line 648-662)

**Before**:
```python
invoice_dir = DATA_DIR / token
pdf_path = invoice_dir / "invoice.pdf"
html_path = invoice_dir / "invoice.html"
wp = weasyprint.HTML(string=html, base_url=str(invoice_dir))
wp.write_pdf(str(pdf_path))
```

**After**:
```python
# HTML source: try S3 first, then local disk
html = _fetch_invoice_html(token)   # returns str from S3.get_object or local file
# base_url: HTTPS S3 folder so WeasyPrint can fetch bill logo (Q11)
base_url = (f"https://{BUCKET}.s3.{REGION}.amazonaws.com/invoices/{token}/"
            if S3_CONFIGURED else str(DATA_DIR / token))
wp = weasyprint.HTML(string=html, base_url=base_url)
pdf_bytes = wp.write_pdf()   # in-memory bytes
if S3_CONFIGURED:
    get_s3_client().put_object(Bucket=BUCKET,
                               Key=f"invoices/{token}/invoice.pdf",
                               Body=pdf_bytes,
                               ContentType="application/pdf",
                               ACL="public-read")
# ALSO write to local disk during rollout (same rationale as 4.1)
(DATA_DIR / token).mkdir(parents=True, exist_ok=True)
(DATA_DIR / token / "invoice.pdf").write_bytes(pdf_bytes)
```

### 4.3 · Serve endpoints (`routers/invoices.py`)

**Line 18 `GET /api/invoices/{token}` (HTML)**:
```python
# Try S3 first
if S3_CONFIGURED:
    try:
        get_s3_client().head_object(Bucket=BUCKET, Key=f"invoices/{token}/invoice.html")
        return RedirectResponse(get_public_url(f"invoices/{token}/invoice.html"), status_code=302)
    except ClientError:
        pass  # fall through to local
# Local fallback
local_html = DATA_DIR / token / "invoice.html"
if local_html.exists():
    return HTMLResponse(content=local_html.read_text(encoding="utf-8"))
raise HTTPException(status_code=404, detail="Invoice not found")
```

**Line 38 `GET /api/invoices/{token}/pdf`**: same dual-mode pattern. If neither S3 nor local has the PDF, invoke `_generate_pdf()` on-the-fly (which will write to both S3 + local per §4.2).

### 4.4 · Verification (Part 3)

- V-P3-1: New order → HTML written to both S3 + local → `/api/invoices/{token}` returns 302 to S3 URL → customer opens link on WhatsApp → invoice renders.
- V-P3-2: Legacy invoice token (pre-CR-036) → S3 HEAD returns 404 → falls back to local disk → HTMLResponse returned → old WhatsApp links keep working.
- V-P3-3: New order + first PDF request → `_generate_pdf` runs → PDF written to both S3 + local → 302 to S3 URL on subsequent requests.
- V-P3-4: New order but tenant has legacy logo (`bill_logo_url` = `/api/auth/profile/logo/xxx`) → WeasyPrint HTTPS base_url can't resolve the relative path → **PDF may fail**. **Mitigation**: pre-resolve `bill_logo_url` to full absolute URL (either S3 HTTPS or backend HTTPS) before passing HTML to WeasyPrint. Add this step in `_generate_pdf` (~5 LOC).
- V-P3-5: New order + tenant has new S3 logo → WeasyPrint fetches logo over HTTPS from S3 → PDF renders with logo.
- V-P3-6: S3 unreachable → invoice generation still succeeds via local disk (dual-write) → serve endpoint falls back to local → customer link still works.
- V-P3-7: Pod restart wipes local disk → **new invoices** on S3 keep working → **legacy invoices** on disk are lost (Q10 accepted risk) → new invoices generated post-restart write to both S3 + fresh local disk.

---

## 5 · Rollout order (single deploy)

All 3 parts ship in one deploy but can be enabled independently via the S3 config:
1. Ship code (all 3 parts).
2. Real AWS creds set in `.env` → `S3_CONFIGURED = True` → all 3 parts activate.
3. Placeholder creds (`__PLACEHOLDER_*__`) → `S3_CONFIGURED = False` → all 3 parts fall back to current local-disk behavior → NO regression.

This is the key safety property: **without AWS creds, this PR is a no-op**. Owner can review + merge before providing creds.

---

## 6 · Env vars (already placeholder in `.env`)

```
AWS_S3_BUCKET="__PLACEHOLDER_BUCKET__"
AWS_S3_REGION="__PLACEHOLDER_REGION__"
AWS_ACCESS_KEY_ID="__PLACEHOLDER_ACCESS_KEY__"
AWS_SECRET_ACCESS_KEY="__PLACEHOLDER_SECRET__"
```

`core/s3.py` module (~120 LOC) exposes:
- `S3_CONFIGURED: bool` — `False` if any env var starts with `__PLACEHOLDER_`.
- `get_s3_client() → boto3.client` — cached, raises 503 if not configured.
- `get_public_url(key: str) → str` — returns `https://{bucket}.s3.{region}.amazonaws.com/{key}`.
- `BUCKET: str`, `REGION: str` — exposed as constants for URL construction.
- Bucket-policy JSON + IAM policy JSON documented in module docstring (owner-actionable).

---

## 7 · Testing plan (post-implementation)

Owner-invoked `testing_agent_v3_fork` required (this rule was reaffirmed 2026-07-04). Suggested test surfaces:

- **Backend pytest** (`/app/backend/tests/test_cr036_s3_migration.py`):
  - S3 client init (configured / placeholder branches)
  - Upload endpoints (media header · bill logo)
  - Serve endpoints (dual-mode fallback for logos, invoices)
  - `_generate_pdf` HTTPS base_url with S3-hosted logo
  - Campaign send with template that has `send_media_url` set → `WhatsAppMessage` includes `headerValues`
  - Campaign send with template lacking `send_media_url` → silent-degrade + `status_note="media_missing"` (per Q7)
  - S3-unreachable graceful degradation (mock `boto3` to raise)
- **Frontend Playwright**:
  - Template Builder file picker (Meta creds check per Q5)
  - Bill logo upload → S3 URL rendered on ProfilePage
  - Invoice link on WhatsApp preview page renders correctly
- **Cleanup rule** (locked 2026-07-04 post-QA-incident): all QA test artifacts must have unique name-prefix (`QATest_*` or `UITest_*`). Cleanup queries MUST AND together `user_id` + phone-prefix + name-prefix. No broad `$or` regex.

---

## 8 · Open blockers before implementation

| Blocker | Owner action | Status |
|---|---|---|
| AWS_S3_BUCKET, REGION, ACCESS_KEY, SECRET | Share via secure channel (or use Emergent-managed) | ⏳ Pending — owner said "later" (2026-07-04) |
| S3 bucket + IAM user created with correct policies | Attach `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on 3 prefixes. Public-read bucket policy for the 3 prefixes. Draft JSON in `INV_006_FILE_UPLOAD_SURFACE_AUDIT.md §4`. | ⏳ Pending |
| CORS on bucket (only if direct-browser-upload used) | Not needed — CRM uploads backend-side. | N/A |

Once blockers cleared, implementation is unblocked. Estimated **~16-20 hrs** (1 focused day).

---

*End of CR-036 Scope Amendment 2026-07-04. Sits alongside `CR_036_MEDIA_TEMPLATE_APPROVAL_AND_DELIVERY_IMPL_PLAN.md` (Part 1). Both docs are authoritative — this addendum wins on conflicts (newer + broader scope).*
