# CR-2026-06-17-002 — QA Handover

**From:** Implementation Agent
**Date:** 2026-06-17
**Stage:** IMPLEMENTED — ready for QA
**Risk:** LOW

---

## What was implemented

### APP-9 — Channel chip redesign
- Replaced old D/T/Del pills (28×22 px) with new status chips (96×28 px) showing full labels: **Dine-in**, **Takeaway**, **Delivery**
- 3 visual states: POS-default (gray ✓/✗), Admin-ON (green ✓ + white dot), Admin-OFF (red ✗ + white dot)
- Click cycle unchanged: POS-default → admin-OFF → admin-ON → POS-default
- `posFlags` prop added to show POS-level ✓/✗ for items (categories default to "allowed")
- All existing `data-testid`s preserved

### APP-7 — "Preview as" channel selector
- New `[data-testid="preview-channel-select"]` dropdown in toolbar with options: Admin view, Dine-in customer, Takeaway customer, Delivery customer
- When a channel is selected, rows hidden by the cascade get `data-preview-hidden="true"` + `.preview-muted` (40% opacity + badge)
- All controls inside muted rows remain clickable
- Preview state is local `useState` — never saved to backend
- Page reload resets to "Admin view"

### APP-10 — Save discoverability
- Sticky orange banner `[data-testid="unsaved-changes-banner"]` appears below header when `isDirty=true`
- Banner has [Save Now] and [Discard] buttons
- Discard prompts with `window.confirm` before resetting
- Toast fires once per session when inline edits happen (channel chip click)
- `discardChanges` added to `AdminConfigContext`

---

## Files changed (5 — exactly as planned)

| File | Changes |
|---|---|
| `MenuOrderTab.jsx` | APP-9 chip rewrite + APP-7 preview state/selector/helpers + APP-10 toast |
| `MenuOrderTab.css` | APP-9 chip styles + APP-7 preview-muted styles |
| `AdminLayout.jsx` | APP-10 sticky banner |
| `AdminLayout.css` | APP-10 banner styles |
| `AdminConfigContext.jsx` | APP-10 `discardChanges` |

---

## Self-test results

1. ✅ Webpack compile clean (warnings only — all pre-existing)
2. ✅ Lint: zero NEW blocking issues (4 pre-existing)
3. ✅ Login as `owner@18march.com` / `Qplazm@10` → admin panel loads
4. ✅ APP-9: Chips show full labels (Dine-in, Takeaway, Delivery) with ✓ icon
5. ✅ APP-9: 3-state cycle works (POS gray → admin-OFF red → admin-ON green → POS gray)
6. ✅ APP-7: Preview selector renders in toolbar, default "Admin view"
7. ✅ APP-10: Banner appears after clicking a chip (dirty state)
8. ✅ APP-10: Banner has Save Now + Discard buttons

---

## Test credentials

- Admin: `owner@18march.com` / `Qplazm@10`
- Restaurant: 478 (18march)
- Admin URL: `/admin/menu`

---

## Acceptance tests reference

See `IMPACT_ANALYSIS.md` — 29 test cases:
- APP-9: 9 cases (9-1 through 9-9)
- APP-7: 12 cases (7-1 through 7-12)
- APP-10: 8 cases (C1 through C8)

---

*QA Handover complete | 2026-06-17*
