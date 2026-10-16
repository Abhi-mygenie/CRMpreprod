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

## 5. Owner decisions — RULED 2026-10-14
- **D1 RULED:** nested `data.einvoice {…}` object (as recommended). Flat keys dropped.
- **D2 RULED:** R3 lookup by `pos_order_id` with `restaurant_order_id` fallback (as recommended).
- **D3 RULED:** add `(user_id, pos_order_id)` index on `invoices`.
- **D4 RULED:** base URL **strictly from env** `REACT_APP_BACKEND_URL` → fallback `CRM_EXTERNAL_URL`. **No hardcoding** of `crm.mygenie.online` anywhere.

## 5b. R6 (NEW requirement, owner 2026-10-14) — log invoice-generation failures per restaurant
When `create_invoice()` **throws** OR **returns an empty/missing `token`** (silent failure), emit a **structured ERROR log** carrying `user_id` (restaurant), `restaurant_id`, `pos_order_id`, `restaurant_order_id`, and the error — so we can see *which restaurants* are failing. In that case set `data.einvoice.available=false` (nulls) and the order still succeeds (no raise).
- Today only a thin WARNING exists (`pos.py:1598-1599`) logging the CRM `order_id` only — no restaurant identity, and it does **not** catch the silent "returned but empty token" case. R6 enriches both.
- Same base-URL env rule (D4) applies; no new collection required (log-only). Optional future: a `invoice_failures` counter — **out of scope** now.

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
| V9 | invoice-gen failure (throw) | structured ERROR log with `user_id`+`restaurant_id`+`pos_order_id`+`restaurant_order_id`+error (R6) |
| V10 | invoice-gen returns empty token (silent fail) | same R6 ERROR log fires; `available=false` |

## 8. Files
**WILL change:** `routers/pos.py` (R1: response block ~L1753-1781; R3: new `GET /orders/{pos_order_id}/invoice`). Optional one-off index create on `invoices`.
**WILL NOT touch:** `services/invoice_generator.py`, `routers/invoices.py`, `models/schemas.py`, `core/loyalty.py`, `core/coupon.py`, `core/whatsapp*.py`, webhook/event contract, any frontend.

## 9. Gate
Impact Analysis complete. **No code written.** D1–D4 RULED; R6 added to scope. Next: "choose planning role for implementation plan" (or straight to implementation). Implementation touches only `routers/pos.py` (R1 response block, R3 new route, R6 enriched failure logging) + one `invoices` index.
