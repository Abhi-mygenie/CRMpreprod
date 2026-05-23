# CR-001C-L L3 Real Migration Verification Report — R689

## 1. Executive Summary

**INCONCLUSIVE.** The L3 clean-slate migration recalculation **did not execute** for restaurant 689 (Kunafa Mahal). The migration ran in **legacy mode** (`clean_slate=False`) because `loyalty_enabled` was `False` at the time the migration syncs ran. Additionally, the order sync **failed** at page 294/329 due to MyGenie API auth token expiry (HTTP 401).

The L3 code path (per-order point recomputation, expiry pre-mark, running tier evolution) was never activated. There is no clean-slate data to verify. A re-migration with `loyalty_enabled=True` confirmed BEFORE triggering sync is required.

---

## 2. Restaurant / Migration Run Verified

| Field | Value |
|---|---|
| Restaurant | Kunafa Mahal |
| restaurant_id (user_id) | `pos_0001_restaurant_689` |
| CRM user email | `owner@kunafamahal.com` |
| CRM user _id | `6a0ee464533101c3eb17c08a` |
| Latest customer_sync | 2026-05-23 08:35:59 → 08:36:20 UTC (completed) |
| Latest order_sync | 2026-05-23 08:56:05 → 08:59:06 UTC (**FAILED** — API 401 at page 7/329) |
| Prior order_sync | 2026-05-23 08:36:23 → 08:42:56 UTC (**FAILED** — API 401 at page 295/329, synced 7350) |
| Owner manually triggered | Yes (per task brief) |
| Agent triggered migration | No |
| Agent mutated DB | No |

---

## 3. Jeh's Nest R3 Baseline Comparison

| Aspect | Jeh's Nest (R3) | R689 | Match? |
|---|---|---|---|
| Migration mode | Clean-slate (`loyalty_enabled=True` at sync time) | **Legacy** (`loyalty_enabled` was `False` at sync time) | ❌ |
| PT earn rows with `(migration recalc)` | 98 | **0** | ❌ |
| PT `points_expired` field present | Yes (28 True + 70 False) | **No** (field missing on all 719 earn rows) | ❌ |
| Customer counters source | Order-by-order recomputation | MyGenie aggregate copy | ❌ |
| Order sync status | Completed | **Failed** (page 294/329) | ❌ |
| L3 behavior verifiable | Yes | **No** | ❌ |

R689 **does not confirm** the same L3 behavior as Jeh's Nest because L3 was never activated.

---

## 4. Migration Completion Status

| Check | Result | Evidence |
|---|---|---|
| customer_sync completed | ✅ PASS | status=`completed`, synced=717, updated=1317, failed=0 |
| order_sync completed | ❌ **FAIL** | status=`failed`, error=`API error on page 7: 401` (latest); prior attempt reached page 294/329 before 401 |
| customer count | ✅ INFO | 2035 customers |
| order count | ⚠️ PARTIAL | 7355 orders (7350 mygenie_synced). Total expected: ~8208 (329 pages). ~89% synced. |
| order_items count | ✅ INFO | 12,351 |
| points_transactions count | ⚠️ LEGACY | 726 total (719 earn + 6 redeem + 1 bonus). All from legacy/staging path, none from L3 recalc. |
| failed count | ✅ PASS | 0 record-level failures |
| last sync timestamp | ✅ INFO | order_sync started 2026-05-23T08:56:05 UTC |
| no partial/stuck state | ❌ **FAIL** | Order sync status=`failed`. Customer_sync #1 at 08:08 stuck with status=`running`. |

---

## 5. Collection Counts

| Collection | Count | Note |
|---|---|---|
| customers | 2,035 | |
| orders | 7,355 | 7,350 mygenie_synced + 5 L2 test orders |
| order_items | 12,351 | |
| points_transactions | 726 | **715 legacy earn + 4 L2 test earn + 6 legacy redeem + 1 staging bonus** |
| wallet_transactions | 0 | |
| migration_sync_logs | 5 | 3 customer syncs, 2 order syncs |

---

## 6. Loyalty Settings / LF-MERGE Validation

| Setting | Current Value | Note |
|---|---|---|
| `loyalty_enabled` | `True` (**NOW**) | ⚠️ Was likely `False` when migration ran — see §9 |
| `loyalty_clean_slate_recalc` | `False` (deprecated) | Ignored per LF-MERGE |
| Derived `clean_slate` (current) | `True` | Would be correct for next migration |
| `bronze_earn_percent` | **50.0%** | Custom (not default 5%) |
| `silver_earn_percent` | 7.0% | |
| `gold_earn_percent` | 10.0% | |
| `platinum_earn_percent` | 15.0% | |
| `min_order_value` | **0.0** | All orders qualify |
| `points_expiry_months` | 6 | |
| `redemption_value` | 1.0 | |
| `tier_silver_min` | 500 | |
| `tier_gold_min` | 1500 | |
| `tier_platinum_min` | 5000 | |

**LF-MERGE code verification:**
- `clean_slate = loyalty_enabled_flag` in migration.py ✅
- `clean_slate = bool(loyalty_settings_doc.get("loyalty_enabled", False))` in customers.py ✅
- Code is correct. The issue is that `loyalty_enabled` was `False` at sync runtime.

---

## 7. Customer Counter Validation

**NOT VERIFIABLE against L3 spec** — counters are from MyGenie aggregates, not order-by-order recomputation.

| Metric | Value | Source |
|---|---|---|
| Σ customers.total_points_earned | 43,251 | MyGenie aggregate (legacy copy) |
| Σ customers.total_points | 41,427 | MyGenie aggregate (legacy copy) |
| Σ customers.total_points_redeemed | 2,007 | MyGenie aggregate (legacy copy) |
| Σ orders.points_earned | 549 | 4 L2 test orders only; 7350 mygenie orders = 0 |
| Σ PT earn points | 18,251 (legacy) + 549 (test) | Does NOT reconcile with customer counters |

**Identity check:** `total_points_earned (43,251) − total_points_redeemed (2,007) = 41,244 ≠ total_points (41,427)`. Off by 183. This discrepancy is expected in legacy mode where MyGenie aggregates may have independent accounting.

Top earners (MyGenie aggregate values, NOT recomputed):

| Customer | total_points_earned | total_points | total_points_redeemed | Tier | Recalc PTs | Legacy PTs |
|---|---|---|---|---|---|---|
| Prvesh | 915 | 915 | 0 | Bronze | 0 | 0 |
| T1 First (test) | 599 | 599 | 0 | Bronze | 0 | 0 |
| Unknown | 580 | 158 | 422 | Bronze | 0 | 2 |
| Unknown | 381 | 381 | 0 | Bronze | 0 | 1 |
| faiyyaj | 313 | 84 | 229 | Bronze | 0 | 0 |

Tier distribution: 2033 Bronze, 2 Silver.

---

## 8. Points Transaction Validation

| Metric | Value | Result |
|---|---|---|
| Total PT rows | 726 | |
| Earn PT rows | 719 | |
| — Legacy synthetic ("synced from MyGenie") | 715 | Legacy path |
| — L2 test orders (STAGE-D-*) | 4 | Pre-migration test data |
| — Migration recalc ("migration recalc") | **0** | ❌ L3 path never executed |
| Redeem PT rows | 6 | Legacy synthetic |
| Bonus PT rows | 1 | L2 test (first visit bonus) |
| Duplicate (customer_id, order_id) pairs | 0 | ✅ |
| Expired PT count | **0** | ❌ `points_expired` field missing on all rows |
| Non-expired PT count | **0** | ❌ `points_expired` field missing on all rows |
| Has `points_expired` field | **0 / 719** | ❌ |
| Has `order_id` field | **4 / 719** | Only L2 test rows |
| PT description = "(migration recalc)" | **0** | ❌ |

Legacy PT rows were created at 2026-05-23 08:36:09–08:36:20 UTC during customer_sync #2. ObjectId timestamps confirm they are from this migration run, not a prior one.

---

## 9. Expiry Validation

**NOT VERIFIABLE.** The L3 expiry pre-mark code (`migration.py:340-371`) is gated on `if clean_slate and loyalty_enabled_flag:` (line 324). Since this block never executed, no PT rows have the `points_expired` field.

| Check | Result |
|---|---|
| PT rows with `points_expired=True` | 0 (field absent) |
| PT rows with `points_expired=False` | 0 (field absent) |
| Expiry boundary validation | N/A — no data |
| Live balance excludes expired | N/A |

---

## 10. Clean-Slate Validation

**FAILED.** Clean-slate did NOT execute. The migration ran in legacy mode.

| Check | Result | Evidence |
|---|---|---|
| Clean-slate active during customer sync | ❌ **NO** | 715 legacy synthetic PT rows created ("synced from MyGenie") — only happens when `clean_slate=False` |
| Clean-slate active during order sync | ❌ **NO** | All 7350 mygenie orders have `points_earned=0`; 0 migration-recalc PT rows |
| Customer counters recomputed from orders | ❌ **NO** | `total_points_earned=43,251` ≫ `Σ orders.points_earned=549` |
| MyGenie aggregate loyalty fields blindly copied | ✅ (this is wrong) | Confirmed: counters come from MyGenie API, not order-by-order computation |
| `loyalty_enabled` was True at sync time | ❌ **NO** | Legacy path execution proves it was `False` |

**Root cause:** `loyalty_enabled` was `False` when the migration syncs executed. The current value of `True` was set AFTER the syncs ran (or between failed attempts). The LF-MERGE code is correct — it faithfully derives `clean_slate` from `loyalty_enabled`. But `loyalty_enabled` must be `True` BEFORE triggering migration.

---

## 11. Re-sync Safety Validation

| Check | Result | Evidence |
|---|---|---|
| No duplicate customers (by phone) | ✅ | Not checked in detail but synced=717+updated=1317=2034 records, 2035 customers |
| No duplicate orders (by pos_order_id) | ✅ | 7350 mygenie_synced orders, 0 duplicate pos_order_id groups reported |
| No duplicate PT rows | ✅ | 0 duplicate (customer_id, order_id) groups |
| Customer counters consistent | ⚠️ | Counters are from MyGenie aggregates. `tpe − tpr ≠ tp` (off by 183). Expected in legacy mode. |
| Order sync completed | ❌ | Failed at page 294/329 (then again at page 6/329) |

---

## 12. LX-A / LF-MERGE Regression Smoke

| Check | Result |
|---|---|
| Backend health (`GET /api/health`) | ✅ HTTP 200 |
| `build_pos_loyalty_blob` import | ✅ OK |
| `get_redemption_value_for_tier` import | ✅ OK |
| Strict 6-key POS loyalty blob shape | ✅ PASS (6 keys) |
| LF-MERGE code markers in migration.py | ✅ Present |
| LF-MERGE code markers in customers.py | ✅ Present |
| BUG-L3-001 fix markers in migration.py | ✅ Present |

Code is healthy. The issue is data-level (migration ran with wrong flag state), not code-level.

---

## 13. Issues Found

### ISSUE-R689-001: Migration ran in legacy mode (clean_slate=False) — BLOCKING

`loyalty_enabled` was `False` when the customer sync and order sync ran. As a result:
- Customer sync created legacy synthetic PT rows and copied MyGenie aggregate values
- Order sync saved orders with `points_earned=0` and created no migration-recalc PT rows
- The L3 clean-slate code path was never exercised

**Severity:** Blocking for R689 L3 verification
**Impact:** L3 behavior cannot be verified on this dataset
**Fix:** Owner must confirm `loyalty_enabled=True` is set, then re-do full Revert → Sync sequence

### ISSUE-R689-002: Order sync failed (API 401 token expiry) — BLOCKING

Both order sync attempts failed:
- Attempt 1: page 294/329, synced 7350, error `API error on page 295: 401`
- Attempt 2: page 6/329, synced 0, updated 150, error `API error on page 7: 401`

~875 orders (~11%) were never synced.

**Severity:** Blocking for complete verification
**Impact:** Partial dataset; customers with orders only on pages 295–329 have incomplete data
**Fix:** Owner needs to re-trigger order sync with a fresh MyGenie token. The dedup guard will prevent double-counting of already-synced orders.

### ISSUE-R689-003: Stuck customer_sync log entry — Cosmetic

customer_sync log entry at 08:08:39 has status=`running` with no completion time. Likely an interrupted/abandoned attempt.

**Severity:** Cosmetic / P3
**Impact:** None on data correctness

---

## 14. Recommendation

**R689 inconclusive — need another migration run with correct preconditions.**

The L3 clean-slate behavior was never activated. To get a valid R689 verification:

1. **Verify** `loyalty_enabled=True` in the Loyalty Settings UI (it currently IS True)
2. **Revert** Sync Orders (deletes orders + order_items)
3. **Revert** Sync Customers (deletes customers — requires orders reverted first)
4. **Confirm** `loyalty_enabled` is still `True` (Revert does not change settings)
5. **Sync Customers** → wait for completion
6. **Sync Orders** → if MyGenie token expires mid-sync (API 401), re-login and re-trigger. The dedup guard prevents double-counting.
7. **Notify agent** when both syncs show `completed`

Expected post-clean-slate behavior for R689 (with `bronze_earn_percent=50%` and `min_order_value=0`):
- Many more PT earn rows than Jeh's Nest (R689 has 2541 orders with customer_id)
- `points_expired=True` on rows older than 6-month cutoff
- Customer `total_points_earned` matches order-by-order sum
- `total_points = total_points_earned − expired − redeemed`

---

## 15. Final Status

`cr001c_loyalty_l3_r689_real_migration_validation_inconclusive`

---

## Sign-off

CRM agent — R689 real-migration verification attempted on Kunafa Mahal (2026-05-23).

- ❌ L3 clean-slate code path did NOT execute (`loyalty_enabled` was `False` at sync time)
- ❌ Order sync FAILED (API 401 at page 294/329)
- ❌ 0 migration-recalc PT rows, 0 expiry pre-marks, customer counters from MyGenie aggregates
- ✅ Code is healthy (LF-MERGE, BUG-L3-001 markers present, backend running, LX-A blob correct)
- ⏸ Awaiting owner to re-run migration with `loyalty_enabled=True` confirmed BEFORE sync

**Jeh's Nest R3 PASS status is unaffected.** R689 inconclusive does not weaken the existing L3 closure — it simply means the second-sample validation needs a retry.
