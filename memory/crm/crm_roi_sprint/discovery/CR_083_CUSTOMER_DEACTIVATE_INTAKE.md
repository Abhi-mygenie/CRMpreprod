# CR-083 — Customer Block / Deactivate — CRM Frontend — Intake Doc

**Date**: 2026-08-06
**Role**: Intake Agent
**Sprint**: crm_roi_sprint
**Source**: INV-016 (`investigations/INV_016_CUSTOMER_DELETE_IMPACT.md`) — Owner chose Option A

---

## 1. Owner Request (verbatim)

> "There is no option to delete customer. If we give an option what is impact, check all possibilities."
> Owner chose: **A — Soft delete button (block/deactivate) — quick, reversible, LOW risk**

---

## 2. Classification

| Field | Value |
|---|---|
| **Type** | CR — new feature (frontend UI for existing backend capability) |
| **Severity** | P2 — no production issue; backend already supports it, UI is missing |
| **Risk** | LOW — no new backend logic; reuses existing `PUT /api/customers/{id}` + `is_blocked` field |
| **Effort estimate** | ~1 hr |

---

## 3. Duplicate Check

| Candidate | Verdict | Reason |
|---|---|---|
| `DELETE /api/customers/{id}` (customers.py:1877) | RELATED, DISTINCT | That is hard delete. This CR is soft delete (is_blocked). |
| `DELETE /api/pos/customers/{id}` (pos.py:2606) | RELATED, DISTINCT | That is POS-auth soft delete. This CR adds CRM-auth frontend UI. |

**Result: DISTINCT — proceed as CR-083.**

---

## 4. Code Reality — What Already Exists

### Backend — FULLY READY (no changes needed)

| Capability | Location | Status |
|---|---|---|
| `is_blocked` field on customer | `models/schemas.py:CustomerUpdate` | ✅ Exists — `is_blocked: Optional[bool] = None` |
| Block via CRM JWT | `PUT /api/customers/{id}` with `{"is_blocked": true}` | ✅ Works today |
| Unblock via CRM JWT | `PUT /api/customers/{id}` with `{"is_blocked": false}` | ✅ Works today |
| Customer list filter for blocked | `CustomersPage.jsx:1298–1306` | ✅ Exists — "Blocked" / "Not Blocked" filter in advanced panel |
| Blocked customer filter in list API | `GET /api/customers?is_blocked=true` | ✅ Exists (`customers.py:1223`) |

### Frontend — MISSING

| Gap | Location | Status |
|---|---|---|
| **"Deactivate" button on CustomerDetailPage** | `CustomerDetailPage.jsx` | ❌ Missing — no `is_blocked` handling anywhere |
| **Blocked status badge on CustomerDetailPage** | `CustomerDetailPage.jsx` | ❌ Missing |
| **"Reactivate" button when customer is blocked** | `CustomerDetailPage.jsx` | ❌ Missing |
| **Blocked badge on customer card (CustomersPage)** | `CustomersPage.jsx` | ❌ Missing (filter exists, but no visual indicator on card) |

---

## 5. Proposed UI Behaviour

### CustomerDetailPage (primary surface)

1. **Status banner** — when customer `is_blocked=true`: red banner "This customer is deactivated" at top of page
2. **Deactivate button** — when `is_blocked=false`: grey "Deactivate" button in the action bar (alongside Edit, Send Message, etc.)
   - Clicking → `AlertDialog`: "Deactivate [name]? They will no longer appear in POS lookups. You can reactivate at any time." → Confirm / Cancel
   - On confirm → `PUT /api/customers/{id}` with `{"is_blocked": true}` → toast "Customer deactivated"
3. **Reactivate button** — when `is_blocked=true`: green "Reactivate" button replaces Deactivate
   - Clicking → `PUT /api/customers/{id}` with `{"is_blocked": false}` → toast "Customer reactivated"

### CustomersPage (secondary surface)

4. **Blocked badge on customer card** — when `is_blocked=true`: small red "Blocked" badge on the customer row/card
5. Default list behavior: show all (existing behaviour). Blocked filter already exists in advanced panel.

---

## 6. Owner Decisions Required (Q1–Q2)

### Q1 — Label: "Deactivate" or "Block"?

| Option | Label used | Use case |
|---|---|---|
| **a) "Deactivate"** | "Deactivate customer" / "Reactivate" | Softer. Suggests temporary operational pause. |
| **b) "Block"** | "Block customer" / "Unblock" | Clearer intent. Better for fraud/problem customers. |

Agent recommends: **(a) "Deactivate"** — merchant accidentally blocking a loyal customer is a worse outcome than failing to block a problem customer.

---

### Q2 — Default list visibility for blocked customers?

| Option | Behaviour |
|---|---|
| **a) Show with "Blocked" badge** (current behaviour + badge) | Blocked customers appear in list with a visible red "Blocked" badge. Merchant can see them, filter them out if wanted. |
| **b) Hide by default** | Blocked customers excluded from default list. Visible only when `is_blocked=true` filter is applied. |

Agent recommends: **(a) Show with badge** — preserves existing behaviour; merchant can always find and reactivate a mistakenly blocked customer without knowing to apply a filter.

---

## 7. Blast Radius

| Area | Impact |
|---|---|
| **Files WILL change** | `frontend/src/pages/CustomerDetailPage.jsx` (Deactivate/Reactivate button + status banner), `frontend/src/pages/CustomersPage.jsx` (Blocked badge on card) |
| **Files WILL NOT change** | Any backend file — `PUT /api/customers/{id}` already handles `is_blocked` |
| **DB schema** | No changes — `is_blocked` field already exists on `customers` collection |
| **Blast radius** | SMALL |

---

## 8. Intake Output

```
Intake complete: CR-083
Classification: CR — new feature (frontend UI for customer block/deactivate)
Severity: P2
Risk: LOW
Duplicate check: DISTINCT
Evidence: CustomerDetailPage.jsx has zero is_blocked handling; backend PUT endpoint fully supports it
Blast radius: SMALL (frontend only — CustomerDetailPage + CustomersPage)
Docs updated:
  - discovery/CR_083_CUSTOMER_DEACTIVATE_INTAKE.md (this file)
  - 00_register/ROI_MEASUREMENT_CR_REGISTER.md (row 33 added)
  - CR_STATUS_DASHBOARD.md (board row added)
  - DECISIONS_LOG.md (registration entry added)
Next: Planning — BLOCKED on owner Q1 (label) + Q2 (default visibility)
```

*Zero production files modified during Intake.*
