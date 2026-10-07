# Handover — 2026-09-08 — Security Audit + Baseline Consolidation + Prompt v0.2

## Roles held
PRE-RELEASE AUDIT (security) → CLOSURE (baseline) → PLANNING (prompt v0.2). All READ-ONLY. **Code edits made: NONE.** Docs created/edited only.

## Outputs
1. `memory/SECURITY_AUDIT_2026-09-08.md` — 6 P0 (skip-otp bypass · customer OTP in response · staff reset OTP in response · secrets in `/me` + `/whatsapp/settings` · public Mongo no TLS · cross-tenant `cron/trigger-all-users`), 7 P1, 7 P2, 4 P3. Remediation R1–R4.
2. `memory/PROJECT_BASELINE_2026-09-08.md` — repo gaps INC-01…05, CR matrix, inconsistencies D-01…15, process gaps G-01…08, backlog.
3. `memory/control/MYGENIE_CRM_AGENT_SYSTEM_PROMPT_v0_2.md` — Mode Lock, Mode Transition Protocol, Missing Prerequisite Protocol, Regression Gate (S0/S1 + hotspot→suite map), Doc-Sync Gate, Session-End Gate, refreshed facts, owner questions B15.
4. `memory/PRD.md` rewritten as index; `memory/README.md` stale facts fixed (banner, CR range, testing-agent rule, preview URL).

## Key facts discovered
- `/app/backend/tests/` **absent on this pod**; remote `main` @ `2089f9f` has 28 suites → restore unchanged (DEPLOYMENT role). Legacy `qa_cr001c_*`/`qa_cr021_*` coupon suites (142 tests) exist nowhere.
- Local == remote except `routers/auth.py`, `routers/whatsapp.py` (S3-only refactor, unregistered, uncommitted).
- Mongo: 39 tenants, 7,503 customers; ransomware artifact DB gone; still public IP, no TLS.
- `test_credentials.md` empty; a plaintext credential exists in `CR_STATUS_DASHBOARD.md` "Next-agent message" (D-06) — owner to move it.
- pip-audit: Starlette 0.37.2 (9 advisories), litellm (platform-injected), ecdsa.

## Next agent — resume here
1. Get owner answers to prompt v0.2 §B15 (esp. Q1 skip-otp, Q2 Security R1 approval, Q3 CR-083).
2. If approved: DEPLOYMENT role → restore `backend/tests/` + `design_guidelines.json` from remote; run `pytest --collect-only`; record baseline pass/fail.
3. Then INTAKE → register Security R1 as CR-085 (or BUG-025…029) and the S3 refactor as CR-084; PLANNING → edit list; owner approval; IMPLEMENTATION with Regression Gate.
4. Do NOT implement any P0 fix in this or any READ-ONLY session without the Mode Transition block.

## Critical warnings
- Shared live MongoDB — no script writes.
- Do not trust `README.md`/v0.1 addendum facts without checking code (see baseline §7).
- Pod URL only from `frontend/.env`.
