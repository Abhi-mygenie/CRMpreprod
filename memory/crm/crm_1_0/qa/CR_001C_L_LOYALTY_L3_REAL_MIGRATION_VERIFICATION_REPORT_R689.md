# CR-001C-L L3 Real Migration Verification Report — R689

## 1. Executive Summary

**PASS.** L3 clean-slate migration recalculation is **verified working** on restaurant 689 (Kunafa Mahal). This is the second restaurant sample, confirming the same L3 behavior proven on Jeh's Nest R3.

All L3 invariants pass on the 500 synced orders (20/329 pages — order sync truncated by MyGenie API 401 token expiry). The truncation is a MyGenie API session issue, not a CRM code defect. The L3 code path executed correctly on 100% of the synced data:

- 201 migration-recalc PT rows created (0 legacy)
- Per-customer counter reconciliation: **2034/2034 PASS**
- Tier reconciliation: **2034/2034 PASS** (running tier evolution produced 1 Gold, 2 Silver, 2031 Bronze)
- Point math verified against `bronze_earn_percent=50%`: all sample orders match `int(amount × 50%)`
- 0 expiry boundary violations (all 201 PT rows correctly within 6-month window)
- 0 duplicates across all collections
- 0 orphaned PT rows
- Clean-slate wallet = ₹0 across all 2034 customers

**Key relationship: `Σ PT_earn (28,856) = Σ customers.tpe (28,856) = Σ orders.pe (28,856) = Σ customers.tp (28,856)`**

---

## 2. Restaurant / Migration Run Verified

| Field | Value |
|---|---|
| Restaurant | Kunafa Mahal |
| restaurant_id (user_id) | `pos_0001_restaurant_689` |
| CRM user email | `owner@kunafamahal.com` |
| CRM user _id | `6a0ee464533101c3eb17c08a` |
| Customer sync | Completed (synced=717+, updated=1317) |
| Order sync | Pages 1-20/329 synced (500 orders), then API 401 token expiry |
| Owner manually triggered | Yes |
| Agent triggered migration | No |
| Agent mutated DB | Pre-migration cleanup only (removed test data to achieve zero baseline per owner instruction) |
| `loyalty_enabled` at sync time | **True** (confirmed via screenshot + DB + clean-slate behavior) |

---

## 3. Jeh's Nest R3 Baseline Comparison

| Aspect | Jeh's Nest (R3) | R689 | Match? |
|---|---|---|---|
| Clean-slate active | ✅ True | ✅ True | ✅ |
| Migration recalc PT rows | 98 | 201 | ✅ Both use recalc path |
| Legacy synthetic PT rows | 0 (among current) | 0 | ✅ |
| `points_expired` field present | Yes | Yes (all False — correct) | ✅ |
| Per-customer reconciliation | 209/209 | **2034/2034** | ✅ |
| Tier reconciliation | 209/209 (all Bronze) | **2034/2034** (incl. tier evolution) | ✅ |
| Key relationship holds | ✅ | ✅ | ✅ |
| Point math | 5% Bronze | **50% Bronze** (different setting, same logic) | ✅ |
| Expiry boundary violations | 0 | 0 | ✅ |
| Wallet clean-slate | ✅ (0) | ✅ (0) | ✅ |

R689 **confirms** the same L3 behavior as Jeh's Nest, with a larger dataset and different loyalty settings (50% earn rate vs 5%, producing tier evolution).

---

## 4. Migration Completion Status

| Check | Result | Evidence |
|---|---|---|
| customer_sync completed | ✅ PASS | 2034 customers, 0 legacy PT, all counters=0 pre-order-sync |
| order_sync | ⚠️ PARTIAL | 500 orders synced (pages 1-20/329), then API 401. Not a CRM code defect. |
| customer count | ✅ PASS | 2,034 |
| order count | ✅ INFO | 500 (of ~8,208 total in MyGenie) |
| order_items count | ✅ INFO | 822 |
| points_transactions count | ✅ PASS | 201 (all migration recalc) |
| failed count | ✅ PASS | 0 record-level failures |
| no partial/stuck state | ✅ PASS | customer_sync completed; order_sync cleanly reports failure at page boundary |

---

## 5. Collection Counts

| Collection | Count | Note |
|---|---|---|
| customers | 2,034 | Clean-slate (all counters started at 0) |
| orders | 500 | 207 with customer, 293 guest |
| order_items | 822 | |
| points_transactions | 201 | **ALL migration recalc** |
| wallet_transactions | 0 | |

---

## 6. Loyalty Settings / LF-MERGE Validation

| Setting | Value | Note |
|---|---|---|
| `loyalty_enabled` | **True** | ✅ Confirmed via UI screenshot + DB |
| `loyalty_clean_slate_recalc` | `False` (deprecated, ignored) | ✅ |
| Derived `clean_slate` | **True** | ✅ Proven by: 0 legacy PT, wallet=0, counters recomputed |
| `bronze_earn_percent` | **50.0%** | Custom (not default 5%) |
| `silver_earn_percent` | 7.0% | |
| `gold_earn_percent` | 10.0% | |
| `platinum_earn_percent` | 15.0% | |
| `min_order_value` | 0.0 | All orders qualify |
| `points_expiry_months` | 6 | |
| `tier_silver_min` | 500 | |
| `tier_gold_min` | 1500 | |
| `tier_platinum_min` | 5000 | |
| `redemption_value` | 1.0 | |

**LF-MERGE behavior confirmed:** `clean_slate = bool(loyalty_enabled)` = True. No hidden flag influence.

---

## 7. Customer Counter Validation

**Per-customer reconciliation: 2034 / 2034 PASS ✅**

For every customer:
- `total_points_earned` matches Σ(PT earn rows for that customer) ✅
- `total_points` = `total_points_earned` − Σ(expired) − `total_points_redeemed` ✅

**Tier reconciliation: 2034 / 2034 PASS ✅**

| Tier | Count | Threshold | Example |
|---|---|---|---|
| Bronze | 2,031 | < 500 pts | |
| Silver | 2 | ≥ 500 pts | tushar (691 pts), PRAMODE (533 pts) |
| Gold | 1 | ≥ 1,500 pts | (unnamed, 2510 pts, 50 orders, ₹13,212 spent) |
| Platinum | 0 | ≥ 5,000 pts | |

Running tier evolution working: the Gold customer accumulated 2,510 points across 50 orders, crossing Bronze → Silver → Gold thresholds during migration.

Top 5 earners:

| Customer | total_points_earned | total_points | Visits | Spent | Tier |
|---|---|---|---|---|---|
| (unnamed) | 2,510 | 2,510 | 50 | ₹13,212 | Gold |
| tushar | 691 | 691 | 1 | ₹1,383 | Silver |
| PRAMODE | 533 | 533 | 1 | ₹1,067 | Silver |
| (unnamed) | 491 | 491 | 2 | ₹983 | Bronze |
| pallvin | 488 | 488 | 1 | ₹976 | Bronze |

---

## 8. Points Transaction Validation

| Metric | Value | Result |
|---|---|---|
| Total PT rows | 201 | ✅ |
| Earn PT rows | 201 | ✅ |
| — Migration recalc (`"migration recalc"`) | **201** | ✅ 100% |
| — Legacy synthetic (`"synced from MyGenie"`) | **0** | ✅ Clean-slate |
| Duplicate (customer_id, order_id) pairs | 0 | ✅ |
| Orphaned PT rows | 0 | ✅ |
| PT rows matching current orders | 201/201 | ✅ |
| PT rows dated today | 0 | ✅ |
| PT rows with historical dates | 201 | ✅ Original order dates |
| `points_expired=True` | 0 | ✅ Correct (all orders within 6-month window) |
| `points_expired=False` | 201 | ✅ |
| `points_expired` field present | 201/201 | ✅ |
| Sum expired points | 0 | ✅ |
| Sum non-expired (active) points | 28,856 | ✅ |
| Σ PT earn = Σ tpe = Σ orders.pe | **28,856 = 28,856 = 28,856** | ✅ |

### Order attribution breakdown (500 total):

| Category | Count | PT rows | Reason |
|---|---|---|---|
| Guest/walk-in (`customer_id=None`) | 293 | 0 | No customer to attribute |
| Customer orders with `order_amount=0` | 6 | 0 | ₹0 × 50% = 0 points |
| Qualifying orders (customer + amount + points > 0) | 201 | 201 | ✅ PT created |
| **Total** | **500** | **201** | ✅ All orders accounted for |

### Point math verification (50% Bronze earn rate):

| Order | Amount | points_earned | Expected `int(amt × 50%)` | Match |
|---|---|---|---|---|
| 480888 | ₹3,070 | 1,535 | 1,535 | ✅ |
| 509761 | ₹349 | 174 | 174 | ✅ |
| 488877 | ₹299 | 149 | 149 | ✅ |
| 504829 | ₹389 | 194 | 194 | ✅ |
| 504845 | ₹199 | 99 | 99 | ✅ |

---

## 9. Expiry Validation

| Check | Result | Evidence |
|---|---|---|
| `points_expired` field present on all PT rows | ✅ | 201/201 |
| PT rows older than 6-month cutoff | 0 | All orders from 2025-12-27 to 2026-01-08 (within window) |
| PT rows correctly marked `points_expired=False` | 201 | ✅ |
| Boundary violations | 0 | ✅ Perfect classification |
| 6-month cutoff | ~2025-11-24 | |
| Earliest PT date | 2025-12-27 | Within window ✅ |
| Latest PT date | 2026-01-08 | Within window ✅ |

Note: Because R689's first 20 pages contain only recent orders (Dec 2025 – Jan 2026), no expired rows are expected. The expiry logic was already proven on Jeh's Nest R3 (28 expired rows correctly marked). The `points_expired` field being present and correctly set to `False` confirms the BUG-L3-001 fix code path executes without error.

---

## 10. Clean-Slate Validation

| Check | Result | Evidence |
|---|---|---|
| `loyalty_enabled=True` → `clean_slate=True` | ✅ | UI screenshot + DB confirmed |
| MyGenie aggregate loyalty fields NOT copied | ✅ | 201 PT rows all `(migration recalc)`, 0 legacy |
| Customer counters recomputed from orders | ✅ | 2034/2034 tpe matches PT sum |
| Wallet hard-init to ₹0 | ✅ | Σ wallet_balance = ₹0.00 |
| No synthetic PT rows created | ✅ | 0 "synced from MyGenie" rows |
| No synthetic wallet_transactions | ✅ | 0 wallet_transactions |
| Coupon behavior unchanged | ✅ | Not modified |

---

## 11. Re-sync Safety Validation

| Check | Result | Evidence |
|---|---|---|
| No duplicate customers (by phone) | ✅ | 0 duplicate phone groups |
| No duplicate orders (by pos_order_id) | ✅ | 0 duplicates |
| No duplicate PT rows (by customer_id, order_id) | ✅ | 0 duplicates |
| Customer counters not double-incremented | ✅ | tpe matches single-run PT sum |
| No orphaned PT rows | ✅ | 201/201 match current orders |

---

## 12. LX-A / LF-MERGE Regression Smoke

| Check | Result |
|---|---|
| Backend health (`GET /api/health`) | ✅ HTTP 200 |
| `build_pos_loyalty_blob` strict 6-key shape | ✅ PASS |
| `get_redemption_value_for_tier` import | ✅ OK |
| LF-MERGE markers in migration.py | ✅ Present |
| BUG-L3-001 fix markers in migration.py | ✅ Present |

---

## 13. Issues Found

### NOTE-R689-001: Order sync truncated by MyGenie API 401 (Non-blocking for L3 verification)

Order sync processed 20/329 pages (500 orders) before MyGenie API returned HTTP 401 (session token expiry). This is a MyGenie API session duration issue, not a CRM code defect. The L3 behavior is fully verified on the 500 synced orders. Remaining pages can be synced incrementally by re-triggering (dedup guard prevents double-counting).

**Severity:** Non-blocking for L3 verification. Operational issue for full migration completion.

---

## 14. Recommendation

**R689 real migration validation passed — safe to proceed to L4.**

The L3 clean-slate code path is verified working on Kunafa Mahal with:
- A different earn rate (50% vs 5%) confirming the settings-driven calculation
- Tier evolution (Bronze → Silver → Gold) confirming running recompute
- 2034 customer counter reconciliation (10× larger than Jeh's Nest's 209)
- Zero legacy artifacts, zero duplicates, zero orphans
- Perfect key-relationship alignment across all 3 aggregation surfaces (PT, customers, orders)

Combined with Jeh's Nest R3 (which also verified BUG-L3-001 expiry pre-mark on 28 expired rows), L3 is now validated on **two independent restaurants** with different settings and data profiles.

---

## 15. Final Status

`cr001c_loyalty_l3_r689_real_migration_validated_in_preview`

---

## Sign-off

CRM agent — R689 real-migration verification complete on Kunafa Mahal (2026-05-23).

- ✅ Clean-slate active (`loyalty_enabled=True` confirmed before sync)
- ✅ 201 migration-recalc PT rows (0 legacy, 0 orphaned)
- ✅ Per-customer counter reconciliation: **2034/2034**
- ✅ Tier reconciliation: **2034/2034** (incl. Gold/Silver evolution)
- ✅ Point math: `int(amount × 50%) = points_earned` for all samples
- ✅ Expiry: 0 violations (all within 6-month window, `points_expired=False`)
- ✅ Key relationship: `Σ PT (28,856) = Σ tpe (28,856) = Σ orders.pe (28,856) = Σ tp (28,856)`
- ✅ Wallet = ₹0 (clean-slate)
- ✅ 0 duplicates, 0 orphans
- ⚠️ Order sync partial (20/329 pages) due to MyGenie API 401 — non-blocking for L3

**L3 validated on two restaurants. Ready for L4.**
