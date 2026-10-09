# INTAKE DOC — CR-2026-09-08-001

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-08-001 |
| **Title** | `MenuItem.jsx` no-image ADD button missing `isChannelAllowed` guard |
| **Classification** | CR — Defect (minor defence-in-depth gap) |
| **Date Registered** | 2026-09-08 |
| **Reported By** | QA agent (carry-forward from CR-2026-09-07-001 QA, iteration_2.json) |
| **Severity** | P3 |
| **Risk** | MEDIUM — touches `MenuItem.jsx`, a hotspot-adjacent component |
| **Status** | INTAKE ✅ — awaiting owner approval to open Planning gate |

---

## 1. Observation (verbatim from QA report)

> "CARRY-FORWARD from iteration_1 (not a regression): In MenuItem.jsx no-image actionArea
> (line 165), the ADD button condition is `isAvailable && isOnlineOrderEnabled` but OMITS
> `isChannelAllowed`. The image layout (line 235) correctly includes `isChannelAllowed`.
> Minor defense-in-depth gap, not introduced by this CR."

---

## 2. Current State vs Expected State

### Current state — no-image layout ADD button condition (line ~165)

```jsx
) : isAvailable && isOnlineOrderEnabled ? (
  <button className="add-btn add-btn--inline" onClick={onAddToCart}>
    ADD
  </button>
```

### Image layout ADD button condition (line ~235) — **correct**

```jsx
) : isAvailable && isOnlineOrderEnabled && isChannelAllowed ? (
  <button className="add-btn" onClick={onAddToCart}>
    ADD
  </button>
```

### Expected state — no-image layout should match image layout

```jsx
) : isAvailable && isOnlineOrderEnabled && isChannelAllowed ? (
  <button className="add-btn add-btn--inline" onClick={onAddToCart}>
    ADD
  </button>
```

---

## 3. Classification

| Check | Result |
|-------|--------|
| Bug? | Yes — minor, pre-existing, not introduced by CR-2026-09-07-001 |
| Feature? | No |
| Regression? | No — pre-dates this CR |
| Duplicate? | No prior CR on this issue |
| **Final classification** | **CR — Minor Bug Fix (defence-in-depth gap)** |

---

## 4. Severity Assessment

| Factor | Assessment |
|--------|------------|
| Customer impact today | LOW — `CartContext.js` addToCart() already guards channel (`isItemAllowedForChannel`) independently. The ADD button showing for a non-channel item leads to `CartContext` toast rejection. No silent data issue. |
| Visual inconsistency | LOW — The ADD button appears for items disallowed for the current channel (e.g., delivery-only items shown in dine-in) but add is blocked at cart layer. |
| Technical debt | LOW — One missing `&& isChannelAllowed` operand. Single-character diff. |
| Risk if fixed incorrectly | MEDIUM — `MenuItem.jsx` is shared across all item renders. A wrong condition could hide ADD buttons across all items. |
| **Final Severity** | **P3** |

---

## 5. Risk Assessment

| File / Area | Risk | Reason |
|-------------|------|--------|
| `MenuItem.jsx` — `actionArea` no-image branch | **MEDIUM** | Change to ADD button render condition. Must not affect `isInCart` (QuantitySelector) branch, `isStockOut` branch (CR-2026-09-07-001), `isLowStock` badge, or image layout. |
| `CartContext.js` `addToCart()` | **NONE** | Not touched. Channel guard remains unchanged. |
| `MenuItems.jsx` filter | **NONE** | Not touched. |
| **Overall Risk** | **LOW–MEDIUM** | One-line additive condition change. `MenuItem.jsx` is the only affected file. |

---

## 6. Evidence

### Source

- Discovered by testing agent during QA of CR-2026-09-07-001 (iteration_2.json, `critical_code_review_comments` field).
- Confirmed by code inspection: no-image `actionArea` block in `MenuItem.jsx` at line ~165.

### Code reality

| Location | State |
|----------|-------|
| No-image `actionArea` ADD button (line ~165) | `isAvailable && isOnlineOrderEnabled` — **MISSING `isChannelAllowed`** |
| Image layout ADD button (line ~235) | `isAvailable && isOnlineOrderEnabled && isChannelAllowed` — **CORRECT** |
| `CartContext.js` `addToCart()` channel guard | Present (CR-2026-08-06-001) — independent backstop |

---

## 7. Blast Radius

### Files WILL change (1)

| File | Risk | Change type |
|------|------|-------------|
| `src/components/MenuItem/MenuItem.jsx` | **MEDIUM** | Add `&& isChannelAllowed` to no-image ADD button condition only |

### Files WILL NOT change

| File | Why |
|------|-----|
| `CartContext.js` | Channel guard already present — not touched |
| `MenuItems.jsx` | Not related to this gap |
| `MenuItem.css` | No style change needed |
| All other files | Not in scope |

---

## 8. Constraints

1. Change is ADDITIVE only — add `&& isChannelAllowed` to the existing condition. No logic restructuring.
2. `isStockOut` branch (CR-2026-09-07-001) must remain BEFORE the ADD button condition — do not reorder.
3. `isInCart` (QuantitySelector) branch must remain FIRST — do not reorder.
4. Image layout ADD button (already correct) must NOT be changed.
5. No CSS changes needed.
6. No Fast Lane — `MenuItem.jsx` is a hotspot-adjacent shared component.

---

## 9. Proposed Fix (for reference — NOT to be implemented until Planning gate is open)

**File:** `src/components/MenuItem/MenuItem.jsx`
**Location:** `actionArea` block, no-image layout ADD button condition

**Change one line:**
```
BEFORE: ) : isAvailable && isOnlineOrderEnabled ? (
AFTER:  ) : isAvailable && isOnlineOrderEnabled && isChannelAllowed ? (
```

This is the only change. One operand added to one condition.

---

## 10. Intake Output

```
Intake complete: CR-2026-09-08-001
Classification: CR — Minor Bug Fix (defence-in-depth gap)
Severity: P3
Risk: MEDIUM (MenuItem.jsx hotspot-adjacent — one-line additive change)
Duplicate check: DISTINCT — no prior CR on this issue
Evidence: QA agent carry-forward (iteration_2.json), code inspection confirmed
Blast radius: SMALL — 1 file, 1 line, additive only
Docs updated: /app/memory/change_requests/CR-2026-09-08-001-menuitem-no-image-add-channel-guard/INTAKE_DOC.md
Next: Planning gate — owner approval required
       No code until owner approves Planning.
```
