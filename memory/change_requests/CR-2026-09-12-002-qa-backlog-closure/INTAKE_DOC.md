# INTAKE DOC — CR-2026-09-12-002

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-12-002 |
| **Title** | QA backlog closure — execute Role 4 QA on every IMPLEMENTED / QA-pending item before the architecture refactor starts |
| **Classification** | CR — Process / QA (no new code; Bug Fix CRs spawned only if QA fails) |
| **Date Registered** | 2026-09-12 |
| **Reported By** | Owner |
| **Severity** | P1 (registry drift blocks CRITICAL refactor) |
| **Risk** | LOW (QA is read-only) — but items under test include CRITICAL files |
| **Status** | INTAKE ✅ — can start immediately (no owner decision needed) |
| **Parent** | CR-2026-09-12-001 (Wave 0) |

---

## 1. Owner Request (verbatim)

> "if anything else is pending QA all QA should be done before"

---

## 2. Backlog (registry scan 2026-09-12)

| # | Item | Current status | QA artefact present | Owner input needed |
|---|---|---|---|---|
| 1 | CR-2026-07-03-000 remove hardcoded login creds | 🚧 IMPLEMENTED, QA-pending | QA_HANDOVER §4 | Confirm rotated POS creds are in `backend/.env` |
| 2 | CR-2026-07-03-002 remove dead restaurant-info fetch | 🚧 IMPLEMENTED, QA-pending | QA_HANDOVER | none |
| 3 | CR-2026-07-03-004 frontend fetch timeouts (plumbing) | 🚧 IMPLEMENTED, QA-pending | QA_HANDOVER §5 | none |
| 4 | CR-2026-06-17-001 menu order enhancements | QA_PASSED — awaiting owner sign-off | QA_HANDOVER_PHASE1/2 | Owner sign-off → CLOSED |
| 5 | CR-2026-06-17-002 channel preview in admin | IMPLEMENTED — awaiting QA | none — needs QA_HANDOVER first | none |
| 6 | CR-2026-06-17-003 customer menu availability | IMPLEMENTED — awaiting QA | none — needs QA_HANDOVER first | none |
| 7 | CR-2026-08-06-001 time-controlled ordering | IMPLEMENTATION COMPLETE — QA READY | IMPLEMENTATION_PLAN (no QA_HANDOVER) | none |
| 8 | BUG-2026-09-08-001 `response is not defined` 422 crash | IMPLEMENTATION COMPLETE — awaiting QA | QA_HANDOVER | none — **P0, test first** |
| 9 | BUG-2026-09-10-001 image upload local disk | QA PASS — awaiting owner smoke | — | Owner smoke → CLOSED |
| 10 | INV-2026-09-10-001 Razorpay script missing | Fix on pod; `index.html` contains razorpay (verified 2026-09-12) | — | Owner confirms pushed to GitHub `main` |

Items 5–7 lack a QA_HANDOVER; Role 3 exit-gate item 7 was skipped — QA agent must write ad-hoc test cases from IMPLEMENTATION_PLAN / CR scope (§8 Role 4 step 3).

---

## 3. Classification

| Check | Result |
|-------|--------|
| Bug? | No |
| Feature? | No |
| Refactor? | No |
| **Final classification** | **CR — Process / QA closure** |

## 4. Duplicate Check

CR-2026-07-04-002 (registry finish-up) reconciles *rows*; this CR executes *QA*. RELATED, DISTINCT.

## 5. Evidence

Status strings grepped from every `change_requests/*/CR.md` + `INTAKE_DOC.md` and `PRD.md` §Active Change Requests on 2026-09-12.

## 6. Blast Radius

SMALL for the CR itself. Any FAIL spawns a BUG-FIX item under normal gates before Wave 1 code.

## 7. Exit criteria

Every row in §2 is ✅ CLOSED, ⛔ DEFERRED (owner rationale recorded), or has a registered BUG-FIX child. `README.md` + `PRD.md` statuses match reality. QA_REPORT.md written per item.

---

```text
Intake complete: CR-2026-09-12-002
Classification: CR (Process / QA closure)
Severity: P1
Risk: LOW
Duplicate check: DISTINCT
Evidence: captured (§2)
Blast radius: SMALL
Docs updated: this file; README.md
Next: Role 4 QA — start with BUG-2026-09-08-001 (P0), then items 1–3, then 5–7
```
