# CR-014 Phase 3 — Hotel Folio / Room Invoice (Mode C): Planning Doc

**Sprint**: ROI Measurement / CRM
**CR**: CR-014, Phase 3 (Mode C)
**Status**: `cr014_phase3_planning`
**Date**: 2026-06-06
**Prerequisite**: Phase 1 (Profile) + Phase 2 (Food Invoice) complete and live-tested
**POS Contract**: `handoff/CR_014_POS_HOTEL_FOLIO_DATA_CONTRACT.md` (shared with POS team)

---

## 1. Scope

Build **Mode C: Hotel Folio** invoice generation — auto-detected when an order contains room/stay data. Supports **two POS patterns** (Option C per owner decision):

| Pattern | How detected | Room charges | F&B charges | Tenants |
|---|---|---|---|---|
| **A: `room_info` struct** | `room_info.room_price > 0` | Yes (room_price, advance, balance, rate_per_night when POS adds it) | Yes (items array) | sunildev R558, future tenants |
| **B: "Check In" item** | Item named "Check In" / "check in" at Rs.0 in items array | No (hotel bills room separately) | Yes (all non-check-in items, grouped by day using `serve_at`) | Palm House R541 |

Both patterns produce a public HTML invoice + PDF download, injected into WhatsApp via `einvoice_link`.

---

## 2. Detection Logic (in `generate_invoice_html`)

```
if order.room_info and room_info.room_price > 0:
    mode = "hotel_room"          # Pattern A: full folio with room + food
elif any item.item_name matches /^check.?in$/i AND item.item_price == 0:
    mode = "hotel_folio"         # Pattern B: F&B-only guest folio
else:
    mode = existing logic        # food_gst or food_receipt (Mode A/B — already built)
```

---

## 3. Hotel Folio Template Structure

### 3.1 Pattern A — Room + Food Folio (`hotel_room`)

```
┌──────────────────────────────────────────────┐
│ HEADER (same as food invoice — colors, logo) │
│  Hotel/Restaurant name, address, contact     │
│  "HOTEL FOLIO" badge (instead of TAX INVOICE)│
│  Invoice No + Date                           │
├──────────────────────────────────────────────┤
│ GUEST INFO                                   │
│  Guest Name, Phone                           │
│  Room: {room_info.room_number} or table_id   │
│  Room Type: {room_info.room_type}            │
│  Check-in: {room_info.check_in}              │
│  Check-out: {room_info.check_out}            │
│  Nights: {room_info.nights} or derived       │
├──────────────────────────────────────────────┤
│ ROOM CHARGES                                 │
│  Room ({nights} nights × Rs.{rate_per_night})│
│    = Rs.{room_price}                         │
│  (or lump sum if rate_per_night missing)     │
├──────────────────────────────────────────────┤
│ F&B CHARGES (same items section as Mode A)   │
│  item list with qty × price                  │
├──────────────────────────────────────────────┤
│ TOTALS                                       │
│  Room Charges                                │
│  F&B Charges                                 │
│  Subtotal                                    │
│  Discounts / Tax / Grand Total               │
├──────────────────────────────────────────────┤
│ PAYMENT                                      │
│  Advance Paid: {advance_payment}             │
│  Balance Due: {balance_payment}              │
│  Payment Method                              │
├──────────────────────────────────────────────┤
│ FOOTER (same as food invoice)                │
└──────────────────────────────────────────────┘
```

### 3.2 Pattern B — F&B Guest Folio (`hotel_folio`)

```
┌──────────────────────────────────────────────┐
│ HEADER                                       │
│  "GUEST FOLIO" badge                         │
│  Invoice No + Date                           │
├──────────────────────────────────────────────┤
│ GUEST INFO                                   │
│  Guest Name, Phone                           │
│  Room: {table_id} (POS room mapping)         │
│  Stay: {first serve_at date} → {last date}   │
│  Duration: {N} days                          │
├──────────────────────────────────────────────┤
│ F&B CHARGES — GROUPED BY DAY                 │
│  ┌─ 14 Jan 2026 ─────────────────────────┐  │
│  │  Cappuccino x1         Rs.160          │  │
│  │  Green Halloumi Bowl x1 Rs.350         │  │
│  │  Day Total: Rs.510                     │  │
│  └────────────────────────────────────────┘  │
│  ┌─ 15 Jan 2026 ─────────────────────────┐  │
│  │  Toast x1              Rs.150          │  │
│  │  Dirty Chai x1         Rs.200          │  │
│  │  Day Total: Rs.350                     │  │
│  └────────────────────────────────────────┘  │
│  ... (all days)                              │
├──────────────────────────────────────────────┤
│ TOTALS                                       │
│  Total F&B ({N} days): Rs.{total}            │
│  Tax / Discounts / Grand Total               │
├──────────────────────────────────────────────┤
│ PAYMENT + FOOTER                             │
└──────────────────────────────────────────────┘
```

---

## 4. Data Available per Pattern

### Pattern A (`room_info` struct)

| Field | Source | Available Now | After POS Contract |
|---|---|---|---|
| Room price | `room_info.room_price` | ✅ | ✅ |
| Advance paid | `room_info.advance_payment` | ✅ | ✅ |
| Balance due | `room_info.balance_payment` | ✅ | ✅ |
| Room number | `room_info.room_number` | ❌ fallback to `table_id` | ✅ (P0 ask) |
| Check-in | `room_info.check_in` | ❌ fallback to `order_created_at` | ✅ (P0 ask) |
| Check-out | `room_info.check_out` | ❌ fallback to `order_updated_at` | ✅ (P0 ask) |
| Nights | `room_info.nights` | ❌ derive from dates | ✅ (P1 ask) |
| Room type | `room_info.room_type` | ❌ omit | ✅ (P1 ask) |
| Rate/night | `room_info.rate_per_night` | ❌ show lump sum | ✅ (P1 ask) |
| Food items | `items[]` (exclude "Check In") | ✅ | ✅ |

### Pattern B ("Check In" item)

| Field | Source | Available |
|---|---|---|
| Guest name | `cust_name` | ✅ (31%+ of orders) |
| Guest phone | `cust_mobile` | ✅ |
| Room (POS ID) | `table_id` | ✅ |
| Check-in | First `items[].serve_at` date | ✅ (derived) |
| Check-out | Last `items[].serve_at` date | ✅ (derived) |
| Stay duration | Count unique `serve_at` dates | ✅ (derived) |
| Food items per day | `items[]` grouped by `serve_at` date | ✅ |
| Room charges | ❌ Not available | ❌ (hotel bills separately) |

---

## 5. File Plan

### 5.1 Backend Changes

| # | File | Action | What |
|---|---|---|---|
| B1 | `backend/services/invoice_generator.py` | **Edit** | Add mode detection logic. Add `generate_hotel_room_html()` (Pattern A) and `generate_hotel_folio_html()` (Pattern B). Modify `create_invoice()` to route to correct generator. |
| B2 | `backend/templates/invoice_hotel_room.html` | **NEW** | Jinja2 template for Pattern A — room charges + food items |
| B3 | `backend/templates/invoice_hotel_folio.html` | **NEW** | Jinja2 template for Pattern B — day-grouped F&B folio |
| B4 | `backend/models/schemas.py` | **Edit** | Add `room_number`, `check_in`, `check_out`, `nights`, `room_type`, `rate_per_night`, `guest_count` as Optional fields on room_info model (if modeled) |

### 5.2 No Frontend Changes

Invoice templates are server-rendered HTML served at public URLs. No React changes needed.

### 5.3 No POS Webhook Changes

The `routers/pos.py` hook already calls `create_invoice()` for every order. Mode detection happens inside the generator — no routing changes needed.

---

## 6. Acceptance Criteria

| # | Criterion | Verify |
|---|---|---|
| AC-1 | Order with `room_info.room_price > 0` → generates "HOTEL FOLIO" invoice | curl + visual |
| AC-2 | Room charges section shows room_price, advance, balance | visual |
| AC-3 | Room number shown (from `room_info.room_number`, fallback to `table_id`) | visual |
| AC-4 | Check-in/out dates shown (from `room_info` or derived from `order_created_at`/`order_updated_at`) | visual |
| AC-5 | Food items listed below room charges | visual |
| AC-6 | Order with "Check In" item at Rs.0 → generates "GUEST FOLIO" invoice | curl + visual |
| AC-7 | "Check In" item filtered out of food items list | visual |
| AC-8 | Food items grouped by day (using `serve_at` dates) | visual |
| AC-9 | Day totals shown per group | visual |
| AC-10 | Stay duration derived correctly (first→last serve_at date) | visual |
| AC-11 | Guest name + phone shown on both patterns | visual |
| AC-12 | PDF download works for both hotel invoice types | click test |
| AC-13 | Normal food orders (no room_info, no Check In item) → unchanged Mode A/B | regression |
| AC-14 | Grand total correct (room + food + tax - discounts) | calculation |

---

## 7. Implementation Sequence

| Step | What | Est. |
|---|---|---|
| 1 | Mode detection logic in `invoice_generator.py` | 30min |
| 2 | Pattern A: `generate_hotel_room_html()` + `invoice_hotel_room.html` template | 2h |
| 3 | Pattern B: `generate_hotel_folio_html()` + `invoice_hotel_folio.html` template (day grouping) | 2h |
| 4 | Update `create_invoice()` routing + invoice doc `mode` field | 30min |
| 5 | Test with real data: sunildev R558 order #000130 (Pattern A) + Palm House R541 order #006644 (Pattern B) | 1h |
| **Total** | | **~6h** |

---

## 8. Test Data

### Pattern A test — sunildev R558, Order #000130
- `room_info`: `{room_price: 1000, advance: 500, balance: 500}`
- 16 food items (chicken, fish, biryani)
- Customer: nelu ji
- Grand total: Rs.5,945

### Pattern B test — Palm House R541, Order #006644
- "Check In" item at Rs.0 (cat 1299)
- 201 food items across 61 days (Jan 14 → Apr 1)
- Customer: Ms. Jamie Finlayson, +351927605555
- Table/Room: 4708 (guest note: "room 305")
- Grand total: Rs.46,424

---

## 9. Out of Scope (Phase 3)

- Multi-folio aggregation (combining separate orders for same guest across rooms)
- Room-number-to-POS-table-id mapping UI
- Splitting CGST/SGST on room charges (hotel GST rules differ — 12% vs 18% based on room rate)
- Guest signature or check-out confirmation flow
- Room service item categorization (F&B vs minibar vs laundry)

---

## 10. Sign-off

**S1**: Approve this plan for implementation?

**End of Phase 3 Planning Doc.**
