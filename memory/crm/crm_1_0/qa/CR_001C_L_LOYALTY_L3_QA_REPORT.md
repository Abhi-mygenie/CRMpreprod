# CR-001C-L Phase L3 — QA Report

**Module:** CR-001C-L (Loyalty)
**Phase:** L3 — Migration Parity
**QA Run Date:** 2026-05-22
**Status:** **`cr001c_loyalty_l3_migration_parity_qa_passed`**
**Total:** 62 (static) + 55 (controlled) = **117/117 PASSED, 0 FAILED**

---

## 1. Harnesses Executed

| Harness | File | Cases | Pass | Fail |
|---|---|---|---|---|
| Static QA (motor + httpx mocked) | `/tmp/cr_001c_l_l3_static_qa.py` | 62 | **62** | 0 |
| Controlled migration QA (real Mongo, mocked httpx, R689) | `/tmp/cr_001c_l_l3_controlled_qa.py` | 55 | **55** | 0 |
| L1+L2 helper regression smoke | inline python | 5 | **5** | 0 |
| Backend service health | `curl /api/health` | 1 | **1** | 0 |
| Ruff lint | `ruff check` on touched files | 2 | **2** | 0 (¹) |

¹ `customers.py:1539 F841` is a pre-existing unused-var warning unrelated to L3.

---

## 2. Static QA Detail (`/tmp/cr_001c_l_l3_static_qa.py`)

### 2.1 D2 — Missing settings blocks both syncs (6 cases)
| # | Assertion | Result |
|---|---|---|
| D2-cust-1 | customer-sync log status=failed | PASS |
| D2-cust-2 | error message mentions blueprint "D2" | PASS |
| D2-cust-3 | no customer rows written | PASS |
| D2-ord-1 | order-sync log status=failed | PASS |
| D2-ord-2 | error message mentions "D2" | PASS |
| D2-ord-3 | no order rows written | PASS |

### 2.2 C2 + C10-mig — clean_slate hard-init (11 cases)
All 7 counters (`total_points`, `total_points_earned`, `total_points_redeemed`, `wallet_balance`, `total_wallet_received`, `total_wallet_used`, `total_coupon_used`) initialize to 0 on new-customer create regardless of MyGenie aggregate values. `tier` resolves to Bronze via `core.loyalty.calculate_tier`. No synthetic backfill rows written under clean-slate. **PASS** ×11.

### 2.3 Legacy preservation — clean_slate=False keeps current behavior (7 cases)
With `clean_slate=False`, MyGenie aggregate values (`loyalty_point=750`, `total_points_earned=800`, `total_points_redeemed=50`) ARE trusted and stored; synthetic backfill writes 1 earn-row + 1 redeem-row. Tier resolves to Silver (750 ≥ 500 threshold) via shared helper. **PASS** ×7.

### 2.4 C1-mig — kill-switch suppresses points under clean-slate (5 cases)
With `clean_slate=True` + `loyalty_enabled=False`, a ₹500 order causes:
- `total_points` unchanged (0)
- `total_points_earned` unchanged (0)
- `total_visits +1`, `total_spent +500`
- 0 `points_transactions` rows

**PASS** ×5.

### 2.5 C3 + tier evolution — 4-order battery (8 cases)
Battery: o1=₹500 Bronze, o2=₹10000 Bronze→Silver, o3=₹500 Silver, o4=₹200 Silver.

Expected and observed:
- o1: 5% × 500 = 25 → total=25, tier=Bronze
- o2: 5% × 10000 = 500 → total=525, tier=**Silver** (running evolution)
- o3: 7% × 500 = 35 → total=560
- o4: 7% × 200 = 14 → total=574

Final state: `total_points=574`, `total_points_earned=574`, `tier=Silver`, `total_visits=4`, `total_spent=11200`. 4 `points_transactions` rows; sorted points `[14, 25, 35, 500]`; all rows carry original `created_at`. **PASS** ×8.

### 2.6 D1 — Expired pre-mark on old orders (7 cases)
Order dated 730 days ago with `points_expiry_months=6`:
- `points_transactions[0].points_expired == True`
- `points_transactions[0].expired_at` populated
- `points_transactions[0].created_at == old_date` (original date preserved)
- `customer.total_points == 0` (expired NOT added to spendable balance)
- `customer.total_points_earned == 25` (lifetime tracked)

**PASS** ×7.

### 2.7 Re-sync dedup — Running order-sync twice (5 cases)
After 1st run: `total_points=25`, 1 PT row.
After 2nd run (same payload): `total_points=25` STILL, `total_points_earned=25` STILL, 1 PT row STILL. **PASS** ×5.

### 2.8 C11 — Re-sync customer safety (9 cases)
Existing customer with `total_points=575`, `tier=Silver`, `total_visits=5`, `total_spent=5000`, `wallet_balance=100`, `total_coupon_used=2`.
MyGenie payload re-syncs with `loyalty_point=9999`, `total_points_earned=9999`, `name="NewName"`.
Result: ALL 7 counters unchanged. `tier` unchanged. `name` updated (allow-listed). **PASS** ×9.

### 2.9 Coupon skipped under clean-slate (2 cases)
Order with `coupon_code=SAVE10, coupon_discount=50.0` under `clean_slate=True`:
- 0 `coupon_transactions` rows
- `customer.total_coupon_used` unchanged (0)

**PASS** ×2.

### 2.10 Coupon kept under legacy (2 cases)
Same payload with `clean_slate=False`:
- 1 `coupon_transactions` row written
- `customer.total_coupon_used` incremented to 1

**PASS** ×2.

---

## 3. Controlled Migration QA Detail (`/tmp/cr_001c_l_l3_controlled_qa.py`)

Runs against **REAL MongoDB on R689** with httpx MOCKED (no real MyGenie API call). Baseline-aware: handles Stage D leftover data via delta assertions.

R689 pre-test baseline: `customers=1, orders=5, points_transactions=5` (Stage D leftovers, untouched throughout this run).

### 3.1 Round 1 — clean_slate=True, 3 customers + 6 orders (40 cases)

Setup: `loyalty_clean_slate_recalc=True`, `loyalty_enabled=True`, `min_order_value=100`, `points_expiry_months=6`, `first_visit_bonus_enabled=False`, `off_peak_bonus_enabled=False`.

**Customer-sync assertions (23)** — all 3 customers created with all 7 counters init to 0, tier=Bronze. Zero "Historical points" or "Historical wallet" synthetic backfill rows. **PASS** ×23.

**Order-sync assertions (17)** — orders, derivation, deltas:

| Order | Customer | Amount | Date | Expected | Result |
|---|---|---|---|---|---|
| o1 | c1 | ₹500 | recent | +25 pts @ Bronze 5% | PASS |
| o2 | c1 | ₹10000 | recent | +500 pts @ Bronze → upgrades c1 to Silver | PASS |
| o3 | c1 | ₹200 | recent | +14 pts @ Silver 7% (proves tier evolution) | PASS |
| o4 | c2 | ₹500 + coupon SAVE10 ₹50 | recent | +25 pts; coupon SKIPPED | PASS |
| o5 | c2 | ₹500 | OLD (730d ago) | +25 to total_points_earned only; points_expired=True; total_points NOT incremented | PASS |
| o6 | c3 | ₹50 | recent | 0 pts (below min_order); visits + spend grow | PASS |

End-of-round-1 R689 state:
- c1: `total_points=539`, `total_points_earned=539`, `tier=Silver`, `total_visits=3`, `total_spent=10700`
- c2: `total_points=25`, `total_points_earned=50` (expired ≠ 0), `total_visits=2`, `total_spent=1000`, `total_coupon_used=0`
- c3: `total_points=0`, `total_points_earned=0`, `total_visits=1`, `total_spent=50`
- **+5** PT rows (delta from baseline)
- 1 row has `points_expired=True`, `expired_at` populated, `created_at` = OLD_DATE
- 0 `coupon_transactions` rows under clean-slate

**PASS** ×17.

### 3.2 Round 2 — Re-sync same payloads (9 cases)

MyGenie payload mutated to attempt to corrupt c1: `loyalty_point=8888`, `total_points_earned=8888`, `name="C1 RENAMED"`.

C11 results on existing customer:
- `total_points` STILL 539
- `total_points_earned` STILL 539
- `total_visits` STILL 3, `total_spent` STILL 10700, `tier` STILL Silver
- `name` updated to "C1 RENAMED" (allow-listed key)

Dedup results after order-sync re-run:
- PT row delta STILL +5 (no new rows)
- c1 counters STILL 539

**PASS** ×9.

### 3.3 Cleanup (4 cases)
- 3 synthetic customers deleted
- 6 synthetic orders deleted
- 5 synthetic PT rows deleted
- `loyalty_clean_slate_recalc` reverted to `False`
- R689 returned to baseline counts (1 cust, 5 orders, 5 PT — Stage D leftovers untouched)

**PASS** ×4.

---

## 4. Side-Effects & Hygiene

| Item | Confirmation |
|---|---|
| R689 production-safe post-test | `loyalty_clean_slate_recalc=False`, `loyalty_enabled=True`, `min_order_value=0.0` (matches pre-test) |
| Stage D leftover data preserved | 1 customer (T1 First), 5 orders (STAGE-D-T1..T6), 5 PT rows — all untouched |
| No coupon_transactions / wallet_transactions on R689 | Confirmed `0` for both collections |
| Backend supervisor status | `RUNNING` |
| `/api/health` | 200 OK |
| `migration_sync_logs` test rows | Cleaned up (delete on rows created within last 10 minutes of this user) |

---

## 5. Risk Coverage Map

| Risk (from implementation plan §7) | Test that covers it | Status |
|---|---|---|
| Wiping live customer counters on re-sync | §2.8 C11 + §3.2 Round 2 C11 | ✅ PASS |
| Double-counting points on re-sync | §2.7 Dedup + §3.2 Round 2 Dedup | ✅ PASS |
| Wrong tier on mid-history upgrade | §2.5 Tier-evo + §3.1 c1 (Bronze→Silver) | ✅ PASS (within page) |
| Missing `loyalty_settings` silent failure | §2.1 D2 (both syncs) | ✅ PASS |
| Legacy regression for non-clean-slate restaurant | §2.3 Legacy + §2.10 Coupon-keep | ✅ PASS |
| Helper drift between realtime + migration | §2.5 Tier-evo (same helper as realtime) + L1+L2 regression smoke | ✅ PASS |

---

## 6. Outstanding Items (Documented, Not L3)

- L4 — Manual redeem + birthday/anniversary cron `$inc` parity. Not started.
- L5 — Dead-code cleanup (incl. `_calculate_points` wrapper + `pos_payment_received` endpoint). Not started.
- Cross-page non-chronological order ordering — see implementation report §6.1.

---

## 7. Final Status

✅ **L3 migration parity verified end-to-end in preview.**
✅ **R689 production-safe.**
✅ **No regressions in L1 / L2.**

Status: `cr001c_loyalty_l3_migration_parity_qa_passed`

Awaiting owner gate decision per implementation report §8.
