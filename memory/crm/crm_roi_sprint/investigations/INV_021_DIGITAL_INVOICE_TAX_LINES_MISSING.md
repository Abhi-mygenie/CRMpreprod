# INV-021 — Digital invoice does not show GST / VAT / Service Charge / GST-on-SC

**Date:** 2026-09-28 (session) · **Role:** INVESTIGATION · **Code changed:** NONE · **DB writes:** NONE
**Owner ask:** "when we send digital invoice — are we not shipping GST, VAT, SC and GST on SC? Check with The Goan Kitchen, order for 7602832329, generate a sample like `crm.mygenie.online/api/invoices/2e5f082a…`"
**Tenant:** The Goan Kitchen · `users.id = pos_owner_69_bdd4513c` · `restaurant_id = 69` · GSTIN set (`1234…213`, test value) · `bill_settings = {}` (never configured)
**Customer:** parth · phone `7602832329` · `customers.id 9c182f09-…` · 6 visits · ₹355 spent · Bronze

---

## 1. Verdict (plain English)

**Yes — the digital invoice is not shipping any tax lines, and it never has for a real order.**

The invoice code only reads three order fields for taxes: `gst_tax`, `vat_tax`, `service_tax`. The POS has **never populated them** on a real order — across all 67,306 orders in the DB, `gst_tax > 0` occurs on exactly **1** order (a May test seed), `vat_tax > 0` on **0**, `service_tax > 0` on **0**. What POS actually sends is:

| POS sends | Value on order 000224 | Does the invoice use it? |
|---|---|---|
| `tax_amount` (grand total of all taxes) | 28.00 | **No** — never read by the invoice generator |
| `items[].gst_amount` (per-item tax) | 5.00 + 22.00 | Collected into context but **not rendered** |
| `items[].vat_amount` | 0.00 (VAT item's tax arrived in `gst_amount`) | Not read |
| `service_gst_tax_amount` (GST on service charge) | 1.00 | **Yes, but mislabelled** — added into the "Service Charge" row |
| `gst_tax` / `vat_tax` / `service_tax` | 0 / 0 / 0 | Yes — and they are always 0 |
| Service charge base amount | **not sent in any field** (`items[].service_charge = 0`, `service_tax = 0`) | — |

Result on the as-built invoice for bill **000224**:

```
Item Total (2 items)   Rs.200
  Service Charge       Rs.1      ← this is actually GST-on-SC, not SC
Total                  Rs.248    ← Rs.47 unexplained to the customer
Badge: RECEIPT                   ← should be TAX INVOICE (GSTIN exists, tax > 0)
```

What the customer *should* see (reconstructed by arithmetic — SC base is inferred, not in payload):

```
Item Total                     Rs.200.00
  GST @ 5%  (gst test)         Rs.  5.00
  VAT @ 22% (vat test)         Rs. 22.00
  Service Charge @ 10%         Rs. 20.00   ← inferred: 248 − 200 − 28
  GST on Service Charge @ 5%   Rs.  1.00
Total                          Rs.248.00
```

---

## 2. Evidence

### 2.1 Order 000224 (`pos_order_id 1232851`, realtime webhook, 2026-09-28 20:55 IST)
- `order_sub_total 200.0`, `order_amount 248.0`, `tax_amount 28.0`, `service_gst_tax_amount 1.0`, `gst_tax 0.0`, `vat_tax 0.0`, `service_tax 0.0`
- items: `gst test` ₹100 `gst_amount 5.0`; `vat test` ₹100 `gst_amount 22.0 vat_amount 0.0`; both `service_charge 0.0`
- `loyalty_idempotency_key` present → came through `POST /api/pos/orders` (realtime), not migration.

Other orders for 7602832329 at this tenant: 000063 (₹107, no tax fields), 000055/56/57 (₹0 test orders).

### 2.2 DB-wide field population (read-only counts)
| Field | orders > 0 (all time, 67,306) | orders > 0 (since 2026-08-05, 979) |
|---|---|---|
| `tax_amount` | 790 | 160 |
| `gst_tax` | **1** (test seed 2026-05-28, r689) | 0 |
| `vat_tax` | 0 | 0 |
| `service_tax` | 0 | 0 |
| `service_gst_tax_amount` | — | 93 |
| `items.vat_amount` | — | 0 |
| `items.service_charge` | — | 0 |

→ 160/160 recent taxed orders have `tax_amount > 0` **and** `gst_tax = vat_tax = 0`. This is systemic, not a one-off.

### 2.3 Code trace
- `routers/pos.py:923-927` — ingestion stores `tax_amount`, `gst_tax`, `vat_tax`, `service_tax`, `service_gst_tax_amount` verbatim from payload (all optional, default 0). Items store `gst_amount`, `vat_amount`, `service_charge` (`pos.py:1024-1028`).
- `services/invoice_generator.py:231` — `gst_tax = order.gst_tax` → `is_gst_invoice = gstin and gst_tax > 0` → **False** → badge "RECEIPT".
- `:279` `vat_tax = order.vat_tax` → 0 → VAT row hidden (`invoice_food.html:205`).
- `:280` `service_tax = order.service_tax + order.service_gst_tax_amount` → 0 + 1 → rendered as **"Service Charge Rs.1"** (`invoice_food.html:208`). GST-on-SC has no row of its own.
- `:264` item `gst_amount` is put in `items[]` ctx but `invoice_food.html` never prints it.
- `tax_amount` is **not referenced anywhere** in `invoice_generator.py` or the template.
- Same pattern in hotel modes (`:471-473`).

### 2.4 Contract history
`CR_014_E_INVOICE_PDF_LINK_DISCOVERY.md §5.5` (design doc for the invoice) assumed `orders.gst_tax` / `vat_tax` / `service_tax` were populated ("✅") based on one seeded test order — the assumption was never validated against real POS traffic. `CR_015_PHASE_1_PLAN.md:238` lists all five tax fields as `float, default 0`, i.e. optional on the POS side.

### 2.5 Sample invoice
- As-built render (from live order data, CRM template, no DB write): `investigations/INV_021_assets/sample_invoice_TGK_000224_ASIS.html`
- Rendered via the real `generate_invoice_html()`; disk/S3 write redirected to the memory folder for the scratch run.

---

## 3. Root cause

**Classification: INTERACTION (POS↔CRM contract mismatch) with a CRM-side rendering gap.**

1. **POS side** — sends only the *aggregate* `tax_amount` plus per-item `gst_amount`; leaves the per-type order totals (`gst_tax`, `vat_tax`, `service_tax`) at 0; puts a VAT item's tax into `gst_amount`; **does not send the service-charge base amount at all**.
2. **CRM side** — invoice reads only the never-populated per-type fields, ignores `tax_amount` and item-level taxes, has no "GST on Service Charge" row, and folds GST-on-SC into the "Service Charge" label.

Either side alone would leave the invoice wrong; both need attention.

Confidence: **HIGH** (code + 67k-order field census + reproduced render).

---

## 4. Secondary finding — invoice pipeline appears dead on live since 2026-08-04 (P1, separate)

- `invoices` collection: 50 docs, latest `generated_at` **2026-08-04**. `cron_job_logs` also stop **2026-08-05**.
- `orders` since 2026-08-05: **979** (incl. 145 realtime for The Goan Kitchen). `points_transactions` / `coupon_usage` are current to 2026-09-28 → realtime ingestion is alive and writes to this DB.
- `create_invoice()` is called on every realtime order (`pos.py:1537-1541`) inside a `try/except` that only logs a warning → failures are silent.
- The owner's sample link `…/api/invoices/2e5f082ac2274ee897da278ecf7cf32e` returns **404 "Invoice not found"** on live; token absent from `invoices`. Consistent with generation failing before/at the DB insert.
- Zero `whatsapp_message_logs` for tenant 69 (no `send_bill` template mapped, so no bill was ever sent to 7602832329 from this tenant).
- **Cannot confirm cause from this pod** (needs live backend logs: look for `CR-014: Invoice generation failed`). Suspects: S3 `put_public_object` raising on live (CR-036 dual-write), or `/app/data/invoices` not writable on live. Also ties to GAP-11 (live build ≠ repo build).

---

## 5. Not a CRM bug (for the record)
- The ₹0 test orders (000055/56/57) and `cust_name` variations (`bola`, `Noname`) are POS test data.
- `bill_settings = {}` for this tenant just means defaults (Rs., default colours); it does not hide tax rows.
- GSTIN `123456789101213` is a 15-char placeholder, not a valid GSTIN format — UAT data.

---

## 6. Options for the owner (no decision taken)

| # | Option | Side | Effect |
|---|---|---|---|
| A | POS populates `gst_tax`, `vat_tax`, `service_tax` (SC base) and puts VAT in `vat_amount` | POS | CRM invoice starts working with **no CRM code change**; SC row becomes correct; GST-on-SC still needs its own row (see C) |
| B | CRM falls back: `gst_tax ← Σ items.gst_amount`, `vat_tax ← Σ items.vat_amount`, use `tax_amount` as reconciliation; derive SC as `order_amount − sub_total − tax_amount − tip − delivery − round_up + discounts` | CRM (`invoice_generator.py`, CRITICAL file) | Works on today's payloads; SC is inferred (fragile); VAT/GST split still wrong until POS fixes `vat_amount` |
| C | Add a dedicated "GST on Service Charge" row and stop folding it into "Service Charge"; flip badge to TAX INVOICE when `tax_amount > 0` | CRM template + generator | Needed regardless of A or B |
| D | A + C together (recommended) | both | Correct, contract-clean invoice |

Also decide: raise the **live invoice outage (§4)** as its own P1 — needs live log access.

---

## 7. Investigation output block

```text
Investigation complete: INV-021
Root cause: POS never sends per-type tax totals (gst_tax/vat_tax/service_tax) or the SC base amount; CRM invoice reads only those fields, ignores tax_amount and item-level gst_amount, and mislabels GST-on-SC as "Service Charge". Invoice therefore shows no GST/VAT/SC and prints RECEIPT instead of TAX INVOICE.
Classification: INTERACTION (POS↔CRM contract) + BE rendering gap
Confidence: HIGH
Steps used: 9/10
Evidence: this file; INV_021_assets/sample_invoice_TGK_000224_ASIS.html; DB counts §2.2
Recommendation: Owner decision on §6 (A/B/C/D) → INTAKE two items: (1) invoice tax lines, (2) live invoice generation dead since 2026-08-04. POS team brief needed for option A.
Report: crm/crm_roi_sprint/investigations/INV_021_DIGITAL_INVOICE_TAX_LINES_MISSING.md
```
