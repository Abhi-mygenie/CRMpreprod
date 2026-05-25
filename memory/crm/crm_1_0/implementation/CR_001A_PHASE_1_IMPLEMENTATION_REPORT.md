# CR-001A Phase 1 — Implementation Report

**CR:** CR-001A · Phase 1
**Title:** Forward-only realtime POS webhook alias fix (ISSUE-09)
**Date implemented:** 2026-05-22 04:23 UTC (commit `169051a`)
**Date closed live on prod:** **2026-05-22 09:10:46 UTC** (order `868899`)
**Final status:** ✅ **`cr001a_phase_1_closed_live_on_prod`**
**Scope owner decision:** Forward-only. No backfill. No historical mutation.

---

## 1. Objective

`POST /api/pos/orders` was silently dropping realtime order fields because the
POS payload contract used different names than the CRM Pydantic models:

| POS realtime field | CRM canonical field |
|---|---|
| `created_at` (top-level) | `order_created_at` |
| `items[].item_id` | `items[].pos_food_id` |
| `items[].qty` | `items[].item_qty` |
| `items[].price` | `items[].item_price` |

Because Pydantic v2 ignores unknown fields by default, realtime orders persisted
with `order_created_at = None`, `pos_food_id = None`, `item_qty = 1` (default),
`item_price = 0.0` (default) — losing item-level data.

Phase 1 fix: add bidirectional alias support so future realtime orders map
correctly, while keeping legacy CRM-name payloads working.

---

## 2. Code Changes

### Files touched
- `/app/backend/routers/pos.py` (only)

### Files explicitly NOT touched
- `/app/backend/routers/migration.py` (CR-001B Phase 2 — R689 sync in flight)
- `/app/backend/core/pos_request_logger.py` (CR-002)
- Frontend, database schema, env, auth, schedulers.

### Diff summary

**Imports (top of file):**
```python
from pydantic import BaseModel, ConfigDict, Field
from pydantic.aliases import AliasChoices
```

**`OrderItem` model (≈ lines 949–1016):**
```python
class OrderItem(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        coerce_numbers_to_str=True,
    )

    item_name: str
    pos_food_id: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("pos_food_id", "item_id"),
    )
    item_category: Optional[str] = None

    item_qty: int = Field(
        default=1,
        validation_alias=AliasChoices("item_qty", "qty"),
    )
    item_price: float = Field(
        default=0.0,
        validation_alias=AliasChoices("item_price", "price"),
    )
    # ... (all other existing fields unchanged)
```

`pos_food_id` widened from `Optional[int] → Optional[str]` to match the live
POS contract (e.g. `"2248345"`) and align with the `_coerce_pos_id`
convention used by CR-001B-fix Phase 2B.
`coerce_numbers_to_str=True` defensively accepts both `"2248345"` and `2248345`.

**`POSOrderWebhook` model (≈ lines 1019–1102):**
```python
class POSOrderWebhook(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    # ... pos_id, restaurant_id, order_id, cust_mobile, order_amount, etc. unchanged ...

    order_created_at: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("order_created_at", "created_at"),
    )
    order_updated_at: Optional[str] = None
    # ... items, notes, etc. unchanged ...
```

### Downstream persistence — unchanged
Lines 864, 883, 887, 888 of `pos.py` already read `order_data.order_created_at`,
`item.pos_food_id`, `item.item_qty`, `item.item_price` and write them to:
- `orders` collection — `order_created_at` field
- `order_items` collection — `pos_food_id`, `item_qty`, `item_price` fields

Because Pydantic now populates these canonical names from either alias, no
downstream code change was required.

---

## 3. Compatibility Matrix

| Incoming payload shape | Top-level | Item-level | Result |
|---|---|---|---|
| POS realtime (current MyGenie) | `created_at` | `item_id` / `qty` / `price` | ✅ persists correctly |
| Legacy CRM canonical | `order_created_at` | `pos_food_id` / `item_qty` / `item_price` | ✅ persists correctly |
| Mixed (any combination) | either | either | ✅ persists correctly |
| `item_id` sent as int | – | `7777` (int) | ✅ coerced to `"7777"` (str) |
| Item missing qty/price/id | – | absent | ✅ defaults: `1`, `0.0`, `None` |

---

## 4. Forward-Only Compliance (Owner Decision Recap)

| Rule | Status |
|---|---|
| No historical backfill | ✅ Not performed |
| No old realtime order recovery | ✅ Not performed (migration sync overwrote some rows but that is an unrelated, owner-driven action) |
| No mutation of old records by this CR | ✅ Not performed |
| No `item_data_lost` marker | ✅ Not added |
| No cleanup script | ✅ Not added |
| Only future incoming realtime orders affected | ✅ |

---

## 5. Deployment Timeline

| Time (UTC) | Event |
|---|---|
| 2026-05-22 04:23:38 | Code committed to `22-may` and `main` branches (`169051a`) |
| 2026-05-22 04:27:44 | Code present on this preview pod `/app/backend/routers/pos.py` |
| 2026-05-22 04:30:56 | This preview pod backend restarted → alias fix loaded in worker memory here |
| 2026-05-22 06:43:25 | First prod git pull / file update reported by ops |
| 2026-05-22 07:21-07:25 | First prod `pm2 restart` (id 2 `crm-backend`) — did not affect serving process |
| 2026-05-22 ~08:55+ | Subsequent prod `pm2 restart` of the actual serving worker (likely id 7 `pos-backend`) |
| **2026-05-22 09:10:46** | **Order `868899` arrives → first prod realtime order persisted with full alias mapping** ✅ |

---

## 6. Live Production Verification

Order `868899` was received via realtime webhook at the production pod
`crm.mygenie.online` and persisted with all four alias-keyed fields populated
correctly:

| Field | Payload (alias) | Persisted (canonical) | OK |
|---|---|---|---|
| `order_created_at` ← `created_at` | `"2026-05-22 14:40:13"` | `"2026-05-22 14:40:13"` | ✅ |
| `items[0].pos_food_id` ← `item_id` | `"2248427"` | `"2248427"` | ✅ |
| `items[0].item_qty` ← `qty` | `1` | `1` | ✅ |
| `items[0].item_price` ← `price` | `7888` | `7888.0` | ✅ |
| `items[1].pos_food_id` ← `item_id` | `"2248428"` | `"2248428"` | ✅ |
| `items[1].item_qty` ← `qty` | `1` | `1` | ✅ |
| `items[1].item_price` ← `price` | `25` | `25.0` | ✅ |

**7 / 7 PASS on production.**

Note: `room_info` and `associated_order_ids` from the same payload were
silently dropped (model gap — tracked under CR-001A Phase 2). `restaurant_id`
persisted as `None` (separate downstream-mapping miss — tracked as CR-001D).

---

## 7. Pydantic Version

- `pydantic==2.12.5` (per `/app/backend/requirements.txt`)
- `AliasChoices`, `ConfigDict(populate_by_name=True)`,
  `coerce_numbers_to_str=True` all supported.

---

## 8. Out of Scope (Tracked Elsewhere)

- **CR-001A Phase 2:** add `room_info` + `associated_order_ids` to
  `POSOrderWebhook` so room revenue & parent-order linkage stop being dropped.
- **CR-001B / CR-001C:** migration sync & related work.
- **CR-001D (new):** `orders.restaurant_id` persisting as `None` despite the
  payload sending it (downstream-mapping miss in pos.py `order_doc` build).
- **ISSUE-09 historical recovery:** explicitly declined by owner.
- **CR-002 logging:** untouched.

---

## 9. Final Status

**`cr001a_phase_1_closed_live_on_prod`**

Closed end-to-end on production at 2026-05-22 09:10:46 UTC.

See companion QA file:
`/app/memory/crm/crm_1_0/qa/CR_001A_PHASE_1_QA_REPORT.md`
