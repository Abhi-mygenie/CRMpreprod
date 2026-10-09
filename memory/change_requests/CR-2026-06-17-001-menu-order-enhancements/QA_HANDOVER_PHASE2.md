# QA Handover — CR-2026-06-17-001 Phase 2

**From:** Implementation Agent (session 2026-06-17, continuation)
**To:** QA Agent
**Date:** 2026-06-17
**Scope:** APP-4 (station timing override) + APP-3 (channel overrides — category + item)

---

## Context — what this session did

A prior Implementation session had already landed:
- APP-4 end-to-end (backend field, AdminConfigContext default, RestaurantConfigContext exposure, customer-side `DiningMenu.isStationAvailable` override, admin UI `TimingEditor` in the selected-station header).
- APP-3 backend field, AdminConfigContext default, RestaurantConfigContext exposure, customer-side cascade in `channelEligibility.js`, customer-side filter call in `MenuItems.filterItems`.
- APP-3 `ChannelToggles` component definition and `CategoryCard` prop declarations.

It did **not** land the actual admin UI render for APP-3 — the pills were never displayed, parent never passed channel props/handlers, and no `setConfig` writers existed. An Investigation session confirmed this gap. Owner approved a narrow Implementation pass to close it.

This handover covers the gap-close edits made this session.

---

## What Was Implemented (this session)

### APP-3: Admin UI render for category + item channel overrides

**File changed:** `frontend/src/components/AdminSettings/MenuOrderTab.jsx`

1. Added two `setConfig` writers (after `resetItemTiming`, ~line 631):
   - `updateCategoryChannel(catId, channels)` — writes `config.channelOverrides.category[catId]`. If `channels` is empty/falsy, the sub-key is removed (no `{}` noise).
   - `updateItemChannel(itemId, channels)` — writes `config.channelOverrides.item[itemId]`. Same empty-cleanup.

2. Rendered `<ChannelToggles />` inside `CategoryCard`:
   - **Category header** (just before `TimingEditor`, ~line 229): wired to `categoryChannels` + `onCategoryChannelChange`.
   - **Item row** (just before item `TimingEditor`, ~line 296): wired to `itemChannels?.[item.id]` + `(c) => onItemChannelChange(item.id, c)`.

3. Wired four missing channel props at both `<CategoryCard />` call sites:
   - Multi-menu render (line ~846) — added `categoryChannels`, `itemChannels`, `onCategoryChannelChange`, `onItemChannelChange`.
   - Single-menu render (line ~982) — same four props.

**File changed:** `frontend/src/components/AdminSettings/MenuOrderTab.css`

4. Appended `.channel-toggles` and `.channel-pill` (with `.on`, `.off`, `.overridden`, `:hover`) styles so the D/T/Del pills render in the same visual register as the existing `.toggle-switch` pills.

**Code markers:** `// CR-2026-06-17-001 APP-3:`

---

## Cascade behavior (already in `channelEligibility.js`, unchanged this session)

```
Item admin override  → if set, wins
        ↓ not set
Category admin override → if set, wins
        ↓ not set
POS item flag (dinein / takeaway / delivery)  → default
```

Click cycle on a pill: **unset → OFF → ON → unset** (returning to POS default).
- Pill visual: green = on, red strikethrough = off, ring border = explicit admin override.

---

## Self-Test Results

| # | Test | Result | Evidence |
|---|---|---|---|
| 1 | Code compiles | PASS | `webpack compiled with 1 warning` — pre-existing exhaustive-deps warning in unrelated files (OrderSuccess, Profile, ReviewOrder). No new warnings/errors. |
| 2 | No new lint errors introduced | PASS | Lint shows 4 blocking issues in the file (L105, L476, L1093×2) — all are **pre-existing** patterns, just line-shifted because new code was added above them. Identical list reported by INVESTIGATION before edits. |
| 3 | Scope locked | PASS | `git diff --stat HEAD` → only MenuOrderTab.jsx and MenuOrderTab.css modified, +108 lines / -0. |
| 4 | Wiring trace (parent → CategoryCard → ChannelToggles → handler → setConfig → config) | PASS | grep confirms all 4 props pass through both call sites and feed back to `updateCategoryChannel` / `updateItemChannel`. |
| 5 | Empty-cleanup | PASS | Writers `delete` the per-id sub-key when `channels` is empty, preventing accumulation of `{}` entries in `config.channelOverrides.category` / `.item`. |
| 6 | Customer cascade reads new fields | PASS | `MenuItems.filterItems` (line 344-350) already reads `channelOverrides.category?.[categoryId]` and `channelOverrides.item?.[String(item.id)]` and feeds them to `isItemAllowedForChannel`. No further FE change needed for cascade. |

**Visual screenshot self-test:** not feasible in this environment — same limitation flagged in Phase 1 (no multi-menu admin login available against preprod). The single-menu admin path is fully wired by code review.

---

## Test Cases for QA

### APP-3 Acceptance (from IMPLEMENTATION_HANDOVER.md §10)

| # | Test | Steps | Expected |
|---|---|---|---|
| 1 | Pills render | Login as restaurant admin → Menu Order page → expand any category | D / T / Del pills visible on category header AND on each item row |
| 2 | Initial state matches POS | First open with no override saved | All pills show green "on" without ring border (POS default state) |
| 3 | Category-level block (Takeaway) | Toggle category Takeaway pill → OFF → Save | Pill shows red strikethrough + ring border. Customer opens menu with `?orderType=takeaway` → all items in that category hidden. |
| 4 | Category override doesn't affect other channels | After step 3, customer opens menu with `?orderType=dinein` | All items in that category still visible (only takeaway was blocked). |
| 5 | Item-level block (Delivery) | Toggle one item's Delivery pill → OFF → Save | Pill shows red strikethrough. Customer on delivery → that one item hidden; other items in category still shown. |
| 6 | Item override wins over category | Category Delivery = OFF; one item Delivery = ON → Save | Customer on delivery → that one item still shows even though category is blocked. Other items in category remain hidden. |
| 7 | Cycle: unset → OFF → ON → unset | Click same pill 3 times | First click sets OFF (red strikethrough + ring), second sets ON (green + ring), third clears the override (green, no ring — back to POS). |
| 8 | No override = POS default | All pills cleared (no ring) | Customer behavior identical to pre-CR. POS `dinein`/`takeaway`/`delivery=No` items still hidden by item flag, all others shown. |
| 9 | Empty-cleanup persistence | Click pill to OFF then back to unset → save → reload admin page | `config.channelOverrides.category[catId]` (or `.item[itemId]`) is gone, not stored as `{}`. |
| 10 | Multi-menu path still works | If a multi-menu restaurant admin login is available | Same pill behavior under a selected station — expand category, see pills, toggle, persist. |

### APP-4 Acceptance (carryover from prior session — please re-verify in this session because Phase 2 is the gate)

| # | Test | Steps | Expected |
|---|---|---|---|
| 11 | Station timing pill renders | Admin (multi-menu restaurant) → Menu Order → select a station | TimingEditor pill shown in the selected-station header. |
| 12 | POS timing fallback | No admin override set | Customer DiningMenu uses POS `openingTime`/`closingTime` to gate station. |
| 13 | Admin override wins | Set custom start/end on a station → save → reload customer DiningMenu | Station availability uses admin time, not POS. |
| 14 | Reset clears override | Click reset on station timing pill → save | `config.stationTimings[stationId]` removed; customer falls back to POS time. |

### Regression — Phase 1 (must still pass)

| # | Test | Steps | Expected |
|---|---|---|---|
| 15 | APP-1 default sort | Customer menu for restaurant 478 | Items within categories in `food_order` ascending order. |
| 16 | APP-1 admin custom still wins | Admin sets custom order → save → check customer | Custom order, not `food_order`. |
| 17 | APP-2 station drag-drop | Multi-menu admin → drag station pills → save → reload customer DiningMenu | Stations in admin-set order. |
| 18 | Timing pills still work | Category + item TimingEditor pills | Unchanged behavior on save/reset. |
| 19 | Visibility toggle still works | Category/item ToggleSwitch | Unchanged. |

### Credentials for Testing

- Admin 478 (18march): `owner@18march.com` / credentials in `.env`
- Admin 698 (Cafe Flora): `owner@cafeflora.com` / credentials in `.env`
- Multi-menu (716 Hyatt) admin: not available in this preprod DB — APP-2/APP-4/APP-3-station-path checks will be code-review-only unless QA has another multi-menu account.

---

## Files NOT touched this session (verified via `git diff --stat`)

`AuthContext.jsx`, `CartContext.js`, `ReviewOrder.jsx`, `orderAccessPolicy.js`, `orderService.ts`, `LandingPage.jsx`, `App.js`, `useMenuData.js`, `itemAvailability.js`, `RestaurantConfigContext.jsx`, `AdminConfigContext.jsx`, `DiningMenu.jsx`, `MenuItems.jsx`, `channelEligibility.js`, `backend/server.py`.

Only two files changed: `MenuOrderTab.jsx` and `MenuOrderTab.css`.

---

## Phase 2 Exit Gate

```
[✅] 1. APP-4 and APP-3 implemented per plan (APP-3 admin UI render closed this session)
[✅] 2. Code markers added (// CR-2026-06-17-001 APP-3: …)
[✅] 3. Build/compile clean (webpack compiled with 1 pre-existing warning)
[✅] 4. Self-test: code-level verification + cascade trace
[⚠️] 5. Phase 1 items still working — code unchanged, but live regression deferred to QA
[✅] 6. No files outside the WILL CHANGE list were modified
[✅] 7. CR.md status updated to IMPLEMENTED (this session)
[✅] 8. QA handover written (this document)
```

**Open action item for QA:** also confirm Phase 1 (APP-1 / APP-2) still passes — no Phase 1 QA report exists on disk, only the QA handover from the prior session. Treat as a fresh Phase 1+2 regression.

**STOP — awaiting QA pass.**
