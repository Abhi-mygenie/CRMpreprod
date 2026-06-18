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

### June 17, 2026 — Session 2: Bug Fixes + Discovery + Security
- ✅ BUG-005 FIXED: Campaign filter → `db.campaigns` (was `db.segments`)
- ✅ BUG-006 FIXED: Campaign messages log correct `campaign_id` + backward-compatible filter
- ✅ BUG-007 FIXED: Template preview `\n` normalization across 3 files
- ✅ CR-026 registered (Campaign "View Messages" deep-link, P3)
- ✅ Full project discovery: `MYGENIE_CRM_PROJECT_SPECIFIC_ADDENDUM.md` (15 sections)
- ✅ Agent system prompt: `control/MYGENIE_CRM_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` (16 sections)
- ✅ Security audit: `.gitignore.prod` created (14 risk areas)
- ✅ Added `CAMPAIGN_SCHEDULER_ENABLED=false` to backend/.env
- ✅ POS Hotel Folio contract HTML: `cr014_hotel_folio_contract.html`
- ✅ Session handover: `crm_roi_sprint/handoff/SESSION_2026_06_17_HANDOVER.md`

## Core Modules
Auth, Customers, Segments, Loyalty/Points, Coupons (V1/V2/V3), WhatsApp Automation, Template Builder, Campaigns, POS Gateway, Feedback, Analytics, Invoices, Wallet (placeholder), Menu, Suggestions, Scan & Order, Migration, QR Code, Settings, Scheduler

## Open Items
- **0 open bugs** (BUG-001 through BUG-007 all FIXED)
- **6 open CRs**: CR-014 (POS blocker), CR-023 (owner blocker), CR-024 (env flag), CR-016 (deferred), CR-025 (owner Q&A), CR-026 (backlog)
- All code work complete — every open CR blocked on external input

## Key Documents
- `memory/control/MYGENIE_CRM_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` — Agent operating guide
- `memory/MYGENIE_CRM_PROJECT_SPECIFIC_ADDENDUM.md` — Full project discovery
- `memory/CR_STATUS_DASHBOARD.md` — Master CR tracker (26 CRs)
- `memory/BUG_REGISTRY_CAMPAIGNS.md` — Bug tracker (7 bugs, all fixed)
- `memory/DECISIONS_LOG.md` — Owner-locked decisions
- `memory/crm/crm_roi_sprint/handoff/SESSION_2026_06_17_HANDOVER.md` — This session's handover
- `.gitignore.prod` — Production deployment exclusions
