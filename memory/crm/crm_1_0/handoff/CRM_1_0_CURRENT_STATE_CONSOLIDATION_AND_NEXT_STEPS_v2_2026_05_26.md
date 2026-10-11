# CRM 1.0 Current State Consolidation and Next Steps — v2 (2026-05-26)

**Date:** 2026-05-26
**Mode:** Documentation only — no code, DB, env, deploy, or migration changes.
**Branch:** `27-may` (Abhi-mygenie/CRMpreprod.git)
**Database:** External MongoDB `52.66.232.149:27017/mygenie`
**Supersedes:** `handoff/CRM_1_0_CURRENT_STATE_CONSOLIDATION_AND_NEXT_STEPS.md` (v1, 2026-05-25 — preserved for history)

> **Why v2?** The 2026-05-25 snapshot was authored before POS team shipped the contract fixes. Live-DB re-verification on 2026-05-26 (76 redeem PTs on R689, 15/15 contract-compliant payloads) flips the two largest external blockers to ✅. This v2 incorporates that reality.

---

## 1. Executive Summary

CRM 1.0 backend is **functionally complete** across:

- **Coupon engine V1 → V3-C** — 211/211 in-preview QA, all code paths live.
- **Loyalty engine** — earning, realtime redemption (now ✅ closed in prod), L1–L4 migration parity, L4 cron.
- **POS order ingestion** — CR-001A Phase 1 closed live; Phase 2 QA passed in preview.
- **Coupon Admin UI V1 + V2 + V3-A + V3-B** — production-live at `/coupons`.

The 3 big external blockers that dominated the v1 (2026-05-25) report have all closed:

| v1 blocker | v2 status |
|---|---|
| B1 — 3 POS contract P1 violations | ✅ CLOSED — POS shipped; 15/15 live payloads compliant. See `handoff/CR_001C_POS_CONTRACT_COMPLIANCE_CLOSURE_2026_05_26.md`. |
| B2 — POS not calling `/api/pos/orders` with loyalty fields | ✅ CLOSED — 76 redeem PTs / 8,633 pts on R689. See `qa/CR_001C_LR_REALTIME_ORDER_REDEMPTION_CLOSURE_2026_05_26.md`. |
| B3 — Menu API `product.id` vs POS `item_id` mismatch | ✅ CLOSED — POS now sends stable `pos_food_id` on every order. |

What remains:

- **V3-C Admin UI** has its tile `enabled: true` in production code but lacks an impl/QA report on disk. Needs verification.
- **CR-001A Phase 2** prod-close awaits a natural production room order (low priority).
- **Beta-usable modules** (Wallet, Scan & Order consumer app, Feedback, WhatsApp, Analytics, Migration CR-001B Phase 2) lack formal QA evidence in memory. Owner-driven scoping.
- **Owner-config items** (not blockers): R478 / R618 / R634 have `loyalty_enabled = null` and need an owner toggle to roll loyalty out to them.

---

## 2. What Is Completed

### 2.1 Realtime POS schema + alignment

| Item | Status | Tracker |
|---|---|---|
| CR-001A Phase 1 — Forward-only alias mapping on `POST /api/pos/orders` | ✅ Closed live on prod 2026-05-22 | `cr001a_phase_1_closed_live_on_prod` |
| CR-001A Phase 2 — `room_info` + `associated_order_ids` accepted | ✅ QA passed 2026-05-22 (prod-close pending natural prod order) | `cr001a_phase_2_and_cr001d_qa_passed_with_runtime_limitations` |
| CR-001D — `orders.restaurant_id` no longer null | ✅ Implemented + QA passed 2026-05-22 | (same PR as Phase 2) |
| CR-002 — POS request logging middleware | ✅ Implemented + verified | — |
| **POS contract compliance (7 violations)** | ✅ **CLOSED 2026-05-26 — POS shipped** | `cr001c_pos_contract_compliance_closed_pos_shipped_2026_05_26` |

### 2.2 Loyalty backend

| Item | Status | Tracker |
|---|---|---|
| LX-A — Loyalty API response alignment for POS BUG-108 | ✅ QA passed 2026-05-23, POS handoff GREEN | `cr001c_lx_a_loyalty_pos_contract_patched_qa_passed_in_preview` |
| LF-MERGE — `loyalty_enabled` drives BOTH realtime + migration | ✅ QA passed 2026-05-23 | `cr001cl_lf_merge_complete_qa_passed_in_preview` |
| BUG-L3-001 — D1 expired pre-mark (naive vs tz-aware) | ✅ Closed 2026-05-23 | `cr001c_l_bug_l3_001_closed` |
| L3 Real Migration Validation (Jeh's Nest + R689 Kunafa) | ✅ Closed in preview on two restaurants | `cr001c_loyalty_l3_real_migration_validated_in_preview` |
| LR — `POST /api/pos/loyalty/redeem` (standalone) | ✅ Static QA 36/36 | `cr001c_lr_pos_loyalty_redeem_api_qa_passed` |
| LR Correction — final-payload redemption + helpers + `/max-redeemable` alignment | ✅ Static QA 52/52 | `cr001c_lr_correction_qa_passed` |
| LR Alias Addendum — accept POS-legacy `used_loyalty_point` | ✅ Static QA 52/52 | `cr001c_lr_alias_addendum_qa_passed` |
| L4 Cron — Birthday + Anniversary bonus parity | ✅ Static QA 17/17 | `cr001c_loyalty_l4_cron_only_qa_passed` |
| `payment_status` gate REMOVED in `_validate_order` | ✅ Live 2026-05-25 | `cr001c_lr_payment_status_gate_removed` |
| **LR Realtime Order Redemption — real-data verification** | ✅ **CLOSED 2026-05-26** | `cr001c_lr_realtime_order_redemption_verified` |

### 2.3 Coupon backend (V1 → V3-C)

| Phase | Status | QA |
|---|---|---|
| V1 — Flat / Percentage | ✅ QA passed in preview | 45/45 |
| V2 — Item / Category | ✅ QA passed in preview | 45/45 |
| V3-A — Time-window / Happy Hour | ✅ QA passed in preview | 31/31 |
| V3-B — BOGO / Buy-X-Get-Y | ✅ QA passed in preview | 49/49 |
| V3-C — Every-Nth Item | ✅ QA passed in preview | 41/41 |
| **Combined regression** | ✅ | **211 / 211 PASS** |

POS-PERF-1 `/api/pos/coupons/available` N+1 fix: 14.3× speedup, byte-identical contract, 211/211 regression intact.

### 2.4 Coupon Admin UI

| Phase | Status | Path |
|---|---|---|
| V1 + V2 production UI | ✅ Live | `/coupons` → `CouponsPage.jsx` |
| V3-A Happy Hour production wiring | ✅ Live | tile `enabled: true` L68 |
| V3-B BOGO / BXGY production wiring | ✅ Live | tile `enabled: true` L69 |
| V3-C Every-Nth production wiring | 🟧 Tile `enabled: true` L70, no impl/QA report on disk | **Needs verification** |

### 2.5 Documentation deliverables (new since v1)

| Item | Path |
|---|---|
| POS contract compliance closure | `handoff/CR_001C_POS_CONTRACT_COMPLIANCE_CLOSURE_2026_05_26.md` |
| LR realtime order redemption closure | `qa/CR_001C_LR_REALTIME_ORDER_REDEMPTION_CLOSURE_2026_05_26.md` |
| CRM 1.0 baseline reconciliation report (+ Addendum A) | `handoff/CRM_1_0_BASELINE_RECONCILIATION_REPORT.md` |
| This v2 consolidation | `handoff/CRM_1_0_CURRENT_STATE_CONSOLIDATION_AND_NEXT_STEPS_v2_2026_05_26.md` |

---

## 3. What Is Partially Completed

| Item | What Works | What Is Missing |
|---|---|---|
| **CR-001A Phase 2 / CR-001D prod close** | Implemented + QA passed in preview 2026-05-22 | Awaiting natural production room order after deploy + `pos-backend` restart. `cr_001a_check.sh` ready. |
| **V3-C Admin UI** | Tile exposed; backend ready; create endpoint uses `model_dump()` (persists every field) | No impl/QA report on disk. 1-day smoke harness needed. |
| **Coupon analytics dashboard / clone / V3-A2 outside-window counter** | Backend supports analytics blocks | UI not built; clone action not built; V3-A2 counter parked. |

---

## 4. What Is Pending

### 4.1 P1 — V3-C Admin UI QA evidence (internal, no external dependency)

Produce `qa/CR_001C_C_COUPON_V3C_ADMIN_UI_QA_REPORT.md` covering create / list / edit / toggle / delete of an `every_nth` coupon via production `/coupons`. Confirm `model_dump()` persists `nth_item_number`, `nth_discount_type`, `nth_discount_value`.

### 4.2 P2 — CR-001A Phase 2 prod close

Run `qa/cr_001a_check.sh` on first natural production room order. Target status: `cr001a_phase_2_closed_live_on_prod`.

### 4.3 P3 — Beta-module baseline promotion

Five modules are beta-usable but lack formal QA in memory. Promote in this order via short 1-day harnesses:

1. Feedback (3 endpoints + analytics sibling router)
2. Analytics (item-performance + customer-lifecycle, 6 endpoints + export)
3. WhatsApp Automation + Templates (15+ endpoints)
4. Customer / Segments / Notes / QR (30+ endpoints)
5. Scan & Order consumer app (`routers/scan.py`, 30+ endpoints — needs full inventory)

### 4.4 P3 — Migration CR-001B Phase 2 closure

Status check on F9 persistent `migration_sync_logs` (live in `server.py` lifespan) and F12 dedup. Owner sign-off.

### 4.5 P4 — Wallet scoping decision

Owner decides: deprecate / keep as minimal back-office ledger / extend with POS wallet contract (`/pos/wallet/debit` etc. — explicitly deferred per BUG-108).

### 4.6 P5 — Backlog (parked)

- Duplicate coupon ("clone") admin feature
- Coupon analytics dashboard view
- V3-D (free-item instruction-only) / V3-E composite (combo) — V4 candidates
- LR `used_outside_window_attempts` analytics counter (V3-A2)
- Restore upstream 27-may `memory/PRD.md` (currently the agent-overwritten short version, ~1 KB vs ~16 KB upstream)
- Hygiene: `frontend/src/pages/CouponV3Preview.jsx` is an orphan file (not routed in `App.js`). Delete or route under `/coupons-v3-preview`.

---

## 5. Owner-Configuration Items (NOT Blockers)

These are explicitly owner-driven choices, not engineering blockers:

| Item | Owner action |
|---|---|
| `loyalty_enabled = null` on R478 / R618 / R634 | Owners toggle "Loyalty Program ON" in CRM UI when they want loyalty for their restaurant. Not a code or rollout blocker. |

---

## 6. Coupon Backend Status

Unchanged from v1 §6 — single source of truth: `planning/CR_001_INDEX.md` §CR-001C-C. Engine + admin CRUD + POS endpoints + 27 error codes + locked invariants all intact.

---

## 7. Coupon Admin UI Status

| Phase | Status | Notes |
|---|---|---|
| V1 + V2 | ✅ Production-live | `/coupons`, drawer layout, live menu/category pickers |
| V3-A Happy Hour | ✅ Production-live | impl + QA report on disk |
| V3-B BOGO / BXGY | ✅ Production-live | impl + QA report on disk |
| V3-C Every-Nth | 🟧 Production tile enabled, **no impl/QA report on disk** | Needs verification |

---

## 8. POS Contract Status (UPDATED)

**Per closure doc `handoff/CR_001C_POS_CONTRACT_COMPLIANCE_CLOSURE_2026_05_26.md`:**

- All 3 P1 blockers (`pos_food_id`, top-level loyalty fields, top-level coupon fields) — ✅ CLOSED
- All 2 P2 (`item_category`, top-level `wallet_used`) — ✅ CLOSED
- Both P3 (`item_qty`, `item_price` canonical naming) — ✅ CLOSED (POS uses canonical; CRM aliases retained as safety net)

CRM-side contract posture unchanged from v1 §8.2 — `payment_status` gate gone, AliasChoices live, LX-A response shape live, 5 redemption callers all routed through `core/loyalty.redeem_loyalty_points` + `compute_max_redeemable` helpers.

---

## 9. Loyalty Status (UPDATED)

### 9.1 Realtime earning
Unchanged from v1 — works for restaurants with `loyalty_enabled = True`. Validated on Jeh's Nest + R689 Kunafa.

### 9.2 Redemption — **CLOSED**

| Aspect | State |
|---|---|
| `POST /api/pos/loyalty/redeem` (standalone) | ✅ Live, QA 36/36 |
| `POST /api/pos/max-redeemable` (tier-aware, kill-switch-aware) | ✅ Live |
| Final-payload redemption via `POST /api/pos/orders` | ✅ Live, QA 52/52 |
| **Real-data verification on R689** | ✅ **CLOSED 2026-05-26** — 76 redeem PTs, 8,633 pts redeemed, latest 2026-05-26 05:16 UTC |

### 9.3 Migration parity (L1 → L4)
Unchanged from v1 — L1–L4 closed, BUG-L3-001 closed, atomic `$inc` on cron, parity validated on two restaurants.

### 9.4 `loyalty_enabled` rollout

| Restaurant | `loyalty_enabled` | Status |
|---|---|---|
| R523, R601, R689, Jeh's Nest | `True` | Earning + redemption working |
| R478, R618, R634 | `null` | Owner-config — not a blocker |

---

## 10. Menu API / Item Mapping Status (UPDATED)

| Aspect | State |
|---|---|
| `/api/menu/items` proxy via stored `mygenie_token` | ✅ Live |
| `/api/menu/categories` proxy | ✅ Live |
| Coupon Admin UI item/category selectors | ✅ Live |
| **Menu `product.id` ↔ POS `item_id` mismatch (former B3)** | ✅ **CLOSED 2026-05-26** — POS now sends stable `pos_food_id` on every order |
| Category name gap | Verifiable per-payload; POS now sends `item_category` per closure doc |

---

## 11. Open Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Menu API `mygenie_token` expiry can silently break coupon UI item picker | Document re-login as refresh path; consider expiry check + clear error toast |
| R2 | V3-C Admin UI tile is exposed but lacks QA evidence — possible silent bugs | Run 1-day QA harness |
| R3 | CR-001A Phase 2 prod close requires a natural prod room order — could be delayed | `cr_001a_check.sh` ready for instant verification |
| R4 | Beta modules (Scan, Feedback, WhatsApp, Analytics) lack formal QA — silent regressions possible | Schedule 1-day promotion harnesses per §4.3 |
| R5 | V3-B / V3-C `MAX_APPLICATIONS_REACHED` is intentionally a cap (not a gate) — could surface as silent caps | Future UX review |

(R1–R6 from v1 §11 about POS team timelines are obsolete — POS shipped.)

---

## 12. Next Steps in Priority Order

### Priority 1 — Internal (no external dependency)
1. **V3-C Admin UI QA evidence** — produce `qa/CR_001C_C_COUPON_V3C_ADMIN_UI_QA_REPORT.md`.
2. **Hygiene** — delete or route orphan `frontend/src/pages/CouponV3Preview.jsx`.
3. **Verify** `discount_type: "fixed"` vs `"flat"` UI/engine consistency (was a small Session-1 gap; needs current verification).

### Priority 2 — Verifications
4. CR-001A Phase 2 prod close: run `cr_001a_check.sh` after first natural prod room order.
5. Item / category coupon live-bill smoke on R689 (POS now sends `pos_food_id`, so this can be exercised any time).

### Priority 3 — Beta-module promotion
6. Feedback → Analytics → WhatsApp → Customer/Segments → Scan & Order — one 1-day QA harness each.

### Priority 4 — Migration & Wallet
7. Migration CR-001B Phase 2 closure (F9 / F12 status check).
8. Wallet scoping decision (owner gate).

### Priority 5 — Backlog
9. Duplicate coupon ("clone") admin feature.
10. Coupon analytics dashboard.
11. V3-D / V3-E composite (combo) — V4 candidates.
12. LR `used_outside_window_attempts` analytics counter (V3-A2).
13. Restore upstream 27-may `memory/PRD.md`.

---

## 13. Recommended Agent Sequence

| # | Agent role | Output |
|---|---|---|
| 1 | **V3-C Admin UI QA Agent** | `qa/CR_001C_C_COUPON_V3C_ADMIN_UI_QA_REPORT.md` |
| 2 | **Hygiene Agent** | Orphan `CouponV3Preview.jsx` resolved; `fixed`/`flat` naming verified; short `handoff/CRM_UI_HYGIENE_<date>.md` |
| 3 | **POS-Gated Verification Agent (low priority now)** | CR-001A Phase 2 prod close on first natural prod order; item/category live smoke |
| 4 | **Beta-Promotion Agent (×5)** | One QA report per beta module |
| 5 | **Migration CR-001B Phase 2 Closure Agent** | Status check + owner sign-off |
| 6 | **Wallet Scoping Agent** | Options doc + owner gate |
| 7 | **Backlog Agent** | Pick one per session from §12 Priority 5 |

---

## 14. Final Status

```
crm_1_0_current_state_consolidated_v2_2026_05_26
```

- Backend: complete across coupons (V1 → V3-C, 211/211 QA), loyalty (earning, redemption ✅ verified live, L3 migration parity, L4 cron). `payment_status` gate removed. POS request logging (CR-002) intact.
- Admin UI: V1 + V2 + V3-A + V3-B production-live. V3-C tile exposed, **QA evidence pending**.
- POS contract: **CLOSED** (7/7 violations resolved 2026-05-26).
- Loyalty rollout: 4 restaurants live; 3 await owner toggle (owner-config, not a blocker).
- One internal hygiene item (V3-C QA); CR-001A Phase 2 prod close low priority.

Awaiting:
1. V3-C Admin UI QA harness (P1 internal)
2. Beta-module baseline promotion (P3)
3. Owner scoping for Wallet + Migration Phase 2 (P4)
