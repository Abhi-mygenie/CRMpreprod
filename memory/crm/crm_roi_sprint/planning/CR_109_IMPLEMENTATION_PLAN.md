# CR-109 — Implementation Plan: Add `.strip()` to coupon `code` at write time
**Date**: 2026-10-09 · **Role**: Planning Agent · **IA**: `planning/CR_109_IMPACT_ANALYSIS.md` (zero owner questions, IA closed) · **Risk**: LOW · **Status**: ✅ OWNER APPROVED — gate opens on "choose implementation role for CR-109" · **No code changed.**

---

## 0. Decisions

No owner questions — all decisions trivially clear (see IA §3).

---

## 1. Edits — 6 one-line changes, 2 files

### `routers/coupons.py`

**E1 — line 16 (create, dup check):**
```python
# Before
existing = await db.coupons.find_one({"user_id": user["id"], "code": coupon_data.code.upper()})

# After
existing = await db.coupons.find_one({"user_id": user["id"], "code": coupon_data.code.strip().upper()})  # CR-109
```

**E2 — line 26 (create, STORE — root cause):**
```python
# Before
coupon_doc["code"] = coupon_data.code.upper()

# After
coupon_doc["code"] = coupon_data.code.strip().upper()  # CR-109
```

**E3 — line 130 (update, normalise — root cause):**
```python
# Before
update_data["code"] = update_data["code"].upper()

# After
update_data["code"] = update_data["code"].strip().upper()  # CR-109
```

---

### `routers/pos_coupons.py`

**E4 — line 77 (pos create, dup check):**
```python
# Before
existing = await db.coupons.find_one({"user_id": user["id"], "code": coupon_data.code.upper()})

# After
existing = await db.coupons.find_one({"user_id": user["id"], "code": coupon_data.code.strip().upper()})  # CR-109
```

**E5 — line 87 (pos create, STORE — root cause):**
```python
# Before
doc["code"] = coupon_data.code.upper()

# After
doc["code"] = coupon_data.code.strip().upper()  # CR-109
```

**E6 — line 119 (pos update, normalise — root cause):**
```python
# Before
update["code"] = update["code"].upper()

# After
update["code"] = update["code"].strip().upper()  # CR-109
```

---

## 2. Edit order

```
E1 + E2 (coupons.py create_coupon — together)
→ E3 (coupons.py update_coupon)
→ E4 + E5 (pos_coupons.py pos_create_coupon — together)
→ E6 (pos_coupons.py pos_update_coupon)
→ backend hot-reload
→ V1–V5 self-test (curl + pymongo spot-check)
```

All 6 edits are independent. No ordering constraint between files.

---

## 3. Verification matrix

| V | Check | Expected |
|---|---|---|
| V1 | `POST /api/coupons` `{code:" NEWONE "}` (staff token) | Stored as `"NEWONE"` — no spaces |
| V2 | `PUT /api/coupons/:id` `{code:" UPDATED "}` | Updated to `"UPDATED"` |
| V3 | `POST /api/pos/coupons` `{code:" POS10 "}` (POS api-key) | Stored as `"POS10"` |
| V4 | Create second coupon `{code:" NEWONE "}` same tenant | 400 "Coupon code already exists" (dup check correct) |
| V5 | `db.coupons.find({"code":/^\s|\s$/}).count()` after test | 0 — no new trailing/leading spaces in newly created codes |

Cleanup: delete V1/V3 test coupons after verification.

---

## 4. Files

**WILL change**: `routers/coupons.py` (E1–E3, 3 lines) · `routers/pos_coupons.py` (E4–E6, 3 lines)

**WILL NOT touch**: `core/coupon.py` · `models/schemas.py` · `CouponsPage.jsx` · any test file · DB · indexes

---

## 5. Rollback

Remove `# CR-109` lines (revert `.strip()`). Data already in DB is unaffected — strip is at write time only.

---

```
Planning complete: CR-109
Stage: Implementation Plan
Risk: LOW
Files WILL change: routers/coupons.py (3 lines) · routers/pos_coupons.py (3 lines)
Files WILL NOT touch: core/coupon.py · schemas.py · frontend · tests · DB · indexes
Owner decisions: none
Edit order: E1–E2 → E3 → E4–E5 → E6 → hot-reload → V1–V5
Next: "choose implementation role for CR-109" → implement
```
