# BUG-023 — `weasyprint` missing from requirements.txt — einvoice_token empty in production

**ID**: BUG-023  
**Reported**: 2026-08-04  
**Reporter**: Owner (Abhishek)  
**Role**: Intake Agent  
**Source investigation**: This session (invoice token empty in production)  
**Status**: 🔴 OPEN  

---

## Owner Report

> "We moved build to production but einvoice_token came empty. In this environment it works."

---

## Classification

| Field | Value |
|---|---|
| **Type** | BUG — environment gap (works in preview, broken in production) |
| **Severity** | P0 — Invoice generation is completely broken in production. Every order's `einvoice_token` is `""`. WhatsApp bill button has no token. |
| **Risk** | HIGH — fix touches `requirements.txt` (LOW risk to add) + `services/invoice_generator.py` (MEDIUM risk for order change) |
| **Duplicate check** | DISTINCT |
| **Blast radius** | LARGE — all tenants in production, every POS order |

---

## Root Cause

### Primary: `weasyprint` not in `requirements.txt`

```
requirements.txt has:
  reportlab==5.0.0    ← present
  weasyprint          ← ABSENT ❌

This preview pod: weasyprint manually pip-installed during session → works
Production: deploys from requirements.txt → weasyprint missing → fails
```

### Failure chain

```
POST /api/pos/orders
  → create_invoice()
      → generate_invoice_html() → token created in memory ✅
      → generate_invoice_pdf()
          → import weasyprint  ← ModuleNotFoundError ❌
          ← exception propagates
      ← exception exits create_invoice
  ← caught by bare except in pos.py (WARNING logged only)
  einvoice_token = ""     ← WhatsApp fires with empty token
  einvoice_link  = ""
```

### Secondary: PDF generated BEFORE DB insert

```python
# Line 786 in create_invoice — PDF first
pdf_path = generate_invoice_pdf(token, result["html"])  ← FAILS

# Line 804 — DB insert NEVER REACHED
await db.invoices.insert_one(invoice_doc)

# Line 806 — token return NEVER REACHED
return {"token": token, ...}
```

Even if weasyprint were installed, ANY PDF failure (timeout, OOM, S3 error) causes the same outcome — token never returned. The robust order is: HTML → DB insert → return token → PDF async.

---

## Evidence

| Check | This pod | Production |
|---|---|---|
| `weasyprint` in requirements.txt | ❌ Not listed | ❌ Not listed |
| `weasyprint` installed | ✅ Manual pip install | ❌ Not installed |
| `einvoice_token` | ✅ Correct UUID | `""` empty |
| Invoice in DB | ✅ Stored | ❌ Not stored |
| Invoice on disk/S3 | ✅ | ❌ |

---

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | `pip install -r requirements.txt` in a fresh environment installs `weasyprint` |
| AC-2 | Invoice is generated and stored in DB for a live POS order in production |
| AC-3 | `einvoice_token` is a valid UUID token in the WhatsApp `send_bill` message |
| AC-4 | Invoice accessible via `GET /api/invoices/{token}` returns HTTP 200 |
| AC-5 | If PDF generation fails for any reason, invoice HTML + token are still stored and returned |

---

## Files to Change (planning gate)

| File | Change | Risk |
|---|---|---|
| `requirements.txt` | Add `weasyprint==69.0` | LOW — additive dependency |
| `services/invoice_generator.py` | Move `generate_invoice_pdf()` call AFTER `db.invoices.insert_one()` — so token is always returned even if PDF fails | MEDIUM — order change in CR-014 hotspot |

---

```
Intake complete: BUG-023
Classification: BUG
Severity: P0 — production broken for all tenants
Risk: HIGH
Duplicate check: DISTINCT
Evidence: requirements.txt trace + exception chain + live comparison preview vs prod
Blast radius: LARGE — all production tenants, every POS order
Docs: discovery/BUG_023_WEASYPRINT_EMPTY_EINVOICE_TOKEN_INTAKE.md
Next: Planning (2 edits, LOW-MEDIUM risk) → owner approval → implementation
```
