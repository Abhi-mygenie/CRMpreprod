# CR-001C Phase 1 — Readiness & Scope Plan (v2 — Pre-Production)

**CR:** CR-001C — CRM Visibility / Running Totals / Dashboard Data Correctness
**Phase:** 1 (planning only — no implementation)
**Revision:** v2 (2026-05-22) — re-scoped after owner clarified
**Status:** **`cr001c_phase_1_scope_planned_waiting_owner_approval`**

> **v2 context (from owner):**
>
> *"This is not in production yet. You need not worry about old data.
> Assume everything will be clean after migration. So first will be
> migration, and then realtime ordering will start. Everything will be
> clean data."*
>
> The implication of that statement is now baked into this v2 plan.
> Anything that was previously framed around "historical residual" or
> "frozen migration value vs growing realtime value" is dropped.

---

## 1. Status

`cr001c_phase_1_scope_planned_waiting_owner_approval`

Implementation is **not** ready to start. 3 owner answers (down from 6
in v1) + the parked PR (CR-001A Phase 2 + CR-001D) being part of the
**go-live build** are required before Phase 1A can begin.

---

## 2. v2 Key Assumption Set (NEW)

| # | Assumption (owner-stated) | Consequence |
|---|---|---|
| A1 | The app is **pre-production**. | No live users, no live restaurant relying on CRM dashboards today. |
| A2 | Go-live sequence is **migration first, then realtime**. | At t=0 (go-live), every restaurant's `customers` / `orders` / `order_items` / `coupon_transactions` / `points_transactions` / `wallet_transactions` will be the clean migration snapshot. After t=0, every new order arrives via realtime. |
| A3 | No "historical residual" exists at go-live. | Drop all banner/coverage/hide-old-data discussion. Q2 from v1 is **withdrawn**. |
| A4 | CR-001A Phase 1 + Phase 2 + CR-001D must all be **deployed before t=0**. | Otherwise realtime orders post-go-live will silently drop `room_info`, `associated_order_ids`, `restaurant_id` again and CR-001C analytics will be wrong from day 1. |
| A5 | "Forward-only" still applies, but **defined from t=0**, not from any historical cutover. | Any logic only needs to be correct for orders dated ≥ t=0. |
| A6 | The two coupon collections (`coupon_usage` from realtime, `coupon_transactions` from migration) **will both contain rows** at and after go-live. Migration writes one set during pre-go-live import; realtime writes the other during normal ops. Both are valid. | Read-side merge is still required (W1). |

---

## 3. v2 Impact on Each Candidate Item

Re-evaluating W1–W10 under the clean-go-live assumption:

| Item | v1 verdict | v2 verdict | Why it changed |
|---|---|---|---|
| **W1** Dashboard coupon stats blind to realtime usage | Read-side union of `coupon_usage` + `coupon_transactions` | **SAME — still required.** | Both collections exist at and after go-live; dashboard must show both. |
| **W2** `total_points_earned` / `total_points_redeemed` frozen at migration | Two options (write-side `$inc` vs read-side aggregation) | **Now strictly a "write-path correctness" issue.** Migration seeds the snapshot; realtime must `$inc` from t=0 onward. No "old residual" tradeoff. Recommend **write-side `$inc`** on realtime path — keeps `customers` doc as single source of truth and matches how migration sets it. | Pre-prod means there's no risk of double-counting historical orders that were already processed by an older buggy realtime path. |
| **W3** `total_coupon_used` frozen | Same as W2 | **Write-side `$inc` on realtime coupon apply.** | Same reasoning as W2. |
| **W4** `last_coupon_used` never updated | Set on realtime apply | **SAME — set on realtime apply.** | — |
| **W5** Dashboard discount aggregation misses non-coupon discounts | Aggregate `orders.order_discount` + `self_discount` + `coupon_discount` | **SAME — required.** Even cleaner now (all orders post-go-live are clean). | — |
| **W6** Room revenue / F&B split | Blocked by CR-001A Phase 2 live | **PROMOTED from "backlog" to "must ship as part of go-live readiness".** Because go-live REQUIRES Phase 2 to be live (A4), the dependency clears automatically; W6 should ride in Phase 1A. | A4 makes this non-optional. |
| **W7** Cross-user / chain-level `restaurant_id` filtering | Blocked by CR-001D live | **Same as W6 — PROMOTED.** CR-001D is in the same PR as Phase 2 and is also part of the go-live build. | A4 makes this non-optional. |
| **W8** Lifecycle-page audit | Audit only | **SAME — audit only, defer fix unless drift found.** | — |
| **W9** `total_coupons` includes expired | Filter to active per owner-defined rule | **SAME.** Owner still needs to define "active" (start_date ≤ now ≤ end_date and not archived). | — |
| **W10** `/customers/{id}/loyalty/value` uses frozen counters | Switch to live aggregation | **Now consistent with W2 write-side fix.** Once W2 `$inc`s `total_points_earned/redeemed` on realtime, this endpoint is correct as-is. **Becomes a no-op fix** — close it by virtue of W2. | W2 write-side fix solves W10 inherently. |

### v2 final item list

| Item | Status in v2 | Notes |
|---|---|---|
| W1 | ✅ Phase 1A | Read-side coupon collection union |
| W2 | ✅ Phase 1A | Write-side `$inc` on realtime POS (replaces read-side aggregation idea) |
| W3 | ✅ Phase 1A | Write-side `$inc` on realtime coupon apply |
| W4 | ✅ Phase 1A | Set `last_coupon_used` on realtime apply |
| W5 | ✅ Phase 1A | Read-side total discount aggregation |
| W6 | ✅ Phase 1A | Read-side room revenue card (needs Phase 2 in go-live build — A4) |
| W7 | ✅ Phase 1A | Read-side filtering on `orders.restaurant_id` (needs CR-001D in go-live build — A4) |
| W8 | 🔍 Audit only | Defer if no drift found |
| W9 | ✅ Phase 1A | Active-coupon filter |
| W10 | ✅ Resolved by W2 | No separate code change |

→ **Phase 1A scope under v2 = W1 + W2 + W3 + W4 + W5 + W6 + W7 + W9** (8 items, 1 audit, 1 free-ride). **No Phase 1B / Backlog split needed** under the v2 assumption — everything ships in one Phase 1A.

---

## 4. v2 Dependency Status

| Dependency | v1 state | v2 state |
|---|---|---|
| CR-001A Phase 1 | ✅ Closed live on prod | ✅ Closed |
| CR-001A Phase 2 | 🟡 Preview-verified, prod deploy pending | 🔴 **Must be deployed before t=0 (go-live)** — same code, same PR. Becomes a hard gate for CR-001C, not a soft "blocked on backlog item." |
| CR-001D | 🟡 Preview-verified, prod deploy pending | 🔴 **Same — must ship in go-live build.** |
| CR-001B Phase 2 (R689 sync) | ⏳ Owner-driven, in flight | Still in flight, but in the v2 frame it must reach "migration done" state before t=0. Not blocking CR-001C planning. |
| F10 → CR-003 Loyalty Flow | Deferred | Still deferred. |
| Forward-only policy | "From migration cutover" | **Re-defined: from t=0 (go-live)** — no historical residual to protect. |

---

## 5. v2 Data Mapping Table (delta from v1)

Same as v1 §6 **except**:

| Metric / Card | v1 fix needed | v2 fix needed |
|---|---|---|
| CustomerDetail "Total Earned" / "Total Redeemed" | W2 (read OR write) | **W2 write-side `$inc`** — single canonical source = `customers` doc |
| CustomerDetail "Coupons Used" | W3 | **W3 write-side `$inc`** |
| `/customers/{id}/loyalty/value` money values | W10 separate read change | **Resolved automatically by W2** |
| Room revenue card | W6 backlog | **W6 included in Phase 1A** |
| Cross-user `restaurant_id` aggregation | W7 backlog | **W7 included in Phase 1A** |

All other rows unchanged from v1 §6.

---

## 6. v2 Implementation Sketch (still planning — no code)

Phase 1A in v2 = ~one focused PR:

**Backend changes (planned, not yet implemented):**
- `/app/backend/routers/pos.py` — extend the `update_one` at lines 1233–1244 to also `$inc total_points_earned: points_earned` and (when `wallet_used > 0` or any future redeem path) `$inc total_points_redeemed`; in `pos_apply_coupon` (lines 2355–2385) add `$inc total_coupon_used: 1` + `$set last_coupon_used: code, last_coupon_used_at: now` on the `customers` doc. (W2 + W3 + W4)
- `/app/backend/services/analytics_service.py` — `get_coupon_stats` queries both `coupon_usage` and `coupon_transactions` collections; add a `get_discount_breakdown` (or extend coupon stats) that sums `orders.order_discount` + `self_discount` + `coupon_discount` per period. (W1 + W5)
- Same file — filter `total_coupons` by active per owner rule. (W9)
- Same file — add `get_room_revenue` and `get_revenue_by_restaurant` helpers reading `orders.room_info.room_price` and `orders.restaurant_id`. (W6 + W7)

**Frontend changes (planned, not yet implemented):**
- `/app/frontend/src/pages/DashboardPage.jsx` — add new cards for "Room revenue (7D/30D)", "Total discount (all sources)"; remove dependency on stale paths where applicable.
- No change needed in `CustomerDetailPage.jsx` because W2 + W3 fix the source.

**Estimated effort:** ~90–120 minutes implementation + 30 minutes static QA (Pydantic + monkey-patched DB) on this preview pod. No DB migration.

---

## 7. Owner Questions (v2 — re-asked)

Q2 (residuals) is **withdrawn** under A3.
Q5 (wait for Phase 2 live) is **withdrawn** because A4 makes it a hard
gate, not a choice.

Re-asked / re-scoped:

### Q1 (v2). Phase 1A scope confirmation.
Under the v2 assumption (clean go-live, no historical residual), Phase 1A
naturally collapses to one bundle. Confirm scope:
- **A.** Ship all of W1, W2, W3, W4, W5, W6, W7, W9 in one Phase 1A (recommended ⭐)
- **B.** Same bundle but defer W6 + W7 (room/restaurant cards) to a Phase 1B once W1–W5 ship
- **C.** Trim to write-path only (W2 + W3 + W4) first; ship dashboard cards (W1, W5, W6, W7, W9) as Phase 1B
- **D.** Trim to dashboard-only (W1, W5, W6, W7, W9) first; ship customer write-path (W2 + W3 + W4) as Phase 1B

### Q3 (v2). `coupon_usage` ∪ `coupon_transactions` dedup rule
At go-live, migration will have written `coupon_transactions` for all
historical coupon usages; realtime will write `coupon_usage` for every
post-go-live usage. Same `order_id` should never appear in both, but to
be safe:
- **A.** Union both without dedup — count any row once per collection (fastest, accepts the small theoretical risk of double-count if migration ever re-runs over post-go-live orders)
- **B.** Union with dedup by `order_id` (safest, slightly more work — requires both collections to carry `order_id`; let me verify before promising)
- **C.** Pick ONE going forward — migrate `coupon_transactions` rows into `coupon_usage` and read only from `coupon_usage`. Requires a migration script (out of CR-001C Phase 1A scope; would be a separate cleanup CR)
- **D.** Defer the merge — Phase 1A only reads `coupon_usage`. Migration-imported usages won't show. (Cleanest, but **migration-imported coupon usage stats will be 0 on go-live day**, which contradicts your "everything will be clean data" expectation.)

### Q4 (v2). "Active" coupon definition for W9
"`total_coupons`" on the dashboard currently counts all-time including
expired. Owner-confirm the filter:
- **A.** `start_date ≤ now ≤ end_date` AND `archived ≠ true` (most common definition)
- **B.** `end_date ≥ now` only (simpler — counts coupons not yet expired regardless of start)
- **C.** Keep all-time count, add a separate "Active" card alongside
- **D.** Keep as-is

### Q9 (NEW v2). W2 redemption semantics
Currently `wallet_used` is tracked separately from "points redeemed."
There's no realtime code path that decrements points (no
`transaction_type=redeem` write in `pos.py` realtime flow that I can see
— only `wallet_transactions` debit on wallet use). Confirm:
- **A.** "Redeemed" in the CRM context means **wallet debit** (₹ used) → `total_points_redeemed` should `$inc` by the **point-equivalent** of `wallet_used` (i.e. `wallet_used / redemption_value`)
- **B.** "Redeemed" means **points-to-wallet conversion** which is a separate CRM-side flow (manual via `/api/points/redeem` in `routers/points.py`) — only that flow should `$inc total_points_redeemed`; realtime POS doesn't redeem
- **C.** "Redeemed" means **points used directly to discount the bill** — no such path exists today in `pos.py`; out of scope for CR-001C; leave `total_points_redeemed` write-path unchanged in Phase 1A and only fix the `$inc total_points_earned` half (W2 becomes earned-only)

### Q6 (carry-over). Missing handover docs
Still unanswered from v1:
- **A.** Locate and re-import the 4 missing handover docs before Phase 1A starts
- **B.** Treat code-as-truth + this v2 plan as sufficient (default)
- **C.** Regenerate stub docs from current code/state for the audit trail

---

## 8. Implementation Readiness Verdict (v2)

**NOT ready to start code.** Required gates:

1. ✅ v2 plan complete (this document).
2. ⏳ Owner answers **Q1, Q3, Q4, Q9** (and optionally Q6).
3. 🟡 CR-001A Phase 2 + CR-001D **prod deploy + live 13-check pass** before t=0 (hard gate for go-live, soft gate for CR-001C code start — code can be written in preview but cannot ship without Phase 2 + CR-001D in the same build).

Once Q1 + Q3 + Q4 + Q9 are answered and scope is locked, Phase 1A
implementation in preview can begin (~90–120 min code + 30 min QA).

---

## 9. Confirmations

- ✅ No code changed (this session created only this planning file).
- ✅ No backend changed.
- ✅ No frontend changed.
- ✅ No DB mutated.
- ✅ `/app/memory/final/` untouched.
- ✅ Baseline docs (`CR_001_INDEX.md`, `CRM_1_0_OPEN_GAPS_REGISTER.md`) untouched.
- ✅ Previous v1 plan (`CR_001C_PHASE_1_READINESS_AND_SCOPE_PLAN.md`) is being superseded by this v2; v1 file kept for audit trail. **Owner: confirm whether to delete v1 or keep both.** (Default: keep both, mark v1 as superseded in a one-line header — I'll do that only on your "go".)
