# CR-001C-C Coupon Admin UI — Owner Decisions (Frozen 2026-05-25)

**Status:** `cr001c_coupon_admin_ui_owner_decisions_frozen`
**Date:** 2026-05-25

---

## Decisions

| # | Question | Owner Choice | Notes |
|---|---|---|---|
| Q1 | Reuse decision | **B** — Partially reuse existing list/API layer, build new create/edit flow | Keep CouponsPage list, rebuild create/edit |
| Q2 | First UI scope | **B** — V1 + V2 (flat/percentage + item/category) | V3-A/B/C deferred to later UI phases |
| Q3 | Form style | **D** — Hybrid: coupon type selector + dynamic sections | **Owner wants to see UX design for approval BEFORE implementation. No form code until UX approved.** |
| Q4 | Item/category selector | **A** — Use live menu/catalog selector | Owner will expose menu API for item/category lookup |
| Q5 | Advanced fields | **B** — Hide under "Advanced Settings" collapsible | Clean form for basic use, power-user expandable |
| Q6 | Test/preview | **B** — Add later | Not in first UI phase |
| Q7 | Future coupons | **A** — Show as "Coming Soon" placeholders | V3-A, V3-B, V3-C, V3-D, V4 shown as coming soon |
| Q8 | UI rollout strategy | **B** — Phase UI rollout by coupon complexity | V1+V2 first, then V3 phases |

---

## Implementation Sequence (Frozen)

### Phase 0 — Backend Fix (prerequisite)
- Fix `coupons.py` admin create route to persist all fields via `model_dump()`
- No owner approval needed (bug fix)

### Phase 1 — UX Design for Approval (APPROVED 2026-05-25)
- UX mockup presented via `/coupon-ux-preview` page
- Owner reviewed 4 screens: list, type selector, item form, category form + advanced settings
- **APPROVED — proceed to implementation**

### Phase 2 — V1+V2 UI Implementation
- After UX approval
- Coupon list (enhanced with type badges, toggle, search)
- Create/edit with hybrid form (type selector + dynamic V1/V2 sections)
- Live menu API for item/category selection
- Advanced Settings collapsible
- "Coming Soon" placeholders for V3-A/B/C

### Phase 3+ — V3 UI Phases
- V3-A time-window (after V1+V2 is live)
- V3-B BOGO/BXGY
- V3-C Every-Nth
- Preview/test feature

---

## Dependencies

| Dependency | Owner action needed? |
|---|---|
| Menu API for item/category lookup | ✅ Yes — owner to expose/share menu API |
| UX approval | ✅ Yes — owner to review and approve before implementation |
| Backend create fix | ❌ No — can be done independently |

---

## Next Action

**Create UX design proposal for owner approval** — coupon type selector + dynamic V1+V2 form sections.

Owner to provide:
1. Menu API endpoint details (for item/category selector)
2. UX approval before any form code is written
