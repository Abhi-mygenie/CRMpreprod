# CR-2026-07-03-012 — Leaked-Credential Doc Scrub + CI Lint Rule

**Status:** 📝 REGISTERED (Role 1 intake complete; Role 2 planning pending owner decisions)
**Session:** 2026-07-03
**Priority:** P2
**Severity:** P2
**Risk of change:** LOW — docs + one new CI script; no runtime code
**Fast Lane:** ❌ Not eligible (touches many files)

**Related:**
- Parent: [`CR-2026-07-03-000`](../CR-2026-07-03-000-remove-hardcoded-login-creds/CR.md) (code fix)
- Sibling follow-up: [`CR-2026-07-03-011`](../CR-2026-07-03-011-full-pos-proxy-refactor/CR.md) (architectural fix)
- Optional follow-up: CR-followup-G — git-history rewrite (owner decides in D-04)

---

## 1. Problem

The credential leaked from the frontend bundle (`+919579504871 / Qplazm@10`) is **also** committed in plaintext across **18 markdown files** in the repo. Fixing the bundle-leak alone leaves the credential permanently visible in git history and the committed docs.

Additionally, there is no automated guardrail to catch the next `REACT_APP_*_PASSWORD` / `_SECRET` / `_TOKEN` before it lands.

## 2. Two-part remediation

### Part A — Doc scrub (18 files + 1 stray code comment)

Substitute the leaked strings across all committed markdown files with an audit-preserving placeholder (default: `<REDACTED-CRED-CR-000>`). Also fix the stray comment example in `frontend/src/pages/PasswordSetup.jsx` line 442.

Full file list in `INTAKE_DOC.md` §4.

### Part B — CI lint rule

Add a shell script (`scripts/check-no-secrets-in-bundle.sh` — path TBD by D-01) that:

1. Greps `frontend/.env` for `REACT_APP_*_PASSWORD`, `REACT_APP_*_SECRET`, `REACT_APP_*_TOKEN`.
2. (Optionally) Greps the built bundle after `yarn build`.
3. Exits non-zero on hit.
4. Wired into the chosen CI pathway (pre-commit / GitHub Actions / build-prehook — D-01).

## 3. Scope

**IN:** 18 markdown scrub + 1 code-comment scrub + 1 new CI script.
**OUT:** Git-history rewrite (see CR-followup-G proposal in INTAKE_DOC §7 D-04). Any runtime code change. Any `.gitignore` change (existing patterns already block `.env`).

## 4. Success criteria (draft)

1. `grep -rl "9579504871\|Qplazm" /app` returns zero hits.
2. Scrub-marker is discoverable in scrubbed files so future readers understand the redaction.
3. CI lint script is executable, exits 0 on clean tree, exits ≠0 when a suspicious pattern is planted.
4. Alpha v0.1 operating prompt is not modified by this CR.

## 5. Prerequisite

Credential rotation coordinated with MyGenie CRM team (CR-000 D-01). Ideal timing: rotate → then scrub → then land Part B.

## 6. Effort

**~1.5 hrs** total (Part A: 30 min · Part B: 45 min · Self-test: 15 min).

## 7. Owner decisions

See `INTAKE_DOC.md` §7 — 4 decisions needed before Planning starts.

---

Full Impact Analysis + Implementation Plan written at Role 2 after owner approves D-01..D-04.
