# MyGenie CRM - Product Requirements Document

## Original Problem Statement
1. Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git main branch
2. React, Python and MongoDB stack
3. Set env variables (external MongoDB at 52.66.232.149)
4. Build and run as-is
5. Plan and implement POS Gateway endpoints
6. Plan and implement Scan & Order endpoints
7. Plan MyGenie POS ↔ CRM integration handshake

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
│   ├── core/           # Auth (JWT/bcrypt/dual POS auth/customer OTP token), DB, Scheduler, WhatsApp, Helpers
│   ├── models/         # Pydantic schemas (Customer, Address, Points, Wallet, Coupons, etc.)
│   ├── routers/        # API routes
│   │   ├── auth.py         # Login (MyGenie SSO + demo), Register, Forgot Password (OTP)
│   │   ├── customers.py    # CRUD, Sync, QR registration, Segments, AI Insights
│   │   ├── points.py       # Earn/Redeem/Expire points, Loyalty settings
│   │   ├── wallet.py       # Credit/Debit wallet
│   │   ├── coupons.py      # Coupon CRUD, Apply/Validate
│   │   ├── feedback.py     # Feedback + Dashboard analytics
│   │   ├── whatsapp.py     # Templates, Automation, Campaigns
│   │   ├── pos.py          # POS Gateway (23 endpoints)
│   │   ├── scan.py         # Scan & Order customer-facing API (22 endpoints)
│   │   ├── analytics.py    # Item analytics, Customer lifecycle
│   │   ├── migration.py    # Data migration
│   │   └── cron.py         # Scheduler admin
│   └── services/       # Analytics aggregation, Feedback analysis
├── frontend/           # React CRM dashboard
└── memory/             # API docs, PRD, Integration guides
```

## Three Auth Systems

| Auth | Who | How | Used for |
|------|-----|-----|----------|
| CRM Staff JWT | Restaurant owner/staff | Login via MyGenie SSO → JWT with `type: "staff"` | CRM dashboard, admin endpoints |
| POS Dual Auth | POS systems | API Key (`X-API-Key`) OR Staff JWT | All `/pos/*` endpoints |
| Customer OTP Token | End customers | OTP verify → JWT with `type: "customer"` | All `/scan/*` endpoints |
| Customer Skip-OTP Token | End customers | Phone + restaurant_id → JWT with `type: "customer"` (no OTP) | All `/scan/*` endpoints (same rights as OTP) |

Token isolation enforced: customer tokens rejected on CRM/POS, staff tokens rejected on scan, POS API keys rejected on scan.

## What's Been Implemented

### April 14, 2026 - Initial Setup
- Cloned repo, configured external MongoDB, installed dependencies
- Both services running successfully

### April 14, 2026 - Section B: POS Gateway (23 endpoints)
- **Auth Refactor** — `verify_pos_auth` dual auth (JWT + API Key)
- **Customer Search** — Lightweight typeahead (B2.2), Full details with loyalty/addresses/orders (B2.3)
- **Address CRUD** — List, Add (dedup), Edit, Delete, Set Default (B4.1-B4.5)
- **Cross-Restaurant Address Lookup** — By phone across all restaurants (B5.1)
- **Notes Aggregation** — Item-level and order-level historical patterns (B10.1-B10.2)
- **Loyalty + Orders** — Summary (B7.2), Order history (B6.3)
- **Coupons** — Validate and Apply with full checks (B8.1-B8.2)
- **Cleanup** — Soft delete (B3.3), Fixed existing endpoints (B2.1, B3.1, B3.2)

### April 14, 2026 - Section C: Scan & Order (22 endpoints)
- **Customer Auth** — OTP login (request/verify/auto-create), Password register/login, Rate limiting, Token isolation
- **Profile** — Get/Update profile, Loyalty summary, Points/Wallet/Order history, Available coupons
- **Addresses** — CRUD with dedup, shared array with POS
- **App Config** — Public read (dual restaurant_id format), CRM admin write
- **Dietary Tags** — Public read, CRM admin write
- **Actions** — Feedback submission, Call waiter, Request bill

### Bugs Fixed
- `$set addresses.$[].is_default` crash when customer has no existing addresses array (both POS and Scan)

### April 14, 2026 - MyGenie Handshake
- `TokenResponse` schema extended with optional `pos_config` field
- `mygenie_login` returns `api_key`, `api_base_url` (from env), and 15 `webhook_endpoints` in login response
- Backwards compatible — `pos_config` is `null` for demo login, frontend ignores it
- Both return paths covered (existing user + new user first login)

### April 14, 2026 - Address Schema Fix
- Fixed `CustomerAddress.pos_address_id` and `zone_id` type: `str` → `object` (existing data has integers, written by scan-and-order app)
- `GET /customers/{id}` and `GET /customers` now correctly return `addresses[]` array (was crashing on Pydantic validation)
- CRM staff can now see customer addresses in API responses

### Test Results
- All 23 POS endpoints verified with real data
- All 22 Scan & Order endpoints verified
- Token isolation confirmed (both directions)
- Zero regression on CRM frontend

### April 19, 2026 - Migration Address Sync + Pagination Fix
- **Customer Migration now syncs `customer_addresses[]`** — MyGenie API sends full address arrays per customer via `customer_addresses` field. Migration now maps each address into CRM `addresses[]` format with `pos_address_id` (MyGenie address `id` → string).
- **Fields mapped during migration**: `pos_address_id`, `address`, `house`, `floor`, `road`, `city`, `pincode`, `latitude`, `longitude`, `contact_person_name`, `contact_person_number`, `dial_code`, `zone_id`, `address_type`, `created_at`, `updated_at`, `is_default` (first address = default).
- **Customer sync pagination fix** — Customer migration was only fetching page 1 (e.g., 11 of 54 customers). Added `while page <= last_page` pagination loop with `?page={page}` param, mirroring the order sync pattern in `migration.py`. All pages now fetched.
- **Cross-Restaurant Address Lookup response expanded** — `/pos/address-lookup` now returns 9 additional fields: `pos_address_id`, `zone_id`, `house`, `floor`, `road`, `contact_person_name`, `contact_person_number`, `dial_code`, `delivery_instructions`.
- **Orphaned dead code cleanup** — Removed unreachable code block at end of `customers.py` (duplicate `Customizations` section after `return`).

### April 20, 2026 - Skip OTP Silent Login
- **New endpoint: `POST /api/scan/auth/skip-otp`** — Silent login without OTP verification. Customer provides phone + restaurant_id, backend finds or auto-creates customer and returns a full customer JWT token. Token has identical rights to OTP-verified token. Used when customer taps "Skip" on the Scan & Order login screen.

### Bugs Fixed (April 19, 2026)
- Customer sync only fetching first page of customers from MyGenie API (pagination missing)
- `customer_addresses` array from MyGenie not being imported during migration (addresses were lost)
- `/pos/address-lookup` response missing `pos_address_id` and 8 other address fields
- Orphaned syntax error in `customers.py` (dead code after `return insights`)

## MyGenie POS ↔ CRM Integration

### Current State (Working)

| Flow | Direction | Status |
|------|-----------|--------|
| Login/SSO | CRM → MyGenie | Working — `mygenie_token` stored on user doc |
| Customer sync (pull) | CRM → MyGenie | Working — batch sync via stored token |
| Customer push | CRM → MyGenie | Working — on create/update |
| Order webhook | MyGenie → CRM | Working — `POST /pos/orders` |
| Customer lookup | MyGenie → CRM | Working — `POST /pos/customer-lookup` |
| Max redeemable | MyGenie → CRM | Working — `POST /pos/max-redeemable` |
| WhatsApp events | MyGenie → CRM | Working — `POST /pos/events` |
| Payment webhook | MyGenie → CRM | **DEPRECATED** — `POST /pos/webhook/payment-received` (missing coupon validations, no item support). Use `/pos/orders` instead. May still be in active use by MyGenie. |

### Phase 1: Handshake (Implemented)

**Done.** Login response includes `pos_config` with `api_key`, `api_base_url`, and 15 webhook endpoint paths. MyGenie captures this on login and auto-configures POS → CRM calls. Backwards compatible — `pos_config` is `null` for demo login.

### Phase 1.5: Webhook Registration (Next after handshake)

**Goal:** CRM knows where MyGenie should send real-time orders/events. MyGenie registers its webhook URL, CRM stores it per restaurant.

**Details to be planned after handshake implementation.**

### Phase 2: Deeper Integration (Parked)

| Item | Description | Status |
|------|-------------|--------|
| Bidirectional customer sync | Real-time both ways (not just batch pull) | Parked — POS has API to fetch from MyGenie already |
| Address sync via API | Scan-and-order app calls CRM endpoints instead of direct MongoDB | Parked — current direct writes work |
| Menu sync | CRM pulls menu data for richer analytics | Parked |
| Payment webhook migration | Migrate MyGenie from `/pos/webhook/payment-received` to `/pos/orders` | Planned — needs MyGenie team coordination |

## API Documentation

| Document | Path | Audience |
|----------|------|----------|
| CRM Full Reference | `/app/memory/API_DOC_CRM_APP.md` | Internal — all 3 sections (CRM, POS, Scan & Order) |
| POS API | `/app/memory/POS_API.md` | POS integration teams (23 endpoints) |
| Scan & Order API | `/app/memory/SCAN_ORDER_API.md` | Frontend/mobile team (23 endpoints) |
| External POS Guide | `/app/memory/EXTERNAL_POS_INTEGRATION_GUIDE.md` | Third-party POS vendors (Petpooja, Ezzo) |
| Other App Data | `/app/memory/API_DOC_OTHER_APP.md` | Internal — data patterns from scan-and-order app |

## Access URLs
- **Frontend**: https://customer-loyalty-11.preview.emergentagent.com
- **Backend API**: https://customer-loyalty-11.preview.emergentagent.com/api
- **Swagger**: https://customer-loyalty-11.preview.emergentagent.com/api/docs

## Prioritized Backlog

### P0 — Next Up
- **Frontend: Address management UI** in CustomerDetailPage — display and manage addresses using existing POS address endpoints (`/pos/customers/{id}/addresses/*`)

### P1 — Near Term
- Payment webhook migration — coordinate with MyGenie to switch from deprecated `/pos/webhook/payment-received` to `/pos/orders`
- OTP delivery via WhatsApp (currently dev mode)
- Webhook registration — CRM stores where MyGenie sends real-time orders (if needed beyond handshake)

### P2 — Later
- Address dedup cleanup on existing data (some customers have 100+ near-duplicates)
- Address cap enforcement (max per customer)
- Bidirectional customer sync (real-time both ways)
- Address sync via API (scan-and-order → CRM endpoints)
- Menu sync from MyGenie

### Parked
- CRM-specific address endpoints (`/customers/{id}/addresses/*`) — POS address endpoints already work for CRM staff via JWT. Only needed if CRM address behavior diverges from POS in future.
- Postman collection / OpenAPI export for POS team
- OAuth2 Client Credentials for external POS (Phase 2 of external POS guide)
- POS Marketplace (Phase 3 of external POS guide)

### Completed (April 19-20, 2026)
- ~~Customer migration address sync~~ — `customer_addresses[]` now fully mapped with `pos_address_id`
- ~~Customer sync pagination~~ — All pages fetched via `?page={page}` loop
- ~~Address lookup response fields~~ — All DB fields now returned in `/pos/address-lookup`
- ~~Skip OTP silent login~~ — `POST /scan/auth/skip-otp` for passwordless login without OTP verification
