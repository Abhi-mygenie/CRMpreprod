# CRM → POS Brief — Tax fields on `POST /api/pos/orders`

**From:** CRM team · **To:** POS team · **Date:** 2026-09-28
**Ref:** INV-021 · **Worked example:** Restaurant 69 (The Goan Kitchen), bill **000224**, POS order id `1232851`, 28 Sep 2026 20:55 IST
**CRM code changes required for this brief:** none. All keys below already exist on the CRM side and are stored as-is.

---

## 1. Why you are receiving this

CRM's digital invoice (WhatsApp e-bill) prints GST, VAT and Service Charge from the **per-type** tax keys in the order payload. Today POS fills only the aggregate `tax_amount` and leaves the per-type keys at `0`. Result: the customer's invoice shows an item total, a wrong "Service Charge Rs.1" line and a grand total — with the actual tax (Rs.47 on the example bill) invisible.

Field census across all 67,306 orders in the shared DB:

| Key | Orders with value > 0 |
|---|---|
| `tax_amount` | 790 |
| `service_gst_tax_amount` | many (93 since Aug 2026) |
| `gst_tax` | **1** (a May test order) |
| `vat_tax` | **0** |
| `service_tax` | **0** |
| `items[].vat_amount` | **0** |
| `items[].service_charge` | **0** |

The keys are already in your payload — they just carry zeros.

---

## 2. Key contract — order level

| Key | Type | Meaning (locked) | Rule |
|---|---|---|---|
| `order_sub_total_amount` | float | Σ (item_price × item_qty) + variations + add-ons, **before** any discount, tax or charge | as today |
| `gst_tax` | float | **Σ GST on items** (CGST + SGST together). Excludes GST on service charge. | must be > 0 when any item carries GST |
| `vat_tax` | float | **Σ VAT on items** (liquor / VAT-slab items) | must be > 0 when any item carries VAT |
| `service_tax` | float | **Service-charge base amount** (the SC itself, e.g. 10% of subtotal). *Name is historical — this key is the charge, not a tax.* | must be > 0 when SC is applied |
| `service_gst_tax_amount` | float | GST charged **on** the service charge | already correct today |
| `tax_amount` | float | **Σ of all taxes** = `gst_tax + vat_tax + service_gst_tax_amount` (+ `tip_tax_amount` if any). Does **not** include `service_tax`. | reconciliation field |
| `tip_amount`, `tip_tax_amount`, `delivery_charge`, `round_up` | float | unchanged | as today |
| `order_amount` | float | grand total paid | as today |

**Reconciliation identity CRM will check (warning-only, never rejects):**

```
order_amount == order_sub_total_amount
              − order_discount − self_discount − coupon_discount − loyalty_discount − wallet_used
              + gst_tax + vat_tax
              + service_tax + service_gst_tax_amount
              + tip_amount + tip_tax_amount + delivery_charge + round_up
```

and `tax_amount == gst_tax + vat_tax + service_gst_tax_amount + tip_tax_amount`.

## 3. Key contract — item level (`items[]`)

| Key | Type | Meaning (locked) | Rule |
|---|---|---|---|
| `item_price` | float | unit price before tax | as today |
| `item_qty` | int | quantity | as today |
| `gst_amount` | float | GST on this line (qty-inclusive) | **only** for GST items; `0` for VAT items |
| `vat_amount` | float | VAT on this line (qty-inclusive) | **only** for VAT items; `0` for GST items |
| `tax_type` | string | `"GST"` or `"VAT"` — which slab this item belongs to | send on every item |
| `tax` | float | rate in % for this item (e.g. `5`, `18`, `22`) | send on every item; lets the invoice print the correct % |
| `service_charge` | float | SC share for this line **or** `0` if SC is sent only at order level | optional |

Σ `items[].gst_amount` must equal order `gst_tax`; Σ `items[].vat_amount` must equal order `vat_tax`.

---

## 4. Worked example — bill 000224 (restaurant 69)

Bill composition from POS: two items of Rs.100 — one on 5% GST, one on 22% VAT — plus 10% service charge with 5% GST on the SC. Customer paid **Rs.248**.

### 4a. What POS sent (actual, 28 Sep 2026)

```json
{
  "restaurant_id": "69",
  "order_id": "1232851",
  "restaurant_order_id": "000224",
  "cust_mobile": "76XXXXX329",
  "cust_name": "parth",
  "order_amount": 248.0,
  "order_sub_total_amount": 200.0,
  "order_discount": 0.0, "self_discount": 0.0, "coupon_discount": 0.0,
  "loyalty_discount": 0.0, "wallet_used": 0.0,

  "tax_amount": 28.0,
  "gst_tax": 0.0,
  "vat_tax": 0.0,
  "service_tax": 0.0,
  "service_gst_tax_amount": 1.0,

  "tip_amount": 0.0, "tip_tax_amount": 0.0, "delivery_charge": 0.0, "round_up": 0.0,
  "payment_method": "cash", "payment_status": "paid", "order_type": "dinein",
  "table_id": "8529", "waiter_id": "5115",
  "order_created_at": "2026-09-28T20:55:34+05:30",
  "items": [
    { "item_name": "gst test", "pos_food_id": "226002", "item_qty": 1, "item_price": 100.0,
      "gst_amount": 5.0,  "vat_amount": 0.0, "service_charge": 0.0 },
    { "item_name": "vat test", "pos_food_id": "225844", "item_qty": 1, "item_price": 100.0,
      "gst_amount": 22.0, "vat_amount": 0.0, "service_charge": 0.0 }
  ]
}
```

Problems in this payload:
1. `gst_tax`, `vat_tax`, `service_tax` are `0` although `tax_amount` is 28 and SC was charged.
2. `200 + 28 = 228 ≠ 248` — the Rs.20 service charge is not present in any key.
3. Item "vat test" carries its 22% VAT in `gst_amount` instead of `vat_amount`.

### 4b. What POS should send (same bill, same keys)

```json
{
  "restaurant_id": "69",
  "order_id": "1232851",
  "restaurant_order_id": "000224",
  "cust_mobile": "76XXXXX329",
  "cust_name": "parth",
  "order_amount": 248.0,
  "order_sub_total_amount": 200.0,
  "order_discount": 0.0, "self_discount": 0.0, "coupon_discount": 0.0,
  "loyalty_discount": 0.0, "wallet_used": 0.0,

  "tax_amount": 28.0,
  "gst_tax": 5.0,
  "vat_tax": 22.0,
  "service_tax": 20.0,
  "service_gst_tax_amount": 1.0,

  "tip_amount": 0.0, "tip_tax_amount": 0.0, "delivery_charge": 0.0, "round_up": 0.0,
  "payment_method": "cash", "payment_status": "paid", "order_type": "dinein",
  "table_id": "8529", "waiter_id": "5115",
  "order_created_at": "2026-09-28T20:55:34+05:30",
  "items": [
    { "item_name": "gst test", "pos_food_id": "226002", "item_qty": 1, "item_price": 100.0,
      "tax_type": "GST", "tax": 5,
      "gst_amount": 5.0,  "vat_amount": 0.0,  "service_charge": 0.0 },
    { "item_name": "vat test", "pos_food_id": "225844", "item_qty": 1, "item_price": 100.0,
      "tax_type": "VAT", "tax": 22,
      "gst_amount": 0.0,  "vat_amount": 22.0, "service_charge": 0.0 }
  ]
}
```

Reconciliation: `200 + 5 + 22 + 20 + 1 = 248` ✓ · `tax_amount 28 = 5 + 22 + 1` ✓ · Σ item `gst_amount` 5 = `gst_tax` ✓ · Σ item `vat_amount` 22 = `vat_tax` ✓

### 4c. Diff — only these values change

| Key | Today | Required |
|---|---|---|
| `gst_tax` | 0.0 | **5.0** |
| `vat_tax` | 0.0 | **22.0** |
| `service_tax` | 0.0 | **20.0** |
| `items[1].gst_amount` | 22.0 | **0.0** |
| `items[1].vat_amount` | 0.0 | **22.0** |
| `items[*].tax_type` | absent | `"GST"` / `"VAT"` |
| `items[*].tax` | absent | `5` / `22` |

Everything else stays exactly as it is. No new keys at order level.

---

## 5. What the customer will see once POS ships this (CRM unchanged)

```
TAX INVOICE
Item Total (2 items)      Rs.200.00
  CGST                    Rs.  2.50
  SGST                    Rs.  2.50
  VAT                     Rs. 22.00
  Service Charge          Rs. 21.00   ← SC + GST-on-SC on one line for now
Total                     Rs.248.00
```

Amounts and total correct. The separate "GST on Service Charge" line and exact CGST/SGST % labels are a **CRM-side follow-up (later, out of scope here)** — POS does not need to do anything for those beyond sending the item `tax` rate.

---

## 6. Rules that will not change

- CRM never rejects an order over tax fields. Mismatches produce a CRM-side warning log only; loyalty, wallet and coupons keep working as today.
- Orders with `tax_amount = 0` and all per-type keys `0` are valid (tax-free bill).
- Key names stay as they are. `service_tax` keeps its name for backward compatibility even though it carries the SC base amount.

## 7. Acceptance check (POS UAT)

1. Re-post a bill like 000224 to CRM UAT (`restaurant_id 69`) with §4b values.
2. CRM reads back `orders` doc: `gst_tax 5, vat_tax 22, service_tax 20, service_gst_tax_amount 1, tax_amount 28`, item 2 `vat_amount 22, gst_amount 0`.
3. Reconciliation identity in §2 holds to the paisa.
4. Repeat with (a) a GST-only bill, (b) a VAT-only bill, (c) a bill with a discount + SC, (d) a bill with tip + round-off.

## 8. Contacts / references

- Field definitions on CRM side: `POSOrder` / `POSOrderItem` models in `routers/pos.py`
- Previous contract sample (superseded for tax fields by this brief): `Old API doc/POS_API.md §5.1`
- Investigation: `crm/crm_roi_sprint/investigations/INV_021_DIGITAL_INVOICE_TAX_LINES_MISSING.md`
