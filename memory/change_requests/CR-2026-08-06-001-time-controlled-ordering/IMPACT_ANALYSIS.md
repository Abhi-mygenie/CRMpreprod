# IMPACT ANALYSIS — CR-2026-08-06-001

## Planning Gate Status

| Step | Status |
|------|--------|
| 1. Verify registered | DONE — CR-2026-08-06-001 |
| 2. Code reality | FULL — all 8 files read, data flow traced |
| 3. Conflicts | NONE — no active CRs on affected files |
| 4. Data flow traced | DONE — 4 surfaces mapped, helpers identified |
| 5. Risk verified | HIGH → CRITICAL |
| 6. Affected files | 8 WILL change, 8 WILL NOT |
| 7. Owner decisions | 8 decisions captured (D1–D8) |
| 8. Impact Analysis | THIS DOCUMENT — **COMPLETE — GATE CLOSED 2026-08-06** |
| 9. Implementation Plan | NOT YET — awaiting Owner Approval |
| 10. Verification matrix | 18 test cases written |
| 11. WILL/WILL NOT | Declared |
| 12. Design mock | **APPROVED by owner 2026-08-06** — `/cr-2026-08-06-001-design-mock.html` |

**Gate status: IMPACT ANALYSIS GATE CLOSED — 2026-08-06 — all decisions recorded — design approved — next gate: Owner Approval**

---

## Decision Log (all D1–D8 confirmed — gate closed)

| # | Decision | Answer | Date |
|---|----------|--------|------|
| D1 | Per-channel or global? | Per-channel — 5 channels independent | 2026-08-06 |
| D2 | What shows when closed? | Banner: channel name + "unavailable" + opening time | 2026-08-06 |
| D3 | Customer can place order? | NO — hard block | 2026-08-06 |
| D4 | Confirm dialog / bypass? | NO — block + message only | 2026-08-06 |
| D5 | Default when no hours? | Open 24/7 | 2026-08-06 |
| D6 | Global `restaurantShifts` role? | Fallback per channel | 2026-08-06 |
| D7 | Closed channel shown or hidden? | Shown, grayed out with opening time | 2026-08-06 |
| D8 | Design mock approved? | **YES** — all 4 surfaces approved: landing selector (grayed button + opens time), menu banner (channel name + opens at + switch link), review order (hard block message + disabled submit), admin channel hours section (per-channel rows with time inputs) | 2026-08-06 |

**All decisions locked. No open questions. No blockers.**

---

## Data Flow — Before vs After

### Before

```
restaurantShifts (global)
      ↓
isRestaurantOpen(restaurantShifts)
      ↓
isOnlineOrderEnabled (MenuItems.jsx only)
      ↓
Add to Cart button disabled (no message, no reason)

ReviewOrder.jsx → NO TIME CHECK → orders always go through
```

### After

```
restaurantShifts (global fallback)
deliveryShifts | takeawayShifts | dineInShifts | roomShifts | walkinShifts
      ↓
isChannelOpen(scannedOrderType, config)    ← NEW helper
      ↓
┌─────────────────────────────────────────────────────┐
│ MenuItems.jsx                                        │
│  • isChannelOpen → banner if closed                  │
│  • Add to Cart grayed + message + opening time       │
│                                                      │
│ LandingPage → OrderModeSelector                      │
│  • Closed channel grayed, shows "Opens HH:MM"        │
│  • Cannot select closed channel                      │
│                                                      │
│ ReviewOrder.jsx (new)                                │
│  • isChannelOpen check at submit                     │
│  • If closed → early return, no API call             │
│  • Submit button disabled + block message            │
└─────────────────────────────────────────────────────┘
```

---

## New Config Fields

| Field | Type | Default | Backend model | Context default |
|-------|------|---------|--------------|-----------------|
| `deliveryShifts` | `List[dict] \| null` | `null` | `Optional[List[dict]] = None` | `null` |
| `takeawayShifts` | `List[dict] \| null` | `null` | `Optional[List[dict]] = None` | `null` |
| `dineInShifts` | `List[dict] \| null` | `null` | `Optional[List[dict]] = None` | `null` |
| `roomShifts` | `List[dict] \| null` | `null` | `Optional[List[dict]] = None` | `null` |
| `walkinShifts` | `List[dict] \| null` | `null` | `Optional[List[dict]] = None` | `null` |

All default `null` → open 24/7 → day-1 invisible for all existing restaurants.

---

## New Utility Functions (itemAvailability.js — additive)

### `isChannelOpen(channel, config)`

```
channel: 'delivery' | 'takeaway' | 'dinein' | 'room' | 'walkin'
config:  from useRestaurantConfig()

1. If config.restaurantOpen === false → return false (master toggle)
2. channelShiftsKey = channel + 'Shifts' (e.g. 'deliveryShifts')
3. If config[channelShiftsKey] is set → return isRestaurantOpen(config[channelShiftsKey])
4. Else fallback → return isRestaurantOpen(config.restaurantShifts)
5. (isRestaurantOpen returns true when shifts is null/empty — 24/7 open)
```

### `getChannelNextOpenTime(channel, config)`

```
1. Get channelShifts or restaurantShifts (same fallback logic)
2. If no shifts → return null (no time to show)
3. Find the next shift start that is AFTER current time
4. Return formatted string: "11:00 AM"
```

---

## 4 UI Surfaces Changed

| Surface | File | Change |
|---------|------|--------|
| Landing page channel selector | LandingPage.jsx + OrderModeSelector.jsx | Closed channel grayed, opening time shown, non-clickable |
| Menu page | MenuItems.jsx | Banner: "Channel unavailable · Opens HH:MM" + Add to Cart grayed |
| Review Order (submit) | ReviewOrder.jsx | Hard block + same message + Submit disabled |
| Admin settings | AdminSettingsPage.jsx | New "Channel Hours" section with 5 channel rows |

Design mock: `https://react-deploy-live.preview.emergentagent.com/cr-2026-08-06-001-design-mock.html`

---

## Files WILL change (8)

1. `ReviewOrder.jsx` — CRITICAL — channel open check at submit
2. `LandingPage.jsx` — HIGH — compute + pass channel availability
3. `RestaurantConfigContext.jsx` — HIGH — 5 new fields + defaults
4. `MenuItems.jsx` — HIGH — per-channel check + banner
5. `server.py` — HIGH — 5 new AppConfigUpdate fields + defaults
6. `OrderModeSelector.jsx` — MEDIUM — disabled prop + opening time
7. `itemAvailability.js` — MEDIUM — 2 new helpers (additive)
8. `AdminSettingsPage.jsx` — MEDIUM — new Channel Hours section

## Files WILL NOT change (8)

AuthContext.jsx, CartContext.js, orderService.ts, OrderSuccess.jsx,
TableRoomSelector.jsx, orderAccessPolicy.js, isRestaurantOpen() (existing unchanged),
restaurantShifts/restaurantOpen (existing fields unchanged)

---

## Verification Matrix (18 cases)

| # | Scenario | Config | Expected |
|---|----------|--------|----------|
| V1 | No channel hours set, no global shifts | all null | All channels open 24/7 |
| V2 | No channel hours, global shifts set (06:00–23:00) | restaurantShifts only | All channels follow global |
| V3 | Delivery hours set, others null | deliveryShifts: 11:00–22:00 | Delivery gated; others use global |
| V4 | Delivery closed (outside hours) — menu | deliveryShifts set | Banner shows, Add to Cart grayed |
| V5 | Delivery open — menu | deliveryShifts set, current in range | No banner, Add to Cart active |
| V6 | Delivery closed — OrderModeSelector | deliveryShifts set | Delivery button grayed, shows opening time |
| V7 | Delivery closed — user tries to select delivery | deliveryShifts set | Button not clickable |
| V8 | Delivery closed — Review Order submit | deliveryShifts set | Hard block, message shown, Submit disabled |
| V9 | Delivery closed — Review Order (edit mode) | deliveryShifts set | Same hard block applies |
| V10 | restaurantOpen = false | any | All channels blocked (master toggle wins) |
| V11 | Takeaway closed, delivery open | both set | Takeaway grayed, Delivery active |
| V12 | All channels have specific hours | all set | Each channel independent |
| V13 | Overnight shift (e.g. room: 22:00–03:00) | roomShifts overnight | Correctly handled by existing isWithinShift() |
| V14 | Opening time display: next open time | deliveryShifts future | Shows "Opens 11:00 AM" |
| V15 | Opening time display: no shifts | null | No time shown (null) |
| V16 | Switch link on banner | delivery closed, takeaway open | Switch to Takeaway link visible |
| V17 | Admin saves channel hours | new config | Config persisted; page reload reflects change |
| V18 | Admin clears channel hours (sets empty) | null | Channel falls back to global shifts |

---

## Constraints

1. **Day-1 invisible**: defaults = null = open 24/7. No existing restaurant affected.
2. **`isRestaurantOpen()` untouched**: new helpers are additive only.
3. **No Fast Lane**: ReviewOrder.jsx and LandingPage.jsx are both hotspot files.
4. **`restaurantOpen` master toggle priority**: checked first in `isChannelOpen()`.
5. **Design mock approved by owner before implementation starts**: confirmed.

---

## Next Gate

**GATE CLOSED — 2026-08-06**

All decisions confirmed (D1–D8). Design approved. No open questions. No blockers.

```
Planning complete: CR-2026-08-06-001
Stage: Impact Analysis — GATE CLOSED 2026-08-06
Code reality: FULL — 8 files read, data flow traced across all 4 UI surfaces
Risk: HIGH → CRITICAL
Files WILL change: ReviewOrder.jsx, LandingPage.jsx, RestaurantConfigContext.jsx,
                   MenuItems.jsx, server.py, OrderModeSelector.jsx,
                   itemAvailability.js, AdminSettingsPage.jsx
Files WILL NOT touch: AuthContext.jsx, CartContext.js, orderService.ts,
                       OrderSuccess.jsx, TableRoomSelector.jsx,
                       orderAccessPolicy.js, isRestaurantOpen() (unchanged)
Owner decisions: D1–D8 all confirmed
Design: APPROVED — /cr-2026-08-06-001-design-mock.html
Docs: IMPACT_ANALYSIS.md, CR.md — updated and closed
Next: OWNER APPROVAL → Implementation Plan
```
