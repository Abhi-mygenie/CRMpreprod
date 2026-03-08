# MyGenie CRM - Product Requirements Document

## Original Problem Statement
1. Pull https://github.com/Abhi-mygenie/CRMpreprod.git code and build it 
2. Use external MongoDB: mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie

## Tech Stack
- **Frontend**: React 19, Tailwind CSS, Radix UI components
- **Backend**: Python FastAPI, Motor (async MongoDB)
- **Database**: External MongoDB at 52.66.232.149

## What's Been Implemented

### March 8, 2026
1. **Initial Setup**
   - Pulled CRM repository from GitHub
   - Connected to external MongoDB database
   - Configured environment variables
   - Backend and frontend running

2. **Dashboard Responsive Redesign**
   - Created new `ResponsiveLayout` component with:
     - Desktop sidebar navigation (240px, collapsible to 72px)
     - Mobile bottom navigation (unchanged)
     - Smooth transitions between states
   - Updated `DashboardPage` to be fully responsive:
     - 6-column grid on desktop (lg breakpoint)
     - 3-column grid on mobile (unchanged)
     - Section-based organization with headers
     - Reusable StatCard components
   - Added responsive CSS styles in App.css

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

## Pages in the App
1. Dashboard (responsive ✅)
2. Customers
3. Customer Detail
4. Segments
5. Templates
6. QR Code
7. Feedback
8. Coupons
9. Settings
10. Loyalty Settings
11. WhatsApp Automation
12. Message Status

## Backlog - Responsive Updates Needed
- [ ] Customers Page
- [ ] Customer Detail Page
- [ ] Segments Page
- [ ] Templates Page
- [ ] QR Code Page
- [ ] Feedback Page
- [ ] Coupons Page
- [ ] Settings Page
- [ ] Loyalty Settings Page
- [ ] WhatsApp Automation Page
- [ ] Message Status Page

## Access
- URL: https://crm-preprod.preview.emergentagent.com
- Demo login available
