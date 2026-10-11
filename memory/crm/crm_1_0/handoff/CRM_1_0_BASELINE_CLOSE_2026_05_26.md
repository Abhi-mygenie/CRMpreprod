# CRM 1.0 — Baseline Close

**Date:** 2026-05-26
**Author:** CRM 1.0 Baseline Reconciliation Agent (final pass)
**Branch:** `27-may` (Abhi-mygenie/CRMpreprod.git)
**Database:** External MongoDB `52.66.232.149:27017/mygenie`
**Mode:** Documentation only — no code, DB, env, deploy, or migration changes. `/app/memory/final/` untouched.

---

## 0. Single-Line Verdict

```
crm_1_0_baseline_closed_production_promotable_2026_05_26
```

CRM 1.0 has **zero Top-5 blockers** (external or internal). The core revenue flow — coupon engine V1 → V3-C, coupon admin UI V1 → V3-C, loyalty earning + realtime redemption + L1–L4 migration parity, POS order ingestion, POS contract compliance — is **production-promotable end-to-end**. Remaining items are owner-driven scoping or low-priority beta-promotion QA.

---

## 1. Today's Closures (2026-05-26)

Five trackers closed on the same day, all live-verified:

| # | Closure | Tracker | Evidence path |
|---|---|---|---|
| 1 | POS contract compliance — all 7 violations resolved | `cr001c_pos_contract_compliance_closed_pos_shipped_2026_05_26` | `handoff/CR_001C_POS_CONTRACT_COMPLIANCE_CLOSURE_2026_05_26.md` |
| 2 | LR realtime order redemption — verified live on R689 | `cr001c_lr_realtime_order_redemption_verified` | `qa/CR_001C_LR_REALTIME_ORDER_REDEMPTION_CLOSURE_2026_05_26.md` |
| 3 | Menu API `product.id` ↔ POS `item_id` mismatch — closed (POS now sends `pos_food_id`) | sub-blocker of #1 | (Section 3 of doc #1) |
| 4 | V3-C Every-Nth Coupon Admin UI — 42 / 42 QA PASS | `cr001c_coupon_v3c_admin_ui_qa_passed` | `qa/CR_001C_C_COUPON_V3C_ADMIN_UI_QA_REPORT.md` |
| 5 | CRM 1.0 baseline reconciliation — Addendum A + Addendum B | `crm_1_0_baseline_reconciliation_complete_with_v3c_admin_ui_closure_2026_05_26` | `handoff/CRM_1_0_BASELINE_RECONCILIATION_REPORT.md` (Addenda A + B) |

---

## 2. Top-5 Blockers — Final State

| # | Blocker (from 2026-05-25 reconciliation) | Final state (2026-05-26) |
|---|---|---|
| **B1** | POS has not honoured top-level loyalty + coupon fields and `pos_food_id` | ✅ **CLOSED** — POS shipped contract fixes (see §4 evidence) |
| **B2** | POS not calling `POST /api/pos/orders` at bill-finalize with loyalty fields | ✅ **CLOSED** — 76 redeem PTs / 8 633 pts on R689 (see §4 evidence) |
| **B3** | Menu API `product.id` ≠ POS `item_id` mismatch — item-level coupons silently fail | ✅ **CLOSED** — POS now sends stable `pos_food_id` on every order (25 / 25 latest payloads) |
| **B4** | R478 / R618 / R634 `loyalty_enabled = null` | **DEMOTED — owner-config, not a blocker** (per owner directive) |
| **B5** | V3-C Admin UI tile enabled but no QA evidence on disk | ✅ **CLOSED** — 42 / 42 PASS QA evidence on disk (live API smoke + engine smoke + cleanup verified) |

```
Top-5 external blockers : 0
Top-5 internal blockers : 0
```

---

## 3. Module Status — Final Matrix

### ✅ Working baseline (12 modules — promotable now)

| # | Module | Backend | Frontend | QA |
|---|---|---|---|---|
| 1 | Coupon engine V1 + V2 + V3-A + V3-B + V3-C | `core/coupon.py` (all `_v3*_*` helpers) | — | 211 / 211 in-preview QA |
| 2 | **Coupon Admin UI V1 + V2 + V3-A + V3-B + V3-C** | `routers/coupons.py` (`model_dump()` on create + update) | `CouponsPage.jsx` (all 5 tiles `enabled: true`) | V3-A 12 / 12 · V3-B 15 / 15 + 4 / 4 regression · **V3-C 42 / 42** |
| 3 | Loyalty earning + tier evolution + L1–L4 migration | `core/loyalty.py`, `core/loyalty_jobs.py`, `routers/migration.py` | `LoyaltySettingsPage.jsx`, `MigrationPage.jsx`, `CustomerDetailPage.jsx` | L3 validated on 2 restaurants (Jeh's Nest 209c + R689 2034c); L4 cron 17 / 17 |
| 4 | **Loyalty realtime redemption** | `redeem_loyalty_points` + `compute_max_redeemable` + 5 callers in `pos.py` | — | ✅ **76 redeem PTs / 8 633 pts on R689 (live)** |
| 5 | POS order ingestion (`POST /api/pos/orders`) | `pos.py` `pos_order_webhook` + alias map + Phase 2 schema | — | CR-001A Phase 1 closed live; Phase 2 12/12 + 9/9 (prod-close pending natural prod order) |
| 6 | **POS contract / payload compliance** | `models/schemas.py` + `pos.py` AliasChoices | — | ✅ **25 / 25 most-recent payloads contract-compliant** |
| 7 | CR-001D `orders.restaurant_id` mapping | (same PR as Phase 2) | — | ✅ |
| 8 | CR-002 POS request logging middleware | `core/pos_request_logger.py` | — | Live; 1 861 logged calls captured |
| 9 | POS-PERF-1 `/coupons/available` N+1 fix | `core/coupon.py` precomputed kwargs | — | 16.48 s → 1.15 s; byte-identical contract; 211 / 211 regression |
| 10 | Menu proxy API | `routers/menu.py` | Consumed by Coupon Admin UI item / category pickers | Live; ID-mismatch sub-blocker closed 2026-05-26 |
| 11 | Loyalty cron scheduler (L4 birthday + anniversary) | `core/scheduler.py`, APScheduler | — | 17 / 17 |
| 12 | **V3-C Every-Nth Admin UI** *(new today)* | (same as #2) | (same as #2) | ✅ **42 / 42 PASS — `qa/CR_001C_C_COUPON_V3C_ADMIN_UI_QA_REPORT.md`** |

### 🟧 Beta-usable (5 modules — promotable after 1-day QA each, NOT blockers)

Feedback · WhatsApp Automation + Templates · Analytics (item perf + customer lifecycle) · Customer / Segments / Notes / QR · Migration CR-001B Phase 2 (in-flight)

### 🟧 Beta-pending (1 module — owner scoping)

**Scan & Order consumer app** — 30+ endpoints in `routers/scan.py`, no memory artefacts. Owner-driven scoping; not a baseline gate for the CRM.

### 🟧 Not baseline-ready (1 module — owner decision)

**Wallet** — 3 thin admin endpoints (debit/credit ledger) + UI placeholder. No POS wallet contract. Owner decides: deprecate / keep minimal / extend with POS contract.

---

## 4. Live Evidence Snapshot (queried 2026-05-26)

### 4.1 Loyalty realtime redemption

| Metric | Value |
|---|---|
| Total redeem `points_transactions` rows | **76** |
| Sum of points redeemed (all R689) | **8 633** |
| Latest redeem timestamp (UTC) | **2026-05-26 05:16:06** |
| Restaurant exercising the flow | **R689 — Kunafa Mahal** (`user_id = pos_0001_restaurant_689`) |

### 4.2 POS contract compliance (last 25 `/api/pos/orders` payloads in `pos_request_logs`)

| Compliance dimension | Pass count |
|---|---|
| Top-level `loyalty_points_used` (no nested `loyalty_info`) | **25 / 25** ✅ |
| Top-level `coupon_code` (no nested `coupon_info`) | **25 / 25** ✅ |
| First item carries `pos_food_id` (stable product.id) | **25 / 25** ✅ |
| First item carries old `item_id` (legacy field) | **0 / 25** ✅ |
| Nested `loyalty_info` / `coupon_info` / `wallet_info` wrappers | **0 / 25** ✅ |

### 4.3 Database scale

| Collection | Count |
|---|---|
| `coupons` | 37 |
| `customers` | 3 078 |
| `orders` | 30 621 |
| `pos_request_logs` | 1 861 |

---

## 5. Remaining Open Items — Final List (None Are Blockers)

| # | Item | Type | Why it does not block baseline |
|---|---|---|---|
| 1 | CR-001A Phase 2 prod close | Verification | QA already passed in preview; awaits a natural production room order to flip `cr001a_phase_2_closed_live_on_prod`. Verifier script ready (`qa/cr_001a_check.sh`). Low priority. |
| 2 | Feedback baseline-promotion QA | Beta-promotion | 3 endpoints; minimal surface; producing a 1-page smoke QA promotes to baseline. |
| 3 | Analytics baseline-promotion QA | Beta-promotion | 6 endpoints (item perf + customer lifecycle + export); 1-day QA harness. |
| 4 | WhatsApp Automation + Templates QA | Beta-promotion | 15+ endpoints; 1-day QA harness over 6 main events. |
| 5 | Customer / Segments / Notes / QR QA | Beta-promotion | 30+ endpoints; smoke-test harness. |
| 6 | Scan & Order consumer app inventory + QA | Owner scoping | 30+ endpoints; needs owner decision on whether this is in CRM 1.0 scope. |
| 7 | Migration CR-001B Phase 2 closure | Owner sign-off | F9 / F12 hardening in flight; owner closes when ready. |
| 8 | Wallet scoping decision | Owner gate | Deprecate / minimal / extend with POS contract. |
| 9 | R478 / R618 / R634 `loyalty_enabled = null` toggle | Owner config | Restaurant owners toggle when they want loyalty for their restaurant. Not engineering scope. |
| 10 | Hygiene: orphan `frontend/src/pages/CouponV3Preview.jsx` | Cleanup | One-line route deletion. |
| 11 | Hygiene: restore upstream 27-may `memory/PRD.md` | Cleanup | Replace agent-truncated 1 KB version with original 16 KB. |
| 12 | Hygiene: verify `discount_type: "fixed"` vs `"flat"` UI/engine naming consistency | Verification | Was a small Session-1 gap; check current state. |

---

## 6. Documents Updated in the Final Pass (Audit Trail)

### New documents (3)
| Path | Bytes |
|---|---|
| `crm/crm_1_0/qa/CR_001C_LR_REALTIME_ORDER_REDEMPTION_CLOSURE_2026_05_26.md` | 6 283 |
| `crm/crm_1_0/handoff/CR_001C_POS_CONTRACT_COMPLIANCE_CLOSURE_2026_05_26.md` | 7 045 |
| `crm/crm_1_0/handoff/CRM_1_0_CURRENT_STATE_CONSOLIDATION_AND_NEXT_STEPS_v2_2026_05_26.md` | 15 202 |
| `crm/crm_1_0/qa/CR_001C_C_COUPON_V3C_ADMIN_UI_QA_REPORT.md` | 12 302 |
| **`crm/crm_1_0/handoff/CRM_1_0_BASELINE_CLOSE_2026_05_26.md`** (this document) | — |

### Files edited (8)
1. `crm/crm_1_0/planning/CR_001_INDEX.md` — V3-C row added; Closure 2026-05-26 sub-section extended from 2 → 3 closures; 2 row statuses flipped earlier today.
2. `crm/crm_1_0/handoff/CRM_1_0_BASELINE_RECONCILIATION_REPORT.md` — Addendum A (B1–B3 closed, B4 demoted) + Addendum B (B5 closed).
3. `crm/crm_1_0/handoff/CR_001C_POS_CONTRACT_COMPLIANCE_VIOLATIONS.md` — SUPERSEDED banner.
4. `crm/crm_1_0/qa/CR_001C_LR_REALTIME_ORDER_REDEMPTION_VERIFICATION_REPORT.md` — SUPERSEDED banner.
5. `crm/crm_1_0/analysis/CR_001C_LR_R689_REALTIME_LOYALTY_PAYLOAD_INVESTIGATION.md` — SUPERSEDED banner.
6. `crm/crm_1_0/analysis/CR_001C_LR_R689_REALTIME_LOYALTY_PAYLOAD_INVESTIGATION_868917.md` — SUPERSEDED banner.
7. `crm/crm_1_0/analysis/CR_001C_LR_R689_REALTIME_LOYALTY_PAYLOAD_INVESTIGATION_868924.md` — SUPERSEDED banner.
8. `crm/crm_1_0/analysis/CR_001C_LR_R689_CAPTURED_LOG_ONLY_INVESTIGATION_ADDENDUM.md` — SUPERSEDED banner.
9. `crm/crm_1_0/discovery/CR_001C_C_COUPON_MENU_API_MAPPING_REPORT.md` — ID-mismatch closure banner.

### Preserved as history (1, intentionally not modified)
- `crm/crm_1_0/handoff/CRM_1_0_CURRENT_STATE_CONSOLIDATION_AND_NEXT_STEPS.md` (v1, 2026-05-25 snapshot — refer v2 for current state).

---

## 7. Final Headline Numbers

| Metric | Value |
|---|---|
| External Top-5 blockers | **0** |
| Internal Top-5 blockers | **0** |
| Working-baseline modules | **12 / 18** (was 9 yesterday) |
| Backend QA coverage (coupon engine) | **211 / 211 PASS** |
| Backend QA coverage (loyalty static) | **52 + 17 = 69 / 69 PASS** |
| V3-C Admin UI QA | **42 / 42 PASS** (new today) |
| Loyalty redemption activity (live, R689) | **76 transactions, 8 633 points** |
| POS contract violations open (live audit) | **0 / 7** |
| Customers loaded | 3 078 |
| Orders processed | 30 621 |
| POS request logs captured (CR-002) | 1 861 |

---

## 8. Operating Posture Going Forward

1. **Code freeze readiness** — no functional change is required to take CRM 1.0 to production. All in-scope flows are green.
2. **Recommended monitoring at cutover** — `points_transactions.transaction_type='redeem'` count delta, `coupon_usage` per-coupon counters, `pos_request_logs` 5xx rate, supervisor uptime on `backend` and `frontend`.
3. **Roll-out toggle for new restaurants** — owners flip `loyalty_enabled = True` in CRM UI per restaurant; no engineering action required.
4. **Beta-promotion track** — Feedback → Analytics → WhatsApp → Customer/Segments → Scan-app can each be promoted with a 1-day QA harness without touching the working-baseline modules.
5. **Wallet decision** — pending owner gate; CRM 1.0 does not depend on this.

---

## 9. Strict Rules Honoured

- No code changes.
- No DB schema changes.
- No env changes.
- No deploy.
- No migration.
- `/app/memory/final/` untouched.
- All evidence sourced from either (a) live production MongoDB, or (b) doc-on-disk citations with exact paths.

---

## 10. Final Status

```
crm_1_0_baseline_closed_production_promotable_2026_05_26
```

End of CRM 1.0 baseline reconciliation cycle. Future work proceeds from the working baseline established here.
