# QA Handover — GAP A/C Fixes (Template Rules & Actions)

**Date**: 2026-06-17  
**Build**: Latest (post-fix)  
**Environment**: https://mygenie-crm-7.preview.emergentagent.com

---

## Summary of Changes

### Business Rules Implemented
1. **Only Meta-approved templates can be mapped** — "Map" button and "Mapped/Not Mapped" badge hidden for non-approved templates
2. **Mapped templates cannot be deleted** — Delete button replaced with "In Use" lock for templates referenced by events or campaigns

### Additional Fixes
- Rejected custom templates now show "Edit & Resubmit" button (opens template builder)
- Custom template badge correctly shows "Rejected" (red) instead of "Draft" (gray)
- "Not Usable" badge shown for non-approved AuthKey templates instead of misleading "Mapped"

---

## Files Changed

| File | Changes |
|---|---|
| `/app/backend/routers/whatsapp.py` | New `GET /templates-in-use` endpoint; DELETE guard checking event_map + campaigns |
| `/app/frontend/src/pages/TemplatesPage.jsx` | Map button gated by temp_status; badge logic; in-use check; rejected actions; badge fix |

---

## Test Cases

### TC-A1: Approved Templates — Map Button Visible
**Page**: /templates (filter: Approved)  
**Account**: owner@mygeniedev.com / Qplazm@10  
**Expected**:
- "Map" button visible on each approved template card
- Green "Mapped" or amber "Not Mapped" badge shown
- Variable mapping pills ({{1}} → Customer Name) visible

### TC-A2: Rejected Templates — Map Button Hidden
**Page**: /templates (filter: Rejected)  
**Expected**:
- "Map" button NOT visible on rejected template cards
- Gray "Not Usable" badge instead of "Mapped"/"Not Mapped"
- Variable mapping pills NOT shown
- Only "Preview" button available
- Red "Rejected" status badge visible

### TC-A3: Pending Templates — Map Button Hidden
**Page**: /templates (filter: Pending)  
**Account**: owner@kunafamahal.com / Qplazm@10 (14 pending templates)  
**Expected**:
- Same behavior as rejected — no Map, "Not Usable" badge, only Preview

### TC-A4: Rejected Custom Template — Edit & Resubmit Button
**Page**: /templates (filter: Draft)  
**Account**: owner@kunafamahal.com / Qplazm@10  
**Expected**:
- `order_bill_test` shows red "Rejected" badge (not gray "Draft")
- "Edit & Resubmit" button visible (red outline)
- Clicking opens Template Builder page
- On save in builder, status resets to "draft" (existing behavior)

### TC-A5: Pending Custom Template — Awaiting Approval + Delete
**Page**: /templates (filter: Draft)  
**Account**: owner@mayur.com / Qplazm@10  
**Expected**:
- Pending templates show "Awaiting approval" text
- Delete (trash) icon visible if template is NOT in use
- "In Use" lock icon if template IS referenced by event or campaign

### TC-A6: In-Use Template — Delete Blocked (Frontend)
**Setup**: A template that is mapped to an event or used in a campaign  
**Expected**:
- Delete button replaced with gray lock icon + "In Use" text
- Tooltip: "Template is in use by events or campaigns"

### TC-A7: In-Use Template — Delete Blocked (Backend)
**API Test**:
```bash
curl -X DELETE "{API_URL}/api/whatsapp/custom-templates/{in-use-template-id}" \
  -H "Authorization: Bearer {token}"
```
**Expected**: 400 response with detail message:
- "Template is mapped to event '{event_key}' and cannot be deleted. Unmap it first."
- OR "Template is used in campaign '{name}' and cannot be deleted."

### TC-A8: Not-In-Use Template — Delete Works
**API Test**: Delete a custom template that is NOT in events or campaigns  
**Expected**: 200 response with "Template deleted" + variable mappings cleaned up

### TC-A9: Templates-In-Use Endpoint
**API Test**:
```bash
curl "{API_URL}/api/whatsapp/templates-in-use" -H "Authorization: Bearer {token}"
```
**Expected**: Returns JSON with `in_use_template_ids` array containing all template IDs referenced by events or campaigns

---

## Regression Test Cases

### RT-A1: Approved Templates Still Fully Functional
- Map button works → opens variable mapping modal
- Preview button works → shows WhatsApp preview
- Variable pills display correctly with labels
- Mapped/Not Mapped toggle on Approved filter works

### RT-A2: Event Mapping Dropdown
- Navigate to Automation tab
- Click Configure on any event
- Dropdown should only show Approved + Fully Mapped templates
- Rejected/Pending templates should NOT appear

### RT-A3: Existing Mappings Not Affected
- Events already mapped to templates should still display correctly
- Warning text shows if mapped template is rejected/pending

### RT-A4: Template Builder Flow
- "Add Template" button still works
- Creating a new template → status = draft
- Edit draft → Submit to Meta → status = pending
- Edit & Resubmit rejected → opens builder → save resets to draft

---

## data-testid Reference

| Element | data-testid |
|---|---|
| Status badge (AuthKey template) | `status-badge-{wid}` |
| Mapped/Not Usable badge | `mapped-badge-{wid}` |
| Map button (AuthKey) | `map-vars-{wid}` |
| Custom template status badge | `custom-status-{id}` |
| Edit & Resubmit button | `edit-resubmit-{id}` |
| Delete button (custom) | `delete-custom-{id}` |

---

## Test Accounts

| Account | Password | Templates | Custom Templates | Notes |
|---|---|---|---|---|
| owner@mygeniedev.com | Qplazm@10 | 4 (3 approved, 1 rejected) | 0 | Main test account |
| owner@kunafamahal.com | Qplazm@10 | 43 (27 approved, 2 rejected, 14 pending) | 1 rejected | Best for testing all states |
| owner@mayur.com | Qplazm@10 | 43 | 2 pending | Test pending custom templates |

---

## Smoke Test Results (Verified)

| Test | Result | Screenshot |
|---|---|---|
| Approved filter — Map + Mapped badge visible | ✅ PASS | Shows Map, Preview, Mapped/Not Mapped |
| Rejected filter — No Map, "Not Usable" badge | ✅ PASS | Shows only Preview + Not Usable |
| Rejected custom template — Edit & Resubmit | ✅ PASS | Red button visible, Delete visible (not in use) |
| Backend /templates-in-use | ✅ PASS | Returns correct IDs |
| Backend DELETE guard (404 for missing) | ✅ PASS | Returns "Template not found" |
