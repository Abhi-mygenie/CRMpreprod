# Intake Doc — CR-2026-07-03-011

**ID:** CR-2026-07-03-011-full-pos-proxy-refactor
**Session:** 2026-07-03
**Operator agent:** E1
**Role:** Role 1 (INTAKE) per Alpha v0.1 §8

---

## 1. Owner report / origin

Filed as follow-up during CR-2026-07-03-000 Role 6 investigation. Investigation surfaced that removing bundled POS credentials only closes half the exposure — the resulting `order_auth_token` still lives in browser `localStorage` and any XSS can steal it. Correct architectural fix is to move all POS write calls behind FastAPI so the token never enters the browser.

Owner approval to file (2026-07-03): "post that file e and f".

## 2. Summary

Proxy every POS-facing write call (place-order, edit-order, table-status, cancel-order, etc.) through FastAPI. Backend holds the POS service token; frontend authenticates to FastAPI using the existing customer JWT or app-level session. Aligns with `BUG-001` (hybrid auth ownership) and `BUG-002` (POS/CRM/backend contract drift), both flagged P0 in `memory_repo/BUG_TRACKER_ARCHITECTURAL_AUDIT_2026-05.md`.

## 3. Classification

| Field | Value |
|---|---|
| Type | CR — architectural refactor (multi-file, runtime code) |
| Severity | **P1** — addresses P0 architectural bugs (BUG-001/002) but not itself an outage |
| Risk | **HIGH** — touches Alpha v0.1 Part C CRITICAL files: `ReviewOrder.jsx`, `OrderSuccess.jsx`, all POS-facing services, `api/interceptors/*` |
| Duplicate check | **DISTINCT** — no existing CR proposes a full POS proxy. CR-000 fixes only the token-issuance step. |
| Evidence | Role 6 audit in `CR-2026-07-03-000/FINDINGS.md` §5 Option 2 |
| Blast radius | **LARGE** — every order flow, every POS write call, all interceptors |
| Priority | After CR-000 (which is the safe partial fix) and after INV-2026-07-03-001 (idempotency audit, which this CR also depends on) |

## 4. Scope (high-level, refined at Planning)

**IN scope (candidate):**
- Every POS write call currently made from browser (place-order, edit-order, table-status change, order-cancel, order-details fetch that requires POS token, feedback-submit, points-redeem, etc.) is proxied through new FastAPI endpoints.
- POS service token lives in `backend/.env` (already partly done by CR-000 for `/auth/login`) and is used server-side only.
- Frontend authenticates to FastAPI via existing customer JWT + CRM token — no more `order_auth_token` in `localStorage`.
- `frontend/src/utils/authToken.js` — deprecate `loginForToken`, `getAuthToken`, `getStoredToken`, `storeToken`, `clearStoredToken`, `isTokenExpired`. Keep as no-op wrappers during transition.
- `api/interceptors/request.js` and `response.js` — remove the `Bearer <order_auth_token>` attachment; drive off customer JWT instead.

**OUT of scope for the CR itself:**
- CRM proxy (that's a different auth axis)
- Customer JWT lifetime / refresh strategy (separate concern)
- WebSocket / real-time paths (none exist today)

## 5. Prerequisites

1. **CR-2026-07-03-000 must be SHIPPED first** — establishes the pattern (FastAPI proxy for one POS call) and moves the credential to `backend/.env`.
2. **INV-2026-07-03-001 must be COMPLETE** — order-create idempotency verdict determines whether write-proxying is safe (D/E outcomes require server-side idempotency work at MyGenie).
3. **Owner sign-off** on the endpoint surface (probably 8-12 new endpoints).

## 6. Estimated effort

- Discovery / endpoint enumeration: 0.5 dev-day
- Backend endpoints (8-12 endpoints, thin proxies): 1.0 dev-day
- Frontend service refactor (~10 files under `frontend/src/api/services/`): 1.0 dev-day
- Interceptor rewrite: 0.5 dev-day
- QA + regression: 1.0 dev-day
- **Total: 2.5–3.5 dev-days**

## 7. Owner decisions needed at Planning gate

| # | Decision | Options |
|---|---|---|
| D-01 | Endpoint surface — enumerate the full POS call set first, or refactor incrementally per feature area? | (a) enumerate all, (b) incremental — order flow first, then admin |
| D-02 | Naming convention for new proxy endpoints | (a) `/api/pos/<verb>-<noun>` (b) `/api/orders/*`, `/api/tables/*` (business-domain grouping) |
| D-03 | Keep `authToken.js` public API as no-op wrappers during transition, or hard-remove? | (a) soft-remove (safer) (b) hard-remove (cleaner) |
| D-04 | Customer JWT is the sole client-side auth after this CR — is that acceptable? | (a) yes (b) also keep CRM token as a fallback |

## 8. Related items

- `CR-2026-07-03-000` — CR-011's precursor (fixes only `/auth/login`)
- `INV-2026-07-03-001` — hard blocker (order-create idempotency)
- `memory_repo/BUG_TRACKER_ARCHITECTURAL_AUDIT_2026-05.md` — BUG-001, BUG-002 (P0 architectural items this CR remediates)
- Alpha v0.1 Part C — this CR touches every CRITICAL file listed there, so full gate flow is mandatory (no Fast Lane)

## 9. Compact Role 1 exit block

```text
Intake complete: CR-2026-07-03-011
Classification: CR (architectural refactor — multi-file runtime code)
Severity: P1
Risk: HIGH
Duplicate check: DISTINCT
Evidence: linked (CR-000 FINDINGS.md §5 Option 2 + BUG-001/002)
Blast radius: LARGE
Docs updated: memory/change_requests/CR-2026-07-03-011-full-pos-proxy-refactor/INTAKE_DOC.md, memory/change_requests/README.md (row added)
Blocked by: CR-2026-07-03-000 SHIPPED + INV-2026-07-03-001 COMPLETE + owner decisions D-01..D-04
Next: Planning (Role 2) — after prerequisites clear
```
