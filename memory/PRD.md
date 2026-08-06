# MyGenie CRM — PRD

## Source
- Repo: https://github.com/Abhi-mygenie/CRMpreprod.git (main branch)
- Pulled: 2026-08-06

## Architecture
- **Frontend**: React 19, Tailwind CSS, shadcn/ui, react-router-dom v7, recharts, framer-motion
- **Backend**: FastAPI (Python), Motor (async MongoDB), APScheduler, JWT auth
- **Database**: MongoDB @ 52.66.232.149 / mygenie DB (remote)
- **Storage**: AWS S3 (mygenie-prod, ap-south-1)
- **Integrations**: MyGenie API (preprod.mygenie.online), AuthKey (WhatsApp), Meta Graph API

## What's Been Implemented (from repo)
- Full CRM for restaurant/hospitality vertical
- Authentication (JWT, MyGenie vendor employee login)
- Customer management (list, detail, segments, QR codes, lifecycle)
- Loyalty & Points system
- Wallet management
- Coupon engine (create, analytics, preview)
- WhatsApp campaign builder (templates, media headers, variables)
- Campaign wizard + history + audience builder
- Feedback & analytics
- Menu management
- Invoice generation (food, hotel room, hotel folio templates)
- POS integration + request logging middleware
- Migration tools (customer import/export)
- Cron/scheduler (loyalty jobs, campaign processor)
- AWS S3 media upload
- PDF report generation (weasyprint, reportlab)

## Pages
LoginPage, DashboardPage, CustomersPage, CustomerDetailPage, CustomerRegistrationPage,
CustomerLifecyclePage, SegmentsPage, AudiencesPage, WalletPage, CouponsPage, CouponAnalyticsPage,
CouponV3Preview, FeedbackPage, TemplatesPage, TemplateBuilderPage, CampaignsPage,
CampaignWizardPage, CampaignHistoryPage, MessageStatusPage, LoyaltySettingsPage,
SettingsPage, ProfilePage, QRCodePage, ItemAnalyticsPage, MigrationPage, RegisterPage

## Environment
- Backend .env: all vars set (MONGO_URL, DB_NAME, AWS, MyGenie API, AuthKey, Meta, JWT, etc.)
- Frontend .env: REACT_APP_BACKEND_URL=https://mygenie-crm-preview-2.preview.emergentagent.com

## Status
- Backend: Running on port 8001, health check passing
- Frontend: Running on port 3000, login page rendering
