# BUG-015: CR-066 V19/V21/V22 — Soft warnings incorrectly implemented as hard blocks

**Date**: 2026-07-16
**Source**: Owner report during CR-066 smoke test
**Severity**: P1 — blocks legitimate template creation (6/10 approved templates would be blocked)
**Risk**: LOW — 1-line change per check, no logic change, same file
**Root cause**: BUG_FIX (Q2 "hard block all" was applied uniformly to all 13 checks, but V19/V21/V22 are P2 quality hints that Meta does NOT enforce)

---

## Problem

CR-066 implemented V11-V23 as hard blocks per Q2 decision. But V19, V21, V22 are **false positives** — Meta approves templates that trigger them:

| Check | Trigger | Approved templates that violate | Should be |
|---|---|---|---|
| **V19** | Body > 550 chars (Marketing/Utility) | 6/10 (up to 711 chars) | SOFT WARNING |
| **V21** | Utility + promo words ("menu","price","inquire") | 6/10 | SOFT WARNING |
| **V22** | ALL CAPS sections (20+ uppercase chars) | 6/10 (up to 185 caps chars) | SOFT WARNING |

## Evidence

All 10 approved templates on `owner@jehsnest.com` were scanned. **Zero** violate V11-V18/V20/V23 (hard block checks). **Six** violate V19+V21+V22 simultaneously — Meta approved every one.

## Fix — Exact edits

### File: `frontend/src/pages/TemplateBuilderPage.jsx`

**Location**: Inside `validateMetaCompliance(tpl)` function — the V19, V21, V22 blocks currently push to `errors[]` which blocks submission.

**Change**: Move V19, V21, V22 out of `errors[]` into a separate `warnings[]` array. Return both. Show warnings as a yellow info toast on submit (non-blocking), not in the red error list.

### Edit 1: Change `validateMetaCompliance` return type

**Current** (end of function):
```javascript
return { valid: errors.length === 0, errors };
```

**New**:
```javascript
return { valid: errors.length === 0, errors, warnings };
```

Add `const warnings = [];` at the top of the function (after `const errors = [];`).

### Edit 2: Move V19 from `errors` → `warnings`

**Current**:
```javascript
if (body.length > 550 && ["utility", "marketing"].includes(tpl.category)) {
  errors.push(`Body is ${body.length} characters ...`);
}
```

**Change**: Replace `errors.push` with `warnings.push`.

### Edit 3: Move V21 from `errors` → `warnings`

**Current**:
```javascript
if (foundPromo.length >= 2) errors.push(`Utility template appears promotional ...`);
```

**Change**: Replace `errors.push` with `warnings.push`.

### Edit 4: Move V22 from `errors` → `warnings`

**Current**:
```javascript
if (capsRun.length >= 20) errors.push("Body has long ALL-CAPS sections ...");
```

**Change**: Replace `errors.push` with `warnings.push`.

### Edit 5: Update `handleSubmitToMeta` to show soft warnings

**Current** (line ~373):
```javascript
const { valid, errors } = validateMetaCompliance(tpl);
if (!valid) {
  toast.error(errors[0]);
  setMetaErrors(errors);
  return;
}
```

**New**:
```javascript
const { valid, errors, warnings } = validateMetaCompliance(tpl);
if (!valid) {
  toast.error(errors[0]);
  setMetaErrors(errors);
  return;
}
// CR-066 BUG-015: show soft warnings as info toast (non-blocking)
if (warnings.length > 0) {
  warnings.forEach(w => toast.warning(w));
}
setMetaErrors([]);
```

### Backend: No change needed

Backend `create_meta_template()` does NOT have V19/V21/V22 — only V11-V16/V20 (all legitimate hard blocks). No backend edit required.

---

## Verification

| Test | Expected |
|---|---|
| Submit 647-char Marketing body | PASSES — yellow toast "Body is 647 characters..." but submission proceeds |
| Submit Utility body with "menu" + "price" | PASSES — yellow toast "appears promotional" but submission proceeds |
| Submit body with ALL CAPS section | PASSES — yellow toast "ALL CAPS" but submission proceeds |
| Submit body with orphan `_` | Still BLOCKED (V11 = hard block, unchanged) |
| Submit body > 1024 chars | Still BLOCKED (V15 = hard block, unchanged) |

---

## Final Segregation (updated for docs)

### HARD BLOCK (10 checks — prevent submission):
- V11: Unmatched formatting markers (`_`, `*`, `~`, ` ``` `)
- V12: Variable at start/end of body
- V13: Adjacent variables without text
- V14: Formatting wrapping variables
- V15: Body > 1024 characters
- V16: Emoji count > 10
- V17: More than 2 consecutive newlines
- V18: Tabs or 5+ consecutive spaces
- V20: Formatting in header/footer
- V23: URL shorteners

### SOFT WARNING (3 checks — toast only, allow submission):
- V19: Body > 550 chars (Marketing/Utility)
- V21: Category-content mismatch (Utility + promo words)
- V22: ALL CAPS sections
