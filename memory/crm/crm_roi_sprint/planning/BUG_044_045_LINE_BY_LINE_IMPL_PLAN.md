# BUG-044 + BUG-045 — Line-by-Line Implementation Plan

**Date**: 2026-11-01
**Role**: PLANNING AGENT
**Risk**: LOW (4 lines, 2 files, all additive)
**Prerequisite**: IA complete (`planning/BUG_044_045_IMPACT_ANALYSIS_AND_IMPL_PLAN.md`)

---

## Edit E1 — BUG-044: Add `country_code` to search projection

**File**: `routers/pos.py`
**Line**: 2705

**Current code (line 2705-2706)**:
```python
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "tier": 1, "total_points": 1, "wallet_balance": 1, "last_visit": 1,
         "customer_type": 1, "is_b2b": 1, "gst_name": 1, "gst_number": 1}  # CR-071: B2B fields
```

**New code**:
```python
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "country_code": 1, "tier": 1, "total_points": 1, "wallet_balance": 1, "last_visit": 1,
         "customer_type": 1, "is_b2b": 1, "gst_name": 1, "gst_number": 1}  # CR-071 + BUG-044
```

**What changes**: `"country_code": 1` inserted after `"phone": 1`. Comment updated.
**What does NOT change**: Query, sort, limit, response builder — all untouched.

---

## Edit E2 — BUG-045: Add `country_code` to `POSCustomerLookup` schema

**File**: `models/schemas.py`
**Line**: 1227

**Current code (lines 1226-1227)**:
```python
class POSCustomerLookup(BaseModel):
    phone: str
```

**New code**:
```python
class POSCustomerLookup(BaseModel):
    phone: str
    country_code: Optional[str] = None  # BUG-045: optional, default None → India path
```

**What changes**: One optional field added. Existing `{ "phone": "..." }` payloads still valid (field defaults to `None`).

---

## Edit E3 — BUG-045: Pass `country_code` to `normalize_phone()`

**File**: `routers/pos.py`
**Line**: 2165

**Current code**:
```python
    _ph, _cc, _pst = normalize_phone(lookup_data.phone)  # CR-085 W5
```

**New code**:
```python
    _ph, _cc, _pst = normalize_phone(lookup_data.phone, lookup_data.country_code)  # CR-085 W5 + BUG-045
```

**What changes**: Second argument added. When `country_code` is `None` (old payloads), `normalize_phone(phone, None)` behaves identically to `normalize_phone(phone)`.

---

## Edit E4 — BUG-045: Add `country_code` to lookup response

**File**: `routers/pos.py`
**Line**: 2212

**Current code (lines 2212-2213)**:
```python
            "phone": customer["phone"],
            "tier": customer.get("tier", "Bronze"),
```

**New code**:
```python
            "phone": customer["phone"],
            "country_code": customer.get("country_code", "+91"),  # BUG-045
            "tier": customer.get("tier", "Bronze"),
```

**What changes**: One additive field in response dict. POS now receives `country_code` alongside `phone`.

---

## Verification

| # | Test | Method | Expected |
|---|---|---|---|
| T1 | `GET /pos/customers?search=UK` | curl | Response includes `country_code: "+44"` on UK Guest |
| T2 | `GET /pos/customers?search=saurav` | curl | Response includes `country_code` ("+91" or absent — Indian) |
| T3 | `POST /pos/customer-lookup` with `{ "phone": "7911123456", "country_code": "+44" }` | curl | `registered: true`, response has `country_code: "+44"` |
| T4 | `POST /pos/customer-lookup` with `{ "phone": "9876543210" }` (no cc) | curl | `registered: true` — Indian unchanged |
| T5 | `POST /pos/customer-lookup` with `{ "phone": "7911123456" }` (no cc) | curl | `registered: false` — correct (defaults +91, can't match +44) |
| T6 | Backend healthy | curl /api/health | `{"status":"healthy"}` |

---

```
Planning complete: BUG-044 + BUG-045
Stage: Line-by-line Implementation Plan
Code reality: FULL — all 4 edit sites verified to exact line
Risk: LOW
Files WILL change: routers/pos.py (E1, E3, E4), models/schemas.py (E2)
Files WILL NOT touch: everything else
Owner decisions: none needed
Next: Implementation (4 edits, 1 parallel batch)
```
