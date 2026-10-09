# INTAKE DOC — INV-2026-09-12-001

## Item Identity

| Field | Value |
|-------|-------|
| **INV ID** | INV-2026-09-12-001 |
| **Title** | Usage trace — legacy FastAPI `/api/customer/*` routes, `orders` / `status_checks` collections, and legacy `pages/AdminSettings.jsx` — live or dead? |
| **Classification** | INVESTIGATION (read-only, no code — Alpha v0.1 §8 Role 6) |
| **Date Registered** | 2026-09-12 |
| **Reported By** | GAP-020 ("do NOT delete blindly") under CR-2026-09-12-006 / -013 |
| **Severity** | — |
| **Risk** | — (read-only) |
| **Status** | INTAKE ✅ — can start immediately |
| **Parent** | CR-2026-09-12-001 (Wave 2) |

## 1. Question

Which of these are reachable from the current FE or any external caller?
`GET /api/customer/profile`, `/customer/orders`, `/customer/points`, `/customer/wallet`, `/customer/coupons`, `PUT /customer/profile`, `GET /orders/{id}`, `POST/GET /status`, `GET /customer-lookup/{rid}`; `pages/AdminSettings.jsx` route.

## 2. Method (≤10 steps)

1. Grep FE for each path string.
2. Grep FE `App.js` routes for `AdminSettings`.
3. Add access-log line (request-id middleware from CR-004) — or, if CR-004 not yet landed, review nginx/uvicorn access logs on preview for 7 days.
4. Cross-check `crmService.js` — CRM serves customer identity today.
5. Report per route: LIVE / DEAD / EXTERNAL-UNKNOWN.

## 3. Output feeds

CR-2026-09-12-006 (keep vs delete routers), CR-2026-09-12-013 (AdminSettings retirement), CR-2026-09-12-014 (drop collections).

---

```text
Intake complete: INV-2026-09-12-001
Classification: INV
Severity: —
Risk: —
Duplicate check: DISTINCT (GAP-020 never had a trace)
Evidence: to be captured
Blast radius: none (read-only)
Docs updated: this file; README.md
Next: Role 6 Investigation (step budget 10)
```
