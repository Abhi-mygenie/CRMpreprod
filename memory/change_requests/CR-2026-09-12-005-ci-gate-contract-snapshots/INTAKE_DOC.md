# INTAKE DOC — CR-2026-09-12-005

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-12-005 |
| **Title** | CI gate (`yarn build` + Jest + pytest on ephemeral Mongo) + API contract-snapshot harness + backend smoke tests |
| **Classification** | CR — Test / CI infrastructure (GAP-009) |
| **Date Registered** | 2026-09-12 |
| **Reported By** | Agent proposal (owner: "anything else you suggest before moving multi-tier") |
| **Severity** | P1 — prerequisite for every behaviour-preserving refactor in Waves 2–5 |
| **Risk** | MEDIUM (new files only; no app code change) |
| **Status** | INTAKE ✅ — blocked on G0.9 confirmation (disposable DB) |
| **Parent** | CR-2026-09-12-001 (Wave 1) |

---

## 1. Problem

No `.github/workflows`; `backend/tests/` contains only `__init__.py`; `test_result.md` stale. Without a snapshot of current `/api/*` responses there is no evidence that CR-006 (backend split) preserves behaviour.

## 2. Scope

**IN:** `backend/tests/contracts/` — snapshot every public `GET /api/*` for a seeded rid + auth flows; `backend/tests/smoke/`; `.github/workflows/ci.yml` (matrix: FE build, Jest, pytest with `mongo` service container); seed fixture script; `pytest.ini` markers.
**OUT:** ESLint lint-rule for leaked env names (CR-2026-07-03-012); Playwright E2E (later CR).

## 3. Classification

Infrastructure · **Final: CR — Test/CI**

## 4. Duplicate Check

| Item | Relationship |
|---|---|
| GAP-009 | Execution |
| CR-2026-07-03-012 (CI lint) | RELATED — CR-012's script plugs into this workflow |
| v2 Correction Plan Phase 8 (CI) | Reuse |

**Verdict: DISTINCT.**

## 5. Blast Radius

SMALL (additive). Constraint: do NOT use `CI=true yarn build` (addendum §12 rule 7) — workflow must set `CI=false` or `ESLINT_NO_DEV_ERRORS=true`.

## 6. Owner decisions

G0.9 — CI never touches the live/pre-prod Mongo.

---

```text
Intake complete: CR-2026-09-12-005
Classification: CR (Test/CI)
Severity: P1
Risk: MEDIUM
Duplicate check: DISTINCT
Evidence: captured
Blast radius: SMALL
Docs updated: this file; README.md
Next: Planning (after G0.9)
```
