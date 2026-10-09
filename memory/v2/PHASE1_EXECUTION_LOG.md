# Phase 1 — Execution Log (Security Containment: doc redaction + guardrail)

> Date (UTC): 2026-05-30 · Acting on owner approval: **"go ahead with Phase 1"**
> Working copy: `/tmp/baseline_repo` (clone of `main @ 4612953`)
> Scope executed: GAP-001 (doc secret redaction) + guardrail. **No git push/commit performed.**
> OTP echo (GAP-003) = separate CR (not in this phase). CORS (GAP-005) = deferred (pre-prod).

## What was done (code/file changes in the working copy)

1. **Redacted all plaintext passwords from docs → placeholders.** 25 occurrences across 14 tracked files.
   - Mongo password → `<MONGO_PASSWORD>` (URI now reads `mongodb://mygenie_admin:<MONGO_PASSWORD>@52.66.232.149:27017/mygenie`)
   - POS/order-login password → `<POS_LOGIN_PASSWORD>`
   - Files: `HANDOVER.md`, `DEPLOYMENT_HANDOVER.md`, **`frontend/public/PRD.md`** (the browser-downloadable one), `memory/change_requests/CR-2026-05-30-001/.../QA_HANDOVER_ITEM1.md`, `memory_repo/DEPLOYMENT_HANDOVER_CUSTOMER_APP.md`, `memory_repo/DEPLOYMENT_RUN_ISSUES.md`, `memory_repo/QA_HANDOVER_SESSION_2026-05-03.md`, `memory_repo/QA_HANDOVER_SESSION_2026-05-04.md`, `memory_repo/change_requests/SERVICE_CHARGE_MAPPING_478_EDIT_ORDER_VALIDATION_REPORT.md`, `memory_repo/current-state/CRM_ENV_SWITCH_RUNTIME_TRACE_AND_PHASE2_PLAN.md`, `test_reports/iteration_1..4.json`.
   - Only passwords were redacted; test-fixture phone numbers and the DB host/username were intentionally left untouched (rotation neutralizes the password anyway).

2. **Added a "no-secrets-in-docs" guardrail:** `scripts/check_no_secrets.sh` (new). Scans git-tracked files; fails (exit 1) on known leaked literals or any MongoDB URI containing an embedded plaintext password (placeholders allowed).

## Verification (all green)
- `git grep` for both password literals → **CLEAN** (0 remaining in tracked tree).
- All 4 redacted JSON files still parse as valid JSON.
- Guardrail on the redacted tree → **PASS (exit 0)**, runs in ~0.4s.
- Negative test (re-introduced a secret) → guardrail **correctly BLOCKED** (exit non-zero). Test file removed.

## Artifacts (in /app/memory/v2)
- `phase1_doc_redaction.patch` — the full diff of the 14-file redaction (apply with `git apply`).
- `check_no_secrets.sh` — copy of the guardrail script.

## NOT done here (by design / needs owner)
- **Password rotation (REQUIRED, owner action).** Redaction hides the secret going forward, but the old passwords still exist in git history (history scrub was declined — option a). They are only made harmless once rotated:
  - **MongoDB:** change the `mygenie_admin` password on the pre-prod DB, then update `MONGO_URL` in `backend/.env`, restart backend.
  - **POS:** change the POS/order service-account password in the MyGenie POS admin, update `REACT_APP_LOGIN_PHONE`/`REACT_APP_LOGIN_PASSWORD` in `frontend/.env`, rebuild/redeploy frontend.
- **Delivery to GitHub.** Changes are in the local working copy only; not pushed (no write creds; platform policy routes git writes to the owner's push flow).
- **Wiring the guardrail into CI/pre-commit** → planned for Phase 8 (CI).

## Status
GAP-001 doc-redaction: **DONE (local, verified)**.

Open items (owner-owned):
- **Password rotation: PENDING — owner will rotate later and confirm** (acknowledged 2026-05-30). ⚠️ Until rotated, the old Mongo + POS passwords remain LIVE/usable because git history was not scrubbed (option a). Redaction only stops future exposure.
- **GitHub delivery: OWNER WILL APPLY THE PATCH (parked)** — owner will `git apply phase1_doc_redaction.patch` on their checkout and push. No push from agent.
