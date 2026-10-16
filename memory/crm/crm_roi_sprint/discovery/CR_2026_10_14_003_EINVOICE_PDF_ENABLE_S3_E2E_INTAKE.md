# CR-2026-10-14-003 — Enable e-invoice PDF: weasyprint + S3 persistence + E2E to POS

**Role:** Intake Agent · **Date:** 2026-10-16 · **Type:** CR (enabling / env + verification)
**Severity:** P1 · **Risk:** LOW · **Money path:** YES (invoice document)
**Source:** Owner (saurav.manhapra@gmail.com)
**Parent:** CR-2026-10-14-002 (POS e-invoice links — R1/R3/R6 implemented). Finding source: `qa/CR_2026_10_14_002_QA_HANDOVER.md` (B1, B2).

---

## 1. Owner report (plain)
Make the e-invoice PDF actually work end-to-end to POS. Three parts:
1. Install **weasyprint** (PDF generator currently missing → no PDF is produced).
2. Store/serve the invoice from **S3, not local disk**; all config (bucket/region/keys + public base URL) taken **from ENV, no hardcoding**.
3. **Owner-run manual test:** owner creates a real order; we verify the PDF is generated, the link is passed to POS (R1), and POS can actually open/download it.

## 2. Classification
CR (enabling + environment + verification), **DISTINCT** from CR-2026-10-14-002 which surfaced the links. This makes the PDF behind those links real. Duplicate check: DISTINCT / RELATED to CR-002 + CR-014.

## 3. Current state (evidence)
- `weasyprint` **not installed**: `generate_invoice_pdf` (`services/invoice_generator.py:707`) → `ModuleNotFoundError`. No PDF at create time → `pdf_path=None`, nothing in S3.
- **System libs already present** (`libpango-1.0`, `libgobject-2.0`, `libcairo`, `libgdk_pixbuf`) → weasyprint is expected to be a **pip-only** install (no apt). Not in `requirements.txt`.
- S3 **already configured** (`S3_CONFIGURED=True`, bucket `mygenie-prod`, ap-south-1). `generate_invoice_pdf` already writes PDF to S3 (`put_public_object`, L746-747); `create_invoice` writes HTML to S3 (L60-61). `/api/invoices/{token}/pdf` already 302-redirects to the S3 URL when present.
- All config already from ENV (`AWS_S3_*`, base URL `REACT_APP_BACKEND_URL`→`CRM_EXTERNAL_URL`). No hardcoding introduced by CR-002 (normaliser added there).
- Known latent bug **B2** (`routers/invoices.py:95` `Path(None)`→500) only triggers when a PDF is **missing**; once weasyprint works the PDF is pre-generated to S3, so the happy path 302-redirects and never hits B2. **B2 is OUT OF SCOPE here (owner: no code edit)** — tracked as a latent risk.

## 4. Scope
- **S1 — Install weasyprint** (pip), pin and add to `requirements.txt` (via `pip install` + `pip freeze`) so it persists to the deploy image. Verify `import weasyprint` + a test PDF renders.
- **S2 — S3 persistence** verify: a newly generated invoice's HTML **and** PDF land in S3 (`invoices/{token}/invoice.{html,pdf}`) and are served from S3 (PDF route 302→S3). Confirm every value comes from ENV; no hardcoded bucket/URL. Local disk is fallback only.
- **S3 — Owner manual E2E test:** owner creates a real order (POS/CRM). Verify: (a) PDF generated at order time, (b) PDF stored in S3, (c) `einvoice.pdf_url` returned in `POST /api/pos/orders` (R1) + via `GET /api/pos/orders/{pos_order_id}/invoice` (R3), (d) POS opens/downloads the PDF successfully (single `/api`, no 500).

## 5. Acceptance criteria (draft)
- AC1: `weasyprint` importable; present in `requirements.txt`.
- AC2: New order → PDF object exists in S3 at `invoices/{token}/invoice.pdf`.
- AC3: `GET /api/invoices/{token}/pdf` returns 302→S3 (or 200 PDF), **no 500**.
- AC4: POS order response + R3 return a working `pdf_url` (owner opens it, PDF downloads).
- AC5: No hardcoded S3/base-URL values; all from ENV.

## 6. Severity / risk / blast radius
- **P1** — PDF download is the headline capability and is currently non-functional.
- **Risk LOW** — pip-only install (system libs present); no app code change required for the happy path; S3 + ENV wiring already exists.
- **Blast radius SMALL** — `requirements.txt` + dependency; verification only. No router/schema change.

## 7. Open questions
- Q1: Pin a specific weasyprint version, or latest? (propose latest compatible with Python 3.11.)
- Q2: Does production deploy image already include weasyprint? (If yes, this is a preview-pod parity fix; confirm at deploy.)
- Q3: B2 (invoices.py:95) — leave as latent (owner: no code edit now) or fold a 1-line guard later under CR-002? (default: leave, revisit.)

## 8. Gate / status
- **S1 DONE (2026-10-16):** `weasyprint==70.0` installed (pip-only, system libs present) and pinned in `requirements.txt`. `import weasyprint` OK. Backend restarted.
- **S2 DONE — S3 dry-run verified (no real order):** ran `generate_invoice_pdf` on an existing invoice → PDF uploaded to S3 (`invoices/{token}/invoice.pdf`: BEFORE absent → AFTER present). Live `GET /api/invoices/{token}/pdf` → **302 → S3** (`https://mygenie-prod.s3.ap-south-1.amazonaws.com/...`), S3 URL returns **200**. All config from ENV; no hardcoding.
- **S3 PENDING — owner manual E2E:** owner creates a real order; verify PDF generated → S3 → `pdf_url` in POS order response (R1) + R3 → POS downloads it.
- B2 (`invoices.py:95`) untouched (owner: no code edit); not hit on happy path since PDF now pre-generated to S3.
