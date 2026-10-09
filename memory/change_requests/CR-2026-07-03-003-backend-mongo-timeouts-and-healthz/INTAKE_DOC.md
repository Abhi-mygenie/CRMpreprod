# Intake Doc — CR-2026-07-03-003

- **ID:** CR-2026-07-03-003-backend-mongo-timeouts-and-healthz
- **Raised:** 2026-07-03
- **Owner report:** Two artefacts (`e1.txt`, nginx log) from 2026-07-02 21:30 IST showing the customer-app FastAPI crashed on `ServerSelectionTimeoutError` and nginx logged premature-close entries.
- **Classification:** CR (production hardening)
- **Severity:** P1 (real incident occurred; recurrence prevention)
- **Risk:** LOW (one file, additive, no schema change)
- **Blast radius:** SMALL for the change itself; LARGE benefit under the next Atlas hiccup (~6× faster fail behavior)
- **Duplicate check:** DISTINCT
- **Existing code check:** `AsyncIOMotorClient(mongo_url)` at `backend/server.py:24` — no explicit options.
- **Evidence captured:**
  - `e1.txt` Python stack trace (ServerSelectionTimeoutError, 30 s timeout)
  - nginx log excerpt (client prematurely closed)
  - `e2.txt` CRM baseline (proves app-layer was healthy)
  - Cross-timeline correlation to 21:30 IST
- **Docs updated:** `CR.md`, `IMPLEMENTATION_PLAN.md`, `QA_HANDOVER.md`
- **Retroactive intake.**

```text
Intake complete: CR-2026-07-03-003-backend-mongo-timeouts-and-healthz
Classification: CR (production hardening)
Severity: P1
Risk: LOW
Duplicate check: DISTINCT
Evidence: captured (3 artefacts + reproduced live)
Blast radius: SMALL (change) / LARGE (benefit on next outage)
Docs updated: memory/change_requests/CR-2026-07-03-003-backend-mongo-timeouts-and-healthz/{CR.md,IMPLEMENTATION_PLAN.md,QA_HANDOVER.md}
Next: Planning (COMPLETE), Implementation (COMPLETE), QA (COMPLETE)
```
