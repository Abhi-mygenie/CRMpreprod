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

---

## Current Blocker Before Final Loyalty QA

**Status:** `cr001c_loyalty_waiting_pos_loyalty_points_key_for_final_realtime_redemption_qa`

Final realtime redemption QA is blocked until POS sends a loyalty-points-used key in the final `POST /api/pos/orders` payload.

**Accepted keys (any one):**
- `loyalty_points_used` (canonical)
- `used_loyalty_point` (POS legacy singular, accepted)
- `used_loyalty_points` (POS legacy plural, accepted)

**Required final payload minimum:**
- `cust_mobile` or resolvable customer reference
- `order_id`
- `order_amount` (actual bill total, not 0)
- One of the loyalty keys above with a positive integer value
- `loyalty_discount` (optional, CRM recomputes)
- `loyalty_idempotency_key` (optional, CRM derives from order_id if absent)

**CRM behavior already implemented and QA-verified (52/52 + 17/17):**
- Redeems only when final payload contains loyalty points used
- Does not redeem on POS Apply/Redeem click
- Accepts aliases and maps to canonical `loyalty_points_used`
- Decrements `customer.total_points`
- Increments `customer.total_points_redeemed`
- Creates redeem `points_transactions` row with full audit fields
- Earns on net amount after redemption (Q-CORR-3)
- Prevents duplicate redemption using idempotency (Q-CORR-4)
- L4 cron bonuses increment `total_points_earned` and recompute tier

**Recommended next QA:** Once POS sends the key, run CR-001C-LR Realtime Order Redemption Verification.
**Target status after real order verification:** `cr001c_lr_realtime_order_redemption_verified`
