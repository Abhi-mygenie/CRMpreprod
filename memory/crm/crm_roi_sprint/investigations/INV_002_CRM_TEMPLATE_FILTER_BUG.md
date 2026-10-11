# INV-002 — CRM template dropdown filters not working correctly

> **Type**: Investigation Report (read-only, no code changes)
> **Date**: 2026-07-01
> **Requested by**: Owner (bug report)
> **Role**: Investigation Agent
> **Related**: (none) — new bug candidate
> **Step budget used**: 6 / 10
> **Confidence**: HIGH (evidence from source + live DB)
> **Fix applied**: NO (investigation only; owner must promote to BUG ticket)

---

## Owner report (verbatim)

> "Dropdown filter is not working for [CRM templates] — for eg if template is rejected it shows in rejected but should show in CRM section so seems these status and filters are not working for CRM template."

---

## Evidence gathered

### Live DB state (real data, remote `mygenie` DB, `custom_templates` collection)

| status | count |
|---|---|
| pending | 9 |
| approved | 8 |
| draft | 1 |
| **rejected** | **1** ← the one owner is referring to |

Rejected doc: `id=596f31f3-…`, `template_name=order_bill_test`, `user_id=pos_0001_restaurant_689`, `category=utility`.

### Code trace (`/app/frontend/src/pages/TemplatesPage.jsx`)

The filter is built inside an IIFE at lines 424-448. Only **AuthKey** templates ever populate the status counters or the "Approved → Mapped/Not Mapped" toggle counts. **CRM (custom) templates are always secondary** and never contribute to any counter in the UI.

Key lines:
```
425  const approvedAuthkey = authkeyTemplates.filter(tpl => tpl.temp_status === 1);
426  const pendingAuthkey  = authkeyTemplates.filter(tpl => tpl.temp_status === 4);
427  const rejectedAuthkey = authkeyTemplates.filter(tpl => tpl.temp_status === 3);
428  const mappedCount    = approvedAuthkey.filter(isTemplateFullyMapped).length;
429  const notMappedCount = approvedAuthkey.length - mappedCount;
...
457  <SelectItem value="approved">Approved ({approvedAuthkey.length})</SelectItem>
458  <SelectItem value="pending">Pending ({pendingAuthkey.length})</SelectItem>
459  <SelectItem value="rejected">Rejected ({rejectedAuthkey.length})</SelectItem>
460  <SelectItem value="draft">Draft</SelectItem>              ← no count at all
461  <SelectItem value="all">All</SelectItem>                  ← no count
...
489  {displayTemplates.length > 0 && <p>...CRM Templates</p>}   ← header gated on AuthKey list
562  {displayDrafts.length > 0 && displayTemplates.length > 0 && <p>...Authkey Templates</p>}
```

---

## Root cause — five inter-related defects

### BUG-A · Status counters in dropdown ignore CRM templates *(primary — matches user report)*

Lines 457-459 show counts based on `approvedAuthkey.length`, `pendingAuthkey.length`, `rejectedAuthkey.length`. The `customTemplates` array is never counted.

**Observed user experience:**
- 1 rejected CRM template exists in DB
- Dropdown shows `Rejected (0)` because there are no rejected AuthKey templates
- User assumes "no rejected templates" and never clicks the filter
- If they DO click Rejected, the CRM template appears — reinforcing the "filter is broken" impression

### BUG-B · "CRM Templates" section header is hidden when there are no AuthKey templates

Line 489: header renders only when `displayTemplates.length > 0`.

**Observed user experience:**
- In Draft filter (AuthKey has no drafts by design → `displayTemplates = []`) — CRM drafts appear with no label
- In Rejected filter when there are 0 rejected AuthKey templates — CRM rejects appear with no label
- User doesn't visually understand which section is "CRM" vs "AuthKey"

### BUG-C · Mapped / Not Mapped counters exclude approved CRM templates

Lines 428-429: counted only from `approvedAuthkey`.

**Observed user experience:**
- Owner has 8 approved CRM templates, none of which are Mapped/Not-Mapped counted
- Approved → Not Mapped toggle shows misleading numbers
- CRM template mapping progress cannot be tracked from the header widget

### BUG-D · Mapping toggle filter never applies to CRM templates

Lines 439-443: `displayTemplates.filter(...)` runs on the AuthKey list; `displayDrafts` (CRM) is untouched.

**Observed user experience:**
- Approved → Not Mapped toggle hides AuthKey templates that are mapped
- But every approved CRM template still shows — regardless of whether its labels are set
- Result: the toggle appears partially broken (works on AuthKey rows, no-ops on CRM rows)

### BUG-E · "Draft" and "All" entries in dropdown have no count

Line 460-461: cosmetic inconsistency vs approved/pending/rejected.

**Observed user experience:**
- Approved(8), Pending(9), Rejected(0), Draft, All — irregular formatting
- No indication that a Draft filter would surface anything

---

## Why the bug looks *especially* wrong for the Rejected case

Because the owner's one rejected template is a **CRM** template (there are 0 rejected AuthKey templates on this tenant):

| Location | What it shows | What it should show |
|---|---|---|
| Dropdown label | `Rejected (0)` | `Rejected (1)` or `Rejected (0 · 1 CRM)` |
| After clicking Rejected | Rejected CRM card appears | Rejected CRM card appears **with a "CRM Templates" section header** |
| Section header | Missing (only shows when AuthKey has ≥1 match) | Visible |

This is precisely the "shows in Rejected but not counted / not sectioned as CRM" complaint.

---

## Recommended fix (proposal only — NOT applied)

A single self-contained edit to `TemplatesPage.jsx` addresses all five bugs:

| # | Change | Line |
|---|---|---|
| 1 | Add CRM status arrays: `approvedCustom = customTemplates.filter(ct=>ct.status==="approved")`, plus `pendingCustom`, `rejectedCustom`, `draftCustom` | ~428 |
| 2 | Change dropdown counters to sum both sources: `Approved ({approvedAuthkey.length + approvedCustom.length})`, etc. Add `Draft ({draftCustom.length})`. | 457-460 |
| 3 | Include CRM in Mapped/Not-Mapped counters — treat CRM `variable_labels` presence as "mapped" for direct-send purposes (need owner decision — see Open Question below) | 428-429 |
| 4 | Apply `mappingToggle` filter to `displayDrafts` (approved branch): filter on `Object.keys(ct.variable_labels || {}).length > 0` for "mapped", inverse for "not_mapped" | 439-443 |
| 5 | Change section header condition to `displayDrafts.length > 0` (drop the `displayTemplates > 0` gate) | 489 |

Estimated effort: **~20 minutes** dev + smoke test (5 filters × 2 states each = 10 UI states to eyeball).
Risk: **LOW** — pure frontend rendering, no data mutation, no schema change, isolated to one page.

---

## Open questions for owner (before promoting to a BUG fix)

1. **Q1 — CRM "mapped" semantics**: For an approved CRM template, does "Mapped" mean:
   - (a) `variable_labels` populated? (direct-send readiness), or
   - (b) `whatsapp_template_variable_map` entry exists? (normal event send readiness), or
   - (c) BOTH?
   Different answer changes BUG-C behaviour.
2. **Q2 — Dropdown badge format**: Prefer combined count `Rejected (1)` or split `Rejected (0 · 1 CRM)`?
3. **Q3 — Should Draft filter also show status=rejected CRM templates that were edited back to draft?** (Edge case — probably no; current code segregates cleanly by status string.)

---

## Investigation Agent — output block (Role 6)

```text
Investigation complete: INV-002
Root cause identified: YES — 5 defects in TemplatesPage.jsx filter block (lines 425-489)
Primary defect: BUG-A (status counters ignore customTemplates)
Classification: BUG (UI · frontend rendering)
Confidence: HIGH
Steps used: 6 / 10
Evidence:
  - Live DB confirms 1 rejected + 8 approved + 9 pending + 1 draft CRM templates
  - TemplatesPage.jsx lines 425-448 use only authkeyTemplates for status counts
  - Lines 439-443 apply mappingToggle only to displayTemplates, not displayDrafts
  - Line 489 gates section header on displayTemplates.length > 0
Fix applied: NO — investigation-only; awaits owner promotion to BUG ticket
Testing-agent: N/A for investigation. Project has opted out of testing_agent_v3
               per §PART B §14; verification will be manual (curl + screenshot)
               once fix is applied.
Recommendation:
  A) Promote to BUG-009 (or next available ID), open Intake, then Planning →
     Implementation. Estimated effort: ~20 min + 10 UI smoke states.
  B) Owner answers Q1-Q3 first (unblocks planning).
Report: memory/crm/crm_roi_sprint/investigations/INV_002_CRM_TEMPLATE_FILTER_BUG.md
Next role: BUG INTAKE (owner-triggered).
```

*End of INV-002.*
