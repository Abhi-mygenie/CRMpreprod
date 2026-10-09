# Intake Doc — CR-2026-07-03-012

**ID:** CR-2026-07-03-012-leaked-cred-doc-scrub-and-ci-lint
**Session:** 2026-07-03
**Operator agent:** E1
**Role:** Role 1 (INTAKE) per Alpha v0.1 §8

---

## 1. Owner report / origin

Filed as follow-up during CR-2026-07-03-000 Role 6 investigation. Grep found the leaked credential `+919579504871 / Qplazm@10` in **18 markdown files** committed to the repo. Even after CR-000 removes the credential from the JS bundle, git history and the 18 docs continue to leak it. Distinct concern from the code fix.

Also filed alongside: a CI lint rule that fails the build if any `REACT_APP_*_PASSWORD` / `REACT_APP_*_SECRET` / `REACT_APP_*_TOKEN` env variable is present in the shipped bundle, so this class of bug can't reappear.

Owner approval to file (2026-07-03): "post that file e and f".

## 2. Summary

Two-part hygiene CR:

**Part A — Doc scrub.** Replace every occurrence of `9579504871` and `Qplazm` across the 18 markdown files with a redaction placeholder (`<REDACTED-CRED-CR-000>` or similar). Preserves the historical narrative (that a credential existed there) without preserving the credential itself.

**Part B — CI lint rule.** Add a shell / pre-commit / CI check that greps `frontend/.env`, `backend/.env`, and the built bundle for the patterns `REACT_APP_*_PASSWORD`, `REACT_APP_*_SECRET`, `REACT_APP_*_TOKEN`, `REACT_APP_*_KEY` (where key is not `_KEY` for Maps etc. — refine allow-list) and fails the pipeline if any hit is found.

## 3. Classification

| Field | Value |
|---|---|
| Type | CR — docs + tooling |
| Severity | **P2** (security hygiene, complements CR-000) |
| Risk | **LOW** — no runtime code, no `.env` change, no build config change (only adds a new CI script) |
| Duplicate check | **DISTINCT** |
| Evidence | Role 6 audit in `CR-2026-07-03-000/FINDINGS.md` §4 (18-file inventory) |
| Blast radius | SMALL (docs edits + one new CI file) |

## 4. Scope

**IN scope:**
- Scrub the following 18 files (verified list from Role 6 grep):
  - `memory/change_requests/CR-2026-05-30-001-config-mandatory-fields-and-scan-misrouting/QA_HANDOVER_ITEM1.md`
  - `memory/change_requests/CR-2026-06-17-002-channel-preview-in-admin/QA_HANDOVER.md`
  - `memory/change_requests/CR-2026-06-17-002-channel-preview-in-admin/IMPLEMENTATION_HANDOVER.md`
  - `memory/change_requests/CR-2026-06-17-003-customer-menu-availability/QA_HANDOVER.md`
  - `memory/change_requests/CR-2026-06-17-003-customer-menu-availability/IMPLEMENTATION_HANDOVER.md`
  - `memory/change_requests/CR-2026-06-17-001-menu-order-enhancements/QA_HANDOVER_PHASE1.md`
  - `memory/change_requests/CR-2026-07-03-000-remove-hardcoded-login-creds/CR.md`
  - `memory/change_requests/CR-2026-07-03-000-remove-hardcoded-login-creds/INTAKE_DOC.md`
  - `memory/change_requests/CR-2026-04-11-001-order-placement-fixes/QA_HANDOVER.md`
  - `memory_repo/DEPLOYMENT_RUN_ISSUES.md`
  - `memory_repo/DEPLOYMENT_HANDOVER_CUSTOMER_APP.md`
  - `memory_repo/QA_HANDOVER_SESSION_2026-05-04.md`
  - `memory_repo/CUSTOMER_ENDPOINTS_v2.md`
  - `memory_repo/QA_HANDOVER_SESSION_2026-05-03.md`
  - `memory_repo/change_requests/DELIVERY_PHONE_AND_ADDRESS_FLOW_INVESTIGATION_2026-02-XX.md`
  - `memory_repo/change_requests/SERVICE_CHARGE_MAPPING_478_EDIT_ORDER_VALIDATION_REPORT.md`
  - `memory_repo/current-state/CRM_ENV_SWITCH_RUNTIME_TRACE_AND_PHASE2_PLAN.md`
  - `DEPLOYMENT_HANDOVER.md`
- Fix stray comment leak in `frontend/src/pages/PasswordSetup.jsx` line 442 (`+919579504871 → +91 •••••04871` → change example to a fake number like `+919999999999`).
- Add CI lint script at `scripts/check-no-secrets-in-bundle.sh` (or equivalent path) that:
  - Greps `frontend/.env` and `backend/.env` for suspicious patterns.
  - Optionally greps the built bundle (post `yarn build`) for concrete high-risk strings.
  - Exits non-zero on hit.
- Wire the script into whichever pre-commit / CI pipeline the repo uses (needs owner decision D-01 on that pathway).

**OUT of scope:**
- Rewriting git history to purge past commits. That's a `git filter-repo` operation with LARGE blast radius; needs its own owner-approved CR (call it CR-followup-G).
- Any code refactor.
- Any credential rotation (that's coordinated with the MyGenie CRM team via CR-000 D-01).
- Any change to `.gitignore`.

## 5. Prerequisites

- **Credential must be rotated in MyGenie CRM before scrub** (or in parallel), so the scrubbed docs correspond to a dead credential. If we scrub while the cred is still live in CRM, we lose the audit trail on what exact credential was leaked.
- No hard code prerequisites.

## 6. Success criteria

| # | Criterion | Verification |
|---|---|---|
| S-01 | `grep -rl "9579504871\|Qplazm" /app --include="*.md"` returns **zero** matches | Post-CR grep |
| S-02 | `frontend/src/pages/PasswordSetup.jsx` line 442 uses a fake example number | View file |
| S-03 | The scrub-marker (`<REDACTED-CRED-CR-000>`) appears in every previously-affected file so future readers know a redaction happened | Grep count |
| S-04 | CI lint script exists at agreed path, is executable | `ls -la` |
| S-05 | Script exits non-zero when a suspicious `REACT_APP_*_PASSWORD` pattern is planted | Test with a synthetic hit |
| S-06 | Script exits zero on the current clean tree | Run in current state |
| S-07 | Alpha v0.1 operating prompt unchanged | `git status memory/control/` clean |

## 7. Owner decisions needed at Planning gate

| # | Decision | Options |
|---|---|---|
| D-01 | CI pipeline pathway for the lint script | (a) pre-commit hook (b) GitHub Actions workflow (c) `yarn build` prehook (d) all three |
| D-02 | Redaction marker text | (a) `<REDACTED-CRED-CR-000>` (b) `<REDACTED>` (c) placeholder like `+91XXXXXXXXXX` / `<password>` |
| D-03 | Include a `.env.example` file with placeholders in the repo so devs know what shape to use without leaking real values? | (a) yes (b) no — keep discovery via `DEPLOYMENT_HANDOVER.md` |
| D-04 | Whether to also file CR-followup-G (git history rewrite via `git filter-repo`) | (a) yes, high priority (b) yes, low priority (c) no — accept git-history leak |

## 8. Estimated effort

- Doc scrub (18 files, ~2 substitutions each): 30 min
- CI lint script + wiring: 45 min
- Self-test: 15 min
- **Total: ~1.5 hrs**

## 9. Related items

- **CR-2026-07-03-000** — Code fix that stops the bundle-leak. This CR handles the doc-leak.
- **Optional follow-up CR-followup-G** — Git-history rewrite (if D-04 says yes)
- Alpha v0.1 §11 R11 (secret hygiene is mandatory) — this CR operationalises that rule with tooling.

## 10. Compact Role 1 exit block

```text
Intake complete: CR-2026-07-03-012
Classification: CR (docs scrub + CI tooling)
Severity: P2
Risk: LOW
Duplicate check: DISTINCT
Evidence: linked (CR-000 FINDINGS §4, 18-file inventory)
Blast radius: SMALL
Docs updated: memory/change_requests/CR-2026-07-03-012-leaked-cred-doc-scrub-and-ci-lint/INTAKE_DOC.md, memory/change_requests/README.md (row added)
Prerequisites: credential rotation coordinated with MyGenie CRM team (from CR-000 D-01)
Next: Planning (Role 2) — after owner answers D-01..D-04
```
