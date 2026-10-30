# CR-125 — Implementation Plan: Extend `_KNOWN_CC` prefix set

**Date**: 2026-10-30
**Role**: PLANNING AGENT
**Risk**: LOW (extending a lookup set, zero logic change)
**Prerequisite**: IA complete (`planning/BUG041_042_043_CR125_IMPACT_ANALYSIS.md`)

---

## 1. Problem

`core/phone.py:9-12` — `_KNOWN_CC` has 14 prefixes. When a raw E.164 string arrives without explicit `cc_in` (e.g. POS order webhook `cust_mobile="+27821234567"`), the code tries known prefixes longest-first. If no match, falls back to greedy regex `\d{1,4}` which mis-splits:

| Raw input | Current result (WRONG) | Expected |
|---|---|---|
| `+27821234567` | cc=`+2782` phone=`1234567` | cc=`+27` phone=`821234567` |
| `+79161234567` | cc=`+7916` phone=`1234567` | cc=`+7` phone=`9161234567` |
| `+34612345678` | cc=`+3461` phone=`2345678` | cc=`+34` phone=`612345678` |
| `+62812345678` | cc=`+6281` phone=`2345678` | cc=`+62` phone=`812345678` |
| `+66812345678` | cc=`+6681` phone=`2345678` | cc=`+66` phone=`812345678` |
| `+82101234567` | cc=`+8210` phone=`1234567` | cc=`+82` phone=`101234567` |
| `+2348012345678` | cc=`+2348` phone=`012345678` | cc=`+234` phone=`8012345678` |
| `+254712345678` | cc=`+2547` phone=`12345678` | cc=`+254` phone=`712345678` |

**Only affects raw E.164 without explicit cc dropdown.** When user/POS picks cc from dropdown, the `cc_in` branch handles it correctly regardless of `_KNOWN_CC`.

---

## 2. Fix: extend `_KNOWN_CC` with high-traffic hotel guest origins

### Current set (14 prefixes):
```python
_KNOWN_CC = frozenset({
    "+1", "+33", "+39", "+44", "+49", "+61", "+65", "+81", "+86",
    "+91", "+353", "+852", "+966", "+971",
})
```

### Countries to add (8 prefixes):

| Code | Country | Reason |
|---|---|---|
| `+7` | Russia / Kazakhstan | Hotel guests, 1-digit cc (greedy regex always misses) |
| `+27` | South Africa | Hotel guests |
| `+34` | Spain | European tourists |
| `+62` | Indonesia | SE Asian tourists |
| `+66` | Thailand | SE Asian tourists |
| `+82` | South Korea | Asian tourists |
| `+234` | Nigeria | African business travelers |
| `+254` | Kenya | African business travelers |

### New set (22 prefixes):
```python
_KNOWN_CC = frozenset({
    "+1", "+7", "+27", "+33", "+34", "+39", "+44", "+49",
    "+61", "+62", "+65", "+66", "+81", "+82", "+86",
    "+91", "+234", "+254", "+353", "+852", "+966", "+971",
})
```

---

## 3. Edit

### Edit E1: Extend `_KNOWN_CC` frozenset

**File**: `core/phone.py`
**Lines**: 9-12

**Current code**:
```python
_KNOWN_CC = frozenset({
    "+1", "+33", "+39", "+44", "+49", "+61", "+65", "+81", "+86",
    "+91", "+353", "+852", "+966", "+971",
})
```

**New code**:
```python
# CR-125: extended to 22 prefixes (hotel guest high-traffic origins)
_KNOWN_CC = frozenset({
    "+1", "+7", "+27", "+33", "+34", "+39", "+44", "+49",
    "+61", "+62", "+65", "+66", "+81", "+82", "+86",
    "+91", "+234", "+254", "+353", "+852", "+966", "+971",
})
```

---

## 4. Files

### WILL change
| File | Line | Change |
|---|---|---|
| `core/phone.py` | 9-12 | Extend frozenset from 14 → 22 entries |

### WILL NOT change
Everything else. Zero logic change — same detection algorithm, just more entries in the lookup set.

---

## 5. Verification

| # | Test | Method | Expected |
|---|---|---|---|
| T1 | `normalize_phone("+27821234567")` | `python3 -c` | `("821234567", "+27", "fixed")` |
| T2 | `normalize_phone("+79161234567")` | `python3 -c` | `("9161234567", "+7", "fixed")` |
| T3 | `normalize_phone("+34612345678")` | `python3 -c` | `("612345678", "+34", "fixed")` |
| T4 | `normalize_phone("+62812345678")` | `python3 -c` | `("812345678", "+62", "fixed")` |
| T5 | `normalize_phone("+2348012345678")` | `python3 -c` | `("8012345678", "+234", "fixed")` |
| T6 | `normalize_phone("+254712345678")` | `python3 -c` | `("712345678", "+254", "fixed")` |
| T7 | Indian unchanged: `normalize_phone("9876543210")` | `python3 -c` | `("9876543210", "+91", "ok")` |
| T8 | Existing +44 unchanged: `normalize_phone("+447911123456")` | `python3 -c` | `("7911123456", "+44", "fixed")` |
| T9 | `pytest tests/test_phone_normalize.py -v` | pytest | 13/13 PASS |

---

## 6. Risk: **LOW**
Extending a frozen lookup set. Same algorithm, more data. Indian path and all existing prefixes completely untouched. All 14 existing entries preserved; 8 new entries added.

---

```
Planning complete: CR-125
Stage: Implementation Plan
Code reality: FULL — _KNOWN_CC frozenset and detection loop inspected
Risk: LOW
Files WILL change: core/phone.py (lines 9-12, extend frozenset)
Files WILL NOT touch: everything else
Owner decisions: none needed
Next: Implementation (1 edit, E1)
```
