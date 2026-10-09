# INTAKE DOC — CR-2026-10-04-003

> ## ↩️ REVERTED — read this first
>
> The two-line fix described in §3 **was implemented and then withdrawn** at the owner's
> instruction (session after 2026-10-03). Reason: it is strictly **CR-2026-09-12-008** territory
> (FE route guards), and that CR is deliberately out of the Code-Correctness Sprint (D-S1).
> The owner accepts the current behaviour — **admins must log in again after a page refresh** —
> until Track D opens.
>
> **The bug itself is NOT fixed and is NOT closed.** `frontend/src/layouts/AdminLayout.jsx` is now
> byte-identical to its pre-session state (`git diff 8d17508` → empty for that file).
> This document is retained as the completed intake + root cause, so -008 does not have to
> rediscover it. See also `IMPACT_ANALYSIS.md` and `IMPLEMENTATION_PLAN.md` — the plan is
> implementation-ready and can be lifted straight into -008.


## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-10-04-003 |
| **Title** | **BUG** — hard reload of any `/admin/*` route logs the admin out: `AdminLayout` redirects to `/login` before `AuthContext` finishes restoring the session |
| **Classification** | BUG — frontend auth/session race |
| **Date Registered** | session after 2026-10-03 |
| **Reported By** | QA (testing agent) during Gate 0 of the Code-Correctness Sprint, regression test Q3 |
| **Severity** | **P1** — every admin, every refresh |
| **Risk** | LOW to fix (one guard, one layout file) |
| **Status** | ↩️ **REVERTED BY OWNER DECISION** — the bug is **real and still live**; the fix was withdrawn because it belongs to CR-2026-09-12-008 (FE route guards), which is out of this sprint. Owner accepts that admins must re-login after a refresh until then. `AdminLayout.jsx` is byte-identical to its pre-session state |
| **Blast radius** | all `/admin/*` routes |

## 1. Problem

```
layouts/AdminLayout.jsx:41-50
    useEffect(() => {
      if (!token) { navigate('/login'); return; }
      ...
    }, [token, isRestaurant, navigate]);
```

`AuthContext` starts with `token = null` and only populates it **after** its mount-time
`GET /api/auth/me` resolves (`AuthContext.jsx:36-63`). `AdminLayout`'s effect runs on the first
render — while that request is still in flight — sees `null`, and navigates away.

So **pressing F5 on any admin screen logs the admin out**, even though `auth_token` is sitting in
`localStorage` and `/api/auth/me` returns `200`.

## 2. Pre-existing, not caused by CR-2026-10-03-002

Worth stating plainly, because it surfaced in the same QA run as the P0 projection: the race is in
`token` nullability on first render and is independent of the response *shape*. The projection
changed which fields `/api/auth/me` returns, not when it resolves. QA's own RCA reached the same
conclusion.

It stayed invisible because every manual test logged in first — logging in sets `token` in the same
tick, so the effect never saw `null`. Only a **hard reload** reaches the broken path, and no
regression test had ever done one.

## 3. Fix

`frontend/src/layouts/AdminLayout.jsx` — consume `loading` from `useAuth()` and wait for it:

```js
const { user, logout, isRestaurant, token, loading } = useAuth();
useEffect(() => {
  if (loading) return;            // CR-2026-10-04-003
  if (!token) { navigate('/login'); return; }
  if (!isRestaurant) { navigate('/profile'); return; }
}, [loading, token, isRestaurant, navigate]);
```

`loading` was already exposed by `AuthContext` (`AuthContext.jsx:221`) and already set `false` in a
`finally`, so no context change was needed.

## 4. Verification

Playwright, against the preview URL: log in → navigate to `/admin/settings` → **hard reload**.

```
before: redirected to /login
after:  URL stays /admin/settings · sidebar, "owner@18march.com" and "18march" all render
        · no literal "undefined" anywhere in the body
```

This also closes QA regression test **Q3** in
`CR-2026-10-03-002/QA_HANDOVER.md` §3, which could not pass while this bug was live.

## 5. Scope note — the same bug exists in dead code

`pages/AdminSettings.jsx:199-211` has the identical unguarded redirect. **Deliberately not fixed:**
`App.js` imports that component but **routes nothing to it** (`/admin/settings` renders
`pages/admin/AdminSettingsPage`). It is 1,324 lines of unreachable code still being shipped in the
bundle — evidence for retiring it under **CR-2026-09-12-013**, not a bug to fix here.

## 6. Duplicate check

| Item | Relationship | Verdict |
|---|---|---|
| CR-2026-09-12-008 (FE route guards) | Would own this logic properly, via a `ProtectedRoute` that understands `loading` | **RELATED** — this is the one-line stopgap; -008 is the real fix and is **not** in this sprint |
| CR-2026-10-03-002 | Found in its QA run | DISTINCT — pre-existing |

**Verdict: DISTINCT.**

---

```text
Intake complete: CR-2026-10-04-003
Classification: BUG (frontend auth/session race)
Severity: P1
Risk: LOW
Duplicate check: DISTINCT (CR-2026-09-12-008 would supersede)
Evidence: captured (AdminLayout.jsx:41-50, AuthContext.jsx:36-63/221; Playwright before/after)
Blast radius: all /admin/* routes
Docs updated: this file; ../README.md; ../../SPRINT_CODE_CORRECTNESS.md
Next: none — fixed and verified. Fold the pattern into CR-2026-09-12-008 when Track D opens
```
