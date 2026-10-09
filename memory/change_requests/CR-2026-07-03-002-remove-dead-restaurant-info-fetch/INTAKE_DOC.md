# Intake Doc — CR-2026-07-03-002

- **ID:** CR-2026-07-03-002-remove-dead-restaurant-info-fetch
- **Raised:** 2026-07-03
- **Owner report:** DevTools 404 on `GET /api/restaurant-info/509`. Owner asked "how did this come, is it used?"
- **Classification:** CR (dead-code removal)
- **Severity:** P3 (silent 404 caught by `.catch(() => null)`; two admin toggles hidden as side-effect)
- **Risk:** LOW (single file, consumer contract preserved)
- **Blast radius:** SMALL (admin-only surfaces; no customer impact)
- **Duplicate check:** RELATED — endpoint absence catalogued in `memory_repo/current-state/STALE_OR_MISSING_ROUTE_REPORT.md` §1
- **Existing code check:** Endpoint has NEVER been implemented in `backend/server.py` on any branch (git-history verified). Only one frontend caller (`AdminConfigContext.jsx:167`).
- **Evidence captured:**
  - `curl http://localhost:8001/api/restaurant-info/509` → 404 (reproduced)
  - Backend OpenAPI enumeration — 38 routes, none matches
  - `git log --all -S "/api/restaurant-info/" -- backend/server.py` → 0 hits
- **Docs updated:** `CR.md`, `IMPLEMENTATION_PLAN.md`, `QA_HANDOVER.md`
- **Retroactive intake.**

```text
Intake complete: CR-2026-07-03-002-remove-dead-restaurant-info-fetch
Classification: CR (dead-code removal)
Severity: P3
Risk: LOW
Duplicate check: RELATED (STALE_OR_MISSING_ROUTE_REPORT.md §1)
Evidence: captured (reproducible 404 + git-history proof)
Blast radius: SMALL
Docs updated: memory/change_requests/CR-2026-07-03-002-remove-dead-restaurant-info-fetch/{CR.md,IMPLEMENTATION_PLAN.md,QA_HANDOVER.md}
Next: Planning (COMPLETE), Implementation (COMPLETE), admin QA (PENDING)
```
