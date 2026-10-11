# CR-002B — Customer CRM Benefits Data Visibility Fix

**Date:** 2026-02-26
**Status:** `cr002b_registered_awaiting_phase_0_discovery`
**Priority:** P1 (highest in ROI Measurement Sprint — gates CR-003)
**Sprint:** ROI Measurement for CRM
**Register:** `./ROI_MEASUREMENT_CR_REGISTER.md`

---

## 1. Purpose

The customer detail screen currently exposes a rich set of CRM benefits — customer profile, loyalty points, wallet balance, coupons (available + used), AI insights, top items, visit/spend history, tier, preferences.

This CR is to verify and fix **customer-level CRM visibility** end-to-end: confirm every value shown on the customer detail screen is correctly derived from the canonical data sources (orders, `coupon_usage`, `points_transactions`, wallet transactions, customer record).

This CR is **not** about global/owner analytics. CR-003 owns that scope.

---

## 2. Scope (Customer Detail Screen)

| Block | What must be verified |
|---|---|
| Customer coupons — available | Correct list, not expired, not already used, scoped to this customer/restaurant |
| Customer coupons — used | Correct list, with discount amount, used_at timestamp, linked order_id |
| Coupon display fields | title, code, type (V1 flat / V1 % / V2 item / V2 category / V3-A / V3-B / V3-C), discount value, usage limits |
| Loyalty points — earned | Sum from `points_transactions` for this customer |
| Loyalty points — redeemed | Sum of `loyalty_points_used` for this customer |
| Loyalty points — current balance | earned − redeemed (or stored balance — must match) |
| Wallet — added | Sum of wallet credit transactions |
| Wallet — used | Sum of wallet debit transactions |
| Wallet — current balance | added − used (or stored balance — must match) |
| Visits | Count of orders for this customer |
| Spend | Sum of order totals (and net spend after discounts, if shown) |
| Tier | Tier rule output based on spend / visits / points |
| Top items | Aggregated from this customer's orders |
| AI insights / preferences | Source of truth + freshness + whether real data or placeholder |

---

## 3. Main Questions For Phase 0 Discovery

1. Are customer coupons shown correctly (correct customer scope, correct restaurant scope)?
2. Are available coupons and used coupons separated correctly?
3. Are coupon `title / code / type / discount / usage` values visible and correct?
4. Are loyalty points `earned / redeemed / current balance` correct?
5. Are wallet `added / used / current balance` values correct?
6. Are customer `visits / spend / tier / top items / AI insights / preferences` based on real data, or are any placeholders/mocked values present?
7. Are coupon / loyalty / wallet fields correctly linked from `orders`, `coupon_usage`, `points_transactions`, wallet transactions, and customer records?

---

## 4. Out Of Scope

- Owner-level / global coupon ROI dashboards → owned by **CR-003**.
- POS-facing cross-sell/upsell suggestions → owned by **POS-CRM Customer Cross-Sell Upsell Suggestions API** CR.
- Historical backfill / migration changes (not approved).
- Any change to closed CRM 1.0 baseline close document.

---

## 5. Future Flow

```
Phase 0 Discovery
  → Phase 1 Planning
    → Phase 1 Implementation
      → Phase 1 QA
        → Final Reconciliation
```

This placeholder doc covers only **registration**. Phase 0 discovery has NOT started yet.

---

## 6. Dependencies / Relationships

| Relationship | Detail |
|---|---|
| Gates | **CR-003 Coupon Analytics Dashboard** — owner-level dashboard inherits any wrongness in customer-level data. CR-003 implementation should not start until CR-002B is understood or consciously deferred. |
| Soft-feeds | **POS-CRM Customer Cross-Sell Upsell Suggestions API** — suggestions depend on trustworthy customer insights / top items / preferences. |
| Inherits | CRM 1.0 baseline (closed, production-promotable) as the substrate. |

---

## 7. Strict Non-Goals For This Registration

- No code changes
- No DB changes
- No env / deploy / migration
- No QA execution
- No discovery beyond reading known docs enough to register this placeholder

---

## 8. Recommended Next Agent

`CR-002B Customer CRM Benefits Data Discovery Agent` — runs Phase 0 Discovery against the customer detail screen and the canonical data sources listed in Section 2.

---

## 9. Status

```
cr002b_registered_awaiting_phase_0_discovery
```
