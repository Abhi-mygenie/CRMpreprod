# CR-001C-L Phase L3 — Real Owner-Triggered Migration Verification Report

**Restaurant verified:** `Jeh's Nest` (`user_id=pos_0001_restaurant_635`, `owner@jehsnest.com`)
**Migration triggered by:** Owner via CRM UI
**Migration completed:** 2026-05-23 07:18:43 UTC (latest order_sync)
**Verification run:** 2026-05-23 (read-only; no migration triggered by agent)
**Verification mode:** READ-ONLY. No DB writes. No service restart. No env change.

---

## ⚡ Headline

| Layer | Result |
|---|---|
| Migration completed cleanly (sync logs) | ✅ PASS — customers 209/234 (25 merged) · orders 233/233 · 0 failed |
| D2 hard-block guard (settings present) | ✅ PASS — `loyalty_settings` present, migration was allowed |
| Re-sync dedup (C11) | ✅ PASS — same migration ran on 2026-05-22 and again on 2026-05-23; no duplicate rows |
| Defensive counter init (L2) | ✅ PASS — all 209 customers have `total_points_earned`, `total_points_redeemed`, `tier` |
| LX-A endpoint contract live | ✅ PASS — strict 6-key blob returned on all 3 sampled customers across all 3 endpoints |
| Wallet / Coupon counters preserved | ✅ PASS — LX-A did not touch them |
| **L3 clean-slate recalc (D1, point-recompute, original-date PT rows)** | ⚠️ **NOT EXERCISED THIS RUN** — `loyalty_clean_slate_recalc=False` on this restaurant. See §6 below. |

> ⚠️ **Important:** this run validates **migration completion + LX-A contract + idempotency** end-to-end on real owner-triggered data, but **does not validate the L3 clean-slate recalc code path** because the per-restaurant flag was not flipped on. To validate the clean-slate path on a real restaurant, owner needs to perform the one-time toggle described in §7 and re-run migration.

---

## 1. Inputs (read-only)

### 1.1 `migration_sync_logs` for `pos_0001_restaurant_635`

| Run | sync_type | status | started_at (UTC) | completed_at (UTC) | total | synced | updated | failed | pages |
|---|---|---|---|---|---|---|---|---|---|
| Latest | order_sync | completed | 2026-05-23 07:14:18 | 2026-05-23 07:18:43 | 233 | 233 | 0 | 0 | 10/10 |
| Latest | customer_sync | completed | 2026-05-23 07:10:54 | 2026-05-23 07:13:42 | 234 | 209 | 25 | 0 | 1/1 |
| Prior | order_sync | completed | 2026-05-22 09:02:02 | 2026-05-22 09:07:15 | 233 | 233 | 0 | 0 | 10/10 |
| Prior | customer_sync | completed | 2026-05-22 08:58:05 | 2026-05-22 09:00:57 | 234 | 209 | 25 | 0 | 1/1 |

UI screenshot matches log row-for-row (`customers 209/234 + 25 merged`, `orders 233/233`).

### 1.2 `loyalty_settings` snapshot

```
id                          : 17e2b9bf-6406-429e-9700-f444fc818547
loyalty_enabled             : True
loyalty_clean_slate_recalc  : False          ←  key driver of behavior in §6
min_order_value             : 10.0
bronze/silver/gold/platinum % : 5.0 / 7.0 / 10.0 / 15.0
tier mins (silver/gold/platinum) : 500 / 1500 / 5000
points_expiry_months        : 6
redemption_value (restaurant-level) : 0.25
per-tier *_redemption_value : all None  (LX-A new fields, owner has not configured)
off_peak_bonus_enabled      : False
```

---

## 2. Verification Matrix — Results

### V-1 — D2 hard-block guard (settings present)

| Check | Expected | Got | Pass |
|---|---|---|---|
| `loyalty_settings` doc exists for `pos_0001_restaurant_635` | present | present | ✅ |
| `loyalty_enabled` flag readable | bool | `True` | ✅ |
| `loyalty_clean_slate_recalc` flag readable | bool | `False` | ✅ |

### V-2 — Customer collection counts + counter init (L2)

| Metric | Got |
|---|---|
| Customers in CRM | 209 (matches `synced_count` from log; the 25 "updated" represent in-place duplicate merges from MyGenie — same-phone dedup) |
| `total_points_earned` exists on customer | 209 / 209 ✅ |
| `total_points_redeemed` exists on customer | 209 / 209 ✅ |
| `tier` field exists | 209 / 209 ✅ |
| Non-empty `phone` | 208 / 209 (one customer has empty phone — pre-existing MyGenie data quirk; not introduced by migration) |

### V-3 — Orders collection counts

| Metric | Got |
|---|---|
| Orders in CRM for this restaurant | 233 (matches `synced_count`) |
| Orders with `points_earned` field present | 233 / 233 ✅ |
| Sum of `points_earned` across 233 orders | **0** (all orders have `points_earned=0`) |
| Sum of `order_amount` across 233 orders | ₹30,838 |

### V-4 — `points_transactions` counts + re-sync dedup (C11)

| Check | Got | Pass |
|---|---|---|
| Total `points_transactions` for this restaurant | **0** | — |
| Type=`earned` rows | 0 | — |
| Duplicate `(customer_id, order_id)` pairs (aggregation) | 0 | ✅ (trivially — no rows) |

> Re-sync dedup is **structurally proven**: the same migration ran on 2026-05-22 and again on 2026-05-23 against the same source data, and the customer/PT counts are identical, not doubled.

### V-5 — D1 expired pre-mark on migration-generated PT rows

| Check | Got | Note |
|---|---|---|
| Cutoff (expiry_months=6) | 2025-11-24 | — |
| `points_expired=True` PT rows | 0 | trivially — there are no PT rows |
| earned-type rows older than cutoff | 0 | All 233 orders within expiry window |

> D1 pre-mark cannot be exercised because (a) there are no PT rows at all, and (b) none of the 233 orders are older than 6 months. To exercise D1, the test restaurant needs at least one order older than `points_expiry_months` AND `loyalty_clean_slate_recalc=True`.

### V-6 — `points_transactions.created_at = original_order_date` (sample)

Not exercised — 0 PT rows exist. To validate, run with `loyalty_clean_slate_recalc=True`.

### V-7 — Counter parity: `sum(orders.points_earned) == customers.total_points_earned` (sample)

| Sample size | Match |
|---|---|
| 10 customers with `total_points_earned > 0` requested | **0 returned** — no customer has any earned points |

> Trivially holds (0 == 0 for every customer), but **does not prove** the clean-slate recompute path. See §6.

### V-8 — Tier reconciliation: `calculate_tier(total_points, settings) == customer.tier` (sample)

Same as V-7: 0 sample customers (no one has `total_points > 0`). All 209 customers are at `tier=Bronze` with `total_points=0`. Bronze is the correct tier for `total_points=0` per `calculate_tier`, so this trivially holds across all 209 customers.

### V-9 — Tier distribution across all migrated customers

| tier | count | avg_points | max_points |
|---|---|---|---|
| Bronze | 209 | 0.0 | 0 |

All 209 customers are Bronze with 0 points — consistent with `loyalty_clean_slate_recalc=False` and MyGenie passing 0 loyalty data.

### V-10 — Wallet & Coupon counters not touched by LX-A

| Metric | Got |
|---|---|
| Customers with `wallet_balance` present | 209 / 209 ✅ |
| Customers with `total_coupon_used` present | 209 / 209 ✅ |
| Sum `wallet_balance` across all customers | ₹3,180 (carried over from MyGenie) |
| Sum `total_visits` | 145 (carried over from MyGenie) |
| Sum `total_spent` | ₹15,624 (carried over from MyGenie) |
| `wallet_transactions` rows for this restaurant | 35 (pre-existing; not written by LX-A) |

### V-11 — Order `points_earned` distribution

| `points_earned` value | order count | sum(order_amount) |
|---|---|---|
| 0 | 233 | ₹30,838 |

All 233 orders have `points_earned=0` — consistent with MyGenie not sending realtime loyalty for any of them AND `loyalty_clean_slate_recalc=False` (no CRM-side recompute).

### V-12 — Per-order reconciliation against `core.loyalty.calculate_points` (sample 8)

| order_amt (₹) | tier | actual `points_earned` | expected per `calculate_points` (Bronze 5%, min_order=10) |
|---|---|---|---|
| 2000 | Bronze | 0 | **100** |
| 1400 | Bronze | 0 | **70** |
| 1000 | Bronze | 0 | **50** |
| 870 | Bronze | 0 | **43** |
| 700 | Bronze | 0 | **35** (×4 orders) |

**Result: 0/8 reconcile to the current L1 helper math.**

Diagnosis: this is **not a regression** in `calculate_points`. The legacy migration path (with `loyalty_clean_slate_recalc=False`) writes whatever `points_earned` MyGenie sent (which was 0 for these orders because MyGenie's loyalty was likely not enabled at the time). CRM did not recompute. To verify the L3 clean-slate path produces the **expected** values in the right-most column, owner must flip the flag and re-run (see §7).

### V-13 — Aggregate sanity

| Aggregate | Value | Source |
|---|---|---|
| Σ `total_points` | 0 | computed (= Σtotal_earned − Σtotal_redeemed) |
| Σ `total_points_earned` | 0 | MyGenie aggregate fields |
| Σ `total_points_redeemed` | 0 | MyGenie aggregate fields |
| Σ `wallet_balance` | ₹3,180 | MyGenie aggregate fields |
| Σ `total_visits` | 145 | MyGenie aggregate fields |
| Σ `total_spent` | ₹15,624 | MyGenie aggregate fields |

The wallet / visits / spent carrying through MyGenie aggregates **even though** points were not recomputed confirms: clean-slate flag was OFF.

### V-14 — LX-A 3-endpoint contract live on `Jeh's Nest` (sample 3 customers)

Sampled top-3 customers by `total_visits` (Abhishek Goyal — 55 visits, saurav — 37, jayshree — 20). Each customer hit via the running backend with the restaurant's POS API key.

| Endpoint | Customer 1 | Customer 2 | Customer 3 |
|---|---|---|---|
| `GET /api/pos/customers/{id}` — `loyalty` blob = strict 6 keys | ✅ | ✅ | ✅ |
| `GET /api/pos/customers/{id}/loyalty` — `data` = strict 6 keys | ✅ | ✅ | ✅ |
| `POST /api/pos/customer-lookup` — flat shape unchanged + `points_value` tier-aware | ✅ | ✅ | ✅ |

Sample blob (all 3 customers identical because `tp=0`, `tier=Bronze`, no per-tier override, `loyalty_enabled=true`):

```json
{
  "tier": "Bronze",
  "tier_label": "Bronze Member",
  "total_points": 0,
  "ratio_per_point": 0.25,
  "points_value": 0.0,
  "loyalty_enabled": true
}
```

- `ratio_per_point=0.25` correctly resolved from restaurant-level `redemption_value=0.25` (per-tier overrides all `None`).
- `loyalty_enabled=true` (different from the `18march` LX-A smoke result where it was `false`) — proves the kill-switch flag is faithfully reflected at the read layer.

---

## 3. What This Run Proves ✅

1. **Migration orchestration is healthy** — 234 customers + 233 orders pulled from MyGenie cleanly, status `completed`, 0 failed, 10/10 pages, deduped 25 same-phone customers.
2. **Re-sync (C11 safety) is idempotent** — same migration ran twice (2026-05-22 then 2026-05-23) and customer/order/PT counts are identical, not doubled.
3. **D2 hard-block** is not violated — `loyalty_settings` was present, so migration was allowed to proceed.
4. **L2 defensive counter init** is universal — 209 / 209 customers have `total_points_earned`, `total_points_redeemed`, `tier`.
5. **LX-A contract holds on real customer data** — strict 6-key blob on all 3 endpoints, `ratio_per_point` resolved correctly (restaurant-level fallback path on this restaurant), `loyalty_enabled` correctly mirrors settings.
6. **Wallet, coupon, visits, spent, last_visit** aggregates from MyGenie are carried through into CRM customer docs faithfully.

---

## 4. What This Run Does NOT Prove ⚠️

The L3 implementation report claims a **clean-slate recalculation path** that:
- Recomputes points per-order via `core.loyalty.calculate_points`.
- Writes one `points_transactions` row per order with `created_at = original order date`.
- Pre-marks `points_expired=True` for rows older than `points_expiry_months`.
- Ignores MyGenie loyalty/wallet/coupon aggregates and rebuilds counters from scratch.

**None of that code path was executed on this restaurant**, because `loyalty_clean_slate_recalc=False` on `loyalty_settings`. Evidence:

| Expected (clean-slate) | Got (legacy) |
|---|---|
| `points_transactions` rows = number of qualifying orders (≤ 233) | 0 |
| `customers.total_points_earned` > 0 for at least some customers | 0 across all 209 |
| Per-order `points_earned` = `calculate_points(order_amount, customer, settings).total_points` | All 233 orders have `points_earned=0`; expected non-zero (e.g. 100 for the ₹2000 order at Bronze 5%) |

This is **expected** when `loyalty_clean_slate_recalc=False` — the L3 logic explicitly preserves legacy behavior under that flag (per `CR_001C_L_LOYALTY_SCOPE_LOCK.md` Q-LB1 Option C and `CR_001C_L_LOYALTY_L3_IMPLEMENTATION_REPORT.md` §2). It is **not a bug**. It just means the clean-slate code path remains validated **only by controlled QA (mocked httpx)**, not yet by real owner-triggered execution.

---

## 5. L3 Working Status — Recommended Update

**Before this run** (per LX bridge plan §3):
`cr001c_loyalty_l3_controlled_qa_passed_real_migration_validation_pending`

**After this run — proposed nuance** (no formal status change unless owner confirms):
`cr001c_loyalty_l3_controlled_qa_passed_real_legacy_path_validated_clean_slate_path_pending`

Reason: the real owner-triggered migration **did run end-to-end** on a real preprod restaurant, but on the **legacy branch** of the L3 code (which preserves prior behavior by design). The clean-slate branch — which is the substantive part of L3 — still needs a real-data run.

If owner is satisfied with legacy-path validation only, status can advance to:
`cr001c_loyalty_l3_real_migration_validated_in_preview_legacy_path_only`

If owner wants full L3 validation, see §7.

---

## 6. To Fully Validate L3 Clean-Slate (Recommended Next Step)

> Owner action — **agent must not perform any of this**.

1. **Pick a test restaurant** with non-zero historical orders (could be `Jeh's Nest` itself or a different one).
2. **In CRM admin UI** (or via `PATCH /api/loyalty-settings`), set `loyalty_clean_slate_recalc=true` on that restaurant's `loyalty_settings`.
3. **Revert** (or accept) the current data via the migration UI's "Revert" button for the existing run.
4. **Re-trigger Sync Customers → Sync Orders → Complete Migration** from the same UI.
5. **Notify the agent** that the clean-slate-mode migration is complete. Agent will then re-run the full verification matrix and expect:
   - `points_transactions` count ≈ number of orders with `order_amount ≥ min_order_value`.
   - `customer.total_points_earned > 0` for at least some customers.
   - `customer.tier` reconciled with `calculate_tier(total_points, settings)`.
   - PT rows' `created_at` = original `order.order_created_at`.
   - PT rows older than `points_expiry_months` pre-marked `points_expired=True`.
   - Per-order `orders.points_earned` matches `calculate_points(...).total_points`.

---

## 7. Out-of-Scope Re-confirmation

- ❌ Agent did **not** trigger migration.
- ❌ Agent did **not** mutate any Mongo document (read-only queries only).
- ❌ Agent did **not** modify `loyalty_settings` (including `loyalty_clean_slate_recalc`).
- ❌ Agent did **not** restart services, change env, or deploy.
- ❌ `/app/memory/final/` — untouched.
- ❌ L4 / L5 — not started.
- ❌ Coupon (CR-001C-C), Wallet (CR-001C-W) — not started.
- ❌ Existing L1/L2/L3 reports — not modified.

---

## 8. Verification Reproducibility

All read-only Mongo queries used in this report were executed against the live preview Mongo (`mongodb://…@52.66.232.149:27017/mygenie`) via `motor` using `db.users`, `db.customers`, `db.orders`, `db.points_transactions`, `db.loyalty_settings`, `db.migration_sync_logs`, `db.wallet_transactions`. Live API smoke used `curl` against `http://localhost:8001/api/pos/...` with the restaurant's POS API key.

---

## 9. Sign-off

CRM agent — read-only verification complete on `Jeh's Nest` (2026-05-23).

- ✅ Migration completed cleanly, idempotent across two runs.
- ✅ LX-A contract live and correct on real customer data.
- ⏸ **L3 clean-slate path still pending real-data validation** (requires `loyalty_clean_slate_recalc=true` + re-run by owner).

Awaiting owner direction:
- **Option A:** accept legacy-path validation as sufficient — close L3.
- **Option B:** owner flips `loyalty_clean_slate_recalc=true` on a chosen restaurant, re-runs migration, and signals agent to re-verify.
