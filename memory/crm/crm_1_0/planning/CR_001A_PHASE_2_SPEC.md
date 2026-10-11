# CR-001A Phase 2 — `room_info` + `associated_order_ids` Forward Fix

**CR:** CR-001A · Phase 2
**Title:** Capture `room_info` and `associated_order_ids` on realtime POS webhook
**Status:** DRAFT (not started)
**Forward-only:** YES — same policy as Phase 1
**Depends on:** CR-001A Phase 1 (closed live on prod 2026-05-22 09:10:46 UTC)

---

## 1. Problem

The current `POSOrderWebhook` model (post-Phase 1) accepts the realtime
contract correctly for `created_at`, `item_id`, `qty`, `price`, **but two
revenue-critical fields are still silently dropped**:

| POS field | Type | Observed in production payload |
|---|---|---|
| `room_info` | object | `{"room_price":"7888.00","advance_payment":"888.00","balance_payment":"7000.00"}` (order `868899`) |
| `associated_order_ids` | array of int | `[868891]` (order `868899`); `[868882]` (order `868866`); `[868877]` (order `868876`) |

Both keys are silently ignored by Pydantic v2 because the model has no
corresponding fields. Result:

- `orders.room_info = null` for every room/hotel order → room revenue not
  visible on the `orders` row (must be reconstructed from raw
  `pos_request_logs` if needed)
- `orders.associated_order_ids = null` → parent / split / linked order
  relationships lost (e.g. food order `868876` linked to room `868877`)

## 2. Real-world impact (observed)

| Order | Room price dropped | Linked order dropped |
|---|---|---|
| `868899` (Phase 1 close-out) | ₹7888 | `[868891]` |
| `868866` | ₹1000 (advance 0, balance 1000) | `[868882]` |
| `868876` | ₹1000 (advance 100, balance 900) | `[868877]` |

Every room/hotel POS order is losing the room billing breakdown.

## 3. Goal

Persist `room_info` and `associated_order_ids` on the `orders` row when sent
in the realtime payload, **without** changing migration behavior, without
mutating historical rows, and without breaking the legacy CRM-name contract.

## 4. Scope

### IN scope (allowed file changes)
- `/app/backend/routers/pos.py`
  - Extend `POSOrderWebhook` model: add `room_info` and `associated_order_ids`
  - Extend `order_doc` build (around lines 815–870) to include both fields
- **Optional (separate sub-PR)**: also include `restaurant_id` in `order_doc`
  to close **CR-001D** in the same commit (one-line add). Owner decision.

### OUT of scope
- `migration.py` — untouched
- `core/pos_request_logger.py` — untouched
- Historical backfill of dropped values
- Reporting / dashboards / WhatsApp / wallet / coupon code
- Frontend / DB schema migrations / env

## 5. Proposed model additions

```python
# in /app/backend/routers/pos.py — POSOrderWebhook
from typing import Union
from pydantic import RootModel

class RoomInfo(BaseModel):
    """Hotel / room-billing breakdown attached to a POS order.

    Source: realtime POS payload `room_info`. Fields arrive as STRING
    decimals (e.g. "7888.00"); we coerce to float for analytics convenience
    but keep them Optional so non-room orders (empty dict {}) still parse.
    """
    model_config = ConfigDict(populate_by_name=True, coerce_numbers_to_str=False)

    room_price:       Optional[float] = None
    advance_payment:  Optional[float] = None
    balance_payment:  Optional[float] = None

# Inside POSOrderWebhook:
    room_info: Optional[RoomInfo] = None
    associated_order_ids: Optional[List[str]] = Field(
        default=None,
        # We accept List[int] from POS and coerce each element to str for
        # consistency with the pos_food_id string-only convention.
    )
```

### Coercion notes
- `room_info` arrives with numeric strings (`"7888.00"`). Pydantic 2.12 will
  coerce these to float when `coerce_numbers_to_str=False` (default for
  this nested model).
- Empty `room_info = {}` (non-room orders) parses to a `RoomInfo` with all
  three sub-fields `None` — same shape as not-sent. Acceptable.
- `associated_order_ids` arrives as `List[int]` from POS. We accept it as-is
  but persist as `List[str]` to align with `pos_food_id` string convention.
  This may need a `@field_validator` if Pydantic doesn't coerce the list
  elementwise.

### Persistence (order_doc build)
Add inside the dict at ~line 855 (alongside `order_notes`, `items`, etc.):

```python
"room_info": order_data.room_info.model_dump() if order_data.room_info else None,
"associated_order_ids": order_data.associated_order_ids,
```

If `room_info` arrives empty `{}`, we persist `None` rather than an
all-null sub-doc, to keep non-room orders compact. (Decision flag in spec —
owner may prefer always-store-as-sub-doc.)

## 6. Backward compatibility

| Incoming shape | Expected behavior |
|---|---|
| Payload omits `room_info` entirely | `orders.room_info = None` (current) |
| Payload sends `room_info = {}` | `orders.room_info = None` |
| Payload sends full `room_info` | `orders.room_info = {room_price: 7888.0, ...}` |
| Payload sends `associated_order_ids = []` | `orders.associated_order_ids = []` |
| Payload sends `associated_order_ids = [868891]` | `orders.associated_order_ids = ["868891"]` |
| Legacy clients not sending either | unchanged — both fields persist as `None` |

## 7. Test cases (static QA, target: 6 / 6 PASS)

| # | Case | Expected |
|---|---|---|
| P2.T1 | room_info as full object with string decimals | `room_price=7888.0`, etc., persisted as nested dict |
| P2.T2 | room_info as empty `{}` | persisted as `None` (or all-None depending on owner flag) |
| P2.T3 | room_info absent | persisted as `None` |
| P2.T4 | associated_order_ids as `[868891]` | persisted as `["868891"]` |
| P2.T5 | associated_order_ids as `[]` | persisted as `[]` |
| P2.T6 | associated_order_ids absent | persisted as `None` |

Plus 1 live HTTP probe on preview pod + 1 real prod order after deploy
(same protocol as Phase 1).

## 8. Deployment + verification protocol (carry over from Phase 1)

1. Merge to `22-may` and `main` (same branches Phase 1 used).
2. Run `cr_001a_check.sh` style verifier on prod after deploy — extend it to
   inspect that `POSOrderWebhook.model_fields["room_info"]` exists.
3. Restart `pos-backend` (pm2 id 7) on prod — the canonical lesson from
   Phase 1. Do NOT trust `crm-backend` restart.
4. Send 1 real POS room order → verify `orders.room_info` populated.

## 9. Out-of-band cleanup recommendation (NOT part of this CR)

CR-001A Phase 1 left a stale set of probe orders in the DB. Specifically:
- `orders.pos_order_id` matching `CRMPROBE-*` (already cleaned in Phase 1)
- 2 stale CR-002 probes from 2026-05-21 (`CR002-OK-1779349008-2074`,
  `CRM-PROBE-20260521T065540-31009`)

Optional small bash op (owner discretion):
```javascript
db.orders.deleteMany({pos_order_id: {$in: ["CR002-OK-1779349008-2074", "CRM-PROBE-20260521T065540-31009"]}})
```

## 10. Status

DRAFT — awaiting owner approval to start implementation.
