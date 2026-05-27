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
- Configured frontend .env with Emergent preview URL
- Both services running

### Session 2 (May 27, 2026): CR-003 Phase 3 Verification
- Verified CR-003 Phase 3 features (custom date picker + CSV export) already in codebase
- All 4 phases of CR-003 confirmed working

### Session 3 (May 27, 2026): CR-004 Phase 1 — Foundation Cleanup (IMPLEMENTED)
- **Item 1**: Removed legacy `whatsapp_templates` + `automation_rules` dead surface
  - Deleted 6 legacy endpoints, seeder function, helper function, 6 Pydantic models
  - Removed legacy frontend modals, handlers, state from WhatsAppAutomationContent.jsx
  - Dropped 280 zombie rows (140 templates + 140 rules) from MongoDB
- **Item 2**: Created canonical variables endpoint `GET /api/whatsapp/variables` (10 variables)
  - Both TemplatesPage.jsx and WhatsAppAutomationContent.jsx now fetch from API
- **Item 3**: Fixed `text` mode bug in `build_body_values()` — literal strings now honoured at send time
- All 6 unit tests pass, all 10 acceptance criteria verified
- Status: `cr004_phase_1_complete`

## Core CRM Features
- Login / Register / Demo Login / Forgot Password
- Customer Management, Segments, Lifecycle
- Loyalty Points & Wallet
- Coupons V1-V3-C
- Coupon Analytics Dashboard (Phase 1-4)
- Feedback system
- WhatsApp automation (P1 cleanup done, P2-P9 pending)
- POS integration
- QR Code, Item Analytics, Customer Lifecycle Analytics
- Migration tools, Templates & Message Status

## Backlog / Next Tasks
- **P0 (next)**: CR-004 Phase 2 — Variable <> DB Schema Mapping Layer (owner sign-off needed)
- **P1**: CR-004 Phase 3 — Event Reconciliation
- **P1**: CR-004 Phase 5 — Segment Broadcasts
- **P2**: CR-004 Phase 7 — Message Dashboard Hardening
- **P2**: CR-011 Coupon Optimizer Auto-Suggest
