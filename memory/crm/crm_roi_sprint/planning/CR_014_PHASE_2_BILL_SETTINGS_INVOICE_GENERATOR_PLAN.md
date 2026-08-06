# CR-014 Phase 2 — Bill Settings + Invoice Generator: Detailed Planning Doc

**Sprint**: ROI Measurement / CRM
**CR**: CR-014, Phase 2
**Status**: `cr014_phase_2_planning`
**Date**: 2026-06-05
**Prerequisite**: Phase 1 complete (Profile page expansion with tax/address fields)

---

## 0. Owner Feedback on Mock (locked 2026-06-05)

| # | Feedback | Decision |
|---|---|---|
| 1 | Logo — where from? | Store URL in profile, user can edit or upload if missing. Auto-fetch from MyGenie `bill_logo` on login. |
| 2 | "Subtotal" naming | Use "Item Total" for sum of items. Delivery Charge BEFORE subtotal. Subtotal = Item Total + Delivery. Tax charged on subtotal. |
| 3 | SAC 996331 line | Keep for now. Move to footer. SAC code = GST Service Accounting Code for restaurant service (standard Indian GST). Configurable per restaurant. |
| 4 | Dark header | Make header color dynamic — restaurant picks from Bill Settings |
| 5 | Order ID | Remove from invoice. Show only: Invoice No + Date + Bill No. |
| 6 | Invoice number | Format: `{prefix}/{bill_number}` — bill_number = POS `restaurant_order_id`. NOT sequential. Example: `KM/010585`. |
| 7 | Dynamic sections | New "Bill Settings" section in Profile page for invoice personalization. |

---

## 1. Totals Structure (locked)

```
Item Total (sum of qty x price for all items)     Rs.2,429.00
  Delivery Charge (only for delivery orders)       Rs.49.00
Subtotal                                           Rs.2,478.00
  Coupon Discount (WELCOME20)                    - Rs.200.00
  Loyalty Points Redeemed (150 pts)              - Rs.150.00
Taxable Amount                                     Rs.2,128.00
  CGST @ 2.5%                                     Rs.53.20
  SGST @ 2.5%                                     Rs.53.20
  Round Off                                        Rs.0.60
Grand Total                                        Rs.2,235.00
  Amount in words (if enabled)
```

---

## 2. Invoice Number Logic (locked)

**Format**: `{invoice_prefix}/{bill_number}`

| Part | Source | Example |
|---|---|---|
| `invoice_prefix` | Configurable in Bill Settings (default: auto from restaurant name initials) | `KM` |
| `bill_number` | POS field: `restaurant_order_id` from the order | `010585` |

**Result**: `KM/010585`

No sequential counter needed. No `invoice_counters` collection. The bill number comes directly from POS.

---

## 3. Bill Settings — New Profile Section

### 3.1 New fields on `users` collection (all optional, stored as `bill_settings` sub-document)

```json
{
  "bill_settings": {
    "invoice_prefix": "KM",
    "header_color": "#2B2B2B",
    "accent_color": "#F26B33",
    "bill_logo_url": "https://...",
    "show_gstin": true,
    "show_fssai": true,
    "show_sac_code": true,
    "sac_code": "996331",
    "show_loyalty_section": true,
    "show_veg_dots": true,
    "show_amount_in_words": true,
    "currency_symbol": "Rs.",
    "footer_message": "Thank you for dining with us!",
    "footer_contact": "7307097771",
    "tagline": "",
    "terms_and_conditions": "",
    "date_format": "DD MMM YYYY",
    "show_customer_gstin": true,
    "social_instagram": "",
    "social_google_review": ""
  }
}
```

### 3.2 Bill Settings UI in Profile Page (new section)

```
┌─ Section: Bill / Invoice Settings ─────────────────────────────────┐
│                                                                     │
│  ┌─ Branding ────────────────────────────────────────────────────┐  │
│  │  Bill Logo         [preview image] [Upload] [URL input]      │  │
│  │                    Auto-fetched from MyGenie if available     │  │
│  │  Invoice Prefix    [KM_____]  "Used in invoice number"       │  │
│  │  Tagline           [Authentic Middle Eastern...]              │  │
│  │  Header Color      [color picker] [#2B2B2B]                  │  │
│  │  Accent Color      [color picker] [#F26B33]                  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ Display Options ─────────────────────────────────────────────┐  │
│  │  Show GSTIN on Invoice        [toggle ON ]                    │  │
│  │  Show FSSAI on Invoice        [toggle ON ]                    │  │
│  │  Show SAC/HSN Code            [toggle ON ]                    │  │
│  │  SAC Code                     [996331___]                     │  │
│  │  Show Loyalty Rewards         [toggle ON ]                    │  │
│  │  Show Veg/Non-veg Dots        [toggle ON ]                    │  │
│  │  Show Amount in Words         [toggle ON ]                    │  │
│  │  Show Customer GSTIN (B2B)    [toggle ON ]                    │  │
│  │  Currency Symbol              [dropdown: Rs. / ₹ / INR]      │  │
│  │  Date Format                  [dropdown: DD MMM YYYY / etc]   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ Footer ──────────────────────────────────────────────────────┐  │
│  │  Thank You Message  [Thank you for dining with us!___]        │  │
│  │  Contact Info       [7307097771___________]                   │  │
│  │  Terms & Conditions [textarea________________________]        │  │
│  │  Instagram URL      [@kunafamahal_____]                       │  │
│  │  Google Review URL  [https://g.page/...___]                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  [━━━━━━━━━━━━━━ Save Bill Settings ━━━━━━━━━━━━━━]               │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 Default values (auto-populated)

| Field | Auto-populated from | Fallback |
|---|---|---|
| `invoice_prefix` | First 2 chars of `restaurant_name` (uppercase) | "INV" |
| `bill_logo_url` | MyGenie `restaurants[0].bill_logo` (need CDN base URL confirmation) | Empty (show initials circle) |
| `header_color` | — | `#2B2B2B` |
| `accent_color` | — | `#F26B33` |
| `footer_contact` | `users.phone` | Empty |
| `sac_code` | — | `996331` |
| `currency_symbol` | MyGenie `restaurants[0].currency` ("INR" → "Rs.") | "Rs." |
| All toggles | — | `true` (show everything by default) |

---

## 4. Logo Handling

### 4.1 Sources (priority order)
1. **User uploads** via Profile → stored in local disk `/app/data/logos/{user_id}.png` → served at `/api/invoices/logo/{user_id}`
2. **User pastes URL** in Profile → stored as `bill_logo_url`
3. **Auto-fetched from MyGenie** on login → `restaurants[0].bill_logo` filename → need CDN base URL (PENDING confirmation from owner: what's the full URL for `2025-12-20-6946a5a9cba38.png`?)
4. **Fallback**: Generate initials circle server-side (e.g., "KM" in orange circle)

### 4.2 Upload endpoint (NEW)
```
POST /api/auth/profile/logo
Content-Type: multipart/form-data
Body: file (PNG/JPG, max 500KB)
Response: { "logo_url": "/api/invoices/logo/{user_id}" }
```

### 4.3 Logo serve endpoint (NEW)
```
GET /api/invoices/logo/{user_id}
Response: image/png (from disk)
```

---

## 5. File-by-File Change Plan

### 5.1 Backend Files

| # | File | Action | What |
|---|---|---|---|
| B1 | `backend/routers/auth.py` | Edit | Expand `PUT /profile` to accept `bill_settings` sub-doc. Add `POST /profile/logo` upload endpoint. Add logo serve endpoint. Update `_sync_mygenie_profile_fields` to auto-fetch `bill_logo` URL. |
| B2 | `backend/models/schemas.py` | Edit | Add `bill_settings` dict field to `UserResponse`. |
| B3 | `backend/services/invoice_generator.py` | **NEW** | Jinja2 HTML renderer. Reads `bill_settings` from user doc. Generates invoice HTML from order data. Mode A (food) only for now. |
| B4 | `backend/services/invoice_storage.py` | **NEW** | `LocalDiskStorage` class. Writes HTML + PDF to `/app/data/invoices/{token}/`. |
| B5 | `backend/routers/invoices.py` | **NEW** | `GET /api/invoices/{token}` → serves HTML. `GET /api/invoices/{token}/pdf` → serves PDF. `GET /api/invoices/logo/{user_id}` → serves logo. |
| B6 | `backend/routers/pos.py` | Edit | After order processing, call `generate_invoice()`. Inject `einvoice_link` into `send_bill` event_data. |
| B7 | `backend/server.py` | Edit | Include new `invoices` router. |
| B8 | `backend/templates/invoice_food.html` | **NEW** | Jinja2 HTML template for food invoice (Mode A). All dynamic sections driven by `bill_settings`. |

### 5.2 Frontend Files

| # | File | Action | What |
|---|---|---|---|
| F1 | `frontend/src/pages/ProfilePage.jsx` | Edit | Add "Bill / Invoice Settings" section with all configurable fields (branding, display toggles, footer). Logo upload/URL input. Color pickers. Save handler for `bill_settings`. |

### 5.3 Data Files

| # | File | Action | What |
|---|---|---|---|
| D1 | `/app/data/invoices/` | Directory | Created at startup. Stores generated invoice HTML+PDF per token. |
| D2 | `/app/data/logos/` | Directory | Created at startup. Stores uploaded logos per user_id. |

---

## 6. Invoice HTML Template — Dynamic Sections Map

Every section of the invoice is controlled by `bill_settings`:

```
┌──────────────────────────────────────────────────┐
│ HEADER                                            │
│  bg-color: bill_settings.header_color             │
│  logo: bill_settings.bill_logo_url OR initials    │
│  restaurant_name: users.restaurant_name           │
│  tagline: bill_settings.tagline                   │
│  address: users.address_line1, city, state,       │
│           pincode                                  │
│  phone: users.phone                               │
│  TAX INVOICE badge (always for Mode A)            │
│  Invoice No: {prefix}/{bill_number}               │
│  Date: formatted per bill_settings.date_format    │
│  Bill No: order.restaurant_order_id               │
│  (NO Order ID — removed per feedback)             │
├──────────────────────────────────────────────────┤
│ GSTIN + FSSAI STRIP                               │
│  if bill_settings.show_gstin: GSTIN: {gstin}      │
│  if bill_settings.show_fssai: FSSAI: {fssai}      │
│  (hidden entirely if both toggles OFF)            │
├──────────────────────────────────────────────────┤
│ CUSTOMER                                          │
│  Name, Phone                                      │
│  if dine-in: Table, Type=Dine-In                  │
│  if delivery: DELIVERY badge + address            │
│  if takeaway: Type=Takeaway                       │
│  if bill_settings.show_customer_gstin &&          │
│     customer.gst_number: Customer GSTIN           │
├──────────────────────────────────────────────────┤
│ ITEMS                                             │
│  for each item:                                   │
│    if bill_settings.show_veg_dots: veg/nonveg dot │
│    item_name, variant, add-ons                    │
│    qty x price = line_total                       │
├──────────────────────────────────────────────────┤
│ TOTALS                                            │
│  Item Total                                       │
│  + Delivery Charge (if delivery order)            │
│  = Subtotal                                       │
│  - Coupon Discount (if any)                       │
│  - Loyalty Discount (if any)                      │
│  - Wallet Used (if any)                           │
│  = Taxable Amount                                 │
│    CGST @ X% (if intra-state)                     │
│    SGST @ X% (if intra-state)                     │
│    OR IGST @ X% (if inter-state)                  │
│  + Service Charge (if any)                        │
│  + Tip (if any)                                   │
│  + Round Off                                      │
│  = GRAND TOTAL (accent_color)                     │
│  if bill_settings.show_amount_in_words: words     │
├──────────────────────────────────────────────────┤
│ PAYMENT STRIP                                     │
│  Payment method + PAID badge                      │
├──────────────────────────────────────────────────┤
│ LOYALTY REWARDS (if bill_settings.show_loyalty)   │
│  Points Earned, Points Balance, Tier, Wallet      │
├──────────────────────────────────────────────────┤
│ FOOTER                                            │
│  bill_settings.footer_message                     │
│  "Computer-generated, no signature required"      │
│  bill_settings.footer_contact                     │
│  if bill_settings.show_sac_code:                  │
│    "SAC: {sac_code} | Place of Supply: {state}"   │
│  if bill_settings.terms_and_conditions: T&C text  │
│  if bill_settings.social_instagram: IG link       │
│  if bill_settings.social_google_review: link      │
├──────────────────────────────────────────────────┤
│ [Download PDF] button (accent_color)              │
└──────────────────────────────────────────────────┘
```

---

## 7. API Contracts

### 7.1 `PUT /api/auth/profile` — expanded to accept bill_settings

```json
{
  "phone": "7307097771",
  "gstin": "09NTAPK9306R1ZP",
  "bill_settings": {
    "invoice_prefix": "KM",
    "header_color": "#2B2B2B",
    "accent_color": "#F26B33",
    "show_gstin": true,
    "show_fssai": true,
    "show_sac_code": true,
    "sac_code": "996331",
    "show_loyalty_section": true,
    "show_veg_dots": true,
    "show_amount_in_words": true,
    "currency_symbol": "Rs.",
    "footer_message": "Thank you!",
    "footer_contact": "7307097771",
    "tagline": "Authentic Middle Eastern Desserts",
    "terms_and_conditions": "",
    "date_format": "DD MMM YYYY",
    "show_customer_gstin": true,
    "social_instagram": "@kunafamahal",
    "social_google_review": ""
  }
}
```

### 7.2 `POST /api/auth/profile/logo` — logo upload (NEW)

```
Content-Type: multipart/form-data
Body: file (PNG/JPG/WEBP, max 500KB)
Response: { "logo_url": "/api/invoices/logo/pos_0001_restaurant_689" }
```

Side-effect: sets `bill_settings.bill_logo_url` on the user doc.

### 7.3 `GET /api/invoices/{token}` — serve invoice HTML (NEW)

```
Response: text/html (the invoice page — mobile-friendly, self-contained)
No auth required (public link, token is the secret)
```

### 7.4 `GET /api/invoices/{token}/pdf` — serve invoice PDF (NEW)

```
Response: application/pdf
No auth required
```

### 7.5 `GET /api/invoices/logo/{user_id}` — serve logo image (NEW)

```
Response: image/png or image/jpeg
No auth required (logo is public — appears on customer-facing invoices)
```

---

## 8. DB Schema

### 8.1 `users` collection — additions

```
bill_settings: {                    // sub-document, all fields optional
  invoice_prefix: String,
  header_color: String,
  accent_color: String,
  bill_logo_url: String,
  show_gstin: Boolean,
  show_fssai: Boolean,
  show_sac_code: Boolean,
  sac_code: String,
  show_loyalty_section: Boolean,
  show_veg_dots: Boolean,
  show_amount_in_words: Boolean,
  currency_symbol: String,
  footer_message: String,
  footer_contact: String,
  tagline: String,
  terms_and_conditions: String,
  date_format: String,
  show_customer_gstin: Boolean,
  social_instagram: String,
  social_google_review: String,
}
```

### 8.2 `invoices` collection — NEW

```
{
  id: String (UUID),
  token: String (32-char hex, URL-safe),
  user_id: String,
  pos_order_id: String,
  restaurant_order_id: String,
  customer_id: String,
  invoice_number: String ("KM/010585"),
  mode: String ("food_gst"),
  order_type: String ("dinein" / "delivery" / "takeaway"),
  order_amount: Number,
  html_path: String,
  pdf_path: String,
  generated_at: String (ISO datetime),
}
```

Indexes:
- `token` (unique) — for public URL lookup
- `user_id + restaurant_order_id` — for dedup / re-generation

---

## 9. Implementation Sequence

| Step | Files | What | Est. |
|---|---|---|---|
| 1 | B2, B1 | Backend: Add `bill_settings` to UserResponse + PUT /profile expansion + logo upload endpoint | 1h |
| 2 | F1 | Frontend: Bill Settings section in ProfilePage (branding, toggles, footer, logo upload, color pickers) | 2h |
| 3 | — | **CHECKPOINT**: Owner tests Bill Settings UI, confirms all fields work | — |
| 4 | B8 | Jinja2 invoice HTML template with all dynamic sections | 2h |
| 5 | B3, B4 | Invoice generator service + local storage service | 1.5h |
| 6 | B5, B7 | Invoice routes (`/api/invoices/{token}`, `/pdf`, `/logo`) + server.py include | 1h |
| 7 | B6 | Hook into POS order webhook → generate invoice → inject `einvoice_link` | 0.5h |
| 8 | — | Update mock HTML to match final template | 0.5h |
| 9 | — | Curl + screenshot verification (all 12+ ACs) | 1h |
| **Total** | | | **~9.5h** |

---

## 10. Acceptance Criteria

| # | Criterion | Method |
|---|---|---|
| AC-1 | Bill Settings section renders in Profile page with all fields | screenshot |
| AC-2 | Logo upload works (file → stored → preview shown) | screenshot |
| AC-3 | Logo URL input works (paste URL → preview shown) | screenshot |
| AC-4 | Color pickers for header/accent work | screenshot |
| AC-5 | All toggles save and persist on reload | curl + screenshot |
| AC-6 | `bill_settings` stored as sub-doc on users collection | curl GET /me |
| AC-7 | Invoice HTML renders with restaurant's bill_settings (colors, logo, toggles) | GET /api/invoices/{token} |
| AC-8 | Invoice shows correct totals structure: Item Total → Delivery → Subtotal → Discounts → Tax → Grand Total | visual |
| AC-9 | Invoice number format: `{prefix}/{bill_number}` from POS | visual |
| AC-10 | No Order ID on invoice | visual |
| AC-11 | SAC code in footer (when toggle ON) | visual |
| AC-12 | Delivery invoice shows delivery address + delivery charge | visual |
| AC-13 | Dine-in invoice shows table number | visual |
| AC-14 | Loyalty section hidden when toggle OFF | visual |
| AC-15 | PDF download works from invoice page | click test |
| AC-16 | `einvoice_link` populated in `send_bill` WhatsApp event_data | curl + DB check |
| AC-17 | Invoice link works without authentication (public token URL) | curl |

---

## 11. Open Questions for Owner

| # | Question | Impact |
|---|---|---|
| Q1 | **Bill logo CDN URL**: MyGenie returns filename `2025-12-20-6946a5a9cba38.png` but no base URL. What's the full URL to access this image? | Needed for auto-fetch on login |
| Q2 | **SAC code**: Should we default to `996331` (restaurant service) for all restaurants, or should some use different codes? | Default in bill_settings |
| Q3 | **PDF generation library**: `reportlab` (already installed) or `weasyprint` (HTML→PDF, exact visual match)? reportlab is faster but layout differs from HTML. weasyprint gives pixel-perfect match. | Performance vs fidelity |

---

**End of Phase 2 Planning Doc. Ready for implementation after owner review + Q1-Q3 answers.**
