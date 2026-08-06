# CR-073 — Import AuthKey-Created Templates into CRM (Sync Reverse Path)

**CR ID**: CR-073  
**Reported**: 2026-08-04  
**Reporter**: Owner (Abhishek)  
**Role**: Intake Agent  
**Source investigation**: INV-015 (this session)  
**Status**: 📋 REGISTERED  
**Primary example**: `button1` (wid=43586) — Kunafa Mahal, created directly on AuthKey

---

## Owner Report

> "button1 template — it was created on AuthKey, I can't see button in this template in our platform."

---

## Classification

| Field | Value |
|---|---|
| **Type** | CR — Feature gap (sync is one-direction only: CRM→AuthKey, no reverse path) |
| **Severity** | P1 — All templates created outside the CRM Template Builder are invisible in terms of button mapping. Owner cannot wire `send_bill` to `button1`/`kmfinalbill` etc. until this is fixed. |
| **Risk** | MEDIUM — 1 file (`routers/whatsapp.py`), additive insert block in sync function |
| **Duplicate check** | DISTINCT |
| **Blast radius** | MEDIUM — all tenants with externally-created AuthKey templates |

---

## Evidence

### E1 — `button1` status across all surfaces

| Surface | Status |
|---|---|
| AuthKey | ✅ wid=43586, status=approved, body="TEST BUTTON" |
| Meta | ✅ APPROVED — BILL button, url=`https://crm-stack-preview.preview.emergentagent.com/api/invoices/{{1}}`, example=`['sampleurl']` |
| `custom_templates` | ❌ NOT FOUND |
| CRM Templates page | ❌ Template visible (from AuthKey list) but NO buttons shown |
| Variable mapping dialog | ❌ No `btn_url_{{1}}` slot — button can't be mapped |

### E2 — Scale: 9 out of 11 Kunafa Mahal templates are affected

```
AuthKey templates with NO custom_templates entry:
  bill (42434), km_bill (43144), bill_1 (43489), bill_2 (43531),
  kmfinalbill (43550), billingbutton (43573), button1 (43586),
  button2 (43591), kunafamahalcall (43597)
```

Only 2 of 11 templates (testbill2, bill_4) were created via CRM Builder and have entries.

### E3 — Root cause in `sync_authkey_templates()` (routers/whatsapp.py lines 1104–1126)

```python
# Current sync code:
local_templates = await db.custom_templates.find({"user_id": user["id"]}, ...)
for ct in local_templates:                    # iterates EXISTING entries only
    wid = authkey_by_name.get(norm_ct)
    if wid:
        await db.custom_templates.update_one(...)  # only updates authkey_wid
        # NEVER creates new entry for template not already in custom_templates
```

### E4 — AuthKey API returns NO button data

`getAllTemplate.php` returns only: `wid`, `temp_name`, `temp_body`, `temp_language`, `temp_category`, `temp_status`. No button components.

**Button data source**: Only available via Meta Graph API (requires `meta_waba_id` + `meta_access_token`). Kunafa Mahal has WABA configured ✅.

---

## What Needs to Be Built

**One new block inside `sync_authkey_templates()`**:

After the existing back-fill loop, add an **import block**:

```
For each AuthKey template (wid, temp_name) that has no matching custom_templates entry:
  1. Create a new custom_templates stub doc:
     { user_id, template_name, authkey_wid, body, status, buttons: [] }

  2. If tenant has meta_waba_id + meta_access_token:
     → Query Meta: GET /{waba_id}/message_templates?name={temp_name}
     → Extract BUTTONS component
     → For each URL button with {{1}} in URL:
         build button object: { type, text, url_type="dynamic", url, url_base, url_example }
     → Set buttons field on the new custom_templates doc

  3. If no Meta WABA:
     → Create stub with buttons=[] (template visible, no button mapping until WABA added)
```

---

## Files to Change

| File | Change | Risk |
|---|---|---|
| `routers/whatsapp.py` | Add import block inside `sync_authkey_templates()` after the existing back-fill loop | MEDIUM — additive only, no existing logic modified |

## Files NOT changing

All other files — `core/whatsapp.py`, `models/schemas.py`, frontend, `core/campaign_jobs.py`, `routers/pos.py`, etc.

---

## Owner Questions

| # | Question | Options |
|---|---|---|
| **Q1** | When importing button URL — should `url_example` be extracted from Meta's `example` field, or left blank? | (a) Use Meta's example array (e.g. `"sampleurl"` for button1) (b) Leave blank |
| **Q2** | If Meta WABA is not configured for a tenant, should externally-created templates still be imported (without button data)? | (a) Yes — import stub, buttons=[]. (b) No — only import if WABA configured |

---

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | `POST /api/whatsapp/authkey/sync-templates` → `button1` (wid=43586) appears in `custom_templates` after sync |
| AC-2 | `custom_templates` entry for `button1` has correct button data: `{type:URL, text:BILL, url_type:dynamic, url:https://crm-stack-preview.../api/invoices/{{1}}}` |
| AC-3 | CRM Templates page → `button1` shows BILL button chip |
| AC-4 | Map Variables dialog for `button1` shows `btn_url_{{1}}` slot |
| AC-5 | After mapping `btn_url_{{1}}` → `einvoice_token` → saved to `whatsapp_template_variable_map` |
| AC-6 | Existing `custom_templates` entries (bill_4, testbill2) — zero change, not overwritten |
| AC-7 | All 9 missing Kunafa Mahal templates imported in one sync call |

---

## Regression Checks

| # | Check |
|---|---|
| R1 | Existing `testbill2` / `bill_4` custom_templates entries — buttons unchanged after sync |
| R2 | `authkey_wid` back-fill on existing entries — still works |
| R3 | CR-037 guard (rejected status not overwritten) — still in place |
| R4 | Tenant with no Meta WABA — sync doesn't crash (Q2 option a: creates stub with empty buttons) |

---

```
Intake complete: CR-073
Classification: CR — Feature gap (sync reverse path missing)
Severity: P1
Risk: MEDIUM (1 file, additive block in sync function)
Duplicate check: DISTINCT
Evidence: 9/11 Kunafa Mahal AuthKey templates missing from custom_templates; code trace confirms no insert path
Blast radius: MEDIUM (all tenants with externally-created templates)
Owner decisions: Q1 (url_example source), Q2 (no-WABA-tenants)
Docs: discovery/CR_073_AUTHKEY_TEMPLATE_IMPORT_INTAKE.md
Next: Owner answers Q1-Q2 → Planning Agent
```
