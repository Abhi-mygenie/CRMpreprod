# BUG-030 — Implementation Plan: async `_resolve_restaurant_id` fallback
**Date**: 2026-10-09 · **Role**: Planning Agent · **IA**: `planning/BUG_030_IMPACT_ANALYSIS.md` (Q1 = A, closed) · **Risk**: MEDIUM (identity routing; 1 new helper; 4 call-site replacements) · **Status**: ✅ OWNER APPROVED — implementation gate opens on "choose implementation role for BUG-030" · **No code changed.**

---

## 0. Decision locked

| Q | Decision |
|---|---|
| **Q1** | **A — async DB fallback** (`_resolve_restaurant_id`). Fast path for all standard tenants unchanged. |

---

## 1. Code reality (confirmed 2026-10-09)

**5 call sites** for `_normalize_restaurant_id` in `scan.py`. Only **4 need fixing**:

| Line | Function | Fix? | Reason |
|---|---|---|---|
| 162 | `skip_otp_login` | **YES** | Creates/finds customer — wrong rid → orphan customer |
| 238 | `lookup_customer` | **YES** | Checks customers — wrong rid → always "not found" |
| 283 | `loyalty_rules` | **YES** | Checks `users` + `loyalty_settings` — 404 for r69 |
| 626 | `get_app_config` (GET) | **NO** | Already tries short-form `"69"` first (line 622); this is the fallback only. GET route removed after CA-2 anyway. |
| 688 | `submit_feedback` | **YES** | Checks `users` — 404 for r69 |

---

## 2. Edits

### E1 — `scan.py:38` — add `_resolve_restaurant_id` after the existing sync helper

```python
async def _resolve_restaurant_id(restaurant_id: str) -> str:  # BUG-030
    """Like _normalize_restaurant_id but falls back to users.restaurant_id lookup.
    Fast path: standard format (pos_0001_restaurant_N) — zero extra DB query (all tenants).
    Slow path: non-standard id (r69 only today) — one extra users.find_one by restaurant_id field.
    """
    if restaurant_id.startswith("pos_"):
        return restaurant_id
    standard = f"pos_0001_restaurant_{restaurant_id}"
    if await db.users.find_one({"id": standard}, {"_id": 0, "id": 1}):
        return standard
    fallback = await db.users.find_one({"restaurant_id": restaurant_id}, {"_id": 0, "id": 1})
    return fallback["id"] if fallback else standard  # unknown rid → standard; route 404s naturally
```

### E2 — `scan.py:162` — skip-otp

```python
# Before
full_restaurant_id = _normalize_restaurant_id(req.restaurant_id)
# After
full_restaurant_id = await _resolve_restaurant_id(req.restaurant_id)  # BUG-030
```

### E3 — `scan.py:238` — lookup

```python
# Before
full_restaurant_id = _normalize_restaurant_id(req.restaurant_id)
# After
full_restaurant_id = await _resolve_restaurant_id(req.restaurant_id)  # BUG-030
```

### E4 — `scan.py:283` — loyalty-rules

```python
# Before
rid = _normalize_restaurant_id(restaurant_id)
# After
rid = await _resolve_restaurant_id(restaurant_id)  # BUG-030
```

### E5 — `scan.py:688` — submit-feedback

```python
# Before
rid = _normalize_restaurant_id(data.restaurant_id)
# After
rid = await _resolve_restaurant_id(data.restaurant_id)  # BUG-030
```

---

## 3. Edit order

```
E1 (new helper) → E2 → E3 → E4 → E5 → backend hot-reload → V1–V6 self-test
```

---

## 4. Verification matrix

| V | Check | Expected |
|---|---|---|
| V1 | `POST /scan/auth/skip-otp` `{restaurant_id:"69", phone:"<any valid>"}` | 200, `is_new_customer:false` for known phone (not 404, not orphan under `pos_0001_restaurant_69`) |
| V2 | `POST /scan/auth/lookup` `{restaurant_id:"69", phone:"<any>"}` | 200, `exists:bool` (not 404) |
| V3 | `GET /scan/loyalty-rules/69` | 200 or meaningful response (not 404 "Restaurant not found") |
| V4 | `POST /scan/feedback` `{restaurant_id:"69", rating:3}` | 200 (not 404) |
| V5 | `POST /scan/auth/skip-otp` `{restaurant_id:"689"}` | 200, still correct (fast path unchanged, no regression) |
| V6 | `GET /scan/loyalty-rules/689` | 200, 33 keys (fast path unchanged) |

Regression: `test_cr089_skip_otp.py` + `test_cr093_lookup.py` + `test_cr094_loyalty_rules.py` + `test_cr096_feedback.py` (all share the normalise path).

---

## 5. Files

**WILL change**: `backend/routers/scan.py` — E1 new helper (~12 lines) + E2–E5 four 1-line replacements

**WILL NOT touch**: `core/phone.py` · `_normalize_restaurant_id` itself (sync helper stays for `get_app_config:626`) · `_short_restaurant_id` · `routers/pos.py` · `routers/customers.py` · stored data · orphan customer (→ CR-101)

---

## 6. Notes

- `_normalize_restaurant_id` (sync) **stays** — still used by `get_app_config:626` which is intentionally left for CA-2 removal. Removing it would require importing the async version into a previously sync context.
- The orphan customer (`ea9cf871`, `phone:9035133228`, `user_id:pos_0001_restaurant_69`) is **not deleted here** — that belongs to CR-101 (data hygiene, end of batch, owner confirms deletions).

---

```
Planning complete: BUG-030
Stage: Implementation Plan
Code reality: PARTIAL (sync helper exists; 4 async call sites need updating)
Risk: MEDIUM
Files WILL change: routers/scan.py (E1: ~12 lines; E2–E5: 4 × 1-line)
Files WILL NOT touch: core/phone.py · pos.py · customers.py · data
Owner decisions: Q1 = A locked
Docs: planning/BUG_030_IMPACT_ANALYSIS.md + this file
Next: "choose implementation role for BUG-030" → implement
```
