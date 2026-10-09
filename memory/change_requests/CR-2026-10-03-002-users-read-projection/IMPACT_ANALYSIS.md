# IMPACT ANALYSIS — CR-2026-10-03-002 (users read projection)

**Gate:** 2 (Impact Analysis) · **Written:** session after 2026-10-03 · **Role:** Planning (Role 2)
**Verdict:** APPROVED TO IMPLEMENT — with one scope correction to the Intake doc (§3 below)

---

## 1. What was re-verified against the code (not the docs)

Per §11 "code is truth", both call sites were re-read on the live `3oct` tree before planning.
Line numbers had drifted (`server.py` is now **1,878** lines, not 1,829):

| Intake said | Actual |
|---|---|
| `server.py:367` `get_current_user` | ✅ correct |
| `server.py:587` `POST /api/auth/login` step 2 | ✅ correct |
| "7-field projection" | insufficient — see §3 |

**Live `users` document** (`id = pos_0001_restaurant_478`, read read-only from the shared UAT DB):
**30 fields.** `{"_id": 0}` excluded exactly one of them.

```
api_key          = dp_live_G…   ← CRM live-prefixed credential (INV-2026-10-03-001)
mygenie_token    = 9fvVwszMz…   ← POS bearer token
authkey_api_key  = None         ← present on other rows per INV-003
pos_crm_token_response = {…}    ← undocumented token blob, not named in any CR
password_hash    = bcrypt
```

## 2. Severity is understated in the Intake doc

Intake §1 says the secrets reach *"our process memory, where they can reach logs, tracebacks and
error reporters."* That is true but not the worst of it.

`GET /api/auth/me` returns `{"user": user}` — **the entire document** (`server.py:646`), and
`AuthContext.jsx:51` does `setUser(data.user)` on every admin page load. So before this fix,
**CRM's `dp_live_` credential was being served to the browser** and held in React state for any
admin session. Not an internal-memory issue — an exfiltration surface reachable by anyone who can
open devtools on an admin session.

Nothing in the frontend reads `api_key`, `authkey_api_key`, `password_hash` or `mygenie_token`
(`grep` across `frontend/src` → 0 hits), so removing them from the response breaks no consumer.

## 3. 🔴 Correction to the Intake doc — the projection cannot be secret-free

Intake §1 asserts *"Nothing in our code reads them."* **This is false for `mygenie_token`.**

```
server.py:902-905   # Use token from header (preferred) or fallback to db.users (legacy)
                    mygenie_token = x_pos_token or user.get("mygenie_token")
                    if not mygenie_token: raise HTTPException(400, "No POS token provided…")
```

`GET /api/table-config` (admin QR screen) reads `mygenie_token` **off the document returned by the
projected call site at L367.** The fallback is live, not dead:

- `AdminQRPage.jsx:110` sends `'X-POS-Token': posToken || ''` — an **empty string** when
  `localStorage.pos_token` is missing. FastAPI binds `""`, which is falsy, so the DB fallback is taken.
- `localStorage.pos_token` is legitimately absent: login **succeeds even when the POS token refresh
  fails** (`server.py:610-611` only logs a warning), and any session restored from a persisted JWT
  never repopulates it.

Had the Intake's literal 7-field projection shipped, **the admin QR / table-config screen would
have started returning `400 "No POS token provided. Please logout and login again."`** for exactly
those sessions — a customer-visible admin outage caused by a "2-line, zero-behaviour-change"
security fix. Acceptance criterion 5 would have caught it in QA; planning caught it first.

Intake §2 also lists *"the legacy `db.users` fallback comment at L902"* as OUT of scope. It is not
a comment — it is an active read. That line is the reason the scope could not be taken literally.

## 4. Decision

Ship **two** projections rather than one, and keep `mygenie_token`:

| Constant | Used at | Fields |
|---|---|---|
| `USERS_AUTH_PROJECTION` | L367 `get_current_user` | `id, email, phone, restaurant_id, pos_id, restaurant_name, pos_name, mygenie_token` |
| `USERS_LOGIN_PROJECTION` | L587 login | the above **+ `password_hash`** |

Rationale for splitting: `password_hash` is only ever needed by the login comparison. Keeping it out
of `get_current_user` means it stops being returned by `/api/auth/me` — a free win on the same
change, with no consumer.

`restaurant_name` / `pos_name` — Intake §7 asked Planning to confirm consumers. **Confirmed:** both
are returned in the login response (`server.py:623, 626`). They stay.

**Residual risk accepted:** `mygenie_token` is still loaded and still returned by `/api/auth/me`.
This is **not a regression** — it is today's behaviour, unchanged — and it is no worse in class than
`pos_token`, which the frontend already stores in `localStorage` by design. Removing it requires
deleting the L902 fallback, which is a behaviour change needing an owner decision, so it is
**registered separately as CR-2026-10-04-001** rather than smuggled in here.

Scorecard: of the 4 secret-bearing fields on the document, **3 are now gone**
(`api_key`, `authkey_api_key`, `pos_crm_token_response`) plus `password_hash`. 30 fields → 9.

## 5. Blast radius

| | |
|---|---|
| Files changed | 1 (`backend/server.py`) |
| Lines | 10 added (2 constants + comment), 2 modified |
| Routes affected | every authenticated route (both auth dependencies) — but the returned dict is a strict subset that all consumers were audited against |
| Consumer audit | `grep` of every `user.get(…)` / `user[…]` read on an admin path: `user_type` (set in code), `id`, `restaurant_id`, `email`, `phone`, `pos_id`, `pos_name`, `restaurant_name`, `password_hash`, `mygenie_token` — **all 10 are in the projections** |
| Rollback | revert 3 edits; no data, env or schema change; CRM documents never written |

## 6. Verification performed

| # | Criterion (Intake §6) | Result |
|---|---|---|
| 1 | Admin login returns the same payload | ✅ all 7 user fields + `pos_token` present, byte-identical shape |
| 2 | `/api/auth/me` returns the same fields | ⚠️ **deliberately narrower** — now 9 keys; `api_key`, `authkey_api_key`, `pos_crm_token_response`, `password_hash` and 17 unused fields are gone. No frontend consumer exists |
| 3 | Admin config save writes under correct `restaurant_id` | ⏳ QA (Role 4) — `restaurant_id` is in the projection |
| 4 | No `api_key` / `authkey_api_key` / `mygenie_token` in a dump | ✅ for the first two · ⚠️ `mygenie_token` by design (§4) |
| 5 | QR / table-config still works | ⏳ QA — the reason `mygenie_token` was retained |
| 6 | `db.users` call sites stay at 2 | ✅ `grep -c` → 2 live (+1 commented, +1 comment) |
| — | Contract suite | ✅ **21 passed, 12 snapshots passed, 0 errors** |

Login payload diff, captured live through the external URL:

```
{"success":true,"user_type":"restaurant","token":"<set>","pos_token":"<set>",
 "user":{"id":"pos_0001_restaurant_478","restaurant_id":"478","email":"owner@18march.com",
         "restaurant_name":"18march","phone":"9823905119","pos_id":"0001","pos_name":"MyGenie"}}
```

**Secret hygiene:** no secret value is recorded in this document. Prefixes only
(`dp_live_G…`, `9fvVwszMz…`), consistent with INV-2026-10-03-001 and §5 trap 9.
