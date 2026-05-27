# MyGenie CRM - PRD

## Original Problem Statement
1. Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git from 27-may branch
2. Use remote MongoDB: mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie
3. Build as-is

## Architecture
- **Frontend**: React 19 with Craco, Tailwind CSS, Radix UI, Recharts
- **Backend**: FastAPI (Python) with Motor (async MongoDB driver)
- **Database**: Remote MongoDB at 52.66.232.149:27017/mygenie
- **Auth**: JWT-based authentication

## What's Been Implemented

### Session 1 (May 27, 2026): Repo Setup
- Cloned repo from `27-may` branch into /app
- Configured backend .env with remote MongoDB connection
- Both services running

### Session 2 (May 27, 2026): CR-003 Verification
- Verified CR-003 Phase 1-4 features already in codebase

### Session 3 (May 27, 2026): CR-004 Phase 1 — Foundation Cleanup
- Removed legacy whatsapp_templates + automation_rules dead surface (endpoints, seeder, models, frontend modals)
- Created canonical variables endpoint GET /api/whatsapp/variables
- Fixed text mode bug in build_body_values()
- Dropped 280 zombie rows from MongoDB
- Status: `cr004_phase_1_complete`

### Session 4 (May 27, 2026): CR-004 Phase 2 — Variable DB Mapping
- Enriched variable registry with sources, fills_on_events, formatter per variable
- New resolve_variable() replaces legacy 6-entry field_aliases
- Brand data (restaurant_name) now injected at trigger time — no longer blank
- Save-time validator returns warnings for incompatible event/variable combos
- 25/25 tests pass (19 new + 6 regression)
- Status: `cr004_phase_2_complete`

## CR-004 WhatsApp Phase Tracker

| Phase | Name | Status |
|---|---|---|
| P0 | Discovery | Complete |
| P1 | Foundation Cleanup | Complete |
| P2 | Variable DB Mapping | Complete |
| P3 | Event Reconciliation | Not started |
| P4 | Channel Abstraction | Not started |
| P5 | Segment Broadcasts | Not started |
| P6 | Opt-in/Opt-out | Not started |
| P7 | Message Dashboard Hardening | Not started |

## Backlog / Next Tasks
- **P0 (next)**: CR-004 Phase 3 — Event Reconciliation (reconcile 7+ fired-but-unmapped events with master list)
- **P1**: CR-004 Phase 5 — Segment Broadcasts (the marketing send path)
- **P2**: CR-004 Phase 7 — Message Dashboard Hardening
- **P2**: CR-011 Coupon Optimizer Auto-Suggest
