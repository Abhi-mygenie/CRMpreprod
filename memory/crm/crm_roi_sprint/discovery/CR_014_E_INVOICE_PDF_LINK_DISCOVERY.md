# CR-014 — E-Invoice PDF + Mobile HTML Link for `send_bill` WhatsApp — Discovery (Phase 0)

**Sprint**: ROI Measurement / CRM
**CR code**: CR-014
**Lifecycle stage**: `cr014_code_complete_live_test_parked` (2026-06-05, all 4 buckets implemented, awaiting POS repoint)
**Date**: 2026-05-28
**Owner contact**: Kunafa Mahal (R689 primary tenant for validation)
**Linked CR**: CR-004 (parent — `einvoice_link` variable already registered in P3.5; this CR populates it)

---

## 1. Problem statement

When a POS order arrives at `/api/pos/orders`, the system fires a `send_bill` WhatsApp event. The current `send_bill` template carries 5 positional variables (customer name, total, label, payment method, restaurant name) but **no link to a viewable invoice**.

This CR adds a **6th variable: `einvoice_link`** — a public URL that opens a mobile-friendly HTML view of the invoice (with PDF download). Restaurants want this because:
- Customers can see itemized billing in WhatsApp instantly (one tap)
- Compliance: serves as GST-compliant tax invoice where applicable
- Reduces dispute calls about "what was I charged for"
- Becomes a record customers can save/share

**Acceptance criteria (high-level, to be refined in planning)**:
- POS posts an order → an invoice (HTML + PDF) is generated and hosted at a public URL
- `send_bill` WhatsApp send includes that URL in `event_data.einvoice_link`
- The link opens cleanly in WhatsApp's in-app browser (Android + iOS) without horizontal scroll
- HTML view shows itemized bill with GST breakdown; PDF download button at the bottom

---

## 2. Owner-locked scope decisions (2026-05-28)

| # | Question | Owner answer |
|---|---|---|
| Q1 | Compliance scope | **Both** — render GST-compliant fields when POS payload provides them; fall back to simple receipt otherwise; **also include hotel/room billing** when `room_info` present |
| Q2 | Hosting / URL strategy | Owner deferred final call to agent recommendation; trade-off requested: local-disk-now-S3-later vs. S3-from-day-1. **See §6 below for recommendation**. |
| Q3 | Customer-facing format | **Mobile-friendly HTML web page** (instant open in WhatsApp browser) with "Download PDF" button |
| Q4 | Access control | **Anyone with the link** — URL contains a long random token, no auth, no expiry by default |
| Q5 | Branding fields | Owner will guide once agent presents the fields-gap matrix. **See §5 below**. |
| Bonus | Sync vs async generation | Deferred. **Recommendation in §6.4**. |

---

## 3. Three invoice modes (locked by Q1)

The renderer must auto-detect which mode applies per order:

### Mode A — Tax Invoice (GST-compliant)
Triggered when: restaurant has `gstin` (TBD field) populated AND order has positive tax amounts.

Required header: "TAX INVOICE"
Required fields per GST law (India, 2017):
- Invoice number (sequential per tenant per FY — **not currently tracked, NEW**)
- Invoice date + time
- Restaurant: legal name, address, GSTIN, place of supply (state)
- Customer: name, billing address optional, GSTIN optional (B2B)
- Itemized: description, HSN/SAC code, qty, rate, taxable value, CGST%/CGST₹, SGST%/SGST₹ (intra-state) OR IGST%/IGST₹ (inter-state)
- Grand total + total tax in words
- Place of supply notation

### Mode B — Simple Receipt
Triggered when: no GSTIN or GST tax is zero.

Required:
- "Receipt" header (not "Tax Invoice")
- Restaurant name + address (if available) + contact
- Order date/time
- Items: name, qty, price, line total
- Subtotal, discounts (broken out), tax (single line OK), grand total
- Payment method
- Loyalty points earned (already in event_data)

### Mode C — Hotel Folio (Room Bill)
Triggered when: `room_info` field present AND any of `room_price`/`advance_payment`/`balance_payment` > 0.

Required:
- "Hotel Folio" or "Room Bill" header
- Restaurant/hotel name + address
- Room info: room rate, advance paid, balance due
- F&B charges from `items[]` (if any)
- Order date/time
- Grand total
- (NOTE: POS only sends 3 room fields; no check-in/check-out dates, room number, nights. **See §5 for gap**.)

Modes B and C can co-exist (F&B for in-house guests). Mode A and C can co-exist if hotel has GSTIN.

---

## 4. Data flow plumbing (where we hook in)

```
POS terminal
   │
   └──► POST /api/pos/orders (POSOrderWebhook payload)
              │
              ├──► routers/pos.py:1274 pos_order_webhook()
              │      │
              │      ├──► [STEP 1-7] order processing, customer upsert, points calc...
              │      │
              │      ├──► [NEW STEP 7.5] generate_invoice(order_data, user, customer)
              │      │      │
              │      │      ├──► services/invoice_generator.py (NEW)
              │      │      │      ├── select mode (A/B/C/A+C/B+C)
              │      │      │      ├── render HTML via Jinja2 (mobile-optimised)
              │      │      │      ├── render PDF via reportlab OR weasyprint(HTML→PDF)
              │      │      │      ├── persist to storage (local disk v1 → S3 abstraction)
              │      │      │      └── return {token, html_url, pdf_url}
              │      │      │
              │      │      └── INSERT into new collection invoices
              │      │             {token, user_id, pos_order_id, customer_id,
              │      │              mode, html_path, pdf_path, generated_at}
              │      │
              │      └──► [STEP 8] trigger_whatsapp_event(send_bill, event_data={
              │             ...,
              │             "einvoice_link": html_url   ◄── NEW: populates registry var
              │          })
              │
              ▼
   Customer's WhatsApp:
   "Hi abhi, your bill is Rs.2,181 ... view invoice: {einvoice_link}"
                                                    │
                                                    ▼
                              GET /api/invoices/{token}                  (NEW route)
                                  → serves mobile HTML page
                                  → "Download PDF" button → GET /api/invoices/{token}/pdf
```

---

## 5. Fields gap matrix — what we have vs. what we need

Goal: enumerate **every field** an invoice needs (across all 3 modes), and mark each as ✅ available, ⚠️ partial, or ❌ missing.

### 5.1 RESTAURANT (header section)

| Field | Need for | Current source | Status | Notes |
|---|---|---|---|---|
| Restaurant display name | All modes | `users.restaurant_name` ("Kunafa Mahal") | ✅ | |
| Legal entity name | Mode A | — | ❌ MISSING | Different from display name (e.g. "Kunafa Mahal Pvt Ltd"). For Mode B/C, display name OK. |
| Restaurant address | All modes | `users.address` exists in schema but **empty for all 14 tenants** | ⚠️ field exists, no data | Owner-config UI needed |
| Restaurant city / state / pincode | Mode A (place of supply) | — | ❌ MISSING | State needed for GST CGST/SGST vs IGST decision |
| Restaurant phone | All modes | `users.phone` ("7307097771") + `users.brand_number` ("917666859544") | ✅ | |
| Restaurant email | All modes | `users.email` ("owner@kunafamahal.com") | ✅ | Could be too internal; consider separate `public_email` |
| Restaurant GSTIN | Mode A | — | ❌ MISSING | Triggers Mode A when populated |
| Restaurant FSSAI license # | Mode A optional, Mode B nice-to-have | — | ❌ MISSING | Required by FSSAI rules for food businesses |
| Restaurant PAN | Mode A optional | — | ❌ MISSING | Sometimes required B2B |
| Restaurant logo URL | All modes (header image) | — | ❌ MISSING | Needed for "branded" feel |
| Place of supply (state code) | Mode A | — | ❌ MISSING | Inferred from restaurant address state |

### 5.2 CUSTOMER (recipient section)

| Field | Need for | Current source | Status | Notes |
|---|---|---|---|---|
| Customer name | All | `customers.name` / `orders.cust_name` | ✅ | |
| Customer phone | All | `customers.phone` / `orders.cust_mobile` | ✅ | |
| Customer email | Optional | `orders.cust_email` (often `<phone>@mygenie.online` placeholder) | ⚠️ | Synthetic placeholder for most — skip on invoice |
| Customer billing address | Mode A B2B optional | `customers.addresses[]` | ✅ | Multi-address; pick default if needed |
| Customer GSTIN | Mode A B2B | `customers.gst_number` (11 customers already populated!) | ✅ | |
| Customer GST legal name | Mode A B2B | `customers.gst_name` | ✅ | |

### 5.3 ORDER metadata

| Field | Need for | Current source | Status | Notes |
|---|---|---|---|---|
| Invoice number (sequential) | Mode A | — | ❌ MISSING | Need new counter per `user_id` per FY (e.g. `KM/2026-27/0001`). Implement via atomic Mongo `findOneAndUpdate` on `invoice_counters` collection. |
| Order/bill number (POS-side) | Display | `orders.pos_order_id` ("869311") + `orders.restaurant_order_id` ("009571") | ✅ | Use restaurant_order_id as primary display |
| Order date/time | All | `orders.order_created_at` (IST string from POS) | ✅ | Convert to local-friendly format |
| Order type | All | `orders.order_type` ("dinein") | ✅ | dinein / takeaway / delivery |
| Table number | dine-in | `orders.table_id` | ✅ | |
| Employee/server | Display | `orders.employee_name` (often empty) | ⚠️ | Skip if empty |
| Payment method | All | `orders.payment_method` ("cash") | ✅ | |
| Payment status | All | `orders.payment_status` ("paid") | ✅ | |
| Transaction ID | Mode A | `orders.transaction_id` ("2077") | ✅ | |

### 5.4 ITEMS (line items)

| Field | Need for | Current source | Status | Notes |
|---|---|---|---|---|
| Item name | All | `items[].item_name` | ✅ | |
| Qty | All | `items[].item_qty` | ✅ | |
| Unit price | All | `items[].item_price` | ✅ | |
| Line total | All | qty * price (computed) | ✅ | |
| Item GST amount | A | `items[].gst_amount` | ✅ | |
| Item VAT amount | B (older states) | `items[].vat_amount` | ✅ | |
| GST rate (%) | A display | — | ❌ MISSING | POS sends absolute ₹ only; derive rate = gst_amount/taxable_value*100, round to nearest standard rate (5%, 12%, 18%, 28%) |
| CGST/SGST/IGST split | A | — | ❌ MISSING | Need to split `gst_amount` into halves (CGST 9%/SGST 9% for intra-state). Requires knowing place-of-supply state vs restaurant state. |
| HSN/SAC code | A | — | ❌ MISSING | Restaurants typically use SAC `996331` for restaurant service. Can default per-tenant if not configured. |
| Item category | Optional display | `items[].item_category` ("6777") | ⚠️ | Category ID, not name — would need lookup |
| Variants/Add-ons descriptive | Display | `items[].variant`, `items[].add_ons[]` | ⚠️ | Often empty in real orders; render if non-empty |
| Add-on amount | All | `items[].addon_amount` | ✅ | Add to line total |
| Variation amount | All | `items[].variation_amount` | ✅ | |
| Item discount | All | `items[].discount_amount` | ✅ | |
| Item service charge | Optional | `items[].service_charge` | ✅ | |
| Veg indicator (🟢🔴 dot) | UX nice-to-have | `items[].is_veg` | ✅ | |

### 5.5 TOTALS section

| Field | Need for | Current source | Status | Notes |
|---|---|---|---|---|
| Subtotal (before discount/tax) | All | `orders.order_sub_total` (2077.0 on test order) | ✅ | |
| Self-discount (restaurant) | All | `orders.self_discount` | ✅ | |
| Order discount | All | `orders.order_discount` | ✅ | |
| Coupon discount | All | `orders.coupon_discount` + `orders.coupon_code` + `orders.coupon_title` | ✅ | Show coupon name |
| Loyalty discount | All | `orders.loyalty_discount` + `crm_loyalty_discount` (CRM source of truth) | ✅ | |
| Wallet used | All | `orders.wallet_used` | ✅ | |
| GST tax total | A | `orders.gst_tax` | ✅ | |
| VAT total | B | `orders.vat_tax` | ✅ | |
| Service tax | All | `orders.service_tax` | ✅ | |
| Service GST | All | `orders.service_gst_tax_amount` | ✅ | |
| Total tax | All | `orders.tax_amount` (103.85 on test order) | ✅ | |
| Tip | Optional | `orders.tip_amount` + `orders.tip_tax_amount` | ✅ | |
| Delivery charge | Delivery orders | `orders.delivery_charge` | ✅ | |
| Round-up | All | `orders.round_up` (0.15 on test order) | ✅ | |
| Grand total | All | `orders.order_amount` (2181.0) | ✅ | Final amount displayed |
| Grand total in words | Mode A | — | ❌ derived | Convert via num2words or inline implementation ("Rupees Two Thousand One Hundred Eighty One Only") |

### 5.6 LOYALTY footer (post-order)

| Field | Need for | Current source | Status |
|---|---|---|---|
| Points earned this order | Display | `orders.points_earned` (152) | ✅ |
| Updated points balance | Display | event_data `points_balance` | ✅ |
| Tier (e.g. Silver) | Display | `customers.tier` | ✅ |
| Wallet balance | Display | event_data `wallet_balance` | ✅ |

### 5.7 HOTEL/ROOM section (Mode C)

| Field | Need for | Current source | Status | Notes |
|---|---|---|---|---|
| Room price | C | `orders.room_info.room_price` | ✅ | Only 1 of 14 tenants currently sends populated room_info |
| Advance payment | C | `orders.room_info.advance_payment` | ✅ | |
| Balance payment | C | `orders.room_info.balance_payment` | ✅ | |
| Room number | C | `orders.room_id` (empty on test data) | ⚠️ | Field exists, empty for R689 — depends on hotel POS |
| Check-in date | C | — | ❌ MISSING | Not in POS payload |
| Check-out date | C | — | ❌ MISSING | Not in POS payload |
| Number of nights | C | — | ❌ MISSING | Could be derived if check-in/out present |
| Room type | C | — | ❌ MISSING | Not in POS payload |
| Guest count | C | — | ❌ MISSING | Not in POS payload |

**Conclusion for Mode C**: The 3 fields we have are enough for a minimal "Room Bill" with totals only. A proper hotel folio would need POS-side changes — out of scope for v1.

---

## 6. Hosting strategy — recommendation (Q2 deferred to agent)

### 6.1 Owner's framing
> "Local disk on CRM + public FastAPI route; AWS S3; shift later to AWS will it affect or use AWS from day 1?"

### 6.2 Recommendation: **Storage abstraction layer + local disk in v1; S3 swap is a 1-line config change later**

Build a thin `InvoiceStorage` interface with two implementations:

```python
# services/invoice_storage.py (NEW)
class InvoiceStorage(Protocol):
    async def put(self, token: str, html: bytes, pdf: bytes) -> Tuple[str, str]: ...
    async def get_html(self, token: str) -> bytes: ...
    async def get_pdf(self, token: str) -> bytes: ...

class LocalDiskStorage(InvoiceStorage):
    # Writes to /app/data/invoices/{token}/(invoice.html, invoice.pdf)
    # Returns URLs: /api/invoices/{token}, /api/invoices/{token}/pdf

class S3Storage(InvoiceStorage):
    # Writes to s3://<bucket>/invoices/{token}/...
    # Returns presigned URLs OR public-read URLs based on bucket policy
```

Pick implementation from `os.environ.get("INVOICE_STORAGE", "local")`.

### 6.3 Why this is better than picking one upfront

| Concern | Local-first impact | S3-from-day-1 impact |
|---|---|---|
| Day-1 setup | Zero new infra | Requires S3 bucket creation, IAM user, access keys, region selection |
| Cost | Zero | ~$0.023/GB/mo storage + egress fees |
| Backup/durability | Tied to CRM pod (ephemeral on Kubernetes) | 11 9's durability natively |
| Future swap effort | ~1 hour: write `S3Storage` class, set env var, copy historical files | Done already |
| Risk if S3 creds wrong on day 1 | N/A | Invoice generation breaks until fixed |
| Migration path | Files copy-able to S3 in bulk later; URL pattern stays the same since FastAPI route remains the issuer | N/A |
| Production durability concern | **Real** — Kubernetes pod restart wipes local disk unless mounted persistent volume | None |

**My recommendation**: **Start with local disk in v1 BUT mount a persistent volume** (`/app/data/invoices`) so files survive pod restarts. Swap to S3 in v2 when one of these happens:
- Storage volume > 10 GB
- Owner wants cross-region durability
- Customer support reports broken links after pod migration

Swap effort: write `S3Storage` class (~50 LoC), copy existing files to S3 via `aws s3 sync`, set `INVOICE_STORAGE=s3` env var. Existing WhatsApp messages with old URLs **need to keep working** — solve by either (a) routing old `/api/invoices/{token}` requests through FastAPI which transparently redirects to S3, or (b) one-time DB update to invoice records with new URLs (but old WhatsApp messages can't be edited, so option (a) is safer).

⚠️ **Caveat about local-disk on this Emergent preview pod**: pods may have ephemeral storage. **Need to confirm with Emergent platform whether `/app/data/` survives restarts**, OR mount a PVC. If neither is available, **S3 from day 1 is forced**.

### 6.4 Sync vs async generation

**Recommendation: synchronous generation inline with order webhook.**

Reasoning:
- HTML render via Jinja2 ≈ 5-20 ms
- PDF render via reportlab ≈ 100-300 ms for a typical bill (10-20 items)
- Local disk write ≈ <5 ms
- Total added latency to `/api/pos/orders`: ~150-350 ms — acceptable for POS, which already waits for customer upsert + points calc
- Guarantees the invoice URL exists **before** the `send_bill` WhatsApp fires (which happens 1-3 lines after invoice generation in the same handler)

If latency becomes an issue in v2, can move to `asyncio.create_task` AND `await` the task before WhatsApp trigger.

---

## 7. Open architectural questions (for planning phase)

| # | Question | Default if owner doesn't say |
|---|---|---|
| OQ1 | Invoice number format per tenant (e.g. `KM/2026-27/0001` vs `R689-869311`)? | Use `<restaurant_id>-<pos_order_id>` for simplicity; switch to per-FY sequential when GSTIN is configured |
| OQ2 | Tax rate inference for items — round to nearest standard (5/12/18/28) or display exact computed rate? | Round, with footnote if mismatch >1% |
| OQ3 | Default HSN/SAC if not configured per-tenant? | `996331` (restaurant service) for items; `996311` (accommodation) for room |
| OQ4 | What happens when restaurant has NO `gstin` field? | Fall back to Mode B receipt. Hide tax-rate / CGST/SGST columns but still show item `gst_amount` as "Tax" line. |
| OQ5 | What happens when order has zero items but room_info is populated? | Render Mode C only, no items section |
| OQ6 | Customer GST B2B detection — automatic from `customers.gst_number` presence? | Yes — auto-render B2B header section if customer.gst_number is non-empty |
| OQ7 | Re-generate invoice on order update? POS sometimes sends updates with status `delivered` or modified totals. | v1: regenerate on each `/pos/orders` POST; keep latest. Old token stays valid but points to latest content. |
| OQ8 | Should the invoice link work AFTER customer's WhatsApp delivery confirmation, indefinitely? | Yes, no expiry (per Q4). Owner can change later via env var `INVOICE_LINK_EXPIRY_DAYS`. |
| OQ9 | Auditability — log which invoices were generated, viewed, and downloaded? | v1: log generation timestamp only in `invoices` collection. View/download tracking deferred to v2. |
| OQ10 | Mobile HTML page UI library choice? | Plain semantic HTML + inline CSS (no external CSS file → faster first paint in WhatsApp browser, no broken images). Single self-contained .html file per invoice. |

---

## 8. Owner-guidance asks (blocks planning)

Before we can move to planning, owner needs to decide on the **missing fields** in §5. Specifically:

### Critical (blocks Mode A entirely)
1. **Restaurant GSTIN** — where will it come from?
   - a) Add new `gstin` field to `users` collection + add a "Restaurant Tax Settings" page in CRM admin
   - b) Owner provides for R689 only, agent hardcodes for v1, generalize later
   - c) Read from a new `restaurant_branding` collection (cleaner separation)
2. **Restaurant address (street, city, state, pincode)** — same options as GSTIN. `users.address` field exists but is empty; could repurpose as street + add `city`, `state`, `pincode`.

### Important (Mode A polish)
3. **Restaurant legal entity name** — same options. Could default to `restaurant_name` for v1.
4. **FSSAI license #** — required by Indian food safety law on bills; same options.
5. **Restaurant logo** — provide via URL or upload? Hosting?
6. **PAN** — optional B2B; same options.

### Nice-to-have (skip for v1?)
7. **HSN/SAC default** — agent default `996331` OK?
8. **Invoice number sequencing format** — `KM/26-27/0001` style or simpler?

### Hotel mode (Mode C)
9. **Hotel-specific fields (check-in, check-out, nights, room number, guest count)** — out of scope for v1 (POS doesn't send), or push to POS team as separate handoff?

### Hosting (Q2)
10. **Local-disk + PVC vs S3 from day 1** — agent recommends local-with-PVC v1, S3 v2. Owner: agree?

---

## 9. Plan-phase entry criteria

Once owner answers §8 questions, planning doc gets created at:
`/app/memory/crm/crm_roi_sprint/planning/CR_014_EINVOICE_PHASE_1_PLAN.md`

That doc will lock:
- Final fields list (with all gaps filled or explicitly deferred)
- Exact file plan (which new modules, which edits to existing files)
- API contract for `/api/invoices/{token}` and `/api/invoices/{token}/pdf`
- DB schema for new `invoices` collection
- DB schema for new `invoice_counters` collection (Mode A sequential numbering)
- Storage adapter interface
- Test plan (unit tests for invoice generator, integration test for `/pos/orders` end-to-end, mobile HTML rendering test on real device)

---

## 10. Out of scope (explicitly deferred)

| Item | Reason | Future CR |
|---|---|---|
| Editing invoices after generation | Compliance: a tax invoice should not be mutable; updates issue credit notes | CR-XXX Credit Notes |
| Bulk invoice export for accounting | Restaurant-side feature, not customer-facing | CR-XXX Accounting Export |
| Email invoice (in addition to WhatsApp) | Email not part of current send-side pipeline | CR-XXX Email channel |
| Invoice analytics dashboard | Not a customer-facing need | Future analytics CR |
| Multi-language invoice | English only v1 | If/when restaurants ask |
| QR code with UPI payment link (post-paid orders) | Future enhancement once payment integration deepens | Future fintech CR |
| Customer signature / GSTR-1 auto-filing | Beyond MyGenie's scope | Out of scope permanently |
| Backfill of invoices for historical orders | Same rule as CR-004 P3.5 (no backfill per owner) | Will not do |

---

## 11. Risk register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Local disk wiped on pod restart, all generated invoices lost | Medium (unknown until tested) | High (broken links in delivered WhatsApps) | Confirm PVC availability with Emergent platform; else S3 from day 1 |
| HTML page renders poorly on iOS Safari WhatsApp browser | Medium | Medium (bad customer impression) | Test on real iPhone in QA phase; use plain semantic HTML + inline CSS |
| Tax computation incorrect for edge cases (mixed GST rates, exempt items) | Medium | High (compliance) | Comprehensive unit tests; show actual gst_amount from POS rather than re-computing from rate |
| Concurrent orders → invoice number race condition | Low | Medium (duplicate or skipped numbers) | Use Mongo `findOneAndUpdate` with `$inc` atomic counter |
| WhatsApp template variable count change required | Medium | Medium (templates may need Meta re-approval) | Confirm template var slot strategy with owner BEFORE planning (add `{{6}}` vs replace existing) |
| PDF generation latency exceeds 1s | Low | Low | Profile reportlab; cache rendered HTML; consider weasyprint as alt |
| Customer phones in WhatsApp can't display the HTML (very old devices) | Low | Low | Fall back gracefully — link still opens, just less styled |
| Restaurant doesn't have GSTIN but owner expects Mode A | High | Medium | Mode B fallback handles it; UI in CRM admin should label "Restaurant Tax Settings (optional)" so it's clear |

---

## 12. Effort estimate (rough, refined in planning)

| Component | LoC est | Effort |
|---|---|---|
| `services/invoice_generator.py` (mode detection + Jinja2 HTML + reportlab PDF) | ~400 | 1.5 days |
| `services/invoice_storage.py` (LocalDiskStorage; S3Storage stub) | ~120 | 0.5 day |
| `routers/invoices.py` (NEW — `GET /api/invoices/{token}`, `GET /api/invoices/{token}/pdf`) | ~80 | 0.5 day |
| `routers/pos.py` edit — invoke generator + inject `einvoice_link` into send_bill event_data | ~30 | 0.25 day |
| `routers/<admin>.py` — Restaurant Branding Settings CRUD endpoints | ~100 | 0.5 day |
| Frontend — "Restaurant Tax & Branding Settings" page | ~250 | 1 day |
| Jinja2 HTML template (mobile responsive, 3 mode partials) | ~300 | 1 day |
| Reportlab PDF layout (matches HTML visually) | ~200 | 1 day |
| Unit tests (mode detection, tax math, num2words) | ~200 | 0.5 day |
| Integration test end-to-end | ~150 | 0.5 day |
| Documentation (planning + impl + QA) | — | 1 day |

**Total**: roughly 8-10 dev-days for v1 (single agent). Could parallelize HTML + PDF + frontend if multiple agents.

---

## 13. Next steps

1. **Owner answers §8 questions** (especially Critical group: GSTIN source, address source, branding storage strategy).
2. **Agent confirms PVC vs ephemeral disk** with Emergent platform OR commits to S3-from-day-1.
3. **Agent writes planning doc** `CR_014_EINVOICE_PHASE_1_PLAN.md` with locked decisions.
4. **Agent implements** per planning doc (file-by-file commit pattern, same as CR-004 P3.5).
5. **QA + live test** on R689 with a real POS order.

---

## 14. Doc trail

- This file: `/app/memory/crm/crm_roi_sprint/discovery/CR_014_E_INVOICE_PDF_LINK_DISCOVERY.md` (Phase 0)
- Register update: `/app/memory/crm/crm_roi_sprint/00_register/ROI_MEASUREMENT_CR_REGISTER.md` — adds row 15 for CR-014
- Linked CRs: CR-004 (parent — provides `einvoice_link` variable slot)

**End of Phase 0 Discovery. Awaiting owner guidance on §8.**

---

## 15. Profile-page fields — appendix (owner direction 2026-05-28 evening)

Owner directive: **"add missing fields to the Profile page; logo is already stored elsewhere; address + GSTIN are the two big ones (Critical Q1 + Q2 from §8)"**.

### 15.1 Current Profile page state

| Source | Detail |
|---|---|
| Frontend file | `/app/frontend/src/pages/ProfilePage.jsx` |
| Backend endpoint | `PUT /api/auth/profile` at `backend/routers/auth.py:202` |
| Currently editable | `phone`, `address` ONLY (whitelist) |
| Currently displayed (readonly) | Business Name (`restaurant_name`), Email, POS ID (`pos_id`), POS Name (`restaurant_name` again), Phone, Address |
| Logo | **Stored elsewhere per owner** — NOT to be added to Profile page in this CR |
| `address` field state across all 14 tenants | All EMPTY ("") — safe to repurpose or replace |

### 15.2 Fields to add to Profile page — final list

Grouped by purpose. Owner has not yet locked the final scope; this is the recommended set.

#### 🟥 Group 1 — Required for GST tax invoice (Mode A trigger)

| # | UI label | DB key | Type / validation | Why |
|---|---|---|---|---|
| 1 | GSTIN | `gstin` | 15 chars, regex `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$` | Triggers Mode A renderer when populated. Example: `09ABCDE1234F1Z5`. First 2 digits = state code → auto-derive `state`. |
| 2 | Legal Business Name | `legal_name` | string, max 200 | GST law requires legal entity name (different from display name). Fallback to `restaurant_name` if blank. |
| 3 | State | `state` | dropdown, all 28 states + 8 UTs | Place-of-supply on tax invoice; determines CGST+SGST (intra) vs IGST (inter). Auto-fill from GSTIN first 2 digits. |

#### 🟧 Group 2 — Address split (replaces single-line `address`)

| # | UI label | DB key | Type | Notes |
|---|---|---|---|---|
| 4 | Address Line 1 | `address_line1` | string, max 200, **required** | Street, building, shop # — replaces current `address` |
| 5 | Address Line 2 | `address_line2` | string, max 200, optional | Area, landmark |
| 6 | City | `city` | string, max 100, **required** | |
| 7 | Pincode | `pincode` | 6 digits, regex `^[1-9][0-9]{5}$`, **required** | |
| 8 | Country | `country` | dropdown, default "India" | Can be hidden in v1 (India-only) |

#### 🟨 Group 3 — Compliance (food + tax)

| # | UI label | DB key | Type / validation | Notes |
|---|---|---|---|---|
| 9 | FSSAI License # | `fssai_license` | 14 digits, regex `^[0-9]{14}$` | Required by Indian food safety law on every bill; printed as "FSSAI Lic. No." |
| 10 | PAN | `pan` | 10 chars, regex `^[A-Z]{5}[0-9]{4}[A-Z]$`, optional | Helps B2B invoices; safe to leave blank |

#### 🟦 Group 4 — Optional polish

| # | UI label | DB key | Type | Notes |
|---|---|---|---|---|
| 11 | Public-facing Phone | `public_phone` | 10-15 chars, optional | Owner's `phone` may be personal; this is for the customer-facing invoice. Defaults to `phone` if blank. |
| 12 | Tagline | `tagline` | string, max 120, optional | One-liner under restaurant name on the invoice. e.g. "Authentic Middle Eastern Desserts since 2018" |

### 15.3 Lean v1 set (if owner wants to ship minimal)

Groups 1 + 2 (minus Country) + 3 = **9 new fields**:
```
gstin, legal_name, state,
address_line1, address_line2, city, pincode,
fssai_license, pan
```
Plus rename frontend "Address" → "Address Line 1".

### 15.4 Backend changes alongside the UI

1. **Whitelist expansion in `backend/routers/auth.py:204`**:
   ```python
   allowed = {
       "phone", "address",                                              # legacy
       "gstin", "legal_name", "state",                                  # Group 1
       "address_line1", "address_line2", "city", "pincode", "country",  # Group 2
       "fssai_license", "pan",                                          # Group 3
       "public_phone", "tagline",                                       # Group 4
   }
   ```
2. **`GET /api/auth/profile`** — confirm it exists and returns the new fields; if it doesn't, add it (`/me` endpoint can be reused).
3. **Server-side regex validation** for `gstin`, `pincode`, `fssai_license`, `pan` to prevent invalid data reaching invoice renderer.
4. **Auto-derive state from GSTIN** — when `gstin` is set and `state` is empty, parse first 2 digits and look up state code → name mapping.
5. **No DB migration needed** — MongoDB schemaless; fields appear when first saved.

### 15.5 Frontend changes (`/app/frontend/src/pages/ProfilePage.jsx`)

- Add the new field inputs grouped visually (sections: "Tax & Compliance", "Address", "Branding")
- Client-side regex validation matching server-side
- Auto-fill state dropdown from GSTIN parse on blur
- Toast confirmation on save
- `data-testid` on every new field (per testing guidelines)

### 15.6 Two open confirmations needed from owner before planning starts

| # | Question | Recommended default |
|---|---|---|
| C1 | **Address strategy**: Replace current single-line `address` with 4-field split (Line1/Line2/City/Pincode), OR keep `address` AND add structured ones in parallel? | **Replace** — cleaner, and current `address` is empty for all 14 tenants anyway |
| C2 | **Required-vs-optional**: Should the Save button **block** if GSTIN/FSSAI are blank, OR allow blank (just means tenant falls back to Mode B)? | **Allow blank** — restaurants without GST registration shouldn't be locked out of CRM |

---

## 16. CR-014 PARKED status (2026-05-28 evening)

**Status code**: `cr014_discovery_phase_0_parked_awaiting_2_final_confirmations`

### What's documented
- Problem statement + 3 invoice modes (Tax Invoice / Simple Receipt / Hotel Folio)
- Owner-locked answers: Q1 (modes), Q3 (HTML+PDF), Q4 (public link)
- Full fields gap matrix (§5) — restaurant, customer, order meta, items, totals, loyalty, hotel
- Hosting strategy recommendation (§6) — local-with-PVC v1, S3 v2, abstraction layer
- 10 open architectural questions (§7) with agent-recommended defaults
- Risk register (§11)
- Effort estimate (§12) — ~8-10 dev-days for v1
- Profile-page fields list with full schema (§15) — 10 required + 2 optional fields
- Backend whitelist expansion plan (§15.4)
- Frontend Profile page changes plan (§15.5)

### What's blocking unpark
Just **2 owner confirmations** (see §15.6 C1 + C2). Both have agent-recommended defaults that owner can confirm with one word ("agree" / "do recommendations").

### What still needs owner input separately (covered in §8)
- Storage of branding data: agent recommended directly editing `users` collection (not a separate `restaurant_branding` collection); owner has confirmed by directing to Profile page approach ✅
- Hotel-mode (Mode C) fields beyond the 3 POS sends: deferred until after v1
- Hosting: agent recommendation pending owner ack (local-with-PVC v1, S3 v2)

### When CR-014 can move to planning phase

After owner answers C1 + C2 (§15.6) + acks hosting recommendation:
1. Agent writes `/app/memory/crm/crm_roi_sprint/planning/CR_014_EINVOICE_PHASE_1_PLAN.md`
2. Locks: file plan, API contract, DB schemas, storage adapter interface, test plan
3. Owner approves planning doc
4. Implementation begins (file-by-file commits like CR-004 P3.5)

### Files touched by this discovery session

| File | Change |
|---|---|
| `/app/memory/crm/crm_roi_sprint/discovery/CR_014_E_INVOICE_PDF_LINK_DISCOVERY.md` | NEW — this file (Phase 0 doc, 16 sections, ~15 KB) |
| `/app/memory/crm/crm_roi_sprint/00_register/ROI_MEASUREMENT_CR_REGISTER.md` | Added row 15 for CR-014 |

### Resume signal for next agent

> "Resume CR-014" → read this doc end-to-end, ask owner the 2 questions in §15.6, then start planning doc.

---

**End of Phase 0 Discovery. CR-014 PARKED. Awaiting C1 + C2 (§15.6) before planning.**
