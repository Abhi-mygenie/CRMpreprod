# CRM Preprod - DinePoints Loyalty & CRM

## Original Problem Statement
- Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git from 24-may branch
- Use external MongoDB: mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie
- Build as-is, no testing agent

## Architecture
- **Frontend**: React 19 with CRACO, Tailwind CSS, Shadcn UI, React Router
- **Backend**: FastAPI with Motor (async MongoDB), APScheduler
- **Database**: External MongoDB (mygenie) at 52.66.232.149

## What's Been Implemented (May 24, 2026)
- Cloned 24-may branch and deployed all files to /app
- Updated backend .env with external MongoDB connection
- Installed all Python & Node dependencies
- Both frontend and backend services running successfully
- API health check passing, frontend rendering login page
- **CR-001C-L L4 Cron-Only (2026-05-24):** Birthday + anniversary bonus parity — `$inc total_points_earned`, tier recompute (upgrade-only), `loyalty_enabled` kill-switch, atomic `$inc`. 17/17 QA PASS. Admin redeem parked.

## Core Features (from repo)
- Auth (Login/Register/Demo)
- Customer management with segments
- Loyalty points system
- Wallet & Coupons
- Feedback collection & analytics
- WhatsApp automation
- QR code generation
- POS integration
- Migration tools
- Item analytics
- Customer lifecycle tracking

## Backlog / Next Tasks
- P0: POS team to send `used_loyalty_point` + actual `order_amount` in final `/api/pos/orders` payload for real-time loyalty redemption verification
- P1: Admin/manual redeem counter parity (PARKED — 7 defects documented, later sprint)
- P2: End-to-end testing of all routes
- P2: L5 cleanup (dead code, orphaned PT rows, alias retirement)
