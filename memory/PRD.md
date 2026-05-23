# MyGenie CRM - PRD & Project Status

## Original Problem Statement
- Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git from `23-may` branch
- Use external MongoDB: `mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie`
- Build as-is without modifications

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Radix UI + shadcn/ui (via Craco/CRA)
- **Backend**: FastAPI (Python) with Motor (async MongoDB driver)
- **Database**: External MongoDB at `52.66.232.149:27017/mygenie`
- **Auth**: JWT-based authentication with MyGenie API integration

## What's Been Implemented (2026-05-23)
- Cloned full codebase from `23-may` branch
- Configured backend `.env` with external MongoDB connection
- Installed all backend Python dependencies
- Installed all frontend Node.js dependencies via yarn
- Both services running successfully via supervisor
- Backend API health check passing
- Frontend login page rendering correctly

## CR-001C-L (Loyalty) Status Updates (2026-05-23)

### L3 Real Migration Validation — CLOSED in preview
- **Status:** `cr001c_loyalty_l3_real_migration_validated_in_preview`
- **BUG-L3-001:** CLOSED — 28 expired PT rows correctly pre-marked after fix + owner re-migration on Jeh's Nest
- **R3 verification results:** 8/8 checks pass. 209 customers, 233 orders, 98 PT earn rows (28 expired/70 active). `total_points(379) = earned(753) − expired(374) − redeemed(0)`. All customer counters reconcile 209/209.
- **Report:** `/app/memory/crm/crm_1_0/qa/CR_001C_L_LOYALTY_L3_REAL_MIGRATION_VERIFICATION_REPORT_R3.md`
- **Non-blocking observations:** 98 orphaned PT rows from previous migration (cosmetic, OBS-R3-001); wallet balance restored to MyGenie values for 4 customers (OBS-R3-002, out of Loyalty scope)

### Related statuses (unchanged)
- LX-A: `cr001c_lx_a_loyalty_pos_contract_patched_qa_passed_in_preview`
- LF-MERGE: `cr001cl_lf_merge_complete_qa_passed_in_preview`

## Core Features (from codebase)
- User authentication (login, register, demo login, forgot password)
- Customer management (list, detail, segments, QR codes)
- Loyalty points system
- Wallet functionality
- Coupons management
- Feedback collection & analytics
- WhatsApp automation & templates
- POS integration
- Data migration tools
- Item analytics & customer lifecycle tracking
- Message status tracking

## Backlog / Next Tasks
- **P0:** L4 — Manual redeem + birthday/anniversary cron parity (awaiting owner go-ahead)
- **P1:** L5 — Dead-code cleanup, orphaned PT row cleanup, `loyalty_clean_slate_recalc` field removal
- **P2:** CR-001C-C (Coupon) — not started
- **P2:** CR-001C-W (Wallet) — not started
- **P3:** OBS-R3-001 — Clean up orphaned PT rows from Revert regex gap
- **P3:** OBS-R3-002 — Investigate wallet value restoration behavior in re-sync path
