# CR-081 — POS Coupon Management — Intake Doc

**Date**: 2026-08-06
**Role**: Intake Agent
**Sprint**: crm_roi_sprint
**Source investigation**: INV-015 (`investigations/INV_015_POS_LOYALTY_COUPON_CUSTOMER_EDIT.md`)

---

## 1. Owner Request (verbatim)

> "We want to manage loyalty and coupon on POS so we will do all operations from POS UI. We will need API for same."

*(CR-081 covers coupon management. CR-080 covers loyalty/wallet.)*

---

## 2. Classification

| Field | Value |
|---|---|
| **Type** | CR — new feature (POS auth wrappers for existing coupon logic + 1 net-new) |
| **Severity** | P2 — important capability, workaround via CRM web UI |
| **Risk** | MEDIUM (coupon create/edit/delete touch financial discount logic) |
| **Effort estimate** | ~3 hrs |

---

## 3. Duplicate Check

| Candidate | Verdict | Reason |
|---|---|---|
| CR-003 (Coupon Analytics Dashboard) | RELATED, DISTINCT | CR-003 is analytics/reporting for CRM frontend. CR-081 is management CRUD for POS UI. |
| Existing `GET /api/pos/coupons/available` | RELATED, DISTINCT | That is order-specific eligibility check. CR-081 is catalogue management (create, list all, edit, delete). |

**Result: DISTINCT — proceed as CR-081.**

---

## 4. Code Reality — What Exists vs What's Missing

### Already accessible from POS (X-API-Key) ✅

| Endpoint | What |
|---|---|
| `GET /api/pos/coupons/available?customer_id=&order_total=` | Eligible coupons for a specific customer/order — NOT a catalogue |
| `POST /api/pos/coupons/validate` | Validate coupon code before applying |
| `POST /api/pos/orders` (coupon_code) | Record coupon usage at order time |

### Missing — CRM JWT today

| Gap # | Operation | Existing CRM endpoint | Auth gap | Risk |
|---|---|---|---|---|
| **C-1** | List ALL coupons (catalogue) | `GET /api/coupons` (`coupons.py:34`) | CRM JWT | LOW |
| **C-2** | Get single coupon details | `GET /api/coupons/{id}` (`coupons.py:115`) | CRM JWT | LOW |
| **C-3** | Create a coupon | `POST /api/coupons` (`coupons.py:14`) | CRM JWT | MEDIUM |
| **C-4** | Edit a coupon | `PUT /api/coupons/{id}` (`coupons.py:122`) | CRM JWT | MEDIUM |
| **C-5** | Toggle active/inactive | `POST /api/coupons/{id}/toggle` (`coupons.py:153`) | CRM JWT | LOW |
| **C-6** | Delete a coupon | `DELETE /api/coupons/{id}` (`coupons.py:145`) | CRM JWT | MEDIUM |
| **C-7** | View usage stats for a coupon | `GET /api/coupons/{id}/usage` (`coupons.py:293`) | CRM JWT | LOW |
| **C-8** | Distribute coupon to a specific customer | ❌ **Does NOT exist anywhere** | — | MEDIUM (net-new) |

**C-1, C-2, C-5, C-7** = read-only or toggle, LOW risk. **C-3, C-4, C-6, C-8** = write/delete, MEDIUM risk.

---

## 5. Proposed New POS Endpoints

### READ / LIST ENDPOINTS (LOW risk)

**C-1** `GET /api/pos/coupons?active_only=true&limit=50`
Returns all coupons for the restaurant (not order-specific). POS cashier browses catalogue.
```json
{
    "coupons": [
        {
            "id": "...", "code": "WELCOME20",
            "title": "Welcome 20% Off",
            "discount_type": "percentage", "discount_value": 20,
            "discount_display": "20% off",
            "offer_type": "simple",
            "is_active": true,
            "start_date": "...", "end_date": "...",
            "min_order_value": 300.0
        }
    ],
    "total": 5
}
```

**C-2** `GET /api/pos/coupons/{coupon_id}`
Full coupon details (all fields including eligibility rules, buttons, time windows).

**C-5** `POST /api/pos/coupons/{coupon_id}/toggle`
Activate or deactivate a coupon. Returns `{"is_active": bool}`.

**C-7** `GET /api/pos/coupons/{coupon_id}/usage?limit=20`
Usage history — who used this coupon, when, on which order.

---

### WRITE ENDPOINTS (MEDIUM risk)

**C-3** `POST /api/pos/coupons`
Create a new coupon. Full `CouponCreate` schema (same as CRM endpoint). Fires code-uniqueness guard.

**C-4** `PUT /api/pos/coupons/{coupon_id}`
Edit an existing coupon. Full `CouponUpdate` schema (same as CRM endpoint).

**C-6** `DELETE /api/pos/coupons/{coupon_id}`
Delete a coupon. **Must reuse the existing in-use guard** from `coupons.py:145` — blocks delete if coupon is used in an active campaign.

---

### NET-NEW ENDPOINT (MEDIUM risk)

**C-8** `POST /api/pos/coupons/{coupon_id}/distribute`
Assign a coupon to a specific customer from POS — "give this VIP customer a personal discount code."

Request:
```json
{
    "customer_id": "1779d4fc-...",
    "note": "VIP reward — 10th visit milestone",
    "notify_whatsapp": true
}
```

Response:
```json
{
    "success": true,
    "message": "Coupon distributed to customer",
    "data": {
        "distribution_id": "dist_abc123",
        "coupon_id": "...",
        "customer_id": "...",
        "code": "WELCOME20",
        "assigned_at": "..."
    }
}
```

Implementation options — need owner decision:
- **Option A** (simple): Record a `coupon_distributions` entry + fire `coupon_earned` WhatsApp event with the code. No enforcement — coupon is still usable by anyone who has the code (same as today).
- **Option B** (strict): Add `customer_id` to `specific_users` array on the coupon, making it single-customer only. Harder to reverse.

---

## 6. Owner Decisions Required (Q1–Q3)

### Q1 — New file or extend `routers/pos.py`?

| Option | |
|---|---|
| **a) New file `routers/pos_coupons.py`** | Cleaner, keeps pos.py from growing further |
| **b) Extend `routers/pos.py`** | One file, consistent |

Agent recommends: **(a)** — new file. `pos.py` at 3,625 LOC is already large.

---

### Q2 — Coupon distribute (C-8): simple record + notify or strict assignment?

| Option | |
|---|---|
| **a) Simple — record + WhatsApp notify only** | Log distribution + fire `coupon_earned` event. Code still works for anyone. Low complexity, no schema change. |
| **b) Strict — add to `specific_users` on coupon** | Enforced at validate-time. Only that customer can use the code. Harder to undo (need to remove from `specific_users`). |

Agent recommends: **(a)** — simple record first. Can upgrade to strict in Phase 2 if needed.

---

### Q3 — Expose `DELETE /pos/coupons/{id}` or only `toggle`?

Deleting a coupon from POS is irreversible and touches a financial record.

| Option | |
|---|---|
| **a) Both toggle AND delete** | Full management capability from POS |
| **b) Toggle only from POS, delete stays CRM-only** | Safer — prevents accidental permanent deletion from a cashier device |

Agent recommends: **(a)** — expose delete, but with the same in-use guard (block if in active campaign). Owner decides.

---

## 7. Blast Radius

| Area | Impact |
|---|---|
| **Files WILL change** | `routers/pos_coupons.py` (new file) or `routers/pos.py` (if Q1=b), `server.py` (+1 import + include_router) |
| **Files WILL NOT change** | `routers/coupons.py`, `core/coupon.py`, `models/schemas.py` (CouponCreate/Update reused as-is), all frontend |
| **DB collections** | `coupons` (read+write), `coupon_usage` (read), `coupon_distributions` (new, only if C-8) |
| **Business logic** | Reuses `core/coupon.py` validation functions — no logic change |
| **Blast radius** | MEDIUM |

---

## 8. Intake Output

```
Intake complete: CR-081
Classification: CR — new feature (POS coupon management + 1 net-new distribute endpoint)
Severity: P2
Risk: MEDIUM
Duplicate check: DISTINCT
Evidence: confirmed by code read (coupons.py, core/coupon.py, pos.py)
Blast radius: MEDIUM (new file + server.py + 1 new collection for C-8)
Docs updated:
  - discovery/CR_081_POS_COUPON_MANAGEMENT_INTAKE.md (this file)
  - 00_register/ROI_MEASUREMENT_CR_REGISTER.md (row 31 added)
  - CR_STATUS_DASHBOARD.md (board row added)
  - DECISIONS_LOG.md (registration entry added)
Next: Planning — BLOCKED on owner Q1 (new file?), Q2 (distribute simple vs strict), Q3 (delete allowed from POS?)
```

*Zero production files modified during Intake.*
