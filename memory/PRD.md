# CRM Preprod - PRD

## Original Problem Statement
Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git from 26-may branch, use remote MongoDB (mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie), build as-is without running testing agent.

## Architecture
- **Frontend**: React 19 with Craco, Tailwind CSS, Radix UI, Recharts, React Router v7
- **Backend**: FastAPI (Python) with Motor (async MongoDB driver), APScheduler
- **Database**: Remote MongoDB at 52.66.232.149 (DB: mygenie)
- **Auth**: JWT-based authentication

## What's Been Implemented

### Session 0 (2026-05-25) — Initial Deploy
- Cloned 26-may branch from GitHub repo
- Configured backend .env with remote MongoDB connection string
- Installed all dependencies, both services running

### Session 1 (2026-05-25) — Seed Data Fix + V3-C UI Wiring
- **Seed data item name fix**: Investigated and fixed 8 SEED_ coupons in R689 DB where item names didn't match actual menu (e.g. food_id 182042 was labeled "Classic Cheese Kunafa" but actual name is "Signature Trio Salankatia"). Updated DB + recreated `/tmp/seed_r689_coupons.py` with correct names.
- **V3-C Every Nth Item UI wiring**: Completed full discovery, planning, and implementation:
  - Enabled "Every Nth Item" tile in production `/coupons` (was "Soon")
  - Added V3-C form: nth number (min 2), benefit type (Free/% Off/Rs. Off), eligible items picker, eligible categories picker, excluded items picker, advanced settings
  - Added `handleSubmit` V3-C payload mapping (offer_type="nth_item")
  - Added `resolveTypeFromCoupon` V3-C detection for edit mode
  - Added `openEdit` V3-C field rehydration
  - Hid generic Discount Rules section for V3-B and V3-C (Q1=A)
  - All verified: create round-trip (11/11 fields), edit rehydration, existing SEED_V3C edit, V1/V2/V3-A/V3-B regression clean
  - Single file changed: `CouponsPage.jsx` (~+110 LOC)
  - No backend, DB, env, or dependency changes

## Core Features (from codebase)
- Login/Register (JWT auth)
- Dashboard, Customer Management, Segments
- Loyalty Points, Wallet, Coupons (V1/V2/V3-A/V3-B/V3-C)
- Feedback, WhatsApp Automation, Templates
- QR Code, Item Analytics, Customer Lifecycle
- POS Integration, Migration tools
- Cron/Scheduler for daily loyalty jobs

## Coupon Admin UI Status
| Phase | Status |
|---|---|
| V1 (order flat/%) | LIVE at /coupons |
| V2 (item/category) | LIVE at /coupons |
| V3-A (Happy Hour) | LIVE at /coupons |
| V3-B (BOGO/BXGY) | LIVE at /coupons |
| V3-C (Every Nth) | LIVE at /coupons (wired this session) |
| Backend combined QA | 211/211 PASS |

## Prioritized Backlog
- P0 (external): POS contract violations (3 blockers — pos_food_id, nested loyalty/coupon fields)
- P1: Remove /coupons-v3-preview page + route (all V3 now wired to production)
- P2: 3 restaurants (R478, R618, R634) need loyalty_enabled toggle
- P2: Menu API token refresh for R689 (expired — owner re-login refreshes)
- P3: Coupon analytics dashboard view
- P3: Duplicate coupon ("clone") feature

## Next Tasks
- Clean up CouponV3Preview.jsx + route from App.js (all V3 types now live)
- Awaiting POS team contract fixes for live end-to-end verification
- Awaiting user instructions for any further changes
