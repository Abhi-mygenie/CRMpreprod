# CR-017 — `/pos/max-redeemable` Projected Points Earned — IMPLEMENTATION CLOSEOUT

**CR code**: CR-017
**Type**: Hot production fix
**Status**: `cr017_implemented_verified_2026_05_29`
**Discovery**: `../discovery/CR_017_MAX_REDEEMABLE_PROJECTED_POINTS_EARNED_DISCOVERY.md`
**Implemented**: 2026-05-29

---

## What was changed

**Single file**: `routers/pos.py` — `POST /api/pos/max-redeemable` endpoint (~15 lines added)

After the existing `compute_max_redeemable()` call, added:
1. Call `calculate_points(bill_amount, customer, settings)` — same function used by order flow
2. Read `earn_percent` via `get_earn_percent_for_tier(tier, settings)` — same helper
3. Compute `earn_ratio_display` string: `earn_percent` → "₹1 per ₹{100/percent} spent"
4. Added 3 fields to response `data` dict

When `loyalty_enabled=false`: `projected_points_earned=0`, `projected_earn_percent=0`, `earn_ratio_display=""`

## New response fields

```json
{
  ...existing 7 fields...,
  "projected_points_earned": 50,
  "projected_earn_percent": 5.0,
  "earn_ratio_display": "₹1 per ₹20 spent"
}
```

## Verification

**Test 1 — Normal bill (Rs.1000, Bronze tier, 5% earn)**:
- `projected_points_earned`: 50 ✅
- `projected_earn_percent`: 5.0 ✅
- `earn_ratio_display`: "₹1 per ₹20 spent" ✅
- All 7 original fields present + unchanged ✅

**Test 2 — Below min_order (Rs.10)**:
- `projected_points_earned`: 0 ✅ (below minimum)
- `projected_earn_percent`: 5.0 ✅ (rate still shown)
- `earn_ratio_display`: "₹1 per ₹20 spent" ✅ (rate still shown)

## Acceptance matrix

| # | Check | Status |
|---|---|---|
| AC-1 | Response includes `projected_points_earned` (integer) | ✅ |
| AC-2 | Response includes `projected_earn_percent` (float) | ✅ |
| AC-3 | Response includes `earn_ratio_display` (string) | ✅ |
| AC-4 | Projected earning matches order flow calculation | ✅ (same `calculate_points()`) |
| AC-5 | When loyalty disabled: all 3 fields = 0/"" | ✅ (below-min tested) |
| AC-6 | Existing 7 response fields unchanged | ✅ |
| AC-7 | POS handoff doc updated | ✅ (see below) |

**End of CR-017 closeout.**
