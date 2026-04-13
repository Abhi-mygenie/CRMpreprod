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
- Address Management - Full CRUD via addresses array
- Order delivery address capture from POS

## What's Been Implemented

### Backend
- Customer schema supports `addresses` array with full CRUD endpoints
- Address CRUD: GET/POST/PUT/DELETE /api/customers/{id}/addresses
- Set default address: POST /api/customers/{id}/addresses/{address_id}/set-default
- Customer Self-Service OTP endpoints with restaurant-scoped user_id
- POS Gateway webhook handlers for address array mapping
- **Order migration now captures `delivery_address` from POS orders** (Feb 2026)

### Frontend (Feb 2026)
- CustomerDetailPage: "Addresses" tab with full CRUD (add/edit/delete/set-default)
- CustomersPage Add Modal: Creates addresses via CRUD API after customer creation
- CustomersPage Edit Modal: Shows addresses array summary with "Manage addresses" link

## Key DB Schema
- `customers`: {id, user_id, name, phone, tier, total_points, addresses: [{id, pos_address_id, address_type, address, city, pincode, is_default, ...}], ...}
- `orders`: {id, user_id, customer_id, order_amount, order_type, delivery_address: {address, pincode, house, contact_person_name, ...}, ...}

## Completed Tasks
- P0: Frontend address array migration (DONE, tested)
- P1: Order delivery_address capture in migration.py (DONE - one-line fix)

## Pending/Future Tasks
- P2: Update backend city filter to search within addresses array
- P2: Add address fields to QR-based Customer Registration page
- P2: Frontend display of delivery_address on order detail views
- WhatsApp campaign integration with customer segments
- Advanced analytics/AI insights improvements

## Status: Running
- Backend: https://mygenie-crm-build-1.preview.emergentagent.com/api
- Frontend: https://mygenie-crm-build-1.preview.emergentagent.com
