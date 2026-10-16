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

**No code written. Investigation only.**
