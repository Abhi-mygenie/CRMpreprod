# MyGenie CRM - Project Documentation

## Original Problem Statement
Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git (main branch) into /app. Preserve all platform files. Stack: React + Python (FastAPI) + MongoDB. Build as-is with placeholder env variables.

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Shadcn/UI + Craco (path aliases @/)
- **Backend**: FastAPI with modular routers (auth, customers, points, wallet, coupons, feedback, whatsapp, pos, migration, analytics, scan, menu, suggestions, invoices, campaigns)
- **Database**: MongoDB via Motor (async driver)
- **Scheduler**: APScheduler for loyalty jobs and campaign processing

## What's Been Implemented (2026-07-11)
- Pulled all code from CRMpreprod repo (main branch)
- Preserved platform files (.emergent, .env files)
- Added placeholder env variables for all required services (JWT, MyGenie API, Authkey, Meta Graph API, AWS S3, POS logging)
- Installed missing Python packages (APScheduler, openpyxl, qrcode, reportlab, pillow)
- Frontend compiles and serves login page
- Backend starts successfully with all routers loaded

## Key Modules
### Backend Routers
- auth, customers, points, wallet, coupons, feedback, whatsapp, pos, migration, analytics, scan, menu, suggestions, invoices, campaigns, cron

### Frontend Pages
- Login, Register, Dashboard, Customers, CustomerDetail, Segments, Audiences, Campaigns, CampaignWizard, CampaignHistory, Templates, TemplateBuilder, QRCode, Feedback, Coupons, CouponAnalytics, Settings, LoyaltySettings, WhatsAppAutomation, MessageStatus, ItemAnalytics, CustomerLifecycle, Profile, Migration, Wallet, CustomerRegistration

## Environment Variables (Backend)
All placeholder values need to be replaced with actual values:
- MONGO_URL, DB_NAME, CORS_ORIGINS (platform defaults)
- JWT_SECRET
- CAMPAIGN_TIMEZONE (default: Asia/Kolkata)
- MYGENIE_API_URL, MYGENIE_LOGIN_ENDPOINT, MYGENIE_PROFILE_ENDPOINT, MYGENIE_CRM_TOKEN_ENDPOINT
- AUTHKEY_API_URL, AUTHKEY_TEMPLATES_URL, AUTHKEY_SYNC_URL, AUTHKEY_WEBHOOK_SECRET
- META_GRAPH_API_URL
- FRONTEND_URL, CRM_EXTERNAL_URL, PUBLIC_BACKEND_URL
- POS_REQUEST_LOGGING_* (disabled by default)
- AWS_S3_* (for file uploads)

## Prioritized Backlog
- P0: Replace placeholder env variables with actual values
- P0: Connect to remote MongoDB
- P1: Test full auth flow with real MyGenie API
- P1: WhatsApp integration setup
- P2: S3 configuration for file uploads
- P2: Campaign scheduler enablement
