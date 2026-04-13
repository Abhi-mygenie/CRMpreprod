# MyGenie CRM - PRD

## Problem Statement
CRM application for restaurant owners to manage customers, orders, loyalty points, coupons, and WhatsApp campaigns. Includes syncing customers and orders from a POS system (MyGenie POS).

## Architecture
- **Frontend**: React 19 with Tailwind CSS, Radix UI components, Shadcn UI
- **Backend**: FastAPI with Motor (async MongoDB driver)
- **Database**: MongoDB (external at 52.66.232.149:27017/mygenie)

## Core Features (Implemented)
- Authentication & Authorization (JWT-based)
- Customer Management with QR codes
- Points & Loyalty Program
- Wallet System
- Coupons Management
- Feedback Collection & Analytics
- WhatsApp Integration & Templates
- POS Integration (MyGenie)
- Data Migration Tools (Customer + Order sync)
- Analytics Dashboard
- Customer Self-Service OTP Auth (restaurant-scoped)
- Address Management - Full CRUD via addresses array
- Order delivery_address capture from POS (migration.py)

## Key DB Schema
- `customers`: {id, user_id, name, phone, tier, total_points, addresses: [...], ...}
- `orders`: {id, user_id, customer_id, order_amount, order_type, delivery_address: {...}, items: [...], ...}

## Status: Running
- Backend: https://mygenie-crm-build-1.preview.emergentagent.com/api
- Frontend: https://mygenie-crm-build-1.preview.emergentagent.com

## Roadmap (Future)
- Orders list/detail view per customer (with delivery_address display)
- Top items display per customer
- Order notes view
- City filter to search within addresses array
- Address fields on QR-based Customer Registration page
- WhatsApp campaign integration with customer segments
- Advanced analytics/AI insights
