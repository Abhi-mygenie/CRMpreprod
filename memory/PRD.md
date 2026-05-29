# MyGenie CRM - PRD

## Original Problem Statement
Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git, branch 28-may. Wipe local /app, pull remote repo directly into /app. Use remote MongoDB only (mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie). Build the project as-is. No testing agent.

## Architecture
- **Backend**: Python FastAPI (port 8001, supervisor-managed)
- **Frontend**: React with Craco, Tailwind CSS, shadcn/ui components (port 3000, supervisor-managed)
- **Database**: Remote MongoDB at 52.66.232.149:27017 (DB: mygenie)
- **Key libraries**: motor (async MongoDB), APScheduler, recharts, react-router-dom v7, radix-ui, lucide-react

## Core Features (from codebase)
- Auth (Login/Register)
- Customer management & segments
- Loyalty points & wallet
- Coupon system (V1-V3)
- Feedback collection & analytics
- WhatsApp automation & message status
- POS integration
- QR code generation
- Item analytics, customer lifecycle, coupon analytics
- Migration tools
- Menu management & suggestions
- Profile & settings

## What's Been Implemented (2026-05-29)
- Cloned repo (branch 28-may) into /app
- Configured backend .env with remote MongoDB connection
- Configured frontend .env with preview URL
- Installed all backend (pip) and frontend (yarn) dependencies
- Both services running via supervisor
- App loads successfully — login page confirmed via screenshot

## Prioritized Backlog
- No changes requested — project built as-is per instructions

## Next Tasks
- Awaiting user instructions for any modifications or feature additions
