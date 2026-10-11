# CR-014: E-Invoice PDF + Mobile HTML Link — Implementation Report

## Change Request ID: CR-014
## Date: 2026-06-06 (Phases 1-3 implemented across sessions 4-5)
## Status: 🟡 IMPLEMENTED — Awaiting POS team for hotel folio `room_info` fields
## Retroactive documentation: 2026-06-18

---

## Summary

Full e-invoice system: profile expansion (10+ fields), bill settings (18 config keys), invoice generator (3 modes: food/hotel_room/hotel_folio), public invoice routes (HTML + PDF), POS webhook inline generation, and WhatsApp `einvoice_link` injection.

---

## Phase 1: Profile Page Expansion

### Files Modified
- `routers/auth.py` — `/me` returns 10 new fields; `PUT /profile` accepts them with regex validation; `_sync_mygenie_profile_fields()` auto-fills GSTIN/address/FSSAI from MyGenie on login
- `models/schemas.py` — `UserResponse` expanded with `gstin`, `legal_name`, `state`, `address_line1`, `address_line2`, `city`, `pincode`, `fssai_license`, `pan`, `vat_number`, `bill_settings`

### Frontend
- `ProfilePage.jsx` (326 LOC) — Profile form with validation, GSTIN auto-state derivation

### Endpoints
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/auth/me` | Returns profile with all CR-014 fields |
| `PUT` | `/api/auth/profile` | Updates profile fields + bill_settings sub-doc |
| `POST` | `/api/auth/profile/logo` | Upload bill logo (PNG/JPG/WEBP, max 500KB) |
| `GET` | `/api/auth/profile/logo/{user_id}` | Serve logo (public — used on invoices) |

### Validators
- GSTIN: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`
- Pincode: `^[1-9][0-9]{5}$`
- FSSAI: `^[0-9]{14}$`
- PAN: `^[A-Z]{5}[0-9]{4}[A-Z]$`

---

## Phase 2: Bill Settings + Invoice Generator

### Files Modified/Created
- `routers/auth.py` — `_BILL_SETTINGS_KEYS` (18 keys), merge-on-update logic
- `services/invoice_generator.py` (718 LOC) — Full invoice renderer
- `routers/invoices.py` (65 LOC) — Public invoice routes
- `templates/invoice_food.html` (14,509 bytes) — Jinja2 food invoice template

### Bill Settings Keys (18)
`invoice_prefix`, `header_color`, `accent_color`, `bill_logo_url`, `show_gstin`, `show_fssai`, `show_sac_code`, `sac_code`, `show_loyalty_section`, `show_veg_dots`, `show_amount_in_words`, `currency_symbol`, `footer_message`, `footer_contact`, `tagline`, `terms_and_conditions`, `date_format`, `show_customer_gstin`, `social_instagram`, `social_google_review`

### Invoice Generator Functions
| Function | Mode | Description |
|---|---|---|
| `generate_invoice_html()` | Food (Mode A) | GST tax invoice with CGST/SGST split, veg dots, loyalty section |
| `generate_hotel_room_html()` | Hotel Room (Pattern A) | Room charges + F&B items, advance/balance |
| `generate_hotel_folio_html()` | Hotel Folio (Pattern B) | Day-grouped F&B folio with stay summary |
| `_detect_invoice_mode()` | Auto-detect | Routes to correct mode based on `room_info` and "Check In" item |
| `create_invoice()` | Orchestrator | Detects mode → generates HTML → stores in DB → returns token + URL |
| `_amount_in_words()` | Helper | Indian numbering (lakhs/crores) |

### Endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/invoices/{token}` | Public | Render invoice HTML |
| `GET` | `/api/invoices/{token}/pdf` | Public | Download invoice PDF (WeasyPrint) |

### DB Collection
- `invoices` — `token` (unique), `user_id`, `restaurant_order_id`, `html`, `created_at`. Deduplicated on `(user_id, restaurant_order_id)`.

---

## Phase 3: Hotel Folio (Mode C)

### Files Created
- `templates/invoice_hotel_room.html` (14,896 bytes) — Pattern A: room charges + F&B
- `templates/invoice_hotel_folio.html` (13,845 bytes) — Pattern B: day-grouped guest folio

### Mode Detection Logic (`_detect_invoice_mode`)
```
if order has room_info AND room_info.room_price > 0 → "hotel_room" (Pattern A)
elif order has item named "Check In" with price 0 → "hotel_folio" (Pattern B)  
else → "food" (default)
```

### Verified With Real Data
- Pattern A: sunildev R558 order #000130 (Rs.5,945 room + F&B)
- Pattern B: Palm House R541 order #006644 (Ms. Jamie Finlayson, 61-day stay, 200 items, Rs.46,424)

---

## Phase 4 (Bucket 4): POS Webhook Integration

### File Modified
- `routers/pos.py` (lines 1512-1532) — Invoice generated inline in `POST /api/pos/orders` before `send_bill` WhatsApp trigger. `einvoice_link` and `einvoice_token` injected into event_data.

### Flow
```
POS order arrives → save order → generate invoice (fire-safe) → inject einvoice_link into send_bill event → WhatsApp template receives invoice URL
```

---

## QA Acceptance Criteria

| # | Criteria | How to Verify |
|---|---|---|
| AC1 | Profile fields save and persist | `PUT /api/auth/profile` with GSTIN/PAN/FSSAI → `GET /me` returns them |
| AC2 | GSTIN regex rejects invalid | `PUT /profile` with `gstin: "INVALID"` → 400 |
| AC3 | Bill settings merge (don't wipe) | Set `header_color` → set `footer_message` → both persist |
| AC4 | Logo upload + serve | `POST /profile/logo` → `GET /profile/logo/{id}` returns image |
| AC5 | Food invoice renders | `GET /api/invoices/{token}` → HTML with GST breakdown |
| AC6 | Food invoice PDF | `GET /api/invoices/{token}/pdf` → valid PDF download |
| AC7 | Hotel Room invoice (Pattern A) | Order with `room_info.room_price > 0` → room charges + F&B |
| AC8 | Hotel Folio invoice (Pattern B) | Order with "Check In" item → day-grouped folio |
| AC9 | Invoice deduplication | Same `(user_id, restaurant_order_id)` → reuses existing token |
| AC10 | POS webhook generates invoice | New order via `/api/pos/orders` → invoice created, `einvoice_link` in send_bill |
| AC11 | MyGenie profile sync on login | Login → GSTIN/FSSAI/address auto-filled from POS profile (empty fields only) |
| AC12 | Amount in words (Indian numbering) | Invoice shows "Rupees Four Thousand Five Hundred" etc. |

---

**End of CR-014 Implementation Report**
