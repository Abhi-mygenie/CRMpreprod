# WhatsApp Gaps — Implementation Plan (GAP 1 + GAP 2)

**Date**: 2026-06-17  
**Status**: Ready for Implementation

---

## GAP 1: Template Approval Status Display

### Files to Modify

| # | File | Type | Changes |
|---|---|---|---|
| 1 | `/app/frontend/src/pages/TemplatesPage.jsx` | Frontend | Filter logic + status badge + rejected filter option |
| 2 | `/app/frontend/src/components/shared/WhatsAppAutomationContent.jsx` | Frontend | Event mapping dropdown — filter approved only |

**No backend changes required.**

---

### Change 1.1 — TemplatesPage.jsx: Filter Logic (Line 370-389)

**Current code (line 374):**
```javascript
const approvedAuthkey = authkeyTemplates;  // ← BUG: treats ALL as approved
```

**Change to:**
```javascript
const approvedAuthkey = authkeyTemplates.filter(tpl => tpl.temp_status === 1);
const pendingAuthkey = authkeyTemplates.filter(tpl => tpl.temp_status === 4);
const rejectedAuthkey = authkeyTemplates.filter(tpl => tpl.temp_status === 3);
```

**Current code (line 378-387) — filter branching:**
```javascript
if (templateFilter === "all") { displayTemplates = authkeyTemplates; displayDrafts = customTemplates; }
else if (templateFilter === "approved") {
    displayTemplates = approvedAuthkey;
    // ... mapping toggle logic stays same
}
else if (templateFilter === "pending") { displayTemplates = []; }  // ← BUG: hardcoded empty
else if (templateFilter === "draft") { displayDrafts = customTemplates; }
```

**Change to:**
```javascript
if (templateFilter === "all") { displayTemplates = authkeyTemplates; displayDrafts = customTemplates; }
else if (templateFilter === "approved") {
    displayTemplates = approvedAuthkey;
    // ... mapping toggle logic stays same (uses displayTemplates)
}
else if (templateFilter === "pending") { displayTemplates = pendingAuthkey; }
else if (templateFilter === "rejected") { displayTemplates = rejectedAuthkey; }
else if (templateFilter === "draft") { displayDrafts = customTemplates; }
```

---

### Change 1.2 — TemplatesPage.jsx: Filter Dropdown (Line 395-402)

**Current code:**
```jsx
<SelectItem value="approved">Approved</SelectItem>
<SelectItem value="pending">Pending</SelectItem>
<SelectItem value="draft">Draft</SelectItem>
<SelectItem value="all">All</SelectItem>
```

**Change to:**
```jsx
<SelectItem value="approved">Approved ({approvedAuthkey.length})</SelectItem>
<SelectItem value="pending">Pending ({pendingAuthkey.length})</SelectItem>
<SelectItem value="rejected">Rejected ({rejectedAuthkey.length})</SelectItem>
<SelectItem value="draft">Draft</SelectItem>
<SelectItem value="all">All</SelectItem>
```

**Note:** `approvedAuthkey`, `pendingAuthkey`, `rejectedAuthkey` must be computed BEFORE the filter dropdown renders. Currently `approvedAuthkey` is inside the IIFE at line 370 — so the new variables are in the same scope. No structural changes needed.

---

### Change 1.3 — TemplatesPage.jsx: Status Badge on AuthKey Template Cards (Line 480-489)

**Current code (line 480-489):**
```jsx
<div className="flex items-start justify-between mb-2">
    <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-[#1A1A1A] truncate">{tpl.temp_name}</h4>
        <span className="text-xs text-gray-500 capitalize">{tpl.meta_data?.category || "utility"}</span>
    </div>
    <div className="flex items-center gap-1.5 ml-2 shrink-0">
        {/* ... Map, Preview, Mapped badge buttons */}
    </div>
</div>
```

**Add status badge after template name (inside the `<div className="flex-1 min-w-0">`):**
```jsx
<div className="flex-1 min-w-0">
    <div className="flex items-center gap-2">
        <h4 className="font-semibold text-[#1A1A1A] truncate">{tpl.temp_name}</h4>
        {tpl.temp_status === 1 && <Badge className="text-[10px] bg-[#25D366] text-white">Approved</Badge>}
        {tpl.temp_status === 3 && <Badge className="text-[10px] bg-red-500 text-white">Rejected</Badge>}
        {tpl.temp_status === 4 && <Badge className="text-[10px] bg-amber-500 text-white">Pending</Badge>}
        {![1, 3, 4].includes(tpl.temp_status) && <Badge className="text-[10px] bg-gray-400 text-white">Unknown</Badge>}
    </div>
    <span className="text-xs text-gray-500 capitalize">{tpl.meta_data?.category || "utility"}</span>
</div>
```

---

### Change 1.4 — TemplatesPage.jsx: Mapped/Not Mapped toggle counts should use approved only

**Current code (line 371-372):**
```javascript
const mappedCount = authkeyTemplates.filter(tpl => isTemplateFullyMapped(tpl)).length;
const notMappedCount = authkeyTemplates.length - mappedCount;
```

**Change to (count only from approved templates):**
```javascript
const mappedCount = approvedAuthkey.filter(tpl => isTemplateFullyMapped(tpl)).length;
const notMappedCount = approvedAuthkey.length - mappedCount;
```

---

### Change 1.5 — WhatsAppAutomationContent.jsx: Event Mapping Dropdown (Line 1058-1064)

**Current code:**
```jsx
{authkeyTemplates
    .filter(tpl => isTemplateFullyMapped(tpl))
    .map(tpl => (
        <SelectItem key={tpl.wid} value={tpl.wid.toString()}>
            {tpl.temp_name}
        </SelectItem>
    ))}
```

**Change to (add `temp_status === 1` filter):**
```jsx
{authkeyTemplates
    .filter(tpl => tpl.temp_status === 1 && isTemplateFullyMapped(tpl))
    .map(tpl => (
        <SelectItem key={tpl.wid} value={tpl.wid.toString()}>
            {tpl.temp_name}
        </SelectItem>
    ))}
```

---

### Change 1.6 — WhatsAppAutomationContent.jsx: Warning on event card if mapped template is rejected

**Location:** Inside the event card rendering (line 896-920), after the template name display.

**Current code (line 916):**
```jsx
<p className={`text-xs ml-6 ${isEnabled ? 'text-gray-700' : 'text-gray-500'}`}>
    <span className="font-medium">Template:</span> {mapped.template_name}
</p>
```

**Add rejected warning after it:**
```jsx
<p className={`text-xs ml-6 ${isEnabled ? 'text-gray-700' : 'text-gray-500'}`}>
    <span className="font-medium">Template:</span> {mapped.template_name}
</p>
{(() => {
    const tpl = authkeyTemplates.find(t => t.wid === mapped.template_id || t.wid?.toString() === mapped.template_id?.toString());
    if (tpl && tpl.temp_status === 3) return (
        <p className="text-xs ml-6 text-red-500 font-medium mt-0.5">⚠ This template was rejected by Meta and cannot deliver messages</p>
    );
    if (tpl && tpl.temp_status === 4) return (
        <p className="text-xs ml-6 text-amber-500 font-medium mt-0.5">⏳ This template is pending Meta approval</p>
    );
    return null;
})()}
```

---

### GAP 1 Summary

| Change | File | Line(s) | Risk |
|---|---|---|---|
| 1.1 | TemplatesPage.jsx | 374 | LOW — adds filter, existing filter default unchanged |
| 1.2 | TemplatesPage.jsx | 378-387 | LOW — adds pending/rejected branches |
| 1.3 | TemplatesPage.jsx | 395-402 | ZERO — adds dropdown items |
| 1.4 | TemplatesPage.jsx | 480-489 | ZERO — adds visual badge |
| 1.5 | TemplatesPage.jsx | 371-372 | LOW — count change |
| 1.6 | WhatsAppAutomationContent.jsx | 1058-1064 | LOW — adds filter condition |
| 1.7 | WhatsAppAutomationContent.jsx | 916 | ZERO — adds warning text |

**Total: 7 changes across 2 files. Zero backend changes.**

---

## GAP 2: Failure Reason + Event/Template on Message Status Page

### Files to Modify

| # | File | Type | Changes |
|---|---|---|---|
| 1 | `/app/frontend/src/pages/MessageStatusPage.jsx` | Frontend | Add columns, expandable row, failure reason display |
| 2 | `/app/backend/routers/whatsapp.py` | Backend | Defensive failure_reason fallback (line 1332) — optional |

---

### Change 2.1 — MessageStatusPage.jsx: Desktop Table — Add Event + Template columns (Line 408-417)

**Current table headers:**
```jsx
<tr>
    <th className="px-4 py-3 w-10"></th>
    <th className="px-4 py-3">Name</th>
    <th className="px-4 py-3">Phone</th>
    <th className="px-4 py-3">Status</th>
    <th className="px-4 py-3">Time</th>
    <th className="px-4 py-3">Action</th>
</tr>
```

**Change to (add Event + Template):**
```jsx
<tr>
    <th className="px-4 py-3 w-10"></th>
    <th className="px-4 py-3">Name</th>
    <th className="px-4 py-3">Phone</th>
    <th className="px-4 py-3">Event</th>
    <th className="px-4 py-3">Template</th>
    <th className="px-4 py-3">Status</th>
    <th className="px-4 py-3">Time</th>
    <th className="px-4 py-3">Action</th>
</tr>
```

**Update colSpan** in loading skeleton (line 423) and empty state (line 430): change `colSpan={6}` → `colSpan={8}`

---

### Change 2.2 — MessageStatusPage.jsx: Desktop Table — Add Event + Template + Failure Reason cells (Line 435-472)

**After the phone `<td>` (line 450-452), add two new cells:**

```jsx
{/* Event Type */}
<td className="px-3 py-3 text-gray-600 text-xs">
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
        {(log.event_type || "-").replace(/_/g, " ")}
    </span>
</td>

{/* Template + Failure Reason */}
<td className="px-3 py-3 text-gray-600 text-xs">
    <span className="truncate block max-w-[140px]" title={log.template_name}>{log.template_name || "-"}</span>
    {log.status === "rejected" && (log.failure_reason || log.error) && (
        <span className="text-red-500 text-[10px] block mt-0.5 truncate max-w-[140px]" title={log.failure_reason || log.error}>
            ⚠ {log.failure_reason || log.error}
        </span>
    )}
</td>
```

---

### Change 2.3 — MessageStatusPage.jsx: Expandable Row Detail Panel

**Add state for expanded row (near line 97-99):**
```javascript
const [expandedRow, setExpandedRow] = useState(null);
```

**Make each row clickable (modify `<tr>` at line 438):**
```jsx
<tr 
    key={log.id} 
    className="bg-white border-b hover:bg-gray-50 transition-colors cursor-pointer" 
    data-testid={`message-row-${log.id}`}
    onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
>
```

**After the closing `</tr>` (line 472), add the expandable detail panel:**

```jsx
{expandedRow === log.id && (
    <tr className="bg-gray-50 border-b">
        <td colSpan={8} className="px-6 py-4">
            <div className="grid grid-cols-2 gap-6">
                {/* Left: Message Details */}
                <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Message Details</h4>
                    <div className="space-y-1.5 text-xs">
                        <div><span className="text-gray-500">Event:</span> <span className="font-medium">{(log.event_type || "-").replace(/_/g, " ")}</span></div>
                        <div><span className="text-gray-500">Template:</span> <span className="font-medium">{log.template_name || "-"}</span></div>
                        {log.pos_order_id && <div><span className="text-gray-500">Order:</span> <span className="font-medium">#{log.pos_order_id}</span></div>}
                        {log.campaign_id && <div><span className="text-gray-500">Campaign:</span> <span className="font-medium">{log.campaign_id}</span></div>}
                        {log.body_values && Object.keys(log.body_values).length > 0 && (
                            <div>
                                <span className="text-gray-500">Values sent:</span>
                                <div className="mt-1 flex flex-wrap gap-1">
                                    {Object.entries(log.body_values).map(([k, v]) => (
                                        <span key={k} className="px-1.5 py-0.5 bg-white border rounded text-[10px]">
                                            {`{{${k}}}`}={v || <span className="text-gray-400">empty</span>}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {(log.failure_reason || log.error) && (
                            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                                <span className="text-red-600 font-medium">Failure: </span>
                                <span className="text-red-700">{log.failure_reason || log.error}</span>
                            </div>
                        )}
                    </div>
                </div>
                {/* Right: Status Timeline */}
                <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Status Timeline</h4>
                    <div className="space-y-2">
                        {(log.status_history || []).map((h, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                                <div className={`w-2 h-2 rounded-full ${
                                    h.status === "read" ? "bg-blue-500" :
                                    h.status === "delivered" ? "bg-green-500" :
                                    h.status === "rejected" ? "bg-red-500" :
                                    "bg-yellow-500"
                                }`} />
                                <span className="font-medium capitalize">{h.status}</span>
                                <span className="text-gray-400">{formatRelativeTime(h.timestamp)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </td>
    </tr>
)}
```

---

### Change 2.4 — MessageStatusPage.jsx: Mobile Cards — Add Event, Template, Failure Reason

**Current mobile card (line 513-515):**
```jsx
<span className="font-medium text-gray-900 text-sm truncate">{log.customer_name || log.customer_phone || "-"}</span>
```

**After the customer name area, add event/template info (around line 522-524):**
```jsx
{log.customer_name && (
    <div className="text-xs text-gray-500 mb-1">{log.customer_phone}</div>
)}
{/* Event + Template info */}
<div className="flex items-center gap-1.5 mb-1">
    <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 font-medium">
        {(log.event_type || "").replace(/_/g, " ")}
    </span>
    {log.template_name && (
        <span className="text-[10px] text-gray-400 truncate max-w-[120px]">{log.template_name}</span>
    )}
</div>
{/* Failure reason for rejected */}
{log.status === "rejected" && (log.failure_reason || log.error) && (
    <div className="text-[10px] text-red-500 mb-1">
        ⚠ {log.failure_reason || log.error}
    </div>
)}
```

---

### Change 2.5 — Backend: Defensive Failure Reason Fallback (OPTIONAL)

**File:** `/app/backend/routers/whatsapp.py` line 1332

**Current code:**
```python
set_fields["failure_reason"] = payload.get("reason") or raw_status
```

**Change to:**
```python
set_fields["failure_reason"] = (
    payload.get("reason")
    or payload.get("Reason")
    or payload.get("error")
    or payload.get("Error")
    or payload.get("description")
    or payload.get("Message")
    or payload.get("message")
    or raw_status
)
```

**Risk:** ZERO — purely additive fallback chain. If AuthKey ever starts sending a `reason` or `error` field, we'll capture it.

---

### GAP 2 Summary

| Change | File | Line(s) | Risk | Priority |
|---|---|---|---|---|
| 2.1 | MessageStatusPage.jsx | 408-417 | ZERO — adds columns | P1 |
| 2.2 | MessageStatusPage.jsx | 435-472 | LOW — adds cells | P1 |
| 2.3 | MessageStatusPage.jsx | new state + expandable row | LOW — additive | P1 |
| 2.4 | MessageStatusPage.jsx | 513-524 | LOW — mobile cards | P1 |
| 2.5 | whatsapp.py | 1332 | ZERO — defensive fallback | P2 (optional) |

**Total: 4-5 changes. 1 file frontend + 1 optional backend line.**

---

## Implementation Order

```
Step 1: GAP 1 changes (TemplatesPage.jsx + WhatsAppAutomationContent.jsx)
Step 2: GAP 2 changes (MessageStatusPage.jsx)
Step 3: GAP 2 optional backend (whatsapp.py line 1332)
Step 4: Manual verification via screenshots
Step 5: Report back for GAP 3 investigation
```

**Estimated total effort: 3-4 hours**

---

## Regression Checklist

| # | Check | Method |
|---|---|---|
| 1 | Templates page loads correctly | Screenshot /templates |
| 2 | Default filter "Approved" shows only approved templates | Screenshot + count |
| 3 | "Pending" filter shows pending templates | Screenshot |
| 4 | "Rejected" filter shows rejected templates with red badge | Screenshot |
| 5 | Event mapping dropdown only shows approved templates | Screenshot of automation modal |
| 6 | Existing event mappings still display correctly | Screenshot of automation tab |
| 7 | Message Status page loads with new columns | Screenshot /message-status |
| 8 | Row click expands detail panel | Screenshot |
| 9 | Mobile cards show event + template info | Screenshot at mobile viewport |
| 10 | No console errors on either page | Check browser logs |
