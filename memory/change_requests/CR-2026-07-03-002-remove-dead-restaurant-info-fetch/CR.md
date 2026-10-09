# CR-2026-07-03-002 — Remove Dead `/api/restaurant-info/{id}` Fetch from Admin Bootstrap

**Status:** REGISTERED — Planning stage
**Raised:** 2026-07-03
**Author:** E1 (INVESTIGATION → PLANNING role handoff)
**Priority:** P3 (cosmetic + minor admin UX regression, no customer impact)
**Severity:** MINOR
**Risk:** LOW–MEDIUM (touches `AdminConfigContext.jsx`; provider file, but change is scoped and additive)
**Fast Lane:** NOT eligible — provider file + affects two admin UI surfaces

---

## 1. Background

`frontend/src/context/AdminConfigContext.jsx` line 167 fires this on every admin login:

```js
fetch(`${API_URL}/api/restaurant-info/${configId}`).catch(() => null)
```

- `API_URL = REACT_APP_BACKEND_URL` → the **local FastAPI** at `cd356f08-…/api`.
- **The endpoint has never been implemented** in `backend/server.py`. Confirmed via `git log --all -S "/api/restaurant-info/" -- backend/server.py` → 0 commits, and OpenAPI enumeration of the running backend (38 routes, none match).
- Response is used to populate `restaurantFlags = { is_loyalty, is_coupon, multiple_menu }` (line 181-185).
- The `.catch(() => null)` swallows the 404 silently. `restaurantFlags` stays `{}` forever.
- Introduced in commit `37d6cfd` (2026-07-03 08:04:13Z) when the entire file was first created.

## 2. User-visible impact today

| Surface | Impact |
|---|---|
| Customer app | **None.** Customer-side reads `is_loyalty` from POS `POST /web/restaurant-info` via `useRestaurantDetails()`. |
| Admin > Settings > Visibility tab | "Loyalty Points" toggle row hidden (`VisibilityTab.jsx:96`). "Coupon Code" toggle row hidden (`VisibilityTab.jsx:97`). |
| Admin > Dietary tab | `multipleMenu` prop passed to `AdminDietaryPage.jsx:32` is `undefined` → downstream falls back to non-multi-menu behavior. |
| DevTools | 404 noise every admin login. |

Business meaning: restaurant admins **cannot toggle Loyalty / Coupon visibility** for their customer app, and multi-menu restaurants (like 716) lose part of their admin dietary UX.

## 3. Root Cause

Speculative scaffolding: the developer expected a future backend route to normalize per-restaurant flags. That route was never landed. Meanwhile the same three flags are already returned by the POS `POST /web/restaurant-info` endpoint that the frontend calls elsewhere via `restaurantService.getRestaurantDetails()` and the `useRestaurantDetails()` React-Query hook.

Evidence of duplication:
- `frontend/src/api/utils/restaurantIdConfig.js:13`: `return restaurant?.multiple_menu === 'Yes';` — reads directly from POS restaurant-info response.
- `frontend/src/components/LoyaltyRewardsSection/LoyaltyRewardsSection.jsx:20`: `if (…restaurant?.is_loyalty !== 'Yes') return null;` — same source.

The data source already exists. The dead fetch is redundant.

## 4. Proposed Change

**In one file (`AdminConfigContext.jsx`):**
1. Remove the `fetch(${API_URL}/api/restaurant-info/${configId})` line.
2. Replace the `restaurantFlags` state source with the response of `useRestaurantDetails(configId)` — the same hook LandingPage, DiningMenu, ReviewOrder, OrderSuccess, AboutUs and HamburgerMenu already use.
3. Preserve the exact `restaurantFlags` shape consumed by `VisibilityTab.jsx` and `AdminDietaryPage.jsx`:
   ```js
   restaurantFlags = {
     is_loyalty:     restaurant?.is_loyalty,      // 'Yes' | anything else
     is_coupon:      restaurant?.is_coupon,       // 'Yes' | anything else
     multiple_menu:  restaurant?.multiple_menu === 'Yes', // boolean (unchanged transform)
   }
   ```
4. Loading semantics unchanged (`setLoading(true)`/`(false)` still bounded by the /api/config fetch which stays).

**Reason for choosing the hook over a direct service call:** React Query dedupes concurrent requests with the same `queryKey`. Every admin session already has `useRestaurantDetails(restaurantId)` cached (10-min staleTime) because other admin pages call it. Zero extra network hit.

## 5. Files WILL change / WILL NOT touch

**WILL change (exactly 1 file):**
- `frontend/src/context/AdminConfigContext.jsx`
  - Add import for `useRestaurantDetails` from `../hooks/useMenuData`.
  - Delete `Promise.all(...)` restructure — keep only the `/api/config/${configId}` fetch.
  - Delete `restaurantResponse?.ok { … setRestaurantFlags(...) }` block.
  - Replace `restaurantFlags` state with a `useMemo` over the hook result.
  - Update the `useEffect` dependency array (drop the removed variables; add `restaurant` if the memo needs it).

**WILL NOT touch:**
- `backend/server.py` — no backend surface change, no new endpoint.
- `VisibilityTab.jsx` — its `restaurantFlags` prop shape stays identical.
- `AdminDietaryPage.jsx` — same.
- `restaurantService.js` / `useMenuData.js` — reused as-is.
- `Login.jsx`, `AuthContext.jsx`, `RestaurantConfigContext.jsx` — unrelated.
- Any customer-facing page.
- Restaurant 716 code paths (they read `multiple_menu` from POS — still works).

## 6. Impact Analysis

| Concern | Impact |
|---|---|
| API contract | none — no new backend, no changed request/response shapes |
| Data source | changes from `/api/restaurant-info/{id}` (never worked) → POS `/web/restaurant-info` (already working for customers) |
| Network calls per admin session | **-1 network call** (removes the dead 404 fetch). Zero added because `useRestaurantDetails` already runs. |
| Latency | improves — no wait on the dead fetch's timeout/failure |
| Failure modes | if POS restaurant-info fails, `restaurant` is `undefined` → `restaurantFlags = {}` (same behavior as today with the 404) |
| localStorage / cache | none |
| Provider ordering in App.js | unchanged (still needs `AuthProvider`, unchanged) |
| Test surface | 1 admin login flow + 2 admin tabs |
| Risk of regressing 716 | very low — 716 already reads `multiple_menu` via the POS hook elsewhere; same source |
| Rollback | trivial `git revert` of the single-file diff |

## 7. Verification Matrix

| Test | Pre-CR | Post-CR expected |
|---|---|---|
| Admin login for a restaurant with `is_loyalty=Yes` in POS | Loyalty toggle hidden | Loyalty toggle **visible** in `VisibilityTab` |
| Admin login for a restaurant with `is_coupon=Yes` in POS | Coupon toggle hidden | Coupon toggle **visible** |
| Admin login for a restaurant with `is_loyalty` NOT `Yes` | Loyalty toggle hidden | Loyalty toggle hidden (regression-safe) |
| Admin login for multi-menu restaurant (e.g. 716) | `multipleMenu` prop `undefined` | `multipleMenu` prop `true` |
| Admin login for single-menu restaurant | `multipleMenu` prop `undefined` | `multipleMenu` prop `false` |
| DevTools Network tab | `GET /api/restaurant-info/{id}` → 404 present | request **absent** |
| Customer flows for 698, 716, 709 | working | **unchanged** — no customer-facing code touched |
| `/api/config/{rid}` fetch | 200, populates `config` | 200, populates `config` (untouched) |
| ESLint | pass | pass |
| `yarn build` (`CI=false`) | pass | pass |

## 8. Owner Decisions Needed

1. **Confirm the same-shape contract for consumers.**
   - `VisibilityTab.jsx` line 96-97 checks `=== 'Yes'` (string compare). POS returns `is_loyalty: 'Yes' | 'No'` — matches. **No owner input needed if this holds.**
   - `AdminDietaryPage.jsx` line 32 uses `multipleMenu` as a boolean-ish value. Today's dead code did `multiple_menu === 'Yes'` boolean transform. We preserve that. **No owner input needed.**
2. **Should we also delete the placeholder `restaurantFlags` state name / rename it to `posFlags`?** Nice-to-have refactor; NOT included in this CR to keep the diff surgical. Owner decides if a follow-up rename is worth a separate P3 CR.
3. **Do you want a temporary `console.warn` if `restaurant` is null after the hook resolves?** Would surface POS-side outages. My recommendation: NO, keep it silent to match today's behavior. Owner override welcome.

## 9. Rollout

1. Implementation is a single-file surgical edit (~15 LOC net).
2. Self-test: admin login for 698 (single-menu, non-loyalty) + 716 (multi-menu) + one restaurant flagged with `is_loyalty=Yes`.
3. Regression: customer app on `/698?bustCache=1` unchanged.
4. If regression detected, `git revert` restores prior behavior (dead fetch returns).

## 10. Effort Estimate

- Implementation: 10-15 minutes.
- Self-test: 5-10 minutes.
- Total: under 30 minutes.
