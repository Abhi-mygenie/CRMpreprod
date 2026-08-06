# BUG-021 — POS Order Does Not Update Existing Customer Name / Email

**ID**: BUG-021  
**Reported**: 2026-08-04  
**Reporter**: Owner (Abhishek)  
**Role**: Intake Agent  
**Source investigation**: INV-013B  
**Status**: 🔴 OPEN  

---

## Owner Report

> "When we take a real order from POS and let's say during migration customer name was not there —
> when I take new order and update customer name, what is expected behaviour, will name get updated
> in CRM or not?"
>
> "We should always update customer name or any data apart from phone number when new order arrives.
> Phone number is unique."

---

## Classification

| Field | Value |
|---|---|
| **Type** | BUG (missing expected behaviour — data not flowing) |
| **Severity** | P1 — Migrated customers stay "Unknown" forever unless manually edited; every real order is a missed update opportunity |
| **Risk** | CRITICAL — fix touches `routers/pos.py` POS order ingestion (highest-risk hotspot per addendum §7) |
| **Duplicate check** | DISTINCT |
| **Blast radius** | LARGE — every existing customer on every POS order |

---

## Evidence

### E1 — `customer_update_set` in `routers/pos.py` line 1464

```python
customer_update_set = {
    "total_points": new_points,
    "tier": new_tier,
    "wallet_balance": new_wallet_balance,
    "total_visits": new_total_visits,
    "total_spent": new_total_spent,
    "avg_order_value": new_avg_order_value,
    "last_visit": now,
}
```

`name` and `email` are **absent**. Only loyalty and behavioural counters are updated.

### E2 — `POSOrderWebhook` carries 3 customer demographic fields

```
cust_mobile  → phone  (unique key — NEVER update)
cust_name    → name   (NOT in customer_update_set) ← GAP
cust_email   → email  (NOT in customer_update_set) ← GAP
```

### E3 — Live data confirmation

```
Hungry Keya customer (phone 9831618955): name = "Unknown" in CRM
Recent order (002149) for this restaurant: cust_name = "abhishek" 
After order processed: CRM customer name still = "Unknown"
```

### E4 — `_find_or_create_customer` for existing customers

Lines 674–682: If customer is found by `pos_customer_id` or phone → returned immediately, no name update.

### E5 — Synthetic email guard needed

POS sometimes sends placeholder emails:
- `7505242126@mygenie.online` (phone-based)
- `temp_68dcd5208b9f7@mygenie.online` (token-based)

These must NOT overwrite a real email the CRM already has.

---

## Locked Decision

Per `DECISIONS_LOG.md § 2026-08-04 [INV-013]`:
- Update `name` if `order_data.cust_name` is non-empty (overwrite even "Unknown")
- Update `email` if non-empty AND `"@mygenie"` not in the email string
- `phone` — NEVER in `customer_update_set`
- All other fields (dob, gender, etc.) — not in order payload, not touched

---

## Affected File

| File | Change needed |
|---|---|
| `routers/pos.py` | `customer_update_set` (line 1464) — add conditional name + email fields |

## Files NOT changing

`_find_or_create_customer`, schemas, frontend, migration, whatsapp, campaign jobs.

---

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | POS order for existing customer with `name="Unknown"` + `cust_name="Rahul Kumar"` → CRM `name` updated to `"Rahul Kumar"` |
| AC-2 | POS order with `cust_name=""` or `cust_name=None` → CRM `name` unchanged (no blank overwrite) |
| AC-3 | POS order with real `cust_email="rahul@example.com"` → CRM `email` updated |
| AC-4 | POS order with synthetic `cust_email="9831618955@mygenie.online"` → CRM `email` unchanged |
| AC-5 | POS order with `cust_email=None` → CRM `email` unchanged |
| AC-6 | `cust_mobile` is NEVER in `customer_update_set` — phone cannot be changed via an order |
| AC-7 | Loyalty fields (total_points, tier, total_visits, etc.) — zero change from current behaviour |
| AC-8 | New customer creation path (no existing record) — zero change |

---

## Regression Checks

| # | Check |
|---|---|
| R1 | Existing customer with a real name ("Rahul Kumar") + POS sends `cust_name="Rahul Kumar"` → name unchanged (same value, no harm) |
| R2 | POS order for a customer with `name="Priya Singh"` + POS sends `cust_name=""` → "Priya Singh" preserved |
| R3 | Points / tier calculation after fix — identical to current |
| R4 | WhatsApp trigger fires with updated name (template uses new "Rahul Kumar" not old "Unknown") |

---

```
Intake complete: BUG-021
Classification: BUG
Severity: P1
Risk: CRITICAL
Duplicate check: DISTINCT
Evidence: captured (code trace + live data + DB confirmation)
Blast radius: LARGE (all tenants, every POS order)
Docs: discovery/BUG_021_POS_ORDER_NO_NAME_EMAIL_UPDATE_INTAKE.md
Next: Planning → 1 file (~8 LOC), CRITICAL gate — owner approval required before implementation
```
