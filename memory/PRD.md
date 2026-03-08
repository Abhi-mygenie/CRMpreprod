
# MyGenie CRM - Product Requirements Document

## Original Problem Statement
1. Pull https://github.com/Abhi-mygenie/CRMpreprod.git code and build it 
2. Use external MongoDB: mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie
3. Make all pages responsive for desktop users

## Tech Stack
- **Frontend**: React 19, Tailwind CSS, Radix UI components
- **Backend**: Python FastAPI, Motor (async MongoDB)
- **Database**: External MongoDB at 52.66.232.149

## What's Been Implemented

### March 8, 2026

#### Initial Setup ✅
- Pulled CRM repository from GitHub
- Connected to external MongoDB database
- Configured environment variables
- Backend and frontend running

#### Responsive Redesign - All Pages ✅

**1. ResponsiveLayout Component (NEW)**
- Desktop sidebar navigation (240px, collapsible to 72px)
- Mobile bottom navigation (unchanged behavior)
- Smooth transitions between states
- All navigation links working

**2. Dashboard Page ✅**
- 6-column grid on desktop for stats
- 3-column grid on mobile
- Section-based organization with headers
- Reusable StatCard components

**3. Customers Page ✅**
- Desktop: Full data table with columns (Customer, Phone, Visits, Spent, Last Visit, Points, Wallet, Tier, Actions)
- Mobile: Card/list view (unchanged)
- Responsive search and filter bar

**4. Message Status Page ✅**
- 5-column stats grid on desktop
- Desktop table view for message logs
- Mobile card view preserved

**5. Templates Page ✅**
- Full width layout on desktop
- Responsive container

**6. Settings Page ✅**
- Full width layout
- Settings cards in responsive grid
- Forms utilizing full width

**7. WhatsApp Automation Page ✅**
- Full width layout
- Back button hidden on desktop (sidebar serves navigation)

**8. Other Pages Updated ✅**
- Coupons Page
- Customer Detail Page
- Feedback Page
- Loyalty Settings Page
- QR Code Page

## Core Features
- Customer Management (CRM)
- Message Status Tracking
- Loyalty & Points System
- Wallet Management
- Coupon System
- Feedback Analytics
- WhatsApp Automation
- QR Code Generation
- Data Migration from POS

## Responsive Breakpoints
- **Mobile**: < 1024px (bottom navigation)
- **Desktop**: >= 1024px (sidebar navigation)
- Sidebar collapse: 240px → 72px (icon only)

## Access
- URL: https://crm-preprod.preview.emergentagent.com
- Demo login available

## Future Enhancements
- [ ] Add more columns to tables on extra-large screens
- [ ] Charts/analytics visualizations for desktop
- [ ] Keyboard shortcuts for power users

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
- ✅ **Message Status Dashboard** - Track WhatsApp delivery status with filters and resend
- ✅ **Dashboard Tabs** - CRM and Messages tabs on main dashboard

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

### Message Status APIs
- GET /api/whatsapp/message-stats - Stats by status
- GET /api/whatsapp/message-logs - Paginated logs with filters
- GET /api/whatsapp/message-filters - Filter options
- POST /api/whatsapp/status-callback - Webhook for AuthKey status updates
- POST /api/whatsapp/resend - Resend failed messages

## UI Updates
- **Dashboard Tabs**: CRM tab (metrics) + Messages tab (delivery status)
- **Message Status Page**: Also accessible at /message-status standalone

## Environment Configuration
- Backend: MONGO_URL, DB_NAME configured for external DB
- Frontend: REACT_APP_BACKEND_URL configured

## Parked Tasks
- Templates page: status/category filters (waiting on AuthKey API update)
- Segment → Campaign rename (discussed, not implemented)

## Next Action Items
- Configure WhatsApp templates in CRM for each POS event
- AuthKey status callback webhook URL configuration

## Backlog
- P0: None
- P1: Meta webhook for template approval status
- P2: Test WhatsApp button on automation page

