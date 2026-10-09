# Intake Doc — CR-2026-07-03-001

- **ID:** CR-2026-07-03-001-theme-cache-busting
- **Raised:** 2026-07-03
- **Owner report:** "theme is not coming" on `/698` after backend DB switch to prod. Investigation showed the effect was stale `localStorage.restaurant_config_698` cached from UAT era.
- **Classification:** CR (bugfix + escape-hatch)
- **Severity:** P1
- **Risk:** MEDIUM (touches `RestaurantConfigContext.jsx` — flagged HIGH-risk file in operating prompt PART C, but change is additive and behind a query-param)
- **Blast radius:** MEDIUM (every customer whose browser holds a stale cache)
- **Duplicate check:** DISTINCT
- **Existing code check:** `RestaurantConfigContext.jsx` had cache-first hydration with no invalidation path.
- **Evidence captured:**
  - Live headless-browser reproduction and screenshots this session
  - CSS-var + localStorage inspection
- **Docs updated:** `CR.md`, `QA_HANDOVER.md`
- **Retroactive intake.**

```text
Intake complete: CR-2026-07-03-001-theme-cache-busting
Classification: CR
Severity: P1
Risk: MEDIUM
Duplicate check: DISTINCT
Evidence: captured (Playwright + DOM snapshot)
Blast radius: MEDIUM
Docs updated: memory/change_requests/CR-2026-07-03-001-theme-cache-busting/{CR.md,QA_HANDOVER.md}
Next: Planning (COMPLETE), Implementation (COMPLETE), QA (COMPLETE)
```
