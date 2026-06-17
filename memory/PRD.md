# MyGenie CRM - PRD

## Original Problem Statement
- Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git branch `17-june`
- Wipe local /app and pull remote directly
- Use remote MongoDB: `mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie`
- Build as-is, no testing agent

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Radix UI + Recharts (CRA with craco)
- **Backend**: FastAPI (Python) with Motor (async MongoDB driver)
- **Database**: Remote MongoDB at `52.66.232.149:27017/mygenie`
- **Scheduler**: APScheduler for loyalty cron jobs and campaign processing

## What's Been Implemented

### June 17, 2026 — Session 1: Repo Bootstrap
- ✅ Cloned repo from `17-june` branch into /app
- ✅ Configured remote MongoDB connection
- ✅ Installed backend (pip) and frontend (yarn) dependencies
- ✅ Backend running on port 8001, Frontend on port 3000
- ✅ Health check verified: API responsive
- ✅ Frontend compiling and rendering login page

### June 17, 2026 — Session 2: Bug Investigation & Fixes
- ✅ Investigated BUG-001 through BUG-004 (all pre-fixed in 17-june branch)
- ✅ Discovered & registered BUG-005, BUG-006, BUG-007
- ✅ **BUG-005 FIXED**: Campaign filter in Message Status now queries `db.campaigns` (was `db.segments`)
- ✅ **BUG-006 FIXED**: Campaign messages now log `campaign_id=campaign_id` (was `run_id`). Backward-compatible `$or` filter matches both old and new data. `reference_id` now stores `run_id` for audit trail.
- ✅ **BUG-007 FIXED**: Template previews now render proper line breaks (literal `\n` → actual newlines) across all 3 pages (Templates, Campaign Wizard, Automation)

## Core Modules (from repo)
- Auth, Customers, Points, Wallet, Coupons, Feedback
- WhatsApp integration, POS, Migration, Analytics
- Scan, Menu, Suggestions, Invoices, Campaigns
- Loyalty jobs, Campaign scheduler

## Bug Registry
See `/app/memory/BUG_REGISTRY_CAMPAIGNS.md` — 7 bugs registered, all 7 FIXED.

## Backlog / Next Steps
- P0: None (all reported bugs fixed)
- P1: Live verification of campaign filter with actual campaign data
- P2: Any additional feature additions as directed by user
