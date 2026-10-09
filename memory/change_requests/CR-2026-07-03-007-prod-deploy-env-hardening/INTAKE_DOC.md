# Intake Doc — CR-2026-07-03-007

- **ID:** CR-2026-07-03-007-prod-deploy-env-hardening
- **Raised:** 2026-07-03
- **Owner report:** Discovered from DevTools trace on deployed `july-branch-deploy.preview.emergentagent.com` — bundle is calling my dev container's API (F-05). Plus session `.env` still has placeholder / dev-only secrets (F-06).
- **Classification:** CR (deploy / env / security hardening — mostly ops-owned)
- **Severity:** P1 (security items in F-06)
- **Risk:** LOW for change itself (env only), MEDIUM for secret-rotation cutover
- **Blast radius:** LARGE (deploy currently coupled to my dev container)
- **Duplicate check:** RELATED to CR-2026-07-03-000 (login creds) — F-06 partially overlaps
- **Existing code check:** N/A — env / build-config, not source
- **Evidence captured:**
  - DevTools network trace of july-branch-deploy calling `cd356f08-...` host
  - `/app/DEPLOYMENT_HANDOVER.md` §5.1/5.2 documents the raw creds
- **Docs updated:** `CR.md`
- **Retroactive intake.**

```text
Intake complete: CR-2026-07-03-007-prod-deploy-env-hardening
Classification: CR (ops + security)
Severity: P1
Risk: LOW–MEDIUM
Duplicate check: RELATED (CR-000 for login creds)
Evidence: captured (Network tab trace + handover doc)
Blast radius: LARGE (deploy misconfigured)
Docs updated: memory/change_requests/CR-2026-07-03-007-prod-deploy-env-hardening/CR.md
Next: Owner assigns to ops + DBA + security team
```
