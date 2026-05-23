# CR-001C-L — Loyalty Logic AS-IS Review

**Module:** CR-001C-L (Loyalty)
**Stage:** A — Logic Review (AS-IS only, no change proposals yet)
**Date:** 2026-05-22
**Status:** **`cr001c_loyalty_logic_as_is_review_ready_for_owner_validation`**
**Author:** Read-only inspection of the code on this preview pod (no DB read, no DB write, no migration triggered)

> This document explains, in plain English, **exactly what the loyalty
> code does today**. It does NOT propose changes. It does NOT recommend
> fixes. Observations of inconsistency are flagged with ⚠️ but the
> decision to act on them belongs to Stage B.
>
> Read top-to-bottom. After reading, you'll know:
> 1. What knobs you can configure in the Loyalty Settings page
> 2. Every path through which points / tier / wallet (the loyalty-adjacent fields) get written
> 3. Every observed mismatch between "what the UI shows" and "what the DB stores"
> 4. What the migration seeds on day 0

---

## 1. The Knobs (Loyalty Settings page)

**Backend collection:** `loyalty_settings` (one document per `user_id` = per restaurant)
**Frontend page:** `/app/frontend/src/pages/LoyaltySettingsPage.jsx`
**API:** `GET /api/loyalty/settings` · `PUT /api/loyalty/settings`

When you open the Loyalty Settings page, here is every knob and its default:

| Knob | Field name in DB | Default | Plain English |
|---|---|---|---|
| Loyalty enabled (master toggle) | `loyalty_enabled` | `false` | Turns the whole program on/off (note: most code paths don't check this — see §6 ⚠️-A) |
| Min order value for earning | `min_order_value` | `100.0` | Orders below ₹100 earn 0 points (but still count for visits + spend — see §6 ⚠️-B) |
| Bronze earn % | `bronze_earn_percent` | `5.0` | Bronze customer earns 5% of order amount as points |
| Silver earn % | `silver_earn_percent` | `7.0` | Silver tier earn rate |
| Gold earn % | `gold_earn_percent` | `10.0` | Gold tier earn rate |
| Platinum earn % | `platinum_earn_percent` | `15.0` | Platinum tier earn rate |
| Redemption value | `redemption_value` | `1.0` (in `/loyalty/settings` GET); `0.25` (in POS fallback) ⚠️-C | "1 point = ₹X" — used when redeeming/showing money value |
| Min redemption points | `min_redemption_points` | `50` | Customer needs ≥ 50 points to redeem (or ≥ 100 in the POS fallback ⚠️-C) |
| Max redemption % of bill | `max_redemption_percent` | `50.0` | Can't discount more than 50% of the bill via points |
| Max redemption amount | `max_redemption_amount` | `500.0` | Hard cap on ₹ value of points redeemed per order |
| Tier Silver min | `tier_silver_min` | `500` | Reach this `total_points` → upgraded to Silver |
| Tier Gold min | `tier_gold_min` | `1500` | Reach this → Gold |
| Tier Platinum min | `tier_platinum_min` | `5000` | Reach this → Platinum |
| Points expiry (months) | `points_expiry_months` | `6` | 0 = never expires; otherwise points older than X months expire (in months × 30 days math) |
| Expiry reminder days | `expiry_reminder_days` | `30` | How many days before expiry to send WhatsApp reminder |
| First-visit bonus enabled | `first_visit_bonus_enabled` | `false` (in `/loyalty/settings` default) ; `false` in `pos.py` fallback | Award bonus points on customer's first order |
| First-visit bonus points | `first_visit_bonus_points` | `50` | How many bonus points for first visit |
| Birthday bonus enabled | `birthday_bonus_enabled` | `false` | Award birthday points (cron job) |
| Birthday bonus points | `birthday_bonus_points` | `100` | How many |
| Birthday days before/after | `birthday_bonus_days_before/after` | `0` / `7` | Bonus window around the birthday |
| Anniversary bonus enabled | `anniversary_bonus_enabled` | `false` | Same as birthday, for wedding anniversary date |
| Anniversary bonus points | `anniversary_bonus_points` | `150` | — |
| Anniversary days before/after | `anniversary_bonus_days_before/after` | `0` / `7` | — |
| Off-peak bonus enabled | `off_peak_bonus_enabled` | `false` | Extra bonus during certain hours |
| Off-peak start time | `off_peak_start_time` | `"14:00"` | IST string `"HH:MM"` |
| Off-peak end time | `off_peak_end_time` | `"17:00"` | IST string `"HH:MM"` |
| Off-peak bonus type | `off_peak_bonus_type` | `"multiplier"` | `"multiplier"` or `"flat"` |
| Off-peak bonus value | `off_peak_bonus_value` | `2.0` | If multiplier: `2.0` = 2× points. If flat: `2` = +2 points |

> ⚠️-A: The master `loyalty_enabled` toggle is **declared** on the settings doc but is NOT checked by `pos_order_webhook` or `_calculate_points`. Realtime POS orders will calculate and award points regardless of this toggle.
>
> ⚠️-B: An order of ₹50 (below min_order_value of ₹100) earns 0 points but still increments `total_visits +1` and `total_spent +50`. This is consistent across CR work but worth flagging because it affects tier calculation indirectly (only via points, which stay 0).
>
> ⚠️-C: Default `redemption_value` differs across code paths. The Loyalty Settings GET endpoint defaults to `1.0`, but the POS fallback inside `pos_max_redeemable` defaults to `0.25`. If a restaurant has no `loyalty_settings` doc yet, which value is in force depends on which endpoint is called first. Once the doc is saved, this drift is moot.

---

## 2. How Points Are EARNED (every code path)

Five distinct write paths can grow a customer's `total_points`:

### Path E1 — Realtime POS order (the main path)

**Endpoint:** `POST /api/pos/orders`
**Code:** `pos.py::pos_order_webhook` (line 1174) → `_calculate_points` (734) → `_save_order_and_transactions` (769)

For each order received:

1. Load `loyalty_settings` for the restaurant. If missing, use a hard-coded fallback (`min_order=100, bronze=5, silver=7, gold=10, platinum=15, redemption=0.25, silver=500, gold=1500, platinum=5000`).
2. Find or create the customer (Path C2 below).
3. **`_calculate_points`**:
   - If `order_amount < min_order_value` → **0 points** (and the function returns early; off-peak bonus is also skipped)
   - Otherwise: `base_points = int(order_amount × tier_earn_percent / 100)` (integer truncation — ₹333 × 5% = 16 points, not 16.65)
   - Tier looked up from `customer.tier` field (a snapshot — see §3 for how it's maintained)
   - **Off-peak bonus** (`check_off_peak_bonus` in helpers.py):
     - Computes `local_time = utc_now + 5:30` (hardcoded IST — ⚠️-D not configurable)
     - String-compares `start_time ≤ HH:MM ≤ end_time` (works because "HH:MM" sorts lex-correct — but ⚠️-E breaks if the window crosses midnight, e.g. `22:00`-`02:00`)
     - If multiplier: `off_peak_bonus = int(base_points × (value − 1))`
     - If flat: `off_peak_bonus = int(value)`
   - Returns `total = base + off_peak_bonus`
4. **Customer update** (single `update_one $set` at pos.py:1233-1244):
   - `total_points = current + earned`
   - `tier = calculate_tier(new_total, settings)`
   - `wallet_balance = current_wallet − wallet_used` (validated earlier; insufficient wallet aborts the whole order — see §4)
   - `total_visits += 1`
   - `total_spent += order_amount`
   - `avg_order_value = round(new_total_spent / new_total_visits, 2)`
   - `last_visit = now`
   - ⚠️-F **`total_points_earned` is NOT incremented.**
   - ⚠️-G **`total_points_redeemed` is NOT incremented** (even though wallet was used — but in this codebase wallet ≠ points, so this is arguably correct depending on business intent — flagging because UI shows it).
5. **Transaction logs** (inside `_save_order_and_transactions`):
   - If `points_earned > 0`: insert `points_transactions` row with `transaction_type="earn"`, `points=points_earned`, `order_id`, `balance_after=new_points`, description like `"Earned on order 868899 (Rs.7772)"` (plus `[includes N off-peak bonus]` if applicable)
   - If `wallet_used > 0`: insert `wallet_transactions` row with `transaction_type="debit"`, `amount=wallet_used`, `order_id`
   - Order doc itself is written with embedded `items` (Phase 1 alias-mapped + Phase 2 room_info/associated_order_ids since 2026-05-22)
6. **WhatsApp triggers** fired async (best-effort):
   - `send_bill` event for every order
   - `first_visit` event if `is_new` customer
   - ⚠️-H **No `tier_upgrade` event** is fired by realtime POS even when the order pushed the customer from Bronze → Silver (or any tier change). Tier upgrade WhatsApp fires only via the manual `/api/points/transaction` path (E2).

### Path E2 — Manual points transaction (CRM-side)

**Endpoint:** `POST /api/points/transaction`
**Code:** `points.py::create_points_transaction` (line 19)

Used when a staff member manually adds/redeems points from the Customer Detail page:

1. Loads customer + settings
2. Computes `new_balance = current ± points` (depending on `transaction_type`)
3. Rejects redeem if insufficient
4. Updates customer:
   - `total_points`, `tier`, `last_visit`
   - If `transaction_type=="earn"` AND `bill_amount` given: also increments `total_spent` and `total_visits`
   - ⚠️-F2 **`total_points_earned` / `total_points_redeemed` NOT incremented here either.**
5. Inserts `points_transactions` row
6. WhatsApp triggers:
   - On `redeem` → `points_redeemed` event
   - On `bonus` → `bonus_points` event + `points_earned` event
   - On any tier change (using `_tier_rank` strict-greater comparison) → `tier_upgrade` event ✅

### Path E3 — Quick earn helper (`POST /api/points/earn`)

**Code:** `points.py::earn_points` (line 111)

Same as Path E2 but builds the `tx_data` programmatically from `bill_amount` and the customer's current tier — internally calls Path E2.

### Path E4 — Birthday / Anniversary cron jobs

**Code:** `core/loyalty_jobs.py::run_birthday_bonus` and `run_anniversary_bonus`
**Scheduler:** `core/scheduler.py` runs daily at 00:00 UTC

Each job:

1. Loads all customers with `dob` (or `anniversary`) set
2. For each, checks if today is within `[birthday − days_before, birthday + days_after]` for the current year
3. Skips if `last_birthday_bonus_year == current_year` (idempotency safeguard ✅)
4. Updates customer: `total_points += bonus_points`, sets `last_birthday_bonus_year`
5. Inserts `points_transactions` of `transaction_type="bonus"`, description `"Birthday bonus (2026)"`
6. Fires WhatsApp `birthday` / `anniversary` event
7. ⚠️-F3 **Tier is NOT recalculated** even though `total_points` just grew (could push customer from Silver → Gold but `tier` stays at "Silver" until the next realtime order or manual tx recomputes it). And ⚠️-I `total_points_earned` not incremented.

### Path E5 — First-visit bonus (realtime path only)

**Code:** `pos.py::_find_or_create_customer` (line ~580)

Triggered only when `is_new=True` AND `first_visit_bonus_enabled=True`:

1. Creates the new customer with `total_points = first_visit_bonus_points` (so the bonus is baked in at create time, not added afterwards)
2. Inserts a `points_transactions` row of `transaction_type="bonus"`, description `"First visit bonus - Welcome reward"`
3. The subsequent normal earn path runs ON TOP of this, so a first-time customer with a ₹500 order on a 50-point welcome bonus ends up with: `total_points = 50 + (500 × 5%) = 50 + 25 = 75` and `total_visits = 1`, `total_spent = 500`.

> ⚠️-I2 `total_points_earned` is **not** initialized to the first_visit_bonus value either — the new customer doc just doesn't have that field at all.

---

## 3. How TIER Is Calculated

**Function:** `core/helpers.py::calculate_tier(total_points, settings)`

```
if total_points >= tier_platinum_min:  return "Platinum"
elif total_points >= tier_gold_min:    return "Gold"
elif total_points >= tier_silver_min:  return "Silver"
else:                                  return "Bronze"
```

Pure function on `total_points` only. Has zero memory of "historical highest tier" — i.e. if a customer drops below the threshold (due to redemption or expiry), they downgrade.

**When tier is recalculated:**

| Trigger | Tier recalculated? |
|---|---|
| Realtime POS earn (Path E1) | ✅ Yes (pos.py:1227) |
| Manual `/points/transaction` (Path E2/E3) | ✅ Yes (points.py:39) |
| Birthday/Anniversary cron (Path E4) | ❌ No — points grow but tier field stays stale until next earn ⚠️-J |
| First-visit bonus (Path E5) | Implicit — tier set to `"Bronze"` at create time; would need a separate recompute if first_visit_bonus_points > tier_silver_min |
| Points expiry job (Path R3 below) | ✅ Yes (loyalty_jobs.py:307) |
| Migration sync (Path C3 below) | ✅ Yes (inline in customers.py:236-245) |

---

## 4. How Points Are REDEEMED / WALLET USED

This is the most tangled area — there are **three different concepts** that share the word "redeem" in the UI but mean different things in the code:

### Concept R1 — Manual points redemption (CRM-side staff action)

**Endpoint:** `POST /api/points/transaction` with `transaction_type="redeem"`
**Code:** `points.py::create_points_transaction` (line 19)

- Decrements `customer.total_points`
- Tier recomputed
- ⚠️-K **`total_points_redeemed` NOT incremented** on the customer doc
- ✅ A `points_transactions` row IS written with `type="redeem"` — so `get_points_stats` (dashboard) DOES see this redemption

### Concept R2 — Wallet debit at POS checkout

**Endpoint:** `POST /api/pos/orders` (when `order_data.wallet_used > 0`)
**Code:** `pos.py:1213-1222, 1238, 960-971`

- Validates `wallet_used ≤ customer.wallet_balance`
- Decrements `customer.wallet_balance`
- Writes `wallet_transactions` row with `type="debit"`
- ⚠️-L **NOT counted as "points redeemed"** in the code (`points_transactions` has no row written for this). The customer used **rupees from their wallet**, not points.
- However, the dashboard `get_points_stats` still labels its number as "points_redeemed" — meaning wallet debits are invisible in that number, but might be invisible-by-design (the dashboard has a separate "Wallet Used" card).

### Concept R3 — Points expiry (automatic, scheduled)

**Endpoint:** `POST /api/points/expire` (manual trigger) OR daily cron at 00:00 UTC
**Code:** `core/loyalty_jobs.py::run_points_expiry`

- Finds `points_transactions` rows older than `(now − expiry_months × 30 days)` with `type ∈ {earn, bonus}` and `points_expired != true`
- Marks them as `points_expired=True` (stays in collection for audit)
- Caps `points_to_expire = min(sum_of_expired, current_total_points)` (so we never go below zero)
- Decrements `customer.total_points`, recomputes tier
- Writes a new `points_transactions` row of `transaction_type="expired"` with `source_transaction_ids: [...]` for audit
- ⚠️-M **`get_points_stats` (dashboard) does NOT subtract `expired` transactions** — it sums `earn + bonus` as "issued" and `redeem` as "redeemed". After expiry runs, `points_balance = issued − redeemed` on the dashboard will be HIGHER than the actual sum of `customer.total_points` across all customers. (Effectively `expired` is invisible to the dashboard.)
- ⚠️-N `total_points_redeemed` on the customer doc is **not** touched by expiry (which is arguably correct — expired ≠ redeemed — but worth noting because the customer profile card has no "expired" field).

### Customer-Detail "Loyalty Value" endpoint

**Endpoint:** `GET /api/customers/{id}/loyalty/value`
**Code:** `customers.py:1480-1495`

Returns:
```
points_money_value     = total_points × redemption_value
earned_money_value     = total_points_earned × redemption_value
redeemed_money_value   = total_points_redeemed × redemption_value
total_coupon_used      = customer.total_coupon_used
active_coupons         = list of valid coupons (joined with usage)
```

⚠️-O This endpoint relies on the customer doc's `total_points_earned` and `total_points_redeemed` fields. Because realtime POS (Path E1) doesn't increment them, and Paths E2 / E3 / E4 / R1 / R3 don't either, the "earned_money_value" and "redeemed_money_value" displayed in the UI are **only ever the migration snapshot value**, frozen in time.

---

## 5. How a Customer Document Gets Created (every path)

Three paths can create a customer:

### Path C1 — CRM manual create

**Endpoint:** `POST /api/customers`
**Code:** `pos.py:200+` (the CustomerCreate model handler — confusingly housed in pos.py)

- `total_points = 0`, `total_visits = 0`, `total_spent = 0.0`, `tier = "Bronze"`, `wallet_balance = 0.0`
- ⚠️-P **`total_points_earned` and `total_points_redeemed` keys are NOT in the doc at all** (will read as missing → defaults to 0 in Python `.get(...)`, but they'd appear as `null` in raw Mongo and may need `$exists` care in queries)

### Path C2 — Auto-create from realtime POS order

**Endpoint:** `POST /api/pos/orders` (when `cust_mobile` doesn't match an existing customer)
**Code:** `pos.py::_find_or_create_customer` (line ~530)

- `total_points = first_visit_bonus` (0 if disabled)
- `total_visits = 0`, `total_spent = 0.0`, `tier = "Bronze"`, `wallet_balance = 0.0`
- `lead_source = "POS"`, `mygenie_synced = True` if `user_id` from POS payload present
- ⚠️-P2 Same omission — `total_points_earned` / `total_points_redeemed` not initialized

### Path C3 — Migration sync from MyGenie

**Endpoint:** `POST /api/migration/sync/customers/{user_id}` (or chain-sync)
**Code:** `customers.py::sync_customers_from_mygenie` (line ~140)

- Pulls customer records from MyGenie API
- For each:
  - Computes tier from MyGenie's `loyalty_point` value (inline tier calculation at line 236-245)
  - Sets `total_points = mygenie.loyalty_point`
  - Sets `total_points_earned = int(mygenie.total_points_earned)`
  - Sets `total_points_redeemed = int(mygenie.total_points_redeemed)`
  - Sets `wallet_balance`, `total_wallet_received`, `total_wallet_used`, `total_coupon_used`
- **If NEW customer:** creates 2 synthetic `points_transactions` rows:
  - `type="earn"`, `points=total_points_earned`, description "Historical points (synced from MyGenie)"
  - `type="redeem"`, `points=total_points_redeemed`, description "Historical redemption (synced from MyGenie)"
  - Both stamped with the customer's MyGenie `created_time`
- **If EXISTING customer (re-sync):** the synthetic rows are NOT re-created (only on `not existing` branch). The customer fields ARE re-`$set` to whatever MyGenie currently has — so `total_points_earned`/`total_points_redeemed` are overwritten with MyGenie's fresh snapshot on every re-sync ⚠️-Q (which is fine if MyGenie is authoritative, but causes a one-way drift if any post-migration realtime earn happens between syncs and you ever re-sync).

---

## 6. Dashboard Side: how the Loyalty cards are computed

**Endpoint:** `GET /api/analytics/dashboard`
**Code:** `feedback.py::get_dashboard_stats` → `services/analytics_service.py`

For loyalty specifically, the relevant function is `get_points_stats`:

```
group points_transactions by transaction_type
  points_issued     = sum(points where type ∈ {earn, bonus})
  points_redeemed   = sum(points where type == redeem)
  points_balance    = issued − redeemed
```

**No filter on `points_expired`** — see ⚠️-M above.

**No filter on date** — these are all-time totals.

These three numbers flow into the dashboard's points cards (currently rendered as `total_points_issued`, `total_points_redeemed` per the `DashboardStats` model).

---

## 7. Field Map — every loyalty-adjacent field

| Field | Where it lives | Where it's written | Where it's read | Status |
|---|---|---|---|---|
| `customers.total_points` | Mongo `customers` doc | Migration init · POS earn (E1) · Manual tx (E2/E3) · Bonus cron (E4) · First-visit (E5) · Expiry job (R3) | Customer Detail card "Total Points" · POS bill display · WhatsApp template `{points_balance}` | ✅ Live, all paths converge |
| `customers.total_points_earned` | Mongo `customers` doc | **Only migration init** (line 184) | Customer Detail card "Total Earned" (line 278) · `/loyalty/value` endpoint | ⚠️-F frozen at migration value |
| `customers.total_points_redeemed` | Mongo `customers` doc | **Only migration init** (line 185) | Customer Detail card "Total Redeemed" (line 285) · `/loyalty/value` endpoint | ⚠️-G frozen at migration value |
| `customers.tier` | Mongo `customers` doc | Migration · POS earn · Manual tx · Expiry job | Customer Detail header badge · POS earn % lookup · WhatsApp template `{tier}` | ⚠️-J not refreshed by birthday/anniversary cron |
| `customers.wallet_balance` | Mongo `customers` doc | Migration · POS wallet debit · Manual wallet ops | Customer Detail card · POS validation | ✅ Live |
| `customers.total_visits` | Mongo `customers` doc | Migration init (set to 0) · POS earn (`+=1`) · Manual `earn` with bill_amount | Customer Detail · CustomersPage filters · Dashboard segments | ✅ Live |
| `customers.total_spent` | Mongo `customers` doc | Migration init (set to 0) · POS earn (`+= order_amount`) · Manual `earn` with bill_amount | Customer Detail · CustomersPage filters | ✅ Live |
| `customers.avg_order_value` | Mongo `customers` doc | POS earn (recomputed each order) | (not currently surfaced in UI) | Live |
| `customers.last_visit` | Mongo `customers` doc | POS earn (set to now) · Manual tx (set to now) · Migration (carries MyGenie's value) | Customer Detail · CustomersPage filters · Inactive customer logic | ✅ Live |
| `customers.last_birthday_bonus_year` | Mongo `customers` doc | Birthday cron only | Birthday cron idempotency | ✅ Live |
| `customers.last_anniversary_bonus_year` | Mongo `customers` doc | Anniversary cron only | Anniversary cron idempotency | ✅ Live |
| `customers.last_expiry_reminder` | Mongo `customers` doc | Expiry reminder job | Expiry reminder dedup | ✅ Live |
| `customers.last_points_expiry` | Mongo `customers` doc | Expiry job | Audit only | ✅ Live |
| `points_transactions.*` | Mongo collection | All earn/redeem/bonus/expired writes | Dashboard `get_points_stats` · Customer Detail transactions tab · Expiry reminders · Expiry job | ✅ Source-of-truth for points history |

---

## 8. Observed Inconsistencies (read-only flags — do NOT fix in Stage A)

Re-summarized from the ⚠️ markers above. Each one is a candidate for Stage B (Change Proposal). I am **not** proposing action here — just listing.

| # | Symptom | Where | Severity |
|---|---|---|---|
| ⚠️-A | `loyalty_enabled` master toggle is ignored by realtime POS | `pos.py::pos_order_webhook` doesn't check it | Could be intentional (always-on after migration) — confirm |
| ⚠️-B | Sub-min-order orders still increment visits/spend but earn 0 points | `_calculate_points` returns early; customer update path runs regardless | Likely intentional — confirm |
| ⚠️-C | `redemption_value` default differs (1.0 vs 0.25) between settings endpoint and POS fallback | `points.py:247` vs `pos.py:464` | Moot if settings doc exists; minor |
| ⚠️-D | Off-peak bonus uses hardcoded IST (+5:30) — not configurable per restaurant | `helpers.py::check_off_peak_bonus` | Bug if you ever onboard non-IST restaurants |
| ⚠️-E | Off-peak window can't cross midnight (e.g. 22:00-02:00 won't match anything) | Same | Edge case |
| ⚠️-F | `total_points_earned` never grows on realtime/manual/cron paths — frozen at migration value | `pos.py:1233-1244`, `points.py:41-51`, `loyalty_jobs.py:58-61, 143-146` | **Primary visibility bug** — see Field Map |
| ⚠️-G | `total_points_redeemed` same problem | Same as F | **Primary visibility bug** |
| ⚠️-H | No `tier_upgrade` WhatsApp event from realtime POS path even when tier actually upgrades | `pos.py:1227, 1233` (computes new_tier but never compares to old_tier) | Customer never gets the congrats WhatsApp from a real order — only from manual staff actions |
| ⚠️-I | Birthday/Anniversary cron grows `total_points` without recomputing `tier`, so the tier field stays stale | `loyalty_jobs.py:55-61, 140-146` | Customer might be "Gold-eligible" but doc still says Silver until next order |
| ⚠️-I2 | First-visit bonus doesn't initialize `total_points_earned` on the new customer doc | `pos.py::_find_or_create_customer` | Same family as ⚠️-F |
| ⚠️-J | (duplicate of ⚠️-I) | — | — |
| ⚠️-K | Manual redeem (Path R1) doesn't increment `total_points_redeemed` | `points.py:41-51` | Same family as ⚠️-G |
| ⚠️-L | Wallet debit in POS is NOT a "points redemption" in code — but customer profile UI labels them similarly | `pos.py:960-971` vs CustomerDetailPage.jsx cards | Definitional — confirm business intent |
| ⚠️-M | Dashboard `points_redeemed` does NOT include points expired by the cron job | `analytics_service.py::get_points_stats` | All-time `points_balance` on dashboard drifts upward over time |
| ⚠️-N | `total_points_redeemed` not touched by expiry (likely correct, but no separate "expired" card on customer detail) | `loyalty_jobs.py::run_points_expiry` | Definitional |
| ⚠️-O | `/customers/{id}/loyalty/value` shows incorrect money values because it multiplies the frozen field by redemption_value | `customers.py:1485-1495` | Inherits ⚠️-F + ⚠️-G |
| ⚠️-P | Manual-create customer and POS-auto-create customer don't initialize `total_points_earned` / `total_points_redeemed` at all (missing field, not 0) | `pos.py:258, 622` | Minor — `.get(..., 0)` handles it in Python but Mongo queries with `$exists` may surprise |
| ⚠️-Q | Re-sync of an existing customer overwrites `total_points_earned/redeemed` with MyGenie's fresh value, but does NOT re-create the synthetic backfill `points_transactions` rows | `customers.py:275-279, 304-327` | Drift between customer doc and points_transactions if re-sync used post-go-live |

---

## 9. Test Data Reality Check (no DB queried in this Stage A)

Stage A is code-only inspection. Owner-stated assumption: **pre-production, post-migration go-live, clean data**. Under that assumption:

- At t=0 (go-live), every customer's `total_points / total_points_earned / total_points_redeemed / wallet_balance` reflects MyGenie's snapshot — clean and accurate.
- From t=0 onward, every realtime POS order grows `total_points` correctly but ⚠️-F + ⚠️-G mean `total_points_earned` and `total_points_redeemed` stay frozen at the migration value.
- So one week post-go-live, if a customer earns 200 new points and redeems 50, you'd see:
  - `total_points = migration_value + 200 − 50` ✅ correct
  - `total_points_earned = migration_value` ❌ off by 200
  - `total_points_redeemed = migration_value` ❌ off by 50
  - Dashboard `points_issued` = sum of all `points_transactions` of type earn+bonus ✅ shows the +200 (because realtime DOES write that transaction)
  - Dashboard `points_redeemed` = sum of all `points_transactions` of type redeem ✅ shows the +50 from manual redemption (but ❌ would NOT show wallet-debit-as-redemption per ⚠️-L)

This drift is the central thing CR-001C-L must decide how to resolve in Stage B.

---

## 10. What This Stage A Did NOT Do

- ❌ No code edits
- ❌ No DB queries (we used the prior session's R689 verification, nothing new)
- ❌ No migration triggered
- ❌ No supervisor restarts
- ❌ No frontend rendered
- ❌ No fix proposals (those belong to Stage B, after owner reads this)

---

## 11. Next Step

**Stage B — Validate + Change Approval (HARD GATE).**

Owner reads §1–§8 above. Confirms or pushes back on the 17 ⚠️ flags. Then
I propose, in a separate document, the exact change list for CR-001C-L
based on owner's decisions on each flag. **No code is touched until owner
approves that change list explicitly.**

When ready, reply with one of:
- "**Validated — proceed with Stage B**" (I write the change proposal)
- "**Question on ⚠️-X**" (I clarify before proceeding)
- "**Push back: [reasons]**" (I revise this AS-IS doc)

Status remains: `cr001c_loyalty_logic_as_is_review_ready_for_owner_validation`
