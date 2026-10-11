# MyGenie CRM — Preprod Deployment

## Source
- Repo: https://github.com/Abhi-mygenie/CRMpreprod.git
- Branch: main
- Public repo, no auth required

## Architecture
- **Backend**: FastAPI (Python) — `/app/backend/server.py` + routers in `/app/backend/routers/`
- **Frontend**: React (CRA + CRACO) — `/app/frontend/src/`
- **Database**: MongoDB at `mongodb://mygenie_admin:***@52.66.232.149:27017/mygenie`
- **Scheduler**: APScheduler — campaign + loyalty cron jobs

## What Was Done (2026-10-10)
- Cloned `CRMpreprod` (main branch) from GitHub into `/tmp/CRMpreprod`
- Replaced `/app/backend/` and `/app/frontend/` with cloned repo content
- Preserved platform-specific `/app/.emergent/` directory
- Synced `/app/memory/`, `/app/test_reports/`, `/app/tests/`, `/app/scripts/`
- Wrote all provided env variables to `/app/backend/.env`
- Set `REACT_APP_BACKEND_URL` to platform preview URL in `/app/frontend/.env`
- Installed Python deps (`pip install -r requirements.txt`)
- Installed Node deps (`yarn install --frozen-lockfile`)
- Restarted backend + frontend via supervisorctl

## Environment Variables (Backend)
- MONGO_URL → mygenie_admin@52.66.232.149:27017/mygenie
- DB_NAME → mygenie
- JWT_SECRET → dinepoints-secret-key-2024
- MYGENIE_API_URL → https://preprod.mygenie.online
- AWS S3 → mygenie-prod (ap-south-1)
- CORS_ORIGINS → *
- CAMPAIGN_SCHEDULER_ENABLED → false

## Environment Variables (Frontend)
- REACT_APP_BACKEND_URL → https://b070265a-0fde-416c-b5f6-b0c8fa930941.preview.emergentagent.com
- WDS_SOCKET_PORT → 443
- ENABLE_HEALTH_CHECK → false

## Status
- Backend: RUNNING (FastAPI + APScheduler on port 8001) — `.env` on **preprod** DB (switched back 2026-10-10; prod read-only URL commented)
- Frontend: RUNNING (React/CRACO on port 3000)
- Login page: Rendering correctly

## Batch DQ-1 — Wave A Planning (2026-10-10)
- Role: PLANNING · Impact Analyses written for 4 groups (no code): CR-111 · CR-113+114 · CR-115 · CR-110-amend. Docs under `memory/crm/crm_roi_sprint/planning/` + `WAVE_A_SEQUENCE_AND_CONFLICTS_2026_10_10.md`.
- Owner rulings: 4-group composition · prod POS request log 100 %/7 d · CR-114 = manual script (no cron) · CR-115(d) re-link in scope, link-only.
- Findings: CR-115(c) guard already exists · `Customer` schema hides `phone_invalid` · BUG-038 candidate (`customers.py:470/473`) · CR-110 script hard-codes password, `crm_token` validity unverified.
- Next: owner answers 11 Qs → Intake BUG-038 → Implementation Plans (G1 ∥ G2 → G3-A → G3-B → G4). Handover: `handoff/SESSION_2026_10_10_HANDOVER_WAVE_A_IA.md`.

## Intake after Wave A planning (2026-10-10)
- Registered BUG-038 (F11 dedup typo → CR-113 b), BUG-039 (placeholder pos_customer_id 0/INT64-max, 17 CAFE 103 orders → CR-113 a / CR-114, POS P-17), BUG-040 (shared password hard-coded in token script → CR-110 amend), CR-118 (zero-touch restaurant provisioning + catch-up; P1/HIGH; next batch; needs POS P-8/P-16).
- Owner rulings: CR-115(c) → 409 · resume both syncs · prod snapshot → file · token script preprod proof mandatory. Open: CR-115(d) match rule (a/b/c).
- Intake doc: `memory/crm/crm_roi_sprint/discovery/SESSION_2026_10_10_INTAKE_BUG038_BUG040_CR118.md`.

## Wave A — all owner questions closed (2026-10-10)
- CR-115(d) re-link = `pos_customer_id` only · CR-113(a) + realtime `pos_customer_id` persisted (approved) · CR-115(c) → 409 · resume both syncs · prod snapshot → file · token script preprod proof mandatory.
- Sept-2026 prod probe: 83–84 % walk-in bills on both paths; linking healthy where a customer was attached.
- Next: "choose planning role for implementation planning of Group 1 / Group 2".

## Session handover (2026-10-10, final)
- `memory/crm/crm_roi_sprint/handoff/SESSION_2026_10_10_HANDOVER_WAVE_A_PLANNING_INTAKE_OWNER_EDITION.md` — plain-English story of data + code corrections (Waves A–D), what this session did, open owner actions, next gates. Next agent must read §1 to the owner first.

## 2026-10-11 — INV-023 Customer App brief (investigation, no code)
- Reply drafted: `skip-otp` ignores `name`; use `PUT /scan/profile {name}`; repeat `skip-otp` for phone change works; limits/JWT constraints listed; DQ ask back (skip-otp at Place Order). Doc: `memory/crm/crm_roi_sprint/investigations/INV_023_CRM_REPLY_CUSTOMER_APP_NAME_PHONE_EDGE_CASES_2026_10_11.md`. Owner to approve before sending.
