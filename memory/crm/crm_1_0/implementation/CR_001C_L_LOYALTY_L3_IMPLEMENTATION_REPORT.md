# CR-001C-L Phase L3 — Implementation Report (Final)

**Module:** CR-001C-L (Loyalty)
**Phase:** L3 — Migration Parity
**Date:** 2026-05-22
**Status:** `cr001c_loyalty_l3_implementation_complete_qa_passed`

> Code is now written in the preview pod. Static QA + controlled migration
> QA both passed cleanly. R689 fully restored to pre-test state. Awaiting
> owner approval at the final gate to close L3 in preview.

---

## 1. Locked Scope (Recap)

In:
- F1 helper used by migration order-sync (`core.loyalty.calculate_points` + `calculate_tier`).
- `loyalty_clean_slate_recalc` config flag on `loyalty_settings` (Q-LB1 Option C).
- D2 hard-block both syncs when `loyalty_settings` doc is missing.
- C2/C10-mig hard-init counters under clean-slate.
- C11 allow-list re-sync safety.
- C3 per-order earn with running tier evolution.
- D1 pre-mark `points_expired=True` for orders older than `expiry_months`.
- Re-sync dedup (no double-write to `points_transactions`).
- Drop synthetic backfill + coupon migration writes under clean-slate.
- Legacy behavior (`clean_slate=False`) preserved verbatim.

Out: L4, L5, Wallet, Coupons, Dashboard, WhatsApp, frontend, auth, CR-002, POS schema, prod deploy, `/app/memory/final/`.

---

## 2. Files Changed (3)

```
backend/models/schemas.py
backend/routers/migration.py
backend/routers/customers.py
```

### 2.1 `models/schemas.py`
- `LoyaltySettings` — added `loyalty_clean_slate_recalc: bool = False`.
- `LoyaltySettingsUpdate` — added `loyalty_clean_slate_recalc: Optional[bool] = None`.
- No data migration needed: existing docs without the field are treated as `False` by Pydantic default + every read site uses `settings.get("loyalty_clean_slate_recalc", False)`.

### 2.2 `routers/migration.py`
- New imports: `timedelta` from `datetime`; `calculate_points`, `calculate_tier` from `core.loyalty`.
- `background_order_sync`:
  - **D2 pre-flight** — block sync with explicit error if `loyalty_settings` missing for this `user_id`.
  - Read `clean_slate`, `loyalty_enabled_flag`, `expiry_months` from settings up-front.
  - For each new order (existing-order update branch unchanged):
    - **`clean_slate=True` + `loyalty_enabled=True`** — `_calc_points()` per order using current in-memory customer state; `$set total_points / total_points_earned / tier / total_visits / total_spent / avg_order_value`; `$max last_visit`; mutate in-memory `customer` dict to allow running tier evolution for subsequent orders for the same customer; pre-mark `points_expired=True` on the `points_transactions` row if `order_date < now - expiry_months×30 days`; re-sync dedup via `find_one({user_id, order_id, transaction_type:'earn'})` before insert.
    - **Other combinations** (legacy OR kill-switch) — `$inc total_visits +1`, `$inc total_spent +order_amount`, `$max last_visit`. No points writes.
  - Coupon migration writes (`coupon_transactions.insert_one` + `$inc total_coupon_used`) — **preserved verbatim under legacy** (`clean_slate=False`); **dropped under clean-slate** per Q-LOYALTY-5.

### 2.3 `routers/customers.py`
- New import: `calculate_tier` from `core.loyalty`.
- `background_customer_sync`:
  - **D2 pre-flight** — block sync with explicit error if `loyalty_settings` missing.
  - Read `clean_slate` up-front.
  - `customer_data` construction: counters (`total_points`, `total_points_earned`, `total_points_redeemed`, `wallet_balance`, `total_wallet_received`, `total_wallet_used`, `total_coupon_used`) are inline-ternaried — `0` under `clean_slate=True`, MyGenie aggregate under `clean_slate=False`.
  - `tier` now derived via `_calc_tier(customer_data["total_points"], loyalty_settings_doc)` (replaces hardcoded ladder at original lines 235–245).
  - **Existing-customer branch (C11)**: under `clean_slate=True`, `$set` is an explicit allow-list of demographic + addresses + sync-metadata keys (`name, phone, country_code, email, dob, anniversary, gst_name, gst_number, pos_customer_id, pos_id, pos_restaurant_id, mygenie_synced, last_synced_at, last_updated_at, addresses`); under `clean_slate=False`, full overwrite preserved.
  - **Synthetic backfill** (original lines 303–349 — 4 transaction rows from MyGenie aggregates): now gated `if not existing and not clean_slate:`. Under clean-slate, zero synthetic rows.

---

## 3. Diff Summary

```
backend/models/schemas.py        +6 −0
backend/routers/migration.py     +152 −38   (incl. import update)
backend/routers/customers.py     +56 −11
```

Full `git diff HEAD` available via `cd /app && git diff HEAD -- backend/models/schemas.py backend/routers/migration.py backend/routers/customers.py`.

---

## 4. Behavior Matrix (Verified)

| Flag combination | Customer-sync new | Customer-sync re-sync | Order-sync points | Order-sync coupon |
|---|---|---|---|---|
| `clean_slate=False`, `loyalty_enabled=*` | **Legacy** — trust MyGenie aggregates; synthetic backfill writes 4 tx rows | **Legacy** — full overwrite `$set` | **Legacy** — no points writes; only visits + spend grow | **Legacy** — writes `coupon_transactions` + $inc total_coupon_used |
| `clean_slate=True`, `loyalty_enabled=True` | Counters init to 0; tier via helper; no backfill | **Allow-list `$set`** — counters protected | Per-order `_calc_points()` + running tier evolution + D1 expired pre-mark + dedup | **Skipped** (deferred to CR-001C-C) |
| `clean_slate=True`, `loyalty_enabled=False` | Same as above (counters init to 0) | Same as above | **Kill-switch** — no points writes; only visits + spend grow | **Skipped** |
| `loyalty_settings` doc missing | **BLOCKED** with explicit error in `migration_sync_logs` | — | **BLOCKED** with explicit error in `migration_sync_logs` | — |

---

## 5. QA Outcomes

### 5.1 Static QA — `/tmp/cr_001c_l_l3_static_qa.py`
**62/62 passed**. Coverage:
- D2 customer-sync block ✅
- D2 order-sync block ✅
- C2 + C10-mig clean-slate hard-init (8 counter assertions per customer) ✅
- Legacy preservation (`clean_slate=False`) — trusts MyGenie aggregates, writes synthetic backfill ✅
- C1-mig kill-switch (`clean_slate=True` + `loyalty_enabled=False`) ✅
- C3 + tier evolution (4-order battery Bronze→Silver mid-stream; correct earn % per order; original-date tx; sorted-points equality) ✅
- D1 expired pre-mark (`points_expired=True`; `total_points` NOT incremented; `total_points_earned` IS incremented; `created_at`==old date; `expired_at` populated) ✅
- Re-sync dedup (running order-sync twice → 0 new tx rows; counters unchanged) ✅
- C11 re-sync safety (counters preserved on existing customer under clean-slate even if MyGenie sends different aggregates; `name` updated because allowed) ✅
- Coupon skipped under clean-slate ✅
- Coupon kept under legacy ✅

### 5.2 Controlled Migration QA — `/tmp/cr_001c_l_l3_controlled_qa.py`
**55/55 passed**. End-to-end against R689 (Kunafa Mahal) with mocked httpx (no real MyGenie API call):
- Baseline-aware (asserts deltas; safe with Stage D leftovers).
- Round 1 — 3 customers + 6 orders with clean_slate=True:
  - 21 customer-create assertions (counters all 0, no synthetic backfill).
  - 16 order-sync assertions (tier evolution 539 pts/Silver for c1, D1 expired pre-mark for c2's old order, coupon skipped, sub-min order earns 0).
- Round 2 — same payloads re-run:
  - 6 C11 assertions (counters preserved on c1 even after MyGenie sends `loyalty_point=8888`; `name` updated to "C1 RENAMED" because it's in allow-list).
  - 3 dedup assertions (5 PT rows stayed at 5; counters unchanged).
- Cleanup: all 3 customers, 6 orders, 5 PT rows deleted. R689 restored to baseline. `loyalty_clean_slate_recalc` reset to `False`.

### 5.3 Regression
- L1+L2 helper smoke test passed (`core.loyalty.calculate_points` and `calculate_tier` produce expected values for representative inputs).
- `git diff` confirms `core/loyalty.py`, `core/helpers.py`, `routers/pos.py` are **untouched** since L1+L2 commit, so L1+L2's 229/229 + Stage-D's 45/45 are implicitly preserved.

### 5.4 Service Health
- Backend supervisor `RUNNING`; `GET /api/health` → 200 OK after restart.
- Lint: `migration.py` and `models/schemas.py` pass `ruff check`. `customers.py` has one pre-existing F841 (unused `now` at line 1539) unrelated to L3.

---

## 6. Known Limitations (Documented)

1. **Cross-page tier evolution** — if MyGenie's pagination returns the same customer's orders across multiple pages in non-chronological order, the later order may earn at a slightly evolved tier. The in-memory `customer` mutation handles intra-page order sequences correctly, but cross-page non-chronological order is not auto-sorted. Affects ≤ tier-delta % of points. Acceptable for clean-slate go-live (R689 pre-prod). A perfect chronological sort across all pages would require a memory-heavy pre-pass — deferred to a future enhancement CR if needed.

2. **L4 hooks not yet present** — Manual redeem (`points.py::create_points_transaction`) and birthday/anniversary cron (`core/loyalty_jobs.py`) still use `$set total_points` and don't `$inc total_points_earned/redeemed`. By design — L4 is a separate phase.

3. **`pos_payment_received` legacy endpoint still dead-but-present** — confirmed 0 calls; scheduled for L5 cleanup.

---

## 7. Files NOT Touched (Owner-Locked)

- `backend/core/loyalty.py` ✓
- `backend/core/helpers.py` ✓
- `backend/routers/pos.py` ✓
- `backend/routers/wallet.py` ✓
- `backend/routers/coupons.py` ✓
- `backend/routers/feedback.py` ✓
- `backend/routers/whatsapp*.py` ✓
- `backend/routers/auth.py` ✓
- `backend/core/pos_request_logger.py` ✓
- `backend/services/analytics_service.py` ✓
- `frontend/**` ✓
- `/app/memory/final/` ✓
- No prod deploy.
- No broad MyGenie API call.

---

## 8. ⏸ Hard Gate — Owner Approval for L3 Closure

L3 status target reached: **`cr001c_loyalty_l3_migration_parity_qa_passed`**.

Reply with one of:
1. **"L3 approved — proceed to L4"** → I move to Phase L4 (manual redeem + cron `$inc` consistency).
2. **"L3 needs revisions: …"** → I adjust before closing.
3. **"Hold — verify [X] first"** → I verify the specific item.

Per owner instruction, **no L4 or L5 work begins until this gate clears.** No prod deploy.
