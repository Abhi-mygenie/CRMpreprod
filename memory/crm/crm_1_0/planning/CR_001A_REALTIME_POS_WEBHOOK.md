# CR-001A — Realtime POS Webhook Data Mapping

> **Status:** `cr001a_forward_only_fix_owner_decision_recorded` (2026-05-21 — backfill/cleanup explicitly removed from scope)
> **Sprint:** CRM 1.0
> **Priority:** **P0** (contains ISSUE-09 forward-only hotfix)
> **Parent:** CR-001 (see `CR_001_INDEX.md`)
> **Date:** 2026-05-21
> **Source findings:** `/app/memory/crm/crm_1_0/findings/ISSUE_09_POS_REALTIME_WEBHOOK_SCHEMA_MISMATCH.md`
> **Code surface:** `/app/backend/routers/pos.py` (`POSOrderWebhook`, `OrderItem`, `_find_or_create_customer`, `_save_order_and_transactions`)

---

## 1. Objective

Make the realtime POS webhook (`POST /api/pos/orders`) correctly ingest every field POS actually sends going forward, accurately update customer rollups on order ingestion, and (if feasible) prevent future silent field-drops via a schema-drift QA guard.

**Forward-only:** old broken realtime order/item data will **not** be recovered or mutated as part of this CR (owner decision 2026-05-21).

---

## 2. Scope

In scope:
- `POSOrderWebhook` and `OrderItem` Pydantic models (`/app/backend/routers/pos.py`) — add aliases for `item_id`/`qty`/`price`/`created_at`.
- Realtime POS webhook handler and helpers (`_find_or_create_customer`, `_save_order_and_transactions`) — Phase 1 locked items A1–A4.
- Customer-on-order running-total `$inc` writes (the realtime side; CRM manual side lives in CR-001C).
- Schema-drift QA guard (replay `pos_request_logs` through the model) — **if feasible**; stretch item, does not block the forward fix.
- Room / delivery address payload-contract decisions (Q10 / Q11).

Out of scope (owner decision 2026-05-21):
- ❌ Backfill of `pos_order_id=868862` from `pos_request_logs`.
- ❌ Marking the 16 unrecoverable realtime orders with `items[].item_data_lost`.
- ❌ Any historical correction script for pre-fix realtime orders.
- ❌ Any mutation of old `orders` / `order_items` data.

Out of scope (other sub-CRs):
- Migration script (`migration.py`) audit → **CR-001B**.
- Dashboard coupon stats, CRM manual points/wallet endpoints, Orders tab in UI → **CR-001C**.

---

## 3. Forward-only fix — ISSUE-09

Full root-cause and evidence in the findings doc. Summary:

| What POS sends | CRM schema (today) | Effect on future orders (after fix) |
|---|---|---|
| `created_at` (top-level) | `order_created_at` | will be captured via alias |
| `items[].item_id` | `pos_food_id` | will be captured via alias |
| `items[].qty` | `item_qty` | will be captured via alias |
| `items[].price` | `item_price` | will be captured via alias |

Old broken data (17 realtime orders from 2026-05-21 cohort, restaurants 478 / 523 / 675) remains as-is per owner decision.

### 3.1 Hotfix items — forward-only

| # | Item | File | Risk | Status |
|---|---|---|---|---|
| H1 | Add `validation_alias=AliasChoices(...)` for `pos_food_id`↔`item_id`, `item_qty`↔`qty`, `item_price`↔`price`, `order_created_at`↔`created_at`. Set `model_config = ConfigDict(populate_by_name=True)` on both models. | `pos.py` L948-1062 | Low (additive) | **IN SCOPE** |
| H2 | Possibly change `pos_food_id` type from `Optional[int]` → `Optional[str]` (POS captured value is `"2248345"` as a string). Confirm with one more captured payload. | `pos.py` L952 | Low | **IN SCOPE** |
| H3 | ~~Backfill exactly 1 order (`pos_order_id=868862`)~~ | ~~one-off script~~ | n/a | **REMOVED — owner decision 2026-05-21 (forward-only)** |
| H4 | Add schema-drift QA guard: replay last N `pos_request_logs.request_body` entries through `POSOrderWebhook(**body)` and assert `model_extra == {}`. Fail CI on drift. | `/app/backend/tests/test_pos_webhook_schema_drift.py` (new) | Low | **IN SCOPE (stretch, if feasible — does not block H1/H2)** |

> ~~The 16 unrecoverable realtime orders are addressed in CR-001B (mark as `item_data_lost`).~~ **REMOVED — owner decision 2026-05-21. Old realtime broken item data will remain as-is in DB; no marker, no cleanup.**

---

## 4. Phase 1 — Locked items (carried from CR-001 §19.2)

| # | Item | Issue | File | Status |
|---|---|---|---|---|
| A1 | `_find_or_create_customer`: on EVERY order ingest, `$set` customer's `updated_at` and `last_interaction_date` to ingest time. | ISSUE-02 | `pos.py` `_find_or_create_customer` (~L558) | LOCKED IN |
| A2 | `_save_order_and_transactions`: `$inc` `customers.total_points_earned` by `points_earned + off_peak_bonus + first_visit_bonus`, `$inc` `customers.total_wallet_used` by `wallet_used`. | ISSUE-03 | `pos.py` `_save_order_and_transactions` (~L871-915) | LOCKED IN — pairs with CR-001C item C1 |
| A3 | Customer name-update policy: in `_find_or_create_customer`, if existing `customer.name` is empty / null / matches `^Customer\s+\d+$` and POS sends non-empty `cust_name`, `$set` the real name. Idempotent. | ISSUE-NEW from Q3 (Q3=C) | `pos.py` `_find_or_create_customer` (~L558) | LOCKED IN |
| A4 | Write `is_veg` from `OrderItem.is_veg` into `order_items` docs. | ISSUE-01 (Q4=A) | `pos.py` `_save_order_and_transactions` (~L871-915) | LOCKED IN — verify in post-deploy log |

---

## 5. Phase 2 — Backlog (gated on owner answers)

| # | Item | Gate |
|---|---|---|
| A-P1 | Extend `POSOrderWebhook` with room info block (room_id, paid_room, guest fields per real payload). | Q10=B + one real room order captured |
| A-P2 | Delivery-address-on-order strategy. **Option B (default):** rely only on existing `POST /api/pos/customers/{id}/addresses`, do not change order webhook. **Option A:** request POS to add `address_id` + address fields on order webhook. **Option C (best-effort):** at ingest, copy customer's most-recently-used delivery address onto the order doc. | Q11 / Q11.1 |
| A-P3 | Raw-payload field gap audit for `dine-in`, `take_away`, `WalkIn`, `room` order types — capture one of each via realtime, diff payload keys vs schema after H1. | requires CR-002 logging on (already enabled) |
| A-P4 | Cross-API impact analysis: how delivery-address ingestion interacts with existing `POST /api/pos/customers/{id}/addresses` (dedup by `address+pincode`) and Scan & Order `POST /api/scan/addresses`. Confirm single source of truth on `customers.addresses[]`. | Q11=A or C |

---

## 6. Owner questions (CR-001A scope)

| Q# | Topic | Options | Recommended |
|---|---|---|---|
| **Q10** | Room schema timing | A) add now from POS docs; B) **wait for one real room payload**; C) add placeholder `room_info: dict` blob | **B** |
| **Q11** | Delivery address strategy given POS sends no address on order | A) override sprint rule, ask POS to add address fields on order; B) **no POS change, rely on existing `/api/pos/customers/{id}/addresses`**; C) defer to a follow-up CR | **B** (cleanest, zero POS change) |
| **Q11.1** | Snapshot address on order doc | a) best-effort copy from `customers.addresses[]` at ingest; b) require POS to send `address_id` + fields; c) leave `address_id = null` (status quo) | **(c)** if Q11=B, **(b)** if Q11=A |
| **Q12** | Authorize alias fix for `created_at`→`order_created_at`, `item_id`→`pos_food_id` | A) **add aliases (covered by H1)**; B) skip | **A** |
| **Q13** | Authorize ISSUE-09 fix scope | A) all H1–H4 (incl. backfill + marker); B) H1 only (forward-fix); C) open separate CR; D) verify with POS team first | **DECIDED 2026-05-21 → forward-only: H1 + H2 (in scope), H4 (stretch if feasible), H3 backfill removed, `item_data_lost` marker removed.** |

---

## 7. Test plan

### 7.1 Unit
- `POSOrderWebhook(**captured_payload_868862)` populates `order_created_at`, and `items[0]` has `pos_food_id="2248345"`, `item_qty=1`, `item_price=0.0`.
- `POSOrderWebhook(**legacy_payload_with_native_names)` still populates the same fields (alias accepts both).
- `OrderItem.model_extra` is empty for the captured payload.

### 7.2 Integration (curl)
- POST `/api/pos/orders` with a payload using `qty`/`price`/`item_id`/`created_at` → DB row has populated `item_qty`, `item_price`, `pos_food_id`, `order_created_at`.
- POST with legacy names → same DB outcome.
- POST with one unknown extra key → model_extra captured by CI guard; behavior unchanged.

### 7.3 Backfill verification
- **N/A — backfill removed from scope per owner decision 2026-05-21.** Old `pos_order_id=868862` will remain with `pos_food_id=null`, `item_qty=1`, `item_price=0.0`, `order_created_at=null`. Verify only that new orders ingested after H1 deploys are correct.

### 7.4 Forward-fix verification (replaces old "CI" step)
- After H1 deploys, place one realtime test order via POS → confirm DB row has populated `item_qty`, `item_price`, `pos_food_id`, `order_created_at`.
- If H4 (schema-drift QA guard) is included, it passes on the current `pos_request_logs` corpus.

---

## 8. Status

```
cr001a_forward_only_fix_owner_decision_recorded
```

Outstanding owner questions: Q10, Q11, Q11.1, Q12.
Q13 — **DECIDED 2026-05-21:** forward-only fix authorized; backfill (H3) and `item_data_lost` marker explicitly removed from scope.

Phase 1 items (A1–A4) are LOCKED and do not depend on Q10/Q11/Q11.1 — they can ship in the same release as the H1 (+ optional H2/H4) forward-fix bundle.

---

## 9. Change log

| Date | Change |
|---|---|
| 2026-05-21 | Initial CR-001A split out of CR-001. |
| 2026-05-21 | Owner decision: forward-only fix. H3 (backfill of 868862) removed from scope. `item_data_lost` marker on 16 unrecoverable orders removed from scope. Old realtime broken item data will remain in DB as-is. Status moved to `cr001a_forward_only_fix_owner_decision_recorded`. |
