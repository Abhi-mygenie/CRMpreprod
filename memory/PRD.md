# CRM Preprod (mygenie / DinePoints) — PRD & Status Log

## Original Problem Statement
1. Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git (branch: 22-may), copy into /app directly.
2. Use remote MongoDB: `mongodb://mygenie_admin:***@52.66.232.149:27017/mygenie`.
3. Build as-is. Do not run testing agent.

### Subsequent Scope
- **CR-001A Phase 2** (`room_info` + `associated_order_ids` capture) — DONE in preview.
- **CR-001D** (`orders.restaurant_id` null fix) — DONE in preview.
- **CR-001C-L** (Loyalty correctness; clean-slate pre-prod policy):
  - L1 (F1) — Shared `core/loyalty.py` helper.
  - L2 (C1, C4, C6, C10) — Realtime POS correctness + kill-switch.
  - L3 — Migration parity. **NOT STARTED**.
  - L4 — Manual redeem + cron consistency. **NOT STARTED**.
  - L5 — Dead-code cleanup. **NOT STARTED**.

## Stack
- Backend: FastAPI on :8001, Motor/PyMongo, APScheduler.
- Frontend: React 19 + CRACO + Tailwind + Radix UI + Capacitor.
- DB: Remote MongoDB at 52.66.232.149:27017 (db=mygenie).

## What's been implemented (chronological)

### 2026-05-22 — Initial bring-up
- Cloned `22-may` branch into /app, preserved `.git` and `.emergent`.
- Created `backend/.env` (MONGO_URL, DB_NAME=mygenie, CORS_ORIGINS=*, JWT_SECRET) and `frontend/.env` (REACT_APP_BACKEND_URL).
- Installed deps; `/api/health` ✅; supervisor RUNNING.

### 2026-05-22 — CR-001A Phase 2 + CR-001D (preview)
- `backend/routers/pos.py` — `POSOrderWebhook` accepts new `room_info` (RoomInfo: room_price/advance_payment/balance_payment) + `associated_order_ids` (List[int]→List[str] coercion).
- Order doc now persists `restaurant_id` alongside legacy `pos_restaurant_id`.
- Pre-existing tests `/tmp/cr_001a_phase2_qa.py`, `/tmp/cr_001a_phase2_order_doc_qa.py`.
- Status: ✅ preview verified. ⏸ **PROD deploy pending (user manual pm2 restart at `crm.mygenie.online`).**

### 2026-05-22 — CR-001C-L Phase L1 + L2 (preview-pod)
**Files:**
- `backend/core/loyalty.py` (NEW, 81 lines) — single source of truth: `calculate_points()` + `calculate_tier()`.
- `backend/core/helpers.py` — `calculate_tier` turned into thin re-export shim of `core.loyalty.calculate_tier`.
- `backend/routers/pos.py`:
  - `_calculate_points` → thin wrapper around `core.loyalty.calculate_points` (rollback safety; removal scheduled for L5).
  - `pos_order_webhook`:
    - **C1** — Gates points math + tier recompute on `settings.loyalty_enabled`.
    - **C4** — `$inc {total_points_earned: N}` when loyalty on & points earned > 0.
  - `_find_or_create_customer`:
    - **C1 + C6** — First-visit bonus gated on `loyalty_enabled`.
    - **C6** — Initialises `total_points_earned = first_visit_bonus`.
    - **C10** — Initialises `total_points_redeemed = 0`.
  - `pos_create_customer` (REST POS-create endpoint):
    - **C10** — Initialises `total_points_earned = 0`, `total_points_redeemed = 0`.
- `backend/routers/customers.py::create_customer` (CRM-manual create):
  - **C6** — Initialises `total_points_earned = first_visit_bonus`.
  - **C10** — Initialises `total_points_redeemed = 0`.

**QA:**
- Static / parity harness: `/tmp/cr_001c_l_l1_l2_parity_qa.py` — **229/229 passed**.
- Stage D live verification on R689 (Kunafa Mahal): `/tmp/cr_001c_l_stage_d_live_run.py` — **45/45 passed** (T1 first-visit + earn, T2 repeat earn, T3 tier upgrade Bronze→Silver, T4 earn at Silver rate, T6 kill-switch OFF suppression + tier preservation + visits/spend still grow).

**Status:** ✅ preview verified. ⏸ **PROD deploy pending — batch with CR-001A/D per Stage B lock D5.**

### 2026-05-22 — Loyalty Settings UI master toggle
- `frontend/src/pages/LoyaltySettingsPage.jsx` — added `loyalty_enabled` master toggle. ✅ User verified on R689.

### 2026-05-22 — `pos_payment_received` dead-code audit
- Endpoint `/api/pos/webhook/payment-received` confirmed dead: 0 hits in `pos_request_logs` (vs 35 for `/api/pos/orders`); no callers in code, tests, or docs.
- **Not removed in this batch** (out of L1+L2 scope). Scheduled for Phase L5 cleanup.

## Prioritized Backlog

### P0 — Awaiting user action
- **PROD deploy** of CR-001A Phase 2 + CR-001D + CR-001C-L Phase L1+L2 (batched per D5). User runs `pm2 restart` on `crm.mygenie.online` after pulling the merged diff.

### P1 — CR-001C-L continuation
- **L3 — Migration parity** (gated on Q-LB1 — already locked as Option C: `loyalty_clean_slate_recalc` flag).
  - `routers/migration.py` order_sync: replace broken `earn_percent` line with `calculate_points()`; honor `loyalty_enabled`; `$inc total_points + total_points_earned + total_visits + total_spent`; recompute tier inline; drop coupon/wallet aggregate copying.
  - `routers/customers.py::sync_customers_from_mygenie`: hard-init counters to 0 (drop MyGenie aggregate reads); drop synthetic backfill block (lines 303–347 of historical original); allow-list `$set` on existing-customer branch to protect counters (C11 safety).
  - Add `loyalty_clean_slate_recalc` per-restaurant config flag + missing-settings block (D2).
  - Pre-mark migration-generated `points_transactions` rows as `points_expired=True` if older than `expiry_months` (D1).
- **L4 — Manual redeem + cron consistency.**
  - `routers/points.py::create_points_transaction`: `$inc total_points_redeemed` on `type=redeem`; `$inc total_points_earned` on `type in {earn, bonus}` (gated on `loyalty_enabled`).
  - `core/loyalty_jobs.py` (birthday + anniversary): switch from `$set total_points` to `$inc total_points + total_points_earned`; recompute tier; honor `loyalty_enabled` at job start.
- **L5 — Dead-code cleanup.**
  - Remove `pos._calculate_points` wrapper.
  - Remove `pos_payment_received` legacy endpoint + `POSPaymentWebhook` schema.
  - Remove `migration.py:276` broken `earn_percent` line + inline tier calc in `customers.py:235–245`.
  - Consolidate POS fallback redemption constants in `core/loyalty.py`.

### P2 — Other CR-001C modules (per CR_001C_MODULE_BREAKDOWN_PLAN.md)
- **CR-001C-C** (Coupons): add `coupon_enabled` UI master toggle; correctness of `total_coupon_used` counter; coupon_transactions write-path audit.
- **CR-001C-W** (Wallet): add `wallet_enabled` UI master toggle; correctness of `total_wallet_received` / `total_wallet_used` counters.
- **CR-001C-V** (Dashboard / Visibility): expired-points dashboard card; customer "expired" card; cross-restaurant analytics correctness.

### Deferred (out of CR-001C-L)
- **C8** — Tier-upgrade WhatsApp event from realtime POS → next WhatsApp Automation CR.
- **C9** — Off-peak timezone + cross-midnight → separate i18n CR when non-IST restaurant onboards.

## Notes / Known Issues
- `customers.py:1483` ruff F841 (`local variable 'now' never used`) — pre-existing, unrelated to L1+L2.
- `customers.py:1093` `FRONTEND_URL` default string pre-modified in working tree (`crm-planning-v1` → `crm-phase-loyalty`) — no-op default; not introduced by this work.
- ESLint warnings in several pages (missing useEffect deps) — non-blocking.
- VisualEdits overlay file missing inside node_modules — non-blocking warning.
- Testing agent intentionally skipped per user request; parity + live Stage D harnesses substitute.

## Test Restaurants
- **R689 (`pos_0001_restaurant_689`, Kunafa Mahal)** — primary CR-001C-L test bed. Clean slate confirmed (0 customers / 0 orders / 0 pt) pre-Stage-D; post-Stage-D: 1 customer / 5 orders / 5 pt; loyalty_enabled reverted to `True`.
