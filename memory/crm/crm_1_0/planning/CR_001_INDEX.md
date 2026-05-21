# CR-001 — Master Index (SPLIT into CR-001A / CR-001B / CR-001C)

> **Status:** `cr001_split_into_subcrs_planning_in_progress`
> **Sprint:** CRM 1.0
> **Date:** 2026-05-21
> **Originating doc:** `/app/memory/crm/crm_1_0/planning/CR_001_ORDER_DATA_MAPPING_PLAN.md` (kept as reference; superseded for execution)

---

## Why the split

CR-001 grew to span three distinct domains with different urgency, risk profiles, and review surfaces. Treating them as one CR conflated a P0 production data bug with low-risk audits and UI work. Splitting allows:

1. P0 hotfix to ship without being blocked by UI / audit decisions.
2. Migration code audit to run independently without touching realtime ingestion code.
3. UI / analytics work to be scoped, designed, and reviewed by the right reviewers (frontend + analytics) without realtime backend concerns.

---

## Sub-CR Index

| Sub-CR | Title | Status | Priority | Owner area | Planning doc |
|---|---|---|---|---|---|
| **CR-001A** | Realtime POS Webhook Data Mapping | `cr001a_forward_only_fix_owner_decision_recorded` — Q13 decided; Q10/Q11/Q11.1/Q12 open | **P0** | `/app/backend/routers/pos.py` (`POSOrderWebhook`, `OrderItem`, `_find_or_create_customer`, `_save_order_and_transactions`) | `CR_001A_REALTIME_POS_WEBHOOK.md` |
| **CR-001B** | Historical / Migration Data Audit | `cr001b_docs_updated_forward_only_fix_owner_decision_recorded` — Q15 closed, Q17 applied; Q14/Q14.1 open | P2 | `/app/backend/routers/migration.py` + `/app/backend/routers/customers.py` | `CR_001B_MIGRATION_AUDIT.md` |
| **CR-001C** | CRM Visibility / UI Mapping | Planning — Phase 1 locked, Phase 2 backlog | P1 | `/app/backend/routers/points.py`, `wallet.py`, `services/analytics_service.py`, frontend `CustomerDetailPage.jsx` + Dashboard | `CR_001C_CRM_VISIBILITY_UI.md` |

---

## Scope split — quick reference

| Concern | CR-001A | CR-001B | CR-001C |
|---|:---:|:---:|:---:|
| `POSOrderWebhook` / `OrderItem` Pydantic schema | ✅ | | |
| Realtime POS webhook handler (`/api/pos/orders`) | ✅ | | |
| Customer auto-create / name-update on POS ingest | ✅ | | |
| Running-total `$inc` on order ingest (`customers.total_points_earned`, `total_wallet_used`) | ✅ | | |
| `is_veg` mapping into `order_items` | ✅ | | |
| ISSUE-09 alias forward-fix (`item_id`/`qty`/`price`/`created_at`) | ✅ | | |
| ~~Backfill the 1 recoverable realtime order (868862)~~ | ❌ **REMOVED — owner decision 2026-05-21** | | |
| ~~Mark the 16 unrecoverable realtime orders~~ | | ❌ **REMOVED — owner decision 2026-05-21** | |
| `background_order_sync` field-mapping audit (read-only) | | ✅ | |
| `background_customer_sync` ISSUE-10 null-address guard (applied) | | ✅ | |
| Historical orders integrity check (read-only) | | ✅ | |
| Running totals on CRM manual `points.py` / `wallet.py` endpoints | | | ✅ |
| Dashboard coupon stats fix (collection + field) | | | ✅ |
| Order history endpoint + Orders tab in `CustomerDetailPage` | | | ✅ |
| Schema-drift QA guard (replays `pos_request_logs` through model) — stretch | ✅ | | |
| Room schema decision (Q10) | ✅ | | |
| Delivery address strategy (Q11 / Q11.1) | ✅ | | |

---

## Cross-CR dependencies

- **CR-001A → CR-001C**: B2 (`$inc total_points_earned`/`total_wallet_used` on order ingest) must ship in lockstep with B3 (same `$inc` on CRM manual endpoints) to keep running totals reconciled. Otherwise running totals diverge by source.
- **CR-001A ↔ CR-001B**: Previously linked via the `item_data_lost` marker on 16 unrecoverable orders. **As of 2026-05-21 owner decision, this dependency is removed** — old realtime broken item data remains as-is in DB; no marker, no cleanup.
- **CR-001B independence**: Migration audit (CR-001B) does not block any of CR-001A or CR-001C; it can run in parallel as a separate read-only workstream.

---

## Open owner questions across all sub-CRs

| Q# | Lives in | Topic | Status |
|---|---|---|---|
| Q10 | CR-001A | Room schema timing | Open |
| Q11 | CR-001A | Delivery address strategy (POS sends no address on order) | Open |
| Q11.1 | CR-001A | Address snapshot on order doc | Open |
| Q12 | CR-001A | Alias for `created_at`→`order_created_at`, `item_id`→`pos_food_id` | Open |
| Q13 | CR-001A | ISSUE-09 fix scope | **DECIDED 2026-05-21 — forward-only fix, no backfill, no marker** |
| Q14 | CR-001B | Scope of migration audit | Open |
| Q14.1 | CR-001B | Post-audit fix path | Open (recommend new CR-001B-fix) |
| Q15 | CR-001B | 16 unrecoverable realtime orders cleanup | **CLOSED 2026-05-21 — owner decision: leave as-is** |
| Q17 | CR-001B | ISSUE-10 hotfix authorization | **APPLIED 2026-05-21 — minimal null-address guard only** |
| Q18 | CR-001B | Re-sync scope | In progress (verification by owner on preview env) |
| Q16 | CR-001C | Phase 2: order history endpoint design | Open |

---

## Status flow

```
cr001_split_into_subcrs_planning_in_progress
   │
   ├─ CR-001A: cr001a_forward_only_fix_owner_decision_recorded
   │           (H1+H2 in scope; H4 stretch; H3 backfill + marker REMOVED)
   │           Outstanding owner Qs: Q10, Q11, Q11.1, Q12
   │
   ├─ CR-001B: cr001b_docs_updated_forward_only_fix_owner_decision_recorded
   │           (read-only audit; ISSUE-10 minimal guard applied; cleanup REMOVED)
   │           Outstanding owner Qs: Q14, Q14.1
   │
   └─ CR-001C: cr001c_phase1_locked_phase2_open
               Outstanding owner Qs: Q16, Q16.1, Q16.2
```

Once all sub-CRs reach `ready_for_owner_approval`, master CR-001 reaches `closed_split`.

---

## Files

- `/app/memory/crm/crm_1_0/planning/CR_001_INDEX.md` — this file
- `/app/memory/crm/crm_1_0/planning/CR_001A_REALTIME_POS_WEBHOOK.md`
- `/app/memory/crm/crm_1_0/planning/CR_001B_MIGRATION_AUDIT.md`
- `/app/memory/crm/crm_1_0/planning/CR_001C_CRM_VISIBILITY_UI.md`
- `/app/memory/crm/crm_1_0/planning/CR_001_ORDER_DATA_MAPPING_PLAN.md` — original (kept for context / Round 1 owner answers history)
- `/app/memory/crm/crm_1_0/findings/ISSUE_09_POS_REALTIME_WEBHOOK_SCHEMA_MISMATCH.md` — root-cause doc consumed by CR-001A
