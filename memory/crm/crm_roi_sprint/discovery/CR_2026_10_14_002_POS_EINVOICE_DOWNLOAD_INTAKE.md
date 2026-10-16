# CR-2026-10-14-002 — POS can retrieve/download the CR-014 e-invoice

**Role:** Intake Agent · **Date:** 2026-10-14 · **Type:** CR
**Severity:** P1 · **Risk:** LOW · **Money path:** YES (billing / invoice document)
**Source:** Owner (saurav.manhapra@gmail.com) · Investigation `INV_2026_10_14_001_POS_ORDER_RESPONSE_EINVOICE.md`
**Parent:** CR-014 (E-Invoice PDF + Mobile HTML Link) · Related: `einvoice_token` note (2026-06-06), CR-069
**Scope approved by owner:** R1 + R3 (R2 already satisfied; R4/R5 out of scope)

---

## 1. Owner report (plain)

CRM already generates an e-invoice (HTML + PDF) for every POS order and stores it in S3, but POS is never given the link, so POS cannot open or download it. Make the invoice retrievable by POS.

## 2. Classification

- **CR** (capability gap / enhancement extending CR-014). Not a crash. **DISTINCT** from CR-014 (which built generation + customer WhatsApp delivery); this adds the **POS-facing retrieval path**.
- Duplicate check: **DISTINCT / RELATED to CR-014**. No existing item covers surfacing the invoice to POS.

## 3. Current state (evidence — from investigation)

- `services/invoice_generator.create_invoice()` already returns `{token, invoice_number, invoice_url, pdf_url}` (L817-822) and is **idempotent** on `(user_id, restaurant_order_id)` (L767-777).
- `routers/pos.py` order flow (L1595-1597) captures only `einvoice_link` (= `invoice_url`) + `einvoice_token`, **drops `pdf_url`**, and injects them **only** into the `send_bill` WhatsApp event (L1608-1609). The POS HTTP response (`POSResponse.data`, L1753-1781) contains **no invoice field**.
- Public serving routes already exist, **no auth (token = secret)**: `GET /api/invoices/{token}` (HTML) and `GET /api/invoices/{token}/pdf` (PDF). → once POS has the link, download works directly.
- Storage: **S3 CONFIRMED configured** (bucket `mygenie-prod`, ap-south-1, `S3_CONFIGURED=True`). HTML written on create, PDF on first `/pdf` hit then cached to S3. Persists across restarts. **(R2 = done, no work.)**
- `invoices` collection stores `token`, `user_id`, `pos_order_id`, `restaurant_order_id`, `invoice_number`, `mode`, `html_path`, `pdf_path`. Indexes: `token`, `(user_id, restaurant_order_id)`. **`order_id` is NOT stored** (null on all 53 rows) → a POS lookup must key on `user_id` + `pos_order_id` (or `restaurant_order_id`), both present.
- POS auth model: all `/api/pos/*` routes use `Depends(verify_pos_auth)` (X-API-Key). A new POS lookup endpoint reuses the same dependency (tenant scoping for free).

## 4. Requested scope

### R1 — Return invoice links in the order response (primary)
On `POST /api/pos/orders`, add to `POSResponse.data`:
- `einvoice_link` — the HTML invoice URL (already computed as `invoice_url`).
- `einvoice_pdf_link` — the PDF URL (`pdf_url`, currently dropped — thread `inv["pdf_url"]` through).
- `einvoice_token` — raw token (already captured).
Empty-string/`null` when generation failed (best-effort try/except already present). Additive, non-breaking.

### R3 — POS re-fetch endpoint (robustness)
New `GET /api/pos/orders/{pos_order_id}/invoice` (auth `verify_pos_auth`):
- Look up `invoices` by `user_id` (from API key) + `pos_order_id`.
- Return `{ token, invoice_number, einvoice_link, einvoice_pdf_link }`, base URL from `REACT_APP_BACKEND_URL`/`CRM_EXTERNAL_URL`.
- `404` when no invoice exists for that order. Read-only.

### Out of scope
- R2 (S3) — already configured. R4 (external URL env) — config check, confirm at planning. R5 (pre-generate PDF at order time) — optional polish, deferred.

## 5. Acceptance criteria (draft — firmed in planning)

- AC1: A successful `POST /api/pos/orders` returns `einvoice_link`, `einvoice_pdf_link`, `einvoice_token` in `data` (populated when the invoice generated; empty/null otherwise). No existing field removed/renamed.
- AC2: `GET /api/invoices/{token}` and `/pdf` resolve for the returned links (already live).
- AC3: `GET /api/pos/orders/{pos_order_id}/invoice` returns the same token/links for a known order; `404` for an unknown/order-with-no-invoice; tenant-scoped (one tenant cannot read another's invoice).
- AC4: Idempotent — re-posting the same order returns the same token/links (no duplicate invoice).
- AC5: Guest orders (invalid phone) still return the links (invoice is generated regardless; only WhatsApp is gated).

## 6. Severity / risk / blast radius

- **Severity P1** — POS has no workaround to obtain the invoice today; it's a committed cross-team capability. Not a production outage.
- **Risk LOW** — R1 is purely additive to a response dict; R3 is a new read-only endpoint. No change to generation, storage, loyalty, coupons, or the webhook contract.
- **Blast radius SMALL** — files expected to change: `routers/pos.py` (response block + new route), reuse `services/invoice_generator`, `core/auth.verify_pos_auth`. No schema change (optional: add `(user_id, pos_order_id)` index for the lookup).

## 7. Open questions for planning

- Q1: Field naming — `einvoice_pdf_link` vs `einvoice_pdf_url`? (match existing `einvoice_link` style → propose `einvoice_pdf_link`.)
- Q2: R3 key — `pos_order_id` (proposed) vs `restaurant_order_id`? (dedup key is `restaurant_order_id`; `pos_order_id` is what POS holds — propose `pos_order_id`, fall back to `restaurant_order_id`.)
- Q3: Add a DB index on `(user_id, pos_order_id)` for the lookup? (53 rows today — negligible, but future-proof.)

## 8. Gate

Intake complete. **No code written.** Scope = R1 + R3. Awaiting owner "choose planning role" to proceed to impact analysis / implementation plan.
