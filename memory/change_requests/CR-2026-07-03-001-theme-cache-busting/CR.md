# CR-2026-07-03-001 — Theme Cache Busting

**Status:** DRAFT (Planning stage)
**Raised:** 2026-07-03
**Author:** E1 (INVESTIGATION → PLANNING role handoff)
**Risk:** MEDIUM (touches `RestaurantConfigContext.jsx` — HIGH-risk file per system prompt PART C; but change is additive, no default behavior change)
**Fast Lane:** NOT eligible (PART C prohibits Fast Lane on this file)

---

## 1. Problem

`RestaurantConfigContext.jsx` uses a cache-first hydration strategy for
per-restaurant branding (`restaurant_config_<rid>` in localStorage). This
gives instant paint on repeat visits, but has a real-world failure mode:

- A restaurant admin uploads a new logo / changes primary color.
- Existing customer tabs with a stale cache **never re-fetch** unless the
  30 s soft-refresh window fires AND the tab is focused AND the storage
  event fires.
- Customers on mobile with the page in the background or an offline-first
  service worker may see the stale theme for hours or days.

Reproduced live in this session:
- UAT DB had `restaurant_config_698 = { primaryColor: '#E8531E', logoUrl: '' }`
- Prod DB has `restaurant_config_698 = { primaryColor: '#1F3D34', logoUrl: 'https://socket.mygenie.online//api/uploads/9156…png' }`
- After the backend was pointed at prod, browsers with the UAT cache kept
  rendering the orange theme + no logo (see the "18march" tab screenshot
  attached in the session).

## 2. Proposed Change (two parts)

### 2.1 IMMEDIATE — `?bustCache=1` URL bypass  (delivered in this CR as part B)

- Add a query-string check `?bustCache=1` (alias `?nocache=1`).
- If present, `RestaurantConfigContext` **skips** both cache-hydration
  paths and forces a network fetch. Also deletes the existing
  `restaurant_config_<rid>` entry so the next visit (without the param)
  starts fresh.
- Zero default-behavior change. Only a manual escape hatch for support /
  QA / admins who just pushed a branding change.

**Files that change:** exactly one — `frontend/src/context/RestaurantConfigContext.jsx`.
**Files declared NOT to change:** the config API contract, the cache key
format, the `DEFAULT_CONFIG` shape, all consumer components.

### 2.2 LATER — server-driven `themeVersion` (this CR's real fix)

Backend `customer_app_config` gains a top-level field `themeVersion: int`
(default 1). Every write to any branding field via
`PUT /api/config/…/branding` (or the wildcard config-save endpoint)
bumps this field by 1 (server-side, in the same update op — no race).

Frontend cache key changes from
`restaurant_config_<rid>` → `restaurant_config_<rid>_v<themeVersion>`
(or the cache blob stores `themeVersion` alongside; either works).

On hydrate:
1. Read cached blob.
2. Fetch `/api/config/<rid>` (already done today).
3. If `serverThemeVersion > cachedThemeVersion` → discard the cached
   paint, apply the fresh one immediately with a 150 ms crossfade
   (or blunt swap — TBD by design agent).
4. Save the new blob with the new `themeVersion`.

This eliminates the stale-cache class of bugs entirely without
sacrificing the perceived-speed benefit of cache-first hydration.

### 2.3 OPTIONAL — auto-invalidation on admin save

`AdminSettings` already calls `refreshConfig(restaurantId)` after a save.
Broaden that so it also publishes a `storage` event key
`config_bump_<rid>` with a timestamp; any other open tab in the same
browser (customer preview, second admin) picks it up and invalidates.

## 3. Impact Analysis

| Area | Impact | Notes |
|---|---|---|
| `RestaurantConfigContext.jsx` | Modified | ~15 LOC additive |
| Consumers of `useRestaurantConfig()` | None | Public API unchanged |
| Backend config endpoints | 2.2 only — adds one field | Old clients ignore extra field, forward-compat |
| localStorage schema | 2.2 only — key format change | Migration: read old key once, delete, use new key |
| Testing surface | LOW/MED | Manual QA on /698, /716 + one automated cache-clear test |
| Performance | Neutral | Same number of network hits; only difference is one extra `?` check + one integer compare |

## 4. Files WILL change vs WILL NOT

**WILL change** (part 2.1 — in this CR delivery):
- `frontend/src/context/RestaurantConfigContext.jsx`

**WILL change** (part 2.2 — future CR):
- `backend/server.py` — add `themeVersion` to `/api/config/*` response + bump on write
- `frontend/src/context/RestaurantConfigContext.jsx` — version-aware cache
- possibly `frontend/src/pages/admin/AdminSettings.jsx` — kick a version bump on save

**WILL NOT touch:**
- `AuthContext.jsx`, `CartContext.js`, `App.js` provider order
- Any consumer component
- The `/api/config/{rid}` response schema for the query param CR (2.1)
- `payment_method` / `payment_type` semantics (unrelated)
- Restaurant 716 hardcoded logic
- localStorage key format for part 2.1 (only for 2.2)

## 5. Verification Matrix

| Test | 2.1 (this CR) | 2.2 (future) |
|---|---|---|
| Open `/698?bustCache=1` after stale-cache scenario → prod theme renders | ✅ must pass | — |
| Open `/698` (no query) after 2.1 land → still cache-first, same speed | ✅ must pass | — |
| Cache entry for `698` deleted after `?bustCache=1` visit | ✅ must pass | — |
| Malformed URL (`?bustCache=`, `?bustCache=xyz`) → default cache-first behavior | ✅ must pass | — |
| Two tabs, admin bumps color in tab A, tab B refreshes theme within 30 s | — | ✅ 2.2 |
| Existing 30 s soft-refresh unchanged | ✅ must pass | ✅ 2.2 |
| Restaurant 716 branding unaffected | ✅ regression | ✅ regression |

## 6. Rollout

- 2.1 ships immediately (low blast radius; the only new code path is
  guarded by a query param).
- 2.2 goes into next sprint after design + backend field agreement.

## 7. Owner Decisions Needed (2.2 only)

- Which endpoint bumps `themeVersion`? Any config write, or only branding
  writes? (recommend: any write, simplest)
- Should stale-theme swap be a hard swap or a 150 ms crossfade? Design
  agent call.
- Migration for existing `restaurant_config_<rid>` blobs: purge on first
  hit, or read-once-then-move?
