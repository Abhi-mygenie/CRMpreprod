# Intake Doc — INV-2026-07-03-001

- **ID:** INV-2026-07-03-001-order-create-idempotency-audit
- **Raised:** 2026-07-03
- **Owner report:** Discovered during CR-2026-07-03-004 planning — cannot safely apply client-side timeout to order-create until server-side idempotency contract is known.
- **Classification:** INV (investigation / audit — read-only, no code)
- **Severity:** P1 (blocker for CR-004; also standalone risk)
- **Risk:** ZERO (audit itself); MEDIUM–HIGH if double-charge is ever proven
- **Blast radius:** LARGE if bad (potential double-charge / double-order)
- **Duplicate check:** DISTINCT
- **Existing code check:** Order-create call site lives in `frontend/src/api/services/orderService.ts` + `pages/ReviewOrder.jsx`. Actual endpoint is `POST /web/place-order` on MyGenie POS (not our backend).
- **Evidence captured:** Nothing yet — the CR is the audit itself
- **Deliverables of the audit:** `FINDINGS.md` with A/B/C/D/E verdict for §3 of the CR
- **Docs updated:** `CR.md`
- **Retroactive intake** (also renamed from CR-2026-07-03-006 → INV-2026-07-03-001 to match repo convention `INV-YYYY-MM-DD-NNN` for read-only investigations).

```text
Intake complete: INV-2026-07-03-001-order-create-idempotency-audit
Classification: INV (audit)
Severity: P1 (blocks CR-2026-07-03-004)
Risk: ZERO (audit)
Duplicate check: DISTINCT
Evidence: to be captured during audit
Blast radius: to be assessed
Docs updated: memory/change_requests/INV-2026-07-03-001-order-create-idempotency-audit/CR.md
Next: Investigation (Role 6) — awaiting owner approval to run
```
