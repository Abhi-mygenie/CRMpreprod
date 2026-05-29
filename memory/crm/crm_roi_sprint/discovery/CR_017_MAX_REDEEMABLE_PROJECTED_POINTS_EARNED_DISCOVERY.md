# CR-017 — `/pos/max-redeemable` Missing Projected Points Earned — DISCOVERY

**CR code**: CR-017
**Type**: Hot production fix (feature gap on live POS-facing endpoint)
**Priority**: P0 — POS cannot show customers "you'll earn X points" before payment
**Lifecycle stage**: `cr017_discovery_complete_awaiting_owner_approval`
**Date**: 2026-05-29
**Surfaced by**: Owner, during CR-015 live test session

---

## 1. Problem Statement

`POST /api/pos/max-redeemable` is the endpoint POS calls **before payment** to show the cashier/customer how many loyalty points can be redeemed. It currently returns:

```json
{
  "max_points_redeemable": 500,
  "max_discount_value": 250.0,
  "ratio_per_point": 0.5,
  "tier": "Silver",
  "available_points": 1000,
  "min_redemption_points": 100,
  "loyalty_enabled": true
}
```

**Missing**: There is no `projected_points_earned` field. POS cannot display "you'll earn X points on this order" at the pre-payment screen. This information only becomes available **after** the order is placed (`data.points_earned` in `/pos/orders` response) — too late for the customer-facing display.

The earn calculation logic already exists in `core/loyalty.py::calculate_points()` and is used by the order processing flow. The `max-redeemable` endpoint already receives `bill_amount` + customer tier + settings — all inputs needed for the same calculation.

## 2. Evidence

- `/pos/max-redeemable` response (code: `routers/pos.py` lines 508-519): returns 7 fields, none related to earning
- `/pos/orders` response (code: `routers/pos.py` lines 1627-1649): returns `points_earned` + `total_points` — but only post-payment
- POS contract (`CR_001C_LR_REDEMPTION_FINAL_PAYLOAD_HANDOFF_TO_POS.md` §2 step 5): documents `data.points_earned` on `/pos/orders` only
- Earn calculation: `calculate_points(bill_amount, customer, settings)` in `core/loyalty.py` — already used by order flow

## 3. Fix Scope

**Single endpoint change**: `POST /api/pos/max-redeemable` in `routers/pos.py`

Add 2 fields to the response:

```json
{
  ...existing 7 fields...,
  "projected_points_earned": 42,
  "projected_earn_percent": 5.0
}
```

### Implementation plan (~10 lines)

1. Import `calculate_points` (already used elsewhere in `pos.py`)
2. After `compute_max_redeemable()` call (line 506), call `calculate_points(bill_amount, customer, settings)`
3. Add `projected_points_earned` and `projected_earn_percent` to the `data` dict (line 508)
4. No schema changes needed — `POSResponse` uses generic `data: dict`

### What does NOT change
- No other endpoints affected
- No DB reads/writes beyond what's already there
- No breaking changes — additive fields, POS can ignore until ready
- No schema/model changes

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Calculation differs from actual earn at order time | Low | Low | Same function (`calculate_points`), same inputs. Only differs if bill_amount changes between max-redeemable and order — POS understands this is a projection. |
| Existing POS integration breaks | None | — | Additive fields only; no existing field removed or renamed |

## 5. Acceptance Criteria

| # | Check |
|---|---|
| AC-1 | `POST /api/pos/max-redeemable` response includes `projected_points_earned` (integer) |
| AC-2 | `POST /api/pos/max-redeemable` response includes `projected_earn_percent` (float) |
| AC-3 | Projected earning matches what `/pos/orders` would return for same bill_amount + customer |
| AC-4 | When `loyalty_enabled=false`, both fields return 0 |
| AC-5 | Existing 7 response fields unchanged |
| AC-6 | POS handoff doc updated with new fields |

## 6. Owner Approval Gate

**Approve this fix approach?** Single endpoint, 2 additive fields, ~10 lines of code. No DB changes.

---

**End of CR-017 discovery.**
