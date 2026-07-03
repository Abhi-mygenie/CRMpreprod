# CR-004 — Loyalty Settings Default Values & UI Bug Fix

**Date:** 2026-05-25
**Status:** `cr004_loyalty_defaults_plan_ready_awaiting_approval`
**Priority:** P1
**Scope:** 5 changes across 4 files (3 backend, 1 frontend). Zero DB migration needed.
**Triggered by:** Owner review of Loyalty Settings UI on 2026-05-25

---

## 1. Changes Overview

| # | Change | Current | Target | Type |
|---|---|---|---|---|
| 1 | `min_order_value` default | ₹100 | ₹0 | Backend default |
| 2 | `redemption_value` input min constraint | `min="0.5"` | `min="0.01"` | **UI bug fix** |
| 3 | `max_redemption_amount` default | ₹500 | Empty (no limit) | Backend + UI default |
| 4 | `max_redemption_percent` default | 50% | 100% | Backend + UI default |
| 5 | Off-peak hours | N/A | **No change needed** | Investigation only |

**Important distinction:** These changes affect **defaults for new restaurants** and **UI constraints**. Existing restaurants' DB values are untouched — owners can update via the UI.

---

## 2. Change 1 — Minimum Order Value Default: ₹100 → ₹0

### What changes

Every order should earn points by default — no minimum spend barrier for new restaurants.

### Files & edits

| File | Line | Current | New |
|---|---|---|---|
| `backend/models/schemas.py` | 960 | `min_order_value: float = 100.0` | `min_order_value: float = 0` |
| `backend/routers/points.py` | ~244 (inside `get_loyalty_settings` fallback dict) | `"min_order_value": 100.0` | `"min_order_value": 0` |
| `backend/core/loyalty.py` | 55 | `min_order = settings.get("min_order_value", 100.0)` | `min_order = settings.get("min_order_value", 0)` |

### Impact on existing restaurants

**None.** Existing restaurants already have `min_order_value: 100.0` stored in their DB document. This change only affects:
- New restaurants that don't have a `loyalty_settings` document yet (they'll get 0 instead of 100)
- The absolute last-resort fallback in `calculate_points` (from 100 → 0)

### Risk

**Very low.** Changing a default. No existing data modified.

---

## 3. Change 2 — Point Value (₹ per point) Input Min Constraint: Bug Fix

### The bug

The UI input for "Point Value (₹ per point)" has `min="0.5"` hardcoded in HTML. R689 and 8 other restaurants have `redemption_value: 0.25` in their DB. If any owner edits any field on the page and clicks Save, the browser blocks the form submission with "value must be 0.5 or greater" — even though the backend has no such constraint.

The owner is effectively **locked out of saving any loyalty settings** unless they also change the Point Value to ≥ ₹0.50.

### File & edit

| File | Line | Current | New |
|---|---|---|---|
| `frontend/src/pages/LoyaltySettingsPage.jsx` | 138 | `min="0.5"` | `min="0.01"` |

### Impact

Owners can now save settings without being forced to change their point value. Values like ₹0.10, ₹0.25, ₹0.50, ₹1.00 are all valid.

### Risk

**None.** Loosening a UI constraint to match backend reality. `min="0.01"` still prevents zero or negative.

---

## 4. Change 3 — Max ₹ Amount Default: ₹500 → Empty (No Limit)

### What changes

New restaurants should have no hard ₹ cap on redemption by default. The "Max ₹ Amount" field should be empty, meaning no limit.

### Backend behavior verification

`compute_max_redeemable()` in `core/loyalty.py` line 219:
```python
max_amount = float(settings.get("max_redemption_amount", 999999.0) or 999999.0)
```

When `max_redemption_amount` is `None` or `0`, the `or 999999.0` fallback kicks in — effectively no cap. **This already handles None safely.** No logic change needed in the computation.

### Files & edits

| File | Line | Current | New |
|---|---|---|---|
| `backend/models/schemas.py` | 977 | `max_redemption_amount: float = 500.0` | `max_redemption_amount: Optional[float] = None` |
| `backend/routers/points.py` | ~256 (fallback dict) | `"max_redemption_amount": 500.0` | Remove this line (let Pydantic default handle it) |
| `frontend/src/pages/LoyaltySettingsPage.jsx` | 153 | `value={settings.max_redemption_amount \|\| 500}` | `value={settings.max_redemption_amount \|\| ""}` |
| `frontend/src/pages/LoyaltySettingsPage.jsx` | 154 | `Max ₹{settings.max_redemption_amount \|\| 500} per order` | Show "No limit" when empty, else `Max ₹{value} per order` |

### Impact on existing restaurants

**None.** All 11 restaurants in DB already have `max_redemption_amount: 500.0` stored explicitly. This only affects new restaurants.

### Risk

**Low.** Backend `compute_max_redeemable` already handles `None` → `999999.0` fallback. Verified in code.

---

## 5. Change 4 — Max % of Bill Default: 50% → 100%

### What changes

New restaurants should allow customers to redeem up to 100% of their bill by default, not just 50%.

### Files & edits

| File | Line | Current | New |
|---|---|---|---|
| `backend/models/schemas.py` | 976 | `max_redemption_percent: float = 50.0` | `max_redemption_percent: float = 100.0` |
| `backend/routers/points.py` | ~255 (fallback dict) | `"max_redemption_percent": 50.0` | `"max_redemption_percent": 100.0` |
| `frontend/src/pages/LoyaltySettingsPage.jsx` | 148 | `value={settings.max_redemption_percent \|\| 50}` | `value={settings.max_redemption_percent \|\| 100}` |
| `frontend/src/pages/LoyaltySettingsPage.jsx` | 149 | `Max {settings.max_redemption_percent \|\| 50}% of bill` | `Max {settings.max_redemption_percent \|\| 100}% of bill` |

### Impact on existing restaurants

**None.** All 11 restaurants in DB already have `max_redemption_percent: 50.0` stored explicitly.

### Risk

**None.** Only changes the default for new restaurants.

---

## 6. Change 5 — Off-Peak Hours Investigation (NO CODE CHANGE)

### Verdict: Fully wired and working

The full trace from UI → backend → point calculation is intact:

```
Owner enables Off-Peak in UI
  → PUT /api/loyalty/settings saves 5 fields
    → POS order arrives at POST /api/pos/orders
      → pos_order_webhook → _calculate_points
        → core.loyalty.calculate_points
          → check_off_peak_bonus(settings)
            → reads off_peak_bonus_enabled, start/end time, type, value
            → compares current time against window
            → returns multiplier or flat bonus
          → total_points = base_points + off_peak_bonus
        → points_transaction records off_peak_bonus separately
```

**All 5 settings fields** (`off_peak_bonus_enabled`, `off_peak_start_time`, `off_peak_end_time`, `off_peak_bonus_type`, `off_peak_bonus_value`) are:
- Stored in `LoyaltySettings` / `LoyaltySettingsUpdate` Pydantic models
- Persisted via `PUT /api/loyalty/settings`
- Read by `check_off_peak_bonus()` in `core/helpers.py`
- Called by `calculate_points()` in `core/loyalty.py`
- Used by `_calculate_points()` in `routers/pos.py` (the realtime order webhook)

**One known limitation (pre-existing, not introduced by us):**
`check_off_peak_bonus()` uses a **hardcoded IST offset** (`+5:30`) for time comparison, not the restaurant's configured timezone. A restaurant in Dubai (UTC+4) would have its off-peak window evaluated 1.5 hours off. This can be fixed in a future sprint by using the restaurant's timezone from `users.settings.timezone` (same resolution chain that V3-A coupon time-window uses).

**No action needed for this CR.**

---

## 7. Complete Edit Plan

### Backend: `models/schemas.py` (3 edits)

| Line | Field | Current | New |
|---|---|---|---|
| 960 | `min_order_value` | `float = 100.0` | `float = 0` |
| 976 | `max_redemption_percent` | `float = 50.0` | `float = 100.0` |
| 977 | `max_redemption_amount` | `float = 500.0` | `Optional[float] = None` |

### Backend: `routers/points.py` (3 edits in fallback dict, ~line 238-260)

| Field | Current | New |
|---|---|---|
| `min_order_value` | `100.0` | `0` |
| `max_redemption_percent` | `50.0` | `100.0` |
| `max_redemption_amount` | `500.0` | Remove line (Pydantic default = None) |

### Backend: `core/loyalty.py` (1 edit)

| Line | Current | New |
|---|---|---|
| 55 | `settings.get("min_order_value", 100.0)` | `settings.get("min_order_value", 0)` |

### Frontend: `LoyaltySettingsPage.jsx` (4 edits)

| Line | Current | New |
|---|---|---|
| 138 | `min="0.5"` on redemption_value input | `min="0.01"` |
| 148 | `value={settings.max_redemption_percent \|\| 50}` | `value={settings.max_redemption_percent \|\| 100}` |
| 149 | `Max {settings.max_redemption_percent \|\| 50}% of bill` | `Max {settings.max_redemption_percent \|\| 100}% of bill` |
| 153 | `value={settings.max_redemption_amount \|\| 500}` | `value={settings.max_redemption_amount \|\| ""}` |
| 154 | `Max ₹{settings.max_redemption_amount \|\| 500} per order` | Conditional: empty = "No limit per order", else `Max ₹{value} per order` |

---

## 8. What This Does NOT Change

- **Existing restaurant data** — all 11 restaurants keep their current stored values
- **Earning calculation logic** — `calculate_points()` math is untouched
- **Redemption calculation logic** — `compute_max_redeemable()` math is untouched (it already handles None/0 gracefully)
- **POS API contracts** — no change to any POS endpoint behavior
- **Off-peak hours** — confirmed working, no change needed
- **Tier thresholds, bonuses, expiry** — all untouched

---

## 9. Testing Plan

| # | Test | Expected |
|---|---|---|
| T1 | Load R689 loyalty settings | Page loads, shows current values (100, 0.25, 50%, ₹500) |
| T2 | Change birthday bonus points from 100 to 200, click Save | **Saves successfully** (previously blocked by min=0.5 on redemption_value) |
| T3 | Set redemption_value to 0.10 and save | Saves successfully (min=0.01 allows it) |
| T4 | Set max_redemption_amount to empty and save | Saves with null — helper text shows "No limit per order" |
| T5 | Create a new restaurant's first loyalty settings load | Defaults: min_order=0, max_percent=100, max_amount=empty |
| T6 | Verify `compute_max_redeemable` with null max_amount | Returns correct max based on percent and points only (no ₹ cap) |
| T7 | Off-peak: enable, set 14:00-17:00, multiplier 2x, save | Settings persist. If tested during 14:00-17:00 IST, order earns 2x points |

---

## 10. Effort Estimate

| Step | Time |
|---|---|
| 4 files, 11 edits total | ~20 min |
| Smoke test T1-T6 | ~15 min |
| **Total** | **~35 minutes** |

---

## 11. Final Status

```
cr004_loyalty_defaults_plan_ready_awaiting_approval
```

5 changes documented. 4 files affected. No DB migration. No POS contract change. Existing restaurants unaffected. Ready for owner approval to implement.
