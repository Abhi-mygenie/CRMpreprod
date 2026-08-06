# INV-006 — File Upload & Local Storage Surface Audit

> **Role**: INVESTIGATION
> **Registered**: 2026-07-04
> **Owner directive**: Enumerate every file-upload / local-file surface in the codebase BEFORE starting CR-036, so each surface becomes its own scoped CR migration to Amazon S3. Placeholder AWS S3 env vars have been added to `/app/backend/.env`; real credentials pending owner supply.
> **Purpose**: Give owner + planning agent full scope of local-disk dependencies so migration to S3 can be split into per-surface CRs rather than one big-bang change.
> **Method**: Exhaustive grep audit of `/app/backend` for `UploadFile`, `write_bytes`, `write_text`, `open(w`, `/app/data`, `FileResponse`, `StaticFiles`. Frontend grep for `type="file"`, `FormData`, `multipart`.
> **Status**: 📋 Complete — 5 surfaces identified, 3 CRs recommended.

---

## 1 · Summary Table

| # | Surface | Direction | Current storage | Public? | Volume/size | Status | Suggested CR |
|---|---|---|---|---|---|---|---|
| A | Bill logo upload | INBOUND (owner uploads) | `/app/data/logos/{user_id}.{ext}` (local disk) | Yes — public URL served by backend | ≤500KB per tenant, ~1 per tenant | **LIVE, works** | **CR-046** (migrate to S3) |
| B | Customer CSV/XLSX import | INBOUND (owner uploads) | **NONE — bytes in-memory only, discarded after import** | N/A | ≤10MB per upload, transient | **LIVE, works** | **No CR** (no persistence needed) |
| C | Invoice HTML | OUTBOUND (server writes) | `/app/data/invoices/{token}/invoice.html` (local disk) | Yes — public URL served by backend | ~10-30 KB per invoice, ~1 per completed order | **LIVE, works** | **CR-047** (migrate to S3 — optional, WhatsApp e-invoice link) |
| D | Invoice PDF | OUTBOUND (server writes) | `/app/data/invoices/{token}/invoice.pdf` (local disk, generated on-the-fly) | Yes — public URL served by backend | ~50-200 KB per PDF | **LIVE, works** | **CR-047** (bundle with C) |
| E | WhatsApp media header | INBOUND (owner *should* upload; currently pastes URL) | **NONE — currently just a URL text field, broken at send-time (INV-005)** | N/A | ≤5MB (Meta cap for image), ≤16MB (video/doc) | **BROKEN** (per INV-005) | **CR-036** (this is the ongoing CR) |

**Legend**
- **INBOUND** = user provides bytes we must store
- **OUTBOUND** = server generates bytes we must serve back
- **Public** = URL is accessed with no auth (WhatsApp/AuthKey pull-from-URL, customer clicking invoice link on phone)

---

## 2 · Surface-by-Surface Detail

### 2.A · Bill Logo Upload

**Endpoint**: `POST /api/auth/profile/logo` (multipart `file` field)
**Code**: `/app/backend/routers/auth.py:262-278`
**Disk path**: `_LOGO_DIR = Path("/app/data/logos")` (line 259) · `{user_id}.{ext}` per tenant
**Serve endpoint**: `GET /api/auth/profile/logo/{user_id}` at line 280
**Constraint**: PNG/JPG/WEBP · max 500 KB (line 264-270)
**Frontend**: `ProfilePage.jsx:165` FormData → `handleLogoUpload` on `data-testid=bill-logo-file-input` (line 250)
**Reference on**: `users.bill_settings.bill_logo_url` (line 276)

**Why migrate to S3**:
1. Pod restart deletes ephemeral disk → logo vanishes → every invoice thereafter shows broken image.
2. Publicly served URL currently domain-locked to preprod pod URL — changes on deploy.
3. Ephemeral disk on Kubernetes = data-loss risk.

**Estimated effort**: ~2 hrs (small — one endpoint, one PUT to S3, update `bill_logo_url` to S3 URL).

**Suggested CR**: **CR-046 — Bill Logo → S3**.

---

### 2.B · Customer CSV/XLSX Import

**Endpoints**: `POST /api/customers/import-preview` + `POST /api/customers/import`
**Code**: `/app/backend/routers/customers.py:1329-1490`
**Disk path**: **NONE** — `content = await file.read()` (line 1335, 1392) then parsed via `_parse_import_file()` → discarded.
**Frontend**: `CustomersPage.jsx:2832` `<input type="file" accept=".csv,.xlsx">`.
**Row cap**: 5000 · Size cap: 10 MB.

**Recommendation**: **NO CR** — the bytes are transient by design and never persist. Migration to S3 would add latency and complexity for zero benefit. Leave as-is.

**Optional future micro-CR**: If owner wants an "audit trail" of what was imported (e.g. re-download the raw CSV that produced a given import), THEN store the raw file in S3 keyed by `import_logs.id`. ~1 hr. Currently we only keep row counts + first 50 errors on `import_logs`, not the raw file. Owner has NOT asked for this.

---

### 2.C + 2.D · Invoice HTML + PDF

**Code**: `/app/backend/services/invoice_generator.py:12` — `DATA_DIR = Path("/app/data/invoices")`
**Write points**:
- Line 380: `html_path.write_text(html)` — food invoice
- Line 564, 633: hotel folio (Mode C — CR-014 Phase 3)
- Line 649-662: PDF generated on-the-fly via WeasyPrint, written to `invoice_dir / "invoice.pdf"`
**Serve endpoint**: `/app/backend/routers/invoices.py:18` (`GET /api/invoices/{token}` HTML), line 38 (`GET /api/invoices/{token}/pdf` PDF `FileResponse`)
**Public**: YES — customers open the link on WhatsApp e-invoice message. NO auth.
**Token**: opaque 32-char hex from `_generate_invoice_token()`

**Why migrate to S3**:
1. Same ephemeral-disk problem as 2.A — pod restart wipes all past invoices → customer clicks WhatsApp link from 3 months ago → 404. **THIS IS A REAL CUSTOMER-VISIBLE DATA LOSS RISK**.
2. Backend serves ~1000s of invoices/day at scale — direct S3 URL removes backend from hot path.
3. E-invoice link on WhatsApp template must remain live for months/years (GST retention).

**Complexity**: Higher than 2.A because:
- PDF is generated on-the-fly on first request (`invoices.py:47-56`) — this path needs to write to S3 instead of local disk.
- WeasyPrint currently uses `base_url=str(invoice_dir)` to resolve relative CSS/images — need to check if it works cleanly with S3-hosted assets (bill logo also becomes S3 after 2.A).
- HTML template references `/api/auth/profile/logo/{user_id}` — currently backend URL. If logo moves to S3, HTML template must be updated too.

**Estimated effort**: ~4-6 hrs. Best done AFTER 2.A (bill logo migration) since invoice HTML embeds the logo.

**Suggested CR**: **CR-047 — Invoice HTML+PDF → S3** (depends on CR-046).

---

### 2.E · WhatsApp Media Header (CR-036)

**Current state**: `TemplateBuilderPage.jsx:479` — text input for `media_url`. Owner pastes any public URL. Template is submitted to Meta for approval. Meta APPROVES the template with that URL as the header example. **BUT** at send-time (INV-005), `routers/campaigns.py` never passes `media_url` to `WhatsAppMessage()` → AuthKey receives no `headerValues` block → **customer sees the template with a broken/missing header**.

**Detailed impl plan already written**: `planning/CR_036_MEDIA_TEMPLATE_APPROVAL_AND_DELIVERY_IMPL_PLAN.md` (800 lines).

**This is what CR-036 solves**. Both Part 1 (approval via Meta `/uploads` handle) + Part 2 (delivery via S3 URL passed to AuthKey) are covered by the existing plan. **Do not re-scope**.

---

## 3 · Recommended CR split

| CR | Scope | Depends on | Effort |
|---|---|---|---|
| **CR-036** (existing, plan ready) | WhatsApp media header approval + S3 delivery. Adds `core/s3.py` module. | AWS creds | ~10-12 hrs |
| **CR-046** (NEW, register from this INV) | Bill logo → S3. Reuse `core/s3.py` from CR-036. | CR-036 (for `core/s3.py`) | ~2 hrs |
| **CR-047** (NEW, register from this INV) | Invoice HTML+PDF → S3. Reuse `core/s3.py`. | CR-036 + CR-046 | ~4-6 hrs |

**Total S3 sprint**: ~16-20 hrs across 3 CRs. Sequential (each reuses `core/s3.py` from the prior one).

**Recommendation for owner**:
- Land **CR-036** first — highest customer-visible impact (media templates broken today).
- Then **CR-046** (bill logo) — small, easy, protects future invoices from broken logo images on pod restart.
- Then **CR-047** (invoices) — biggest data-loss protection (retroactive GST-compliance / customer WhatsApp link durability).

---

## 4 · Bucket structure proposal (single shared bucket)

```
s3://<AWS_S3_BUCKET>/
├── media-headers/<user_id>/<uuid>.{jpg|png|mp4|pdf|mp3}       ← CR-036
├── bill-logos/<user_id>.{png|jpg|webp}                          ← CR-046
└── invoices/<token>/{invoice.html, invoice.pdf}                 ← CR-047
```

**All 3 prefixes** need public-read (no auth headers) because:
- AuthKey pulls media-headers server-side without auth (WhatsApp requirement).
- Customer opens invoice/logo link directly from WhatsApp on their phone.

**IAM policy** for the CRM's IAM user should allow:
- `s3:PutObject` on `arn:aws:s3:::<bucket>/media-headers/*`
- `s3:PutObject` on `arn:aws:s3:::<bucket>/bill-logos/*`
- `s3:PutObject` on `arn:aws:s3:::<bucket>/invoices/*`
- `s3:DeleteObject` on all 3 (for re-upload / rotation)
- `s3:GetObject` for internal reads (rare — mostly public anyway)

Bucket policy for public GetObject on the 3 prefixes:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadCRMAssets",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": [
      "arn:aws:s3:::<BUCKET>/media-headers/*",
      "arn:aws:s3:::<BUCKET>/bill-logos/*",
      "arn:aws:s3:::<BUCKET>/invoices/*"
    ]
  }]
}
```

---

## 5 · Env vars (placeholder in `.env` today)

```
AWS_S3_BUCKET="__PLACEHOLDER_BUCKET__"
AWS_S3_REGION="__PLACEHOLDER_REGION__"
AWS_ACCESS_KEY_ID="__PLACEHOLDER_ACCESS_KEY__"
AWS_SECRET_ACCESS_KEY="__PLACEHOLDER_SECRET__"
```

**Fail-fast rule** (to be enforced by `core/s3.py`): on module import, if any of the 4 values start with `__PLACEHOLDER_`, the S3 client is NOT initialised. Any endpoint attempting an upload must return `503 Service Unavailable — AWS S3 not configured (see INV-006)`.

Existing endpoints (2.A logo, 2.C/D invoice) continue writing to local disk until their respective CR ships — no regression.

---

## 6 · Open questions for owner

1. **Approve 3-CR split** (CR-036 → CR-046 → CR-047)?
2. **Own AWS account** or **Emergent-managed object storage**? (If Emergent-managed, `integration_playbook_expert_v2` will provide alternate playbook.)
3. **Single shared bucket** vs 3 buckets (one per prefix)? Recommended: single shared, cheaper + simpler.
4. **Retention on invoices S3**: keep forever (GST 7-yr rule) or lifecycle to Glacier after 90 days? Suggested: no lifecycle, GST server can subpoena at any time.
5. **CloudFront CDN in front of bucket**? Not required for MVP; direct S3 URL is fine for current scale. Deferred.

---

## 7 · Zero code changes this INVESTIGATION

- No .py or .jsx touched
- `.env` gained 4 placeholder keys (fail-fast, no service impact)
- New CRs (CR-046, CR-047) NOT yet registered on dashboard — will be registered in a follow-up INTAKE role once owner approves the split (Q1 above).

*End of INV-006. Next: owner approval → INTAKE for CR-046 + CR-047 → then IMPL for CR-036 once AWS creds land.*
