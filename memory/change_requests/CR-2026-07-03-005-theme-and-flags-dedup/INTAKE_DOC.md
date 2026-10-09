# Intake Doc — CR-2026-07-03-005

- **ID:** CR-2026-07-03-005-theme-and-flags-dedup
- **Raised:** 2026-07-03
- **Owner report:** Consolidation of follow-ups discovered during CR-001 and CR-002 shipping (F-01 permanent themeVersion, F-02 dedup of `restaurantFlags` in AdminSettings.jsx, F-03 StrictMode double-fire noise).
- **Classification:** CR (code-hygiene / dedup)
- **Severity:** P3
- **Risk:** LOW–MEDIUM (F-01 touches provider file)
- **Blast radius:** SMALL
- **Duplicate check:** DISTINCT — but note F-01 replaces the manual escape hatch of CR-2026-07-03-001
- **Existing code check:** Confirmed duplicates in `AdminSettings.jsx:213-244` and `AdminConfigContext.jsx` (now fixed).
- **Evidence captured:**
  - `grep -rn "restaurantFlags"` shows two independent states
  - `[MENU] Failed to fetch` console noise reproduced during CR-001 QA
- **Docs updated:** `CR.md`
- **Retroactive intake.**

```text
Intake complete: CR-2026-07-03-005-theme-and-flags-dedup
Classification: CR (dedup / cleanup)
Severity: P3
Risk: LOW–MEDIUM
Duplicate check: DISTINCT (related to CR-001 as permanent replacement of ?bustCache)
Evidence: captured
Blast radius: SMALL
Docs updated: memory/change_requests/CR-2026-07-03-005-theme-and-flags-dedup/CR.md
Next: Planning (item-level plans documented in CR.md), Implementation (deferred)
```
