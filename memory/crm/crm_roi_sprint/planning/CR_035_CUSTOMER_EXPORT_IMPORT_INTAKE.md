# CR-035 — Intake: Customer List Export & Import

> **Type**: Intake / Discovery Registration
> **Date**: 2026-07-01
> **Requested by**: Owner (from INV-004 Issue 4)
> **Status**: 📋 Registered — Discovery blocked on Q1-Q6 (owner answers needed)
> **Risk**: LOW (additive feature, no hotspot files)

---

## One-line summary

Let restaurant owners **export** their customer list to a file (CSV/Excel) and **import** new or updated customers from a file — for data backup, bulk onboarding, and CRM migration purposes.

---

## Current state

**Zero code exists** for import or export:
- `backend/routers/customers.py` — no CSV/Excel endpoint
- `frontend/src/pages/CustomersPage.jsx` — no export button, no import modal
- The only related feature is `POST /api/customers/sync-from-mygenie` (syncs from POS, not a file upload)

---

## What's needed (high-level)

### Export
- A button on the Customers page → downloads a file with the customer list
- Respects current filters (export filtered set or all customers)
- Fields: configurable subset of the Customer model

### Import
- An "Import" button on the Customers page → opens a modal
- User uploads a CSV/Excel file
- CRM validates rows, shows preview, then imports (create or update)
- Error report for failed rows

---

## Blocker Questions (Q1–Q6) — ALL block discovery planning

| # | Question | Why it blocks |
|---|---|---|
| **Q1** | **Export format**: CSV only, or also Excel (.xlsx)? | CSV = simple, xlsx = needs openpyxl library, richer formatting |
| **Q2** | **Export fields**: All ~100 Customer fields, or a specific subset? | Determines field mapping, header row, and whether we expose sensitive fields (GST, addresses) |
| **Q3** | **Import format**: CSV only, or also Excel? | Different parsing library |
| **Q4** | **Duplicate handling on import**: If phone number already exists — Skip / Update existing / Error? | Core business logic — wrong choice = data loss |
| **Q5** | **Import mandatory fields**: Only Name + Phone required, or also email/DOB/etc? | Drives the validation rules |
| **Q6** | **Import row limit**: Max customers per file? (100? 1000? 10000?) | Determines if we need background job vs synchronous processing |

---

## Additional discovery questions (non-blocking but important)

| # | Question |
|---|---|
| Q7 | Should export respect the current filters on the Customers page, or always export ALL customers? |
| Q8 | Should the export include loyalty fields (total_points, tier, wallet_balance) or just profile fields? |
| Q9 | On import, should tags (CR-034) be importable too (e.g. a "tags" column)? |
| Q10 | Should there be an import history / log (how many imported, how many failed)? |

---

## Preliminary effort estimate (once Q1-Q6 answered)

| Feature | Effort | Risk |
|---|---|---|
| Export only (CSV, filtered) | ~2 hours | LOW |
| Export (Excel) | +1 hour | LOW |
| Import (CSV, create-only) | ~4 hours | LOW |
| Import (update existing on duplicate) | +1 hour | LOW-MEDIUM |
| Import preview + error report UI | +2 hours | LOW |
| **Full feature (export + import)** | **~8–10 hours** | LOW |

**Files affected (preliminary):**
- `backend/routers/customers.py` (new endpoints)
- `frontend/src/pages/CustomersPage.jsx` (export button + import modal)

**Hotspot files touched:** 0

---

## Next step

Owner answers Q1-Q6 → Discovery doc can be written → Planning → Implementation.

---

*CR-035 registered. Discovery blocked on Q1-Q6.*
