# CR-2026-07-04-003 — CR-004 Residual Scope (Empty-state UI + Admin CRUD Timeouts)

**Status:** 📝 REGISTERED (Role 1 intake complete)
**Session:** 2026-07-04
**Priority:** P2
**Severity:** P2
**Risk of change:** MEDIUM — customer-facing pages touched (not CRITICAL hotspots)
**Fast Lane:** ❌ Not eligible

**Related:**
- Parent: [`CR-2026-07-03-004`](../CR-2026-07-03-004-frontend-fetch-timeouts/CR.md) (plumbing SHIPPED)
- Design source: `/app/design_guidelines.json`

---

## 1. Problem

CR-004 shipped the plumbing (fetchWithTimeout, 8/15 s caps, React Query defaults, Toast for config timeouts). Two customer-facing gaps remain:

1. **Menu-load empty-state UI** — when POS is unreachable and React Query exhausts its 2 retries, the app shows a persistent skeleton with no error UI or retry affordance. Design agent D-05 output specifies an Empty-state-with-CTA pattern to replace the skeleton.
2. **AdminConfig CRUD/upload** — 5 raw `fetch` calls (`saveConfig`, `addBanner`, `updateBanner`, `deleteBanner`, `uploadImage`) still hang at browser default (~90 s). Admin-only, non-customer-facing, but bad UX for restaurant staff during outages.

**Explicitly NOT included:** AlertDialog on order-create timeout. CR-004 analysis found that `ReviewOrder.jsx` line 1347 already shows a well-worded network-loss toast that duplicates the design-agent AlertDialog message. Adding a blocking dialog would be UX regression.

## 2. Scope

**IN:**
- Empty-state UI on menu-load timeout (~3-5 FE files touched during discovery)
- 5 AdminConfig CRUD swaps to `apiWriteClient` (or `fetchWithTimeout` 15 s cap)

**OUT:**
- Order-create AlertDialog (DROPPED per CR-004 analysis)
- Any hotspot file (`ReviewOrder.jsx`, `CartContext.js`, etc.)
- Backend changes
- Design token / typography / color changes

## 3. Success criteria (draft)

See `INTAKE_DOC.md §6` — 8 rows including empty-state UI + admin CRUD grep + ESLint + build.

## 4. Prerequisites

- ✅ CR-004 SHIPPED
- ✅ Design agent output at `/app/design_guidelines.json`
- ⏳ Owner decisions D-01..D-04 (see INTAKE_DOC §7)

## 5. Effort

**2.5–3 hrs total** (see `INTAKE_DOC.md §8` breakdown).

## 6. Non-goals

- Not a full admin panel refactor
- Not visual redesign
- Not new features

---

Full Impact Analysis + Implementation Plan written at Role 2 after owner answers D-01..D-04 (or after CR-004 smoke reveals customer pain).
