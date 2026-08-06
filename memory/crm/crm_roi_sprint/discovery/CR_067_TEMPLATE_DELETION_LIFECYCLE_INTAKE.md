# CR-067: WhatsApp Template Deletion + Lifecycle Sync

**Date**: 2026-07-16  
**Source**: Owner report during template management  
**Investigation**: INV-011 (`/app/memory/crm/crm_roi_sprint/investigations/INV_011_TEMPLATE_DELETION_GAPS.md`)  

---

## Intake Summary

```
Intake complete: CR-067
Classification: FEATURE GAP
Severity: P2 — stale data accumulates, no CRM-side workaround for template deletion
Risk: MEDIUM — touches WhatsApp integration (Meta Graph API + AuthKey), but isolated from send path
Duplicate check: DISTINCT — no existing CR covers template deletion (CR-037 covers status sync only, CR-064 is customer delete)
Evidence: INV-011 investigation with full code trace
Blast radius: MEDIUM — TemplatesPage, TemplateBuilderPage, routers/whatsapp.py, custom_templates collection
Next: Planning
```

---

## Problem

1. **No Meta delete**: CRM's delete button (`DELETE /api/whatsapp/custom-templates/{id}`) only removes from local MongoDB — template persists on Meta and AuthKey.
2. **No sync on external delete**: If owner deletes a template directly on Meta (via Meta Business Manager) or on AuthKey console, CRM still shows it as "approved".
3. **No AuthKey template delete UI**: The AuthKey-fetched template list in CRM has zero delete/remove buttons.
4. **Stale templates accumulate**: Over time, deleted-on-Meta templates become zombie entries in CRM with incorrect status.

---

## 5 Gaps (from INV-011)

| Gap | Description | Fix Complexity | Dependency |
|---|---|---|---|
| **GAP-1** | No Meta `DELETE /{WABA_ID}/message_templates` API call from CRM | LOW (~30 LOC) | Meta access token in user settings |
| **GAP-2** | No AuthKey template deletion API (not documented publicly) | BLOCKED | AuthKey support confirmation |
| **GAP-3** | `check_template_status` catches Meta 404/error for deleted templates → keeps stale "approved" status | LOW (~15 LOC) | None |
| **GAP-4** | AuthKey sync only adds/updates, never removes — no cleanup of stale local records | LOW (~20 LOC) | None |
| **GAP-5** | No delete UI for AuthKey-sourced templates on TemplatesPage | MEDIUM (FE + cascade) | GAP-1 must be solved first |

---

## Desired Delete Flows

### Flow A: User deletes from CRM UI (new "Delete from Meta" action)
```
User clicks "Delete from Meta" on CRM template card
→ Backend calls Meta DELETE API: DELETE /{WABA_ID}/message_templates {"name": "template_name"}
→ Meta returns {"success": true}
→ Backend deletes from local custom_templates + variable maps
→ Backend triggers AuthKey sync (AuthKey picks up Meta-side deletion on next sync cycle)
→ Frontend refreshes template list
```

### Flow B: User deletes on Meta directly (sync detects it)
```
Template deleted on Meta (via Meta Business Manager)
→ CRM's check_template_status polls Meta → gets 404 or error
→ CRM marks local template as status="deleted"
→ Frontend shows "Deleted on Meta" badge (or hides template)
→ Optional: auto-cleanup local record after X days
```

### Flow C: User deletes on AuthKey directly (sync detects it)
```
Template deleted on AuthKey console
→ Next AuthKey sync: template name not in AuthKey list
→ CRM updates local record: clears authkey_wid, marks status="deleted_authkey"
→ Template still on Meta (user must delete separately if needed)
```

---

## Meta Delete API Reference

```http
DELETE https://graph.facebook.com/v18.0/{WABA_ID}/message_templates
Authorization: Bearer {META_ACCESS_TOKEN}
Content-Type: application/json

{"name": "template_name_lowercase"}
```

**Response:** `{"success": true}` on success

**Rules:**
- Template name reserved for 30 days after deletion (cannot reuse)
- Deletes ALL language versions of the template
- Meta-provided sample templates cannot be deleted
- Requires `whatsapp_business_management` permission on access token

---

## AuthKey Delete API

**NOT FOUND** in public documentation. Investigated:
- `getAllTemplate.php` — list only
- `requestjson.php` — send only
- `wptemplateMigration.php` — sync/migrate only

**Recommendation:** Owner to contact AuthKey support (hello@authkey.io) to confirm if a deletion API exists. If not, deletion path is: delete on Meta → AuthKey auto-reflects after migration sync.

---

## Files That WILL Change

| File | Change | Risk |
|---|---|---|
| `backend/routers/whatsapp.py` | New `DELETE /custom-templates/{id}/meta` endpoint (or extend existing delete) + GAP-3 status check fix + GAP-4 sync cleanup | MEDIUM (WhatsApp router is hotspot) |
| `frontend/src/pages/TemplatesPage.jsx` | Delete confirmation dialog + "Delete from Meta" action + handle deleted status | LOW |
| `frontend/src/pages/TemplateBuilderPage.jsx` | Show "Deleted" status if template was deleted externally | LOW |

## Files That WILL NOT Change

| File | Reason |
|---|---|
| `core/whatsapp.py` | Send path — unrelated to deletion |
| `core/campaign_jobs.py` | Scheduler — unrelated |
| `routers/campaigns.py` | Campaign send — already guards against missing templates |
| `routers/pos.py` | POS gateway — unrelated |
| `models/schemas.py` | No schema changes needed (status field already flexible) |

---

## Owner Questions (Q1–Q4)

| # | Question | Options | Impact |
|---|---|---|---|
| **Q1** | Should CRM delete cascade to Meta automatically? | (a) Yes — one-click "Delete from Meta + CRM" <br> (b) No — separate "Remove from CRM" vs "Delete from Meta" actions <br> (c) Always cascade (no local-only delete) | Determines UX flow |
| **Q2** | What happens to campaigns/events using a deleted template? | (a) Block delete if in-use (current behavior) <br> (b) Allow delete, mark campaigns as "template removed" <br> (c) Force-unmap + delete | Determines cascade rules |
| **Q3** | Should stale templates be auto-cleaned on sync? | (a) Yes — auto-remove local record if not in AuthKey list <br> (b) No — mark as "stale" badge, let owner clean manually <br> (c) Auto-clean after 7 days of stale status | Determines GAP-4 behavior |
| **Q4** | Priority vs other open CRs? | (a) Implement now (in this session) <br> (b) Park — address after BUG-015 and INV-010 verification <br> (c) Backlog — register only | Determines sprint slot |

---

## Recommended Implementation Order

```
Phase 1 (no external dependency):
  GAP-3: Fix check_template_status to detect deleted templates → ~15 min
  GAP-4: Fix AuthKey sync to flag stale templates → ~20 min

Phase 2 (requires Meta API call):
  GAP-1: Add Meta DELETE endpoint → ~30 min
  GAP-5: Add delete UI with confirmation → ~45 min

Phase 3 (blocked on AuthKey):
  GAP-2: AuthKey deletion API (if it exists) → TBD
```

---

```
Intake complete: CR-067
Classification: FEATURE GAP
Severity: P2
Risk: MEDIUM
Duplicate check: DISTINCT
Evidence: INV-011
Blast radius: MEDIUM (3 files, 1 collection, 2 external APIs)
Docs updated: CR_STATUS_DASHBOARD.md, this intake doc
Next: Owner answers Q1-Q4 → Planning
```
