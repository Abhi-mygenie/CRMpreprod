# CR-099 — Implementation Plan: relax phone input sanitiser in CRM Add/Edit Customer
**Date**: 2026-10-09 · **Role**: Planning Agent · **IA**: `planning/CR_099_IMPACT_ANALYSIS.md` (Q1 = A, closed) · **Risk**: LOW (frontend input only; 4 lines; backend unchanged) · **Status**: ✅ OWNER APPROVED — implementation gate opens on "choose implementation role for CR-099" · **No code changed.**

---

## 0. Decision locked

| Q | Decision |
|---|---|
| **Q1** | **A — relax sanitiser.** Remove `replace(/\D/g, '')`, bump `maxLength` 10 → 15. Backend `normalize_phone()` is the authoritative guard. |

---

## 1. Code reality (exact lines confirmed)

| Location | Current | Lines |
|---|---|---|
| Add Customer `<Input>` onChange | `e.target.value.replace(/\D/g, '')` | 1910 |
| Add Customer `<Input>` maxLength | `maxLength={10}` | 1914 |
| Edit Customer `<Input>` onChange | `e.target.value.replace(/\D/g, '')` | 2447 |
| Edit Customer `<Input>` maxLength | `maxLength={10}` | 2451 |

Both inputs already have a separate **country code `<Select>` dropdown** immediately before them — so `+91` is handled separately and the phone field accepts the local number part only.

---

## 2. Edits — 2 locations, 4 lines total

### E1 — Add Customer modal (`CustomersPage.jsx:1910, 1914`)

```jsx
// Before
onChange={(e) => setNewCustomer({...newCustomer, phone: e.target.value.replace(/\D/g, '')})}
...
maxLength={10}

// After
onChange={(e) => setNewCustomer({...newCustomer, phone: e.target.value})}  {/* CR-099 */}
...
maxLength={15}  {/* CR-099: allow +91 98765 43210 */}
```

### E2 — Edit Customer modal (`CustomersPage.jsx:2447, 2451`)

```jsx
// Before
onChange={(e) => setEditData({...editData, phone: e.target.value.replace(/\D/g, '')})}
...
maxLength={10}

// After
onChange={(e) => setEditData({...editData, phone: e.target.value})}  {/* CR-099 */}
...
maxLength={15}  {/* CR-099 */}
```

---

## 3. Edit order

```
E1 (Add Customer) → E2 (Edit Customer) → frontend hot-reload → V1–V3 self-test
```

---

## 4. Verification matrix

| V | Check | Expected |
|---|---|---|
| V1 | Open Add Customer, type `+91 98765 43210` in phone field | Field accepts all chars; `+`, spaces visible while typing |
| V2 | Submit with `+91 98765 43210` → backend normalises → customer stored as `9876543210` / `+91` | 200, customer created with canonical phone |
| V3 | Open Edit Customer, paste `098765 43210` | Field accepts, backend normalises to `9876543210` |

---

## 5. Files

**WILL change**: `frontend/src/pages/CustomersPage.jsx` (4 lines: 2 × onChange, 2 × maxLength)

**WILL NOT touch**: backend · `CustomerDetailPage.jsx` · `core/phone.py` · any other file

---

```
Planning complete: CR-099
Stage: Implementation Plan
Code reality: FULL (exact 4 lines)
Risk: LOW (frontend input validation only)
Files WILL change: frontend/src/pages/CustomersPage.jsx (4 lines)
Owner decisions: Q1 = A locked
Docs: planning/CR_099_IMPLEMENTATION_PLAN.md
Next: "choose implementation role for CR-099" → implement
```
