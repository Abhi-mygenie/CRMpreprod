# CR-035 — Intake: Customer List Export & Import

> **Type**: Intake / Discovery Registration
> **Date**: 2026-07-01
> **Decisions locked**: 2026-07-01 (all Q1–Q10 answered by owner)
> **Requested by**: Owner (from INV-004 Issue 4)
> **Status**: ✅ Discovery complete — ALL Q1–Q10 locked. Ready for Impact Analysis.
> **Risk**: LOW (additive feature, no hotspot files)

---

## One-line summary

Let restaurant owners **export** their customer list to CSV or Excel and **import** new or updated customers from a file — for data backup, bulk onboarding, and CRM migration purposes.

---

## Current state

**Zero code exists** for import or export:
- `backend/routers/customers.py` — no CSV/Excel endpoint
- `frontend/src/pages/CustomersPage.jsx` — no export button, no import modal
- The only related feature is `POST /api/customers/sync-from-mygenie` (syncs from POS, not a file upload)

---

## Owner Decisions — ALL LOCKED ✅

| # | Question | Answer | Notes |
|---|---|---|---|
| **Q1** | Export format | **Both CSV + Excel (.xlsx)** | Two download buttons or a format picker |
| **Q2** | Export fields | **All fields** | Name, phone, email, DOB, address, loyalty (points, tier, wallet), tags, membership level. Tier/level shown as human-readable label (dropdown-style value, not raw DB enum) |
| **Q3** | Import format | **Both CSV + Excel (.xlsx)** | Same parser handles both |
| **Q4** | Duplicate handling | **Update existing** | If phone already exists → overwrite with new values from file |
| **Q5** | Mandatory fields | **Name + Phone only** | All other fields optional |
| **Q6** | Row limit | **5,000 rows per file** | Covers all realistic restaurant scenarios. Synchronous processing (~3–5 sec), no background job needed |
| **Q7** | Export scope | **All customers** | Ignore current page filters — always export full list |
| **Q8** | Export fields | **Everything** | Profile + loyalty + wallet + tier + tags + membership level |
| **Q9** | Tags importable | **Yes** | CSV/Excel has optional `tags` column (comma-separated). Tags are **added** to customer (not replaced). New tags auto-created in catalog. Blank = no change to existing tags. |
| **Q10** | Import history/log | **Yes** | Show past import runs: date, filename, rows succeeded, rows failed |

---

## Export — Field List (full)

| Column header | DB field | Notes |
|---|---|---|
| Name | `name` | |
| Phone | `phone` | |
| Email | `email` | |
| Date of Birth | `date_of_birth` | ISO date |
| Anniversary | `anniversary` | ISO date |
| Address | `address` | |
| City | `city` | |
| Total Points | `total_points` | |
| Tier | `tier` | Human-readable: Bronze / Silver / Gold / Platinum |
| Wallet Balance | `wallet_balance` | |
| Total Orders | `total_orders` | |
| Total Spend | `total_spend` | |
| Last Visit | `last_visit` | ISO date |
| Tags | `tags` | Comma-separated e.g. `VIP, Regular` |
| Opt-out | `opted_out` | true / false |
| Created At | `created_at` | ISO date |

---

## Import — Behaviour Rules

| Rule | Detail |
|---|---|
| Mandatory columns | `name` + `phone` — file rejected if either is missing from header |
| Duplicate check | Match on `phone`. If found → update. If not found → create new. |
| Row limit | 5,000 rows. Rows beyond limit are ignored with a warning. |
| Tags column | Optional. Comma-separated. Added to existing tags (not replaced). New tags auto-created. |
| Tier/level column | Optional. On import, ignored — tier is computed by loyalty engine, not set manually. |
| Wallet balance | Optional. On import, ignored — wallet is managed via transaction ledger only. |
| Error handling | Per-row errors (bad phone format, missing name) collected and shown in error report. Valid rows still import. |
| Preview step | Show first 5 rows + column mapping before confirming import. |

---

## Import History Log

Each import run stored in new `import_logs` collection:
- `id`, `user_id`, `filename`, `format` (csv/xlsx), `total_rows`, `imported`, `updated`, `failed`, `errors[]`, `created_at`
- Visible on CustomersPage under "Import History" section or drawer

---

## Effort Estimate (now that all Qs answered)

| Feature | Effort |
|---|---|
| Export CSV | ~1 hr |
| Export Excel | +1 hr |
| Import CSV + Excel (create + update) | ~3 hrs |
| Import preview + per-row error report | ~2 hrs |
| Import history/log (backend + UI) | ~1.5 hrs |
| Frontend (export buttons + import modal) | ~2 hrs |
| **Total** | **~8–10 hrs** |

**Files affected (preliminary):**
- `backend/routers/customers.py` (new endpoints: export, import, import-history)
- `frontend/src/pages/CustomersPage.jsx` (export buttons + import modal + history)
- `backend/models/schemas.py` (ImportLog model)

**Hotspot files touched:** 0
**New pip packages:** `openpyxl` (Excel read/write)

---

## Next step

All decisions locked → **Impact Analysis** can start immediately.

---

*CR-035 intake complete. All Q1–Q10 locked. 2026-07-01.*
