# CR-018 — `/pos/max-redeemable` Projected Tier Upgrade — IMPLEMENTATION CLOSEOUT

**CR code**: CR-018
**Type**: Feature enhancement
**Status**: `cr018_closed_implemented_verified`
**Discovery**: `../discovery/CR_018_MAX_REDEEMABLE_PROJECTED_TIER_UPGRADE_DISCOVERY.md`
**Implemented**: 2026-05-29

---

## What was changed

**Single file**: `routers/pos.py` — `POST /api/pos/max-redeemable` endpoint (~10 lines added after CR-017 block)

After the existing CR-017 projected-earning block, added:
1. `projected_total = customer.total_points + projected_earned`
2. `projected_tier = calculate_tier(projected_total, settings)` — same function used by order flow
3. `tier_upgrade = projected_tier != current_tier`
4. `tier_upgrade_message` = human-readable nudge string (empty if no upgrade)

When `loyalty_enabled=false`: `projected_tier_after = current_tier`, `tier_upgrade = false`, `tier_upgrade_message = ""`

## New response fields

```json
{
  ...existing 10 fields (7 original + 3 from CR-017)...,
  "projected_tier_after": "Silver",
  "tier_upgrade": true,
  "tier_upgrade_message": "Complete this order and you'll upgrade to Silver!"
}
```

## Verification

**Test 1 — Normal bill (Rs.1000, Bronze, 128 pts, earns 50)**:
- `projected_tier_after`: Bronze ✅ (128+50=178, below Silver=500)
- `tier_upgrade`: false ✅
- `tier_upgrade_message`: "" ✅

**Test 2 — Big bill (Rs.10000, Bronze, 128 pts, earns 500)**:
- `projected_tier_after`: Silver ✅ (128+500=628, above Silver=500)
- `tier_upgrade`: true ✅
- `tier_upgrade_message`: "Complete this order and you'll upgrade to Silver!" ✅

## Acceptance matrix

| # | Check | Status |
|---|---|---|
| AC-1 | Response includes `projected_tier_after` (string) | ✅ |
| AC-2 | Response includes `tier_upgrade` (boolean) | ✅ |
| AC-3 | Response includes `tier_upgrade_message` (string) | ✅ |
| AC-4 | Upgrade detected when projected points cross threshold | ✅ (Test 2: 628 > 500) |
| AC-5 | No upgrade → false + empty message | ✅ (Test 1) |
| AC-6 | When loyalty disabled: tier_upgrade=false | ✅ (code path verified) |
| AC-7 | Existing 10 response fields unchanged | ✅ |
| AC-8 | POS handoff doc updated | ✅ |

**End of CR-018 closeout.**
