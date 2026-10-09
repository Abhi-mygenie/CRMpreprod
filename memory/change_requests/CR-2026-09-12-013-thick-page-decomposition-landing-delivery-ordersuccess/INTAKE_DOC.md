# INTAKE DOC — CR-2026-09-12-013

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-12-013 |
| **Title** | Thick-page decomposition — `LandingPage.jsx` (1,296), `DeliveryAddress.jsx` (1,056), `OrderSuccess.jsx` (852); retire legacy `pages/AdminSettings.jsx` (1,324) in favour of `pages/admin/*` after usage trace |
| **Classification** | CR — Refactor |
| **Date Registered** | 2026-09-12 |
| **Reported By** | Baseline §5 under owner item 4 |
| **Severity** | P2 |
| **Risk** | HIGH (`LandingPage`/`OrderSuccess` HIGH per addendum §6.7/6.8) |
| **Status** | INTAKE ✅ — blocked on CR-012 pattern proven |
| **Parent** | CR-2026-09-12-001 (Wave 5) |

## 1. Scope

**IN:** same hook/component extraction pattern as CR-012; `AdminSettings.jsx` vs `pages/admin/*` overlap resolved (GAP-020 FE half) — trace routes in `App.js` before deleting.
**OUT:** behaviour changes; `Call Waiter`/`Pay Bill` stubs (GAP-017 — owner decides complete vs hide separately).

## 2. Duplicate Check

ROADMAP P1-1/P1-2 targets; GAP-020 (FE part). No prior CR. **DISTINCT.**

## 3. Blast Radius

LARGE — QR entry, customer capture, delivery flow, post-order polling, admin config UI.

---

```text
Intake complete: CR-2026-09-12-013
Classification: CR (Refactor)
Severity: P2
Risk: HIGH
Duplicate check: DISTINCT
Evidence: captured
Blast radius: LARGE
Docs updated: this file; README.md
Next: Planning (after CR-012)
```
