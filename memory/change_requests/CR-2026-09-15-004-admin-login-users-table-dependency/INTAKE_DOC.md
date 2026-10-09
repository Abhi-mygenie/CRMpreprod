# INTAKE DOC — CR-2026-09-15-004

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-15-004 |
| **Title** | Remove the last direct read of a CRM table — admin login's dependency on CRM's `users` collection |
| **Classification** | CHANGE REQUEST (architecture / auth) |
| **Date Registered** | 2026-09-15 |
| **Reported By** | Owner, after INV-2026-09-15-003: "we don't touch CRM's tables — the `users` exception has to be noted and looked at separately" |
| **Severity** | P1 (architecture debt) · contains a **P0 security sub-item** (projection) that must ship first, independently |
| **Risk** | **CRITICAL** — §5 triggers: *security* + *auth logic* + *production data*. Rewrites `get_current_user` and `POST /api/auth/login`, which run on **every** admin request. Minimum process per §5: **full gate flow + owner approval + E2E regression + audit note. No Fast Lane.** (Risk label added 2026-10-03 during the registry-sync audit — it was missing, and §5 requires it before planning.) |
| **Blast radius** | **MEDIUM** — 1 backend file (auth paths) + admin login/session surface in the frontend. No customer-facing flow |
| **Status** | 📝 REGISTERED — direction **D (POS direct)** recommended per CRM INV-022. **Owner 2026-09-28: "will approve after checking impact and new flow"** → next deliverable `IMPACT_AND_NEW_FLOW.md` (current vs new sequence diagram, touched files/routes, failure modes, rollback, multi-restaurant handling). Gated on POS P5 (profile endpoint) — write with TBD if needed. |
| **Parent** | INV-2026-09-15-003 |
| **Related** | Owner question O4 · CRM question B4 · ownership board row `users` |

## 1. Problem

Our admin login (`POST /api/auth/login`, server.py L587) and every admin request
(`get_current_user`, L367) run `db.users.find_one` on a collection **created and written by CRM**.
We depend on 6 fields: `id, email, phone, password_hash, restaurant_id, pos_id`.
This is the only remaining live read of a CRM table once INV-003's other items are fixed.
It is "temporarily acceptable" because CRM exposes no admin-login API — but it violates the rule
and must be removed, not just documented.

## 2. Immediate sub-item (ship first, no decision needed)

## FRANCHISE MULTI-OUTLET — SPLIT OUT 2026-10-03 (owner decision)

POS answered **P4.2: `restaurants[]` CAN hold multiple entries — for franchises.**
Owner decision the same day: *"Separate CR — get single-outlet POS login working first, franchises
later."* → registered as **CR-2026-10-03-006**.

**So this CR stays SINGLE-OUTLET.** It takes `restaurants[0]`, which is **identical to both our
current behaviour** (`server.py:587-626` returns one `restaurant_id`; token minted from `user["id"]`
at `:613`) **and CRM's** (they silently take `restaurants[0]`). **No regression is introduced.**

Two conditions on that, so the interim does not become an invisible permanent choice:

1. **Record `restaurants[0]` in code as a deliberate placeholder**, with `CR-2026-10-03-006` named
   in the comment — not left looking like an oversight.
2. **New acceptance criterion:** if `restaurants[]` contains more than one entry, the backend
   **logs a warning naming the outlets being ignored**. A franchise admin administering the wrong
   outlet is otherwise completely silent, and this also tells us whether any real franchise admin
   exists today — which nobody currently knows.

Out of scope here, in CR-2026-10-03-006: outlet picker, selected-outlet threading through config
save / QR / visibility, and the backend ownership check on per-outlet requests.

**Still blocked on POS for this CR:** the exact profile endpoint **path and response shape**
(contract **O-14** — POS replied "ok" to P4.1, which acknowledged rather than answered). Owner is
waiting for POS to come back rather than chasing. **P4.3** (login rate limit / POS token lifetime /
refresh endpoint) is also outstanding — rationale written up in
`INV-002/VALIDATION_OF_POS_REPLY_2026-10-03.md` §4.

> **CARVED OUT 2026-10-03 → now registered as `CR-2026-10-03-002`.** The P0 projection is no
> longer tracked here: this parent CR is gated on F3 + POS P5, so the security fix was given its
> own ID to ship independently. Text kept below for context only.

**P0 — projection.** Both reads currently fetch the full document, which also contains CRM's
`api_key`, `authkey_api_key`, `mygenie_token`. Add
`{"_id":0,"id":1,"email":1,"phone":1,"password_hash":1,"restaurant_id":1,"pos_id":1,"restaurant_name":1,"pos_name":1}`.
Behaviour unchanged. Does not close this CR — it only reduces blast radius while the CR is open.

## 3. Options for the real fix (owner to choose)

| Option | What it means | Pros | Cons |
|---|---|---|---|
| **A — CRM provides `POST /api/scan/admin/login`** | Email+password → CRM verifies against *its* `users`, returns `{token, restaurant_id, pos_id, restaurant_name}`. We validate CRM's admin token on our admin routes (CRM shares a public key or a verify endpoint). | Zero DB access. One identity system. | CRM work. Our admin session now depends on CRM uptime. Token-validation handshake to design. |
| **B — Own `admin_users` collection in our namespace** | We create and own `admin_users`. CRM (or an onboarding script) pushes a copy of admin credentials to us when a restaurant is onboarded. | Fully independent; CRM schema changes can't break us. | Two copies of a password hash; sync problem on password change. |
| **C — Keep the read, formalise as a contract** | CRM promises the 6 fields are stable (B4). We keep the projected read. | No code beyond projection. | Still violates the rule; owner has said this is not acceptable long-term. |

| **D — Authenticate against MyGenie POS directly** (CRM reply INV-022 C1, 2026-09-28) | CRM is *not* the identity provider: its own admin login proxies POS `login → profile`; the `users` row is a cache. We call POS `/auth/vendoremployee/login` (already done in `refresh_pos_token`, server.py L410) → POS profile → `restaurants[0].id` (short rid), `name`; `pos_id` = constant `"0001"`; mint our own JWT. | Zero CRM dependency; same source of truth CRM uses; we already have the login call + `MYGENIE_API_URL`. | Depends on POS uptime (same as CRM today). Need POS profile endpoint path (POS P5). Multi-restaurant admins: CRM takes `[0]` — confirm with POS. |

**Option A is off the table** (CRM declined, and recommends D). Owner lean: not C. **Recommended: D.** Owner confirmation = board item **F3**.

## 4. Scope when approved

- Backend: `POST /api/auth/login` admin branch, `get_current_user` admin branch, `get_restaurant_user`, `refresh_pos_token` (uses email/password — check it still works under A).
- Frontend: `Login.jsx`, `AuthContext.jsx` (`/api/auth/me`), admin route guards.
- Tests: admin login, token expiry, config save still keyed by correct `restaurant_id`.

## 5. Acceptance

- `grep "db.users" server.py` returns nothing.
- Admin can log in and save config for rid 689 (UAT creds in `test_credentials.md`).
- Ownership board row `users` flips to "CRM exclusive — Customer App never touches".

## 6. Duplicate check

| Item | Verdict |
|---|---|
| Owner question O4 | SAME TOPIC — O4 is the decision; this CR is the work item. |
| CR-2026-07-03-000 (hardcoded POS creds) | RELATED — same login flow (`refresh_pos_token`). |
| CR-2026-09-12-006 (backend split) | RELATED — route deletion; this CR is *replacement*, not deletion. |

```text
Intake complete: CR-2026-09-15-004
Classification: CR — architecture / auth (identity provider change)
Severity: P1 (contains a P0 security sub-item, carved out 2026-10-03 as CR-2026-10-03-002)
Risk: CRITICAL (security + auth + production data; get_current_user and /api/auth/login run on every admin request)
Duplicate check: DISTINCT (same topic as owner question O4; related CR-2026-07-03-000, CR-2026-09-12-006; franchise scope split out 2026-10-03 as CR-2026-10-03-006)
Evidence: captured (server.py:367, :587 line-verified on 3oct; CRM INV-022 C1 confirms CRM is not the admin identity provider; POS login verified 200 on 2026-10-03)
Blast radius: MEDIUM
Docs updated: this file, ../README.md, ../../PRD.md, ../../control/CONTRACT_CUSTOMER_APP_CRM_v1.0.md §6 step 3
Next: BLOCKED — POS profile endpoint path + response shape (contract O-14) and owner F3 approval, then Planning (IMPACT_AND_NEW_FLOW.md)
Note: output block + risk label added 2026-10-03 during registry-sync audit; both were missing from the original 2026-09-15 intake
```
