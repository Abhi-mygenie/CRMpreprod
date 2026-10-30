# BUG-041 — Implementation Plan: WhatsApp null country_code crash fix

**Date**: 2026-10-30
**Role**: PLANNING AGENT
**Risk**: LOW
**Prerequisite**: IA complete (`planning/BUG041_042_043_CR125_IMPACT_ANALYSIS.md`)

---

## 1. Problem

`core/whatsapp.py:836` — the `send_event_message()` function:

```python
country_code = customer.get("country_code", "+91").replace("+", "")
```

Python's `dict.get(key, default)` returns the default **only when the key is absent**. When the key exists but value is `None`, it returns `None`. Calling `.replace()` on `None` raises `AttributeError`.

53 legacy customers (CR-100 documented) have `country_code: null` in MongoDB. Any WhatsApp send to these customers crashes.

---

## 2. All `country_code` read sites in `core/whatsapp.py`

| Line | Code | Safe? | Action |
|---|---|---|---|
| **63** | `message.country_code.replace("+", "")` | ✅ **Safe** — `WhatsAppMessage.country_code` is a Pydantic `str` field, never `None` | No change |
| **621** | `cc_normalized = (country_code or "91").replace("+", "").strip() or "91"` | ✅ **Safe** — already uses `or` guard | No change |
| **836** | `customer.get("country_code", "+91").replace("+", "")` | ❌ **CRASHES** on `None` | **FIX** |
| **913** | `(customer.get("country_code", "+91") or "+91").replace("+", "")` | ✅ **Safe** — already has `or` guard | No change |

**Only line 836 needs fixing.** The safe pattern already exists at line 913 in the same file.

---

## 3. Edit

### Edit E1: Add `or` null guard on line 836

**File**: `core/whatsapp.py`
**Line**: 836
**Marker**: `# BUG-041`

**Current code (line 836)**:
```python
        country_code = customer.get("country_code", "+91").replace("+", "")
```

**New code**:
```python
        country_code = (customer.get("country_code") or "+91").replace("+", "")  # BUG-041: null-safe
```

**What changes**: Drops the `default="+91"` arg from `.get()` (useless when key exists with `None` value). Adds `or "+91"` which catches both missing key AND `None` value. Matches line 913's pattern exactly.

**What does NOT change**: Every other line in the file. No logic change — only null safety.

---

## 4. Behavioral proof

| `customer["country_code"]` value | Before (crashes?) | After |
|---|---|---|
| `"+91"` | `"+91".replace("+","")` → `"91"` ✅ | `("+91" or "+91").replace("+","")` → `"91"` ✅ |
| `"+44"` | `"+44".replace("+","")` → `"44"` ✅ | `("+44" or "+91").replace("+","")` → `"44"` ✅ |
| `None` | `None.replace("+","")` → **💥 AttributeError** | `(None or "+91").replace("+","")` → `"91"` ✅ |
| `""` | `"".replace("+","")` → `""` (empty cc sent!) | `("" or "+91").replace("+","")` → `"91"` ✅ (bonus fix) |
| key absent | `"+91".replace("+","")` → `"91"` ✅ | `(None or "+91").replace("+","")` → `"91"` ✅ |

---

## 5. Files

### WILL change
| File | Line | Change |
|---|---|---|
| `core/whatsapp.py` | 836 | 1-line null guard |

### WILL NOT change
Everything else. Specifically: `core/phone.py`, `routers/*.py`, `models/schemas.py`, `services/*`, all frontend files, all test files.

---

## 6. Verification

| # | Test | Method | Expected |
|---|---|---|---|
| T1 | `(None or "+91").replace("+","")` | `python3 -c` | `"91"` |
| T2 | `("" or "+91").replace("+","")` | `python3 -c` | `"91"` |
| T3 | `("+44" or "+91").replace("+","")` | `python3 -c` | `"44"` |
| T4 | `("+91" or "+91").replace("+","")` | `python3 -c` | `"91"` |
| T5 | Backend compiles clean after edit | `curl /api/health` | `{"status":"healthy"}` |
| T6 | Existing CR-124 QA tests still pass | `pytest tests/test_cr124_qa_full.py` | All PASS |

---

## 7. Risk

| Factor | Rating | Reason |
|---|---|---|
| Scope | 1 line, 1 file | Minimal surface |
| Hotspot file? | No — `core/whatsapp.py` is HIGH per addendum but this is a null guard, not logic change | |
| Regression | None — behavior identical for all non-null values (proof table §4) | |
| Rollback | Trivial — revert 1 line | |

**Overall: LOW. No owner approval needed (per addendum §7 — not changing send/resend logic, just null-safety).**

---

```
Planning complete: BUG-041
Stage: Implementation Plan
Code reality: FULL — all 4 cc-read sites in whatsapp.py audited
Risk: LOW
Files WILL change: core/whatsapp.py (line 836, 1 line)
Files WILL NOT touch: everything else
Owner decisions: none needed
Next: Implementation (1 edit, E1)
```
