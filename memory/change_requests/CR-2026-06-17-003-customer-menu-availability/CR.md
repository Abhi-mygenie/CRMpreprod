# CR-2026-06-17-003 — Customer Menu Availability (APP-11 + APP-12 + APP-13)

**ID:** CR-2026-06-17-003
**Classification:** Change Request (three sibling items, customer-side menu/cart/availability)
**Origin:** Discovered during INVESTIGATION on owner@fivestar.com timing-save report and follow-up Q&A about timing-blocked items / menu cache / place-order validation (2026-06-17).
**Severity:** P1 (real-world correctness — customer can today order items that are not currently available)
**Risk:** LOW (single concept — availability gating — touched in three places; no schema, no protected files)
**Status:** IMPLEMENTED — all 3 items shipped, self-test passed, awaiting QA
**Priority within CR:** APP-11 → APP-13 → APP-12 (menu hide first, cache freshness second, place-order safety net third — but they ship together)

---

## Problem

Three related gaps in the customer-side availability story:

**P1 (APP-11):** When an item is currently outside its timing window (POS `web_available_time_starts/ends`, or admin `categoryTimings`/`itemTimings` overrides, or `live_web !== 'Y'`), the customer app **still displays the item card** (name, price, image, description) and just silently removes the ADD button. Customer sees a dish they cannot order with no explanation. Per owner requirement: **out-of-window items should not appear in the menu at all**.

**P2 (APP-12):** `ReviewOrder.handlePlaceOrder` has **zero availability validation**. A customer who added an item at 11:00 am (in window) and clicks Place Order at 11:15 am (now out of window) successfully POSTs the order to POS. There is no client-side block, no toast, no cart pruning. The POS may or may not reject — but from the customer-app perspective, the order goes through.

**P3 (APP-13):** Menu data is cached in React Query with `staleTime: 5 minutes`. Items' static timing fields plus the live `useCurrentTime` hook (refreshes every 60 s) handle clock-based hiding correctly — but **kill-switches** that change mid-session (`live_web`, `is_disable`, `food_stock` going to 0, admin setting a new `itemTiming` override) remain stale in the customer's view for up to 5 minutes.

---

## Goals

| Goal | Item |
|---|---|
| Out-of-window items disappear from the customer menu render | APP-11 |
| Stale items already in the cart cannot reach the POS at place-order time | APP-12 |
| Mid-session POS kill-switch changes propagate to the customer within ~30 s, and definitely before Place Order | APP-13 |

Together: customer never orders something that is no longer available, and never sees something they cannot order.

---

## Items

| Item | Description | Severity | Risk | Status |
|---|---|---|---|---|
| **APP-11** | In `MenuItems.filterItems`, drop items where `isItemAvailable === false`. For items already in cart that become unavailable mid-session: **Option C — show a toast and auto-remove from cart**. | P1 | LOW | IMPLEMENTED |
| **APP-12** | In `ReviewOrder.handlePlaceOrder`, before dispatching `placeOrder()`, re-validate every `cartItem` with `isItemAvailable` against current time + freshly fetched menu data (from APP-13). If any blocked: show toast listing them, prune from cart, abort the place-order. Customer reviews the new cart, clicks Place Order again. | P1 | LOW | IMPLEMENTED |
| **APP-13** | Tighten React Query options in `useMenuData.js`: `staleTime: 30 s` (from 5 min), `refetchOnWindowFocus: true`, `refetchOnReconnect: true`. Plus, in APP-12's pre-place-order step, force a fresh fetch of the menu before validation runs. | P1 | LOW | IMPLEMENTED |

---

## Owner Decisions

| # | Question | Decision | Date |
|---|---|---|---|
| 1 | Hide-vs-disable for out-of-window items | **HIDE entirely** | 2026-06-17 |
| 2 | Behaviour for an in-cart item that goes out of window mid-session | **Option C — toast + auto-remove from cart** | 2026-06-17 |
| 3 | Menu cache freshness strategy | **B + C + D combined** — lower staleTime to 30 s + refetch on focus/reconnect + place-order forced fetch | 2026-06-17 |
| 4 | Should APP-12's place-order validation re-check `live_web`, `is_disable`, `food_stock` as well as timing? | **YES — full `isItemAvailable` check + stock if `food_stock` is enforced** (assumed; flip with one word) | 2026-06-17 (default) |
| 5 | If APP-12 prunes 1+ items, auto-place the trimmed order or require admin to click Place Order again? | **Require re-click** (give customer one last visual confirmation of the now-smaller order). (assumed) | 2026-06-17 (default) |

---

## Acceptance Criteria

### APP-11 (hide timing-unavailable items in menu)

A1. Items with `live_web !== 'Y'` are not rendered in the customer menu list.
A2. Items currently outside their effective timing window (admin override OR POS times) are not rendered.
A3. A category whose every item is hidden is itself hidden (no empty "Category (0 items)" section).
A4. Filter re-evaluates on the existing `useCurrentTime` 60-second tick — an item slides out of the menu at most ~60 s after its end time.
A5. Items already in cart that become unavailable: a toast appears `data-testid="cart-item-unavailable-toast"` listing names. Cart auto-removes them. Cart count badge updates. The toast text is: *"Some items are no longer available: <names>. Removed from your cart."*
A6. Customer-side cascade behaviour for AVAILABLE items is bit-identical to today (no regression in channel, search, veg, dietary filters).
A7. No backend changes. No protected files touched.

### APP-12 (place-order safety net)

B1. Before `placeOrder()` is dispatched in `handlePlaceOrder`, every cart item is re-validated via `isItemAvailable` against `currentTimeInSeconds`, `categoryTimings`, `itemTimings`, AND against a freshly fetched menu (APP-13 dependency).
B2. If 1+ items are now unavailable, a toast `data-testid="placeorder-blocked-toast"` appears with text *"Some items are no longer available and were removed from your order: <names>. Please review and try again."*
B3. Cart removes the blocked items. Cart total + tax + summary all recompute.
B4. `placeOrder()` is NOT dispatched. The customer stays on ReviewOrder. They click Place Order again to submit the (now valid) order.
B5. If ALL items in cart become unavailable, the place-order button switches to disabled and the cart shows an empty state.
B6. APP-12 also re-validates `live_web` and `is_disable` (POS kill-switches) — not just timing.
B7. APP-12 does NOT mutate any other cart state (item quantities, options, special instructions) for items that remain available.

### APP-13 (menu cache freshness)

C1. `staleTime` in `useMenuData.js` is lowered to `30 * 1000` (30 seconds).
C2. `refetchOnWindowFocus: true` is set — when customer brings the tab back into focus after >30 s away, a silent refetch fires.
C3. `refetchOnReconnect: true` is set — after a network drop, menu refetches when back online.
C4. APP-12's pre-place-order step invokes a forced refetch (via React Query `refetchQueries(['menuSections', restaurantId, stationId])`) before running validation.
C5. POS API call volume increases by at most ~10× during a typical customer session (was 1 fetch / 5 min, becomes up to 1 fetch / 30 s). Acceptable trade for correctness; no special caching layer added.
C6. No queryKey changes — existing prefetch and cache slots stay compatible.

---

## Non-Goals (explicit scope guardrails)

- No new backend endpoint (light "availability snapshot" was discussed; parked as future POS-side ask).
- No mutation of the POS data or item time-range fields — customer app stays consumer-only.
- No changes to `channelEligibility.js` (channel cascade is separate from availability cascade).
- No changes to the existing item-already-in-cart flow when item REMAINS available — only the unavailable-mid-session case is touched.
- No changes to admin Menu Order page (that's CR-002's territory).
- No changes to room/table check-in flow (S1 stays POS-side per owner).
- No multi-channel preview-from-customer-side (admin-only via CR-002's APP-7).
- No retry logic — if `placeOrder()` fails after the validation pass, error handling is unchanged.

---

## Related Documents

| Document | Path |
|---|---|
| Impact Analysis | `/app/memory/change_requests/CR-2026-06-17-003-customer-menu-availability/IMPACT_ANALYSIS.md` |
| Parent — admin-side overrides feed APP-11's cascade | `/app/memory/change_requests/CR-2026-06-17-001-menu-order-enhancements/` |
| Parent — sibling admin UX in flight | `/app/memory/change_requests/CR-2026-06-17-002-channel-preview-in-admin/` |
| Investigation source | Session conversation 2026-06-17 (owner Q&A on cache + place-order block) |

---

## Blast Radius

| Area | Impact |
|---|---|
| Customer menu render | Items disappear when out of window (intended); page layout unaffected |
| Cart context | New auto-prune-and-toast path when item becomes unavailable mid-session |
| Place-order flow | One extra validation step before POS call; potentially aborts with toast |
| Menu fetch frequency | ~10× more API calls per session (5 min → 30 s) |
| Backend config / schema | NONE |
| Customer auth / cart persistence | NONE — cart still uses existing localStorage keys |
| Protected files | NONE — `AuthContext`, `App.js` providers, `server.py` routes untouched |
| Admin Menu Order page | NONE — CR-002 stays independent |
| Files in scope | `frontend/src/pages/MenuItems.jsx`, `frontend/src/components/MenuItem/MenuItem.jsx` (small), `frontend/src/pages/ReviewOrder.jsx`, `frontend/src/hooks/useMenuData.js`, `frontend/src/context/CartContext.js` (mid-session prune) |
| Existing data-testids | All preserved; new ones added |

---

*Registered: 2026-06-17 | Last updated: 2026-06-18 | Stage: IMPLEMENTED + QA PASSED (iteration 8)*
