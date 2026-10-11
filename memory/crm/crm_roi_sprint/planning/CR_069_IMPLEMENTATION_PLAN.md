# CR-069 — Implementation Plan

**CR ID**: CR-069  
**Role**: Planning Agent  
**Date**: 2026-07-29  
**Prerequisite**: Impact Analysis approved (`planning/CR_069_IMPACT_ANALYSIS_BEFORE_AFTER.md`)  
**Risk**: MEDIUM-HIGH  
**Estimated Effort**: ~6-7 hrs  

---

## Implementation Order

Edits are grouped by dependency. Groups with no dependency between them can be done in parallel.

```
Group A (Backend — no FE dependency):
  Edit 1 → Edit 2 → Edit 3 → Edit 4 → Edit 5

Group B (Frontend — depends on Edit 1 for buttons data):
  Edit 6 → Edit 7 → Edit 8 → Edit 9

Group C (Frontend — depends on Edit 1 for buttons data):
  Edit 10 → Edit 11 → Edit 12

Group D (Frontend — depends on Edit 1 for buttons data):
  Edit 13 → Edit 14

Groups B, C, D can be done in parallel after Edit 1.
```

---

## EDIT 1 — Backend: Enrich AuthKey templates with button data

**File**: `backend/routers/whatsapp.py`  
**Function**: `get_authkey_templates()` (line 183-214)  
**AC**: AC-1  
**Risk**: LOW (additive enrichment — existing fields untouched)

### What to change

**Line 205**: Add `"buttons": 1` to the `custom_templates` projection.

Current:
```python
{"_id": 0, "authkey_wid": 1, "header_type": 1, "send_media_url": 1, "needs_media_reupload": 1},
```

Change to:
```python
{"_id": 0, "authkey_wid": 1, "header_type": 1, "send_media_url": 1, "needs_media_reupload": 1, "buttons": 1},
```

**Line 213**: After `t["needs_media_reupload"] = ...`, add:
```python
            # CR-069: enrich with button data from custom_templates
            if c.get("buttons"):
                t["buttons"] = c["buttons"]
```

### Self-test
```bash
curl -s "$API_URL/api/whatsapp/authkey-templates" -H "Authorization: Bearer $TOKEN" | \
python3 -c "import sys,json; ts=json.load(sys.stdin)['templates']; [print(t['temp_name'], t.get('buttons','NONE')) for t in ts if 'final_bill' in t['temp_name']]"
```
Expected: `final_bill [{'type': 'URL', 'text': 'Feedback', ...}, {'type': 'URL', 'text': 'Bill', ...}]`

---

## EDIT 2 — Backend: Add `button_values` to `WhatsAppMessage` dataclass

**File**: `backend/core/whatsapp.py`  
**Location**: `WhatsAppMessage` dataclass (line 19-28)  
**AC**: AC-12  
**Risk**: LOW (additive optional field)

### What to change

Add one line after `customer_id` (line 28):
```python
    button_values: Optional[Dict[str, str]] = None  # CR-069: {"0": "invoice_token_value"}
```

### Self-test
No runtime test needed — dataclass extension. Verified at Edit 3.

---

## EDIT 3 — Backend: Include `buttonValues` in AuthKey send payload

**File**: `backend/core/whatsapp.py`  
**Function**: `send_single_message()` (line 59-75)  
**AC**: AC-12  
**Risk**: MEDIUM (send path — hotspot. Additive field only — no existing fields modified)

### What to change

After line 74 (`payload["headerValues"] = {...}`), before line 75 (the empty line), add:
```python
        # CR-069: Add button URL suffix values for dynamic URL buttons
        if message.button_values:
            payload["buttonValues"] = message.button_values
```

### Self-test
Verified empirically at Edit 5 (test send). If AuthKey rejects `buttonValues`, the field is silently ignored (AuthKey returns success for unknown fields — confirmed pattern from `headerValues` rollout).

---

## EDIT 4 — Backend: Resolve button variable mappings in `trigger_whatsapp_event`

**File**: `backend/core/whatsapp.py`  
**Function**: `trigger_whatsapp_event()` (line 695-854)  
**AC**: AC-13  
**Risk**: MEDIUM (event trigger send — hotspot. Additive block after existing body_values resolution)

### What to change

**After line 796** (after `build_body_values(...)` call and before `# 5. Prepare message`), insert:
```python
        # CR-069: Resolve button URL variable mappings
        button_values = None
        _btn_mappings = {k: v for k, v in variable_mappings.items() if k.startswith("btn_url_")}
        if _btn_mappings:
            button_values = {}
            for btn_key, mapped_field in _btn_mappings.items():
                # btn_key format: "btn_url_{{N}}" — extract N
                btn_idx = btn_key.replace("btn_url_", "").strip("{}")
                mode = variable_modes.get(btn_key, "map")
                if mode == "text":
                    button_values[btn_idx] = str(mapped_field)
                else:
                    button_values[btn_idx] = resolve_variable(
                        mapped_field, customer, event_data, brand_data,
                    )
```

**Line 818-826** (WhatsAppMessage construction): Add `button_values` parameter:
```python
        message = WhatsAppMessage(
            phone=phone,
            country_code=country_code,
            template_id=template_id,
            body_values=body_values,
            customer_id=customer.get("id"),
            media_url=_evt_media,
            media_filename=_evt_fname,
            button_values=button_values,  # CR-069
        )
```

### Self-test
Verified via a POS order trigger or campaign test send (Edit 5).

---

## EDIT 5 — Backend: Resolve button values in campaign test-send and bulk-send

**File**: `backend/routers/campaigns.py`  
**Functions**: `test_send_campaign()` (line 644-770), `_execute_campaign_send()` (line 336-530)  
**AC**: AC-11, AC-14  
**Risk**: MEDIUM (campaign send — hotspot. Same additive pattern as Edit 4)

### What to change — test_send_campaign (line 697-726)

**After line 711** (after `build_body_values(...)` call), insert:
```python
    # CR-069: Resolve button URL variable mappings for test send
    button_values = None
    _btn_mappings = {k: v for k, v in variable_mappings.items() if k.startswith("btn_url_")}
    if _btn_mappings:
        from core.whatsapp import resolve_variable
        button_values = {}
        for btn_key, mapped_field in _btn_mappings.items():
            btn_idx = btn_key.replace("btn_url_", "").strip("{}")
            mode = variable_modes.get(btn_key, "map")
            if mode == "text":
                button_values[btn_idx] = str(mapped_field)
            else:
                button_values[btn_idx] = resolve_variable(
                    mapped_field, test_customer, {}, brand_data,
                )
```

**Line 718-726** (WhatsAppMessage construction): Add `button_values`:
```python
    msg = WhatsAppMessage(
        phone=phone,
        country_code=country_code,
        template_id=template_id,
        body_values=body_values,
        customer_id="test-recipient",
        media_url=_media_url,
        media_filename=_media_fname,
        button_values=button_values,  # CR-069
    )
```

### What to change — _execute_campaign_send (line 423-481)

**After line 471** (after `build_body_values(...)` inside the `for cust in eligible:` loop), insert:
```python
            # CR-069: Resolve button URL variable mappings per recipient
            _btn_maps = {k: v for k, v in variable_mappings.items() if k.startswith("btn_url_")}
            _btn_vals = None
            if _btn_maps:
                from core.whatsapp import resolve_variable
                _btn_vals = {}
                for bk, mf in _btn_maps.items():
                    bi = bk.replace("btn_url_", "").strip("{}")
                    bm = variable_modes.get(bk, "map")
                    if bm == "text":
                        _btn_vals[bi] = str(mf)
                    else:
                        _btn_vals[bi] = resolve_variable(mf, cust, {}, brand_data)
```

**Line 473-481** (WhatsAppMessage construction inside loop): Add `button_values`:
```python
            msg = WhatsAppMessage(
                phone=phone,
                country_code=country_code,
                template_id=template_id,
                body_values=body_values,
                customer_id=cust.get("id"),
                media_url=_media_url,
                media_filename=_media_fname,
                button_values=_btn_vals,  # CR-069
            )
```

### Self-test
```bash
# Test send via campaign wizard (requires a campaign with final_bill + button mapping saved)
curl -s -X POST "$API_URL/api/campaigns/$CAMPAIGN_ID/test-send" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"phone":"9999999999","country_code":"91"}'
# Check backend log for: "buttonValues" in payload
```

---

## EDIT 6 — Frontend: Extract button dynamic URL variables in `openVariableMappingModal`

**File**: `frontend/src/pages/TemplatesPage.jsx`  
**Function**: `openVariableMappingModal()` (line 245-274)  
**AC**: AC-5  
**Risk**: LOW (additive — existing body variables extraction untouched)

### What to change

**Line 246**: After extracting body variables, also extract dynamic URL button variables.

Current:
```js
const variables = (template.temp_body.match(/\{\{\d+\}\}/g) || []).filter((v, i, a) => a.indexOf(v) === i);
setMappingTemplate({ ...template, variables });
```

Change to:
```js
const variables = (template.temp_body.match(/\{\{\d+\}\}/g) || []).filter((v, i, a) => a.indexOf(v) === i);
// CR-069: Extract dynamic URL button variables
const buttonVars = [];
(template.buttons || []).forEach((btn, idx) => {
    if (btn.url_type === "dynamic" && btn.url) {
        const urlVars = btn.url.match(/\{\{\d+\}\}/g) || [];
        urlVars.forEach(v => {
            buttonVars.push({ key: `btn_url_${v}`, label: `"${btn.text}" button URL ${v}`, buttonIndex: idx, buttonText: btn.text });
        });
    }
});
setMappingTemplate({ ...template, variables, buttonVars });
```

### Self-test
Open Map dialog for `final_bill` → `mappingTemplate.buttonVars` should have 1 entry: `{key: "btn_url_{{1}}", label: '"Bill" button URL {{1}}', buttonIndex: 1, buttonText: "Bill"}`.

---

## EDIT 7 — Frontend: Render button variable slots in Map Dialog

**File**: `frontend/src/pages/TemplatesPage.jsx`  
**Location**: After the body variable `.map()` loop (line 961, just before `</div>` that closes `space-y-3`)  
**AC**: AC-5  
**Risk**: LOW (additive JSX block)

### What to change

After line 961 (`})`), before line 962 (`</div>`), insert a new block that renders button URL variable mapping slots:

```jsx
{/* CR-069: Button URL Parameters section */}
{mappingTemplate.buttonVars?.length > 0 && (
    <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center gap-2 mb-3">
            <ExternalLink className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-semibold text-gray-700">Button URL Parameters</span>
        </div>
        {mappingTemplate.buttonVars.map(bv => {
            const currentMapping = variableMappings[bv.key];
            const currentMode = variableMappingModes[bv.key] || "map";
            return (
                <div key={bv.key} className="bg-blue-50 rounded-xl p-3 space-y-2 mb-2" data-testid={`slot-${bv.key}`}>
                    <div className="flex items-center justify-between">
                        <Badge variant="outline" className="bg-white font-medium text-sm text-blue-700 border-blue-200">
                            {bv.label}
                        </Badge>
                        <div className="flex rounded-lg border bg-white overflow-hidden text-[11px]">
                            <button type="button" onClick={() => setVariableMappingModes(prev => ({...prev, [bv.key]: "map"}))} className={`px-2.5 py-1 font-medium transition-colors ${currentMode === "map" ? "bg-blue-500 text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`} data-testid={`var-mode-map-${bv.key}`}>Map</button>
                            <button type="button" onClick={() => setVariableMappingModes(prev => ({...prev, [bv.key]: "text"}))} className={`px-2.5 py-1 font-medium transition-colors ${currentMode === "text" ? "bg-blue-500 text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`} data-testid={`var-mode-text-${bv.key}`}>Text</button>
                        </div>
                    </div>
                    {currentMode === "text" ? (
                        <Input type="text" value={variableMappings[bv.key] || ""} onChange={(e) => setVariableMappings(prev => ({...prev, [bv.key]: e.target.value}))} placeholder="Enter URL suffix..." className="h-10 rounded-lg" data-testid={`text-input-${bv.key}`} />
                    ) : (
                        /* Reuse the same variable picker trigger + VariablePicker as body vars */
                        <>
                            <button type="button" onClick={() => setPickerOpenFor(bv.key)} className="w-full flex items-center justify-between px-3 py-2 bg-white border border-gray-200 rounded-lg hover:border-blue-400 transition-colors cursor-pointer" data-testid={`picker-trigger-${bv.key}`}>
                                {currentMapping && currentMapping !== "none" ? (
                                    <span className="text-sm font-medium text-[#2B2B2B]">{availableVariables.find(v => v.key === currentMapping)?.label || currentMapping}</span>
                                ) : (
                                    <span className="text-sm text-gray-400">Select a variable...</span>
                                )}
                                <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                            </button>
                            <VariablePicker variables={availableVariables} eventKey={currentEventKey} selectedKey={currentMapping} open={pickerOpenFor === bv.key} onClose={() => setPickerOpenFor(null)} onSelect={(varKey) => { setVariableMappings(prev => ({...prev, [bv.key]: varKey})); setPickerOpenFor(null); }} />
                        </>
                    )}
                </div>
            );
        })}
        {/* Show static buttons as info */}
        {(mappingTemplate.buttons || []).filter(b => b.url_type !== "dynamic").map((btn, i) => (
            <p key={i} className="text-xs text-gray-400 mt-1">"{btn.text}" — {btn.type === "URL" ? "static URL" : btn.type} (no mapping needed)</p>
        ))}
    </div>
)}
```

**Import**: Add `ExternalLink` to the lucide-react import at the top of the file.

### Self-test
Open Map dialog for `final_bill` → "Button URL Parameters" section visible below `{{7}}` → `"Bill" button URL {{1}}` slot with Map/Text picker → select `einvoice_token` → Save.

---

## EDIT 8 — Frontend: Render button bars in WhatsApp preview bubbles (Templates Page)

**File**: `frontend/src/pages/TemplatesPage.jsx`  
**Locations**: Template card preview (line 677-694) and Map dialog preview (line 800-805)  
**AC**: AC-4  
**Risk**: LOW (additive JSX)

### What to change

Create a reusable inline block (or just repeat for both locations). After the message bubble's closing `</div>` (the `bg-[#DCF8C6]` div), add:

```jsx
{/* CR-069: Button bars below message bubble */}
{(tpl.buttons || []).length > 0 && (
    <div className="mt-1 space-y-0.5">
        {(tpl.buttons || []).map((btn, i) => (
            <div key={i} className="bg-white rounded-lg py-1.5 text-center text-sm text-blue-500 font-medium border border-gray-200 flex items-center justify-center gap-1.5">
                {btn.type === "URL" && <ExternalLink className="w-3.5 h-3.5" />}
                {btn.type === "PHONE_NUMBER" && <Phone className="w-3.5 h-3.5" />}
                {btn.text}
            </div>
        ))}
    </div>
)}
```

Apply this pattern at:
1. **Template card preview** — inside the `bg-[#E5DDD5]` div, after the `bg-[#DCF8C6]` closing div (around line 693)
2. **Map dialog preview** — inside the preview bubble, after the body text (around line 805)

### Self-test
Click "Preview" on `final_bill` → two button bars visible: `↗ Feedback` and `↗ Bill`.

---

## EDIT 9 — Frontend: Button variable chips on template card + Mapped badge logic

**File**: `frontend/src/pages/TemplatesPage.jsx`  
**Location**: Template card variable chips (line 664-675)  
**AC**: AC-3  
**Risk**: LOW (additive chip rendering)

### What to change

After the body variable chips loop (line 674-675), add button variable chips:

```jsx
{/* CR-069: Button URL variable chips */}
{(tpl.buttons || []).filter(b => b.url_type === "dynamic").map((btn, idx) => {
    const btnKey = `btn_url_{{${btn.url.match(/\{\{(\d+)\}\}/)?.[1] || idx}}}`;
    const btnMapped = mappings[btnKey];
    const btnLabel = btnMapped ? (availableVariables.find(av => av.key === btnMapped)?.label || btnMapped) : null;
    return (
        <span key={`btn-${idx}`} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${btnLabel ? "border-blue-300 bg-blue-50 text-blue-600" : "border-amber-300 bg-amber-50 text-amber-700"}`}>
            <ExternalLink className="w-3 h-3" /> "{btn.text}" URL {btnLabel ? <> → {btnLabel}</> : "(unmapped)"}
        </span>
    );
})}
```

**Mapped badge logic**: The existing `isMapped` computation (wherever it lives in the card rendering loop) must also check button vars. Find where `isMapped` is computed and extend:

```js
// After existing body isMapped check, also check button vars:
const dynamicBtns = (tpl.buttons || []).filter(b => b.url_type === "dynamic");
const allBtnsMapped = dynamicBtns.every(btn => {
    const idx = btn.url.match(/\{\{(\d+)\}\}/)?.[1] || "0";
    return mappings[`btn_url_{{${idx}}}`];
});
const isMapped = /* existing body check */ && allBtnsMapped;
```

### Self-test
`final_bill` card → blue chip: `↗ "Bill" URL → E-Invoice Token` (or amber `↗ "Bill" URL (unmapped)` if not mapped).

---

## EDIT 10 — Frontend: Campaign Wizard — carry `buttons` on template + `isFullyMapped`

**File**: `frontend/src/pages/CampaignWizardPage.jsx`  
**Functions**: Template formatting (line 126-137), `isFullyMapped()` (line 160-164)  
**AC**: AC-8  
**Risk**: LOW

### What to change

**Line 132-136**: Add `buttons` to the formatted template object:
```js
buttons: t.buttons || [],  // CR-069
```

**Line 160-164**: Extend `isFullyMapped` to check button vars:
```js
const isFullyMapped = (tpl) => {
    if (!tpl?.variables?.length && !(tpl?.buttons || []).some(b => b.url_type === "dynamic")) return true;
    const maps = allMappings[tpl.id] || {};
    const bodyMapped = (tpl.variables || []).every(v => maps[v] && maps[v].trim() !== "");
    // CR-069: check dynamic URL button vars
    const btnMapped = (tpl.buttons || []).filter(b => b.url_type === "dynamic").every(btn => {
        const idx = btn.url?.match(/\{\{(\d+)\}\}/)?.[1] || "0";
        return maps[`btn_url_{{${idx}}}`]?.trim();
    });
    return bodyMapped && btnMapped;
};
```

### Self-test
Campaign Wizard dropdown → `final_bill` shows "(needs button mapping)" if `btn_url_{{1}}` is unmapped.

---

## EDIT 11 — Frontend: Campaign Wizard — button rows in mapping grid

**File**: `frontend/src/pages/CampaignWizardPage.jsx`  
**Location**: Variable Mapping Grid (line 470-488)  
**AC**: AC-9  
**Risk**: LOW (additive JSX)

### What to change

After the body variable mapping rows (line 483, after the `</React.Fragment>` closing), add:

```jsx
{/* CR-069: Button URL mapping rows */}
{(currentTemplate?.buttons || []).filter(b => b.url_type === "dynamic").map(btn => {
    const idx = btn.url?.match(/\{\{(\d+)\}\}/)?.[1] || "0";
    const btnKey = `btn_url_{{${idx}}}`;
    const mapping = variableMappings[btnKey];
    return (
        <React.Fragment key={btnKey}>
            <span className="text-blue-500 font-mono flex items-center gap-1"><ExternalLink className="w-3 h-3" /> "{btn.text}"</span>
            <span className="text-gray-400">→</span>
            <span className="font-semibold text-blue-600">{mapping || <span className="text-amber-500">unmapped</span>}</span>
        </React.Fragment>
    );
})}
```

**Line 485**: Update the count text:
```js
const btnCount = (currentTemplate?.buttons || []).filter(b => b.url_type === "dynamic").length;
// Change "All {N} variables mapped" to include buttons:
<p>All {Object.keys(variableMappings).length}{btnCount > 0 ? ` body + ${btnCount} button` : ""} variables mapped</p>
```

**Import**: Add `ExternalLink` to the lucide-react import.

### Self-test
Select `final_bill` in wizard → grid shows `↗ "Bill" → einvoice_token` row below body rows.

---

## EDIT 12 — Frontend: Campaign Wizard — button bars in WhatsApp preview

**File**: `frontend/src/pages/CampaignWizardPage.jsx`  
**Location**: WhatsApp Preview (line 532-543)  
**AC**: AC-10  
**Risk**: LOW

### What to change

After the message bubble's closing `</div>` (line 541-542), add:

```jsx
{/* CR-069: Button bars */}
{(currentTemplate?.buttons || []).length > 0 && (
    <div className="mt-1 space-y-0.5">
        {currentTemplate.buttons.map((btn, i) => (
            <div key={i} className="bg-white rounded-lg py-1.5 text-center text-sm text-blue-500 font-medium border border-gray-200 flex items-center justify-center gap-1.5">
                {btn.type === "URL" && <ExternalLink className="w-3.5 h-3.5" />}
                {btn.text}
            </div>
        ))}
    </div>
)}
```

### Self-test
Select `final_bill` → preview bubble shows Feedback + Bill button bars.

---

## EDIT 13 — Frontend: Test Template modal — button variable inputs

**File**: `frontend/src/components/shared/WhatsAppAutomationContent.jsx`  
**Function**: `TestTemplateModal` (line 35-55 for variable init, line 147-174 for rendering)  
**AC**: AC-6  
**Risk**: LOW

### What to change

**Line 35-55** (useEffect that builds testVariables): After the body variable extraction loop, also add button variable entries:

```js
// CR-069: Add button URL variables
(template.buttons || []).forEach((btn, idx) => {
    if (btn.url_type === "dynamic" && btn.url) {
        const urlVarMatch = btn.url.match(/\{\{(\d+)\}\}/);
        if (urlVarMatch) {
            const btnKey = `btn_url_{{${urlVarMatch[1]}}}`;
            const mappedField = savedMapping[btnKey];
            if (mappedField && mappedField !== "none") {
                const varInfo = availableVariables.find(v => v.key === mappedField);
                vars[btnKey] = varInfo?.example || "";
            } else {
                vars[btnKey] = "";
            }
            modes[btnKey] = savedModes[btnKey] || "manual";
        }
    }
});
```

**Line 65-74** (handleSendTest — building bodyValues): After building bodyValues from body vars, also build buttonValues:

```js
// CR-069: Extract button values
const buttonValues = {};
let hasButtonValues = false;
Object.entries(testVariables).forEach(([key, value]) => {
    if (key.startsWith("btn_url_")) {
        const idx = key.replace("btn_url_", "").replace(/[{}]/g, "");
        buttonValues[idx] = value || "";
        hasButtonValues = true;
    }
});
```

And include `button_values: hasButtonValues ? buttonValues : undefined` in the API POST payload.

**Line 147-174** (rendering): The existing `.map()` over `testVariables` will automatically render button variable inputs because they're now in `testVariables`. Optionally add a visual separator before button entries (check if key starts with `btn_url_`).

### Self-test
Automation → send_bill event → Test → modal shows `🔗 "Bill" URL {{1}}` input below body vars.

---

## EDIT 14 — Frontend: Test Template modal — button bars in preview

**File**: `frontend/src/components/shared/WhatsAppAutomationContent.jsx`  
**Location**: Preview bubble (line 178-186)  
**AC**: AC-6  
**Risk**: LOW

### What to change

Same pattern as Edit 8/12 — after the message bubble div, add button bars:

```jsx
{(template?.buttons || []).length > 0 && (
    <div className="mt-1 space-y-0.5">
        {template.buttons.map((btn, i) => (
            <div key={i} className="bg-white rounded-lg py-1.5 text-center text-sm text-blue-500 font-medium border border-gray-200 flex items-center justify-center gap-1.5">
                {btn.type === "URL" && <ExternalLink className="w-3.5 h-3.5" />}
                {btn.text}
            </div>
        ))}
    </div>
)}
```

**Note**: `template.buttons` will only be available if Edit 1 (backend enrichment) is deployed. The `buttons || []` guard ensures no breakage if data is missing.

### Self-test
Test Template modal → preview bubble shows Feedback + Bill bars.

---

## Verification Matrix (from Intake AC mapped to Edits)

| V# | AC | Edit(s) | How to Verify |
|---|---|---|---|
| V1 | AC-1 | Edit 1 | `curl /authkey-templates` → `buttons` array present for `final_bill` |
| V2 | AC-2 | Edit 7 | Save mapping with `btn_url_{{1}}: einvoice_token` → reload → persists |
| V3 | AC-3 | Edit 9 | Template card → blue `↗ "Bill" URL` chip visible |
| V4 | AC-4 | Edit 8 | Template preview → Feedback + Bill bars below bubble |
| V5 | AC-5 | Edits 6+7 | Map dialog → "Button URL Parameters" section with `"Bill" URL {{1}}` slot |
| V6 | AC-6 | Edits 13+14 | Test Template modal → button input + button bars |
| V7 | AC-8 | Edit 10 | `isFullyMapped` → false when button var unmapped |
| V8 | AC-9 | Edit 11 | Campaign grid → `↗ "Bill" → einvoice_token` row |
| V9 | AC-10 | Edit 12 | Campaign preview → button bars |
| V10 | AC-11+12 | Edits 3+5 | Campaign test-send → `buttonValues` in payload log |
| V11 | AC-13 | Edit 4 | POS order trigger → button values resolved in message |
| V12 | AC-14 | Edit 5 | Campaign bulk send → button values per recipient |
| V13 | AC-15 | All | `loyalty_bill` (no buttons) → zero visual change |
| V14 | AC-16 | Edit 7 | `hungrybill_2` (1 static button) → preview shows button, no mapping slot |

---

## Regression Checklist

| # | Check | Method |
|---|---|---|
| R1 | Existing body variable mappings load correctly | Open Map dialog for `loyalty_bill` → all 9 body vars still mapped |
| R2 | Save body-only mapping still works | Map a body var on `test` template → Save → reload → persists |
| R3 | Campaign send with no-button template works | Send campaign with `loyalty_bill` → messages delivered |
| R4 | Event trigger with no-button template works | Trigger `send_bill` on a template without buttons → message delivered |
| R5 | AuthKey templates without custom_templates still render | Templates not in `custom_templates` → no `buttons` field, no crash |

---

```
Planning complete: CR-069
Stage: Implementation Plan
Code reality: PARTIAL (button data in DB, not surfaced)
Risk: MEDIUM-HIGH
Files WILL change: 6 (as locked in Impact Analysis)
Files WILL NOT touch: 7 (as locked in Impact Analysis)
Owner decisions: none required
Edits: 14 total (5 backend, 9 frontend)
Docs: planning/CR_069_IMPLEMENTATION_PLAN.md
Next: Owner approval → Implementation Agent
```

*End of CR-069 Implementation Plan*
