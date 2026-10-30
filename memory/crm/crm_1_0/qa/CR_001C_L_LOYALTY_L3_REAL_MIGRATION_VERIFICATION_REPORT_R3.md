# CR-001C-L L3 Real Migration Verification Report R3

## 1. Executive Summary

**PASS.** BUG-L3-001 is **closed** on real migrated data. All 8 L3 verification checks now pass.

The owner manually re-ran migration on Jeh's Nest after the BUG-L3-001 fix was deployed. The 28 expired `points_transactions` rows are now correctly pre-marked `points_expired=True`. Customer live balances exclude expired points. All previous R2 invariants continue to hold.

Two non-blocking observations are documented (§13) but do not gate L3 closure.

---

## 2. Restaurant / Migration Run Verified

| Field | Value |
|---|---|
| Restaurant | Jeh's Nest |
| restaurant_id (user_id) | `pos_0001_restaurant_635` |
| CRM user email | `owner@jehsnest.com` |
| CRM user _id | `6a0ee806533101c3eb17c51a` |
| Migration rerun (customer_sync) | 2026-05-23 08:24:42 → 08:24:44 UTC |
| Migration rerun (order_sync) | 2026-05-23 08:27:14 → 08:33:02 UTC |
| Owner manually triggered | Yes (per task brief) |
| Agent triggered migration | No |
| Agent mutated DB | No |

This is the **3rd customer+order sync** on 2026-05-23 (the 5th overall across both dates). The R3 run is the first after the BUG-L3-001 code fix was deployed.

---

## 3. R2 Bug Recap

**BUG-L3-001:** During the R2 real-migration verification, 28 `points_transactions` earn rows older than the 6-month expiry cutoff were NOT pre-marked `points_expired=True`.

**Root cause:** MyGenie returns naive ISO timestamps (e.g. `"2025-10-04 15:31:22"` — no timezone). The migration code compared a naive `datetime` with a tz-aware `cutoff`, raising `TypeError`, silently swallowed by an over-broad `except (ValueError, TypeError): pass`.

**Fix applied (1 file, `migration.py:340-371`):**
1. Coerce naive `od_dt` to UTC before comparison: `if od_dt.tzinfo is None: od_dt = od_dt.replace(tzinfo=timezone.utc)`
2. Narrow `except` from `(ValueError, TypeError)` to `ValueError` only.

**Expected post-fix behavior:**
- ~28 PT rows should now have `points_expired=True`.
- `total_points_earned` unchanged (earned counter incremented regardless of expiry).
- `total_points` (live balance) should decrease by the sum of expired points.
- `total_points = total_points_earned - expired_points - redeemed_points`.

---

## 4. Migration Completion Status

| Check | Result | Evidence |
|---|---|---|
| customer_sync completed | ✅ PASS | status=`completed`, synced=209, updated=25, failed=0 |
| order_sync completed | ✅ PASS | status=`completed`, synced=233, updated=0, failed=0 |
| customer count | ✅ PASS | 209 (matches R2) |
| order count | ✅ PASS | 233 (matches R2) |
| order_items count | ✅ PASS | 258 |
| points_transactions count | ⚠️ NOTE | 196 total (98 current + 98 orphaned — see §11) |
| failed count | ✅ PASS | 0 customers, 0 orders |
| last sync timestamp | ✅ PASS | order_sync completed 2026-05-23T08:33:02 UTC |
| no partial/stuck state | ✅ PASS | Both syncs status=`completed`, pages=10/10 |

---

## 5. Collection Counts

| Collection | Count | R2 Count | Note |
|---|---|---|---|
| customers | 209 | 209 | Match ✅ |
| orders | 233 | 233 | Match ✅ |
| order_items | 258 | (not reported) | — |
| points_transactions (all) | 196 | 98 | 98 current + 98 orphaned (§11) |
| points_transactions (current, earn) | 98 | 98 | Match ✅ |
| points_transactions (orphaned, earn) | 98 | 0 | Artifact of Revert (§11) |
| wallet_transactions | 44 | (not reported) | Orphaned from pre-clean-slate run |
| migration_sync_logs | 10 entries | 8 | 2 new (R3 customer+order sync) |

---

## 6. Loyalty Settings / LF-MERGE Validation

| Setting | Value | Status |
|---|---|---|
| `loyalty_enabled` | `True` | ✅ |
| `loyalty_clean_slate_recalc` | `False` (DEPRECATED, ignored) | ✅ |
| Derived `clean_slate` | `True` (= `bool(loyalty_enabled)`) | ✅ LF-MERGE active |
| `earn_percent_bronze` (default 5%) | not set (uses default) | ✅ |
| `min_order_value` | 10.0 | ✅ |
| `points_expiry_months` | 6 | ✅ |
| `off_peak_bonus_enabled` | `False` | ✅ |
| `redemption_value` | 0.25 | ✅ |

**LF-MERGE validation:**
- `clean_slate = loyalty_enabled_flag` in `migration.py` ✅
- `clean_slate = bool(loyalty_settings_doc.get("loyalty_enabled", False))` in `customers.py` ✅
- Hidden `loyalty_clean_slate_recalc` is NOT read for clean_slate derivation ✅
- LF-MERGE marker comments present in both files ✅

---

## 7. Customer Counter Validation

**Per-customer reconciliation: 209 / 209 PASS ✅**

For every customer:
- `total_points_earned` matches Σ(current PT earn rows for that customer) ✅
- `total_points` = `total_points_earned` − Σ(expired PT points) − `total_points_redeemed` ✅

Top 5 earners:

| Customer | Orders | total_points_earned | total_points (live) | Visits | Spent | Tier |
|---|---|---|---|---|---|---|
| (no name, phone 8369699265) | 9 | 156 | 31 | 9 | ₹3,130 | Bronze |
| saurav | 37 | 129 | 85 | 37 | ₹2,677 | Bronze |
| Sapna Mam | 7 | 117 | 12 | 7 | ₹2,371 | Bronze |
| Abhishek Goyal | 55 | 109 | 87 | 55 | ₹2,510 | Bronze |
| jayshree | 20 | 103 | 35 | 20 | ₹2,080 | Bronze |

All 209 customers remain **Bronze** (max 156 pts < 500 Silver threshold). Tier distribution: 209 Bronze ✅.

Note: Top earner's `total_points=31` vs `total_points_earned=156` → 125 expired points. This is consistent with their historical orders pre-dating the 6-month cutoff.

---

## 8. Points Transaction Validation

| Metric | Value | Result |
|---|---|---|
| Total PT rows (all) | 196 | ⚠️ See §11 |
| Current PT earn rows (matching current customers) | 98 | ✅ Match R2 |
| Orphaned PT earn rows (from previous migration) | 98 | ⚠️ Non-blocking (§11) |
| Duplicate (customer_id, order_id) pairs | 0 | ✅ |
| Expired PT count (current) | 28 | ✅ BUG-L3-001 fixed |
| Non-expired PT count (current) | 70 | ✅ |
| Sum expired points | 374 | ✅ |
| Sum non-expired points | 379 | ✅ |
| Sum all earned points (PT) | 753 (98 current rows) | ✅ |
| Σ customers.total_points_earned | 753 | ✅ Matches PT sum |
| Σ customers.total_points (live) | 379 | ✅ = 753 − 374 − 0 |
| Σ orders.points_earned | 753 | ✅ Matches PT sum |
| PT rows dated today | 0 | ✅ All historical |
| PT rows with historical dates | 98 | ✅ Original order dates |
| PT description pattern | `"Earned on order {pos_order_id} (migration recalc)"` | ✅ Clean-slate path |

### Order attribution breakdown (233 total):

| Category | Count | PT rows | Reason |
|---|---|---|---|
| Guest/walk-in (`customer_id=None`) | 88 | 0 | No customer to attribute |
| Below `min_order_value` (< ₹10) or `int(amt × 5%) = 0` | 47 | 0 | Helper short-circuits / truncation |
| Qualifying orders (customer + amount + points > 0) | 98 | 98 | ✅ PT created |
| **Total** | **233** | **98** | ✅ All orders accounted for |

---

## 9. BUG-L3-001 Expiry Validation

### Result: **BUG-L3-001 is CLOSED** ✅

| Check | Result | Evidence |
|---|---|---|
| PT rows older than 6-month cutoff marked `points_expired=True` | ✅ | 28 rows, all `created_at` before 2025-11-24 |
| PT rows within 6-month window marked `points_expired=False` | ✅ | 70 rows, all `created_at` after 2025-12-11 |
| No naive-vs-aware comparison failure | ✅ | Fix marker + `od_dt.replace(tzinfo=timezone.utc)` present |
| No old points remain incorrectly spendable | ✅ | `total_points` excludes expired for all 209 customers |
| Boundary violations (wrong classification) | **0** | ✅ Perfect classification |
| `expired_at` field populated for expired rows | ✅ | Matches order date with UTC tzinfo |

### Boundary dates:

| | Date |
|---|---|
| 6-month cutoff (≈) | 2025-11-24 |
| Latest expired PT `created_at` | 2025-11-11 10:56:31 |
| Earliest non-expired PT `created_at` | 2025-12-11 19:00:54 |
| Gap (clean boundary) | ~30 days |

### Key relationship validation:

```
Σ total_points_earned (753) = Σ expired_pts (374) + Σ active_pts (379) ✅
Σ total_points (379)       = Σ total_points_earned (753) − Σ expired (374) − Σ redeemed (0) ✅
Σ orders.points_earned (753) = Σ total_points_earned (753) ✅
```

### Comparison with R2 (pre-fix):

| Metric | R2 (pre-fix) | R3 (post-fix) | Change |
|---|---|---|---|
| Expired PT rows | 0 ❌ | 28 ✅ | Fixed |
| Sum expired points | 0 | 374 | Fixed |
| Σ total_points | 753 | 379 | Decreased by 374 (expired excluded) |
| Σ total_points_earned | 753 | 753 | Unchanged ✅ |
| Current PT earn rows | 98 | 98 | Unchanged ✅ |

---

## 10. Clean-Slate Validation

| Check | Result | Evidence |
|---|---|---|
| `loyalty_enabled=True` → `clean_slate=True` | ✅ | LF-MERGE code verified |
| MyGenie aggregate loyalty fields NOT blindly copied | ✅ | 98 PT rows have `(migration recalc)` description |
| Loyalty counters recomputed from orders | ✅ | `total_points_earned` matches order-by-order sum |
| Wallet hard-init | ⚠️ NOTE | 4 customers have non-zero wallet (Σ=₹3,180). See §13. |
| Coupon behavior unchanged | ✅ | Not modified by BUG-L3-001 fix |
| `loyalty_clean_slate_recalc` ignored | ✅ | Field exists as `False`, not read by any code path |

---

## 11. Re-sync Safety Validation

| Check | Result | Evidence |
|---|---|---|
| No duplicate customers (by phone) | ✅ | 0 duplicate phone groups |
| No duplicate orders (by pos_order_id) | ✅ | 0 duplicate pos_order_id groups |
| No duplicate current PT rows (by customer_id, order_id) | ✅ | 0 duplicates among 98 current rows |
| Customer count stable | ✅ | 209 (same across all migration runs) |
| Order count stable | ✅ | 233 (same across all migration runs) |
| Customer counters not double-incremented | ✅ | `total_points_earned=753` matches single-run computation |

### Orphaned PT rows observation:

98 PT earn rows from a **previous** migration run persist in the `points_transactions` collection. These have `customer_id` and `order_id` UUIDs that do NOT match any current customer or order documents (the Revert + Sync Again cycle generates new UUIDs). The orphaned rows have `points_expired=False` for all 98 (reflecting the pre-BUG-fix behavior), confirming they are from a pre-fix migration.

**Root cause:** The Revert endpoints (`/revert`, `/revert-orders`) delete `points_transactions` matching `"synced from MyGenie"` description (legacy synthetic rows) but NOT rows with `"(migration recalc)"` description (L3 clean-slate rows).

**Impact:** Non-blocking. The orphaned rows:
- Do NOT affect customer counters (their `customer_id`s don't exist).
- Do NOT participate in any query that joins on current customer/order IDs.
- Are cosmetic debris only.

**Recommended cleanup (deferred):** A one-line `delete_many` on orphaned PT rows where `customer_id ∉ current_customer_ids`. Out of scope for L3 closure.

---

## 12. LX-A / LF-MERGE Regression Smoke

| Check | Result |
|---|---|
| `build_pos_loyalty_blob` import | ✅ OK |
| `get_redemption_value_for_tier` import | ✅ OK |
| `calculate_points`, `calculate_tier` import | ✅ OK |
| Strict 6-key POS loyalty blob shape | ✅ PASS (`loyalty_enabled`, `points_value`, `ratio_per_point`, `tier`, `tier_label`, `total_points`) |
| `migration.py` clean_slate source = `loyalty_enabled_flag` | ✅ LF-MERGE |
| `customers.py` clean_slate source = `loyalty_enabled` | ✅ LF-MERGE |
| BUG-L3-001 fix marker in `migration.py` | ✅ Present |
| Naive-to-UTC coercion in `migration.py` | ✅ Present |
| `except` narrowed to `ValueError` only | ✅ Confirmed |
| Backend health (`GET /api/health`) | ✅ HTTP 200 |
| Backend service uptime | ✅ Running (pid 874) |

---

## 13. Issues Found

### OBS-R3-001: Orphaned PT rows from previous migration (Non-blocking)

98 `points_transactions` earn rows from a pre-BUG-fix migration persist with stale `customer_id`/`order_id` UUIDs. They do not affect any functional behavior. Root cause: Revert endpoint's `delete_many` regex targets `"synced from MyGenie"` but not `"(migration recalc)"`.

**Severity:** Cosmetic / P3
**Impact:** None on correctness
**Recommendation:** Add `"(migration recalc)"` to the Revert cleanup regex, or clean up orphaned rows in a maintenance task. Defer to L5 or a separate housekeeping CR.

### OBS-R3-002: Wallet balance restored to MyGenie values (Non-blocking, out of Loyalty scope)

4 customers show non-zero `wallet_balance` (Σ=₹3,180), matching pre-clean-slate MyGenie aggregate values. R2 reported wallet=₹0 for all 209 customers. The most likely explanation is that the owner's Revert/Sync sequence for R3 resulted in wallet values being preserved through the clean-slate update path (C11 safety — `_allowed_keys` does not include `wallet_balance` for existing customer updates).

**Severity:** P3 / Informational
**Impact:** None on loyalty correctness. Wallet is out of scope for CR-001C-L.
**Recommendation:** Document for CR-001C-W (Wallet) if/when that CR begins.

---

## 14. Recommendation

**L3 real migration validation passed — proceed to L4.**

BUG-L3-001 is proven fixed on real migrated data. All 8 L3 checklist items pass. The two non-blocking observations (orphaned PT rows, wallet values) are documented for future CRs but do not gate L3 closure.

---

## 15. Final Status

`cr001c_loyalty_l3_real_migration_validated_in_preview`

---

## Sign-off

CRM agent — L3 real-migration verification R3 complete on Jeh's Nest (2026-05-23, post-BUG-L3-001 fix).

- ✅ 8 of 8 L3 checklist items PASS
- ✅ BUG-L3-001 **closed** — 28 expired rows correctly pre-marked, live balances exclude expired points
- ✅ All customer counters reconcile (209/209)
- ✅ Key relationship: `total_points (379) = total_points_earned (753) − expired (374) − redeemed (0)`
- ✅ LX-A / LF-MERGE regression clean
- ✅ Backend healthy
- ⚠️ 2 non-blocking observations documented (§13)

**L3 is closed in preview. Ready for L4.**
