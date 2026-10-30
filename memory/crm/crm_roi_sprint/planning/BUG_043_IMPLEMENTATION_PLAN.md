# BUG-043 — Implementation Plan: Stale test assertion in `test_phone_normalize.py`

**Date**: 2026-10-30
**Role**: PLANNING AGENT
**Risk**: NONE (test-only file, zero app impact)
**Prerequisite**: IA complete (`planning/BUG041_042_043_CR125_IMPACT_ANALYSIS.md`)

---

## 1. Problem

`tests/test_phone_normalize.py:25-26`:

```python
def test_phone_match_key():
    assert phone_match("u1", "9876543210", "+91") == {"user_id": "u1", "phone": "9876543210", "country_code": "+91"}
```

CR-100 (shipped 2026-10-09, CLOSED) changed `phone_match()` to return `{"country_code": {"$in": ["+91", None, ""]}}` for +91 inputs — tolerating legacy `null`/`""` country_code docs. This test was never updated. It always fails with:

```
{'country_code': {'$in': ['+91', None, '']}} != {'country_code': '+91'}
```

Confirmed by running `pytest tests/test_phone_normalize.py -v` — **12 PASS, 1 FAIL** (only `test_phone_match_key`).

---

## 2. All tests in the file

| # | Test | Line | Status | Action |
|---|---|---|---|---|
| 1-12 | `test_normalize` (12 parametrized cases) | 7-22 | ✅ ALL PASS | No change |
| **13** | `test_phone_match_key` | 25-26 | ❌ **FAIL** — stale assertion | **FIX** |

---

## 3. Code reality: what `phone_match()` actually returns

```python
# core/phone.py:72-74
if cc == "+91":  # CR-100
    return {"user_id": user_id, "phone": phone, "country_code": {"$in": ["+91", None, ""]}}
return {"user_id": user_id, "phone": phone, "country_code": cc}
```

For `phone_match("u1", "9876543210", "+91")`:
- cc == "+91" → enters CR-100 branch
- Returns `{"user_id": "u1", "phone": "9876543210", "country_code": {"$in": ["+91", None, ""]}}`

For `phone_match("u1", "7911123456", "+44")`:
- cc != "+91" → exact match
- Returns `{"user_id": "u1", "phone": "7911123456", "country_code": "+44"}`

---

## 4. Edit

### Edit E1: Fix `test_phone_match_key` assertion + add non-India case

**File**: `tests/test_phone_normalize.py`
**Lines**: 25-27

**Current code (lines 25-26)**:
```python
def test_phone_match_key():
    assert phone_match("u1", "9876543210", "+91") == {"user_id": "u1", "phone": "9876543210", "country_code": "+91"}
```

**New code**:
```python
def test_phone_match_key():
    # CR-100: +91 uses $in tolerance for legacy null/"" country_code docs
    assert phone_match("u1", "9876543210", "+91") == {"user_id": "u1", "phone": "9876543210", "country_code": {"$in": ["+91", None, ""]}}
    # CR-124: non-India uses exact match
    assert phone_match("u1", "7911123456", "+44") == {"user_id": "u1", "phone": "7911123456", "country_code": "+44"}
```

---

## 5. Files

### WILL change
| File | Line | Change |
|---|---|---|
| `tests/test_phone_normalize.py` | 25-27 | Fix assertion + add +44 case |

### WILL NOT change
Everything else. Zero app code touched.

---

## 6. Verification

| # | Test | Method | Expected |
|---|---|---|---|
| T1 | `pytest tests/test_phone_normalize.py -v` | pytest | **13/13 PASS** (was 12/13) |

---

## 7. Risk: **NONE**
Test-only file. No app code. No owner approval needed.

---

```
Planning complete: BUG-043
Stage: Implementation Plan
Code reality: FULL — file is 27 lines, fully read
Risk: NONE
Files WILL change: tests/test_phone_normalize.py (line 25-27, fix assertion + add case)
Files WILL NOT touch: everything else
Owner decisions: none needed
Next: Implementation (1 edit, E1)
```
