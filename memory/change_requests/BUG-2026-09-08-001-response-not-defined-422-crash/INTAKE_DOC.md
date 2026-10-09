# INTAKE DOC — BUG-2026-09-08-001

## Item Identity

| Field | Value |
|-------|-------|
| **Bug ID** | BUG-2026-09-08-001 |
| **Title** | `response is not defined` — `handlePlaceOrder` crashes on HTTP 422 stock-out |
| **Classification** | Bug — Runtime crash (post-QA production defect) |
| **Date Registered** | 2026-09-08 |
| **Reported By** | Owner (screenshot + backend reply `stock_out_web_reply8.md`) |
| **Severity** | **P0** |
| **Risk** | **CRITICAL** |
| **Status** | **IMPLEMENTATION COMPLETE — awaiting QA** |

---

## 1. Owner Report (verbatim / faithful paraphrase)

> "for this CR we found issues — attached is backend reply — investigate"
> Screenshot shows: URL `/69/review-order`, network tab shows `POST /place → HTTP 422`,
> React error overlay: **"Uncaught runtime error: `response is not defined`"**,
> stack trace: `handlePlaceOrder @ bundle.js:35408:63`

---

## 2. Classification

| Check | Result |
|-------|--------|
| New bug? | **YES** — not previously registered |
| Feature request? | No |
| Duplicate of existing item? | **DISTINCT** — CR-2026-09-07-001 shipped the stock-out layer but introduced this scope bug. This is a new post-QA production defect. |
| Related item | CR-2026-09-07-001 (the CR whose implementation contains the bug) |
| Investigation required? | **NO** — root cause already confirmed (see INVESTIGATION_REPORT) |

**Final classification: Bug — post-QA production defect in CR-2026-09-07-001 implementation**

---

## 3. Evidence

| # | Evidence | Status |
|---|----------|--------|
| E-1 | Owner screenshot: HTTP 422 in network tab, React overlay "response is not defined" | **CAPTURED** |
| E-2 | `ReviewOrder.jsx` line 1159: `let response` declared **inside** `try {}` block (opens line 1145) | **CONFIRMED** |
| E-3 | `ReviewOrder.jsx` line 1465: `!response` accessed in `catch {}` block — out of scope | **CONFIRMED** |
| E-4 | `orderService.ts` lines 447–461: 422 detection is correct, `stockOutError` IS thrown properly | **CONFIRMED** |
| E-5 | Lines 1616–1631 (stock-out toast): logic is correct and already handles new BE shape (`type`, `addon_name`, `food_name`) | **CONFIRMED** |
| E-6 | BE reply confirms HTTP 422 shape with `out_of_stock_items[]`, new fields `available_qty`, `requested_qty` | **CAPTURED** |

---

## 4. Root Cause Summary

`let response` was declared with `let` (block-scoped) at **line 1159 inside the `try {}` block** (which opens at line 1145). In JavaScript, `let` declarations are not accessible outside their enclosing block. The `catch {}` is a separate block. When a 422 is returned:

1. `orderService.ts` correctly throws a `stockOutError` with `isStockOut: true`
2. `ReviewOrder.jsx` catch block is entered
3. Line 1465: `!response` → **`ReferenceError: response is not defined`** (crashes catch handler)
4. Lines 1616–1631 (the toast + cart-preserve logic) **never run**
5. React error boundary catches the unhandled `ReferenceError` → overlay shown

The fix is one declaration moved — `let response;` from line 1159 (inside `try`) to before line 1145 (before `try` opens).

---

## 5. Severity Assessment

| Factor | Assessment |
|--------|------------|
| Customer impact | **CRITICAL** — Any restaurant with inventory tracking (e.g. restaurant 69) that sends a 422 causes a full React error overlay crash on the order review page |
| Revenue impact | **DIRECT** — Customer cannot complete order. Must hard-refresh. Cart may be perceived as lost. |
| Workaround | **NONE** — Customer cannot proceed past the error overlay |
| Scope | All restaurants with POS inventory enabled that return 422 on stock-out |
| **Final severity** | **P0** |

---

## 6. Risk Assessment

| File / Area | Risk | Reason |
|-------------|------|--------|
| `ReviewOrder.jsx` | **CRITICAL** | Explicitly listed as CRITICAL hotspot in project addendum. "Order placement and payment payload orchestration." |
| Change type | Declaration position only — `let response` moved before `try {}` | Zero logic change, zero value change, zero API change |
| Blast radius | **SMALL** — 1 file, 1 line moved | No other files affected |
| **Overall risk** | **CRITICAL (file-based)** | Change itself is trivial; file demands full gate process |

---

## 7. Blast Radius

### Files WILL change (1)

| File | Risk | Change |
|------|------|--------|
| `frontend/src/pages/ReviewOrder.jsx` | **CRITICAL** | Move `let response;` from line 1159 (inside `try{}`) to before line 1145 (before `try{}` opens). One line. No logic change. |

### Files WILL NOT change

| File | Reason |
|------|--------|
| `orderService.ts` | 422 detection is correct — untouched |
| `CartContext.js` | Not involved |
| `AuthContext.jsx` | Not involved |
| All other files | Not in scope |

---

## 8. Fast Lane Eligibility

| Condition | Status | Reason |
|-----------|--------|--------|
| Owner explicitly approves Fast Lane | ❌ NOT YET | Owner has not granted Fast Lane |
| LOW risk only | ❌ FAIL | Risk is CRITICAL (ReviewOrder.jsx) |
| No hotspot file | ❌ FAIL | `ReviewOrder.jsx` is explicitly listed as CRITICAL hotspot in the addendum |
| Addendum override | ❌ FAIL | Addendum Part C states: **"No Fast Lane is allowed for these areas."** |

**Fast Lane verdict: ❌ NOT ELIGIBLE**

The addendum (Part C, Customer App Override Summary) explicitly states:

> `ReviewOrder.jsx` | CRITICAL | "No Fast Lane is allowed for these areas."

Even though the actual code change is a single line (trivially small), the file classification alone is a hard block on Fast Lane.

---

## 9. Required Gate Sequence

```
✅ Owner report received
✅ Investigation complete (root cause confirmed — INVESTIGATION_REPORT.md)
✅ Intake complete (this document)
→ Planning gate (Impact Analysis + Implementation Plan) — owner approval needed
→ Implementation — owner approval needed
→ Self-test
→ QA (spot-check: live 422 trigger on restaurant 69)
→ Owner smoke
→ Closure
```

Investigation is already done, so Planning can go directly to Implementation Plan without a separate investigation phase.

---

## 10. Intake Output

```
Intake complete: BUG-2026-09-08-001
Classification: Bug — post-QA production defect (introduced by CR-2026-09-07-001)
Severity: P0
Risk: CRITICAL
Duplicate check: DISTINCT — no prior registration. Related to CR-2026-09-07-001.
Evidence: CAPTURED (screenshot, code inspection, BE contract reply)
Blast radius: SMALL — 1 file, 1 line, declaration position only
Fast Lane: NOT ELIGIBLE — ReviewOrder.jsx is a hard-blocked CRITICAL hotspot per addendum
Docs updated: /app/memory/change_requests/BUG-2026-09-08-001-response-not-defined-422-crash/INTAKE_DOC.md
              /app/memory/PRD.md (CR table updated)
Next: Planning gate — owner approval required before Impact Analysis begins
      No code until owner approves.
```
