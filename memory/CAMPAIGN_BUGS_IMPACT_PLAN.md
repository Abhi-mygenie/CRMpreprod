# Impact Analysis & Implementation Plan — Campaign Bugs

**Date**: 2026-06-17  
**Bugs**: BUG-001, BUG-002, BUG-003, BUG-004  

---

## Impact Analysis

### BUG-001: menu_pick_resolved not copied (CRITICAL)

| Dimension | Assessment |
|---|---|
| **Blast radius** | Every campaign using a template with menu_pick variables |
| **Current impact** | 1 campaign failed (Menu, mygeniedev). No other menu_pick campaigns exist yet. |
| **Future risk** | HIGH — menu_pick is the primary way to send daily menu/offers. As adoption grows, every menu campaign will fail silently |
| **Revenue impact** | Marketing campaigns not delivered → lost engagement, lost orders |
| **Data impact** | None — no corruption, just empty values sent |
| **Rollback risk** | None — additive fix, no schema changes |

### BUG-002: Event-scoped variables empty in campaigns (HIGH)

| Dimension | Assessment |
|---|---|
| **Blast radius** | Any campaign using templates designed for order events (payment_bill, send_bill, etc.) |
| **Current impact** | 0 campaigns with event-scoped variables have been sent (gold campaign has 0 runs). But test sends already show the issue. |
| **Future risk** | HIGH — users naturally reuse order templates for campaigns. No warning = guaranteed failures. |
| **Revenue impact** | Campaign sends wasted (AuthKey API credits consumed, Meta rejects) |
| **Fix approach** | UX warning, not a backend fix. The resolver is working correctly — campaigns simply don't have event context. |

### BUG-003: Rejected templates in campaign dropdown (MEDIUM)

| Dimension | Assessment |
|---|---|
| **Blast radius** | All campaign wizard users |
| **Current impact** | Low — rejected templates have 0 variables so "fully mapped" but sends would fail on AuthKey/Meta side |
| **Future risk** | MEDIUM — confusing UX, wastes user time |

### BUG-004: Test sends invisible in dashboard (LOW)

| Dimension | Assessment |
|---|---|
| **Blast radius** | Users testing campaigns |
| **Current impact** | Low — users can verify on AuthKey dashboard. Inconvenient but not blocking. |
| **Future risk** | LOW — cosmetic/traceability issue |

---

## Implementation Plan

### BUG-001 Fix: menu_pick_resolved (2 changes in CampaignWizardPage.jsx)

**File**: `/app/frontend/src/pages/CampaignWizardPage.jsx`

**Change 1.1 — Extract menu_pick_resolved from API response (line 132-135)**

Current:
```javascript
const mObj = {}, moObj = {};
(mapRes.data.mappings || []).forEach(m => { 
    mObj[m.template_id] = m.mappings || {}; 
    moObj[m.template_id] = m.modes || {}; 
});
setAllMappings(mObj);
setAllModes(moObj);
```

Change to:
```javascript
const mObj = {}, moObj = {}, mprObj = {};
(mapRes.data.mappings || []).forEach(m => { 
    mObj[m.template_id] = m.mappings || {}; 
    moObj[m.template_id] = m.modes || {}; 
    mprObj[m.template_id] = m.menu_pick_resolved || {};
});
setAllMappings(mObj);
setAllModes(moObj);
setAllMenuPickResolved(mprObj);
```

Need to add state: `const [allMenuPickResolved, setAllMenuPickResolved] = useState({});`

**Change 1.2 — Set menuPickResolved on template select (line 158-164)**

Current:
```javascript
const handleTemplateSelect = (tplId) => {
    setTemplateId(tplId);
    const tpl = templates.find(t => t.id === tplId);
    setTemplateName(tpl?.name || "");
    setVariableMappings(allMappings[tplId] || {});
    setVariableModes(allModes[tplId] || {});
};
```

Change to:
```javascript
const handleTemplateSelect = (tplId) => {
    setTemplateId(tplId);
    const tpl = templates.find(t => t.id === tplId);
    setTemplateName(tpl?.name || "");
    setVariableMappings(allMappings[tplId] || {});
    setVariableModes(allModes[tplId] || {});
    setMenuPickResolved(allMenuPickResolved[tplId] || {});
};
```

**Risk**: ZERO — purely additive, no behavior change for non-menu_pick templates.

---

### BUG-002 Fix: Warning for event-scoped variables (1 change in CampaignWizardPage.jsx)

**File**: `/app/frontend/src/pages/CampaignWizardPage.jsx`

**Approach**: After template is selected, check each mapped variable against the safe-for-campaigns list. If any are event-only, show an amber warning listing which ones will be empty.

**Change 2.1 — Add safe variable set + warning logic**

Add constant (top of file or inside component):
```javascript
const CAMPAIGN_SAFE_VARIABLES = new Set([
    "customer_name", "restaurant_name", "points_balance", "tier",
    "total_visits", "total_spent", "wallet_balance",
    "instagram_link", "google_review_link", "feedback_link",
    "points_redeemed",
]);
```

Add helper:
```javascript
const getUnsafeVariables = () => {
    if (!variableMappings || !variableModes) return [];
    return Object.entries(variableMappings)
        .filter(([k, v]) => {
            const mode = variableModes[k] || "map";
            if (mode === "text" || mode === "menu_pick") return false;
            return v && !CAMPAIGN_SAFE_VARIABLES.has(v);
        })
        .map(([k, v]) => ({ variable: k, mapped_to: v }));
};
```

Add warning below the existing "needs mapping" banner (after line 421):
```jsx
{templateId && currentTemplate && (() => {
    const unsafe = getUnsafeVariables();
    if (unsafe.length === 0) return null;
    return (
        <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-800">
            ⚠ {unsafe.length} variable(s) are event-specific and will be empty in campaign sends:
            <ul className="mt-1 ml-4 list-disc">
                {unsafe.map(u => <li key={u.variable}>{u.variable} → {u.mapped_to}</li>)}
            </ul>
            Use "Text" mode for static values, or pick a different template designed for campaigns.
        </div>
    );
})()}
```

**Risk**: ZERO — warning only, doesn't block sends.

---

### BUG-003 Fix: Filter rejected templates from dropdown (1 change in CampaignWizardPage.jsx)

**File**: `/app/frontend/src/pages/CampaignWizardPage.jsx`

**Change 3.1 — Filter by temp_status when loading templates (line 125-131)**

Current:
```javascript
const formatted = (tplRes.data.templates || []).map(t => ({
    id: t.wid?.toString() || t.id,
    name: t.temp_name || t.name,
    message: t.temp_body || t.message || "",
    variables: (t.temp_body?.match(/\{\{\d+\}\}/g) || []).filter((v, i, a) => a.indexOf(v) === i),
}));
```

Change to:
```javascript
const formatted = (tplRes.data.templates || [])
    .filter(t => t.temp_status === 1)
    .map(t => ({
        id: t.wid?.toString() || t.id,
        name: t.temp_name || t.name,
        message: t.temp_body || t.message || "",
        variables: (t.temp_body?.match(/\{\{\d+\}\}/g) || []).filter((v, i, a) => a.indexOf(v) === i),
    }));
```

**Risk**: ZERO — only shows approved templates. Same rule applied in Templates page and Automation page.

---

### BUG-004 Fix: Log campaign test-send to whatsapp_message_logs (1 change in campaigns.py)

**File**: `/app/backend/routers/campaigns.py`

**Change 4.1 — Add log_message_attempt call in test_send_campaign (after line 521)**

Add after `bulk_result = await send_bulk_messages(api_key, [msg])`:
```python
# Log to whatsapp_message_logs for dashboard visibility
from core.whatsapp import SendResult as _SR
_test_sr = _SR(
    success=bool(result.get("success")),
    phone=phone,
    message_id=result.get("message_id"),
    error=result.get("error"),
    http_status=result.get("http_status"),
    raw_response=result.get("raw_response"),
)
await log_message_attempt(
    db, user["id"], "test-recipient", phone,
    "campaign_test", template_id, _test_sr,
    template_name=campaign.get("template_name"),
    campaign_id=campaign_id,
    country_code=country_code,
    body_values=body_values,
    customer_name=test_customer.get("name"),
    is_test=True,
    channel="wp",
)
```

**Risk**: LOW — adds a row to message_logs with `is_test=True`. Excluded from stats by default (include_test=false).

---

## Execution Order

```
Step 1: BUG-001 fix (menu_pick_resolved) — CRITICAL, 2 lines
Step 2: BUG-003 fix (filter rejected) — 1 line
Step 3: BUG-002 fix (event-scoped warning) — new UI warning
Step 4: BUG-004 fix (test-send logging) — backend, 1 function call
Step 5: Verify — resend the Menu campaign, check variables resolve
```

**Total effort**: ~1.5 hours  
**Risk**: ZERO to LOW across all fixes

---

## Verification Plan

| Bug | Verify How |
|---|---|
| BUG-001 | Create campaign with menu template → check campaign.menu_pick_resolved is populated → send → body_values non-empty |
| BUG-002 | Select payment_bill in campaign wizard → warning shows listing 5 event-only variables |
| BUG-003 | Open campaign wizard → template dropdown → rejected templates NOT shown |
| BUG-004 | Campaign test send → check Message Status dashboard → visible with "campaign_test" event type |
