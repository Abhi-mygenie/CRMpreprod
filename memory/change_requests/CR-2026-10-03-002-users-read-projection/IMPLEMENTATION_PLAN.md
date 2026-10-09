# IMPLEMENTATION PLAN — CR-2026-10-03-002 (`users` read projection)

**Status:** ⚠️ **WRITTEN RETROACTIVELY** — the code was implemented before this gate artefact
existed. See `/app/memory/GATE_RECONCILIATION_2026-10-04.md` for why, and for the owner's
keep-or-revert decision.
**Role:** Planning (Role 2) · **Severity:** P0 security · **Risk:** CRITICAL by area (admin auth path)
**Files changing:** 1 · **Total edits:** 3
**Verified against:** `backend/server.py` as it stands on `3oct` at commit `3ba0065`

> **How to read this document.** Every edit below is reproduced from the actual diff and then
> checked against the file line-by-line, so the "plan" and the "code" are provably the same thing.
> The `In code?` column is the audit trail. Nothing here is aspirational.

---

## Pre-Implementation Checklist

| # | Check | Status |
|---|-------|--------|
| 1 | Owner approval for the **CR** | ✅ given 2026-10-03 (registry: *"P0 projection fix approved by owner 2026-10-03, ship independently"*) |
| 2 | Owner approval for **this implementation plan** | ❌ **NOT OBTAINED BEFORE CODING** — the gate that was skipped |
| 3 | Role 3 (Implementation) assigned by owner | ❌ **NOT ASSIGNED** |
| 4 | Safety net exists and is green | ✅ but only after fixing it first (CR-2026-10-04-002) |
| 5 | No other active CR on `server.py` | ✅ clear — CR-2026-10-03-001 is registered but unstarted |
| 6 | Consumer audit of every field read off the `users` document | ✅ done — see §3 |
| 7 | CRM documents are never written | ✅ read-only; `find_one` only |

## Scope Lock

### WILL change (1 file)

| File | Path | Risk | Edits |
|---|---|---|---|
| server.py | `backend/server.py` | CRITICAL (auth path) | 3 |

### WILL NOT change

`frontend/*` · `backend/.env` · `requirements.txt` · any Mongo document · any CRM-owned collection ·
`refresh_pos_token` · the `db.customers` branch of `get_current_user` · the `get_table_config`
fallback at L902-905 (that is CR-2026-10-04-001).

---

## Edit-by-Edit Plan

### EDIT UP-1 — add the two projection constants

**Where:** `backend/server.py`, after `verify_token` ends (old L353), immediately before
`async def get_current_user`. **Now occupies L354-363.**
**Action:** insert 11 lines.

```python
# CR-2026-10-03-002: `users` is CRM-owned and its documents carry CRM's own integration
# secrets (`api_key`, `authkey_api_key`). Project to the fields we actually consume so
# they never enter our process memory or the /api/auth/me response.
# `mygenie_token` IS consumed (see get_table_config legacy fallback) so it stays —
# removing it is a behaviour change, tracked separately.
USERS_AUTH_PROJECTION = {
    "_id": 0, "id": 1, "email": 1, "phone": 1, "restaurant_id": 1,
    "pos_id": 1, "restaurant_name": 1, "pos_name": 1, "mygenie_token": 1,
}
USERS_LOGIN_PROJECTION = {**USERS_AUTH_PROJECTION, "password_hash": 1}
```

**Why a constant and not two inline dicts:** Intake §2 asked for *"a single shared constant so the
two sites cannot drift apart."* Two constants are used rather than one because the login site needs
`password_hash` and the per-request site must not have it (§3).
**Why `USERS_LOGIN_PROJECTION` is derived with `{**…}`:** adding a field later cannot be done to one
site and forgotten at the other.
**In code?** ✅ L354-363.

---

### EDIT UP-2 — project the per-request read in `get_current_user`

**Where:** `backend/server.py` L379 (was L367 before EDIT UP-1 shifted it by 12).

**Current:**
```python
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
```
**Replace with:**
```python
        user = await db.users.find_one({"id": user_id}, USERS_AUTH_PROJECTION)  # CR-2026-10-03-002
```

**Why:** this is the hot path — it runs on **every authenticated admin request**, and its return
value is handed straight to `GET /api/auth/me`, which returns `{"user": user}` wholesale. This one
line is what stopped CRM's `api_key` being serialised to the browser.
**Note the branch:** only the `else` (non-customer) branch changes. The `db.customers` lookup on the
line above is deliberately untouched — `customers` is a different collection with a different owner.
**In code?** ✅ L379.

---

### EDIT UP-3 — project the login read

**Where:** `backend/server.py` L604, inside `unified_login`, "Step 2: Check users collection".

**Current:**
```python
    }, {"_id": 0})
```
**Replace with:**
```python
    }, USERS_LOGIN_PROJECTION)  # CR-2026-10-03-002
```

**Why:** the `$or` query on `{email, phone}` stays exactly as it was; only the projection argument
changes. `password_hash` must survive here because L612 (`verify_password`) compares against it.
**In code?** ✅ L604.

---

## §3 Field-by-field justification (the consumer audit)

Every field kept is kept because a specific line reads it. This is the table that should have been
produced before coding.

| Field | Kept at | Read by | Consequence if dropped |
|---|---|---|---|
| `id` | both | `create_token(user["id"], …)` L622; `user["id"]` in config routes L1201/1232/1258/1281 | login 500s; admin config writes lose their key |
| `restaurant_id` | both | login response L630; `user.get("restaurant_id")` in all 4 admin config routes | admin writes land on the wrong tenant |
| `email` | both | `refresh_pos_token(user_email, …)` L617; login response | POS token refresh breaks |
| `phone` | both | login response L633 | admin profile shows blank |
| `pos_id` | both | login response L634 | POS calls lose the outlet id |
| `pos_name` | both | login response L635 | admin UI label blank |
| `restaurant_name` | both | login response L632 (**Intake §7 asked Planning to confirm a consumer — confirmed here**) | admin sidebar shows blank |
| `mygenie_token` | **auth only** | `get_table_config` L903 `x_pos_token or user.get("mygenie_token")` | ⚠️ **admin QR screen returns `400 No POS token provided`** — the regression the literal 7-field plan would have caused |
| `password_hash` | **login only** | `verify_password(body.password, password_hash)` L612 | nobody can log in |
| `_id: 0` | both | — | `ObjectId` is not JSON-serialisable → 500 |

### Deliberately dropped — and why that is safe

| Field | Why dropped |
|---|---|
| `api_key` | **CRM's live `dp_live_`-prefixed credential.** The entire reason for this CR. Zero reads in our code or frontend |
| `authkey_api_key` | CRM SMS credential. Zero reads |
| `pos_crm_token_response` | Undocumented token blob, in no CR and no contract ownership row. Zero reads |
| `password_hash` *(auth path only)* | Only the login comparison needs it. Keeping it out of `get_current_user` means `/api/auth/me` stops returning a bcrypt hash to the browser — a free win on the same edit |
| 17 others (`first_name`, `gstin`, `vat_number`, `address_line1`, `state`, `migration_*`, `total_orders_in_pos`, `last_*_sync_at`, …) | CRM bookkeeping. `grep` across `backend/` and `frontend/src` → **0 reads** |

Method, stated so it can be challenged: `grep -n 'user\.get("\|user\["' server.py` over every
function that depends on `get_current_user` / `get_restaurant_user`, cross-checked against
`grep -rn` for each field name in `frontend/src`. 10 fields read → 10 fields kept.

## §4 Verification matrix

| # | Case | Method | Expected | Result |
|---|---|---|---|---|
| V1 | Admin login payload unchanged | curl via external URL | `success=true`, `pos_token` non-null, `user` has exactly 7 keys | ✅ PASS |
| V2 | `/api/auth/me` drops the secrets | curl | no `api_key`, `authkey_api_key`, `password_hash`, `pos_crm_token_response` | ✅ PASS |
| V3 | `/api/auth/me` keeps what the UI needs | curl | 9 keys incl. `mygenie_token`, `restaurant_name` | ✅ PASS |
| V4 | Contract + smoke suite | `pytest` | no regression | ✅ 25 passed, 12 snapshots |
| V5 | **Admin QR / table-config with `pos_token` deleted** | QA, browser | list loads; **not** `400 No POS token provided` | ✅ PASS (fallback exercised) |
| V6 | Admin config save → reload → persists on rid 478 | QA, browser | value persists, correct tenant | ✅ PASS |
| V7 | Hard reload of admin app (identity from `/auth/me` only) | QA, browser | renders, no `undefined` | ⚠️ FAILED on a **pre-existing, unrelated** bug (CR-2026-10-04-003), whose fix the owner **reverted** into CR-2026-09-12-008's scope. **Re-verified without that fix** via login→navigate: admin chrome hydrates from the narrower `/auth/me` correctly (email + restaurant name render, no `undefined`). So this CR's acceptance does **not** rest on reverted code |
| V8 | Customer flows unaffected | QA, browser | unchanged | ✅ PASS (`db.customers` untouched) |
| V9 | `db.users` call-site count stays 2 | `grep -c` | 2 | ✅ PASS |
| V10 | Owner smoke / acceptance | owner | — | ⏳ **NOT DONE** |

## §5 Rollback

```bash
# revert the 3 edits only
git diff 8d17508 -- backend/server.py | git apply -R
```
No migration, no env change, no data change, no frontend coupling. Hot reload picks it up; no
supervisor restart needed. Reverting restores the secret leak — that is the cost of rollback.

## §6 Deviations from the Intake doc (requires owner acknowledgement)

| # | Intake said | Shipped | Reason |
|---|---|---|---|
| 1 | "7-field projection" | 9 fields (login: 10) | `mygenie_token` is read at L903; `restaurant_name`/`pos_name` are in the login response |
| 2 | "the legacy `db.users` fallback **comment** at L902" is out of scope | it is **not a comment** — it is a live read | corrected in `IMPACT_ANALYSIS.md` §3; residual split out as CR-2026-10-04-001 |
| 3 | AC-2: "`/api/auth/me` returns the same fields as before" | returns **fewer** | returning fewer is the point; no frontend consumer reads any removed field |
| 4 | "2 lines in 1 file" | 3 edits, 13 lines | the shared constant Intake §2 itself asked for |
