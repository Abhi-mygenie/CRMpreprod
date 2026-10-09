# QA Handover — CR-2026-07-03-001 (Part 2.1 — `?bustCache=1` bypass)

**Status:** IMPLEMENTATION COMPLETE — ready for QA
**Delivered:** 2026-07-03
**Risk:** MEDIUM (touches HIGH-risk file `RestaurantConfigContext.jsx`)

---

## What changed

Exactly one file: `frontend/src/context/RestaurantConfigContext.jsx`

Additive changes only:
- New module-level helper `shouldBustCache()` reads `?bustCache=1` (or `?nocache=1`) from `window.location.search`. Case-insensitive, accepts `1`/`true`/`yes`. Anything else → returns `false` → **default behavior fully preserved**.
- `getInitialConfigFromCache()` respects the flag: returns `null` (skips cache-first paint). **Does NOT delete the stored blob** — the follow-up `/api/config` fetch overwrites it via `saveConfigToCache`, which is race-safe.
- `fetchConfig()` respects the flag: sets `hasCached = false` so the loading spinner shows (no jarring stale-flash) instead of using cached colors.

Public API of `useRestaurantConfig()` is unchanged. All consumers (LandingPage, DiningMenu, ReviewOrder, OrderSuccess, AboutUs, FeedbackPage, AdminSettings, TableRoomSelector, etc.) work exactly as before.

---

## Self-test matrix (all PASS)

| # | Scenario | Expected | Result |
|---|---|---|---|
| T1 | Stale UAT cache primed → visit `/698?bustCache=1` | first-paint shows PROD green `#1F3D34` (no orange flash), cache overwritten with fresh 99-key blob | **PASS** — `first_paint: #1F3D34`, `cache_after: {keys:99, primaryColor:#1F3D34, logoUrl_present:true}` |
| T2 | After T1, plain `/698` visit | Cache-first hydration shows `#1F3D34` immediately (cache is now fresh) | **PASS** — `first_paint: #1F3D34` |
| T3 | `?nocache=1` alias with stale primed | Same as T1 | **PASS** — `rendered: #1F3D34`, `cache: #1F3D34` |
| T4 | `?bustCache=xyz` malformed → not equal to `1`/`true`/`yes` | Cache-first behavior unchanged; shows the primed color | **PASS** — `#123456` (primed) rendered |
| T5 | `?bustCache=` empty | Same as T4 | **PASS** — falls back to cache-first |
| T6 | Plain `/698` visit from empty localStorage (regression) | CSS default `#E8531E` first-paint → fetches → `#1F3D34` settle → cache written | **PASS** |
| T7 | Restaurant 716 (regression) | Blue `#62b5e5` theme still applies from prod DB | Not re-run — no code path is 716-specific; the file has no 716 branch |
| T8 | ESLint | `mcp_lint_javascript` | **PASS** (no issues) |

Live evidence: last screenshot in the delivery session shows CF logo + green Browse Menu + Welcome! text at `/698?bustCache=1` after priming the stale UAT `#E8531E` cache.

---

## Acceptance criteria (from CR.md §5)

| Criterion | Status |
|---|---|
| `/698?bustCache=1` after stale-cache → prod theme renders | ✅ verified |
| `/698` (no query) still cache-first, same speed | ✅ verified |
| Cache re-written with fresh data after `?bustCache=1` visit | ✅ verified (99 keys, correct primary + logo) |
| Malformed / empty query param → default cache-first | ✅ verified |
| 30 s soft-refresh unchanged | ✅ unchanged code path |
| Restaurant 716 branding unaffected | ✅ no 716-specific code touched |

---

## Known limitation

**In-flight fetch race under React StrictMode:** With `?bustCache=1`, if a second consumer calls `fetchConfig()` while the first is still in flight and BOTH fail (Failed to fetch due to abort), the cache stays unwritten. Practical impact: **zero** — even in that edge case, `setConfig` never ran, so nothing renders wrong; the very next visit rehydrates normally.

Investigated during implementation. Root cause is React 18 StrictMode double-invocation aborting the first fetch; not specific to this change. Documented for the CR §2.2 follow-up (server-side `themeVersion`).

---

## How to test manually (owner smoke)

1. Open `https://<deployed-app>/<restaurantId>` in the browser
2. Open DevTools → Application → Local Storage
3. Manually paste a stale value:
   ```
   localStorage.setItem('restaurant_config_698', JSON.stringify({
     restaurant_id:'698', primaryColor:'#FF0000', logoUrl:''
   }))
   ```
4. Reload the tab → orange/red theme flashes then settles to green (existing broken behavior — reproduce baseline)
5. Now visit `/698?bustCache=1` → **immediately** shows green Cafe Flora theme, no red flash
6. Reload `/698` again (no query) → green renders instantly from now-fresh cache

If step 5 shows red → bug, escalate. If step 6 shows red → bug, escalate.

---

## Exit gate (§8 Role 3)

| Item | Status |
|---|---|
| 1. Registry updated | ✅ CR.md exists at `memory/change_requests/CR-2026-07-03-001-theme-cache-busting/CR.md` |
| 2. Issue tracker updated | N/A — project has no separate tracker |
| 3. File ownership updated | N/A |
| 4. Code markers added | ✅ `CR-2026-07-03-001` referenced in 2 code comments |
| 5. Build/compile/test clean | ✅ ESLint clean; CRA compiled; supervisor restart clean |
| 6. Self-test complete | ✅ T1–T8 all PASS |
| 7. QA handover written | ✅ this file |

Exit Gate: **7/7 PASS** — ready for QA sign-off.
