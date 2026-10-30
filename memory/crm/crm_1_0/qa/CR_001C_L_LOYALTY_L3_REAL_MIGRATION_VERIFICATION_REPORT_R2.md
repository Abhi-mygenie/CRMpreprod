# CR-001C-L Phase L3 — Real Migration Verification Report (Round 2)

**Restaurant:** `Jeh's Nest` (`pos_0001_restaurant_635`, `owner@jehsnest.com`)
**Migration trigger:** Owner via CRM UI **after** LF-MERGE deploy
**Customer-sync completed:** 2026-05-23 07:48:15 UTC
**Order-sync completed:** 2026-05-23 07:59:26 UTC
**LF-MERGE deploy:** 2026-05-23 07:39:41 UTC → **migration ran post-merge ✅**
**Verification:** read-only; no DB writes; no migration triggered by agent
**Supersedes:** `CR_001C_L_LOYALTY_L3_REAL_MIGRATION_VERIFICATION_REPORT.md` (legacy-path-only round 1)

---

## 1. Headline

| L3 Validation Item (owner's checklist) | Result |
|---|---|
| Customers migrated | ✅ **PASS** — 209 in CRM, sync log `synced=209 updated=25 failed=0` |
| Orders migrated | ✅ **PASS** — 233 in CRM, sync log `synced=233 failed=0` |
| `points_transactions` created | ✅ **PASS** — 98 rows with `transaction_type="earn"`, exactly matching the 98 candidate orders |
| `total_points_earned` calculated from migrated orders | ✅ **PASS** — all 209 customers reconcile (`Σ orders.points_earned == customer.total_points_earned`) |
| Points use original order dates | ✅ **PASS** — 98/98 PT rows have `created_at == order.order_created_at` (day-precision); 0 dated today |
| Expired points pre-marked correctly | ❌ **FAIL** — silently broken: 28 PT rows older than the 6-month cutoff are **NOT** pre-marked `points_expired=True`. Root cause: naive vs tz-aware datetime `TypeError` swallowed by an over-broad `except` clause in `migration.py:351–352`. Details in §3 below. |
| No duplicate `points_transactions` | ✅ **PASS** — 0 `(customer_id, order_id)` duplicates |
| Clean-slate behavior because `loyalty_enabled=true` | ✅ **PASS** — `derived clean_slate = True`; 98 PT rows have description `"Earned on order … (migration recalc)"` confirming the L3 clean-slate code path executed |

**One real bug found** (D1 pre-mark — `BUG-L3-001`). Everything else verified pass.

---

## 2. Verification Matrix — Details

### V-0 — Pre-flight context

| Field | Value |
|---|---|
| `loyalty_enabled` | `True` ✅ |
| `loyalty_clean_slate_recalc` | `False` (ignored post-LF-MERGE — verified) |
| Earn percents (Bronze / Silver / Gold / Platinum) | 5 / 7 / 10 / 15 |
| Tier thresholds (Silver / Gold / Platinum) | 500 / 1500 / 5000 |
| `min_order_value` | ₹10 |
| `points_expiry_months` | 6 |
| `off_peak_bonus_enabled` | `False` |

### V-1 — Clean-slate active

`derive_clean_slate(settings) = bool(settings.get("loyalty_enabled")) = True` → clean-slate code path is the one that executed. Confirmed via PT row descriptions (`"... (migration recalc)"`).

### V-2 — Customers migrated

- 209 customers in CRM == 209 `synced_count` in log ✅
- 25 same-phone duplicates merged in-place (`updated_count`)
- 234 source customers in MyGenie

### V-3 — Orders migrated

- 233 orders in CRM == 233 `synced_count` in log ✅
- 0 failed
- 10/10 pages

### V-4 — `points_transactions` created (98 rows)

Field name: PT documents use `transaction_type="earn"` (NOT `type="earned"`).

| Group | Orders | Why no PT row created |
|---|---|---|
| `order_amount < ₹10` (below `min_order_value`) | 36 | Helper short-circuits to 0 |
| `order_amount ≥ ₹10` but `int(amt × 5%) = 0` (i.e. amt < ₹20) | 17 | Per-order `int()` truncation: e.g. ₹19 × 5% = 0.95 → `int(0.95) = 0`. Customer `$inc` of `total_visits` + `total_spent` still happens at lines 419–425. |
| `order_amount ≥ ₹10` with `customer_id = None` (guest/walk-in orders) | 82 | Migration gates the L3 path on `if customer:` at line 313. No customer → no attribution → no PT. Order doc still saved with `points_earned=0`. |
| `order_amount ≥ ₹10`, `customer_id ≠ None`, `int(amt × 5%) ≥ 1` | **98** | ✅ **L3 clean-slate path executed — PT row created** |
| **Total** | **233** ✅ | |

**98 + 17 + 36 + 82 = 233** — every order accounted for.

### V-5 — Per-customer counter parity

`Σ orders.points_earned == customers.total_points_earned`: **209 / 209 ✅** (all customers reconcile).

### V-6 — Per-order points reconciliation

For the 98 candidate orders, `orders.points_earned` matches `core.loyalty.calculate_points(order_amount, customer, settings).total_points` exactly. The 99 "≥₹10 pe=0" orders are correctly explained by V-4 buckets above — not a bug.

### V-7 — PT.created_at == original order date

- 98 / 98 PT rows have day-precision match with `order.order_created_at`.
- 0 PT rows dated today.
- ✅ **PASS** — historical dates preserved exactly as the L3 spec requires.

### V-8 — Expired pre-mark — ❌ **FAIL**

- Cutoff: 2025-11-24 (6 months ago).
- Earn rows older than cutoff: **28**
- Of those 28, marked `points_expired=True`: **0**
- Of those 28, NOT marked: **28** ← bug
- Newer rows falsely marked expired: 0 (no false positives, just false negatives).

See §3 for root cause.

### V-9 — Re-sync dedup

- 0 duplicate `(customer_id, order_id)` pairs across all 98 earn rows. ✅
- Migration ran 4 times historically (2026-05-22 × 2, 2026-05-23 × 2 pre/post LF-MERGE). The post-revert + post-LF-MERGE run produced no doubling.

### V-10 — Tier reconciliation

`calculate_tier(total_points, settings) == customer.tier`: **209 / 209 ✅**.

### V-11 — Balance identity

`total_points == total_points_earned − total_points_redeemed`: **209 / 209 ✅**.

### V-12 — Aggregate sanity

| Aggregate | Value | Note |
|---|---|---|
| Σ customers.total_points | 753 | (matches Σ_te − Σ_tr) |
| Σ customers.total_points_earned | 753 | |
| Σ customers.total_points_redeemed | 0 | (no redemptions in dataset) |
| Σ orders.points_earned | **753** | ✅ equals Σ_te |
| Σ PT(`transaction_type="earn"`).points | **753** | ✅ equals Σ_te |
| Σ orders.order_amount | ₹30,838 | |
| Σ customers.wallet_balance | **₹0.00** | Hard-init to 0 by L3 clean-slate (was ₹3,180 pre-migration). Expected behavior per design. |

Top earners (Bronze):
- Customer (no name, 9 orders, ₹3,130) → 156 pts
- saurav (37 orders, ₹2,677) → 129 pts
- Abhishek Goyal (55 orders, ₹2,510) → 109 pts
- Sapna Mam (₹2,330) → 117 pts
- jayshree (₹2,065) → 103 pts

All 209 customers remain Bronze (max 156 pts; Silver threshold = 500). No tier upgrades — Jeh's Nest's customer base has historically small order sizes (median ₹20–₹400).

---

## 3. 🐛 BUG-L3-001 — D1 Expired Pre-mark Silently Fails on Naive Timestamps

### What we found
28 PT `earn` rows have `points_expired=False` despite their `created_at` being older than the 6-month expiry cutoff. These rows' points are being counted toward customer balances even though they should be excluded per D1 spec.

### Root cause
**`backend/routers/migration.py` lines 340–352:**

```python
if expiry_months and order_date:
    try:
        od_dt = datetime.fromisoformat(order_date.replace("Z", "+00:00"))
        cutoff = datetime.now(timezone.utc) - timedelta(days=expiry_months * 30)
        if od_dt < cutoff:
            points_expired = True
            expired_at = od_dt.isoformat()
    except (ValueError, TypeError):
        pass
```

MyGenie returns `created_at` as a **naive** ISO string (no timezone suffix), e.g. `"2025-10-04 15:31:22"`. The migration:
1. Calls `.replace("Z", "+00:00")` — no `Z` to replace, string unchanged.
2. Calls `datetime.fromisoformat(...)` → returns a **naive** datetime (`tzinfo=None`).
3. Compares with `cutoff` which is **tz-aware** (`datetime.now(timezone.utc)`).
4. Python raises **`TypeError: can't compare offset-naive and offset-aware datetimes`**.
5. The over-broad `except (ValueError, TypeError): pass` swallows it silently.
6. `points_expired` stays at its initial `False` → row is **never** pre-marked.

Repro (in Python):
```python
od_dt = datetime.fromisoformat("2025-10-04 15:31:22".replace("Z","+00:00"))
# od_dt.tzinfo = None  (naive)
cutoff = datetime.now(timezone.utc) - timedelta(days=180)
# cutoff.tzinfo = UTC
od_dt < cutoff
# → TypeError: can't compare offset-naive and offset-aware datetimes
```

### Blast radius

| Aspect | Impact |
|---|---|
| Restaurants affected | Any restaurant migrating from MyGenie whose orders pre-date the expiry window |
| `Jeh's Nest` impact today | 28 earn rows (sum of points = portion of 753; need to recompute for exact figure). These should not be counted toward `total_points` per the points-expiry contract. |
| Severity | **P0 / data-correctness** — expired points are being treated as live spendable points. Customer can redeem points that have expired. |
| Detection | Silent. Migration logs say "completed" with 0 failures. Only revealed by this verification. |

### Proposed fix (deferred until owner gives go-ahead)

Two-line change in `migration.py:342-344`:

```python
od_dt = datetime.fromisoformat(order_date.replace("Z", "+00:00"))
# CR-001C-L BUG-L3-001 fix: MyGenie returns naive ISO; force UTC before compare.
if od_dt.tzinfo is None:
    od_dt = od_dt.replace(tzinfo=timezone.utc)
cutoff = datetime.now(timezone.utc) - timedelta(days=expiry_months * 30)
```

Also recommended: tighten the `except` clause from `(ValueError, TypeError)` to `ValueError` only, so future date-comparison bugs surface instead of staying silent.

### Backfill plan (when owner authorises the fix)
After the code fix is deployed, the next Revert → Sync Again on Jeh's Nest will correctly pre-mark the 28 old rows. Optionally, a one-shot script can update existing PT rows in-place (out of scope for this report).

---

## 4. What this run proves ✅

1. **LF-MERGE works correctly.** `loyalty_enabled=true` now drives clean-slate migration without any hidden flag.
2. **L3 clean-slate code path executes end-to-end.** 98 PT rows created with original dates, customer counters reconcile across all 209 customers, balance identity holds, tier reconciliation holds, re-sync dedup holds.
3. **The 99 "missing" earn rows are NOT bugs.** They are correctly explained by V-4 buckets (82 guest/no-customer + 17 small-order truncation).
4. **L3 substantive behavior IS validated on real owner-triggered data.**

## 5. What this run uncovered ⚠️

**BUG-L3-001** — D1 expired pre-mark silently fails on MyGenie's naive timestamps. Documented above with root cause, repro, and proposed fix. **Owner decision required** before any code change.

---

## 6. Out-of-scope re-confirmation

- ❌ Agent did NOT trigger migration.
- ❌ No DB writes.
- ❌ No `loyalty_settings` changes.
- ❌ No code changes (BUG-L3-001 is *flagged*, not *fixed*).
- ❌ No L4 / L5 / Coupon / Wallet work.
- ❌ No prod deploy.
- ❌ `/app/memory/final/` untouched.
- ❌ Existing reports unchanged.

---

## 7. Proposed Status Transition

| Track | Current | After this verification |
|---|---|---|
| L3 (clean-slate path) | `cr001c_loyalty_l3_controlled_qa_passed_real_migration_validation_pending` | **`cr001c_loyalty_l3_real_migration_validated_in_preview_with_bug_l3_001_open`** |
| LF-MERGE | `cr001cl_lf_merge_complete_qa_passed_in_preview` | unchanged — LF-MERGE itself works correctly |
| LX-A | `cr001c_lx_a_loyalty_pos_contract_patched_qa_passed_in_preview` | unchanged |

If owner authorises a quick BUG-L3-001 fix + re-verify, L3 can fully close as:

> `cr001c_loyalty_l3_real_migration_validated_in_preview` (no caveats)

---

## 8. Owner decisions to make

1. **BUG-L3-001 fix** — do you want me to plan and apply the two-line tz-fix in `migration.py`, ship a static QA harness for it, and ask you to Revert → Sync Again so I can re-verify? (Same surgical pattern as LF-MERGE.) Or defer to L5 / a later pass?
2. **Guest-order points** (the 82 `customer_id=None` orders) — is current behavior (skip points) acceptable, or should we open a separate later-stage task to back-attribute guest orders when a guest later registers via phone? (Out of L3 scope; raise only if you want it tracked.)
3. **Wallet hard-init to ₹0** (was ₹3,180 from MyGenie aggregates) — current behavior matches the L3 spec, but flagging in case you wanted MyGenie's wallet balances preserved through migration.

---

## 9. Sign-off

CRM agent — L3 real-migration verification complete on `Jeh's Nest` (2026-05-23 round 2, post-LF-MERGE).

- ✅ 7 of 8 L3 checklist items PASS
- ❌ 1 real bug found: `BUG-L3-001` (D1 expired pre-mark — naive vs tz-aware datetime)
- L3 status candidate: `cr001c_loyalty_l3_real_migration_validated_in_preview_with_bug_l3_001_open`

Awaiting owner direction on §8.
