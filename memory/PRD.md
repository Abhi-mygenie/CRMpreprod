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

## What's Been Implemented

### Base CRM (from repo)
- Authentication (JWT, MyGenie vendor employee SSO)
- Customer management (list, detail, segments, QR codes, lifecycle)
- Loyalty & Points system, Wallet management
- Coupon engine (V1/V2/V3-B/V3-C), Coupon Analytics
- WhatsApp campaign builder (templates, media headers, variables, button mapping)
- Campaign wizard + history + audience builder (scheduled + recurring)
- Feedback & analytics, Menu management
- Invoice generation (food, hotel room, hotel folio — GST)
- POS integration + request logging middleware
- Migration tools (customer import/export, order sync)
- Cron/scheduler (loyalty jobs, campaign processor)
- AWS S3 media upload, PDF report generation

### Delivered in this sprint (crm_roi_sprint)
- CR-075: Hotel document migration POS→CRM (routers/customers.py) ✅ QA PASS 10/10
- BUG-011: Campaign history delivered/read counters (routers/campaigns.py) ✅ QA PASS
- BUG-012: Message Status deep-link race condition fix (MessageStatusPage.jsx) ✅ QA PASS
- CR-061: Template authoring gate removed — all tenants can build templates ✅ QA PASS
- CRM-2: Document upload 422→400 fix (routers/pos.py) ✅ QA PASS
- CR-069: Template button variable mapping & send-path support ✅ QA PASS
- CR-076: Customer lifecycle re-engage — bulk CTA + Campaign Wizard pre-fill ✅ QA PASS
- CR-077: Configurable lifecycle & intelligence thresholds ✅ QA PASS
- CR-071+072: B2B customer + hotel document capture ✅ QA PASS
- CR-073: AuthKey template import ✅ QA PASS
- BUG-020–023: Multiple WhatsApp + migration bugs ✅ QA PASS

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

## Prioritized Backlog

### P0 — Owner approval gate open (ready to build)
- CR-067: Template deletion lifecycle — Meta cascade + warning modal + AuthKey sync cleanup (~2.5 hrs)
- CR-068: Validate Template button — standalone V1-V23 compliance dry-run (~45 min)

### P1 — Owner smoke tests pending (code done, no build needed)
- CR-069: Templates → Map Variables on `final_bill` → button bubbles visible
- CR-076: Lifecycle → Churned → Re-engage CTA → Campaign Wizard pre-fills
- CR-077: Loyalty Settings threshold change → Lifecycle counts update
- CR-071+072: B2B hotel check-in + document upload (palmhouse/jehsnest)

### P1 — Registered, not started
- CR-032: CRM template feature flag per-tenant (~2 hrs)
- CR-062: Bold/Italic/Strike toolbar ✅ ALREADY SHIPPED (confirmed 2026-08-06)

### P2 — Registered, parked
- CR-016: Dynamic event registry (deferred to next sprint)
- CR-025: Virtual wallet management (Q1-Q10 pending owner)
- CR-046–058: Security/infra audit (owner-infra items)

### One switch to flip (when owner ready)
- CAMPAIGN_SCHEDULER_ENABLED=true — enables recurring auto-fire campaigns

## Test Credentials
See: /app/memory/test_credentials.md and /app/memory/crm/crm_roi_sprint/handoff/SESSION_2026_08_06_CR067_CR068_PLANNING_HANDOVER.md
