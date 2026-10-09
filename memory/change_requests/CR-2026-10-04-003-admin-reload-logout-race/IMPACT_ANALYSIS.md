# IMPACT ANALYSIS — CR-2026-10-04-003 (admin reload logout race)

**Status:** ⚠️ **WRITTEN RETROACTIVELY** — see `/app/memory/GATE_RECONCILIATION_2026-10-04.md`
**Role:** Planning (Role 2) · **Severity:** P1 · **Risk:** LOW to fix, HIGH if left
**Verdict:** correct fix, correct file, but it is a **stopgap inside CR-2026-09-12-008's territory**

---

## 1. Current flow vs new flow

**Current (broken) — hard reload of `/admin/settings`:**

```
1. React mounts.                         AuthContext: token = null, loading = true
2. AuthContext effect fires              → GET /api/auth/me  (in flight)
3. AdminLayout effect fires on the SAME render
   → sees token === null
   → navigate('/login')                  ← the admin is gone
4. /api/auth/me resolves 200, setToken(…) runs — on a page nobody is looking at any more
```

**New:**

```
1. React mounts.                         token = null, loading = true
2. AuthContext effect fires              → GET /api/auth/me  (in flight)
3. AdminLayout effect fires → loading === true → return (no redirect)
4. /api/auth/me resolves → setToken(…), setLoading(false)
5. AdminLayout effect re-runs (loading now in the dep array) → token present → stays put
```

## 2. Why it stayed hidden for so long

Every manual and automated test logged in first. `login()` sets `token` in the same tick, so the
effect never observed `null`. **Only a hard reload reaches the broken path**, and no regression test
had ever pressed F5. It surfaced now only because `CR-2026-10-03-002/QA_HANDOVER.md` §3 added test
**Q3** specifically to prove the narrower `/api/auth/me` object still hydrated the admin UI.

That is the useful lesson, and it is worth more than the fix: the bug was found by a test written to
check *something else*.

## 3. Is it caused by the P0 projection? **No.**

The race is about *when* `token` becomes non-null, not *what* `/api/auth/me` returns. It reproduces
identically with the old 30-field response. Independently confirmed by the QA agent's own RCA.
It must not be recorded as a regression of CR-2026-10-03-002.

## 4. The failure mode the fix must not introduce

Guarding on `loading` is only safe if `loading` **always** reaches `false`. If it could stick at
`true`, `/admin/*` would stop redirecting altogether and become **publicly reachable** — trading a
nuisance for an access-control hole.

Verified in `AuthContext.jsx`:

| Check | Evidence |
|---|---|
| `checkAdminAuth()` is always invoked | `AuthContext.jsx:78`, inside a `useEffect(…, [])` |
| `setLoading(false)` runs on **every** path | `:62`, *outside* the `if (storedAdminToken)` block — so it also runs when there is no token at all |
| The error path terminates too | `:57-60` `catch` removes `auth_token`, then falls through to `:62` |
| `loading` is never set back to `true` afterwards | only two references in the whole file — `useState(true)` at `:31` and the provider value at `:221`; no other `setLoading` call exists |

So a logged-out visitor gets `loading → false`, `token === null`, and is still redirected. **The
guard delays the redirect; it never removes it.** This was the one thing worth checking before
touching an auth guard, and it holds.

## 5. Blast radius

| | |
|---|---|
| Files | 1 (`frontend/src/layouts/AdminLayout.jsx`) |
| Routes affected | all `/admin/*` (settings, branding, visibility, banners, content, menu, dietary, qr-scanners) |
| Backend | none |
| Users affected by the bug | **every admin, on every refresh** |

## 6. Relationship to CR-2026-09-12-008 (FE route guards)

This logic belongs in a real `ProtectedRoute` that understands the three states
*(loading / authenticated / anonymous)* — exactly what CR-2026-09-12-008 exists to build. That CR is
**Wave 3 and explicitly out of this sprint** (D-S1).

Planning's position: keep the two-line guard now because admins cannot refresh a page today, and
fold the pattern into -008 when Track D opens. Recorded in that CR's duplicate-check table so the
stopgap is not rediscovered as a mystery later.

## 7. Same bug in dead code — deliberately not fixed

`pages/AdminSettings.jsx:199-211` has the identical unguarded redirect. `App.js` imports the
component but **routes nothing to it** (`/admin/settings` renders `pages/admin/AdminSettingsPage`).
Fixing unreachable code would be noise; it is instead **evidence for retiring 1,324 lines of
dead bundle weight** under CR-2026-09-12-013.
