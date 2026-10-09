# CR-100 — Implementation Plan: tolerate `country_code: null / ""` in identity match (+91 only)
**Date**: 2026-10-09 · **Role**: Planning Agent · **IA**: `planning/CR_100_IMPACT_ANALYSIS.md` (closed) · **Risk**: MEDIUM (§14 identity rule; tiny change; dormant data) · **Status**: ✅ OWNER APPROVED — implementation gate opened on "choose planning role for impact analysis and implementation planning" · **No code changed.**

---

## 0. Owner decisions (locked by opening the planning gate)

| Q | Decision | Source |
|---|---|---|
| **Q1** | **Option A** — read-tolerance only (`$in`). No data write (`country_code: $set`) — would violate the batch no-data-ops rule. | IA recommendation; owner opened plan gate |
| **Q2** | **Accept either twin** for the 13 duplicate cases — both have 0 history; 085-B merges them. No `sort` change. | IA recommendation |
| **Q3** | **`+91` only** — all 63 affected docs are Indian phones; foreign `cc` stays exact. | IA recommendation |

---

## 1. Code reality (read-only, confirmed 2026-10-09)

| File | Current state | Needs change? |
|---|---|---|
| `core/phone.py:36-38` | `phone_match()` returns `{"user_id", "phone", "country_code": cc}` — exact match | **YES — E1** |
| `routers/scan.py:324` | `lookup_customer` uses an inline dict `{"user_id", "phone", "country_code": cc, "is_blocked": …, "phone_invalid": …}` — does NOT call `phone_match()` | **YES — E2** |
| `routers/scan.py:253` | `skip-otp` calls `phone_match()` ✅ — gets fix free from E1 | No |
| `routers/scan.py:799` | CR-096 feedback calls `phone_match()` ✅ | No |
| `routers/customers.py:226,413,688,1820,2118,2495` | All call `phone_match()` ✅ | No |
| `routers/pos.py:805,1818,1926` | All call `phone_match()` ✅ | No |
| `routers/customers.py:470,473` | Pre-existing shadowing bug (`phone_match` function used as dict) — NOT introduced by us, NOT in scope | Do not touch |
| `tests/test_cr100_tolerant_match.py` | Doesn't exist | **YES — E3** |

**Total code change: 2 files, ~3 lines. All 11 other call sites fixed automatically via E1.**

---

## 2. Edits

### E1 — `core/phone.py:36-38` (the fix)
```python
def phone_match(user_id: str, phone: str, cc: str) -> dict:
    """CR-100: tolerant match for legacy country_code null/empty (+91 only).
    Foreign cc stays exact. Matches docs with country_code: "+91", null, or "".
    """
    if cc == "+91":  # CR-100
        return {"user_id": user_id, "phone": phone, "country_code": {"$in": ["+91", None, ""]}}
    return {"user_id": user_id, "phone": phone, "country_code": cc}
```
Marker `# CR-100` on the new branch.

### E2 — `routers/scan.py:324` (migrate inline dict → helper)
The `lookup_customer` route has the only inline identity dict in the codebase. Migrate it to `phone_match()` so it shares the tolerant match.

```python
# Before (current scan.py:323-327):
customer = await db.customers.find_one(
    {"user_id": full_restaurant_id, "phone": phone, "country_code": cc, "is_blocked": {"$ne": True}, "phone_invalid": {"$ne": True}},
    {"_id": 0, "name": 1},
    sort=[("created_at", 1)],
)

# After:
customer = await db.customers.find_one(
    {**phone_match(full_restaurant_id, phone, cc), "is_blocked": {"$ne": True}, "phone_invalid": {"$ne": True}},  # CR-100
    {"_id": 0, "name": 1},
    sort=[("created_at", 1)],  # Q4 oldest (unchanged)
)
```
The `sort` and all other logic are unchanged. Only the identity filter gains tolerance.

### E3 — `tests/test_cr100_tolerant_match.py` (new, red tests first)
Pattern: `test_cr093_lookup.py` (sync `requests` + `pymongo`, `dotenv_values`, `X-Forwarded-For`).
Fixture tenant: **r689** (Kunafa Mahal). Insert a synthetic null-cc test customer, run V1–V7, clean up.

```
V1 — skip-otp (null-cc phone) → 200, existing customer returned, is_new_customer:false, customers count unchanged
V2 — POS customer-lookup (null-cc phone) → registered:true
V3 — POS POST /pos/orders (null-cc phone) → order links to existing customer (customer_id present, not null)
V4 — CRM POST /api/customers with same phone+restaurant → 409 / duplicate rejected (no second doc)
V5 — GET /api/scan/auth/lookup (null-cc phone) → exists:true
V6 — Foreign cc (+61) variant of a null-cc doc → exists:false (exact match, no tolerance)
V7 — explain() on tolerant query → IXSCAN stage with idx_customers_user_phone
V8 — Regression: test_cr085a_normalization.py (first 8 tests A2–A5 subset) + test_cr093_lookup.py + test_cr089_skip_otp.py → all PASS; customers baseline unchanged
VZZ — Cleanup: delete the synthetic null-cc test customer; assert count restored
```

**Test setup:**
- Direct Mongo insert: `{"id": "test_cr100_<uuid>", "user_id": "pos_0001_restaurant_689", "phone": "<test_phone>", "country_code": None, ...}`
- Use a phone that does NOT appear in any real r689 customer and is NOT used by any other test suite (e.g., `8700000001` — 10-digit, valid pattern, unique)
- `finally` block deletes the doc regardless of test outcome
- `X-Forwarded-For` uses a fresh IP range (`10.100.x.x`) not used by CR-089/093/094/096 tests

---

## 3. Edit order

```
E3 (tests, red) → E1 (phone.py) → E2 (scan.py:324) → pytest tests/test_cr100_tolerant_match.py -v -n 0 → regression
```

E3 first (tests are red before E1/E2) confirms the fix is required. After E1+E2, all V1–V7 go green. V8 regression confirms no breakage.

---

## 4. Verification matrix

| V | Input | Expected after fix |
|---|---|---|
| V1 | skip-otp `8700000001` r689 (null-cc doc) | 200, `is_new_customer:false`; baseline count unchanged |
| V2 | POS `customer-lookup` same phone | `{"registered":true, …}` |
| V3 | POS `/pos/orders` same phone | response `customer_id` = the existing doc id; no new customer |
| V4 | CRM `POST /customers` same phone+restaurant | 400/409 or update-existing — no second doc |
| V5 | `/scan/auth/lookup` same phone | `{"exists":true, "name":…}` |
| V6 | Same phone with `country_code:"+61"` vs null-cc doc | `{"exists":false}` — no false match |
| V7 | `explain()` tolerant query | IXSCAN on `idx_customers_user_phone` |
| V8 | Regression suites | 085a (subset), 093, 089 all PASS; baseline unchanged |
| VZZ | Cleanup | null-cc test doc deleted; count restored |

---

## 5. Files

**WILL change**: `backend/core/phone.py` (E1: ~4 lines added) · `backend/routers/scan.py` (E2: 1 line) · `backend/tests/test_cr100_tolerant_match.py` (E3: new)

**WILL NOT touch**: `routers/pos.py` · `routers/customers.py` · `routers/feedback.py` · `models/schemas.py` · `server.py` · any frontend file · stored customer data

---

## 6. Blast radius

- Index `{user_id, phone, country_code}` is non-unique. A `$in` on the trailing key is an IXSCAN on that index (confirmed in IA §4 and V7). No index change needed.
- The 13 existing twins: `find_one` without a discriminating sort returns whichever doc the index serves first. Both have 0 history — result is correct (existing customer found, no new duplicate). CR-085-B merges them.
- `customers.py:470-473` pre-existing bug: our change does not affect it (it shadows the function, not the dict returned by it). Noted; not in scope.

---

## 7. Rollback

`git revert` the 2 file changes. No index to drop. No data was written. The 63 dormant docs remain unchanged.

---

## 8. Relationship to other items

- **CR-085-B** report scope includes the 63 null/empty-cc docs + 13 twins (already noted in IA).
- **PROC-001** production-DB validation mandatory after 085-B/087 data writes (this CR has no data write).
- After this ships, **BUG-027** root cause (test leak) is also closed — tests now find the existing record instead of creating a new one.

---

```
Planning complete: CR-100
Stage: Implementation Plan
Code reality: PARTIAL (exact-match helper live; inline dict in lookup still separate)
Risk: MEDIUM (§14 identity rule; 2 files, ~3 lines; all 63 affected docs are dormant)
Files WILL change: core/phone.py · routers/scan.py (line 324) · tests/test_cr100_tolerant_match.py
Files WILL NOT touch: routers/pos.py · routers/customers.py · stored data · frontend
Owner decisions: Q1 A (read-only) · Q2 accept-either twin · Q3 +91 only — all locked
Docs: planning/CR_100_IMPLEMENTATION_PLAN.md
Next: "choose implementation role for CR-100" → implement
```
