# QA Handover Document — WhatsApp Integration GAP 1 & GAP 2 Fixes

**Date**: 2026-06-17  
**Build**: Latest (post-fix)  
**Environment**: https://mygenie-crm-7.preview.emergentagent.com  
**Test Account**: owner@mygeniedev.com / Qplazm@10  

---

## Summary of Changes

### GAP 1: Template Approval Status Display
AuthKey API returns `temp_status` (1=Approved, 3=Rejected, 4=Pending) for each template. Previously, the UI ignored this field and treated all templates as "Approved". Now the UI correctly filters and badges templates by their actual approval status.

### GAP 2: Message Status — Event/Template/Failure Reason Display
The Message Status page previously showed only: Name, Phone, Status, Time, Action. Now it shows Event type, Template name, and failure reasons. Clicking any row expands a detail panel showing body values sent and a status timeline.

---

## Files Changed

| File | Change Type | GAP |
|---|---|---|
| `/app/frontend/src/pages/TemplatesPage.jsx` | Modified | GAP 1 |
| `/app/frontend/src/components/shared/WhatsAppAutomationContent.jsx` | Modified | GAP 1 |
| `/app/frontend/src/pages/MessageStatusPage.jsx` | Modified | GAP 2 |
| `/app/backend/routers/whatsapp.py` | Modified (1 line) | GAP 2 |

---

## Test Cases — GAP 1: Template Approval Status

### TC-1.1: Approved Filter Shows Only Approved Templates
**Page**: /templates  
**Steps**:
1. Login with test account
2. Navigate to WhatsApp → Templates
3. Default filter should be "Approved (N)" where N = count of approved templates

**Expected**:
- Only templates with `temp_status=1` are displayed
- Each template card shows a green "Approved" badge next to the name
- Filter dropdown shows accurate counts: "Approved (3)", "Pending (0)", "Rejected (2)"
- Mapped/Not Mapped toggle counts are based on approved templates only

**Test Data**: This account has 4 AuthKey templates:
- `payment_bill` (temp_status=1, Approved)
- `payment_bill_man` (temp_status=1, Approved)
- `menu` (temp_status=1, Approved)
- `bill_sample` (temp_status=3, Rejected)

### TC-1.2: Rejected Filter Shows Rejected Templates
**Steps**:
1. On /templates page, click the status filter dropdown
2. Select "Rejected (2)"

**Expected**:
- Shows `bill_sample` and `test_17_june` with red "Rejected" badges
- Mapped/Not Mapped toggle is hidden (only shows for Approved filter)
- Templates can still be mapped/previewed

### TC-1.3: Pending Filter Shows Pending Templates
**Steps**:
1. Select "Pending (0)" from filter dropdown

**Expected**:
- Shows "No templates match the current filters" (this account has 0 pending)
- To test with pending templates, use account `owner@kunafamahal.com` which has 14 pending templates

### TC-1.4: All Filter Shows Everything
**Steps**:
1. Select "All" from filter dropdown

**Expected**:
- Shows all 4 AuthKey templates
- Each has the correct status badge (3 green "Approved" + 1 red "Rejected")
- Also shows custom/draft templates if any exist

### TC-1.5: Event Mapping Dropdown Only Shows Approved Templates
**Page**: WhatsApp → Automation  
**Steps**:
1. Navigate to Automation tab
2. Click "Configure" on any event card
3. Open the template dropdown

**Expected**:
- Only Approved templates (temp_status=1) appear in the dropdown
- Rejected template `bill_sample` is NOT in the dropdown
- Templates must also be fully variable-mapped to appear

### TC-1.6: Warning on Event Card with Rejected/Pending Template
**Steps**:
1. If an event is mapped to a template that later gets rejected by Meta
2. Check the event card in the Automation tab

**Expected**:
- Red warning text below template name: "This template was rejected by Meta and cannot deliver messages"
- For pending: amber text: "This template is pending Meta approval"

**Current state**: `bill_sample` is mapped to `new_order_customer` (disabled) — verify warning shows on that event card.

### TC-1.7: Cross-Account Validation
**Account**: owner@kunafamahal.com  
**Steps**: 
1. Login with Kunafa Mahal account
2. Check Templates page

**Expected**:
- Approved (27) — 27 templates with green badges
- Pending (14) — 14 templates with amber badges
- Rejected (2) — 2 templates with red badges

---

## Test Cases — GAP 2: Message Status Enhancements

### TC-2.1: New Columns Visible in Desktop Table
**Page**: /message-status  
**Steps**:
1. Login with test account
2. Navigate to Message Status page

**Expected**:
- Table headers: ☐ | NAME | PHONE | EVENT | TEMPLATE | STATUS | TIME | ACTION
- Each row shows event type (e.g., "send bill") as a gray pill/tag
- Each row shows template name (e.g., "payment_bill")

### TC-2.2: Expandable Row Detail Panel
**Steps**:
1. Click on any message row

**Expected**:
- Row expands to show a detail panel with two sections:
  - **Left — Message Details**: Event, Template, Order # (if POS order), Values sent (each variable as a tag)
  - **Right — Status Timeline**: List of status transitions with colored dots and timestamps
- Clicking the same row again collapses the panel
- Clicking a different row collapses the previous and expands the new one

**Sample data for first row (saurav)**:
- Event: send bill
- Template: payment_bill
- Order: #939914
- Values: {{1}}=saurav, {{2}}=Mygenie Dev, {{3}}=11:02 PM, {{4}}=(empty), {{5}}=2, {{6}}=0, {{7}}=2
- Timeline: Pending → 1h ago

### TC-2.3: Failure Reason Display (When Status = Rejected)
**Steps**:
1. Filter messages by "Failed" status
2. Check rejected message rows

**Expected**:
- Below the template name in the table, a red failure reason text appears
- In the expanded panel, a red box shows "Failure: {reason}"
- Current account has 0 rejected messages, so this needs to be tested with a failing send or different account

**How to trigger a failure for testing**:
1. Go to WhatsApp → Automation
2. Test-send a template with an invalid phone number (e.g., "1234")
3. Check Message Status — should show as rejected with error reason

### TC-2.4: Mobile Card View Shows Event + Template
**Steps**:
1. Resize browser to mobile width (<1024px)
2. Check message cards

**Expected**:
- Each card shows event type as a small tag and template name
- For rejected messages, failure reason appears in red below

### TC-2.5: Checkbox + Resend Still Work
**Steps**:
1. Click the checkbox on a pending message (don't click the row itself)
2. Click "Resend Selected"

**Expected**:
- Checkbox toggles without expanding the row (stopPropagation works)
- Resend button works correctly
- Row click vs checkbox click don't interfere

### TC-2.6: Backend Failure Reason Capture (Defensive)
**File**: `/app/backend/routers/whatsapp.py`  
**Change**: Webhook status callback now checks multiple field names for failure reason

**Expected behavior**:
- When AuthKey sends a `status: "failed"` webhook, the system captures the reason from: `reason`, `Reason`, `error`, `Error`, `description`, `Message`, `message`, or falls back to the raw status string
- No behavioral change for current webhooks (AuthKey currently sends no reason field — fallback to "failed")

---

## Regression Test Cases

### RT-1: Existing Event Mappings Still Work
**Steps**:
1. Check Automation tab — existing event-template mappings should display correctly
2. Active events should still show green "Active" badge
3. Disabled events should show "Paused"

### RT-2: Template Variable Mapping Still Works
**Steps**:
1. Go to Templates page
2. Click "Map" on any approved template
3. Variable mapping modal should open and save correctly

### RT-3: Test Template Send Still Works
**Steps**:
1. From Automation tab, click the test (flask) icon on a configured event
2. Enter a valid phone number
3. Send test message

**Expected**: Message sends successfully and appears in Message Status

### RT-4: Template Preview Still Works
**Steps**:
1. On Templates page, click "Preview" on any template
2. WhatsApp-style preview should show with resolved variables

### RT-5: Message Status Filters Still Work
**Steps**:
1. On Message Status page, test each filter:
   - Status filter (All, Pending, Delivered, Read, Failed)
   - Event filter
   - Campaign filter
   - Template filter
   - Search by name/phone
   - Date range
   - "Show test sends" checkbox

---

## Known Limitations

1. **No rejected messages in test account** — `owner@mygeniedev.com` has 0 rejected messages. To test failure reason display, either:
   - Send a test to an invalid number
   - Use a different account with failed messages
   - Or manually insert a test rejected message in DB

2. **AuthKey `error_desc_creation` field** — Currently `None` for all templates. If AuthKey starts populating this for rejected templates, it would need a separate display (not implemented — out of scope).

3. **Pending templates count = 0 for test account** — Use `owner@kunafamahal.com` to verify Pending filter with 14 pending templates.

4. **GAP 3 (Webhook matching)** — Not addressed in this release. 94.6% of webhooks still don't match message logs. This is a separate investigation item.

---

## Environment Details

| Component | URL/Config |
|---|---|
| Frontend | https://mygenie-crm-7.preview.emergentagent.com |
| Backend API | https://mygenie-crm-7.preview.emergentagent.com/api |
| MongoDB | mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie |
| Test Account 1 | owner@mygeniedev.com / Qplazm@10 (4 templates: 3 approved, 1 rejected) |
| Test Account 2 | owner@kunafamahal.com (43 templates: 27 approved, 2 rejected, 14 pending) |

---

## data-testid Reference

### GAP 1 — Templates Page
| Element | data-testid |
|---|---|
| Status filter dropdown | `status-filter` |
| Status badge on template card | `status-badge-{wid}` |
| Mapped toggle button | `toggle-mapped` |
| Not Mapped toggle button | `toggle-not-mapped` |

### GAP 1 — Automation Page
| Element | data-testid |
|---|---|
| Rejected template warning | `rejected-warning-{eventKey}` |
| Pending template warning | `pending-warning-{eventKey}` |
| Template select in modal | `modal-select-template` |

### GAP 2 — Message Status Page
| Element | data-testid |
|---|---|
| Message row | `message-row-{id}` |
| Expanded detail row | `expanded-row-{id}` |
| Event type cell | `event-type-{id}` |
| Template name cell | `template-name-{id}` |
| Failure reason (inline) | `failure-reason-{id}` |
| Failure detail (expanded) | `failure-detail-{id}` |
| Mobile event tag | `mobile-event-{id}` |
| Mobile failure text | `mobile-failure-{id}` |
