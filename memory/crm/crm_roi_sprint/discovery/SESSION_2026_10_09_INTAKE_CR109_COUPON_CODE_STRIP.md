# CR-109 — Intake: Add `.strip()` to coupon `code` at write time (prevent trailing-space recurrence)
**Date**: 2026-10-09 · **Role**: Intake Agent · **Source**: CR-108 forward-fix note (2026-10-09) · **No code changed.**

---

## 1. Owner Request
> "Register follow-up CR to add `.strip().upper()` during coupon create/update to prevent similar issues." — Owner 2026-10-09, following CR-108 data fix.

---

## 2. Problem

CR-108 fixed the 3 existing trailing-space coupon codes in the DB. But **the root cause was never addressed** — the CRM create/update routes call `.upper()` on the `code` field but never `.strip()`. Any new coupon created or edited with a trailing space will produce the same `INVALID_CODE` bug immediately.

---

## 3. Code reality (read-only, confirmed 2026-10-09)

### `routers/coupons.py` — CRM coupon management

| Line | Function | Current code | Gap |
|---|---|---|---|
| 16 | `create_coupon` dup check | `coupon_data.code.upper()` | no `.strip()` |
| **26** | **`create_coupon` store** | **`coupon_data.code.upper()`** | **no `.strip()` — root cause** |
| 130 | `update_coupon` code prep | `update_data["code"].upper()` | no `.strip()` |
| 131–133 | `update_coupon` dup check | `update_data["code"]` (already uppercased without strip) | no `.strip()` |

### `routers/pos_coupons.py` — POS coupon management (CR-081)

| Line | Function | Current code | Gap |
|---|---|---|---|
| 77 | `create_pos_coupon` dup check | `coupon_data.code.upper()` | no `.strip()` |
| **87** | **`create_pos_coupon` store** | **`coupon_data.code.upper()`** | **no `.strip()` — root cause** |
| 119 | `update_pos_coupon` code prep | `update["code"].upper()` | no `.strip()` |

**Total: 6 occurrences across 2 files.** Fix pattern: `x.upper()` → `x.strip().upper()`

---

## 4. Classification

| Field | Value |
|---|---|
| **Type** | CR — code change (preventive) |
| **Severity** | **P2** — not breaking right now (CR-108 cleaned data), but WILL recur on any new coupon with accidental whitespace |
| **Risk** | **LOW** — 2-char addition per line; write path only; no §14 hotspot; fully backward compatible |
| **Duplicate check** | **DISTINCT** from CR-108 (data fix) · **DISTINCT** from CR-081 (coupon CRUD) · **DISTINCT** from all open CRs |
| **Blast radius** | **SMALL** — 6 lines across 2 files; no schema change; no DB migration; no test rewrite |

---

## 5. Fix sketch

```python
# Every occurrence: change  .code.upper()  →  .code.strip().upper()

# coupons.py:16
coupon_data.code.strip().upper()       # dup check
# coupons.py:26
coupon_data.code.strip().upper()       # store
# coupons.py:130
update_data["code"].strip().upper()    # update prep

# pos_coupons.py:77
coupon_data.code.strip().upper()       # dup check
# pos_coupons.py:87
coupon_data.code.strip().upper()       # store
# pos_coupons.py:119
update["code"].strip().upper()         # update prep
```

**No schema change. No DB migration. No index change.**

---

## 6. Verification sketch

| V | Check | Expected |
|---|---|---|
| V1 | `POST /api/coupons` with `code: " SAVE10 "` | stored as `"SAVE10"` |
| V2 | `PUT /api/coupons/:id` with `code: " NEW CODE "` | updated to `"NEW CODE"` |
| V3 | `POST /api/pos/coupons` with `code: " POS10 "` | stored as `"POS10"` |
| V4 | Dup check: create second coupon `" SAVE10 "` on same tenant | 400 "already exists" |
| V5 | Existing test suites (`test_cr001c_*`, `test_cr021_*`, `test_cr082_*`) | 100% PASS |

---

## 7. No owner questions

All decisions are trivially clear:
- Fix approach: `.strip()` before `.upper()` — only correct option
- Both files must be fixed together (same bug, same pattern)
- Backward compatible: existing uppercase codes without spaces are unaffected

---

```
Intake complete: CR-109
Classification: CR — code (preventive; 6 lines, 2 files)
Severity: P2 (will recur on next new coupon with trailing space)
Risk: LOW
Duplicate check: DISTINCT
Evidence: 6 exact lines confirmed (coupons.py:16/26/130, pos_coupons.py:77/87/119)
Blast radius: SMALL (2 write-path files; no schema/DB/index change)
Owner decisions: none required
Docs: discovery/SESSION_2026_10_09_INTAKE_CR109_COUPON_CODE_STRIP.md
Next: Planning gate opens on "choose planning role for CR-109"
```
