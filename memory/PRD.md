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

### April 14, 2026 - Section C: Scan & Order Implementation (Phases 1-8)
- **Phase 1: Customer Token Auth** — `verify_customer_token` with `type: "customer"` claim. Token isolation: customer tokens rejected on CRM/POS endpoints, staff/POS tokens rejected on scan endpoints.
- **Phase 2: OTP Auth (C1.1-C1.2)** — Request OTP (6-digit, 10-min expiry, rate limited 3/5min), Verify OTP (auto-creates customer if new), restaurant_id normalization (short→full format)
- **Phase 3: Profile (C1.3, C2.1-C2.2)** — Get me, Get/Update profile (cannot change phone)
- **Phase 4: Addresses (C3.1-C3.5)** — List, Add (dedup), Update, Delete, Set Default. Shared array with POS. Fixed empty-array `$set` bug.
- **Phase 5: App Config (C4.1-C4.2) + Dietary Tags (C5.1-C5.2)** — Public read, CRM admin write. Dual restaurant_id lookup (short/full).
- **Phase 6: Loyalty/History (C2.3-C2.8)** — Loyalty summary, Points history, Wallet history, Order history, Order detail, Available coupons.
- **Phase 7: Password Auth (C1.4-C1.5)** — Register with password, Login with password. Compatible with existing bcrypt hashes.
- **Phase 8: Actions (C6.1-C6.3)** — Submit feedback, Call waiter, Request bill. Events logged to `pos_event_logs`.

### Test Results — Section C
All 22 scan-and-order endpoints verified:
- Auth: OTP request, verify (auto-create), rate limit (429 on 4th), token isolation (both directions) — all correct
- Password auth: register, login, wrong password, existing bcrypt hash — all working
- Profile: get, update, loyalty summary — all working  
- Addresses: add (with empty-array fix), dedup, update, delete, set default — all working
- App config: public read (short+full ID), admin write (JWT), customer rejected — all correct
- Dietary tags: read existing mappings, empty for unknown — correct
- Actions: feedback, call waiter, request bill — all working
- Regression: CRM health, POS lookup, staff JWT auth — zero breakage
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
- CRM address CRUD (Section A — 4 planned)
- Address dedup cleanup on existing data (some customers have 100+ near-duplicate addresses)
- OTP delivery via WhatsApp (currently dev mode — returns OTP in response)

### Future / Backlog
- B6.2 deprecation header on legacy payment webhook
- Address cap enforcement (max per customer)
- Customer app config endpoints (C4)
- Dietary tags endpoints (C5)
- Customer OTP auth endpoints (C1)
