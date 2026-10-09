# BUG-030 — Impact Analysis: `_normalize_restaurant_id("69")` → non-existent tenant
**Date**: 2026-10-09 · **Role**: Planning Agent · **Origin**: BUG-025/026 planning probe · **Status**: 🟡 IA in progress — owner decision Q1 = A confirmed (2026-10-09, "both A") · **No code changed.**

---

## 1. Problem

`_normalize_restaurant_id(rid)` (`scan.py:34-38`) converts a short numeric id to the standard full format:

```python
def _normalize_restaurant_id(restaurant_id: str) -> str:
    if restaurant_id.startswith("pos_"):
        return restaurant_id
    return f"pos_0001_restaurant_{restaurant_id}"
```

For `rid="69"` this produces `"pos_0001_restaurant_69"` — **which has no `users` doc**. The real id for The Goan Kitchen (r69) is `pos_owner_69_bdd4513c`, with `users.restaurant_id = "69"`. r69 is the **only** non-standard user id in the database (confirmed: 1/all users).

Result: every Customer App call to a `/scan/*` route with `restaurant_id:"69"` hits a dead tenant. One orphan customer (`9035133228`, 2026-09-08) was silently created under `pos_0001_restaurant_69`.

---

## 2. Live evidence (read-only 2026-10-09)

| Fact | Value |
|---|---|
| r69 user `id` | `pos_owner_69_bdd4513c` |
| r69 user `restaurant_id` field | `"69"` |
| Non-standard user ids in DB | **1 / total** — only r69 |
| All other tenants | follow `pos_0001_restaurant_N` — unaffected |
| Orphan customer at `pos_0001_restaurant_69` | `id: ea9cf871`, `phone: 9035133228` (→ CR-101 deletion) |

---

## 3. Fix — Option A (owner-confirmed)

Add an **async fallback**: after building the standard id, if no `users` doc exists for it, query `users.find_one({"restaurant_id": rid})` and return that user's `id` instead.

**New async helper `_resolve_restaurant_id`** (replaces the sync `_normalize_restaurant_id` at the affected call sites):

```python
async def _resolve_restaurant_id(restaurant_id: str) -> str:
    """CR-BUG030: like _normalize_restaurant_id but falls back to users.restaurant_id lookup."""
    if restaurant_id.startswith("pos_"):
        return restaurant_id
    standard = f"pos_0001_restaurant_{restaurant_id}"
    # fast path: standard format covers all tenants except r69 — zero extra DB hit
    user = await db.users.find_one({"id": standard}, {"_id": 0, "id": 1})
    if user:
        return standard
    # slow path: non-standard id — look up by restaurant_id field (r69 only case today)
    fallback = await db.users.find_one({"restaurant_id": restaurant_id}, {"_id": 0, "id": 1})
    return fallback["id"] if fallback else standard  # return standard so route 404s naturally
```

**Performance:** For all 40+ standard tenants the first `find_one({"id": standard})` hits the index and returns immediately (zero overhead). Only r69 hits the second query. Fast path unchanged in production.

---

## 4. Affected call sites

`_normalize_restaurant_id` is called in `scan.py` at 5 key places (all inside async functions — `await` is safe):

| Line | Function | Action |
|---|---|---|
| 162 | `skip_otp_login` | replace with `await _resolve_restaurant_id(...)` |
| 238 | `lookup_customer` | replace with `await _resolve_restaurant_id(...)` |
| 283 | `loyalty_rules` | replace with `await _resolve_restaurant_id(...)` |
| 626 | `get_app_config` (GET stays until CA-2) | replace |
| 688 | `submit_feedback` | replace |

`_short_restaurant_id` (line 41-45, lines 631/649) is unchanged — it only strips a prefix, never queries the DB.

`_normalize_restaurant_id` itself **stays** — still used by `skip_otp_login` local lookup (line 162 uses both — only the full-tenant lookup needs resolution; the new-customer insert can keep the standard form since we validate the user exists first).

---

## 5. Risk

**MEDIUM** — identity routing for `/scan/*`; all affected functions are async; change is additive (new async helper, old sync helper stays). Regression required: `test_cr089_skip_otp.py`, `test_cr093_lookup.py`, `test_cr096_feedback.py`, `test_cr094_loyalty_rules.py`. Orphan customer cleanup stays with CR-101.

---

## 6. Owner questions

| Q | Question | Decision |
|---|---|---|
| **Q1** | Option A (DB fallback) vs B (leave) | **A — confirmed 2026-10-09** |

No further questions — implementation straightforward.

---

## 7. Files

**WILL change**: `backend/routers/scan.py` (new async helper + 5 call-site replacements, ~20 lines)
**WILL NOT touch**: `core/phone.py` · `routers/pos.py` · `customers.py` · stored data · `users` collection (read-only)

---

```
Planning complete: BUG-030
Stage: Impact Analysis (Implementation Plan NOT opened — owner: "don't jump gate")
Code reality: PARTIAL (sync helper exists; async fallback absent)
Risk: MEDIUM (identity routing, 5 call sites, all async)
Files WILL change: routers/scan.py
Owner decisions: Q1 = A (confirmed)
Docs: planning/BUG_030_IMPACT_ANALYSIS.md
Next: Implementation Plan gate — opens on "choose planning role for implementation planning of BUG-030"
```
