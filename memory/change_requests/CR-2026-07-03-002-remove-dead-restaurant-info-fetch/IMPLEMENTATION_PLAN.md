# Implementation Plan — CR-2026-07-03-002

**Companion doc:** `CR.md` (in the same folder).
**Role:** PLANNING (no code written yet — for owner approval before IMPLEMENTATION role takes over).

---

## 1. Precise edit diff (illustrative — actual patch applied only after owner approval)

**File:** `frontend/src/context/AdminConfigContext.jsx`

### Change 1 — imports (top of file)

```diff
 import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
 import { useAuth } from './AuthContext';
+import { useRestaurantDetails } from '../hooks/useMenuData';
 import toast from 'react-hot-toast';
 import { DEFAULT_THEME } from '../constants/theme';
 import logger from '../utils/logger';
```

### Change 2 — remove dead fetch, source flags from the existing hook

```diff
-  const [restaurantFlags, setRestaurantFlags] = useState({});
+  // CR-2026-07-03-002 — flags now come from POS restaurant-info (same
+  // source the customer app and other admin pages use via
+  // useRestaurantDetails). Removes a dead 404 to a never-implemented
+  // local backend endpoint (/api/restaurant-info/{id}).
+  const configId = user?.restaurant_id || user?.id || null;
+  const { restaurant: posRestaurant } = useRestaurantDetails(configId);
+  const restaurantFlags = React.useMemo(() => ({
+    is_loyalty:    posRestaurant?.is_loyalty,           // 'Yes' | other
+    is_coupon:     posRestaurant?.is_coupon,            // 'Yes' | other
+    multiple_menu: posRestaurant?.multiple_menu === 'Yes', // boolean
+  }), [posRestaurant]);
```

### Change 3 — simplify the mount fetch (drop the parallel dead fetch)

```diff
     const fetchConfig = async () => {
       const configId = user.restaurant_id || user.id;
       setLoading(true);

       try {
-        const [configResponse, restaurantResponse] = await Promise.all([
-          fetch(`${API_URL}/api/config/${configId}`),
-          fetch(`${API_URL}/api/restaurant-info/${configId}`).catch(() => null)
-        ]);
+        const configResponse = await fetch(`${API_URL}/api/config/${configId}`);

         if (configResponse.ok) {
           const data = await configResponse.json();
           const extraInfoItems = data.extraInfoItems || [];
           while (extraInfoItems.length < 5) extraInfoItems.push('');
           const newConfig = { ...defaultConfig, ...data, extraInfoItems };
           setConfig(newConfig);
           setOriginalConfig(newConfig);
         }
-
-        if (restaurantResponse?.ok) {
-          const restaurantData = await restaurantResponse.json();
-          setRestaurantFlags({
-            is_loyalty: restaurantData.is_loyalty,
-            is_coupon: restaurantData.is_coupon,
-            multiple_menu: restaurantData.multiple_menu === 'Yes',
-          });
-        }
       } catch (error) {
         logger.error('admin', 'Failed to load admin config:', error);
         toast.error('Failed to load configuration');
       } finally {
         setLoading(false);
       }
     };
```

### Change 4 — remove the now-unused `setRestaurantFlags` from any downstream code

`grep -n "setRestaurantFlags" AdminConfigContext.jsx` → currently only the one call inside `fetchConfig` (the block deleted above). No exports depend on it. **Nothing else to change.**

Net diff: **~ +7 / −11 LOC** in one file. No public API change.

---

## 2. Compatibility check (consumers of `restaurantFlags`)

| Consumer | Line | Access pattern | Post-CR still works? |
|---|---|---|---|
| `components/AdminSettings/VisibilityTab.jsx` | 96 | `restaurantFlags.is_loyalty === 'Yes'` | ✅ yes — POS returns `'Yes'` or `'No'` (string) |
| `components/AdminSettings/VisibilityTab.jsx` | 97 | `restaurantFlags.is_coupon === 'Yes'` | ✅ yes — same |
| `pages/admin/AdminDietaryPage.jsx` | 32 | `multipleMenu={restaurantFlags.multiple_menu}` | ✅ yes — was `undefined`, now proper `true`/`false` boolean — this is an intentional **improvement**, not a break |
| `AdminConfigContext.jsx` value export line 384 | — | `restaurantFlags` exposed in provider value | ✅ shape unchanged |

No other consumers found via `grep -rn "restaurantFlags" /app/frontend/src`.

---

## 3. Data-shape contract (from POS `POST /web/restaurant-info`)

Sample fields (verified via runtime browser trace in earlier investigation):
```json
{
  "id": 698,
  "name": "Cafe Flora",
  "subdomain": "cafeflora",
  "is_loyalty": "Yes" | "No",
  "is_coupon":  "Yes" | "No",
  "multiple_menu": "Yes" | "No",
  ...
}
```

Both consumers today compare with `=== 'Yes'`, so the string values are safe to pass through unchanged.

---

## 4. React Query cache reuse (proof of "no extra network call")

The hook `useRestaurantDetails(identifier)` in `hooks/useMenuData.js:325-370`:
- Uses `queryKey: ['restaurant', identifier]`.
- `staleTime: 10 * 60 * 1000` (10 min).
- Also mirrors data under `['restaurant', subdomain]` (line 352).

Every admin session that hits Admin Settings has already navigated through pages that call this same hook. React Query returns the cached response synchronously → the `useMemo` in `AdminConfigContext` resolves the flags in the first render.

If an admin logs in and IMMEDIATELY visits Admin Settings (never touching customer pages), the hook fires exactly one network request → same request the app would have made on the next admin page anyway → still net-neutral.

---

## 5. Risk register

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | POS `restaurant-info` payload doesn't include `is_loyalty`/`is_coupon` for some restaurants | LOW | Customer app already reads these fields for `LoyaltyRewardsSection`; if they were absent, that section would be broken app-wide already. |
| R2 | POS restaurant-info is temporarily unavailable at admin login | LOW–MED | `restaurantFlags` becomes `{ multiple_menu: false }` — same as today's default when `restaurantFlags = {}`. Toggle rows stay hidden. Graceful. |
| R3 | React Query cache key mismatch (id vs subdomain vs numeric string) | LOW | `configId` is the JWT-issued `restaurant_id` (string). The hook accepts strings and internally normalizes to `data.id`. Verified in `useMenuData.js:342-353`. |
| R4 | `AdminConfigProvider` mounts before `AuthProvider` completes → `user` undefined → hook disabled | ZERO | The hook is `enabled: !!identifier`. When `configId` is null, hook returns `{restaurant: undefined}` → flags default. When `user` populates, hook fires. Same behavior as today's `if (!user?.id || !token) return;` guard. |
| R5 | Cross-tab admin sessions | ZERO | React Query cache is per-tab; no cross-tab coupling required. |

---

## 6. Verification steps for QA (post-implementation)

1. Load Admin Settings for restaurant 698 (Cafe Flora, likely `is_loyalty=No`) → confirm Loyalty toggle **hidden** (no regression), no DevTools 404, no console errors.
2. Load Admin Settings for a restaurant known to have `is_loyalty=Yes` in POS (owner to name one) → confirm Loyalty toggle **now visible** (fix delivered).
3. Load Admin Dietary tab for restaurant 716 (multi-menu) → confirm `multipleMenu={true}` is passed to child (React DevTools) and multi-menu rendering activates.
4. Load Admin Dietary tab for a single-menu restaurant → confirm `multipleMenu={false}` (not undefined).
5. Open Network tab throughout — expect **zero** requests to `/api/restaurant-info/*`.
6. Customer flow smoke on `/698` and `/716` — expected: unchanged.

---

## 7. Registration (per §10 of the system prompt)

- ID: `CR-2026-07-03-002-remove-dead-restaurant-info-fetch`
- Folder: `/app/memory/change_requests/CR-2026-07-03-002-remove-dead-restaurant-info-fetch/`
- Files in this folder: `CR.md`, `IMPLEMENTATION_PLAN.md` (this doc).
- To be added on implementation: `QA_HANDOVER.md`.

---

## 8. Gate summary (per §8 Role 2 output format)

```text
Planning complete: CR-2026-07-03-002
Stage: Impact Analysis + Implementation Plan
Code reality: PARTIAL (dead fetch exists; replacement source already exists)
Risk: LOW–MEDIUM
Files WILL change: frontend/src/context/AdminConfigContext.jsx (only)
Files WILL NOT touch:
  - backend/server.py
  - VisibilityTab.jsx, AdminDietaryPage.jsx (consumer contract preserved)
  - restaurantService.js, useMenuData.js (reused as-is)
  - All customer-facing files
Owner decisions:
  1. Approve rename `restaurantFlags` → `posFlags`? (default: no, defer)
  2. Add `console.warn` on POS restaurant-info null? (default: no, keep silent)
  3. Approve implementation on 3-july branch? (needed)
Docs: memory/change_requests/CR-2026-07-03-002-remove-dead-restaurant-info-fetch/{CR.md,IMPLEMENTATION_PLAN.md}
Next: Owner approval → IMPLEMENTATION role
```
