# CR-001B — Historical / Migration Data Audit

> **Status:** `cr001b_audit_scope_to_confirm`
> **Sprint:** CRM 1.0
> **Priority:** P2 (no known live customer impact; audit-only)
> **Parent:** CR-001 (see `CR_001_INDEX.md`)
> **Date:** 2026-05-21
> **Code surface:** `/app/backend/routers/migration.py` (`background_order_sync`) + historical `orders` / `customers` / `order_items` collections.
> **Companion:** `CR_001A_REALTIME_POS_WEBHOOK.md` (defines markers used here)

---

## 1. Objective

Independently verify that the migration ingestion path (`background_order_sync` pulling from MyGenie REST API) is mapping every field consumed downstream, and clean up the 16 unrecoverable realtime orders surfaced by ISSUE-09.

This CR is **audit-first, fix-second** — no migration code change is authorized until the audit produces a written gap list reviewed by the owner.

---

## 2. Scope

In scope:
- Read-only audit of `/app/backend/routers/migration.py` `background_order_sync` (L17–176) field mapping against:
  - the MyGenie REST API response shape (sample one live response)
  - the current `POSOrderWebhook` / `OrderItem` schema (with CR-001A H1 aliases applied)
  - every field consumed by CRM dashboards, analytics, customer detail UI, and Phase 1 logic from CR-001A and CR-001C
- One-shot data-quality scan of historical orders to flag any with missing fields that the realtime path will (after CR-001A H1) populate.
- Mark the 16 unrecoverable realtime orders (placed before CR-002 logging was enabled) so they are excluded from item-level reports.
- Decide the future of the migration path: keep as primary historical backfill or sunset.

Out of scope:
- Any change to realtime ingestion → **CR-001A**.
- Any UI / analytics work → **CR-001C**.
- New migration features (only audit + cleanup).

---

## 3. Inputs

| Input | Source |
|---|---|
| Migration code path | `/app/backend/routers/migration.py` L17–176 |
| MyGenie REST response (sample) | needs one live sample captured — owner action item |
| Realtime POS payload (sample) | `pos_request_logs` order `868862` (already captured) |
| CRM consumer set | `services/analytics_service.py`, `routers/customers.py`, `routers/points.py`, `routers/wallet.py`, frontend `CustomerDetailPage.jsx`, Dashboard |

---

## 4. Audit checklist

For each field consumed downstream, confirm: (a) realtime sends it, (b) migration sets it, (c) names match.

### 4.1 Order-level fields

| Field | Realtime sends? | Migration sets? | Notes |
|---|---|---|---|
| `pos_order_id` | yes (`order_id`) | yes | ✓ |
| `pos_restaurant_id` | yes (`restaurant_id`) | yes | ✓ |
| `pos_id` | yes | yes | ✓ |
| `cust_mobile`, `cust_name`, `cust_email` | partial (no email) | yes | confirm consistency |
| `order_amount` | yes | yes | ✓ |
| `order_type` | yes (`delivery`/`dinein`/`take_away`/`WalkIn`/...) | needs check — does MyGenie API return same vocabulary? | **AUDIT-O1** |
| `payment_method` / `payment_status` / `payment_type` | sometimes | needs check | **AUDIT-O2** |
| `tax_amount`, `gst_tax`, `vat_tax`, `service_tax`, `tip_amount`, `delivery_charge`, `coupon_discount`, `wallet_used` | not seen in captured payload yet | needs check | **AUDIT-O3** — likely partially populated |
| `order_created_at` | yes (after CR-001A H1) — POS field `created_at` | yes (migration sets `order_created_at` directly) | ✓ after H1 |
| `address_id`, `room_id`, `paid_room` | no (POS sends none) | no | gated on CR-001A Q11/Q10 |
| `mygenie_synced`, `last_synced_at` | not set | set | distinguishes paths — **keep as-is** |
| `source` / `ingestion_path` field | not set | not set | **AUDIT-O4** — propose adding `ingestion_source: "realtime" \| "migration"` as a non-breaking marker. Optional. |

### 4.2 Item-level fields

| Field | Realtime sends? | Migration sets? | Notes |
|---|---|---|---|
| `item_name` | yes | yes | ✓ |
| `pos_food_id` | yes (`item_id`, after CR-001A H1) | yes (from `food_details.id`) | type drift — realtime captured value is a string `"2248345"`, migration uses `food_details.get("id")` which may be int. **AUDIT-I1** — confirm; standardize to `str` |
| `item_qty` | yes (`qty`, after CR-001A H1) | yes (from `quantity`) | ✓ |
| `item_price` | yes (`price`, after CR-001A H1) | yes (from `price` or `unit_price`) | ✓ |
| `item_category` | not seen | needs check | **AUDIT-I2** |
| `variant`, `variations`, `add_ons`, `add_on_ids`, `add_on_qtys` | not seen in 868862 (single-item combo) | needs check | **AUDIT-I3** — likely only populated when actually present |
| `gst_amount`, `vat_amount`, `discount_amount`, `service_charge` | not seen | needs check | **AUDIT-I4** |
| `is_veg` | not seen yet | needs check | **AUDIT-I5** — CR-001A A4 writes `is_veg` to `order_items` from realtime; migration must do the same for parity |
| `station`, `item_type`, `food_status`, `ready_at`, `serve_at`, `cancel_at` | not seen | needs check | **AUDIT-I6** — operational fields, lower priority |
| `item_notes` | not seen | needs check | **AUDIT-I7** |

### 4.3 Customer-level fields (touched by migration's auto-create)

| Field | Realtime path | Migration path | Notes |
|---|---|---|---|
| `total_orders` | $inc on realtime | needs check — does migration aggregate over imported orders? | **AUDIT-C1** |
| `total_amount_spent` | $inc on realtime | needs check | **AUDIT-C2** |
| `last_order_date` / `last_interaction_date` / `updated_at` | set on realtime (CR-001A A1) | needs check | **AUDIT-C3** |
| `total_points_earned`, `total_wallet_used` | $inc on realtime (CR-001A A2) | needs check — migration should set these to the sum of awarded points / wallet uses across imported orders | **AUDIT-C4** |
| `addresses[]` | populated via `POST /api/pos/customers/{id}/addresses` | needs check — does migration backfill addresses from MyGenie? | **AUDIT-C5** |

---

## 5. Cleanup workstream — 16 unrecoverable realtime orders

ISSUE-09 surfaced 17 realtime orders placed on 2026-05-21. Only `pos_order_id=868862` has its raw payload in `pos_request_logs` (the rest were placed before CR-002 logging was enabled on production).

### 5.1 Affected order list (to be re-extracted at execution time)

Filter: `mygenie_synced != true` AND `created_at` between `2026-05-21T00:00:00Z` and the deployment time of CR-001A H1, EXCLUDING `pos_order_id = 868862`.

Restaurants impacted: `478`, `523`, `675`.

### 5.2 Cleanup options for owner (Q15)

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | **Mark items with `item_data_lost: true`** on each affected `orders.items[]`, leave `order_amount` intact | reporting layers can filter out lost data; no data loss to non-item fields | dashboards must respect the flag |
| B | Delete `orders.items[]` entirely on affected orders (keep parent order doc) | item-level reports automatically skip | irreversible; loses `item_name` which IS captured correctly |
| C | Leave as-is (current state) | no-op | item-level reports will report wrong revenue mix until manually filtered |
| D | Re-fetch the 16 orders from MyGenie REST API (same path as migration) to repopulate items | best data fidelity if MyGenie has them | creates two ingestion paths writing to the same order docs; ordering and idempotency risk |

Recommended: **A** (lowest risk, recoverable).

---

## 6. Open questions (CR-001B scope)

| Q# | Topic | Options | Recommended |
|---|---|---|---|
| **Q14** | Audit depth | A) AUDIT-O1..O4 + AUDIT-I1..I7 + AUDIT-C1..C5 (full); B) order + customer only, skip item-level operational fields (skip AUDIT-I6/I7); C) item-level audit only | **A** (do it once, do it right) |
| **Q15** | Cleanup of 16 unrecoverable orders | A) mark `item_data_lost`; B) delete `items[]`; C) leave; D) re-fetch from MyGenie | **A** |
| **Q14.1** | After audit, who fixes migration gaps? | a) reopen migration code in same CR; b) split a CR-001B-fix sub-CR after audit completes; c) accept gaps and document only | **b** (avoids scope creep) |

---

## 7. Deliverables

1. Written audit report at `/app/memory/crm/crm_1_0/findings/CR_001B_MIGRATION_AUDIT_REPORT.md` listing every AUDIT-* item with **finding** (pass / gap / unknown), **evidence query**, and **proposed fix** (no code change).
2. One-time cleanup migration applied to the 16 affected realtime orders per Q15 outcome.
3. (Conditional) Follow-up CR proposal if Q14.1 = b.

---

## 8. Test plan (lightweight — audit is read-only)

- For each AUDIT-* item, run an aggregation query and record sample IDs.
- For cleanup: spot-check 2 of the 16 orders before and after; verify the cleanup is idempotent (running twice yields identical state).
- Confirm `mygenie_synced=true` orders are untouched by the cleanup.

---

## 9. Status

```
cr001b_audit_scope_to_confirm
```

Outstanding: Q14, Q14.1, Q15.

Independent of CR-001A and CR-001C — can start as soon as Q14/Q14.1/Q15 are answered.
