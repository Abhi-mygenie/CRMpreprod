# BUG-020 — "Unknown" Customer Name Sent in WhatsApp Templates

**ID**: BUG-020  
**Reported**: 2026-08-04  
**Reporter**: Owner (Abhishek) — verbal report via session chat  
**Role**: Intake Agent  
**Source investigation**: INV-013A  
**Status**: 🔴 OPEN  

---

## Owner Report

> "Unknown is coming for name. If name is not captured during migration it comes as Unknown.
> How will template go if we mapping with customer_name — Unknown will go in place of customer name."

---

## Classification

| Field | Value |
|---|---|
| **Type** | BUG |
| **Severity** | P1 — Core feature broken; workaround exists (manually update 939 names) but not scalable |
| **Risk** | HIGH — touches WhatsApp send path (hotspot per addendum §7) |
| **Duplicate check** | DISTINCT — not previously registered |
| **Blast radius** | LARGE — affects all 939/949 Hungry Keya customers; any tenant with migrated customers |

---

## Evidence

### E1 — Root cause in `core/whatsapp.py` line 304

```python
def resolve_variable(var_key, customer, event_data=None, brand=None):
    ...
    if value not in (None, "", 0):
        return _format_value(value, entry.get("formatter"))
```

Exclusion list is `None`, `""`, `0`. The string `"Unknown"` is not excluded → returned as-is.

### E2 — Live test confirmation

```
resolve_variable("customer_name", {"name": "Unknown"}) → "Unknown"
resolve_variable("customer_name", {"name": None})      → ""
```

### E3 — Scale

```
Hungry Keya (restaurant_634): 939 / 949 customers have name = "Unknown"
All have updated_at = None → set during migration, never manually corrected
```

### E4 — WhatsApp output

```
"Namaste Unknown, Thank you for dining at Hungry Keya..."
```

---

## Locked Decision

Per `DECISIONS_LOG.md § 2026-08-04 [INV-013]`:
> "Unknown" (any case) must be treated as blank → return **"Guest"** for `customer_name` variable.
> Fallback value "Guest" is frozen.

---

## Affected Files

| File | Change needed |
|---|---|
| `core/whatsapp.py` | `resolve_variable()` — guard: if `value.strip().lower() == "unknown"` → treat as blank; for `customer_name` specifically, return `"Guest"` instead of `""` |

## Files NOT changing

All other files (routers, frontend, campaign jobs, coupon, loyalty) — untouched.

---

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | `resolve_variable("customer_name", {"name": "Unknown"})` returns `"Guest"` |
| AC-2 | `resolve_variable("customer_name", {"name": "unknown"})` returns `"Guest"` (case-insensitive) |
| AC-3 | `resolve_variable("customer_name", {"name": "UNKNOWN"})` returns `"Guest"` |
| AC-4 | `resolve_variable("customer_name", {"name": None})` returns `"Guest"` (blank fallback) |
| AC-5 | `resolve_variable("customer_name", {"name": ""})` returns `"Guest"` (empty fallback) |
| AC-6 | `resolve_variable("customer_name", {"name": "Rahul Kumar"})` returns `"Rahul Kumar"` (unchanged) |
| AC-7 | All other variables (tier, points_balance, etc.) — zero execution path change |
| AC-8 | Campaign test send with Hungry Keya `final_bill` → message body shows "Namaste Guest" not "Namaste Unknown" |

---

## Regression Checks

| # | Check |
|---|---|
| R1 | Existing variables with numeric zero values (`points_balance=0`) still resolve correctly |
| R2 | `tier` variable with value `"Bronze"` / `"Silver"` — not affected |
| R3 | `restaurant_name` resolve — not affected (source is brand, not customer) |

---

```
Intake complete: BUG-020
Classification: BUG
Severity: P1
Risk: HIGH
Duplicate check: DISTINCT
Evidence: captured (INV-013A, live test, DB count)
Blast radius: LARGE (939 customers, all tenants with migrated data)
Docs: discovery/BUG_020_UNKNOWN_NAME_WHATSAPP_INTAKE.md
Next: Planning → 1 file, ~10 LOC, LOW implementation risk
```
