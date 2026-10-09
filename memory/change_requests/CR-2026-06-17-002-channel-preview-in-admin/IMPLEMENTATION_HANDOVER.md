# CR-2026-06-17-002 — Implementation Handover

**To:** Implementation Agent (next session)
**From:** Planning Agent
**Date:** 2026-06-17
**Stage:** Ready for IMPLEMENTATION
**Owner approval:** Granted (Options + defaults locked in `CR.md` Owner Decisions table)
**Risk:** LOW
**Estimated effort:** One focused session
**Rollout:** APP-9 → APP-10 → APP-7, single commit acceptable

---

## Prerequisites (do these first)

1. Read in this order:
   - `/app/memory/control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md`
   - `./CR.md`
   - `./IMPACT_ANALYSIS.md` (skim mockups + visual specs sections)
   - CR-001 `IMPLEMENTATION_HANDOVER.md` for context on the file you'll touch
2. Confirm services up: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8001/api/` and same for `http://localhost:3000/`.
3. Confirm `REACT_APP_BACKEND_URL` is in `/app/frontend/.env`. If missing, add `https://genie-pull-run.preview.emergentagent.com`.

---

## Files in scope (only these)

| File | Net change |
|---|---|
| `frontend/src/components/AdminSettings/MenuOrderTab.jsx` | APP-9 rewrite ChannelToggles + APP-7 preview state/select/helpers + props |
| `frontend/src/components/AdminSettings/MenuOrderTab.css` | APP-9 chip styles + APP-7 preview-muted styles |
| `frontend/src/layouts/AdminLayout.jsx` | APP-10 sticky banner |
| `frontend/src/layouts/AdminLayout.css` | APP-10 banner styles |
| `frontend/src/context/AdminConfigContext.jsx` | APP-10 expose `discardChanges` |

**Files NOT to touch (will fail review):** `AuthContext`, `CartContext`, `App.js` providers, `ReviewOrder.jsx`, `server.py` routes, `channelEligibility.js`, `RestaurantConfigContext.jsx`, any file under `frontend/src/api/`.

---

## APP-9 — Status chip redesign

### Replace `ChannelToggles` at `MenuOrderTab.jsx:135-169`

Public API stays the same — `{channels, onChange, id}`. Add an OPTIONAL prop `posFlags` (default `null`) so chips can show POS-default ✓/✗ correctly when known.

```jsx
const ChannelToggles = ({ channels, onChange, id, posFlags = null }) => {
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
        const cls = `channel-chip ${
          s.kind === 'pos'
            ? (s.allowed ? 'pos-on' : 'pos-off')
            : (s.allowed ? 'admin-on' : 'admin-off')
        }`;
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

### CSS — replace existing `.channel-toggles` / `.channel-pill` block in `MenuOrderTab.css`

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
.menu-order-tab .channel-chip.admin-on {
  background: #16a34a; color: #ffffff; border-color: #15803d;
}
.menu-order-tab .channel-chip.admin-off {
  background: #dc2626; color: #ffffff; border-color: #b91c1c;
}
.menu-order-tab .channel-chip .chip-dot {
  position: absolute;
  top: 4px; right: 6px;
  width: 4px; height: 4px;
  background: #ffffff; border-radius: 50%;
}
```

### Pass `posFlags` at both `<ChannelToggles/>` call sites

In `CategoryCard`'s category header chip slot: `posFlags={null}` (categories don't carry POS channel flags).
In `CategoryCard`'s item-row chip slot: `posFlags={{dinein: item.dinein, takeaway: item.takeaway, delivery: item.delivery}}`.

---

## APP-7 — "Preview as" channel selector

### State + helpers in `MenuOrderTab` (top of the component body)

```jsx
import { isItemAllowedForChannel } from '../../utils/channelEligibility';
// ...
const [previewChannel, setPreviewChannel] = useState(null);

const isCategoryMutedInPreview = (cat) => {
  if (!previewChannel) return false;
  const catOverride = config.channelOverrides?.category?.[cat.id];
  return catOverride && catOverride[previewChannel] === false;
};

const isItemMutedInPreview = (cat, item) => {
  if (!previewChannel) return false;
  return !isItemAllowedForChannel(
    previewChannel,
    { dinein: item.dinein, takeaway: item.takeaway, delivery: item.delivery },
    config.channelOverrides?.category?.[cat.id],
    config.channelOverrides?.item?.[String(item.id)]
  );
};
```

### Toolbar selector — render in existing toolbar `<div>` (left of Save button area)

```jsx
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
```

### Pass new props to `CategoryCard` at BOTH call sites (multi-menu + single-menu)

```jsx
previewChannel={previewChannel}
isCategoryMuted={isCategoryMutedInPreview(cat)}
isItemMuted={(item) => isItemMutedInPreview(cat, item)}
```

### Inside `CategoryCard`

Apply `data-preview-hidden="true"` and `className="preview-muted"` to:
- The category header `<div>` when `isCategoryMuted` is true. Insert `<span className="preview-hidden-badge">Hidden on {previewChannel}</span>` next to category name.
- The item row `<div>` when `isItemMuted(item)` is true. Same badge.

### CSS — append to `MenuOrderTab.css`

```css
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

---

## APP-10 — Save Changes discoverability

### `AdminConfigContext.jsx` — expose `discardChanges`

After the existing `saveConfig` definition, add:

```jsx
const discardChanges = useCallback(() => {
  if (originalConfig) {
    setConfig(originalConfig);
  }
}, [originalConfig]);
```

And add `discardChanges` to the context value object.

### `AdminLayout.jsx` — sticky banner

Pull `discardChanges` and `isDirty` from context (already pulling `isDirty`, `saving`, `saveConfig`).

In the `admin-content-header` render block, BELOW the existing page title row and ABOVE the page content, conditionally render:

```jsx
{isDirty && (
  <div
    className="unsaved-changes-banner"
    data-testid="unsaved-changes-banner"
    role="status"
  >
    <span className="unsaved-icon" aria-hidden="true">🟠</span>
    <span className="unsaved-msg">You have unsaved changes.</span>
    <button
      type="button"
      className="banner-save-now-btn"
      data-testid="banner-save-now-btn"
      onClick={saveConfig}
      disabled={saving}
    >
      {saving ? 'Saving…' : 'Save Now'}
    </button>
    <button
      type="button"
      className="banner-discard-btn"
      data-testid="banner-discard-btn"
      onClick={() => {
        if (window.confirm('Discard all unsaved changes since last save? This cannot be undone.')) {
          discardChanges();
        }
      }}
    >
      Discard
    </button>
  </div>
)}
```

### `AdminLayout.css` — banner styling

```css
.unsaved-changes-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px 0;
  padding: 10px 16px;
  background: #fff7ed;
  border: 1px solid #fdba74;
  border-radius: 8px;
  font-size: 14px;
  color: #9a3412;
}
.unsaved-changes-banner .unsaved-icon { font-size: 16px; }
.unsaved-changes-banner .unsaved-msg { flex: 1; }
.unsaved-changes-banner .banner-save-now-btn {
  padding: 6px 14px;
  background: #ea580c;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}
.unsaved-changes-banner .banner-save-now-btn:disabled {
  opacity: 0.6; cursor: not-allowed;
}
.unsaved-changes-banner .banner-discard-btn {
  padding: 6px 14px;
  background: transparent;
  color: #9a3412;
  border: 1px solid #fdba74;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}
```

### Toast on inline ✓ — `MenuOrderTab.jsx`

Add at top of component:
```jsx
import { useToast } from '../../hooks/use-toast';
const { toast } = useToast();
const SESSION_TOAST_KEY = 'mygenie_save_discoverability_toast_shown';
```

Wrap the inline ✓ commit handlers in `TimingEditor` and the chip `onChange` so that when fired AND `sessionStorage.getItem(SESSION_TOAST_KEY) !== '1'`, dispatch a toast with `data-testid="save-discoverability-toast"`:

```jsx
const showSaveReminder = () => {
  if (sessionStorage.getItem(SESSION_TOAST_KEY) === '1') return;
  toast({
    title: 'Almost saved',
    description: "Click 'Save Changes' at the top to persist.",
    duration: 4000,
  });
  sessionStorage.setItem(SESSION_TOAST_KEY, '1');
};
```

Call `showSaveReminder()` inside the inline ✓ handler in `TimingEditor` and inside `onChange` of channel chip.

After `saveConfig` succeeds, clear the flag so the toast can fire again in the next session of edits if needed (optional — owner decision pending; leave the flag persistent for now).

---

## Self-test plan (before invoking QA)

1. `yarn build` or `webpack compiled` clean.
2. `mcp_lint_javascript` on both edited files → no NEW blocking issues. (Four pre-existing issues at L105, L476, L1093×2 are out of scope.)
3. Login as `owner@18march.com` / `Qplazm@10` at `/login`. Navigate to `/admin/menu`.
4. **APP-9 chip visual:** verify chips are bigger, show full labels, three states distinguishable.
5. **APP-9 cycle:** click a chip 3 times → POS → admin-OFF → admin-ON → POS. Verify className transitions.
6. **APP-7 preview:** select "Takeaway customer" → muted rows appear → click chip back to unset → mute lifts.
7. **APP-10 banner:** make any edit → banner appears → click Save Now → banner disappears → backend `PUT /api/config/` returns 200.
8. **APP-10 toast:** start a fresh session (clear sessionStorage) → click inline ✓ in TimingEditor → toast fires once → click another inline ✓ → no second toast (session-throttled).

If any of these fail, fix before invoking QA.

---

## QA invocation brief (when handing to `testing_agent_v3`)

Reference path: `./IMPACT_ANALYSIS.md` for the 29 acceptance tests (APP-9 nine cases, APP-7 twelve cases, APP-10 eight cases). Use `owner@18march.com / Qplazm@10` at restaurant 478. Multi-menu admin still unavailable in seed (716 Hyatt) — code-review-only for station drag-drop regression.

Reset restaurant 478 to `channelOverrides={}, stationTimings={}` at end of QA run.

---

## Exit Gate Checklist

```
[ ] 1. All three items implemented per blueprints above
[ ] 2. Code markers added (// CR-2026-06-17-002 APP-9/APP-7/APP-10)
[ ] 3. yarn webpack compile clean (no new warnings)
[ ] 4. mcp_lint_javascript reports zero NEW blocking issues
[ ] 5. Self-test 1-8 all pass
[ ] 6. No files outside scope modified (verify with `git diff --stat HEAD`)
[ ] 7. Restaurant 478 config in clean state after self-test
[ ] 8. QA_HANDOVER_PHASE1.md (or QA_HANDOVER.md) written
[ ] 9. CR.md status updated to IMPLEMENTED
[ ] 10. testing_agent_v3 invoked with acceptance tests + restaurant 478
[ ] 11. iter_N.json PASS verified before declaring done
```

**STOP after exit gate — do not modify any file outside scope. Hand back to QA / owner.**

---

*Handover complete | 2026-06-17 | Implementation Agent: please ack when picking up.*
