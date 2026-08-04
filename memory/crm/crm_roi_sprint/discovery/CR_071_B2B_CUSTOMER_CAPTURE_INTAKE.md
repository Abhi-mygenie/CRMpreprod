# CR-071 — B2B Customer Capture: GST Name, GST Number, is_b2b Flag — Full Pipeline

**CR ID**: CR-071  
**Reported**: 2026-08-04  
**Reporter**: Owner (Abhishek)  
**Role**: Intake Agent  
**Source investigation**: INV-014  
**Status**: 🔵 ALL DECISIONS LOCKED — Ready for Planning  

---

## Owner Report

> "We have provision in POS to capture B2B customer details in which GST customer name
> and GST Number is captured — which is missing in CRM. We are not capturing user as
> B2C or B2B customer. Ideally we should have a key if he is a B2B customer also and
> capture these variables. In POS API also this should be passed."

---

## Owner Decisions — ALL LOCKED (2026-08-04)

| Q | Decision | Source |
|---|---|---|
| **Q1 — `is_b2b` auto-derive** | Auto-set `is_b2b=True` when `gst_number` is non-empty. No explicit flag needed from POS. | "is_b2b automatically set to True - if gst number is there" |
| **Q2 — customer_type sync + invoice** | `is_b2b=True` → `customer_type` auto-updates to `"corporate"`. Invoice addressed to `gst_name` (business). `name` = contact person. Both shown on invoice. | "yes it will be B2B invoice, gst customer name will be business name, invoice will be on business name" |
| **Q3 — POS lookup response shape** | **Flat**: `gst_name`, `gst_number`, `is_b2b` at top level — consistent with all other customer fields. | "Flat ok" |
| **Q4 — Invoice layout** | `gst_name` appears as `Bill To: ABC Pvt Ltd`. GSTIN below. `name` appears as `Contact:` line. | "appear as 'Bill To: ABC Pvt Ltd'" |

---

## Invoice Structure (locked)

```
┌──────────────────────────────────┐
│  [Restaurant Name]               │
│  Invoice #KM/012535              │
│                                  │
│  Bill To: ABC Pvt Ltd            │  ← gst_name
│  GSTIN: 27ABCDE1234F1Z5          │  ← gst_number
│  Contact: Rahul Kumar            │  ← customer.name
│  Phone: 9999999999               │
└──────────────────────────────────┘
```

---

## Classification

| Field | Value |
|---|---|
| **Type** | CR — Feature gap (partial infrastructure exists; pipeline is incomplete) |
| **Severity** | P1 — B2B restaurant customers require GST invoicing; without this, every B2B bill is manually corrected |
| **Risk** | CRITICAL (G1/G2: POS API contract change + POS order ingestion hotspot) + HIGH (G3–G6) |
| **Duplicate check** | DISTINCT |
| **Blast radius** | LARGE — affects POS API contract, customer schema, WhatsApp variables, invoice generator |

---

## What Already Exists (Partial Infrastructure)

| Surface | What's there | Status |
|---|---|---|
| `customers` DB schema | `gst_name`, `gst_number`, `billing_address`, `customer_type: "normal"/"corporate"` | ✅ Exists |
| `POSCustomerCreate` | Accepts `gst_name`, `gst_number`, `customer_type` on creation | ✅ Works |
| `POSCustomerUpdate` | Accepts all fields via dedicated `PUT /api/pos/customers/{id}` | ✅ Works |
| CRM edit modal | Shows GST fields when `customer_type = "corporate"` | ✅ Works |
| Invoice generator | Reads `gst_number` from customer → `customer_gstin` | ✅ Partial |
| Migration sync | Maps `gst_name`, `gst_number` from MyGenie API | ✅ Works |

**Key insight**: The schema and dedicated update endpoints exist. The gap is in the **order flow** (pass-through on every real order), the **lookup response** (POS can't see B2B status), and the **WhatsApp + invoice surfaces**.

---

## 6 Confirmed Gaps (from INV-014)

### Gap 1 — `POSOrderWebhook` has no B2B/GST fields ❌ [CRITICAL]

**File**: `routers/pos.py` — `POSOrderWebhook` model (line 1155)

```python
# Customer Info — current
cust_mobile: str
cust_name: Optional[str] = None
cust_email: Optional[str] = None
user_id: Optional[str] = None

# MISSING:
# gst_name: Optional[str] = None      ← customer's company/business name
# gst_number: Optional[str] = None    ← customer's GSTIN
# customer_type: Optional[str] = None ← "normal" / "corporate"
# is_b2b: Optional[bool] = None       ← explicit B2B flag
```

POS cannot pass B2B details through the real-time order webhook. Only the dedicated customer-create/update endpoints support it today.

---

### Gap 2 — `customer_update_set` does not update B2B fields ❌ [CRITICAL]

**File**: `routers/pos.py` line 1464

Even if Gap 1 is fixed, `customer_update_set` only updates loyalty/behavioural fields. It must be extended to conditionally update `customer_type`, `gst_name`, `gst_number`, `is_b2b` when the order carries them.

Guard rules:
- `gst_name` → update if order sends non-empty value
- `gst_number` → update if order sends non-empty value
- `customer_type` → update to "corporate" if order sends "corporate" (never downgrade from "corporate" to "normal" via an order)
- `is_b2b` → update to `True` if order sends `True` (never flip to `False` via an order)

---

### Gap 3 — `pos/customer-lookup` response missing B2B/GST data ❌ [HIGH]

**File**: `routers/pos.py` — `pos_customer_lookup()` (line 2020)

Current response:
```
{ name, phone, tier, total_points, wallet_balance, total_visits,
  total_spent, allergies, favorites, addresses }
```

Missing:
```
customer_type, gst_name, gst_number, is_b2b
```

**Impact**: POS billing screen cannot show B2B badge or pre-fill GST fields for the invoice. Cashier must re-type every time.

---

### Gap 4 — No explicit `is_b2b` boolean field ❌ [HIGH]

**Files**: `routers/pos.py`, `models/schemas.py` (CustomerBase, CustomerUpdate, Customer, POSCustomerCreate, POSCustomerUpdate)

`customer_type: "normal" / "corporate"` exists but owner wants an explicit `is_b2b: bool` field. This makes API consumers cleaner and enables segment filters without string matching.

New field: `is_b2b: Optional[bool] = None` — defaults to `None` (unknown) at migration/creation, set to `True` explicitly for B2B.

Auto-derive rule: if `gst_number` is non-empty → `is_b2b = True` (can be set conditionally on update).

---

### Gap 5 — WhatsApp variable registry missing B2B/GST variables ❌ [MEDIUM]

**File**: `core/whatsapp_variables.py`

Current 42 variables have no `gst_name`, `gst_number`, or `is_b2b` entry.

Two new variables needed:

```python
{
    "key": "customer_gst_name",
    "label": "Customer GST Business Name",
    "example": "ABC Pvt Ltd",
    "category": "general",
    "block": "customer",
    "sources": [{"from": "customer", "field": "gst_name"}],
    "fills_on_events": ALL_EVENTS,
},
{
    "key": "customer_gst_number",
    "label": "Customer GSTIN",
    "example": "27XXXXX1234Z5",
    "category": "general",
    "block": "customer",
    "sources": [{"from": "customer", "field": "gst_number"}],
    "fills_on_events": ALL_EVENTS,
},
```

**Impact**: B2B invoice WhatsApp message can then say:
> "Your GST invoice for **ABC Pvt Ltd** (GSTIN: **27XXXXX**) is ready."

---

### Gap 6 — Invoice generator uses `gst_number` but NOT `gst_name` ❌ [MEDIUM]

**File**: `services/invoice_generator.py` line 304–306

```python
customer_gstin = ""
if customer:
    customer_gstin = customer.get("gst_number", "")
```

`gst_name` (the registered business name) is never read. A valid GST invoice must show both the GSTIN and the registered business name.

Change: Also read `customer.get("gst_name", "")` and pass it to the invoice template context.

---

## Affected Files Summary

| File | Gaps | Change needed |
|---|---|---|
| `routers/pos.py` | G1, G2, G3 | Add B2B fields to `POSOrderWebhook`; extend `customer_update_set`; extend `customer-lookup` response |
| `models/schemas.py` | G4 | Add `is_b2b: Optional[bool] = None` to CustomerBase, CustomerUpdate, Customer, POSCustomerCreate, POSCustomerUpdate |
| `core/whatsapp_variables.py` | G5 | Add 2 new variables: `customer_gst_name`, `customer_gst_number` |
| `services/invoice_generator.py` | G6 | Read + pass `gst_name` to invoice template context |

## Files NOT changing

`core/whatsapp.py`, `core/loyalty.py`, `core/coupon.py`, `core/campaign_jobs.py`, `routers/campaigns.py`, `routers/auth.py`, frontend pages (except minor label update if owner requests).

---

## Owner Questions — ALL ANSWERED AND LOCKED

| # | Question | Answer | Locked |
|---|---|---|---|
| Q1 | `is_b2b` auto-derive vs explicit? | **Auto-derive**: if `gst_number` non-empty → `is_b2b=True` | ✅ |
| Q2 | Sync `is_b2b` + `customer_type`? | **Yes**: `is_b2b=True` → `customer_type="corporate"`. Invoice on business name. | ✅ |
| Q3 | Flat vs nested in lookup response? | **Flat**: `gst_name`, `gst_number`, `is_b2b` at top level | ✅ |
| Q4 | Invoice layout? | `Bill To: {gst_name}` + `GSTIN: {gst_number}` + `Contact: {name}` | ✅ |

---

## Acceptance Criteria (after Q1-Q4 answered)

| # | Criterion |
|---|---|
| AC-1 | POS order with `gst_name="ABC Pvt Ltd"`, `gst_number="27XXXXX"` → CRM customer updated with both fields |
| AC-2 | `POST /api/pos/customer-lookup` response includes `customer_type`, `gst_name`, `gst_number`, `is_b2b` |
| AC-3 | WhatsApp template with `{{customer_gst_name}}` resolves to customer's `gst_name` |
| AC-4 | WhatsApp template with `{{customer_gst_number}}` resolves to customer's `gst_number` |
| AC-5 | Invoice HTML shows both GSTIN and registered business name for B2B customers |
| AC-6 | `is_b2b` field present on all customer API responses |
| AC-7 | Existing B2C customer flows — zero change |

---

```
Intake complete: CR-071
Classification: CR (feature gap — partial infrastructure exists)
Severity: P1
Risk: CRITICAL (G1+G2) / HIGH (G3+G4) / MEDIUM (G5+G6)
Duplicate check: DISTINCT
Evidence: captured (INV-014 — 6 gap traces with code line numbers)
Blast radius: LARGE (POS API contract + schema + WhatsApp + invoice)
Owner decisions needed: Q1–Q4 before planning can begin
Docs: discovery/CR_071_B2B_CUSTOMER_CAPTURE_INTAKE.md
Next: Owner answers Q1-Q4 → Planning Agent
```
