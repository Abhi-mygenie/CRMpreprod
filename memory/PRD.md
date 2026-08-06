# MyGenie CRM - Project PRD

## Source
- Repo: https://github.com/Abhi-mygenie/CRMpreprod.git (main branch)
- Pulled: 2026-08-06

## Architecture
- **Frontend**: React (CRA + CRACO), Tailwind CSS, Shadcn UI, React Router v7
- **Backend**: FastAPI (Python), Motor (async MongoDB), APScheduler
- **Database**: MongoDB at 52.66.232.149:27017 (DB: mygenie)
- **Storage**: AWS S3 (mygenie-prod, ap-south-1)
- **Messaging**: WhatsApp via Meta Graph API + AuthKey.io

## Core Features Implemented
- Auth (login via MyGenie preprod API + JWT)
- Customer management, segmentation, lifecycle tracking
- Campaign wizard (WhatsApp campaigns)
- Loyalty & points system
- Coupons & wallet
- WhatsApp templates builder
- Analytics & feedback
- POS request logging middleware
- Invoice generation (PDF via WeasyPrint/ReportLab)
- Audience management
- QR code generation

## Pages
LoginPage, DashboardPage, CustomersPage, CustomerDetailPage, CustomerLifecyclePage,
CampaignsPage, CampaignWizardPage, CampaignHistoryPage, TemplatesPage, TemplateBuilderPage,
CouponsPage, CouponAnalyticsPage, WalletPage, FeedbackPage, SettingsPage, LoyaltySettingsPage,
ProfilePage, QRCodePage, SegmentsPage, AudiencesPage, MessageStatusPage, MigrationPage,
RegisterPage, CustomerRegistrationPage, ItemAnalyticsPage

## Environment (Backend)
- MONGO_URL: mongodb://mygenie_admin:...@52.66.232.149:27017/mygenie
- DB_NAME: mygenie
- JWT_SECRET: dinepoints-secret-key-2024
- CRM_EXTERNAL_URL: https://crm.mygenie.online
- META_APP_ID: 874516431301713
- CAMPAIGN_SCHEDULER_ENABLED: false

## What Was Done (2026-08-06)
- Cloned repo from GitHub (main branch) into /app
- Merged all source files preserving platform .env and supervisor configs
- Installed missing Python packages: apscheduler, weasyprint, reportlab, qrcode, openpyxl, tzlocal, et_xmlfile
- Updated /app/backend/.env with all production env variables provided by user
- Verified backend starts successfully (Application startup complete)
- Verified frontend compiles and loads login page
