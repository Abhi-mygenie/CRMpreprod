# CR-067 — QA Handover
## WhatsApp Template Deletion + Lifecycle Sync

**Date**: 2026-08-06
**Role**: Implementation Agent
**Status**: Code complete — ready for QA

---

## What was implemented

### Edit 1 — `routers/whatsapp.py` lines 587–638 (GAP-1: Meta DELETE cascade)
`delete_custom_template` extended with:
- Fetch template doc first (to get `template_name` for Meta DELETE)
- Fetch user WABA credentials (`meta_waba_id`, `meta_access_token`)
- If creds present: call `DELETE {META_GRAPH_API_URL}/{waba_id}/message_templates?name={template_name}`
- If Meta fails: log warning, continue with local delete (user may be cleaning up stale records)
- If no creds: local-only delete, `note` field in response
- Returns `{"message": "Template deleted", "meta_deleted": bool, "note": str|absent}`

### Edit 2 — `routers/whatsapp.py` lines 709–721 (GAP-3: deleted detection in status check)
`check_template_status` extended with:
- After `resp = await client.get(...)` — check `resp.status_code == 404` OR `"No such"` in Meta error message
- If deleted: set `status = "deleted_on_meta"` in MongoDB, return early
- `"DELETED"` added to `status_map` as additional coverage

### Edit 3 — `routers/whatsapp.py` lines 1140–1325 (GAP-4: stale auto-delete in AuthKey sync)
`sync_authkey_templates` extended with:
- `authkey_wid` added to `local_templates` projection (line 1106)
- `stale_deleted = 0` counter initialised alongside `wid_updates`
- After wid-backfill loop: iterate local templates — if `authkey_wid` not in current AuthKey wid set, auto-delete from `custom_templates` + `whatsapp_template_variable_map`
- Guard: skip if template is mapped to an event (`whatsapp_event_template_map` check)
- `stale_deleted` returned in sync response

### Edit 4 — `TemplatesPage.jsx` (warning modal)
- `const [deleteConfirmTemplate, setDeleteConfirmTemplate] = useState(null)` — state at line 44
- `handleDeleteCustomTemplate` updated: proper error detail toast + `finally { setDeleteConfirmTemplate(null) }`
- Trash button now calls `setDeleteConfirmTemplate(ct)` (passes full template object)
- `Dialog` confirmation modal with `data-testid="delete-confirm-modal"` added at end of JSX
- Shows template name + whether Meta deletion will occur (based on `meta_template_id` presence)
- Confirm: `data-testid="delete-confirm-btn"` | Cancel: `data-testid="delete-cancel-btn"`

---

## Self-test results

| Check | Result |
|---|---|
| Backend: Application startup complete | ✅ |
| Frontend: webpack compiled | ✅ (1 pre-existing ESLint warning, not CR-067) |
| `grep CR-067 whatsapp.py` | ✅ 13 matches across GAP-1, GAP-3, GAP-4 |
| `grep deleteConfirmTemplate TemplatesPage.jsx` | ✅ 8 matches (state, handler, button, dialog) |

---

## Test credentials

| Account | Password | Tenant | Use for |
|---|---|---|---|
| owner@kunafamahal.com | Qplazm@10 | Kunafa Mahal (689) | Primary — has custom templates |
| owner@hungry.com | Qplazm@10 | Hungry Keya (634) | has `final_bill` template with WABA |
| owner@jehsnest.com | Qplazm@10 | Jeh's Nest (635) | no WABA credentials — V3 test |

---

## Acceptance criteria — 10 checks (V1–V10)

| # | Test | How | Expected |
|---|---|---|---|
| V1 | Warning modal appears | Templates page → click Trash on a non-in-use CRM template | `data-testid="delete-confirm-modal"` visible with template name |
| V2 | Cancel closes modal | Click `data-testid="delete-cancel-btn"` | Modal closes, template still in list |
| V3 | Confirm delete — no WABA (jehsnest) | Login as jehsnest, delete a template, confirm | Template removed from list; toast "Template deleted — Removed from CRM only (no Meta credentials configured)" |
| V4 | Confirm delete — with WABA (hungry/kunafa) | Login, delete template, confirm | Template removed; `meta_deleted=true` in response (or note if Meta fails gracefully) |
| V5 | In-use template blocked at backend | Try to delete a template mapped to an event | 400 error toast "Template is mapped to event ... Unmap it first." (no modal needed — already blocked by Lock icon) |
| V6 | GAP-3: status check marks deleted | Manually call `GET /api/whatsapp/custom-templates/{id}/status` for a template deleted on Meta | Response `{"status": "deleted_on_meta", "meta_status": "DELETED"}` |
| V7 | GAP-4: stale auto-delete on AuthKey sync | Run AuthKey sync after a template was deleted on AuthKey | Response includes `stale_deleted: N` where N > 0 if stale records existed |
| V8 | GAP-4: event-mapped stale template skipped | Template mapped to event has orphaned authkey_wid | Auth sync skips it (logged, not deleted); template still in list |
| V9 | data-testids present | Playwright selector check | `delete-confirm-modal`, `delete-confirm-btn`, `delete-cancel-btn` all present when modal open |
| V10 | Regression: normal delete without WABA still works | Full flow on jehsnest | No crash, template removed cleanly |

---

## Files changed

| File | Changes |
|---|---|
| `routers/whatsapp.py` | +55 LOC across 3 functions: `delete_custom_template`, `check_template_status`, `sync_authkey_templates` |
| `TemplatesPage.jsx` | +25 LOC: state + handler update + button change + confirmation Dialog |

## Files NOT changed

`core/whatsapp.py`, `core/campaign_jobs.py`, `routers/campaigns.py`, `routers/pos.py`, `models/schemas.py`, `TemplateBuilderPage.jsx`

---

## Do not test

- Do NOT send live WhatsApp during QA
- Do NOT actually delete templates on Meta that are actively used by tenants
- Use test/throwaway templates only for V4 (delete with WABA)
