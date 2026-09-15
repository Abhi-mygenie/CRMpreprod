# MyGenie CRM — PRD (index)

> **Authoritative state**: `PROJECT_BASELINE_2026-09-08.md` · **Security**: `SECURITY_AUDIT_2026-09-08.md` · **Operating prompt**: `control/MYGENIE_CRM_AGENT_SYSTEM_PROMPT_v0_2.md` · **CR truth**: `CR_STATUS_DASHBOARD.md` + `crm/crm_roi_sprint/00_register/ROI_MEASUREMENT_CR_REGISTER.md` · **Decisions**: `DECISIONS_LOG.md`

## Original problem statement (product)
Multi-tenant restaurant/hotel CRM for MyGenie POS customers: loyalty points & tiers, coupons (flat/%, item/category, BOGO/BXG, Nth), WhatsApp automation (event → Meta template via AuthKey) and marketing campaigns (segments, scheduled/recurring), POS integration (orders webhook, customer lookup/edit, loyalty/wallet/coupon APIs, reports), e-invoicing (food / hotel room / hotel folio, S3), customer intelligence, hotel guest document capture & migration, scan-and-order customer app.

## Session problem statements (chronological)
- 2026-05 → 2026-08: `crm_roi_sprint` — CR-002 … CR-083, BUG-001 … 024, INV-001 … 014 (see dashboard).
- 2026-09-08 (bootstrap): pull `main` into `/app`, configure env, build as-is; S3-only file staging refactor (`routers/auth.py`, `routers/whatsapp.py`) — **uncommitted, unregistered → baseline INC-03**.
- 2026-09-08 (this session): (1) **Security audit** (Phase 0), (2) **consolidated project baseline** (Phase 1), (3) **agent prompt v0.2** with mode lock, missing-prerequisite protocol, regression gate (Phase 2). Read-only — no application code changed.

## Architecture
FastAPI + Motor (remote MongoDB `mygenie`, shared live data) · React 19 (craco) · APScheduler in-process (campaign job gated OFF) · AWS S3 · integrations: MyGenie POS (SSO + webhooks), AuthKey.io WhatsApp, Meta Graph v21, Freshmarketer webhook. 20 routers / 26,476 backend LOC / 26 pages. Hotspots and regression map: prompt v0.2 §B7.

## What's been implemented — 2026-09-08
- `memory/SECURITY_AUDIT_2026-09-08.md` — 24 findings (6 P0 / 7 P1 / 7 P2 / 4 P3), 4 P0/P2 items have no CR yet (skip-otp bypass, OTP-in-response ×2, secrets in `/me` + settings, cross-tenant cron, open registration). Remediation order R1–R4.
- `memory/PROJECT_BASELINE_2026-09-08.md` — snapshot, local-vs-remote gaps (INC-01…05: **test suites missing on this pod**, coupon suite lost, uncommitted S3 refactor), CR matrix, 15 doc inconsistencies (D-01…15), 8 process gaps (G-01…08), P0/P1/P2 backlog.
- `memory/control/MYGENIE_CRM_AGENT_SYSTEM_PROMPT_v0_2.md` — new controls + refreshed facts + owner questions B15.
- `memory/README.md` — banner to new entry points; fixed CR range, testing-agent rule, preview URL.
- **Test suites restored** (27 files from `main@2089f9f`, unchanged) + `design_guidelines.json`; `test_credentials.md` populated (4 tenants verified). Baseline run: **257 pass / 69 fail / 2 error / 4 skip — 0 confirmed app regressions** (failures = stale hardcoded JWT/API-key fixtures + preprod data state). Report: `/app/test_reports/pytest/BASELINE_2026-09-08_REPORT.md`. New finding SEC-P2-08: credentials (Mongo admin URL, JWT secret, tenant passwords) committed in test files → rotation needed.

## Environment
Backend `.env` 30+ keys (never print), frontend `REACT_APP_BACKEND_URL`. `test_credentials.md` **populated 2026-09-08** (4 tenant logins verified).

## Backlog (prioritised — full list baseline §9)
- **P0**: ~~restore `backend/tests/`~~ ✅ · Security R1 fast-track (6 removals) · owner decision on `skip-otp` · CR-046 DB lockdown/backups · **rotate credentials leaked in test files (SEC-P2-08)** · register + commit S3 refactor
- **P1**: fix 4 fixture-drift suites (login at setup) · CR-047/048 (HMAC, CORS, remember-me, rate limit) · CR-052 CI (+ secret scanning) · rebuild coupon regression suite · Starlette/FastAPI bump · owner smoke for 15 ✅ items · reconcile CR-026/032/062/067/068
- **P2**: CR-049…058 platform work · registration gate, security headers, log masking · feature backlog CR-082/025/016/045/064/060/038


## 2026-09-15 — INV-017 Customer App ↔ CRM v2 contract verification (READ-ONLY, no code changed)
- Role: INVESTIGATION (10/10 steps). Source: `crm/inbox/CRM_CONTRACT_VERIFICATION_REQUEST.md`.
- Result: orders/points/wallet v2 routes EXIST under `/scan/*` (`/scan/orders`, `/scan/loyalty`, `/scan/points/history`, `/scan/wallet/history`); Customer App probed wrong paths + expects different field names. Password reset for customers does NOT exist. OTP is dev-only (`dev_otp` returned, no SMS provider).
- Reports: `crm/crm_roi_sprint/investigations/INV_017_CUSTOMER_APP_CONTRACT_GAPS.md`, `.../INV_017_CRM_CONTRACT_REPLY_TO_CUSTOMER_APP.md`.
- Next: INTAKE for GAP-05 (`dev_otp` in prod, P1 security) + optional CR (skip pagination, expiring_soon); owner decisions on SMS provider & skip-otp guard rails.
