# INTAKE DOC — CR-2026-10-04-001

> **Session-date note:** registered in the session immediately following 2026-10-03. If the owner's
> calendar puts this session on a different date, renumber the ID and update the registry row —
> the per-day sequence is the only thing affected.

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-10-04-001 |
| **Title** | `GET /api/table-config` falls back to CRM's `users.mygenie_token`, forcing a CRM secret to stay on the admin auth path |
| **Classification** | CR — security hardening / shared-DB boundary |
| **Date Registered** | session after 2026-10-03 |
| **Reported By** | Planning of CR-2026-10-03-002 (the projection could not drop this field without an outage) |
| **Severity** | **P2** |
| **Risk** | **HIGH** — `server.py` hotspot (Part C CRITICAL); the alternative token has a *different identity* (see §3) |
| **Status** | 📝 REGISTERED (Role 1 done) — needs an owner direction before Planning |
| **Parent** | CR-2026-10-03-002 (residual) · relates to CR-2026-09-15-004 |
| **Blast radius** | SMALL in lines (2–3), MEDIUM in behaviour (admin QR screen) |

## 1. Problem (code truth, verified this session on `3oct`)

```
server.py:902-905
    # Use token from header (preferred) or fallback to db.users (legacy)
    mygenie_token = x_pos_token or user.get("mygenie_token")
    if not mygenie_token:
        raise HTTPException(status_code=400, detail="No POS token provided. Please logout and login again.")
```

`user` here is the document returned by `get_current_user`, i.e. a read of **CRM-owned `users`**.
So one admin route keeps `mygenie_token` pinned in the projection that CR-2026-10-03-002 added,
which is why that P0 could only remove **3 of 4** secret-bearing fields.

The fallback is **live, not dead** — two routes reach it:
- `AdminQRPage.jsx:110` sends `'X-POS-Token': posToken || ''`. When `localStorage.pos_token` is
  missing it sends an **empty string**, which FastAPI binds as falsy → DB fallback taken.
- Login **succeeds even when the POS token refresh fails** (`server.py:610-611` logs a warning and
  continues), so a working admin session with no `pos_token` is a normal, reachable state.

## 2. Scope

**IN:** decide and implement how `/api/table-config` obtains a POS token without reading CRM's
`users`; remove the fallback; remove `mygenie_token` from `USERS_AUTH_PROJECTION`.
**OUT:** the projection itself (CR-2026-10-03-002, shipped); moving admin login to POS
(CR-2026-09-15-004); `refresh_pos_token`'s own implementation.

## 3. ⚠️ The trap that makes this a decision, not a cleanup

The obvious fix — "drop the fallback, let the frontend's existing 401 auto-refresh handle it via
`POST /api/pos/auth-token`" — **changes whose tables are returned.**

`/api/pos/auth-token` authenticates with the **service account** in `backend/.env`
(`MYGENIE_POS_LOGIN_PHONE` / `MYGENIE_POS_LOGIN_PASSWORD`), **not** the logged-in admin.
`users.mygenie_token` is the admin's *own* POS token. These are the **two POS identities** flagged
in the 2026-10-03 handover §5 trap 4. Swapping one for the other risks showing an admin the
**service account's outlet's** tables — a cross-tenant data leak dressed up as a cleanup.

Secondary detail: the current failure is `400`, but `AdminQRPage.jsx:119` only auto-refreshes on
`401`. Any fix that relies on the existing retry must also change that status code.

## 4. Candidate directions (for the owner / Planning, not decided)

### 3a. 🔴 QA evidence — the fallback token is *stale*, so the fallback barely works

QA (Gate 0, same session) removed `localStorage.pos_token` and loaded the admin QR screen. Result:

- the fallback was taken and **authenticated our own route fine** (no `400`), but
- the `users.mygenie_token` value for restaurant 478 is **stale against the live POS API**, so
  `/api/table-config` returned **401 upstream** — four consecutive times. The screen ends on
  *"Your POS session has expired — Re-login"*, and the frontend's `/api/pos/auth-token`
  auto-refresh does not rescue it.

So the field this CR wants to remove is a CRM secret that **pins itself to our hottest auth path
while not reliably doing its job**. Nobody refreshes it: `refresh_pos_token` writes to
`localStorage` via the login response, never back into `users` (and it must not — `users` is
CRM-owned, contract §2). That materially strengthens directions **A/B/C** over **D**.

| # | Direction | Cost | Risk |
|---|---|---|---|
| A | Make login **fail hard** if the POS token refresh fails, so `localStorage.pos_token` is always present, then delete the fallback | small | admins can no longer log in during a POS outage |
| B | Issue a per-admin POS token server-side at login and cache it in **our own** collection (not CRM's `users`) | medium | new collection; needs a contract §2 row |
| C | Fold into CR-2026-09-15-004 (admin login → POS direct), where the POS token becomes ours by construction | zero extra | inherits that CR's O-14 / F3 blockers |
| D | Leave as-is, accept one CRM secret on the auth path | zero | the P0 stays 75% fixed |

Planning's lean is **C** — the token problem disappears once admin identity comes from POS — with
**D** as the explicit interim position. Do not pick A without the owner, since it trades a security
nicety for a login outage mode.

## 5. Duplicate check

| Item | Relationship | Verdict |
|---|---|---|
| CR-2026-10-03-002 | Parent; this is the residual it could not cover | **DISTINCT** — that one is shipped |
| CR-2026-09-15-004 | Likely absorber (direction C) | RELATED — may be closed as a duplicate if C is chosen |
| CR-2026-07-03-000 / -011 (POS proxy) | Credential-handling track | RELATED, not overlapping |

**Verdict: DISTINCT.**

## 6. Blast radius

MEDIUM — admin QR / table-config screen for every restaurant. No customer-facing path.

---

```text
Intake complete: CR-2026-10-04-001
Classification: CR (security hardening / shared-DB boundary)
Severity: P2
Risk: HIGH (hotspot file; two-POS-identity trap)
Duplicate check: DISTINCT
Evidence: captured (server.py:902-905, AdminQRPage.jsx:110/119, server.py:610-611)
Blast radius: MEDIUM
Docs updated: this file; ../README.md; ../CR-2026-10-03-002-users-read-projection/{IMPACT_ANALYSIS,QA_HANDOVER}.md
Next: owner direction on §4 A/B/C/D, then Planning
```
