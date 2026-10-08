# CR-003 — Coupon Analytics Dashboard (Discovery Pointer)

**Date:** 2026-02-26
**Status:** `cr003_coupon_analytics_dashboard_proposed_awaiting_owner_scope` (Phase 1 owner decisions locked)
**Priority:** P3 (backlog) — gated by CR-005 + CR-002B in this sprint
**Sprint:** ROI Measurement for CRM
**Register:** `../00_register/ROI_MEASUREMENT_CR_REGISTER.md`

---

## Why this is a pointer, not a full discovery doc

CR-003 was authored **before the CRM 1.0 baseline close** (2026-05-26). To preserve original-baseline history, the original CR-003 planning document remains in its original location:

**Canonical CR-003 doc (legacy, do not move):**
`/app/memory/crm/crm_1_0/planning/CR_003_COUPON_ANALYTICS_DASHBOARD.md`

That doc already contains:
- Problem statement
- Backend readiness audit (`GET /api/analytics/coupons` is live)
- Proposed dashboard sections A-G
- Owner questions Q1-Q5 (Phase 1 decisions **locked**: separate `/coupon-analytics` page · Recharts · defer Top Coupons · all-time only · refresh on page load only)
- Effort estimate + phasing
- Dependencies + risks

For the ROI Measurement Sprint, no additional discovery is required on CR-003 itself — the next step is **Phase 1 Planning** in `../planning/` once its gating CRs (CR-005, CR-002B) have produced enough clarity.

---

## Sprint-specific gating context

| Gating CR | Why CR-003 must wait |
|---|---|
| **CR-005 (R689 field bugs)** | Bug B2 (customer detail shows `0 used` despite 2 redemptions) and B3/B6 (per-user / total usage limits not enforced) mean `coupon_usage` data may be incomplete or incorrect. A dashboard built on top of this would inherit the wrongness. |
| **CR-002B (Customer-level CRM visibility)** | Customer-level coupon rollups must be trusted before owner-level aggregates make sense. |

CR-003 implementation must **not** start until CR-005 and CR-002B are understood or consciously deferred per item.

---

## When CR-003 is unblocked

The next doc to create will be:
`../planning/CR_003_COUPON_ANALYTICS_DASHBOARD_PHASE_1_PLAN.md`

which will reference both:
- the legacy CR-003 doc (`/app/memory/crm/crm_1_0/planning/CR_003_COUPON_ANALYTICS_DASHBOARD.md`)
- the CR-005 / CR-002B discovery outputs (to confirm `coupon_usage` integrity assumptions before building the dashboard)

---

## Strict Non-Goals

- Do **NOT** move or rewrite the legacy CR-003 doc.
- Do **NOT** merge CR-003 with CR-002B, CR-004, CR-005, or POS-CRM Cross-Sell.
- Do **NOT** implement Top Coupons table or date range filter in Phase 1 — those are Phase 2/3 per locked decisions.

---

## Status

```
cr003_coupon_analytics_dashboard_proposed_awaiting_owner_scope
```
(Locked Phase 1 owner decisions; gated by CR-005 + CR-002B before Phase 1 Planning.)
