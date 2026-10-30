# CR-001C-L — Stage C Test Setup (L1 + L2 ONLY)

**Module:** CR-001C-L (Loyalty)
**Stage:** C — Test Setup
**Scope:** **L1 + L2 ONLY.** L3, L4, L5 not covered here.
**Date:** 2026-05-22
**Status:** **`cr001c_loyalty_stage_c_test_setup_awaiting_owner_approval`**

> Stage C proposes WHAT to test, HOW to test it, and WHAT to look at.
> Stage D actually runs the tests (owner triggers from CRM UI / POS calls).
> **No code, DB, env, migration, sync, or implementation in this stage.**

---

## 1. What Stage C verifies

L1 + L2 together must demonstrate:

| # | Behavior to confirm | Source of truth |
|---|---|---|
| 1 | A realtime POS order on a `loyalty_enabled=true` restaurant grows both `total_points` AND `total_points_earned` by the same `points_earned` amount | C4 |
| 2 | The same order on a `loyalty_enabled=false` restaurant grows NEITHER counter (but DOES grow `total_visits`, `total_spent`, `wallet_balance`) | C1-realtime |
| 3 | A first-visit customer with welcome bonus has `total_points_earned` initialized to `first_visit_bonus_points` (not absent, not 0) | C6 |
| 4 | A POS-auto-created customer has `total_points_earned=0` and `total_points_redeemed=0` set explicitly | C10-POS |
| 5 | An order whose `order_amount < min_order_value` earns 0 points but still increments visits + spend | regression of ⚠️-B (intentional behavior, must not change) |
| 6 | Repeated orders correctly push the customer through tier upgrades (Bronze → Silver → Gold → Platinum) | tier recompute in C4 |
| 7 | Phase 1 + Phase 2 alias mapping (`created_at` → `order_created_at`, `item_id` → `pos_food_id`, `room_info`, `associated_order_ids`) all still pass — **no regression** | CR-001A regression |
| 8 | The new shared helper `core/loyalty.py::calculate_points()` produces **bit-for-bit identical results** to the old inline `_calculate_points()` over a synthetic battery (parity) | L1 parity tests |

> Stage C **does not** test L3 (migration) or L4 (manual redeem + cron).
> Those are separate Stage C cycles per owner direction.

---

## 2. Test Bed Setup (Owner Actions)

These are the prerequisites I need YOU to do via CRM UI before Stage D runs.

### 2.1 Test Restaurant

| Choice | What |
|---|---|
| 🅰 **Use a fresh restaurant** (recommended) | Create a new user/restaurant in CRM UI named "Loyalty CR Test" or similar. POS auth: use the API key/token CRM gives you. This avoids any pollution from prior test data on R478 or R689. |
| 🅱 Use an existing restaurant in shared Mongo | Pick e.g. R478. Old test customers/orders will exist alongside the new test rows. Slightly noisier. |

Reply with the restaurant ID + API key (or paste the auth header) after creating, e.g. `R-LOYTEST-001` + `X-API-Key: dp_...`.

### 2.2 Loyalty Settings to Configure

Open Loyalty Settings page for the test restaurant. Configure these exact values for reproducible results:

| Setting | Value |
|---|---|
| `loyalty_enabled` | **`true`** (master kill-switch ON) |
| `min_order_value` | `100` |
| `bronze_earn_percent` | `5.0` |
| `silver_earn_percent` | `7.0` |
| `gold_earn_percent` | `10.0` |
| `platinum_earn_percent` | `15.0` |
| `redemption_value` | `1.0` |
| `min_redemption_points` | `50` |
| `max_redemption_percent` | `50` |
| `max_redemption_amount` | `500` |
| `tier_silver_min` | `500` |
| `tier_gold_min` | `1500` |
| `tier_platinum_min` | `5000` |
| `first_visit_bonus_enabled` | **`true`** |
| `first_visit_bonus_points` | `50` |
| `birthday_bonus_enabled` | `false` (L4 territory, skip for Stage C) |
| `anniversary_bonus_enabled` | `false` (L4 territory) |
| `off_peak_bonus_enabled` | `false` (C9 deferred, skip for Stage C) |
| `points_expiry_months` | `6` |

Save. Then verify in Mongo:
```js
db.loyalty_settings.findOne({user_id: "<TEST_USER_ID>"})
```
Should show all the values above.

### 2.3 Pre-Stage-D State Snapshot (I'll do this)

Right before you push the first test order, I will run a baseline snapshot:

```js
// Customer count
db.customers.countDocuments({user_id: "<TEST_USER_ID>"})
// Order count
db.orders.countDocuments({user_id: "<TEST_USER_ID>"})
// Points transactions count
db.points_transactions.countDocuments({user_id: "<TEST_USER_ID>"})
```

This establishes "0 + 0 + 0" (or current values) so we know exact deltas.

---

## 3. Test Order Sequence (8 orders + 1 parity harness)

Each test order is one HTTP request via Postman/curl. I provide the exact payload; you trigger it; I verify the resulting Mongo state.

> **NOTE on L1+L2 not yet implemented:** This Stage C plan is the *expected behavior post-L1+L2*. If we run these tests BEFORE L1+L2 ships, we will see the CURRENT (broken) state for some of these (specifically: `total_points_earned` will NOT grow, kill-switch will NOT block). That's exactly the drift we capture in Stage D — it confirms the bug is real before fixing it in Stage E.

### T1 — First-visit customer with welcome bonus
**Setup:** brand-new mobile number that doesn't exist in DB yet.
**Payload:**
```json
{
  "restaurant_id": "<TEST_USER_ID>",
  "order_id": "STAGE-C-T1",
  "cust_mobile": "+919900000001",
  "cust_name": "Test First Visit",
  "order_amount": 500,
  "created_at": "2026-05-22T10:00:00Z",
  "items": [{"item_name":"tea","item_id":"1","qty":1,"price":500}]
}
```
**Expected post-L1+L2:**
- New `customers` doc with: `total_points = 50 + 25 = 75` (welcome bonus + earn), `total_points_earned = 75`, `total_points_redeemed = 0`, `tier = "Bronze"`, `total_visits = 1`, `total_spent = 500`
- 2 `points_transactions` rows: one `type=bonus` (50 pts, "First visit bonus"), one `type=earn` (25 pts, "Earned on order STAGE-C-T1")
**Current (broken) prediction:** Same, EXCEPT `total_points_earned` will be **absent** from the new customer doc (because POS-create doesn't init it today).

### T2 — Repeat customer earns at Bronze
**Setup:** same mobile as T1, second order.
**Payload:** same shape, `order_id=STAGE-C-T2`, `order_amount=200`.
**Expected post-L1+L2:** `total_points = 75 + 10 = 85`, `total_points_earned = 75 + 10 = 85`, `total_visits = 2`, `total_spent = 700`, `tier = "Bronze"`.
**Current prediction:** `total_points = 85` ✅ but `total_points_earned` still **absent** ❌.

### T3 — Pushes customer over Silver threshold
**Setup:** same mobile, `order_amount=10000` (large bill to force tier upgrade).
**Expected post-L1+L2:** earn = `int(10000 × 5% = 500)` → `total_points = 85 + 500 = 585` → tier recomputed → **`tier = "Silver"`**, `total_points_earned = 85 + 500 = 585`, `total_visits = 3`, `total_spent = 10700`.
**Current prediction:** `total_points = 585`, `tier = "Silver"` ✅ but `total_points_earned` absent ❌.

### T4 — Next order earns at Silver % (proves tier was refreshed)
**Setup:** same mobile, `order_amount=200`.
**Expected post-L1+L2:** earn at silver = `int(200 × 7% = 14)` → `total_points = 599`, `total_points_earned = 599`.
**Current prediction:** Same numbers for `total_points`; `total_points_earned` still absent.

### T5 — Sub-min-order
**Setup:** new mobile (or same), `order_amount=50` (below min_order_value=100).
**Expected post-L1+L2:** `points_earned = 0`, no `points_transactions` row written. BUT `total_visits +=1`, `total_spent += 50`. No change to `total_points_earned` (since 0 was added).
**Current prediction:** Same — this is intentional behavior, regression-only check.

### T6 — Kill-switch ON → OFF mid-test
**Setup:** Owner toggles `loyalty_enabled=false` in CRM UI. Then push:
```json
{"restaurant_id": "<TEST_USER_ID>", "order_id": "STAGE-C-T6", "cust_mobile": "+919900000001", "order_amount": 500, ...}
```
**Expected post-L1+L2:**
- `total_points` UNCHANGED, `total_points_earned` UNCHANGED, `tier` unchanged
- NO `points_transactions` row written
- `total_visits +=1`, `total_spent += 500`, `wallet_balance` unchanged (no wallet_used)
**Current (broken) prediction:** Kill-switch is currently ignored → `total_points` and `tier` WILL grow even though toggle is off. **This drift is the bug Stage D will confirm.** After flip toggle back to `true` for remaining tests.

### T7 — Wallet usage (regression — ensure L1+L2 didn't break wallet path)
**Setup:** same mobile, `order_amount=200, wallet_used=50` (only if customer has ≥50 wallet_balance — likely 0 by default since wallet is L4/CR-001C-W territory). Owner may need to manually credit wallet first via Customer Detail page → Wallet → +₹100, then push:
```json
{"restaurant_id": "<TEST_USER_ID>", "order_id": "STAGE-C-T7", "cust_mobile": "+919900000001", "order_amount": 200, "wallet_used": 50, ...}
```
**Expected post-L1+L2:** points still earned on **full** order_amount (D4 lock) = `int(200 × silver%=7) = 14`. `wallet_balance -= 50`. `total_points_redeemed` UNCHANGED (Q-LOYALTY-2: wallet ≠ points).
**Current prediction:** Same — wallet path unchanged by L1+L2.

### T8 — CRM-manual customer create (C10 init path)
**Setup:** Open CRM UI → Customers → Add Customer → fill in a fresh mobile number. Save.
**Expected post-L1+L2:** new `customers` doc with `total_points_earned=0`, `total_points_redeemed=0` explicitly present (not absent).
**Current prediction:** Both fields absent.

### Parity Harness — L1 helper bit-for-bit
This is something I run on the preview pod (read-only, no DB). Battery of 30 synthetic inputs to `_calculate_points()` (old) vs `calculate_points()` (new from `core/loyalty.py`). Assert identical output dict. Required before L2 deploys.

---

## 4. Mongo Queries I'll Run (per test order)

After each Tn:

```js
// Customer state
db.customers.findOne(
  {user_id: "<TEST_USER_ID>", phone: "+919900000001"},
  {_id:0, name:1, total_points:1, total_points_earned:1, total_points_redeemed:1, tier:1, total_visits:1, total_spent:1, wallet_balance:1, last_visit:1}
)

// Last order
db.orders.findOne({user_id: "<TEST_USER_ID>", pos_order_id: "STAGE-C-Tn"})

// Points transactions for this order
db.points_transactions.find({user_id: "<TEST_USER_ID>", order_id: "<the order id>"}).toArray()
```

I'll paste the JSON of each into the Stage D report alongside expected vs current vs post-L1+L2.

---

## 5. Stage D Pass / Fail Criteria

Stage D (the actual run) is PASS when **all 8 tests + parity harness** produce post-L1+L2 expected results, AND CR-001A Phase 1+2 regression still passes.

Stage D is FAIL when any single test deviates from post-L1+L2 expected (and the deviation isn't explained by current code being unfixed). At that point we iterate Stage E (implementation) and re-run.

---

## 6. What Owner Does in Stage D (one-pager)

1. Confirm L1+L2 has been implemented on preview pod (signal from me).
2. Run T1–T8 (8 curl/Postman calls + toggle one setting + manual customer create + manual wallet credit).
3. After each call, paste the response back to me (or just give the timestamps; I'll fetch from Mongo).
4. I run the Mongo queries from §4 and produce the Stage D report.
5. We compare against §3 expected results. Pass → proceed to Stage E approval (final diff review). Fail → iterate.

Time estimate for owner: **~15 minutes** of actual hands-on work + my read-only verification.

---

## 7. What Stage C Does NOT Include

- ❌ Any migration tests (that's L3 Stage C, future cycle)
- ❌ Any coupon tests (CR-001C-C)
- ❌ Any wallet write-path tests (CR-001C-W) — only Stage C regression on wallet debit at POS to ensure L1+L2 didn't break it (T7)
- ❌ Any dashboard tests (CR-001C-V)
- ❌ Birthday / anniversary cron tests (L4)
- ❌ Manual `/api/points/transaction` redeem tests (L4)
- ❌ Off-peak bonus tests (C9 deferred)
- ❌ Tier-upgrade WhatsApp tests (C8 deferred)
- ❌ The `loyalty_clean_slate_recalc` config flag testing (L3)

---

## 8. Confirmations

- ✅ No code written by this Stage C
- ✅ No backend / frontend / DB / env touched
- ✅ No migration / sync triggered
- ✅ No deploy / supervisor restart
- ✅ `/app/memory/final/` untouched
- ✅ Baseline docs untouched
- ✅ Only this Stage C plan file created (plus the 3 wording refinements to the scope lock made via search_replace)

---

## ⏸ Hard Gate — Owner Action Required

Reply with one of:

1. **"Approved — proceed to set up test bed"** → I wait for you to:
   (a) confirm test restaurant choice (🅰 fresh / 🅱 existing R478) and share its `user_id` + API auth header,
   (b) configure loyalty settings per §2.2,
   (c) signal ready.
   Then I (a) write L1+L2 code in preview pod and (b) run parity harness + post the diff for your approval.

2. **"Modify test plan: …"** → I revise this Stage C doc.

3. **"Run a different test instead: …"** → I adjust.

Status remains: `cr001c_loyalty_stage_c_test_setup_awaiting_owner_approval`

> Once Stage C is approved and you've configured the test bed, the next
> step is Stage E (Implementation) of L1+L2 in preview, followed by
> Stage D (you run the 8 tests). After Stage D passes, we close L1+L2
> in preview and start the L3 cycle separately.
