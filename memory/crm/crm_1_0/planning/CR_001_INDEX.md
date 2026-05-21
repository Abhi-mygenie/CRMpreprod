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
| **CR-001A** | Realtime POS Webhook Data Mapping | Planning — awaits Q10/Q11/Q11.1/Q12/Q13 answers | **P0** | `/app/backend/routers/pos.py` (`POSOrderWebhook`, `OrderItem`, `_find_or_create_customer`, `_save_order_and_transactions`) | `CR_001A_REALTIME_POS_WEBHOOK.md` |
| **CR-001B** | Historical / Migration Data Audit | Planning — audit scope to confirm | P2 | `/app/backend/routers/migration.py` `background_order_sync` + historical `orders` collection | `CR_001B_MIGRATION_AUDIT.md` |
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
| ISSUE-09 alias hotfix (`item_id`/`qty`/`price`/`created_at`) | ✅ | | |
| Backfill the 1 recoverable realtime order (868862) | ✅ | | |
| Mark the 16 unrecoverable realtime orders | | ✅ | |
| `background_order_sync` field-mapping audit | | ✅ | |
| Historical orders integrity check | | ✅ | |
| Running totals on CRM manual `points.py` / `wallet.py` endpoints | | | ✅ |
| Dashboard coupon stats fix (collection + field) | | | ✅ |
| Order history endpoint + Orders tab in `CustomerDetailPage` | | | ✅ |
| Schema-drift CI test (replays `pos_request_logs` through model) | ✅ | | |
| Room schema decision (Q10) | ✅ | | |
| Delivery address strategy (Q11 / Q11.1) | ✅ | | |

---

## Cross-CR dependencies

- **CR-001A → CR-001C**: B2 (`$inc total_points_earned`/`total_wallet_used` on order ingest) must ship in lockstep with B3 (same `$inc` on CRM manual endpoints) to keep running totals reconciled. Otherwise running totals diverge by source.
- **CR-001A → CR-001B**: The 16 unrecoverable realtime orders get marked in CR-001B once CR-001A defines the marker schema (`items[].item_data_lost`).
- **CR-001B independence**: Migration audit (CR-001B) does not block any of CR-001A or CR-001C; it can run in parallel as a separate workstream.

---

## Open owner questions across all sub-CRs

| Q# | Lives in | Topic |
|---|---|---|
| Q10 | CR-001A | Room schema timing |
| Q11 | CR-001A | Delivery address strategy (POS sends no address on order) |
| Q11.1 | CR-001A | Address snapshot on order doc |
| Q12 | CR-001A | Alias for `created_at`→`order_created_at`, `item_id`→`pos_food_id` |
| Q13 | CR-001A | P0 hotfix authorization for ISSUE-09 |
| Q14 | CR-001B | Scope of migration audit |
| Q15 | CR-001B | 16 unrecoverable realtime orders — mark, delete, or leave |
| Q16 | CR-001C | Phase 2: order history endpoint design |

---

## Status flow

```
cr001_split_into_subcrs_planning_in_progress
   ├─ CR-001A: cr001a_waiting_owner_answers (Q10, Q11, Q11.1, Q12, Q13)
   ├─ CR-001B: cr001b_audit_scope_to_confirm (Q14, Q15)
   └─ CR-001C: cr001c_phase1_locked_phase2_open (Q16)
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
