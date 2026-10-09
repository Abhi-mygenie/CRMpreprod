# CR-2026-06-17-003 — Implementation Handover

**To:** Implementation Agent (next session)
**From:** Planning Agent
**Date:** 2026-06-17
**Stage:** Ready for IMPLEMENTATION
**Owner approval:** Granted (Owner Decisions table in `CR.md`)
**Risk:** LOW
**Estimated effort:** One focused session
**Rollout:** APP-13 → APP-11 → APP-12, single commit acceptable

---

## Prerequisites (do these first)

1. Read in this order:
   - `/app/memory/control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md`
   - `./CR.md`
   - `./IMPACT_ANALYSIS.md` (especially Problem 1/2/3 sections)
   - `/app/frontend/src/utils/itemAvailability.js` (the existing util this CR builds on)
2. Confirm services up: backend on 8001, frontend on 3000.
3. Confirm `REACT_APP_BACKEND_URL` is set (added in last session, preview URL).

---

## Files in scope (only these)

| File | Net change |
|---|---|
| `frontend/src/hooks/useMenuData.js` | APP-13 cache knobs |
| `frontend/src/pages/MenuItems.jsx` | APP-11 add `isItemAvailable` to `filterItems` |
| `frontend/src/components/MenuItem/MenuItem.jsx` | APP-11 defense-in-depth — keep null-ADD path |
| `frontend/src/pages/ReviewOrder.jsx` | APP-12 pre-place-order validation |
| `frontend/src/context/CartContext.js` | APP-11 mid-session cart prune + toast |

**Files NOT to touch:** `itemAvailability.js` (logic is correct, do not modify), `channelEligibility.js`, `AuthContext`, `App.js`, any admin file (CR-002 territory), `server.py`.

---

## APP-13 — Tighten menu cache (do FIRST, lays groundwork for APP-12)

### Edit `useMenuData.js` — `buildMenuSectionsQueryOptions` (around line 170-180)

Replace existing return:

```jsx
return {
  queryKey: ['menuSections', finalRestaurantId, stationId],
  queryFn: () => fetchMenuSections(finalRestaurantId, stationId),
  enabled: !!finalRestaurantId,
  staleTime: 30 * 1000,           // CR-2026-06-17-003 APP-13: was 5 * 60 * 1000
  gcTime: 15 * 60 * 1000,
  refetchOnWindowFocus: true,      // CR-2026-06-17-003 APP-13
  refetchOnReconnect: true,        // CR-2026-06-17-003 APP-13
  retry: 3,
};
```

That's the entire APP-13 code change. Three knobs.

---

## APP-11 — Hide timing-unavailable items in customer menu

### Part A — Add timing filter to `MenuItems.filterItems` (around line 336-378)

After the existing channel filter and before the search filter, insert:

```jsx
// CR-2026-06-17-003 APP-11: Drop items that are not currently available
// (live_web, admin category/item timing, POS time window).
filtered = filtered.filter(item => {
  const categoryTiming = categoryTimings?.[categoryId] || null;
  const itemTiming = itemTimings?.[String(item.id)] || null;
  return isItemAvailable(item, currentTimeInSeconds, { categoryTiming, itemTiming });
});
```

Add the import at top of file:
```jsx
import { isItemAvailable } from '../utils/itemAvailability';
```

Note: `currentTimeInSeconds`, `categoryTimings`, `itemTimings` are already available in scope from existing hooks. The empty-category auto-hide at line 801-803 (`if (reorderedItems.length === 0) return null;`) already handles category hiding when all items are filtered out.

### Part B — `MenuItem.jsx`

Keep as-is. The current `isAvailable && isOnlineOrderEnabled ? <ADD /> : null` logic stays as defense-in-depth — if anything ever bypasses the page filter, the ADD button still won't render. No edit needed unless lint or compile complains.

### Part C — Mid-session cart prune in `CartContext.js`

Add a new effect that runs whenever `cartItems`, `currentTimeInSeconds`, or admin timing context changes:

```jsx
// CR-2026-06-17-003 APP-11: Auto-remove items that have become unavailable mid-session
useEffect(() => {
  if (!cartItems || cartItems.length === 0) return;
  if (!menuDataMap) return;  // wait for menu data hydration

  const unavailable = cartItems.filter(ci => {
    const item = menuDataMap[String(ci.itemId)];
    if (!item) return false;  // unknown items: don't touch
    const categoryTiming = categoryTimings?.[item.categoryId];
    const itemTiming = itemTimings?.[String(ci.itemId)];
    return !isItemAvailable(item, currentTimeInSeconds, { categoryTiming, itemTiming });
  });

  if (unavailable.length > 0) {
    const names = unavailable.map(u => u.name).join(', ');
    toast({
      title: 'Some items are no longer available',
      description: `Removed from your cart: ${names}`,
      duration: 5000,
    });
    unavailable.forEach(u => removeFromCart(u.itemId));
  }
}, [cartItems, currentTimeInSeconds, categoryTimings, itemTimings, menuDataMap]);
```

You'll need to thread `menuDataMap` (a `Map<itemId, item>`) into CartContext. Suggestion: build it once at the consumer (e.g., `MenuItems` page) and provide it via context, OR derive lazily from React Query's cache using `queryClient.getQueryData(['menuSections', restaurantId, stationId])`.

If wiring `menuDataMap` is heavy, **alternative**: do the prune at the `MenuItems` page level via a useEffect on `currentTimeInSeconds` change, since that page already has menu data + cart access. Cleaner.

---

## APP-12 — Place-order safety net (in `ReviewOrder.jsx`)

### Insert validation step BEFORE `placeOrder()` dispatch (~line 1194)

```jsx
// CR-2026-06-17-003 APP-12: Pre-place-order availability validation
// Force-refresh the menu cache (APP-13 dependency) before validating.
await queryClient.refetchQueries({ queryKey: ['menuSections', restaurantId, stationId] });
const fresh = queryClient.getQueryData(['menuSections', restaurantId, stationId]) || [];
const itemLookup = new Map();
for (const section of fresh) {
  for (const item of (section.items || [])) {
    itemLookup.set(String(item.id), { ...item, categoryId: section.categoryId });
  }
}

const blocked = cartItems.filter(ci => {
  const item = itemLookup.get(String(ci.itemId));
  if (!item) return false;
  const categoryTiming = categoryTimings?.[item.categoryId];
  const itemTiming = itemTimings?.[String(ci.itemId)];
  return !isItemAvailable(item, currentTimeInSeconds, { categoryTiming, itemTiming });
});

if (blocked.length > 0) {
  const names = blocked.map(b => b.name).join(', ');
  toast.error(`Some items are no longer available and were removed from your order: ${names}. Please try again.`, {
    duration: 6000,
    'data-testid': 'placeorder-blocked-toast',
  });
  blocked.forEach(b => removeFromCart(b.itemId));
  setIsPlacingOrder(false);  // re-enable Place Order button
  return;  // do NOT call placeOrder
}

// existing placeOrder() call follows...
```

Imports needed at top of file:
```jsx
import { useQueryClient } from '@tanstack/react-query';
import { isItemAvailable } from '../utils/itemAvailability';
// inside component:
const queryClient = useQueryClient();
```

Note: `currentTimeInSeconds`, `cartItems`, `categoryTimings`, `itemTimings`, `removeFromCart` already in scope via existing hooks.

---

## Self-test plan (before invoking QA)

1. Webpack compile clean.
2. `mcp_lint_javascript` on 4 edited files → zero new blocking issues.
3. Open customer menu at `/478/menu` (restaurant 478). Verify items still render normally.
4. **APP-13:** Verify cache. In DevTools Network panel, navigate menu → cart → menu. First menu nav fetches; cart nav doesn't fetch menu; second menu nav within 30 s doesn't fetch; second menu nav after 31 s fires background fetch.
5. **APP-11 baseline:** Use restaurant 478 customer flow with no special timing. All items should still show as before.
6. **APP-11 negative test:** Pick an item, get its id. Via backend admin login (`owner@18march.com`), set `itemTimings[<itemId>] = {start:'02:00', end:'03:00'}` (a window not including current time). Save. Switch back to customer view, refresh. Item should be GONE from menu.
7. **APP-11 in-cart prune:** Add an item, then via admin set itemTiming OUTSIDE current time, save. Switch back to customer (or wait for cache refresh from APP-13). Toast should fire, item should be removed from cart.
8. **APP-12:** Add an in-window item to cart, then via admin set its itemTiming outside current time (don't save customer-side refresh). Click Place Order. Toast `placeorder-blocked-toast` appears; item removed from cart; Place Order button re-enabled.
9. Reset admin config to clean state (`itemTimings: {}`) at end.

---

## QA invocation brief

Reference `./IMPACT_ANALYSIS.md` for the 24 acceptance tests + 6 regression tests. Login `owner@18march.com / Qplazm@10` for admin manipulation; customer flow via `https://genie-pull-run.preview.emergentagent.com/478/menu`.

After QA, clean restaurant 478: `itemTimings: {}`, `categoryTimings: {}`.

---

## Exit Gate Checklist

```
[ ] 1. APP-13 knobs in useMenuData.js
[ ] 2. APP-11 filter in MenuItems.filterItems + in-cart prune wired
[ ] 3. APP-12 pre-place-order validation in ReviewOrder.handlePlaceOrder
[ ] 4. Code markers added (// CR-2026-06-17-003 APP-11/APP-12/APP-13)
[ ] 5. yarn webpack compile clean
[ ] 6. mcp_lint_javascript zero new blocking issues
[ ] 7. Self-test 1-8 all pass
[ ] 8. git diff --stat HEAD shows ONLY the 5 in-scope files
[ ] 9. Restaurant 478 config clean
[ ] 10. QA_HANDOVER.md written
[ ] 11. CR.md status → IMPLEMENTED
[ ] 12. testing_agent_v3 invoked
[ ] 13. iter_N.json PASS verified
```

**STOP after exit gate. Do not modify any file outside scope. Hand back to QA / owner.**

---

## Special notes for the implementation agent

**CartContext placement of the prune effect.** The `menuDataMap` dependency is the only fiddly part. Three options ranked easiest-to-hardest:

1. **Easiest:** Move the prune effect to `MenuItems.jsx`. It already has both cart access (via `useCart`) and menu data. ~15 lines.
2. **Medium:** Provide `menuDataMap` via a new lightweight context derived in `App.js` from the React Query cache.
3. **Hardest:** Use `queryClient.getQueryData` inside CartContext directly. Works but couples CartContext to React Query.

**Recommended: option 1** — page-level effect. Lower coupling, easier to roll back.

**APP-12 race condition.** The `refetchQueries` is awaited so we have a fresh snapshot before validating. If the network is slow (>5 s), the customer waits. Acceptable trade-off; consider a "Verifying availability…" spinner on the Place Order button during the await.

---

*Handover complete | 2026-06-17 | Implementation Agent: please ack when picking up.*
