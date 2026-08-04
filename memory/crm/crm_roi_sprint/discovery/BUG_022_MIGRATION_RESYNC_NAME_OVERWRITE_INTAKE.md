# BUG-022 — Migration Re-Sync Overwrites CRM-Edited Customer Names with "Unknown"

**ID**: BUG-022  
**Reported**: 2026-08-04  
**Reporter**: Owner (Abhishek)  
**Role**: Intake Agent  
**Source investigation**: INV-013C  
**Status**: 🔴 OPEN  

---

## Owner Report

> "When customer name is updated from CRM it seems it doesn't get updated."
> (After investigation: the CRM update persists correctly, but is destroyed on the next migration re-sync.)

---

## Classification

| Field | Value |
|---|---|
| **Type** | BUG — destructive (migration re-sync silently overwrites manual CRM edits) |
| **Severity** | P1 — Owner manually corrects a customer name → migration re-sync resets it to "Unknown" |
| **Risk** | CRITICAL — fix touches `routers/migration.py` which writes to live customer data for ALL customers |
| **Duplicate check** | DISTINCT |
| **Blast radius** | LARGE — affects every customer whose name was manually corrected in CRM, across all tenants |

---

## Evidence

### E1 — Migration customer re-sync logic (`routers/customers.py` lines 445–464)

**Clean-slate path** (when `loyalty_enabled = True`):
```python
_allowed_keys = {
    "name", "phone", "country_code", "email", "dob",
    "anniversary", "gst_name", "gst_number",
    "pos_customer_id", "pos_id", "pos_restaurant_id",
    "mygenie_synced", "last_synced_at", "last_updated_at",
    "addresses",
}
safe_update = {k: v for k, v in customer_data.items() if k in _allowed_keys}
await db.customers.update_one({"id": existing["id"]}, {"$set": safe_update})
```

**Legacy path** (when `loyalty_enabled = None/False`):
```python
await db.customers.update_one({"id": existing["id"]}, {"$set": customer_data})
```

Both paths write `name`. `customer_data["name"]` is set at line 338:
```python
"name": mygenie_customer.get("name") or "Unknown",
```

If MyGenie POS has no name for this customer (empty string), `"" or "Unknown"` = `"Unknown"`.

### E2 — Hungry Keya confirmation

```
loyalty_enabled: None → clean_slate = False → LEGACY PATH (full $set overwrite)
All 939 "Unknown" customers have updated_at = None → set by migration
Migration run history: last ran 2026-07-17 (and 4 times on 2026-06-03)
```

### E3 — Step-by-step failure scenario

```
1. Owner opens CRM → edits customer "Unknown" → sets name = "Priya Singh" → saves ✅
2. DB: customer.name = "Priya Singh" ✅
3. Owner runs migration re-sync (MigrationPage → Sync Now)
4. Migration fetches customer from MyGenie POS → POS name = "" (never captured at POS)
5. customer_data["name"] = "" or "Unknown" = "Unknown"
6. Migration $set: {"name": "Unknown", ...} → overwrites "Priya Singh" ❌
7. DB: customer.name = "Unknown" ← all manual work lost
```

### E4 — Backend update test (confirming the CRM edit itself works)

```
update_one({"id": customer_id, "user_id": uid}, {"$set": {"name": "TEST_UPDATE"}})
→ matched=1, modified=1 ✅
Re-read → name = "TEST_UPDATE" ✅
```

The CRM edit endpoint is correct. The problem is the migration overwrite.

---

## Locked Decision

Per `DECISIONS_LOG.md § 2026-08-04 [INV-013]`:
> Migration re-sync must NOT overwrite `name` if the existing CRM customer has a non-"Unknown", non-empty name (i.e., a real manually-set value). Skip `name` from the update if `existing["name"]` is a real value.

---

## Affected File

| File | Change needed |
|---|---|
| `routers/customers.py` | Migration customer re-sync — guard: only include `name` in `safe_update` / `customer_data` if existing CRM name is blank or "Unknown" |

## Files NOT changing

`routers/pos.py`, `core/whatsapp.py`, frontend, schemas, all other files.

---

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | Customer with `name="Priya Singh"` (manually set, `updated_at` not None) → migration re-sync → `name` stays `"Priya Singh"` |
| AC-2 | Customer with `name="Unknown"` → migration re-sync → `name` updated with whatever POS sends (or stays "Unknown" if POS also has none) |
| AC-3 | Customer with `name=""` or `name=None` → migration re-sync → `name` updated with POS value |
| AC-4 | All non-name fields (phone, dob, gst_name, pos_customer_id, etc.) — update behaviour unchanged |
| AC-5 | Legacy path (clean_slate=False) — same guard applied |
| AC-6 | Clean-slate path — same guard applied |

---

## Regression Checks

| # | Check |
|---|---|
| R1 | New customer (first-time migration) — name set correctly from POS |
| R2 | Customer with name="Unknown" + POS sends real name → name updated from POS |
| R3 | Loyalty field updates (total_points, tier, total_visits) — zero change |
| R4 | `gst_name` and `gst_number` fields — update behaviour unchanged (they follow same rule: POS is the authoritative source for GST data) |

---

```
Intake complete: BUG-022
Classification: BUG
Severity: P1
Risk: CRITICAL
Duplicate check: DISTINCT
Evidence: captured (code trace, DB confirmation, migration history)
Blast radius: LARGE (all tenants, all manually-edited customers)
Docs: discovery/BUG_022_MIGRATION_RESYNC_NAME_OVERWRITE_INTAKE.md
Next: Planning → 1 file (~10 LOC guard), CRITICAL gate — owner approval required
```
