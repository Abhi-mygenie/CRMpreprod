# Bug Registry — WhatsApp Campaign Variable Resolution

**Date Registered**: 2026-06-17  
**Reporter**: Investigation during live testing  
**Environment**: https://mygenie-crm-7.preview.emergentagent.com  

---

## BUG-001: Campaign menu_pick_resolved not copied from template mappings

**Severity**: CRITICAL  
**Status**: Open  
**Component**: Frontend — CampaignWizardPage.jsx  

**Description**: When creating a campaign and selecting a template, the `menu_pick_resolved` data (static menu item names like "Rpay Test", "Idli Sambar") is never loaded from the template variable map API or set when user selects a template. Campaign always saves `menu_pick_resolved: {}`.

**Root Cause**: Two missing lines in `CampaignWizardPage.jsx`:
1. Line 132-135: `menu_pick_resolved` not extracted from `/whatsapp/template-variable-map` response
2. Line 158-164: `handleTemplateSelect()` doesn't call `setMenuPickResolved()` when template is picked

**Reproduction**:
1. Templates page: map variables {{3}}→Rpay Test (menu_pick), {{4}}→Idli Sambar (menu_pick) — saves correctly
2. Campaign wizard: select same template → variable_mappings ✅, variable_modes ✅, menu_pick_resolved ❌ empty
3. Send campaign → body_values {{3}}="", {{4}}="" → Meta rejects "Not Sent"

**Evidence**:
```
Templates page (whatsapp_template_variable_map):
  menu_pick_resolved: {"menu_item:181897:name": "Rpay Test", "menu_item:70680:name": "Idli Sambar", ...}

Campaign (campaigns collection):
  menu_pick_resolved: {}   ← EMPTY — never copied
```

**Affected Users**: Any user creating campaigns with templates that use menu_pick variables  
**Current Impact**: 1 campaign (Menu, mygeniedev) — failed to deliver due to empty variables  

---

## BUG-002: Event-scoped variables resolve to empty in campaign sends

**Severity**: HIGH  
**Status**: Open  
**Component**: Backend design + Frontend UX  

**Description**: Templates designed for order events (e.g., `payment_bill`) use variables like `payment_method`, `order_date`, `restaurant_order_id` etc. that only populate from `event_data` during POS order triggers. When the same template is used in a campaign (broadcast), `event_data` is always `{}`, causing these variables to resolve to `""`. Meta/WhatsApp rejects messages with empty variable values.

**Root Cause**: 
- Backend: `_execute_campaign_send()` passes `event_data={}` to `build_body_values()` — this is correct by design (campaigns don't have order context)
- Frontend: Campaign wizard does NOT warn user that event-scoped variables will be empty
- 23 of 40 registered variables are event-only and will always be empty in campaigns

**Reproduction**:
1. Campaign wizard: select `payment_bill` template (7 variables)
2. Variables mapped: customer_name ✅, restaurant_name ✅, order_time ❌, transaction_id ❌, points_earned ❌, points_redeemed ❌, points_earned ❌
3. Send campaign → 5 of 7 variables resolve to "" → Meta rejects

**Safe variables for campaigns** (always resolve from customer/brand data):
- customer_name, restaurant_name, points_balance, tier, total_visits, total_spent, wallet_balance
- instagram_link, google_review_link, feedback_link
- All text-mode variables (literal strings)
- All menu_pick variables (static values — IF BUG-001 is fixed)

**Event-only variables** (always empty in campaigns):
- payment_method, order_date, order_time, restaurant_order_id, order_id, transaction_id
- table_id, waiter_name, order_type, order_notes, item_count, tax_amount
- loyalty_points_used, loyalty_discount, wallet_used, einvoice_token
- points_earned, coupon_code/title/discount/expiry, rating, old_tier, expiring_points, expiry_date

**Affected Users**: Any user who selects an order-event template for campaign broadcast  

---

## BUG-003: Campaign template dropdown shows rejected/pending templates

**Severity**: MEDIUM  
**Status**: Open  
**Component**: Frontend — CampaignWizardPage.jsx  

**Description**: Campaign wizard template dropdown shows ALL AuthKey templates including rejected (temp_status=3) and pending (temp_status=4). Violates Rule 1: "Only Meta-approved templates can be mapped."

**Root Cause**: `CampaignWizardPage.jsx` line 125-131 loads all templates from `/whatsapp/authkey-templates` without filtering by `temp_status`.

**Evidence**: Screenshot shows `test_17june` (0 variables, rejected), `bill_sample` (0 variables, rejected), `test_17_june` (0 variables, rejected) in the dropdown alongside approved templates.

**Affected Users**: All campaign wizard users  

---

## BUG-004: Campaign test-send not visible in Message Status dashboard

**Severity**: LOW  
**Status**: Open  
**Component**: Backend — campaigns.py  

**Description**: Campaign test sends (from "Send Test" button in wizard) log to `campaign_test_sends` collection but NOT to `whatsapp_message_logs`. Message Status dashboard only reads from `whatsapp_message_logs`, so test sends are invisible.

**Root Cause**: `test_send_campaign()` endpoint (line 443-545) writes to `campaign_test_sends` and does NOT call `log_message_attempt()`.

**Note**: Real campaign sends (via `_execute_campaign_send`) DO log to `whatsapp_message_logs` correctly.

**Affected Users**: Users testing campaigns before scheduling  

---

## Cross-Reference Matrix

| Bug | Affects Send | Affects Display | Code Bug | Design Gap | UX Gap |
|---|---|---|---|---|---|
| BUG-001 | ✅ Messages fail | — | ✅ | — | — |
| BUG-002 | ✅ Messages fail | — | — | ✅ | ✅ |
| BUG-003 | Risk of using rejected template | ✅ Wrong templates shown | ✅ | — | — |
| BUG-004 | — | ✅ Test sends invisible | ✅ | — | — |
