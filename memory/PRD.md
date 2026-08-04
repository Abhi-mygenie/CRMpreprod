# MyGenie CRM - Preprod Deployment

## Original Problem Statement
Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git (main branch) into /app, preserve platform files, configure env variables, install dependencies, and build as-is.

## Architecture
- **Frontend**: React (CRA + CRACO), Shadcn UI, TailwindCSS, React Router, Recharts, Framer Motion, SWR/React Query
- **Backend**: FastAPI (Python), Motor (async MongoDB driver), APScheduler, WeasyPrint, boto3 (S3), JWT auth
- **Database**: MongoDB (remote: mygenie on 52.66.232.149)
- **External APIs**: MyGenie API (preprod), AuthKey (WhatsApp), Meta Graph API, AWS S3

## What's Been Implemented (2026-08-04)
- Cloned CRMpreprod repo (main branch) into /app
- Preserved platform files (.emergent, .git, supervisor config, frontend .env with REACT_APP_BACKEND_URL)
- Configured backend .env with all user-provided variables (MongoDB, JWT, API URLs, AWS S3, Meta)
- Installed backend dependencies (pip install -r requirements.txt)
- Installed frontend dependencies (yarn install)
- Both services running successfully via supervisor

## Key Modules
### Backend Routers
auth, customers, points, wallet, coupons, feedback, whatsapp, pos, migration, analytics, scan, menu, suggestions, invoices, campaigns

### Frontend Pages
Login, Dashboard, Customers, CustomerDetail, Campaigns, CampaignWizard, CampaignHistory, Templates, TemplateBuilder, Coupons, CouponAnalytics, Wallet, Feedback, Settings, Profile, Segments, Audiences, QRCode, LoyaltySettings, ItemAnalytics, MessageStatus, CustomerLifecycle, CustomerRegistration, Migration

## Prioritized Backlog
- P0: None (app deployed as-is per user request)
- P1: Verify all API integrations with real credentials
- P2: Test end-to-end flows (login, customer management, campaigns)

## Next Tasks
- User testing with actual credentials
- Verify external API connectivity (MyGenie, AuthKey, Meta, S3)
