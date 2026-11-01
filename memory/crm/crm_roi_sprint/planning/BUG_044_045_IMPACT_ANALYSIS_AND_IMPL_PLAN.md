# BUG-044 + BUG-045 — Impact Analysis + Implementation Plan

**Date**: 2026-11-01
**Role**: PLANNING AGENT
**Risk**: BUG-044 LOW, BUG-045 MEDIUM
**Source**: POS team `POS_TO_CRM_CR124_VALIDATION_FINDINGS_2026_11_01.md`

---

## 0. Session Start

```
Project: MyGenie CRM
Role selected: PLANNING
Reason: 2 POS-reported gaps from CR-124 validation need IA + implementation plan
Risk level: LOW-MEDIUM (2 additive edits in pos.py + 1 schema edit, no logic rewrite)
Docs read: pos.py:2703-2706 (search projection), pos.py:2157-2231 (lookup), schemas.py:1226-1227 (POSCustomerLookup), POS validation findings
Blocked by unknowns: none
Next action: Write IA + Impl Plan → owner approval → implementation
```

---

## BUG-044: Search response missing `country_code`

### Problem
`routers/pos.py:2705` — MongoDB projection whitelist:
```python
{"_id": 0, "id": 1, "name": 1, "phone": 1, "tier": 1, "total_points": 1, "wallet_balance": 1, "last_visit": 1,
 "customer_type": 1, "is_b2b": 1, "gst_name": 1, "gst_number": 1}
```
11 fields projected. `country_code` is **not listed**. POS gets phone digits but no way to know the country.

### Root cause
`PLAN_GAP` — CR-124 IA listed this endpoint as "P8 — no change needed" because the search query itself works fine. Missed that the **response** was incomplete.

### Fix — Edit E1
**File**: `routers/pos.py`
**Line**: 2705

**Current**:
```python
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "tier": 1, "total_points": 1, "wallet_balance": 1, "last_visit": 1,
         "customer_type": 1, "is_b2b": 1, "gst_name": 1, "gst_number": 1}  # CR-071: B2B fields
```

**New**:
```python
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "country_code": 1, "tier": 1, "total_points": 1, "wallet_balance": 1, "last_visit": 1,
         "customer_type": 1, "is_b2b": 1, "gst_name": 1, "gst_number": 1}  # CR-071 + BUG-044
```

**1 field added to projection. Zero logic change.**

### Backward compatibility
- Indian customers without `country_code` stored: field returns `null` in response (MongoDB projection of absent field = not in doc). POS already handles missing fields.
- Indian customers with `country_code: "+91"`: field returns `"+91"`.
- International customers: field returns `"+44"`, `"+1"`, etc.
- **POS V5 confirmed**: Indian search `search=saurav` → PASS. Adding `country_code` to projection doesn't change Indian results.

### Verification
- T1: `GET /pos/customers?search=UK` → response includes `country_code: "+44"` on UK Guest
- T2: `GET /pos/customers?search=saurav` → response includes `country_code` ("+91" or null — both acceptable for Indian)

---

## BUG-045: Lookup does not accept `country_code`

### Problem
Two gaps in one endpoint:

**Gap A — Schema**: `models/schemas.py:1226-1227`:
```python
class POSCustomerLookup(BaseModel):
    phone: str
    # ← no country_code field
```

**Gap B — Call site**: `routers/pos.py:2165`:
```python
_ph, _cc, _pst = normalize_phone(lookup_data.phone)  # ← no cc param passed
```

**Gap C — Response**: `routers/pos.py:2208-2230` — lookup response has `phone` but **no `country_code`**.

When POS sends `{ "phone": "7911123456" }`:
1. `normalize_phone("7911123456")` → no `+` prefix, no cc_in → India path → cc=`+91`
2. `phone_match(user_id, "7911123456", "+91")` → queries `cc: {$in: ["+91", None, ""]}`
3. UK customer stored with `cc: "+44"` → **no match** → `registered: false`

### Fix — 3 edits

#### Edit E2: Add `country_code` to schema
**File**: `models/schemas.py`
**Line**: 1227

**Current**:
```python
class POSCustomerLookup(BaseModel):
    phone: str
```

**New**:
```python
class POSCustomerLookup(BaseModel):
    phone: str
    country_code: Optional[str] = None  # BUG-045: optional, default None → India path
```

#### Edit E3: Pass `country_code` to normalize_phone
**File**: `routers/pos.py`
**Line**: 2165

**Current**:
```python
    _ph, _cc, _pst = normalize_phone(lookup_data.phone)  # CR-085 W5
```

**New**:
```python
    _ph, _cc, _pst = normalize_phone(lookup_data.phone, lookup_data.country_code)  # CR-085 W5 + BUG-045
```

#### Edit E4: Add `country_code` to lookup response
**File**: `routers/pos.py`
**Line**: 2212 (after `"phone"`)

**Current**:
```python
            "phone": customer["phone"],
            "tier": customer.get("tier", "Bronze"),
```

**New**:
```python
            "phone": customer["phone"],
            "country_code": customer.get("country_code", "+91"),  # BUG-045
            "tier": customer.get("tier", "Bronze"),
```

### Backward compatibility

| POS sends | Before | After | Changed? |
|---|---|---|---|
| `{ "phone": "9876543210" }` | `normalize("9876543210")` → cc=+91 → found | `normalize("9876543210", None)` → cc=+91 → found | **NO** |
| `{ "phone": "9876543210", "country_code": "+91" }` | `country_code` silently ignored (not in schema) | `normalize("9876543210", "+91")` → cc=+91 → found | **NO** (same result) |
| `{ "phone": "7911123456" }` | cc=+91 → **not found** | cc=+91 → **not found** (same — POS must send cc) | **NO** |
| `{ "phone": "7911123456", "country_code": "+44" }` | ignored → not found | `normalize("7911123456", "+44")` → cc=+44 → **found** ✅ | **YES — NEW capability** |

**Zero regression for existing POS payloads.** The `country_code` field is `Optional[str] = None` — omitting it produces identical behavior.

### Verification
- T3: `POST /pos/customer-lookup` with `{ "phone": "7911123456", "country_code": "+44" }` → `registered: true`, response includes `country_code: "+44"`
- T4: `POST /pos/customer-lookup` with `{ "phone": "9876543210" }` (no cc) → `registered: true` (Indian — unchanged)
- T5: `POST /pos/customer-lookup` with `{ "phone": "7911123456" }` (no cc) → `registered: false` (correct — cc defaults to +91, no match for +44 customer)

---

## Combined edit map

| # | Edit | File | Line | Change | LOC |
|---|---|---|---|---|---|
| E1 | BUG-044: projection | `routers/pos.py` | 2705 | Add `"country_code": 1` | 1 |
| E2 | BUG-045: schema | `models/schemas.py` | 1227 | Add `country_code: Optional[str] = None` | 1 |
| E3 | BUG-045: normalize call | `routers/pos.py` | 2165 | Pass `lookup_data.country_code` | 1 |
| E4 | BUG-045: response | `routers/pos.py` | 2212 | Add `"country_code"` to response dict | 1 |
| **Total** | | **2 files** | | | **4 lines** |

## Files WILL change
| File | Edits |
|---|---|
| `routers/pos.py` | E1 (line 2705), E3 (line 2165), E4 (line 2212) |
| `models/schemas.py` | E2 (line 1227) |

## Files WILL NOT change
Everything else — `core/phone.py`, `routers/scan.py`, `routers/customers.py`, `core/whatsapp.py`, all frontend files, all test files.

---

## Risk: **LOW**
4 additive edits across 2 files. No logic rewrite. Optional field on schema — existing payloads unchanged. Projection addition — no query change. Response addition — additive field.

---

```
Planning complete: BUG-044 + BUG-045
Stage: Impact Analysis + Implementation Plan (combined)
Code reality: FULL — all 3 edit sites inspected line-by-line
Risk: LOW (4 lines, 2 files, additive only)
Files WILL change: routers/pos.py (3 edits), models/schemas.py (1 edit)
Files WILL NOT touch: everything else
Owner decisions: none needed — POS team already stated preference (A)
Next: Owner approval → Implementation (4 edits in 1 parallel batch)
```
