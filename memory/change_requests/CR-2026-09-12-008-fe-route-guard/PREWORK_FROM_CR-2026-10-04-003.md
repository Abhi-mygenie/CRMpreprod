# PRE-WORK — inherited requirement for CR-2026-09-12-008 (FE route guards)

**Added:** session after 2026-10-03 · by Planning (Role 2)
**Why this file exists:** a live P1 bug was diagnosed, fixed, and then **reverted** because the
owner ruled it belongs here rather than in a one-off patch. This is the handover so nothing is lost.

---

## Requirement R-008-1 — the guard must be `loading`-aware

Source: **CR-2026-10-04-003** (full intake, impact analysis and a line-by-line implementation plan
are in `../CR-2026-10-04-003-admin-reload-logout-race/`).

### The bug -008 must fix

Hard-reloading **any** `/admin/*` route logs the admin out. `AdminLayout`'s redirect effect runs on
the first render, while `AuthContext`'s mount-time `GET /api/auth/me` is still in flight, sees
`token === null`, and navigates to `/login`. Status in `3oct`: **live and unfixed** — the owner
accepts it until this CR lands.

### What the `ProtectedRoute` / `RoleGuard` must therefore model

Three states, not two:

| State | Signal | Correct action |
|---|---|---|
| restoring | `loading === true` | **render nothing and decide nothing** — no redirect |
| authenticated | `!loading && token && isRestaurant` | render the route |
| anonymous | `!loading && !token` | redirect to `/login` |
| wrong role | `!loading && token && !isRestaurant` | redirect to `/profile` |

Two implementation details that cost time to establish, verified in `AuthContext.jsx`:

1. **`loading` must be in the effect's dependency array.** With the guard but without the dep, the
   effect never re-runs when `loading` flips to `false`, so anonymous visitors are **never**
   redirected and `/admin/*` renders for them. Guard and dep ship together or not at all.
2. **`loading` provably always terminates**, so gating on it cannot permanently disable the guard:
   `checkAdminAuth()` is invoked unconditionally (`:78`, `useEffect(…, [])`); `setLoading(false)` is
   at `:62` *outside* the `if (storedAdminToken)` block, so it fires even with no token; the `catch`
   at `:57-60` falls through to it; and no other `setLoading` call exists in the file.

### Test cases -008 must carry (two were never executed and remain gaps)

| # | Case | Expected | Previously |
|---|---|---|---|
| T1 | login → `/admin/settings` → **hard reload** | stays on the page | ✅ verified before revert |
| T2 | admin chrome hydrates from `/api/auth/me` alone | sidebar + email + restaurant name render | ✅ verified |
| T3 | **anonymous visitor hits `/admin/settings`** | redirected to `/login` | ⚠️ **NEVER RUN** — the one case where a mistake is an access-control hole |
| T4 | **logout from an admin page** | leaves the admin area | ⚠️ **NEVER RUN** |
| T5 | customer `/profile` guard | unchanged | no shared code path |

### Scope note carried over

`pages/AdminSettings.jsx:199-211` has the **same** unguarded redirect but `App.js` routes nothing to
it — 1,324 lines of unreachable code still shipped in the bundle. Do not fix it here; it is evidence
for **CR-2026-09-12-013** (retire the legacy page).
