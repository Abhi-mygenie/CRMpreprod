# CR-023 Phase 3: Add Variable Button + Dynamic URL Button

> **Status**: `cr023_phase3_planning_awaiting_approval`
> **Date**: 2026-06-06
> **Scope**: 2 UX features in Template Builder
> **Files touched**: 1 frontend file, 1 backend file
> **Effort**: ~1.5 hours

---

## Feature A: "Add Variable" Button

### A1. What it does
A button below the body textarea that inserts `{{N}}` at the cursor position, auto-incrementing N. Eliminates the `{1}` vs `{{1}}` typo problem — user never types braces manually.

### A2. Current state
- Line 438-441: plain `<textarea>` for body
- Line 442-444: hint text "Use {{1}}, {{2}} for variables" + char counter
- No mechanism to insert variables programmatically

### A3. Behavior spec

| Action | Result |
|---|---|
| Click "Add Variable" (empty body) | Inserts `{{1}}` at cursor / end |
| Click again | Inserts `{{2}}` at cursor |
| Click when body has `{{1}}` and `{{3}}` | Inserts `{{4}}` (next after highest) |
| Cursor between "Hello " and " world" | Inserts at cursor: `Hello {{1}} world` |
| Body at 1024 chars | Button disabled (no room) |

**Auto-number logic**: Find max N from all `{{N}}` in body → insert `{{max+1}}`. If none exist, insert `{{1}}`.

**Cursor tracking**: Use a `ref` on the textarea. On click, read `selectionStart`, splice the variable text at that position, then restore cursor to after the inserted text.

### A4. Also for Header Text
- When header type = "text", show a smaller "Add {{1}}" button next to the header input
- Header only allows ONE variable (`{{1}}`), so the button is disabled if `{{1}}` already exists in header content
- Label: "Add {{1}}" (not "Add Variable") to make the single-var limit clear

### A5. Implementation — file:line changes

**File**: `frontend/src/pages/TemplateBuilderPage.jsx`

| Location | Change |
|---|---|
| Line 1 (imports) | Add `useRef` to React imports |
| After line ~60 (state) | Add `const bodyRef = useRef(null)` for textarea ref |
| After line ~248 (updateField) | Add `insertBodyVariable()` function (~15 lines) |
| After line ~248 | Add `insertHeaderVariable()` function (~8 lines) |
| Line 438 (textarea) | Add `ref={bodyRef}` attribute |
| Line 442-444 (hint row) | Restructure: left = hint text, right = "Add Variable" button + char counter |
| Line 412 (header input) | Add "Add {{1}}" mini-button next to the input (disabled if {{1}} exists) |

**`insertBodyVariable()` pseudocode**:
```
function insertBodyVariable() {
  const textarea = bodyRef.current;
  const cursorPos = textarea?.selectionStart ?? tpl.body.length;
  const maxN = Math.max(0, ...[...tpl.body.matchAll(/\{\{(\d+)\}\}/g)].map(m => parseInt(m[1])));
  const varText = `{{${maxN + 1}}}`;
  const newBody = tpl.body.slice(0, cursorPos) + varText + tpl.body.slice(cursorPos);
  setTpl(p => ({ ...p, body: newBody, body_examples: [] }));
  // Restore cursor after inserted text
  setTimeout(() => {
    textarea?.focus();
    const newPos = cursorPos + varText.length;
    textarea?.setSelectionRange(newPos, newPos);
  }, 0);
}
```

**Button UI** (matching reference screenshot style):
```jsx
<button onClick={insertBodyVariable}
  disabled={tpl.body.length >= LIMITS.body}
  className="px-3 py-1 bg-[#F26B33] text-white text-xs font-semibold rounded-full 
             hover:bg-[#d95a28] disabled:opacity-40 disabled:cursor-not-allowed 
             flex items-center gap-1 transition"
  data-testid="builder-add-variable-btn">
  <Plus className="w-3 h-3" /> Add Variable
</button>
```

### A6. Acceptance criteria

| AC | Verify |
|---|---|
| AC-A1 | Click "Add Variable" on empty body → `{{1}}` inserted |
| AC-A2 | Click again → `{{2}}` inserted after cursor |
| AC-A3 | Body has `{{1}}{{3}}` → click inserts `{{4}}` (max+1) |
| AC-A4 | Place cursor mid-text → variable inserted at cursor position |
| AC-A5 | Body at 1024 chars → button disabled |
| AC-A6 | Header "Add {{1}}" button inserts {{1}}, disabled after first insert |
| AC-A7 | Example inputs auto-appear after variable is inserted |

---

## Feature B: Dynamic URL Button

### B1. What it does
When user creates a URL button, they can choose between:
- **Static URL** — fixed link (current behavior): `https://example.com/page`
- **Dynamic URL** — base URL + `{{1}}` variable suffix: `https://example.com/invoices/{{1}}`

The dynamic suffix is filled at send time (e.g., with the invoice token from CR-014).

### B2. Meta Graph API format for dynamic URL buttons

**Template CREATION payload** (what backend sends to Meta):
```json
{
  "type": "BUTTONS",
  "buttons": [
    {
      "type": "URL",
      "text": "View Bill",
      "url": "https://domain.com/invoices/{{1}}",
      "example": ["https://domain.com/invoices/abc123sample"]
    }
  ]
}
```

Key: `url` has `{{1}}` at the end. Meta requires `example` array with a fully resolved sample URL.

**At SEND time** (in AuthKey/CRM send flow):
```json
{
  "type": "button",
  "sub_type": "url",
  "index": "0",
  "parameters": [{"type": "text", "text": "actual_token_here"}]
}
```

### B3. Current state

**Frontend** (line 496-498):
```jsx
{btn.type === "URL" && (
  <Input value={btn.url || ""} onChange={...} placeholder="https://..." />
)}
```
Single static URL input. No dynamic option. No example field.

**Backend** (line 466-467):
```python
if btn_type == "URL":
    btn_obj["url"] = btn.get("url", "")
```
Passes URL as-is. No `example` array for dynamic URLs.

### B4. Frontend UX design

When button type = URL, show:

```
┌─────────────────────────────────────────────────────────┐
│ [URL ▼] [Button text_____] [0/25]                       │
│                                                         │
│  URL Type: (●) Static  ( ) Dynamic                      │
│                                                         │
│  [Static selected]:                                     │
│  URL: [https://example.com/page____________]            │
│                                                         │
│  [Dynamic selected]:                                    │
│  Base URL: [https://domain.com/invoices/___] + {{1}}    │
│  Example:  [https://domain.com/invoices/abc123]         │
│  ↑ required by Meta for approval                        │
└─────────────────────────────────────────────────────────┘
```

**Button data model change**:
```js
// Current:
{ type: "URL", text: "View Bill", url: "https://..." }

// New (static — unchanged):
{ type: "URL", text: "View Bill", url: "https://...", url_type: "static" }

// New (dynamic):
{ type: "URL", text: "View Bill", url: "https://base/{{1}}", url_type: "dynamic", url_base: "https://base/", url_example: "https://base/abc123" }
```

`url` is always the final resolved URL sent to Meta. `url_base` is UI-only for the input.
`url_type` defaults to `"static"` for backward compat.

### B5. Backend changes

**File**: `backend/routers/whatsapp.py` — `create_meta_template()` (line 460-470)

```python
# Current:
if btn_type == "URL":
    btn_obj["url"] = btn.get("url", "")

# New:
if btn_type == "URL":
    url = btn.get("url", "")
    btn_obj["url"] = url
    # If URL contains {{1}}, it's dynamic — add example
    if "{{1}}" in url:
        url_example = btn.get("url_example", "")
        if url_example:
            btn_obj["example"] = [url_example]
```

### B6. WhatsApp preview update

**File**: `frontend/src/pages/TemplateBuilderPage.jsx` — preview section (line 570-571)

Currently shows:
```jsx
{btn.text || "Button"} {btn.type === "URL" && "↗"}
```

For dynamic URLs, also show a subtle "Dynamic" badge:
```jsx
{btn.text || "Button"} {btn.type === "URL" && "↗"} 
{btn.url_type === "dynamic" && <span className="text-[8px] opacity-50">dynamic</span>}
```

### B7. V5 validation update

Current V5 in `validateMetaCompliance`:
```js
if (btn.type === "URL" && !URL_RE.test(btn.url || ""))
```

New V5 — handle dynamic URLs:
```js
if (btn.type === "URL") {
  if (btn.url_type === "dynamic") {
    if (!URL_RE.test(btn.url_base || "")) errors.push(`Button ${n}: Base URL is required`);
    if (!btn.url_example) errors.push(`Button ${n}: Example URL is required for dynamic URLs`);
  } else {
    if (!URL_RE.test(btn.url || "")) errors.push(`Button ${n}: URL is required`);
  }
}
```

### B8. Implementation — file:line changes

**File**: `frontend/src/pages/TemplateBuilderPage.jsx`

| Location | Change |
|---|---|
| Line 252 (addButton) | Default new button: add `url_type: "static"` field |
| Line 496-498 (URL button row) | Replace single Input with Static/Dynamic radio toggle + conditional inputs |
| Line 257-261 (updateButton) | When `url_type` changes to "dynamic", auto-compose `url = url_base + "{{1}}"`. When "static", clear `url_base`/`url_example` |
| Line 570-571 (preview) | Add "dynamic" badge for dynamic URL buttons |
| validateMetaCompliance V5 | Update to handle dynamic URL validation |

**File**: `backend/routers/whatsapp.py`

| Location | Change |
|---|---|
| Line 466-467 (URL button) | Add `example` array when URL contains `{{1}}` |

### B9. Acceptance criteria

| AC | Verify |
|---|---|
| AC-B1 | URL button defaults to "Static" mode (backward compatible) |
| AC-B2 | Switch to "Dynamic" → shows base URL input + `{{1}}` chip + example input |
| AC-B3 | Base URL `https://x.com/invoices/` → `url` becomes `https://x.com/invoices/{{1}}` |
| AC-B4 | Missing example URL blocks submit (V5 updated) |
| AC-B5 | Backend sends `example` array for dynamic URLs to Meta |
| AC-B6 | WhatsApp preview shows "dynamic" badge on button |
| AC-B7 | Static URL buttons work exactly as before (no regression) |
| AC-B8 | Editing existing template with static URL → still loads correctly |

---

## Summary

| Feature | Files | Lines changed | Risk |
|---|---|---|---|
| A: Add Variable button | Frontend only | ~40 lines added | Zero — additive, no existing behavior changed |
| B: Dynamic URL button | Frontend + Backend | ~60 lines added/changed | Low — static URL buttons unchanged, dynamic is new path |

---

## Sign-off

**S1**: Approve both A + B for implementation?
