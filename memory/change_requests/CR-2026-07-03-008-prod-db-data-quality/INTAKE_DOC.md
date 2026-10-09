# Intake Doc — CR-2026-07-03-008

- **ID:** CR-2026-07-03-008-prod-db-data-quality
- **Raised:** 2026-07-03
- **Owner report:** Discovered during 709/698/716 investigations against prod Atlas — 15 users w/o config, 9 orphan configs, 709 missing in UAT, double-slash logo URLs, booleans-as-strings.
- **Classification:** CR (DATA-only remediation; write-path code fixes deferred)
- **Severity:** P2 for the partially-provisioned restaurants (F-07); P3 for the rest
- **Risk:** MEDIUM (direct prod DB writes)
- **Blast radius:** MEDIUM (15 restaurants affected today)
- **Duplicate check:** DISTINCT
- **Existing code check:** N/A for the data phase; F-11 write-path code fix requires a separate follow-up CR
- **Evidence captured:**
  - Aggregation queries against `mygenie_db.users` and `.customer_app_config` (redacted output preserved in session logs)
  - List of the 15 partially-provisioned restaurant IDs
  - List of the 9 orphan config IDs (including malformed)
- **Docs updated:** `CR.md`
- **Retroactive intake.**

```text
Intake complete: CR-2026-07-03-008-prod-db-data-quality
Classification: CR (DATA)
Severity: P2 (F-07) / P3 (rest)
Risk: MEDIUM (direct prod DB writes)
Duplicate check: DISTINCT
Evidence: captured (aggregation output + ID lists)
Blast radius: MEDIUM (15 restaurants)
Docs updated: memory/change_requests/CR-2026-07-03-008-prod-db-data-quality/CR.md
Next: Owner cross-check with operator team → snapshot → phased remediation
```
