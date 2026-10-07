# CR-071 — Impact Analysis: B2B Customer Capture Pipeline

**CR ID**: CR-071  
**Date**: 2026-08-04  
**Role**: Planning Agent  
**Status**: Impact Analysis Complete  
**Risk**: CRITICAL (G1+G2: POS order hotspot) / HIGH (G3+G4) / MEDIUM (G5+G6)

---

## Code Reality Check — FULL (all 6 gaps verified with line numbers)

### Gap 1 — `POSOrderWebhook` missing B2B fields ❌ CONFIRMED

**File**: `routers/pos.py` line 1155–1187  
**Current**: `cust_mobile`, `cust_name`, `cust_email`, `user_id` only  
**Missing**: `gst_name`, `gst_number`, `customer_type`, `is_b2b`

Note: `POSCustomerCreate` (line 48) and `POSCustomerUpdate` (line 125) ALREADY have `gst_name`, `gst_number`, `customer_type` — only the order webhook is blind to B2B.

### Gap 2 — `customer_update_set` does not update B2B fields ❌ CONFIRMED

**File**: `routers/pos.py` line 1464–1478  
**Current**: Updates `total_points`, `tier`, `wallet_balance`, `total_visits`, `total_spent`, `avg_order_value`, `last_visit`, `name` (BUG-021), `email` (BUG-021)  
**Missing**: No update for `gst_name`, `gst_number`, `customer_type`, `is_b2b` from order data

Guard rules (owner-locked Q1+Q2):
- `gst_name` → update if order sends non-empty value
- `gst_number` → update if order sends non-empty value  
- `customer_type` → update to "corporate" if `gst_number` present (never downgrade)
- `is_b2b` → auto-derive: `True` if `gst_number` non-empty (never flip to `False`)

### Gap 3 — `pos/customer-lookup` response missing B2B data ❌ CONFIRMED

**File**: `routers/pos.py` line 2049–2067  
**Current response fields**: `customer_id`, `name`, `phone`, `tier`, `total_points`, `points_value`, `wallet_balance`, `total_visits`, `total_spent`, `allergies`, `favorites`, `last_visit`, `addresses`  
**Missing**: `customer_type`, `gst_name`, `gst_number`, `is_b2b`

Per Q3 decision: FLAT — add 4 fields at top level.

### Gap 4 — No `is_b2b` boolean field ❌ CONFIRMED

**Files checked**:
- `models/schemas.py`: `CustomerBase` (line 231) has `customer_type` (line 241), `gst_name` (line 278), `gst_number` (line 279) — NO `is_b2b`
- `CustomerUpdate` (line 340) has `customer_type` (line 350), `gst_name` (line 386), `gst_number` (line 387) — NO `is_b2b`
- `Customer` (line 445) has `customer_type` (line 463), `gst_name` (line 513), `gst_number` (line 514) — NO `is_b2b`
- `POSCustomerCreate` (line 48) — NO `is_b2b`
- `POSCustomerUpdate` (line 125) — NO `is_b2b`

Per Q1 decision: auto-derive `is_b2b = True` when `gst_number` is non-empty. Field must exist on schema for API responses and segment filtering.

### Gap 5 — WhatsApp variable registry missing B2B variables ❌ CONFIRMED

**File**: `core/whatsapp_variables.py` (637 LOC)  
**Current**: ~42 variables. No `customer_gst_name` or `customer_gst_number`.  
**Pattern**: Each variable is a dict with `key`, `label`, `example`, `category`, `block`, `sources`, `fills_on_events`.

### Gap 6 — Invoice generator reads `gst_number` but NOT `gst_name` ❌ CONFIRMED

**File**: `services/invoice_generator.py` line 304–306
```python
customer_gstin = ""
if customer:
    customer_gstin = customer.get("gst_number", "")
```
`gst_name` is never read or passed to template context.

**Template**: `templates/invoice_food.html` line 143–145 shows `Customer GSTIN` only:
```html
{% if show_customer_gstin and customer_gstin %}
<div ...>Customer GSTIN</div><div ...>{{ customer_gstin }}</div>
{% endif %}
```
Per Q4 decision: Add `Bill To: {gst_name}` above GSTIN line. `customer_name` becomes "Contact:" for B2B.

---

## Edit-by-Edit Implementation Plan

### E-A: Add `is_b2b` to all customer Pydantic models [Gap 4]

**File**: `models/schemas.py`  
**Risk**: HIGH (schema change — serialization impact across all routers)

| Model | Line | Change |
|---|---|---|
| `CustomerBase` | after line 279 | Add `is_b2b: Optional[bool] = None` |
| `CustomerUpdate` | after line 387 | Add `is_b2b: Optional[bool] = None` |
| `Customer` | after line 514 | Add `is_b2b: Optional[bool] = None` |
| `POSCustomerCreate` | after line 94 (gst_number) | Add `is_b2b: Optional[bool] = None` |
| `POSCustomerUpdate` | after line 181 (gst_number) | Add `is_b2b: Optional[bool] = None` |

**Verification**: All existing customer API responses will include `is_b2b: null` for existing records (backward compatible).

---

### E-B: Add B2B fields to `POSOrderWebhook` [Gap 1]

**File**: `routers/pos.py` line 1187 (after `user_id`)  
**Risk**: CRITICAL (POS API contract change)

Add:
```python
# B2B / GST Details (CR-071)
gst_name: Optional[str] = None
gst_number: Optional[str] = None
```

Note: NOT adding `customer_type` or `is_b2b` to the order webhook — per Q1, `is_b2b` is auto-derived from `gst_number`. POS just sends `gst_name` + `gst_number` on the order.

---

### E-C: Extend `customer_update_set` to update B2B fields [Gap 2]

**File**: `routers/pos.py` line 1477 (after `email` update block)  
**Risk**: CRITICAL (POS order ingestion hotspot — §6.1 business-critical flow)

Add after the existing `cust_email` block:
```python
# CR-071: B2B field pass-through from order
if order_data.gst_name:
    customer_update_set["gst_name"] = order_data.gst_name
if order_data.gst_number:
    customer_update_set["gst_number"] = order_data.gst_number
    customer_update_set["is_b2b"] = True
    customer_update_set["customer_type"] = "corporate"
```

**Guard rules** (owner-locked):
- Only update when non-empty (never blank out existing data)
- `is_b2b` and `customer_type` only set when `gst_number` is present (never downgrade)

---

### E-D: Extend `pos_customer_lookup` response [Gap 3]

**File**: `routers/pos.py` line 2052–2067 (response `data` dict)  
**Risk**: HIGH (POS API response contract change)

Add 4 fields to the response dict:
```python
"customer_type": customer.get("customer_type", "normal"),
"gst_name": customer.get("gst_name"),
"gst_number": customer.get("gst_number"),
"is_b2b": customer.get("is_b2b", False),
```

Per Q3: FLAT, at top level.

---

### E-E: Add WhatsApp variables [Gap 5]

**File**: `core/whatsapp_variables.py` (append to `VARIABLE_REGISTRY`)  
**Risk**: MEDIUM (additive, no existing logic changes)

Add 2 new variables:
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

---

### E-F: Invoice generator — read + pass `gst_name` [Gap 6]

**File**: `services/invoice_generator.py` line 304–306  
**Risk**: MEDIUM (invoice rendering — §6.7 business-critical, but additive change)

Change:
```python
customer_gstin = ""
customer_gst_name = ""
if customer:
    customer_gstin = customer.get("gst_number", "")
    customer_gst_name = customer.get("gst_name", "")
```

Add to template context dict (near line 360):
```python
"customer_gst_name": customer_gst_name,
```

---

### E-G: Invoice template — show `Bill To` for B2B [Gap 6 template]

**File**: `templates/invoice_food.html` line 132–150 (Customer section)  
**Risk**: MEDIUM (visual change on invoice)

Per Q4 decision, the Customer section becomes:
```html
<!-- Customer -->
<div class="meta">
  <h3>Customer</h3>
  <div class="meta-grid">
    {% if customer_gst_name %}
    <div><div class="lbl">Bill To</div><div class="val">{{ customer_gst_name }}</div></div>
    <div><div class="lbl">Contact</div><div class="val">{{ customer_name }}</div></div>
    {% else %}
    <div><div class="lbl">Name</div><div class="val">{{ customer_name }}</div></div>
    {% endif %}
    <div><div class="lbl">Phone</div><div class="val">{{ customer_phone }}</div></div>
    ...
  </div>
  {% if show_customer_gstin and customer_gstin %}
  <div ...>Customer GSTIN: {{ customer_gstin }}</div>
  {% endif %}
</div>
```

Same pattern for `invoice_hotel_folio.html` and `invoice_hotel_room.html` if they have customer sections.

---

## Files WILL Change

| File | Edits | Risk |
|---|---|---|
| `models/schemas.py` | E-A (add `is_b2b` to 5 models) | HIGH |
| `routers/pos.py` | E-B, E-C, E-D (webhook + update + lookup) | CRITICAL |
| `core/whatsapp_variables.py` | E-E (2 new variables) | MEDIUM |
| `services/invoice_generator.py` | E-F (read `gst_name`) | MEDIUM |
| `templates/invoice_food.html` | E-G (Bill To layout) | MEDIUM |
| `templates/invoice_hotel_folio.html` | E-G (same pattern if applicable) | MEDIUM |
| `templates/invoice_hotel_room.html` | E-G (same pattern if applicable) | MEDIUM |

## Files WILL NOT Change

`core/whatsapp.py`, `core/loyalty.py`, `core/coupon.py`, `core/campaign_jobs.py`, `core/s3.py`, `routers/campaigns.py`, `routers/auth.py`, `routers/customers.py`, `routers/whatsapp.py`, `routers/analytics.py`, `services/analytics_service.py`, frontend pages (schema change is additive — frontend already renders GST fields when `customer_type=corporate`).

---

## Verification Matrix

| # | Test | Acceptance Criteria | Edits |
|---|---|---|---|
| V1 | POS order with `gst_name`, `gst_number` → customer updated | AC-1 | E-B, E-C |
| V2 | Customer `is_b2b=True` auto-derived from `gst_number` | AC-1, AC-6 | E-C |
| V3 | Customer `customer_type` auto-set to "corporate" | AC-1 | E-C |
| V4 | POS order WITHOUT gst fields → no B2B field clobber | AC-7 | E-C |
| V5 | POS order with empty `gst_number` → `is_b2b` NOT set to True | AC-7 | E-C |
| V6 | `customer-lookup` returns `gst_name`, `gst_number`, `is_b2b`, `customer_type` | AC-2 | E-D |
| V7 | WhatsApp template `{{customer_gst_name}}` resolves | AC-3 | E-E |
| V8 | WhatsApp template `{{customer_gst_number}}` resolves | AC-4 | E-E |
| V9 | B2B invoice shows "Bill To: ABC Pvt Ltd" + GSTIN | AC-5 | E-F, E-G |
| V10 | B2C invoice unchanged (no "Bill To" line) | AC-7 | E-G |
| V11 | `is_b2b` in all customer API responses | AC-6 | E-A |
| V12 | Existing B2C customer flows — zero change | AC-7 | ALL |

## Regression Checklist

| # | Check | Why |
|---|---|---|
| R1 | POS order flow end-to-end (loyalty + coupon + WhatsApp) | E-C touches `customer_update_set` in §6.1 critical flow |
| R2 | Customer create/update API | E-A changes schema models |
| R3 | WhatsApp variable resolution for existing variables | E-E adds to registry |
| R4 | Invoice generation (food + hotel modes) | E-F, E-G changes template context + HTML |
| R5 | Campaign wizard `isFullyMapped` check | E-E adds variables |

---

## Owner Decisions Required: NONE (all Q1-Q4 locked)

## Estimated Effort: ~4-5 hours (7 edits across 7 files + QA)

---

```
Planning complete: CR-071
Stage: Impact Analysis + Implementation Plan
Code reality: FULL (all 6 gaps verified with line numbers)
Risk: CRITICAL (E-B, E-C: POS order hotspot) / HIGH (E-A, E-D) / MEDIUM (E-E, E-F, E-G)
Files WILL change: models/schemas.py, routers/pos.py, core/whatsapp_variables.py, services/invoice_generator.py, templates/invoice_food.html, templates/invoice_hotel_folio.html, templates/invoice_hotel_room.html
Files WILL NOT touch: core/whatsapp.py, core/loyalty.py, core/coupon.py, core/campaign_jobs.py, routers/campaigns.py, routers/auth.py, routers/customers.py, frontend pages
Owner decisions: NONE (all locked)
Docs: planning/CR_071_IMPACT_ANALYSIS_AND_IMPL_PLAN.md
Next: Owner approval → Implementation
```
