# CR-2026-06-17-002 — Channel Preview + Channel-Control Redesign in Menu Order Admin (APP-7 + APP-9)

**ID:** CR-2026-06-17-002
**Classification:** Change Request (two items, both inside the same screen)
**Origin:** Follow-up to CR-2026-06-17-001 (Menu Order Enhancements). APP-7 suggested by main agent at end of CR-001 closure; APP-9 raised by owner after seeing live screenshot — current pills are too small and active/inactive states are not visually distinguishable.
**Severity:** P2 (admin-UX quality)
**Risk:** LOW
**Status:** IMPLEMENTED — all 3 items shipped, self-test passed, awaiting QA
**Priority (within this CR):** APP-9 first (fixes a real usability defect), then APP-7 (additive enhancement)

---

## Problem

Two distinct but co-located admin-UX problems on the Menu Order page:

**Problem A (APP-9, defect):** the D/T/Del pills shipped in CR-2026-06-17-001 are too small (≈28×22 px), the labels are inconsistent ("D" + "T" + "Del"), and the three semantic states (POS-default vs admin-ON vs admin-OFF) are visually almost identical. Live screenshot from owner shows four rows of pills that look identical — admins cannot tell at a glance which channels are active for which category/item.

**Problem B (APP-7, enhancement):** after admin sets a channel override, the only way to verify the effect is to open the customer URL with `?orderType=...`. This forces tab switching and re-login during bulk-edit sessions (promo configuration).

Both fixes live in the same component (`MenuOrderTab.jsx` + `.css`). Combining into one CR avoids two rounds of churn on the same file.

---

## Goals

| Goal | Item |
|---|---|
| Make the per-channel state visible at a glance and clickable at a touch-target size | APP-9 |
| Let admin preview the effect of channel overrides without leaving the page | APP-7 |

---

## Items

| Item | Description | Severity | Risk | Status |
|---|---|---|---|---|
| **APP-9** | Replace the current 3-state pill UI with **status chips: icon + full label + state color** (Option C from owner's decision). ~80 px chip width, 26 px height, 3 distinct visual treatments for POS-default / admin-ON / admin-OFF. | P2 | LOW | IMPLEMENTED |
| **APP-7** | "Preview as" channel selector in the Menu Order toolbar — mutes rows the customer cascade would hide. Local-only state, reuses `channelEligibility.isItemAllowedForChannel`. | P2 | LOW | IMPLEMENTED |
| **APP-10** | Save Changes discoverability fix — (a) toast on inline ✓ click of TimingEditor: "Click Save Changes at the top to persist", (b) sticky "Unsaved changes — [Save Now]" banner appears below the page title while `isDirty=true`. Prevents the silent-data-loss trap that hit fivestar. | P1 | LOW | IMPLEMENTED |

---

## Owner Decisions

| # | Question | Decision | Date |
|---|---|---|---|
| 1 | APP-9 visual style | **Option C — status chips (icon + label + state color)** | 2026-06-17 |
| 2 | Plan APP-7 + APP-9 together vs separate CRs | **Together — single CR, single touch on `MenuOrderTab.jsx`** | 2026-06-17 |
| 3 | APP-7 preview state persists across reloads? | **NO — reset to "Admin view" on load** (assumed; flip with one word if you want localStorage persistence) | 2026-06-17 (default) |
| 4 | APP-7 hidden-row treatment | **Dim with badge** (40% opacity + "Hidden on <ch>" badge); rows stay editable. (assumed) | 2026-06-17 (default) |
| 5 | APP-7 scope | **Channel cascade only** — not category-visibility, not timing. (assumed) | 2026-06-17 (default) |
| 6 | APP-7 access | **All admin roles** (read-only feature). (assumed) | 2026-06-17 (default) |

If owner wants any of #3 / #4 / #5 / #6 changed before implementation, one word flips them.

---

## Acceptance Criteria

### APP-9 (channel-control redesign)

A1. Each channel chip is ≥ 70 px wide × ≥ 24 px tall (touch-target compliant).
A2. Full labels: **Dine-in**, **Takeaway**, **Delivery** — no abbreviations.
A3. Three visual states, each distinguishable by **color + icon + border** (not color alone — passes basic a11y heuristics):
   - POS default: light gray background, gray ✓ or ✗ icon (based on POS flag), no border. Tooltip: `Allowed by POS (no admin override)` or `Blocked by POS (no admin override)`.
   - Admin ON: green background, white ✓ icon, green border, small "·" dot in corner. Tooltip: `Admin override: Allowed`.
   - Admin OFF: red background, white ✗ icon, red border, small "·" dot in corner. Tooltip: `Admin override: Blocked`.
A4. Click cycle stays identical to today: **POS-default → admin-OFF → admin-ON → POS-default**. (No re-training.)
A5. All existing `data-testid`s preserved — `channel-toggles-<id>`, `channel-dinein-<id>`, `channel-takeaway-<id>`, `channel-delivery-<id>` — so iter_7 QA suite still passes.
A6. Empty-cleanup logic in `updateCategoryChannel` / `updateItemChannel` unchanged.
A7. Customer-side cascade behavior bit-identical — `channelEligibility.js` and customer files untouched.
A8. Works the same in CategoryCard's category-header row AND in the item row.

### APP-7 (channel preview)

B1. New control `[data-testid="preview-channel-select"]` in the Menu Order page toolbar (left of "Save Changes"), default value "Admin view".
B2. Selecting Dine-in / Takeaway / Delivery applies `data-preview-hidden="true"` and CSS `.preview-muted` (40% opacity + "Hidden on <channel>" badge) to:
   - Every category row whose `channelOverrides.category[catId].<channel] === false`.
   - Every item row whose effective cascade (`isItemAllowedForChannel`) returns `false`.
B3. Even when muted, every interactive control inside the row stays clickable — admin can still click the chips, drag-handle, expand chevron, eye toggle, timing editor.
B4. Editing a chip while previewing updates the muting in < 100 ms (pure derived state, no save round-trip).
B5. Save while previewing posts only the real admin fields — no `previewChannel` ever lands in `/api/config/`. Verified via `curl GET /api/config/<rid>`.
B6. Page reload returns preview to "Admin view" (per Decision #3).
B7. Customer-side bundle is untouched (verified via `git diff` scope).

---

## Non-Goals (explicit scope guardrails)

- Not adding new fields to `channelOverrides` schema.
- Not changing backend `AppConfig` model.
- Not modifying `channelEligibility.js` logic.
- Not touching `MenuItems.jsx`, `DiningMenu.jsx`, `RestaurantConfigContext.jsx`, `AdminConfigContext.jsx`, `AdminMenuPage.jsx`, `server.py`, or any protected file (`ReviewOrder.jsx`, `AuthContext`, `CartContext`, `App.js`).
- Not adding station-timing preview (parked as future APP-8).
- Not adding multi-channel side-by-side compare view.
- Not exposing preview state to backend, localStorage, or any other admin session.
- Not changing the 3-state cycle semantics — chips look different, behave the same.

---

## Related Documents

| Document | Path |
|---|---|
| Impact Analysis & Implementation Plan | `/app/memory/change_requests/CR-2026-06-17-002-channel-preview-in-admin/IMPACT_ANALYSIS.md` |
| Parent CR (channelOverrides + pill v1) | `/app/memory/change_requests/CR-2026-06-17-001-menu-order-enhancements/` |
| Reused cascade function | `/app/frontend/src/utils/channelEligibility.js` (`isItemAllowedForChannel`) |
| Existing pill component being replaced | `MenuOrderTab.jsx` L135-169 (`ChannelToggles`) |

---

## Blast Radius

| Area | Impact |
|---|---|
| Customer menu display | **None** — no file in customer render path is touched |
| Admin Menu Order page UI | Visual refresh of channel chips + one new preview selector |
| Backend config schema | **None** |
| RestaurantConfigContext / AdminConfigContext | **None** |
| Protected files | **None** |
| Files in scope | `frontend/src/components/AdminSettings/MenuOrderTab.jsx`, `MenuOrderTab.css`, `frontend/src/layouts/AdminLayout.jsx`, `frontend/src/layouts/AdminLayout.css` (APP-10 sticky banner + toast) |
| Existing data-testids | All preserved — no QA suite churn |
| Existing channelOverrides data | Read/written via the same writers; data shape unchanged |

---

*Registered: 2026-06-17 | Last updated: 2026-06-17 | Stage: PLANNING COMPLETE*
ead/written via the same writers; data shape unchanged |

---

*Registered: 2026-06-17 | Last updated: 2026-06-17 | Stage: PLANNING COMPLETE*
