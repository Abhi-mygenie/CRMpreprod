# CR-2026-10-14-002 — Impact Analysis (R1 + R3)

**Role:** Planning Agent · **Stage:** Impact Analysis · **Date:** 2026-10-14
**Code reality:** PARTIAL (invoice generation + public serving already exist; only POS-facing surfacing is missing)
**Risk:** LOW · **Blast radius:** SMALL · **Money path:** YES (invoice document)
**Intake:** `discovery/CR_2026_10_14_002_POS_EINVOICE_DOWNLOAD_INTAKE.md`

---

## 1. Registered? Yes — CR-2026-10-14-002 (INTAKE), scope R1 + R3.

## 2. Code reality (what already exists)
- `create_invoice()` returns `{token, invoice_number, invoice_url, pdf_url}`, idempotent on `(user_id, restaurant_order_id)` — `services/invoice_generator.py:817-822`, dedup `:767-777`.
- Public serving live, token-auth only: `GET /api/invoices/{token}` + `/pdf` — `routers/invoices.py`.
- S3 configured (bucket `mygenie-prod`) → persistence OK.
- POS auth dependency `verify_pos_auth` (X-API-Key → `user`), tenant = `user["id"]` — `core/auth.py:93`.
- Reusable sibling pattern: `GET /customers/{customer_id}/documents` (`routers/pos.py:2304`) — same `verify_pos_auth`, tenant filter, `POSResponse`.

## 3. Data flow (after change)
`POST /api/pos/orders` → order saved → `create_invoice()` (already called, L1595) → **NEW: thread `invoice_url` + `pdf_url` + `token` into `POSResponse.data`** (currently only `invoice_url`+`token` captured, dropped from response).
`GET /api/pos/orders/{pos_order_id}/invoice` (NEW) → `verify_pos_auth` → `db.invoices.find_one({user_id, pos_order_id})` → rebuild URLs from `base_url` + token → `POSResponse`.

## 4. Request / response shapes

### R1 — `POST /api/pos/orders` response (additive only)
`POSResponse.data` gains one nested object (null-safe for POS):
```json
"einvoice": {
  "available": true,
  "token": "c70c5c76dff54277a23144256ba5a543",
  "invoice_number": "KM/010585",
  "html_url": "https://crm.mygenie.online/api/invoices/c70c5c76…",
  "pdf_url":  "https://crm.mygenie.online/api/invoices/c70c5c76…/pdf"
}
```
- `available=false` and `token/urls=null` when generation failed (best-effort try/except already at L1590-1599). Never raises.
- No existing `data` field changed/removed. (Decision D1 below: nested object vs flat keys.)

### R3 — `GET /api/pos/orders/{pos_order_id}/invoice` (NEW, X-API-Key)
Success `200`:
```json
{ "success": true, "message": "Invoice found",
  "data": {
    "pos_order_id": "939327",
    "available": true,
    "token": "c70c5c76…",
    "invoice_number": "KM/010585",
    "html_url": "https://crm.mygenie.online/api/invoices/c70c5c76…",
    "pdf_url":  "https://crm.mygenie.online/api/invoices/c70c5c76…/pdf",
    "generated_at": "2026-06-06T…Z" } }
```
Not found `404`: `{"detail": "Invoice not found for this order"}` (mirrors `pos_get_documents` 404 style).
Tenant-scoped: lookup filtered by `user["id"]` → one tenant cannot read another's invoice.

## 5. Owner decisions (surface before implementation)
- **D1 — response shape:** nested `data.einvoice {…}` (recommended — groups fields, POS null-checks one key) **vs** flat keys `einvoice_link`/`einvoice_pdf_link`/`einvoice_token` (matches the WhatsApp event naming). → Recommend **nested**.
- **D2 — R3 lookup key:** `pos_order_id` (recommended — what POS holds) with fallback to `restaurant_order_id`. Both stored on the invoice doc.
- **D3 — index:** add `(user_id, pos_order_id)` index on `invoices` (future-proof; 53 rows today so optional). → Recommend add.
- **D4 — base URL:** use `REACT_APP_BACKEND_URL` → fallback `CRM_EXTERNAL_URL` (same as order flow L1594). Confirm prod value is the public `crm.mygenie.online`.

## 6. Conflicts & downstream consumers
- **Conflicts:** none. No change to generation, storage, loyalty, coupons, webhook contract, or `POSResponse` schema (`data: Optional[dict]`).
- **Downstream:** POS team — purely additive; existing integrations ignore unknown fields. No CRM frontend impact. WhatsApp `send_bill` path untouched.

## 7. Verification matrix
| V | Check | Expect |
|---|---|---|
| V1 | `POST /api/pos/orders` (valid customer) | `data.einvoice.available=true`, html_url+pdf_url+token present |
| V2 | both URLs fetched | HTML 200, PDF 200/302-to-S3 |
| V3 | guest order (invalid phone) | invoice still returned (`available=true`); WhatsApp still skipped |
| V4 | re-post same order | same token (idempotent), no duplicate invoice row |
| V5 | `GET /orders/{pos_order_id}/invoice` known order | 200 with same token/urls |
| V6 | `GET` unknown order | 404 |
| V7 | `GET` with tenant B's key for tenant A's order | 404 (isolation) |
| V8 | invoice-gen forced failure | `available=false`, nulls, order still 200 (no raise) |

## 8. Files
**WILL change:** `routers/pos.py` (R1: response block ~L1753-1781; R3: new `GET /orders/{pos_order_id}/invoice`). Optional one-off index create on `invoices`.
**WILL NOT touch:** `services/invoice_generator.py`, `routers/invoices.py`, `models/schemas.py`, `core/loyalty.py`, `core/coupon.py`, `core/whatsapp*.py`, webhook/event contract, any frontend.

## 9. Gate
Impact Analysis complete. **No code written.** Awaiting owner ruling on D1–D4, then "choose planning role for implementation plan" (or straight to implementation).
