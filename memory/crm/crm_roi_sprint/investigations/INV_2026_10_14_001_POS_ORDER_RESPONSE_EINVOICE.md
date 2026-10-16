# INV-2026-10-14-001 — What does CRM return to POS on `POST /api/pos/orders`? (e-invoice angle)

**Role:** Investigation Agent · **Date:** 2026-10-14 · **Confidence:** HIGH · **Read-only (no code changed)**
**Owner question:** For CR-014 (POS should be able to download the e-invoices CRM creates) — when POS sends an order request, what response goes back to POS?
**CR:** CR-014 (E-Invoice PDF + Mobile HTML Link). Related: einvoice_token (2026-06-06), CR-069.

---

## 1. Finding (one line)

The `POST /api/pos/orders` response **does NOT contain the e-invoice link or token.** The invoice is generated at order time, but its URL/token are forwarded **only into the WhatsApp `send_bill` event (customer-facing)** — never returned to POS. So today POS **cannot** get/download the e-invoice from the order response.

## 2. Evidence (code)

`routers/pos.py`:
- **L1587–1597** — invoice is generated inline: `create_invoice(...)` → `einvoice_link = inv["invoice_url"]`, `einvoice_token = inv["token"]`.
- **L1603–1615** — those two values are injected into the `send_bill` WhatsApp `event_data` (sent to the **customer** via WhatsApp). Guest orders (`is_guest`) get no WhatsApp.
- **L1753–1781** — the actual HTTP response to POS (`POSResponse.data`) returns: `order_id, pos_order_id, customer_id, customer_name, guest_order, guest_reason, is_new_customer, first_visit_bonus_awarded, order_amount, points_earned, off_peak_bonus, off_peak_message, total_points, tier, wallet_used, wallet_balance_after, coupon_applied, coupon_discount, coupon_usage, loyalty_redeem`. **No `einvoice_link` / `einvoice_token` / invoice field.**

`routers/invoices.py` — only two routes, both **public + token-based (no POS auth, no order-id lookup):**
- `GET /api/invoices/{token}` → invoice HTML
- `GET /api/invoices/{token}/pdf` → invoice PDF

There is **no** POS-authenticated endpoint to fetch an invoice by `order_id` / `pos_order_id`.

## 3. Consequence / gap

- The invoice token exists server-side (stored in the `invoices` collection), but POS has **no way to learn it**: it's absent from the order response and there's no lookup endpoint.
- POS could only reach an invoice if it already had the token — which it never receives. The only consumer wired today is the customer's WhatsApp `send_bill`.

## 4. Options (for a future CR — not implemented here)

- **A (smallest):** add `einvoice_link` + `einvoice_token` to the `POST /api/pos/orders` response `data` block (the values already exist at L1596–1597; just surface them). PDF is then `{{einvoice_link or /api/invoices/{token}}}/pdf`.
- **B:** add a POS-authenticated lookup `GET /api/pos/orders/{pos_order_id}/invoice` returning link/token (covers retries + orders where generation finished late).
- **C:** both — A for the happy path, B for re-fetch.

## 5. Caveats

- Invoice generation is best-effort/failure-safe (L1590–1599): if it throws, the order still succeeds and link/token are empty strings — any new response field must tolerate empty.
- Base URL for the link comes from `REACT_APP_BACKEND_URL` or `CRM_EXTERNAL_URL` (L1594).

---

## 6. Deep dive — what is actually required for POS to download the invoice

### 6.1 The invoice already exists and is downloadable by URL (no auth)
- `create_invoice()` (invoice_generator L764+) **already returns both `invoice_url` and `pdf_url`** = `{base_url}/api/invoices/{token}` and `.../pdf`. It is **idempotent** (existing-invoice path L772 returns the same token on re-post).
- Public routes (`routers/invoices.py`) need **no auth — the token is the secret**: `GET /api/invoices/{token}` (HTML) and `GET /api/invoices/{token}/pdf` (PDF). So once POS has the link/token, it can download directly.
- Invoice is generated for **every** order including guests (create_invoice runs at L1595 *before* the `is_guest` WhatsApp gate); only the WhatsApp *send* is gated.

### 6.2 Gap #1 (the core one) — POS is never given the link
- `pos.py` captures only `einvoice_link` + `einvoice_token` (L1596-1597) and **drops `pdf_url`** entirely, then puts none of them in the POS response (§2). So POS has no token and no link.
- **Required:** surface in `POST /api/pos/orders` response `data`: `einvoice_link`, `einvoice_pdf_link` (available from `create_invoice` — just thread `inv["pdf_url"]` through), and/or `einvoice_token`.

### 6.3 Gap #2 (reliability) — persistence is ephemeral without S3
- **S3 is NOT configured in this pod** (`S3_CONFIGURED=False`, bucket empty). Invoices therefore fall back to **local disk `/app/data/invoices/{token}/`**, which is container-local and **lost on restart/redeploy**.
- **PDF is NOT generated at order time** — only the HTML is written on create. The PDF is generated **on-the-fly (WeasyPrint) on the first hit** to `/pdf` (L97-103), then cached to disk (+S3 if configured).
- **Required for reliable POS download in prod:** configure S3 (`AWS_S3_BUCKET/REGION/keys`) so HTML+PDF persist beyond a single pod; otherwise links can 404 after a restart or if POS downloads from a different pod. (Optionally pre-generate the PDF to avoid first-hit latency.)

### 6.4 Gap #3 (robustness) — no re-fetch path
- Invoice gen inside the order flow is best-effort try/except (L1590-1599); if it fails/times out, the response fields would be empty. There is **no POS lookup endpoint** to retrieve the invoice later.
- The `invoices` collection stores `pos_order_id` + `user_id` + `restaurant_order_id` (indexed on `token` and `(user_id, restaurant_order_id)`); **`order_id` is NOT stored** (null on all 53 rows).
- **Optional-but-recommended:** add a POS-auth endpoint `GET /api/pos/orders/{pos_order_id}/invoice` (lookup by `user_id` + `pos_order_id`) for retries / late generation.

### 6.5 Reachability
- Link base = `REACT_APP_BACKEND_URL` or `CRM_EXTERNAL_URL` (pos.py L1594). Must be set to the externally-reachable prod URL so POS can resolve the link. (Set at runtime via backend `.env`.)

## 7. Summary — requirements to close the CR
| # | Requirement | Type | Size |
|---|---|---|---|
| R1 | Return `einvoice_link` + `einvoice_pdf_link` (+`einvoice_token`) in the `POST /api/pos/orders` response | CRM code | small (values already computed) |
| R2 | Configure S3 so invoice HTML/PDF persist (currently local-disk/ephemeral) | infra/env | config |
| R3 | (Optional) POS re-fetch endpoint `GET /api/pos/orders/{pos_order_id}/invoice` | CRM code | small-medium |
| R4 | Ensure `REACT_APP_BACKEND_URL`/`CRM_EXTERNAL_URL` set to external prod URL | env | config |
| R5 | (Optional) pre-generate PDF at order time to avoid first-hit latency | CRM code | small |

**No code written. Investigation only.**
