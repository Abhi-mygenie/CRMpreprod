# INTAKE DOC — CR-2026-10-04-002

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-10-04-002 |
| **Title** | Contract/smoke suite could not complete a green run — self-inflicted 429, wrong `testpaths`, plugins absent from the pod |
| **Classification** | **BUG — test infrastructure** (follow-up to CR-2026-09-12-005) |
| **Date Registered** | session after 2026-10-03 |
| **Reported By** | Planning of the Code-Correctness batch — the suite is the stated prerequisite for CR-2026-09-12-006 (backend split) |
| **Severity** | P1 — blocks the agreed safety-net strategy |
| **Risk** | LOW — test-only files, no application code |
| **Status** | ✅ **IMPLEMENTED + self-tested** this session |
| **Blast radius** | SMALL — `backend/tests/conftest.py`, `backend/pytest.ini` |

## 1. Problem

CR-2026-09-12-005 is recorded in the registry as *"✅ CLOSED — 22/22 PASS, safety net live."*
On a fresh pod it could not produce a green run at all:

| # | Defect | Symptom |
|---|---|---|
| D1 | `admin_jwt` logs in once per worker, and CR-2026-09-12-004 rate-limits `/api/auth/login` to **5/minute**. With `-n 2` (xdist) that is 2 logins per run, so **two runs inside one minute** exhaust the budget | `assert 429 == 200` → **4 ERRORS**, every authenticated test dead |
| D2 | `testpaths = backend/tests` while `pytest.ini` *lives in* `backend/` (rootdir `/app/backend`) | `PytestConfigWarning: No files were found in testpaths` — pytest silently fell back to recursive discovery, so the config was decorative |
| D3 | `pytest-asyncio` and `syrupy` are listed in `requirements.txt` but were **not installed in the pod** | `ERROR: Missing required plugins`, then `ModuleNotFoundError: No module named 'syrupy'` — suite unrunnable until installed by hand |

D1 is the serious one: the safety net fails *exactly* when it is used most — repeatedly, during a
refactor. It is also self-inflicted, by a sibling CR in the same wave, and was never noticed because
nobody re-ran the suite after CR-2026-09-12-004 shipped.

## 2. Fix shipped

| File | Change |
|---|---|
| `backend/tests/conftest.py` | `admin_jwt` retries up to 3× with a 21 s sleep while the response is `429`, instead of failing the session. Import `time` added |
| `backend/pytest.ini` | `testpaths = backend/tests` → `tests` |
| pod | `pip install pytest-asyncio syrupy` (already pinned in `requirements.txt` — **no requirements change**) |

Deliberately **not** done: lifting or disabling the rate limit for tests. The limiter is a shipped
P0 security control (CR-2026-09-12-004) and the suite must run against the app as deployed.

## 3. Result

```
before:  17 passed · 4 errors · 1 config warning   (after installing 2 plugins by hand)
after:   21 passed · 12 snapshots passed · 0 errors · 0 warnings
```

First fully green baseline on this branch. This is the artefact CR-2026-09-12-006 depends on.

## 4. Coverage note (not a defect — a finding for the batch)

The suite is green but **thin**: 21 tests over roughly **16 of the 44 routes** in `server.py`.

**Uncovered:** `/check-customer`, `/set-password`, `/verify-password`, `/profile` (GET+PUT),
`/orders`, `/get-order-details/{id}`, `/points`, `/wallet`, `/coupons`, `/feedback` (POST),
`/banners` ×3, `/pages` ×3, `/non-qr-block`, and 8 × `/docs/*`.

That uncovered set is the money-and-identity surface. Owner decision this session:
**extend snapshots to all 44 routes before the monolith split** — tracked as the next item in
`/app/memory/SPRINT_CODE_CORRECTNESS.md`, not here.

---

```text
Intake complete: CR-2026-10-04-002
Classification: BUG (test infrastructure)
Severity: P1
Risk: LOW (test-only)
Duplicate check: DISTINCT — CR-2026-09-12-005 built the harness; these are defects in it
Evidence: captured (pytest output before/after, pytest.ini:7, conftest.py:41-53)
Blast radius: SMALL
Docs updated: this file; ../README.md; ../../SPRINT_CODE_CORRECTNESS.md
Next: QA (Role 4) alongside the Gate-0 batch — or accept on self-test, since no application code changed
```
