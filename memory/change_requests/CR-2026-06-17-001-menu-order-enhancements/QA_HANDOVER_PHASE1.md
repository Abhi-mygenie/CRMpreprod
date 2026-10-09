# QA Handover — CR-2026-06-17-001 Phase 1

**From:** Implementation Agent  
**To:** QA Agent  
**Date:** 2026-06-17  
**Scope:** APP-1 (food_order sort) + APP-2 (station drag-drop reorder)

---

## What Was Implemented

### APP-1: Sort items by `food_order` ascending (0s to end)

**Files changed:**
- `frontend/src/pages/MenuItems.jsx` — added `food_order` sort when no admin `itemOrder` exists (after line 777)
- `frontend/src/components/AdminSettings/MenuOrderTab.jsx` — added `foodOrder` field to item fetch + sort in both single-menu (line ~344) and multi-menu (line ~376) fetch functions

**Code markers:** `// CR-2026-06-17-001 APP-1:`

**Behavior:**
- When admin has NOT set custom item order: items sort by `food_order` ascending, items with `food_order=0` go to end
- When admin HAS set custom order: admin order takes priority (unchanged behavior)
- Only sorts when at least one item has `food_order > 0` (avoids unnecessary sort for restaurants with all 0s)

### APP-2: Wire station/menu drag-drop reorder

**Files changed:**
- `frontend/src/components/AdminSettings/MenuOrderTab.jsx` — wrapped station pills in DndContext + SortableContext, made each pill a SortableItem with drag handle
- `frontend/src/components/AdminSettings/MenuOrderTab.css` — added styles for `.station-drag-handle`, `.station-pill-btn`, `.station-drag-overlay`, `.dragging`

**Code markers:** `// CR-2026-06-17-001 APP-2:`

**Behavior:**
- Station pills now have a drag handle (≡ icon) on the left
- Dragging reorders stations — saves to `menuOrder.stationOrder`
- Click-to-select still works via separate button area
- Visibility toggle unchanged
- Backend already supports `menuOrder.stationOrder` — no backend changes needed

---

## Self-Test Results

| Test | Result | Evidence |
|---|---|---|
| APP-1: food_order sort logic | PASS | POS returns [0,15,42,43,65,92,93] → app sorts to [15,42,43,65,92,93,0] |
| APP-1: admin order takes priority | PASS | Code path verified: `if (itemOrder.length > 0)` runs admin sort, else food_order sort |
| APP-1: no change when all food_order=0 | PASS | `hasFoodOrder` check prevents unnecessary sort |
| APP-1: admin Menu Order shows sorted baseline | PASS | Screenshot shows 18march items in food_order order |
| APP-2: code compiles | PASS | `webpack compiled with 1 warning` (pre-existing warning) |
| APP-2: station DnD wired to existing handlers | PASS | `handleStationDragEnd` (line 584) connected to DndContext |
| APP-2: no backend changes needed | PASS | `menuOrder.stationOrder` already accepted by backend |

---

## Test Cases for QA

### APP-1 Test Cases

| # | Test | Steps | Expected |
|---|---|---|---|
| 1 | Food order sort works for 478 | Navigate to customer menu for restaurant 478 | Items within categories appear in `food_order` ascending order (not POS response order) |
| 2 | No change for 541 | Navigate to customer menu for restaurant 541 | Items appear in same order as before (all `food_order=0`) |
| 3 | Admin custom order wins | Login as admin → Menu Order → drag items to custom order → save → check customer menu | Items appear in admin-set order, not `food_order` order |
| 4 | Admin baseline shows food_order | Login as admin 478 → Menu Order → expand a category | Items shown in `food_order` ascending order |
| 5 | New POS items appear at end | If POS adds new item with `food_order=0` | New item appears at end of category (after sorted items) |

### APP-2 Test Cases

| # | Test | Steps | Expected |
|---|---|---|---|
| 1 | Station pills have drag handles | Login as admin for multi-menu restaurant → Menu Order | Each station pill shows ≡ drag handle on left |
| 2 | Drag to reorder works | Drag a station pill to new position | Station reorders, position saved |
| 3 | Click to select still works | Click on a station pill (not the drag handle) | Station content loads (categories shown) |
| 4 | Visibility toggle works | Toggle station visibility | Station shows/hides with badge |
| 5 | Save persists | Reorder stations → Save → reload page | Stations stay in new order |
| 6 | Customer DiningMenu reflects order | After admin reorders stations → customer visits DiningMenu | Stations shown in admin-set order |

### Credentials for Testing

- Admin 478 (18march): `owner@18march.com` / `Qplazm@10` — has `food_order` data, single-menu
- Admin 698 (Cafe Flora): `owner@cafeflora.com` / `Qplazm@10` — no `food_order`, single-menu
- Multi-menu restaurant needed for APP-2 station testing: 716 (Hyatt) — but `owner@hyatt.com` not in this DB

### APP-2 Testing Limitation

Station drag-drop (APP-2) can only be tested on multi-menu restaurants. No multi-menu restaurant admin login is available in this preprod environment. Code review confirms correct wiring:
- `handleStationDragEnd` (existing, line 584) → connected to `DndContext`
- `updateStationConfig` (existing, line 482) → saves to `menuOrder.stationOrder`
- `DiningMenu.jsx` (existing, lines 62-83) → already reads `stationOrder`

---

## Files NOT Changed (verified)

AuthContext.jsx, CartContext.js, ReviewOrder.jsx, orderAccessPolicy.js, orderService.ts, LandingPage.jsx, App.js, useMenuData.js, itemAvailability.js, server.py — all untouched.

---

## Phase 1 Exit Gate

```
[✅] 1. APP-1 and APP-2 implemented per plan
[✅] 2. Code markers added (// CR-2026-06-17-001 APP-1/APP-2)
[✅] 3. Build/compile clean (webpack compiled with 1 pre-existing warning)
[✅] 4. Self-test: APP-1 verification checks pass
[⚠️] 5. APP-2: cannot fully screenshot-test (no multi-menu admin in preprod) — code review confirms correct wiring
[✅] 6. No files outside Phase 1 change list modified
[✅] 7. QA handover written (this document)
```

**STOP — Phase 2 not started. Awaiting QA pass.**
