# CR-073 — Impact Analysis

**CR ID**: CR-073  
**Role**: Planning Agent  
**Date**: 2026-08-04  
**Stage**: Impact Analysis  
**Source**: Intake doc `discovery/CR_073_AUTHKEY_TEMPLATE_IMPORT_INTAKE.md`  
**Risk**: MEDIUM  

---

## Code Reality Check

### `sync_authkey_templates()` — current logic (lines 1083–1134)

```
1. Calls AuthKey migration API (wptemplateMigration.php)
2. Fetches AuthKey template list (getAllTemplate.php)
3. Builds lookup: normalized_name → wid
4. Loops over EXISTING custom_templates (find all for user)
5. For each existing entry: back-fills authkey_wid + sets status=approved (CR-037 guard)
6. Returns {wid_updates: N}
```

**Gap**: Step 4 only iterates EXISTING docs. AuthKey templates with NO matching `custom_templates` entry are completely ignored. No insert path exists.

### `custom_templates` document schema (from lines 237–263, 981–1008)

Required fields for a valid entry:
```python
{
    "id": str(uuid.uuid4()),
    "user_id": user["id"],
    "template_name": ...,
    "category": ...,            # "utility" / "marketing" / "authentication"
    "language": ...,            # "en" etc.
    "header_type": "none",      # externally-created = safe default
    "header_content": "",
    "body": ...,                # from AuthKey temp_body
    "footer": "",
    "buttons": [...],           # from Meta components
    "variables": [...],         # extracted from body (re.findall {{N}})
    "status": "approved",       # AuthKey temp_status=1 → approved
    "authkey_wid": ...,         # from AuthKey wid
    "created_at": now,
    "updated_at": now,
    # Non-critical optional fields
    "body_examples": [],
    "header_examples": [],
    "media_url": "",
    "header_handle": None,
    "send_media_url": None,
    "send_media_filename": None,
    "header_media_mime": None,
    "needs_media_reupload": False,
    "meta_template_id": None,   # not available without Meta API call
}
```

### Button object structure (from existing bill_4/testbill2 entries)

```python
{
    "type": "URL",
    "text": btn.get("text"),                    # from Meta component
    "url_type": "dynamic",                      # if {{1}} in URL
    "url": btn.get("url"),                      # full URL with {{1}}
    "url_base": url.split("{{")[0],             # base before {{1}}
    "url_example": meta_example[0] if meta_example else ""  # Q1=(a): use Meta example
}
```

For static URL buttons: `url_type = "static"`, no `url_base`/`url_example`.

### Meta API call for button data

```
GET {META_GRAPH_API_URL}/{waba_id}/message_templates
    ?name={template_name}
    &fields=name,status,components
    &access_token={access_token}

Returns:
  components[].type = "BODY"    → body text
  components[].type = "BUTTONS" → list of button objects
    button.type     = "URL" / "PHONE_NUMBER" / "QUICK_REPLY"
    button.text     = display label
    button.url      = URL template (with {{1}} for dynamic)
    button.example  = ["suffix_value"] (for dynamic URLs)
```

---

## Affected Surfaces

### Direct change
| Surface | Impact |
|---|---|
| `sync_authkey_templates()` | New import block added after existing back-fill loop. Additive only — existing loop unchanged. |
| `custom_templates` collection | New documents inserted for externally-created templates (on first sync after fix) |

### Downstream — will START working after CR-073
| Surface | How |
|---|---|
| `GET /api/whatsapp/authkey-templates` | Enriches buttons from `custom_templates` by `authkey_wid` → buttons will appear for `button1`, `kmfinalbill`, etc. |
| CRM Templates page | Button chips visible for imported templates |
| Variable mapping dialog (Map Variables) | `btn_url_{{1}}` slot appears → owner can map `einvoice_token` |
| `GET /api/whatsapp/authkey-templates` → CR-069 enrichment | Button URL data flows to campaign wizard, test modal, etc. |
| `send_bill` event trigger | Once `button1`/`kmfinalbill` is mapped to event + variables mapped → `button_param_value` resolved in send payload |

### NOT affected
| Surface | Why |
|---|---|
| Existing `custom_templates` entries (testbill2, bill_4) | Import block skips entries that already exist (idempotent) |
| CR-037 rejected-status guard | Existing back-fill loop unchanged |
| All send paths (pos.py, campaigns.py, whatsapp.py) | Zero change |
| Frontend | Zero change |
| All other collections | Zero change |

---

## Idempotency

The import block must be idempotent — running sync multiple times must not create duplicate entries.

**Guard**: Before inserting, check `{user_id: user_id, authkey_wid: wid}` → skip if exists.  
Also check `{user_id: user_id, template_name: temp_name}` → skip if exists by name.

This also means: if owner later creates a CRM template with the same name, the import won't overwrite it.

---

## Performance

For Kunafa Mahal: 9 externally-created templates, all with WABA configured.  
→ 9 Meta API calls (one per template, sequential) + 9 DB inserts.  
→ Estimated extra time: ~3-5 seconds added to sync.  
→ Acceptable — sync is a manual action, not real-time.

---

## Files WILL change

| File | Lines | Change |
|---|---|---|
| `routers/whatsapp.py` | After line 1126 (after back-fill loop closes) | New import block: ~45 lines |

## Files WILL NOT touch

All other backend files, all frontend files, all schemas, all core modules.

---

## Return value change

Current:
```json
{ "message": "...", "response": {...}, "wid_updates": 3 }
```

After:
```json
{ "message": "...", "response": {...}, "wid_updates": 3, "imported_count": 9 }
```

`imported_count` = number of new `custom_templates` entries created from externally-created templates.

---

## Owner Decisions — All Locked

| Decision | Locked value |
|---|---|
| `url_example` source | Meta's `example[0]` value (Q1=a) |
| Tenants without WABA | Skip — only import when `meta_waba_id` + `meta_access_token` both set (Q2=b) |

---

## Verification Matrix

| V# | Test | Expected |
|---|---|---|
| V1 | `POST /authkey/sync-templates` for Kunafa Mahal | `imported_count = 9` (all missing templates imported) |
| V2 | `db.custom_templates.find({user_id, template_name: "button1"})` | Entry exists with `authkey_wid=43586`, `buttons=[{type:URL, text:BILL, url_type:dynamic}]` |
| V3 | `GET /api/whatsapp/authkey-templates` after sync | `button1` template has `buttons` array in response |
| V4 | CRM Templates page → `button1` | BILL button chip visible |
| V5 | Map Variables for `button1` | `btn_url_{{1}}` slot visible, can select `einvoice_token` |
| V6 | Run sync again (2nd time) | `imported_count = 0` (idempotent — no duplicates) |
| V7 | Existing `testbill2` entry after sync | Unchanged — not overwritten |
| V8 | `kmfinalbill` imported with correct buttons | BILL + REVIEW buttons, correct URLs |
| V9 | Tenant without WABA — sync | `imported_count = 0` (skipped — no Meta API call made) |

---

## Regression Checklist

| # | Check |
|---|---|
| R1 | Existing `custom_templates` docs — zero modification |
| R2 | CR-037 guard (rejected status preserved) — existing back-fill loop untouched |
| R3 | `wid_updates` count — still accurate |
| R4 | Sync returns 200 even if Meta API fails for one template (per-template try/except) |
| R5 | AuthKey template list endpoint (`GET /authkey-templates`) enrichment — no change to logic, just new data available |

---

```
Planning complete: CR-073
Stage: Impact Analysis
Code reality: FULL (exact insertion point: after line 1126; doc schema confirmed)
Risk: MEDIUM — 1 file, additive only, zero existing logic modified
Files WILL change: routers/whatsapp.py (+~45 lines after line 1126)
Files WILL NOT touch: all other files
Owner decisions: ALL LOCKED (Q1=a, Q2=b)
Conflicts: none
Next: Implementation Plan (say "write implementation plan" or "implement directly")
```
