# Intake Doc — CR-2026-07-03-009

- **ID:** CR-2026-07-03-009-observability-and-lb-probe
- **Raised:** 2026-07-03
- **Owner report:** Follow-up from CR-2026-07-03-003 shipping — `/api/healthz` exists but no LB/probe wired to it (F-13); no structured alerting on Mongo timeouts (F-12).
- **Classification:** CR (observability / ops — mostly ops-owned; F-12 has a tiny code side)
- **Severity:** P1 for F-13 (unclaimed benefit from CR-003), P3 for F-12
- **Risk:** LOW
- **Blast radius:** SMALL for change; LARGE benefit on next outage
- **Duplicate check:** DISTINCT (direct dependency on CR-003 which is shipped)
- **Existing code check:** `/api/healthz` route now exists (shipped in CR-003). No probe wiring yet.
- **Evidence captured:**
  - `curl /api/healthz` returns 200 in 268 ms (documented in CR-003 QA_HANDOVER)
- **Docs updated:** `CR.md`
- **Retroactive intake.**

```text
Intake complete: CR-2026-07-03-009-observability-and-lb-probe
Classification: CR (ops + observability)
Severity: P1 (F-13), P3 (F-12)
Risk: LOW
Duplicate check: DISTINCT
Evidence: captured (/api/healthz live)
Blast radius: SMALL (change) / LARGE (benefit)
Docs updated: memory/change_requests/CR-2026-07-03-009-observability-and-lb-probe/CR.md
Next: Ops team wires probe; F-12 code addition optional
```
