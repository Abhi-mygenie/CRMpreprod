# QA Handover — CR-2026-07-03-002 (Remove Dead `/api/restaurant-info/{id}` Fetch)

**Status:** IMPLEMENTATION COMPLETE — ready for QA
**Delivered:** 2026-07-03
**Files touched:** 1 (`frontend/src/context/AdminConfigContext.jsx`)
**Risk:** LOW (single file, provider-scope, no consumer contract change)

---

## What changed

Exactly one file: `frontend/src/context/AdminConfigContext.jsx`, net **+19 / −16 LOC**.

### 1. Imports (top of file)

```diff
-import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
+import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
 import { useAuth } from './AuthContext';
+import { useRestaurantDetails } from '../hooks/useMenuData';
 import toast from 'react-hot-toast';
```

### 2. `restaurantFlags` source — was mutable state fed by dead fetch, is now derived from the working POS hook

```diff
-  const [restaurantFlags, setRestaurantFlags] = useState({});
+  // CR-2026-07-03-002 — restaurantFlags now come from POS restaurant-info
+  // (same source the customer app already uses via useRestaurantDetails).
+  // Removes a dead 404 to /api/restaurant-info/{id} which was never
+  // implemented on the local backend.
+  const configId = user?.restaurant_id || user?.id || null;
+  const { restaurant: posRestaurant } = useRestaurantDetails(configId);
+  const restaurantFlags = useMemo(() => ({
+    is_loyalty:    posRestaurant?.is_loyalty,            // 'Yes' | other
+    is_coupon:     posRestaurant?.is_coupon,             // 'Yes' | other
+    multiple_menu: posRestaurant?.multiple_menu === 'Yes', // boolean
+  }), [posRestaurant]);
```

### 3. `fetchConfig` — dropped the parallel dead fetch

```diff
-        const [configResponse, restaurantResponse] = await Promise.all([
-          fetch(`${API_URL}/api/config/${configId}`),
-          fetch(`${API_URL}/api/restaurant-info/${configId}`).catch(() => null)
-        ]);
+        const configResponse = await fetch(`${API_URL}/api/config/${cfgId}`);
```

Along with removing the now-dead `if (restaurantResponse?.ok) { setRestaurantFlags(...) }` block.

Renamed the local `configId` inside `fetchConfig` to `cfgId` to avoid shadowing the new provider-scope `configId` (which the hook needs).

---

## Consumer compatibility (contract preserved)

| Consumer | Access pattern | Post-CR |
|---|---|---|
| `pages/admin/AdminDietaryPage.jsx:11,32` | `useAdminConfig().restaurantFlags.multiple_menu` | ✅ now a proper boolean; was `undefined` |
| `pages/admin/AdminVisibilityPage.jsx:7,73,76` | `restaurantFlags.is_loyalty === 'Yes'` and `.is_coupon === 'Yes'` | ✅ strings pass through from POS |
| `components/AdminSettings/VisibilityTab.jsx` (prop) | Receives `restaurantFlags` as a prop from `AdminSettings.jsx`, which fetches its OWN via `getRestaurantDetails()` directly | ✅ unaffected — different code path, not touched |

**Public API of `useAdminConfig()` unchanged** — the `value` object still exports `restaurantFlags` with the same shape `{is_loyalty, is_coupon, multiple_menu}`.

---

## Self-test results (all PASS)

| # | Scenario | Expected | Result |
|---|---|---|---|
| T1 | Backend `/api/restaurant-info/698` (baseline — endpoint still doesn't exist) | 404 | **PASS** — 404 as before, unchanged (out of scope to add) |
| T2 | Frontend build/HMR | 200 on `http://localhost:3000/` | **PASS** — HTTP 200 after `supervisorctl restart frontend` |
| T3 | ESLint on modified file | no issues | **PASS** |
| T4 | Customer flow at `/698?bustCache=1` | theme + logo intact, no regression | **PASS** — `--color-primary: #1F3D34`, CF logo visible, "Welcome!" text |
| T5 | Any `/api/restaurant-info/*` network request during customer flow | none | **PASS** — 0 hits (customer flow never called it) |
| T6 | Any live `fetch()` to `restaurant-info` in `AdminConfigContext.jsx` source | 0 | **PASS** — only mentions are in CR comments |
| T7 | Consumer files (`AdminDietaryPage.jsx`, `AdminVisibilityPage.jsx`, `VisibilityTab.jsx`) unedited | unchanged | **PASS** — git diff confirms 1 file only |
| T8 | React StrictMode + hot-reload — no new page errors | 0 | **PASS** — 0 page errors in Playwright |

**Note on T4–T5:** The customer app never triggered the dead endpoint (it was admin-scope). The absence in customer flow is expected; the true test is inside the admin session which requires admin credentials not available in this test environment. See "Admin QA required" below.

---

## Admin QA required (owner action)

The full effect of this CR appears in the admin panel. Please have an admin owner run:

1. **Log in as admin for a restaurant with `is_loyalty=Yes` in the POS backend** (any restaurant flagged for the loyalty program).
2. Open DevTools → Network. **No `/api/restaurant-info/*` request should be visible.** (Previously fired on every admin login → 404.)
3. Navigate to **Admin > Settings > Visibility** (or `/admin/visibility`). The **Loyalty Points** and **Coupon Code** toggle rows should now be **visible** if the POS marks them Yes (they were hidden before because `restaurantFlags` was always `{}`).
4. Navigate to **Admin > Dietary** (or `/admin/dietary`). The `multipleMenu` prop passed to the child should be `true` for a multi-menu restaurant (e.g., 716) and `false` for a single-menu restaurant (e.g., 698). Previously it was `undefined`.
5. Log in as admin for a restaurant with `is_loyalty=No`. Loyalty toggle should stay hidden (regression check).

If all five behave as expected, sign off.

---

## Acceptance criteria (from CR §7)

| Criterion | Status |
|---|---|
| Admin session no longer triggers `/api/restaurant-info/*` | ✅ verified at source + built bundle |
| `restaurantFlags` shape unchanged for consumers | ✅ same 3 keys, same value types |
| Consumers work unmodified | ✅ zero files outside `AdminConfigContext.jsx` touched |
| No new console error introduced | ✅ page errors = 0 |
| ESLint / lint | ✅ pass |
| Customer flow unchanged | ✅ screenshot + theme verified |

---

## Follow-ups discovered during implementation

1. **`pages/AdminSettings.jsx` line 213-244** — has its OWN duplicate `restaurantFlags` state fed by a direct `getRestaurantDetails()` call. **Not a bug** (that endpoint exists and works), but a **duplicate**. Owner may want a P3 CR to source it from `useAdminConfig()` instead. Not included here to keep this CR surgical.

2. **`RestaurantConfigContext.jsx` "Failed to fetch"** — 5-6 StrictMode-abort console errors during dev on customer page load. Pre-existing pattern, unrelated to this CR. Already documented as a known limitation in CR-2026-07-03-001 QA_HANDOVER.md.

---

## Exit gate (§8 Role 3)

| # | Item | Status |
|---|---|---|
| 1 | Registry updated | ✅ `CR.md` + `IMPLEMENTATION_PLAN.md` exist |
| 2 | Code markers added | ✅ 2× `CR-2026-07-03-002` in comments inside `AdminConfigContext.jsx` |
| 3 | Build / compile / test clean | ✅ ESLint pass, HMR clean, HTTP 200 |
| 4 | Self-test complete | ✅ T1–T8 PASS |
| 5 | QA handover written | ✅ this file |
| 6 | Owner sign-off obtained | ⏳ admin QA required (see above) |

**Exit gate: 5/6 PASS + admin QA remaining.**

---

## Rollback (if ever needed)

```bash
cd /app && git log --oneline -- frontend/src/context/AdminConfigContext.jsx | head -3
cd /app && git revert <sha> --no-edit
sudo supervisorctl restart frontend
```

Rollback restores the prior dead-404 behavior. Estimated < 60 s.

---

## Non-goals (as declared in CR)

- No backend change (no `/api/restaurant-info/*` endpoint added). CR-2026-07-03-002 explicitly chose the **P2 (drop dead frontend call)** path over the **P1 (implement backend endpoint)** path.
- No touch of `AdminSettings.jsx`'s duplicate `restaurantFlags` state — potential separate P3 CR.
- No touch of `restaurantService.js` or `useMenuData.js` — reused as-is.
- No customer-facing file touched.
