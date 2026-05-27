# MyGenie CRM - PRD

## Architecture
- **Frontend**: React 19 + Craco + Tailwind CSS + Radix UI + Recharts
- **Backend**: FastAPI (Python) with Motor (async MongoDB driver) + ReportLab (PDF)
- **Database**: External MongoDB at 52.66.232.149:27017/mygenie

## What's Been Implemented

### CR-003 Phase 3 — Custom Date Picker + CSV Export + PDF Report
**Implemented:** 2026-05-27 · **Owner Verified:** 2026-05-27
- Custom date picker, branded PDF report, CSV export

### CR-003 Phase 4 — Coupon ROI Score
**Implemented:** 2026-05-27 · **Owner Verified (Smoke Test):** 2026-05-27
- 5th summary card (ROI Score), ROI insight banner with basket lift, per-coupon ROI column in table
- ROI added to CSV export (Gross Revenue, ROI, ROI Label columns — total 13 cols)
- ROI added to PDF report (5th card, banner, ROI column with color coding)
- Formula: ROI = Gross Revenue / Discount = SUM(order_total + coupon_discount) / SUM(coupon_discount)

### CR-011 Coupon Optimizer — Discovery Registered
**Discovery Doc:** 2026-05-27 · **Owner Verified (Doc Review):** 2026-05-27
- Auto-suggest discount adjustments based on ROI bands
- Status: Registered. Awaiting discovery session before implementation.

## CR-003 Phase History
- Phase 1: Summary cards + charts + special offer cards (QA Passed)
- Phase 2: Date filter pills + Top Coupons table (QA Passed)
- Phase 3: Custom date picker + CSV + PDF (Owner Verified)
- Phase 4: Coupon ROI Score + ROI in exports (Owner Verified)

## Backlog
- **P1**: CR-011 Coupon Optimizer — Discovery session + implementation
- **P1**: CR-004 WhatsApp Utility + Marketing Message Integration
  - Phase 0 Discovery — ✅ Complete (2026-05-27)
    - Main report + Addendum A (Variables / Legacy / Wired) + Addendum B (Message Dashboard)
  - Phase 1 Foundation Cleanup — ✅ Planning signed off by owner 2026-05-27, awaiting implementation kickoff
    - `planning/CR_004_PHASE_1_FOUNDATION_CLEANUP_PLANNING.md`
    - Decisions: D-1 ✅ scope locked · D-2 A (honour text mode) · D-3 immediate drop · D-4 keep 10 vars · D-5 testing_agent_v3_fork override for P1
  - Phase 2 Variable ↔ DB Schema Mapping Layer — 📝 Planning drafted (pickup-ready), awaiting owner sign-off
    - `planning/CR_004_PHASE_2_VARIABLE_DB_MAPPING_PLANNING.md`
  - Phases 3-9 — Scoped at broader level, not yet planned in detail

## Testing Constraint
User explicitly instructed: **DO NOT run testing agent**. Manual testing only (curl, python scripts, screenshots, PDF analyzer).
