# Implementation Plan — BUG-005 + BUG-006 + BUG-007

**Date**: 2026-06-17  
**Sprint**: WhatsApp Module Hardening  
**Estimated Effort**: ~1 hour  
**Risk**: LOW (additive fixes, no schema changes, backward-compatible)

---

## Overview

Three bugs cause the "Campaign messages don't show" symptom:

| # | Bug | Root Cause | Fix Location |
|---|---|---|---|
| BUG-005 | Campaign filter dropdown shows segments | `db.segments` instead of `db.campaigns` | Backend `whatsapp.py:1174` |
| BUG-006 | Messages logged with `run_id` as `campaign_id` | Wrong value passed to `log_message_attempt()` | Backend `campaigns.py:311,818` |
| BUG-007 | Template preview shows literal `\n` | Raw escaped newlines not converted | Frontend 3 files, 6 locations |

---

## Fix 1: BUG-005 — Campaign filter queries wrong collection

### File: `backend/routers/whatsapp.py`

**Line 1173-1176** — Change `db.segments` → `db.campaigns`:

```python
# BEFORE
campaigns = await db.segments.find(
    {"user_id": user["id"]}, {"_id": 0, "id": 1, "name": 1}
).to_list(100)

# AFTER
campaigns = await db.campaigns.find(
    {"user_id": user["id"]}, {"_id": 0, "id": 1, "name": 1}
).to_list(100)
```

**Acceptance Criteria**:
- [AC-5.1] `/api/whatsapp/message-filters` returns campaign names (not segment names) in `campaigns` array
- [AC-5.2] Each campaign object has `{id, name}` matching the `campaigns` collection
- [AC-5.3] Message Status campaign dropdown shows actual campaign names

---

## Fix 2: BUG-006 — Campaign messages logged with run_id

### Strategy Decision: Fix forward + backward-compatible filter

Two options:
- **Option A**: Fix the `campaign_id=` parameter at source (campaigns.py) + migrate historical data
- **Option B**: Fix the `campaign_id=` parameter at source + change filter to also match `reference_id`

**Chosen: Option A (fix at source) + Option B fallback (dual-field filter)**

Rationale: New sends will be correct. Old sends have `campaign_id=run_id` and `reference_id=campaign_id`. A dual-field `$or` filter catches both old and new data without migration.

### File: `backend/routers/campaigns.py`

**Change 1 — Line 311** (in `_execute_campaign_send`):
```python
# BEFORE
campaign_id=run_id,

# AFTER
campaign_id=campaign_id,
```

**Change 2 — Line 818** (in `resend_failed_campaign_run`):
```python
# BEFORE
campaign_id=new_run_id,

# AFTER
campaign_id=campaign_id,
```

### File: `backend/routers/whatsapp.py`

**Change 3 — Line 1085-1086** (in `get_message_logs`): backward-compatible dual-field filter:
```python
# BEFORE
if campaign_id and campaign_id != "all":
    query["campaign_id"] = campaign_id

# AFTER
if campaign_id and campaign_id != "all":
    query["$or"] = [
        *query.get("$or", []),  # preserve existing search $or if present
    ] if query.get("$or") else []
    # Must handle the case where search $or already exists
    # Simpler: use campaign_id match OR reference_id match
    query["$and"] = query.get("$and", [])
    query["$and"].append({
        "$or": [
            {"campaign_id": campaign_id},
            {"reference_id": campaign_id},
        ]
    })
```

**Revised approach** (cleaner — avoids $or/$and nesting conflict with search):

Since `search` already uses `$or` at query root level, and MongoDB doesn't allow two `$or` at the same level, we need `$and` wrapping:

```python
# BEFORE
if campaign_id and campaign_id != "all":
    query["campaign_id"] = campaign_id

# AFTER
if campaign_id and campaign_id != "all":
    campaign_match = {"$or": [{"campaign_id": campaign_id}, {"reference_id": campaign_id}]}
    if "$and" not in query:
        query["$and"] = []
    query["$and"].append(campaign_match)
```

And similarly, the `search` $or must also be wrapped in $and to avoid conflicts:

```python
# BEFORE (search)
if search:
    safe = re.escape(search.strip())
    if safe:
        query["$or"] = [
            {"customer_phone": {"$regex": safe, "$options": "i"}},
            {"customer_name": {"$regex": safe, "$options": "i"}},
        ]

# AFTER (search)
if search:
    safe = re.escape(search.strip())
    if safe:
        search_match = {"$or": [
            {"customer_phone": {"$regex": safe, "$options": "i"}},
            {"customer_name": {"$regex": safe, "$options": "i"}},
        ]}
        if "$and" not in query:
            query["$and"] = []
        query["$and"].append(search_match)
```

**Acceptance Criteria**:
- [AC-6.1] New campaign sends log `campaign_id = campaign.id` (not run_id)
- [AC-6.2] Message Status filter by campaign shows BOTH old messages (via `reference_id` match) and new messages (via `campaign_id` match)
- [AC-6.3] Search + campaign filter can be combined without query conflict
- [AC-6.4] Resend-failed messages also log correct `campaign_id`

---

## Fix 3: BUG-007 — Template preview shows literal `\n`

### Strategy

Apply a `normalizeTemplateBody()` helper that converts literal `\n` → actual newlines and `\'` → `'`. Apply it at the data layer when templates are first loaded, so ALL downstream previews are fixed automatically.

### File: `frontend/src/pages/TemplatesPage.jsx`

Add normalization when authkey templates are loaded:

```javascript
// Add helper at top of component
const normalizeBody = (body) => {
    if (!body) return "";
    return body.replace(/\\n/g, "\n").replace(/\\'/g, "'");
};
```

Apply to template loading (wherever `temp_body` is used for preview):

**Location 1**: `resolvePreviewWithSampleData` — normalize `templateBody` input
**Location 2**: Or normalize at the data source when templates are fetched

Best approach: Normalize at fetch time so all consumers get clean data:

```javascript
// When templates are loaded from API
const templates = data.data || [];
templates.forEach(t => {
    if (t.temp_body) t.temp_body = t.temp_body.replace(/\\n/g, "\n").replace(/\\'/g, "'");
});
```

### File: `frontend/src/pages/CampaignWizardPage.jsx`

Same normalization at line 131 when building `formatted` templates:

```javascript
message: (t.temp_body || t.message || "").replace(/\\n/g, "\n").replace(/\\'/g, "'"),
```

### File: `frontend/src/components/shared/WhatsAppAutomationContent.jsx`

Same normalization wherever `temp_body` is consumed for preview:
- `getTestPreviewText()` — line 99: normalize `template.temp_body`
- `resolvePreviewWithSampleData()` — line 282: normalize `templateBody` param
- Templates loaded from API — normalize at fetch time

**Acceptance Criteria**:
- [AC-7.1] Template previews on Templates page show proper line breaks
- [AC-7.2] Campaign wizard WhatsApp preview shows proper line breaks
- [AC-7.3] Automation modal preview shows proper line breaks
- [AC-7.4] Test send preview shows proper line breaks
- [AC-7.5] Escaped single quotes (`\'`) are rendered as `'`

---

## Execution Order

```
Step 1: BUG-006 fix (campaigns.py — 2 line changes)
Step 2: BUG-005 fix (whatsapp.py — 1 line change)
Step 3: BUG-006 filter fix (whatsapp.py — refactor search + campaign_id to use $and)
Step 4: BUG-007 fix (3 frontend files — normalize template body at load time)
Step 5: Verify — curl backend filters, screenshot frontend previews
```

Steps 1-2 are independent one-liners.  
Step 3 depends on understanding the existing query structure.  
Step 4 is fully independent (frontend only).  
All can be done in parallel tool calls after Step 3 analysis.

---

## Regression Risk

| Area | Risk | Mitigation |
|---|---|---|
| Campaign send execution | NONE | Only changes log parameter, not send logic |
| Message Status filters | LOW | $and wrapping preserves existing filter behavior |
| Template previews | NONE | Only normalizes display text, no backend impact |
| Existing message logs | NONE | Dual-field filter catches old `run_id` and new `campaign_id` |
| Search functionality | LOW | $and wrapping tested for search + campaign combo |

---

## Files Modified (Summary)

| File | Changes | Lines |
|---|---|---|
| `backend/routers/campaigns.py` | Fix `campaign_id=` parameter in 2 callsites | 311, 818 |
| `backend/routers/whatsapp.py` | Fix collection `segments` → `campaigns` + refactor filter query | 1085-1096, 1174 |
| `frontend/src/pages/TemplatesPage.jsx` | Normalize `temp_body` at load time | Template fetch handler |
| `frontend/src/pages/CampaignWizardPage.jsx` | Normalize template message body | Line 131 |
| `frontend/src/components/shared/WhatsAppAutomationContent.jsx` | Normalize `temp_body` at fetch + in preview functions | Multiple locations |
