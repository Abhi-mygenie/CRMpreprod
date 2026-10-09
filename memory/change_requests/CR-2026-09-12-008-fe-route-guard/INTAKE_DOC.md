# INTAKE DOC — CR-2026-09-12-008

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-12-008 |
| **Title** | Frontend `ProtectedRoute` / `RoleGuard` — route-level guard for `/:rid/admin/*` and `/:rid/profile` |
| **Classification** | CR — Security hardening (GAP-006) |
| **Date Registered** | 2026-09-12 |
| **Reported By** | GAP-006 under owner item 2 |
| **Severity** | P1 |
| **Risk** | HIGH (routing + `AuthContext` read; `App.js` provider order must not change) |
| **Status** | INTAKE ✅ — blocked on NEW-2 |
| **Parent** | CR-2026-09-12-001 (Wave 3) |

## 1. Problem

`/admin/*` protected only by post-render `useEffect` redirect in `layouts/AdminLayout.jsx`; `/profile` unguarded at route level. Brief unauthorised render; no central place to add brand-level roles later.

## 2. Scope

**IN:** `components/guards/{ProtectedRoute,RoleGuard}.jsx`; wrap admin + profile routes in `App.js` routes block only; redirect target preserves `?next=`.
**OUT:** backend RBAC (GAP-012); provider reorder; new roles.

## 3. Duplicate Check

GAP-006 execution. No prior CR. **DISTINCT.**

## 4. Blast Radius

MEDIUM — admin entry, profile entry, deep links after login.

---

```text
Intake complete: CR-2026-09-12-008
Classification: CR (Security hardening)
Severity: P1
Risk: HIGH
Duplicate check: DISTINCT
Evidence: captured
Blast radius: MEDIUM
Docs updated: this file; README.md
Next: Planning (after NEW-2)
```
