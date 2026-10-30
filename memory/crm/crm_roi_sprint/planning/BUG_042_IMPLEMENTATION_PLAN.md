# BUG-042 — Implementation Plan: CSV import preview missing `country_code`

**Date**: 2026-10-30
**Role**: PLANNING AGENT
**Risk**: LOW (additive optional field on response model + 1 line in builder)
**Prerequisite**: IA complete (`planning/BUG041_042_043_CR125_IMPACT_ANALYSIS.md`)

---

## 1. Problem

CR-124 added `country_code` to the CSV classification result (`_validate_and_classify_row()` returns `country_code` in its dict at line 138). But two places were missed:

1. `models/schemas.py:1292` — `ImportPreviewRow` schema has no `country_code` field
2. `routers/customers.py:1562` — preview builder doesn't pass `country_code` to the row

Result: import preview API response shows name/phone/status but **not** which country code was detected. The import **commit** works correctly (stores cc via line 1637), only the **preview** is blind.

---

## 2. Code reality

### File 1: `models/schemas.py` lines 1292-1299

```python
class ImportPreviewRow(BaseModel):
    row: int
    name: Optional[str] = None
    phone: Optional[str] = None          # ← country_code should follow here
    email: Optional[str] = None
    tags: Optional[str] = None
    status: str
    reason: Optional[str] = None
```

**Missing**: `country_code` field after `phone`.

### File 2: `routers/customers.py` lines 1562-1570

```python
    preview_rows.append(ImportPreviewRow(
        row    = r["row"],
        name   = r.get("name"),
        phone  = r.get("phone"),          # ← country_code should follow here
        email  = r.get("email"),
        tags   = ", ".join(r["tags"]) if isinstance(r.get("tags"), list) else r.get("tags"),
        status = r["status"],
        reason = r.get("reason"),
    ))
```

**Missing**: `country_code = r.get("country_code")` after `phone`.

---

## 3. Edits

### Edit E1: Add `country_code` field to `ImportPreviewRow`

**File**: `models/schemas.py`
**Line**: 1295 (after `phone`)

**Current (lines 1294-1296)**:
```python
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
```

**New**:
```python
    name: Optional[str] = None
    phone: Optional[str] = None
    country_code: Optional[str] = None    # BUG-042: surface cc in preview
    email: Optional[str] = None
```

### Edit E2: Pass `country_code` in preview builder

**File**: `routers/customers.py`
**Line**: 1565 (after `phone`)

**Current (lines 1564-1566)**:
```python
            name   = r.get("name"),
            phone  = r.get("phone"),
            email  = r.get("email"),
```

**New**:
```python
            name   = r.get("name"),
            phone  = r.get("phone"),
            country_code = r.get("country_code"),  # BUG-042
            email  = r.get("email"),
```

---

## 4. Files

### WILL change
| File | Line | Change |
|---|---|---|
| `models/schemas.py` | after 1295 | Add `country_code: Optional[str] = None` |
| `routers/customers.py` | after 1565 | Pass `country_code = r.get("country_code")` |

### WILL NOT change
Everything else — `core/phone.py`, `core/whatsapp.py`, all other routers, all frontend files, all test files.

---

## 5. Verification

| # | Test | Method | Expected |
|---|---|---|---|
| T1 | POST `/api/customers/import-preview` with CSV `name,phone,country_code` rows including `+44` | curl | `preview_rows[0].country_code == "+44"` |
| T2 | POST `/api/customers/import-preview` with CSV without `country_code` column | curl | `preview_rows[0].country_code == "+91"` (default) |
| T3 | Backend compiles clean | `curl /api/health` | `{"status":"healthy"}` |

---

## 6. Risk: **LOW**
Additive optional field on a response model. Nothing reads it yet on the frontend — the field simply becomes available in the API response for future UI display.

---

```
Planning complete: BUG-042
Stage: Implementation Plan
Code reality: FULL — both edit sites inspected
Risk: LOW
Files WILL change: models/schemas.py (1 line), routers/customers.py (1 line)
Files WILL NOT touch: everything else
Owner decisions: none needed
Next: Implementation (2 edits, E1 + E2)
```
