# CR-046 → CR-059 — Architecture Audit Remediation Batch Intake

> **Date**: 2026-07-06 · **Role**: INTAKE (batch) · **Owner directive**: "Convert audit into registered CRs"
> **Source**: `/app/memory/ARCHITECTURE_AUDIT.md` v1.0 — 45 evidence-based findings (14 High / 21 Medium / 10 Low)
> **Rendered**: `<preview-url>/docs/audit.html`

## Grouping rationale

One CR per remediation **workstream** (not per finding) — 14 CRs instead of 45 rows. Every finding ID is referenced in its CR title/description; the CR-059 umbrella guarantees zero findings are dropped. Mapping mirrors the audit's 4-phase roadmap so the owner can promote whole phases.

## Register

| CR | Title | Findings | Severity | Risk class | Blockers / deps |
|---|---|---|---|---|---|
| CR-046 | 🚨 MongoDB Lockdown + Backup/Restore Verification | SEC-01, REL-02 | P0 | CRITICAL (prod data) | Owner-infra only, zero CRM code |
| CR-047 | Webhook HMAC Activation + CORS Pinning | SEC-03, SEC-02 | P0 | MEDIUM | HMAC blocked on AuthKey secret; absorbs CR-041-F3 |
| CR-048 | Auth Quick Hardening (stored password removal + rate limiting) | SEC-04, SEC-06 | P0 | HIGH (auth-adjacent) | Owner approval + integration playbook before code |
| CR-049 | Worker/API Split + Redis + Distributed Job Locks | SCA-01, SCA-05 | P1 | HIGH (scheduler/infra) | Prereq for CR-050 |
| CR-050 | Queue-Based Campaign Sending + Retry/DLQ | SCA-02, REL-05 | P1 | HIGH (campaign sends) | Depends CR-049; supersedes CR-038 A-C |
| CR-051 | Observability Foundation | MON-01, MON-03, REL-04, REL-06 | P1 | LOW-MEDIUM | Sentry account (owner) |
| CR-052 | CI + Branch Model + Staging | MAI-02, DEP-01, DEP-02 | P1 | LOW (process) | Owner infra for staging |
| CR-053 | Session/Auth Overhaul (refresh tokens, cookies, revocation) | SEC-05 | P1 | CRITICAL (auth) | Full gate flow + owner approval |
| CR-054 | Tenant Isolation Layer + Isolation Tests | SCA-03 | P2 | HIGH (touches hotspots) | After CR-052 CI exists ideally |
| CR-055 | Data Hygiene Bundle (indexes, migration, TTL, validators) | PER-02, PER-03, DM-01, DM-02 | P2 | CRITICAL (live-data migration) | Requires CR-046 verified backups; absorbs CR-041-F2 |
| CR-056 | MyGenie SSO Resilience (circuit breaker + degraded login) | REL-01 | P2 | CRITICAL (auth/SSO) | Full gate flow + owner approval |
| CR-057 | Config Validation + S3-Mandatory + POS API v1 | DEP-03, REL-03, MAI-03 | P2 | MEDIUM | POS team coordination for v1 alias |
| CR-058 | Secrets Mgmt + Credential Encryption + Hashed POS Keys | SEC-07, SEC-08, SEC-09 | P2 | HIGH (keys/creds) | KMS/secrets-manager infra (owner) |
| CR-059 | Scale Optimization Bundle (umbrella) | PER-01, PER-04, SCA-06/07/08/09, MON-02/04, DM-03/04, MAI-04, DEP-04, SEC-10 | P3 | Varies | Split into sub-CRs at promotion |

**Not re-registered**: MAI-01 (hotspot file splits) — already tracked as CR-041-F1.

## Duplicate check
- CR-038 (scheduler scale-out): RELATED → CR-050 supersedes its options A-C; CR-038 kept open for Q1-Q4 SLA answers only.
- CR-041-F2/F3 follow-ups: absorbed into CR-055 / CR-047 respectively (noted on CR-041 row lineage).
- No other overlap with CR-002…CR-045.

## Owner decisions required before any implementation
1. Promote Phase 0 now? (CR-046 is owner-infra and can start immediately in parallel.)
2. CR-047: obtain `AUTHKEY_WEBHOOK_SECRET` from AuthKey.
3. CR-048/053/056 are auth-gated — explicit approval required per addendum §14 / Part C before code.
4. Redis provisioning approach for CR-049 (managed vs in-cluster).

*End of intake · 2026-07-06*
