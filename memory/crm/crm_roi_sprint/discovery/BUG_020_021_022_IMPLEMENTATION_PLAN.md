# BUG-020 / BUG-021 / BUG-022 — Impact Analysis + Implementation Plan

**Role**: Planning Agent  
**Date**: 2026-08-04  
**Items**: BUG-020, BUG-021, BUG-022  
**Status**: Implementation Plan complete — awaiting owner gate-open

---

## Implementation Order

These 3 bugs are **fully independent** of each other and can be implemented in parallel or any order.

```
BUG-020 → core/whatsapp.py + core/whatsapp_variables.py   (2 files, HIGH risk)
BUG-021 → routers/pos.py                                   (1 file, CRITICAL risk)
BUG-022 → routers/customers.py                             (1 file, CRITICAL risk)
```

No cross-dependencies. No shared files. No cascading effects between them.

---

---

# BUG-020 — Impact Analysis + Implementation Plan

## Impact Analysis

### Code reality

`core/whatsapp.py::resolve_variable()` line 304:
```python
if value not in (None, "", 0):
    return _format_value(value, entry.get("formatter"))
```
`"Unknown"` passes this guard → returned as-is.

`core/whatsapp_variables.py` line 28–40:
```python
{
    "key": "customer_name",
    "label": "Customer Name",
    "example": "John",
    "sources": [
        {"from": "customer", "field": "name"},
        {"from": "customer", "field": "customer_name"},
    ],
    "fills_on_events": ALL_EVENTS,
    "formatter": None,
}
```
No `"default"` key exists.

### Affected surfaces

| Surface | Impact |
|---|---|
| Every WhatsApp send for migrated customer | Returns "Unknown" → message says "Namaste Unknown" |
| Event trigger (`trigger_whatsapp_event`) | Uses `resolve_variable` ← affected |
| Campaign bulk send (`_execute_campaign_send`) | Uses `resolve_variable` ← affected |
| Campaign test send (`test_send_campaign`) | Uses `resolve_variable` ← affected |

### Files WILL change

| File | Why |
|---|---|
| `core/whatsapp_variables.py` | Add `"default": "Guest"` to `customer_name` entry |
| `core/whatsapp.py` | Add "Unknown" guard + use `entry.get("default", "")` as final return |

### Files WILL NOT change

All routers, campaign jobs, frontend, schemas, invoice generator, migration.

---

## Implementation Plan — BUG-020

### Edit A — `core/whatsapp_variables.py`: Add `default` to `customer_name`

**Line**: 39 (after `"formatter": None,`)

**Before**:
```python
    {
        "key": "customer_name",
        "label": "Customer Name",
        "example": "John",
        "description": "The customer's full name.",
        "category": "general",
        "block": "customer",
        "sources": [
            {"from": "customer", "field": "name"},
            {"from": "customer", "field": "customer_name"},
        ],
        "fills_on_events": ALL_EVENTS,
        "formatter": None,
    },
```

**After**:
```python
    {
        "key": "customer_name",
        "label": "Customer Name",
        "example": "John",
        "description": "The customer's full name.",
        "category": "general",
        "block": "customer",
        "sources": [
            {"from": "customer", "field": "name"},
            {"from": "customer", "field": "customer_name"},
        ],
        "fills_on_events": ALL_EVENTS,
        "formatter": None,
        "default": "Guest",  # BUG-020: fallback when name is blank or "Unknown"
    },
```

**Lines changed**: 1 addition.

---

### Edit B — `core/whatsapp.py`: Guard "Unknown" + use registry default

**Lines**: 304–310

**Before**:
```python
        if value not in (None, "", 0):
            return _format_value(value, entry.get("formatter"))
        # 0 is valid for integers (e.g., points_balance=0)
        if value == 0 and entry.get("formatter") in ("integer", "currency"):
            return _format_value(0, entry.get("formatter"))

    return ""
```

**After**:
```python
        # BUG-020: treat "Unknown" placeholder (any case) as blank
        if isinstance(value, str) and value.strip().lower() == "unknown":
            continue
        if value not in (None, "", 0):
            return _format_value(value, entry.get("formatter"))
        # 0 is valid for integers (e.g., points_balance=0)
        if value == 0 and entry.get("formatter") in ("integer", "currency"):
            return _format_value(0, entry.get("formatter"))

    return entry.get("default", "")  # BUG-020: use registry default ("Guest" for customer_name)
```

**Lines changed**: +2 lines (guard), 1 line modified (final return).

---

### Verification Matrix — BUG-020

| V# | Test | Expected |
|---|---|---|
| V1 | `resolve_variable("customer_name", {"name": "Unknown"})` | `"Guest"` |
| V2 | `resolve_variable("customer_name", {"name": "unknown"})` | `"Guest"` |
| V3 | `resolve_variable("customer_name", {"name": "UNKNOWN"})` | `"Guest"` |
| V4 | `resolve_variable("customer_name", {"name": None})` | `"Guest"` |
| V5 | `resolve_variable("customer_name", {"name": ""})` | `"Guest"` |
| V6 | `resolve_variable("customer_name", {"name": "Rahul Kumar"})` | `"Rahul Kumar"` |
| V7 | `resolve_variable("points_balance", {"total_points": 0})` | `"0"` (integer zero unaffected) |
| V8 | `resolve_variable("tier", {"tier": "Bronze"})` | `"Bronze"` (other vars unaffected) |
| V9 | `resolve_variable("restaurant_name", {}, {}, {"restaurant_name": "Hungry Keya"})` | `"Hungry Keya"` |
| V10 | `resolve_variable("customer_name", {"name": "Customer 8955"})` | `"Customer 8955"` (not "Unknown" — preserved) |

---

---

# BUG-021 — Impact Analysis + Implementation Plan

## Impact Analysis

### Code reality

`routers/pos.py` line 1464–1472:
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
`name` and `email` are absent.

`POSOrderWebhook` carries: `cust_name: Optional[str]`, `cust_email: Optional[str]` — both available at this point in the code as `order_data.cust_name` and `order_data.cust_email`.

### Affected surfaces

| Surface | Impact |
|---|---|
| Every POS order for existing customer | `name` / `email` never updated |
| `updated_customer` dict (line 1490) | Built from `{**customer, ...}` → uses stale name |
| WhatsApp trigger (`trigger_whatsapp_event`) | Receives stale name in `updated_customer` |

### Files WILL change

| File | Why |
|---|---|
| `routers/pos.py` | `customer_update_set` — add conditional `name` + `email` |

### Files WILL NOT change

All other files.

---

## Implementation Plan — BUG-021

### Edit A — `routers/pos.py`: Extend `customer_update_set` after line 1471

**Location**: After `"last_visit": now,` closing `}` at line 1471, before line 1473.

**Before**:
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
        customer_update_doc: Dict[str, Any] = {"$set": customer_update_set}
```

**After**:
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
        # BUG-021: update demographic fields from order when POS sends them
        if order_data.cust_name:
            customer_update_set["name"] = order_data.cust_name
        if order_data.cust_email:
            customer_update_set["email"] = order_data.cust_email
        customer_update_doc: Dict[str, Any] = {"$set": customer_update_set}
```

**Lines changed**: +4 lines.

---

### Verification Matrix — BUG-021

| V# | Test | Expected |
|---|---|---|
| V1 | Existing customer `name="Unknown"`, order `cust_name="Rahul Kumar"` → DB after | `name = "Rahul Kumar"` |
| V2 | Existing customer `name="Unknown"`, order `cust_name=None` → DB after | `name = "Unknown"` (no overwrite) |
| V3 | Existing customer `name="Unknown"`, order `cust_name=""` → DB after | `name = "Unknown"` (no overwrite) |
| V4 | Existing customer `email=None`, order `cust_email="rahul@gmail.com"` → DB after | `email = "rahul@gmail.com"` |
| V5 | Existing customer `email="rahul@gmail.com"`, order `cust_email="7505@mygenie.online"` → DB after | `email = "7505@mygenie.online"` (owner said update regardless — option b) |
| V6 | Existing customer `email="rahul@gmail.com"`, order `cust_email=None` → DB after | `email = "rahul@gmail.com"` (no overwrite) |
| V7 | `total_points`, `tier`, `total_visits` — unchanged by this edit | Loyalty fields unaffected |
| V8 | New customer creation path (`is_new = True`) | Not affected — `_find_or_create_customer` handles this |
| V9 | `updated_customer` dict reflects updated name in same order | WhatsApp trigger uses new name |

---

---

# BUG-022 — Impact Analysis + Implementation Plan

## Impact Analysis

### Code reality

**Line 338** — name set from POS:
```python
"name": mygenie_customer.get("name") or "Unknown",
```

**Lines 445–464** — re-sync update (two paths):

*Clean-slate path (line 445–459)*:
```python
_allowed_keys = {"name", "phone", ...}
safe_update = {k: v for k, v in customer_data.items() if k in _allowed_keys}
await db.customers.update_one({"id": existing["id"]}, {"$set": safe_update})
```
`"name"` is in `_allowed_keys` → always overwrites.

*Legacy path (line 460–464)*:
```python
await db.customers.update_one({"id": existing["id"]}, {"$set": customer_data})
```
Full overwrite — includes `name`.

### Guard rule (locked in DECISIONS_LOG)

```
_is_placeholder_name(name) = True  if:
    - blank / None / whitespace-only
    - "unknown" (case-insensitive)
    - starts with "customer " (case-insensitive) — e.g. "Customer 8955"

→ Only overwrite name if existing name IS a placeholder.
→ Preserve name if existing name is a real value.
```

### Files WILL change

| File | Why |
|---|---|
| `routers/customers.py` | Migration re-sync — add `_is_placeholder_name` helper + guard in both paths |

### Files WILL NOT change

All other files.

---

## Implementation Plan — BUG-022

### Edit A — Add `_is_placeholder_name` helper

**Location**: In `routers/customers.py`, near the top of the migration sync function (before line 336 — inside the `async def sync_customers_from_mygenie` function body, or as a module-level helper). Best placed as a module-level function just before the route handler, around line 220 (before the sync function).

**Code to add**:
```python
def _is_placeholder_name(name) -> bool:
    """BUG-022: True if the name is a migration placeholder — safe to overwrite."""
    if not name or not str(name).strip():
        return True
    n = str(name).strip().lower()
    return n == "unknown" or n.startswith("customer ")
```

**Lines added**: 6.

---

### Edit B — Clean-slate path guard (line 453–455)

**Before**:
```python
                            safe_update = {
                                k: v for k, v in customer_data.items() if k in _allowed_keys
                            }
```

**After**:
```python
                            safe_update = {
                                k: v for k, v in customer_data.items() if k in _allowed_keys
                            }
                            # BUG-022: preserve manually-set CRM name on re-sync
                            if not _is_placeholder_name(existing.get("name")):
                                safe_update.pop("name", None)
```

**Lines added**: 2.

---

### Edit C — Legacy path guard (line 460–464)

**Before**:
```python
                        else:
                            await db.customers.update_one(
                                {"id": existing["id"]},
                                {"$set": customer_data}
                            )
```

**After**:
```python
                        else:
                            # BUG-022: preserve manually-set CRM name on re-sync
                            legacy_update = dict(customer_data)
                            if not _is_placeholder_name(existing.get("name")):
                                legacy_update.pop("name", None)
                            await db.customers.update_one(
                                {"id": existing["id"]},
                                {"$set": legacy_update}
                            )
```

**Lines changed**: +3 lines (dict copy + guard + use `legacy_update`). The `$set customer_data` line is replaced by `$set legacy_update`.

---

### Verification Matrix — BUG-022

| V# | Test | Expected |
|---|---|---|
| V1 | `_is_placeholder_name("Unknown")` | `True` |
| V2 | `_is_placeholder_name("unknown")` | `True` |
| V3 | `_is_placeholder_name("UNKNOWN")` | `True` |
| V4 | `_is_placeholder_name("Customer 8955")` | `True` |
| V5 | `_is_placeholder_name("customer 1234")` | `True` |
| V6 | `_is_placeholder_name("")` | `True` |
| V7 | `_is_placeholder_name(None)` | `True` |
| V8 | `_is_placeholder_name("Priya Singh")` | `False` |
| V9 | `_is_placeholder_name("saurav")` | `False` |
| V10 | Re-sync for customer `name="Priya Singh"`, POS sends `name=""` → DB after | `name = "Priya Singh"` (preserved) |
| V11 | Re-sync for customer `name="Unknown"`, POS sends `name=""` → DB after | `name = "Unknown"` (POS had nothing — stays as-is; not worse) |
| V12 | Re-sync for customer `name="Unknown"`, POS sends `name="Rahul Kumar"` → DB after | `name = "Rahul Kumar"` (updated from POS) |
| V13 | Re-sync for customer `name="Customer 8955"`, POS sends `name="Priya"` → DB after | `name = "Priya"` (placeholder overwritten) |
| V14 | New customer (first sync, not `existing`) — no guard applied | Name set from POS normally |
| V15 | `gst_name`, `gst_number`, `phone`, `dob` — unchanged by this edit | All other fields unaffected |

---

## Combined Regression Checklist

| # | Check | Covers |
|---|---|---|
| R1 | WhatsApp send for customer with `name="Unknown"` → "Namaste Guest" | BUG-020 |
| R2 | WhatsApp send for customer with real name → original name used | BUG-020 regression |
| R3 | `points_balance=0` still renders as "0" not "" | BUG-020 regression |
| R4 | POS order with `cust_name="Rahul"` for existing Unknown customer → name updated | BUG-021 |
| R5 | POS order with `cust_name=None` → existing name unchanged | BUG-021 regression |
| R6 | Points / tier on order unaffected | BUG-021 regression |
| R7 | Migration re-sync preserves "Priya Singh" | BUG-022 |
| R8 | Migration re-sync updates name when existing is "Unknown" + POS has real name | BUG-022 regression |
| R9 | New customer first-time migration sets name correctly | BUG-022 regression |

---

## Edit Summary (all 3 bugs)

| Bug | File | Edits | Lines changed |
|---|---|---|---|
| BUG-020-A | `core/whatsapp_variables.py` | Add `"default": "Guest"` | +1 line |
| BUG-020-B | `core/whatsapp.py` | "Unknown" guard + `entry.get("default", "")` | +3 lines |
| BUG-021-A | `routers/pos.py` | Conditional name + email in `customer_update_set` | +4 lines |
| BUG-022-A | `routers/customers.py` | `_is_placeholder_name` helper | +6 lines |
| BUG-022-B | `routers/customers.py` | Clean-slate path guard | +2 lines |
| BUG-022-C | `routers/customers.py` | Legacy path guard | +3 lines |
| **Total** | **3 files** | **6 edits** | **~19 lines** |

---

```
Planning complete: BUG-020, BUG-021, BUG-022
Stage: Impact Analysis + Implementation Plan
Code reality: FULL — all edit points confirmed with exact line numbers
Risk: HIGH (BUG-020) / CRITICAL (BUG-021, BUG-022)
Files WILL change: core/whatsapp_variables.py, core/whatsapp.py, routers/pos.py, routers/customers.py
Files WILL NOT touch: schemas.py, routers/auth.py, routers/campaigns.py, core/coupon.py,
                      core/loyalty.py, core/campaign_jobs.py, all frontend files
Owner decisions: ALL LOCKED (no open questions)
Docs: discovery/BUG_020_021_022_IMPLEMENTATION_PLAN.md
Next: Owner says "go" → Implementation Agent executes 6 edits
```
