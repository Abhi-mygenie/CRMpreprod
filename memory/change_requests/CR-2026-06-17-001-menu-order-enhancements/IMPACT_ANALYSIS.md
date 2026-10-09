# CR-2026-06-17-001 — Impact Analysis & Implementation Plan (v2)

**Stage:** Impact Analysis + Implementation Plan  
**Risk:** HIGH  
**Status:** IMPLEMENTED + QA PASSED (Phase 1 + Phase 2, 2026-06-17)  
**Priority Order:** APP-1 → APP-2 → APP-4 → APP-3 (owner confirmed)  
**All owner decisions resolved:** YES (2026-06-17)

---

## EXISTING UI BASELINE

### What exists today in Menu Order admin page:

**Category level (single-menu restaurants):**
```
┌─────────────────────────────────────────────────────────────────┐
│ ≡  Tandoori Starter   5/5 items      ⏰ 24 hrs   🟢 Visible  > │
│    Cheese blend Dip, Tandoori Dip, Afghani Paneer...            │
├─────────────────────────────────────────────────────────────────┤
│ ≡  Soup              11/11 items      ⏰ 24 hrs   🟢 Visible  > │
│    Brokli soup, Chicken Manchow Soup...                         │
└─────────────────────────────────────────────────────────────────┘
```
Features: drag reorder ✅, timing editor ✅, visibility toggle ✅, expand chevron ✅, search ✅, refresh ✅

**Item level (inside expanded category):**
```
┌──────────────────────────────────────────────────────┐
│ Items                          Show All  |  Hide All │
│ ≡  1  Egg Noodles              ⏰ 24hrs         👁   │
│ ≡  2  Chicken Chilli Noodles   ⏰ 24hrs         👁   │
│ ≡  3  Veg Hakka Noodles        ⏰ 24hrs         👁   │
└──────────────────────────────────────────────────────┘
```
Features: drag reorder ✅, timing editor (shows POS time as default, admin override) ✅, visibility eye ✅, bulk show/hide ✅

**Station level (multi-menu restaurants):**
```
Select Menu:  [Breakfast] [GROK] [FOOD MENU] [Kids Menu] [Bar & Drinks]

📍 Breakfast   5 categories    🟢 Visible    🔄 Refresh
```
Features: click to select ✅, visibility toggle ✅, drag reorder ❌ NOT WIRED, timing display ❌ NOT SHOWN

---

## APP-1: Sort Items by `food_order` Client-Side

### Visual Change
**None** — no UI change. Items appear in POS-intended order automatically instead of arbitrary order.

### What Changes
When admin hasn't set custom item order, items sort by `food_order` ascending. Items with `food_order=0` (unset) go to the end, preserving POS response order among themselves.

### Immediate Effect
- **Restaurants 478 (18march), 689 (Kunafa Mahal):** Items will reorder to match POS `food_order` values (1-176 range). Visible change for customers.
- **All other restaurants (food_order=0 everywhere):** No visible change — 0s stay in POS response order.

### Files WILL change
| File | Change |
|---|---|
| `frontend/src/pages/MenuItems.jsx` (line ~753-777) | Add `food_order` sort when no admin `itemOrder` exists |
| `frontend/src/components/AdminSettings/MenuOrderTab.jsx` (line ~344-350) | Sort fetched items by `food_order` so admin sees POS-intended baseline |

### Files WILL NOT touch
`useMenuData.js` (already carries `food_order` at line 109), `itemAvailability.js`, `server.py`, `CartContext.js`

### Implementation Steps
1. In `MenuItems.jsx` line ~777: after item ordering block, if no admin `itemOrder[categoryId]` exists, sort `orderedSectionItems` by `food_order` ascending (0s to end)
2. In `MenuOrderTab.jsx` line ~344: sort fetched items by `food_order` before merging with admin order

### Verification
- [ ] Restaurant 478: items appear in `food_order` ascending order on customer menu
- [ ] Restaurant 541: no change (all `food_order=0`, POS response order preserved)
- [ ] Admin sets custom drag order → custom order takes priority over `food_order`
- [ ] Admin Menu Order page shows items in `food_order` baseline order

---

## APP-2: Wire Station/Menu Drag-Drop Reorder

### Visual Change

**CURRENT:**
```
Select Menu:  [Breakfast] [GROK] [FOOD MENU] [Kids Menu]
               ↑ click only, no reorder
```

**AFTER:**
```
Select Menu:  ≡[Breakfast] ≡[GROK] ≡[FOOD MENU] ≡[Kids Menu]
               ↑ drag handle on each pill, can drag to reorder
```

### Mockup Reference
![Station Pills Current vs After](https://static.prod-images.emergentagent.com/jobs/9c5cca4c-9a94-4ae7-a88e-68dd84405d1d/images/f4adeac7217cb39087ddf429624a63c4218e26cc58b44d1a99400c19eb2f0094.png)

### What Changes
Station pills become draggable. Backend save logic already exists (`handleStationDragEnd` line 584, `updateStationConfig` line 482). Just wiring the UI.

### Files WILL change
| File | Change |
|---|---|
| `frontend/src/components/AdminSettings/MenuOrderTab.jsx` (lines 626-648) | Wrap station pills in `DndContext` + `SortableContext`, make each pill a `SortableItem` with drag handle |

### Files WILL NOT touch
`server.py` (already accepts `menuOrder.stationOrder`), `DiningMenu.jsx` (already reads `stationOrder`), `RestaurantConfigContext.jsx`, `AdminConfigContext.jsx`

### Implementation Steps
1. Wrap station pills container (line 631) in `DndContext` with existing `handleStationDragEnd`
2. Wrap pills in `SortableContext` with vertical/horizontal list strategy
3. Make each station pill a `SortableItem` with drag handle icon
4. Preserve existing click-to-select behavior alongside drag

### Verification
- [ ] Admin can drag station pills to reorder
- [ ] Click-to-select still works (selecting station shows its categories)
- [ ] Save → customer DiningMenu shows stations in admin-set order
- [ ] Visibility toggle still works alongside drag
- [ ] New stations from POS appear at end (merge logic already handles this)

---

## APP-4: Show/Override Station Timing in Admin

### Visual Change

**CURRENT:**
```
📍 Breakfast   5 categories    🟢 Visible    🔄 Refresh
```

**AFTER:**
```
📍 Breakfast   5 categories    ⏰ 7:00 AM - 11:00 AM (POS)    🟢 Visible    🔄 Refresh
                                ↑ clickable — opens inline editor to override
                                ↑ shows ✕ reset button when admin-overridden
```

### Mockup Reference
![Station Timing](https://static.prod-images.emergentagent.com/jobs/9c5cca4c-9a94-4ae7-a88e-68dd84405d1d/images/f4adeac7217cb39087ddf429624a63c4218e26cc58b44d1a99400c19eb2f0094.png)
(See "AFTER" side — station header with timing display)

### What Changes
Admin sees POS station timing (`opening_time`/`closing_time` from `menu-master` API) and can override it. Uses existing `TimingEditor` component already built for categories/items.

### Data Available from POS (example — Hyatt 716)
```
Breakfast:            07:00:00 - 11:00:00
Promational Menu:     13:00:00 - 19:00:00
FOOD MENU:            11:00:00 - 23:00:00
GROK / Kids / Bar:    00:00:00 - 23:59:00 (24hrs)
```

### Config Schema Addition
```json
{
  "stationTimings": {
    "<stationId>": { "start": "HH:MM", "end": "HH:MM" }
  }
}
```
- Missing key = use POS default
- Set = admin override (shows reset button)

### Files WILL change
| File | Change |
|---|---|
| `frontend/src/components/AdminSettings/MenuOrderTab.jsx` | Add `TimingEditor` to selected station header (line ~650-677), passing POS `openingTime`/`closingTime` as defaults |
| `frontend/src/context/AdminConfigContext.jsx` | Add `stationTimings: {}` to defaults (line ~113) |
| `frontend/src/context/RestaurantConfigContext.jsx` | Expose `stationTimings` (line ~447) |
| `frontend/src/pages/DiningMenu.jsx` | Read `stationTimings` and use admin override before POS timing in `isStationAvailable` (line ~95) |
| `backend/server.py` | Add `stationTimings: Optional[dict] = None` to `AppConfigUpdate` model (line ~231) |

### Files WILL NOT touch
`MenuItems.jsx`, `itemAvailability.js`, `CartContext.js`, `AuthContext.jsx`

### Implementation Steps
1. Add `stationTimings: Optional[dict] = None` to backend `AppConfigUpdate` model
2. Add `stationTimings: {}` to `AdminConfigContext` defaults
3. Expose `stationTimings` through `RestaurantConfigContext`
4. In `MenuOrderTab.jsx` selected station header: add `TimingEditor` with `posStart={station.openingTime}` `posEnd={station.closingTime}`
5. Save writes to `config.stationTimings[stationId]`
6. In `DiningMenu.jsx` `isStationAvailable`: check `stationTimings[stationId]` first, fall back to POS timing

### Verification
- [ ] Admin sees POS station timing displayed (e.g., "7:00 - 11:00") for stations that have it
- [ ] Stations with 24hr POS timing show "24 hrs"
- [ ] Admin clicks timing → inline editor opens → saves custom time
- [ ] Admin override shows reset ✕ button → reset returns to POS default
- [ ] Customer DiningMenu uses admin timing when set, POS timing otherwise
- [ ] Stations without any timing (POS or admin) show as always available

---

## APP-3: Admin Override for dinein/takeaway/delivery (Category + Item Level)

### Visual Change — Category Level

**CURRENT:**
```
≡  Noodles  11/11 items              ⏰ 24 hrs    🟢 Visible    >
```

**AFTER:**
```
≡  Noodles  11/11 items   [D✅][T✅][Del✅]   ⏰ 24 hrs    🟢 Visible    >
                            ↑ category-level channel toggles
                            ↑ toggling category applies to ALL items in it
```

### Visual Change — Item Level (inside expanded category)

**CURRENT:**
```
≡  1  Egg Noodles              ⏰ 24hrs         👁
```

**AFTER:**
```
≡  1  Egg Noodles    [D✅][T✅][Del❌]    ⏰ 24hrs         👁
                      ↑ per-item channel toggles
                      ↑ item can override category-level setting
                      ↑ red/off = hidden for that channel
```

### Mockup References
![Category Level](https://static.prod-images.emergentagent.com/jobs/9c5cca4c-9a94-4ae7-a88e-68dd84405d1d/images/dd08d8e843cf08b0858083d99384778fab8154337740e48935987623f0d9b5fd.png)
![Item Level](https://static.prod-images.emergentagent.com/jobs/9c5cca4c-9a94-4ae7-a88e-68dd84405d1d/images/4dc31587988c113a0b6c9d03274660a5df276d04101732a2eb0d05710c9b712d.png)

### Behavior Rules
1. **Default:** All channels show POS values (green if POS says "Yes", red if POS says "No")
2. **Category toggle OFF:** Hides ALL items in that category for that channel — overrides per-item POS flags
3. **Category toggle ON:** Items use their own POS flags (or item-level admin overrides)
4. **Item toggle:** Overrides both POS flag AND category-level toggle for that specific item
5. **Priority cascade:** Item admin override > Category admin override > POS flag

### Config Schema Addition
```json
{
  "channelOverrides": {
    "category": {
      "<categoryId>": { "dinein": true/false, "takeaway": true/false, "delivery": true/false }
    },
    "item": {
      "<itemId>": { "dinein": true/false, "takeaway": true/false, "delivery": true/false }
    }
  }
}
```
- Missing key = use POS default (no override)
- `false` = force-hide for that channel
- `true` = force-show for that channel (can override POS "No")

### Files WILL change
| File | Change |
|---|---|
| `frontend/src/components/AdminSettings/MenuOrderTab.jsx` | Add D/T/Del toggle pills to CategoryCard header + item rows |
| `frontend/src/context/AdminConfigContext.jsx` | Add `channelOverrides: {}` to defaults |
| `frontend/src/context/RestaurantConfigContext.jsx` | Expose `channelOverrides` |
| `frontend/src/pages/MenuItems.jsx` | Apply `channelOverrides` before `isItemAllowedForChannel` filter (line ~348) |
| `frontend/src/utils/channelEligibility.js` | Modify `isItemAllowedForChannel` to accept admin overrides (category + item level) |
| `backend/server.py` | Add `channelOverrides: Optional[dict] = None` to `AppConfigUpdate` model |

### Files WILL NOT touch
`MenuItem.jsx` (channel check stays in page-level filter), `CartContext.js`, `ReviewOrder.jsx`, `orderService.ts`, `AuthContext.jsx`, `App.js`

### Implementation Steps
1. Add `channelOverrides: Optional[dict] = None` to backend `AppConfigUpdate` model
2. Add `channelOverrides: {}` to `AdminConfigContext` defaults
3. Expose `channelOverrides` through `RestaurantConfigContext`
4. Create `ChannelToggles` sub-component in `MenuOrderTab.jsx` — three small pills (D/T/Del), each showing POS default with admin override state
5. Add `ChannelToggles` to CategoryCard header (between item count and timing)
6. Add `ChannelToggles` to each item row (between item name and timing)
7. Category toggle writes to `channelOverrides.category[categoryId]`
8. Item toggle writes to `channelOverrides.item[itemId]`
9. In `channelEligibility.js`: modify `isItemAllowedForChannel` to accept `{ categoryOverride, itemOverride }` — check item override first, then category override, then POS flag
10. In `MenuItems.jsx` line ~348: pass `channelOverrides` to the filter function

### Verification
- [ ] Admin sees D/T/Del toggles on each category card showing POS defaults
- [ ] Admin sees D/T/Del toggles on each item row showing POS defaults
- [ ] Category toggle OFF for takeaway → all items in category hidden from takeaway customers
- [ ] Item toggle overrides category toggle (e.g., category=OFF for delivery, but one item=ON for delivery)
- [ ] No override set → POS flags used (existing behavior unchanged)
- [ ] Customer on dine-in sees all dine-in-allowed items
- [ ] Customer on takeaway sees only takeaway-allowed items (with admin overrides applied)
- [ ] Save/reload → overrides persist
- [ ] New items from POS appear with POS defaults (no admin override until set)

---

## APP-5 & APP-6: PARKED (blocked by POS-1, POS-2)

**Status:** No code changes. Merge logic in `MenuOrderTab.jsx` (`mergeWithSaved`) and `MenuItems.jsx` (category ordering block) already handles "POS baseline + admin override" pattern. When POS adds `category_order` and `menu_order` fields:
- Sort raw API data by POS sort field before merging with admin order
- One-line change in each fetch function

**POS contract sent:** See `POS_API_CONTRACT_REQUEST.md`

---

## COMPLETE FILE CHANGE MAP

### Files WILL Change

| File | APP-1 | APP-2 | APP-4 | APP-3 | Risk |
|---|---|---|---|---|---|
| `frontend/src/pages/MenuItems.jsx` | ✅ sort | | | ✅ channel filter | HIGH |
| `frontend/src/components/AdminSettings/MenuOrderTab.jsx` | ✅ sort baseline | ✅ station DnD | ✅ station timing UI | ✅ channel toggles UI | MEDIUM |
| `frontend/src/utils/channelEligibility.js` | | | | ✅ admin override param | MEDIUM |
| `frontend/src/context/AdminConfigContext.jsx` | | | ✅ stationTimings | ✅ channelOverrides | MEDIUM |
| `frontend/src/context/RestaurantConfigContext.jsx` | | | ✅ stationTimings | ✅ channelOverrides | HIGH |
| `frontend/src/pages/DiningMenu.jsx` | | | ✅ admin timing check | | MEDIUM |
| `backend/server.py` | | | ✅ stationTimings field | ✅ channelOverrides field | CRITICAL |

### Files WILL NOT Touch

| File | Reason |
|---|---|
| `frontend/src/context/AuthContext.jsx` | No auth changes |
| `frontend/src/context/CartContext.js` | No cart changes |
| `frontend/src/pages/ReviewOrder.jsx` | No order flow changes |
| `frontend/src/utils/orderAccessPolicy.js` | No QR/access changes |
| `frontend/src/api/services/orderService.ts` | No order API changes |
| `frontend/src/pages/LandingPage.jsx` | No landing changes |
| `frontend/src/App.js` | No provider/route changes |
| `frontend/src/hooks/useMenuData.js` | Already carries all needed fields |
| `frontend/src/utils/itemAvailability.js` | Timing logic unchanged |
| Any localStorage keys | Per do-not-do rule #1 |

---

## TIMING NOTE

- Item timing admin override: **Already built and wired end-to-end.** No restaurant has tested it yet (zero timings in DB), but code path is complete (AdminConfigContext → RestaurantConfigContext → MenuItems.jsx → MenuItem → isItemAvailable).
- POS `web_available_time_starts/ends`: **null for ALL restaurants** currently. When POS populates this (POS-4), admin will see POS time as default in TimingEditor and can override.
- POS `available_time_starts/ends` (non-web variant): **Not mapped, not used.** Only `web_*` variant is read by the app.

---

## NEXT GATE

```
✅ Intake              — DONE
✅ Impact Analysis      — DONE (this document)
✅ Implementation Plan  — DONE (this document)
✅ Owner Decisions      — ALL RESOLVED
→  OWNER APPROVAL      ← CURRENT GATE
   Implementation
   Self-Test
   QA
   Bug Fix (if needed)
   Owner Smoke / Acceptance
```

---

*v2 — Updated 2026-06-17 with owner-confirmed decisions, mockup references, existing UI baseline, and dual-level channel override scope*
