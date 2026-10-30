# CR-001C Phase 1 — Readiness & Scope Plan

**CR:** CR-001C — CRM Visibility / Running Totals / Dashboard Data Correctness
**Phase:** 1 (planning only — no implementation)
**Date:** 2026-05-22
**Status:** **`cr001c_phase_1_scope_planned_waiting_owner_approval`**

> Planning agent output. No code, no DB, no frontend, no backend, no
> `/app/memory/final/`, no baseline doc was modified by this session.

---

## 1. Status

`cr001c_phase_1_scope_planned_waiting_owner_approval`

Implementation is **not** ready to start. 4 owner answers + CR-001A Phase 2 +
CR-001D live closure are required before Phase 1A can begin.

---

## 2. Docs Read

| Doc | Status | Notes |
|---|---|---|
| `/app/memory/crm/crm_1_0/planning/CR_001_INDEX.md` | ✅ Read | Updated by previous CR-001A Phase 2 session |
| `/app/memory/crm/crm_1_0/planning/CR_001A_PHASE_2_SPEC.md` | ✅ Read | — |
| `/app/memory/crm/crm_1_0/final/CRM_1_0_OPEN_GAPS_REGISTER.md` | ✅ Read | Confirms CR-001A Phase 2 + CR-001D preview verified |
| `/app/memory/crm/crm_1_0/implementation/CR_001A_PHASE_1_IMPLEMENTATION_REPORT.md` | ✅ Read | — |
| `/app/memory/crm/crm_1_0/implementation/CR_001A_PHASE_2_AND_CR_001D_IMPLEMENTATION_REPORT.md` | ✅ Read | Latest — preview-verified |
| `/app/memory/crm/crm_1_0/qa/CR_001A_PHASE_1_QA_REPORT.md` | ✅ Read | — |
| `/app/memory/crm/crm_1_0/qa/CR_001A_PHASE_2_AND_CR_001D_QA_REPORT.md` | ✅ Read | Latest — preview-verified |
| `/app/memory/crm/crm_1_0/planning/CR_001C_CRM_VISIBILITY_UI.md` | ❌ **MISSING** in this pod | Same residual as GAP-MEM-1 (older handover docs absent). Scope derived from code + the brief CR-001C intent line in `CR_001_INDEX.md`. |
| `/app/memory/crm/crm_1_0/findings/ISSUE_09_POS_REALTIME_WEBHOOK_SCHEMA_MISMATCH.md` | ❌ **MISSING** | Same residual; ISSUE-09 substance already absorbed by CR-001A Phase 1 closure. |
| `/app/memory/crm/crm_1_0/findings/CR_001B_MIGRATION_AUDIT_REPORT.md` | ❌ **MISSING** | Same residual; CR-001B status taken from `CR_001_INDEX.md`. |
| `/app/memory/crm/crm_1_0/planning/CR_001A_REALTIME_POS_WEBHOOK.md` | ❌ **MISSING** | Same residual; CR-001A substance covered by Phase 1 + Phase 2 docs. |

Memory grep for `CR-001C`, `running totals`, `dashboard`, `coupon`,
`discount`, `total_points`, `wallet`, `customer stats`, `visibility`,
`analytics` returned no further docs beyond the 6 present files.

**Action for owner:** confirm whether the missing CR-001C / ISSUE-09 /
CR-001B / CR-001A handover docs should be located/re-imported before
Phase 1A starts, or whether code-as-truth + this plan is sufficient.

---

## 3. Code Areas Inspected (read-only)

Backend:

| File | Lines reviewed | Purpose |
|---|---|---|
| `/app/backend/routers/pos.py` | 780–945 (`_save_order_and_transactions`), 1200–1280 (realtime order pipeline), 2320–2386 (`pos_apply_coupon`) | Realtime write-path |
| `/app/backend/routers/customers.py` | 180–195 (migration seed), 580–610 (POS-create stub), 700–720 (legacy POS read), 1480–1495 (`/customers/{id}/loyalty/value`) | Customer doc shape & loyalty value endpoint |
| `/app/backend/routers/migration.py` | 295–331 (coupon_transactions write + customer `$inc`) | Migration write-path |
| `/app/backend/routers/analytics.py` | 1–620 (item-performance, customer-lifecycle) | Analytics endpoints used by ItemAnalyticsPage / CustomerLifecyclePage |
| `/app/backend/routers/feedback.py` | 65–139 (`/analytics/dashboard`) | Dashboard aggregator |
| `/app/backend/services/analytics_service.py` | 1–284 (all helpers) | Source of dashboard numbers |
| `/app/backend/routers/coupons.py` | 40–225 | CRM-side coupon CRUD + usage |
| `/app/backend/routers/points.py` | top-level | Manual points adjust |
| `/app/backend/routers/wallet.py` | top-level | Manual wallet adjust |

Frontend:

| File | Purpose |
|---|---|
| `/app/frontend/src/pages/DashboardPage.jsx` | Dashboard cards — wallet, coupons, discount, orders, revenue |
| `/app/frontend/src/pages/CustomerDetailPage.jsx` | Customer profile — total_points_earned/redeemed/coupon_used (lines 278, 285, 312) |
| `/app/frontend/src/pages/CustomersPage.jsx` | Customers list — filters by total_visits / total_spent / tier / last_visit |
| `/app/frontend/src/pages/CouponsPage.jsx` | Coupon CRUD UI |
| `/app/frontend/src/pages/CustomerLifecyclePage.jsx` | Lifecycle analytics |
| `/app/frontend/src/pages/ItemAnalyticsPage.jsx` | Per-item analytics |

No code was modified.

---

## 4. Current Dependency Status

| Dependency | State | Implication for CR-001C |
|---|---|---|
| **CR-001A Phase 1** (alias fix) | ✅ Closed live on prod 2026-05-22 09:10:46 UTC | Future realtime orders persist `order_created_at`, `pos_food_id`, `item_qty`, `item_price` correctly → any CR-001C analytics that group by these fields are sound for future orders. |
| **CR-001A Phase 2** (`room_info`, `associated_order_ids`) | 🟡 Preview-verified, **prod deploy pending** | Until prod deploy + `pos-backend` pm2 id 7 restart + live 13-check pass, dashboards cannot show room revenue or linked-order chains. Blocks any room-revenue / parent-child-order CR-001C card. |
| **CR-001D** (`orders.restaurant_id`) | 🟡 Same PR as Phase 2, preview-verified, **prod deploy pending** | Until live, restaurant-level filtering on `orders` requires fallback (`user_id` → `users.restaurant_id`). All multi-restaurant aggregates in CR-001C must use that fallback or wait. |
| **CR-001B Phase 2** (R689 sync) | ⏳ Owner-driven, page 145/329 last seen | Not blocking — CR-001C is read-side / write-path-realtime; migration is independent. |
| **F10 → CR-003 Loyalty Points Flow** | ⏳ Deferred | Out of scope for CR-001C Phase 1. |
| **Forward-only policy** | 🔒 In force | No backfill of `total_points_earned`, `total_points_redeemed`, `total_coupon_used`, `last_coupon_used`, `restaurant_id`, `room_info`, or `associated_order_ids`. Old residual stays as-is. |

---

## 5. CR-001C Candidate Work Items

Each item discovered by reading the actual code. Field/collection names
are exact.

### W1 — Dashboard coupon stats blind to realtime usage

| Attribute | Value |
|---|---|
| **Current behavior** | `services/analytics_service.py::get_coupon_stats(user_id)` counts `db.coupon_transactions.count_documents(...)` and sums `coupon_transactions.discount_amount`. Realtime `POST /api/pos/coupons/apply` (pos.py 2378) writes to `db.coupon_usage` instead. → `coupons_used` and `discount_availed` are ~0 if all activity is realtime; only migration-imported coupon usage shows. |
| **Expected** | Dashboard `coupons_used` + `discount_availed` reflect realtime usage too. |
| **Area** | Backend (analytics) |
| **Risk** | Low — pure read; no schema change |
| **Dependency** | None |
| **Forward-only feasibility** | ✅ — read-side merge of two collections, no historical mutation |
| **Proposed approach (planning)** | `coupons_used = coupon_transactions.count + coupon_usage.count` (per `user_id`/coupon-owner). `discount_availed = sum(coupon_transactions.discount_amount) + sum(coupon_usage.discount_applied)`. Owner to confirm dedup rule (some prod orders may appear in both during overlap windows). |

### W2 — Customer doc `total_points_earned` / `total_points_redeemed` frozen at migration

| Attribute | Value |
|---|---|
| **Current behavior** | `customers.total_points_earned` / `total_points_redeemed` are seeded only by `customers.py:184-185` (migration import). Realtime POS path (`pos.py:1233-1244`) updates `total_points`, `tier`, `wallet_balance`, `total_visits`, `total_spent`, `avg_order_value`, `last_visit` — but never increments earned/redeemed counters. |
| **UI impact** | CustomerDetailPage.jsx lines 278 + 285 render these fields verbatim → both numbers are frozen after migration; every subsequent realtime order is invisible in "Total Earned"/"Total Redeemed". |
| **Source of truth (live)** | `points_transactions` collection — realtime path writes `transaction_type ∈ {earn, redeem, bonus}` with `points`, already powers dashboard `get_points_stats()` correctly. |
| **Area** | Backend (write-path increment) OR backend (read-side compute) |
| **Risk** | Low—medium. Care needed: must NOT double-count if migration ever re-runs over the same orders (CR-001B-fix F12 dedup mitigates). |
| **Dependency** | None hard. Forward-only safe. |
| **Forward-only feasibility** | ✅ — choose one of: (a) `$inc` on `total_points_earned` += `points_earned` and on `total_points_redeemed` += `points_redeemed` in the realtime POS path (future orders only); (b) replace read-time stale field with an aggregation over `points_transactions` filtered by `customer_id` (purely read-side, zero write change). |
| **Recommendation** | (b) for visibility-only fix; (a) only if owner wants the column updated on the doc itself. |

### W3 — Customer doc `total_coupon_used` frozen at migration

| Attribute | Value |
|---|---|
| **Current behavior** | Migration `$inc {total_coupon_used:1}` per order with `coupon_discount > 0` (migration.py:320). Realtime `pos_apply_coupon` (pos.py:2378) writes `coupon_usage` row but does **not** `$inc` the customer doc. |
| **UI impact** | CustomerDetailPage.jsx line 312 — frozen counter. Same pattern as W2. |
| **Area** | Backend |
| **Risk** | Low |
| **Dependency** | None |
| **Forward-only feasibility** | ✅ — `$inc` on apply, or read-time count from `coupon_usage` + `coupon_transactions` |

### W4 — Customer doc `last_coupon_used` never updated

| Attribute | Value |
|---|---|
| **Current behavior** | Initialized to `None` (pos.py:165, 284, 649, 1398; customers.py:608, 1176). Nothing writes to it. |
| **UI impact** | If/where displayed = always "—". (Currently not displayed but referenced in schemas.) |
| **Area** | Backend |
| **Risk** | Low |
| **Forward-only feasibility** | ✅ — set on realtime coupon apply (future orders only). |

### W5 — Dashboard discount aggregation misses non-coupon discounts

| Attribute | Value |
|---|---|
| **Current behavior** | `orders` doc carries `order_discount`, `self_discount`, `coupon_discount` (pos.py:817-820). Dashboard `discount_availed` only sums `coupon_transactions.discount_amount`. → Non-coupon discounts (manager override / self_discount / order_discount) are invisible. |
| **Expected** | Dashboard either (a) shows total discount granted = sum(all three) per period, or (b) breaks it out as 3 separate cards. |
| **Area** | Backend (analytics) + Frontend (card labels) |
| **Risk** | Low |
| **Dependency** | None |
| **Forward-only feasibility** | ✅ — read-side aggregation over `orders.created_at`. |

### W6 — Dashboard "Revenue" excludes room billing breakdown awareness

| Attribute | Value |
|---|---|
| **Current behavior** | `order_amount` is sent by POS already including room_price for room orders, so dashboard `total_revenue` is numerically correct today. BUT analytics can't break out "room revenue" vs "F&B revenue" because `room_info` is dropped (CR-001A Phase 2 fix pending live). |
| **Area** | Frontend + Backend |
| **Dependency** | **Blocked by CR-001A Phase 2 live closure.** |
| **Forward-only feasibility** | ✅ — once Phase 2 is live, future orders carry `room_info` and a "Room revenue (last 7/30D)" card becomes computable. Pre-Phase-2 orders remain residual. |

### W7 — Restaurant-level filtering uses fallback path

| Attribute | Value |
|---|---|
| **Current behavior** | Every dashboard / analytics endpoint filters by `user_id` (which IS scoped to a restaurant). Works fine. But if any CR-001C card wants to do cross-user / chain-level aggregation by `restaurant_id`, the `orders` collection has `restaurant_id=null` until CR-001D is live. |
| **Area** | Backend (analytics) |
| **Dependency** | **Blocked by CR-001D live closure** (for any new cross-user queries; existing user_id-scoped queries unaffected). |
| **Forward-only feasibility** | ✅ once CR-001D is live |

### W8 — `customer["customer_health"]` definitions drift between dashboard and customers list

| Attribute | Value |
|---|---|
| **Current behavior** | Dashboard's "active_30d", "new_7d", "repeat_2_plus" computed from `customers.total_visits` and `customers.last_visit` (analytics_service.py via `get_customer_health_stats`). CustomersPage.jsx filters use the same fields → consistent. Customer Lifecycle page (analytics.py:264) uses its own pipeline. No drift between dashboard and list page based on code read; lifecycle page may diverge. |
| **Area** | Frontend (mostly informational) |
| **Forward-only feasibility** | ✅ |
| **Recommendation** | Audit only — defer fix unless drift found. |

### W9 — `get_coupon_stats` `total_coupons` counts all-time, not active

| Attribute | Value |
|---|---|
| **Current behavior** | `db.coupons.count_documents({"user_id": user_id})` counts all coupons including expired/archived. |
| **Expected** | Likely should be active (not expired, within `start_date`/`end_date`) — owner to confirm. |
| **Area** | Backend |
| **Forward-only feasibility** | ✅ |

### W10 — Customer Detail "earned_money_value" / "redeemed_money_value" use frozen counters

| Attribute | Value |
|---|---|
| **Current behavior** | `customers.py:1485-1495` `/customers/{id}/loyalty/value` multiplies stale `total_points_earned` / `total_points_redeemed` by `redemption_value`. → Displays incorrect monetary values until W2 is fixed. |
| **Area** | Backend (read endpoint) |
| **Dependency** | W2 |
| **Forward-only feasibility** | ✅ |

---

## 6. Data Mapping Table

| Metric / Card | Source collection | Source field | Write path | Display path | Known gap | Fix needed |
|---|---|---|---|---|---|---|
| Dashboard "Coupons" (total) | `coupons` | `_count` | `coupons.py:43` (CRM create) | DashboardPage.jsx:472 | All-time count includes expired | W9 |
| Dashboard "Used" (coupon count) | `coupon_transactions` only | `_count` | Migration only (migration.py:315) | DashboardPage.jsx:473 | Realtime usage in `coupon_usage` ignored | **W1** |
| Dashboard "Discount" availed | `coupon_transactions` only | `discount_amount` sum | Migration only | DashboardPage.jsx:474 | (1) Realtime usage in `coupon_usage.discount_applied` ignored; (2) `orders.order_discount`/`self_discount`/`coupon_discount` ignored | **W1 + W5** |
| Dashboard "Wallet In/Out/Bal" | `wallet_transactions` | `amount` by type | Realtime POS, manual wallet | DashboardPage.jsx:457-459 | None — works correctly | — |
| Dashboard "Revenue" | `orders` | `order_amount` sum | Realtime POS + migration | DashboardPage.jsx:489 | None for total — but room/F&B split unavailable until W6 | W6 (deps Phase 2) |
| Dashboard "Orders" | `orders` | `_count` | Realtime POS + migration | DashboardPage.jsx:486 | None | — |
| Dashboard "Active 30D / New 7D / Repeat 2+/5+/10+" | `customers` | `total_visits`, `last_visit` | Realtime POS + migration | DashboardPage.jsx (customer-health card) | None — consistent | — |
| CustomerDetail "Total Points" (balance) | `customers` | `total_points` | Realtime POS + migration | CustomerDetailPage.jsx:267 | None | — |
| CustomerDetail "Total Earned" | `customers` | `total_points_earned` | Migration only (initial seed) | CustomerDetailPage.jsx:278 | **Frozen since migration** | **W2** |
| CustomerDetail "Total Redeemed" | `customers` | `total_points_redeemed` | Migration only | CustomerDetailPage.jsx:285 | **Frozen** | **W2** |
| CustomerDetail "Coupons Used" | `customers` | `total_coupon_used` | Migration only | CustomerDetailPage.jsx:312 | **Frozen** | **W3** |
| CustomerDetail "Wallet Balance" | `customers` | `wallet_balance` | Realtime POS + manual wallet | CustomerDetailPage.jsx:295 | None | — |
| CustomerDetail "Total Spent" / "Last Visit" / "Tier" | `customers` | `total_spent` / `last_visit` / `tier` | Realtime POS + migration | CustomerDetailPage.jsx:240, 242, 253 | None | — |
| `/customers/{id}/loyalty/value` "earned_money_value" / "redeemed_money_value" | `customers` | `total_points_earned`, `total_points_redeemed` | Migration only | CustomerDetailPage.jsx loyalty modal | Inherits W2 freeze | **W10** |
| Customer List filters | `customers` | `total_visits`, `total_spent`, `tier`, `last_visit` | Realtime POS + migration | CustomersPage.jsx | None | — |
| `restaurant_id`-scoped aggregates | `orders` | `restaurant_id` | Currently null (CR-001D fix pending live) | (n/a yet) | Blocked | **W7** (deps CR-001D) |
| Room revenue / linked-order chains | `orders` | `room_info`, `associated_order_ids` | Currently null (CR-001A Phase 2 fix pending live) | (n/a yet) | Blocked | **W6** (deps Phase 2) |

---

## 7. Owner Questions

**Q1.** Should CR-001C Phase 1 focus first on:
- A. Customer running totals only (W2 + W3 + W4 + W10)
- B. Dashboard coupon/discount visibility only (W1 + W5 + W9)
- C. Both customer running totals + dashboard coupon/discount (W1 + W2 + W3 + W4 + W5 + W9 + W10)
- D. Read-only audit first (verify counts in prod Mongo for the affected restaurants, then decide scope)

**Q2.** Historical residuals (pre-CR-001A-Phase-1 data with null `order_created_at`, frozen `total_points_earned/redeemed/coupon_used` from migration cutover):
- A. Show as-is, no banner
- B. Add a one-line "Data coverage: from <migration_date>" note per affected card
- C. Hide affected historical metrics (filter `created_at >= migration_date`)
- D. Decide per screen

**Q3.** Coupon/discount analytics (W1 + W5):
- A. Use existing live fields only — pick one collection (`coupon_usage` going forward), accept old `coupon_transactions` will not appear
- B. Add compatibility for **both** old and new collections (union with dedup by `order_id` if present)
- C. Backend must normalize first — write a small in-app reconciliation layer (read-only) that emits a unified view via aggregation
- D. Defer to separate CR (CR-004 Analytics Normalization)

**Q4.** Customer stats (`total_points_earned`, `total_points_redeemed`, `total_coupon_used`):
- A. Update only future orders (`$inc` on realtime path) — old gap stays as residual
- B. Recalculate per customer on-demand from `points_transactions` + `coupon_usage` (no write, aggregation-on-read)
- C. Show "From <migration_date>" note on the card and only update going forward
- D. Defer to CR-003 Loyalty Points Flow

**Q5.** Should CR-001C wait until CR-001A Phase 2 + CR-001D are live on prod?
- A. Yes — wait for full live closure of the parked PR before any CR-001C code starts
- B. No, plan now but implement after Phase 2 + CR-001D live closure
- C. Implement independent frontend-only pieces now (read-side only, no write-path coupling)
- D. Split into two buckets: **dependency-free** (W1, W2, W3, W4, W5, W8, W9, W10) start now after Q1–Q4 answered; **dependency-blocked** (W6, W7) parked until prod live closure

**Q6 (bonus — only because docs are missing).** The CR-001C / CR-001A
/ ISSUE-09 / CR-001B handover docs listed in your task brief don't exist
in this preview pod (same residual as GAP-MEM-1):
- A. Locate and re-import them before Phase 1A starts
- B. Treat code-as-truth + this plan as sufficient
- C. I'll regenerate stub docs from current code/state for the audit trail

---

## 8. Recommended Phase Split

### Phase 1A — Dependency-free, read-side first (recommended start)
- **W1** Dashboard coupon stats: union `coupon_usage` + `coupon_transactions` in `get_coupon_stats`. Pure read.
- **W5** Dashboard discount: aggregate `orders.order_discount` + `orders.self_discount` + `orders.coupon_discount` for the period; expose alongside coupon-only number.
- **W9** `total_coupons` filtered to non-expired (owner-confirmed definition).
- **W10** `/customers/{id}/loyalty/value` switches `earned_money_value` / `redeemed_money_value` to be computed from `points_transactions` aggregation (no schema change).
- **W2 (read-side variant)** CustomerDetail "Total Earned" / "Total Redeemed" sourced from `points_transactions` aggregation in a new `/customers/{id}/stats` endpoint (no `customers` write). Forward-only safe; historical orders that are in `points_transactions` show up naturally; missing rows just don't.
- **W8** Lifecycle-page audit only — no code change.

**Risk:** low. **Backend changes only.** Frontend changes minimal (1 or 2
fields swap to the new endpoint). No DB write. No migration. No
historical mutation.

### Phase 1B — Write-path increments (after Phase 1A is live + Q4 answered)
- **W2 (write-side variant)** `$inc {total_points_earned: +points_earned, total_points_redeemed: +redeem_points}` on realtime POS path.
- **W3** `$inc {total_coupon_used: 1}` on realtime coupon apply.
- **W4** `$set {last_coupon_used: code, last_coupon_used_at: now}` on realtime coupon apply.

**Risk:** medium — write-path change requires CR-001B-fix F12 dedup
confirmation to avoid double-counting if migration re-runs over the same
orders. Owner approval required.

### CR-001C Backlog (blocked by CR-001A Phase 2 + CR-001D live)
- **W6** Room revenue card / F&B-vs-room revenue split (needs `orders.room_info` populated → CR-001A Phase 2 live).
- **W7** Cross-user / chain-level restaurant filtering on `orders` (needs `orders.restaurant_id` populated → CR-001D live).

These ship as **CR-001C Phase 2** once the parked PR is live + 13-check
passes on prod.

---

## 9. Implementation Readiness Verdict

**NOT ready to start Phase 1A code yet.** Required gates:

1. ✅ Static plan complete (this document).
2. ⏳ Owner answers Q1–Q5 (and optionally Q6).
3. ⏳ Confirm scope set: typically Q1=C or D, Q5=D → Phase 1A starts on W1, W5, W9, W10 + W2-read-side immediately.
4. 🟡 CR-001A Phase 2 + CR-001D prod live closure — **not** a blocker for Phase 1A (Phase 1A items are dependency-free), but **is** a blocker for Phase 2 (W6 + W7).
5. (Optional) Locate or stub the 4 missing handover docs per Q6.

Once Q1–Q5 are answered and scope is locked, Phase 1A implementation is
~1 backend file (`analytics_service.py`) + 1 small new endpoint in
`customers.py` + ~2 small frontend field swaps in `CustomerDetailPage.jsx`
and `DashboardPage.jsx`. Estimated 60–90 minutes of implementation + 30
minutes of static QA on this preview pod (same shape as CR-001A Phase 2
QA).

---

## 10. Confirmations

- ✅ **No code changed.** `git status` shows only the docs from prior
  session; this planning session created **only** this new file.
- ✅ **No backend changed.**
- ✅ **No frontend changed.**
- ✅ **No DB mutated.** Read-only inspection via Python motor for R689
  status check only (already done in prior session, not repeated here).
- ✅ **`/app/memory/final/` untouched.** This file is in `planning/`.
- ✅ **No baseline doc updated.** `CR_001_INDEX.md` and
  `CRM_1_0_OPEN_GAPS_REGISTER.md` were updated in the prior CR-001A Phase 2
  session — this CR-001C planning session does **not** touch them.

---

## 11. Final Response Summary

1. **Status:** `cr001c_phase_1_scope_planned_waiting_owner_approval`
2. **Planning document path:** `/app/memory/crm/crm_1_0/planning/CR_001C_PHASE_1_READINESS_AND_SCOPE_PLAN.md`
3. **Candidate items found:** 10 (W1–W10), grouped into Phase 1A (6 dependency-free), Phase 1B (3 write-path), Backlog (2 blocked by CR-001A Phase 2 / CR-001D live)
4. **Owner questions:** 5 (+1 bonus on missing handover docs) = **6 total**
5. **Dependency blockers:**
   - CR-001A Phase 2 prod live closure → blocks W6
   - CR-001D prod live closure → blocks W7
   - Owner answers Q1–Q5 → blocks Phase 1A start
   - (Q4 answer) → blocks Phase 1B write-path increments
6. **Implementation readiness verdict:** **NOT ready.** Awaiting owner answers; Phase 1A becomes ready immediately after Q1+Q5 (and ideally Q3) are answered. Phase 2 (W6+W7) parked behind the existing CR-001A Phase 2 / CR-001D prod deploy.
7. **Confirmation no code changed:** ✅
8. **Confirmation no DB mutation:** ✅
9. **Confirmation `/app/memory/final/` untouched:** ✅
