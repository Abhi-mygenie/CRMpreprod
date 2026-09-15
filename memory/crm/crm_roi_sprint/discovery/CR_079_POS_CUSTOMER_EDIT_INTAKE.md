# CR-079 — POS Customer Edit — Contract Fix — Intake Doc

**Date**: 2026-08-06
**Role**: Intake Agent
**Sprint**: crm_roi_sprint
**Source investigation**: INV-015 (`investigations/INV_015_POS_LOYALTY_COUPON_CUSTOMER_EDIT.md`)

---

## 1. Owner Request (verbatim)

> "We need option to edit customer. I think currently we have customer API but edit option is not there."

---

## 2. Classification

| Field | Value |
|---|---|
| **Type** | CR — fix + contract gap |
| **Subtype** | POS endpoint schema improvement + contract doc |
| **Severity** | P2 — workaround exists (CRM web UI for edits), but POS UI cannot easily use existing endpoint |
| **Risk** | LOW |
| **Effort estimate** | ~45 min |

---

## 3. Duplicate Check

| Candidate | Verdict | Reason |
|---|---|---|
| CR-071 (B2B Customer GST fields) | RELATED, DISTINCT | CR-071 added `gst_name`/`gst_number`/`is_b2b` fields. CR-079 fixes the PUT endpoint schema and response shape. Different problem. |
| `PUT /api/pos/customers/{id}` (existing) | NOT A DUPLICATE — this IS the endpoint being fixed | The endpoint exists; the CR is to fix its contract issues. |

**Result: DISTINCT — proceed as CR-079.**

---

## 4. Code Reality — What Already Exists

`PUT /api/pos/customers/{customer_id}` — **EXISTS** at `pos.py:373`, uses `verify_pos_auth` ✅

The endpoint works. Three contract issues block POS UI adoption:

| Gap | Location | Issue |
|---|---|---|
| **GAP-CE-1** | `POSCustomerUpdate` schema `pos.py:127` | `pos_id`, `restaurant_id`, `phone` are REQUIRED on every PUT. POS UI only has `customer_id` from the URL — should not need to re-send POS system identifiers to edit `name` or `dob`. |
| **GAP-CE-2** | `pos_update_customer` `pos.py:438–447` | PUT response returns only 4 fields (`customer_id`, `name`, `phone`, `updated_at`). POS UI must make a second GET call to refresh the display. |
| **GAP-CE-3** | No contract doc | `PUT /api/pos/customers/{id}` is not documented in any POS API contract. POS team likely unaware it exists. |

**Also confirmed working:**
- `GET /api/pos/customers/{id}` ✅ — full customer + loyalty + addresses + recent orders
- `GET /api/pos/customers?search=` ✅ — typeahead search

---

## 5. Proposed Fixes

### Fix 1 — Make `pos_id` and `restaurant_id` optional
`pos_id` and `restaurant_id` can be derived from the `X-API-Key` auth (stored on the `users` record). They only need to be sent if POS wants to update them explicitly.

`phone` should remain required — it is the natural dedup key and changing it needs uniqueness validation.

**Schema change** (`POSCustomerUpdate`):
```python
# BEFORE
pos_id: str
restaurant_id: str
phone: str  # required

# AFTER
pos_id: Optional[str] = None        # derive from auth if not sent
restaurant_id: Optional[str] = None  # derive from auth if not sent
phone: str  # still required — dedup key
```

### Fix 2 — Return full updated customer in PUT response
After `await db.customers.find_one(...)` already happens at line 436, return the full doc instead of just 4 fields.

### Fix 3 — Write POS API contract doc for customer edit
A contract section covering `PUT /api/pos/customers/{id}` + `GET /api/pos/customers/{id}` + `GET /api/pos/customers?search=`.

---

## 6. Owner Decisions Required (Q1–Q2)

### Q1 — `phone` on PUT: still required or optional?

Currently `phone` is required as the dedup key on update. If POS already has `customer_id` in the URL, should `phone` also be required?

| Option | |
|---|---|
| **a) Keep `phone` required** | Consistency with create; ensures dedup check always runs |
| **b) Make `phone` optional** | If POS only wants to change `name` or `dob`, forcing `phone` is unnecessary |

Agent recommends: **(a)** — keep `phone` required. Dedup protection is worth the minor inconvenience.

---

### Q2 — PUT response: full customer or lean summary?

| Option | |
|---|---|
| **a) Return full customer object** (all fields, same as `GET /customers/{id}`) | Complete, one call sufficient — but larger payload |
| **b) Return lean updated fields** (name, phone, email, dob, tier, loyalty balance, updated_at) | Lighter, covers 90% of UI needs |

Agent recommends: **(a)** — full customer. Consistent with `GET`; avoids POS building two different response parsers.

---

## 7. Blast Radius

| Area | Impact |
|---|---|
| **Files WILL change** | `routers/pos.py` — 2 edits: (1) `POSCustomerUpdate` schema `pos_id`/`restaurant_id` → Optional, (2) `pos_update_customer` return full customer |
| **Files WILL NOT change** | `models/schemas.py`, `core/auth.py`, `core/loyalty.py`, all frontend files |
| **DB schema** | No changes |
| **POS API contract** | Additive — existing behaviour preserved; `pos_id`/`restaurant_id` still accepted if sent |
| **Blast radius** | SMALL |

---

## 8. Intake Output

```
Intake complete: CR-079
Classification: CR — fix + contract gap
Severity: P2
Risk: LOW
Duplicate check: DISTINCT
Evidence: confirmed by code read (pos.py:127–447)
Blast radius: SMALL
Docs updated:
  - discovery/CR_079_POS_CUSTOMER_EDIT_INTAKE.md (this file)
  - 00_register/ROI_MEASUREMENT_CR_REGISTER.md (row 29 added)
  - CR_STATUS_DASHBOARD.md (board row added)
  - DECISIONS_LOG.md (registration entry added)
Next: Planning — BLOCKED on owner Q1 (phone required?) + Q2 (full vs lean response)
```

*Zero production files modified during Intake.*
