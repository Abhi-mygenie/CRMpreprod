# CR-109 — Impact Analysis: Add `.strip()` to coupon `code` at write time
**Date**: 2026-10-09 · **Role**: Planning Agent · **Intake**: `discovery/SESSION_2026_10_09_INTAKE_CR109_COUPON_CODE_STRIP.md` · **Status**: 🟡 IA in progress — zero owner questions · **No code changed.**

---

## 1. Code reality (confirmed 2026-10-09)

### `routers/coupons.py` — CRM coupon management

```python
# Line 16 — create_coupon dup check
existing = await db.coupons.find_one({"user_id": user["id"], "code": coupon_data.code.upper()})
#                                                                             ^^^ missing .strip()

# Line 26 — create_coupon STORE  ← root cause
coupon_doc["code"] = coupon_data.code.upper()
#                                ^^^ missing .strip()

# Line 130 — update_coupon code normalise  ← root cause
update_data["code"] = update_data["code"].upper()
#                                        ^^^ missing .strip()
```

### `routers/pos_coupons.py` — POS coupon management (CR-081)

```python
# Line 77 — pos_create_coupon dup check
existing = await db.coupons.find_one({"user_id": user["id"], "code": coupon_data.code.upper()})
#                                                                             ^^^ missing .strip()

# Line 87 — pos_create_coupon STORE  ← root cause
doc["code"] = coupon_data.code.upper()
#                          ^^^ missing .strip()

# Line 119 — pos_update_coupon code normalise  ← root cause
update["code"] = update["code"].upper()
#                               ^^^ missing .strip()
```

**Total: 6 occurrences. 2 files. 4 root-cause lines (stores + normalise). 2 dup-check lines (also need fixing for consistency).**

---

## 2. Why dup-check lines matter

If `create_coupon` receives `code: " SAVE10 "` and stores `"SAVE10"` (after adding `.strip()`), the dup-check on line 16 must also use `.strip().upper()` — otherwise it looks up `" SAVE10 ".upper()` = `" SAVE10 "` against the DB and doesn't find the existing `"SAVE10"` → creates a duplicate. All 6 lines must be fixed together.

---

## 3. No owner questions

| | Decision |
|---|---|
| Both files? | Yes — same bug, same fix, same session |
| Schema change? | No |
| DB migration? | No |
| Index change? | No |
| Backward compat? | Full — existing uppercase codes unaffected |
| PROC-001? | No — no data writes |

---

## 4. Blast radius

- **Files WILL change**: `routers/coupons.py` (E1, E2, E3) · `routers/pos_coupons.py` (E4, E5, E6)
- **Files WILL NOT touch**: `core/coupon.py` · `models/schemas.py` · `CouponsPage.jsx` · any test files · DB · indexes

---

## 5. Conflict check

- No open CR touches these 6 lines
- CR-081 (pos coupon CRUD): already implemented — this adds `.strip()` to the existing CR-081 code, no conflict
- CR-082 (`requires_customer`): implemented — no overlap

---

## 6. Downstream safety

| Consumer | Impact |
|---|---|
| `validate_coupon_for_customer` (coupon.py:1677) | Already strips input (`code.strip().upper()`). DB codes now guaranteed stripped. ✅ |
| `list_available_coupons` | Reads docs by pre-fetching — stripped codes from DB are always found. ✅ |
| `coupon_usage` records | Store `coupon_id` (UUID), not `code`. Zero impact. ✅ |
| S&O `POST /scan/coupons/validate` | Strips input already. Clean DB codes → no drift. ✅ |
| POS `POST /pos/coupons/validate` | Same — already strips on validate. ✅ |
| Existing coupon test suites | All use clean codes (no leading/trailing spaces). Zero breakage. ✅ |

---

```
Planning complete: CR-109
Stage: Impact Analysis
Code reality: PARTIAL (6 lines missing .strip() in 2 write-path files)
Risk: LOW
Files WILL change: routers/coupons.py (3 lines) · routers/pos_coupons.py (3 lines)
Files WILL NOT touch: core/coupon.py · schemas.py · frontend · DB · indexes
Owner decisions: NONE — all trivially clear
Docs: planning/CR_109_IMPACT_ANALYSIS.md
Next: Implementation Plan gate — opens on "choose planning role for implementation planning of CR-109"
```
