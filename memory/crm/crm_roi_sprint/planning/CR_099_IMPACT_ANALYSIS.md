# CR-099 — Impact Analysis: allow formatted phone input in CRM Add/Edit Customer
**Date**: 2026-10-09 · **Role**: Planning Agent · **Source**: Batch QA NOTE N1 (`iteration_7`) · **Status**: 🟡 IA in progress — owner decision Q1 = A confirmed (2026-10-09, "both A") · **No code changed.**

---

## 1. Problem

Both the **Add Customer** and **Edit Customer** modals in `CustomersPage.jsx` have identical phone input handlers that strip all non-digit characters and cap at 10 characters:

```javascript
// Add Customer — CustomersPage.jsx:1910, 1914
onChange={(e) => setNewCustomer({...newCustomer, phone: e.target.value.replace(/\D/g, '')})}
maxLength={10}

// Edit Customer — CustomersPage.jsx:2447, 2451
onChange={(e) => setEditData({...editData, phone: e.target.value.replace(/\D/g, '')})}
maxLength={10}
```

A CRM staff member cannot type `+91 98765 43210`, `098765 43210`, or paste a number from their phone contacts — the `+`, spaces and leading `0` are stripped character-by-character as they type.

The `country_code` is a **separate `<Select>` dropdown** next to the phone input (confirmed in code — `<Select>` at lines ~1893-1905 and ~2430-2444). So the `+91` part is already handled separately; the phone field is digits-only by design.

---

## 2. Code reality (read-only 2026-10-09)

| Location | Current behaviour | Lines |
|---|---|---|
| Add Customer `<Input>` | strips `/\D/g` on every keystroke; `maxLength=10` | 1906–1916 |
| Edit Customer `<Input>` | identical pattern | 2445–2453 |
| Backend `POST /api/customers` | accepts formatted input, runs `normalize_phone()` | `customers.py` |
| Backend `PUT /api/customers/:id` | same | `customers.py` |
| `normalize_phone()` | strips to digits, handles `+91`/leading-0/spaces, validates | `core/phone.py` |

No other phone input in `CustomersPage.jsx` uses the sanitiser.
`CustomerDetailPage.jsx` uses the same modal pattern — confirmed not a third location (uses the same modal from CustomersPage).

---

## 3. Fix — Option A (owner-confirmed)

Two-character change per input (×2 locations):

| Change | Before | After |
|---|---|---|
| Remove sanitiser | `e.target.value.replace(/\D/g, '')` | `e.target.value` |
| Bump maxLength | `maxLength={10}` | `maxLength={15}` |

`maxLength={15}` accommodates `+91 98765 43210` (14 chars incl spaces). The backend `normalize_phone()` validates and rejects invalid phones with `400 "Enter a valid mobile number"`.

**Placeholder** (`"9876543210"`) is kept as-is — simple enough; staff still understand digits-only is the canonical form.

---

## 4. Blast radius

- **2 files changed**: `frontend/src/pages/CustomersPage.jsx` (4 lines total: 2× onChange, 2× maxLength)
- **Backend unchanged** — already normalises correctly
- **Risk: LOW** — frontend input validation only; backend is the authoritative guard
- No schema changes, no DB writes, no new routes

---

## 5. Owner questions

| Q | Decision |
|---|---|
| **Q1** | Relax sanitiser (A) vs WONTFIX (B) — **A confirmed 2026-10-09** |

No further questions.

---

## 6. Files

**WILL change**: `frontend/src/pages/CustomersPage.jsx` (4 lines)
**WILL NOT touch**: backend · `CustomerDetailPage.jsx` · `normalize_phone()` · any other page

---

```
Planning complete: CR-099
Stage: Impact Analysis (Implementation Plan NOT opened — owner: "don't jump gate")
Code reality: FULL (exact 4 lines identified)
Risk: LOW (frontend input validation only; backend guards remain)
Files WILL change: frontend/src/pages/CustomersPage.jsx (4 lines, 2 locations)
Owner decisions: Q1 = A (confirmed)
Docs: planning/CR_099_IMPACT_ANALYSIS.md
Next: Implementation Plan gate — opens on "choose planning role for implementation planning of CR-099"
```
