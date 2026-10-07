# CR-001C-L — Loyalty Change Proposal (Stage B)

**Module:** CR-001C-L (Loyalty)
**Stage:** B — Validate + Change Approval (HARD GATE)
**Date:** 2026-05-22
**Status:** **`cr001c_loyalty_change_proposal_awaiting_owner_approval`**
**Prerequisite:** Stage A AS-IS review (read) +  Q-LOYALTY-1..5 (answered)

> This document lists every code change CR-001C-L will make, with rationale,
> file/line target, risk, and the ⚠️ flag from Stage A each one closes.
> **No code is touched until you reply "approved" on this list.**

---

## Locked owner decisions (input to this proposal)

| Q | Decision | Implication |
|---|---|---|
| Q-LOYALTY-1 | `loyalty_enabled` is a **kill-switch** for BOTH migration and realtime | If `loyalty_enabled=false`, points are NOT computed/written/incremented in either path |
| Q-LOYALTY-2 | Wallet stays separate from points | Wallet debit never `$inc`s `total_points_redeemed` |
| Q-LOYALTY-3 | Bonuses (first-visit, birthday, anniversary) **DO** count toward `total_points_earned` | Lifetime counter includes everything that ever credited the customer |
| Q-LOYALTY-4 | Off-peak: add timezone config + midnight-crossing support in this CR | New `restaurant_timezone` field on `loyalty_settings`; `check_off_peak_bonus` refactor |
| Q-LOYALTY-5 | Historical orders' coupon/wallet data: **ignored** in migration | Only `order_amount` matters from each historical order — same helper as realtime |

---

## Foundation move

**F1 — Extract the loyalty helper into a shared module.**

Currently `_calculate_points()` lives inside `pos.py` (lines 734-766). Migration's `order_sync` needs to call the same function so realtime and migration use ONE formula.

- New file: `/app/backend/core/loyalty.py`
- Move `_calculate_points()` from `pos.py` → `core/loyalty.py` as `calculate_points()` (public)
- Update `pos.py::pos_order_webhook` to import from `core.loyalty`
- Update `migration.py::sync_orders_from_mygenie` to import from `core.loyalty`

This is a pure refactor — same logic, same inputs, same output. Zero behavior change at this step.

**Risk:** None. **Files:** `pos.py`, `core/loyalty.py` (new), `migration.py`.

---

## Change List

Each change has: `[Cn]` ID · rationale · file:line · risk · closes-flag.

### C1 — Honor `loyalty_enabled` kill-switch everywhere
**Closes ⚠️-A.** Per Q-LOYALTY-1.

- **Realtime POS** (`pos.py::pos_order_webhook`, ~line 1209): Before calling `_calculate_points`, check `settings.get("loyalty_enabled", False)`. If `False`: skip points math, skip the customer's `total_points*` updates entirely, write `points_earned=0` on the order doc (for audit), still update `total_visits / total_spent / last_visit / wallet_balance`.
- **Migration order_sync** (`migration.py`, ~line 273): Same check. If off, skip the per-order points computation and the customer `$inc` of `total_points` / `total_points_earned` / `tier`. Still `$inc total_visits / total_spent`.

**Risk:** Medium — if a restaurant accidentally has the toggle off post-migration, no loyalty data accrues. Mitigation: add a one-time check at migration start that logs a warning if `loyalty_enabled=false`. **Files:** `pos.py`, `migration.py`.

---

### C2 — Migration `customer_sync`: stop pulling MyGenie loyalty/wallet/coupon fields
**Closes ⚠️-Q.** Per Q-LOYALTY-5 + owner's clean-slate framing.

- **`customers.py::sync_customers_from_mygenie` lines 183-189:** remove these lines:
  ```python
  "total_points": mygenie_customer.get("loyalty_point", 0),
  "total_points_earned": int(mygenie_customer.get("total_points_earned") or 0),
  "total_points_redeemed": int(mygenie_customer.get("total_points_redeemed") or 0),
  "wallet_balance": float(mygenie_customer.get("wallet_balance") or 0),
  "total_wallet_received": float(mygenie_customer.get("total_wallet_received") or 0),
  "total_wallet_used": float(mygenie_customer.get("total_wallet_used") or 0),
  "total_coupon_used": mygenie_customer.get("total_coupon_used", 0),
  ```
  Replace with hard-zero initialization:
  ```python
  "total_points": 0,
  "total_points_earned": 0,
  "total_points_redeemed": 0,
  "wallet_balance": 0.0,
  "total_coupon_used": 0,
  "last_coupon_used": None,
  "tier": "Bronze",
  ```
- **Lines 235-245 (inline tier calc from `loyalty_point`):** remove — tier will be recomputed by order_sync per Q-LOYALTY-1.
- **Lines 303-347 (synthetic backfill `points_transactions` + `wallet_transactions`):** delete the entire block. We don't carry historical totals — order_sync will produce all transactions per-order.

**Risk:** Low. **Files:** `customers.py`.

---

### C3 — Migration `order_sync`: use the shared helper + write per-order audit + grow customer counters
**Closes the `earn_percent` bug + ⚠️-F (migration side).** Per Q-LOYALTY-1 + Q-LOYALTY-5.

- **`migration.py` ~lines 268-331:** rewrite the loyalty block:
  - Drop the broken `loyalty_settings.get("earn_percent", 0)` line. Use full settings dict.
  - Order historical orders by `order_date` ASC before processing (so tier upgrades happen in the right sequence).
  - For each order, after reading the customer doc:
    - `points_earned = calculate_points(order_amount, customer, settings)["total_points"]` (uses shared helper from F1)
    - If `points_earned > 0` AND `loyalty_enabled=True`:
      - Write `points_transactions` row of `type=earn`, with `order_id`, `points`, `balance_after`, `created_at=order_date`
      - `$inc total_points: points_earned, total_points_earned: points_earned, total_visits: 1, total_spent: order_amount`
      - Recompute tier inline using `calculate_tier(new_total_points, settings)` and `$set tier`
    - If `loyalty_enabled=False`:
      - Skip points; still `$inc total_visits: 1, total_spent: order_amount`
  - **Ignore** `mygenie_order.coupon_discount`, `mygenie_order.coupon_code`, `mygenie_order.wallet_used` for migration loyalty purposes (Q-LOYALTY-5). Coupon/wallet handling will be addressed in CR-001C-C and CR-001C-W respectively.
  - Delete the existing `coupon_transactions` write block (lines 301-321) and the existing `$inc total_coupon_used` line. Per Q-LOYALTY-5, historical coupon data is not migrated.

**Risk:** Medium-high (touches migration's main write path). Mitigation: full preview-pod static QA + a dry-run flag option for owner to inspect output before live migration. **Files:** `migration.py`.

---

### C4 — Realtime POS: `$inc total_points_earned`
**Closes ⚠️-F (realtime side).** Per Q-LOYALTY-3.

- **`pos.py` line 1233-1244 update_one $set block:** convert to `$inc` + `$set` combination:
  ```python
  await db.customers.update_one(
      {"id": customer["id"]},
      {
          "$inc": {
              "total_points": points_earned,
              "total_points_earned": points_earned,
              "total_visits": 1,
              "total_spent": order_data.order_amount,
          },
          "$set": {
              "tier": new_tier,
              "wallet_balance": new_wallet_balance,
              "avg_order_value": new_avg_order_value,
              "last_visit": now,
          },
      },
  )
  ```
- Guard the points-related fields with `if settings.get("loyalty_enabled", False)` (C1).

**Note:** This means `new_points = current_points + points_earned` (line 1226) is no longer needed for the write itself; it's still used for the response payload and WhatsApp triggers downstream.

**Risk:** Low — semantic equivalent to current behavior plus the new `total_points_earned` line. **Files:** `pos.py`.

---

### C5 — Manual points redeem: `$inc total_points_redeemed`
**Closes ⚠️-K.** Per Q-LOYALTY-2 (wallet ≠ points means manual redeem IS the only redemption path).

- **`points.py::create_points_transaction` line 41-51:**
  - If `transaction_type=="redeem"`, also `$inc total_points_redeemed: tx_data.points`
  - If `transaction_type=="earn"` or `"bonus"` AND `loyalty_enabled=True`, also `$inc total_points_earned: tx_data.points`
- Convert the update from pure `$set` to `$inc` + `$set` combo (similar shape to C4).

**Risk:** Low. **Files:** `points.py`.

---

### C6 — First-visit bonus: initialize earn counter
**Closes ⚠️-I2 + ⚠️-P partial.** Per Q-LOYALTY-3.

- **`pos.py::_find_or_create_customer` line 622:** when creating the customer:
  - `total_points = first_visit_bonus` (existing)
  - `total_points_earned = first_visit_bonus` (NEW — per Q-LOYALTY-3, bonuses count)
  - `total_points_redeemed = 0` (NEW — explicit)
- Only when `first_visit_bonus_enabled=True` AND `loyalty_enabled=True` (C1).

**Risk:** None. **Files:** `pos.py`.

---

### C7 — Birthday / Anniversary cron: `$inc total_points_earned` + recompute tier
**Closes ⚠️-I + ⚠️-J.** Per Q-LOYALTY-3.

- **`core/loyalty_jobs.py::run_birthday_bonus` lines 55-61** and **`run_anniversary_bonus` lines 140-146:**
  - Replace `$set: {total_points: new_points, last_birthday_bonus_year: ...}` with:
    ```python
    {
        "$inc": {"total_points": bonus_points, "total_points_earned": bonus_points},
        "$set": {
            "tier": calculate_tier(current_points + bonus_points, settings),
            "last_birthday_bonus_year": current_year,
        }
    }
    ```
  - Same shape for anniversary.
- Guard both with `if settings.get("loyalty_enabled", False)` at the top of each job (C1).

**Risk:** Low. **Files:** `core/loyalty_jobs.py`.

---

### C8 — Tier-upgrade WhatsApp from realtime POS path
**Closes ⚠️-H.**

- **`pos.py::pos_order_webhook` ~lines 1225-1244:**
  - Capture `old_tier = customer.get("tier", "Bronze")` BEFORE the update.
  - After the update_one, if `new_tier != old_tier` and `_tier_rank_pos(new_tier) > _tier_rank_pos(old_tier)`, fire `tier_upgrade` WhatsApp event (same shape as `points.py::create_points_transaction` line 89-93).

**Risk:** Low. **Files:** `pos.py`.

---

### C9 — Off-peak: timezone-configurable + cross-midnight support
**Closes ⚠️-D + ⚠️-E.** Per Q-LOYALTY-4.

- **`core/helpers.py::check_off_peak_bonus`:** rewrite to use `zoneinfo.ZoneInfo` (stdlib, Python 3.9+):
  ```python
  from zoneinfo import ZoneInfo
  tz_name = settings.get("restaurant_timezone", "Asia/Kolkata")
  local_time = datetime.now(timezone.utc).astimezone(ZoneInfo(tz_name))
  current_hm = local_time.strftime("%H:%M")
  start = settings.get("off_peak_start_time", "14:00")
  end = settings.get("off_peak_end_time", "17:00")
  if start <= end:
      in_window = start <= current_hm <= end
  else:
      # cross-midnight window e.g. 22:00 - 02:00
      in_window = current_hm >= start or current_hm <= end
  ```
- **`models/schemas.py`** (`LoyaltySettings` / `LoyaltySettingsUpdate`): add `restaurant_timezone: Optional[str] = "Asia/Kolkata"`.
- **`LoyaltySettingsPage.jsx`** frontend: add a timezone dropdown (preset list of common IANA names) — defer if owner says "India only" is fine.

**Risk:** Low. **Files:** `core/helpers.py`, `models/schemas.py`, (optional) `LoyaltySettingsPage.jsx`.

---

### C10 — Defensive init on all customer-create paths
**Closes ⚠️-P.**

- **`pos.py::create_customer` line 258 (CRM manual create):** add `"total_points_earned": 0, "total_points_redeemed": 0` after `"total_points": 0`.
- **`pos.py::_find_or_create_customer` line 622:** covered by C6.
- **`customers.py::sync_customers_from_mygenie` line 173 onwards:** covered by C2.

**Risk:** None. **Files:** `pos.py`.

---

### C11 — Re-sync safety: don't reset loyalty/wallet/coupon counters on existing customers
**Closes ⚠️-Q (the re-sync drift case).**

If a restaurant re-runs Sync Customers after order_sync has already grown counters, the `update_one` at line 275-279 will overwrite them with the freshly-pulled MyGenie snapshot — and per C2 we're now setting that snapshot to ZEROES. So a re-sync would WIPE all customer loyalty/wallet/coupon counters.

- **`customers.py` line 275-279:** when updating an existing customer, build the `$set` dict from `customer_data` **excluding** `total_points`, `total_points_earned`, `total_points_redeemed`, `wallet_balance`, `total_coupon_used`, `last_coupon_used`, `tier`, `total_visits`, `total_spent`, `last_visit`, `avg_order_value`. Update only demographics + addresses + sync metadata.

**Risk:** Medium — silently dropping fields from the update set requires careful testing. Mitigation: explicit allow-list of "safe-to-overwrite" fields rather than deny-list. **Files:** `customers.py`.

---

## Closes summary

After Cn changes ship, all 17 ⚠️ flags from Stage A close as follows:

| ⚠️ Flag | Closed by | Status |
|---|---|---|
| A — `loyalty_enabled` ignored | C1 | ✅ |
| B — Sub-min-order earns 0 but counts visit | — | Intentional, no change |
| C — Default `redemption_value` drift | — | Moot once settings doc exists; no change |
| D — IST hardcoded off-peak | C9 | ✅ |
| E — Off-peak midnight-crossing broken | C9 | ✅ |
| F — `total_points_earned` frozen | C3 + C4 + C5 + C6 + C7 | ✅ |
| G — `total_points_redeemed` frozen | C5 | ✅ (manual-redeem; wallet excluded per Q2) |
| H — No tier-upgrade WhatsApp from POS | C8 | ✅ |
| I — Birthday cron doesn't recompute tier | C7 | ✅ |
| I2 — First-visit doesn't init earn counter | C6 | ✅ |
| J — duplicate of I | C7 | ✅ |
| K — Manual redeem doesn't `$inc redeemed` | C5 | ✅ |
| L — Wallet debit ≠ points redemption | — | Confirmed correct per Q2; no change |
| M — Dashboard misses expired points | — | Deferred to CR-001C-V |
| N — No "expired" card on customer profile | — | Deferred to CR-001C-V |
| O — `/loyalty/value` shows wrong money | C4 + C5 + C6 + C7 | ✅ (cascades naturally) |
| P — Init drift on customer-create | C10 (+ C2 + C6) | ✅ |
| Q — Re-sync overwrites counters | C2 + C11 | ✅ |

---

## Out of scope for CR-001C-L (parked for other modules)

- Coupon-related changes — CR-001C-C
- Wallet-related changes (manual credit/debit logic) — CR-001C-W
- Dashboard / visibility cards — CR-001C-V
- Historical coupon `coupon_transactions` collection migration cleanup — separate CR
- Frontend redesign of CustomerDetail page — only label tweaks if needed during QA

---

## What I'll touch (files summary)

| File | Changes |
|---|---|
| `/app/backend/core/loyalty.py` | **NEW** — extracted `calculate_points()` helper (F1) |
| `/app/backend/core/helpers.py` | C9 — `check_off_peak_bonus` rewrite |
| `/app/backend/core/loyalty_jobs.py` | C7 — birthday + anniversary cron tier recompute + earn counter |
| `/app/backend/routers/pos.py` | F1 (delete moved code), C1, C4, C6, C8, C10 |
| `/app/backend/routers/points.py` | C5 |
| `/app/backend/routers/migration.py` | C3 |
| `/app/backend/routers/customers.py` | C2, C11 |
| `/app/backend/models/schemas.py` | C9 — `restaurant_timezone` field |
| `/app/frontend/src/pages/LoyaltySettingsPage.jsx` | C9 (optional timezone dropdown) |

**Files NOT touched:** `migration.py` migration sync orchestration · `core/pos_request_logger.py` · `core/database.py` · `core/auth.py` · `core/scheduler.py` · `routers/wallet.py` · `routers/coupons.py` · `routers/analytics.py` · `routers/feedback.py` · `services/analytics_service.py` · `routers/scan.py` · `routers/whatsapp.py` · `routers/feedback.py` · `routers/cron.py`.

---

## Test plan (Stages C–F, for reference only)

After approval of this proposal:

- **Stage C — Test Setup:** I'll suggest one test restaurant. Owner will configure loyalty settings (enable toggle, set tier earn %s, set off-peak window, etc.) on that restaurant via the CRM UI. Owner triggers Sync Customers + Sync Orders via UI.
- **Stage D — Live Verify:** Owner pushes 2–3 test POS orders post-migration. I'll inspect `customers`, `points_transactions`, `loyalty_settings` for that restaurant and report whether realtime + migration produce identical-shape data.
- **Stage E — Implementation:** I'll write the 11 code changes in preview pod. Owner reviews diff before approval. Then merge.
- **Stage F — QA + Close:** static QA via Pydantic + monkey-patched DB on the preview pod, plus owner's live test orders. Status flips to `cr001cl_closed_in_preview`.

---

## What this Stage B did NOT do

- ❌ No code touched
- ❌ No DB read or write
- ❌ No migration triggered
- ❌ No supervisor restart
- ❌ No baseline doc updated
- ❌ No other module (Coupons/Wallet/Visibility) inspected

---

## ⏸ Hard Gate — Owner Approval Required

Please reply with one of:

1. **"Approved — proceed to Stage C"** → I propose a test restaurant + sequence; you trigger migration from the UI.
2. **"Approved with changes: drop Cn / modify Cn / add Cm"** → I revise this list and re-park for approval.
3. **"Hold on Cn — need to discuss"** → I clarify the specific change before proceeding.

Status remains: `cr001c_loyalty_change_proposal_awaiting_owner_approval`
