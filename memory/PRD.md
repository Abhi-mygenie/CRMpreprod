# MyGenie CRM - PRD

## Problem Statement
CRM application for restaurant owners to manage customers, orders, loyalty points, coupons, and WhatsApp campaigns. Includes syncing customers and orders from a POS system (MyGenie POS).

## Architecture
- **Frontend**: React 19 with Tailwind CSS, Radix UI components, Shadcn UI
- **Backend**: FastAPI with Motor (async MongoDB driver)
- **Database**: MongoDB (external at 52.66.232.149:27017/mygenie)

## Core Features
- Authentication & Authorization (JWT-based)
- Customer Management with QR codes
- Points & Loyalty Program
- Wallet System
- Coupons Management
- Feedback Collection & Analytics
- WhatsApp Integration & Templates
- POS Integration (MyGenie)
- Data Migration Tools
- Analytics Dashboard
- Customer Self-Service OTP Auth (restaurant-scoped)
- **Address Management (NEW)** - Full CRUD via addresses array

## What's Been Implemented

### Backend (Completed)
- Cloned CRMpreprod repository from dev branch
- Configured MongoDB connection to external server
- Customer schema supports both legacy flat address fields AND new `addresses` array
- Address CRUD endpoints: GET/POST/PUT/DELETE /api/customers/{id}/addresses
- Set default address: POST /api/customers/{id}/addresses/{address_id}/set-default
- Customer Self-Service OTP endpoints with restaurant-scoped user_id
- POS Gateway webhook handlers for address array mapping
- Address utility functions in /app/backend/core/address_utils.py
- API Documentation generated at /app/memory/API_DOCUMENTATION.md

### Frontend (Completed - Feb 2026)
- **CustomerDetailPage**: Added "Addresses" tab alongside Points and Wallet tabs
  - Lists all addresses with default badge, edit/delete/set-default buttons
  - Add Address modal with full form (type, address, house, floor, road, city, state, pincode, country, contact person, delivery instructions)
  - Edit Address modal with pre-filled data
  - Delete address with confirmation
  - Set default address with toast feedback
- **CustomersPage Add Modal**: After creating customer, also creates address via CRUD API if address fields are filled
- **CustomersPage Edit Modal**: Replaced flat address fields with addresses array summary + "Manage addresses" link to detail page
- **CustomerDetailPage Edit Modal**: Shows addresses summary (read-only, links to Addresses tab for management)

## Tech Stack
- React 19, Tailwind CSS, Radix UI, Recharts, Shadcn UI
- FastAPI, APScheduler, Motor (MongoDB)
- Capacitor for mobile support

## Key DB Schema
- `users`: {email, password, restaurant_name, phone, ...}
- `customers`: {id, user_id, name, phone, tier, total_points, addresses: [{id, pos_address_id, address_type, address, city, pincode, is_default, ...}], ...}
- `customer_otps`: {phone, otp, customer_id, user_id, expires_at}
- `orders`, `points_transactions`, `wallet_transactions`, `coupons`, `segments`, etc.

## Key API Endpoints
- Auth: POST /api/auth/login, POST /api/auth/register
- Customers: GET/POST/PUT/DELETE /api/customers
- Address CRUD: GET/POST/PUT/DELETE /api/customers/{id}/addresses
- Set Default: POST /api/customers/{id}/addresses/{address_id}/set-default
- Customer Self-Service: POST /api/customer/send-otp, POST /api/customer/verify-otp
- Dashboard: GET /api/analytics/dashboard
- Loyalty: GET/PUT /api/loyalty/settings

## Pending Issues
- Order Migration API from POS lacks full delivery address (BLOCKED - waiting POS team)
- City filter in backend still uses flat `city` field (addresses array not queried)

## P1/Future Tasks
- Implement Order Sync address mapping once POS team updates webhook
- Update city filter to also search within addresses array
- Customer Registration page (QR-based) - could add address fields

## Status: Running
- Backend: https://mygenie-crm-build-1.preview.emergentagent.com/api
- Frontend: https://mygenie-crm-build-1.preview.emergentagent.com
