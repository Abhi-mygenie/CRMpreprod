# CR-066: Impact Analysis + Implementation Plan

**Date**: 2026-07-16
**Role**: Planning Agent
**Source**: INV-009, CR-066 Intake (Q1-Q4 ALL LOCKED)
**Risk**: HIGH (hotspot `routers/whatsapp.py` — approved Q4, additive only)

---

## 1. Code Reality Check

| Component | Current State | Lines | Status |
|---|---|---|---|
| `validateMetaCompliance(tpl)` | FE validation gate, V1-V10 | TemplateBuilderPage.jsx:21-99 | EXISTS — extend |
| `getBodyWarnings(body)` | FE real-time inline warnings | TemplateBuilderPage.jsx:103-112 | EXISTS — extend |
| `getHeaderWarnings(...)` | FE header warnings | TemplateBuilderPage.jsx:114-122 | EXISTS — extend |
| `getFooterWarnings(footer)` | FE footer warnings | TemplateBuilderPage.jsx:124-129 | EXISTS — extend |
| WhatsApp preview renderer | FE preview with formatting | TemplateBuilderPage.jsx:720-755 | EXISTS — extend |
| Backend V1-V4 safety-net | BE validation in `create_meta_template` | routers/whatsapp.py:747-791 | EXISTS — extend |

**Conflicts**: None. No other active CR touches these code sections.

---

## 2. Files WILL Change

| File | Section | Change Type | LOC Est. |
|---|---|---|---|
| `frontend/src/pages/TemplateBuilderPage.jsx` | `validateMetaCompliance()` (line 21-99) | EXTEND — add V11-V23 checks after line 97 | +60 |
| `frontend/src/pages/TemplateBuilderPage.jsx` | `getBodyWarnings()` (line 103-112) | EXTEND — add real-time formatting warnings | +25 |
| `frontend/src/pages/TemplateBuilderPage.jsx` | `getFooterWarnings()` (line 124-129) | EXTEND — add V20 formatting check | +5 |
| `frontend/src/pages/TemplateBuilderPage.jsx` | Preview renderer (line 720-755) | EXTEND — highlight orphan markers in red | +15 |
| `backend/routers/whatsapp.py` | `create_meta_template()` validation (line 747-791) | EXTEND — add V11-V15 backend safety-net | +40 |

**Total estimated**: ~145 LOC net additions across 2 files.

## 3. Files WILL NOT Change

| File | Reason |
|---|---|
| `core/whatsapp.py` | Send path — out of scope |
| `core/campaign_jobs.py` | Campaign execution — out of scope |
| `routers/campaigns.py` | Campaign endpoints — out of scope |
| `routers/whatsapp.py` (other sections) | Only `create_meta_template` validation block touched |
| `models/schemas.py` | No schema changes |
| `TemplatesPage.jsx` | No retroactive flagging (Q3=a) |
| `CampaignWizardPage.jsx` | Not affected |
| All `core/*.py` files | Not affected |

---

## 4. Implementation Plan — Edit-by-Edit

### E-A: Frontend `validateMetaCompliance()` — V11-V15 HARD BLOCK checks

**File**: `frontend/src/pages/TemplateBuilderPage.jsx`
**Insert after**: line 97 (after V10, before `return` on line 99)

#### E-A1: V11 — Unmatched formatting markers (HARD BLOCK)

```javascript
// CR-066 V11: Unmatched formatting markers
// Count _ (italic) — must be even
const underscoreCount = (body.match(/_/g) || []).length;
if (underscoreCount % 2 !== 0) errors.push("Body has an unmatched _ (italic marker). Each _ must have a closing _");

// Count ~ (strikethrough) — must be even
const tildeCount = (body.match(/~/g) || []).length;
if (tildeCount % 2 !== 0) errors.push("Body has an unmatched ~ (strikethrough marker). Each ~ must have a closing ~");

// Count ``` (monospace) — must be even
const monoCount = (body.match(/```/g) || []).length;
if (monoCount % 2 !== 0) errors.push("Body has an unmatched ``` (monospace marker). Each ``` must have a closing ```");

// Count * (bold) — exclude bullet-point "* " at line-start, then remaining must be even
const allStars = (body.match(/\*/g) || []).length;
const bulletStars = (body.match(/(?:^|\n)\* /g) || []).length;
const boldStars = allStars - bulletStars;
if (boldStars % 2 !== 0) errors.push("Body has an unmatched * (bold marker). Each *bold* must have a closing *. Note: bullet points should use • instead of *");
```

#### E-A2: V12 — Variable at start/end of body (HARD BLOCK)

```javascript
// CR-066 V12: Variable at start/end of body
const trimmedBody = body.trim();
if (/^\{\{\d+\}\}/.test(trimmedBody)) errors.push("Body cannot start with a variable ({{N}}). Add text before the first variable");
if (/\{\{\d+\}\}$/.test(trimmedBody)) errors.push("Body cannot end with a variable ({{N}}). Add text after the last variable");
```

#### E-A3: V13 — Adjacent variables without text (HARD BLOCK)

```javascript
// CR-066 V13: Adjacent variables without text between them
if (/\}\}\s*\{\{/.test(body)) errors.push("Variables cannot be adjacent (e.g., {{1}}{{2}}). Add text between variables");
```

#### E-A4: V14 — Formatting wrapping variables (HARD BLOCK)

```javascript
// CR-066 V14: Formatting markers directly wrapping variables
if (/[*_~](\{\{\d+\}\})[*_~]/.test(body)) errors.push("Do not wrap variables in formatting markers (e.g., *{{1}}* or _{{2}}_). Apply formatting to the variable value at send-time instead");
```

#### E-A5: V15 — Body hard limit enforcement (HARD BLOCK)

```javascript
// CR-066 V15: Body hard character limit
if (body.length > 1024) errors.push(`Body exceeds 1024 character limit (${body.length} characters). Shorten the message`);
```

### E-B: Frontend `validateMetaCompliance()` — V16-V20 WARNING checks

**Same file, same insert location** (after E-A5, before `return`).
**Note**: Per Q2, P0 (V11-V15) are errors that BLOCK. P1 (V16-V20) are also pushed to `errors[]` — the `valid` flag will be `false` and submission is blocked. Owner said "hard block" applies to all.

#### E-B1: V16 — Emoji count > 10

```javascript
// CR-066 V16: Emoji count limit
const emojiMatches = body.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B50}-\u{2B55}\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{2733}-\u{2734}\u{2714}-\u{2716}\u{2764}\u{FE0F}]/gu) || [];
if (emojiMatches.length > 10) errors.push(`Body has ${emojiMatches.length} emojis — Meta allows maximum 10 per template`);
```

#### E-B2: V17 — Consecutive newlines > 2

```javascript
// CR-066 V17: Max 2 consecutive newlines
if (/\n{3,}/.test(body)) errors.push("Body has more than 2 consecutive blank lines. Meta allows maximum 2 newlines in a row");
```

#### E-B3: V18 — Excessive spaces/tabs

```javascript
// CR-066 V18: No tabs, max 4 consecutive spaces
if (body.includes("\t")) errors.push("Body contains tab characters — Meta does not allow tabs in template body");
if (/ {5,}/.test(body)) errors.push("Body has more than 4 consecutive spaces — Meta does not allow excessive whitespace");
```

#### E-B4: V19 — Character count > 550 for Marketing/Utility

```javascript
// CR-066 V19: 550-char warning for Marketing/Utility
if (body.length > 550 && ["utility", "marketing"].includes(tpl.category)) {
  errors.push(`Body is ${body.length} characters — Meta may auto-reject Marketing/Utility templates over 550 characters`);
}
```

#### E-B5: V20 — Formatting in header/footer

```javascript
// CR-066 V20: No formatting markers in header text or footer
if (tpl.header_type === "text" && /[*_~`]/.test(headerContent)) {
  errors.push("Header text cannot contain formatting markers (*, _, ~, `). Meta does not support formatting in headers");
}
if (/[*_~`]/.test(footer)) {
  errors.push("Footer cannot contain formatting markers (*, _, ~, `). Meta does not support formatting in footers");
}
```

### E-C: Frontend `validateMetaCompliance()` — V21-V23 QUALITY checks

#### E-C1: V21 — Category-content mismatch heuristic

```javascript
// CR-066 V21: Category-content mismatch heuristic
if (tpl.category === "utility") {
  const promoWords = ["menu", "offer", "discount", "price", "subscribe", "launched", "inquire", "promo", "deal", "sale", "wallet plan"];
  const bodyLower = body.toLowerCase();
  const found = promoWords.filter(w => bodyLower.includes(w));
  if (found.length >= 2) errors.push(`Utility template appears promotional (found: ${found.join(", ")}). Consider using Marketing category instead`);
}
```

#### E-C2: V22 — ALL CAPS blocks

```javascript
// CR-066 V22: Excessive ALL CAPS
if (/[A-Z]{20,}/.test(body.replace(/\s/g, ""))) errors.push("Body has long ALL-CAPS sections — Meta may flag this as aggressive. Consider using mixed case");
```

Note: We strip whitespace before checking so "WE DO NOT ACCEPT CASH PAYMENTS" (with spaces) is caught.

#### E-C3: V23 — URL shorteners

```javascript
// CR-066 V23: URL shorteners
if (/bit\.ly|tinyurl|goo\.gl|ow\.ly|t\.co|is\.gd|buff\.ly/i.test(body)) {
  errors.push("Body contains a URL shortener — Meta rejects templates with shortened URLs. Use the full URL instead");
}
```

### E-D: Frontend `getBodyWarnings()` — Real-time inline warnings

**File**: `frontend/src/pages/TemplateBuilderPage.jsx`
**Insert after**: line 111 (before `return w;` on line 112)

```javascript
// CR-066: Real-time formatting marker warnings
const usCount = (body.match(/_/g) || []).length;
if (usCount % 2 !== 0) w.push("Unmatched _ (italic) — add a closing _ or remove the stray one");
const tildeC = (body.match(/~/g) || []).length;
if (tildeC % 2 !== 0) w.push("Unmatched ~ (strikethrough) — add a closing ~ or remove it");
const monoC = (body.match(/```/g) || []).length;
if (monoC % 2 !== 0) w.push("Unmatched ``` (monospace) — add a closing ```");
const allS = (body.match(/\*/g) || []).length;
const bulletS = (body.match(/(?:^|\n)\* /g) || []).length;
if ((allS - bulletS) % 2 !== 0) w.push("Unmatched * (bold) — check bold formatting or use • for bullets");
```

### E-E: Frontend `getFooterWarnings()` — V20 inline warning

**File**: `frontend/src/pages/TemplateBuilderPage.jsx`
**Insert after**: line 128 (before `return w;` on line 129)

```javascript
// CR-066 V20: Formatting in footer
if (/[*_~`]/.test(footer)) w.push("Footer cannot contain formatting markers (*, _, ~, `)");
```

### E-F: Frontend Preview — Orphan marker highlighting

**File**: `frontend/src/pages/TemplateBuilderPage.jsx`
**Insert after**: line 747 (after the `~` strikethrough replace, before `return`)

```javascript
// CR-066: Highlight orphan formatting markers in red
html = html.replace(/(?<![<\w])_(?![<\w])/g, '<span class="text-red-500 bg-red-50 px-0.5 rounded font-bold" title="Orphan italic marker">_</span>');
```

**Note**: This is a best-effort visual cue. The regex targets lone `_` that weren't consumed by the italic pairing regex above. It won't catch every edge case but will flag the most common ones (like the `inquire!!!!_` case).

### E-G: Backend `create_meta_template()` — V11-V15 safety-net

**File**: `backend/routers/whatsapp.py`
**Insert after**: line 788 (after Q18 check, before `if validation_errors:` on line 790)

```python
    # ---- CR-066: V11-V15 Backend safety-net ----
    # V11: Unmatched formatting markers
    us_count = body_text_raw.count("_")
    if us_count % 2 != 0:
        validation_errors.append(f"Body has unmatched _ (italic marker): {us_count} found, must be even")
    tilde_count = body_text_raw.count("~")
    if tilde_count % 2 != 0:
        validation_errors.append(f"Body has unmatched ~ (strikethrough): {tilde_count} found, must be even")
    mono_count = body_text_raw.count("```")
    if mono_count % 2 != 0:
        validation_errors.append(f"Body has unmatched ``` (monospace): {mono_count} found, must be even")
    all_stars = body_text_raw.count("*")
    bullet_stars = len(_re.findall(r'(?:^|\n)\* ', body_text_raw))
    bold_stars = all_stars - bullet_stars
    if bold_stars % 2 != 0:
        validation_errors.append(f"Body has unmatched * (bold marker): {bold_stars} non-bullet * found, must be even")

    # V12: Variable at start/end of body
    stripped_body = body_text_raw.strip()
    if _re.match(r'^\{\{\d+\}\}', stripped_body):
        validation_errors.append("Body cannot start with a variable")
    if _re.search(r'\{\{\d+\}\}$', stripped_body):
        validation_errors.append("Body cannot end with a variable")

    # V13: Adjacent variables
    if _re.search(r'\}\}\s*\{\{', body_text_raw):
        validation_errors.append("Adjacent variables without text between them")

    # V14: Formatting wrapping variables
    if _re.search(r'[*_~]\{\{\d+\}\}[*_~]', body_text_raw):
        validation_errors.append("Formatting markers wrapping variables (e.g., *{{1}}*) not allowed")

    # V15: Body hard limit
    if len(body_text_raw) > 1024:
        validation_errors.append(f"Body exceeds 1024 character limit ({len(body_text_raw)} chars)")

    # V16: Emoji count
    emoji_re = _re.compile(r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF\U00002600-\U000026FF\U00002700-\U000027BF\U00002733-\U00002734\U00002714-\U00002716\U00002764]')
    emoji_count = len(emoji_re.findall(body_text_raw))
    if emoji_count > 10:
        validation_errors.append(f"Body has {emoji_count} emojis — maximum 10 allowed")

    # V20: Formatting in header/footer
    if header_type_raw == "text" and _re.search(r'[*_~`]', header_content_raw):
        validation_errors.append("Header text cannot contain formatting markers")
    if _re.search(r'[*_~`]', footer_raw):
        validation_errors.append("Footer cannot contain formatting markers")
```

---

## 5. Verification Matrix

| ID | Test | Method | Expected |
|---|---|---|---|
| **T1** | Submit body with orphan `_` | FE submit + BE curl | BLOCKED — "unmatched _" error |
| **T2** | Submit body with orphan `*` (not bullet) | FE submit + BE curl | BLOCKED — "unmatched *" error |
| **T3** | Submit body with orphan `~` | FE submit + BE curl | BLOCKED — "unmatched ~" error |
| **T4** | Submit body with orphan ` ``` ` | FE submit + BE curl | BLOCKED — "unmatched ```" error |
| **T5** | Submit body with `* item` bullets (even bold `*`) | FE submit | PASSES — bullets excluded from bold count |
| **T6** | Submit body starting with `{{1}}` | FE submit + BE curl | BLOCKED — "cannot start with variable" |
| **T7** | Submit body ending with `{{1}}` | FE submit + BE curl | BLOCKED — "cannot end with variable" |
| **T8** | Submit body with `{{1}}{{2}}` | FE submit + BE curl | BLOCKED — "adjacent variables" |
| **T9** | Submit body with `*{{1}}*` | FE submit + BE curl | BLOCKED — "formatting wrapping variables" |
| **T10** | Submit body > 1024 chars | FE submit + BE curl | BLOCKED — "exceeds 1024" |
| **T11** | Submit body with 11 emojis | FE submit | BLOCKED — "11 emojis, max 10" |
| **T12** | Submit body with 3 consecutive newlines | FE submit | BLOCKED — ">2 consecutive newlines" |
| **T13** | Submit body with tab char | FE submit | BLOCKED — "tab characters" |
| **T14** | Submit body with 5+ spaces | FE submit | BLOCKED — ">4 consecutive spaces" |
| **T15** | Submit 600-char Marketing body | FE submit | BLOCKED — ">550 chars for Marketing" |
| **T16** | Submit with `*` in footer | FE submit | BLOCKED — "footer formatting markers" |
| **T17** | Submit Utility with "menu" + "price" | FE submit | BLOCKED — "category mismatch" |
| **T18** | Submit body with 20+ uppercase chars | FE submit | BLOCKED — "ALL CAPS" |
| **T19** | Submit body with bit.ly link | FE submit | BLOCKED — "URL shortener" |
| **T20** | Submit valid body (no violations) | FE submit | PASSES — no errors |
| **T21** | Real-time: type orphan `_` in body | Observe warnings below textarea | Warning shows: "Unmatched _" |
| **T22** | Preview: body with orphan `_` | Observe WhatsApp preview | Orphan `_` highlighted in red |
| **T23** | Bypass FE, POST directly to `/meta/create-template` with orphan `_` | curl | HTTP 400 — backend rejects |
| **T24** | Body with valid `*bold*` + `* bullet` items | FE submit | PASSES — correctly distinguishes |
| **T25** | `daily_premiumlunchmenu_2026` body (the original failing template) | FE submit | BLOCKED — catches orphan `_` + unmatched `*` + category mismatch |

---

## 6. Regression Scope

| Area | Risk | Check |
|---|---|---|
| Existing V1-V10 checks | NONE — code only appended after, no existing logic modified | Run T20 (valid body passes) |
| Template save as draft | NONE — `handleSaveDraft` does NOT call `validateMetaCompliance` | Confirm draft save still works without validation |
| Template editing | NONE — edit path uses same `validateMetaCompliance` on submit, which gains new checks | Existing templates can still be edited |
| Send path | NONE — `core/whatsapp.py` not touched | No regression possible |
| Webhook path | NONE — webhook handler not touched | No regression possible |
| Campaign send | NONE — `core/campaign_jobs.py` not touched | No regression possible |

---

## 7. Implementation Order

1. **E-A** (V11-V15 FE hard blocks) — highest impact, fixes the actual failure
2. **E-G** (V11-V15 BE safety-net) — mirrors FE, prevents bypass
3. **E-B** (V16-V20 FE warnings-as-blocks) — secondary protections
4. **E-C** (V21-V23 FE quality checks) — polish
5. **E-D** (Real-time inline warnings) — UX improvement
6. **E-E** (Footer inline warning) — small addition
7. **E-F** (Preview highlighting) — visual feedback

All 7 edits are independent and can be applied in any order. Recommended: batch E-A through E-G in a single implementation pass.

---

## Planning Output

```
Planning complete: CR-066
Stage: Impact Analysis + Implementation Plan
Code reality: FULL (all target sections inspected, line numbers verified)
Risk: HIGH (hotspot file, but additive-only — approved Q4)
Files WILL change: TemplateBuilderPage.jsx (5 sections), routers/whatsapp.py (1 section)
Files WILL NOT touch: core/whatsapp.py, core/campaign_jobs.py, routers/campaigns.py, models/schemas.py, all other files
Owner decisions: ALL 4 LOCKED (Q1=all together, Q2=hard block, Q3=no retroactive, Q4=approved)
Docs: This plan + DECISIONS_LOG § 2026-07-16
Next: Owner approval → Implementation gate opens
```
