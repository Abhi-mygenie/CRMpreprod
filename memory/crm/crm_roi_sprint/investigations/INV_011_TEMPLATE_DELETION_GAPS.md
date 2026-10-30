# INV-011: Template Deletion — No Meta/AuthKey delete, no sync on external deletion

**Date**: 2026-07-16  
**Reporter**: Owner (Abhishek)  
**Severity**: P2 — UX gap, stale data accumulation, no workaround from CRM  
**Risk**: LOW (investigation only, no code change)  

---

## Problem Statement

1. **No way to delete a template from Meta/AuthKey through the CRM** — the CRM's delete button only removes the local record.
2. **When a template is deleted on Meta (directly), the CRM still shows it** — no sync picks up the deletion.
3. **AuthKey template list has no delete button at all** in the CRM UI.

---

## Current State — Code Trace

### What EXISTS today

| Layer | Capability | Code Location |
|---|---|---|
| **Backend DELETE endpoint** | `DELETE /api/whatsapp/custom-templates/{id}` | `routers/whatsapp.py:561` |
| **Frontend delete button** | Trash icon on CRM custom templates (not on AuthKey templates) | `TemplatesPage.jsx:598` |
| **Delete guards** | Blocks delete if template is mapped to event or used in campaign | `routers/whatsapp.py:567-581` |

### What the CRM DELETE does (line 561-592)

```
1. Check if template is mapped to an event → block if yes
2. Check if template is used in a campaign → block if yes
3. DELETE from `custom_templates` collection (local MongoDB)
4. DELETE from `whatsapp_template_variable_map` collection (local MongoDB)
5. Return "Template deleted"
```

**Does NOT:**
- Call Meta Graph API to delete the template from Meta
- Call any AuthKey API to delete the template from AuthKey
- Remove from `whatsapp_event_template_map` (must unmap first)
- Remove campaign references

### What the Meta status check does (line 632-682)

```
1. GET /{meta_template_id}?fields=name,status,category,language,quality_score,rejected_reason
2. Map status: APPROVED→approved, REJECTED→rejected, PENDING→pending, PAUSED→approved
3. Update local record with new status
4. On ANY exception (including 404 for deleted templates): log warning, keep old status
```

**Gap:** When Meta returns error/404 for a deleted template, the code catches the exception and returns `"check_failed"` — it does NOT mark the template as deleted or remove it.

Status map has no `DELETED` key:
```python
status_map = {"APPROVED": "approved", "REJECTED": "rejected", "PENDING": "pending", "IN_APPEAL": "pending", "PAUSED": "approved"}
```

### What the AuthKey sync does (line 1078-1121)

```
1. Fetch ALL AuthKey templates via getAllTemplate API
2. Build name→WID lookup
3. For each LOCAL custom_template: if name matches AuthKey template → update WID + status
4. Templates that exist locally but NOT in AuthKey → IGNORED (no cleanup)
```

**Gap:** Only ADDS/UPDATES. Never removes stale local records.

---

## Five Gaps Found

### GAP-1: No Meta deletion API in CRM
**What's missing:** An endpoint that calls Meta's `DELETE /{WABA_ID}/message_templates` API.

**Meta deletion API (confirmed via docs):**
```http
DELETE https://graph.facebook.com/v18.0/{WABA_ID}/message_templates
Authorization: Bearer {ACCESS_TOKEN}
Content-Type: application/json

{"name": "template_name"}
```

**Notes from Meta docs:**
- Template name is **reserved for 30 days** after deletion — cannot reuse immediately
- If template has multiple language versions, ALL versions are deleted
- Sample templates (Meta-provided) cannot be deleted
- Returns HTTP 200 with `{"success": true}` on success

### GAP-2: No AuthKey deletion API in CRM
**What's missing:** AuthKey does NOT expose a public template deletion endpoint in their REST API documentation.

**Investigation finding:** AuthKey's API docs (Postman collection) only document:
- `getAllTemplate.php` — list templates
- `requestjson.php` — send messages  
- `wptemplateMigration.php` — sync/migrate templates

**No `deleteTemplate.php` or equivalent found.** Template deletion on AuthKey appears to be:
- Only through AuthKey console (web UI)
- Or indirectly: delete on Meta → AuthKey eventually reflects it (but unclear timing)

**Recommendation:** Contact AuthKey support to confirm if a deletion API exists.

### GAP-3: Status check doesn't detect deleted templates
**What's missing:** `check_template_status` (line 632) calls Meta GET for the template. When Meta returns an error (e.g., 404 or error object with "does not exist"), the code falls into the generic exception handler and keeps the old status.

**Should:** Detect the error response and mark the template as `"deleted"` locally, or at minimum set status to `"deleted"` or `"unavailable"`.

### GAP-4: AuthKey sync doesn't clean up stale templates
**What's missing:** The sync flow (line 1078-1121) iterates local custom_templates and matches against AuthKey's template list. If a local template's name is NOT found in AuthKey's list (because it was deleted on AuthKey/Meta), the template is simply skipped — no cleanup, no status update.

**Should:** Flag or remove local templates that no longer exist in AuthKey's list after a full sync.

### GAP-5: No delete UI for AuthKey-sourced templates
**What's missing:** The AuthKey templates section in TemplatesPage.jsx (line 608-660) shows template cards with Map, Preview, and status badges — but NO delete button.

This makes sense because:
- AuthKey templates are AuthKey-managed, not CRM-managed
- Deletion should cascade: Meta → AuthKey → CRM

But there's no way for the user to trigger this cascade from the CRM.

---

## Desired Delete Flow (Proposed)

### Scenario A: User deletes template from CRM UI

```
User clicks Delete on CRM template
→ CRM calls Meta DELETE API (remove from Meta)
→ CRM calls AuthKey sync (AuthKey picks up the deletion)
→ CRM removes local record from custom_templates
→ CRM removes variable mappings
→ Done
```

### Scenario B: User deletes template on Meta directly

```
Template deleted on Meta
→ CRM's check_template_status detects 404/error → marks as "deleted"
→ Next AuthKey sync: template no longer in AuthKey list → CRM cleans up local record
→ Done
```

### Scenario C: User deletes template on AuthKey directly

```
Template deleted on AuthKey
→ Next AuthKey sync: template not in list → CRM updates local record status to "deleted"
→ Template still exists on Meta (user must delete separately if needed)
→ Done
```

---

## API Reference for Implementation

### Meta Delete Template API
```
DELETE https://graph.facebook.com/v18.0/{WABA_ID}/message_templates
Headers:
  Authorization: Bearer {META_ACCESS_TOKEN}
  Content-Type: application/json
Body:
  {"name": "template_name_lowercase"}
```
- Success: `{"success": true}`
- Requires: `whatsapp_business_management` permission
- All language versions deleted (no single-language delete)
- Name reserved 30 days post-deletion

### AuthKey Delete Template API
**NOT FOUND** in public docs. Options:
1. Contact AuthKey support (hello@authkey.io) to request API
2. Delete on Meta first → AuthKey auto-removes after sync
3. Delete on AuthKey console (manual, not API-driven)

### CRM Backend Endpoint to Build
```
DELETE /api/whatsapp/custom-templates/{template_id}/full
```
Would need to:
1. Look up template's `meta_template_id` and `template_name`
2. Call Meta DELETE API with template name
3. Handle Meta response (success, already deleted, error)
4. Delete from local `custom_templates`
5. Delete from `whatsapp_template_variable_map`
6. Unmap from `whatsapp_event_template_map` if mapped
7. Trigger AuthKey sync to let AuthKey pick up the deletion

---

## Summary Table

| Gap | Impact | Fix Complexity | Dependency |
|---|---|---|---|
| GAP-1: No Meta delete API | Can't delete templates from CRM | LOW — single Meta API call | Meta access token in user settings |
| GAP-2: No AuthKey delete API | Can't delete from AuthKey programmatically | BLOCKED — AuthKey doesn't expose API | AuthKey support confirmation needed |
| GAP-3: Status check misses deleted | Stale "approved" templates after Meta deletion | LOW — add error/404 handling | None |
| GAP-4: Sync doesn't clean stale | Zombie templates accumulate in CRM | LOW — compare local vs AuthKey list | None |
| GAP-5: No delete UI for AuthKey templates | Users can't manage template lifecycle from CRM | MEDIUM — UI + cascade logic | GAP-1 must be solved first |

---

```
Investigation complete: INV-011
Root cause: DELETE operations are LOCAL-ONLY — no Meta/AuthKey API integration for deletion, no sync detection of external deletions
Classification: FEATURE_GAP (5 gaps identified)
Confidence: HIGH
Steps used: 6/10
Recommendation: Planning → Implementation for GAP-1 + GAP-3 + GAP-4 (no AuthKey dependency). GAP-2 requires AuthKey support. GAP-5 requires GAP-1.
```
