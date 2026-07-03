# CR-015b — Dead Variable-Mapping Code Removal — IMPLEMENTATION CLOSEOUT

**Parent CR**: CR-015
**Status code**: `cr015b_removed_2026_05_29`
**Implemented**: 2026-05-29 (owner-approved: option B2 + Segments leftovers)
**Discovery**: `../discovery/CR_015B_DEAD_VARIABLE_MAPPING_CODE_DISCOVERY.md`

---

## Owner premise (confirmed)
Variable mapping is edited ONLY on the Templates page ("Map" button). The WhatsApp Automation
page held a full but **unreachable** copy of the mapping modal (no button ever called
`openVariableMappingModal`), and Segments has no mapping UI. Owner asked to remove the dead code.

## What was removed
**`components/shared/WhatsAppAutomationContent.jsx`**
- Orphaned functions: `openVariableMappingModal`, `handleSaveVariableMapping`, `isCouponVariable`,
  `handleCouponSelect`, `getSelectedCoupon`, `getCouponPickPreviewValue`, `parseCouponPickMapping`,
  `fetchCouponSummary`.
- Orphaned state: `showVariableMappingModal`, `mappingTemplate`, `variableMappings`,
  `variableMappingModes`, `savingVariableMapping`, `variableMappingErrors`, `couponSummary`,
  `couponSummaryLoading`, `couponSummaryError`, `couponSearchQuery`, `selectedCouponId`.
- The entire `{/* Variable Mapping Modal */}` `<Dialog>` JSX (~296 lines).
- Simplified the `coupon_pick` branch in the live `resolvePreviewWithSampleData` (identical behavior —
  coupon summary was never fetched on this page).
- Removed now-unused `Tag` import.

**`pages/SegmentsPage.jsx`**
- Unused `availableFields` array + unused `getPreviewMessage()` (legacy `{{name}}`/`{{points}}` preview).

## What was kept (LIVE)
- Templates page mapping modal + coupon picker — **untouched** (the one live mapping surface).
- Saved-map reads (`templateVariableMappings`/`...Modes`), live previews, Send Test, Segments
  inline preview + `templateVariables` send payload.

## Verification
- eslint clean on both files; webpack compiles. `grep` for all removed symbols → **zero residual refs**.
- Visual: WhatsApp Automation page renders fully (events, templates, Send Test); Templates mapping
  modal (incl. coupon picker) works; no JS runtime errors on any route.

**End of CR-015b closeout.**
