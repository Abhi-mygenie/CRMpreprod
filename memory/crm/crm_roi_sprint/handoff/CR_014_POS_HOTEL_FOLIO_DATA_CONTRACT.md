# POS → CRM: Hotel Folio Data Contract — Room Order Fields

**Date**: 2026-06-06
**From**: CRM Team
**To**: POS Team
**CR**: CR-014 (E-Invoice — Mode C: Hotel Folio)
**Status**: Request for POS payload expansion

---

## 1. Context

CRM is building **Hotel Folio / Room Invoice** generation (Mode C of CR-014). When a hotel guest checks out, CRM generates a mobile-friendly invoice (HTML + PDF) covering:
- Room charges (nights × rate)
- F&B charges (food ordered during stay, grouped by day)
- Taxes, discounts, grand total

This invoice is sent to the guest via WhatsApp (`einvoice_link` variable in `send_bill` template) and also accessible via a public URL.

**Current state**: POS already sends food items, customer data, and a `room_info` struct — but `room_info` only has 3 fields (`room_price`, `advance_payment`, `balance_payment`). We need 4-7 more fields to generate a proper hotel folio.

---

## 2. Current `room_info` Struct (what POS sends today)

```json
{
  "room_info": {
    "room_price": 1000.0,
    "advance_payment": 500.0,
    "balance_payment": 500.0
  }
}
```

This is sent inside the `POST /api/pos/orders` payload. Only 1 tenant (sunildev/R558) currently populates it. Palm House (R541) uses a "Check In" item at Rs.0 as a workaround instead.

---

## 3. Requested Fields — Expanded `room_info`

### P0 — Critical (blocks folio generation)

| # | Field | Type | Example | Why |
|---|---|---|---|---|
| 1 | `room_number` | string | `"305"`, `"Deluxe 12"`, `"Villa A"` | Human-readable room identifier on folio header. Currently CRM only gets `table_id` (POS internal numeric ID like 4708) which is meaningless to the guest. |
| 2 | `check_in` | string (ISO date or datetime) | `"2026-01-14"` or `"2026-01-14T14:00:00"` | Folio header: "Check-in: 14 Jan 2026". Currently CRM derives from first item's `serve_at` which is unreliable. |
| 3 | `check_out` | string (ISO date or datetime) | `"2026-04-01"` or `"2026-04-01T11:00:00"` | Folio header: "Check-out: 01 Apr 2026". Currently CRM derives from `order_updated_at` which is unreliable (could be updated for other reasons). |

### P1 — Important (improves folio quality)

| # | Field | Type | Example | Why |
|---|---|---|---|---|
| 4 | `nights` | integer | `3` | "3 Nights" on folio. CRM can derive from `check_in`/`check_out` if missing, but POS may have the actual booked value (early checkout etc.). |
| 5 | `room_type` | string | `"Deluxe Room"`, `"Suite"`, `"Standard"`, `"Villa"` | Shown on folio: "Room Type: Deluxe Room". Helps guest identify their booking. |
| 6 | `rate_per_night` | float | `3000.0` | Enables itemized room charge: "3 nights × Rs.3,000 = Rs.9,000". Currently CRM only gets lump-sum `room_price` with no breakdown. |

### P2 — Nice-to-have

| # | Field | Type | Example | Why |
|---|---|---|---|---|
| 7 | `guest_count` | integer | `2` | "Guests: 2" on folio header. Minor cosmetic detail. |

---

## 4. Proposed Expanded `room_info` Struct

```json
{
  "room_info": {
    "room_price": 9000.0,
    "advance_payment": 5000.0,
    "balance_payment": 4000.0,
    "room_number": "305",
    "check_in": "2026-01-14",
    "check_out": "2026-01-17",
    "nights": 3,
    "room_type": "Deluxe Room",
    "rate_per_night": 3000.0,
    "guest_count": 2
  }
}
```

### Backward Compatibility

- All new fields are **optional** — CRM handles `null`/missing gracefully
- Existing `room_price`, `advance_payment`, `balance_payment` remain unchanged
- Tenants that don't send `room_info` at all are unaffected (CRM falls back to food-only invoice)
- No changes to the `POST /api/pos/orders` endpoint contract — just additional fields inside the existing `room_info` object

---

## 5. Where It Goes in the POS Payload

The `room_info` struct is sent inside the existing order webhook payload:

```json
POST /api/pos/orders
{
  "pos_order_id": "869143",
  "restaurant_order_id": "010585",
  "order_type": "pos",
  "order_amount": 15000.0,
  "cust_name": "Ms. Jamie Finlayson",
  "cust_mobile": "+351927605555",
  "payment_method": "card",
  "items": [
    {"item_name": "Cappuccino", "item_qty": 1, "item_price": 160.0, ...},
    {"item_name": "Eggs Benny", "item_qty": 1, "item_price": 350.0, ...}
  ],
  "room_info": {
    "room_price": 9000.0,
    "advance_payment": 5000.0,
    "balance_payment": 4000.0,
    "room_number": "305",
    "check_in": "2026-01-14",
    "check_out": "2026-01-17",
    "nights": 3,
    "room_type": "Deluxe Room",
    "rate_per_night": 3000.0,
    "guest_count": 2
  }
}
```

No new endpoint. No new header. Just additional keys inside `room_info`.

---

## 6. CRM Behavior Based on What POS Sends

| Scenario | CRM Action |
|---|---|
| `room_info` not present or null | Normal food invoice (Mode A/B) |
| `room_info.room_price > 0` | Hotel Folio (Mode C) — room charges + F&B |
| `room_info` present but `room_price = 0` | F&B-only folio with hotel guest header (if `check_in` present) |
| `room_number` missing | Folio shows "Room: —" (falls back to `table_id` if available) |
| `check_in`/`check_out` missing | CRM derives from item `serve_at` dates (less reliable) |
| `nights` missing | CRM derives: `check_out - check_in` in days |
| `rate_per_night` missing | CRM shows lump-sum `room_price` without per-night breakdown |
| `room_type` missing | Omitted from folio |
| `guest_count` missing | Omitted from folio |

---

## 7. Palm House "Check In" Item Pattern

Palm House (R541) currently uses a different approach — a menu item called **"Check In"** at Rs.0 to mark hotel guests instead of using `room_info`. This works for guest identification but lacks room charge data entirely.

**Recommendation**: Palm House should also adopt the `room_info` struct. CRM will support both patterns during transition:
- **Pattern A** (`room_info` struct): Full hotel folio with room charges
- **Pattern B** ("Check In" item): F&B-only guest folio (no room charges)

Once Palm House switches to `room_info`, Pattern B becomes legacy.

---

## 8. Timeline Ask

| Priority | Fields | CRM Ready | POS Needed By |
|---|---|---|---|
| P0 | `room_number`, `check_in`, `check_out` | Now | ASAP — blocks hotel folio feature |
| P1 | `nights`, `room_type`, `rate_per_night` | Now | Next sprint |
| P2 | `guest_count` | Now | Whenever convenient |

---

## 9. Questions for POS Team

1. **Which tenants currently use hotel/room features?** We found: sunildev (R558), Palm House (R541), Welcome Resort (R474). Any others?
2. **Can Palm House switch from "Check In" item to `room_info` struct?** Or should CRM continue supporting both patterns permanently?
3. **Is `room_number` available in POS DB?** If yes, easy to add to the webhook payload.
4. **Are check-in/check-out dates tracked in POS?** If yes, which table/field?
5. **Any concern about adding these fields to the existing `room_info` object?**

---

## 10. Contact

For questions about CRM-side handling: reach out to CRM team.
For webhook endpoint details: see existing POS API contract at `POST /api/pos/orders`.

**End of document.**
