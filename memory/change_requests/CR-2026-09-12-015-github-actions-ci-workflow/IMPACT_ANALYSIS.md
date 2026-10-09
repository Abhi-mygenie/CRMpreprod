# IMPACT ANALYSIS — CR-2026-09-12-015 (GitHub Actions CI workflow — Phase 2 of the CR-005 split)

**Role:** Planning (Role 2) · Stage: Impact Analysis
**Date:** 2026-09-12 · **Parent:** CR-2026-09-12-001 (Wave 1) · **Sibling:** CR-2026-09-12-005 Phase 1

> **⏸ STATUS UPDATE — 2026-09-13: DEFERRED TO WAVE 2**
> Owner decision (2026-09-13): Wave 1 split into Wave 1a (unblocked) and Wave 1b→Wave 2 (blocked).
> This CR is Wave 1b → **Wave 2**. It is blocked on owner-side prerequisites:
> 1. Git repo write access (or "Save to GitHub" push readiness)
> 2. 6 GitHub Actions secrets added: `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `MYGENIE_API_URL`, `MYGENIE_POS_LOGIN_PHONE`, `MYGENIE_POS_LOGIN_PASSWORD`
> 3. CR-2026-09-12-005 Phase 1 must be CLOSED first
> **No Planning or Implementation activity until owner clears these prerequisites and re-opens this CR.**
> See `OWNER_DECISIONS_2026-09-12.md` addendum 2026-09-13.

## 1. Item registered

- INTAKE_DOC.md present ✅ · Registry row updated ✅ · Sequenced after CR-005 Phase 1 CLOSED

## 2. Code reality (2026-09-12)

- `/app/.github/` does not exist. Only `/app/.emergent/emergent.yml` (**do not touch** — addendum §12 rule 9).
- `frontend/package.json` already exposes `yarn test` (jest via craco) + `yarn build`.
- `backend/requirements.txt` will contain `syrupy` + `pytest-asyncio` after CR-005 Phase 1 lands.

## 3. Conflict check

| CR | Overlap | Verdict |
|---|---|---|
| CR-2026-09-12-005 Phase 1 (sibling) | This CR runs the suite Phase 1 delivers | Dependency, not conflict |
| CR-2026-07-03-012 (CI lint) | Will add a lint step inside this workflow later | Future reuse point, not a blocker |
| CR-2026-07-04-002 F-13 (observability) | Runtime probe, not CI | Distinct |

## 4. Risk verification

Intake said LOW-MEDIUM. **Concur** — single YAML file + 6 repo secrets; only material risk is secret misconfiguration pointing at wrong DB. Mitigated by hard-coded UAT `MONGO_URL` in the secret AND first-run happening on a non-`main` PR that owner reviews.

## 5. Files that WILL change (all NEW — additive)

| # | Path | Type | Role |
|---|---|---|---|
| 1 | `/app/.github/workflows/ci.yml` | NEW | Matrix workflow: FE (build+jest) + BE (pytest with UAT Mongo access) + snapshot-drift post-check |
| 2 | `/app/memory/change_requests/CR-2026-09-12-015-.../SECRETS_CHECKLIST.md` | NEW | Owner-facing list of 6 secrets to add to GitHub repo settings |

## 5.1 Files that WILL NOT touch (scope lock)

- `server.py`, all frontend src, all `.env` (dev/pod files), `.emergent/*`, `backend/tests/**` (owned by CR-005 Phase 1), hotspot files.

## 6. Owner decisions — all pre-frozen during CR-005 Planning

All 10 D-05-* decisions apply verbatim. **No new owner decisions needed at Planning** — only prerequisite ACTIONS (git access, 6 secrets, reachability confirmation).

## 7. Downstream consumers

- CR-006 (Wave 2 backend split) — will be gate-protected by this workflow.
- All future refactor CRs — same.

## 8. Assumptions

1. Owner will use Emergent "Save to GitHub" (or grant direct write access) before this CR can move to Implementation.
2. GitHub-hosted runners can reach UAT Mongo `52.66.232.149:27017` + preprod POS.
3. UAT Mongo remains available and treated as disposable (Owner G0.9).

## 9. Verification matrix

| ID | Test | Expected |
|----|------|----------|
| VS-1 | `actionlint` on the workflow file | 0 errors |
| VS-2 | `CI=false` set for `yarn build` (addendum §12 rule 7) | grep passes |
| VS-3 | 6 secrets referenced with `secrets.NAME` syntax | grep matches D-05-4 list |
| VS-4 | Backend job runs the pytest suite CR-005 P1 delivered | `pytest -m "contract or smoke"` step present |
| VS-5 | Snapshot-drift post-check: `git diff --exit-code backend/tests/fixtures/snapshots/` | present |
| VS-6 | Triggers: PR + push-to-main + cron | all 3 present |
| VS-7 | First run green on a throwaway PR | passes |
| VS-8 | Deliberate breaking change → CI red | passes |

## 10. Compact Planning output

```text
Planning complete: CR-2026-09-12-015 · Stage: Impact Analysis · Risk: LOW-MEDIUM
Files WILL change: 2 new · WILL NOT touch: everything else
Owner decisions: NONE new (all pre-frozen with CR-005)
Owner prerequisites: git access + 6 secrets + reachability confirmation
Next: BLOCKED on prerequisites. When cleared → Owner "go" → IMPLEMENTATION_PLAN → Owner "go" → Role 3.
GATE DISCIPLINE: no plan yet, no code.
```
