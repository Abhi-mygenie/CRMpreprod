# CR-001A — Realtime POS Webhook Data Mapping

> **Status:** `cr001a_waiting_owner_answers`
> **Sprint:** CRM 1.0
> **Priority:** **P0** (contains ISSUE-09 production hotfix)
> **Parent:** CR-001 (see `CR_001_INDEX.md`)
> **Date:** 2026-05-21
> **Source findings:** `/app/memory/crm/crm_1_0/findings/ISSUE_09_POS_REALTIME_WEBHOOK_SCHEMA_MISMATCH.md`
> **Code surface:** `/app/backend/routers/pos.py` (`POSOrderWebhook`, `OrderItem`, `_find_or_create_customer`, `_save_order_and_transactions`)

---

## 1. Objective

Make the realtime POS webhook (`POST /api/pos/orders`) correctly ingest every field POS actually sends, accurately update customer rollups on order ingestion, and prevent future silent field-drops via a CI guard.

---

## 2. Scope

In scope:
- `POSOrderWebhook` and `OrderItem` Pydantic models (`/app/backend/routers/pos.py`).
- Realtime POS webhook handler and helpers (`_find_or_create_customer`, `_save_order_and_transactions`).
- Customer-on-order running-total `$inc` writes (the realtime side; CRM manual side lives in CR-001C).
- Schema-drift CI guard (replay `pos_request_logs` through the model).
- Backfill of the 1 recoverable realtime order (`868862`) from `pos_request_logs.request_body`.
- Room / delivery address payload-contract decisions (Q10 / Q11).

Out of scope (other sub-CRs):
- Migration script (`migration.py`) audit → **CR-001B**.
- The 16 unrecoverable realtime orders' marker rollout → **CR-001B**.
- Dashboard coupon stats, CRM manual points/wallet endpoints, Orders tab in UI → **CR-001C**.

---

## 3. P0 Hotfix — ISSUE-09 (Phase 1.5)

Full root-cause and evidence in the findings doc. Summary:

| What POS sends | CRM schema (today) | Effect |
|---|---|---|
| `created_at` (top-level) | `order_created_at` | silently dropped → `null` |
| `items[].item_id` | `pos_food_id` | silently dropped → `null` |
| `items[].qty` | `item_qty` | silently dropped → `1` (default) |
| `items[].price` | `item_price` | silently dropped → `0.0` (default) |

DB impact (snapshot at investigation):

| Path | Items | Items with `item_price=0` |
|---|---:|---:|
| Migration (`mygenie_synced=true`) | 36,716 | 49 (~0.13%) ✅ |
| Realtime `/api/pos/orders` | 23 | 22 (~96%) 🚨 |

### 3.1 Hotfix items

| # | Item | File | Risk |
|---|---|---|---|
| H1 | Add `validation_alias=AliasChoices(...)` for `pos_food_id`↔`item_id`, `item_qty`↔`qty`, `item_price`↔`price`, `order_created_at`↔`created_at`. Set `model_config = ConfigDict(populate_by_name=True)` on both models. | `pos.py` L948-1062 | Low (additive) |
| H2 | Possibly change `pos_food_id` type from `Optional[int]` → `Optional[str]` (POS captured value is `"2248345"` as a string). Confirm with one more captured payload. | `pos.py` L952 | Low |
| H3 | Backfill exactly 1 order (`pos_order_id=868862`) by re-parsing its `pos_request_logs.request_body` and updating `orders.items[]` + `order_created_at`. | one-off script | Low (single doc) |
| H4 | Add schema-drift CI test: replay last N `pos_request_logs.request_body` entries through `POSOrderWebhook(**body)` and assert `model_extra == {}`. Fail CI on drift. | `/app/backend/tests/test_pos_webhook_schema_drift.py` (new) | Low |

> The 16 unrecoverable realtime orders are addressed in **CR-001B** (mark as `item_data_lost`).

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
| **Q13** | Authorize full ISSUE-09 hotfix (H1–H4) | A) **authorize all**; B) H1 only (forward-fix); C) open separate CR-006; D) verify with POS team first | **A** |

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
- After running H3, `orders.find_one({"pos_order_id":"868862"})` shows `items[0].pos_food_id="2248345"`, `item_qty=1`, `item_price=0.0`, `order_created_at="2026-05-21 14:59:10"`.

### 7.4 CI
- Schema-drift test (H4) passes on current `pos_request_logs`.

---

## 8. Status

```
cr001a_waiting_owner_answers
```

Outstanding: Q10, Q11, Q11.1, Q12, Q13.

Phase 1 items (A1–A4) are LOCKED and do not depend on Q10/Q11/Q11.1 — they can ship in the same release as the H1–H4 hotfix bundle once Q13 = A.
