# CR-001C — Module Breakdown Plan (FREEZE)

**CR:** CR-001C — CRM Visibility / Running Totals / Dashboard Data Correctness
**Status:** **`cr001c_module_breakdown_planned_awaiting_freeze_confirmation`**
**Revision:** v3 (supersedes v1 and v2 drafts)
**Date:** 2026-05-22
**Mode:** Pre-production. Migration first, then realtime. Clean data at go-live.

> **Owner decision captured:**
>
> *"Divide this CR into four parts. One is loyalty, second will be wallet,
> then coupon code, and the fourth. Plan and implement one module at a
> time. Freeze the plan first, then come to loyalty."*
>
> This document is the freeze plan. No code, no DB, no migration triggered.

---

## 1. The 4-Module Breakdown

CR-001C is split into 4 independent sub-CRs. Each one has its own planning →
analysis → owner-approval → implementation → QA cycle. We do them strictly
in this order:

| # | Sub-CR ID | Module | Scope (plain English) |
|---|---|---|---|
| 1 | **CR-001C-L** | **Loyalty** | Make sure points (earned, redeemed, balance) and tier (Bronze/Silver/Gold/Platinum) work correctly when a real POS order arrives, and that the customer profile counters (`total_points`, `total_points_earned`, `total_points_redeemed`, `tier`, `avg_order_value`, `total_visits`, `total_spent`, `last_visit`) grow correctly over time. |
| 2 | **CR-001C-C** | **Coupons** | Resolve the two-collection drift (`coupon_usage` from realtime vs `coupon_transactions` from migration), ensure `total_coupon_used` and `last_coupon_used` on the customer doc grow on realtime apply, and ensure dashboard coupon stats reflect both collections. |
| 3 | **CR-001C-W** | **Wallet** | Make sure wallet credit/debit logic, `wallet_balance` on the customer doc, and `wallet_transactions` collection are written correctly on every realtime POS order and on every manual credit/debit; verify the wallet card on the dashboard matches the underlying data. |
| 4 | **CR-001C-V** | **Dashboard / Visibility** | The read-side layer. Aggregates Loyalty + Coupons + Wallet stats correctly on the Dashboard page, adds room-revenue card (depends on CR-001A Phase 2 live), adds restaurant-level filtering (depends on CR-001D live), fixes the "active coupons" count, and fixes discount aggregation (`order_discount` + `self_discount` + `coupon_discount`). |

### Why this order? (owner-confirmed 2026-05-22)

1. **Loyalty first** because it's the most foundational — points/tier drive everything else (off-peak bonuses, redeem caps, etc.).
2. **Coupons second** because it's self-contained — own collections, own write-path (`pos_apply_coupon`); doesn't interact with loyalty earn/redeem flow. Owner preference: get coupon visibility right before touching wallet.
3. **Wallet third** because it sits in the same write-path as loyalty (`_save_order_and_transactions`); doing it on top of a known-good loyalty layer is cleaner than mixing both at once.
4. **Visibility last** because it's a read-side consolidation that only makes sense after the underlying data (1–3) is correct. Adding visibility cards before fixing the data would just expose wrong numbers nicely.

---

## 2. Each Module's Lifecycle (same shape for all 4)

Each sub-CR goes through these **6 stages** (owner-revised 2026-05-22).
**Stage B is a hard gate** — I do not proceed past Review until owner has
read the AS-IS findings AND explicitly approved the list of intended
changes for that module. Owner expects a few changes per module.

| Stage | What happens | Output | Owner action required |
|---|---|---|---|
| **A. Logic Review (AS-IS)** | I read the existing code end-to-end, write a plain-English explanation: what happens today, what's correct, what's broken, what's missing | `MODULE_LOGIC_AS_IS_REVIEW.md` | Read it |
| **B. Validate + Change Approval** ← **HARD GATE** | I list the proposed changes for that module with rationale; owner confirms or modifies the list. **No code, no test, no migration is triggered until this gate clears.** | `MODULE_CHANGE_PROPOSAL.md` (appended to the AS-IS doc) | **Owner approves the change list explicitly** |
| **C. Test Setup** | I propose a test restaurant + sequence of test orders + what to look for | Inline (no doc) | Owner picks restaurant + triggers migration from the CRM UI |
| **D. Live Verify** | I observe migrated data + 2–3 test orders; document drift between approved expectation and reality | `MODULE_AS_IS_LIVE_VERIFICATION.md` | Owner reviews drift findings |
| **E. Implementation** | I implement the approved changes on the preview pod (forward-only, surgical) | `MODULE_IMPLEMENTATION_REPORT.md` + code diff | Owner approves diff |
| **F. QA + Close** | Static + live verification on preview pod; status flips to `*_module_closed_in_preview` | `MODULE_QA_REPORT.md` | Owner confirms before next module |

After Stage F for one module, we move to the next module's Stage A.

After all 4 modules close in preview, we batch the prod deploy along with
the parked CR-001A Phase 2 + CR-001D PR.

---

## 3. Inter-Module Dependencies

| Module | Depends on | Why |
|---|---|---|
| Loyalty | (none) | Self-contained — points & tier math is local to the customer + the order |
| Coupons | Loyalty closed | Coupon apply uses customer record (which Loyalty just touched); verifying coupons on a known-good loyalty layer is cleaner |
| Wallet | Loyalty + Coupons closed | Shared `_save_order_and_transactions` write-path with loyalty; doing it last among the data modules avoids re-testing the same write path 3× |
| Visibility | All three above + **CR-001A Phase 2 + CR-001D live on prod** | It's the read-side; everything below must be correct first; room/restaurant cards need the parked PR live |

**Critical gate for Module 4 (Visibility):** CR-001A Phase 2 + CR-001D must be **deployed to prod** before Visibility ships. Until then, Visibility can be planned and implemented in preview but cannot ship to prod.

---

## 4. Out-of-Scope Confirmation (all 4 modules)

These remain out of scope under owner's pre-production assumption:

- ❌ No historical backfill (there is no "historical" — pre-prod start state is the clean migration snapshot)
- ❌ No mutation of customers/orders/transactions written before go-live (because there is no "before go-live")
- ❌ No `migration.py` changes (CR-001B Phase 2 / R689 sync is owner-driven, independent)
- ❌ No `pos_request_logger.py` changes (CR-002 audit log)
- ❌ No POS webhook schema changes (CR-001A Phase 2 covers all known POS field additions; if a new field is discovered during loyalty review, that becomes a new CR-001A Phase 3)
- ❌ No frontend redesign — only field-source swaps and new cards
- ❌ No new authentication, payment, or settlement code
- ❌ No SQL/DB migration scripts (Mongo only, no schema migration required for any of the 4 modules)

---

## 5. What Each Module Will Touch (preview only — final list locked at Stage D)

These are **planning-time estimates**, not commitments. Final list per module is locked when that module's Implementation Report (Stage D) is approved.

### Module 1 — Loyalty (CR-001C-L)
- **Backend:** `/app/backend/routers/pos.py` (`_save_order_and_transactions`, `_find_or_create_customer`, `_calculate_points`), `/app/backend/services/analytics_service.py` (`get_points_stats`), `/app/backend/routers/customers.py` (`/customers/{id}/loyalty/value`), `/app/backend/core/helpers.py` (`calculate_tier`, `get_earn_percent_for_tier`, `check_off_peak_bonus`)
- **Frontend:** `/app/frontend/src/pages/CustomerDetailPage.jsx` (only if a field-source needs to be swapped from a stale field to a live one)
- **DB collections touched (writes added):** `customers` (`$inc total_points_earned`, `$inc total_points_redeemed`), `points_transactions` (already written, verify only)

### Module 2 — Wallet (CR-001C-W)
- **Backend:** `/app/backend/routers/pos.py` (wallet credit/debit inside `_save_order_and_transactions`), `/app/backend/routers/wallet.py` (manual wallet ops), `/app/backend/services/analytics_service.py` (`get_wallet_stats`)
- **Frontend:** `/app/frontend/src/pages/WalletPage.jsx` (verify only), `/app/frontend/src/pages/CustomerDetailPage.jsx` (wallet section verify only)
- **DB collections touched:** `wallet_transactions` (verify), `customers.wallet_balance` (verify)

### Module 3 — Coupons (CR-001C-C)
- **Backend:** `/app/backend/routers/pos.py` (`pos_apply_coupon` at line 2355), `/app/backend/routers/coupons.py`, `/app/backend/services/analytics_service.py` (`get_coupon_stats`)
- **Frontend:** `/app/frontend/src/pages/CouponsPage.jsx` (verify), `/app/frontend/src/pages/CustomerDetailPage.jsx` (verify)
- **DB collections touched (writes added):** `customers` (`$inc total_coupon_used`, `$set last_coupon_used`), `coupon_usage` (already written, verify), `coupon_transactions` (NOT touched — migration's collection)

### Module 4 — Visibility (CR-001C-V)
- **Backend:** `/app/backend/services/analytics_service.py` (rewrites of `get_coupon_stats`, `get_revenue_split`, plus new `get_room_revenue`, `get_discount_breakdown`)
- **Frontend:** `/app/frontend/src/pages/DashboardPage.jsx` (new cards, refreshed sources)
- **DB collections touched:** none (read-only)

---

## 6. Status Tracking (will be used per module)

| Module | Stage | Status code |
|---|---|---|
| CR-001C-L Loyalty | not started | `cr001cl_not_started` |
| CR-001C-C Coupons | not started | `cr001cc_not_started` |
| CR-001C-W Wallet | not started | `cr001cw_not_started` |
| CR-001C-V Visibility | not started | `cr001cv_not_started_blocked_by_phase2_and_cr001d_live` |

Each module advances through its own:
`*_logic_review_done` → `*_change_proposal_approved` → `*_live_verified` →
`*_implementation_complete` → `*_qa_passed` → `*_closed_in_preview` states.

---

## 7. Owner-Stated Sequence (single source of truth — revised 2026-05-22)

After freeze is confirmed and owner says "go":

1. **Round 1 — Loyalty:**
   - Stage A: I read the loyalty code end-to-end, write `LOYALTY_LOGIC_AS_IS_REVIEW.md` in plain English (~10 min).
   - **Stage B (HARD GATE):** I append a `LOYALTY_CHANGE_PROPOSAL` section listing every intended change with rationale. **Owner reviews and approves the change list explicitly.** Owner expects a few changes per module.
   - Stage C: I propose a test restaurant; owner configures loyalty settings on it via UI; owner triggers migration via UI.
   - Stage D: Owner pushes 2–3 test orders; we verify together against the approved expectation.
   - Stage E: I implement the approved changes in preview pod. Owner approves diff.
   - Stage F: QA in preview. Status flips to `cr001cl_closed_in_preview`.
2. **Round 2 — Coupons:** same loop, same hard gate at Stage B.
3. **Round 3 — Wallet:** same loop, same hard gate at Stage B.
4. **Round 4 — Visibility:** same loop, with extra gate: cannot ship to prod until CR-001A Phase 2 + CR-001D are live on prod.

---

## 8. Confirmation

- ✅ No code changed by this freeze plan
- ✅ No backend changed
- ✅ No frontend changed
- ✅ No DB mutated
- ✅ No migration triggered
- ✅ `/app/memory/final/` untouched
- ✅ Baseline docs (`CR_001_INDEX.md`, `CRM_1_0_OPEN_GAPS_REGISTER.md`) **not yet updated** — will be updated only after owner confirms freeze
- ✅ v1 and v2 drafts (`CR_001C_PHASE_1_READINESS_AND_SCOPE_PLAN.md`, `..._v2.md`) preserved for audit trail; superseded by this v3 freeze plan
