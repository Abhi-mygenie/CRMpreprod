# IMPLEMENTATION PLAN — BUG-2026-09-08-001

## Item Identity

| Field | Value |
|-------|-------|
| **Bug ID** | BUG-2026-09-08-001 |
| **Title** | `response is not defined` — `handlePlaceOrder` crashes on HTTP 422 stock-out |
| **Planning Stage** | Implementation Plan |
| **Date** | 2026-09-08 |
| **Risk** | CRITICAL |
| **Prerequisite** | Owner approval required before any code is written |

---

## 1. Pre-Implementation Checklist (Implementation Agent must verify all)

| # | Check | How |
|---|-------|-----|
| P-1 | Item is registered | `/app/memory/change_requests/BUG-2026-09-08-001-response-not-defined-422-crash/INTAKE_DOC.md` exists |
| P-2 | Impact Analysis is complete | `/app/memory/change_requests/BUG-2026-09-08-001-response-not-defined-422-crash/IMPACT_ANALYSIS.md` exists |
| P-3 | Owner approval is confirmed | Owner said "approved" or equivalent before starting |
| P-4 | No other agent is editing `ReviewOrder.jsx` | Check active CR list — none currently touch this file |
| P-5 | Current file compiles cleanly before touching it | Run `cd /app/frontend && yarn build 2>&1 \| tail -5` and confirm no errors in ReviewOrder.jsx |

---

## 2. Scope Declaration

### Files WILL change (1 file, 2 edits)

| File | Change |
|------|--------|
| `frontend/src/pages/ReviewOrder.jsx` | Edit 1: insert `let response;` + code marker before `try {` (line 1145). Edit 2: remove `let response;` from inside `try {}` (line 1159). |

### Files WILL NOT change

`orderService.ts`, `CartContext.js`, `AuthContext.jsx`, `RestaurantConfigContext.jsx`,
`server.py`, `App.js`, any other file. If scope expands beyond the one file above,
**STOP and ask owner.**

---

## 3. Implementation Steps (exact — follow in order)

### Step 1 — Verify current file state before editing

Open and read lines 1143–1162 of `ReviewOrder.jsx`.

Confirm these exact lines exist as shown (indentation matters):

```
    // Place order or Update order (if in edit mode)
    setIsPlacingOrder(true);
    try {
      // Phase 1: Table ID only when a specific table was scanned. All others get '0'.
      const finalTableId = hasAssignedTable(scannedTableId)
        ? scannedTableId
        : (isMultiMenu && tableNumber && hasAssignedTable(tableNumber) ? tableNumber : '0');

      // Restaurant 716: room pick is mandatory, never send '0' to POS.
      if (String(restaurantId) === '716' && !hasAssignedTable(finalTableId)) {
        toast('Please select your Room');
        setIsPlacingOrder(false);
        isPlacingOrderRef.current = false;
        return;
      }

      let response;

      // Check if we're in edit mode
      if (isEditMode && editingOrderId) {
```

If this does not match exactly, **STOP and report** — do not proceed.

---

### Step 2 — Edit 1: INSERT `let response` before `try {`

**Tool:** `search_replace`
**File:** `frontend/src/pages/ReviewOrder.jsx`

```
OLD (exact):
    setIsPlacingOrder(true);
    try {

NEW (exact):
    setIsPlacingOrder(true);
    let response; // BUG-2026-09-08-001: must be outside try{} so catch{} can read it
    try {
```

**What this does:** Declares `response` in the outer function scope, making it accessible in both the `try {}` block and the `catch {}` block.

**What this does NOT do:** Does not change any logic, any value, any assignment. `let response` with no initialiser is `undefined` — identical behaviour to the previous declaration.

---

### Step 3 — Edit 2: REMOVE `let response` from inside `try {}`

**Tool:** `search_replace`
**File:** `frontend/src/pages/ReviewOrder.jsx`

```
OLD (exact):
      }

      let response;

      // Check if we're in edit mode
      if (isEditMode && editingOrderId) {

NEW (exact):
      }

      // Check if we're in edit mode
      if (isEditMode && editingOrderId) {
```

**What this does:** Removes the now-duplicate `let response` declaration from inside the `try {}` block.

**What this does NOT do:** Does not remove or change any assignment to `response`. The assignments at lines 1199, 1238, and 1360 (`response = await ...`) are not touched — they now write to the outer-scope `response` declared in Step 2, which is identical behaviour.

> ⚠️ **Both Step 2 and Step 3 must be applied together.** Step 2 alone = two `let response` declarations (syntax error in strict mode). Step 3 alone = `response` still not accessible in catch. Neither edit is valid without the other.

---

### Step 4 — Add code marker (already included in Step 2)

The comment `// BUG-2026-09-08-001: must be outside try{} so catch{} can read it` is embedded in the new line from Step 2. No further marker action needed.

---

### Step 5 — Self-test

Run each of the following and confirm all pass before declaring implementation complete:

**5a. Declaration position check:**
```bash
grep -n "let response" /app/frontend/src/pages/ReviewOrder.jsx
```
Expected output: **exactly one line**, and its line number must be LESS than the line number of `try {` in the `handlePlaceOrder` function.

Confirm: the line shown is `    let response; // BUG-2026-09-08-001: must be outside try{} so catch{} can read it`

**5b. No duplicate declaration:**
The grep above must show **exactly 1 result**. If 2 results appear, Step 3 was not applied — stop and fix.

**5c. Assignments still present:**
```bash
grep -n "response = await" /app/frontend/src/pages/ReviewOrder.jsx
```
Expected: 3 results (lines ~1199, ~1238, ~1360 — exact numbers may shift by 1 after edits). If 0 or fewer results, something went wrong — stop and report.

**5d. Catch block reference still present:**
```bash
awk 'NR>=1450 && NR<=1475' /app/frontend/src/pages/ReviewOrder.jsx | grep "response"
```
Expected: `!response &&` appears. If missing, catch block was accidentally edited — stop and report.

**5e. Compile check:**
```bash
cd /app/frontend && yarn build 2>&1 | grep -E "ERROR|error" | grep -v "//\|warning" | head -10
```
Expected: no errors. Warnings (ESLint hook deps) are pre-existing and acceptable.

---

### Step 6 — Write QA handover

Write `/app/memory/change_requests/BUG-2026-09-08-001-response-not-defined-422-crash/QA_HANDOVER.md` using the template in Section 4 below.

---

### Step 7 — Update registry

Update `/app/memory/PRD.md` CR table:

```
| BUG-2026-09-08-001 | ... | P0 | CRITICAL | **IMPLEMENTATION COMPLETE — awaiting QA** |
```

---

## 4. QA Handover Template

```markdown
# QA HANDOVER — BUG-2026-09-08-001

## What was changed
One line moved in `ReviewOrder.jsx`:
- `let response;` moved from inside `try {}` (was line 1159) to before `try {}` opens.
- No logic changed. No assignments changed. No other files touched.

## Verification matrix

| ID | Test | How | Expected |
|----|------|-----|----------|
| V-1 | `let response` is before `try {` | grep -n "let response" ReviewOrder.jsx → line# < line# of `try {` in handlePlaceOrder | PASS |
| V-2 | No duplicate `let response` | grep count = 1 | PASS |
| V-3 | All 3 `response = await` assignments intact | grep -c "response = await" ReviewOrder.jsx = 3 | PASS |
| V-4 | `!response` in catch still present | grep in lines 1450–1475 | PASS |
| V-5 | `error.isStockOut` branch unchanged | grep -n "isStockOut" ReviewOrder.jsx — lines present | PASS |
| V-6 | Compile clean | yarn build — no errors | PASS |
| V-7 | Live test: successful order on restaurant 69 or 478 | Place a non-stock-out order → navigates to order-success | PASS |
| V-8 | Live test: 422 response → toast shown, no error overlay | Add stock-out item (restaurant 69: "nails" id 224396) then place order | Toast shown: stock-out message. No React error overlay. Cart preserved. |
| V-9 | isTrueNetworkLoss logic unchanged | Lines 1463–1467 match Impact Analysis spec | PASS |
| V-10 | 401-retry path unchanged | Lines 1475–1615 — retryResponse variable intact | PASS |

## Test account
- Restaurant 69 (The Goan Kitchen) — has inventory-tracked items
- Stock-out item: "nails" (id 224396, stock_out: "Y")
- To trigger 422: add an item with addon "with fingertips" (addon id 13252,
  food_stock: 10) and set addon qty > 10 if UI allows, then place order
- Alternatively: code-inspection verification of V-1 through V-6 is sufficient
  to confirm the fix is correct if live 422 is hard to reproduce on demand

## Files changed
- `frontend/src/pages/ReviewOrder.jsx` — declaration moved, see above
```

---

## 5. Exit Gate (Implementation Agent must confirm all 7 before declaring complete)

```
1. [ ] Registry updated (PRD.md CR table shows IMPLEMENTATION COMPLETE)
2. [ ] Issue tracker updated (INTAKE_DOC.md status updated)
3. [ ] File ownership / code marker added (// BUG-2026-09-08-001 in new line)
4. [ ] Build/compile clean (yarn build — no errors)
5. [ ] Self-test complete (all 5 checks in Step 5 passed)
6. [ ] QA handover written (QA_HANDOVER.md created)
7. [ ] Session handover updated if applicable
```

---

## 6. Planning Output

```
Planning complete: BUG-2026-09-08-001
Stage: Implementation Plan
Code reality: FULL — verified
Risk: CRITICAL
Files WILL change: frontend/src/pages/ReviewOrder.jsx (2 search_replace edits — 1 line added before try, 1 line removed inside try)
Files WILL NOT touch: orderService.ts, CartContext.js, AuthContext.jsx,
                      RestaurantConfigContext.jsx, server.py, all others
Owner decisions: NONE — plan is unambiguous
Docs: /app/memory/change_requests/BUG-2026-09-08-001-response-not-defined-422-crash/IMPLEMENTATION_PLAN.md
Next: Owner approval → Implementation Agent executes Steps 1–7
      No code until owner approves.
```
