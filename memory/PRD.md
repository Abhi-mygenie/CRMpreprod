# CRM Preprod Application - PRD

## Original Problem Statement
1. Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git
2. Use remote MongoDB: mongodb://mygenie_admin:***@52.66.232.149:27017/mygenie
3. Add Item Analytics Dashboard to track item performance and customer repeat behavior

## Architecture
- **Frontend**: React 19 with Tailwind CSS, Radix UI components
- **Backend**: FastAPI with Motor (async MongoDB driver)
- **Database**: Remote MongoDB (52.66.232.149:27017/mygenie)

## What's Been Implemented

### Session 1 (2026-03-10)
- ✅ Cloned repository from GitHub
- ✅ Configured remote MongoDB connection
- ✅ Installed all dependencies
- ✅ Services running via supervisor

### Session 2 (2026-03-10) - Item Analytics Dashboard
- ✅ Created `/app/backend/routers/analytics.py` with item-performance endpoint
- ✅ Created `/app/frontend/src/pages/ItemAnalyticsPage.jsx`
- ✅ Added route `/item-analytics` to App.js
- ✅ Added "Item Analytics" to sidebar navigation

#### Item Analytics Features:
- Summary cards: Total Items, Avg Repeat Rate, High Performers, Categories
- Filters: Time Period (7d/30d/90d/all), Category, Search
- Sortable table columns: Item, Total Orders, Repeat Orders, Repeat Rate (%), Unique Customers, Return Visits
- Color-coded repeat rate badges (green ≥50%, blue ≥40%, yellow ≥30%)
- Export to CSV functionality
- Mobile responsive card view

## Core Features (from codebase)
- Customer Management
- Segments/Customer Segmentation
- **Item Analytics** (NEW)
- Templates Management
- QR Code Generation
- Feedback System
- Coupons Management
- Loyalty Program Settings
- WhatsApp Automation
- Message Status Tracking
- POS Integration

## User Personas
- Restaurant Owners (manage loyalty programs, analyze item performance)
- Restaurant Staff (process transactions)
- Customers (via registration pages)

## Prioritized Backlog
- P0: Application running with Item Analytics ✅
- P1: Additional analytics (customer lifecycle, cohort analysis)
- P2: AI-powered recommendations based on item performance

## Next Tasks
- Test category filtering
- Add drill-down to see which customers ordered specific items
- Trend sparklines for items over time
