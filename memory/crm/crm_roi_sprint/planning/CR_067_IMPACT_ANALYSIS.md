# CR-067 — Impact Analysis
## WhatsApp Template Deletion + Lifecycle Sync

**ID**: CR-067  
**Date**: 2026-08-06  
**Role**: Planning Agent  
**Stage**: Impact Analysis  
**Risk**: MEDIUM — touches WhatsApp router (hotspot) but isolated from send path  

---

## 1. Registration Verified

CR-067 registered in `CR_STATUS_DASHBOARD.md`. Intake: `discovery/CR_067_TEMPLATE_DELETION_LIFECYCLE_INTAKE.md`.

---

## 2. Owner Decisions Locked

| Q | Decision |
|---|---|
| **Q1** | **LOCKED: Both** — delete locally AND call Meta DELETE API. Warning modal shown before delete. |
| **Q2** | **LOCKED: Block delete** — if template is mapped to an event or used in a campaign, block with error. |
| **Q3** | **LOCKED: (a) Auto-delete** — during AuthKey sync, permanently remove the local `custom_templates` record from MongoDB if its `authkey_wid` no longer appears in AuthKey's template list. No badge, no stale marker — clean removal. |
| **Q4** | **LOCKED: Now** — implement in this sprint alongside CR-068. |

*Q3 confirmed 2026-08-06: owner answered "A" (auto-delete) after clarification of what auto-delete vs badge means.*

---

## 3. Code Reality

### What already exists

| Item | Location | Status |
|---|---|---|
| Local delete endpoint `DELETE /custom-templates/{id}` | `whatsapp.py:565` | ✅ EXISTS |
| In-use block (event map + campaign check) | `whatsapp.py:571-586` | ✅ EXISTS — **Q2 already implemented** |
| Variable map cleanup on delete | `whatsapp.py:593-595` | ✅ EXISTS |
| Template status check (Meta poll) | `whatsapp.py:637-686` | EXISTS but GAP-3 (no deleted detection) |
| AuthKey sync + authkey_wid backfill | `whatsapp.py:1024-1140` | EXISTS but GAP-4 (no stale marking) |
| Delete button on TemplatesPage | `TemplatesPage.jsx:362-364` | EXISTS but no warning modal — direct delete |

### What is missing (the 3 gaps to fix)

| Gap | Location | What's missing |
|---|---|---|
| **GAP-1** | `whatsapp.py:565` | Meta DELETE API call before local delete |
| **GAP-3** | `whatsapp.py:668-669` | `status_map` has no "deleted" entry — Meta 404 / missing template goes unhandled |
| **GAP-4** | `whatsapp.py:1140` | AuthKey sync never marks local records stale when `authkey_wid` disappears from AuthKey list |
| **Warning modal** | `TemplatesPage.jsx:362-364` | Direct delete with no confirmation dialog |

*GAP-2 (AuthKey delete API) remains BLOCKED — AuthKey has no public delete API. Out of scope for this CR.*

---

## 4. Data Flow — Delete with Meta Cascade (Q1)

```
Current:
  User clicks Trash → DELETE /api/whatsapp/custom-templates/{id}
    → in-use check → local delete → variable map delete → done

After CR-067 Phase 1 (warning modal):
  User clicks Trash → Warning modal: "This also deletes on Meta. Cannot be undone."
    → User confirms → DELETE /api/whatsapp/custom-templates/{id}
    → in-use check (already exists)
    → Meta DELETE /{WABA_ID}/message_templates {"name": template_name}
    → if Meta success: local delete + variable map delete
    → if Meta fails + no local record yet: surface error to user
    → if tenant has no WABA credentials: local-only delete with toast "deleted locally only"

After CR-067 Phase 2 (stale detection):
  GET /api/whatsapp/custom-templates/{id}/status (already exists)
    → Meta returns 404 or "DELETED" status
    → CRM marks local record status="deleted_on_meta"
    → TemplatesPage shows greyed-out "Deleted on Meta" badge

  POST /api/whatsapp/authkey/sync-templates
    → Sync returns AuthKey template list
    → For each local CRM template with authkey_wid:
        if authkey_wid NOT in AuthKey list → mark status="deleted_on_meta"
```

---

## 5. Files WILL Change

| File | Lines affected | Change | Risk |
|---|---|---|---|
| `routers/whatsapp.py` | ~565-596 | Extend `delete_custom_template`: add Meta DELETE call (skip gracefully if no WABA creds) | MEDIUM — hotspot file |
| `routers/whatsapp.py` | ~668-669 | `check_template_status`: add "deleted" / 404 handling to `status_map` | LOW — isolated function |
| `routers/whatsapp.py` | ~1140 | `sync_authkey_templates`: after wid backfill, mark local records with orphaned authkey_wid as `status="deleted_on_meta"` | LOW — additive |
| `TemplatesPage.jsx` | ~362-364 | Replace direct `handleDeleteCustomTemplate` call with confirmation AlertDialog (warning modal per Q1) | LOW — frontend only |

---

## 6. Files WILL NOT Change

| File | Reason |
|---|---|
| `core/whatsapp.py` | Send path — unrelated |
| `core/campaign_jobs.py` | Scheduler — unrelated |
| `routers/campaigns.py` | Campaign send — already guards missing templates |
| `routers/pos.py` | POS gateway — unrelated |
| `models/schemas.py` | `status` field already flexible string — no schema change |
| `TemplateBuilderPage.jsx` | Will auto-show correct status pill if status becomes "deleted_on_meta" — no code change needed |

---

## 7. Downstream Consumer Check

| Consumer | Impact |
|---|---|
| WhatsApp Automation page (event → template binding) | No impact — in-use block prevents deleting mapped templates |
| Campaign wizard (template picker dropdown) | No impact — campaigns block delete; `list_custom_templates` can filter out `status="deleted_on_meta"` |
| AuthKey send path (`send_bulk_messages`) | No impact — deleted templates won't be selected by user |
| `check_template_status` polling (builder page) | Benefits — will correctly detect and mark deleted templates |

---

## 8. Meta DELETE API — confirmed reference

```http
DELETE https://graph.facebook.com/v21.0/{WABA_ID}/message_templates
Authorization: Bearer {META_ACCESS_TOKEN}
Content-Type: application/json

{"name": "template_name_lowercase"}
```

Response: `{"success": true}`

Rules:
- Template name reserved 30 days after deletion
- Deletes ALL language versions
- Requires `whatsapp_business_management` permission
- Tenants without `meta_waba_id` / `meta_access_token` → skip Meta call, local-only delete with toast

---

## 9. Edge Cases

| Case | Handling |
|---|---|
| Tenant has no Meta WABA credentials | Skip Meta DELETE, delete locally, toast "Removed from CRM only (no Meta credentials configured)" |
| Meta DELETE succeeds but local delete fails | Extremely rare — local delete is MongoDB, very reliable. Log error. |
| Template already deleted on Meta (stale) when user tries to delete from CRM | Meta DELETE returns error → ignore error, proceed with local delete |
| Template mapped to event when user clicks delete | Backend 400 "Template is mapped to event X. Unmap it first." (already coded) |

---

## 10. Verification Matrix

| # | Test | Expected |
|---|---|---|
| V1 | Click delete on a non-in-use template | Warning modal appears with template name |
| V2 | Confirm delete (tenant with WABA creds) | Template removed from Meta + local + variable map |
| V3 | Confirm delete (tenant without WABA creds) | Template removed locally only, toast "Removed from CRM only" |
| V4 | Try to delete a template mapped to an event | 400 error "Template is mapped to event X. Unmap it first." |
| V5 | Try to delete a template used in a campaign | 400 error "Template is used in campaign Y." |
| V6 | Run AuthKey sync after a template was deleted on Meta | Template gets `status="deleted_on_meta"` badge |
| V7 | `GET /api/whatsapp/custom-templates/{id}/status` for deleted template | Returns `status="deleted_on_meta"` |
| V8 | TemplatesPage shows deleted template | Grey "Deleted on Meta" badge visible |
| V9 | Deleted template cannot be submitted to Meta | Already blocked by `status === "approved"` guard (or add "deleted" guard) |
| V10 | Regression: normal AuthKey sync still backfills authkey_wid | Non-stale templates still updated correctly |

---

## 11. Effort Estimate

| Phase | Scope | Estimate |
|---|---|---|
| Phase 1 | Warning modal (TemplatesPage) + Meta DELETE call in delete endpoint + graceful no-WABA path | ~1.5 hrs |
| Phase 2 | GAP-3: status check deleted detection + GAP-4: stale marking in AuthKey sync | ~1 hr |
| **Total** | | **~2.5 hrs** |

---

```
Planning complete: CR-067 (Impact Analysis)
Stage: Impact Analysis
Code reality: PARTIAL (in-use block + local delete exist; Meta cascade + warning modal + stale marking missing)
Risk: MEDIUM (whatsapp.py is hotspot — isolated to non-send-path functions)
Files WILL change: routers/whatsapp.py (3 functions), TemplatesPage.jsx (1 function)
Files WILL NOT touch: core/whatsapp.py, campaigns.py, pos.py, models/schemas.py, TemplateBuilderPage.jsx
Owner decisions: Q1-Q4 all LOCKED (CR-067) · Q1-Q3 all LOCKED (CR-068)
```
