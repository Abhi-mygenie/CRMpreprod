# CRM 1.0 — CR-001 Index

Single source of truth for CR-001 family (POS realtime + migration sync work).

---

## CR-001A — Realtime POS Webhook Schema Mismatch (ISSUE-09)

| Phase | Title | Status | Date | Notes |
|---|---|---|---|---|
| Phase 1 | Forward-only alias mapping on `POST /api/pos/orders` | ✅ **`cr001a_phase_1_closed_live_on_prod`** | Closed 2026-05-22 09:10:46 UTC | Verified live on prod via order `868899` (7/7 alias checks pass) |
| Phase 2 | Add `room_info` + `associated_order_ids` to `POSOrderWebhook` (forward-only) | ✅ **`cr001a_phase_2_and_cr001d_qa_passed_with_runtime_limitations`** | Implemented & QA passed 2026-05-22 ~10:07 UTC | Implemented in same PR as CR-001D. Static QA 12/12, order_doc 9/9, live route accepts schema (HTTP 401). Live prod closure pending natural room order after prod deploy + `pos-backend` restart. See `/app/memory/crm/crm_1_0/implementation/CR_001A_PHASE_2_AND_CR_001D_IMPLEMENTATION_REPORT.md` |

### CR-001A Phase 1 — Artifacts
- Implementation report: `/app/memory/crm/crm_1_0/implementation/CR_001A_PHASE_1_IMPLEMENTATION_REPORT.md`
- QA report: `/app/memory/crm/crm_1_0/qa/CR_001A_PHASE_1_QA_REPORT.md`
- Code: `/app/backend/routers/pos.py` (lines 1–4, 949–1016, 1019–1102)
- Static QA harness: `/tmp/cr_001a_qa.py` (12 / 12 PASS)
- On-host verifier: `/app/memory/crm/crm_1_0/qa/cr_001a_check.sh`
- Live proof: `pos_request_logs` + `orders.id=crm-phase-loyalty` (order `868899`)

### CR-001A Phase 1 — Owner decisions captured
- Forward-only. No historical backfill, no mutation of old records, no
  `item_data_lost` marker, no cleanup script.
- Migration may overwrite older realtime-broken rows opportunistically when
  the restaurant's `Sync Orders` is run — that is owner-driven, not a CR-001A
  action.

### CR-001A Phase 1 — Key lesson (deployment)
- In a multi-app pm2 setup, the **service whose name matches the endpoint
  family** is the one whose worker must be restarted. `/api/pos/*` is served
  by `pos-backend` (pm2 id 7), not `crm-backend` (id 2). Restarting the wrong
  service silently fails the deploy.
- File on disk being updated ≠ running Python process having the new model.
  Pydantic builds model classes at import time; the worker must be killed
  and re-spawned to load new model definitions.
- Verifier script `cr_001a_check.sh` should be run on prod after every
  schema-affecting deploy to catch this case in <2 s.

---

## CR-001B — Migration Sync (R689)

| Phase | Title | Status |
|---|---|---|
| Phase 2 | R689 sync hardening / F-series fixes (F9 persistent `migration_sync_logs`, F12 dedup) | ⏳ Owner-driven, in flight |

### Snapshot at CR-001A Phase 1 closure (2026-05-22 09:10 UTC)
- R689 order_sync still **running** since 03:44 UTC
- progress: page 145 / 329
- synced 347 · updated 3278 · failed 0
- untouched by CR-001A work ✅

### Guard rails (still active)
- `migration.py` must not be modified by CR-001A Phase 2 work either.
- `migration_sync_logs` collection is the persistence layer (F9). Do not
  drop/truncate.

---

## CR-001C — TBD

Not yet defined.

### CR-001C-L (Loyalty) — Bridge Phase LX-A — POS BUG-108 API Contract Alignment

| Item | Status | Date | Notes |
|---|---|---|---|
| LX-A — Loyalty API response alignment for POS BUG-108 | ✅ **`cr001c_lx_a_loyalty_pos_contract_patched_qa_passed_in_preview`** | 2026-05-23 | 4 files touched (`backend/{models/schemas.py, core/helpers.py, core/loyalty.py, routers/pos.py}`). Static QA 63/63, live read-only smoke 5/5 on restaurant `18march`. POS handoff banner flipped to GREEN-LIGHT. See `implementation/CR_001C_LX_A_IMPLEMENTATION_REPORT.md` + `qa/CR_001C_LX_A_QA_REPORT.md`. |
| **LF-MERGE — Loyalty Flag Merge (deprecate `loyalty_clean_slate_recalc`)** | ✅ **`cr001cl_lf_merge_complete_qa_passed_in_preview`** | **2026-05-23** | **Owner-driven follow-up.** Real owner-triggered migration on `Jeh's Nest` revealed that the visible "Loyalty Program ON" toggle (`loyalty_enabled`) did NOT control migration clean-slate recompute — a hidden flag `loyalty_clean_slate_recalc` (no UI exposure) did. Per owner Option 3, both flags merged: `loyalty_enabled` now drives BOTH realtime POS earning AND migration clean-slate recompute. `loyalty_clean_slate_recalc` deprecated (still on schema for backward compat, no longer read). 3 files touched (`backend/{routers/migration.py, routers/customers.py, models/schemas.py}`). Static QA 37/37, LX-A regression 63/63. Real-data L3 validation pending owner Revert → Sync Again on `Jeh's Nest`. See `implementation/CR_001C_L_LF_MERGE_IMPLEMENTATION_REPORT.md` + `qa/CR_001C_L_LF_MERGE_QA_REPORT.md` + `qa/CR_001C_L_LOYALTY_L3_REAL_MIGRATION_VERIFICATION_REPORT.md`. |
| **BUG-L3-001 — D1 expired pre-mark fix (naive vs tz-aware compare)** | ✅ **`cr001c_l_bug_l3_001_closed`** | **2026-05-23** | R2 verification surfaced 28 PT rows NOT pre-marked expired. Fix: coerce naive `od_dt` to UTC; narrow `except` to `ValueError`. **R3 re-verification PASSED** — 28 expired rows correctly marked, balances reconcile 209/209. See `qa/CR_001C_L_LOYALTY_L3_REAL_MIGRATION_VERIFICATION_REPORT_R3.md`. |
| **L3 Real Migration Validation** | ✅ **`cr001c_loyalty_l3_real_migration_validated_in_preview`** | **2026-05-23** | All 8 L3 checks pass on Jeh's Nest after BUG-L3-001 fix + owner re-migration. 209 customers, 233 orders, 98 PT earn rows (28 expired/70 active). `total_points(379) = earned(753) − expired(374)`. L3 closed in preview. See `qa/CR_001C_L_LOYALTY_L3_REAL_MIGRATION_VERIFICATION_REPORT_R3.md`. |

L1+L2+L3 status preserved verbatim in their existing reports
(`cr001c_loyalty_l3_migration_parity_qa_passed`).

**L3 real migration validation is CLOSED in preview.**
Status: `cr001c_loyalty_l3_real_migration_validated_in_preview`.

---

## CR-001D — `orders.restaurant_id` silently null (NEW, surfaced 2026-05-22)

Discovered during CR-001A Phase 1 live verification. Every order persisted via
`POST /api/pos/orders` shows `orders.restaurant_id = None` even though the
payload sends `"restaurant_id": "478"`. This is a downstream-mapping miss in
`pos.py` (the `order_doc` dict does not include `order_data.restaurant_id`).

- Severity: medium (affects restaurant-level analytics & filtering)
- Scope: one-line addition to `order_doc` build in `pos.py`
- Status: ✅ **Implemented + QA passed 2026-05-22 ~10:07 UTC**
  (`cr001a_phase_2_and_cr001d_qa_passed_with_runtime_limitations`). Live prod
  closure pending natural production order after prod deploy + `pos-backend`
  restart. `pos_restaurant_id` preserved for backwards compatibility.
  See `/app/memory/crm/crm_1_0/implementation/CR_001A_PHASE_2_AND_CR_001D_IMPLEMENTATION_REPORT.md`

---

## CR-002 — POS Request Logging Middleware

| Status | Notes |
|---|---|
| ✅ Implemented (imported in `22-may` branch) | `/app/backend/core/pos_request_logger.py`; writes to `pos_request_logs`. Verified working for CR-001A — every realtime POS order during the work was captured. **Must not be modified by CR-001A.** |

---

## Cross-CR Dependencies

| From | To | Type |
|---|---|---|
| CR-001A Phase 1 | CR-002 | Read-only: CR-001A used `pos_request_logs` for raw-payload diffing against persisted state |
| CR-001A Phase 1 | CR-001B | Isolated by file boundary (`pos.py` vs `migration.py`) — verified no impact on R689 |
| CR-001A Phase 2 | CR-001A Phase 1 | Builds on the same `POSOrderWebhook` model · ✅ implemented 2026-05-22 |
| CR-001D | CR-001A Phase 1 | Adjacent in `pos.py` (order_doc build), no model change needed · ✅ implemented 2026-05-22 (same PR as CR-001A Phase 2) |

---

## Glossary of Captured Realtime Field Aliases (CR-001A Phase 1)

| POS field (incoming) | CRM canonical (stored) |
|---|---|
| `created_at` (top-level) | `order_created_at` |
| `items[].item_id` | `items[].pos_food_id` (str) |
| `items[].qty` | `items[].item_qty` (int, default 1) |
| `items[].price` | `items[].item_price` (float, default 0.0) |

Both directions accepted (`populate_by_name=True`).
