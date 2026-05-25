# CRM 1.0 Current State Consolidation and Next Steps

**Date:** 2026-05-25
**Mode:** Documentation only — no code, DB, env, deploy, or migration changes.
**Branch:** `25-may` (Abhi-mygenie/CRMpreprod.git)
**Database:** External MongoDB `52.66.232.149:27017/mygenie`

---

## 1. Executive Summary

CRM 1.0 backend is **functionally complete** across the coupon engine (V1 → V3-C, 211/211 QA assertions PASS) and the loyalty engine (earning, redemption helper, migration parity, L4 cron). The bottleneck is **NOT** the CRM backend.

The **two real blockers** are:

1. **POS team has not yet honoured the agreed `POST /api/pos/orders` contract.** 7 violations were catalogued on 2026-05-25 (3 are BLOCKERS for item/category coupons and loyalty/coupon/wallet commit). See §8.
2. **V3 Coupon Admin UI is preview-only.** Production `/coupons` page covers V1+V2 fully; V3-A/B/C are mocked at `/coupons-v3-preview` and **NOT** wired to backend create/update.

Two recent CRM-side completions that materially de-risk the flow:

- **`payment_status` gate removed** (2026-05-25) — CRM no longer rejects orders where POS sends `"paid"` instead of `"success"`.
- **Migration re-sync now preserves `points_earned`** on existing orders (no clobber-to-zero).

Three restaurants (R478, R618, R634) have `loyalty_enabled = null` (silently disabled); owner action required.

---

## 2. What Is Completed

### 2.1 Realtime POS schema + alignment

| Item | Status | Tracker | Evidence |
|---|---|---|---|
| CR-001A Phase 1 — Forward-only alias mapping on `POST /api/pos/orders` | ✅ Closed live on prod 2026-05-22 | `cr001a_phase_1_closed_live_on_prod` | `implementation/CR_001A_PHASE_1_IMPLEMENTATION_REPORT.md`, `qa/CR_001A_PHASE_1_QA_REPORT.md` |
| CR-001A Phase 2 — `room_info` + `associated_order_ids` accepted | ✅ QA passed 2026-05-22 (prod close pending natural prod order) | `cr001a_phase_2_and_cr001d_qa_passed_with_runtime_limitations` | `implementation/CR_001A_PHASE_2_AND_CR_001D_IMPLEMENTATION_REPORT.md` |
| CR-001D — `orders.restaurant_id` no longer null | ✅ Implemented + QA passed 2026-05-22 | (same PR as CR-001A Phase 2) | same as above |
| CR-002 — POS request logging middleware | ✅ Implemented + verified | — | `backend/core/pos_request_logger.py`, writes to `pos_request_logs` |

### 2.2 Loyalty backend

| Item | Status | Tracker | Evidence |
|---|---|---|---|
| LX-A — Loyalty API response alignment for POS BUG-108 | ✅ QA passed 2026-05-23, POS handoff GREEN | `cr001c_lx_a_loyalty_pos_contract_patched_qa_passed_in_preview` | `implementation/CR_001C_LX_A_IMPLEMENTATION_REPORT.md`, `qa/CR_001C_LX_A_QA_REPORT.md`, `handoff/CR_001C_LX_POS_BUG_108_LOYALTY_API_HANDOFF_TO_POS.md` |
| LF-MERGE — `loyalty_enabled` now drives BOTH realtime earning + migration clean-slate (deprecated hidden `loyalty_clean_slate_recalc`) | ✅ QA passed 2026-05-23 | `cr001cl_lf_merge_complete_qa_passed_in_preview` | `implementation/CR_001C_L_LF_MERGE_IMPLEMENTATION_REPORT.md`, `qa/CR_001C_L_LF_MERGE_QA_REPORT.md` |
| BUG-L3-001 — D1 expired pre-mark (naive vs tz-aware) | ✅ Closed 2026-05-23 | `cr001c_l_bug_l3_001_closed` | `qa/CR_001C_L_LOYALTY_L3_REAL_MIGRATION_VERIFICATION_REPORT_R3.md` |
| L3 Real Migration Validation (Jeh's Nest 209 customers, R689 Kunafa 2034 customers) | ✅ Closed in preview on TWO restaurants | `cr001c_loyalty_l3_real_migration_validated_in_preview` | `qa/CR_001C_L_LOYALTY_L3_REAL_MIGRATION_VERIFICATION_REPORT_R3.md` + `..._R689.md` |
| LR — `POST /api/pos/loyalty/redeem` (standalone) | ✅ Static QA 36/36 PASS | `cr001c_lr_pos_loyalty_redeem_api_qa_passed` | `implementation/CR_001C_LR_POS_LOYALTY_REDEEM_API_IMPLEMENTATION_REPORT.md`, `qa/CR_001C_LR_POS_LOYALTY_REDEEM_API_QA_REPORT.md` |
| LR Correction — final-payload redemption + shared helpers + `/max-redeemable` alignment | ✅ Static QA 52/52 PASS | `cr001c_lr_correction_qa_passed` | `implementation/CR_001C_LR_CORRECTION_IMPLEMENTATION_REPORT.md`, `qa/CR_001C_LR_CORRECTION_QA_REPORT.md`, `handoff/CR_001C_LR_REDEMPTION_FINAL_PAYLOAD_HANDOFF_TO_POS.md` |
| LR Alias Addendum — accept POS-legacy `used_loyalty_point` | ✅ Static QA 52/52 PASS | `cr001c_lr_alias_addendum_qa_passed` | same as LR Correction report §10 |
| L4 Cron — Birthday + Anniversary bonus parity (4 fixes + atomic `$inc`) | ✅ Static QA 17/17 PASS | `cr001c_loyalty_l4_cron_only_qa_passed` | `implementation/CR_001C_L_LOYALTY_L4_CRON_ONLY_IMPLEMENTATION_REPORT.md`, `qa/CR_001C_L_LOYALTY_L4_CRON_ONLY_QA_REPORT.md` |
| CR-001C-LR contract fix — `payment_status` gate REMOVED in `_validate_order` (CRM now accepts any payment_status from POS) | ✅ Implemented 2026-05-25, backend healthy | `cr001c_lr_payment_status_gate_removed` | PRD.md, CR_001_INDEX.md row "CONTRACT FIX — payment_status gate removed" |

### 2.3 Coupon backend (V1 → V3-C)

| Phase | Scope | Status | QA |
|---|---|---|---|
| V1 | Order flat / order percentage | ✅ QA passed in preview | 45/45 PASS |
| V2 | Item / Category (food_id, item_id, category_id, category_name) | ✅ QA passed in preview | 45/45 PASS |
| V3-A | Time-window / Happy-hour (server-clock, timezone resolution chain, overnight wrap, `valid_days`) | ✅ QA passed in preview | 31/31 PASS |
| V3-B | BOGO / Buy-X-Get-Y (same-item, different-item, free / % / flat benefit, `max_applications`, `allow_repeat`) | ✅ QA passed in preview | 49/49 PASS |
| V3-C | Every-Nth Item (item + category, free / % / flat, `allow_repeat`, `max_applications`) | ✅ QA passed in preview | 41/41 PASS |
| **Combined regression** | All phases together | ✅ | **211 / 211 PASS** |

Evidence: `implementation/CR_001C_C_COUPON_V{1,2,V3A,V3B,V3C}_*.md` + matching `qa/` reports.

### 2.4 Menu proxy + supporting backend fixes (Session 1)

| Fix | File | Status |
|---|---|---|
| `POST /api/coupons` persists ALL fields via `model_dump()` (Phase 0) | `routers/coupons.py` | ✅ Live |
| Migration re-sync preserves `points_earned` on existing orders | `routers/migration.py` | ✅ Live |
| Loyalty redemption fields written into `order_doc` | `routers/pos.py` | ✅ Live |
| `/api/menu/items` + `/api/menu/categories` proxy via stored `mygenie_token` | `routers/menu.py`, `server.py` | ✅ Live |

### 2.5 Coupon Admin UI

| Item | Status | Path |
|---|---|---|
| V1 + V2 production UI (drawer layout, type selector, live menu/category pickers, create/edit/delete/toggle) | ✅ Live | `frontend/src/pages/CouponsPage.jsx` → `/coupons` |
| V3-A / V3-B / V3-C UI preview (mock, non-functional) | ✅ Live | `frontend/src/pages/CouponV3Preview.jsx` → `/coupons-v3-preview` |
| V3 Production UI wiring | ❌ Pending — see §4 |

### 2.6 Documentation deliverables

| Item | Status | Path |
|---|---|---|
| POS API handoff summary (V1+V2+V3-A+V3-B+V3-C, 3 endpoints, 27 error codes) | ✅ Ready | `handoff/CR_001C_C_COUPON_POS_API_HANDOFF_SUMMARY.md` |
| POS contract compliance violations (7 violations, 3 blockers) | ✅ Reported to POS team 2026-05-25 | `handoff/CR_001C_POS_CONTRACT_COMPLIANCE_VIOLATIONS.md` |
| V3 UI implementation guide | ✅ Ready | `handoff/CR_001C_C_COUPON_V3_UI_IMPLEMENTATION_GUIDE.md` |
| Loyalty redemption final-payload handoff (POS) | ✅ Ready | `handoff/CR_001C_LR_REDEMPTION_FINAL_PAYLOAD_HANDOFF_TO_POS.md` |
| Session 1 agent handover | ✅ Ready | `handoff/SESSION_1_AGENT_HANDOVER.md` |

---

## 3. What Is Partially Completed

| Item | What Works | What Is Missing |
|---|---|---|
| **CR-001A Phase 2 / CR-001D prod close** | Implemented + QA passed in preview 2026-05-22 (12/12 static QA, 9/9 order_doc, live route accepts schema at HTTP 401) | Awaiting natural production room order after prod deploy + `pos-backend` worker restart. Verifier `cr_001a_check.sh` available. |
| **LR Realtime Order Redemption verification** | CRM-side complete: 52/52 LR + 17/17 L4 + alias acceptance live, 5 callers wired, `/pos/loyalty/redeem` + `/pos/max-redeemable` + final-payload path all in place | POS must send `used_loyalty_point` / `loyalty_points_used` + actual `order_amount` (not 0) in final `/api/pos/orders`. Until then, real-data verification cannot be run. Status: `cr001c_loyalty_waiting_pos_loyalty_points_key_for_final_realtime_redemption_qa`. |
| **Coupon Admin UI** | V1 + V2 production-ready at `/coupons`. V3-A/B/C preview at `/coupons-v3-preview` covers UX layout. | V3-A/B/C **not wired** to backend create/update — `COUPON_TYPES` array gates them off; `EMPTY_FORM` and `handleSubmit` need V3 field additions. Implementation guide already written. |
| **Loyalty rollout** | Realtime earning works for restaurants with `loyalty_enabled = True`. R689 (Kunafa) + Jeh's Nest validated end-to-end. | 3 restaurants (R478, R618, R634) have `loyalty_enabled = null` (silently disabled). Owner must toggle via UI. |
| **Item / category coupon end-to-end** | CRM engine fully supports `food_id` / `item_id` / `category_id` / `category_name` matching with priority fallbacks. Admin UI exposes pickers driven by menu API. | POS sends `item_id` (order-line ID, changes every order) instead of stable `pos_food_id` (product.id). Item-level coupons will **silently fail to match** until POS adds `pos_food_id` per contract. |

---

## 4. What Is Pending

### 4.1 P1 — V3 Coupon Admin UI wiring (owner-approved on V3 preview)

| Sub-task | Effort | Where |
|---|---|---|
| Wire V3-A Happy Hour into production `/coupons` | Low | Enable `time_window` in `COUPON_TYPES`, add weekday/time/timezone form section, extend `EMPTY_FORM` and `handleSubmit`. Preview reference at `/coupons-v3-preview`. |
| Wire V3-B BOGO/BXGY into production `/coupons` | Medium | Enable `bogo` in `COUPON_TYPES`. Most complex form (BOGO/BXGY toggle, buy/get item pickers, benefit type, `max_applications`, `allow_repeat`). |
| Wire V3-C Every-Nth into production `/coupons` | Medium | Enable `every_nth` in `COUPON_TYPES`. Nth rule field, eligible/excluded pickers, benefit type. |

Reference: `handoff/CR_001C_C_COUPON_V3_UI_IMPLEMENTATION_GUIDE.md`, `planning/CR_001C_C_COUPON_V3_UI_PLANNING_AND_PREVIEW_REPORT.md`.

### 4.2 P2 — Verifications gated on POS

| Sub-task | Trigger |
|---|---|
| CR-001C-LR Realtime Order Redemption Verification on real R689 data | POS sends loyalty fields + non-zero `order_amount` in final `/api/pos/orders` |
| CR-001A Phase 2 prod close | First natural prod room order after deploy + `pos-backend` restart |
| Item/category coupon live smoke (V2 + V3-B + V3-C) on real bills | POS sends `pos_food_id` per contract |

### 4.3 P2 — Owner actions

| Action | Owner |
|---|---|
| Toggle `loyalty_enabled = True` for R478, R618, R634 (currently `null`, silently disabled) | Restaurant owners via CRM UI |
| Resolve Q-MAP-1 (Menu API `product.id` 182041 vs POS `item_id` 2248768) — does POS map these, or do we need a lookup table? **Needs verification** with POS team | Owner + POS team |
| Resolve Q-MAP-2 (POS today does not send `category_id` / `item_category`) | POS team |

### 4.4 P3 — Backlog (parked)

- Duplicate coupon ("clone") admin UI feature
- Coupon analytics dashboard view
- V3-D / V3-E composite offers (combo) — explicitly parked to V4
- LR `used_outside_window_attempts` analytics counter — parked to V3-A2

---

## 5. What Is Blocked

### 5.1 BLOCKER B1 — POS contract violations

`handoff/CR_001C_POS_CONTRACT_COMPLIANCE_VIOLATIONS.md` lists 7 violations from live order 868999 (R689). The **3 high-severity** ones:

| # | Violation | Impact | CRM workaround? |
|---|---|---|---|
| 1 | `pos_food_id` missing (POS sends order-line `item_id` instead of stable product.id) | Item / category coupons will silently fail to match | NO |
| 5 | `loyalty_points_used` nested under `loyalty_info` wrapper (not top-level) | Loyalty redemption will not trigger | NO — CRM reads top-level only |
| 6 | `coupon_code` nested under `coupon_info` wrapper (not top-level) | Coupon commit will not trigger | NO — CRM reads top-level only |

CRM implementation already matches the agreed contract; no CRM-side change needed.

### 5.2 BLOCKER B2 — POS loyalty fields not being sent

Multiple R689 test orders (868917, 868924, 868925, 868928, 868929, 868931, 868932 → 868935, 008976) landed in CRM with `order_amount = 0` and zero loyalty fields. The final-payload redemption path cannot be exercised until POS wires the bill-finalize action and sends `used_loyalty_point` / `loyalty_points_used`. Status: `cr001c_lr_r689_realtime_payload_missing_loyalty_fields` + sub-finding `cr001c_lr_r689_realtime_payload_not_received` (see `analysis/CR_001C_LR_R689_*.md` × 4 reports).

### 5.3 BLOCKER B3 — Menu API ↔ POS item ID mismatch

Menu API returns `product.id = 182041`; POS sends `item_id = 2248768` for the same physical item. Until either (a) POS sends stable `pos_food_id`, or (b) a confirmed mapping/lookup is established (**needs verification**), item-level coupons cannot match end-to-end. Status: `cr001c_coupon_menu_api_mapping_complete_blocked_on_owner_id_mismatch_decision`. See `discovery/CR_001C_C_COUPON_MENU_API_MAPPING_REPORT.md`.

### 5.4 BLOCKER B4 — V3 UI wiring not yet implemented

Backend is ready (211/211 QA), preview UI is approved, implementation guide is written — but production `/coupons` page does not yet expose V3-A/B/C. Not blocked on anything external; this is a pending implementation task.

### 5.5 BLOCKER B5 — Restaurants with `loyalty_enabled = null`

R478, R618, R634 will not earn realtime points or recompute on migration until the owner toggles `loyalty_enabled = True` from the CRM UI. This is a data condition, not a code condition.

---

## 6. Coupon Backend Status

Single source of truth: `planning/CR_001_INDEX.md` §CR-001C-C.

| Phase | Status | Tracker | Files Touched (cumulative) |
|---|---|---|---|
| **V1 — Flat / Percentage (ORDER scope)** | ✅ QA 45/45 | `cr001c_coupon_v1_implementation_qa_passed_in_preview` | `core/coupon.py` (new), `models/schemas.py`, `routers/pos.py`, `services/analytics_service.py`, `server.py`, `tests/seed_coupon_v1_fixtures.py`, `tests/qa_cr001c_c_coupon_v1.py` |
| **V2 — Item / Category** | ✅ QA 45/45 | `cr001c_coupon_v2_item_category_implementation_qa_passed_in_preview` | + V2 helpers in `core/coupon.py`; `tests/qa_cr001c_c_coupon_v2_item_category.py` |
| **V3-A — Time-window / Happy-hour** | ✅ QA 31/31 | `cr001c_coupon_v3a_time_window_implementation_qa_passed_in_preview` | + V3-A pre-check (stdlib `zoneinfo`); `tests/qa_cr001c_c_coupon_v3_a_time_window.py` |
| **V3-B — BOGO / Buy-X-Get-Y** | ✅ QA 49/49 | `cr001c_coupon_v3b_bogo_bxgy_implementation_qa_passed_in_preview` | + V3-B engine in `core/coupon.py`; `tests/qa_cr001c_c_coupon_v3_b_bogo_bxgy.py` |
| **V3-C — Every-Nth Item** | ✅ QA 41/41 | `cr001c_coupon_v3c_every_nth_implementation_qa_passed_in_preview` | + V3-C engine in `core/coupon.py`; `tests/qa_cr001c_c_coupon_v3_c_every_nth.py` |

**Locked invariants (preserved across all phases):**

- One coupon per order (no stacking)
- Idempotency via partial unique index on `coupon_usage.(user_id, order_id)`
- POS-sent total is the source of truth for billing
- Final-order failure non-blocking (order persists; `coupon_usage` not recorded)
- Get/benefit items must already be in cart (no auto-add)
- Loyalty stacking only when `stackable_with_loyalty = True`
- Wallet untouched
- 9 admin CRUD endpoints (`routers/coupons.py`) untouched by engine work
- Legacy `coupon_transactions` collection untouched
- `/app/memory/final/` untouched

**Total error-code surface:** 27 (V1 → V3-C).

**No DB migration, no new indexes** (V1 indexes cover V2/V3), **no new dependency, no env change** across V2 → V3-C.

---

## 7. Coupon Admin UI Status

| Phase | Status | Location | Notes |
|---|---|---|---|
| V1 (order flat + order percentage) | ✅ Production-live | `/coupons` → `frontend/src/pages/CouponsPage.jsx` | Drawer layout, type selector, live menu/category pickers, create / edit / delete / toggle |
| V2 (item / category) | ✅ Production-live | same as V1 | Driven by `/api/menu/items` + `/api/menu/categories` proxy |
| V3-A (Happy Hour / time-window) | 🟧 Preview only | `/coupons-v3-preview` → `CouponV3Preview.jsx` | UX approved by owner; production wiring **pending** |
| V3-B (BOGO / BXGY) | 🟧 Preview only | same as V3-A | UX approved; production wiring **pending** |
| V3-C (Every-Nth) | 🟧 Preview only | same as V3-A | UX approved; production wiring **pending** |

Owner decisions for the UI are frozen in `planning/CR_001C_C_COUPON_ADMIN_UI_OWNER_DECISIONS.md`:
Q1=B reuse list / new form · Q2=B V1+V2 first · Q3=D hybrid · Q4=A live menu API · Q5=B advanced collapsible · Q6=B preview later · Q7=A coming-soon placeholders · Q8=B phased rollout.

Implementation guide for V3 wiring: `handoff/CR_001C_C_COUPON_V3_UI_IMPLEMENTATION_GUIDE.md`.

---

## 8. Coupon POS Contract Status

| Document | Purpose | Status |
|---|---|---|
| `handoff/CR_001C_C_COUPON_POS_API_HANDOFF_SUMMARY.md` | POS-facing API for V1 → V3-C (3 endpoints: `/available`, `/validate`, `/orders` coupon commit; 27 error codes; `POSCartItem` contract; business rules; deprecated `/apply`) | ✅ Ready for POS team |
| `handoff/CR_001C_POS_CONTRACT_COMPLIANCE_VIOLATIONS.md` | 7 contract violations from live order 868999 (R689) | ✅ Reported 2026-05-25, awaiting POS fixes |

### 8.1 Open blockers requiring POS action

| Priority | What POS must do |
|---|---|
| P1 (blocker) | Add `pos_food_id` (stable product.id) to each item in items array — without this, item/category coupons cannot match |
| P1 (blocker) | Send `loyalty_points_used`, `loyalty_discount`, `loyalty_idempotency_key` as **top-level** fields (NOT inside `loyalty_info` wrapper) |
| P1 (blocker) | Send `coupon_code`, `coupon_discount`, `coupon_title`, `coupon_type` as **top-level** fields (NOT inside `coupon_info` wrapper) |
| P2 | Add `item_category` (category name) per item |
| P2 | Send `wallet_used` as top-level (NOT inside `wallet_info`) |
| P3 (CRM alias handles today) | Rename `qty → item_qty`, `price → item_price` per contract |
| Also pending | POS must send actual `order_amount` (not 0) and non-empty loyalty fields on final `/api/pos/orders` so the LR Realtime Order Redemption Verification can run |

### 8.2 CRM-side contract posture

- All 5 callers wired through the shared `core/loyalty.redeem_loyalty_points` + `compute_max_redeemable` helpers (LR Correction).
- `payment_status` no longer gates order acceptance (2026-05-25 fix).
- Pydantic `AliasChoices` already accepts the POS-legacy `used_loyalty_point` singular (LR Alias Addendum).
- POS BUG-108 loyalty-API response shape is patched and GREEN-LIGHT to POS (LX-A).

---

## 9. Loyalty Status

### 9.1 Realtime earning

| Aspect | State | Source |
|---|---|---|
| Logic works for restaurants with `loyalty_enabled = True` | ✅ Confirmed working on R523, R601, R689 | `investigations/LOYALTY_POINTS_EARNING_ON_POS_ORDER_INVESTIGATION.md` (Finding A) |
| `payment_status` gate previously rejected non-`"success"` payloads | ✅ Removed 2026-05-25 | `cr001c_lr_payment_status_gate_removed` row in `CR_001_INDEX.md`; PRD.md |
| LX-A response-shape patch for POS BUG-108 | ✅ Done, POS handoff GREEN | `implementation/CR_001C_LX_A_IMPLEMENTATION_REPORT.md` |

### 9.2 Redemption

| Aspect | State |
|---|---|
| `POST /api/pos/loyalty/redeem` (standalone, for testing) | ✅ Live, QA 36/36 |
| `POST /api/pos/max-redeemable` (tier-aware, kill-switch-aware) | ✅ Live, thin wrapper around `compute_max_redeemable` |
| Final-payload redemption via `POST /api/pos/orders` (redeem-before-earn) | ✅ Live, QA 52/52 |
| Real-data verification on R689 | ⏳ **BLOCKED on POS sending loyalty fields + actual `order_amount`** |

### 9.3 Migration parity (L1 → L4)

| Aspect | State |
|---|---|
| L1 + L2 (clean-slate recompute) | ✅ Closed in earlier sprint |
| L3 (real-data PT recompute + tier evolution) | ✅ Closed on Jeh's Nest (209 customers) AND R689 (2034 customers, 50% earn, tier evolution) |
| Migration re-sync clobbering `order.points_earned` to 0 | ✅ Fixed Session 1 — `routers/migration.py` now `pop`s the field before `$set` |
| BUG-L3-001 — naive vs tz-aware comparison on expired pre-mark | ✅ Closed |
| L4 cron — Birthday + Anniversary bonus parity (4 fixes + atomic `$inc`) | ✅ QA 17/17 |

### 9.4 `loyalty_enabled` rollout

| Restaurant | `loyalty_enabled` | Action |
|---|---|---|
| R523, R601, R689, Jeh's Nest | `True` | None — earning works |
| **R478, R618, R634** | `null` (silently disabled) | **Owner must toggle from UI** |

---

## 10. Menu API / Item Mapping Status

Single source of truth: `discovery/CR_001C_C_COUPON_MENU_API_MAPPING_REPORT.md`.

| Aspect | State |
|---|---|
| `/api/menu/items` proxy via stored `mygenie_token` | ✅ Live (`routers/menu.py`) |
| `/api/menu/categories` (derived from products list — no dedicated upstream endpoint) | ✅ Live |
| Coupon Admin UI item / category selectors driven by these endpoints | ✅ Live |
| `mygenie_token` per restaurant on user doc; refreshed on MyGenie SSO login | ✅ Working; may expire — re-login refreshes |

### 10.1 KNOWN ID MISMATCH (BLOCKER B3)

| Source | Item "Golden Caramel Nutty Koshari" | ID |
|---|---|---|
| Menu API (`product.id`) | — | `182041` |
| POS order 868992 (`item_id`) | — | `2248768` |

POS currently sends order-line `item_id` instead of stable `pos_food_id` (= `product.id`). This is a **POS contract violation** (Violation #1 in §8). Until POS fixes this, item-level coupons will silently fail to match.

**Needs verification:** whether a deterministic mapping exists between menu `product.id` and POS `item_id` (in which case CRM could add a lookup), or whether the only correct fix is for POS to send `pos_food_id`.

### 10.2 Category name gap

Menu API product response has `category_id` but **no `category_name`** field. POS also sends `item_category: None` for R689. Category coupons therefore depend on `category_id` matching (which itself requires POS to send `category_id`, which it currently does not). **Needs verification** for whether POS will send `category_id`.

---

## 11. Open Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | POS team delivery timeline for the 3 BLOCKER contract fixes is unknown — every gated verification slips with it | Re-send `CR_001C_POS_CONTRACT_COMPLIANCE_VIOLATIONS.md` to POS owner; request ETA. |
| R2 | Menu API `mygenie_token` expiry can break the coupon UI item picker silently | Document re-login as the refresh path; consider expiry check + clear error toast in a later sprint. |
| R3 | V3 production UI wiring is owner-approved but not started — coupons V3-A/B/C cannot be authored from the admin even though backend is ready | Schedule V3-A → V3-B → V3-C wiring per implementation guide. |
| R4 | Three restaurants (R478, R618, R634) are silently not earning loyalty | Surface a "loyalty disabled" badge in admin? **Needs verification / owner decision.** |
| R5 | Migration may overwrite older realtime-broken rows opportunistically when "Sync Orders" is run (CR-001A Phase 1 lesson) | Documented in `CR_001_INDEX.md` §CR-001A. No code action; owner-driven. |
| R6 | CR-001A Phase 2 prod close requires a natural prod room order — could be delayed if room orders are rare | `cr_001a_check.sh` ready for instant verification when one lands. |
| R7 | Some V3-B / V3-C error paths (`MAX_APPLICATIONS_REACHED`) are intentionally NOT introduced — could surface as silent caps. Documented as design choice, but worth UX validation | Future UX review. |

---

## 12. Next Steps in Priority Order

### Priority 0 — Send / re-send to POS team
1. Re-send `handoff/CR_001C_POS_CONTRACT_COMPLIANCE_VIOLATIONS.md` to POS owner. Ask for ETA on the 3 blocker fixes (`pos_food_id`, top-level loyalty fields, top-level coupon fields).
2. Re-send `handoff/CR_001C_LR_REDEMPTION_FINAL_PAYLOAD_HANDOFF_TO_POS.md`. Ask POS to send actual `order_amount` (≠ 0) and `used_loyalty_point` / `loyalty_points_used` on the final `/api/pos/orders`.
3. Confirm Q-MAP-1 with POS team: is `product.id` (menu API) ever mapped to / equal to `pos_food_id` (POS contract), or does POS need to start sending it? **Needs verification.**

### Priority 1 — Wire V3 Admin UI (owner already approved preview)
4. Wire **V3-A Happy Hour** into production `/coupons` (`CouponsPage.jsx`). Per `handoff/CR_001C_C_COUPON_V3_UI_IMPLEMENTATION_GUIDE.md`:
   - Set `enabled: true` for `time_window` in `COUPON_TYPES`.
   - Extend `EMPTY_FORM` with `valid_days`, `start_time`, `end_time`, `timezone`.
   - Extend `handleSubmit` to include those fields.
5. Wire **V3-B BOGO/BXGY** into production `/coupons` (most complex form — buy/get pickers, benefit-type toggle, caps).
6. Wire **V3-C Every-Nth** into production `/coupons`.

### Priority 2 — Owner / data hygiene
7. Owner toggles `loyalty_enabled = True` for R478, R618, R634.

### Priority 3 — Verifications, run when blockers clear
8. CR-001A Phase 2 prod close: run `cr_001a_check.sh` after the first natural prod room order following deploy + `pos-backend` restart. Target status: `cr001a_phase_2_closed_live_on_prod`.
9. CR-001C-LR Realtime Order Redemption Verification on R689 (run as soon as POS sends loyalty fields + non-zero `order_amount`). Target: `cr001c_lr_realtime_order_redemption_verified`.
10. Item / category coupon live smoke on a real R689 bill (run as soon as POS sends `pos_food_id`).

### Priority 4 — Backlog / parked
11. Duplicate coupon ("clone") admin feature.
12. Coupon analytics dashboard.
13. V3-D / V3-E composite (combo) — V4 candidates.
14. LR `used_outside_window_attempts` analytics counter (V3-A2).

---

## 13. Recommended Agent Sequence

This is the suggested sequence for the next development sessions:

| Session | Agent role | Output |
|---|---|---|
| **Next 1 — POS Communication Agent** | Re-send POS handoff + violations doc; collect ETA; capture decisions in a new note under `handoff/`. No code. | A short status note + email/handoff confirmation. |
| **Next 2 — Frontend Wiring Agent (V3-A)** | Implement V3-A Happy Hour in production `/coupons` per implementation guide. Update `COUPON_TYPES`, `EMPTY_FORM`, `handleSubmit`, conditional form section. Add a small smoke test (create / list / edit / toggle a `time_window` coupon). | PR / file diff for `frontend/src/pages/CouponsPage.jsx` + implementation report under `implementation/`. |
| **Next 3 — Frontend Wiring Agent (V3-B)** | Implement V3-B BOGO/BXGY in production `/coupons`. | Implementation report. |
| **Next 4 — Frontend Wiring Agent (V3-C)** | Implement V3-C Every-Nth in production `/coupons`. | Implementation report. |
| **Next 5 — POS-Gated Verification Agent** | Run all 3 verifications (CR-001A Phase 2 prod close, LR Realtime Order Redemption, item/category live smoke) the moment POS lands the fixes. Update `CR_001_INDEX.md` row statuses. | QA reports + index updates. |
| **Next 6 — Backlog Agent (P3)** | Pick from §12 P3 list (duplicate coupon, analytics dashboard, V3-A2 analytics counter). | Per-feature delivery. |

---

## 14. Final Status

```
crm_1_0_current_state_consolidated_ready_for_next_agent
```

- Backend: complete across coupons (V1 → V3-C, 211/211 QA) and loyalty (earning, redemption, L3 migration parity, L4 cron). `payment_status` gate removed. Migration re-sync preserves `points_earned`. POS request logging (CR-002) intact.
- Admin UI: V1 + V2 production-live. V3-A/B/C preview-only — wiring pending.
- POS contract: handoffs delivered; 3 blocker violations + 2 high-severity violations + 2 low-severity awaiting POS fixes.
- Loyalty rollout: 3 restaurants (R478, R618, R634) need owner toggle to enable.
- 3 verifications gated on POS team deliverables.

Awaiting:
1. POS contract fixes (P0 external)
2. V3 UI wiring (P1 internal — no external dependency)
3. Owner `loyalty_enabled` toggles for R478, R618, R634
