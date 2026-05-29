# CR-015b — Dead Variable-Mapping Code Audit (WhatsApp Automation & Segments pages)

**Sprint**: ROI Measurement / CRM
**Parent CR**: CR-015 (WhatsApp Template Variable Mapping Fidelity)
**Type**: Sub-CR (tech-debt / dead-code removal — reduce confusion before CR-015a)
**Discovered**: 2026-05-29 (owner flagged: "mapping happens only on Templates page; find & remove dead mapping code elsewhere")
**Lifecycle stage**: `cr015b_discovery_complete_awaiting_removal_approval`
**Access used**: read-only static analysis (grep + file reads)

---

## 1. Owner's premise (CONFIRMED CORRECT)

> "Variable mapping happens only on the Templates page. On the WhatsApp Automation
> and Segments pages we only choose **which template** to send — there is no
> variable mapping there. Find all the dead variable-mapping code and remove it."

**Verified true.** The only reachable place that *edits & saves* `{{n}}` → field
mappings (`PUT /api/whatsapp/template-variable-map/{wid}`) is the **Templates page**
"Map" button. The WhatsApp Automation page contains a full mapping modal that **no
button ever opens** (orphaned), and the Segments page has no mapping UI at all.

---

## 2. Reachability matrix (where mapping save is wired)

| File | `openVariableMappingModal` defined? | Called by a button? | PUT mapping reachable? |
|---|---|---|---|
| `pages/TemplatesPage.jsx` | Yes (L187) | **Yes** — "Map" button (L452) | ✅ LIVE |
| `components/shared/WhatsAppAutomationContent.jsx` | Yes (L654) | **No call anywhere** | ❌ DEAD |
| `pages/SegmentsPage.jsx` | No | — | ❌ none (read-only consumer) |

Global grep confirms `openVariableMappingModal(` is invoked **only** at `TemplatesPage.jsx:452`.

---

## 3. DEAD CODE INVENTORY

### 3A. `WhatsAppAutomationContent.jsx` — orphaned variable-mapping modal cluster

Root cause: `setShowVariableMappingModal(true)` is reached only inside
`openVariableMappingModal()` (L673), and that function is never called → the whole
modal and everything that exclusively serves it is unreachable.

**Functions (remove):**
| Symbol | Lines | Why dead |
|---|---|---|
| `openVariableMappingModal` | 654–674 | never called |
| `handleSaveVariableMapping` | 676–~705 | only invoked by dead modal Save btn (L1724) |
| `isCouponVariable` | 308–312 | never called anywhere |
| `handleCouponSelect` | 328–344 | only invoked in dead modal (L1624) |
| `getSelectedCoupon` | 325 | never called anywhere |

**State (remove — only used by dead modal/editing buffer):**
| Symbol | Line |
|---|---|
| `showVariableMappingModal` | 263 |
| `mappingTemplate` | 264 |
| `variableMappings` (local editing buffer) | 265 |
| `variableMappingModes` (local editing buffer) | 266 |
| `variableMappingErrors` | 270 |
| `couponSearchQuery` | 291 |
| `selectedCouponId` | 292 |

**JSX (remove):**
| Block | Lines |
|---|---|
| Variable-mapping `<Dialog open={showVariableMappingModal}>` | 1441–1730 |

### 3B. `WhatsAppAutomationContent.jsx` — coupon-summary cluster (DECISION NEEDED)

`fetchCouponSummary` is triggered **only** from inside the dead modal (L672, 1508,
1598, 1675). After the modal is removed it has no caller, so `couponSummary` stays
empty forever on this page. The live preview path calls `getCouponPickPreviewValue`
→ reads `couponSummary` → returns `null` when empty → preview already shows "NA" for
any `coupon_pick` slot on this page **today**. So removing this cluster causes **no
behavior change** for the automation page.

| Symbol | Lines | Note |
|---|---|---|
| `couponSummary` / `couponSummaryLoading` / `couponSummaryError` | 288–290 | only read by dead modal + inert preview |
| `fetchCouponSummary` | 294–305 | becomes uncalled after modal removal |
| `getCouponPickPreviewValue` | 347–359 | called by live `resolvePreviewWithSampleData` (L384) but always returns null (empty summary) |
| `parseCouponPickMapping` | 315–322 | used by `getCouponPickPreviewValue` + dead modal |

**Options:**
- **B1 (conservative)**: keep this cluster (no functional change, but leaves
  `fetchCouponSummary` as a new orphan → lint "unused").
- **B2 (clean, recommended)**: remove the cluster AND simplify the `coupon_pick`
  branch in `resolvePreviewWithSampleData` (L383–384) to render the raw mapping label
  or "NA". Net behavior identical (coupons never resolved here anyway).

### 3C. `SegmentsPage.jsx` — legacy unused preview

| Symbol | Lines | Why dead |
|---|---|---|
| `getPreviewMessage` | 164–175 | never called; legacy `{{name}}`/`{{points}}` preview, superseded by inline `segmentSampleData` preview at L924–939 |

- Keep `templateVariables` state — still used for the broadcast send payload (L242) and resets.
- Segments has **no** mapping UI (confirms owner). Its inline preview (L924–939) is LIVE and shares the CR-015a "NA" gap (handled separately / deferred).

### 3D. `TemplatesPage.jsx`

**No dead code.** This is the single legitimate mapping surface. Leave untouched.

---

## 4. What is LIVE and MUST be kept on the Automation page

These look mapping-related but are genuinely used (event→template selection + read-only previews + Send Test):

| Symbol | Used by |
|---|---|
| `templateVariableMappings` / `templateVariableModes` (parent SAVED maps) | `isTemplateFullyMapped` (L1201 select filter), event template preview (L1222–1224), template preview modal (L1754–1756) |
| `resolvePreviewWithSampleData` | event template preview (L1224), template preview modal (L1756) |
| `sampleCustomerData` | preview resolver |
| `availableVariables` | `TestTemplateModal` (L45/153/1842), preview-modal label (L1788) |
| `previewTemplate` + `showTemplatePreview` | template preview modal (opened L1071, LIVE) |
| `TestTemplateModal` + `showTestModal` | "Send Test" flow (opened L809, LIVE) |

⚠️ Removing the editing-buffer `variableMappings`/`variableMappingModes` (3A) must NOT
touch the parent `templateVariableMappings`/`templateVariableModes` — different
variables, easy to confuse.

---

## 5. Recommended sequence

1. **CR-015b removal first** (this doc) — delete dead code (3A + 3B-option + 3C) to remove confusion.
2. Re-evaluate **CR-015a** scope afterward: the only live previews that show "NA" are
   the automation-page previews (L1224/L1756), the Templates-page previews, and the
   Segments inline preview (L924–939). Backend sample-data fix (Option A) still fixes
   all of them; frontend fallback (Option B) now applies to `TemplatesPage.jsx`
   (mapping modal + cards) and the live preview resolvers — NOT the deleted automation modal.
3. Then T7 commit → Day 4.

---

## 6. Risk

| Risk | P | Impact | Mitigation |
|---|---|---|---|
| Accidentally remove the parent saved-map state (`templateVariableMappings`) | Low | High | Explicitly scoped out in §4; remove only the local `variableMappings` buffer |
| Coupon_pick preview regression on automation page | Very low | None | Already non-functional there (summary never fetched) — see §3B |
| Lint "unused var" after partial removal | Low | Low | Choose option B2 (full cluster removal) |
| `getPreviewMessage` removal breaks Segments send | Very low | Low | It is never called; send uses `templateVariables` directly (L242) |

---

## 7. Acceptance criteria (post-removal)

| # | Check | Method |
|---|---|---|
| 1 | `WhatsAppAutomationContent.jsx` compiles, no unused-var lint warnings | `yarn lint` |
| 2 | WhatsApp Automation page renders; event→template select + template preview + Send Test all still work | screenshot |
| 3 | Templates page "Map" → save mapping still works (untouched) | screenshot / smoke |
| 4 | Segments page renders; template select + broadcast preview still work | screenshot |
| 5 | `grep openVariableMappingModal` → only TemplatesPage definition + call remain | grep |
| 6 | 119 backend pytest still pass (no backend change, sanity) | pytest |

---

**End of CR-015b discovery. Awaiting owner approval to remove dead code.**
