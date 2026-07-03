# CR-011 — Coupon Optimizer (Auto-Suggest Discount Adjustments)

**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-27
**Status:** `cr011_registered_awaiting_discovery`
**Owner Verified (Doc Review):** 2026-05-27
**Depends on:** CR-003 Phase 4 (Coupon ROI Score) — completed

---

## 1. Idea

Restaurant owners see ROI scores per coupon but don't know **what to do** about underperforming ones. The Coupon Optimizer auto-suggests discount adjustments based on ROI bands.

## 2. Example Suggestions

| Coupon | Current | ROI | Suggestion |
|---|---|---|---|
| SEED_V3A_LUNCH | 20% off | 5.2x (Good) | "Reducing discount to 15% could push ROI to Strong while keeping customers engaged" |
| BOGO_FREE | Buy 1 Get 1 | 1.5x (Risk) | "This coupon gives away 67% of order revenue. Consider limiting to specific items or adding a minimum order value" |
| WEEKEND50 | Rs.50 flat | 9.0x (Strong) | "This coupon is performing well. Consider increasing usage limit to drive more orders" |

## 3. Prerequisites

- CR-003 Phase 4 ROI Score must be live (done)
- Need at least 3+ uses per coupon for reliable suggestions
- Need historical ROI trend data (not yet collected — would need to snapshot ROI periodically)

## 4. Open Questions (for Discovery)

1. Should suggestions be rule-based (if ROI < 4x, suggest reduce by 5%) or AI-powered?
2. Should suggestions appear inline in the table, as a separate section, or as a modal?
3. Should the system auto-apply suggestions or require owner confirmation?
4. How do we estimate the impact of a discount change without A/B testing?
5. Should we factor in customer return rate (lifetime value) not just single-order ROI?

## 5. Scope

- **NOT** auto-modifying coupons
- **NOT** requiring AI/LLM integration
- Rule-based suggestions displayed in the UI
- Owner decides whether to act on them

## 6. Estimated Effort

- Discovery: 1 session
- Planning: 1 session
- Implementation: 1-2 sessions
- QA: 1 session

---

**Status:** Registered. Not started. Do not implement until discovery is complete.
