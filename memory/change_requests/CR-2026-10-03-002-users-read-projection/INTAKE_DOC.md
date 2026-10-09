# INTAKE DOC — CR-2026-10-03-002

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-10-03-002 |
| **Title** | Admin-auth reads of CRM `users` load CRM's secrets into memory — add a 7-field projection |
| **Classification** | **BUG (security / secret hygiene)** — unnecessary secret exposure on the hottest auth path |
| **Date Registered** | 2026-10-03 |
| **Reported By** | INV-2026-09-15-003 §3B (U1/U2) · recorded as the **P0 sub-item** of CR-2026-09-15-004 · **approved by owner 2026-10-03** |
| **Severity** | **P0** (security) — no outage, but every admin request copies third-party API keys into our process |
| **Risk** | **CRITICAL by area** — admin authentication path (`get_current_user` runs on *every* admin request). Change is additive (a projection argument), behaviour must be identical. **No Fast Lane.** |
| **Status** | 📝 REGISTERED (Role 1 done) — **owner approved 2026-10-03**; ships independently of its parent |
| **Parent** | CR-2026-09-15-004 §2 (carved out because the parent is gated on F3 + POS P5 and cannot ship) |
| **Blast radius** | **SMALL** — 2 lines in 1 backend file |

## 1. Problem (code truth, verified on `3oct` 2026-10-03)

```
server.py:367   user = await db.users.find_one({"id": user_id}, {"_id": 0})          # get_current_user
server.py:587   user = await db.users.find_one({"$or":[{"email":…},{"phone":…}]}, {"_id": 0})  # POST /api/auth/login step 2
```

`users` is a **CRM-owned** collection. Its documents carry CRM's own integration secrets —
`api_key`, `authkey_api_key`, `mygenie_token` — alongside the 6 fields we actually use
(`id`, `email`, `phone`, `password_hash`, `restaurant_id`, `pos_id`).
`{"_id": 0}` excludes only `_id`, so **every admin login and every authenticated admin request
pulls CRM's secrets into our process memory**, where they can reach logs, tracebacks and error
reporters. Nothing in our code reads them.

Classified by INV-003 as class **B — acceptable exception, harden**: CRM exposes no admin-login
API, so the read itself stays until CR-2026-09-15-004 moves admin login to POS. The projection
reduces blast radius **now**, with zero behaviour change.

## 2. Scope

**IN** — replace the projection at both call sites with:
`{"_id":0,"id":1,"email":1,"phone":1,"password_hash":1,"restaurant_id":1,"pos_id":1,"restaurant_name":1,"pos_name":1}`
(the last two are included only if Planning confirms a consumer; otherwise drop them).
Add a single shared constant so the two sites cannot drift apart.

**OUT** — removing the `users` read (that is CR-2026-09-15-004, direction D, gated on F3 + POS P5);
`refresh_pos_token` (L410, does not read `users`); the legacy `db.users` fallback comment at L902;
any CRM-side change; any frontend change.

## 3. Duplicate check

| Item | Relationship | Verdict |
|---|---|---|
| CR-2026-09-15-004 | This was its §2 "ship first" sub-item | **DISTINCT — deliberately carved out** so a P0 security fix is not blocked by an unapproved architecture change |
| CR-2026-10-03-001 | Touches the same two functions (dead *customer* branches) | RELATED — sequence; this CR is 2 lines and should land first |
| CR-2026-07-03-012 (leaked-cred scrub) | Docs/CI hygiene, not runtime | DISTINCT |

## 4. Code exists? **PARTIAL** — reads exist, projection does not.

## 5. Files

| Will change | Will NOT touch |
|---|---|
| `backend/server.py` (L367, L587 + 1 constant) | frontend · `.env` · CRM `users` documents (read-only, never written) |

## 6. Acceptance criteria

1. Admin login for UAT rid **689** succeeds and returns the same payload as before (creds in `memory/test_credentials.md`).
2. `GET /api/auth/me` returns the same fields as before the change.
3. Admin config save for 689 still writes under the correct `restaurant_id`.
4. A debug dump / log of the fetched user object contains **no** `api_key`, `authkey_api_key`, `mygenie_token`.
5. QR / table-config admin operations that depend on the POS token still work (`refresh_pos_token` path unchanged).
6. No new `db.users` call site introduced; count stays at 2.

## 7. Prerequisites
- None. Owner has approved; no CRM, POS or frontend dependency.
- Planning must confirm whether `restaurant_name` / `pos_name` have real consumers before including them.

```text
Intake complete: CR-2026-10-03-002
Classification: BUG (security / secret hygiene)
Severity: P0
Risk: CRITICAL (admin auth path), change is additive
Duplicate check: DISTINCT (carved out of CR-2026-09-15-004 §2)
Evidence: captured (server.py L367, L587 line-verified on 3oct)
Blast radius: SMALL (2 lines, 1 file)
Docs updated: this file, ../README.md, ../../PRD.md, ../CR-2026-09-15-004-admin-login-users-table-dependency/INTAKE_DOC.md
Next: Planning (Impact Analysis + Implementation Plan) — shortest path to ship
```
