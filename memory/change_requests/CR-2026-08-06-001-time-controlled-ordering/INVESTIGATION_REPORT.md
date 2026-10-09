# Investigation Report: INV-2026-08-06-001 — Time-Controlled Ordering

**Investigation ID:** INV-2026-08-06-001
**CR:** CR-2026-08-06-001
**Classification:** FE / CONFIG / FEATURE-GAP
**Confidence:** HIGH
**Status:** CLOSED — 2026-08-06

---

## Executive Summary

Restaurant has one global clock (`restaurantShifts`) that only gates the "Add to Cart"
button on `MenuItems.jsx`. Order placement in `ReviewOrder.jsx` has zero time checks —
midnight orders go through. No per-channel hours exist. No customer feedback on which
channels are open. Owner wants independent hours per channel (Delivery, Takeaway,
Dine-in, Room, Walk-in), a hard block at order placement, and closed channels shown
(not hidden) with their opening time.

---

## Evidence — Code Reality

### Where isRestaurantOpen() is called today

| File | Usage | Effect |
|------|-------|--------|
| `MenuItems.jsx` line 138 | `isRestaurantOpen(restaurantShifts)` | Gates Add to Cart button |
| `ReviewOrder.jsx` | **NOT CALLED** | No time check at order placement |
| Any other file | **NOT CALLED** | — |

### Config schema (RestaurantConfigContext.jsx defaults)
```js
restaurantShifts: [{ start: '06:00', end: '03:00' }],  // one global schedule
restaurantOpen: true,                                    // master toggle
```

No per-channel shift fields exist anywhere in config schema, backend models, or admin UI.

### Channel type selector
The landing page and menu show channel options (dine-in, takeaway, delivery etc.) with
no availability indicators. No grayed-out state, no hours displayed.

---

## Root Cause

**Three-part gap:**

1. **Enforcement gap** — `ReviewOrder.jsx` never calls `isRestaurantOpen()`. Cart items
   added before close can be submitted after close.

2. **Granularity gap** — Config has one global `restaurantShifts`. No way to say
   "delivery closes at 9 PM but dine-in stays open until 11 PM."

3. **UX gap** — Customer gets no feedback when a channel is unavailable. Add to Cart
   silently disappears. No message, no opening time shown.

---

## Owner Decisions (D1–D7) — all captured in CR.md

See `/app/memory/change_requests/CR-2026-08-06-001-time-controlled-ordering/CR.md`

Summary:
- Per-channel independent hours
- Global `restaurantShifts` = fallback when no channel hours set
- No channel hours = open 24/7
- Hard block at order placement (no bypass)
- Closed channels shown grayed out with opening time

---

## Files That Will Change (preliminary — for Intake/Planning to confirm)

| File | Change needed |
|------|--------------|
| `RestaurantConfigContext.jsx` | Add 5 new per-channel shift fields to schema + defaults |
| `server.py` (backend) | Add 5 new fields to `AppConfigUpdate` model |
| `AdminSettingsPage.jsx` | New "Channel Hours" section with per-channel time pickers |
| `MenuItems.jsx` | Replace global `isRestaurantOpen` check with per-channel check; show unavailability banner |
| `ReviewOrder.jsx` | Add per-channel time gate at submission — hard block |
| `itemAvailability.js` | Extend `isRestaurantOpen` or add new `isChannelOpen(channel, config)` helper |
| Channel selector (LandingPage or OrderTypeSelector) | Show grayed-out state + opening time per channel |

---

## Recommendation

→ **INTAKE** then **PLANNING** with design review during Impact Analysis (owner confirmed).

```
Investigation complete: INV-2026-08-06-001
Root cause: Three-part gap — no enforcement at ReviewOrder, no per-channel config,
            no UX feedback
Classification: FE / CONFIG
Confidence: HIGH
Evidence: Code grep, config inspection, owner decision session
Recommendation: Intake → Planning (design required during Impact Analysis)
```
