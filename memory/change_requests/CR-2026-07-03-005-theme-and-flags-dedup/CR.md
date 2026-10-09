# CR-2026-07-03-005 — Theme + Flags Dedup / Consolidation

**Status:** REGISTERED — Planning stage (not scheduled)
**Raised:** 2026-07-03
**Author:** E1 (follow-up consolidation)
**Priority:** P3 (cleanup — no user-visible bug, only code-hygiene / long-term maintainability)
**Severity:** MINOR
**Risk:** LOW–MEDIUM (touches provider files marked HIGH-risk in operating prompt PART C: `RestaurantConfigContext.jsx`)
**Fast Lane:** NOT eligible
**Depends on:** CR-2026-07-03-001 (shipped), CR-2026-07-03-002 (shipped)

---

## 1. Scope — three related items clubbed

| Sub-ID | Item | Origin |
|---|---|---|
| F-01 | Server-driven `themeVersion` for cache invalidation — permanent fix for the stale-cache class of bug the `?bustCache=1` hatch currently patches | CR-001 §2.2 |
| F-02 | Remove duplicate `restaurantFlags` state in `pages/AdminSettings.jsx:213-244` — source it from `useAdminConfig()` instead | CR-002 QA follow-up |
| F-03 | Suppress the `[MENU] Failed to fetch restaurant config` StrictMode double-fire noise in `RestaurantConfigContext.jsx:215` | Observed during CR-001 QA |

Common theme: **consolidate state ownership so the same data isn't fetched twice and cache staleness is self-healing.**

---

## 2. F-01 — Server-driven `themeVersion`

### Background
`RestaurantConfigContext.jsx` uses a cache-first hydration (`localStorage.restaurant_config_<rid>`) so first-paint is instant. When an admin changes branding, existing customer tabs never see the update until they hard-refresh or hit `?bustCache=1` (added in CR-001).

### Proposed change
- Add a `themeVersion: int` field to `customer_app_config` documents (default 1). Every save/PUT to a branding-adjacent field bumps it by 1 in the same update op (`$inc: {themeVersion: 1}`).
- Frontend stores `{data, themeVersion}` in `localStorage.restaurant_config_<rid>`. On hydrate:
  1. Paint from cache instantly (unchanged).
  2. Fetch `/api/config/<rid>`.
  3. If `server.themeVersion > cached.themeVersion` → replace theme immediately (blunt swap or 150 ms crossfade — designer call).
  4. Save new blob with new version.

### Files WILL change
- `backend/server.py` — add `themeVersion` to `/api/config/*` response builder + bump on branding PUT endpoints (`/api/config/`, `/api/config/banners*`, `/api/config/pages*`).
- `frontend/src/context/RestaurantConfigContext.jsx` — cache blob shape update + version compare on rehydrate.

### Impact
| Concern | Impact |
|---|---|
| Cache-first performance | preserved |
| Client that already saw latest | zero extra work |
| Client with stale cache | crossfade or blunt swap once, then stable |
| Data migration | none — old blobs missing `themeVersion` treated as version 0 → single refetch on next visit → self-heals |
| Backend contract | additive (extra int field) |

### Risks
| # | Risk | Mitigation |
|---|---|---|
| R1 | Race between admin save and customer read | `$inc` is atomic; version is monotonic |
| R2 | `themeVersion` overflows | 63-bit int, impossible in practice |
| R3 | Non-branding writes bump the version needlessly | Acceptable — worst case customers refetch once |

---

## 3. F-02 — Remove duplicate `restaurantFlags` state

### Background
`pages/AdminSettings.jsx:213-244` has its own `useState({})` for `restaurantFlags` + a direct `getRestaurantDetails()` call. Since CR-2026-07-03-002 shipped, `useAdminConfig()` already provides `restaurantFlags` derived from `useRestaurantDetails()` — same POS data, deduped by React Query.

### Proposed change
- Delete `const [restaurantFlags, setRestaurantFlags] = useState({});` at `AdminSettings.jsx:213`.
- Delete the `restaurantData` half of the `Promise.all` in `fetchConfig` (line 223-226).
- Delete the `if (restaurantData) { setRestaurantFlags(...) }` block (line 233-239).
- Read `restaurantFlags` from `useAdminConfig()` instead.

### Impact
| Concern | Impact |
|---|---|
| Network calls per admin session | **-1** (removes the direct `getRestaurantDetails` call — React Query already caches the one from `useAdminConfig`) |
| `VisibilityTab.jsx` prop `restaurantFlags` | still receives same shape, from same POS source, unchanged behavior |
| Diff size | ~ −20 LOC in one file |
| Risk | LOW — same data source, same shape |

---

## 4. F-03 — StrictMode double-fire cleanup

### Background
On customer page load, DevTools shows 3-6× `[MENU] Failed to fetch restaurant config: TypeError: Failed to fetch` from `RestaurantConfigContext.jsx:215`. Root cause: React 18 StrictMode double-invokes effects in dev; the first `fetch()` gets aborted by cleanup, throws AbortError, logged as ERROR.

### Proposed change
- Detect `AbortError` / `TimeoutError` in the catch block and downgrade to `logger.debug` (or silent).
- Keep genuine network errors at `logger.error`.

### Files WILL change
- `frontend/src/context/RestaurantConfigContext.jsx` (line 215 area, ~4 LOC)

### Impact
| Concern | Impact |
|---|---|
| Prod behavior | zero change — abort errors were already caught, only log-level changes |
| DevTools noise | vanishes on cold customer nav |
| Observability | genuine errors still surface — abort is different from failure |

---

## 5. Files WILL change (combined for the whole CR)

- `backend/server.py` (F-01 only)
- `frontend/src/context/RestaurantConfigContext.jsx` (F-01 + F-03)
- `frontend/src/pages/AdminSettings.jsx` (F-02)

Total across the CR: **3 files, estimated net +80/-40 LOC**.

## 6. Files WILL NOT touch
- `AdminConfigContext.jsx` (CR-002 already fixed here)
- `useMenuData.js`, `restaurantService.js`
- Any customer-facing page
- 716-specific hardcoded logic
- Auth / payment / order paths
- `.env` / requirements.txt

## 7. Verification matrix

| Test | F-01 | F-02 | F-03 |
|---|---|---|---|
| Admin changes primary color → open customer tab already loaded → theme updates within 30 s | ✅ | — | — |
| Admin login → DevTools Network → no direct `getRestaurantDetails` from AdminSettings.jsx | — | ✅ | — |
| `VisibilityTab.jsx` still shows Loyalty/Coupon toggles for `is_loyalty=Yes` restaurants | — | ✅ | — |
| Cold customer nav to `/698` → zero `Failed to fetch` errors in console | — | — | ✅ |
| Genuine backend down → `Failed to fetch` still logged at ERROR | — | — | ✅ regression |
| `/api/config/{rid}` returns `themeVersion` field | ✅ | — | — |
| Old cache blob without `themeVersion` → treated as version 0 → refetches, no crash | ✅ | — | — |

## 8. Owner decisions
1. Approve `themeVersion` on server-side auto-bump for **any** config write (recommended) vs branding-only? Recommend "any write" for simplicity.
2. Blunt theme swap or crossfade on version mismatch? Designer call.
3. Approve moving `restaurantFlags` source in `AdminSettings.jsx` to `useAdminConfig()`?
4. Approve downgrading AbortError logs to `debug`?

## 9. Effort
- F-01: ~1 dev-day (backend + frontend + tests)
- F-02: ~30 min
- F-03: ~15 min
- Total: ~1.2 dev-days

## 10. Rollout order (safest)
1. F-03 first (log-level only, zero risk)
2. F-02 next (dedup, low risk)
3. F-01 last (schema addition + cache logic — needs owner design input)

Each can ship independently.
