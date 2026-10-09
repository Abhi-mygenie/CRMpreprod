# CR-2026-06-17-002 — Impact Analysis & Implementation Plan

**Stage:** Impact Analysis + Implementation Plan
**Risk:** LOW
**Status:** IMPLEMENTED + QA PASSED (iteration 8, 2026-06-17)
**Reuses:** `channelEligibility.isItemAllowedForChannel` (Phase 2 QA-passed), CategoryCard prop wiring (already in place)
**Files in scope:** `frontend/src/components/AdminSettings/MenuOrderTab.jsx`, `frontend/src/components/AdminSettings/MenuOrderTab.css`
**Files NOT in scope (verified by intent):** every other file in the repo

---

## PROBLEM 1: APP-9 — channel chips are unreadable

### Current behavior (shipped in CR-2026-06-17-001 Phase 2)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ≡  Cake   7/7 items     [D][T][Del]   ⏰ 24 hrs   🟢 Visible   >       │
│ ≡  Soup  11/11 items    [D][T][Del]   ⏰ 24 hrs   🟢 Visible   >       │
│ ≡  Mains  9/9 items     [D][T][Del]   ⏰ 24 hrs   🟢 Visible   >       │
└─────────────────────────────────────────────────────────────────────────┘
```

Each pill is ≈ 28×22 px. The on/off/admin-override states use color + an inset ring, which at that size and font weight register as "all three rows look the same" — confirmed by owner screenshot.

### Failure modes observed

| # | Failure | Evidence |
|---|---|---|
| F1 | Three different semantic states render almost identically at glance distance | Owner screenshot — 4 category rows look identical despite differing data |
| F2 | "D" + "T" + "Del" are visually unbalanced (1 + 1 + 3 chars) and not internationalizable | Static inspection of `ChannelToggles` L138-142 |
| F3 | Touch target below Apple HIG (44×44) / Material (48×48 dp) | CSS L385 `min-width: 28px; padding: 4px 8px` |
| F4 | "Admin override" indicator is a 1 px inset ring at small size — invisible in screenshots | CSS L425-428 |
| F5 | Color is the only positive vs negative signal — fails users with red-green color blindness | CSS L405-417 |

### Target behavior — Option C status chips

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ≡  Cake   7/7 items    [✓ Dine-in]  [✗ Takeaway]  [✓ Delivery]   ⏰ > │
│                          gray/POS    red/admin     green/admin           │
│                                                                          │
│ ≡  Soup  11/11 items   [✓ Dine-in]  [✓ Takeaway]  [✓ Delivery]   ⏰ > │
│                          all gray  /  all POS default                    │
│                                                                          │
│ ≡  Mains  9/9 items    [✓ Dine-in]  [✓ Takeaway]  [✗ Delivery]   ⏰ > │
│                          gray/POS    gray/POS      red/admin             │
└─────────────────────────────────────────────────────────────────────────┘
```

### Visual spec

| State | Background | Text + Icon | Border | Corner dot | Tooltip |
|---|---|---|---|---|---|
| POS default — Allowed | `#f3f4f6` (gray-100) | `#374151` ✓ | none | — | `Allowed by POS (no admin override)` |
| POS default — Blocked | `#f3f4f6` (gray-100) | `#6b7280` ✗ | none | — | `Blocked by POS (no admin override)` |
| Admin override — Allowed | `#16a34a` (green-600) | `#ffffff` ✓ | `2px solid #15803d` | white `·` | `Admin override: Allowed` |
| Admin override — Blocked | `#dc2626` (red-600) | `#ffffff` ✗ | `2px solid #b91c1c` | white `·` | `Admin override: Blocked` |

- Chip dimensions: `min-width: 96px; height: 28px; padding: 4px 12px; gap: 6px; border-radius: 14px; font-size: 13px; font-weight: 600;`.
- Icon size: `14px`, rendered with inline SVG (avoids font dependency).
- The corner dot is a 4 px circle in the top-right inside corner — disambiguates admin-override from POS-default without leaning entirely on color.

### Click model (unchanged)

`POS-default → admin-OFF → admin-ON → POS-default` — same 3-state cycle, same writer (`onChange`), same `setConfig` path. **All existing tests + QA suite continue to work unmodified.**

### Component change

`ChannelToggles` definition at `MenuOrderTab.jsx:135-169` is rewritten internally. **Public API (props: `channels`, `onChange`, `id`) is unchanged.** Parent call sites do not need to be updated.

### data-testid contract (unchanged)

```
channel-toggles-<id>        (wrapper)
channel-dinein-<id>          (chip 1)
channel-takeaway-<id>        (chip 2)
channel-delivery-<id>        (chip 3)
```

Where `<id>` is `cat-<catId>` or `item-<itemId>`. **iter_7 QA assertions remain valid.**

---

## PROBLEM 2: APP-7 — no inline preview of channel effect

### Current behavior

Admin sets channel override → has to open customer URL `/<rid>/menu?orderType=takeaway` in a new tab → re-login as customer → verify → return → adjust → repeat.

### Target behavior

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Menu Order                                                              │
│                                                                          │
│  Preview as: [ Admin view ▾ ]                            [ Save ]       │
│              ┌────────────────────────────┐                              │
│              │ Admin view (default)        │                             │
│              │ Dine-in customer            │                             │
│              │ Takeaway customer           │                             │
│              │ Delivery customer           │                             │
│              └────────────────────────────┘                              │
└─────────────────────────────────────────────────────────────────────────┘
```

When "Takeaway customer" is picked, every category/item that the cascade hides for takeaway gets `data-preview-hidden="true"` + `.preview-muted` (40% opacity + small badge `Hidden on takeaway`). Chips remain clickable for live adjustment.

### Local-state derivation (no backend coupling)

```js
// new state in MenuOrderTab
const [previewChannel, setPreviewChannel] = useState(null); // null = Admin view

// new pure helpers
const isItemMutedInPreview = (cat, item) => {
  if (!previewChannel) return false;
  return !isItemAllowedForChannel(
    previewChannel,
    { dinein: item.dinein, takeaway: item.takeaway, delivery: item.delivery },
    config.channelOverrides?.category?.[cat.id],
    config.channelOverrides?.item?.[String(item.id)]
  );
};

const isCategoryMutedInPreview = (cat) => {
  if (!previewChannel) return false;
  const catOverride = config.channelOverrides?.category?.[cat.id];
  return catOverride && catOverride[previewChannel] === false;
};
```

Category-mute semantics use **Option A from earlier discussion**: category is muted when its own explicit override is `false`; items inside it still receive their own mute calculation. So a category-OFF with one item-ON shows category muted + that one item un-muted — faithful to the cascade.

`previewChannel` is local `useState`. It never enters `setConfig`. No backend roundtrip. No localStorage (per Decision #3).

---

## IMPLEMENTATION PLAN — file-by-file

### `frontend/src/components/AdminSettings/MenuOrderTab.jsx` (only file with logic changes)

**Section A — Imports (top of file):**
```js
import { isItemAllowedForChannel } from '../../utils/channelEligibility';
```

**Section B — Replace `ChannelToggles` at L135-169 (APP-9):**

Internal redesign: tighter chip with icon-aware className mapping. Keeps `props.channels`, `props.onChange`, `props.id` contract. ~35 lines (vs current 35).

```jsx
const ChannelToggles = ({ channels, onChange, id, posFlags }) => {
  const channelSpecs = [
    { key: 'dinein',   label: 'Dine-in'   },
    { key: 'takeaway', label: 'Takeaway'  },
    { key: 'delivery', label: 'Delivery'  },
  ];

  const stateFor = (key) => {
    const adminVal = channels?.[key];
    const posAllowed = posFlags ? posFlags[key] !== false : true;
    if (adminVal === undefined || adminVal === null) {
      return { kind: 'pos', allowed: posAllowed };
    }
    return { kind: 'admin', allowed: adminVal === true };
  };

  const handleClick = (key) => {
    const cur = channels?.[key];
    let next;
    if (cur === undefined || cur === null) next = false;
    else if (cur === false) next = true;
    else next = undefined;

    const updated = { ...(channels || {}) };
    if (next === undefined) delete updated[key];
    else updated[key] = next;
    onChange(updated);
  };

  return (
    <div className="channel-chips" data-testid={`channel-toggles-${id}`}>
      {channelSpecs.map(({ key, label }) => {
        const s = stateFor(key);
        const cls = `channel-chip ${s.kind === 'pos' ? (s.allowed ? 'pos-on' : 'pos-off') : (s.allowed ? 'admin-on' : 'admin-off')}`;
        return (
          <button
            key={key}
            type="button"
            className={cls}
            onClick={(e) => { e.stopPropagation(); handleClick(key); }}
            title={
              s.kind === 'pos'
                ? `${s.allowed ? 'Allowed' : 'Blocked'} by POS (no admin override)`
                : `Admin override: ${s.allowed ? 'Allowed' : 'Blocked'}`
            }
            data-testid={`channel-${key}-${id}`}
          >
            <span className="chip-icon" aria-hidden="true">{s.allowed ? '✓' : '✗'}</span>
            <span className="chip-label">{label}</span>
            {s.kind === 'admin' && <span className="chip-dot" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
};
```

**Section C — Toolbar preview selector (APP-7) near the top of `MenuOrderTab` return JSX:**

```jsx
const [previewChannel, setPreviewChannel] = useState(null);
// ...
<div className="menu-order-toolbar">
  <label className="preview-channel-label">
    Preview as:
    <select
      data-testid="preview-channel-select"
      className="preview-channel-select"
      value={previewChannel || ''}
      onChange={(e) => setPreviewChannel(e.target.value || null)}
    >
      <option value="" data-testid="preview-channel-option-admin">Admin view</option>
      <option value="dinein" data-testid="preview-channel-option-dinein">Dine-in customer</option>
      <option value="takeaway" data-testid="preview-channel-option-takeaway">Takeaway customer</option>
      <option value="delivery" data-testid="preview-channel-option-delivery">Delivery customer</option>
    </select>
  </label>
  {/* existing Save button stays where it is */}
</div>
```

**Section D — Add new props to `CategoryCard`** so muting can be applied at row level:

- `previewChannel` (string or null)
- `isCategoryMuted` (boolean derived in parent)
- `isItemMuted(item)` (function)

Inside `CategoryCard`:
- Apply `data-preview-hidden="true"` + className `preview-muted` to the category header div when `isCategoryMuted` is true. Insert a small `<span className="preview-hidden-badge">Hidden on {previewChannel}</span>`.
- Same for each item row using `isItemMuted(item)`.

**Section E — Pass `posFlags` to `ChannelToggles` at both call sites** so it can render POS-default ✓/✗ correctly:

For category chips, `posFlags = null` (categories don't carry POS channel flags directly). Chip falls back to "allowed" — acceptable.
For item chips, `posFlags = { dinein: item.dinein, takeaway: item.takeaway, delivery: item.delivery }`.

This is a **new prop** but the existing tests do not assert on its absence, so backward-compatible.

### `frontend/src/components/AdminSettings/MenuOrderTab.css`

**Section F — Replace the existing `.channel-toggles` / `.channel-pill` block (lines ~900+) with the new chip styling. Approximate ~50 CSS lines, replacing ~47 from CR-001.**

```css
.menu-order-tab .channel-chips {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.menu-order-tab .channel-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 96px;
  height: 28px;
  padding: 4px 12px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  border: 1px solid transparent;
  border-radius: 14px;
  background: #f3f4f6;
  color: #374151;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s, transform 0.05s;
  position: relative;
}
.menu-order-tab .channel-chip:hover  { transform: translateY(-1px); }
.menu-order-tab .channel-chip:active { transform: translateY(0); }

.menu-order-tab .channel-chip .chip-icon  { font-size: 14px; line-height: 1; }
.menu-order-tab .channel-chip .chip-label { white-space: nowrap; }

.menu-order-tab .channel-chip.pos-on  { background: #f3f4f6; color: #374151; }
.menu-order-tab .channel-chip.pos-off { background: #f3f4f6; color: #6b7280; }

.menu-order-tab .channel-chip.admin-on  {
  background: #16a34a; color: #ffffff; border-color: #15803d;
}
.menu-order-tab .channel-chip.admin-off {
  background: #dc2626; color: #ffffff; border-color: #b91c1c;
}
.menu-order-tab .channel-chip .chip-dot {
  position: absolute;
  top: 4px;
  right: 6px;
  width: 4px;
  height: 4px;
  background: #ffffff;
  border-radius: 50%;
}

/* APP-7: preview muting */
.menu-order-tab .preview-muted { opacity: 0.4; }
.menu-order-tab .preview-muted .preview-hidden-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  background: #ffffff;
  border: 1px dashed #d1d5db;
  border-radius: 10px;
}
.menu-order-tab .preview-channel-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #6b7280;
}
.menu-order-tab .preview-channel-select {
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
}
```

### LOC estimate

| Section | File | Lines |
|---|---|---|
| A (import) | `MenuOrderTab.jsx` | +1 |
| B (rewrite ChannelToggles) | `MenuOrderTab.jsx` | ~35 (replaces existing 35) |
| C (toolbar selector) | `MenuOrderTab.jsx` | +15 |
| D (CategoryCard props + 2 muted blocks) | `MenuOrderTab.jsx` | +20 |
| E (posFlags wiring at 2 call sites × 2 chip slots = 4 spots) | `MenuOrderTab.jsx` | +4 |
| F (CSS rewrite + new) | `MenuOrderTab.css` | ~70 (replaces ~47) |

**Net delta: roughly +75 lines JSX, +25 lines CSS net (after replacing existing pill styles). Single focused commit.**

---

## RISK ANALYSIS

| Risk | Likelihood | Mitigation |
|---|---|---|
| Existing iter_7 QA assertions break | LOW | Public ChannelToggles API + data-testids preserved; assertions target `data-testid` not className. Re-running iter_7 suite is the first checkpoint. |
| posFlags new prop breaks parent that doesn't pass it | LOW | Chip falls back to `pos-on/✓` when `posFlags` is undefined (treated as allowed). Backwards-safe. |
| Preview state leaks into save payload | LOW | `previewChannel` is local `useState`, never touches `setConfig`. Tested by curl GET after Save. |
| Muting opacity makes admin click on muted item ambiguously | LOW | Pills + drag-handle + visibility toggle still 100% clickable inside a `.preview-muted` row. Tested manually in QA case B3. |
| Customer-side regression | NONE | No file in customer render path is touched. `git diff --stat` will show exactly 2 files. |
| Color-only state for color-blind users | LOW | Icon (✓ / ✗) + label text + border + corner dot all redundantly encode state. |
| 70 px wider chips overflow narrow viewports | MEDIUM | Chip set adds ~290 px. Existing Menu Order page is desktop-only per current product policy. If responsive support is needed later, chips can collapse to icon-only via media query — out of scope here. |
| ChannelToggles re-renders 1000× per drag | LOW | Already memo-friendly. `posFlags` derived inline does not break referential equality more than the existing setup. |

---

## ACCEPTANCE TESTS (for QA after IMPLEMENTATION)

### APP-9 (chip redesign)

| # | Test | Expected |
|---|---|---|
| 9-1 | Chip renders at correct size | Each `[data-testid^='channel-dinein-']` width ≥ 70 px, height ≥ 24 px (computedStyle). |
| 9-2 | Labels are full words | Chip text contains "Dine-in" / "Takeaway" / "Delivery". |
| 9-3 | POS-default state | A category with no channelOverrides shows chips with class `channel-chip pos-on` (or `pos-off` if POS blocked). No `chip-dot`. |
| 9-4 | Admin-OFF state | After 1 click: class becomes `channel-chip admin-off`, background red, icon ✗, has `chip-dot`. |
| 9-5 | Admin-ON state | After 2 clicks: class `channel-chip admin-on`, background green, icon ✓, has `chip-dot`. |
| 9-6 | Cycle returns to POS-default | After 3 clicks: class back to `channel-chip pos-on`, no dot. |
| 9-7 | iter_7 regression PASS | Existing QA test cases from iter_7 all still PASS (persistence, reload, empty-cleanup, item-level). |
| 9-8 | Tooltip per state | `title` attribute matches the table in IMPACT_ANALYSIS.md "Visual spec" section. |
| 9-9 | a11y | Chips have `type="button"`. Icons are `aria-hidden`. Label text is screen-readable. |

### APP-7 (preview)

| # | Test | Expected |
|---|---|---|
| 7-1 | Selector renders | `[data-testid='preview-channel-select']` visible in toolbar, default "Admin view". |
| 7-2 | No muting by default | No row has `data-preview-hidden`. |
| 7-3 | Category override muting | Set Cake takeaway=OFF, save, then pick "Takeaway customer" → Cake row has `data-preview-hidden="true"` + visible badge "Hidden on takeaway". |
| 7-4 | Other channels unaffected | Same state, pick "Dine-in customer" → Cake un-muted. |
| 7-5 | Item-override-wins muting | Cake category takeaway=OFF, but item "Cheesecake" takeaway=ON → preview Takeaway → Cake muted, Cheesecake un-muted. |
| 7-6 | Item-only muting | One item delivery=OFF, category not overridden → preview Delivery → only that item muted. |
| 7-7 | Live edit | While previewing Takeaway, click takeaway chip on a muted category back to unset → row un-mutes within 100 ms, no Save required. |
| 7-8 | Save side-effect-free | Save while previewing → `curl GET /api/config/<rid>` shows no preview-related field. |
| 7-9 | Reload resets | Set preview to Delivery → reload → preview is back to "Admin view". |
| 7-10 | Customer side untouched | Open `/<rid>/menu?orderType=takeaway` in another tab → behavior identical to pre-APP-7. |
| 7-11 | Interactivity in muted rows | Click drag handle, expand chevron, eye toggle, and a channel chip on a muted row → all respond. |
| 7-12 | Cross-feature | Phase-1 + Phase-2 regressions (drag, timing editor, food_order sort, persistence) all PASS. |

---

## EFFORT ESTIMATE

| Phase | Effort |
|---|---|
| IMPLEMENTATION (both items together) | ~1 short session — net +75 JSX +25 CSS across 2 files |
| Self-test | Compile + lint + manual click-through of 6 key cases on /admin/menu |
| QA | One `testing_agent_v3` pass covering 9-1 through 7-12 + iter_7 regression = ~21 cases. ~12 min wall-time. |
| Closure (CR.md status, QA handover, PRD update) | 5 min |

**Total wall-time: under one focused session.**

---

## PROBLEM 3: APP-10 — silent data-loss when admin forgets to click Save Changes

### What happened (fivestar incident, 2026-06-17)

Owner of restaurant 739 reported: "I change item timing — Avocado Hummus 12:00–15:00 — it doesn't get saved and gets reverted."

Live investigation as `owner@fivestar.com`:
- Save Changes button at top-right **does** activate (class flips `admin-save-btn` → `admin-save-btn has-changes`, text "Saved" → "Save Changes", disabled attr cleared). Code path is correct.
- Backend access log: **zero `PUT /api/config/` requests** for restaurant 739. Mongo `customer_app_config` has no document for 739. **They have never successfully saved anything**, ever.
- Inline ✓ button in TimingEditor (`IoCheckmarkCircle` icon, universally read as "saved/done") only updates local React state. The display flips to the new time immediately — strong implication of persistence. Owner stops there. Closes the tab. Local React state is lost. On next visit, backend returns defaults — looks "reverted".

### Root cause

Two-stage save UX:
1. **Inline ✓ in TimingEditor** — commits local edit (re-renders the row, shows new time pill). Looks final.
2. **Top-right "Save Changes" button** — the ONLY trigger of `PUT /api/config/`. Lives in `AdminLayout.jsx` header, far from the row being edited.

Owner attention is locked on the row they just edited. They never look up to discover the second control. There is no in-row hint, no toast, no banner.

### Effect

- 0 PUTs in backend log for fivestar over the session window.
- This is not just timing — it applies to every admin field on this page (channels, drag-drop, visibility, station timing). All silently lost.
- Discovered only when owner reported it. Likely affects all new restaurants onboarding.

### Target behaviour

Two complementary fixes, both visible cues for the second-step save:

**Fix A — Toast on inline ✓**
When the admin clicks the inline ✓ inside TimingEditor (and similar inline commits like a channel chip), display a non-blocking toast at top-right:
> "Don't forget to click **Save Changes** at the top to persist."

- Dismissable; auto-dismisses after ~4 s.
- Throttled to fire at most once per session (avoid spam after the admin has clicked Save Changes once).

**Fix B — Sticky "Unsaved changes" banner**
When `isDirty === true`, render a banner directly under the page title `[Menu Order]`:
> "🟠 You have unsaved changes. [Save Now] [Discard]"

- Banner is always in viewport because it sits at the top of scrollable content.
- `[Save Now]` calls `saveConfig` directly.
- `[Discard]` calls a new `discardChanges` action that resets `config` to `originalConfig`.
- The existing top-right Save Changes button stays as-is — banner is an addition, not a replacement.

### Mockup — sticky banner

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Menu Order                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  🟠 You have unsaved changes.       [Save Now]   [Discard]       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Preview as: [ Admin view ▾ ]                            [ Save ]       │
│  …                                                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### Files in scope

- `frontend/src/layouts/AdminLayout.jsx` — render the sticky banner inside `admin-content-header` when `isDirty=true`. Wire `[Save Now]` → existing `saveConfig`; `[Discard]` → new `discardChanges` (read `originalConfig`, set into `config`).
- `frontend/src/layouts/AdminLayout.css` — banner styling (~20 lines).
- `frontend/src/context/AdminConfigContext.jsx` — expose `discardChanges` next to existing `saveConfig` (~5 lines).
- `frontend/src/components/AdminSettings/MenuOrderTab.jsx` — fire toast in `TimingEditor.onSave` + `ChannelToggles.onChange`. Use existing `useToast` hook. Throttle via session-scoped flag.

### Risk

| Risk | Likelihood | Mitigation |
|---|---|---|
| Discard button used accidentally | LOW | Confirmation dialog before discard. |
| Toast becomes annoying after 5th edit | LOW | Throttle to first edit per session; once admin clicks Save Changes, suppress toast for rest of session. |
| Banner pushes content down, breaks layout | LOW | Fixed-height banner ~44 px, scroll handled by AdminLayout main pane. |
| Existing `admin-save-btn` becomes redundant | NONE — kept as duplicate Save action at top-right. |
| Sticky banner accessibility | LOW | Banner has `role="status"` so screen readers announce on appearance. |
| Discard data-loss surprise | LOW–MED | Confirmation prompt: "Discard all unsaved changes since last save? This cannot be undone." |

### Acceptance criteria (APP-10)

C1. After clicking inline ✓ on a TimingEditor row, a toast appears: "Don't forget to click Save Changes at the top to persist." Toast carries `data-testid="save-discoverability-toast"`.
C2. Toast fires AT MOST ONCE per browser session. Subsequent inline ✓ clicks in the same session do not re-toast. (Tracked via sessionStorage flag, NOT in the cart's localStorage.)
C3. When `isDirty=true`, a banner renders with `data-testid="unsaved-changes-banner"` inside the admin content header, above the page title's child elements.
C4. Banner contains `[Save Now]` (`data-testid="banner-save-now-btn"`) which calls the same `saveConfig` as the top-right `admin-save-btn`. After save, banner disappears.
C5. Banner contains `[Discard]` (`data-testid="banner-discard-btn"`). Click opens a confirmation dialog. On confirm, `config` resets to `originalConfig` and banner disappears.
C6. After save, banner stays hidden until the next field edit makes `isDirty=true` again.
C7. The existing top-right Save Changes button remains functional, unchanged.
C8. Banner does not push the page title off-screen on viewports ≥ 1366 px wide.

### Effort estimate (APP-10)

~30 JSX + ~20 CSS across 4 files. One focused commit. Independent of APP-7/APP-9.

---

1. **APP-9 first** (chip redesign) — fixes a real visible defect, lower risk, no new logic.
2. **APP-10 second** (Save discoverability) — fixes a high-severity data-loss UX trap surfaced by fivestar incident; independent of APP-9.
3. **APP-7 third** (preview) — additive, depends on APP-9 chips being clickable inside muted rows but otherwise independent.

A single commit can ship all three since the touch-points are within the same admin layout. No staged release needed.

---

## ROLLBACK PLAN

Both changes are confined to `MenuOrderTab.jsx` + `MenuOrderTab.css`. Rolling back is a `git revert` of that commit. No DB migrations, no protected-file regressions, no schema changes.

---

## NOT INCLUDED (explicit non-scope, parking lot)

- **APP-8 — station-timing preview** (a similar "Preview at 10:30 PM Friday" knob). Same shape, separate concern, future CR.
- **Multi-channel side-by-side compare** (Takeaway vs Delivery columns). Separate CR.
- **Responsive chip layout** for narrow viewports — current admin is desktop-only per product policy.
- **Reset-to-POS button** on overridden chip — instead, third click in the cycle clears it. Keeps the click model unchanged.
- **Customer-side "what would I see as another channel" preview** — out of scope; this CR is admin-only.

---

*Registered: 2026-06-17 | Stage: PLANNING COMPLETE | Awaiting owner sign-off to move IMPLEMENTATION*
