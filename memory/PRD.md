# MyGenie CRM - Preprod Deployment + CR-124

## Original Problem Statement
1. Deploy CRMpreprod repo (main branch) into /app as-is
2. CR-124: International Phone Number Support (E.164) — hotels serve international guests whose numbers don't fit Indian 10-digit format

## Architecture
- Frontend: React 19 + CRACO + Tailwind + Shadcn/UI (port 3000)
- Backend: FastAPI + Motor (MongoDB async) + APScheduler (port 8001)
- Database: MongoDB at 52.66.232.149:27017/mygenie

## What's Been Implemented
### 2026-10-30: Repo deployment
- Cloned CRMpreprod main branch, installed deps, services running

### 2026-10-30: CR-124 International Phone Support
- core/phone.py: known-prefix E.164 detection + explicit non-India cc branch
- routers/customers.py: CSV import via normalize_phone, cc-aware dedup, export field, header round-trip fix
- routers/pos.py: removed hardcoded "+91" in trigger-event fallback
- Frontend: QR registration cc selector, customer table/detail +cc display, CSV help text
- Testing: 14 unit tests + 6 CSV tests + 7/7 API tests + testing agent 100% PASS

## Prioritized Backlog
- P0: Q5 (CR-124 vs CR-069 priority sequencing) — owner decision pending
- P1: CR-069 (Template Button Variable Mapping) — in queue
- P2: CR-112 (Unique phone index) — coordinate with CR-124 compound key
- P3: Full QA run of CR-085/099/100/102 regression suites
