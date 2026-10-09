# Implementation Handover — CR-2026-06-17-001

**From:** Planning Agent (session 2026-06-17)  
**To:** Implementation Agent  
**Date:** 2026-06-17  
**Status:** Owner approval pending → implement once approved  

---

## 1. WHAT TO IMPLEMENT — PHASED

### Phase 1 (implement now)

| Order | ID | Summary | Risk |
|---|---|---|---|
| 1st | **APP-1** | Sort items by `food_order` ascending (0s to end) as default when admin hasn't set custom order | MEDIUM |
| 2nd | **APP-2** | Wire drag-drop reorder for station/menu pills in admin (backend code exists, UI not wired) | MEDIUM |

**After Phase 1:** Self-test both items → write QA handover → STOP. Wait for QA pass before Phase 2.

### Phase 2 (implement after Phase 1 QA pass)

| Order | ID | Summary | Risk |
|---|---|---|---|
| 3rd | **APP-4** | Show POS station timing in admin + allow override (new config field `stationTimings`) | MEDIUM |
| 4th | **APP-3** | Channel override toggles (D/T/Del) at category AND item level (new config field `channelOverrides`) | HIGH |

**After Phase 2:** Self-test both items → write QA handover → STOP.

### Do NOT implement
- APP-5 or APP-6 — parked, blocked by POS team.

---

## 2. DOCUMENTS TO READ BEFORE CODING

Read in this order:

1. **Operating system:** `/app/memory/control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` — especially Section 6 (high-risk files), Section 8 (state/storage rules), Section 12 (do-not-do rules)
2. **CR registration:** `/app/memory/change_requests/CR-2026-06-17-001-menu-order-enhancements/CR.md`
3. **Implementation plan (PRIMARY):** `/app/memory/change_requests/CR-2026-06-17-001-menu-order-enhancements/IMPACT_ANALYSIS.md` — contains exact file changes, line numbers, implementation steps, verification matrix per item
4. **POS payload reference:** `/app/memory/change_requests/INV-2026-06-17-002-menu-order-investigation/PAYLOAD_MAPPING.md` — 71 fields per item, what comes from POS, what admin can override
5. **Default ordering analysis:** `/app/memory/change_requests/INV-2026-06-17-002-menu-order-investigation/DEFAULT_ORDERING.md` — explains why `food_order` matters and which restaurants have it

---

## 3. FILES YOU WILL CHANGE (7 files)

| File | What to change | Items |
|---|---|---|
| `frontend/src/pages/MenuItems.jsx` | Add `food_order` sort (APP-1), add channel override filter (APP-3) | APP-1, APP-3 |
| `frontend/src/components/AdminSettings/MenuOrderTab.jsx` | Sort items by `food_order` in fetch (APP-1), wrap station pills in DndContext (APP-2), add TimingEditor to station header (APP-4), add D/T/Del toggle pills to category cards and item rows (APP-3) | ALL |
| `frontend/src/utils/channelEligibility.js` | Modify `isItemAllowedForChannel` to accept admin override (category + item) | APP-3 |
| `frontend/src/context/AdminConfigContext.jsx` | Add `stationTimings: {}` and `channelOverrides: {}` to defaults | APP-3, APP-4 |
| `frontend/src/context/RestaurantConfigContext.jsx` | Expose `stationTimings` and `channelOverrides` | APP-3, APP-4 |
| `frontend/src/pages/DiningMenu.jsx` | Use admin `stationTimings` before POS timing in `isStationAvailable` | APP-4 |
| `backend/server.py` | Add `stationTimings: Optional[dict] = None` and `channelOverrides: Optional[dict] = None` to `AppConfigUpdate` model | APP-3, APP-4 |

---

## 4. FILES YOU MUST NOT TOUCH

| File | Why |
|---|---|
| `AuthContext.jsx` | CRITICAL risk per addendum. No auth changes in this CR. |
| `CartContext.js` | HIGH risk. No cart changes. |
| `ReviewOrder.jsx` | CRITICAL risk. No order flow changes. |
| `orderAccessPolicy.js` | No QR/access changes. |
| `orderService.ts` | No order API changes. |
| `LandingPage.jsx` | No landing changes. |
| `App.js` | Do NOT reorder providers (do-not-do rule #2). |
| `useMenuData.js` | Already carries `food_order` (line 109) and all channel fields (lines 97-99). No changes needed. |
| `itemAvailability.js` | Timing logic unchanged. |
| Any localStorage keys | Do-not-do rule #1. |

---

## 5. KEY CODE LOCATIONS

### APP-1 (food_order sort)
- `MenuItems.jsx` line ~753-777: Item ordering block. Add sort AFTER this block when `itemOrder.length === 0`.
- `MenuOrderTab.jsx` line ~344-350: Items fetched from POS. Sort by `food_order` here.
- `useMenuData.js` line 109: Already maps `food_order: Number(item.food_order || 0)` — no change needed.

### APP-2 (station drag-drop)
- `MenuOrderTab.jsx` line 584: `handleStationDragEnd` — EXISTS, just not wired to UI.
- `MenuOrderTab.jsx` line 482: `updateStationConfig` — EXISTS, saves to `menuOrder.stationOrder`.
- `MenuOrderTab.jsx` lines 626-648: Station pills render — WRAP in DndContext + SortableContext.
- `DiningMenu.jsx` lines 62-83: Already reads `menuOrder.stationOrder` and applies it. No change needed.

### APP-4 (station timing)
- `MenuOrderTab.jsx` lines 650-677: Selected station header — ADD TimingEditor here.
- `MenuOrderTab.jsx` line 91: `TimingEditor` component — already built, reuse it.
- Station data has `openingTime` and `closingTime` from POS (via `useStations` hook in `useMenuData.js` lines 246-265).
- `DiningMenu.jsx` line 95: `isStationAvailable` — add admin override check before POS timing check.

### APP-3 (channel overrides)
- `channelEligibility.js` line 36: `isItemAllowedForChannel` — modify signature to accept admin overrides.
- `MenuItems.jsx` line 348: Channel filter call — pass `channelOverrides` here.
- `MenuOrderTab.jsx` line 136: `CategoryCard` component — add D/T/Del toggles to header.
- `MenuOrderTab.jsx` line 248: Item row — add D/T/Del toggles per item.
- POS sends `dinein`, `takeaway`, `delivery` per item (mapped at `useMenuData.js` lines 97-99).

---

## 6. CONFIG SCHEMA ADDITIONS

### backend/server.py — AppConfigUpdate model (line ~197)

Add two new fields:
```python
stationTimings: Optional[dict] = None    # {"stationId": {"start": "HH:MM", "end": "HH:MM"}}
channelOverrides: Optional[dict] = None  # {"category": {"catId": {"dinein": bool, ...}}, "item": {"itemId": {"dinein": bool, ...}}}
```

### AdminConfigContext defaults (line ~113)
```js
stationTimings: {},
channelOverrides: {},
```

### RestaurantConfigContext (line ~447)
```js
stationTimings: config.stationTimings || {},
channelOverrides: config.channelOverrides || {},
```

---

## 7. CHANNEL OVERRIDE PRIORITY CASCADE

```
Item admin override  →  if set, wins
         ↓ not set
Category admin override  →  if set, wins
         ↓ not set
POS item flag (dinein/takeaway/delivery)  →  default
```

Category toggle OFF for a channel → hides ALL items in that category for that channel.  
Item toggle can override category (e.g., category=OFF for delivery, but specific item=ON for delivery).

---

## 8. VISUAL MOCKUPS

| Mockup | URL |
|---|---|
| Category level — channel toggles | https://static.prod-images.emergentagent.com/jobs/9c5cca4c-9a94-4ae7-a88e-68dd84405d1d/images/dd08d8e843cf08b0858083d99384778fab8154337740e48935987623f0d9b5fd.png |
| Item level — channel toggles | https://static.prod-images.emergentagent.com/jobs/9c5cca4c-9a94-4ae7-a88e-68dd84405d1d/images/4dc31587988c113a0b6c9d03274660a5df276d04101732a2eb0d05710c9b712d.png |
| Station pills — drag + timing | https://static.prod-images.emergentagent.com/jobs/9c5cca4c-9a94-4ae7-a88e-68dd84405d1d/images/f4adeac7217cb39087ddf429624a63c4218e26cc58b44d1a99400c19eb2f0094.png |

---

## 9. ENVIRONMENT NOTES

- Backend runs on port 8001 (supervisor). Restart after `server.py` schema changes.
- Frontend uses `yarn` (NOT npm). Hot reload for `.jsx` changes.
- `menuOrder` is stored as `Optional[dict]` — freeform JSON, no strict schema validation on backend.
- Config endpoint: `GET /api/config/{restaurant_id}` (public), `PUT /api/config/` (JWT restaurant role).
- POS API base: `https://preprod.mygenie.online/api/v1` — called directly from frontend, not proxied.
- Test restaurants with `food_order` populated: **478** (18march), **689** (Kunafa Mahal).
- Test restaurants with all `food_order=0`: **541** (Palm House), **698** (Cafe Flora), **716** (Hyatt).
- Admin login for testing: `owner@cafeflora.com` / credentials in `.env` files.

---

## 10. VERIFICATION AFTER IMPLEMENTATION

Run these checks per item:

### APP-1
```
1. Open customer menu for restaurant 478 → items should be in food_order ascending order
2. Open customer menu for restaurant 541 → no change (all food_order=0)
3. Admin sets custom drag order → custom order wins over food_order
```

### APP-2
```
1. Login as admin (multi-menu restaurant) → Menu Order page
2. Drag station pills to reorder → verify save
3. Open customer DiningMenu → verify station order matches admin setting
4. Click-to-select and visibility toggle still work
```

### APP-4
```
1. Login as admin (multi-menu restaurant) → Menu Order page
2. Select a station → verify POS timing shows (e.g., "7:00 - 11:00")
3. Click timing → set custom time → save
4. Verify reset button clears admin override
5. Open customer DiningMenu → station availability uses admin timing
```

### APP-3
```
1. Login as admin → Menu Order → expand a category
2. Category-level: toggle Takeaway OFF → save
3. Customer on takeaway order → items in that category hidden
4. Item-level: toggle one item Delivery OFF → save
5. Customer on delivery → that item hidden, others visible
6. Item override: category=OFF for delivery, item=ON for delivery → item shows on delivery
7. No override → POS flags used (unchanged behavior)
```

---

## 11. WHAT NOT TO DO (from Alpha v0.1 addendum)

1. DO NOT rename any localStorage keys
2. DO NOT reorder context providers in App.js
3. DO NOT change `payment_method: "cash_on_delivery"` hardcoding
4. DO NOT remove Restaurant 716 hardcoded logic in ReviewOrder.jsx
5. DO NOT use `CI=true` with `yarn build`
6. DO NOT change the `isOn()` helper default behavior in RestaurantConfigContext
7. DO NOT improvise beyond the plan — if scope expands, stop and ask owner

---

## 12. EXIT GATE CHECKLIST

### Phase 1 exit (APP-1 + APP-2)
```
[ ] 1. APP-1 and APP-2 implemented per plan
[ ] 2. Code markers added (// CR-2026-06-17-001 APP-1/APP-2: description)
[ ] 3. Build/compile clean (yarn build without CI=true)
[ ] 4. Self-test: APP-1 and APP-2 verification checks pass
[ ] 5. No files outside the Phase 1 change list were modified
[ ] 6. QA handover written for Phase 1
[ ] 7. STOP — do not start Phase 2 until QA passes Phase 1
```

### Phase 2 exit (APP-4 + APP-3)
```
[ ] 1. APP-4 and APP-3 implemented per plan
[ ] 2. Code markers added (// CR-2026-06-17-001 APP-3/APP-4: description)
[ ] 3. Build/compile clean
[ ] 4. Self-test: APP-4 and APP-3 verification checks pass
[ ] 5. Phase 1 items still working (regression)
[ ] 6. No files outside the WILL CHANGE list were modified
[ ] 7. CR.md status updated to IMPLEMENTED
[ ] 8. QA handover written for Phase 2
```

---

*End of Implementation Handover*
