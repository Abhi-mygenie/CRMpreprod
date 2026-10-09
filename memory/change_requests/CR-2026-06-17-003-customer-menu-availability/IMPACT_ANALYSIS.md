# CR-2026-06-17-003 — Impact Analysis

**Stage:** Impact Analysis
**Risk:** LOW (single conceptual change — availability gating — touched in three coordinated places)
**Status:** IMPLEMENTED + QA PASSED (iteration 8, 2026-06-17)
**Reuses:** `itemAvailability.isItemAvailable` (already shipped, unit-tested), `useCurrentTime` (already shipped), React Query (already in use)
**Files in scope:** `MenuItems.jsx`, `MenuItem.jsx`, `ReviewOrder.jsx`, `useMenuData.js`, `CartContext.js`
**Files NOT in scope:** every other file in the repo — verified by intent. Backend untouched. Protected files (`AuthContext`, `App.js` providers, `server.py` routes, `ReviewOrder`'s submission contract to POS) untouched.

---

## PROBLEM 1: APP-11 — out-of-window items still rendered

### Current behaviour (verified live + by code review)

`MenuItems.filterItems` at `pages/MenuItems.jsx:336-378` filters by **channel + search + veg + dietary tags** only. Timing is not in that list. Every item the channel/search/diet filters accept is passed to `<MenuItem>`. Inside `MenuItem.jsx:48` the component computes `isAvailable` and **only** uses it to choose between rendering the ADD button or `null`. The card itself always renders.

Repo-wide grep confirms `isItemAvailable` is the ONLY availability gate in the customer code (and is referenced only inside `MenuItem.jsx`):

```
$ grep -rn "isItemAvailable" frontend/src/
frontend/src/components/MenuItem/MenuItem.jsx:4 import { isItemAvailable }
frontend/src/components/MenuItem/MenuItem.jsx:48 const isAvailable = isItemAvailable(...)
frontend/src/utils/itemAvailability.js:57 export const isItemAvailable = (...)
```

### Target behaviour

Apply `isItemAvailable` as a hide-filter at the page level, **before** the card is rendered. The card never exists for an unavailable item. Customer scrolls past a clean list of currently-orderable items.

When a category has zero items after this new filter, the entire section auto-hides (the existing `if (reorderedItems.length === 0) return null;` block at `MenuItems.jsx:801-803` already covers this case, so no new logic needed for category hiding).

### Mid-session edge case (in-cart item becomes unavailable)

A customer added "Bento Breakfast Set" at 10:55 am. Window ends 11:00 am. They open the cart at 11:02 am.

Three options were considered:
- A. Hard hide — item disappears from menu AND cart silently (high surprise risk)
- B. Keep in cart, hide in menu (no surprise, but POS may reject at order time)
- **C. Toast + auto-remove from cart** ← owner choice

C means: on every customer-side render where the cart context detects an item that no longer passes `isItemAvailable`, a toast fires with the names and the item is removed. Customer sees the item leave their cart, knows why, and can recover by reordering an in-window alternative.

### Impact summary

| Layer | Change |
|---|---|
| `MenuItems.filterItems` | New filter step calls `isItemAvailable` per item |
| `MenuItem.jsx` | ADD-vs-null logic remains as fallback for defense-in-depth but is no longer the primary path |
| `CartContext` | New effect/hook detects in-cart unavailability and emits toast + dispatches removal |
| Customer perception | Cleaner, smaller, accurate menu; cart never carries surprise unavailable items |

---

## PROBLEM 2: APP-12 — place-order has no client-side availability block

### Current behaviour (verified by grep on `ReviewOrder.jsx`)

`ReviewOrder.handlePlaceOrder` (lines 818-1228) performs eight pre-flight checks before `placeOrder()` dispatches the cart to the POS. None of them involve availability:

| # | Check | What it does |
|---|---|---|
| 1 | `shouldBlockNonQrOrder` | Non-QR fraud guard |
| 2 | Room context retention | Room still scanned? |
| 3 | Restaurant-716 explicit room input | Hyatt-specific |
| 4 | Multi-menu manual table selection | For non-QR multi-menu |
| 5 | Phone number validity | 10-digit |
| 6 | Double-click guard | Idempotency |
| 7 | Auth / coupon refresh | Various sub-guards |
| 8 | `placeOrder({cartItems, …})` | Dispatch |

Zero references to `isItemAvailable`, `live_web`, `web_available_time_starts/ends`, stock, or any timing logic. Whatever's in the cart goes through.

### Target behaviour

Insert one validation step before step 8:

```
Step 7.5 — Availability validation
  - Force refetch of menu sections (APP-13 dependency)
  - For each cart item, compute isItemAvailable against current time + admin overrides
  - If any item fails:
      - Show toast listing names
      - Remove blocked items from cart
      - Return (do not call placeOrder)
  - Else: proceed to step 8
```

Customer sees the toast, sees the updated cart, clicks Place Order again on the (now valid) order. If all items in cart became invalid, place-order button disables and the cart shows empty state.

### Trade-off analysis

| Risk | Mitigation |
|---|---|
| Customer surprise — "I clicked Place Order and nothing happened" | Toast is explicit: lists which items were removed and why |
| Race condition — POS clock vs client clock drift around boundary | Acceptable; same edge case exists for the menu hide. Customer can retry. |
| One extra HTTP round-trip per place-order | ~1-3 s on 463-item restaurant. Acceptable for correctness. |
| If POS rejects an item we didn't catch | Our defense-in-depth doesn't replace POS-side validation; POS still authoritative. We catch the obvious cases client-side, POS catches the rest. |

---

## PROBLEM 3: APP-13 — menu cache lets stale kill-switches reach the customer

### Current behaviour (verified at `useMenuData.js:170-180`)

```js
return {
  queryKey: ['menuSections', restaurantId, stationId],
  queryFn: () => fetchMenuSections(restaurantId, stationId),
  staleTime: 5 * 60 * 1000,   // 5 minutes considered fresh
  gcTime:    15 * 60 * 1000,  // 15 minutes kept in memory
  retry: 3,
};
```

### Why cache exists at all

Heavy POS `restaurant-product` call:
- 478 — 147 items, ~1.3 s
- 716 Hyatt — 344 items, ~2.4 s
- 541 Palm House — 463 items, ~3.5 s

Refetch on every nav (cart ↔ menu ↔ search ↔ menu) would put 1-3 s of latency on each navigation. Cache exists for perceptual speed.

### What cache breaks today

Per code path: clock-based hiding (APP-11) works correctly with cache because `useCurrentTime` is independent of the cache. So a static POS window "11 am – 3 pm" works whether the menu was fetched 30 s ago or 4 min ago.

BUT three classes of mid-session change DO NOT propagate within `staleTime`:

| Signal | Source | Cache-blocked? |
|---|---|---|
| `live_web` flipped to `'N'` | POS staff | YES — up to 5 min stale |
| `is_disable` to `'Y'` | Chef "86s" item | YES — up to 5 min stale |
| `food_stock` to 0 | Inventory hit zero | YES — up to 5 min stale |
| Admin sets new `itemTimings` in Menu Order | Admin save | Comes via `RestaurantConfigContext` (separate cache); also stale |
| New item added on POS | POS staff | Up to 5 min stale |

### Target behaviour — owner-confirmed combo

| Knob | Old | New |
|---|---|---|
| `staleTime` | 5 min | **30 s** |
| `refetchOnWindowFocus` | (default false) | **true** |
| `refetchOnReconnect` | (default false) | **true** |
| Forced refetch before Place Order | none | **forced via APP-12** |

Effect: live menu stays within 30 s of POS state, instantly refreshes when customer brings tab back, and is always re-validated immediately before the POS call.

### Cost analysis

| Scenario | Old fetches per session | New fetches per session |
|---|---|---|
| Customer browses for 5 min straight | 1 | up to 10 (every 30 s) |
| Customer browses, switches tabs, returns | 1 | +1 on return |
| Customer places order | 1 | +1 forced refetch |

For 463-item Palm House at 3.5 s per fetch, that's roughly 35 s of background fetch time over a 5-min session. Background, not foreground — never blocks UI. React Query serves stale data instantly while refetching ("stale-while-revalidate"), so UX is unaffected by the increased fetch count.

POS-side load increase: linear in session count × ~10x per session. Acceptable for preprod; will need owner review before production rollout.

### Future-park (not in this CR)

A lightweight "availability snapshot" endpoint that returns only `[{id, live_web, is_disable, food_stock}, ...]` for a restaurant would let us refetch the snapshot every 30 s without the full 3.5 s menu pull. This is a POS-side ask; out of scope here.

---

## RISK ANALYSIS (CR-wide)

| Risk | Item | Likelihood | Mitigation |
|---|---|---|---|
| Existing menu render breaks for already-available items | APP-11 | LOW | New filter is opt-in (calls `isItemAvailable`); when item is available, no change. Code review + QA. |
| Customer surprise when cart prunes mid-session | APP-11 | LOW | Toast explains, doesn't silently lose. |
| Place-order extra latency from forced refetch | APP-12 | LOW-MED | ~1-3 s added to place-order. Same fetch the menu is already optimized for. Could show "Verifying availability…" spinner. |
| POS load 10× from tightened cache | APP-13 | MED | Acceptable in preprod. Production rollout to be reviewed by owner / capacity check. |
| Refetch on focus annoys low-bandwidth users (mobile) | APP-13 | LOW | React Query already de-dupes; doesn't refetch if just fetched. |
| Customer cart loses item right before checkout | APP-12 | LOW | Toast + re-render before they click Place Order. They can review and resubmit. |
| Forced fetch fails (network issue) | APP-12 | LOW | React Query 3-retry already in place. Fall back to last cached menu data with a warning toast. |
| Time-zone bug in `currentTimeInSeconds` | APP-11 | LOW | Existing util already used in production; unit tests cover. No regression risk. |

---

## ACCEPTANCE TESTS (for QA after IMPLEMENTATION)

### APP-11 — menu hide

| # | Test | Expected |
|---|---|---|
| 11-1 | Item with `live_web='Y'` and POS window 00:00–23:59 | Renders normally |
| 11-2 | Item with `live_web='N'` | Not in DOM. `data-testid="menu-item-<id>"` not found. |
| 11-3 | Item with POS window 07:00–11:00 at current time 12:00 IST | Not in DOM |
| 11-4 | Admin set `itemTimings[<id>]` = 14:00–15:00 at current time 12:00 | Not in DOM |
| 11-5 | Category whose all items hidden | Section not in DOM, no empty header |
| 11-6 | Item already in cart goes out of window at 60s tick | Toast appears, item disappears from cart icon count, removed from CartContext state |
| 11-7 | Channel filter + timing filter together | Both apply; only items passing BOTH render |
| 11-8 | iter_7 regression — Avocado Hummus + Save Changes UI | Unchanged |

### APP-12 — place-order block

| # | Test | Expected |
|---|---|---|
| 12-1 | Cart has 3 in-window items; click Place Order | Forced refetch fires; validation passes; order POSTs to POS as today |
| 12-2 | Cart has 2 in-window + 1 just-expired; click Place Order | Toast "Some items are no longer available: X" with `data-testid="placeorder-blocked-toast"`; cart now has 2 items; `placeOrder()` NOT called |
| 12-3 | Cart all 3 items expired; click Place Order | Toast; cart empty; Place Order button disables |
| 12-4 | After 12-2's prune, click Place Order again | Order POSTs to POS with the 2 remaining items, totals correct |
| 12-5 | Item with `live_web` flipped to `N` mid-session, in cart, click Place Order | Same as 12-2 — caught by pre-place-order validation |
| 12-6 | POS rejects after our pre-validation passes (extremely rare) | Existing error handling unchanged |
| 12-7 | Network failure during forced refetch | Fallback to cached menu with a warning; user can retry; cart untouched |
| 12-8 | Existing place-order flow for QR/non-QR/multi-menu | All pre-flight checks (rooms, table, phone, etc.) still execute in original order |

### APP-13 — cache freshness

| # | Test | Expected |
|---|---|---|
| 13-1 | First menu load | Single fetch, populates cache |
| 13-2 | Same menu reopened within 30 s | No fetch |
| 13-3 | Same menu reopened at 31 s | Background refetch fires, stale data served instantly |
| 13-4 | Customer switches to another tab for 60 s and returns | `refetchOnWindowFocus` fires |
| 13-5 | Network disconnects then reconnects | `refetchOnReconnect` fires |
| 13-6 | Place Order trigger | Forced `refetchQueries(['menuSections', ...])` fires before validation |
| 13-7 | POS call count over a 5-min session of browsing | At most ~10 calls, average lower due to dedup |
| 13-8 | `queryKey` shape unchanged | Existing prefetchers still hit the cache slot, no key drift |

### Regression

| # | Test | Expected |
|---|---|---|
| R-1 | All CR-001 + CR-002 acceptance criteria | Pass unchanged |
| R-2 | Customer cart persistence (localStorage) | Unchanged |
| R-3 | Customer authentication / OTP flow | Unchanged |
| R-4 | Order success + edit-order flow | Unchanged |
| R-5 | Channel cascade (item > category > POS) | Unchanged |
| R-6 | Admin Menu Order page | Unchanged |

---

## EFFORT ESTIMATE (CR-wide)

| Phase | Estimate |
|---|---|
| IMPLEMENTATION (all three items, one commit recommended) | ~1 focused session |
| Self-test | Compile + lint + manual click-through of 6 key cases |
| QA via `testing_agent_v3` | 24 cases (11-1 to 13-8) + R-1 to R-6 regression. Wall time ~15 min. |
| Closure docs (CR.md → IMPLEMENTED, QA handover, PRD update) | 5 min |

Total wall time: under one focused session.

---

## ROLLOUT ORDER (within this CR)

1. **APP-13 first** — cache knobs. Three-line change. Independent. Lays groundwork for APP-12's forced refetch.
2. **APP-11 second** — menu hide + in-cart prune. Visible to customer immediately on next page load.
3. **APP-12 third** — place-order safety net. Depends on APP-13's forced refetch capability.

Single commit can ship all three. No staged release needed. Rollback = single `git revert`.

---

## ROLLBACK PLAN

All changes are confined to 5 files. Each item is independently revertable:
- APP-13 alone: revert `useMenuData.js`. Cache reverts to 5 min staleTime, everything else still works.
- APP-12 alone: revert `ReviewOrder.jsx` validation block. Place-order returns to current "send everything" behaviour.
- APP-11 alone: revert `MenuItems.jsx` filter + `CartContext.js` prune. Items return to visible-with-no-ADD behaviour.

No DB migrations, no schema, no protected-file regressions.

---

## NOT INCLUDED (explicit non-scope, parking lot)

- **POS-side lightweight availability snapshot endpoint** — would let us refetch only `{id, live_web, is_disable, food_stock}` instead of the full menu. Future POS request.
- **"Available 7-11 am" badge** for hidden items so customer knows when to come back — owner decided HIDE entirely; badge UX rejected.
- **WebSocket / Server-Sent Events** for real-time kill-switch updates — bigger architecture change.
- **Cart-recovery flow** when all items are removed by the validator — outside this CR's risk envelope.
- **Optimistic locking on Place Order** — POS-side concern.
- **Re-validation during checkout payment screen** (between Place Order click and Razorpay) — could be added later if needed; not required by owner today.

---

*Registered: 2026-06-17 | Stage: PLANNING — IA complete | Awaiting owner sign-off*
