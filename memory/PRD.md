# DinePoints / MyGenie CRM

## Problem statement
Pull `https://github.com/Abhi-mygenie/CRMpreprod.git` (branch `28-may`) into `/app`. Build as-is. Use remote MongoDB only.

## Stack
- Backend: FastAPI (Python 3.11) — `/app/backend`
- Frontend: React 19 (CRA + craco) — `/app/frontend`
- DB: Remote MongoDB `mongodb://mygenie_admin:***@52.66.232.149:27017/mygenie` (DB name: `mygenie`)

## Setup performed (2026-05-28)
- Wiped `/app`, cloned repo branch `28-may` into `/app`.
- Created `/app/backend/.env` with `MONGO_URL`, `DB_NAME=mygenie`, `CORS_ORIGINS=*`, `JWT_SECRET`.
- Created `/app/frontend/.env` with `REACT_APP_BACKEND_URL` (preview URL) and `WDS_SOCKET_PORT=443`.
- Installed Python deps from `backend/requirements.txt`, frontend deps via `yarn install`.
- Verified remote Mongo reachability (Mongo 7.0.30; collections include `orders`, `customers`, `users`, `coupons`, `loyalty_settings`, `pos_request_logs`, etc.).
- Restarted supervisor; backend `/api/health` returns healthy; frontend serves the MyGenie login page.

## Constraint
Do NOT call/modify the remote database unless explicitly approved.

## Active sprint
**CR-004 P3.5 — Message Status Pipeline Refactor** (post-Phase-3 follow-up).
- Plan: `memory/crm/crm_roi_sprint/planning/CR_004_PHASE_3_5_MESSAGE_STATUS_PIPELINE_REFACTOR_PLAN.md`
- Closeout: `memory/crm/crm_roi_sprint/implementation/CR_004_P3_5_IMPLEMENTATION_CLOSEOUT.md`
- Implementation handover (Commits 1+2 detail): `memory/crm/crm_roi_sprint/implementation/CR_004_P3_5_COMMIT_1_AND_2_HANDOVER.md`

### Session 2026-05-28 work delivered (Commits 1–7)
Goal: make `whatsapp_message_logs` the single, complete source of truth for the Message Status dashboard.

1. **State-machine foundation** (`core/whatsapp_status.py`, 15 unit tests passing).
2. **Send-side row refactor**: every new WhatsApp send writes a 30-field row with real AuthKey `logid` (was `null`), raw response captured, idempotency-ready, trigger exceptions visible as `rejected` rows. Added 6 indexes (sparse + partial filter) on `whatsapp_message_logs` and new `whatsapp_callback_logs` collection.
3. **Callsite enrichment**: ~22 callsites across 9 files now pass `idempotency_key` + `reference_type`/`reference_id` in `event_data`. POS retries and cron re-runs no longer double-send.
4. **Path B unification**: `/test-template` now writes through the same canonical writer; one row shape across the codebase.
5. **Webhook full rewrite**: audit-first, locked schema from real AuthKey sample. State-machine guards prevent status regression. `delivered_at`/`read_at`/`rejected_at`/`failure_reason`/`meta_message_id` populated. HMAC verifier dormant (AuthKey doesn't sign).
6. **Dashboard backend extensions**: `include_test` filter (default off), name+phone regex-escaped search, template dedup, 30-min in-flight grace on resend.
7. **Frontend polish**: date range pickers, "Show test sends" toggle, TEST badge, delivered_at/read_at subtext, resend tooltip on in-flight rows, dead-code cleanup (3 legacy event descriptions removed).

### Verification
- 65/65 unit tests pass (15 new state-machine tests + all existing WhatsApp tests).
- All backend Python files lint-clean (ruff).
- Both modified frontend files lint-clean (eslint).
- Backend healthy after restart; remote MongoDB indexes verified via read-only probe.
- Webhook integration probes (empty/unknown logid/unknown status) all classify and audit-log correctly.
- Playwright screenshot of `/message-status` confirms all new UI elements render.

### What remains (owner ops only)
- Push branch `28-may` to production CRM.
- Register webhook URL `https://crm.mygenie.online/api/whatsapp/status-callback` in AuthKey console for R689's WABA.
- Optional hardening (Commit 8 backlog): IP allowlist, rate limit, replay window.

## Strict rules
Do NOT call/modify the remote database from scripts. Do NOT run the testing agent (per user direction). Do NOT add AuthKey secrets to `.env` (AuthKey doesn't sign webhooks; one-key model).

## Not done in this session
- No backfill of historical Pending rows (G22 — owner declined).
- No legacy `sent`/`failed` row migration (G12 — owner declined).
- No production push (owner does this).
- No live end-to-end test (requires B3 — webhook URL registration on prod).
