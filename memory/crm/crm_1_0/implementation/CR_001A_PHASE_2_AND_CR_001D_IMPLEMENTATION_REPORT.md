# CR-001A Phase 2 + CR-001D — Implementation Report

**CRs:** CR-001A · Phase 2 (room_info + associated_order_ids) **and** CR-001D (orders.restaurant_id = None)
**Date implemented:** 2026-05-22 ~10:05 UTC (preview pod `agent-env-ae71b207-64bc-…`)
**Forward-only:** YES — same policy as CR-001A Phase 1
**Depends on:** CR-001A Phase 1 (closed live on prod 2026-05-22 09:10:46 UTC)
**Final status:** ✅ **`cr001a_phase_2_and_cr001d_implementation_complete`**

---

## 1. Executive Summary

Two adjacent forward-only fixes were implemented in a single PR to
`/app/backend/routers/pos.py`:

1. **CR-001A Phase 2** — extends `POSOrderWebhook` so realtime POS payloads
   `room_info` (hotel/room billing breakdown) and `associated_order_ids`
   (parent/linked order ids) are no longer silently dropped by Pydantic.
   Both fields are now persisted on the `orders` document for **future**
   realtime orders only.
2. **CR-001D** — one-line addition to the `order_doc` build inside
   `_save_order_and_transactions(...)` so the canonical `restaurant_id`
   field is persisted on `orders` alongside the existing `pos_restaurant_id`
   (which is preserved for backwards compatibility).

No historical mutation. No backfill. No migration changes. No CR-002
changes. R689 sync untouched.

---

## 2. Accepted Baseline

- **CR-001A Phase 1:** `cr001a_phase_1_closed_live_on_prod` (order `868899`,
  7/7 alias checks at 2026-05-22 09:10:46 UTC).
- **Forward-only rule (owner):** no historical backfill, no
  `item_data_lost` marker, no mutation of pre-fix `orders` / `order_items`,
  no cleanup script.
- **R689:** `pos_0001_restaurant_689 / order_sync` status `running`, page
  145/329, 0 failures — recorded before and verified unchanged after the
  preview-pod restart.

---

## 3. Blocker Review

| Blocker | Evidence | Fix Implemented | File | Status |
|---|---|---|---|---|
| CR-001A Phase 2 — `room_info` silently dropped | Order `868899` payload `room_info={room_price:"7888.00",advance_payment:"888.00",balance_payment:"7000.00"}` → `orders.room_info = null`. ₹7888 room revenue lost. | New nested `RoomInfo` Pydantic model + `room_info: Optional[RoomInfo]` on `POSOrderWebhook` + write to `order_doc["room_info"]` (None when payload is empty `{}`) | `/app/backend/routers/pos.py` | ✅ Implemented |
| CR-001A Phase 2 — `associated_order_ids` silently dropped | Order `868899` payload `associated_order_ids=[868891]` → `orders` had no field. | `associated_order_ids: Optional[List[str]]` + `@field_validator(mode="before")` coercing `List[int] → List[str]` to match `pos_food_id` string convention; written to `order_doc["associated_order_ids"]`. | `/app/backend/routers/pos.py` | ✅ Implemented |
| CR-001D — `orders.restaurant_id` always `None` | Same order `868899`: payload `restaurant_id="478"`, persisted as `None`. | Added `"restaurant_id": order_data.restaurant_id` to the `order_doc` dict inside `_save_order_and_transactions(...)`. `pos_restaurant_id` preserved. | `/app/backend/routers/pos.py` | ✅ Implemented |

No business interpretation beyond the captured payload was required.
`RoomInfo` schema matches the spec verbatim (`room_price`,
`advance_payment`, `balance_payment`).

---

## 4. Files Changed

| File | Change | Reason |
|---|---|---|
| `/app/backend/routers/pos.py` | + `field_validator` import (line 2) · + new `RoomInfo` class (above `POSOrderWebhook`) · + 2 new fields + 1 validator on `POSOrderWebhook` · + `restaurant_id` key in `order_doc` · + `room_info` key in `order_doc` (None when all sub-fields None) · + `associated_order_ids` key in `order_doc` | CR-001A Phase 2 + CR-001D, single PR, ~70 lines added |

Files explicitly NOT touched (verified via `git diff --stat`):

- `/app/backend/routers/migration.py` — CR-001B / R689 in flight
- `/app/backend/core/pos_request_logger.py` — CR-002 logging
- `/app/backend/models/schemas.py`
- Frontend, env, supervisor, auth, schedulers, helpers, whatsapp

---

## 5. Mapping Added

| Payload Field | Type In | Stored Field | Type Out | Notes |
|---|---|---|---|---|
| `room_info` | nested object with STRING decimals (e.g. `"7888.00"`) | `orders.room_info` | nested dict `{room_price: float, advance_payment: float, balance_payment: float}` or `None` | Pydantic 2.x coerces string decimals to float. Empty `{}` payload → persisted as `None` (per spec Section 5/6 — keep non-room rows compact). |
| `associated_order_ids` | `List[int]` (POS contract) | `orders.associated_order_ids` | `List[str]` or `None` or `[]` | Element-wise coerced to `str` via `@field_validator(mode="before")` to align with `pos_food_id` string-only convention (CR-001B-fix Phase 2B). |
| `restaurant_id` | `str` (e.g. `"478"`) | `orders.restaurant_id` | `str` | Adds canonical key. Existing `orders.pos_restaurant_id` is preserved unchanged. |

---

## 6. Forward-Only Confirmation

- ✅ No backfill performed.
- ✅ No historical `orders` / `order_items` rows mutated.
- ✅ No `item_data_lost` (or analogue) marker added.
- ✅ No cleanup script.
- ✅ No migration sync triggered.
- ✅ Only **future** realtime POS orders sent to `POST /api/pos/orders`
      will carry the new fields.

---

## 7. R689 Runtime Safety

| Check | Before code change | After code change + preview-pod backend restart |
|---|---|---|
| `pos_0001_restaurant_689 / order_sync` row | running, page 145/329, synced 347, updated 3278, failed 0, started 2026-05-22T03:44:37Z | **unchanged** — running, page 145/329, synced 347, updated 3278, failed 0 |
| `migration.py` modified | no | no |
| Migration sync run from this session | no | no |

R689 is executed on the **production pod**, not this preview pod. Restarting
this preview pod's uvicorn worker (`sudo supervisorctl restart backend`)
does not affect the prod R689 process. Verified by re-reading
`migration_sync_logs` from shared Mongo: identical row, identical counters.

Backend restart reason: model classes are built at import time; the new
`RoomInfo` + extended `POSOrderWebhook` are loaded into the live worker
only after restart. Same lesson as Phase 1.

---

## 8. Checks Run

| Check | Result |
|---|---|
| `ruff` lint on `/app/backend/routers/pos.py` | ✅ All checks passed |
| Backend import (`from routers.pos import OrderItem, POSOrderWebhook, RoomInfo`) | ✅ OK |
| Backend `supervisorctl status` | ✅ `backend RUNNING`, `frontend RUNNING`, `mongodb RUNNING` |
| `GET /api/health` after restart | ✅ `{"status":"healthy"}` |
| Phase 1 verifier `cr_001a_check.sh /app` Step 3 (model alias contract) | ✅ all four AliasChoices present |
| Phase 1 verifier Step 4 (live HTTP probe) | ✅ HTTP 401 — schema accepted, auth rejected |
| Phase 2 live HTTP probe (room_info + associated_order_ids in payload) | ✅ HTTP 401 — schema accepted, auth rejected |
| Static QA harness `/tmp/cr_001a_phase2_qa.py` | ✅ 12 / 12 PASS |
| Order-doc build harness `/tmp/cr_001a_phase2_order_doc_qa.py` (motor monkey-patched) | ✅ 9 / 9 PASS |
| `git diff --stat` confirms only `backend/routers/pos.py` changed | ✅ 1 file, 70 insertions, 1 deletion |

---

## 9. Code Snippets

### 9.1 `RoomInfo` model (new)

```python
class RoomInfo(BaseModel):
    """Hotel / room billing breakdown attached to a POS order.

    CR-001A Phase 2 (forward-only, 2026-05-22):
      Source: realtime POS payload `room_info`. Fields arrive as STRING
      decimals (e.g. "7888.00"); Pydantic 2.x coerces them to float.
      All sub-fields are Optional so non-room orders sending empty {} still
      parse (we then persist None at order_doc build time to keep
      non-room rows compact).
    """
    model_config = ConfigDict(populate_by_name=True)

    room_price: Optional[float] = None
    advance_payment: Optional[float] = None
    balance_payment: Optional[float] = None
```

### 9.2 `POSOrderWebhook` additions

```python
    # CR-001A Phase 2 — room/hotel billing breakdown (forward-only, 2026-05-22)
    room_info: Optional[RoomInfo] = None

    # CR-001A Phase 2 — parent/linked order ids from POS (forward-only)
    # POS sends List[int] (e.g. [868891]); we coerce to List[str] to align
    # with the pos_food_id string-only convention.
    associated_order_ids: Optional[List[str]] = None

    @field_validator("associated_order_ids", mode="before")
    @classmethod
    def _coerce_associated_order_ids(cls, v):
        if v is None:
            return None
        if isinstance(v, list):
            return [str(x) for x in v if x is not None]
        return v
```

### 9.3 `order_doc` additions (inside `_save_order_and_transactions`)

```python
# POS Identification
"pos_id": order_data.pos_id,
"pos_restaurant_id": order_data.restaurant_id,
# CR-001D (2026-05-22 forward-only): also persist canonical
# `restaurant_id` so restaurant-level filtering / analytics on `orders`
# no longer relies on user_id → users.restaurant_id lookup.
# Preserves `pos_restaurant_id` above for backwards compatibility.
"restaurant_id": order_data.restaurant_id,
...
# CR-001A Phase 2 (2026-05-22 forward-only) — room/hotel billing
# breakdown. Empty `{}` payload → all sub-fields None → persist as
# None to keep non-room orders compact.
"room_info": (
    order_data.room_info.model_dump()
    if order_data.room_info
    and any(
        v is not None
        for v in (
            order_data.room_info.room_price,
            order_data.room_info.advance_payment,
            order_data.room_info.balance_payment,
        )
    )
    else None
),

# CR-001A Phase 2 (2026-05-22 forward-only) — parent/linked order ids
# from POS. Already coerced to List[str] by validator.
"associated_order_ids": order_data.associated_order_ids,
```

---

## 10. Out of Scope (confirmed not touched)

- `migration.py` (CR-001B / R689 sync)
- `core/pos_request_logger.py` (CR-002)
- WhatsApp / coupon / wallet / loyalty / dashboard / frontend
- Historical row mutation, backfill, cleanup, markers

---

## 11. Final Implementation Status

**`cr001a_phase_2_and_cr001d_implementation_complete`**

Static + order-doc-build QA passes 21/21. Live route accepts the new
schema. Awaiting real production POS room order arrival for end-to-end
live closure (preview pod is configured but production deployment +
`pos-backend` (pm2 id 7) restart on `crm.mygenie.online` are owner-driven
as per Phase 1 lesson).

Live target status after prod deploy + real room order:
`cr001a_phase_2_and_cr001d_closed_live_on_prod`

See companion QA file:
`/app/memory/crm/crm_1_0/qa/CR_001A_PHASE_2_AND_CR_001D_QA_REPORT.md`
