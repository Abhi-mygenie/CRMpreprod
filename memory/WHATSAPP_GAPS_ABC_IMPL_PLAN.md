# Implementation Plan — GAP A + GAP C Fixes (with Business Rules)

**Date**: 2026-06-17  
**Business Rules**:
1. Only Meta-approved templates can be mapped
2. Mapped templates cannot be deleted (may be in campaigns/events) — only unmapped can be deleted

---

## Change Summary

| # | Change | File | Rule |
|---|---|---|---|
| 1 | Hide "Map" button for non-approved AuthKey templates | `TemplatesPage.jsx` line 496 | Rule 1 |
| 2 | Conditional badge: Approved→Mapped/Not Mapped, Non-approved→status only | `TemplatesPage.jsx` line 498 | Rule 1 |
| 3 | Hide variable mapping chips for non-approved templates | `TemplatesPage.jsx` line 501 | Rule 1 |
| 4 | Backend DELETE guard: block delete if template is in use | `whatsapp.py` line 233-241 | Rule 2 |
| 5 | Backend: new endpoint to check template usage | `whatsapp.py` (new) | Rule 2 |
| 6 | Frontend: load usage data + conditionally show/hide delete | `TemplatesPage.jsx` | Rule 2 |
| 7 | Custom template actions: Edit & Resubmit for rejected | `TemplatesPage.jsx` line 455-463 | — |
| 8 | Custom template badge: show "Rejected" status properly | `TemplatesPage.jsx` line 447 | — |

---

## Change 1 — Hide "Map" button for non-approved AuthKey templates

**File**: `TemplatesPage.jsx` line 496  
**Current**:
```jsx
<button onClick={() => openVariableMappingModal(tpl)} className="..." data-testid={`map-vars-${tpl.wid}`}>
    <Tag className="w-3 h-3" /> Map
</button>
```

**Change to**:
```jsx
{tpl.temp_status === 1 && (
    <button onClick={() => openVariableMappingModal(tpl)} className="..." data-testid={`map-vars-${tpl.wid}`}>
        <Tag className="w-3 h-3" /> Map
    </button>
)}
```

**Effect**: Map button hidden for Rejected (3), Pending (4), Unknown. Only Approved (1) shows it.

---

## Change 2 — Conditional badge: Approved→Mapped/Not Mapped, Non-approved→nothing

**File**: `TemplatesPage.jsx` line 498  
**Current**:
```jsx
<Badge className={`text-xs ${isMapped ? "bg-[#25D366] text-white" : "bg-amber-500 text-white"}`}>
    {isMapped ? "Mapped" : "Not Mapped"}
</Badge>
```

**Change to**:
```jsx
{tpl.temp_status === 1 ? (
    <Badge className={`text-xs ${isMapped ? "bg-[#25D366] text-white" : "bg-amber-500 text-white"}`}>
        {isMapped ? "Mapped" : "Not Mapped"}
    </Badge>
) : (
    <Badge className="text-xs bg-gray-400 text-white">Not Usable</Badge>
)}
```

**Effect**: 
- Approved templates: show "Mapped" or "Not Mapped" as before
- Rejected/Pending: show "Not Usable" gray badge (status badge already shown from GAP 1 fix)

---

## Change 3 — Hide variable mapping chips for non-approved templates

**File**: `TemplatesPage.jsx` line 501  
**Current**:
```jsx
{variables.length > 0 && (
    <div className="flex flex-wrap gap-1.5 mb-2">
        {variables.map(v => { ... })}
    </div>
)}
```

**Change to**:
```jsx
{tpl.temp_status === 1 && variables.length > 0 && (
    <div className="flex flex-wrap gap-1.5 mb-2">
        {variables.map(v => { ... })}
    </div>
)}
```

**Effect**: Variable mapping pills ({{1}} → Customer Name, etc.) only shown for Approved templates.

---

## Change 4 — Backend DELETE guard

**File**: `whatsapp.py` line 233-241  
**Current**:
```python
@router.delete("/custom-templates/{template_id}")
async def delete_custom_template(template_id: str, user: dict = Depends(get_current_user)):
    """Delete a custom template."""
    result = await db.custom_templates.delete_one(
        {"id": template_id, "user_id": user["id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Template deleted"}
```

**Change to**:
```python
@router.delete("/custom-templates/{template_id}")
async def delete_custom_template(template_id: str, user: dict = Depends(get_current_user)):
    """Delete a custom template. Blocked if template is in use (event mapping or campaign)."""
    # Rule 2: Check if template is in use
    event_usage = await db.whatsapp_event_template_map.find_one(
        {"user_id": user["id"], "template_id": template_id}
    )
    if event_usage:
        raise HTTPException(
            status_code=400,
            detail=f"Template is mapped to event '{event_usage.get('event_key')}' and cannot be deleted. Unmap it first."
        )
    campaign_usage = await db.campaigns.find_one(
        {"user_id": user["id"], "template_id": template_id}
    )
    if campaign_usage:
        raise HTTPException(
            status_code=400,
            detail=f"Template is used in campaign '{campaign_usage.get('name')}' and cannot be deleted."
        )
    result = await db.custom_templates.delete_one(
        {"id": template_id, "user_id": user["id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    # Also clean up variable mappings for this template
    await db.whatsapp_template_variable_map.delete_one(
        {"user_id": user["id"], "template_id": template_id}
    )
    return {"message": "Template deleted"}
```

**Note**: This guards custom templates (from `custom_templates` collection). AuthKey templates (from AuthKey API) are not stored locally and don't have a delete endpoint — they're managed on AuthKey/Meta console.

---

## Change 5 — Backend: new endpoint to check template usage

**File**: `whatsapp.py` (new endpoint)  

```python
@router.get("/template-usage/{template_id}")
async def check_template_usage(template_id: str, user: dict = Depends(get_current_user)):
    """Check if a template is in use (event mappings or campaigns)."""
    template_id_str = str(template_id)
    event_maps = await db.whatsapp_event_template_map.find(
        {"user_id": user["id"], "template_id": template_id_str},
        {"_id": 0, "event_key": 1}
    ).to_list(50)
    campaigns = await db.campaigns.find(
        {"user_id": user["id"], "template_id": template_id_str},
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(50)
    in_use = len(event_maps) > 0 or len(campaigns) > 0
    return {
        "template_id": template_id_str,
        "in_use": in_use,
        "event_mappings": [m["event_key"] for m in event_maps],
        "campaigns": [{"id": c["id"], "name": c.get("name", "")} for c in campaigns],
    }
```

**Alternative (lighter)**: Instead of a new endpoint, we can batch-fetch all in-use template IDs at page load. Add to existing data fetch flow.

**Recommended approach**: Batch endpoint. Add to `/whatsapp/template-variable-map` response, OR create a new light endpoint:

```python
@router.get("/templates-in-use")
async def get_templates_in_use(user: dict = Depends(get_current_user)):
    """Return set of template_ids that are in use (event maps + campaigns)."""
    event_tids = set()
    async for m in db.whatsapp_event_template_map.find(
        {"user_id": user["id"]}, {"_id": 0, "template_id": 1}
    ):
        event_tids.add(str(m.get("template_id", "")))
    campaign_tids = set()
    async for c in db.campaigns.find(
        {"user_id": user["id"]}, {"_id": 0, "template_id": 1}
    ):
        campaign_tids.add(str(c.get("template_id", "")))
    return {"in_use_template_ids": list(event_tids | campaign_tids)}
```

**This is the lighter approach** — one API call on page load, returns a flat list of in-use IDs. Frontend uses this to show/hide delete buttons.

---

## Change 6 — Frontend: load usage data + conditionally hide delete

**File**: `TemplatesPage.jsx`

**6a — Add state** (near line 50):
```javascript
const [inUseTemplateIds, setInUseTemplateIds] = useState(new Set());
```

**6b — Fetch on load** (inside useEffect at line 171, add to Promise.all):
```javascript
api.get("/whatsapp/templates-in-use")
```
Then in the handler:
```javascript
const inUseRes = await api.get("/whatsapp/templates-in-use");
setInUseTemplateIds(new Set(inUseRes.data.in_use_template_ids || []));
```

**6c — Helper function** (near isTemplateFullyMapped):
```javascript
const isTemplateInUse = (templateId) => inUseTemplateIds.has(String(templateId));
```

**6d — AuthKey template card** (near line 497, add delete button for approved unmapped templates, or hide for in-use):

Currently AuthKey templates have no delete button (they're managed on AuthKey). 
This change only applies to **custom templates** (draft section).

**6e — Custom template card delete button** (line 463):
**Current**:
```jsx
<Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 ml-auto" 
    onClick={() => handleDeleteCustomTemplate(ct.id)}>
    <Trash2 className="w-3 h-3" />
</Button>
```

**Change to**:
```jsx
{isTemplateInUse(ct.id) ? (
    <span className="text-[10px] text-gray-400 ml-auto flex items-center gap-1" title="Template is in use by events or campaigns">
        <Lock className="w-3 h-3" /> In Use
    </span>
) : (
    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 ml-auto" 
        onClick={() => handleDeleteCustomTemplate(ct.id)}>
        <Trash2 className="w-3 h-3" />
    </Button>
)}
```

**Effect**: In-use templates show gray "In Use" lock icon instead of delete button.

---

## Change 7 — Custom template actions: Edit & Resubmit for rejected

**File**: `TemplatesPage.jsx` line 455-463  
**Current**:
```jsx
{ct.status === "draft" && (
    <>
        <Button size="sm" variant="outline" onClick={() => navigate(`/template-builder/${ct.id}`)}>
            <Edit2 className="w-3 h-3 mr-1" /> Edit
        </Button>
        <Button size="sm" className="bg-[#F26B33] hover:bg-[#D85A2A] text-white" 
            onClick={() => handleSubmitCustomTemplate(ct.id)}>
            <Send className="w-3 h-3 mr-1" /> Submit
        </Button>
    </>
)}
{ct.status === "pending" && <span className="text-xs text-amber-600 flex items-center gap-1">
    <Clock className="w-3 h-3" /> Awaiting approval
</span>}
```

**Change to**:
```jsx
{ct.status === "draft" && (
    <>
        <Button size="sm" variant="outline" onClick={() => navigate(`/template-builder/${ct.id}`)}>
            <Edit2 className="w-3 h-3 mr-1" /> Edit
        </Button>
        <Button size="sm" className="bg-[#F26B33] hover:bg-[#D85A2A] text-white" 
            onClick={() => handleSubmitCustomTemplate(ct.id)}>
            <Send className="w-3 h-3 mr-1" /> Submit
        </Button>
    </>
)}
{ct.status === "pending" && <span className="text-xs text-amber-600 flex items-center gap-1">
    <Clock className="w-3 h-3" /> Awaiting approval
</span>}
{ct.status === "rejected" && (
    <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50"
        onClick={() => navigate(`/template-builder/${ct.id}`)}
        data-testid={`edit-resubmit-${ct.id}`}>
        <Edit2 className="w-3 h-3 mr-1" /> Edit & Resubmit
    </Button>
)}
```

**Effect**: Rejected custom templates show an "Edit & Resubmit" button that opens the template builder. The builder's existing PUT logic already resets status to "draft" on save (line 220 of whatsapp.py). User can then fix the issue and re-submit.

---

## Change 8 — Custom template badge: show "Rejected" properly

**File**: `TemplatesPage.jsx` line 447  
**Current**:
```jsx
<Badge className={`text-xs ${ct.status === "approved" ? "bg-[#25D366] text-white" : ct.status === "pending" ? "bg-amber-500 text-white" : "bg-gray-400 text-white"}`}>
    {ct.status === "approved" ? "Approved" : ct.status === "pending" ? "Pending" : "Draft"}
</Badge>
```

**Change to**:
```jsx
<Badge className={`text-xs ${
    ct.status === "approved" ? "bg-[#25D366] text-white" : 
    ct.status === "pending" ? "bg-amber-500 text-white" : 
    ct.status === "rejected" ? "bg-red-500 text-white" : 
    "bg-gray-400 text-white"
}`}>
    {ct.status === "approved" ? "Approved" : 
     ct.status === "pending" ? "Pending" : 
     ct.status === "rejected" ? "Rejected" : 
     "Draft"}
</Badge>
```

**Effect**: Rejected custom templates show red "Rejected" badge instead of gray "Draft".

---

## Execution Order

```
Step 1: Backend — Add /templates-in-use endpoint (Change 5)
Step 2: Backend — Add DELETE guard (Change 4)
Step 3: Frontend — All TemplatesPage changes (Changes 1, 2, 3, 6, 7, 8)
Step 4: Screenshot verification
```

**Estimated effort**: 2-3 hours

---

## Risk Assessment

| Change | Risk | Mitigation |
|---|---|---|
| 1, 2, 3 (hide Map/badges for non-approved) | ZERO — purely visual | Default filter is "Approved", so no change for happy path |
| 4 (delete guard) | LOW — could block a legitimate delete | Error message tells user to unmap first; clear action path |
| 5 (in-use endpoint) | ZERO — new read-only endpoint | No side effects |
| 6 (frontend in-use check) | LOW — additional API call on page load | Light query, cached in state |
| 7 (Edit & Resubmit) | ZERO — reuses existing builder + PUT logic | Status reset to draft on save is existing behavior |
| 8 (rejected badge) | ZERO — visual fix | — |
