# MyGenie CRM - Product Requirements Document

## Original Problem Statement
1. Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git main branch
2. React, Python and MongoDB stack
3. Set env variables (external MongoDB at 52.66.232.149)
4. Build and run as-is
5. Plan and implement POS Gateway endpoints

## Project Overview
MyGenie CRM is a full-featured Customer Relationship Management platform with a loyalty program engine, built for restaurant businesses. It integrates with the MyGenie POS/ordering platform for customer data sync, WhatsApp messaging automation, and order analytics.

## Tech Stack
- **Frontend**: React 19, TailwindCSS, Radix UI (shadcn), Craco, Recharts, Sonner
- **Backend**: FastAPI (Python), Motor (async MongoDB), APScheduler
- **Database**: MongoDB (external: 52.66.232.149, DB: mygenie)
- **External APIs**: MyGenie POS API (preprod.mygenie.online), WhatsApp (Authkey)

## Architecture
```
/app/
├── backend/
│   ├── core/           # Auth (JWT/bcrypt/dual POS auth), DB, Scheduler, WhatsApp, Helpers
│   ├── models/         # Pydantic schemas (Customer, Address, Points, Wallet, Coupons, etc.)
│   ├── routers/        # API routes
│   │   ├── auth.py         # Login (MyGenie SSO + demo), Register, Forgot Password (OTP)
│   │   ├── customers.py    # CRUD, Sync, QR registration, Segments, AI Insights
│   │   ├── points.py       # Earn/Redeem/Expire points, Loyalty settings
│   │   ├── wallet.py       # Credit/Debit wallet
│   │   ├── coupons.py      # Coupon CRUD, Apply/Validate
│   │   ├── feedback.py     # Feedback + Dashboard analytics
│   │   ├── whatsapp.py     # Templates, Automation, Campaigns
│   │   ├── pos.py          # POS Gateway (ALL new endpoints here)
│   │   ├── analytics.py    # Item analytics, Customer lifecycle
│   │   ├── migration.py    # Data migration
│   │   └── cron.py         # Scheduler admin
│   └── services/       # Analytics aggregation, Feedback analysis
├── frontend/           # React CRM dashboard
└── memory/             # API docs, PRD
```

## What's Been Implemented

### April 14, 2026 - Initial Setup
- Cloned repo, configured external MongoDB, installed dependencies
- Both services running successfully

### April 14, 2026 - POS Gateway Implementation (Phases 1-8)
- **Phase 1: Auth Refactor** — `verify_pos_auth` dual auth (JWT + API Key) on all POS endpoints
- **Phase 2: Address CRUD** — B4.1-B4.5 (List, Add, Edit, Delete, Set Default) with dedup
- **Phase 3: Fix Existing** — B2.1 (addresses in lookup), B3.1/B3.2 (accept addresses in create/update)
- **Phase 4: Customer Search** — B2.2 (lightweight typeahead), B2.3 (full details with loyalty + orders)
- **Phase 5: Notes Aggregation** — B10.1 (item-level notes), B10.2 (order-level notes) with case-insensitive grouping
- **Phase 6: Loyalty + Orders** — B7.2 (loyalty summary), B6.3 (order history)
- **Phase 7: Coupons** — B8.1 (validate), B8.2 (apply) with full checks
- **Phase 8: Cleanup** — B3.3 (soft delete), B5.1 (cross-restaurant address lookup)

### Test Results
All 28 POS endpoints verified:
- Auth: API Key, JWT, no auth, invalid key — all correct
- Address CRUD: add, dedup, update, set default, delete — all working
- Search: name partial, phone partial — both working
- Full details: loyalty computed fields, addresses, recent orders — all present
- Notes: item-level and order-level aggregation — working with real data
- Cross-restaurant: address lookup by phone — deduped, with source restaurant
- Coupons: validate/apply with full checks — working
- Soft delete: customer excluded from search — confirmed
- CRM frontend: no regression — login page loads correctly

## API Documentation
See `/app/memory/API_DOC_CRM_APP.md` for complete endpoint listing (3 sections: CRM, POS, Scan & Order)
See `/app/memory/API_DOC_OTHER_APP.md` for scan-and-order app data patterns

## Access URLs
- **Frontend**: https://react-mongo-crm.preview.emergentagent.com
- **Backend API**: https://react-mongo-crm.preview.emergentagent.com/api

## Prioritized Backlog

### P0 (Done)
- POS auth refactor
- Address CRUD
- Customer search (light + full)
- Fix existing endpoints

### P1 (Done)
- Notes aggregation
- Loyalty summary
- Order history
- Coupon validate/apply

### P2 (Done)
- Cross-restaurant address lookup
- Soft delete
- Deprecated webhook flagging

### P2 (Remaining)
- Scan & Order endpoints (Section C — 22 planned)
- CRM address CRUD (Section A — 4 planned)
- Address dedup cleanup on existing data (some customers have 100+ near-duplicate addresses)

### Future / Backlog
- B6.2 deprecation header on legacy payment webhook
- Address cap enforcement (max per customer)
- Customer app config endpoints (C4)
- Dietary tags endpoints (C5)
- Customer OTP auth endpoints (C1)
