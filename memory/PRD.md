# MyGenie CRM V1 - Project Documentation

## Original Problem Statement
1. Pull and build code from https://github.com/Abhi-mygenie/CRMV1.git
2. Connect to external MongoDB: mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie

## Architecture
- **Frontend**: React 19 with Tailwind CSS, running on port 3000
- **Backend**: FastAPI (Python) running on port 8001
- **Database**: External MongoDB at 52.66.232.149:27017/mygenie

## What's Been Implemented (March 8, 2026)
- ✅ Cloned GitHub repository CRMV1
- ✅ Configured external MongoDB connection
- ✅ Set up environment files (backend/.env, frontend/.env)
- ✅ Installed all dependencies
- ✅ Verified all APIs working with external database
- ✅ Tested login, dashboard, customers pages
- ✅ **POS Events Webhook** - Single endpoint for all POS WhatsApp triggers

## Core Features (Existing)
- Authentication (Demo login, JWT-based)
- Customer Management (55 customers, loyalty tiers)
- Dashboard Analytics
- Points/Loyalty System
- Wallet System
- Coupons Management
- Feedback System
- WhatsApp Automation
- QR Code Generation
- Templates Management

## New API Endpoints (March 8, 2026)
### POST /api/pos/events
Single webhook for POS to trigger WhatsApp messages.
- **Auth**: X-API-Key header
- **Events**: new_order_customer, new_order_outlet, order_confirmed, order_ready_customer, item_ready, order_served, item_served, order_ready_delivery, order_dispatched, send_bill_manual, send_bill_auto
- **Flow**: Validates API key → Checks trigger is ACTIVE → Looks up customer → Sends WhatsApp → Logs event
- **Docs**: /app/docs/POS_EVENTS_API.md

## Environment Configuration
- Backend: MONGO_URL, DB_NAME configured for external DB
- Frontend: REACT_APP_BACKEND_URL configured

## Parked Tasks
- Templates page: status/category filters (waiting on AuthKey API update)

## Next Action Items
- Configure WhatsApp templates in CRM for each POS event
- Webhook URL for Meta template status updates

## Backlog
- P0: None
- P1: Meta webhook for template approval status
- P2: Test WhatsApp button on automation page
