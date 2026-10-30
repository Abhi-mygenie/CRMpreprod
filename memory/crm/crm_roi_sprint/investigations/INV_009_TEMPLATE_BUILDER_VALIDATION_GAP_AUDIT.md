# INV-009: Template Builder Validation Gap Audit — All Failure Paths

**Date**: 2026-07-16
**Role**: Investigation Agent
**Trigger**: `daily_premiumlunchmenu_2026` (wid=41117) fails with "error in message" on AuthKey
**Risk**: CRITICAL — templates pass CRM validation, get approved by Meta, but FAIL at send-time
**Scope**: Full audit of CRM Template Builder validation vs Meta/AuthKey requirements

---

## SPECIFIC ISSUES IN `daily_premiumlunchmenu_2026`

| # | Issue | Severity | CRM Caught It? |
|---|---|---|---|
| 1 | **Orphan `_` (italic marker)** at `...inquire!!!!_` — single underscore with no matching pair | BLOCKER (send fails) | NO |
| 2 | **13 `*` markers (odd count)** — 3 bold pairs + 7 bullet-point `*` = ambiguous parsing by Meta | HIGH RISK | NO |
| 3 | **Category mismatch** — declared as Utility but body is promotional (menu, pricing, wallet plans, order timings) | HIGH RISK (Meta can reject downstream) | NO |
| 4 | **648 chars** — over Meta's April 2026 stricter 550-char auto-reject threshold for Marketing/Utility | MEDIUM RISK | NO (shows counter but doesn't block) |
| 5 | **5 ALL-CAPS sections** — `WE DO NOT ACCEPT CASH PAYMENTS...` etc. Meta may flag as spammy | LOW RISK | NO |

**Root cause of "error in message"**: Most likely **Issue #1** (orphan `_`). Meta's Cloud API rejects messages with malformed WhatsApp formatting at send-time, even though the template was approved.

---

## FULL VALIDATION GAP AUDIT

### What the CRM validates today (V1–V10):

| ID | Check | Frontend | Backend | Status |
|---|---|---|---|---|
| V1 | Single-brace `{1}` detection | YES | YES | ✅ |
| V2 | Sequential variable numbering | YES | YES | ✅ |
| V3 | Variables in footer | YES | YES | ✅ |
| V4 | Header text max 1 variable | YES | YES | ✅ |
| V5 | URL button valid URL | YES | NO | ⚠️ FE only |
| V6 | Phone button valid format | YES | NO | ⚠️ FE only |
| V7 | Quick Reply text not empty | YES | NO | ⚠️ FE only |
| V8 | Media header requires upload | YES | YES | ✅ |
| V9 | Name can't start with `_` | YES | NO | ⚠️ FE only |
| V10 | Example values can't contain `{{` | YES | NO | ⚠️ FE only |
| Q18 | No `{{n}}` in media header | YES | YES | ✅ |

### What the CRM DOES NOT validate (all gaps):

| Gap ID | Missing Validation | Meta Rule | Severity | Impact |
|---|---|---|---|---|
| **G1** | **Unmatched `_` (italic marker)** | Paired formatting required | BLOCKER | **Send fails at Meta** — template renders with malformed formatting. This is what broke `daily_premiumlunchmenu_2026` |
| **G2** | **Unmatched `*` (bold marker)** | Paired formatting required | BLOCKER | Same as G1. Hard to detect because `* ` bullet-point style uses same character as bold |
| **G3** | **Unmatched `~` (strikethrough)** | Paired formatting required | BLOCKER | Same as G1 |
| **G4** | **Unmatched ` ``` ` (monospace)** | Paired formatting required | BLOCKER | Same as G1 |
| **G5** | **Emoji count > 10** | Meta hard limit: 10 emojis per template | BLOCKER | Auto-rejected by Meta |
| **G6** | **Body > 1024 characters** | Hard character limit | BLOCKER | Frontend shows counter but does NOT block submission. User can submit a 1200-char body |
| **G7** | **Body > 550 characters** | Meta April 2026 update for Marketing/Utility | HIGH | Auto-rejected without human review on newer Meta enforcement |
| **G8** | **Variable at start of body** | `{{1}} Hello` not allowed | BLOCKER | Rejected by Meta: "variable cannot be at start/end" |
| **G9** | **Variable at end of body** | `Hello {{1}}` not allowed | BLOCKER | Same |
| **G10** | **Adjacent variables without text** | `{{1}}{{2}}` not allowed | BLOCKER | Rejected by Meta: "adjacent placeholders" |
| **G11** | **> 2 consecutive newlines** | Max 2 newlines in a row | HIGH | Template rejection |
| **G12** | **> 4 consecutive spaces** | No tabs or >4 spaces | HIGH | Template rejection |
| **G13** | **Tab characters** | Tabs not allowed | HIGH | Template rejection |
| **G14** | **Formatting around variables** | `*{{1}}*` not allowed | HIGH | Rejected — formatting cannot wrap variables |
| **G15** | **Formatting in header/footer** | No `*_~` in header or footer text | HIGH | Rejected by Meta |
| **G16** | **Body starts/ends with newline** | First/last char cannot be `\n` | MEDIUM | May cause rejection |
| **G17** | **Variable density** | Too many variables for body length | MEDIUM | Meta may reject for low-context templates |
| **G18** | **ALL CAPS blocks** | Excessive caps flagged as aggressive | LOW | May trigger policy review |
| **G19** | **URL shorteners in body** | bit.ly, tinyurl etc. not allowed | MEDIUM | Rejected by Meta |
| **G20** | **Category-content mismatch** | Utility must be transactional, not promotional | HIGH | Meta can downgrade or reject at send-time |

---

## CR-062 FORMATTING TOOLBAR — SPECIFIC EDGE CASES

The formatting toolbar (added in CR-062) wraps selected text with WhatsApp markers:

```javascript
const wrapBodySelection = (marker) => {
    const newBody = `${before}${marker}${selected}${marker}${after}`;
};
```

### Toolbar-specific gaps:

| # | Edge Case | What Happens | Should Happen |
|---|---|---|---|
| **T1** | User clicks Bold with NO text selected | Inserts `**` (empty bold pair). User deletes one `*` → orphan `*` | Should warn or prevent empty formatting |
| **T2** | User manually types `_` in textarea (not via toolbar) | No validation — orphan `_` passes all checks | Textarea input should trigger real-time marker balance check |
| **T3** | User wraps already-formatted text: selects `*bold*` and clicks Italic | Produces `_*bold*_` — nested formatting | Should detect and warn about nesting |
| **T4** | User wraps a variable: selects `{{1}}` and clicks Bold | Produces `*{{1}}*` — formatting around variable (Meta rejects) | Should block wrapping variables in formatting markers |
| **T5** | User types bullet `* Item` on multiple lines | Creates multiple standalone `*` chars that look like unmatched bold | Should differentiate bullet `* ` from bold `*text*` in validation |
| **T6** | User partially deletes a ``` pair | Produces orphan ``` — hard to spot visually | Real-time warning on unmatched ``` |

---

## PREVIEW RENDERER GAP

The WhatsApp preview (lines 743-747) uses regex to render formatting:

```javascript
.replace(/(^|[\s>])\*([^\s*][^*\n]*?)\*(?=[\s<]|$)/g, '$1<b>$2</b>')
.replace(/(^|[\s>])_([^\s_][^_\n]*?)_(?=[\s<]|$)/g, '$1<i>$2</i>')
```

**Problem**: The preview regex requires PAIRED markers to match. An orphan `_` or `*` simply shows as literal text in the preview. **The user sees a clean preview but the message fails at send-time.** The preview gives FALSE confidence.

**Should**: If an orphan marker is detected, the preview should highlight it in red as an error, not silently render it as text.

---

## BACKEND VALIDATION GAP

The backend (`create_meta_template`, lines 747-791) only mirrors V1-V4 from the frontend as a "safety net". It does NOT validate:
- Formatting markers (G1-G4)
- Emoji count (G5)
- Character limits as hard blocks (G6-G7)
- Variable position rules (G8-G10)
- Whitespace rules (G11-G13)
- Any of the other gaps

**This means**: If someone bypasses the frontend (direct API call), ALL gaps become exploitable. The backend should be the authoritative validation layer.

---

## RECOMMENDED VALIDATION ADDITIONS (Priority Order)

### P0 — Must block submission (causes send failure):

1. **V11: Unmatched formatting markers** — Count `*`, `_`, `~`, ` ``` ` in body. After excluding bullet-point `* ` (asterisk+space at line start), remaining `*` must be even. `_`, `~` must be even. ` ``` ` must be even. Block submission if odd.

2. **V12: Variable at start/end of body** — Check `body.trim().startsWith('{{')` and `body.trim().endsWith('}}')`

3. **V13: Adjacent variables** — Check for `}}{{` or `}}\s*{{` without intervening non-whitespace text

4. **V14: Formatting wrapping variables** — Check for `*{{`, `_{{`, `~{{` patterns

5. **V15: Body hard limit enforcement** — Block submission if body > 1024 chars (currently only shows counter, doesn't block)

### P1 — Should warn before submission (causes rejection or downstream issues):

6. **V16: Emoji count** — Warn if > 10 emojis

7. **V17: Consecutive newlines** — Warn if > 2 `\n` in a row

8. **V18: Excessive spaces/tabs** — Warn if > 4 consecutive spaces or any tabs

9. **V19: Character count > 550** — Warn for Marketing/Utility category

10. **V20: Formatting in header/footer** — Block `*`, `_`, `~` in header text and footer

### P2 — Should warn (quality/deliverability):

11. **V21: Category-content mismatch** — Heuristic: if Utility but body contains "menu", "offer", "discount", "price", "subscribe", warn about category

12. **V22: ALL CAPS blocks** — Warn if > 20 consecutive uppercase characters

13. **V23: URL shorteners** — Detect bit.ly, tinyurl, etc. in body text

### Frontend real-time (inline warnings like existing `getBodyWarnings`):

14. **Formatting balance indicator** — Show real-time count of unmatched markers below the textarea

15. **Preview error highlighting** — If orphan markers detected, highlight them in red in the WhatsApp preview instead of rendering as plain text

### Backend safety net:

16. **Mirror all P0 checks in `create_meta_template`** — Backend must be the authoritative gate. Frontend validation can be bypassed.

---

## Investigation Output

```
Investigation complete: INV-009
Root cause: CRM Template Builder has no validation for WhatsApp formatting
  markers (*, _, ~, ```). The orphan _ in daily_premiumlunchmenu_2026
  passes all V1-V10 checks, gets approved by Meta, but fails at send-time.
Classification: FE + BE validation gap (CR-062 introduced formatting
  toolbar without corresponding validation)
Confidence: HIGH
Steps used: 10/10
Evidence: Template body analysis, Meta API rules research, CRM code audit
Recommendation: Add V11-V23 validations (P0 = block submission, P1 = warn)
  with backend safety-net. P0 items are the most urgent — they cause
  silent send-time failures that waste campaign sends.
```
