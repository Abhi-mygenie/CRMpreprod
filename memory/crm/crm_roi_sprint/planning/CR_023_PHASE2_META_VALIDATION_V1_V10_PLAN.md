# CR-023 Phase 2: Meta Template Validation — V1-V10 Implementation Plan

> **Status**: `cr023_phase2_planning_awaiting_approval`
> **Date**: 2026-06-06
> **Scope**: Frontend-first validation (+ backend safety net) for Meta WhatsApp template standards
> **Files touched**: 1 frontend file, 1 backend file
> **Effort**: ~2-3 hours

---

## 1. Problem Statement

Template `order_bill_test` was rejected by Meta with `INVALID_FORMAT` because body contained `{1}` (single brace) instead of `{{1}}` (double brace). The Template Builder has no frontend validations against Meta's template standards, letting invalid templates pass through to Meta's API where they get silently rejected.

---

## 2. Current State (Code Audit)

### Frontend: `TemplateBuilderPage.jsx` (476 lines)

**Existing validations in `handleSubmitToMeta()` (lines 182-204):**
- ✅ Name + body required (non-empty) — line 183
- ✅ nameError check (lowercase+num+underscore regex) — line 184
- ✅ duplicateWarning check (Meta API duplicate name) — line 185
- ✅ Body length > 1024 chars — line 186
- ✅ Footer length > 60 chars — line 187
- ✅ Body examples count matches body variables count — lines 188-191

**Existing variable detection (line 137):**
```js
const bodyVars = [...new Set((tpl.body.match(/\{\{\d+\}\}/g) || []))].sort(...)
```
- Only detects `{{N}}` double-brace format
- Does NOT detect or warn about `{N}` single-brace typos
- Does NOT check sequential ordering (1,2,3 — no gaps)

### Backend: `routers/whatsapp.py` — `create_meta_template()` (lines 341-522)

**Existing backend validations:**
- ✅ Meta credentials present (waba_id + access_token) — lines 359-363
- ✅ Body text non-empty — lines 395-396
- ❌ No variable format validation
- ❌ No sequential check
- ❌ No footer variable block
- ❌ No button field validation

---

## 3. V1-V10 Specification

### V1 — Single-brace variable detection (🔴 CRITICAL — caused the test failure)

**Rule**: Detect `{N}` patterns (single brace with a digit) in body, header, and footer. Warn user to use `{{N}}` instead.

**Detection regex**: `/(?<!\{)\{(\d+)\}(?!\})/g` — matches `{1}` but NOT `{{1}}`

**UX**: 
- Real-time inline warning below body/header/footer textarea (red text)
- Block submit with toast error

**Where**: 
- New `validateMetaCompliance()` function (called from `handleSubmitToMeta`, line 182)
- Inline hint below body textarea (near line 325)
- Inline hint below header text input (near line 301)
- Inline hint below footer input (near line 352)

---

### V2 — Sequential variable numbering

**Rule**: Body variables must start at `{{1}}` and be sequential. No gaps (e.g., `{{1}}, {{3}}` without `{{2}}` is invalid).

**Detection**: Extract all `{{N}}` from body → extract numbers → sort → check `[1, 2, 3, ...]` sequence.

**UX**: Block submit with clear error: "Variables must be sequential: found {{1}}, {{3}} — missing {{2}}"

**Where**: Inside `validateMetaCompliance()`, checked on body text.

---

### V3 — Footer cannot contain variables

**Rule**: Meta does not support variables (`{{N}}`) in footer text.

**Detection**: Check footer for `{{` or single-brace `{N}` patterns.

**UX**: 
- Real-time inline warning below footer input
- Block submit with toast error: "Footer cannot contain variables"

**Where**: Inline hint near footer input (line 352) + `validateMetaCompliance()`.

---

### V4 — Header text: max ONE variable, must be `{{1}}`

**Rule**: Text headers allow exactly 1 variable, and it must be `{{1}}`.

**Detection**: Count `{{N}}` matches in header_content. If > 1 or if the single var is not `{{1}}`, reject.

**UX**:
- Real-time inline warning below header text input
- Block submit with toast error: "Header text allows only one variable: {{1}}"

**Where**: Inline hint near header text input (line 301) + `validateMetaCompliance()`.

---

### V5 — URL button must have valid URL

**Rule**: When button type is URL, the `url` field must be a valid HTTP/HTTPS URL.

**Detection**: Regex `/^https?:\/\/.+/` on `btn.url`.

**UX**: Block submit with toast: "Button N: URL is required and must start with https://"

**Where**: Inside `validateMetaCompliance()`, loop over buttons.

---

### V6 — Phone button must have valid phone number

**Rule**: When button type is PHONE_NUMBER, the `phone_number` field must be present and start with `+` (E.164-like format).

**Detection**: Regex `/^\+\d{7,15}$/` on `btn.phone_number`.

**UX**: Block submit with toast: "Button N: Phone number must be in international format (e.g., +919876543210)"

**Where**: Inside `validateMetaCompliance()`, loop over buttons.

---

### V7 — Quick Reply button text cannot be empty

**Rule**: When button type is QUICK_REPLY, the `text` field must be non-empty.

**Detection**: `btn.text.trim()` length > 0.

**UX**: Block submit with toast: "Button N: Quick Reply text is required"

**Where**: Inside `validateMetaCompliance()`, loop over buttons.

---

### V8 — Media URL validation for media headers

**Rule**: When header type is image/video/document, the `media_url` must be:
- A valid HTTP/HTTPS URL
- Present (non-empty) — Meta requires an example media for approval

**Detection**: Regex `/^https?:\/\/.+\..+/` on `tpl.media_url`. Non-empty check.

**UX**: Block submit with toast: "Media URL is required for {type} header. Must be a publicly accessible https:// URL"

**Where**: Inside `validateMetaCompliance()`.

---

### V9 — Template name cannot start with underscore

**Rule**: Meta rejects template names starting with `_`.

**Detection**: `name.startsWith("_")` check.

**UX**: Real-time inline warning below name input (extend existing `validateName` function at line 98).

**Where**: Extend `validateName()` callback (line 98-103) + `validateMetaCompliance()`.

---

### V10 — Example values cannot contain `{{`

**Rule**: Meta rejects body_examples that contain curly brace patterns (they should be resolved sample values, not variable references).

**Detection**: Check each `body_examples[i]` and `header_examples[i]` for `{{` substring.

**UX**: Block submit with toast: "Example values cannot contain {{  — provide real sample values"

**Where**: Inside `validateMetaCompliance()`.

---

## 4. Implementation Design

### 4.1 Frontend — Single validation function

Add a `validateMetaCompliance()` function that returns `{ valid: boolean, errors: string[] }`. Called at the top of `handleSubmitToMeta()` before the API call. Returns ALL errors at once (not just the first).

```
// Pseudocode
function validateMetaCompliance(tpl) {
  const errors = [];
  
  // V1: Single-brace detection (body + header + footer)
  // V2: Sequential variables
  // V3: Footer no variables
  // V4: Header max 1 var = {{1}}
  // V5: URL button URL required
  // V6: Phone button format
  // V7: Quick Reply text required
  // V8: Media URL required for media headers
  // V9: Name no leading underscore
  // V10: Examples no curly braces
  
  return { valid: errors.length === 0, errors };
}
```

**Error display**: First error as toast. Full list shown in a red validation box above the Submit button (visible before user clicks).

### 4.2 Frontend — Inline real-time hints

For V1, V3, V4, V9: Show red inline warning text below the field AS the user types. These are the most common user mistakes and benefit from immediate feedback.

State variable: `const [metaWarnings, setMetaWarnings] = useState({})` — keyed by field name.

Recalculated in `updateField()` for body, footer, header_content, and in `validateName()` for template_name.

### 4.3 Backend — Safety net validation

Add a validation pass inside `create_meta_template()` (line 393, before the API call) that checks V1-V4 and returns a 400 with clear message. This prevents invalid payloads from ever reaching Meta.

Backend checks: V1 (single brace), V2 (sequential), V3 (footer vars), V4 (header vars), V7 (empty button text).

Skip V5/V6/V8/V9/V10 on backend — Meta API will catch those anyway.

---

## 5. File Plan

### File 1: `frontend/src/pages/TemplateBuilderPage.jsx`

| Location | Change | V# |
|---|---|---|
| After line 13 (LIMITS const) | Add `SINGLE_BRACE_REGEX`, `DOUBLE_BRACE_REGEX`, `URL_REGEX`, `PHONE_REGEX` constants | All |
| After line 38 (charClass function) | Add `validateMetaCompliance(tpl)` function (~50 lines) | V1-V10 |
| Lines 98-103 (validateName) | Extend: add V9 underscore check | V9 |
| Line 137 (bodyVars) | Add `singleBraceVars` detector for real-time hint | V1 |
| After line 137 | Add `metaWarnings` computation for V1/V3/V4 inline hints | V1,V3,V4 |
| Lines 182-191 (handleSubmitToMeta validation block) | Replace with call to `validateMetaCompliance()` + show errors | All |
| After line 327 (body hint text) | Add V1 inline warning (single-brace detected) + V2 sequential warning | V1,V2 |
| After line 301 (header char counter) | Add V4 inline warning (too many header vars) | V4 |
| After line 352 (footer char counter) | Add V3 inline warning (footer variables detected) | V3 |
| Lines 369-376 (button inputs) | Add V5/V6 inline hints on URL/phone inputs | V5,V6 |

### File 2: `backend/routers/whatsapp.py`

| Location | Change | V# |
|---|---|---|
| Lines 393-396 (body validation) | Extend: add V1 single-brace check, V2 sequential check, V3 footer var check, V4 header var check | V1-V4 |

---

## 6. Acceptance Criteria

| AC | Description | Verify |
|---|---|---|
| AC-1 | Body with `{1}` shows real-time red warning "Use {{1}} not {1}" below textarea | Type `hi {1}` → warning appears |
| AC-2 | Body with `{{1}}, {{3}}` (gap) blocks submit with "Missing {{2}}" error | Click Submit → toast error |
| AC-3 | Footer with `{{1}}` shows real-time red warning + blocks submit | Type var in footer → warning + blocked |
| AC-4 | Header text with `{{1}} {{2}}` shows warning + blocks submit | Two vars in header → warning + blocked |
| AC-5 | URL button without valid URL blocks submit | Add URL button, leave url empty → blocked |
| AC-6 | Phone button without `+` prefix blocks submit | Add phone button with `9876543210` → blocked |
| AC-7 | Quick Reply button with empty text blocks submit | Add QR button, leave text empty → blocked |
| AC-8 | Media header without URL blocks submit | Select Image header, leave URL empty → blocked |
| AC-9 | Name starting with `_` shows error + blocks submit | Type `_test` → error appears |
| AC-10 | Body example containing `{{` blocks submit | Enter `{{name}}` as example → blocked |
| AC-11 | Valid template with `{{1}}` passes all checks and submits successfully | Full valid template → submits to Meta |
| AC-12 | Backend returns 400 with clear message if V1-V4 slip through frontend | Curl with `{1}` body → 400 error |

---

## 7. What is NOT in scope

- Template status webhook from Meta (separate CR)
- TemplatesPage.jsx filter rename (cosmetic, not blocking)
- Additional language options
- Template category re-classification warning
- Character-level content policy checks (Meta does this)

---

## 8. Sign-off Questions

**S1**: Validation approach — show ALL errors at once (red box + first error as toast), or block on first error only?
- Recommended: Show all at once

**S2**: Backend safety net — add V1-V4 server-side validation as well, or frontend-only?
- Recommended: Both (defense in depth)

**S3**: Should we auto-correct `{N}` → `{{N}}` (auto-fix) or just warn and let user fix?
- Recommended: Warn only (auto-fix can cause unintended changes if user meant literal braces)
