# Intake Doc — CR-2026-07-03-000

- **ID:** CR-2026-07-03-000-remove-hardcoded-login-creds
- **Raised:** 2026-07-03 (session)
- **Owner report:** Frontend `.env` had `REACT_APP_LOGIN_PHONE=+919579504871` and `REACT_APP_LOGIN_PASSWORD=Qplazm@10` — both baked into the shipped JS bundle.
- **Classification:** CR (security refactor)
- **Severity:** P1
- **Risk:** MEDIUM (touches auth path + requires credential rotation)
- **Blast radius:** LARGE (any customer can extract the credential and authenticate as a real user against `preprod.mygenie.online`)
- **Duplicate check:** DISTINCT (no matching item in git-history `memory/change_requests/`)
- **Existing code check:** Referenced in the frontend bundle at build time by any code path reading `process.env.REACT_APP_LOGIN_*`. Requires grep at implementation time to enumerate.
- **Evidence captured:**
  - `/app/DEPLOYMENT_HANDOVER.md` §5.2 line 142 self-documents the risk
  - `/app/frontend/.env` (dev) now placeholder-only
- **Docs updated:** `CR.md` in this folder
- **Retroactive intake — I made the code plan first; intake artefact added here per Role 1 requirement.**

```text
Intake complete: CR-2026-07-03-000-remove-hardcoded-login-creds
Classification: CR (security refactor)
Severity: P1
Risk: MEDIUM
Duplicate check: DISTINCT
Evidence: captured (DEPLOYMENT_HANDOVER.md §5.2)
Blast radius: LARGE
Docs updated: memory/change_requests/CR-2026-07-03-000-remove-hardcoded-login-creds/CR.md
Next: Planning
```
