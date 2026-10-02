# CR-018 — `/pos/max-redeemable` Projected Tier Upgrade — DISCOVERY

**CR code**: CR-018
**Type**: Feature enhancement (POS-facing endpoint)
**Priority**: P1 — conversion nudge at cashier screen
**Lifecycle stage**: `cr018_discovery_complete_awaiting_owner_approval`
**Date**: 2026-05-29
**Surfaced by**: Agent recommendation, approved by owner to register

---

## 1. Problem Statement

`POST /api/pos/max-redeemable` now returns `projected_points_earned` (CR-017). But POS still cannot tell the customer **"Complete this order and you'll upgrade to Silver!"** — a powerful conversion nudge at the cashier screen.

The tier thresholds are already known (`calculate_tier` in `core/loyalty.py`):
- Bronze: 0+
- Silver: `tier_silver_min` (default 500)
- Gold: `tier_gold_min` (default 1500)
- Platinum: `tier_platinum_min` (default 5000)

The calculation is: `current_points + projected_points_earned >= next_tier_threshold` → tier upgrade will happen.

## 2. Evidence

- `calculate_tier()` in `core/loyalty.py` (line 40): pure function, maps total_points → tier
- CR-017 already computes `projected_earned` in the same endpoint
- `customer.total_points` + `projected_earned` = projected post-order balance
- Compare projected balance against next tier threshold → can determine if upgrade happens

## 3. Proposed Fix

**Same endpoint**: `POST /api/pos/max-redeemable` in `routers/pos.py`

Add 3 fields:

```json
{
  ...existing 10 fields...,
  "projected_tier_after": "Silver",
  "tier_upgrade": true,
  "tier_upgrade_message": "Complete this order and you'll upgrade to Silver!"
}
```

### Logic (~15 lines)

1. `projected_total = customer.total_points + projected_earned`
2. `projected_tier = calculate_tier(projected_total, settings)`
3. `tier_upgrade = projected_tier != current_tier`
4. If upgrading: `tier_upgrade_message = "Complete this order and you'll upgrade to {projected_tier}!"`
5. If not: `tier_upgrade_message = ""`
6. When `loyalty_enabled=false`: `projected_tier_after = current_tier`, `tier_upgrade = false`, `tier_upgrade_message = ""`

### What does NOT change
- No other endpoints affected
- No DB reads/writes beyond what's already there
- No breaking changes — additive fields
- No schema/model changes

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Projected tier differs from actual if points redeemed same order | Low | Low | Projection uses gross earning; if customer also redeems, net points will differ. POS understands this is pre-payment. |
| Existing POS integration breaks | None | — | Additive fields only |

## 5. Acceptance Criteria

| # | Check |
|---|---|
| AC-1 | Response includes `projected_tier_after` (string: Bronze/Silver/Gold/Platinum) |
| AC-2 | Response includes `tier_upgrade` (boolean) |
| AC-3 | Response includes `tier_upgrade_message` (string, empty if no upgrade) |
| AC-4 | When projected_points push customer past threshold, `tier_upgrade=true` with correct tier name |
| AC-5 | When no tier change, `tier_upgrade=false` and `tier_upgrade_message=""` |
| AC-6 | When `loyalty_enabled=false`, `tier_upgrade=false` |
| AC-7 | Existing 10 response fields unchanged |
| AC-8 | POS handoff doc updated with new fields |

## 6. Owner Approval Gate

**Approve this fix approach?** Same endpoint as CR-017, 3 additive fields, ~15 lines. No DB changes.

---

**End of CR-018 discovery.**
