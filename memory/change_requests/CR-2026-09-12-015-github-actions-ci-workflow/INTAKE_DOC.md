# INTAKE DOC — CR-2026-09-12-015

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-12-015 |
| **Title** | GitHub Actions CI workflow — enforce CR-2026-09-12-005 pytest + contract snapshots on every PR / push / weekly cron |
| **Classification** | CR — CI / Infrastructure |
| **Date Registered** | 2026-09-12 |
| **Reported By** | Owner directive (Q4 answer in CR-005 Planning session, 2026-09-12): *"a but in this gate i will call intake agent after this this gate"* |
| **Severity** | P1 — safety-net enforcement (parent gate blocker for behaviour-preserving refactors) |
| **Risk** | LOW-MEDIUM (single new YAML file + 6 repo secrets; no app code touched; but CI misconfiguration could point at wrong DB → data risk. Mitigated by mandatory review + secrets-list approval before merge.) |
| **Status** | 📝 REGISTERED (Role 1 INTAKE done); **BLOCKED — needs owner git access + owner "Save to GitHub" push** |
| **Parent** | CR-2026-09-12-001 (Architecture Correction Programme, Wave 1) |
| **Sibling** | **CR-2026-09-12-005 Phase 1** (the local pytest suite this CR then enforces automatically) |
| **Follows** | CR-2026-09-12-005 Phase 1 CLOSED (must exist on disk before CI can run it) |

---

## 1. Problem

CR-2026-09-12-005 Phase 1 will land a pytest + contract-snapshot suite under `/app/backend/tests/` that runs manually inside the pod. That is 100% valuable only if a human remembers to run `pytest` before every push. In practice, humans do not. The value of the safety net (block silent API-shape drift) drops from ~100% to ~10% without automatic enforcement.

This CR fixes that gap by adding a GitHub Actions workflow that runs the same suite automatically on every PR into `main`, on every push to `main`, and on a weekly cron — with a hard-fail policy that blocks merges on snapshot drift.

**Why this is a separate CR (not part of CR-005):** owner does not have git write access at the time of CR-005 Planning (2026-09-12). Without git access, `.github/workflows/ci.yml` cannot land. Owner's plan: use Emergent "Save to GitHub" when ready to push the pod state; this CR ships the workflow file so it activates on that first push.

---

## 2. Scope

### IN
- **1 new YAML file:** `/app/.github/workflows/ci.yml`
  - Matrix job (Job A — frontend build+jest; Job B — backend pytest with UAT Mongo access)
  - Triggers: `pull_request` → `main`, `push` → `main`, `schedule` → weekly cron (`0 3 * * MON`)
  - Steps use `CI=false yarn build` (addendum §12 rule 7)
  - Backend job pulls 6 GitHub secrets (see §6 below)
  - Snapshot-drift post-check job (`git diff --exit-code` on `backend/tests/fixtures/snapshots/`)
- **1 checklist file:** `/app/memory/change_requests/CR-2026-09-12-015-.../SECRETS_CHECKLIST.md` documenting the 6 secrets owner must add to the GitHub repo settings.
- **README.md update:** point new contributors at the workflow behaviour.

### OUT (explicitly)
- Any change to `.emergent/emergent.yml` (addendum §12 rule 9 — platform-managed)
- Any change to the pytest suite itself (that is CR-005 Phase 1's territory)
- Playwright / frontend E2E (later CR)
- ESLint lint rule for leaked env names (that is CR-2026-07-03-012's territory — but the workflow will include the shell command that CR-012 hooks into once it lands)

---

## 3. Classification

Infrastructure · **Final: CR — CI / Infrastructure**

Not a bug, not a feature, not an investigation. It is the enforcement half of an existing safety-net programme.

---

## 4. Duplicate Check

| Related item | Relationship | Verdict |
|---|---|---|
| CR-2026-09-12-005 (parent) | This CR is the Phase 2 half of the 2-phase split adopted 2026-09-12 during CR-005 Planning | **RELATED — deliberate split, not duplicate** |
| CR-2026-07-03-012 (CI lint for leaked env names) | Owns an ESLint rule that would run as one more step inside this workflow | **RELATED — future integration point** |
| CR-2026-07-04-002 F-13 (observability + LB probe) | Adds `/api/healthz` probing infra — different concern (runtime monitoring, not CI) | **DISTINCT** |
| Alpha v0.1 addendum §4 Test Commands | Documents `pytest` and `yarn test` commands this CR wires up | **REUSE — not a CR** |

**Verdict: DISTINCT as a CR; deliberately split from parent CR-005; no duplicate ID exists.**

---

## 5. Blast Radius

**SMALL.** Zero application code touched. Zero `.env` mutation on the pod. Zero customer/admin-facing effect. Zero preprod change. The only production-adjacent risk is CI misconfiguration writing to a wrong DB — mitigated by:
1. `MONGO_URL` GitHub secret points at **UAT** (Owner G0.9 + D-05-3 both accepted), never production.
2. Snapshot-only reads on 478/716; write-smokes wrapped in `try/finally` to restore state.
3. First run happens on a non-`main` branch PR — owner sees before it touches `main`.

Constraint: **CI workflow must set `CI=false` (or `ESLINT_NO_DEV_ERRORS=true`) before `yarn build`** — addendum §12 rule 7. Not observing this rule breaks the frontend build immediately.

---

## 6. Owner decisions — all pre-frozen during CR-005 Planning (2026-09-12)

No new owner decisions needed for this intake. Every choice this CR would need was already answered in the CR-005 Planning session:

| Ref | Decision | Frozen value |
|---|---|---|
| D-05-3 | CI Mongo target | UAT Mongo `52.66.232.149:27017` via `MONGO_URL` secret |
| D-05-4 | Repo secrets to add | 6: `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `MYGENIE_API_URL`, `MYGENIE_POS_LOGIN_PHONE`, `MYGENIE_POS_LOGIN_PASSWORD` |
| D-05-6 | Triggers | PR to `main` + push to `main` + weekly cron (`0 3 * * MON`) |
| D-05-7 | Failure policy | Hard fail — merge blocked on snapshot mismatch |
| D-05-9 | POS-auth smoke | 200 AND 502 both PASS (avoids flakiness on preprod outages) |
| D-05-10 | `/api/docs/*` | Snapshot 200 today; CR-006 flips to 404 as visible delta |

**Only owner ACTIONS remain (not decisions):**
1. Grant git write access OR use "Save to GitHub" button to land the workflow file.
2. Add the 6 secrets to GitHub repo → Settings → Secrets and variables → Actions.

---

## 7. Evidence (code is truth — 2026-09-12)

| Fact | Source |
|------|--------|
| No `.github/` folder exists in `/app` today | `ls /app/.github` = miss |
| `.emergent/emergent.yml` is the only YAML config today (platform-managed, do not touch) | `find /app -name "*.yml"` |
| `backend/requirements.txt` will contain `syrupy` + `pytest-asyncio` after CR-005 Phase 1 lands | CR-005 IMPACT_ANALYSIS §7 |
| `frontend/package.json` already exposes `yarn test` (jest via craco) and `yarn build` (craco) | addendum §4 Test/Build Commands |
| The 29 checks (13 contracts + 8 negative + 8 smokes) that CI will enforce | CR-005 IMPACT_ANALYSIS §5.1 + §5.2 |

---

## 8. Prerequisites (before Planning gate opens)

| # | Prerequisite | Owner action needed? |
|---|---|---|
| 1 | CR-2026-09-12-005 Phase 1 CLOSED (pytest suite + snapshots exist on disk) | No — sequential dependency; auto-clears when CR-005 QA passes |
| 2 | Git write access OR Emergent "Save to GitHub" push available | **YES** |
| 3 | 6 GitHub repo secrets added by owner | **YES** — SECRETS_CHECKLIST.md will guide this |
| 4 | GitHub Actions runners can reach UAT Mongo at `52.66.232.149:27017` | **YES** — owner confirms (or Planning proposes IP-allowlist fallback if not reachable) |
| 5 | GitHub Actions runners can reach preprod POS at `preprod.mygenie.online` | **YES** — owner confirms (or D-05-9 502-PASS clause absorbs it) |

Until items 2–5 are green, this CR stays in **REGISTERED — BLOCKED**.

---

## 9. Blast Radius (repeat, per intake template)

**SMALL.** No app code. No `.env` mutation. Additive CI infrastructure only.

---

## 10. Exit criteria

CR closed when:
1. `.github/workflows/ci.yml` merged to `main` via a first PR.
2. First run of the workflow on that PR is GREEN.
3. Weekly cron run has fired at least once successfully.
4. A deliberate breaking change to any snapshotted endpoint is proven to turn CI red (verified once in a throwaway PR).
5. 6 secrets present in the repo (owner-confirmed screenshot or written attestation — no secret values in this repo).

---

## 11. Compact Role 1 output

```text
Intake complete: CR-2026-09-12-015
Classification: CR — CI/Infrastructure
Severity: P1
Risk: LOW-MEDIUM
Duplicate check: DISTINCT (deliberately split from CR-005 parent)
Evidence: captured (§7)
Blast radius: SMALL
Docs updated: /app/memory/change_requests/CR-2026-09-12-015-github-actions-ci-workflow/INTAKE_DOC.md; change_requests/README.md; PRD.md; OWNER_DECISIONS_2026-09-12.md (pending)
Next: BLOCKED on prerequisites #2..#5 (owner git access + 6 secrets + reachability). Planning gate opens only after owner supplies those AND CR-005 Phase 1 CLOSES.
```

**NEVER CODE DURING INTAKE.** Nothing implemented in this session. Sibling CR-005 remains in Impact-Analysis-approval stage.
