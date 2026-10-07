# CR-004 — Phase 3 · Event Reconciliation · Live Test Report

**CR:** CR-004 WhatsApp Utility + Marketing Message Integration
**Phase:** P3 — Event Reconciliation — Live End-to-End Test
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-28
**Status:** `cr004_phase_3_live_test_passed`
**Test user:** `owner@kunafamahal.com` / `Qplazm@10` (R689 Kunafa Mahal)

---

## 1. Test Verdict

```
cr004_phase_3_live_test_passed — WhatsApp delivered to real customer
```

---

## 2. Test Setup

### Event→Template Mapping (GAP-1 fix)
Configured via API: `PUT /whatsapp/event-template-map`

| Event Key | Template | wid | Status |
|---|---|---|---|
| `send_bill` | `send_bill_to_customer` | 26508 | Active |
| `send_bill_auto` | `send_bill_to_customer` | 26508 | Active |
| `send_bill_manual` | `send_bill_to_customer` | 26508 | Active |

### Variable Mapping (GAP-2 fix)
Configured via API: `PUT /whatsapp/template-variable-map/26508`

| Placeholder | Variable | Mode | Resolves To |
|---|---|---|---|
| `{{1}}` | `customer_name` | map | Customer's name from DB |
| `{{2}}` | `amount` | map | Order amount (currency formatted) |
| `{{3}}` | `"your order"` | text | Static text |
| `{{4}}` | `"counter"` | text | Static text |
| `{{5}}` | `restaurant_name` | map | Brand name from users collection |

---

## 3. Live Test Execution

### Test Order
- **POS Order ID:** 869305
- **Restaurant:** R689 Kunafa Mahal
- **Order Amount:** ₹775.00
- **Customer:** abhishek jain
- **Customer Phone:** 7505242126
- **Timestamp:** 2026-05-28T08:49:02 UTC

### Path Taken
```
MyGenie POS → POST /api/pos/orders → preprod.mygenie.online (production CRM)
  → Order saved to shared MongoDB
  → send_bill event triggered
  → Looked up whatsapp_event_template_map → found send_bill → template 26508
  → Resolved variables:
      {{1}} = "abhishek jain"
      {{2}} = "Rs.775"
      {{3}} = "your order"
      {{4}} = "counter"
      {{5}} = "Kunafa Mahal"
  → Sent via AuthKey.io to 917505242126
  → Logged to whatsapp_message_logs
  → Customer received WhatsApp message ✅
```

### Architecture Note
POS calls `preprod.mygenie.online` (production CRM), NOT this preview server. However, both servers share the **same external MongoDB** (`52.66.232.149:27017/mygenie`). The event→template mapping configured on the preview server was read by the production server at trigger time. This confirms the DB-driven mapping architecture works across environments.

---

## 4. Results

| Check | Result |
|---|---|
| Order processed | ✅ pos_order_id=869305, amount=775.0 |
| `send_bill` event triggered | ✅ Log entry in whatsapp_message_logs |
| Template resolved | ✅ send_bill_to_customer (wid=26508) |
| Body values correct | ✅ `{1: "abhishek jain", 2: "Rs.775", 3: "your order", 4: "counter", 5: "Kunafa Mahal"}` |
| Phone correct | ✅ 7505242126 (customer's phone from POS payload) |
| AuthKey accepted | ✅ status=pending, error=None |
| **WhatsApp delivered** | **✅ Customer confirmed receipt** |

---

## 5. Known Issues from Test

| # | Issue | Severity | Description |
|---|---|---|---|
| 1 | `message_id: None` in logs | 🟡 LOW | AuthKey response doesn't return message_id in expected format. Delivery works but tracking/status callback may not link correctly. |
| 2 | Double "Rs" prefix | 🟡 COSMETIC | Template says "Rs {{2}}" and variable resolves to "Rs.775" → message shows "Rs Rs.775". Need raw amount variable or template update. |
| 3 | Static text for {{3}} and {{4}} | ℹ️ INFO | "your order" and "counter" are hardcoded. Ideally these should be dynamic (item names, payment mode from POS). Requires POS schema changes. |

---

## 6. Next Priority Actions

### P0 — Immediate (next session)
1. **Check message report in AuthKey dashboard** — verify delivery status, message_id, read receipt
2. **Check message status on CRM dashboard** (`/message-status` page) — verify the send_bill log appears with correct details
3. **Investigate `message_id: None`** — parse AuthKey response format to extract message_id for status callback tracking

### P1 — Follow-up
4. Add `raw_amount` variable (no "Rs." prefix) to fix double-prefix cosmetic issue
5. Add `payment_mode` and `item_summary` to POS trigger event_data for dynamic {{3}} and {{4}}
6. Test `send_bill_auto` path (POS event gateway) in addition to order webhook path

---

## 7. Status

```
cr004_phase_3_live_test_passed
```

End of CR-004 Phase 3 Live Test Report.
