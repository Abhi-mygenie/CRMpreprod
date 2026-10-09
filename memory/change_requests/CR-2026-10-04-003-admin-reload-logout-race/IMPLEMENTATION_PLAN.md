# IMPLEMENTATION PLAN — CR-2026-10-04-003 (admin reload logout race)

**Status:** ↩️ **IMPLEMENTED, THEN REVERTED by owner decision** — retained as a ready-to-use plan
for CR-2026-09-12-008. The bug is still live in `3oct`.
**Role:** Planning (Role 2)
**Files changing:** 1 · **Total edits:** 2 · **Backend touched:** none
**Verified against:** `frontend/src/layouts/AdminLayout.jsx` on `3oct` at commit `3ba0065`

---

## Pre-Implementation Checklist

| # | Check | Status |
|---|-------|--------|
| 1 | `loading` already exposed by `AuthContext` | ✅ `AuthContext.jsx:221` — no context change needed |
| 2 | `loading` provably always reaches `false` | ✅ `AuthContext.jsx:62`, outside the `if` — see IMPACT §4 |
| 3 | Owner approval for this plan | ❌ **NOT OBTAINED BEFORE CODING** |
| 4 | Role 3 assigned | ❌ **NOT ASSIGNED** — fixed inline while clearing a QA finding |
| 5 | No active CR on this file | ✅ clear (CR-2026-09-12-008 registered but unstarted) |

## Scope Lock

**WILL change:** `frontend/src/layouts/AdminLayout.jsx` — the `AdminLayoutContent` destructure and
its one redirect effect.
**WILL NOT change:** `AuthContext.jsx` · `App.js` routing · `pages/AdminSettings.jsx` (dead code,
IMPACT §7) · any other layout · the customer-side `/profile` guard · backend.

---

## Edit-by-Edit Plan

### EDIT AL-1 — pull `loading` out of the auth context

**Where:** `frontend/src/layouts/AdminLayout.jsx` L35.

**Current:**
```jsx
  const { user, logout, isRestaurant, token } = useAuth();
```
**Replace with:**
```jsx
  const { user, logout, isRestaurant, token, loading } = useAuth();
```
**Why:** `loading` is the only reliable signal that the mount-time `/api/auth/me` has settled.
Inferring it from `token`/`user` being null is exactly the bug.
**In code?** ✅ L35.

---

### EDIT AL-2 — gate the redirect on `loading`, and add it to the dep array

**Where:** `frontend/src/layouts/AdminLayout.jsx` L41-54.

**Current:**
```jsx
  // Redirect if not restaurant user
  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    if (!isRestaurant) {
      navigate('/profile');
      return;
    }
  }, [token, isRestaurant, navigate]);
```
**Replace with:**
```jsx
  // Redirect if not restaurant user.
  // CR-2026-10-04-003: wait for AuthContext's mount-time /api/auth/me to resolve —
  // `token` is null on the first render after a reload, which used to bounce
  // logged-in admins to /login on every F5.
  useEffect(() => {
    if (loading) return;
    if (!token) {
      navigate('/login');
      return;
    }
    if (!isRestaurant) {
      navigate('/profile');
      return;
    }
  }, [loading, token, isRestaurant, navigate]);
```

**Why each part:**
- `if (loading) return;` — the fix. While the session is being restored, make no decision at all.
- **`loading` added to the dependency array** — the half of the fix that is easy to miss. Without
  it the effect would not re-run when `loading` flips to `false`, so an anonymous visitor would
  never be redirected and `/admin/*` would render for them. The guard and the dep must land together.
- The `!isRestaurant → /profile` branch is unchanged, and now also benefits: it previously evaluated
  against an un-hydrated context.
- Comment carries the CR id, per house convention.

**In code?** ✅ `loading` guard at L45, dep array at L54.

---

## Verification matrix

| # | Case | Method | Expected | Result |
|---|---|---|---|---|
| V1 | Login → `/admin/settings` → **hard reload** | Playwright, preview URL | URL stays `/admin/settings` | ✅ PASS |
| V2 | Admin chrome hydrates from `/api/auth/me` alone | Playwright | sidebar + `owner@18march.com` + `18march` render | ✅ PASS |
| V3 | No `undefined` leaking into the UI | Playwright body text | absent | ✅ PASS |
| V4 | Anonymous visitor to `/admin/settings` is still redirected | **not yet run** | `/login` | ⏳ **GAP — must be tested before closure** |
| V5 | Logout still redirects | **not yet run** | leaves admin area | ⏳ **GAP** |
| V6 | Customer `/profile` guard unaffected | QA pass | unchanged | ✅ no code path shared |
| V7 | Owner smoke | owner | — | ⏳ **NOT DONE** |

**Planning is explicit about V4/V5:** the fix was verified for the *happy* path only. V4 is the case
where a mistake would be a security hole rather than a nuisance, and it has **not been executed** —
it is argued safe from code (IMPACT §4) but not demonstrated. It must be run before this item is
called closed, whatever the owner decides on the gate question.

## Rollback

```bash
git diff 8d17508 -- frontend/src/layouts/AdminLayout.jsx | git apply -R
```
Two lines. Reverting restores the "F5 logs you out" behaviour for every admin.

## Follow-up

Fold the loading-aware guard into **CR-2026-09-12-008** (`ProtectedRoute` / `RoleGuard`) when
Track D opens, and delete this stopgap at that point.
