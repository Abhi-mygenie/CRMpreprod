# CR-068 — Impact Analysis
## "Validate Template" — Standalone Compliance Dry-Run

**ID**: CR-068  
**Date**: 2026-08-06  
**Role**: Planning Agent  
**Stage**: Impact Analysis  
**Risk**: LOW — frontend-only, zero backend changes, zero hotspot files  

---

## 1. Registration Verified

CR-068 registered in `CR_STATUS_DASHBOARD.md`. Source: BUG-019 root-cause analysis.

---

## 2. What CR-068 Does — Plain English

The Template Builder page has a "Submit to Meta" button. The V1-V23 compliance check
(`validateMetaCompliance`) runs inside `handleSubmitToMeta` — but only AFTER WABA
credentials are verified. Tenants without Meta WABA configured get a 503 "credentials
missing" error BEFORE the compliance check ever fires.

CR-068 adds a **standalone "Validate" button** that runs exactly the same compliance
checks client-side, making zero API calls. Any tenant can check their template body
for compliance errors at any time, before ever submitting to Meta.

---

## 3. Owner Decisions

| Q | Question | Decision |
|---|---|---|
| **Q1** | Frontend-only vs FE + backend endpoint? | **OPEN** — recommendation: **frontend-only** (reuse existing JS functions, zero backend changes, faster) |
| **Q2** | Show errors inline panel or toast list? | **OPEN** — recommendation: **inline panel** below the body textarea (more readable for multiple errors) |
| **Q3** | Priority vs CR-067? | **OPEN** — recommendation: **implement together** (different files, no conflict, same session) |

*Planning agent recommendation: frontend-only (Q1a), inline panel (Q2a), both together (Q3). Owner may confirm or override.*

---

## 4. Code Reality — Everything Already Exists

All validation logic is **fully written** in `TemplateBuilderPage.jsx`. CR-068 is pure wiring.

| Function | Location | What it does |
|---|---|---|
| `validateMetaCompliance(tpl)` | `TemplateBuilderPage.jsx:21` | Returns `{valid, errors[], warnings[]}` — V1-V23 full check |
| `getBodyWarnings(body)` | `TemplateBuilderPage.jsx:169` | Returns `warnings[]` — soft formatting checks |
| `getFooterWarnings(footer)` | `TemplateBuilderPage.jsx:200` | Returns `warnings[]` — footer checks |

Currently called at: `handleSubmitToMeta` line 451 only.

**Gap**: No standalone trigger. No way to run these checks without clicking "Submit to Meta".

---

## 5. What Needs to Be Added

### State (1 new `useState`)
```javascript
const [validateResult, setValidateResult] = useState(null);
// { errors: [], warnings: [] } | null
```

### Handler (1 new function, ~10 LOC)
```javascript
const handleValidate = () => {
  const { valid, errors, warnings } = validateMetaCompliance(tpl);
  const bodyW  = getBodyWarnings(tpl.body);
  const footerW = getFooterWarnings(tpl.footer);
  setValidateResult({
    valid,
    errors,
    warnings: [...warnings, ...bodyW, ...footerW],
  });
};
```

### Button (1 addition to top bar, ~3 LOC)
```jsx
<Button variant="outline" onClick={handleValidate} data-testid="builder-validate-btn">
  Validate
</Button>
```

### Inline result panel (1 conditional block, ~20 LOC)
Shown below the body textarea when `validateResult !== null`:
```jsx
{validateResult && (
  <div data-testid="builder-validate-result">
    {validateResult.valid
      ? <p className="text-green-600">All V1-V23 checks passed</p>
      : validateResult.errors.map((e, i) => <p key={i} className="text-red-600">{e}</p>)}
    {validateResult.warnings.map((w, i) => <p key={i} className="text-amber-600">{w}</p>)}
    <button onClick={() => setValidateResult(null)}>Dismiss</button>
  </div>
)}
```

---

## 6. Files WILL Change

| File | Change | LOC estimate |
|---|---|---|
| `frontend/src/pages/TemplateBuilderPage.jsx` | 1 useState + 1 handler function + 1 button in top bar + 1 inline result panel | ~35 LOC added, 0 modified |

---

## 7. Files WILL NOT Change

Everything else. No backend files. No database. No API endpoints. No hotspot files.

---

## 8. Verification Matrix

| # | Test | Expected |
|---|---|---|
| V1 | Click "Validate" on a clean template | "All V1-V23 checks passed" shown in green |
| V2 | Click "Validate" on template with unmatched `_italic_` marker | Red error: "Body has an unmatched _ (italic marker)" |
| V3 | Click "Validate" on template with body > 1024 chars | Red error: "Body exceeds 1024 character hard limit" |
| V4 | Click "Validate" with no Meta WABA credentials configured | Works (no API call made) — same result as tenant with credentials |
| V5 | Click "Dismiss" on result panel | Panel disappears |
| V6 | Edit body after validation → click Validate again | Fresh result shown (old result replaced) |
| V7 | "Submit to Meta" button still works unchanged | Submit flow unaffected — regression clean |
| V8 | `data-testid="builder-validate-btn"` present | Testable via Playwright |
| V9 | `data-testid="builder-validate-result"` present when shown | Testable via Playwright |

---

## 9. Effort Estimate

| Work | Estimate |
|---|---|
| Frontend change (1 file) | ~45 min |
| **Total** | **~45 min** |

Smallest CR in the sprint. Can be done in the same session as CR-067.

---

```
Planning complete: CR-068 (Impact Analysis)
Stage: Impact Analysis
Code reality: FULL (all validation functions exist — pure wiring task)
Risk: LOW (frontend-only, no hotspot files)
Files WILL change: TemplateBuilderPage.jsx only (+~35 LOC, 0 modified)
Files WILL NOT touch: any backend file, any other frontend file
Owner decisions: Q1-Q3 open (recommendations provided — owner to confirm)
Next: Owner confirms Q1-Q3 → Implementation Plan → Implementation
```
