# MyGenie CRM - Product Requirements Document

## Original Problem Statement
1. Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git main branch
2. React, Python and MongoDB stack
3. Set env variables (external MongoDB at 52.66.232.149)
4. Build and run as-is

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
│   ├── core/           # Auth (JWT/bcrypt), DB, Scheduler, WhatsApp, Helpers
│   ├── models/         # Pydantic schemas (Customer, Points, Wallet, Coupons, etc.)
│   ├── routers/        # API routes
│   │   ├── auth.py         # Login (MyGenie SSO + demo), Register, Forgot Password (OTP)
│   │   ├── customers.py    # CRUD, Sync from MyGenie, QR registration, Segments, AI Insights
│   │   ├── points.py       # Earn/Redeem/Expire points, Loyalty settings, Birthday/Anniversary bonuses
│   │   ├── wallet.py       # Credit/Debit wallet
│   │   ├── coupons.py      # Coupon CRUD, Apply/Validate
│   │   ├── feedback.py     # Collect & analyze feedback
│   │   ├── whatsapp.py     # Templates, Automation rules, Campaign send
│   │   ├── pos.py          # Order sync from MyGenie POS
│   │   ├── analytics.py    # Dashboard stats, Revenue, Trends
│   │   ├── migration.py    # Data migration utilities
│   │   └── cron.py         # Scheduler admin (view/trigger jobs)
│   └── services/       # Analytics aggregation, Feedback analysis
├── frontend/
│   └── src/
│       ├── contexts/AuthContext.jsx   # Auth state, API client
│       ├── pages/                     # 18+ pages
│       │   ├── LoginPage, RegisterPage
│       │   ├── DashboardPage          # Analytics overview
│       │   ├── CustomersPage          # Customer list with advanced filters
│       │   ├── CustomerDetailPage     # Single customer view + AI insights
│       │   ├── SegmentsPage           # Dynamic customer segments
│       │   ├── TemplatesPage          # WhatsApp message templates
│       │   ├── QRCodePage             # QR for customer self-registration
│       │   ├── FeedbackPage           # Feedback collection & analytics
│       │   ├── CouponsPage            # Coupon management
│       │   ├── WalletPage             # Wallet management
│       │   ├── SettingsPage           # App settings + WhatsApp config
│       │   ├── LoyaltySettingsPage    # Points program configuration
│       │   ├── ItemAnalyticsPage      # Menu item insights
│       │   ├── CustomerLifecyclePage  # Customer journey tracking
│       │   ├── MessageStatusPage      # WhatsApp delivery status
│       │   ├── ProfilePage            # User profile
│       │   └── MigrationPage          # Data migration UI
│       ├── components/
│       │   ├── ui/          # shadcn/Radix primitives
│       │   ├── shared/      # WhatsApp automation content
│       │   └── customers/   # Customer-specific components
│       └── hooks/           # Toast hook
```

## Key Features
1. **Authentication**: MyGenie SSO login (via preprod.mygenie.online API), Demo login, Registration, Forgot password (OTP-based)
2. **Customer Management**: Full CRUD, Advanced filtering (30+ filters), Phone-based dedup, QR self-registration
3. **Customer Sync**: Background sync from MyGenie POS (customers + orders + order items)
4. **Loyalty Points System**: Tier-based earning (Bronze/Silver/Gold/Platinum), Redemption, Expiry, Birthday/Anniversary bonuses
5. **Wallet Management**: Credit/Debit digital wallet per customer
6. **Coupon Management**: Create/Apply coupons with discount rules
7. **Customer Segments**: Dynamic segments with filter-based rules, WhatsApp automation per segment
8. **WhatsApp Integration**: Template management, Automation rules (triggers: new customer, points earned, tier upgrade, etc.), Campaign broadcasting
9. **Analytics Dashboard**: Revenue trends, Customer growth, Tier distribution, Top customers
10. **Item Analytics**: Menu item performance from order data
11. **Customer Lifecycle**: Journey/lifecycle stage tracking
12. **Feedback System**: Collect and analyze customer feedback, NPS scores
13. **POS Integration**: Order sync from MyGenie POS, Order item-level analytics
14. **Scheduled Jobs**: Daily cron for birthday/anniversary bonuses, points expiry reminders
15. **AI Insights**: Per-customer insights (top items, preferred day/time, spending trends, order frequency)

## What's Been Implemented (April 14, 2026)
- Cloned repository from GitHub (main branch)
- Updated backend .env with external MongoDB credentials
- Frontend .env configured with REACT_APP_BACKEND_URL
- Installed all backend Python dependencies (127 packages)
- Installed all frontend Node dependencies (via yarn)
- Both services running successfully via supervisor
- Backend health check: OK
- Frontend compiled and serving login page

## Access URLs
- **Frontend**: https://react-mongo-crm.preview.emergentagent.com
- **Backend API**: https://react-mongo-crm.preview.emergentagent.com/api
- **Health Check**: https://react-mongo-crm.preview.emergentagent.com/api/health

## MongoDB Collections Used
- users, customers, loyalty_settings, points_transactions, wallet_transactions
- coupons, coupon_usage, segments, segment_whatsapp_config
- whatsapp_templates, automation_rules, whatsapp_message_log
- feedback, orders, order_items, otp_tokens

## Status: RUNNING

## Next Action Items
- None requested — app deployed as-is per user instructions

## Backlog / Future Enhancements
- Production WhatsApp OTP delivery (currently testing mode)
- Production deployment configuration
- Rate limiting and security hardening
- Export/reporting features
