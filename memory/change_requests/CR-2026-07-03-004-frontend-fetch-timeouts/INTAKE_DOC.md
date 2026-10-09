# Intake Doc — CR-2026-07-03-004

- **ID:** CR-2026-07-03-004-frontend-fetch-timeouts
- **Raised:** 2026-07-03
- **Owner report:** Follow-up from CR-003 discussion — A1+A2 protect backend↔Mongo path only; the frontend talks to 4 other backends that can also hang.
- **Classification:** CR (resilience hardening)
- **Severity:** P2
- **Risk:** MEDIUM (touches HIGH-risk provider files per operating prompt PART C)
- **Blast radius:** SMALL for change; MEDIUM benefit
- **Duplicate check:** DISTINCT
- **Existing code check:** No AbortController / no axios timeout anywhere in frontend (grep confirmed 0 hits)
- **Evidence captured:**
  - Frontend call-graph mapped to 5 backends (backend, POS, storage, CRM, Maps)
  - 2026-07-02 nginx log shows `manage.mygenie.online` was also stuck — the exact scenario A1+A2 don't cover
- **Blocked by:** INV-2026-07-03-001 (order-create idempotency audit) before touching order-create timeout
- **Docs updated:** `CR.md`, `IMPLEMENTATION_PLAN.md`
- **Retroactive intake.**

```text
Intake complete: CR-2026-07-03-004-frontend-fetch-timeouts
Classification: CR (resilience hardening)
Severity: P2
Risk: MEDIUM
Duplicate check: DISTINCT
Evidence: captured
Blast radius: SMALL (change) / MEDIUM (benefit under upstream slowness)
Blocked by: INV-2026-07-03-001
Docs updated: memory/change_requests/CR-2026-07-03-004-frontend-fetch-timeouts/{CR.md,IMPLEMENTATION_PLAN.md}
Next: Planning (COMPLETE), awaiting INV-2026-07-03-001 verdict + owner approval → Implementation
```
