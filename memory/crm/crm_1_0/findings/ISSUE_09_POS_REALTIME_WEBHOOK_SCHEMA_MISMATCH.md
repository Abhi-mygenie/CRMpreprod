# ISSUE-09 — POS Realtime Webhook ↔ CRM Schema Mismatch

> **Type:** P0 Production Data Quality Bug (long-standing, newly visible)
> **Discovered:** 2026-05-21 — via first ever live `/api/pos/orders` payload capture
> **Discovered by:** CR-001 planning continuation (raw payload investigation)
> **Status:** Open — awaiting owner authorization for hotfix (Q13)
> **Related:** CR-001 §20, §21 of `/app/memory/crm/crm_1_0/planning/CR_001_ORDER_DATA_MAPPING_PLAN.md`

---

## 1. TL;DR

CRM's realtime POS webhook handler (`POST /api/pos/orders`) has **always** used Pydantic field names that do not match what POS actually sends in production. Pydantic silently drops the unknown fields, so item-level revenue, qty, food id, and the POS-side order timestamp are lost on every realtime order.

The bug was invisible until 2026-05-21 because all historical orders were populated by the **migration script** (`background_order_sync`), which side-steps the Pydantic model and maps fields itself. Live realtime traffic only began at scale on 2026-05-21, exposing the bug.

**This is NOT a recent POS contract change.** It is a CRM-side schema-name choice that never aligned with POS.

---

## 2. Evidence

### 2.1 First live raw payload captured (order 868862)

```json
{
  "order_id": "868862",
  "restaurant_id": "478",
  "pos_id": "0001",
  "cust_name": "abhishek",
  "cust_mobile": "8888888866",
  "table_id": "",
  "table_name": "",
  "waiter_id": "",
  "waiter_name": "",
  "order_type": "delivery",
  "order_amount": 0,
  "created_at": "2026-05-21 14:59:10",
  "items": [
    { "item_id": "2248345", "item_name": "hokage", "qty": 1, "price": 0 }
  ]
}
```

Captured at `2026-05-21T10:09:56.560238+00:00` from production (`crm.mygenie.online`), authenticated via `X-API-Key` → `pos_0001_restaurant_478`, response `200 success`.

### 2.2 Field-name mismatch

| What POS sends | What CRM `POSOrderWebhook` / `OrderItem` expects (`/app/backend/routers/pos.py` L948-1062) | Pydantic outcome (`extra="ignore"` default) |
|---|---|---|
| `created_at` (top-level, e.g. `"2026-05-21 14:59:10"`) | `order_created_at` | silently dropped → `order_created_at = null` |
| `items[].item_id` | `pos_food_id` | silently dropped → `pos_food_id = null` |
| `items[].qty` | `item_qty` | silently dropped → `item_qty = 1` (default) |
| `items[].price` | `item_price` | silently dropped → `item_price = 0.0` (default) |
| `order_id` → mapped to `pos_order_id` | already aliased ✅ | works |
| `cust_name`, `cust_mobile`, `restaurant_id`, `pos_id`, `order_type`, `order_amount`, `table_id`, `waiter_id`, `item_name` | direct match ✅ | works |

### 2.3 Why the bug was invisible until 2026-05-21

Historical orders were created by `/app/backend/routers/migration.py` `background_order_sync` (L17-176), which pulls from MyGenie's REST API and constructs the order dict directly:

```python
# migration.py L144-149
order_doc["items"].append({
    "pos_food_id": food_details.get("id"),
    "item_qty": item.get("quantity", 1),
    "item_price": float(item.get("price") or item.get("unit_price") or 0),
})
```

The Pydantic `POSOrderWebhook` model is never invoked on the migration path → no silent drops → historical items have correct prices, qtys, and food ids.

Live realtime `/api/pos/orders` traffic only began at scale on 2026-05-21 (restaurants 478, 523, 675).

### 2.4 Quantified blast radius (DB snapshot at investigation time)

| Ingestion path | Total items | Items with `item_price = 0` |
|---|---:|---:|
| Migration (`mygenie_synced=true`, mapping in `migration.py`) | 36,716 | 49 (~0.13%) ✅ correct |
| **Realtime webhook** `/api/pos/orders` (no `mygenie_synced` flag) | **23** | **22 (~96%)** 🚨 broken |

All 23 realtime items came from 17 realtime orders, all on `2026-05-21`, across restaurants `478`, `523`, `675`.

---

## 3. Affected fields per realtime order

| Field on `orders` doc | Value before fix | Value POS actually sent |
|---|---|---|
| `items[].item_price` | `0.0` (Pydantic default) | actual line price |
| `items[].item_qty` | `1` (Pydantic default) | actual line qty |
| `items[].pos_food_id` | `null` | POS food id (e.g. `"2248345"`) |
| `order_created_at` | `null` | POS-side timestamp (e.g. `"2026-05-21 14:59:10"`) |

### Not affected (these still work correctly on realtime)

- `orders.order_amount` (POS sends `order_amount` matching schema)
- `orders.items[].item_name`
- Customer auto-create, first-visit bonus, points, wallet, tier — all driven off `order_amount`, not items.
- All non-item top-level fields whose names already match.

---

## 4. Recommended remediation

### 4.1 Hotfix (Phase 1.5 — minimal, additive, safe)

1. **Add Pydantic validation aliases** on `POSOrderWebhook` and `OrderItem` in `/app/backend/routers/pos.py`:

   ```python
   from pydantic import BaseModel, Field, ConfigDict, AliasChoices

   class OrderItem(BaseModel):
       model_config = ConfigDict(populate_by_name=True)
       item_name: str
       pos_food_id: Optional[str] = Field(default=None, validation_alias=AliasChoices("pos_food_id", "item_id"))
       item_qty: int = Field(default=1, validation_alias=AliasChoices("item_qty", "qty"))
       item_price: float = Field(default=0.0, validation_alias=AliasChoices("item_price", "price"))
       # ... rest unchanged

   class POSOrderWebhook(BaseModel):
       model_config = ConfigDict(populate_by_name=True)
       # ... existing fields ...
       order_created_at: Optional[str] = Field(default=None, validation_alias=AliasChoices("order_created_at", "created_at"))
   ```

   Note: `pos_food_id` type may need to change from `Optional[int]` to `Optional[str]` since POS sends `"2248345"` as a string. Confirm with one more captured payload.

2. **One-off backfill** — only 1 realtime order has its raw payload (`pos_order_id=868862` in `pos_request_logs`). Re-parse it and update its `orders.items[]` to populate `pos_food_id`, `item_qty`, `item_price`, plus top-level `order_created_at`.

3. **Mark the 16 unrecoverable orders** — set `items[].item_data_lost = true` on the other 16 realtime orders (placed before CR-002 logging was enabled, so their raw payloads are gone). This keeps dashboards honest.

4. **Add a schema-drift CI test** — replay the last N `pos_request_logs.request_body` entries through `POSOrderWebhook(**body)` and assert `model_extra` is empty. Prevents recurrence on any future POS contract additions.

### 4.2 Operational follow-ups

- Keep `POS_REQUEST_LOGGING_ENABLED=true` on production at least until §4.1 step 4 is in place.
- Capture one each of: `take_away`, `dinein`, `WalkIn`, and (if possible) `room/hotel` realtime orders to confirm no other silent-drop fields exist for those order types.
- Document POS's actual field-name contract in `/app/memory/crm/crm_1_0/POS_REALTIME_WEBHOOK_CONTRACT.md` (new doc, owner-approved).

---

## 5. Related Q11 finding — delivery address

The same captured payload also resolved the long-standing Q11 / ISSUE-07:

- POS sends **zero address data** on `/api/pos/orders` for a `delivery` order — no `address_id`, no `address`, no `pincode`, no `city`, no `lat/lng`.
- POS calls `POST /api/pos/address-lookup` (body: `{phone}`) **~55 seconds before** placing the order — this is the read-side flow for the POS UI to show saved addresses. POS lets the operator pick one but does **not** push that selection back to CRM with the order.
- Net effect today: `orders.address_id` is permanently `null` for **all 273/273 delivery orders** (272 historical + 1 today).

Implication: there is no zero-POS-change path that puts the operator-selected delivery address onto the order doc. The owner's three options for Q11 (and the new Q11.1) are documented in CR-001 §20.5.

---

## 6. Owner decisions pending

| Q# | Topic | Recommended |
|---|---|---|
| **Q10** | Room schema timing — wait for one real room payload? | B (wait) |
| **Q11** | Delivery address strategy given POS sends no address data on order | B (no POS change; rely on existing `POST /api/pos/customers/{id}/addresses`) or A (request POS to add address fields on order) |
| **Q11.1** | Snapshot address on order doc | (a) best-effort copy from `customers.addresses[]` at ingest, (b) require POS to send, (c) leave null |
| **Q12** | Authorize alias fix for `created_at`→`order_created_at` and `item_id`→`pos_food_id` | A (add aliases) |
| **Q13** | Authorize full hotfix for ISSUE-09 (§4.1 steps 1–4) | A (authorize all) |

---

## 7. Change log

| Date | Author | Change |
|---|---|---|
| 2026-05-21 | CR-001 planning continuation | Initial document. Findings derived from live capture of order 868862 and DB-wide aggregation across `orders` (`pos_request_logs.id`, `mygenie_synced` flag, item-level price/qty distribution). |
