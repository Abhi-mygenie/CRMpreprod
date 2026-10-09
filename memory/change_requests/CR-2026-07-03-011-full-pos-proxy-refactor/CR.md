# CR-2026-07-03-011 — Full POS-Proxy Refactor

**Status:** 📝 REGISTERED (Role 1 intake complete; Role 2 planning pending prerequisites)
**Session:** 2026-07-03
**Priority:** P1
**Severity:** P1
**Risk of change:** **HIGH** — touches Alpha v0.1 Part C CRITICAL files
**Fast Lane:** ❌ Not eligible

**Related:**
- Precursor (must ship first): [`CR-2026-07-03-000`](../CR-2026-07-03-000-remove-hardcoded-login-creds/CR.md)
- Blocker (must complete first): [`INV-2026-07-03-001`](../INV-2026-07-03-001-order-create-idempotency-audit/CR.md)
- Remediates: `BUG-001` (hybrid auth ownership), `BUG-002` (POS/CRM/backend contract drift) — both P0 in [`BUG_TRACKER_ARCHITECTURAL_AUDIT_2026-05.md`](../../../memory_repo/BUG_TRACKER_ARCHITECTURAL_AUDIT_2026-05.md)

---

## 1. Problem

CR-000 closes the credential-in-bundle issue but the resulting `order_auth_token` still lives in browser `localStorage`. Any XSS or supply-chain-attack on the frontend gets a working POS write token for 30 minutes. The correct architectural fix is to move POS write calls behind our FastAPI so the token never enters the browser.

This also solves the two P0 architectural bugs:
- **BUG-001** — Hybrid auth ownership (three token systems: `auth_token`, `crm_token_<id>`, `order_auth_token`).
- **BUG-002** — POS/CRM/backend contract drift risk.

## 2. Proposed change (draft — refined at Planning)

Proxy every POS write call through FastAPI:

| Today (browser → POS) | After (browser → FastAPI → POS) |
|---|---|
| `POST preprod.mygenie.online/api/v1/place-order` with `Bearer order_auth_token` | `POST /api/orders/place` with customer JWT; FastAPI attaches POS token server-side |
| `POST .../edit-order` | `POST /api/orders/{id}/edit` |
| `GET .../table-config` | (already proxied via `/api/table-config` — CR-011 formalises the pattern) |
| `GET .../order-details/{id}` | (already proxied — extend pattern) |
| … approximately 8–12 endpoints total | … same |

## 3. Scope

**IN:** POS write calls used by customer app (place, edit, cancel, status-change, feedback, points-redeem, delivery-address-attach, etc.). Deprecation of `authToken.js` public API. Interceptor rewrite to drive off customer JWT.

**OUT:** CRM proxy (separate axis). Admin dashboard POS calls (different call paths). Customer JWT lifetime redesign.

## 4. Success criteria (draft)

1. `grep -rn "order_auth_token\|loginForToken\|getAuthToken" frontend/src` returns **zero** matches after this CR.
2. `localStorage` in a live browser session shows no `order_auth_token` key after login.
3. All order flows (dine-in, takeaway, delivery) work end-to-end with the same UX.
4. POS receives calls originating from FastAPI IP (not browser IP).
5. Zero regression vs. baseline order-create success rate on preprod (measure over 24 h).

## 5. Prerequisites (hard-blocks Planning)

- ✅ CR-2026-07-03-010 shipped (registry hygiene) — DONE
- ⏳ CR-2026-07-03-000 SHIPPED (establishes proxy pattern)
- ⏳ INV-2026-07-03-001 COMPLETE (idempotency verdict determines write-retry safety)
- ⏳ Owner sign-off on endpoint surface (D-01 in INTAKE_DOC §7)

## 6. Effort

**2.5–3.5 dev-days** end-to-end (see `INTAKE_DOC.md` §6 breakdown).

## 7. Owner decisions

See `INTAKE_DOC.md` §7 — 4 decisions needed before Planning starts.

## 8. Non-goals

- Not a WebSocket / real-time upgrade.
- Not a JWT-lifetime redesign.
- Not a POS API contract change (we don't own POS).
- Not a CRM proxy.

---

Full Impact Analysis + Implementation Plan will be written at Role 2 after prerequisites clear and owner approves D-01..D-04.
