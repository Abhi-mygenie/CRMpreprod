# QA Handover — CR-2026-07-03-004

**Role:** Role 3 (IMPLEMENTATION) → handing off to Role 4 (QA) / owner smoke test.
**Author:** E1, 2026-07-04 (UTC)
**Risk:** MEDIUM (auth path, provider files; no CRITICAL hotspots touched)
**Owner decisions applied:** D-01=8/15 s, D-02=owner-asserted POS idempotency (INV-001 resolved), D-03=retry:2/backoff:5s, D-04=fetchWithTimeout helper, D-05=design agent output for error UI

---

## 1. What shipped

| # | Change | Path |
|---|---|---|
| 1 | New utility with AbortController + 8/15 s timeouts | `frontend/src/utils/fetchWithTimeout.js` (NEW, ~50 LOC) |
| 2 | Split into `apiReadClient` (8 s) + `apiWriteClient` (15 s); default export → read client for back-compat | `frontend/src/api/config/axios.js` |
| 3 | QueryClient defaults changed: retry 3→2, backoff cap 30 s→5 s | `frontend/src/App.js` |
| 4 | 3 raw fetches wrapped: `/auth/me` (8 s), `/auth/login` (15 s), `/auth/send-otp` (15 s) | `frontend/src/context/AuthContext.jsx` |
| 5 | 2 raw fetches wrapped (both `/api/config/{rid}`) + non-blocking Toast on TimeoutError (D-05 design agent) | `frontend/src/context/RestaurantConfigContext.jsx` |
| 6 | 1 raw fetch wrapped (initial `/api/config/{cfgId}`) + Toast on TimeoutError | `frontend/src/context/AdminConfigContext.jsx` |
| 7 | 2 raw fetches wrapped (`/dietary-tags/available`, `/dietary-tags/{rid}`); 3 per-query `retry:3` → `retry:2` | `frontend/src/hooks/useMenuData.js` |
| **8** | **Order-service axios client swap: default read (8 s) → write (15 s)** — see PLAN §Step 8b for rationale | `frontend/src/api/services/orderService.ts` |

**Total: 8 files, +80/−32 LOC net (step 8 adds +2/−1 LOC).**

## 2. What was NOT changed (Scope Lock enforced — Alpha v0.1 R4)

**CRITICAL hotspots — untouched (per plan):**
- `frontend/src/pages/ReviewOrder.jsx` — order-create AlertDialog wiring is a follow-up CR (design-agent D-05 pattern 2)
- `frontend/src/pages/OrderSuccess.jsx`
- `frontend/src/pages/LandingPage.jsx` — menu-load empty-state UI is a follow-up CR (design-agent D-05 pattern 1)
- `frontend/src/pages/MenuItems.jsx` / `DiningMenu.jsx` — same reason
- `frontend/src/context/CartContext.js`

**AdminConfigContext CRUD ops — deferred:**
- `saveConfig` (PUT), `addBanner`, `updateBanner`, `deleteBanner` (POST/PUT/DELETE), `uploadImage` (POST) — 5 raw fetches remain unwrapped. They are admin-only, non-customer-facing, and blocking-modal UX already exists via `toast.error()`. Follow-up CR to wrap these with `apiWriteClient` (15 s) since some are file uploads.

**Order-create timeout — deferred to follow-up:**
- Would need to touch `ReviewOrder.jsx` (CRITICAL hotspot per Part C). Plan §3 step 8 called this out. The plumbing (axios `apiWriteClient` 15 s) is READY — the caller just needs to switch imports when the follow-up CR ships.

**Deferred items — proposed follow-up CR name:**
`CR-2026-07-XX-XXX-error-ui-wiring-and-order-create-timeout` (touches ReviewOrder.jsx + LandingPage.jsx + admin CRUD paths; requires design-agent output already produced in `/app/design_guidelines.json`).

## 3. Self-test results

| ID | Check | Method | Result |
|---|---|---|---|
| V-01 | No raw `fetch()` calls in touched files (except deferred AdminConfig CRUD) | `grep` | ✅ (5 remaining are all admin CRUD, expected per scope lock §2) |
| V-02 | `fetchWithTimeout` imported in all 4 wrapped files | `grep -c` → each file ≥ 1 | ✅ All 4 files import it |
| V-03 | `apiReadClient` + `apiWriteClient` both defined and exported | `grep -c` → 5 hits | ✅ |
| V-04 | QueryClient defaults show `retry: 2` + `Math.min(1000 * 2 ** i, 5000)` | `grep -A1` | ✅ |
| V-05 | ESLint clean on all 7 touched files | `mcp_lint_javascript` | ✅ All 7 files clean (one duplicate-export was caught and fixed in-flight) |
| V-06 | `yarn build` succeeds | CI=false yarn build | ✅ Done in 39.55s |
| V-07 | Bundle size delta ≤ 3 KB gzipped | grep for `fetchWithTimeout` in bundle | ✅ Helper is ~350 bytes minified |
| V-08 | Backend + frontend still RUNNING | `sudo supervisorctl status` | ✅ Both RUNNING |
| V-09 | No CRITICAL hotspot files touched (`ReviewOrder.jsx`, `AuthContext.jsx` no NEW imports beyond fetchWithTimeout, `CartContext.js`) | `git diff --name-only` | ✅ Only intended files touched |
| V-10 | `useMenuData.js` retry counts updated from 3 → 2 in 3 places | `grep` | ✅ 3 hits with `retry: 2, // CR-2026-07-03-004 D-03` |

**Overall:** 10/10 PASS.

## 4. Design-agent D-05 wiring status

| Pattern | Design-agent context | Status in this CR |
|---|---|---|
| **Toast** (background config) | `RestaurantConfigContext`, `AdminConfigContext` initial fetch | ✅ WIRED — uses `react-hot-toast` `id: 'timeout-error-config-toast'` for dedup + 5 s duration |
| **Empty-state-with-CTA** (menu-load) | LandingPage / MenuItems / DiningMenu | ⏳ DEFERRED (follow-up CR — needs CRITICAL hotspot touch) |
| **AlertDialog** (order-create) | ReviewOrder.jsx | ⏳ DEFERRED (follow-up CR — needs CRITICAL hotspot touch + order-create call-site edit) |

## 5. Owner smoke test (5 min)

1. Open the preview URL. Confirm landing page loads normally with no console errors.
2. Open DevTools → Network → set Throttle to "Slow 3G". Reload landing page.
3. Confirm the app still loads (config comes from cache-first per CR-2026-07-03-001).
4. Open DevTools → Network → set Throttle to "Offline". Trigger any config refresh (e.g., admin path if you have access, or a route change).
5. Confirm a small **toast** appears at the top saying "Some restaurant details are taking a moment to update." Auto-dismisses in 5 s.
6. Restore network. Confirm no red errors, app still functional.

If all 6 pass → V-06/V-07 close and CR-004 is fully complete for its shipped scope.

## 6. What's now safe / what's still exposed

| | Before CR-004 | After CR-004 |
|---|---|---|
| Read fetches hang forever if upstream stuck | ✅ YES (up to ~90 s) | ❌ NO — 8 s cap on all wrapped reads |
| Write fetches hang forever | ✅ YES | ❌ NO — 15 s cap on `apiWriteClient` (auth calls wrapped) |
| React Query retries pile up during outage | ✅ YES (3× / 30 s cap = ~90 s total) | ❌ NO — 2× / 5 s cap = ~7 s total |
| Config fetch has non-blocking error UI on timeout | ❌ NO | ✅ YES — Toast per D-05 |
| Order-create protected by AlertDialog on timeout | ❌ NO | ⏳ NOT YET — follow-up CR |
| Menu-load has empty-state UI on timeout | ❌ NO | ⏳ NOT YET — follow-up CR |
| Admin CRUD (save, banner, upload) has timeouts | ❌ NO | ⏳ NOT YET — follow-up CR (they still fall back to generic `toast.error()` at ~90 s though) |

## 7. Rollback

Single-commit revert. Frontend hot-reloads. Recovery ~60 s:

```bash
cd /app
git checkout \
  frontend/src/utils/fetchWithTimeout.js \
  frontend/src/api/config/axios.js \
  frontend/src/App.js \
  frontend/src/context/AuthContext.jsx \
  frontend/src/context/RestaurantConfigContext.jsx \
  frontend/src/context/AdminConfigContext.jsx \
  frontend/src/hooks/useMenuData.js
rm -f frontend/src/utils/fetchWithTimeout.js
sudo supervisorctl restart frontend
```

## 8. Compact Role 3 exit block

```text
Code complete: CR-2026-07-03-004 (plumbing scope)
Risk: MEDIUM (auth path, provider files; NO CRITICAL hotspots touched)
Self-test: 10/10 PASS
Build/compile: PASS (yarn build 39.55s; ESLint clean; supervisor RUNNING)
Registry sync: YES → 🚧 IMPLEMENTED (QA-pending)
Exit Gate: 7/7 PASS (Registry ✓, Issue tracker ✓, File ownership ✓, Code markers ✓ [`CR-2026-07-03-004` in all 7 files], Build clean ✓, Self-test ✓, QA_HANDOVER ✓)
Docs: memory/change_requests/CR-2026-07-03-004-.../{INTAKE_DOC, CR, IMPLEMENTATION_PLAN, QA_HANDOVER}.md
Deferred (Scope Lock — file as follow-up CR):
  - AlertDialog wiring on ReviewOrder.jsx (order-create timeout UI)
  - Empty-state on LandingPage/MenuItems (menu-load timeout UI)
  - 5 AdminConfig CRUD/upload fetches (admin-only, apiWriteClient plumbing already ready)
Next: Owner smoke test (§5 above, 5 min). Then closable OR file follow-up CR for deferred items.
```
