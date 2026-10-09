# INTAKE DOC — CR-2026-09-15-003

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-15-003 |
| **Title** | Canonical phone alignment (POS ↔ CRM ↔ Customer App) — fix non-`+91` handling in `extractPhoneNumber` / `stripPhonePrefix`; adopt agreed canonical form |
| **Classification** | BUG (data linkage) + contract alignment |
| **Date Registered** | 2026-09-15 |
| **Reported By** | CRM brief INV-018 §6 ("send phone in one canonical format") + Customer-App code check during intake |
| **Severity** | **P2** — affects only non-Indian numbers today (+91 path already canonical); but every such order is permanently unlinkable |
| **Risk** | **CRITICAL** — touches the order payload builder (`transformers/helpers.js` → `ReviewOrder` payload, addendum §6.1 / Part C) and the customer-identity key. Owner approval + E2E regression mandatory. |
| **Status** | 🅿️ PARKED — **India-only customer base confirmed by owner 2026-10-03.** Bug only affects non-Indian numbers. Existing `+91` handling is correct for all current users. Re-open only if international numbers are introduced. |
| **Parent** | CR-2026-09-12-001 (Wave 2) · Option A |
| **Blast radius** | MEDIUM — 2 helper functions used by order placement, skip-otp, login, register |

## 1. Problem (code truth, `sep15`)

| Function | Input `+971501234567` (example) | Output | Consequence |
|---|---|---|---|
| `frontend/src/api/transformers/helpers.js:245-258 extractPhoneNumber` | non-`+91` prefix → `replace(/^\+\d+/, '')` | **`""`** (greedy `\d+` eats the whole number) | POS receives `cust_phone: ""` → order lands in CRM **unlinked forever** (INV-018 DATA-A bucket) |
| `frontend/src/api/services/crmService.js:272-281 stripPhonePrefix` | same input | `971501234567` (cc kept, `+` dropped) | CRM customer keyed on a 12-digit string; never equals what POS has (`""`) or what a cashier types |
| Both, for `+91XXXXXXXXXX` | 10-digit national | ✅ matches CRM canonical form | no change needed |

Also: `extractPhoneNumber` runs `String.replace('+91','')` only for a leading `+91`; a `91XXXXXXXXXX` without `+` (POS-style, 31 orders in CRM data) passes through as 12 digits.

## 2. Scope
IN: single shared phone-canonicalisation helper used by both call sites; behaviour for non-Indian numbers per POS/CRM agreement (INV-018 Q6: likely E.164 for non-IN only); unit tests for the 4 observed shapes (`10-digit`, `+91…`, `91…`, spaces/leading 0).
OUT: any CRM-side normalisation (CRM P-8); backfill/merge of duplicates (CRM P-10); POS webhook changes.

## 3. Duplicate check
| Item | Verdict |
|---|---|
| BUG-008 (phone normalisation India-biased) | **RELATED — this is the concrete fix for BUG-008's order-linkage consequence**; cross-link |
| CR-2026-09-12-009 (remove `+91` country-code hardcoding) | RELATED — same functions; **sequence together** to avoid conflict |
| CR-2026-09-15-001 | DISTINCT — that CR reads orders; this one makes orders linkable |

## 4. Code exists? PARTIAL — Indian path correct; non-Indian path broken.

## 5. Files
Will change: `frontend/src/api/transformers/helpers.js`, `frontend/src/api/services/crmService.js` (helper only). Will NOT touch: `ReviewOrder.jsx` (consumes helper unchanged), backend, CRM.

## 6. Prerequisites
1. POS answers INV-018 Q6/Q7 (canonical form for non-Indian numbers; exact format POS emits).
2. Owner decides whether CRM P-8 (defensive normalisation) ships first — if yes, this CR shrinks to "stop blanking non-+91 numbers".

```text
Intake complete: CR-2026-09-15-003
Classification: BUG + contract alignment
Severity: P2
Risk: CRITICAL (order payload + identity key)
Duplicate check: RELATED (BUG-008, CR-2026-09-12-009) — DISTINCT
Evidence: captured (code refs; CRM INV-018 §1-§3)
Blast radius: MEDIUM
Docs updated: this file, ../README.md, ../../PRD.md, CR-2026-09-15-001 §8
Next: BLOCKED — POS Q6/Q7 + owner P-8 decision → Planning
```
