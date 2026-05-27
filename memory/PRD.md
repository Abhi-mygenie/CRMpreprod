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

### Session 1: Repo Setup
- Cloned repo from `27-may` branch, configured env, services running

### Session 2: CR-003 Verification
- Verified CR-003 Phase 1-4 already in codebase (coupon analytics dashboard)

### Session 3: CR-004 P1 — Foundation Cleanup
- Removed legacy dead endpoints/models/modals, canonical variables endpoint, text-mode fix
- Status: `cr004_phase_1_complete`

### Session 4: CR-004 P2 — Variable DB Mapping
- Enriched registry with source chains + formatters, new resolver, brand data injection, save-time warnings
- Status: `cr004_phase_2_complete`

### Session 5: CR-004 P2.5 — Variable Expansion
- Expanded from 10 to 23 variables across 7 categories
- New: order_id, old_tier, expiring_points, total_visits, total_spent, rating, coupon_title, coupon_discount, coupon_expiry, einvoice_link, instagram_link, google_review_link, feedback_link
- Enriched coupon trigger site with title/expiry
- Profile link placeholders ready (resolve from users doc when fields added)
- 50/50 tests pass
- Status: `cr004_phase_2_5_complete`

## CR-004 WhatsApp Phase Tracker

| Phase | Name | Status |
|---|---|---|
| P0 | Discovery | Complete |
| P1 | Foundation Cleanup | Complete |
| P2 | Variable DB Mapping | Complete |
| P2.5 | Variable Expansion | Complete |
| P3 | Event Reconciliation | Not started |
| P4 | Channel Abstraction | Not started |
| P5 | Segment Broadcasts | Not started |
| P6 | Opt-in/Opt-out | Not started |
| P7 | Message Dashboard Hardening | Not started |

## Backlog
- P0: CR-004 P3 — Event Reconciliation
- P1: CR-004 P5 — Segment Broadcasts
- P2: Profile page — add einvoice_link, instagram_link, google_review_link, feedback_link fields
- P2: CR-004 P7 — Message Dashboard Hardening
- P2: CR-011 Coupon Optimizer Auto-Suggest
