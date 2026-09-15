# CRM 1.0 — Open Gaps Register

Living register of known gaps in CRM 1.0. Updated 2026-05-22 09:11 UTC with
CR-001A Phase 1 closure.

---

## ✅ CLOSED — ISSUE-09 — POS Realtime Webhook Schema Mismatch (forward-fix)

| Field | Value |
|---|---|
| **First identified** | Pre-2026-05-22 |
| **Severity** | High (silent item-level data loss on every realtime order) |
| **Affected endpoint** | `POST /api/pos/orders` |
| **Affected fields** | `order_created_at`, `pos_food_id`, `item_qty`, `item_price` |
| **Forward fix (CR-001A Phase 1)** | ✅ **CLOSED LIVE ON PROD 2026-05-22 09:10:46 UTC** |
| **Live proof** | Order `868899` — 7 / 7 alias checks pass on `crm.mygenie.online` |
| **Owner decision (historical residual)** | Forward-only. No backfill. No `item_data_lost` marker. No cleanup script. No mutation of pre-fix `orders` / `order_items`. |
| **Residual risk (open)** | Historical realtime orders persisted between 2026-05-21 ~07:00 UTC and 2026-05-22 ~09:00 UTC have null `order_created_at`, null `pos_food_id`, default `item_qty=1`, default `item_price=0.0`. Analytics consumers should treat these as data-loss artifacts. Some have been opportunistically overwritten by migration `Sync Orders` runs (owner-driven). |

---

## ✅ CLOSED — GAP-CR001A-RT1 — Authenticated E2E DB-Write Test

| Field | Value |
|---|---|
| **Severity** | Low |
| **Description** | The CR-001A Phase 1 QA pipeline initially did not execute an authenticated `POST /api/pos/orders` end-to-end against a production-like MongoDB. |
| **Closure** | ✅ Closed 2026-05-22 09:10:46 UTC by natural arrival of real production order `868899` (no synthetic test pollution). 7/7 alias checks pass on production. |
| **Status** | CLOSED |

---

## ✅ IMPLEMENTED (awaiting live prod closure) — CR-001A Phase 2 — `room_info` + `associated_order_ids`

| Field | Value |
|---|---|
| **First observed** | 2026-05-22 06:09 UTC (order `868866`, room order with `room_info={room_price:1000,advance_payment:0,balance_payment:1000}`) |
| **Re-confirmed at Phase 1 closure** | 2026-05-22 09:10:46 UTC (order `868899`, room order with `room_price=7888`, silently lost) |
| **Severity** | Medium-High (every room/hotel POS order silently loses room revenue & advance/balance tracking; parent-order linkage lost via `associated_order_ids`) |
| **Affected endpoint** | `POST /api/pos/orders` |
| **Root cause** | `POSOrderWebhook` Pydantic model had no `room_info` or `associated_order_ids` fields → Pydantic v2 silently ignored them. |
| **Fix implemented** | 2026-05-22 ~10:05 UTC. New `RoomInfo` nested BaseModel + `room_info: Optional[RoomInfo]` + `associated_order_ids: Optional[List[str]]` with element-coercion validator. `order_doc` write extended. Same PR as CR-001D. |
| **Forward-only scope** | YES (no historical backfill) |
| **QA result** | Static 12/12 PASS, order_doc 9/9 PASS, live route accepts schema (HTTP 401) |
| **Spec** | `/app/memory/crm/crm_1_0/planning/CR_001A_PHASE_2_SPEC.md` |
| **Implementation report** | `/app/memory/crm/crm_1_0/implementation/CR_001A_PHASE_2_AND_CR_001D_IMPLEMENTATION_REPORT.md` |
| **QA report** | `/app/memory/crm/crm_1_0/qa/CR_001A_PHASE_2_AND_CR_001D_QA_REPORT.md` |
| **Status** | `cr001a_phase_2_and_cr001d_qa_passed_with_runtime_limitations` — live prod closure pending natural production room order after prod deploy + `pos-backend` (pm2 id 7) restart |

---

## ✅ IMPLEMENTED (awaiting live prod closure) — CR-001D — `orders.restaurant_id`

| Field | Value |
|---|---|
| **First observed** | 2026-05-22 06:09 UTC during CR-001A Phase 1 verification |
| **Re-confirmed** | 2026-05-22 09:10:46 UTC (order `868899` — payload `restaurant_id="478"`, persisted `restaurant_id=None`) |
| **Severity** | Medium (restaurant-level filtering & analytics on `orders` broken; have to fall back to `user_id` mapping) |
| **Affected endpoint** | `POST /api/pos/orders` (realtime) |
| **Root cause** | `POSOrderWebhook` parsed `restaurant_id` correctly into the Pydantic model, but the `order_doc` dict built inside `_save_order_and_transactions` did not include it. |
| **Fix implemented** | 2026-05-22 ~10:05 UTC. One-line addition: `"restaurant_id": order_data.restaurant_id` in `order_doc` (alongside existing `"pos_restaurant_id"` which is preserved). |
| **Note on migration path** | Migration's `orders` insert may still have its own gap — out of scope for this CR. |
| **QA result** | PASS (static + order_doc) — live prod closure pending |
| **Status** | `cr001a_phase_2_and_cr001d_qa_passed_with_runtime_limitations` |

---

## ⏳ OPEN — GAP-MEM-1 — Earlier CRM 1.0 Handover Docs Not Present in Imported Repo

| Field | Value |
|---|---|
| **Severity** | Low (informational) |
| **Description** | The expected handover docs referenced at session start (`CR_001A_PHASE_1_IMPLEMENTATION_HANDOVER.md`, `CR_001A_REALTIME_POS_WEBHOOK.md`, `ISSUE_09_POS_REALTIME_WEBHOOK_SCHEMA_MISMATCH.md`, `CR_001A_MYGENIE_RAW_PAYLOAD_SAMPLES.md`) were not present in the `22-may` branch of `Abhi-mygenie/CRMpreprod`. |
| **Impact** | This session seeded fresh implementation/QA/index/register docs from the work performed. If the original handover docs exist elsewhere, they should be cross-referenced. |
| **Status** | Informational — owner to confirm whether earlier docs should be merged in. |

---

## Closed Items Summary

| Item | Closed at | Reference |
|---|---|---|
| ISSUE-09 forward-fix (CR-001A Phase 1) | 2026-05-22 09:10:46 UTC | order `868899` 7/7 PASS |
| GAP-CR001A-RT1 | 2026-05-22 09:10:46 UTC | natural prod order verification |
| CR-001A Phase 2 (`room_info` + `associated_order_ids`) — implemented + QA passed (awaiting live prod closure) | 2026-05-22 ~10:07 UTC | static 12/12, order_doc 9/9, HTTP 401 schema-accept |
| CR-001D (`orders.restaurant_id`) — implemented + QA passed (awaiting live prod closure, same PR as Phase 2) | 2026-05-22 ~10:07 UTC | same artifacts as above |

## Open Items Summary (Prioritised)

| Priority | Item | Severity |
|---|---|---|
| P1 | CR-001A Phase 2 + CR-001D live prod closure (deploy + `pos-backend` pm2 restart on prod, then await natural room order) | Pending owner deploy action |
| P3 | ISSUE-09 historical residual (forward-only policy keeps this OPEN) | Low (analytics flag, not action) |
| P4 | GAP-MEM-1 (older handover docs reconciliation) | Informational |
