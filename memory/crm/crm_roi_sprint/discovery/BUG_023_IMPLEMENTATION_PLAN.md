# BUG-023 — Impact Analysis + Implementation Plan

**CR ID**: BUG-023  
**Role**: Planning Agent  
**Date**: 2026-08-04  
**Prerequisite**: Intake complete — `discovery/BUG_023_WEASYPRINT_EMPTY_EINVOICE_TOKEN_INTAKE.md`  
**Risk**: HIGH — `services/invoice_generator.py` is CR-014 hotspot  
**Estimated effort**: ~15 min, 2 files, 2 edits

---

## Impact Analysis

### Problem statement

`create_invoice()` executes in this order:

```
Line 782: token = result["token"]          ← token created in memory
Line 786: pdf_path = generate_invoice_pdf()  ← FAILS (weasyprint missing) → exception
Line 804: await db.invoices.insert_one()    ← NEVER REACHED
Line 806: return {"token": token, ...}      ← NEVER REACHED
```

The caller (`pos.py`) catches ALL exceptions silently → `einvoice_token = ""`.

### Two independent gaps

| Gap | Cause | Fix |
|---|---|---|
| **G1** | `weasyprint` absent from `requirements.txt` | Add `weasyprint==69.0` to requirements.txt |
| **G2** | PDF generated BEFORE DB insert — any PDF failure loses the token | Move PDF generation AFTER `insert_one`, wrap in try/except |

G1 is the **primary** cause in production. G2 is structural hardening — prevents the same class of failure from any future PDF issue (OOM, S3 timeout, etc.).

### Affected surfaces

| Surface | Impact |
|---|---|
| `POST /api/pos/orders` | `einvoice_token` empty → WhatsApp button has no token |
| `POST /api/pos/webhook` (Freshmarketer) | Same — shares `create_invoice` call |
| `GET /api/invoices/{token}/pdf` | PDF may not exist if generation failed — fallback to on-the-fly generation already coded |
| All other invoice callers | Zero change — same token/URL return contract |

### Files WILL change

| File | Edit |
|---|---|
| `requirements.txt` | Add `weasyprint==69.0` (1 line) |
| `services/invoice_generator.py` | Reorder: DB insert BEFORE PDF, wrap PDF in try/except |

### Files WILL NOT change

`routers/pos.py`, `routers/invoices.py`, `routers/whatsapp.py`, `core/whatsapp.py`, all frontend files, all other backend files.

---

## Implementation Plan

### Edit A — `requirements.txt`: Add weasyprint

**Location**: After line 103 (`reportlab==5.0.0`)

**Before**:
```
reportlab==5.0.0
```

**After**:
```
reportlab==5.0.0
weasyprint==69.0
```

**Lines changed**: +1 line  
**Note**: `pip install weasyprint==69.0` must be run on deployment. On this pod it is already installed.

---

### Edit B — `services/invoice_generator.py`: DB insert BEFORE PDF

**Location**: `create_invoice()` lines 785–811

**Before**:
```python
    # Generate PDF
    pdf_path = generate_invoice_pdf(token, result["html"])

    # Store record
    invoice_doc = {
        "id": str(uuid.uuid4()),
        "token": token,
        "user_id": user["id"],
        "pos_order_id": order.get("pos_order_id", ""),
        "restaurant_order_id": order.get("restaurant_order_id", ""),
        "customer_id": order.get("customer_id", ""),
        "invoice_number": result["invoice_number"],
        "mode": detected_mode,
        "order_type": order.get("order_type", ""),
        "order_amount": float(order.get("order_amount", 0) or 0),
        "html_path": result["html_path"],
        "pdf_path": pdf_path,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.invoices.insert_one(invoice_doc)

    return {
        "token": token,
        "invoice_number": result["invoice_number"],
        "invoice_url": f"{base_url}/api/invoices/{token}",
        "pdf_url": f"{base_url}/api/invoices/{token}/pdf",
    }
```

**After**:
```python
    # BUG-023: Store DB record FIRST so token is always persisted
    invoice_doc = {
        "id": str(uuid.uuid4()),
        "token": token,
        "user_id": user["id"],
        "pos_order_id": order.get("pos_order_id", ""),
        "restaurant_order_id": order.get("restaurant_order_id", ""),
        "customer_id": order.get("customer_id", ""),
        "invoice_number": result["invoice_number"],
        "mode": detected_mode,
        "order_type": order.get("order_type", ""),
        "order_amount": float(order.get("order_amount", 0) or 0),
        "html_path": result["html_path"],
        "pdf_path": None,  # updated after PDF generation
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.invoices.insert_one(invoice_doc)

    # BUG-023: Generate PDF after DB record is safe — best-effort
    try:
        pdf_path = generate_invoice_pdf(token, result["html"])
        await db.invoices.update_one(
            {"token": token}, {"$set": {"pdf_path": pdf_path}}
        )
    except Exception as _pdf_err:
        logger.warning("BUG-023: PDF generation failed token=%s: %s", token, _pdf_err)

    return {
        "token": token,
        "invoice_number": result["invoice_number"],
        "invoice_url": f"{base_url}/api/invoices/{token}",
        "pdf_url": f"{base_url}/api/invoices/{token}/pdf",
    }
```

**Lines changed**: Reorder of existing lines + 5 new lines (try/except + update_one + warning log). Zero change to the return contract.

---

## Verification Matrix

| V# | Test | Expected |
|---|---|---|
| V1 | POS order arrives → invoice DB record created | `db.invoices` has doc with token UUID ✅ |
| V2 | `inv.get("token")` in pos.py | Non-empty UUID string ✅ |
| V3 | `einvoice_token` in WhatsApp trigger | Non-empty UUID ✅ |
| V4 | `GET /api/invoices/{token}` | HTTP 200 ✅ |
| V5 | PDF generation fails (simulate by uninstalling weasyprint) | Token still returned, DB record exists, warning logged |
| V6 | Existing invoice (dedup path) | Returns existing token — unchanged |
| V7 | Hotel room / hotel folio mode | Token returned — no change to those code paths |
| V8 | `pdf_path` in DB after successful generation | Updated from `None` to real path |

---

## Regression Checklist

| # | Check |
|---|---|
| R1 | `GET /api/invoices/{token}` — reads from S3 then disk — still works (html_path written before DB insert) |
| R2 | `GET /api/invoices/{token}/pdf` — if pdf_path is None, falls back to on-the-fly generation (line 716–728 already handles this) |
| R3 | Dedup logic (lines 762–772) — unchanged |
| R4 | Hotel folio / room mode — unchanged (same code path, different HTML generation only) |

---

## Deployment Note

After merging `requirements.txt` change, production must run:
```bash
pip install -r requirements.txt
sudo supervisorctl restart backend
```

On this pod: `weasyprint==69.0` already installed. Only `requirements.txt` + `invoice_generator.py` changes needed.

---

```
Planning complete: BUG-023
Stage: Impact Analysis + Implementation Plan
Code reality: FULL (line numbers confirmed)
Risk: HIGH (invoice_generator.py — CR-014 hotspot)
Files WILL change: requirements.txt (1 line), services/invoice_generator.py (reorder + 5 lines)
Files WILL NOT touch: pos.py, invoices.py, whatsapp.py, frontend, all other files
Owner decisions: NONE — all decisions locked in DECISIONS_LOG + intake
Docs: discovery/BUG_023_IMPLEMENTATION_PLAN.md
Next: Owner says "go" → Implementation Agent executes Edit A + Edit B
```
