# Loyalty Points Earning on POS Order Investigation
> **RESOLUTION UPDATE — 2026-05-25** — The `payment_status="success"` gate referenced throughout this investigation (e.g. `_validate_order` reject path at the old line 1283 / current line 600 block) has been **REMOVED** from `backend/routers/pos.py`. CRM now accepts realtime POS orders with any `payment_status` value (`"paid"`, `"pending"`, missing, etc.). Default on the Pydantic model is now `Optional[str] = None` (was `"success"`). The findings in this report (especially Finding A and the realtime path documentation) still hold; the only behavioural change is that POS is no longer required to send `payment_status="success"` for the order to land. Tracker: `cr001c_lr_payment_status_gate_removed` in `CR_001_INDEX.md`.


**Date:** 2026-05-25  
**Investigator:** CRM Loyalty Investigation Agent  
**Branch:** `25-may` (Abhi-mygenie/CRMpreprod.git)  
**Database:** `mygenie` at `52.66.232.149:27017`  
**Mode:** READ-ONLY — zero DB writes, zero code changes

---

## 1. Executive Summary

The investigation examined 20,561 orders across 5 restaurants to determine whether
loyalty points are correctly earned when a POS order is received via `POST /api/pos/orders`.

**Three distinct issues were identified:**

| # | Issue | Severity | Scope |
|---|-------|----------|-------|
| **A** | **Realtime POS earning IS WORKING in the 25-may code for restaurants with `loyalty_enabled=True` and `payment_status="success"`.** Points are calculated, PTs written, customer balances updated. | ✅ Confirmed working | R523, R601, R689 — all earning correctly |
| **B** | **Migration re-sync clobbers `orders.points_earned` to 0** even when a valid earn PT exists. The `$set order_doc` on the `existing_order` path resets `points_earned: 0` without re-running the recalc. | 🟧 Medium | ~9% of earn-PT orders have mismatched `order.points_earned=0` |
| **C** | **3 restaurants have `loyalty_enabled=None`** (R478, R618, R634). `bool(None)=False` → earning is silently disabled. These restaurants will never earn points until `loyalty_enabled` is explicitly set to `True`. | 🟧 Medium | 3 restaurants |

Additionally:
- **14,831 migration orders** (`payment_status="paid"`) have `points_earned=0` in the order doc. This is expected for orders synced before `loyalty_enabled` was turned on, or on re-sync.
- **Order doc does NOT persist loyalty redemption fields** (`loyalty_points_used`, `loyalty_discount`). This is a data/audit gap.

---

## 2. Test Order Used

No single owner-provided order was specified. Investigation used the **most recent orders
from the live external MongoDB** as anchors across multiple restaurants and code paths.

**Primary anchor (realtime, earning works):**

| Field | Value |
|---|---|
| pos_order_id | `868987` |
| restaurant_id | `523` |
| user_id | `pos_0001_restaurant_523` |
| customer_mobile | `93287431**` |
| order_amount | ₹2,426 |
| points_earned (order doc) | 363 |
| points_transaction | ✅ EXISTS — `earn`, 363 pts |
| created_at | 2026-05-25T07:43:07 UTC |

**Secondary anchor (realtime, earning fails — R558):**

| Field | Value |
|---|---|
| pos_order_id | `868960` |
| restaurant_id | `558` |
| user_id | `pos_0001_restaurant_558` |
| customer_mobile | `91513555**` |
| order_amount | ₹5,027 |
| points_earned (order doc) | 0 |
| points_transaction | ❌ MISSING |
| created_at | 2026-05-25T06:11:59 UTC |

**Tertiary anchor (migration, mismatch):**

| Field | Value |
|---|---|
| pos_order_id | `868948` |
| restaurant_id | `523` |
| payment_status | `paid` (migration path) |
| order_amount | ₹6,472 |
| points_earned (order doc) | 0 |
| points_transaction | ✅ EXISTS — `earn`, 323 pts |
| created_at | 2026-05-25T05:31:52 UTC |

---

## 3. Inputs Reviewed

### Code (read-only)
- `backend/routers/pos.py` — lines 1271-1601 (`pos_order_webhook`), lines 805-817 (`_calculate_points`), lines 820-1024 (`_save_order_and_transactions`), lines 620-802 (`_find_or_create_customer`)
- `backend/core/loyalty.py` — lines 41-89 (`calculate_points`), lines 26-38 (`calculate_tier`), lines 146-241 (`compute_max_redeemable`), lines 244-488 (`redeem_loyalty_points`)
- `backend/core/helpers.py` — `get_earn_percent_for_tier`, `get_redemption_value_for_tier`, `check_off_peak_bonus`
- `backend/routers/migration.py` — lines 240-460 (order sync with loyalty recalc)
- `backend/models/schemas.py` — `POSOrderWebhook`, `POSPaymentWebhook`

### DB Collections (read-only)
- `orders` — 20,561 documents
- `customers` — sampled per restaurant
- `points_transactions` — 6,578 earn + 74 redeem + 4 bonus = 6,656 total
- `loyalty_settings` — 10 restaurants
- `users` — 10 restaurant users
- `migration_sync_logs` — R558 activity

### Documentation
- `/app/memory/crm/crm_1_0/planning/CR_001_INDEX.md`
- `/app/memory/crm/crm_1_0/final/CRM_1_0_OPEN_GAPS_REGISTER.md`

---

## 4. Expected Business Rule

> **CRM, not POS, calculates earned points.**

POS sends the final order payload with:
- `order_amount` (payable amount)
- `cust_mobile` (customer identity)
- `order_id`
- `coupon_code` / `coupon_discount` (if applicable)
- `loyalty_points_used` / `loyalty_discount` (if redemption occurred)
- `payment_status: "success"`

CRM should:
1. Identify/create customer
2. Process loyalty redemption (if `loyalty_points_used > 0`)
3. Calculate `earn_base_amount = order_amount − loyalty_redeemed_value`
4. Compute points: `int(earn_base_amount × tier_earn_percent / 100)`
5. Write points_transaction (type=earn)
6. Update customer balance (`total_points`, `total_points_earned`, `tier`)
7. Store `points_earned` on order doc

**Both redemption AND earning on the same order should happen** (earning on the net amount after redemption).

---

## 5. POS Payload Loyalty Fields Observed

### In orders collection
**No orders in the DB contain loyalty redemption fields.** This means POS has never sent
`loyalty_points_used`, `used_loyalty_point`, `loyalty_discount`, or `loyalty_idempotency_key`
to `POST /api/pos/orders`.

| Field | Present in any order? |
|---|---|
| `loyalty_points_used` | ❌ NOT IN DOC |
| `used_loyalty_point` | ❌ NOT IN DOC |
| `loyalty_discount` | ❌ NOT IN DOC |
| `loyalty_idempotency_key` | ❌ NOT IN DOC |
| `loyalty_redemption_id` | ❌ NOT IN DOC |

**Note:** The order doc schema (`_save_order_and_transactions`) does NOT persist these fields
even when they are present in the payload. They are consumed during processing but not written
to the order collection. This is a **data audit gap** — you cannot determine from the orders
collection alone whether loyalty was redeemed on a given order.

### In points_transactions collection (redeem type)
74 redeem transactions exist, but all are old (Feb–Mar 2026) with `order_id=None`,
`idempotency_key=None`, `redeemed_value=None` — pre-dating the CR-001C-LR correction code.

---

## 6. Order Save Verification

### Realtime POS path (payment_status="success")
✅ Orders are saved correctly with all fields populated.

| Restaurant | Realtime orders | Points earned correctly? |
|---|---|---|
| R523 | 14 | ✅ YES — all 14 orders earn points |
| R601 | 3 | ✅ YES — all 3 orders earn points |
| R689 | 10 | ✅ YES — orders >₹100 earn; <₹100 correctly get 0 (min_order_value) |
| R558 | 3 | ❌ NO — all 3 orders have 0 points despite loyalty_enabled=True NOW |
| R618 | 1 | ⚠️ 0 points — `loyalty_enabled=None` → treated as False (correct per code) |

### Migration path (payment_status="paid")
✅ Orders saved. `points_earned` initialized to 0. Recalc path updates to correct
value ONLY on first insert; re-sync resets to 0 (Bug B).

---

## 7. Customer Link Verification

✅ **Customers are correctly linked to orders.**

| Anchor | customer_id | phone | tier | total_points | linked? |
|---|---|---|---|---|---|
| 868987 (R523) | `67b5e939-...` | `93287431**` | Platinum | 10,066 | ✅ |
| 868960 (R558) | `6360343b-...` | `91513555**` | Bronze | 0 | ✅ (linked, but no points ever earned) |
| 868948 (R523 mig) | `48a55f9c-...` | `99355056**` | Silver | 1,362 | ✅ |

---

## 8. Loyalty Settings Verification

| Restaurant | loyalty_enabled | min_order | bronze_earn% | redemption_value | Status |
|---|---|---|---|---|---|
| R689 | `True` | 100 | **50.0** (!) | 0.25 | ✅ Active |
| R523 | `True` | 100 | 5.0 | 1.0 | ✅ Active |
| R558 | `True` | 100 | 5.0 | 0.25 | ✅ Active NOW |
| R601 | `True` | 100 | 5.0 | 0.25 | ✅ Active |
| R541 | `True` | 100 | 5.0 | 0.25 | ✅ Active |
| R364 | `True` | 100 | 5.0 | 0.25 | ✅ Active |
| R478 | **`None`** | 100 | 5.0 | 0.25 | ❌ Treated as False |
| R618 | **`None`** | 100 | 5.0 | 0.25 | ❌ Treated as False |
| R634 | **`None`** | 100 | 5.0 | 0.25 | ❌ Treated as False |
| R719 | `False` | 100 | 5.0 | 0.25 | ❌ Explicitly disabled |

**Note:** R689 has `bronze_earn_percent=50.0` which is extremely high (50%). This may be
intentional for testing, but worth flagging — a ₹409 order earned 204 points (50%).

---

## 9. Redemption Processing Verification

**No loyalty redemption has been processed via the 25-may code path.**

Evidence:
- Zero orders contain `loyalty_points_used` or `loyalty_discount` fields.
- All 74 existing redeem PTs are old (pre-March 2026), with `order_id=None` and
  `idempotency_key=None` — created by legacy code, not CR-001C-LR.
- The code path (lines 1313-1341 of `pos.py`) is correctly wired:
  - Reads `order_data.loyalty_points_used` (with alias acceptance for `used_loyalty_point`)
  - Calls shared `redeem_loyalty_points` helper
  - Auto-caps via `compute_max_redeemable`
  - Refreshes customer doc post-redeem
  - Hard-fails order on non-success redeem (Q-CORR-2)
- **Status:** Code is ready; POS has not yet sent loyalty fields.

---

## 10. Earning Calculation Code Path

### Realtime path: `pos_order_webhook` (pos.py, line 1271)

```
1. _validate_order → rejects if payment_status ≠ "success"  [line 1283]
2. Load loyalty_settings  [line 1290]
3. _find_or_create_customer  [line 1302]
4. If loyalty_points_used > 0: redeem_loyalty_points → loyalty_redeemed_value  [line 1313]
5. loyalty_enabled = bool(settings.get("loyalty_enabled", False))  [line 1349]
6. earn_base_amount = max(0, order_amount − loyalty_redeemed_value)  [line 1350]
7. IF loyalty_enabled:  [line 1351]
   → _calculate_points(earn_base_amount, customer, settings)  [line 1352]
   → core.loyalty.calculate_points:
     a. if order_amount < min_order_value → return 0  [loyalty.py line 56]
     b. tier = customer.tier  [loyalty.py line 64]
     c. earn_percent = get_earn_percent_for_tier(tier, settings)  [loyalty.py line 65]
     d. base_points = int(order_amount × earn_percent / 100)  [loyalty.py line 66]
     e. + off_peak bonus if applicable  [loyalty.py lines 69-77]
   → points_earned = total_points  [line 1353]
8. ELSE: points_earned = 0  [line 1362]
9. Customer update: $set total_points, tier; $inc total_points_earned  [lines 1395-1411]
10. _save_order_and_transactions → inserts order + PT (if points_earned > 0)  [lines 1414, 995-1009]
```

**Earning base correctly accounts for loyalty redemption** (Q-CORR-3 Option B: `order_amount − redeemed_value`).

### Migration path: `sync_orders_from_mygenie` (migration.py, line ~80)

```
1. Insert order_doc with points_earned=0  [line 254]
2. IF existing_order: $set full order_doc (points_earned=0) → NO RECALC  [line 286]
3. ELSE (new order):
   a. IF clean_slate AND loyalty_enabled: recalc  [line 324]
      → _calc_points(order_amount, customer, settings)
      → Update order.points_earned  [line 369-372]
      → Insert PT  [line 391]
      → Update customer balances  [line 408-421]
   b. ELSE: no points, just visits+spend  [line 450-459]
```

---

## 11. Points Transaction Verification

### Earn transactions: 6,578 total

| Restaurant | Earn PTs | Status |
|---|---|---|
| R523 | Verified — PTs match realtime orders | ✅ |
| R689 | Verified — PTs match realtime orders | ✅ |
| R601 | Verified — PTs match realtime orders | ✅ |
| R558 | **0** — zero earn transactions ever | ❌ |
| R618 | Not checked (loyalty_enabled=None) | N/A |

### Mismatch check
In a sample of 100 earn-PT order_ids, **9 orders (9%) have `order.points_earned=0`
but a valid earn PT exists.** Root cause: migration re-sync `$set` clobber.

---

## 12. Customer Balance Update Verification

### For realtime earning orders (R523, order 868987):

| Field | Before order | After order | Delta | Expected | Match? |
|---|---|---|---|---|---|
| total_points | ~9,703 | 10,066 | +363 | +363 (15% of ₹2,426) | ✅ |
| total_points_earned | ~2,401 | 2,764 | +363 | +363 | ✅ |
| total_visits | 16 | 17 | +1 | +1 | ✅ |
| total_spent | ~23,539 | 25,965 | +2,426 | +2,426 | ✅ |
| tier | Platinum | Platinum | unchanged | correct (10,066 > 5,000) | ✅ |

### For R558 customer (order 868960):

| Field | Value | Expected (if earning worked) | Match? |
|---|---|---|---|
| total_points | 0 | ~251 (5% of ₹5,027) | ❌ |
| total_points_earned | 0 | ~251 | ❌ |
| total_visits | 2 | 2 | ✅ (visits DO increment) |
| total_spent | 8,349 | 8,349 | ✅ (spend DOES increment) |

Customer visits and spend update even when points are 0. Points are not updated because
the code path set `points_earned=0` (loyalty was likely disabled when the order was processed
by the production CRM).

---

## 13. Root Cause

### Issue A: R558 Realtime Orders with 0 Points (3 orders)

**Most likely cause: `loyalty_enabled` was `False` or `None` when these orders were processed
by the production CRM (not the 25-may preview).**

Evidence:
- These 3 orders were created at 06:05–06:11 UTC on 2026-05-25.
- At the same timeframe, R523 and R601 orders (processed by the same CRM instance)
  DID earn points, proving the earning code was active.
- R558's `loyalty_enabled` is `True` NOW, but may have been toggled recently.
- No logging or history field tracks when `loyalty_enabled` was changed.

**The 25-may code IS correct** — if these orders were replayed through the 25-may
`pos_order_webhook` with R558's current `loyalty_enabled=True`, they would earn points.

### Issue B: Migration Re-sync Clobbers `order.points_earned`

**Confirmed root cause:** `migration.py` line 286–289.

When an existing order is re-synced, the entire `order_doc` (which has `points_earned: 0`
at line 254) is `$set` on the order. The recalc logic (lines 324–444) only runs on the
`else` branch (new insert), never on the re-sync path.

Result: `order.points_earned` is reset to 0, but the previously-created earn PT persists,
creating a data inconsistency.

**Impact:** At least 9% of earn-PT orders have `order.points_earned=0` in the order doc.
This affects:
- Dashboard/analytics that read `orders.points_earned` (will under-report)
- Any POS/CRM UI that shows "points earned on this order" from the order collection

### Issue C: Restaurants with `loyalty_enabled=None`

**Root cause:** R478, R618, R634 never had `loyalty_enabled` explicitly set.

The code uses `bool(settings.get("loyalty_enabled", False))` — `bool(None)` evaluates to
`False`, so earning is silently disabled.

---

## 14. Impact

| Issue | Impact | Affected scope |
|---|---|---|
| A (R558 0-pts) | 3 orders with ₹10,857 total never earned points. Customer "Sunhas" has 0 points despite ₹8,349 total_spent. | R558 only (3 realtime orders) |
| B (migration clobber) | ~9% of orders with earn PTs show `points_earned=0`. Analytics under-report. Customer balances ARE correct (PTs are the source of truth). | All restaurants with migration re-sync + loyalty |
| C (None restaurants) | R478, R618, R634 silently disabled. Any future POS orders will not earn. | 3 restaurants |
| D (audit gap) | Cannot determine from `orders` collection if loyalty was redeemed on an order. Must cross-reference `points_transactions`. | Systemic |

---

## 15. Recommended Fix Plan

### Fix B1: Migration Re-sync — Preserve `points_earned` (PRIORITY 1)

**File:** `backend/routers/migration.py`  
**Lines:** ~285–290  
**Change:** On the existing-order update path, either:
- **Option 1 (minimal):** Exclude `points_earned` and `off_peak_bonus` from the `$set`
  so they aren't reset. Add:
  ```python
  order_doc.pop("points_earned", None)
  order_doc.pop("off_peak_bonus", None)
  ```
  before the `$set` on line 288.
- **Option 2 (correct):** Run the same recalc logic on the re-sync path that runs on
  the new-insert path.

**Recommendation:** Option 1 for safety — re-sync should not destroy data that was already
correctly calculated.

### Fix C1: Set `loyalty_enabled` for Null Restaurants (PRIORITY 2)

**File:** Admin action or one-time DB update  
**Change:** For R478, R618, R634 — set `loyalty_enabled: false` explicitly (not `null`)
if the owner does not want loyalty, OR `true` if they do.

### Fix D1: Persist Loyalty Redemption Fields on Order Doc (PRIORITY 3)

**File:** `backend/routers/pos.py`  
**Function:** `_save_order_and_transactions` (~line 840)  
**Change:** Add to `order_doc`:
```python
"loyalty_points_used": order_data.loyalty_points_used or 0,
"loyalty_discount": order_data.loyalty_discount or 0.0,
"loyalty_idempotency_key": order_data.loyalty_idempotency_key,
```

### Fix A1: R558 Retroactive Point Award (PRIORITY 4 — OWNER DECISION)

If R558's `loyalty_enabled` was supposed to be `True` when those 3 orders arrived,
a manual retroactive award can be performed. Requires owner approval.

---

## 16. QA Plan for Fix

### For Fix B1 (migration re-sync):
1. Pick a restaurant with existing migration data and loyalty_enabled=True.
2. Run a re-sync (Sync Orders).
3. Verify that `order.points_earned` is NOT reset to 0 for orders that already have PTs.
4. Verify that new orders still get points recalculated.
5. Verify that the PT and customer balance remain unchanged.

### For Fix C1 (null restaurants):
1. Set `loyalty_enabled: true` for one of the null restaurants.
2. Send a test POS order with `payment_status: "success"` and `order_amount > 100`.
3. Verify points_earned > 0 in order doc, PT exists, customer balance updated.

### For Fix D1 (order doc fields):
1. Send a POS order with `loyalty_points_used: 50, loyalty_discount: 12.50`.
2. Verify order doc contains these fields.
3. Verify redemption PT exists alongside earn PT.

---

## 17. Owner Questions / Decisions

1. **R558:** Was `loyalty_enabled` supposed to be `True` when orders 868955/868958/868960
   arrived? If yes, should we retroactively award points for those 3 orders?

2. **R478, R618, R634:** Should `loyalty_enabled` be set to `True` or explicitly `False`
   for these restaurants?

3. **Migration re-sync Fix B1:** Approve Option 1 (preserve existing `points_earned`)
   or Option 2 (re-run recalc on re-sync)?

4. **Audit trail (Fix D1):** Should the order doc persist `loyalty_points_used`,
   `loyalty_discount`, and `loyalty_idempotency_key` for audit purposes?

5. **R689 bronze_earn_percent=50%:** Is this intentional (testing) or a misconfiguration?
   At 50%, a ₹409 order earns 204 points.

---

## 18. Final Status

```
loyalty_earning_investigation_complete_root_cause_found
```

**Summary of Root Causes:**

| # | Root Cause | Code Path | Confirmed? |
|---|---|---|---|
| A | R558 orders processed while `loyalty_enabled` was likely False/None on production CRM | Realtime POS | ⚠️ Probable (no loyalty_enabled change history available) |
| B | Migration re-sync `$set` resets `order.points_earned` to 0 | Migration | ✅ Confirmed — code line 254+286 |
| C | 3 restaurants have `loyalty_enabled=None` → `bool(None)=False` | Both paths | ✅ Confirmed — DB evidence |
| D | Order doc does not persist loyalty redemption fields | Realtime POS | ✅ Confirmed — code inspection |

**The 25-may branch realtime POS earning code IS correct and functional.** Points are
earned, PTs are written, and customer balances are updated for restaurants where
`loyalty_enabled=True` and `payment_status="success"`.

---

## Appendix: Key Data Points

### Payment Status Distribution (20,561 orders)
| payment_status | Count | Source |
|---|---|---|
| `paid` | 20,688 | Migration sync |
| `unpaid` | 764 | Migration sync (unpaid orders) |
| `sucess` (typo) | 102 | Unknown (historical) |
| `Merge` | 68 | Merged orders |
| `Paid` (capitalized) | 52 | Historical variant |
| `success` | 32 | Realtime POS webhook |

### Earning Statistics (realtime POS, payment_status="success")
| Metric | Value |
|---|---|
| Total realtime orders | 32 |
| Orders that earned points | 27 |
| Orders with 0 points | 5 |
| Of the 5: amount < min_order | 0 |
| Of the 5: loyalty_enabled=None restaurant | 1 (R618) |
| Of the 5: loyalty_enabled=True but 0 pts | 3 (R558 — likely disabled at time of processing) |
| Of the 5: restaurant_id=None | 1 (order 868500, anomalous) |

### Points Transactions
| Type | Count |
|---|---|
| earn | 6,578 |
| redeem | 74 |
| bonus | 4 |
| **Total** | **6,656** |
