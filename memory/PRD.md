# MyGenie CRM - PRD

## Original Problem Statement
1. Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git from 27-may branch
2. Use remote MongoDB: mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie
3. Build as-is, don't run testing agent
4. User requested CR-003 Phase 3 (custom date picker + CSV export) — already implemented in branch

## Architecture
- **Frontend**: React 19 with Craco, Tailwind CSS, Radix UI, Recharts
- **Backend**: FastAPI (Python) with Motor (async MongoDB driver)
- **Database**: Remote MongoDB at 52.66.232.149:27017/mygenie
- **Auth**: JWT-based authentication

## What's Been Implemented (May 27, 2026)
### Session 1: Repo Setup
- Cloned repo from `27-may` branch into /app
- Configured backend .env with remote MongoDB connection
- Configured frontend .env with Emergent preview URL
- Installed all backend (pip) and frontend (yarn) dependencies
- Both services running successfully via supervisor

### Session 2: CR-003 Phase 3 Verification
- Verified CR-003 Phase 3 features (custom date picker + CSV export) already in codebase
- All backend endpoints working: `/analytics/coupons`, `/analytics/coupons/top`, `/analytics/coupons/export`, `/analytics/coupons/pdf`
- Frontend Coupon Analytics page fully functional with date pills, custom calendar picker, CSV + PDF export
- Login verified with `owner@kunafamahal.com` / `Qplazm@10`

## Core CRM Features (from codebase)
- Login / Register / Demo Login / Forgot Password
- Customer Management, Segments, Lifecycle
- Loyalty Points & Wallet
- Coupons V1-V3-C (Simple, BOGO, Buy X Get Y, Every Nth)
- Coupon Analytics Dashboard (Phase 1-4 implemented)
- Feedback system
- WhatsApp automation
- POS integration
- QR Code generation
- Item Analytics + Customer Lifecycle Analytics
- Migration tools
- Templates & Message Status

## CR-003 Coupon Analytics Dashboard Phases
- Phase 1: Summary cards, scope/offer type charts, special offer cards — ✅ DONE
- Phase 2: Top Coupons Table + Date Range Filter (preset pills) — ✅ DONE
- Phase 3: Custom Date Picker + CSV Export — ✅ DONE (already in 27-may branch)
- Phase 4: ROI scoring + PDF report — ✅ DONE (already in 27-may branch)

## Backlog / Next Tasks
- P0: No pending items — all features deployed
- P1: CR-004 WhatsApp Utility + Marketing Message Integration (discovery phase)
- P1: CR-011 Coupon Optimizer Auto-Suggest (registered, awaiting discovery)
- P2: Scan & Order consumer app (owner scoping)
- P2: Wallet extension with POS contract
