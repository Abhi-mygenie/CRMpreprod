# CR-071 — Detailed Implementation Plan: B2B Customer Capture Pipeline

**CR ID**: CR-071  
**Date**: 2026-08-04  
**Role**: Planning Agent  
**Stage**: Implementation Plan (edit-by-edit with exact line numbers)  
**Risk**: CRITICAL (E-B, E-C: POS order hotspot) / HIGH (E-A, E-D) / MEDIUM (E-E, E-F, E-G)  
**Prerequisite**: Owner approval for implementation gate

---

## Pre-Implementation Checklist

- [x] Item registered (CR-071 in CR_STATUS_DASHBOARD.md)
- [x] Intake complete (discovery/CR_071_B2B_CUSTOMER_CAPTURE_INTAKE.md)
- [x] Impact analysis complete (planning/CR_071_IMPACT_ANALYSIS_AND_IMPL_PLAN.md)
- [x] All owner decisions locked (Q1–Q4)
- [ ] Owner approval to begin implementation

---

## Edit E-A: Add `is_b2b` to Pydantic Customer Models

**File**: `models/schemas.py`  
**Risk**: HIGH  
**Code marker**: `# CR-071: B2B flag`

### E-A.1 — `CustomerBase` (line 279)

**Location**: After `gst_number: Optional[str] = None` (line 279), before `billing_address` (line 280)

**Insert**:
```python
    is_b2b: Optional[bool] = None  # CR-071: auto-derived from gst_number
```

### E-A.2 — `CustomerUpdate` (line 387)

**Location**: After `gst_number: Optional[str] = None` (line 387), before `billing_address` (line 388)

**Insert**:
```python
    is_b2b: Optional[bool] = None  # CR-071: auto-derived from gst_number
```

### E-A.3 — `Customer` (line 514)

**Location**: After `gst_number: Optional[str] = None` (line 514), before `billing_address` (line 515)

**Insert**:
```python
    is_b2b: Optional[bool] = None  # CR-071: auto-derived from gst_number
```

### E-A.4 — `POSCustomerCreate` (line 94)

**Location**: After `gst_number: Optional[str] = None` (line 94), before `billing_address` (line 95)

**Insert**:
```python
    is_b2b: Optional[bool] = None  # CR-071: auto-derived from gst_number
```

### E-A.5 — `POSCustomerUpdate` (line 181)

**Location**: After `gst_number: Optional[str] = None` (line 181), before `billing_address` (line 182)

**Insert**:
```python
    is_b2b: Optional[bool] = None  # CR-071: auto-derived from gst_number
```

**Self-test**: Backend starts without import error. `GET /api/customers` returns customers with `is_b2b: null` for existing records.

---

## Edit E-B: Add B2B Fields to `POSOrderWebhook`

**File**: `routers/pos.py`  
**Risk**: CRITICAL (POS API contract change)  
**Code marker**: `# CR-071: B2B/GST pass-through from order`

### E-B.1 — `POSOrderWebhook` model (line 1187)

**Location**: After `user_id: Optional[str] = None  # Maps to pos_customer_id` (line 1187), before the blank line before `# Amounts` (line 1189)

**Insert**:
```python
    
    # CR-071: B2B/GST pass-through from order
    gst_name: Optional[str] = None      # customer's company/business name
    gst_number: Optional[str] = None    # customer's GSTIN
```

**Note**: NOT adding `customer_type` or `is_b2b` — per Q1 decision, `is_b2b` is auto-derived from `gst_number` in E-C. POS just sends the raw GST data.

**Self-test**: `POST /api/pos/orders` with existing payload still works (new fields are Optional with None default). Then test with `gst_name` and `gst_number` in payload — no 422 validation error.

---

## Edit E-C: Extend `customer_update_set` for B2B Fields

**File**: `routers/pos.py`  
**Risk**: CRITICAL (POS order ingestion hotspot — §6.1 business-critical flow)  
**Code marker**: `# CR-071: B2B field pass-through from order`

### E-C.1 — After email update block (line 1477)

**Location**: After `customer_update_set["email"] = order_data.cust_email` (line 1477), before `customer_update_doc: Dict[str, Any] = {"$set": customer_update_set}` (line 1478)

**Current code** (lines 1473–1478):
```python
        # BUG-021: update demographic fields from order when POS sends them
        if order_data.cust_name:
            customer_update_set["name"] = order_data.cust_name
        if order_data.cust_email:
            customer_update_set["email"] = order_data.cust_email
        customer_update_doc: Dict[str, Any] = {"$set": customer_update_set}
```

**Replace with**:
```python
        # BUG-021: update demographic fields from order when POS sends them
        if order_data.cust_name:
            customer_update_set["name"] = order_data.cust_name
        if order_data.cust_email:
            customer_update_set["email"] = order_data.cust_email
        # CR-071: B2B field pass-through from order
        # Guard: only update when non-empty; never downgrade corporate→normal or is_b2b→False
        if order_data.gst_name:
            customer_update_set["gst_name"] = order_data.gst_name
        if order_data.gst_number:
            customer_update_set["gst_number"] = order_data.gst_number
            customer_update_set["is_b2b"] = True
            customer_update_set["customer_type"] = "corporate"
        customer_update_doc: Dict[str, Any] = {"$set": customer_update_set}
```

**Guard rules** (from Q1+Q2 locked decisions):
- `gst_name`: update only when order sends non-empty value
- `gst_number`: update only when order sends non-empty value
- `is_b2b`: set to `True` ONLY when `gst_number` is present (never flip to `False`)
- `customer_type`: set to `"corporate"` ONLY when `gst_number` is present (never downgrade)

**Self-test**:
1. `POST /api/pos/orders` with `gst_name="ABC Pvt Ltd"` + `gst_number="27ABCDE1234F1Z5"` → customer document shows `is_b2b: true`, `customer_type: "corporate"`, `gst_name: "ABC Pvt Ltd"`, `gst_number: "27ABCDE1234F1Z5"`
2. `POST /api/pos/orders` WITHOUT gst fields → existing B2B fields unchanged (no clobber)
3. `POST /api/pos/orders` with `gst_name=""` → no update (guard: `if order_data.gst_name`)

---

## Edit E-D: Extend `pos_customer_lookup` Response

**File**: `routers/pos.py`  
**Risk**: HIGH (POS API response contract)  
**Code marker**: `# CR-071: B2B fields in lookup response`

### E-D.1 — Response data dict (lines 2052–2067)

**Location**: Inside the `data={}` dict of the `return POSResponse(...)` at line 2049.

**Current code** (lines 2052–2067):
```python
        data={
            "registered": True,
            "customer_id": customer["id"],
            "name": customer["name"],
            "phone": customer["phone"],
            "tier": customer.get("tier", "Bronze"),
            "total_points": customer.get("total_points", 0),
            "points_value": blob["points_value"],
            "wallet_balance": customer.get("wallet_balance", 0.0),
            "total_visits": customer.get("total_visits", 0),
            "total_spent": customer.get("total_spent", 0.0),
            "allergies": customer.get("allergies", []),
            "favorites": customer.get("favorites", []),
            "last_visit": customer.get("last_visit"),
            "addresses": customer.get("addresses", [])
        }
```

**Replace with**:
```python
        data={
            "registered": True,
            "customer_id": customer["id"],
            "name": customer["name"],
            "phone": customer["phone"],
            "tier": customer.get("tier", "Bronze"),
            "total_points": customer.get("total_points", 0),
            "points_value": blob["points_value"],
            "wallet_balance": customer.get("wallet_balance", 0.0),
            "total_visits": customer.get("total_visits", 0),
            "total_spent": customer.get("total_spent", 0.0),
            "allergies": customer.get("allergies", []),
            "favorites": customer.get("favorites", []),
            "last_visit": customer.get("last_visit"),
            "addresses": customer.get("addresses", []),
            # CR-071: B2B fields in lookup response (Q3: flat, top-level)
            "customer_type": customer.get("customer_type", "normal"),
            "gst_name": customer.get("gst_name"),
            "gst_number": customer.get("gst_number"),
            "is_b2b": customer.get("is_b2b", False),
        }
```

**Self-test**: `POST /api/pos/customer-lookup` for a B2B customer → response includes `customer_type: "corporate"`, `gst_name`, `gst_number`, `is_b2b: true`. For a B2C customer → `customer_type: "normal"`, `gst_name: null`, `gst_number: null`, `is_b2b: false`.

---

## Edit E-E: Add WhatsApp Variables for B2B

**File**: `core/whatsapp_variables.py`  
**Risk**: MEDIUM (additive, no existing logic changes)  
**Code marker**: `# CR-071: B2B/GST WhatsApp variables`

### E-E.1 — Append to `WHATSAPP_VARIABLES` list (before line 617 `]`)

**Location**: After the last entry `menu_category_name` (lines 605–616), before the closing `]` at line 617.

**Insert**:
```python
    # CR-071: B2B/GST WhatsApp variables
    {
        "key": "customer_gst_name",
        "label": "Customer GST Business Name",
        "example": "ABC Pvt Ltd",
        "description": "Registered business name for B2B/corporate customers.",
        "category": "general",
        "block": "customer",
        "sources": [{"from": "customer", "field": "gst_name"}],
        "fills_on_events": ALL_EVENTS,
        "formatter": None,
    },
    {
        "key": "customer_gst_number",
        "label": "Customer GSTIN",
        "example": "27XXXXX1234Z5",
        "description": "GST identification number for B2B/corporate customers.",
        "category": "general",
        "block": "customer",
        "sources": [{"from": "customer", "field": "gst_number"}],
        "fills_on_events": ALL_EVENTS,
        "formatter": None,
    },
```

**Self-test**: `GET /api/whatsapp/variables` → response includes `customer_gst_name` and `customer_gst_number` in the variables list. Variable count increases from 42 to 44.

---

## Edit E-F: Invoice Generator — Read + Pass `gst_name`

**File**: `services/invoice_generator.py`  
**Risk**: MEDIUM (invoice rendering)  
**Code marker**: `# CR-071: read gst_name for B2B invoice`

### E-F.1 — Food invoice context (lines 304–306)

**Current code**:
```python
    customer_gstin = ""
    if customer:
        customer_gstin = customer.get("gst_number", "")
```

**Replace with**:
```python
    customer_gstin = ""
    customer_gst_name = ""  # CR-071: read gst_name for B2B invoice
    if customer:
        customer_gstin = customer.get("gst_number", "")
        customer_gst_name = customer.get("gst_name", "")
```

### E-F.2 — Food invoice template context dict (line 360)

**Current code** (line 360):
```python
        "customer_gstin": customer_gstin,
```

**Insert after line 360**:
```python
        "customer_gst_name": customer_gst_name,  # CR-071
```

### E-F.3 — Hotel common context builder `_build_common_ctx` (line 500)

**Current code** (line 500):
```python
        "customer_name": cust_name, "customer_phone": cust_phone,
```

**Replace with**:
```python
        "customer_name": cust_name, "customer_phone": cust_phone,
        "customer_gst_name": customer.get("gst_name", "") if customer else "",  # CR-071
        "customer_gstin": customer.get("gst_number", "") if customer else "",  # CR-071
```

**Self-test**: Generate a food invoice for a B2B customer → context dict includes `customer_gst_name` and `customer_gstin`.

---

## Edit E-G: Invoice Templates — Show "Bill To" for B2B

**File**: `templates/invoice_food.html`  
**Risk**: MEDIUM (visual change on invoice)  
**Code marker**: `CR-071: B2B Bill To layout`

### E-G.1 — Food invoice customer section (lines 132–150)

**Current code** (lines 132–145):
```html
  <!-- Customer -->
  <div class="meta">
    <h3>Customer</h3>
    <div class="meta-grid">
      <div><div class="lbl">Name</div><div class="val">{{ customer_name }}</div></div>
      <div><div class="lbl">Phone</div><div class="val">{{ customer_phone }}</div></div>
      {% if order_type == 'dinein' and table_id %}
      <div><div class="lbl">Table</div><div class="val">{{ table_id }}</div></div>
      {% endif %}
      <div><div class="lbl">Type</div><div class="val">{{ order_type_display }}</div></div>
    </div>
    {% if show_customer_gstin and customer_gstin %}
    <div style="margin-top:6px"><div class="lbl">Customer GSTIN</div><div class="val">{{ customer_gstin }}</div></div>
    {% endif %}
```

**Replace with**:
```html
  <!-- Customer — CR-071: B2B Bill To layout -->
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
      {% if order_type == 'dinein' and table_id %}
      <div><div class="lbl">Table</div><div class="val">{{ table_id }}</div></div>
      {% endif %}
      <div><div class="lbl">Type</div><div class="val">{{ order_type_display }}</div></div>
    </div>
    {% if show_customer_gstin and customer_gstin %}
    <div style="margin-top:6px"><div class="lbl">Customer GSTIN</div><div class="val">{{ customer_gstin }}</div></div>
    {% endif %}
```

### E-G.2 — Hotel room invoice guest section (lines 130–142 of `invoice_hotel_room.html`)

**Current code** (line 134):
```html
      <div><div class="lbl">Guest</div><div class="val">{{ customer_name }}</div></div>
```

**Replace with**:
```html
      {% if customer_gst_name %}
      <div><div class="lbl">Bill To</div><div class="val">{{ customer_gst_name }}</div></div>
      <div><div class="lbl">Guest</div><div class="val">{{ customer_name }}</div></div>
      {% else %}
      <div><div class="lbl">Guest</div><div class="val">{{ customer_name }}</div></div>
      {% endif %}
```

And add GSTIN after the meta-grid closing `</div>` (before line 142 `</div>`):
```html
    {% if customer_gstin %}
    <div style="margin-top:6px"><div class="lbl">GSTIN</div><div class="val">{{ customer_gstin }}</div></div>
    {% endif %}
```

### E-G.3 — Hotel folio invoice guest section (lines 126–135 of `invoice_hotel_folio.html`)

Same pattern as E-G.2. Replace line 130:
```html
      <div><div class="lbl">Guest</div><div class="val">{{ customer_name }}</div></div>
```

With:
```html
      {% if customer_gst_name %}
      <div><div class="lbl">Bill To</div><div class="val">{{ customer_gst_name }}</div></div>
      <div><div class="lbl">Guest</div><div class="val">{{ customer_name }}</div></div>
      {% else %}
      <div><div class="lbl">Guest</div><div class="val">{{ customer_name }}</div></div>
      {% endif %}
```

And add GSTIN after the meta-grid:
```html
    {% if customer_gstin %}
    <div style="margin-top:6px"><div class="lbl">GSTIN</div><div class="val">{{ customer_gstin }}</div></div>
    {% endif %}
```

**Self-test**:
1. Generate food invoice for B2B customer → shows "Bill To: ABC Pvt Ltd", "Contact: Rahul Kumar", "Customer GSTIN: 27ABCDE1234F1Z5"
2. Generate food invoice for B2C customer → shows "Name: Rahul Kumar" (no Bill To line)
3. Generate hotel invoice for B2B customer → shows "Bill To" + "Guest" + "GSTIN"

---

## Implementation Sequence

| Order | Edit | File | Risk | Est. time |
|---|---|---|---|---|
| 1 | **E-A** (5 sub-edits) | `models/schemas.py` | HIGH | 10 min |
| 2 | **E-B** | `routers/pos.py` (webhook model) | CRITICAL | 5 min |
| 3 | **E-C** | `routers/pos.py` (update_set) | CRITICAL | 10 min |
| 4 | **E-D** | `routers/pos.py` (lookup response) | HIGH | 5 min |
| 5 | **E-E** | `core/whatsapp_variables.py` | MEDIUM | 10 min |
| 6 | **E-F** (3 sub-edits) | `services/invoice_generator.py` | MEDIUM | 15 min |
| 7 | **E-G** (3 sub-edits) | 3 invoice templates | MEDIUM | 20 min |
| — | Self-test + compile | — | — | 30 min |
| **Total** | | | | **~1.5 hrs** |

---

## Verification Matrix

| # | Test | AC | Edits | Method |
|---|---|---|---|---|
| V1 | POS order with `gst_name` + `gst_number` → customer updated | AC-1 | E-B, E-C | curl |
| V2 | Customer `is_b2b=True` auto-derived | AC-1, AC-6 | E-C | DB check |
| V3 | Customer `customer_type="corporate"` auto-set | AC-1 | E-C | DB check |
| V4 | POS order WITHOUT gst → no B2B clobber | AC-7 | E-C | curl |
| V5 | POS order with empty `gst_number` → `is_b2b` NOT set | AC-7 | E-C | curl |
| V6 | `customer-lookup` returns 4 B2B fields | AC-2 | E-D | curl |
| V7 | WhatsApp `{{customer_gst_name}}` resolves | AC-3 | E-E | API check |
| V8 | WhatsApp `{{customer_gst_number}}` resolves | AC-4 | E-E | API check |
| V9 | B2B food invoice: "Bill To" + GSTIN | AC-5 | E-F, E-G | visual |
| V10 | B2C food invoice: "Name" (no "Bill To") | AC-7 | E-G | visual |
| V11 | B2B hotel invoice: "Bill To" + "Guest" + GSTIN | AC-5 | E-F, E-G | visual |
| V12 | `is_b2b` in all customer API responses | AC-6 | E-A | curl |
| V13 | Existing B2C customer flows — zero regression | AC-7 | ALL | curl |

---

## Regression Checklist

| # | Check | Why | Method |
|---|---|---|---|
| R1 | Full POS order flow (loyalty + coupon + WA trigger) | E-C touches §6.1 critical path | curl POST + DB verify |
| R2 | Customer CRUD (create, update, list, detail) | E-A schema change | curl |
| R3 | WhatsApp variable resolution (existing 42 vars) | E-E adds to registry | curl GET /api/whatsapp/variables |
| R4 | Food invoice generation | E-F, E-G | curl GET /api/invoices/{token} |
| R5 | Hotel invoice generation | E-F.3, E-G.2, E-G.3 | curl GET /api/invoices/{token} |
| R6 | Campaign wizard `isFullyMapped` | E-E adds new vars | frontend screenshot |

---

## Files WILL Change

| File | Edits |
|---|---|
| `models/schemas.py` | E-A (5 insertions) |
| `routers/pos.py` | E-B, E-C, E-D |
| `core/whatsapp_variables.py` | E-E |
| `services/invoice_generator.py` | E-F (3 sub-edits) |
| `templates/invoice_food.html` | E-G.1 |
| `templates/invoice_hotel_room.html` | E-G.2 |
| `templates/invoice_hotel_folio.html` | E-G.3 |

## Files WILL NOT Change

`core/whatsapp.py`, `core/loyalty.py`, `core/coupon.py`, `core/campaign_jobs.py`, `core/s3.py`, `routers/campaigns.py`, `routers/auth.py`, `routers/customers.py`, `routers/whatsapp.py`, `routers/analytics.py`, `services/analytics_service.py`, `server.py`, all frontend pages.

---

```
Planning complete: CR-071
Stage: Implementation Plan (detailed, edit-by-edit)
Code reality: FULL (all line numbers verified against current code)
Risk: CRITICAL (E-B, E-C) / HIGH (E-A, E-D) / MEDIUM (E-E, E-F, E-G)
Files WILL change: models/schemas.py, routers/pos.py, core/whatsapp_variables.py, services/invoice_generator.py, templates/invoice_food.html, templates/invoice_hotel_room.html, templates/invoice_hotel_folio.html
Files WILL NOT touch: core/whatsapp.py, core/loyalty.py, core/coupon.py, routers/campaigns.py, routers/auth.py, routers/customers.py, server.py, frontend pages
Owner decisions: ALL LOCKED (Q1–Q4)
Docs: planning/CR_071_DETAILED_IMPLEMENTATION_PLAN.md
Next: Owner approval → Implementation Agent
```
