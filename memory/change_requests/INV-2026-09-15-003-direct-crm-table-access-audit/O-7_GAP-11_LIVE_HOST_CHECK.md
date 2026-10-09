# O-7 / GAP-11 — live-host JWT secret check
## Ref: contract §7 O-7 · GAP-11 · this document belongs to **INV-2026-09-15-003** · Date: 2026-10-03

> **Citation corrected 2026-10-06 (Role 1 intake pass).** This line previously read
> `INV-2026-09-12-018`, an ID that exists nowhere — no folder, no registry row, and no other mention
> in the repository. It was a stale self-reference written while this document still lived under a
> provisional ID. The owning item is the folder this file sits in, `INV-2026-09-15-003`. No registry
> row was created for `INV-2026-09-12-018`; see `INTAKE_PASS_2026-10-06.md` §4.
## Status: **OUR HALF VERIFIED AND CLOSED. CRM's live host CANNOT be verified from here — owner action, instructions in §3.**

---

## 1. What GAP-11 actually is

The original risk: **if CRM's backend fell back to a hardcoded default `JWT_SECRET`, and ours
happened to be the same string, then a CRM-issued customer token would validate on our admin
routes** — a cross-service authentication bypass on a shared database.

It has two halves. Only one of them is ours.

| Half | Owner | Status |
|---|---|---|
| CRM's build has no hardcoded JWT fallback | CRM | ✅ **verified in PREVIEW** by CRM (`core/auth.py:11`, fallback removed under their CR-027). ⚠️ **live host unverified** |
| CRM's **live** host actually sets `JWT_SECRET` in env | **owner** (needs live access) | ❌ **NOT VERIFIED — see §3** |
| Our build has no hardcoded JWT fallback, and our secret is not guessable | **us** | ✅ **VERIFIED — §2** |

## 2. Our half — verified 2026-10-03

| Check | Result | Evidence |
|---|---|---|
| Secret comes from env only | ✅ | `server.py:47` → `JWT_SECRET = os.environ.get('JWT_SECRET')` |
| **No fallback / no default** | ✅ | `server.py:48-49` → raises `ValueError("CRITICAL: JWT_SECRET environment variable must be set")`. The app **refuses to start** without it — fails fast, exactly as required |
| Single signing path | ✅ | one `jwt.encode` (`:343`) and one `jwt.decode` (`:347`), both using the module constant. No second secret, no per-route override |
| Algorithm pinned | ✅ | `HS256` fixed at `:50`; `jwt.decode` passes `algorithms=[JWT_ALGORITHM]`, so algorithm-confusion (`alg: none`) is not possible |
| Secret strength | ✅ | 63 characters, alphanumeric, **not** a placeholder (checked against `secret`, `changeme`, `mygenie`, `your-secret-key`, `supersecret`, `test`) |
| Secret in the repo? | ✅ no | value lives only in `backend/.env`, which is untracked |

### 2a. A second, accidental line of defence
Even if the two services' secrets were identical, a CRM customer token would **not** authenticate as
an admin here. Our tokens carry `{user_id, user_type, exp}` (`server.py:338-342`), and
`get_current_user` (`:355-372`) reads `user_type` then looks the id up in `customers` or `users`.
A CRM-shaped token has neither claim, so the lookup fails and the request is rejected with 401.

**This is defence by accident, not by design** — we never asserted an issuer or audience. Worth
knowing, **not** worth relying on:

> **Optional hardening (not registered as a CR, no owner request):** add `iss: "customer-app"` to
> our tokens and require it on decode. Two lines, makes the isolation explicit instead of
> incidental. Only worth doing if the owner wants it — the current risk is already low and the
> `users` dependency disappears at contract §6 step 3 anyway.

## 3. CRM's live host — what the owner needs to check

**We cannot do this.** We have no access to CRM's live host, no access to its environment, and no
way to read its runtime config. Anyone claiming to have verified it from this codebase would be
guessing. Below is the exact check for whoever does have access.

### Check 1 — the env var is actually set on the live host
On the live CRM host (or its deployment config / secret store):
```bash
# inside the running CRM container or host shell
printenv JWT_SECRET | wc -c      # expect > 1, i.e. non-empty
```
- **Non-empty** → good, move to Check 2.
- **Empty or missing** → this is the GAP-11 scenario. Whatever CRM's code does when the var is
  absent is now live behaviour. Stop and tell CRM.

### Check 2 — the live build is the one CRM verified
CRM verified `core/auth.py:11` has no fallback **in preview**. Confirm the live host runs a build
that **includes their CR-027**:
- ask CRM for the commit/tag deployed live, and that CR-027 is in it; or
- grep the deployed source: `grep -n "JWT_SECRET" core/auth.py` on the live host — there should be
  **no** `or "..."`, no `os.getenv(..., "default")`, no literal fallback string.

### Check 3 — the two secrets are different
This is the check that actually closes the risk, and it can be done **without either secret ever
being shared**. On each host separately:
```bash
printenv JWT_SECRET | sha256sum
```
Compare only the **hashes**.
- **Different hashes** → ✅ risk closed. Cross-service token forgery is impossible regardless of
  anything else. **Record the result, not the hashes.**
- **Identical hashes** → 🔴 **act immediately.** The two services share a signing key. Rotate ours
  (`backend/.env` → `JWT_SECRET`, then restart), which invalidates all current admin sessions — a
  forced re-login is the correct price. Tell CRM to rotate theirs too.

### What to report back
One line is enough, and **no secret values**:
> *"Live CRM host: JWT_SECRET is set / not set. Deployed build includes CR-027: yes / no.
> Secret hashes differ from Customer App: yes / no."*

## 4. Verdict

- **Our half: closed.** No fallback, fails fast, pinned algorithm, strong non-placeholder secret,
  plus incidental payload-shape isolation.
- **CRM's preview half: closed by CRM.**
- **CRM's live half: open, and only the owner can close it.** It stays as contract **O-7**.

Honest framing: the residual risk is **low but not zero**, and it is **unmeasured** rather than
measured-safe. Check 3 is the one that matters — three commands, no secrets exchanged, and it
settles the question permanently.

```text
O-7 status: our half VERIFIED AND CLOSED · CRM live host NOT VERIFIABLE from this codebase
Evidence (ours): server.py:47-49 (no fallback, fails fast) · :50 (HS256 pinned) · :343/:347 (single path) · 63-char non-placeholder secret · :338-342/:355-372 (payload-shape isolation)
Owner action: 3 checks in §3 — the decisive one is comparing SHA-256 hashes of the two secrets, which requires no secret to be shared
Not registered as a CR: optional `iss` claim hardening (2 lines) — owner has not asked, risk already low, dependency disappears at §6 step 3
```
