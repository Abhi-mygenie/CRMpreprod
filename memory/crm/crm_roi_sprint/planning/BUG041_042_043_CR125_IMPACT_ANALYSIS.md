# Impact Analysis — BUG-041 · BUG-042 · BUG-043 · CR-125 (Batch)

**Date**: 2026-10-30
**Role**: PLANNING AGENT
**Source**: CR-124 QA Report (iteration_2.json, findings N1/F1/N2/N4)

---

## 0. Session Start

```
Project: MyGenie CRM
Role selected: PLANNING
Reason: 4 registered items from CR-124 QA need Impact Analysis before Bug Fix
Risk level: LOW-MEDIUM (batch of small fixes, no shared state between them)
Docs read: BUG_REGISTRY entries, core/whatsapp.py, models/schemas.py, routers/customers.py, tests/test_phone_normalize.py, core/phone.py
Blocked by unknowns: none
Next action: Write IA + Implementation Plan (combined — all items are small)
```

---

## BUG-041 — WhatsApp send crashes on `country_code: null` customers

### Problem
`core/whatsapp.py:836`:
```python
country_code = customer.get("country_code", "+91").replace("+", "")
```
`dict.get(key, default)` returns the default only when the key is **absent**. When the key exists but value is `None`, it returns `None`. `.replace()` on `None` → `AttributeError`.

53 legacy customers have `country_code: null` (CR-100 documented). Line 913 already has the safe pattern: `(customer.get("country_code", "+91") or "+91").replace("+", "")`.

Also found: `core/whatsapp.py:63` — `message.country_code.replace("+", "")`. This is safe because `WhatsAppMessage.country_code` is a `str` field (Pydantic enforces non-None). **No fix needed on line 63.**

### Fix
**File**: `core/whatsapp.py`
**Line**: 836

| Current | New |
|---|---|
| `customer.get("country_code", "+91").replace("+", "")` | `(customer.get("country_code") or "+91").replace("+", "")` |

**1 line. 1 file. Zero risk to other flows.**

### Files WILL change
| File | Line | Change |
|---|---|---|
| `core/whatsapp.py` | 836 | `or "+91"` null guard |

### Files WILL NOT change
Everything else — this is a pure null-safety fix on one line.

### Verification
- V1: Unit — `(None or "+91").replace("+","")` == `"91"` ✅
- V2: Unit — `("+44" or "+91").replace("+","")` == `"44"` ✅ (non-India unaffected)
- V3: Unit — `("+91" or "+91").replace("+","")` == `"91"` ✅ (India unaffected)

### Risk: **LOW**

---

## BUG-042 — CSV import preview missing `country_code` in response

### Problem
`models/schemas.py:1292` `ImportPreviewRow`:
```python
class ImportPreviewRow(BaseModel):
    row: int
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    tags: Optional[str] = None
    status: str
    reason: Optional[str] = None
```
No `country_code` field. `routers/customers.py:1562` preview builder doesn't pass it either.

CR-124's `_validate_and_classify_row()` returns `country_code` in the result dict, but it's never surfaced to the frontend.

### Fix
**File 1**: `models/schemas.py` line 1295 (after `phone`)
**Insert**:
```python
    country_code: Optional[str] = None  # CR-124 / BUG-042
```

**File 2**: `routers/customers.py` line 1565 (after `phone = r.get("phone")`)
**Insert**:
```python
            country_code = r.get("country_code"),  # BUG-042
```

**2 files. 2 lines. Zero risk.**

### Files WILL change
| File | Line | Change |
|---|---|---|
| `models/schemas.py` | after 1295 | Add `country_code` field |
| `routers/customers.py` | after 1565 | Pass `country_code` to preview row |

### Files WILL NOT change
Everything else — additive field on a response model.

### Verification
- V1: POST /api/customers/import-preview with CSV `name,phone,country_code` → response `preview_rows[0]` contains `country_code: "+44"`
- V2: POST with CSV without cc column → `country_code: "+91"` (default)

### Risk: **LOW**

---

## BUG-043 — Stale test assertion in `test_phone_normalize.py`

### Problem
`tests/test_phone_normalize.py:26`:
```python
def test_phone_match_key():
    assert phone_match("u1", "9876543210", "+91") == {"user_id": "u1", "phone": "9876543210", "country_code": "+91"}
```
CR-100 changed `phone_match()` to return `{"country_code": {"$in": ["+91", None, ""]}}` for +91. Test expects the old exact-match form.

### Fix
**File**: `tests/test_phone_normalize.py` line 26

| Current | New |
|---|---|
| `== {"user_id": "u1", "phone": "9876543210", "country_code": "+91"}` | `== {"user_id": "u1", "phone": "9876543210", "country_code": {"$in": ["+91", None, ""]}}` |

**1 line. 1 file. Zero app risk (test-only).**

### Verification
- Run: `pytest tests/test_phone_normalize.py -v` → all PASS

### Risk: **NONE** (test file only)

---

## CR-125 — Extend `_KNOWN_CC` prefix set for raw E.164 parsing

### Problem
`core/phone.py:9-12` — `_KNOWN_CC` has 14 prefixes. Numbers from unlisted countries (e.g. `+27` South Africa, `+7` Russia) fall back to greedy regex `\d{1,4}` which mis-splits: `+27821234567` → cc=`+2782`, phone=`1234567`.

Only affects raw E.164 input **without** explicit `country_code` from dropdown. When user picks cc from the UI, it always works.

### Fix
**File**: `core/phone.py` lines 9-12

Add high-traffic hotel guest origins:

| Current (14) | Add (8) | Total |
|---|---|---|
| +1, +33, +39, +44, +49, +61, +65, +81, +86, +91, +353, +852, +966, +971 | **+7** (Russia), **+27** (South Africa), **+34** (Spain), **+62** (Indonesia), **+66** (Thailand), **+82** (South Korea), **+234** (Nigeria), **+254** (Kenya) | **22** |

**1 edit. 1 file. Zero logic change — just extending a lookup set.**

### Verification
- Unit: `normalize_phone("+27821234567")` → `("821234567", "+27", "fixed")` ✅
- Unit: `normalize_phone("+79161234567")` → `("9161234567", "+7", "fixed")` ✅
- Regression: Indian numbers unchanged

### Risk: **LOW**

---

## Combined Implementation Plan

| # | Edit | File | Line | LOC | Marker |
|---|---|---|---|---|---|
| E1 | BUG-041: null-cc guard | `core/whatsapp.py` | 836 | 1 | `# BUG-041` |
| E2 | BUG-042: schema field | `models/schemas.py` | after 1295 | 1 | `# BUG-042` |
| E3 | BUG-042: preview builder | `routers/customers.py` | after 1565 | 1 | `# BUG-042` |
| E4 | BUG-043: test assertion | `tests/test_phone_normalize.py` | 26 | 1 | `# BUG-043` |
| E5 | CR-125: extend prefixes | `core/phone.py` | 9-12 | 2 | `# CR-125` |
| **Total** | | **5 files** | | **6 lines** | |

### Files WILL NOT change
`routers/pos.py`, `routers/scan.py`, `routers/auth.py`, `routers/campaigns.py`, `routers/whatsapp.py`, `core/loyalty.py`, `core/coupon.py`, `core/campaign_jobs.py`, `services/*`, all frontend files.

### Conflict check
Zero conflicts. All 5 edits are in different files or non-overlapping lines. Can execute in parallel.

### Verification matrix (combined)

| # | Test | Item | Method |
|---|---|---|---|
| T1 | `(None or "+91").replace("+","")` == `"91"` | BUG-041 | python3 -c |
| T2 | Import preview returns `country_code: "+44"` | BUG-042 | curl |
| T3 | `pytest tests/test_phone_normalize.py -v` → all PASS | BUG-043 | pytest |
| T4 | `normalize_phone("+27821234567")` → cc=`"+27"` | CR-125 | python3 -c |
| T5 | `normalize_phone("+79161234567")` → cc=`"+7"` | CR-125 | python3 -c |
| T6 | Indian unchanged: `normalize_phone("9876543210")` → same | ALL | python3 -c |

---

```
Planning complete: BUG-041 + BUG-042 + BUG-043 + CR-125
Stage: Impact Analysis + Implementation Plan (combined)
Code reality: FULL — all 5 edit sites inspected line-by-line
Risk: LOW (6 lines across 5 files, no shared state, no hotspot files)
Files WILL change: core/whatsapp.py, models/schemas.py, routers/customers.py, tests/test_phone_normalize.py, core/phone.py
Files WILL NOT touch: all other files
Owner decisions: none needed (all items are bug fixes / test maintenance / additive extension)
Next: Owner approval → Implementation (all 5 edits in one parallel batch)
```
