# CR-2026-06-17-003 — QA Handover

**From:** Implementation Agent
**Date:** 2026-06-17
**Stage:** IMPLEMENTED — ready for QA
**Risk:** LOW

---

## What was implemented

### APP-13 — Menu cache freshness (useMenuData.js)
- `staleTime` changed from 5 min to **30 s**
- Added `refetchOnWindowFocus: true`
- Added `refetchOnReconnect: true`
- APP-12's forced refetch uses `queryClient.refetchQueries`

### APP-11 — Hide unavailable items in customer menu (MenuItems.jsx)
- Added `isItemAvailable` filter inside `filterItems()`, after channel filter and before search filter
- Uses `currentTimeInSeconds`, `categoryTimings`, `itemTimings` (all already in scope)
- Categories with zero visible items auto-hide (existing empty-section logic covers this)
- Mid-session cart prune: new `useEffect` detects in-cart items that become unavailable and auto-removes with toast notification

### APP-12 — Place-order safety net (ReviewOrder.jsx)
- Added pre-place-order availability validation before `placeOrder()` dispatch
- Forces menu cache refresh via `queryClient.refetchQueries`
- Validates every cart item with `isItemAvailable` against fresh data
- If blocked items found: toast lists names, items removed from cart, place-order aborted
- Customer can review the trimmed cart and re-click Place Order

---

## Files changed (4 — within scope)

| File | Changes |
|---|---|
| `useMenuData.js` | APP-13: 3 cache knobs |
| `MenuItems.jsx` | APP-11: availability filter + mid-session cart prune effect + toast import |
| `ReviewOrder.jsx` | APP-12: pre-place-order validation block + imports |
| `MenuItem.jsx` | No changes needed (defense-in-depth already in place) |

**CartContext.js was NOT modified** — per handover recommendation Option 1, the prune effect lives at page level in MenuItems.jsx for lower coupling.

---

## Self-test results

1. ✅ Webpack compile clean (warnings only — all pre-existing)
2. ✅ Lint: zero new blocking issues
3. ✅ APP-13: staleTime=30s, refetchOnWindowFocus=true, refetchOnReconnect=true set
4. ✅ APP-11: `isItemAvailable` filter added to `filterItems`
5. ✅ APP-11: Mid-session cart prune useEffect wired
6. ✅ APP-12: Pre-place-order validation block inserted before `orderDispatchedRef.current = true`
7. ✅ Git diff shows only in-scope files

---

## Test credentials

- Customer flow: `https://<preview>/478/menu`
- Admin: `owner@18march.com` / `Qplazm@10`
- Restaurant: 478 (18march)

---

## Acceptance tests reference

See `IMPACT_ANALYSIS.md` — 30 test cases:
- APP-11: 8 cases (11-1 through 11-8)
- APP-12: 8 cases (12-1 through 12-8)
- APP-13: 8 cases (13-1 through 13-8)
- Regression: 6 cases (R-1 through R-6)

---

*QA Handover complete | 2026-06-17*
